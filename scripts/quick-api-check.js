#!/usr/bin/env node

/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 快速API检查工具
 * 检查V4统一引擎API端点的可用性和响应状态
 * 扩展功能：分析API和测试的一致性
 * 创建时间：2025年01月21日 北京时间
 */

'use strict'

const axios = require('axios')
const fs = require('fs')
// const { getDatabaseHelper } = require('../utils/UnifiedDatabaseHelper') // 暂不使用
const BeijingTimeHelper = require('../utils/timeHelper')

// 基础配置
const BASE_URL = 'http://localhost:3000'
const TIMEOUT = 10000

// V4统一引擎API端点配置
const API_ENDPOINTS = [
  // 系统基础端点
  { name: '系统健康检查', url: '/health', expectStatus: 200 },
  { name: 'V4引擎信息', url: '/api/v4', expectStatus: 200 },
  { name: 'V4 API文档', url: '/api/v4/docs', expectStatus: 200 },

  // V4统一抽奖引擎端点
  { name: 'V4抽奖引擎健康', url: '/api/v4/unified-engine/lottery/health', expectStatus: 200 },
  { name: 'V4抽奖策略', url: '/api/v4/unified-engine/lottery/strategies', expectStatus: 200 },
  { name: 'V4抽奖活动', url: '/api/v4/unified-engine/lottery/campaigns', expectStatus: 200 },

  // V4统一管理引擎端点
  { name: 'V4管理员状态', url: '/api/v4/unified-engine/admin/status', expectStatus: 401 }, // 需要认证
  { name: 'V4管理员仪表板', url: '/api/v4/unified-engine/admin/dashboard', expectStatus: 401 }, // 需要认证

  // 确认废弃路径返回404
  { name: '废弃路径404测试', url: '/api/v3/test', expectStatus: 404 },
  { name: '兼容层404测试', url: '/compatibility-info', expectStatus: 404 }
]

// 需要认证的V4 API端点（使用mock token测试）
const AUTHENTICATED_ENDPOINTS = [
  // V4统一引擎API端点
  {
    method: 'GET',
    url: '/api/v4/unified-engine/lottery/user/profile',
    auth: 'user',
    expectStatus: 200
  },
  {
    method: 'GET',
    url: '/api/v4/unified-engine/admin/status',
    auth: 'admin',
    expectStatus: 200
  }
]

/**
 * 扩展功能：API一致性分析器
 */
class APIConsistencyAnalyzer {
  constructor () {
    this.businessAPIs = new Map()
    this.testAPIs = new Map()
    this.results = {
      businessAPI: { total: 0, byModule: {} },
      testAPI: { total: 0, byModule: {} },
      consistency: { matched: [], missing: [], extra: [] }
    }
  }

  /**
   * 分析实际业务API
   */
  analyzeBusinessAPIs () {
    console.log('🔍 分析实际业务API...')

    const routeFiles = [
      {
        module: 'admin',
        file: 'routes/v4/unified-engine/admin.js',
        basePath: '/api/v4/unified-engine/admin'
      },
      {
        module: 'lottery',
        file: 'routes/v4/unified-engine/lottery.js',
        basePath: '/api/v4/unified-engine/lottery'
      },
      {
        module: 'auth',
        file: 'routes/v4/unified-engine/auth.js',
        basePath: '/api/v4/unified-engine/auth'
      },
      { module: 'permissions', file: 'routes/v4/permissions.js', basePath: '/api/v4/permissions' }
    ]

    routeFiles.forEach(route => {
      if (fs.existsSync(route.file)) {
        const content = fs.readFileSync(route.file, 'utf-8')
        const endpoints = this.extractEndpoints(content, route.basePath)

        this.businessAPIs.set(route.module, endpoints)
        this.results.businessAPI.byModule[route.module] = endpoints.length
        this.results.businessAPI.total += endpoints.length

        console.log(`  📁 ${route.module}: ${endpoints.length} API端点`)
      }
    })
  }

