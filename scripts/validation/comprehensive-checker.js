/**
 * 全面API完整性检查器
 * 实际HTTP测试所有后端API端点
 *
 * @author Restaurant Points System
 * @date 2025-11-23
 */

const fs = require('fs')
const path = require('path')
const axios = require('axios')

const BASE_URL = 'http://localhost:3000'
const TEST_ADMIN = { mobile: '13612227930', verification_code: '123456' }

class ComprehensiveChecker {
  constructor () {
    this.backendAPIs = []
    this.frontendAPIs = []
    this.testResults = []
    this.token = null
  }

  /**
   * 扫描所有后端路由文件
   */
  scanBackendRoutes (routesDir) {
    console.log('🔍 扫描后端路由文件...\n')

    this.scanDirectory(routesDir)

    console.log(`\n扫描完成: 发现 ${this.backendAPIs.length} 个后端API端点\n`)
    return this.backendAPIs
  }

  /**
   * 递归扫描目录
   */
  scanDirectory (dir) {
    if (!fs.existsSync(dir)) return

    const files = fs.readdirSync(dir)

    files.forEach(file => {
      const filePath = path.join(dir, file)
      const stat = fs.statSync(filePath)

      if (stat.isDirectory()) {
        this.scanDirectory(filePath)
      } else if (file.endsWith('.js') && !file.includes('test')) {
        this.parseRouteFile(filePath)
      }
    })
  }

  /**
   * 解析路由文件
   */
  parseRouteFile (filePath) {
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split('\n')

    // 提取router.METHOD(...)
    const routePattern = /router\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g
    let match

    while ((match = routePattern.exec(content)) !== null) {
      const [, method, routePath] = match
      const lineNumber = content.substring(0, match.index).split('\n').length

      // 提取注释中的完整路由路径
      const fullPath = this.extractFullPathFromComment(lines, lineNumber)

      this.backendAPIs.push({
        method: method.toUpperCase(),
        routePath,
        fullPath: fullPath || this.guessFullPath(filePath, routePath),
        file: filePath.replace(process.cwd(), '.'),
        line: lineNumber
      })
    }
  }

  /**
   * 从JSDoc注释提取完整路径
   */
  extractFullPathFromComment (lines, lineNumber) {
    // 向上查找最近的@route注释
    for (let i = lineNumber - 1; i >= Math.max(0, lineNumber - 30); i--) {
      const line = lines[i]
      const match = line.match(/@route\s+(GET|POST|PUT|DELETE|PATCH)\s+(\/[^\s]+)/)
      if (match) {
        return match[2]
      }
    }
    return null
  }

  /**
   * 根据文件路径推断完整API路径
   */
  guessFullPath (filePath, routePath) {
    // 从app.js的注册信息推断
    const appContent = fs.readFileSync(path.resolve(__dirname, '../../app.js'), 'utf8')
    
    // 提取文件对应的基础路径
    const relativePath = filePath.replace(process.cwd(), '.').replace(/\\/g, '/')
    const requirePath = relativePath.replace('./', '')

    // 查找app.use注册
    const usePattern = new RegExp(`app\\.use\\(['"]([^'"]+)['"],\\s*require\\(['"]${requirePath.replace('.js', '')}`, 'g')
    const useMatch = usePattern.exec(appContent)

    if (useMatch) {
      const basePath = useMatch[1]
      return routePath === '/' ? basePath : `${basePath}${routePath}`
    }

    // 处理嵌套路由
    if (filePath.includes('admin/')) {
      const subPath = filePath.match(/admin\/(\w+)\.js/)
      if (subPath) {
        const moduleName = subPath[1].replace(/_/g, '-')
        return routePath === '/' 
          ? `/api/v4/admin/${moduleName}`
          : `/api/v4/admin/${moduleName}${routePath}`
      }
    }

    return routePath
  }

  /**
   * 扫描前端API调用
   */
  scanFrontendAPIs (publicDir) {
    console.log('🔍 扫描前端API调用...\n')

    this.scanFrontendDirectory(publicDir)

    console.log(`\n扫描完成: 发现 ${this.frontendAPIs.length} 个前端API调用\n`)
    return this.frontendAPIs
  }

  /**
   * 扫描前端目录
   */
  scanFrontendDirectory (dir) {
    if (!fs.existsSync(dir)) return

    const files = fs.readdirSync(dir)

    files.forEach(file => {
      const filePath = path.join(dir, file)
      const stat = fs.statSync(filePath)

      if (stat.isDirectory()) {
        this.scanFrontendDirectory(filePath)
      } else if (file.endsWith('.html') || file.endsWith('.js')) {
        this.parseFrontendFile(filePath)
      }
    })
  }

