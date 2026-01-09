#!/usr/bin/env node
/**
 * 测试统计API - 验证后端数据返回情况
 *
 * 运行：node scripts/test-statistics-api.js
 */

const http = require('http')

// 测试配置
const BASE_URL = 'http://localhost:3000'
const ADMIN_AUTH = {
  username: 'admin',
  password: 'admin123' // 默认管理员密码
}

let authToken = null

// HTTP请求封装
function request(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL)
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    }

    if (authToken) {
      options.headers['Authorization'] = `Bearer ${authToken}`
    }

    const req = http.request(options, res => {
      let body = ''
      res.on('data', chunk => (body += chunk))
      res.on('end', () => {
        try {
          const json = JSON.parse(body)
          resolve({ status: res.statusCode, data: json })
        } catch (e) {
          resolve({ status: res.statusCode, data: body })
        }
      })
    })

    req.on('error', reject)

    if (data) {
      req.write(JSON.stringify(data))
    }
    req.end()
  })
}

// 登录获取Token
async function login() {
  console.log('\n📝 1. 尝试管理员登录...')

  // 先尝试从环境变量或配置获取测试账户
  const loginData = {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123'
  }

  try {
    const response = await request('POST', '/api/v4/console/auth/login', loginData)

    if (response.data.success && response.data.data?.token) {
      authToken = response.data.data.token
      console.log('   ✅ 登录成功，获取到Token')
      return true
    } else {
      console.log('   ⚠️ 登录失败:', response.data.message || '未知错误')
      console.log('   尝试使用测试用户Token...')
      return false
    }
  } catch (error) {
    console.log('   ❌ 登录请求失败:', error.message)
    return false
  }
}

// 测试统计报表API
async function testStatisticsReport() {
  console.log('\n📊 2. 测试统计报表API (/api/v4/system/statistics/report)...')

  try {
    const response = await request('GET', '/api/v4/system/statistics/report?period=week')

    console.log('   HTTP状态:', response.status)
    console.log('   返回success:', response.data.success)

    if (response.data.success) {
      const data = response.data.data
      console.log('\n   📋 返回的数据结构:')
      console.log('   ─'.repeat(30))

      // 显示数据结构
      Object.keys(data).forEach(key => {
        const value = data[key]
        if (Array.isArray(value)) {
          console.log(`   • ${key}: Array(${value.length})`)
          if (value.length > 0) {
            console.log(`     示例: ${JSON.stringify(value[0]).slice(0, 80)}...`)
          }
        } else if (typeof value === 'object' && value !== null) {
          console.log(`   • ${key}: Object`)
          Object.keys(value).forEach(subKey => {
            console.log(`     - ${subKey}: ${JSON.stringify(value[subKey]).slice(0, 50)}`)
          })
        } else {
          console.log(`   • ${key}: ${value}`)
        }
      })

      return { success: true, data }
    } else {
      console.log('   ❌ API返回失败:', response.data.message)
      return { success: false, error: response.data.message }
    }
  } catch (error) {
    console.log('   ❌ 请求失败:', error.message)
    return { success: false, error: error.message }
  }
}

// 测试图表数据API
async function testChartsAPI() {
  console.log('\n📈 3. 测试图表数据API (/api/v4/system/statistics/charts)...')

  try {
    const response = await request('GET', '/api/v4/system/statistics/charts?days=7')

    console.log('   HTTP状态:', response.status)
    console.log('   返回success:', response.data.success)

    if (response.data.success) {
      const data = response.data.data
      console.log('\n   📋 返回的数据结构:')
      console.log('   ─'.repeat(30))

      // 显示数据结构
      Object.keys(data).forEach(key => {
        const value = data[key]
        if (Array.isArray(value)) {
          console.log(`   • ${key}: Array(${value.length})`)
          if (value.length > 0) {
            console.log(`     示例: ${JSON.stringify(value[0]).slice(0, 80)}...`)
          }
        } else if (typeof value === 'object' && value !== null) {
          console.log(`   • ${key}: Object`)
          Object.keys(value).forEach(subKey => {
            const subValue = value[subKey]
            if (typeof subValue === 'object' && subValue !== null) {
              console.log(`     - ${subKey}: ${JSON.stringify(subValue).slice(0, 50)}...`)
            } else {
              console.log(`     - ${subKey}: ${subValue}`)
            }
          })
        } else {
          console.log(`   • ${key}: ${value}`)
        }
      })

      return { success: true, data }
    } else {
      console.log('   ❌ API返回失败:', response.data.message)
      return { success: false, error: response.data.message }
    }
  } catch (error) {
    console.log('   ❌ 请求失败:', error.message)
    return { success: false, error: error.message }
  }
}