  /**
   * 分析测试API
   */
  analyzeTestAPIs () {
    console.log('🧪 分析测试API...')

    const testFiles = [
      { module: 'admin', file: 'tests/api/admin.api.test.js' },
      { module: 'lottery', file: 'tests/api/lottery.api.test.js' },
      { module: 'auth', file: 'tests/api/auth.api.test.js' },
      { module: 'permissions', file: 'tests/api/v4-permissions.test.js' }
    ]

    testFiles.forEach(test => {
      if (fs.existsSync(test.file)) {
        const content = fs.readFileSync(test.file, 'utf-8')
        const testCases = this.extractTestCases(content)

        this.testAPIs.set(test.module, testCases)
        this.results.testAPI.byModule[test.module] = testCases.length
        this.results.testAPI.total += testCases.length

        console.log(`  🧪 ${test.module}: ${testCases.length} 测试用例`)
      }
    })
  }

  /**
   * 分析一致性
   */
  analyzeConsistency () {
    console.log('📊 分析API与测试一致性...')

    // 检查业务API是否有对应测试
    this.businessAPIs.forEach((endpoints, module) => {
      const testCases = this.testAPIs.get(module) || []

      endpoints.forEach(endpoint => {
        const apiSignature = `${endpoint.method} ${endpoint.path}`
        const hasTest = testCases.some(test => {
          if (!test.method || !test.path) return false
          const testPath = this.normalizeTestPath(test.path)
          const endpointPath = this.normalizeApiPath(endpoint.path)
          return test.method === endpoint.method && testPath.includes(endpointPath)
        })

        if (hasTest) {
          this.results.consistency.matched.push({ module, api: apiSignature, status: '✅ 已覆盖' })
        } else {
          this.results.consistency.missing.push({
            module,
            api: apiSignature,
            status: '❌ 缺失测试'
          })
        }
      })
    })

    // 计算覆盖率
    const coverageRate = (
      (this.results.consistency.matched.length / this.results.businessAPI.total) *
      100
    ).toFixed(1)
    console.log(`📈 测试覆盖率: ${coverageRate}%`)

    return coverageRate
  }

