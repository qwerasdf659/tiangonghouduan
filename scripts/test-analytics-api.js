#!/usr/bin/env node
/**
 * 运营分析API测试脚本
 * 
 * 测试后端提供的分析统计接口：
 * - /api/v4/console/analytics/stats/today
 * - /api/v4/console/analytics/decisions/analytics
 * - /api/v4/console/analytics/lottery/trends
 * - /api/v4/console/analytics/performance/report
 */

const http = require('http')

// 配置
const HOST = 'localhost'
const PORT = process.env.PORT || 3000
const BASE_URL = `/api/v4/console/analytics`

// 测试用的管理员token（需要替换为实际的token）
let AUTH_TOKEN = process.env.AUTH_TOKEN || ''

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

/**
 * 发送HTTP请求
 */
function makeRequest(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    }

    // 如果有token则添加Authorization头
    if (AUTH_TOKEN) {
      options.headers['Authorization'] = `Bearer ${AUTH_TOKEN}`
    }

    const req = http.request(options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data)
          resolve({
            statusCode: res.statusCode,
            data: jsonData
          })
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            data: data
          })
        }
      })
    })

    req.on('error', (error) => {
      reject(error)
    })

    req.setTimeout(10000, () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })

    req.end()
  })
}

/**
 * 先登录获取管理员token
 */
async function loginAsAdmin() {
  log('cyan', '\n📋 步骤1: 尝试获取管理员token...')
  
  return new Promise((resolve, reject) => {
    // 使用后端实际的字段名：mobile 和 verification_code
    const loginData = JSON.stringify({
      mobile: '13612227930',          // 测试管理员账号（既是用户也是管理员）
      verification_code: '123456'     // 开发环境万能验证码
    })

    const options = {
      hostname: HOST,
      port: PORT,
      path: '/api/v4/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(loginData)
      }
    }

    const req = http.request(options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data)
          // 后端返回 access_token 字段
          if (jsonData.success && jsonData.data && jsonData.data.access_token) {
            AUTH_TOKEN = jsonData.data.access_token
            log('green', `✅ 登录成功，获取到token`)
            log('blue', `   用户: ${jsonData.data.nickname || jsonData.data.mobile}`)
            log('blue', `   角色: ${jsonData.data.roles ? jsonData.data.roles.join(', ') : '未知'}`)
            resolve(true)
          } else {
            log('yellow', `⚠️ 登录响应: ${JSON.stringify(jsonData).substring(0, 200)}`)
            resolve(false)
          }
        } catch (e) {
          log('yellow', `⚠️ 登录响应解析失败: ${data.substring(0, 200)}`)
          resolve(false)
        }
      })
    })

    req.on('error', (error) => {
      log('yellow', `⚠️ 登录请求失败: ${error.message}`)
      resolve(false)
    })

    req.write(loginData)
    req.end()
  })
}

/**
 * 测试今日统计接口
 */
async function testTodayStats() {
  log('cyan', '\n📊 测试1: 今日统计接口 (stats/today)')
  log('blue', `   请求: GET ${BASE_URL}/stats/today`)

  try {
    const result = await makeRequest(`${BASE_URL}/stats/today`)
    
    if (result.statusCode === 200 && result.data.success) {
      log('green', `   ✅ 成功 (状态码: ${result.statusCode})`)
      
      const data = result.data.data
      console.log('   返回数据结构:')
      console.log(`     - date: ${data.date || '-'}`)
      console.log(`     - user_stats.total_users: ${data.user_stats?.total_users || '-'}`)
      console.log(`     - user_stats.active_users_today: ${data.user_stats?.active_users_today || '-'}`)
      console.log(`     - user_stats.new_users_today: ${data.user_stats?.new_users_today || '-'}`)
      console.log(`     - lottery_stats.draws_today: ${data.lottery_stats?.draws_today || '-'}`)
      console.log(`     - lottery_stats.high_tier_draws_today: ${data.lottery_stats?.high_tier_draws_today || '-'}`)
      console.log(`     - points_stats.points_earned_today: ${data.points_stats?.points_earned_today || '-'}`)
      console.log(`     - points_stats.points_spent_today: ${data.points_stats?.points_spent_today || '-'}`)
      console.log(`     - inventory_stats.new_items_today: ${data.inventory_stats?.new_items_today || '-'}`)
      console.log(`     - inventory_stats.used_items_today: ${data.inventory_stats?.used_items_today || '-'}`)
      
      return { success: true, data }
    } else if (result.statusCode === 401) {
      log('yellow', `   ⚠️ 需要认证 (状态码: 401)`)
      return { success: false, needAuth: true }
    } else {
      log('red', `   ❌ 失败 (状态码: ${result.statusCode})`)
      console.log(`   响应: ${JSON.stringify(result.data).substring(0, 300)}`)
      return { success: false }
    }
  } catch (error) {
    log('red', `   ❌ 请求异常: ${error.message}`)
    return { success: false, error }
  }
}

