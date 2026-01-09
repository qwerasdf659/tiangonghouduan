#!/usr/bin/env node
/**
 * 测试资产管理相关API返回格式
 * 用于诊断前端数据解析问题
 */

const http = require('http')

// 测试配置
const BASE_URL = 'http://localhost:3000'
const TEST_ADMIN_TOKEN =
  process.env.ADMIN_TOKEN ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3Mzc0NTcxMjYsImV4cCI6MTczODA2MTkyNn0.placeholder'

/**
 * 发送HTTP请求
 */
function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL)

    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_ADMIN_TOKEN}`,
        ...options.headers
      }
    }

    const req = http.request(reqOptions, res => {
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

    if (options.body) {
      req.write(options.body)
    }

    req.end()
  })
}

/**
 * 分析API响应结构
 */
function analyzeResponse(name, response) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`📡 API: ${name}`)
  console.log(`${'='.repeat(60)}`)
  console.log(`HTTP状态: ${response.status}`)

  const data = response.data

  if (data.success !== undefined) {
    console.log(`✅ success: ${data.success}`)
    console.log(`📝 message: ${data.message || '无'}`)
    console.log(`🔑 code: ${data.code || '无'}`)

    if (data.data) {
      console.log(`\n📦 data 结构:`)
      console.log(`   类型: ${Array.isArray(data.data) ? 'Array' : typeof data.data}`)

      if (Array.isArray(data.data)) {
        console.log(`   长度: ${data.data.length}`)
        if (data.data.length > 0) {
          console.log(`   第一项字段: ${Object.keys(data.data[0]).join(', ')}`)
        }
      } else if (typeof data.data === 'object') {
        console.log(`   字段: ${Object.keys(data.data).join(', ')}`)

        // 检查常见的嵌套数组字段
        Object.entries(data.data).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            console.log(`   📋 ${key}: Array[${value.length}]`)
            if (value.length > 0) {
              console.log(`      第一项字段: ${Object.keys(value[0]).join(', ')}`)
            }
          }
        })
      }
    } else {
      console.log(`\n📦 data: null/undefined`)
    }
  } else {
    console.log(`⚠️ 非标准响应格式:`)
    console.log(JSON.stringify(data, null, 2).substring(0, 500))
  }
}

/**
 * 测试所有相关API
 */
async function runTests() {
  console.log('🚀 开始测试资产管理相关API...\n')
  console.log(`⏰ 测试时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
  console.log(`🔗 服务地址: ${BASE_URL}`)

  const apis = [
    {
      name: '材料资产类型列表 (console)',
      path: '/api/v4/console/material/asset-types'
    },
    {
      name: '资产调整可用类型',
      path: '/api/v4/console/asset-adjustment/asset-types'
    },
    {
      name: '材料转换规则列表',
      path: '/api/v4/console/material/conversion-rules'
    },
    {
      name: '材料流水记录',
      path: '/api/v4/console/material/transactions'
    },
    {
      name: '健康检查',
      path: '/health'
    }
  ]

  for (const api of apis) {
    try {
      const response = await makeRequest(api.path)
      analyzeResponse(api.name, response)
    } catch (error) {
      console.log(`\n❌ ${api.name}: 请求失败 - ${error.message}`)
    }
  }

  // 总结
  console.log(`\n${'='.repeat(60)}`)
  console.log('📊 测试总结')
  console.log(`${'='.repeat(60)}`)
  console.log(`
🔍 前端数据解析建议：

1. /api/v4/console/material/asset-types
   后端返回: { success, data: { asset_types: [...] } }
   前端应该: response.data.asset_types

2. /api/v4/console/asset-adjustment/asset-types
   后端返回: { success, data: { asset_types: [...], total } }
   前端应该: response.data.asset_types

3. /api/v4/console/material/conversion-rules
   后端返回: { success, data: { rules: [...] } }
   前端应该: response.data.rules

4. /api/v4/console/material/transactions
   后端返回: { success, data: { transactions: [...], pagination } }
   前端应该: response.data.transactions
`)
}

// 执行测试
runTests().catch(error => {
  console.error('测试执行失败:', error)
  process.exit(1)
})
