/**
 * 全面API完整性检查器
 * 实际HTTP测试所有后端API端点
 *
 * 核心功能：
 * - 静态分析路由文件，构建完整路由映射表
 * - 递归解析嵌套路由结构（app.js → index.js → 子路由）
 * - 准确推断每个端点的完整 API 路径
 * - 实际 HTTP 测试所有端点的可达性
 *
 * @author Restaurant Points System
 * @date 2025-11-23
 * @updated 2026-01-09 - 修复路由路径推断问题，消除误报 404
 */

const fs = require('fs')
const path = require('path')
const axios = require('axios')

/** API 基础 URL */
const BASE_URL = 'http://localhost:3000'

/** 测试用管理员账号 */
const TEST_ADMIN = { mobile: '13612227930', verification_code: '123456' }

/**
 * 路由映射表 - 基于 app.js 实际注册的路由结构
 * 格式：{ 目录路径: API 前缀 }
 *
 * 📌 此映射表直接反映 app.js 中的路由注册，是准确推断路径的关键
 */
const ROUTE_PREFIX_MAP = {
  // 主路由注册（来自 app.js）
  'routes/v4/auth': '/api/v4/auth',
  'routes/v4/auth/permissions': '/api/v4/permissions', // 独立挂载（解决冲突）
  'routes/v4/console': '/api/v4/console',
  'routes/v4/lottery': '/api/v4/lottery',
  'routes/v4/market': '/api/v4/market',
  'routes/v4/shop': '/api/v4/shop',
  'routes/v4/system': '/api/v4/system',
  'routes/v4/user': '/api/v4/user',
  'routes/v4/assets': '/api/v4/assets',
  'routes/v4/backpack': '/api/v4/backpack',
  'routes/v4/merchant-points': '/api/v4/merchant-points',
  'routes/v4/activities': '/api/v4/activities',
  'routes/v4/debug-control': '/api/v4/debug-control'
}

/**
 * 子路由挂载映射表 - 基于各 index.js 的实际挂载
 * 格式：{ 父目录: { 子模块文件名: 挂载路径 } }
 *
 * 📌 处理多级嵌套路由的路径计算
 * 📌 2026-01-09 更新：根据实际 index.js 挂载配置修复路径映射
 */