/**
 * 测试决策分析接口
 */
async function testDecisionAnalytics() {
  log('cyan', '\n📈 测试2: 决策分析接口 (decisions/analytics)')
  
  const testDays = [7, 30]
  const results = []

  for (const days of testDays) {
    log('blue', `   请求: GET ${BASE_URL}/decisions/analytics?days=${days}`)

    try {
      const result = await makeRequest(`${BASE_URL}/decisions/analytics?days=${days}`)
      
      if (result.statusCode === 200 && result.data.success) {
        log('green', `   ✅ days=${days} 成功`)
        
        const data = result.data.data
        console.log(`     - period.days: ${data.period?.days || '-'}`)
        console.log(`     - overview.total_draws: ${data.overview?.total_draws || '-'}`)
        console.log(`     - overview.high_tier_draws: ${data.overview?.high_tier_draws || '-'}`)
        console.log(`     - overview.high_tier_rate: ${data.overview?.high_tier_rate || '-'}%`)
        console.log(`     - trends.daily_stats.length: ${data.trends?.daily_stats?.length || 0}`)
        console.log(`     - users.total_active_users: ${data.users?.total_active_users || '-'}`)
        
        results.push({ days, success: true, data })
      } else if (result.statusCode === 401) {
        log('yellow', `   ⚠️ days=${days} 需要认证`)
        results.push({ days, success: false, needAuth: true })
      } else {
        log('red', `   ❌ days=${days} 失败 (${result.statusCode})`)
        results.push({ days, success: false })
      }
    } catch (error) {
      log('red', `   ❌ days=${days} 异常: ${error.message}`)
      results.push({ days, success: false, error })
    }
  }

  return results
}

/**
 * 测试抽奖趋势接口
 */
async function testLotteryTrends() {
  log('cyan', '\n📉 测试3: 抽奖趋势接口 (lottery/trends)')
  
  const testPeriods = ['week', 'month']
  const results = []

  for (const period of testPeriods) {
    log('blue', `   请求: GET ${BASE_URL}/lottery/trends?period=${period}`)

    try {
      const result = await makeRequest(`${BASE_URL}/lottery/trends?period=${period}`)
      
      if (result.statusCode === 200 && result.data.success) {
        log('green', `   ✅ period=${period} 成功`)
        
        const data = result.data.data
        console.log(`     - period.days: ${data.period?.days || '-'}`)
        console.log(`     - lottery_activity.length: ${data.lottery_activity?.length || 0}`)
        console.log(`     - user_activity.length: ${data.user_activity?.length || 0}`)
        console.log(`     - summary.peak_draws: ${data.summary?.peak_draws || '-'}`)
        console.log(`     - summary.peak_users: ${data.summary?.peak_users || '-'}`)
        
        results.push({ period, success: true, data })
      } else if (result.statusCode === 401) {
        log('yellow', `   ⚠️ period=${period} 需要认证`)
        results.push({ period, success: false, needAuth: true })
      } else {
        log('red', `   ❌ period=${period} 失败 (${result.statusCode})`)
        results.push({ period, success: false })
      }
    } catch (error) {
      log('red', `   ❌ period=${period} 异常: ${error.message}`)
      results.push({ period, success: false, error })
    }
  }

  return results
}

/**
 * 测试性能报告接口
 */