  /**
   * 解析前端文件
   */
  parseFrontendFile (filePath) {
    const content = fs.readFileSync(filePath, 'utf8')

    // API调用模式
    const patterns = [
      /apiRequest\s*\(\s*['"`]([^'"`?]+)/g,
      /fetch\s*\(\s*['"`]([^'"`?]+)/g,
      /axios\.(get|post|put|delete)\s*\(\s*['"`]([^'"`?]+)/g
    ]

    patterns.forEach(pattern => {
      let match
      while ((match = pattern.exec(content)) !== null) {
        const apiPath = match[match.length - 1]
        
        if (apiPath.startsWith('/api/')) {
          this.frontendAPIs.push({
            path: apiPath,
            file: filePath.replace(process.cwd(), '.'),
            line: content.substring(0, match.index).split('\n').length
          })
        }
      }
    })
  }

  /**
   * 登录获取Token
   */
  async login () {
    try {
      const response = await axios.post(`${BASE_URL}/api/v4/auth/login`, TEST_ADMIN)
      this.token = response.data.data.access_token
      console.log('✅ 登录成功\n')
      return true
    } catch (error) {
      console.error('❌ 登录失败:', error.message)
      return false
    }
  }

  /**
   * 实际测试所有后端API
   */
  async testAllAPIs () {
    console.log('🧪 开始实际HTTP测试所有API...\n')

    const headers = { Authorization: `Bearer ${this.token}` }

    // 去重
    const uniqueAPIs = this.deduplicateAPIs(this.backendAPIs)
    
    console.log(`需要测试的API: ${uniqueAPIs.length} 个\n`)

    for (const api of uniqueAPIs) {
      await this.testSingleAPI(api, headers)
    }

    return this.testResults
  }

  /**
   * 去重API
   */
  deduplicateAPIs (apis) {
    const seen = new Map()
    
    apis.forEach(api => {
      const key = `${api.method}:${api.fullPath}`
      if (!seen.has(key)) {
        seen.set(key, api)
      }
    })

    return Array.from(seen.values())
  }

  /**
   * 测试单个API
   */
  async testSingleAPI (api, headers) {
    // 跳过包含参数占位符的路径
    if (api.fullPath.includes(':') || api.fullPath.includes('${')) {
      this.testResults.push({
        ...api,
        status: 'SKIP',
        reason: '包含路径参数'
      })
      return
    }

    try {
      let response
      const url = `${BASE_URL}${api.fullPath}`

      if (api.method === 'GET') {
        response = await axios.get(url, { headers, timeout: 5000 })
      } else if (api.method === 'POST') {
        response = await axios.post(url, {}, { headers, timeout: 5000 })
      } else if (api.method === 'PUT') {
        response = await axios.put(url, {}, { headers, timeout: 5000 })
      } else if (api.method === 'DELETE') {
        response = await axios.delete(url, { headers, timeout: 5000 })
      }

      this.testResults.push({
        ...api,
        status: 'SUCCESS',
        httpStatus: response.status,
        message: response.data.message
      })

      console.log(`✅ ${api.method.padEnd(6)} ${api.fullPath}`)

    } catch (error) {
      const httpStatus = error.response?.status
      const errorCode = error.response?.data?.code || error.code

      this.testResults.push({
        ...api,
        status: httpStatus === 404 ? 'NOT_FOUND' : 'ERROR',
        httpStatus,
        errorCode,
        message: error.response?.data?.message || error.message
      })

      if (httpStatus === 404) {
        console.log(`❌ ${api.method.padEnd(6)} ${api.fullPath} (404 - 未实现)`)
      } else if (httpStatus >= 400 && httpStatus < 500) {
        console.log(`⚠️  ${api.method.padEnd(6)} ${api.fullPath} (${httpStatus} - 客户端错误)`)
      } else if (error.code === 'ECONNREFUSED') {
        console.log(`❌ ${api.method.padEnd(6)} ${api.fullPath} (服务未启动)`)
      }
    }

    // 避免请求过快
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  /**
   * 生成详细报告
   */
  generateReport () {
    console.log('\n' + '='.repeat(70))
    console.log('📊 API完整性检查报告')
    console.log('='.repeat(70))

    const summary = {
      total: this.testResults.length,
      success: this.testResults.filter(r => r.status === 'SUCCESS').length,
      notFound: this.testResults.filter(r => r.status === 'NOT_FOUND').length,
      error: this.testResults.filter(r => r.status === 'ERROR').length,
      skip: this.testResults.filter(r => r.status === 'SKIP').length
    }

    console.log(`\n总计: ${summary.total} 个API`)
    console.log(`  ✅ 成功: ${summary.success} 个`)
    console.log(`  ❌ 404未找到: ${summary.notFound} 个`)
    console.log(`  ⚠️  其他错误: ${summary.error} 个`)
    console.log(`  ⏭️  跳过（含参数）: ${summary.skip} 个`)
    console.log(`\n成功率: ${((summary.success / (summary.total - summary.skip)) * 100).toFixed(1)}%`)

    // 404 API详情
    const notFoundAPIs = this.testResults.filter(r => r.status === 'NOT_FOUND')
    if (notFoundAPIs.length > 0) {
      console.log('\n❌ 404未找到的API:')
      notFoundAPIs.forEach(api => {
        console.log(`  ${api.method} ${api.fullPath}`)
        console.log(`     文件: ${api.file}:${api.line}`)
      })
    }

    // 保存JSON报告
    const reportPath = path.resolve(__dirname, '../../docs/comprehensive-check-report.json')
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      summary,
      results: this.testResults
    }, null, 2))

    console.log(`\n✅ 详细报告已保存: ${reportPath}`)
    console.log('='.repeat(70))

    return summary
  }

  /**
   * 执行完整检查流程
   */
  async run () {
    console.log('🚀 开始全面API完整性检查\n')
    console.log('='.repeat(70))

    // 1. 扫描后端
    this.scanBackendRoutes(path.resolve(__dirname, '../../routes'))

    // 2. 扫描前端
    this.scanFrontendAPIs(path.resolve(__dirname, '../../public'))

    // 3. 登录
    const loginSuccess = await this.login()
    if (!loginSuccess) {
      console.error('❌ 无法登录，测试中止')
      return
    }

    // 4. 测试所有API
    await this.testAllAPIs()

    // 5. 生成报告
    const summary = this.generateReport()

    return summary
  }
}

// 命令行执行
if (require.main === module) {
  const checker = new ComprehensiveChecker()
  
  checker.run().then(summary => {
    if (summary && summary.notFound > 0) {
      console.error('\n❌ 发现API缺失问题')
      process.exit(1)
    }
    console.log('\n✅ 检查完成')
    process.exit(0)
  }).catch(error => {
    console.error('❌ 检查失败:', error)
    process.exit(1)
  })
}

module.exports = ComprehensiveChecker

