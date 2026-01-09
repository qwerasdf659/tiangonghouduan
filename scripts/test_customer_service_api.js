#!/usr/bin/env node

/**
 * 客服服务API测试脚本
 *
 * 测试内容：
 * 1. 获取会话列表
 * 2. 获取会话统计
 * 3. 获取会话消息
 * 4. 发送消息
 * 5. 关闭会话
 *
 * 用法：
 *   node scripts/test-customer-service-api.js
 *
 * 创建时间：2026-01-09
 */

const http = require('http')

// 配置
const BASE_URL = 'http://localhost:3000'
const API_PREFIX = '/api/v4/console/customer-service'

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

function log(color, ...args) {
  console.log(colors[color], ...args, colors.reset)
}

// 获取测试用的管理员Token（模拟登录）
async function getAdminToken() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      mobile: '13800138000',
      verification_code: '123456' // 开发环境万能验证码
    })

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/v4/console/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }

    const req = http.request(options, res => {
      let data = ''
      res.on('data', chunk => (data += chunk))
      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          if (result.success && result.data?.token) {
            resolve(result.data.token)
          } else {
            // 尝试使用硬编码的测试Token
            log('yellow', '⚠️ 无法获取Token，使用测试模式')
            resolve(null)
          }
        } catch (e) {
          resolve(null)
        }
      })
    })

    req.on('error', () => resolve(null))
    req.write(postData)
    req.end()
  })
}

// HTTP请求封装
function httpRequest(method, path, token, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    }

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`
    }

    const req = http.request(options, res => {
      let data = ''
      res.on('data', chunk => (data += chunk))
      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          resolve({ status: res.statusCode, data: result })
        } catch (e) {
          resolve({ status: res.statusCode, data: data })
        }
      })
    })

    req.on('error', e => {
      reject(e)
    })

    if (body) {
      req.write(JSON.stringify(body))
    }
    req.end()
  })
}

// 测试用例
async function testGetSessionList(token) {
  log('blue', '\n📋 测试1: 获取会话列表')
  try {
    const result = await httpRequest('GET', `${API_PREFIX}/sessions`, token)

    if (result.status === 200 && result.data.success) {
      const sessions = result.data.data.sessions || []
      const pagination = result.data.data.pagination || {}
      log('green', `✅ 成功获取 ${sessions.length} 个会话`)
      log('cyan', `   总数: ${pagination.total || 0}, 当前页: ${pagination.page || 1}`)

      // 检查数据结构
      if (sessions.length > 0) {
        const firstSession = sessions[0]
        log('cyan', `   示例会话ID: ${firstSession.session_id}`)
        log('cyan', `   用户信息: ${JSON.stringify(firstSession.user)}`)
        log('cyan', `   会话状态: ${firstSession.status}`)
      }

      return sessions
    } else if (result.status === 401) {
      log('yellow', '⚠️ 未授权（需要管理员Token）')
      return []
    } else {
      log('red', `❌ 获取失败: ${result.data.message || '未知错误'}`)
      return []
    }
  } catch (error) {
    log('red', `❌ 请求失败: ${error.message}`)
    return []
  }
}

async function testGetSessionStats(token) {
  log('blue', '\n📊 测试2: 获取会话统计')
  try {
    const result = await httpRequest('GET', `${API_PREFIX}/sessions/stats`, token)

    if (result.status === 200 && result.data.success) {
      const stats = result.data.data
      log('green', '✅ 成功获取会话统计')
      log('cyan', `   待处理: ${stats.waiting || 0}`)
      log('cyan', `   已分配: ${stats.assigned || 0}`)
      log('cyan', `   进行中: ${stats.active || 0}`)
      log('cyan', `   已关闭: ${stats.closed || 0}`)
      log('cyan', `   总数: ${stats.total || 0}`)
      return stats
    } else if (result.status === 401) {
      log('yellow', '⚠️ 未授权（需要管理员Token）')
      return null
    } else {
      log('red', `❌ 获取失败: ${result.data.message || '未知错误'}`)
      return null
    }
  } catch (error) {
    log('red', `❌ 请求失败: ${error.message}`)
    return null
  }
}

async function testGetSessionMessages(token, sessionId) {
  log('blue', `\n💬 测试3: 获取会话消息 (session_id=${sessionId})`)

  if (!sessionId) {
    log('yellow', '⚠️ 跳过：没有可用的会话ID')
    return null
  }

  try {
    const result = await httpRequest('GET', `${API_PREFIX}/sessions/${sessionId}/messages`, token)

    if (result.status === 200 && result.data.success) {
      const messages = result.data.data.messages || []
      const session = result.data.data.session
      log('green', `✅ 成功获取 ${messages.length} 条消息`)
      log('cyan', `   会话状态: ${session?.status}`)

      if (messages.length > 0) {
        log('cyan', `   最新消息: ${messages[messages.length - 1]?.content?.substring(0, 30)}...`)
      }

      return { session, messages }
    } else if (result.status === 401) {
      log('yellow', '⚠️ 未授权（需要管理员Token）')
      return null
    } else if (result.status === 404) {
      log('yellow', '⚠️ 会话不存在')
      return null
    } else {
      log('red', `❌ 获取失败: ${result.data.message || '未知错误'}`)
      return null
    }
  } catch (error) {
    log('red', `❌ 请求失败: ${error.message}`)
    return null
  }
}

async function testSendMessage(token, sessionId) {
  log('blue', `\n📤 测试4: 发送消息 (session_id=${sessionId})`)

  if (!sessionId) {
    log('yellow', '⚠️ 跳过：没有可用的会话ID')
    return null
  }

  try {
    const result = await httpRequest('POST', `${API_PREFIX}/sessions/${sessionId}/send`, token, {
      content: `[测试消息] ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
    })

    if (result.status === 200 && result.data.success) {
      log('green', '✅ 消息发送成功')
      log('cyan', `   消息ID: ${result.data.data.message_id}`)
      return result.data.data
    } else if (result.status === 401) {
      log('yellow', '⚠️ 未授权（需要管理员Token）')
      return null
    } else if (result.status === 404) {
      log('yellow', '⚠️ 会话不存在')
      return null
    } else {
      log('red', `❌ 发送失败: ${result.data.message || '未知错误'}`)
      // 特别检查事务边界错误
      if (result.data.message?.includes('事务边界')) {
        log('red', '   ⚠️ 检测到事务边界错误，路由层可能缺少TransactionManager.execute包裹')
      }
      return null
    }
  } catch (error) {
    log('red', `❌ 请求失败: ${error.message}`)
    return null
  }
}

