/**
 * 餐厅积分抽奖系统 V4.0 - P0技术债务修复验证脚本
 *
 * 验证内容：
 * 1. ✅ dotenv override配置（仅development允许）
 * 2. ✅ Redis健康检查真实实现
 * 3. ✅ HTTP状态码正确（400/401/403/404/409/429）
 * 4. ✅ MarketListing幂等键唯一约束
 * 5. ✅ WebSocket CORS白名单
 * 6. ✅ WebSocket握手JWT鉴权
 * 7. ✅ 响应格式统一（已删除errorHandler.js）
 *
 * 创建时间：2025年12月18日
 */

'use strict'

const fs = require('fs').promises
const path = require('path')
const http = require('http')

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

async function httpGet(path) {
  return new Promise((resolve, reject) => {
    http
      .get(`http://localhost:3000${path}`, res => {
        let data = ''
        res.on('data', chunk => {
          data += chunk
        })
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) })
          } catch (e) {
            resolve({ status: res.statusCode, data: data })
          }
        })
      })
      .on('error', reject)
  })
}

async function verify1DotenvOverride() {
  log('\n=== 验证1: dotenv override配置 ===', 'blue')

  const appPath = path.join(__dirname, '../app.js')
  const content = await fs.readFile(appPath, 'utf8')

  if (content.includes('development) === \047development')) {
    log('✅ dotenv override仅在development环境允许', 'green')
    return true
  } else {
    log('❌ dotenv override配置未修复', 'red')
    return false
  }
}

async function verify2RedisHealthCheck() {
  log('\n=== 验证2: Redis健康检查 ===', 'blue')

  try {
    const { data } = await httpGet('/health')

    if (data.data && data.data.systems && data.data.systems.redis) {
      const redisStatus = data.data.systems.redis
      log(`✅ Redis状态: ${redisStatus}`, redisStatus === 'connected' ? 'green' : 'yellow')

      if (data.data.status === 'healthy' || data.data.status === 'degraded') {
        log('✅ 支持degraded模式', 'green')
      }

      return true
    } else {
      log('❌ Redis健康检查未实现', 'red')
      return false
    }
  } catch (error) {
    log(`❌ 健康检查请求失败: ${error.message}`, 'red')
    return false
  }
}

async function verify3HttpStatusCodes() {
  log('\n=== 验证3: HTTP状态码 ===', 'blue')

  const apiResponsePath = path.join(__dirname, '../utils/ApiResponse.js')
  const content = await fs.readFile(apiResponsePath, 'utf8')

  const checks = [
    { code: 400, method: 'badRequest' },
    { code: 401, method: 'unauthorized' },
    { code: 403, method: 'forbidden' },
    { code: 404, method: 'notFound' }
  ]

  let allPass = true
  for (const check of checks) {
    if (content.includes(`this.error(message, errorCode, details, ${check.code})`)) {
      log(`✅ ${check.method}方法使用正确HTTP ${check.code}`, 'green')
    } else {
      log(`❌ ${check.method}方法HTTP状态码不正确`, 'red')
      allPass = false
    }
  }

  // 检查是否添加了conflict和tooManyRequests方法
  if (content.includes('static conflict')) {
    log('✅ 已添加conflict方法(409)', 'green')
  }
  if (content.includes('static tooManyRequests')) {
    log('✅ 已添加tooManyRequests方法(429)', 'green')
  }

  return allPass
}

async function verify4MarketListingIdempotency() {
  log('\n=== 验证4: MarketListing幂等键约束 ===', 'blue')

  try {
    const { sequelize } = require('../models')
    const [indexes] = await sequelize.query(
      "SHOW INDEX FROM market_listings WHERE Key_name = 'uk_market_listings_seller_business_id'"
    )

    if (indexes.length === 2) {
      log('✅ 幂等键唯一索引已创建', 'green')
      log(`   - 字段1: ${indexes[0].Column_name}`, 'green')
      log(`   - 字段2: ${indexes[1].Column_name}`, 'green')
      return true
    } else {
      log('❌ 幂等键唯一索引未创建', 'red')
      return false
    }
  } catch (error) {
    log(`❌ 数据库查询失败: ${error.message}`, 'red')
    return false
  }
}

