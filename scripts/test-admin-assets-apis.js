#!/usr/bin/env node
/**
 * 管理后台资产API测试脚本
 * 
 * 测试以下端点：
 * 1. GET /api/v4/console/assets/stats - 系统资产统计
 * 2. GET /api/v4/console/asset-adjustment/asset-types - 资产类型列表
 * 3. GET /api/v4/console/orphan-frozen/detect - 孤儿冻结检测
 * 4. GET /api/v4/console/orphan-frozen/stats - 孤儿冻结统计
 * 5. GET /api/v4/console/assets/transactions - 资产流水（需user_id）
 * 
 * 运行方式: node scripts/test-admin-assets-apis.js
 */

'use strict'

const http = require('http')

// 配置
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000'
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '' // 需要设置管理员token

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
function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL)
    
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': ADMIN_TOKEN ? `Bearer ${ADMIN_TOKEN}` : ''
      }
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
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
    
    if (body) {
      req.write(JSON.stringify(body))
    }
    
    req.end()
  })
}

/**
 * 测试API端点
 */
async function testEndpoint(name, method, path, expectedStatus = 200, body = null) {
  process.stdout.write(`  测试 ${name}... `)
  
  try {
    const result = await makeRequest(method, path, body)
    
    if (result.status === expectedStatus || (result.status === 401 && !ADMIN_TOKEN)) {
      if (result.status === 401) {
        log('yellow', `⚠️ 需要认证 (${result.status})`)
        return { success: true, needsAuth: true }
      }
      log('green', `✅ 成功 (${result.status})`)
      
      // 打印响应摘要
      if (result.data && result.data.success) {
        const data = result.data.data
        if (data) {
          if (data.asset_types) {
            log('cyan', `     📊 资产类型数: ${data.asset_types.length || data.total || 0}`)
          }
          if (data.asset_stats) {
            log('cyan', `     📊 资产统计数: ${data.asset_stats.length}`)
          }
          if (data.orphan_list !== undefined) {
            log('cyan', `     📊 孤儿冻结数: ${data.total || 0}`)
          }
          if (data.transactions) {
            log('cyan', `     📊 流水记录数: ${data.transactions.length}`)
          }
        }
      }
      
      return { success: true, data: result.data }
    } else {
      log('red', `❌ 失败 (${result.status})`)
      if (result.data && result.data.message) {
        log('red', `     错误: ${result.data.message}`)
      }
      return { success: false, error: result.data }
    }
  } catch (error) {
    log('red', `❌ 错误: ${error.message}`)
    return { success: false, error: error.message }
  }
}

/**
 * 主测试函数
 */
async function runTests() {
  log('blue', '\n========================================')
  log('blue', '🧪 管理后台资产API测试')
  log('blue', '========================================\n')
  
  log('cyan', `📍 测试服务器: ${BASE_URL}`)
  log('cyan', `🔑 认证Token: ${ADMIN_TOKEN ? '已设置' : '未设置（将跳过需要认证的测试）'}\n`)
  
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    needsAuth: 0
  }
  
  // 测试健康检查（不需要认证）
  log('yellow', '1️⃣ 基础连接测试')
  const healthResult = await testEndpoint('健康检查', 'GET', '/health')
  results.total++
  if (healthResult.success) results.passed++
  else results.failed++
  
  console.log()
  
  // 测试资产统计API
  log('yellow', '2️⃣ 资产统计API测试')
  
  const statsResult = await testEndpoint(
    '系统资产统计 /api/v4/console/assets/stats',
    'GET',
    '/api/v4/console/assets/stats'
  )
  results.total++
  if (statsResult.success) {
    if (statsResult.needsAuth) results.needsAuth++
    else results.passed++
  } else results.failed++
  
  const typesResult = await testEndpoint(
    '资产类型列表 /api/v4/console/asset-adjustment/asset-types',
    'GET',
    '/api/v4/console/asset-adjustment/asset-types'
  )
  results.total++
  if (typesResult.success) {
    if (typesResult.needsAuth) results.needsAuth++
    else results.passed++
  } else results.failed++
  
  console.log()
  
  // 测试孤儿冻结API
  log('yellow', '3️⃣ 孤儿冻结API测试')
  
  const orphanDetectResult = await testEndpoint(
    '孤儿冻结检测 /api/v4/console/orphan-frozen/detect',
    'GET',
    '/api/v4/console/orphan-frozen/detect'
  )
  results.total++
  if (orphanDetectResult.success) {
    if (orphanDetectResult.needsAuth) results.needsAuth++
    else results.passed++
  } else results.failed++
  
  const orphanStatsResult = await testEndpoint(
    '孤儿冻结统计 /api/v4/console/orphan-frozen/stats',
    'GET',
    '/api/v4/console/orphan-frozen/stats'
  )
  results.total++
  if (orphanStatsResult.success) {
    if (orphanStatsResult.needsAuth) results.needsAuth++
    else results.passed++
  } else results.failed++
  
  console.log()
  
  // 测试资产流水API（需要user_id参数）
  log('yellow', '4️⃣ 资产流水API测试')
  
  const txResult = await testEndpoint(
    '资产流水查询 /api/v4/console/assets/transactions?user_id=1',
    'GET',
    '/api/v4/console/assets/transactions?user_id=1'
  )
  results.total++
  if (txResult.success) {
    if (txResult.needsAuth) results.needsAuth++
    else results.passed++
  } else results.failed++
  
  // 打印测试结果汇总
  console.log()
  log('blue', '========================================')
  log('blue', '📊 测试结果汇总')
  log('blue', '========================================')
  console.log()
  log('cyan', `  总测试数: ${results.total}`)
  log('green', `  ✅ 通过: ${results.passed}`)
  log('red', `  ❌ 失败: ${results.failed}`)
  if (results.needsAuth > 0) {
    log('yellow', `  ⚠️ 需要认证: ${results.needsAuth}`)
    console.log()
    log('yellow', '  提示: 设置 ADMIN_TOKEN 环境变量以测试需要认证的端点')
    log('yellow', '  例如: ADMIN_TOKEN=your_token node scripts/test-admin-assets-apis.js')
  }
  console.log()
  
  // 返回退出码
  process.exit(results.failed > 0 ? 1 : 0)
}

// 运行测试
runTests().catch(error => {
  log('red', `\n❌ 测试运行失败: ${error.message}`)
  process.exit(1)
})

