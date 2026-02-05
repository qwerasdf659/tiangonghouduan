/**
 * 临时测试脚本 - 测试抽奖管理相关 API
 * 用于诊断前端页面数据为空的问题
 * 
 * 使用方法: node scripts/test-lottery-api.js
 * 完成后删除此文件
 */

const BASE_URL = 'http://localhost:3000'

// 测试账号
const TEST_MOBILE = '13612227930'
const TEST_CODE = '123456'

async function login() {
  console.log('🔐 登录获取 Token...')
  const response = await fetch(`${BASE_URL}/api/v4/console/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobile: TEST_MOBILE, verification_code: TEST_CODE })
  })
  const result = await response.json()
  console.log('📋 登录响应:', JSON.stringify(result, null, 2).substring(0, 500))
  if (result.success && (result.data?.token || result.data?.access_token)) {
    const token = result.data.token || result.data.access_token
    console.log('✅ 登录成功, user_id:', result.data.user?.user_id)
    return token
  }
  console.error('❌ 登录失败:', result.message)
  return null
}

async function testAPI(token, name, url, method = 'GET', body = null) {
  console.log(`\n📡 测试 ${name}...`)
  console.log(`   URL: ${url}`)
  
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }
  if (body) {
    options.body = JSON.stringify(body)
  }
  
  try {
    const response = await fetch(`${BASE_URL}${url}`, options)
    const result = await response.json()
    
    if (result.success) {
      console.log(`   ✅ 成功`)
      // 打印关键数据
      if (result.data) {
        if (Array.isArray(result.data)) {
          console.log(`   📊 返回 ${result.data.length} 条记录`)
          if (result.data.length > 0) {
            console.log(`   📋 示例数据:`, JSON.stringify(result.data[0], null, 2).substring(0, 500))
          }
        } else if (result.data.campaigns) {
          console.log(`   📊 活动数量: ${result.data.campaigns.length}`)
          if (result.data.campaigns.length > 0) {
            console.log(`   📋 第一个活动:`, JSON.stringify(result.data.campaigns[0], null, 2).substring(0, 500))
          }
        } else if (result.data.prizes) {
          console.log(`   📊 奖品数量: ${result.data.prizes.length}`)
        } else if (result.data.list) {
          console.log(`   📊 列表数量: ${result.data.list.length}`)
        } else {
          console.log(`   📋 数据:`, JSON.stringify(result.data, null, 2).substring(0, 500))
        }
      }
    } else {
      console.log(`   ❌ 失败: ${result.message}`)
      console.log(`   📋 错误码: ${result.code}`)
    }
    return result
  } catch (error) {
    console.log(`   ❌ 请求异常: ${error.message}`)
    return null
  }
}

async function main() {
  console.log('=' .repeat(60))
  console.log('🎰 抽奖管理 API 测试脚本')
  console.log('=' .repeat(60))
  
  // 1. 登录
  const token = await login()
  if (!token) {
    console.error('\n❌ 无法继续测试，登录失败')
    process.exit(1)
  }
  
  // 2. 测试活动列表 API
  await testAPI(token, '活动列表', '/api/v4/console/lottery-campaigns?page=1&page_size=10')
  
  // 3. 测试奖品列表 API
  await testAPI(token, '奖品列表', '/api/v4/console/prize-pool/list?page=1&page_size=10')
  
  // 4. 测试抽奖策略 API
  await testAPI(token, '抽奖策略', '/api/v4/lottery/strategies')
  
  // 5. 测试预设列表 API
  await testAPI(token, '预设列表', '/api/v4/lottery/preset/list?page=1&page_size=10')
  
  // 6. 测试抽奖历史 API
  await testAPI(token, '抽奖历史', '/api/v4/lottery/history?page=1&page_size=10')
  
  // 7. 测试预设统计 API
  await testAPI(token, '预设统计', '/api/v4/lottery/preset/stats')
  
  console.log('\n' + '=' .repeat(60))
  console.log('✅ 测试完成')
  console.log('=' .repeat(60))
}

main().catch(console.error)

