/**
 * 运营优化功能测试脚本 - V2
 * 测试后端API的可用性和数据返回格式
 * 
 * 运行方式: node admin/scripts/test-ops-features.js
 * 
 * 测试完成后请删除此文件
 */

require('dotenv').config()

const { User } = require('../../models')
const { generateTokens } = require('../../middleware/auth')

// 测试API配置
const API_BASE = `http://localhost:${process.env.PORT || 3000}/api/v4`

let testToken = null

/**
 * 初始化：获取测试用管理员token
 */
async function initTestToken() {
  console.log('🔐 初始化测试token...')
  
  try {
    // 使用管理员账户（用户ID 31，手机 13612227930）
    const testUser = await User.findOne({
      where: { user_id: 31 }
    })
    
    if (!testUser) {
      throw new Error('测试用户不存在 (user_id=31)')
    }
    
    // 生成token
    const tokens = await generateTokens(testUser)
    testToken = tokens.access_token
    
    console.log(`✅ Token生成成功: user_id=${testUser.user_id}, role_level=${tokens.user.role_level}`)
    return true
  } catch (error) {
    console.error('❌ Token生成失败:', error.message)
    return false
  }
}

/**
 * 发送API请求
 */
async function testApi(endpoint, method = 'GET', body = null) {
  const url = `${API_BASE}${endpoint}`
  console.log(`\n📡 测试 ${method} ${endpoint}`)
  
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testToken}`
      },
    }
    
    if (body) {
      options.body = JSON.stringify(body)
    }
    
    const response = await fetch(url, options)
    const data = await response.json()
    
    // 判断请求是否成功
    const statusEmoji = response.ok ? '✅' : '❌'
    console.log(`${statusEmoji} 状态码: ${response.status}`)
    
    if (data.success !== undefined) {
      console.log(`   success: ${data.success}`)
      console.log(`   code: ${data.code}`)
      console.log(`   message: ${data.message}`)
    }
    
    // 打印数据摘要（避免日志过长）
    if (data.data) {
      const dataKeys = Object.keys(data.data)
      console.log(`   data字段: [${dataKeys.join(', ')}]`)
      
      // 如果是列表，显示条数
      if (Array.isArray(data.data.list)) {
        console.log(`   列表条数: ${data.data.list.length}`)
      }
      if (Array.isArray(data.data.items)) {
        console.log(`   items条数: ${data.data.items.length}`)
      }
      if (data.data.total !== undefined) {
        console.log(`   总数: ${data.data.total}`)
      }
    }
    
    return { success: response.ok, status: response.status, data }
  } catch (error) {
    console.error(`❌ 请求失败: ${error.message}`)
    return { success: false, error: error.message }
  }
}

/**
 * 主测试流程
 */
async function runTests() {
  console.log('\n============================================================')
  console.log('🧪 运营优化功能API测试 - 开始')
  console.log('============================================================')
  
  // 1. 初始化token
  const tokenReady = await initTestToken()
  if (!tokenReady) {
    console.log('\n❌ 无法获取测试token，测试终止')
    process.exit(1)
  }
  
  const results = {
    passed: 0,
    failed: 0,
    tests: []
  }
  
  // 2. 测试P0-1: 导航徽标API
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📌 P0-1: 导航徽标API')
  const navBadges = await testApi('/console/nav/badges')
  results.tests.push({ name: 'P0-1 导航徽标', ...navBadges })
  navBadges.success ? results.passed++ : results.failed++
  
  // 3. 测试P0-2: 仪表盘相关API
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📌 P0-2: 仪表盘API')
  
  const pendingSummary = await testApi('/console/dashboard/pending-summary')
  results.tests.push({ name: 'P0-2 待处理概览', ...pendingSummary })
  pendingSummary.success ? results.passed++ : results.failed++
  
  const todayStats = await testApi('/console/analytics/stats/today')
  results.tests.push({ name: 'P0-2 今日统计', ...todayStats })
  todayStats.success ? results.passed++ : results.failed++
  
  const decisionsAnalytics = await testApi('/console/analytics/decisions/analytics?days=7')
  results.tests.push({ name: 'P0-2 决策分析', ...decisionsAnalytics })
  decisionsAnalytics.success ? results.passed++ : results.failed++
  
  const realtimeAlerts = await testApi('/console/lottery-monitoring/realtime-alerts?status=active&page_size=5')
  results.tests.push({ name: 'P0-2 实时告警', ...realtimeAlerts })
  realtimeAlerts.success ? results.passed++ : results.failed++
  
  const budgetStatus = await testApi('/console/campaign-budget/batch-status')
  results.tests.push({ name: 'P0-2 预算状态', ...budgetStatus })
  budgetStatus.success ? results.passed++ : results.failed++
  
  // 4. 测试P0-3: 待处理中心API
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📌 P0-3: 待处理中心API')
  
  const pendingCenterSummary = await testApi('/console/pending/summary')
  results.tests.push({ name: 'P0-3 待处理汇总', ...pendingCenterSummary })
  pendingCenterSummary.success ? results.passed++ : results.failed++
  
  const pendingList = await testApi('/console/pending/list?category=consumption&page=1&page_size=5')
  results.tests.push({ name: 'P0-3 待处理列表', ...pendingList })
  pendingList.success ? results.passed++ : results.failed++
  
  // 5. 测试P1-1: 抽奖健康度分析
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📌 P1-1: 抽奖健康度分析API')
  
  const healthAnalysis = await testApi('/console/lottery-health/analysis')
  results.tests.push({ name: 'P1-1 健康度分析', ...healthAnalysis })
  healthAnalysis.success ? results.passed++ : results.failed++
  
  // 6. 测试P1-2: 用户分层
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📌 P1-2: 用户分层API')
  
  const userSegments = await testApi('/console/users/segments')
  results.tests.push({ name: 'P1-2 用户分层', ...userSegments })
  userSegments.success ? results.passed++ : results.failed++
  
  // 打印测试结果汇总
  console.log('\n============================================================')
  console.log('📊 测试结果汇总')
  console.log('============================================================')
  console.log(`✅ 通过: ${results.passed}`)
  console.log(`❌ 失败: ${results.failed}`)
  console.log(`📋 总计: ${results.passed + results.failed}`)
  
  console.log('\n📋 详细结果:')
  results.tests.forEach((test, index) => {
    const emoji = test.success ? '✅' : '❌'
    console.log(`   ${index + 1}. ${emoji} ${test.name} - ${test.success ? 'PASS' : 'FAIL'}`)
  })
  
  console.log('\n============================================================')
  console.log('🧪 测试完成')
  console.log('============================================================')
  
  // 退出
  process.exit(results.failed > 0 ? 1 : 0)
}

// 运行测试
runTests().catch(error => {
  console.error('❌ 测试脚本执行失败:', error)
  process.exit(1)
})
