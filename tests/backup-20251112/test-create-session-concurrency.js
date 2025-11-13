/**
 * 创建聊天会话并发控制测试脚本
 *
 * 测试目标：
 * 1. 验证悲观锁事务能否防止并发创建重复会话
 * 2. 验证频率限制器能否防止恶意重复创建
 * 3. 验证会话复用机制是否正常工作
 *
 * 使用方法：
 * node tests/manual/test-create-session-concurrency.js
 */

const axios = require('axios')

const BASE_URL = 'http://localhost:3000'

/**
 * 获取登录token
 */
async function login () {
  try {
    const response = await axios.post(`${BASE_URL}/api/v4/auth/login`, {
      mobile: '13612227930',
      verification_code: '123456'
    })

    if (response.data.success) {
      console.log('✅ 登录成功')
      return response.data.data.token
    } else {
      throw new Error('登录失败: ' + response.data.message)
    }
  } catch (error) {
    console.error('❌ 登录请求失败:', error.message)
    throw error
  }
}

/**
 * 创建聊天会话
 */
async function createSession (token, requestId) {
  try {
    const response = await axios.post(
      `${BASE_URL}/api/v4/system/chat/create`,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    if (response.data.success) {
      console.log(`✅ 请求${requestId}: 创建成功 - 会话ID: ${response.data.data.session_id}`)
      return {
        success: true,
        sessionId: response.data.data.session_id,
        status: response.data.data.status,
        message: response.data.message
      }
    } else {
      console.log(`⚠️ 请求${requestId}: ${response.data.message}`)
      return {
        success: false,
        error: response.data.message
      }
    }
  } catch (error) {
    if (error.response && error.response.status === 429) {
      console.log(`🚫 请求${requestId}: 触发频率限制 - ${error.response.data.message}`)
      return {
        success: false,
        rateLimited: true,
        error: error.response.data.message
      }
    }

    console.error(`❌ 请求${requestId}: 请求失败 -`, error.message)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * 测试1：并发创建会话（验证悲观锁）
 */
async function testConcurrentCreate (token) {
  console.log('\n📋 测试1：并发创建会话（验证悲观锁事务）')
  console.log('='.repeat(60))

  // 同时发起5个创建会话请求
  const promises = []
  for (let i = 1; i <= 5; i++) {
    promises.push(createSession(token, i))
  }

  const results = await Promise.all(promises)

  // 统计结果
  const successResults = results.filter(r => r.success)
  const sessionIds = new Set(successResults.map(r => r.sessionId))

  console.log('\n📊 测试结果:')
  console.log(`  - 成功请求: ${successResults.length}`)
  console.log(`  - 唯一会话ID数量: ${sessionIds.size}`)

  if (sessionIds.size === 1) {
    console.log('✅ 并发控制成功：所有请求返回同一个会话ID')
  } else {
    console.log(`❌ 并发控制失败：创建了${sessionIds.size}个不同的会话`)
  }

  return Array.from(sessionIds)[0]
}

/**
 * 测试2：频率限制（验证限流器）
 */
async function testRateLimit (token) {
  console.log('\n📋 测试2：频率限制（验证限流器）')
  console.log('='.repeat(60))

  let rateLimitTriggered = false

  // 快速连续发起4个请求（超过10秒3次的限制）
  for (let i = 1; i <= 4; i++) {
    const result = await createSession(token, i)
    if (result.rateLimited) {
      rateLimitTriggered = true
      break
    }
    await new Promise(resolve => setTimeout(resolve, 500)) // 每次间隔500ms
  }

  console.log('\n📊 测试结果:')
  if (rateLimitTriggered) {
    console.log('✅ 频率限制成功：超过限制后被拦截')
  } else {
    console.log('⚠️ 频率限制未触发：可能需要更快的请求速度')
  }
}

/**
 * 测试3：会话复用（验证查询逻辑）
 */
async function testSessionReuse (token, expectedSessionId) {
  console.log('\n📋 测试3：会话复用（验证查询逻辑）')
  console.log('='.repeat(60))

  await new Promise(resolve => setTimeout(resolve, 11000)) // 等待11秒，避免频率限制

  const result = await createSession(token, 1)

  console.log('\n📊 测试结果:')
  if (result.success && result.sessionId === expectedSessionId) {
    console.log(`✅ 会话复用成功：返回相同的会话ID ${expectedSessionId}`)
  } else {
    console.log(`❌ 会话复用失败：返回不同的会话ID ${result.sessionId}`)
  }
}

/**
 * 主测试流程
 */
async function runTests () {
  console.log('🧪 创建聊天会话并发控制测试')
  console.log('='.repeat(60))

  try {
    // 登录获取token
    const token = await login()

    // 测试1：并发创建
    const sessionId = await testConcurrentCreate(token)

    // 测试2：频率限制（需要等待11秒后再测试）
    console.log('\n⏰ 等待11秒后进行频率限制测试...')
    await new Promise(resolve => setTimeout(resolve, 11000))
    await testRateLimit(token)

    // 测试3：会话复用
    await testSessionReuse(token, sessionId)

    console.log('\n🎉 所有测试完成')
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message)
    process.exit(1)
  }
}

// 执行测试
if (require.main === module) {
  runTests()
    .then(() => {
      console.log('\n✅ 测试脚本执行完成')
      process.exit(0)
    })
    .catch(error => {
      console.error('\n❌ 测试脚本执行失败:', error)
      process.exit(1)
    })
}

module.exports = { runTests }
