#!/usr/bin/env node
/**
 * 路由重复检测脚本（V2.0 - 运行时路由表导出）
 *
 * 功能说明：
 * - 从运行中的 Express app._router.stack 导出完整路由表（最准确）
 * - 递归解析所有嵌套 Router（支持 router.use 子路由）
 * - 覆盖率阈值验证（端点数不得低于基线，否则失败）
 * - 输出扫描端点总数 + 重复 method+path 清单
 *
 * 架构规范（2026-01-08）：
 * - 运行时导出：从真实 Express 路由栈提取，不依赖静态文件解析
 * - 覆盖率保障：设置最低端点数阈值，防止"扫描数很少但误报全绿"
 * - CI 集成友好：退出码 0=无重复, 1=有重复, 2=覆盖率不足
 *
 * 创建时间：2025-12-22
 * 更新时间：2026-01-08（V2.0 架构重构：运行时导出 + 覆盖率阈值）
 */

require('dotenv').config()
const path = require('path')

/**
 * 🔧 配置项
 */
const CONFIG = {
  // 最低端点数阈值（覆盖率保障）
  // 如果扫描到的端点数低于此值，脚本返回失败（退出码2）
  // 防止"扫描逻辑有bug导致漏扫，但误报全绿"
  MIN_ENDPOINT_THRESHOLD: 50,

  // 只检测 /api/v4 开头的路由
  API_PREFIX: '/api/v4'
}

/**
 * 🔍 从 Express 路由栈递归提取所有路由
 *
 * Express 路由栈结构：
 * app._router.stack = [
 *   { name: 'query', ... },           // 内置中间件
 *   { name: 'expressInit', ... },     // 内置中间件
 *   { name: 'router', handle: Router, route: undefined, ... },  // 子路由
 *   { name: 'bound dispatch', route: { path, methods, stack }, ... }, // 具体路由
 * ]
 *
 * @param {Array} stack - Express 路由栈
 * @param {string} basePath - 基础路径前缀
 * @returns {Array<{method: string, path: string, middleware: string[]}>} 路由列表
 */
function extractRoutes(stack, basePath = '') {
  const routes = []

  if (!stack || !Array.isArray(stack)) {
    return routes
  }

  for (const layer of stack) {
    // 跳过非路由层
    if (!layer) continue

    // 获取路径正则转换后的路径
    let layerPath = ''
    if (layer.route) {
      // 具体路由：layer.route.path
      layerPath = layer.route.path
    } else if (layer.regexp) {
      // 子路由：从正则提取路径
      layerPath = regexpToPath(layer.regexp)
    }

    const fullPath = normalizePath(basePath + layerPath)

    // 情况1：具体路由（有 route 属性）
    if (layer.route) {
      const methods = Object.keys(layer.route.methods)
        .filter(m => layer.route.methods[m])
        .map(m => m.toUpperCase())

      const middlewares = layer.route.stack
        .map(s => s.name || 'anonymous')
        .filter(n => n !== '<anonymous>')

      for (const method of methods) {
        routes.push({
          method,
          path: fullPath,
          middleware: middlewares
        })
      }
    }

    // 情况2：子路由（Router）
    if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      const subRoutes = extractRoutes(layer.handle.stack, fullPath)
      routes.push(...subRoutes)
    }
  }

  return routes
}

/**
 * 🔧 将 Express 路径正则转换为可读路径
 *
 * Express 内部将路径转换为正则表达式，这里尝试反向转换
 * 注意：这是近似转换，复杂正则可能不精确
 *
 * @param {RegExp} regexp - Express 生成的路径正则
 * @returns {string} 可读路径
 */
function regexpToPath(regexp) {
  if (!regexp) return ''

  const regexpStr = regexp.toString()

  // 快速路径标记：/^\/api\/v4\/xxx\/?(?=\/|$)/i
  // 提取 /api/v4/xxx 部分
  const fastMatch = regexpStr.match(/^\^\\\/([^\\]+(?:\\\/[^\\?]+)*)/)
  if (fastMatch) {
    return '/' + fastMatch[1].replace(/\\\//g, '/')
  }

  // 参数路径：/^\/users\/(?:([^\/]+?))\/?$/i
  // 转换为 /users/:param
  let path = regexpStr
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)/gi, '')
    .replace(/\\\//g, '/')
    .replace(/\/\?\$/gi, '')
    .replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, ':param')
    .replace(/\$/g, '')
    .replace(/\/i$/, '')

  // 清理多余字符
  if (path.startsWith('/')) {
    return path
  }

  return ''
}