const SUB_ROUTE_MAP = {
  // console 子模块（来自 routes/v4/console/index.js）
  'routes/v4/console': {
    auth: '/auth',
    system: '/system',
    config: '/config',
    settings: '', // 挂载到根路径
    prize_pool: '/prize-pool',
    user_management: '/user-management',
    'lottery-management': '/lottery-management',
    analytics: '/analytics',
    'customer-service': '/customer-service',
    marketplace: '/marketplace',
    material: '/material',
    'popup-banners': '/popup-banners',
    'lottery-quota': '/lottery-quota',
    'asset-adjustment': '/asset-adjustment',
    'campaign-budget': '/campaign-budget',
    assets: '/assets',
    images: '/images',
    'orphan-frozen': '/orphan-frozen',
    'merchant-points': '/merchant-points',
    'user-hierarchy': '/user-hierarchy'
  },
  // auth 子模块（来自 routes/v4/auth/index.js）
  'routes/v4/auth': {
    login: '', // router.use('/', loginRoutes)
    token: '', // router.use('/', tokenRoutes)
    profile: '' // router.use('/', profileRoutes)
  },
  // assets 子模块（用户端 /api/v4/assets）
  'routes/v4/assets': {
    balance: '',
    transactions: ''
  },
  // shop 子模块
  'routes/v4/shop': {
    consumption: '/consumption',
    exchange: '/exchange',
    premium: '/premium',
    redemption: '/redemption',
    assets: '/assets'
  },
  // market 子模块
  'routes/v4/market': {
    sell: '',
    buy: '',
    'fungible-assets': '/fungible-assets',
    orders: '/orders',
    history: '/history'
  },
  // lottery 子模块（来自 routes/v4/lottery/index.js）
  // 📌 lottery-preset 挂载在 /preset，不是 /lottery-preset
  'routes/v4/lottery': {
    prizes: '', // router.use('/', prizesRoutes)
    draw: '', // router.use('/', drawRoutes)
    history: '', // router.use('/', historyRoutes)
    'user-points': '', // router.use('/', userPointsRoutes)
    'lottery-preset': '/preset' // router.use('/preset', lotteryPresetRoutes)
  },
  // system 子模块（来自 routes/v4/system/index.js）
  // 📌 大部分挂载在根路径 '/'，只有 statistics 和 notifications 有子路径
  'routes/v4/system': {
    announcements: '', // router.use('/', announcementsRoutes)
    chat: '', // router.use('/', chatRoutes) - 路径是 /chat/*
    feedback: '', // router.use('/', feedbackRoutes)
    notifications: '/notifications', // router.use('/notifications', notificationsRoutes)
    'popup-banners': '', // router.use('/', popupBannersRoutes)
    statistics: '/statistics', // router.use('/statistics', statisticsRoutes)
    status: '', // router.use('/', statusRoutes)
    'user-stats': '' // router.use('/', userStatsRoutes)
  },
  // backpack 子模块
  'routes/v4/backpack': {
    index: ''
  },
  // user 子模块
  'routes/v4/user': {
    index: ''
  },
  // console/system 子模块（来自 routes/v4/console/system/index.js）
  // 📌 monitoring 挂载在根路径，announcements/feedbacks/audit-logs 有子路径
  'routes/v4/console/system': {
    announcements: '/announcements', // router.use('/announcements', announcementsRoutes)
    'audit-logs': '/audit-logs', // router.use('/audit-logs', auditLogsRoutes)
    feedbacks: '/feedbacks', // router.use('/feedbacks', feedbacksRoutes)
    monitoring: '' // router.use('/', monitoringRoutes) - 包含 /status, /dashboard, /management-status
  },
  // console/analytics 子模块
  'routes/v4/console/analytics': {
    index: '',
    decisions: '/decisions',
    lottery: '/lottery',
    performance: '/performance'
  },
  // console/customer-service 子模块
  'routes/v4/console/customer-service': {
    index: '',
    sessions: '/sessions',
    messages: '/messages'
  },
  // console/assets 子模块（来自 routes/v4/console/assets/index.js）
  // 📌 portfolio 挂载在根路径 '/'，transactions 挂载在 '/transactions'
  'routes/v4/console/assets': {
    index: '',
    portfolio: '', // router.use('/', portfolioRoutes) - 路径是 /portfolio/*
    transactions: '/transactions' // router.use('/transactions', transactionsRoutes)
  },
  // shop/consumption 子模块（来自 routes/v4/shop/consumption/index.js）
  // 📌 所有子模块都挂载在根路径 '/'
  'routes/v4/shop/consumption': {
    index: '',
    submit: '', // router.use('/', submitRoutes)
    query: '', // router.use('/', queryRoutes)
    review: '', // router.use('/', reviewRoutes)
    qrcode: '' // router.use('/', qrcodeRoutes) - 路径是 /qrcode/*
  },
  // shop/exchange 子模块
  'routes/v4/shop/exchange': {
    index: '',
    exchange: '',
    items: '',
    orders: '',
    statistics: ''
  },
  // shop/redemption 子模块（来自 routes/v4/shop/redemption/index.js）
  // 📌 所有子模块都挂载在根路径 '/'
  'routes/v4/shop/redemption': {
    index: '',
    orders: '', // router.use('/', ordersRoutes) - POST /orders
    fulfill: '', // router.use('/', fulfillRoutes) - POST /fulfill
    query: '' // router.use('/', queryRoutes)
  },
  // shop/assets 子模块
  'routes/v4/shop/assets': {
    index: '',
    convert: '',
    balance: '',
    transactions: '',
    rules: ''
  }
}

class ComprehensiveChecker {
  constructor() {
    /** @type {Array<{method: string, routePath: string, fullPath: string, file: string, line: number}>} */
    this.backendAPIs = []
    /** @type {Array<{path: string, file: string, line: number}>} */
    this.frontendAPIs = []
    /** @type {Array<Object>} */
    this.testResults = []
    /** @type {string|null} */
    this.token = null
  }

  /**
   * 扫描所有后端路由文件
   * @param {string} routesDir - 路由目录路径
   * @returns {Array} 后端 API 列表
   */
  scanBackendRoutes(routesDir) {
    console.log('🔍 扫描后端路由文件...\n')

    this.scanDirectory(routesDir)

    console.log(`\n扫描完成: 发现 ${this.backendAPIs.length} 个后端API端点\n`)
    return this.backendAPIs
  }

  /**
   * 递归扫描目录
   * @param {string} dir - 目录路径
   */
  scanDirectory(dir) {
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
   * 解析路由文件，提取所有路由端点
   * @param {string} filePath - 文件路径
   */
  parseRouteFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split('\n')

    // 提取 router.METHOD('path', ...) 格式的路由定义
    const routePattern = /router\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g
    let match

    while ((match = routePattern.exec(content)) !== null) {
      const [, method, routePath] = match
      const lineNumber = content.substring(0, match.index).split('\n').length

      // 📌 2026-01-09 修复：优先使用计算路径，JSDoc 注释可能已过时
      // 基于实际挂载结构计算的路径更准确
      const calculatedPath = this.calculateFullPath(filePath, routePath)

      // JSDoc 注释仅作为参考，如果与计算路径不一致则忽略
      const commentPath = this.extractFullPathFromComment(lines, lineNumber)

      // 使用计算路径（更可靠），而非 JSDoc 注释
      const fullPath = calculatedPath

      this.backendAPIs.push({
        method: method.toUpperCase(),
        routePath,
        fullPath,
        file: filePath.replace(process.cwd(), '.'),
        line: lineNumber
      })
    }
  }