  /**
   * 提取API端点
   */
  extractEndpoints (content, basePath) {
    const endpoints = []
    const routeRegex = /router\.(get|post|put|delete|patch)\(['"`]([^'"`]+)['"`]/g
    let match

    while ((match = routeRegex.exec(content)) !== null) {
      endpoints.push({
        method: match[1].toUpperCase(),
        path: basePath + (match[2].startsWith('/') ? match[2] : '/' + match[2])
      })
    }
    return endpoints
  }

  /**
   * 提取测试用例
   */
  extractTestCases (content) {
    const testCases = []
    const testRegex = /(?:test|it)\(['"`]([^'"`]*(?:GET|POST|PUT|DELETE|PATCH)[^'"`]*?)['"`]/g
    let match

    while ((match = testRegex.exec(content)) !== null) {
      const description = match[1]
      const methodMatch = description.match(/(GET|POST|PUT|DELETE|PATCH)/i)
      const pathMatch = description.match(/\/api\/[^\s,，]+/)

      testCases.push({
        description,
        method: methodMatch ? methodMatch[1].toUpperCase() : null,
        path: pathMatch ? pathMatch[0] : description
      })
    }
    return testCases
  }

  /**
   * 标准化路径
   */
  normalizeApiPath (path) {
    return path
      .replace(/:[^/]+/g, '')
      .replace(/\/+$/, '')
      .toLowerCase()
  }

  normalizeTestPath (path) {
    return path
      .replace(/:[^/]+/g, '')
      .replace(/\/+$/, '')
      .toLowerCase()
  }

  /**
   * 运行完整分析
   */
  async runAnalysis () {
    console.log('\n' + '='.repeat(60))
    console.log('📋 API与测试一致性分析报告')
    console.log('='.repeat(60))

    this.analyzeBusinessAPIs()
    this.analyzeTestAPIs()
    const coverageRate = this.analyzeConsistency()

    console.log('\n📊 统计摘要:')
    console.log(`实际业务API: ${this.results.businessAPI.total} 个`)
    console.log(`测试用例: ${this.results.testAPI.total} 个`)
    console.log(`测试覆盖率: ${coverageRate}%`)

    if (this.results.consistency.missing.length > 0) {
      console.log(`\n❌ 需要补充测试的API (${this.results.consistency.missing.length}个):`)
      this.results.consistency.missing.slice(0, 10).forEach(item => {
        console.log(`  [${item.module}] ${item.api}`)
      })
      if (this.results.consistency.missing.length > 10) {
        console.log(`  ... 还有 ${this.results.consistency.missing.length - 10} 个`)
      }
    }

    return this.results
  }
}

/**
 * 检查单个API端点
 */
async function checkEndpoint (endpoint) {
  const startTime = Date.now()

  try {
    const response = await axios({
      method: 'GET',
      url: `${BASE_URL}${endpoint.url}`,
      timeout: TIMEOUT,
      validateStatus: () => true // 接受所有状态码
    })

    const responseTime = Date.now() - startTime
    const success = response.status === endpoint.expectStatus

    console.log(`${success ? '✅' : '❌'} ${endpoint.name}: ${response.status} (${responseTime}ms)`)

    return { success, status: response.status, responseTime, endpoint }
  } catch (error) {
    const responseTime = Date.now() - startTime
    console.log(`❌ ${endpoint.name}: 连接失败 (${responseTime}ms) - ${error.message}`)
    return { success: false, status: 'ERROR', responseTime, endpoint, error: error.message }
  }
}

/**
 * 检查需要认证的API端点
 */
async function checkAuthenticatedEndpoint (endpoint, token) {
  const startTime = Date.now()

  try {
    const response = await axios({
      method: endpoint.method || 'GET',
      url: `${BASE_URL}${endpoint.url}`,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: TIMEOUT,
      validateStatus: () => true
    })

    const responseTime = Date.now() - startTime
    const success = response.status === endpoint.expectStatus

    console.log(
      `${success ? '✅' : '❌'} ${endpoint.url} (${endpoint.auth}): ${response.status} (${responseTime}ms)`
    )

    return { success, status: response.status, responseTime, endpoint }
  } catch (error) {
    const responseTime = Date.now() - startTime
    console.log(`❌ ${endpoint.url}: 连接失败 (${responseTime}ms) - ${error.message}`)
    return { success: false, status: 'ERROR', responseTime, endpoint, error: error.message }
  }
}

/**
 * 执行完整的API检查
 */
async function runQuickAPICheck () {
  console.log('🚀 餐厅积分抽奖系统 V4.0 - 快速API检查')
  console.log(`🕐 检查时间: ${BeijingTimeHelper.nowLocale()}`)
  console.log(`🌐 目标服务器: ${BASE_URL}`)
  console.log('='.repeat(60))

  const results = []

  // 1. 基础端点检查
  console.log('\n📡 基础API端点检查:')
  for (const endpoint of API_ENDPOINTS) {
    const result = await checkEndpoint(endpoint)
    results.push(result)
  }

  // 2. 需要认证的端点检查（🔴 注意：使用测试token仅验证路由可达性，不进行真实业务操作）
  console.log('\n🔐 认证API端点检查:')
  const mockToken = 'test_token_for_route_checking' // 🔴 仅用于路由可达性测试，非真实认证
  for (const endpoint of AUTHENTICATED_ENDPOINTS) {
    const result = await checkAuthenticatedEndpoint(endpoint, mockToken)
    results.push(result)
  }

  // 3. API一致性分析
  const analyzer = new APIConsistencyAnalyzer()
  await analyzer.runAnalysis()

  // 4. 生成总结报告
  console.log('\n' + '='.repeat(60))
  console.log('📊 检查结果总结')
  console.log('='.repeat(60))

  const successCount = results.filter(r => r.success).length
  const totalCount = results.length
  const successRate = ((successCount / totalCount) * 100).toFixed(1)

  console.log(`✅ 成功: ${successCount}/${totalCount} (${successRate}%)`)
  console.log(`❌ 失败: ${totalCount - successCount}/${totalCount}`)
  console.log(
    `⏱️ 平均响应时间: ${(results.reduce((sum, r) => sum + r.responseTime, 0) / totalCount).toFixed(0)}ms`
  )

  if (successRate < 80) {
    console.log('\n⚠️ 警告: 成功率低于80%，建议检查服务状态')
    process.exit(1)
  } else {
    console.log('\n🎉 API检查完成，服务运行正常')
  }

  return results
}

// 主程序入口
if (require.main === module) {
  runQuickAPICheck().catch(error => {
    console.error('💥 API检查失败:', error.message)
    process.exit(1)
  })
}

module.exports = { runQuickAPICheck, APIConsistencyAnalyzer }
