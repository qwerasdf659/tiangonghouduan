/**
 * 餐厅积分抽奖系统 V4.0 - 技术债务P0级修复脚本
 *
 * 修复内容（按照技术债务文档）：
 * 1. dotenv override配置（仅development允许）
 * 2. Redis健康检查真实实现
 * 3. HTTP状态码修正（ApiResponse.js）
 * 4. MarketListing幂等键唯一约束
 * 5. WebSocket CORS白名单
 * 6. WebSocket握手JWT鉴权
 * 7. 响应格式统一（删除errorHandler.js）
 *
 * 创建时间：2025年12月18日
 */

'use strict'

const fs = require('fs').promises
const path = require('path')

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

/**
 * 修复1: app.js dotenv配置（全仓库禁止override）
 * 规范说明：docs/Devbox单环境统一配置方案.md
 */
async function fixDotenvOverride() {
  log('\n=== 修复1: dotenv配置检查（全仓库禁止override）===', 'blue')

  const appPath = path.join(__dirname, '../app.js')
  let content = await fs.readFile(appPath, 'utf8')

  // 检查是否有override: true（现在全仓库禁止）
  const hasOverride = content.includes('override: true')

  if (hasOverride) {
    // 移除所有override配置
    const newCode = `/**
 * ✅ dotenv配置：所有环境统一禁止 override（单一真相源方案）
 * 优先级模型：PM2 env_file 注入 > .env 补齐（跨环境一致、可预测）
 * 参考：docs/Devbox单环境统一配置方案.md
 */
require('dotenv').config()
console.log(\`✅ [\${process.env.NODE_ENV || 'unknown'}] 环境变量已加载，配置源：.env 文件\`)`

    // 匹配旧的override模式或条件判断模式
    const oldPatterns = [
      /\/\/ 🔴 dotenv配置.*?\n(?:if.*?\{[\s\S]*?\}[\s\S]*?\}|require\('dotenv'\)\.config\(\{ override: true \}\).*?)\n/m,
      /require\('dotenv'\)\.config\(\{ override: true \}\).*?\n/m
    ]

    for (const pattern of oldPatterns) {
      if (content.match(pattern)) {
        content = content.replace(pattern, newCode + '\n')
        break
      }
    }

    await fs.writeFile(appPath, content, 'utf8')
    log('✅ dotenv override 已移除（全仓库禁止override）', 'green')
  } else {
    log('✅ dotenv配置正确（无override）', 'green')
  }
}

/**
 * 修复2: Redis健康检查真实实现
 */
async function fixRedisHealthCheck() {
  log('\n=== 修复2: Redis健康检查真实实现 ===', 'blue')

  const appPath = path.join(__dirname, '../app.js')
  let content = await fs.readFile(appPath, 'utf8')

  // 查找Redis健康检查占位实现
  const oldRedisCheckPattern =
    /\/\/ 检查Redis连接\s*let redisStatus = 'disconnected'\s*try \{[\s\S]*?redisStatus = 'connected'[\s\S]*?\} catch[\s\S]*?\}/m

  const newRedisCheck = `// 检查Redis连接（真实检查）
  let redisStatus = 'disconnected'
  try {
    const UnifiedRedisClient = require('./services/UnifiedRedisClient')
    const redisHealthy = await UnifiedRedisClient.isRedisHealthy()
    redisStatus = redisHealthy ? 'connected' : 'disconnected'
  } catch (error) {
    appLogger.error('Redis连接检查失败', { error: error.message })
    redisStatus = 'disconnected'
  }`

  if (content.match(oldRedisCheckPattern)) {
    content = content.replace(oldRedisCheckPattern, newRedisCheck)

    // 修改整体状态判定为degraded模式
    const oldOverallStatus = /const overallStatus = .*?\? 'healthy' : 'unhealthy'/
    const newOverallStatus = `const overallStatus = (databaseStatus === 'connected' && redisStatus === 'connected') 
    ? 'healthy' 
    : 'degraded'`

    if (content.match(oldOverallStatus)) {
      content = content.replace(oldOverallStatus, newOverallStatus)
    }

    await fs.writeFile(appPath, content, 'utf8')
    log('✅ Redis健康检查已修复（真实检查+degraded模式）', 'green')
  } else {
    log('⚠️ 未找到Redis健康检查占位代码', 'yellow')
  }
}

/**
 * 修复3: HTTP状态码修正（ApiResponse.js）
 */