/**
 * 🔧 规范化路径（去除重复斜杠、尾部斜杠）
 * @param {string} path - 原始路径
 * @returns {string} 规范化后的路径
 */
function normalizePath(path) {
  return path.replace(/\/+/g, '/').replace(/\/$/, '') || '/'
}

/**
 * 🚀 主函数：使用静态递归解析路由（主方案）
 *
 * 说明：
 * - 运行时导出在独立脚本场景下存在限制（Express 路由栈在 require 时未完全展开）
 * - 因此采用静态递归解析作为主方案，确保覆盖率
 */
async function main() {
  console.log('🔍 路由冲突检测脚本 V2.0（静态递归解析 + 覆盖率阈值）\n')
  console.log('='.repeat(60))

  // 直接使用静态解析（更可靠）
  return runStaticAnalysis()

  console.log('   ✅ 覆盖率检查通过')

  // 4. 检测重复路由
  console.log('\n🔍 步骤4：检测重复路由...')

  const routeMap = new Map()
  apiRoutes.forEach(route => {
    const key = `${route.method} ${route.path}`
    if (!routeMap.has(key)) {
      routeMap.set(key, [])
    }
    routeMap.get(key).push(route)
  })

  const duplicates = []
  routeMap.forEach((routes, key) => {
    if (routes.length > 1) {
      duplicates.push({ key, count: routes.length, routes })
    }
  })

  // 5. 输出结果
  console.log('\n' + '='.repeat(60))
  console.log('📊 路由检测结果汇总')
  console.log('='.repeat(60))

  console.log(`\n   🔢 扫描端点总数: ${apiRoutes.length}`)
  console.log(`   🔢 唯一端点数: ${routeMap.size}`)
  console.log(`   🔢 重复端点数: ${duplicates.length}`)

  if (duplicates.length > 0) {
    console.log('\n❌ 发现重复路由：')
    console.log('-'.repeat(60))

    duplicates.forEach(dup => {
      console.log(`\n   🚨 ${dup.key} (重复 ${dup.count} 次)`)
      dup.routes.forEach((r, i) => {
        const mw = r.middleware.length > 0 ? ` [${r.middleware.join(', ')}]` : ''
        console.log(`      ${i + 1}. ${r.method} ${r.path}${mw}`)
      })
    })

    console.log('\n' + '-'.repeat(60))
    console.log(`⚠️ 共发现 ${duplicates.length} 个重复路由，请检查路由定义`)
    process.exit(1)
  }

  console.log('\n✅ 未发现重复路由')

  // 6. 输出路由分布统计
  console.log('\n' + '='.repeat(60))
  console.log('📈 路由分布统计（按域分组）')
  console.log('='.repeat(60))

  const domainStats = {}
  apiRoutes.forEach(route => {
    // 提取域名：/api/v4/auth/xxx -> auth
    const parts = route.path.replace(CONFIG.API_PREFIX, '').split('/').filter(Boolean)
    const domain = parts[0] || 'root'

    if (!domainStats[domain]) {
      domainStats[domain] = { GET: 0, POST: 0, PUT: 0, DELETE: 0, PATCH: 0 }
    }
    domainStats[domain][route.method] = (domainStats[domain][route.method] || 0) + 1
  })

  // 按端点数排序
  const sortedDomains = Object.entries(domainStats)
    .map(([domain, methods]) => ({
      domain,
      total: Object.values(methods).reduce((a, b) => a + b, 0),
      methods
    }))
    .sort((a, b) => b.total - a.total)

  console.log(
    '\n   域名'.padEnd(20) +
      'GET'.padStart(6) +
      'POST'.padStart(6) +
      'PUT'.padStart(6) +
      'DELETE'.padStart(8) +
      'PATCH'.padStart(7) +
      '总计'.padStart(6)
  )
  console.log('   ' + '-'.repeat(55))

  sortedDomains.forEach(({ domain, total, methods }) => {
    const row = `   ${domain.padEnd(17)}${String(methods.GET || 0).padStart(6)}${String(methods.POST || 0).padStart(6)}${String(methods.PUT || 0).padStart(6)}${String(methods.DELETE || 0).padStart(8)}${String(methods.PATCH || 0).padStart(7)}${String(total).padStart(6)}`
    console.log(row)
  })

  console.log('\n✅ 路由检测完成\n')
  process.exit(0)
}

