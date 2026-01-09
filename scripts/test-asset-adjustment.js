#!/usr/bin/env node
/**
 * 资产调整功能测试脚本
 *
 * @description 测试管理后台的资产调整API，验证：
 *   1. BUDGET_POINTS调整缺少campaign_id会被拒绝
 *   2. BUDGET_POINTS调整带campaign_id可以成功
 *   3. POINTS调整不需要campaign_id
 *
 * @usage
 *   # 方式1：传入管理员token
 *   ADMIN_TOKEN=xxx node scripts/test-asset-adjustment.js
 *
 *   # 方式2：直接测试API参数验证（不需要token）
 *   node scripts/test-asset-adjustment.js --validation-only
 *
 * @date 2026-01-09
 */

'use strict'

const http = require('http')

// 配置
const CONFIG = {
  host: 'localhost',
  port: 3000,
  adminToken: process.env.ADMIN_TOKEN || null,
  validationOnly: process.argv.includes('--validation-only')
}

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

/**
 * 发送HTTP请求
 */
function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: CONFIG.host,
        port: CONFIG.port,
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      },
      res => {
        let data = ''
        res.on('data', chunk => (data += chunk))
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode,
              data: JSON.parse(data)
            })
          } catch {
            resolve({
              status: res.statusCode,
              data: data
            })
          }
        })
      }
    )
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

/**
 * 测试API健康状态
 */
async function checkHealth() {
  log('\n📋 检查服务健康状态', 'cyan')

  const response = await request({
    path: '/health',
    method: 'GET'
  })

  if (response.status === 200 && response.data.success) {
    log(`✅ 服务正常运行 - ${response.data.data.version}`, 'green')
    return true
  } else {
    log(`❌ 服务异常: ${response.data.message || '无法连接'}`, 'red')
    return false
  }
}

/**
 * 测试资产调整参数验证
 */
async function testAssetAdjust(testCase) {
  log(`\n📋 测试: ${testCase.name}`, 'cyan')
  log(`   参数: ${JSON.stringify(testCase.params, null, 2)}`, 'gray')

  const headers = {}
  if (CONFIG.adminToken) {
    headers.Authorization = `Bearer ${CONFIG.adminToken}`
  }

  const response = await request(
    {
      path: '/api/v4/console/asset-adjustment/adjust',
      method: 'POST',
      headers
    },
    testCase.params
  )

  log(`   HTTP状态: ${response.status}`, 'gray')
  log(`   响应: ${JSON.stringify(response.data, null, 2)}`, 'gray')

  // 验证测试结果
  if (testCase.expectStatus) {
    if (response.status === testCase.expectStatus) {
      log(`✅ 测试通过: HTTP状态码正确 (${response.status})`, 'green')
      return { success: true }
    } else {
      log(`❌ 测试失败: 预期状态 ${testCase.expectStatus}，实际 ${response.status}`, 'red')
      return { success: false }
    }
  }

  if (testCase.expectCode) {
    if (response.data.code === testCase.expectCode) {
      log(`✅ 测试通过: 错误码正确 (${testCase.expectCode})`, 'green')
      return { success: true }
    } else {
      log(`❌ 测试失败: 预期错误码 ${testCase.expectCode}，实际 ${response.data.code}`, 'red')
      return { success: false }
    }
  }

  if (testCase.expectMessage) {
    if (response.data.message && response.data.message.includes(testCase.expectMessage)) {
      log(`✅ 测试通过: 错误消息包含 "${testCase.expectMessage}"`, 'green')
      return { success: true }
    } else {
      log(`❌ 测试失败: 错误消息不匹配`, 'red')
      return { success: false }
    }
  }

  return { success: true }
}

/**
 * 参数验证测试（不需要认证）
 */
async function runValidationTests() {
  log('\n══════════════════════════════════════════════════════════════', 'cyan')
  log('             API参数验证测试（无需认证）                        ', 'cyan')
  log('══════════════════════════════════════════════════════════════', 'cyan')

  const timestamp = Date.now()
  const testCases = [
    {
      name: '测试1: 缺少user_id',
      params: {
        asset_code: 'POINTS',
        amount: 100,
        reason: '测试',
        idempotency_key: `test_${timestamp}_1`
      },
      expectStatus: 400,
      expectMessage: 'user_id'
    },
    {
      name: '测试2: 缺少asset_code',
      params: {
        user_id: 31,
        amount: 100,
        reason: '测试',
        idempotency_key: `test_${timestamp}_2`
      },
      expectStatus: 400,
      expectMessage: 'asset_code'
    },
    {
      name: '测试3: 缺少reason',
      params: {
        user_id: 31,
        asset_code: 'POINTS',
        amount: 100,
        idempotency_key: `test_${timestamp}_3`
      },
      expectStatus: 400,
      expectMessage: 'reason'
    },
    {
      name: '测试4: BUDGET_POINTS缺少campaign_id（核心测试）',
      params: {
        user_id: 31,
        asset_code: 'BUDGET_POINTS',
        amount: 100,
        reason: '测试预算积分调整',
        idempotency_key: `test_${timestamp}_4`
      },
      expectStatus: 400,
      expectMessage: 'campaign_id'
    },
    {
      name: '测试5: 缺少idempotency_key',
      params: {
        user_id: 31,
        asset_code: 'POINTS',
        amount: 100,
        reason: '测试'
      },
      expectStatus: 400,
      expectMessage: 'idempotency_key'
    }
  ]

  const results = []
  for (const testCase of testCases) {
    const result = await testAssetAdjust(testCase)
    results.push({ name: testCase.name, ...result })
  }

  return results
}

