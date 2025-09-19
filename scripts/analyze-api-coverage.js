#!/usr/bin/env node
/**
 * API覆盖率分析脚本
 * 统计实际业务API和测试API的数量，检查一致性
 */

const fs = require('fs')
const path = require('path')
const glob = require('glob')

class APIAnalyzer {
  constructor () {
    this.businessAPIs = []
    this.testAPIs = []
    this.apiRoutes = new Map()
    this.testCases = new Map()
  }

  // 分析路由文件中的API端点
  analyzeRouteFiles () {
    console.log('🔍 分析业务API路由文件...')

    // V4路由文件
    const routeFiles = [
      'routes/v4/permissions.js',
      'routes/v4/unified-engine/auth.js',
      'routes/v4/unified-engine/admin.js',
      'routes/v4/unified-engine/lottery.js'
    ]

    for (const routeFile of routeFiles) {
      if (fs.existsSync(routeFile)) {
        this.extractAPIsFromFile(routeFile, 'business')
      }
    }
  }

  // 分析测试文件中的API测试
  analyzeTestFiles () {
    console.log('🧪 分析API测试文件...')

    const testFiles = glob.sync('tests/**/*.test.js')

    for (const testFile of testFiles) {
      this.extractTestsFromFile(testFile)
    }
  }