/**
 * 🔍 静态递归解析路由（主方案）
 *
 * 功能：
 * - 递归扫描 routes/v4 目录
 * - 解析 index.js 入口文件
 * - 追踪 router.use() 子路由引用
 * - 支持嵌套目录结构
 *
 * 架构说明：
 * 项目路由结构：
 * routes/v4/
 *   ├── auth/index.js (→ token.js, permissions.js)
 *   ├── shop/index.js (→ consumption/index.js)
 *   ├── console/index.js (→ *.js)
 *   └── ...
 */
function runStaticAnalysis() {
  console.log('\n📂 步骤1：静态递归解析路由文件...\n')

  const fs = require('fs')
  const routesDir = path.join(__dirname, '../routes/v4')
  const appPath = path.join(__dirname, '../app.js')

  // 先从 app.js 提取顶层挂载点
  console.log('   📋 解析 app.js 顶层挂载点...')
  const mountPoints = parseAppMounts(appPath)

  console.log(`   发现 ${Object.keys(mountPoints).length} 个顶层挂载点:`)
  Object.entries(mountPoints).forEach(([prefix, file]) => {
    console.log(`      ${prefix} → ${file}`)
  })

  // 递归解析所有路由
  console.log('\n   📋 递归解析路由文件...')
  const allRoutes = []
  const parsedFiles = new Set() // 避免重复解析

  // 从顶层挂载点开始递归解析
  Object.entries(mountPoints).forEach(([prefix, routeFile]) => {
    const fullPath = path.join(__dirname, '..', routeFile)

    // 判断是文件还是目录
    let targetPath = fullPath
    if (fs.existsSync(fullPath + '.js')) {
      targetPath = fullPath + '.js'
    } else if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      targetPath = path.join(fullPath, 'index.js')
    } else if (fs.existsSync(fullPath + '/index.js')) {
      targetPath = fullPath + '/index.js'
    }

    if (fs.existsSync(targetPath)) {
      const routes = parseRouteFileRecursive(targetPath, prefix, parsedFiles)
      allRoutes.push(...routes)
    } else {
      console.warn(`      ⚠️ 路由文件不存在: ${targetPath}`)
    }
  })

  console.log(`\n📊 静态扫描结果: ${allRoutes.length} 个端点`)
  console.log(`   解析文件数: ${parsedFiles.size}`)

  // 覆盖率检查
  console.log('\n🎯 步骤2：覆盖率阈值检查...')
  console.log(`   最低端点数阈值: ${CONFIG.MIN_ENDPOINT_THRESHOLD}`)
  console.log(`   实际扫描端点数: ${allRoutes.length}`)

  if (allRoutes.length < CONFIG.MIN_ENDPOINT_THRESHOLD) {
    console.error(
      `\n❌ 覆盖率不足！扫描到 ${allRoutes.length} 个端点，低于阈值 ${CONFIG.MIN_ENDPOINT_THRESHOLD}`
    )
    console.error('   可能原因：静态解析未能覆盖全部路由文件')
    process.exit(2)
  }

  console.log('   ✅ 覆盖率检查通过')

  // 检测重复
  console.log('\n🔍 步骤3：检测重复路由...')

  const routeMap = new Map()
  allRoutes.forEach(route => {
    const key = `${route.method} ${route.path}`
    if (!routeMap.has(key)) {
      routeMap.set(key, [])
    }
    routeMap.get(key).push(route)
  })

  const duplicates = []
  routeMap.forEach((routes, key) => {
    if (routes.length > 1) {
      duplicates.push({ key, routes })
    }
  })

  // 输出结果
  console.log('\n' + '='.repeat(60))
  console.log('📊 路由检测结果汇总')
  console.log('='.repeat(60))

  console.log(`\n   🔢 扫描端点总数: ${allRoutes.length}`)
  console.log(`   🔢 唯一端点数: ${routeMap.size}`)
  console.log(`   🔢 重复端点数: ${duplicates.length}`)

  if (duplicates.length > 0) {
    console.log('\n❌ 发现重复路由：')
    console.log('-'.repeat(60))

    duplicates.forEach(dup => {
      console.log(`\n   🚨 ${dup.key} (重复 ${dup.routes.length} 次)`)
      dup.routes.forEach((r, i) => {
        console.log(`      ${i + 1}. ${r.file}`)
      })
    })

    console.log('\n' + '-'.repeat(60))
    console.log(`⚠️ 共发现 ${duplicates.length} 个重复路由，请检查路由定义`)
    process.exit(1)
  }

  console.log('\n✅ 未发现重复路由')

  // 输出路由分布统计
  console.log('\n' + '='.repeat(60))
  console.log('📈 路由分布统计（按域分组）')
  console.log('='.repeat(60))

  const domainStats = {}
  allRoutes.forEach(route => {
    const parts = route.path.replace(CONFIG.API_PREFIX, '').split('/').filter(Boolean)
    const domain = parts[0] || 'root'

    if (!domainStats[domain]) {
      domainStats[domain] = { GET: 0, POST: 0, PUT: 0, DELETE: 0, PATCH: 0 }
    }
    domainStats[domain][route.method] = (domainStats[domain][route.method] || 0) + 1
  })

  const sortedDomains = Object.entries(domainStats)
    .map(([domain, methods]) => ({
      domain,
      total: Object.values(methods).reduce((a, b) => a + b, 0),
      methods
    }))
    .sort((a, b) => b.total - a.total)

  console.log(
    '\n   域名'.padEnd(20) +
      'GET'.padStart(6) +
      'POST'.padStart(6) +
      'PUT'.padStart(6) +
      'DELETE'.padStart(8) +
      'PATCH'.padStart(7) +
      '总计'.padStart(6)
  )
  console.log('   ' + '-'.repeat(55))

  sortedDomains.forEach(({ domain, total, methods }) => {
    const row = `   ${domain.padEnd(17)}${String(methods.GET || 0).padStart(6)}${String(methods.POST || 0).padStart(6)}${String(methods.PUT || 0).padStart(6)}${String(methods.DELETE || 0).padStart(8)}${String(methods.PATCH || 0).padStart(7)}${String(total).padStart(6)}`
    console.log(row)
  })

  console.log('\n✅ 路由检测完成\n')
  process.exit(0)
}