// 测试console analytics API
async function testAnalyticsAPI() {
  console.log('\n📉 4. 测试决策分析API (/api/v4/console/analytics/decisions/analytics)...')

  try {
    const response = await request('GET', '/api/v4/console/analytics/decisions/analytics?days=7')

    console.log('   HTTP状态:', response.status)
    console.log('   返回success:', response.data.success)

    if (response.data.success) {
      const data = response.data.data
      console.log('\n   📋 返回的数据结构:')
      console.log('   ─'.repeat(30))

      Object.keys(data).forEach(key => {
        const value = data[key]
        if (Array.isArray(value)) {
          console.log(`   • ${key}: Array(${value.length})`)
        } else if (typeof value === 'object' && value !== null) {
          console.log(
            `   • ${key}: Object with keys [${Object.keys(value).slice(0, 5).join(', ')}...]`
          )
        } else {
          console.log(`   • ${key}: ${value}`)
        }
      })

      return { success: true, data }
    } else {
      console.log('   ❌ API返回失败:', response.data.message)
      return { success: false, error: response.data.message }
    }
  } catch (error) {
    console.log('   ❌ 请求失败:', error.message)
    return { success: false, error: error.message }
  }
}

// 测试今日统计API
async function testTodayStatsAPI() {
  console.log('\n📅 5. 测试今日统计API (/api/v4/console/analytics/stats/today)...')

  try {
    const response = await request('GET', '/api/v4/console/analytics/stats/today')

    console.log('   HTTP状态:', response.status)
    console.log('   返回success:', response.data.success)

    if (response.data.success) {
      const data = response.data.data
      console.log('\n   📋 返回的数据结构:')
      console.log('   ─'.repeat(30))

      Object.keys(data).forEach(key => {
        const value = data[key]
        if (typeof value === 'object' && value !== null) {
          console.log(`   • ${key}:`)
          Object.keys(value).forEach(subKey => {
            console.log(`     - ${subKey}: ${JSON.stringify(value[subKey]).slice(0, 40)}`)
          })
        } else {
          console.log(`   • ${key}: ${value}`)
        }
      })

      return { success: true, data }
    } else {
      console.log('   ❌ API返回失败:', response.data.message)
      return { success: false, error: response.data.message }
    }
  } catch (error) {
    console.log('   ❌ 请求失败:', error.message)
    return { success: false, error: error.message }
  }
}

// 生成数据适配建议
function generateAdaptationSuggestion(chartsData, reportData) {
  console.log('\n\n🔧 6. 数据适配分析...')
  console.log('═'.repeat(60))

  console.log('\n📌 前端期望的数据格式:')
  console.log(`   • overview: { total_users, total_draws, win_rate, total_revenue, trends }`)
  console.log(`   • users: { new_users, active_users, vip_users, banned_users }`)
  console.log(`   • lottery: { total_draws, wins, losses, avg_win_rate }`)
  console.log(`   • consumption: { total, approved, pending, rejected }`)
  console.log(`   • points: { issued, consumed, current, average }`)
  console.log(`   • prizes: [{ prize_name, prize_type, issued, claimed, prize_value }]`)
  console.log(
    `   • customer_service: { total_sessions, closed_sessions, avg_response_time, satisfaction }`
  )

  console.log('\n📌 后端实际返回的数据格式:')
  if (chartsData) {
    Object.keys(chartsData).forEach(key => {
      const value = chartsData[key]
      if (Array.isArray(value)) {
        console.log(`   • ${key}: Array(${value.length})`)
      } else if (typeof value === 'object' && value !== null) {
        console.log(`   • ${key}: Object with ${Object.keys(value).length} keys`)
      } else {
        console.log(`   • ${key}: ${typeof value}`)
      }
    })
  }

  console.log('\n💡 解决方案: 修改前端statistics.js适配后端数据格式')
  console.log('═'.repeat(60))
}

// 主函数
async function main() {
  console.log('═'.repeat(60))
  console.log('🔍 统计API测试脚本')
  console.log('═'.repeat(60))

  // 1. 登录
  const loginSuccess = await login()

  if (!loginSuccess) {
    // 尝试直接使用硬编码token测试（开发环境）
    console.log('\n   🔑 使用开发测试模式...')
    // 直接测试API看是否需要认证
  }

  // 2. 测试各个API
  const reportResult = await testStatisticsReport()
  const chartsResult = await testChartsAPI()
  const analyticsResult = await testAnalyticsAPI()
  const todayResult = await testTodayStatsAPI()

  // 3. 生成适配建议
  generateAdaptationSuggestion(
    chartsResult.success ? chartsResult.data : null,
    reportResult.success ? reportResult.data : null
  )

  console.log('\n✅ 测试完成！')
}

main().catch(console.error)
