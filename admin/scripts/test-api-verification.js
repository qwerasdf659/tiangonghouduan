#!/usr/bin/env node
/**
 * API 数据验证测试脚本
 * @description 验证运营优化方案中的关键 API 是否正常工作
 * @author 临时脚本 - 任务完成后删除
 * @date 2026-02-01
 */

import https from 'https'
import http from 'http'

// 配置
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000'
const TEST_PHONE = '13612227930'
const TEST_USER_ID = 31

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function logSection(title) {
  console.log('')
  log(`${'='.repeat(60)}`, 'cyan')
  log(` ${title}`, 'cyan')
  log(`${'='.repeat(60)}`, 'cyan')
}

function logResult(name, success, details = '') {
  const icon = success ? '✅' : '❌'
  const color = success ? 'green' : 'red'
  log(`${icon} ${name}${details ? ': ' + details : ''}`, color)
}

// HTTP 请求封装
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const isHttps = urlObj.protocol === 'https:'
    const client = isHttps ? https : http
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    }
    
    const req = client.request(requestOptions, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) })
        } catch (e) {
          resolve({ status: res.statusCode, data: data })
        }
      })
    })
    
    req.on('error', reject)
    req.setTimeout(10000, () => {
      req.destroy()
      reject(new Error('请求超时'))
    })
    
    if (options.body) {
      req.write(JSON.stringify(options.body))
    }
    req.end()
  })
}

// 登录获取 token
async function login() {
  log('🔐 正在登录获取 Token...', 'yellow')
  
  try {
    const response = await request(`${BASE_URL}/api/v4/auth/login`, {
      method: 'POST',
      body: {
        mobile: TEST_PHONE,
        verification_code: '123456' // 开发环境万能验证码
      }
    })
    
    if (response.data.success && response.data.data?.access_token) {
      log('✅ 登录成功', 'green')
      return response.data.data.access_token
    } else {
      log(`❌ 登录失败: ${response.data.message || '未知错误'}`, 'red')
      return null
    }
  } catch (error) {
    log(`❌ 登录请求失败: ${error.message}`, 'red')
    return null
  }
}

// 测试健康检查
async function testHealth() {
  logSection('1. 健康检查')
  
  try {
    const response = await request(`${BASE_URL}/health`)
    logResult('健康检查 API', response.status === 200, `状态码: ${response.status}`)
    return response.status === 200
  } catch (error) {
    logResult('健康检查 API', false, error.message)
    return false
  }
}

