/**
 * 管理后台页面 API 测试脚本
 * 测试门店管理、抽奖指标等页面涉及的后端 API
 * 
 * @file scripts/test-admin-pages-api.js
 * @date 2026-01-23
 */

const axios = require('axios')

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000'
let authToken = null

// 颜色输出
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`
}

/**
 * 管理员登录获取 token
 */
async function login() {
  console.log(colors.cyan('\n🔐 管理员登录...'))
  try {
    const response = await axios.post(`${BASE_URL}/api/v4/console/auth/login`, {
      username: 'admin',
      password: 'admin123'
    })
    
    if (response.data?.success && response.data?.data?.token) {
      authToken = response.data.data.token
      console.log(colors.green('✅ 登录成功'))
      return true
    }
    console.log(colors.red('❌ 登录失败: ' + JSON.stringify(response.data)))
    return false
  } catch (error) {
    console.log(colors.red('❌ 登录失败: ' + (error.response?.data?.message || error.message)))
    return false
  }
}

/**
 * 发送带认证的 GET 请求
 */
async function apiGet(endpoint) {
  try {
    const response = await axios.get(`${BASE_URL}${endpoint}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    })
    return { success: true, data: response.data, status: response.status }
  } catch (error) {
    return {
      success: false,
      status: error.response?.status || 0,
      error: error.response?.data?.message || error.message,
      data: error.response?.data
    }
  }
}

/**
 * 测试门店管理 API
 */
async function testStoresAPI() {
  console.log(colors.cyan('\n📊 测试门店管理 API...'))
  console.log('=' .repeat(50))
  
  const tests = [
    { name: '门店列表', endpoint: '/api/v4/console/stores?page=1&page_size=20' },
    { name: '门店统计', endpoint: '/api/v4/console/stores/stats' },
    { name: '门店排行(不存在)', endpoint: '/api/v4/console/stores/ranking' }
  ]
  
  for (const test of tests) {
    const result = await apiGet(test.endpoint)
    if (result.success) {
      console.log(colors.green(`✅ ${test.name}: HTTP ${result.status}`))
      // 显示关键数据
      const data = result.data?.data
      if (data) {
        if (data.items) console.log(`   门店数量: ${data.items.length}`)
        if (data.pagination) console.log(`   分页: ${JSON.stringify(data.pagination)}`)
        if (data.statistics) console.log(`   统计: ${JSON.stringify(data.statistics)}`)
        if (data.total !== undefined) console.log(`   总数: ${data.total}`)
        if (data.active !== undefined) console.log(`   活跃: ${data.active}`)
      }
    } else {
      console.log(colors.red(`❌ ${test.name}: HTTP ${result.status} - ${result.error}`))
    }
  }
}

/**
 * 测试员工管理 API
 */
async function testStaffAPI() {
  console.log(colors.cyan('\n👥 测试员工管理 API...'))
  console.log('=' .repeat(50))
  
  const tests = [
    { name: '员工列表', endpoint: '/api/v4/console/staff?page=1&page_size=20' },
    { name: '员工统计', endpoint: '/api/v4/console/staff/stats' }
  ]
  
  for (const test of tests) {
    const result = await apiGet(test.endpoint)
    if (result.success) {
      console.log(colors.green(`✅ ${test.name}: HTTP ${result.status}`))
      const data = result.data?.data
      if (data) {
        if (data.items) console.log(`   员工数量: ${data.items.length}`)
        if (data.pagination) console.log(`   分页: ${JSON.stringify(data.pagination)}`)
      }
    } else {
      console.log(colors.red(`❌ ${test.name}: HTTP ${result.status} - ${result.error}`))
    }
  }
}

/**
 * 测试抽奖指标 API
 */