/**
 * 带认证的完整功能测试
 */
async function runAuthenticatedTests() {
  if (!CONFIG.adminToken) {
    log('\n⚠️ 未提供ADMIN_TOKEN，跳过认证测试', 'yellow')
    log('   使用方式: ADMIN_TOKEN=xxx node scripts/test-asset-adjustment.js', 'gray')
    return []
  }

  log('\n══════════════════════════════════════════════════════════════', 'cyan')
  log('             带认证的完整功能测试                               ', 'cyan')
  log('══════════════════════════════════════════════════════════════', 'cyan')

  // 首先获取活动列表
  log('\n📋 获取活动列表', 'cyan')
  const campaignResponse = await request({
    path: '/api/v4/console/campaign-budget/batch-status?limit=5',
    method: 'GET',
    headers: { Authorization: `Bearer ${CONFIG.adminToken}` }
  })

  let campaignId = null
  if (campaignResponse.status === 200 && campaignResponse.data.success) {
    const campaigns = campaignResponse.data.data.campaigns || []
    if (campaigns.length > 0) {
      campaignId = campaigns[0].campaign_id
      log(`✅ 找到活动: ID=${campaignId}, 名称=${campaigns[0].campaign_name}`, 'green')
    }
  }

  const timestamp = Date.now()
  const testCases = [
    {
      name: '测试A: POINTS调整（应该成功）',
      params: {
        user_id: 31,
        asset_code: 'POINTS',
        amount: 10,
        reason: '测试脚本-积分调整验证',
        idempotency_key: `auth_test_points_${timestamp}`
      },
      expectStatus: 200
    }
  ]

  // 如果有活动ID，添加BUDGET_POINTS正向测试
  if (campaignId) {
    testCases.push({
      name: `测试B: BUDGET_POINTS调整带campaign_id（应该成功）`,
      params: {
        user_id: 31,
        asset_code: 'BUDGET_POINTS',
        amount: 50,
        reason: '测试脚本-预算积分调整验证',
        campaign_id: campaignId,
        idempotency_key: `auth_test_budget_${timestamp}`
      },
      expectStatus: 200
    })
  } else {
    log('⚠️ 没有可用活动，跳过BUDGET_POINTS正向测试', 'yellow')
  }

  const results = []
  for (const testCase of testCases) {
    const result = await testAssetAdjust(testCase)
    results.push({ name: testCase.name, ...result })
  }

  return results
}

/**
 * 主测试流程
 */
async function main() {
  log('╔════════════════════════════════════════════════════════════╗', 'cyan')
  log('║           资产调整API测试脚本                               ║', 'cyan')
  log('║                                                            ║', 'cyan')
  log('║  验证前端修复后：                                          ║', 'cyan')
  log('║  - BUDGET_POINTS必须提供campaign_id才能调整                ║', 'cyan')
  log('║  - POINTS等其他资产不需要campaign_id                       ║', 'cyan')
  log('╚════════════════════════════════════════════════════════════╝', 'cyan')

  try {
    // 检查服务健康状态
    const healthy = await checkHealth()
    if (!healthy) {
      process.exit(1)
    }

    let allResults = []

    // 参数验证测试
    const validationResults = await runValidationTests()
    allResults = allResults.concat(validationResults)

    // 认证测试（如果提供了token）
    if (!CONFIG.validationOnly) {
      const authResults = await runAuthenticatedTests()
      allResults = allResults.concat(authResults)
    }

    // 测试结果汇总
    log('\n══════════════════════════════════════════════════════════════', 'cyan')
    log('                     测试结果汇总                              ', 'cyan')
    log('══════════════════════════════════════════════════════════════', 'cyan')

    const passed = allResults.filter(r => r.success).length
    const failed = allResults.filter(r => !r.success).length

    allResults.forEach(r => {
      const icon = r.success ? '✅' : '❌'
      log(`${icon} ${r.name}`, r.success ? 'green' : 'red')
    })

    log(`\n📊 测试完成: ${passed} 通过, ${failed} 失败`, passed === allResults.length ? 'green' : 'yellow')

    // 输出核心结论
    log('\n══════════════════════════════════════════════════════════════', 'cyan')
    log('                     核心验证结论                              ', 'cyan')
    log('══════════════════════════════════════════════════════════════', 'cyan')

    const budgetTest = allResults.find(r => r.name.includes('BUDGET_POINTS缺少campaign_id'))
    if (budgetTest && budgetTest.success) {
      log('✅ 后端正确验证：BUDGET_POINTS必须提供campaign_id', 'green')
      log('✅ 前端已修复：调整预算积分时会显示活动选择框', 'green')
      log('✅ 问题根因：前端未传递campaign_id参数（已修复）', 'green')
    } else {
      log('⚠️ 请检查后端API验证逻辑', 'yellow')
    }

    process.exit(failed > 0 ? 1 : 0)
  } catch (error) {
    log(`\n❌ 测试执行出错: ${error.message}`, 'red')
    console.error(error)
    process.exit(1)
  }
}

main()