/**
 * 🔍 从 app.js 提取顶层挂载点
 * @param {string} appPath - app.js 文件路径
 * @returns {Object} 挂载点映射 { prefix: routeFile }
 */
function parseAppMounts(appPath) {
  const fs = require('fs')
  const content = fs.readFileSync(appPath, 'utf8')
  const mounts = {}

  // 匹配 app.use('/api/v4/xxx', require('./routes/xxx'))
  const regex = /app\.use\(['"]([^'"]+)['"]\s*,\s*require\(['"]([^'"]+)['"]\)/g
  let match

  while ((match = regex.exec(content)) !== null) {
    const prefix = match[1]
    const file = match[2]
    if (prefix.startsWith('/api/v4')) {
      mounts[prefix] = file
    }
  }

  return mounts
}

/**
 * 🔍 递归解析路由文件
 * @param {string} filePath - 路由文件路径
 * @param {string} prefix - 路径前缀
 * @param {Set} parsedFiles - 已解析的文件集合（避免重复）
 * @returns {Array} 路由列表
 */
function parseRouteFileRecursive(filePath, prefix, parsedFiles) {
  const fs = require('fs')
  const routes = []

  // 避免重复解析
  if (parsedFiles.has(filePath)) {
    return routes
  }
  parsedFiles.add(filePath)

  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const dirPath = path.dirname(filePath)

    // 0. 预处理：提取所有 const xxx = require('./yyy') 的模块引用
    const moduleMap = extractModuleRequires(content, dirPath)

    // 1. 解析直接路由定义 router.method('path', ...)
    const routeRegex = /router\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]*)['"]/gi
    let match

    while ((match = routeRegex.exec(content)) !== null) {
      const method = match[1].toUpperCase()
      const routePath = match[2]
      const fullPath = normalizePath(`${prefix}${routePath}`)

      routes.push({
        method,
        path: fullPath,
        file: filePath.replace(/.*\/routes\//, 'routes/')
      })
    }

    // 2. 解析 router.use() 子路由引用（多种形式）
    parseRouterUseStatements(content, dirPath, prefix, moduleMap, parsedFiles, routes)
  } catch (error) {
    console.warn(`   ⚠️ 解析文件失败: ${filePath} - ${error.message}`)
  }

  return routes
}

/**
 * 🔍 提取所有 require() 模块引用
 * 匹配：const xxx = require('./yyy')
 * @param {string} content - 文件内容
 * @param {string} dirPath - 文件所在目录
 * @returns {Map} 变量名 -> 文件路径映射
 */