async function testMarkAsRead(token, sessionId) {
  log('blue', `\n👁️ 测试5: 标记消息已读 (session_id=${sessionId})`)

  if (!sessionId) {
    log('yellow', '⚠️ 跳过：没有可用的会话ID')
    return null
  }

  try {
    const result = await httpRequest('POST', `${API_PREFIX}/sessions/${sessionId}/mark-read`, token)

    if (result.status === 200 && result.data.success) {
      log('green', '✅ 标记已读成功')
      return result.data.data
    } else if (result.status === 401) {
      log('yellow', '⚠️ 未授权（需要管理员Token）')
      return null
    } else {
      log('red', `❌ 标记失败: ${result.data.message || '未知错误'}`)
      return null
    }
  } catch (error) {
    log('red', `❌ 请求失败: ${error.message}`)
    return null
  }
}

async function testHealthCheck() {
  log('blue', '\n🏥 测试0: 健康检查')
  try {
    const result = await httpRequest('GET', '/health', null)

    if (result.status === 200) {
      log('green', '✅ 服务运行正常')
      log('cyan', `   状态: ${result.data.status}`)
      return true
    } else {
      log('red', `❌ 服务异常: ${result.status}`)
      return false
    }
  } catch (error) {
    log('red', `❌ 服务无法访问: ${error.message}`)
    return false
  }
}

// 主测试流程
async function runTests() {
  console.log('\n' + '='.repeat(60))
  log('cyan', '🧪 客服服务API测试')
  console.log('='.repeat(60))

  // 健康检查
  const isHealthy = await testHealthCheck()
  if (!isHealthy) {
    log('red', '\n❌ 服务未启动，请先启动后端服务：npm start')
    process.exit(1)
  }

  // 获取Token
  log('blue', '\n🔐 获取管理员Token...')
  const token = await getAdminToken()
  if (!token) {
    log('yellow', '⚠️ 无法获取Token，部分测试将跳过（需要授权的API）')
  } else {
    log('green', '✅ Token获取成功')
  }

  // 执行测试
  const sessions = await testGetSessionList(token)
  await testGetSessionStats(token)

  // 如果有会话，测试消息相关API
  const testSessionId = sessions.length > 0 ? sessions[0].session_id : null

  await testGetSessionMessages(token, testSessionId)
  await testSendMessage(token, testSessionId)
  await testMarkAsRead(token, testSessionId)

  // 总结
  console.log('\n' + '='.repeat(60))
  log('cyan', '📊 测试完成')
  console.log('='.repeat(60))
  log('green', '\n✅ 如果上述测试全部通过，说明API正常工作')
  log('yellow', '⚠️ 黄色警告表示需要授权或测试数据不足')
  log('red', '❌ 红色错误需要检查后端日志进行修复')
  console.log()
}

// 执行测试
runTests().catch(console.error)