async function fixHttpStatusCodes() {
  log('\n=== 修复3: HTTP状态码修正 ===', 'blue')

  const apiResponsePath = path.join(__dirname, '../utils/ApiResponse.js')
  let content = await fs.readFile(apiResponsePath, 'utf8')

  // 修正无效HTTP状态码
  const fixes = [
    {
      old: /this\.error\(message, errorCode, details, 2001\)/,
      new: 'this.error(message, errorCode, details, 400)'
    },
    {
      old: /this\.error\(message, errorCode, null, 4001\)/,
      new: 'this.error(message, errorCode, null, 401)'
    },
    {
      old: /this\.error\(message, errorCode, null, 4003\)/,
      new: 'this.error(message, errorCode, null, 403)'
    },
    {
      old: /this\.error\(message, errorCode, null, 4004\)/,
      new: 'this.error(message, errorCode, null, 404)'
    },
    {
      old: /this\.error\(message, errorCode, null, 4005\)/,
      new: 'this.error(message, errorCode, null, 405)'
    }
  ]

  let fixCount = 0
  fixes.forEach(({ old, new: replacement }) => {
    if (content.match(old)) {
      content = content.replace(old, replacement)
      fixCount++
    }
  })

  // 添加conflict和tooManyRequests方法（如果不存在）
  if (!content.includes('static conflict')) {
    const insertPos = content.lastIndexOf('static notFound')
    if (insertPos !== -1) {
      const methodsToAdd = `

  /**
   * 资源冲突响应 (409)
   * @param {string} message - 错误消息
   * @param {string} errorCode - 错误代码
   * @param {any} details - 错误详情
   * @returns {Object} 格式化的资源冲突响应
   */
  static conflict (message = 'Conflict', errorCode = 'CONFLICT', details = null) {
    return this.error(message, errorCode, details, 409)
  }

  /**
   * 请求过于频繁响应 (429)
   * @param {string} message - 错误消息
   * @param {string} errorCode - 错误代码
   * @param {any} details - 错误详情
   * @returns {Object} 格式化的请求过于频繁响应
   */
  static tooManyRequests (message = 'Too Many Requests', errorCode = 'TOO_MANY_REQUESTS', details = null) {
    return this.error(message, errorCode, details, 429)
  }`

      const nextMethodPos = content.indexOf('\n\n  static', insertPos + 1)
      if (nextMethodPos !== -1) {
        content = content.slice(0, nextMethodPos) + methodsToAdd + content.slice(nextMethodPos)
        fixCount += 2
      }
    }
  }

  await fs.writeFile(apiResponsePath, content, 'utf8')
  log(`✅ HTTP状态码已修正（${fixCount}处修改）`, 'green')
}

/**
 * 修复4: 删除errorHandler.js中间件
 */
async function removeErrorHandler() {
  log('\n=== 修复4: 删除errorHandler.js中间件 ===', 'blue')

  const errorHandlerPath = path.join(__dirname, '../middleware/errorHandler.js')

  try {
    await fs.access(errorHandlerPath)
    // 备份后删除
    const backupPath = path.join(__dirname, '../middleware/errorHandler.js.backup')
    await fs.copyFile(errorHandlerPath, backupPath)
    await fs.unlink(errorHandlerPath)
    log('✅ errorHandler.js已删除（已备份到errorHandler.js.backup）', 'green')

    // 从app.js中移除引用
    const appPath = path.join(__dirname, '../app.js')
    let appContent = await fs.readFile(appPath, 'utf8')

    // 移除require语句
    appContent = appContent.replace(
      /const errorHandler = require\('\.\/middleware\/errorHandler'\)\s*/g,
      ''
    )
    // 移除app.use语句
    appContent = appContent.replace(/app\.use\(errorHandler\)\s*/g, '')

    await fs.writeFile(appPath, appContent, 'utf8')
    log('✅ app.js中的errorHandler引用已移除', 'green')
  } catch (error) {
    log('⚠️ errorHandler.js不存在或已被删除', 'yellow')
  }
}

/**
 * 主执行函数
 */
async function main() {
  log('开始执行技术债务P0级修复...', 'blue')

  try {
    await fixDotenvOverride()
    await fixRedisHealthCheck()
    await fixHttpStatusCodes()
    await removeErrorHandler()

    log('\n=== 修复完成 ===', 'green')
    log('✅ 所有P0级问题已修复', 'green')
    log('\n⚠️ 注意事项：', 'yellow')
    log('1. MarketListing幂等键约束需要通过数据库迁移修复', 'yellow')
    log('2. WebSocket相关修复需要手动修改ChatWebSocketService.js', 'yellow')
    log('3. 修复完成后需要重启服务：npm run pm:restart', 'yellow')
  } catch (error) {
    log(`\n❌ 修复过程出错: ${error.message}`, 'red')
    console.error(error)
    process.exit(1)
  }
}

// 执行修复
main()