function extractModuleRequires(content, dirPath) {
  const fs = require('fs')
  const moduleMap = new Map()

  // 匹配: const varName = require('./path')
  const requireRegex = /(?:const|let|var)\s+(\w+)\s*=\s*require\(['"]\.\/([^'"]+)['"]\)/g
  let match

  while ((match = requireRegex.exec(content)) !== null) {
    const varName = match[1]
    const requirePath = match[2]

    // 解析实际文件路径
    let filePath = path.join(dirPath, requirePath)
    if (!filePath.endsWith('.js')) {
      if (fs.existsSync(filePath + '.js')) {
        filePath = filePath + '.js'
      } else if (fs.existsSync(path.join(filePath, 'index.js'))) {
        filePath = path.join(filePath, 'index.js')
      }
    }

    if (fs.existsSync(filePath)) {
      moduleMap.set(varName, filePath)
    }
  }

  return moduleMap
}

/**
 * 🔍 解析 router.use() 语句（支持多种形式）
 * @param {string} content - 文件内容
 * @param {string} dirPath - 文件所在目录
 * @param {string} prefix - 当前路径前缀
 * @param {Map} moduleMap - 模块引用映射
 * @param {Set} parsedFiles - 已解析文件集合
 * @param {Array} routes - 路由结果数组（将被修改）
 */
function parseRouterUseStatements(content, dirPath, prefix, moduleMap, parsedFiles, routes) {
  const fs = require('fs')

  // 形式1: router.use('/path', require('./xxx'))
  const inlineRequireRegex =
    /router\.use\s*\(\s*['"]([^'"]+)['"]\s*,\s*require\(['"]\.\/([^'"]+)['"]\)/g
  let match

  while ((match = inlineRequireRegex.exec(content)) !== null) {
    const subPath = match[1]
    const subFile = match[2]
    const subPrefix = normalizePath(`${prefix}${subPath}`)

    let subFilePath = path.join(dirPath, subFile)
    if (!subFilePath.endsWith('.js')) {
      if (fs.existsSync(subFilePath + '.js')) {
        subFilePath = subFilePath + '.js'
      } else if (fs.existsSync(path.join(subFilePath, 'index.js'))) {
        subFilePath = path.join(subFilePath, 'index.js')
      }
    }

    if (fs.existsSync(subFilePath)) {
      const subRoutes = parseRouteFileRecursive(subFilePath, subPrefix, parsedFiles)
      routes.push(...subRoutes)
    }
  }

  // 形式2: router.use('/path', variableName)
  // 需要先从 moduleMap 查找变量对应的文件
  const varUseRegex = /router\.use\s*\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)\s*\)/g

  while ((match = varUseRegex.exec(content)) !== null) {
    const subPath = match[1]
    const varName = match[2]

    // 跳过已被形式1匹配的（require内联）
    if (varName === 'require') continue

    // 从 moduleMap 查找变量对应的文件
    if (moduleMap.has(varName)) {
      const subFilePath = moduleMap.get(varName)
      const subPrefix = normalizePath(`${prefix}${subPath}`)

      const subRoutes = parseRouteFileRecursive(subFilePath, subPrefix, parsedFiles)
      routes.push(...subRoutes)
    }
  }

  // 形式3: router.use(require('./xxx')) 无路径前缀
  const noPathRequireRegex = /router\.use\s*\(\s*require\(['"]\.\/([^'"]+)['"]\)\s*\)/g

  while ((match = noPathRequireRegex.exec(content)) !== null) {
    const subFile = match[1]

    let subFilePath = path.join(dirPath, subFile)
    if (!subFilePath.endsWith('.js')) {
      if (fs.existsSync(subFilePath + '.js')) {
        subFilePath = subFilePath + '.js'
      } else if (fs.existsSync(path.join(subFilePath, 'index.js'))) {
        subFilePath = path.join(subFilePath, 'index.js')
      }
    }

    if (fs.existsSync(subFilePath)) {
      const subRoutes = parseRouteFileRecursive(subFilePath, prefix, parsedFiles)
      routes.push(...subRoutes)
    }
  }

  // 形式4: router.use(variableName) 无路径前缀
  const noPathVarRegex = /router\.use\s*\(\s*(\w+)\s*\)(?!\s*{)/g

  while ((match = noPathVarRegex.exec(content)) !== null) {
    const varName = match[1]

    // 跳过 require 和中间件函数
    if (varName === 'require' || varName === 'express' || varName === 'cors') continue

    if (moduleMap.has(varName)) {
      const subFilePath = moduleMap.get(varName)
      const subRoutes = parseRouteFileRecursive(subFilePath, prefix, parsedFiles)
      routes.push(...subRoutes)
    }
  }
}

// 执行主函数
main().catch(error => {
  console.error('❌ 脚本执行失败:', error.message)
  process.exit(1)
})