  // 从文件中提取API端点
  extractAPIsFromFile (filePath, type) {
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      const module = path.basename(filePath, '.js')

      // 匹配路由定义
      const routeRegex = /router\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g
      const matches = [...content.matchAll(routeRegex)]

      for (const match of matches) {
        const [, method, route] = match
        const fullRoute = this.buildFullRoute(filePath, route)

        const apiInfo = {
          method: method.toUpperCase(),
          route: fullRoute,
          module,
          file: filePath,
          type
        }

        if (type === 'business') {
          this.businessAPIs.push(apiInfo)
          this.apiRoutes.set(`${method.toUpperCase()} ${fullRoute}`, apiInfo)
        }
      }
    } catch (error) {
      console.warn(`⚠️ 无法读取文件 ${filePath}: ${error.message}`)
    }
  }

  // 从测试文件中提取测试用例
  extractTestsFromFile (filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8')

      // 匹配HTTP请求测试
      const testRegex = /\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g
      const matches = [...content.matchAll(testRegex)]

      for (const match of matches) {
        const [, method, route] = match

        const testInfo = {
          method: method.toUpperCase(),
          route,
          file: filePath,
          type: 'test'
        }

        this.testAPIs.push(testInfo)
        const key = `${method.toUpperCase()} ${route}`
        if (!this.testCases.has(key)) {
          this.testCases.set(key, [])
        }
        this.testCases.get(key).push(testInfo)
      }
    } catch (error) {
      console.warn(`⚠️ 无法读取测试文件 ${filePath}: ${error.message}`)
    }
  }

  // 构建完整的路由路径
  buildFullRoute (filePath, route) {
    const baseMapping = {
      'routes/v4/permissions.js': '/api/v4/permissions',
      'routes/v4/unified-engine/auth.js': '/api/v4/unified-engine/auth',
      'routes/v4/unified-engine/admin.js': '/api/v4/unified-engine/admin',
      'routes/v4/unified-engine/lottery.js': '/api/v4/unified-engine/lottery'
    }

    const basePath = baseMapping[filePath] || ''
    return basePath + route
  }

  // 分析覆盖率
  analyzeCoverage () {
    console.log('\n📊 API覆盖率分析')
    console.log('=' * 50)

    const _coveredAPIs = []
    const uncoveredAPIs = []

    for (const [apiKey, apiInfo] of this.apiRoutes) {
      const testExists = this.testCases.has(apiKey) || this.hasPartialMatch(apiKey)

      if (testExists) {
        _coveredAPIs.push(apiInfo)
      } else {
        uncoveredAPIs.push(apiInfo)
      }
    }

    const coverageRate = ((_coveredAPIs.length / this.businessAPIs.length) * 100).toFixed(2)

    console.log(`📈 总业务API数量: ${this.businessAPIs.length}`)
    console.log(`🧪 总测试API数量: ${this.testAPIs.length}`)
    console.log(`✅ 已覆盖API数量: ${_coveredAPIs.length}`)
    console.log(`❌ 未覆盖API数量: ${uncoveredAPIs.length}`)
    console.log(`📊 API测试覆盖率: ${coverageRate}%`)

    return { coveredAPIs: _coveredAPIs, uncoveredAPIs, coverageRate }
  }

  // 检查部分匹配（路径参数等）
  hasPartialMatch (apiKey) {
    const [method, route] = apiKey.split(' ')

    for (const [testKey] of this.testCases) {
      const [testMethod, testRoute] = testKey.split(' ')

      if (method === testMethod) {
        // 处理路径参数匹配 /user/:id 与 /user/123
        const routePattern = route.replace(/:[^/]+/g, '[^/]+')
        const testPattern = testRoute.replace(/:[^/]+/g, '[^/]+')

        if (new RegExp(routePattern).test(testRoute) || new RegExp(testPattern).test(route)) {
          return true
        }
      }
    }

    return false
  }

  // 生成详细报告
  generateDetailedReport () {
    console.log('\n📋 详细API分析报告')
    console.log('=' * 60)

    // 按模块分组
    const moduleGroups = {}
    for (const api of this.businessAPIs) {
      if (!moduleGroups[api.module]) {
        moduleGroups[api.module] = []
      }
      moduleGroups[api.module].push(api)
    }

    for (const [module, apis] of Object.entries(moduleGroups)) {
      console.log(`\n📦 模块: ${module} (${apis.length} APIs)`)

      for (const api of apis) {
        const key = `${api.method} ${api.route}`
        const hasCoverage = this.testCases.has(key) || this.hasPartialMatch(key)
        const status = hasCoverage ? '✅' : '❌'

        console.log(`  ${status} ${api.method.padEnd(6)} ${api.route}`)
      }
    }
  }

  // 检查不一致的API
  checkInconsistencies () {
    console.log('\n🔍 检查API一致性问题')
    console.log('=' * 40)

    const issues = []

    // 检查测试中是否有业务代码中不存在的API
    for (const [testKey] of this.testCases) {
      if (!this.apiRoutes.has(testKey) && !this.hasBusinessMatch(testKey)) {
        issues.push({
          type: 'ORPHAN_TEST',
          api: testKey,
          description: '测试中存在但业务代码中不存在的API'
        })
      }
    }

    if (issues.length > 0) {
      console.log('⚠️  发现的一致性问题:')
      issues.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${issue.type}: ${issue.api}`)
        console.log(`     ${issue.description}`)
      })
    } else {
      console.log('✅ 未发现明显的一致性问题')
    }

    return issues
  }

  // 检查业务代码是否匹配
  hasBusinessMatch (testKey) {
    const [method, route] = testKey.split(' ')

    for (const [businessKey] of this.apiRoutes) {
      const [businessMethod, businessRoute] = businessKey.split(' ')

      if (method === businessMethod) {
        const routePattern = businessRoute.replace(/:[^/]+/g, '[^/]+')
        const testPattern = route.replace(/:[^/]+/g, '[^/]+')

        if (new RegExp(routePattern).test(route) || new RegExp(testPattern).test(businessRoute)) {
          return true
        }
      }
    }

    return false
  }

  // 生成改进建议
  generateRecommendations (uncoveredAPIs, issues) {
    console.log('\n💡 改进建议')
    console.log('=' * 30)

    if (uncoveredAPIs.length > 0) {
      console.log('\n🎯 需要添加测试的API:')
      uncoveredAPIs.forEach((api, index) => {
        console.log(`  ${index + 1}. ${api.method} ${api.route} (模块: ${api.module})`)
      })
    }

    if (issues.length > 0) {
      console.log('\n🔧 需要修复的一致性问题:')
      issues.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${issue.description}: ${issue.api}`)
      })
    }

    console.log('\n📝 建议采取的行动:')
    console.log('  1. 为未覆盖的API添加测试用例')
    console.log('  2. 修复测试与业务代码不一致的问题')
    console.log('  3. 定期运行此脚本检查API覆盖率')
    console.log('  4. 在CI/CD流程中集成API覆盖率检查')
  }

  // 主执行方法
  async run () {
    console.log('🚀 开始API覆盖率分析...\n')

    this.analyzeRouteFiles()
    this.analyzeTestFiles()

    const { coveredAPIs, uncoveredAPIs, coverageRate } = this.analyzeCoverage()
    this.generateDetailedReport()
    const issues = this.checkInconsistencies()
    this.generateRecommendations(uncoveredAPIs, issues)

    console.log('\n✅ API覆盖率分析完成')

    return {
      businessAPICount: this.businessAPIs.length,
      testAPICount: this.testAPIs.length,
      coverageRate: parseFloat(coverageRate),
      uncoveredAPIs,
      issues
    }
  }
}

if (require.main === module) {
  const analyzer = new APIAnalyzer()
  analyzer.run().catch(error => {
    console.error('❌ 分析失败:', error)
    process.exit(1)
  })
}

module.exports = APIAnalyzer