  /**
   * 从 JSDoc 注释中提取完整路径
   * @param {Array<string>} lines - 文件行数组
   * @param {number} lineNumber - 当前行号
   * @returns {string|null} 完整路径或 null
   */
  extractFullPathFromComment(lines, lineNumber) {
    // 向上查找最近的 @route 注释（最多向上 30 行）
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
   * 计算路由端点的完整 API 路径
   *
   * 算法说明：
   * 1. 将文件路径转换为相对路径（相对于项目根目录）
   * 2. 逐级匹配 ROUTE_PREFIX_MAP 找到基础前缀
   * 3. 使用 SUB_ROUTE_MAP 处理嵌套路由的子路径
   * 4. 拼接基础前缀 + 子路径 + 路由路径
   *
   * @param {string} filePath - 路由文件的绝对路径
   * @param {string} routePath - 路由定义中的相对路径
   * @returns {string} 完整的 API 路径
   */
  calculateFullPath(filePath, routePath) {
    // 转换为相对路径，统一使用正斜杠
    const relativePath = filePath.replace(process.cwd() + '/', '').replace(/\\/g, '/')
    const dirPath = path.dirname(relativePath)
    const fileName = path.basename(relativePath, '.js')

    // 步骤 1：找到匹配的基础前缀
    let basePath = null
    let matchedDir = null

    // 按路径长度降序排列，优先匹配更长（更精确）的路径
    const sortedPrefixes = Object.keys(ROUTE_PREFIX_MAP).sort((a, b) => b.length - a.length)

    for (const prefix of sortedPrefixes) {
      if (relativePath.startsWith(prefix + '/') || relativePath === prefix + '.js') {
        basePath = ROUTE_PREFIX_MAP[prefix]
        matchedDir = prefix
        break
      }
    }

    // 如果没有匹配的前缀，返回原始路径
    if (!basePath) {
      return routePath
    }

    // 步骤 2：计算子路径
    let subPath = ''

    // 📌 2026-01-09 修复：正确处理多级嵌套路由
    // 首先计算从 matchedDir 到当前目录的中间路径
    let middlePath = ''
    if (dirPath !== matchedDir && dirPath.startsWith(matchedDir + '/')) {
      const remainingPath = dirPath.replace(matchedDir + '/', '')
      if (remainingPath) {
        // 检查中间目录是否有特殊映射（从 console index.js 的挂载）
        const segments = remainingPath.split('/')
        for (const segment of segments) {
          const parentDir =
            matchedDir + (middlePath ? '/' + middlePath.replace(/^\//, '').replace(/\//g, '/') : '')
          const consoleMap = SUB_ROUTE_MAP['routes/v4/console']
          if (consoleMap && consoleMap[segment]) {
            middlePath += consoleMap[segment]
          } else {
            // 默认使用目录名转换为 URL 路径
            middlePath += '/' + segment.replace(/_/g, '-')
          }
        }
      }
    }

    // 然后检查当前目录对文件的子路由映射
    let fileSubPath = ''
    if (SUB_ROUTE_MAP[dirPath] && SUB_ROUTE_MAP[dirPath][fileName] !== undefined) {
      fileSubPath = SUB_ROUTE_MAP[dirPath][fileName]
    }

    // 合并中间路径和文件子路径
    subPath = middlePath + fileSubPath

    // 步骤 3：拼接完整路径
    let fullPath = basePath + subPath

    // 处理路由路径
    if (routePath !== '/') {
      fullPath += routePath
    }

    return fullPath
  }

  /**
   * 扫描前端API调用
   */
  scanFrontendAPIs(publicDir) {
    console.log('🔍 扫描前端API调用...\n')

    this.scanFrontendDirectory(publicDir)

    console.log(`\n扫描完成: 发现 ${this.frontendAPIs.length} 个前端API调用\n`)
    return this.frontendAPIs
  }

  /**
   * 扫描前端目录
   */
  scanFrontendDirectory(dir) {
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
  parseFrontendFile(filePath) {
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
  async login() {
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
  async testAllAPIs() {
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
  deduplicateAPIs(apis) {
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
  async testSingleAPI(api, headers) {
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
  generateReport() {
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
    console.log(
      `\n成功率: ${((summary.success / (summary.total - summary.skip)) * 100).toFixed(1)}%`
    )

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
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          summary,
          results: this.testResults
        },
        null,
        2
      )
    )

    console.log(`\n✅ 详细报告已保存: ${reportPath}`)
    console.log('='.repeat(70))

    return summary
  }

  /**
   * 执行完整检查流程
   */
  async run() {
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

  checker
    .run()
    .then(summary => {
      if (summary && summary.notFound > 0) {
        console.error('\n❌ 发现API缺失问题')
        process.exit(1)
      }
      console.log('\n✅ 检查完成')
      process.exit(0)
    })
    .catch(error => {
      console.error('❌ 检查失败:', error)
      process.exit(1)
    })
}

module.exports = ComprehensiveChecker