async function testLotteryStatsAPI() {
  console.log(colors.cyan('\n🎰 测试抽奖指标 API...'))
  console.log('=' .repeat(50))
  
  const tests = [
    // 这些 API 需要 campaign_id 参数
    { name: '抽奖策略统计概览(不存在)', endpoint: '/api/v4/console/lottery-strategy-stats/overview' },
    { name: '抽奖实时数据(需要campaign_id)', endpoint: '/api/v4/console/lottery-strategy-stats/realtime/1' },
    { name: '抽奖小时趋势(需要campaign_id)', endpoint: '/api/v4/console/lottery-strategy-stats/hourly/1' },
    // 替代方案：使用 lottery-monitoring
    { name: '抽奖监控-小时指标', endpoint: '/api/v4/console/lottery-monitoring/hourly-metrics' },
    // 活动列表
    { name: '活动列表', endpoint: '/api/v4/console/system-data/lottery-campaigns' }
  ]
  
  for (const test of tests) {
    const result = await apiGet(test.endpoint)
    if (result.success) {
      console.log(colors.green(`✅ ${test.name}: HTTP ${result.status}`))
      const data = result.data?.data
      if (data) {
        if (Array.isArray(data)) console.log(`   记录数: ${data.length}`)
        if (data.items) console.log(`   数量: ${data.items.length}`)
        if (data.campaigns) console.log(`   活动数: ${data.campaigns.length}`)
        if (data.total_draws !== undefined) console.log(`   总抽奖次数: ${data.total_draws}`)
      }
    } else {
      console.log(colors.red(`❌ ${test.name}: HTTP ${result.status} - ${result.error}`))
    }
  }
}

/**
 * 测试配额管理 API
 */
async function testQuotaAPI() {
  console.log(colors.cyan('\n📋 测试配额管理 API...'))
  console.log('=' .repeat(50))
  
  const tests = [
    { name: '配额规则列表', endpoint: '/api/v4/console/lottery-quota/rules' }
  ]
  
  for (const test of tests) {
    const result = await apiGet(test.endpoint)
    if (result.success) {
      console.log(colors.green(`✅ ${test.name}: HTTP ${result.status}`))
      const data = result.data?.data
      if (data) {
        if (data.rules) console.log(`   规则数: ${data.rules.length}`)
        if (Array.isArray(data)) console.log(`   记录数: ${data.length}`)
      }
    } else {
      console.log(colors.red(`❌ ${test.name}: HTTP ${result.status} - ${result.error}`))
    }
  }
}

/**
 * 测试活动预算 API
 */
async function testBudgetAPI() {
  console.log(colors.cyan('\n💰 测试活动预算 API...'))
  console.log('=' .repeat(50))
  
  const tests = [
    { name: '预算批量状态', endpoint: '/api/v4/console/campaign-budget/batch-status' }
  ]
  
  for (const test of tests) {
    const result = await apiGet(test.endpoint)
    if (result.success) {
      console.log(colors.green(`✅ ${test.name}: HTTP ${result.status}`))
      const data = result.data?.data
      if (data) {
        if (data.campaigns) console.log(`   活动数: ${data.campaigns.length}`)
        if (data.summary) console.log(`   汇总: ${JSON.stringify(data.summary)}`)
      }
    } else {
      console.log(colors.red(`❌ ${test.name}: HTTP ${result.status} - ${result.error}`))
    }
  }
}

/**
 * 生成 API 可用性报告
 */
function generateReport(results) {
  console.log(colors.cyan('\n📄 API 可用性报告'))
  console.log('=' .repeat(50))
  
  console.log(`
问题分析:
1. /api/v4/console/lottery-strategy-stats/overview - 该端点不存在
   → 后端只有 /realtime/:campaign_id 等需要 campaign_id 的端点
   → 前端应使用 /lottery-monitoring/hourly-metrics 代替

2. /api/v4/console/stores/ranking - 该端点不存在
   → 后端没有门店排行接口
   → 前端应从门店列表计算或移除该功能

3. 前端 "Undeclared variable: NaN" 错误
   → 可能是因为 API 返回数据结构不匹配
   → 需要检查前端数据处理逻辑

修复建议:
1. 修改抽奖指标页面，使用 /lottery-monitoring/hourly-metrics
2. 修改门店统计页面，从门店列表数据计算排行
3. 检查并修复前端变量初始化问题
`)
}

/**
 * 主函数
 */
async function main() {
  console.log(colors.cyan('🚀 管理后台页面 API 测试'))
  console.log('=' .repeat(50))
  console.log(`测试地址: ${BASE_URL}`)
  
  // 登录
  const loginSuccess = await login()
  if (!loginSuccess) {
    console.log(colors.red('\n❌ 登录失败，无法继续测试'))
    process.exit(1)
  }
  
  // 运行测试
  await testStoresAPI()
  await testStaffAPI()
  await testLotteryStatsAPI()
  await testQuotaAPI()
  await testBudgetAPI()
  
  // 生成报告
  generateReport()
  
  console.log(colors.cyan('\n✅ 测试完成'))
}

main().catch(console.error)