// 测试导航徽标 API
async function testNavBadges(token) {
  logSection('2. 导航徽标 API (P0-1)')
  
  try {
    const response = await request(`${BASE_URL}/api/v4/console/nav/badges`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    
    const success = response.status === 200 && response.data.success
    logResult('GET /api/v4/console/nav/badges', success, `状态码: ${response.status}`)
    
    if (success && response.data.data) {
      const data = response.data.data
      log(`   📊 总待处理: ${data.total || 0}`, 'blue')
      log(`   📊 消费审核: ${data.badges?.consumption || 0}`, 'blue')
      log(`   📊 客服会话: ${data.badges?.customer_service || 0}`, 'blue')
      log(`   📊 风控告警: ${data.badges?.risk_alert || 0}`, 'blue')
      log(`   📊 抽奖告警: ${data.badges?.lottery_alert || 0}`, 'blue')
    }
    
    return success
  } catch (error) {
    logResult('GET /api/v4/console/nav/badges', false, error.message)
    return false
  }
}

// 测试待处理中心汇总 API
async function testPendingSummary(token) {
  logSection('3. 待处理中心汇总 API (P0-3)')
  
  try {
    const response = await request(`${BASE_URL}/api/v4/console/pending/summary`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    
    const success = response.status === 200 && response.data.success
    logResult('GET /api/v4/console/pending/summary', success, `状态码: ${response.status}`)
    
    if (success && response.data.data) {
      const data = response.data.data
      log(`   📊 分类数量: ${data.segments?.length || 0}`, 'blue')
      log(`   📊 总待处理: ${data.total?.total_count || 0}`, 'blue')
      log(`   📊 紧急事项: ${data.total?.urgent_count || 0}`, 'blue')
      
      if (data.segments) {
        data.segments.forEach(seg => {
          log(`   - ${seg.category_name}: ${seg.count} (紧急: ${seg.urgent_count})`, 'blue')
        })
      }
    }
    
    return success
  } catch (error) {
    logResult('GET /api/v4/console/pending/summary', false, error.message)
    return false
  }
}

// 测试待处理列表 API
async function testPendingList(token) {
  logSection('4. 待处理列表 API (P0-3)')
  
  try {
    const response = await request(`${BASE_URL}/api/v4/console/pending/list?page=1&page_size=5`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    
    const success = response.status === 200 && response.data.success
    logResult('GET /api/v4/console/pending/list', success, `状态码: ${response.status}`)
    
    if (success && response.data.data) {
      const data = response.data.data
      log(`   📊 列表数量: ${data.items?.length || 0}`, 'blue')
      log(`   📊 总记录数: ${data.pagination?.total || 0}`, 'blue')
    }
    
    return success
  } catch (error) {
    logResult('GET /api/v4/console/pending/list', false, error.message)
    return false
  }
}

// 测试仪表盘待处理聚合 API
async function testDashboardPending(token) {
  logSection('5. 仪表盘待处理聚合 API (P0-2)')
  
  try {
    const response = await request(`${BASE_URL}/api/v4/console/dashboard/pending-summary`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    
    const success = response.status === 200 && response.data.success
    logResult('GET /api/v4/console/dashboard/pending-summary', success, `状态码: ${response.status}`)
    
    if (success && response.data.data) {
      const data = response.data.data
      log(`   📊 消费待处理: ${data.consumption_pending?.count || 0}`, 'blue')
      log(`   📊 客服待处理: ${data.customer_service_pending?.count || 0}`, 'blue')
      log(`   📊 风控告警: ${data.risk_alerts?.count || 0}`, 'blue')
      log(`   📊 抽奖告警: ${data.lottery_alerts?.count || 0}`, 'blue')
    }
    
    return success
  } catch (error) {
    logResult('GET /api/v4/console/dashboard/pending-summary', false, error.message)
    return false
  }
}

// 测试今日统计 API
async function testTodayStats(token) {
  logSection('6. 今日统计 API (P0-2)')
  
  try {
    const response = await request(`${BASE_URL}/api/v4/console/analytics/stats/today`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    
    const success = response.status === 200 && response.data.success
    logResult('GET /api/v4/console/analytics/stats/today', success, `状态码: ${response.status}`)
    
    if (success && response.data.data) {
      const data = response.data.data
      log(`   📊 今日抽奖: ${data.lottery_count || 0}`, 'blue')
      log(`   📊 今日中奖率: ${data.win_rate || 0}%`, 'blue')
      log(`   📊 新增用户: ${data.new_users || 0}`, 'blue')
    }
    
    return success
  } catch (error) {
    logResult('GET /api/v4/console/analytics/stats/today', false, error.message)
    return false
  }
}

// 测试健康度报告 API (P1-1)
async function testLotteryHealth(token) {
  logSection('7. 抽奖健康度 API (P1-1)')
  
  try {
    const response = await request(`${BASE_URL}/api/v4/console/lottery-health/report`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    
    const success = response.status === 200 && response.data.success
    logResult('GET /api/v4/console/lottery-health/report', success, `状态码: ${response.status}`)
    
    if (success && response.data.data) {
      const data = response.data.data
      log(`   📊 健康度评分: ${data.health_score || 'N/A'}`, 'blue')
    }
    
    return success
  } catch (error) {
    logResult('GET /api/v4/console/lottery-health/report', false, error.message)
    return false
  }
}

// 测试用户分层 API (P1-2)
async function testUserSegments(token) {
  logSection('8. 用户分层 API (P1-2)')
  
  try {
    const response = await request(`${BASE_URL}/api/v4/console/user-segments/segments`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    
    const success = response.status === 200 && response.data.success
    logResult('GET /api/v4/console/user-segments/segments', success, `状态码: ${response.status}`)
    
    if (success && response.data.data) {
      const data = response.data.data
      log(`   📊 分层数据: ${JSON.stringify(data).substring(0, 100)}...`, 'blue')
    }
    
    return success
  } catch (error) {
    logResult('GET /api/v4/console/user-segments/segments', false, error.message)
    return false
  }
}

// 测试提醒规则 API (P2-2)
async function testReminderRules(token) {
  logSection('9. 提醒规则 API (P2-2)')
  
  try {
    const response = await request(`${BASE_URL}/api/v4/console/reminder-rules?page=1&page_size=5`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    
    const success = response.status === 200 && response.data.success
    logResult('GET /api/v4/console/reminder-rules', success, `状态码: ${response.status}`)
    
    if (success && response.data.data) {
      const data = response.data.data
      log(`   📊 规则数量: ${data.items?.length || data.length || 0}`, 'blue')
    }
    
    return success
  } catch (error) {
    logResult('GET /api/v4/console/reminder-rules', false, error.message)
    return false
  }
}

// 测试批量操作 API (P0-4)
async function testBatchOperationsEndpoint(token) {
  logSection('10. 批量操作端点检查 (P0-4)')
  
  try {
    // 仅检查端点是否存在，不实际执行批量操作
    const response = await request(`${BASE_URL}/api/v4/console/batch-operations/consumption-review`, {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: {
        record_ids: [],  // 空数组，不实际操作
        action: 'approve'
      }
    })
    
    // 如果返回 400 说明端点存在但参数验证失败（预期行为）
    const success = response.status === 200 || response.status === 400
    logResult('POST /api/v4/console/batch-operations/consumption-review', success, 
      success ? '端点存在' : `状态码: ${response.status}`)
    
    return success
  } catch (error) {
    logResult('POST /api/v4/console/batch-operations/consumption-review', false, error.message)
    return false
  }
}

// 主测试函数
async function main() {
  console.log('')
  log('🧪 运营优化方案 API 验证测试', 'cyan')
  log(`📍 测试环境: ${BASE_URL}`, 'yellow')
  log(`👤 测试账号: ${TEST_PHONE} (用户ID: ${TEST_USER_ID})`, 'yellow')
  console.log('')
  
  const results = {
    total: 0,
    passed: 0,
    failed: 0
  }
  
  // 1. 健康检查
  if (await testHealth()) {
    results.passed++
  } else {
    results.failed++
    log('⚠️ 服务健康检查失败，后续测试可能不准确', 'yellow')
  }
  results.total++
  
  // 2. 登录获取 token
  const token = await login()
  if (!token) {
    log('❌ 无法获取登录 Token，跳过需要认证的 API 测试', 'red')
    console.log('')
    log(`📊 测试结果: ${results.passed}/${results.total} 通过`, results.passed === results.total ? 'green' : 'yellow')
    return
  }
  
  // 3. 测试各个 API
  const tests = [
    () => testNavBadges(token),
    () => testPendingSummary(token),
    () => testPendingList(token),
    () => testDashboardPending(token),
    () => testTodayStats(token),
    () => testLotteryHealth(token),
    () => testUserSegments(token),
    () => testReminderRules(token),
    () => testBatchOperationsEndpoint(token)
  ]
  
  for (const test of tests) {
    results.total++
    if (await test()) {
      results.passed++
    } else {
      results.failed++
    }
  }
  
  // 汇总结果
  logSection('测试汇总')
  log(`📊 总测试数: ${results.total}`, 'blue')
  log(`✅ 通过: ${results.passed}`, 'green')
  log(`❌ 失败: ${results.failed}`, results.failed > 0 ? 'red' : 'green')
  log(`📈 通过率: ${((results.passed / results.total) * 100).toFixed(1)}%`, 
    results.passed === results.total ? 'green' : 'yellow')
  
  console.log('')
  if (results.failed === 0) {
    log('🎉 所有 API 测试通过！', 'green')
  } else {
    log('⚠️ 部分 API 测试失败，请检查后端服务', 'yellow')
  }
  console.log('')
}

// 执行测试
main().catch(error => {
  log(`❌ 测试执行失败: ${error.message}`, 'red')
  process.exit(1)
})

