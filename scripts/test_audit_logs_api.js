#!/usr/bin/env node
/**
 * 审计日志API测试脚本
 *
 * 测试内容：
 * 1. 审计日志列表接口 GET /api/v4/console/system/audit-logs
 * 2. 审计日志统计接口 GET /api/v4/console/system/audit-logs/statistics
 * 3. 审计日志详情接口 GET /api/v4/console/system/audit-logs/:log_id
 *
 * 使用方法：
 * node scripts/test-audit-logs-api.js
 */

const http = require('http')
const https = require('https')

// 配置
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000'
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '' // 需要传入有效的管理员token

// 解析URL
const parsedUrl = new URL(BASE_URL)
const httpClient = parsedUrl.protocol === 'https:' ? https : http

// 发送HTTP请求
function makeRequest(method, path, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` })
      }
    }

    const req = httpClient.request(options, res => {
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
    req.end()
  })
}

// 测试函数
async function runTests() {
  console.log('🧪 开始测试审计日志API...\n')
  console.log(`📍 API地址: ${BASE_URL}`)
  console.log(`🔑 Token: ${ADMIN_TOKEN ? '已配置' : '未配置（将使用无认证请求）'}\n`)

  let passed = 0
  let failed = 0

  // 测试1：无认证请求应返回401
  console.log('═'.repeat(60))
  console.log('📋 测试1：无认证请求审计日志列表')
  console.log('═'.repeat(60))
  try {
    const res = await makeRequest('GET', '/api/v4/console/system/audit-logs')
    console.log(`   状态码: ${res.status}`)
    console.log(`   响应: ${JSON.stringify(res.data, null, 2).substring(0, 200)}...`)

    if (res.status === 401) {
      console.log('   ✅ 通过 - 正确返回401未授权')
      passed++
    } else {
      console.log('   ❌ 失败 - 预期401，实际' + res.status)
      failed++
    }
  } catch (error) {
    console.log('   ❌ 请求失败:', error.message)
    failed++
  }

  // 测试2：无认证请求统计接口
  console.log('\n' + '═'.repeat(60))
  console.log('📋 测试2：无认证请求审计日志统计')
  console.log('═'.repeat(60))
  try {
    const res = await makeRequest('GET', '/api/v4/console/system/audit-logs/statistics')
    console.log(`   状态码: ${res.status}`)
    console.log(`   响应: ${JSON.stringify(res.data, null, 2).substring(0, 200)}...`)

    if (res.status === 401) {
      console.log('   ✅ 通过 - 正确返回401未授权')
      passed++
    } else if (res.status === 400 && JSON.stringify(res.data).includes('无效的日志ID')) {
      console.log('   ❌ 失败 - 路由顺序问题！/statistics被/:log_id拦截')
      failed++
    } else {
      console.log('   ❌ 失败 - 预期401，实际' + res.status)
      failed++
    }
  } catch (error) {
    console.log('   ❌ 请求失败:', error.message)
    failed++
  }

  // 如果有token，进行认证测试
  if (ADMIN_TOKEN) {
    // 测试3：认证请求列表接口
    console.log('\n' + '═'.repeat(60))
    console.log('📋 测试3：认证请求审计日志列表')
    console.log('═'.repeat(60))
    try {
      const res = await makeRequest(
        'GET',
        '/api/v4/console/system/audit-logs?page=1&page_size=5',
        ADMIN_TOKEN
      )
      console.log(`   状态码: ${res.status}`)

      if (res.status === 200 && res.data.success) {
        console.log(`   ✅ 通过 - 成功获取审计日志列表`)
        console.log(`   📊 总数: ${res.data.data?.pagination?.total || 'N/A'}`)
        console.log(`   📄 返回: ${res.data.data?.logs?.length || 0} 条记录`)
        passed++
      } else {
        console.log(`   ❌ 失败 - ${res.data.message || '未知错误'}`)
        failed++
      }
    } catch (error) {
      console.log('   ❌ 请求失败:', error.message)
      failed++
    }

    // 测试4：认证请求统计接口
    console.log('\n' + '═'.repeat(60))
    console.log('📋 测试4：认证请求审计日志统计')
    console.log('═'.repeat(60))
    try {
      const res = await makeRequest(
        'GET',
        '/api/v4/console/system/audit-logs/statistics',
        ADMIN_TOKEN
      )
      console.log(`   状态码: ${res.status}`)

      if (res.status === 200 && res.data.success) {
        const stats = res.data.data || {}
        console.log(`   ✅ 通过 - 成功获取审计日志统计`)
        console.log(`   📊 统计数据:`)
        console.log(`      - 总数: ${stats.total || 0}`)
        console.log(`      - 今日: ${stats.today_count || 0}`)
        console.log(`      - 本周: ${stats.week_count || 0}`)
        console.log(`      - 成功: ${stats.success_count || 0}`)
        console.log(`      - 失败: ${stats.failed_count || 0}`)
        passed++
      } else if (res.status === 400 && JSON.stringify(res.data).includes('无效的日志ID')) {
        console.log(`   ❌ 失败 - 路由顺序问题！/statistics被/:log_id拦截`)
        failed++
      } else {
        console.log(`   ❌ 失败 - ${res.data.message || '未知错误'}`)
        console.log(`   响应: ${JSON.stringify(res.data, null, 2)}`)
        failed++
      }
    } catch (error) {
      console.log('   ❌ 请求失败:', error.message)
      failed++
    }

    // 测试5：认证请求详情接口（使用第一条日志）
    console.log('\n' + '═'.repeat(60))
    console.log('📋 测试5：认证请求审计日志详情')
    console.log('═'.repeat(60))
    try {
      // 先获取列表，取第一条日志的ID
      const listRes = await makeRequest(
        'GET',
        '/api/v4/console/system/audit-logs?page=1&page_size=1',
        ADMIN_TOKEN
      )

      if (listRes.status === 200 && listRes.data.success && listRes.data.data?.logs?.length > 0) {
        const firstLog = listRes.data.data.logs[0]
        const logId = firstLog.log_id || firstLog.id

        const res = await makeRequest(
          'GET',
          `/api/v4/console/system/audit-logs/${logId}`,
          ADMIN_TOKEN
        )
        console.log(`   状态码: ${res.status}`)

        if (res.status === 200 && res.data.success) {
          const log = res.data.data?.log || res.data.data
          console.log(`   ✅ 通过 - 成功获取日志详情 (ID: ${logId})`)
          console.log(`   📄 操作类型: ${log?.operation_type || 'N/A'}`)
          console.log(`   📄 目标类型: ${log?.target_type || 'N/A'}`)
          console.log(`   📄 操作时间: ${log?.created_at || 'N/A'}`)
          passed++
        } else {
          console.log(`   ❌ 失败 - ${res.data.message || '未知错误'}`)
          failed++
        }
      } else {
        console.log('   ⚠️ 跳过 - 没有可用的日志记录进行测试')
      }
    } catch (error) {
      console.log('   ❌ 请求失败:', error.message)
      failed++
    }
  } else {
    console.log('\n⚠️ 跳过认证测试（未提供ADMIN_TOKEN）')
    console.log('   使用方法: ADMIN_TOKEN=your_token node scripts/test-audit-logs-api.js')
  }

  // 测试报告
  console.log('\n' + '═'.repeat(60))
  console.log('📊 测试报告')
  console.log('═'.repeat(60))
  console.log(`   ✅ 通过: ${passed}`)
  console.log(`   ❌ 失败: ${failed}`)
  console.log(`   📈 通过率: ${passed > 0 ? ((passed / (passed + failed)) * 100).toFixed(1) : 0}%`)
  console.log('═'.repeat(60))

  if (failed > 0) {
    process.exit(1)
  }
}

// 运行测试
runTests().catch(error => {
  console.error('测试执行失败:', error)
  process.exit(1)
})