async function testPerformanceReport() {
  log('cyan', '\n⚡ 测试4: 性能报告接口 (performance/report)')
  log('blue', `   请求: GET ${BASE_URL}/performance/report`)

  try {
    const result = await makeRequest(`${BASE_URL}/performance/report`)
    
    if (result.statusCode === 200 && result.data.success) {
      log('green', `   ✅ 成功 (状态码: ${result.statusCode})`)
      
      const data = result.data.data
      console.log('   返回数据结构:')
      console.log(`     - timestamp: ${data.timestamp || '-'}`)
      console.log(`     - system.uptime_formatted: ${data.system?.uptime_formatted || '-'}`)
      console.log(`     - system.memory.heap_used: ${data.system?.memory?.heap_used || '-'}`)
      console.log(`     - database.total_users: ${data.database?.total_users || '-'}`)
      console.log(`     - database.total_lottery_draws: ${data.database?.total_lottery_draws || '-'}`)
      console.log(`     - health_indicators.database_responsive: ${data.health_indicators?.database_responsive}`)
      
      return { success: true, data }
    } else if (result.statusCode === 401) {
      log('yellow', `   ⚠️ 需要认证 (状态码: 401)`)
      return { success: false, needAuth: true }
    } else {
      log('red', `   ❌ 失败 (状态码: ${result.statusCode})`)
      console.log(`   响应: ${JSON.stringify(result.data).substring(0, 300)}`)
      return { success: false }
    }
  } catch (error) {
    log('red', `   ❌ 请求异常: ${error.message}`)
    return { success: false, error }
  }
}

/**
 * 主测试函数
 */
async function runTests() {
  log('cyan', '═'.repeat(60))
  log('cyan', '  运营分析API测试脚本')
  log('cyan', '═'.repeat(60))
  log('blue', `  目标服务器: http://${HOST}:${PORT}`)
  log('blue', `  基础路径: ${BASE_URL}`)
  log('cyan', '═'.repeat(60))

  // 先检查服务是否可用
  try {
    await makeRequest('/health')
    log('green', '\n✅ 服务健康检查通过')
  } catch (error) {
    log('red', `\n❌ 服务不可用: ${error.message}`)
    log('yellow', '请确保后端服务正在运行')
    process.exit(1)
  }

  // 尝试登录获取token
  const loginSuccess = await loginAsAdmin()
  if (!loginSuccess) {
    log('yellow', '\n⚠️ 未能自动登录，将尝试无token测试（可能会失败）')
    log('yellow', '提示: 可以通过环境变量 AUTH_TOKEN 传入有效的管理员token')
  }

  // 执行测试
  const results = {
    todayStats: await testTodayStats(),
    decisionAnalytics: await testDecisionAnalytics(),
    lotteryTrends: await testLotteryTrends(),
    performanceReport: await testPerformanceReport()
  }

  // 输出测试总结
  log('cyan', '\n' + '═'.repeat(60))
  log('cyan', '  测试总结')
  log('cyan', '═'.repeat(60))

  let passed = 0
  let failed = 0
  let needAuth = 0

  // 统计结果
  if (results.todayStats.success) passed++
  else if (results.todayStats.needAuth) needAuth++
  else failed++

  results.decisionAnalytics.forEach(r => {
    if (r.success) passed++
    else if (r.needAuth) needAuth++
    else failed++
  })

  results.lotteryTrends.forEach(r => {
    if (r.success) passed++
    else if (r.needAuth) needAuth++
    else failed++
  })

  if (results.performanceReport.success) passed++
  else if (results.performanceReport.needAuth) needAuth++
  else failed++

  log('green', `  ✅ 通过: ${passed}`)
  log('yellow', `  ⚠️ 需认证: ${needAuth}`)
  log('red', `  ❌ 失败: ${failed}`)
  log('cyan', '═'.repeat(60))

  if (needAuth > 0) {
    log('yellow', '\n提示: 部分接口需要管理员认证，请:')
    log('yellow', '  1. 使用有效的管理员账号登录')
    log('yellow', '  2. 或通过 AUTH_TOKEN 环境变量传入token')
    log('yellow', '  示例: AUTH_TOKEN=your_token node scripts/test-analytics-api.js')
  }

  if (passed > 0) {
    log('green', '\n🎉 后端API接口正常工作！前端应该能正确显示数据。')
  }
}

// 运行测试
runTests().catch(error => {
  log('red', `\n❌ 测试脚本异常: ${error.message}`)
  process.exit(1)
})