async function verify5WebSocketCORS() {
  log('\n=== 验证5: WebSocket CORS白名单 ===', 'blue')

  const wsServicePath = path.join(__dirname, '../services/ChatWebSocketService.js')
  const content = await fs.readFile(wsServicePath, 'utf8')

  if (
    content.includes('origin: (origin, callback)') &&
    content.includes('allowedOrigins') &&
    !content.includes("origin: '*'")
  ) {
    log('✅ WebSocket CORS已配置白名单', 'green')
    return true
  } else {
    log('❌ WebSocket CORS仍然完全开放', 'red')
    return false
  }
}

async function verify6WebSocketJWT() {
  log('\n=== 验证6: WebSocket握手JWT鉴权 ===', 'blue')

  const wsServicePath = path.join(__dirname, '../services/ChatWebSocketService.js')
  const content = await fs.readFile(wsServicePath, 'utf8')

  if (
    content.includes('this.io.use((socket, next)') &&
    content.includes('socket.handshake.auth?.token') &&
    content.includes('jwt.verify')
  ) {
    log('✅ WebSocket握手JWT鉴权已实现', 'green')

    if (content.includes('socket.user = decoded')) {
      log('✅ 身份信息已挂载到socket.user', 'green')
    }

    return true
  } else {
    log('❌ WebSocket握手JWT鉴权未实现', 'red')
    return false
  }
}

async function verify7ErrorHandlerRemoved() {
  log('\n=== 验证7: errorHandler.js已删除 ===', 'blue')

  try {
    await fs.access(path.join(__dirname, '../middleware/errorHandler.js'))
    log('❌ errorHandler.js仍然存在', 'red')
    return false
  } catch {
    log('✅ errorHandler.js已删除', 'green')
  }

  // 检查是否有遗留引用
  const { exec } = require('child_process')
  const util = require('util')
  const execAsync = util.promisify(exec)

  try {
    await execAsync('grep -r "require.*errorHandler" routes/ --include="*.js"')
    log('❌ 仍有文件引用errorHandler', 'red')
    return false
  } catch {
    log('✅ 所有errorHandler引用已清除', 'green')
    return true
  }
}

async function main() {
  log('开始验证P0技术债务修复...', 'blue')
  log('='.repeat(50), 'blue')

  const results = {
    dotenvOverride: await verify1DotenvOverride(),
    redisHealthCheck: await verify2RedisHealthCheck(),
    httpStatusCodes: await verify3HttpStatusCodes(),
    marketListingIdempotency: await verify4MarketListingIdempotency(),
    websocketCORS: await verify5WebSocketCORS(),
    websocketJWT: await verify6WebSocketJWT(),
    errorHandlerRemoved: await verify7ErrorHandlerRemoved()
  }

  log('\n' + '='.repeat(50), 'blue')
  log('验证结果汇总', 'blue')
  log('='.repeat(50), 'blue')

  const passedCount = Object.values(results).filter(r => r).length
  const totalCount = Object.keys(results).length

  Object.entries(results).forEach(([name, passed]) => {
    const symbol = passed ? '✅' : '❌'
    const color = passed ? 'green' : 'red'
    log(`${symbol} ${name}`, color)
  })

  log('\n' + '='.repeat(50), 'blue')
  log(`总计: ${passedCount}/${totalCount} 项通过`, passedCount === totalCount ? 'green' : 'yellow')

  if (passedCount === totalCount) {
    log('\n🎉 所有P0级技术债务已修复！', 'green')
  } else {
    log(`\n⚠️ 还有 ${totalCount - passedCount} 项需要修复`, 'yellow')
  }

  // 关闭数据库连接
  try {
    const { sequelize } = require('../models')
    await sequelize.close()
  } catch (e) {
    // 忽略
  }

  process.exit(passedCount === totalCount ? 0 : 1)
}

main()
