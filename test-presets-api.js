#!/usr/bin/env node
/**
 * 抽奖干预管理API测试脚本
 * 测试前端presets.html页面需要的所有后端API
 *
 * 运行: node test-presets-api.js
 */

const http = require('http')

// API基础配置
const BASE_URL = 'http://localhost:3000'
let authToken = null

/**
 * 发送HTTP请求
 */
function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL)
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    }

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`
    }

    const req = http.request(options, res => {
      let data = ''
      res.on('data', chunk => (data += chunk))
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve({ status: res.statusCode, data: json })
        } catch (e) {
          resolve({ status: res.statusCode, data: data })
        }
      })
    })

    req.on('error', reject)
    req.on('timeout', () => reject(new Error('Request timeout')))

    if (body) {
      req.write(JSON.stringify(body))
    }
    req.end()
  })
}

/**
 * 测试管理员登录
 */
async function testAdminLogin() {
  console.log('\n========== 测试1: 管理员登录 ==========')

  try {
    // 后端使用 mobile + verification_code 登录
    // 开发环境万能验证码: 123456
    const response = await request('POST', '/api/v4/console/auth/login', {
      mobile: '13800138000',
      verification_code: '123456'
    })

    console.log('状态码:', response.status)
    console.log('响应:', JSON.stringify(response.data, null, 2))

    if (response.data.success && response.data.data?.access_token) {
      authToken = response.data.data.access_token
      console.log('✅ 登录成功，获取到token')
      return true
    } else {
      console.log('❌ 登录失败:', response.data.message)
      return false
    }
  } catch (error) {
    console.log('❌ 请求错误:', error.message)
    return false
  }
}

/**
 * 测试获取奖品列表
 */
async function testGetPrizeList() {
  console.log('\n========== 测试2: 获取奖品列表 ==========')
  console.log('API路径: /api/v4/console/prize-pool/list')

  try {
    const response = await request('GET', '/api/v4/console/prize-pool/list', null, authToken)

    console.log('状态码:', response.status)
    console.log('响应结构:')

    if (response.data.success) {
      const data = response.data.data
      console.log(
        '  - data.prizes:',
        Array.isArray(data?.prizes) ? `数组，${data.prizes.length}个奖品` : typeof data?.prizes
      )
      console.log('  - data.statistics:', typeof data?.statistics)

      if (data?.prizes && data.prizes.length > 0) {
        console.log('\n第一个奖品的字段:')
        console.log(JSON.stringify(data.prizes[0], null, 2))
      }
      console.log('\n✅ 奖品列表API正常')
    } else {
      console.log('❌ API返回失败:', response.data.message)
    }

    return response.data
  } catch (error) {
    console.log('❌ 请求错误:', error.message)
    return null
  }
}

/**
 * 测试搜索用户
 */
async function testSearchUser() {
  console.log('\n========== 测试3: 搜索用户 ==========')
  console.log('API路径: /api/v4/console/user-management/users?search=138')

  try {
    const response = await request(
      'GET',
      '/api/v4/console/user-management/users?search=138',
      null,
      authToken
    )

    console.log('状态码:', response.status)
    console.log('响应结构:')

    if (response.data.success) {
      const data = response.data.data
      console.log(
        '  - data.users:',
        Array.isArray(data?.users) ? `数组，${data.users.length}个用户` : typeof data?.users
      )
      console.log(
        '  - data.list:',
        Array.isArray(data?.list) ? `数组，${data.list.length}个用户` : typeof data?.list
      )
      console.log('  - data.pagination:', typeof data?.pagination)

      // 检查前端期望的 list 字段
      const users = data?.list || data?.users || []
      if (users.length > 0) {
        console.log('\n第一个用户的字段:')
        console.log(JSON.stringify(users[0], null, 2))
      }

      // 🔴 前端期望的字段: list，但后端返回的是 users
      if (!data?.list && data?.users) {
        console.log('\n⚠️ 发现字段不匹配:')
        console.log('   前端期望: response.data.list')
        console.log('   后端返回: response.data.users')
      }

      console.log('\n✅ 用户搜索API正常')
    } else {
      console.log('❌ API返回失败:', response.data.message)
    }

    return response.data
  } catch (error) {
    console.log('❌ 请求错误:', error.message)
    return null
  }
}

/**
 * 测试获取干预规则列表
 */
async function testGetInterventionList() {
  console.log('\n========== 测试4: 获取干预规则列表 ==========')
  console.log('API路径: /api/v4/console/lottery-management/interventions')

  try {
    const response = await request(
      'GET',
      '/api/v4/console/lottery-management/interventions?page=1&page_size=10',
      null,
      authToken
    )

    console.log('状态码:', response.status)
    console.log('响应结构:')

    if (response.data.success) {
      const data = response.data.data
      console.log(
        '  - data.interventions:',
        Array.isArray(data?.interventions)
          ? `数组，${data.interventions.length}条规则`
          : typeof data?.interventions
      )
      console.log('  - data.pagination:', typeof data?.pagination)

      if (data?.interventions && data.interventions.length > 0) {
        console.log('\n第一条干预规则的字段:')
        console.log(JSON.stringify(data.interventions[0], null, 2))
      }

      console.log('\n✅ 干预规则列表API正常')

      // 返回第一条记录的setting_id用于详情测试
      return data?.interventions?.[0]?.setting_id || null
    } else {
      console.log('❌ API返回失败:', response.data.message)
    }

    return null
  } catch (error) {
    console.log('❌ 请求错误:', error.message)
    return null
  }
}

/**
 * 测试获取单个干预规则详情
 */
async function testGetInterventionDetail(settingId) {
  console.log('\n========== 测试5: 获取干预规则详情 ==========')
  console.log('API路径: /api/v4/console/lottery-management/interventions/' + settingId)

  if (!settingId) {
    console.log('⚠️ 没有可用的setting_id，跳过此测试')
    return null
  }

  try {
    const response = await request(
      'GET',
      `/api/v4/console/lottery-management/interventions/${settingId}`,
      null,
      authToken
    )

    console.log('状态码:', response.status)

    if (response.status === 200 && response.data.success) {
      console.log('✅ 获取干预规则详情成功')
      console.log('响应数据:')
      console.log(JSON.stringify(response.data.data, null, 2))
    } else if (response.status === 404) {
      console.log('❌ 干预规则不存在 (404)')
      console.log('响应:', JSON.stringify(response.data, null, 2))
    } else {
      console.log('❌ API返回失败:', response.data.message)
      console.log('响应:', JSON.stringify(response.data, null, 2))
    }

    return response.data
  } catch (error) {
    console.log('❌ 请求错误:', error.message)
    return null
  }
}

/**
 * 测试服务健康检查
 */
async function testHealthCheck() {
  console.log('\n========== 测试0: 服务健康检查 ==========')

  try {
    const response = await request('GET', '/health')
    console.log('状态码:', response.status)
    console.log('响应:', JSON.stringify(response.data, null, 2))

    if (response.data.status === 'healthy') {
      console.log('✅ 服务健康')
      return true
    } else {
      console.log('⚠️ 服务状态:', response.data.status)
      return true
    }
  } catch (error) {
    console.log('❌ 服务不可用:', error.message)
    return false
  }
}

/**
 * 运行所有测试
 */
async function runTests() {
  console.log('='.repeat(60))
  console.log('抽奖干预管理API测试')
  console.log('测试时间:', new Date().toLocaleString('zh-CN'))
  console.log('='.repeat(60))

  // 0. 健康检查
  const healthy = await testHealthCheck()
  if (!healthy) {
    console.log('\n❌ 服务不可用，请先启动后端服务')
    process.exit(1)
  }

  // 1. 登录
  const loggedIn = await testAdminLogin()
  if (!loggedIn) {
    console.log('\n❌ 登录失败，无法继续测试')
    process.exit(1)
  }

  // 2. 测试奖品列表API
  await testGetPrizeList()

  // 3. 测试用户搜索API
  await testSearchUser()

  // 4. 测试干预规则列表API
  const firstSettingId = await testGetInterventionList()

  // 5. 测试干预规则详情API
  await testGetInterventionDetail(firstSettingId)

  console.log('\n' + '='.repeat(60))
  console.log('测试完成')
  console.log('='.repeat(60))

  console.log('\n📋 测试总结:')
  console.log('1. 奖品列表API: /api/v4/console/prize-pool/list')
  console.log('   返回结构: { prizes: [...], statistics: {...} }')
  console.log('   前端适配: response.data.prizes ✅')
  console.log('')
  console.log('2. 用户搜索API: /api/v4/console/user-management/users')
  console.log('   返回结构: { users: [...], pagination: {...} }')
  console.log('   前端期望: response.data.list')
  console.log('   🔴 需要修改前端: list → users')
  console.log('')
  console.log('3. 干预规则API: /api/v4/console/lottery-management/interventions')
  console.log('   返回结构: { interventions: [...], pagination: {...} }')
  console.log('   前端适配: response.data.interventions ✅')
}

runTests().catch(console.error)
