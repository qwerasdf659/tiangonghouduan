const logger = require('../utils/logger').logger

/**
 * 并发控制中间件 V4
 * 使用统一分布式锁管理器，提供用户并发控制和分布式锁功能
 * 更新时间：2025/01/21
 */

const BeijingTimeHelper = require('../utils/timeHelper')
const UnifiedDistributedLock = require('../utils/UnifiedDistributedLock')
const ApiResponse = require('../utils/ApiResponse')

/**
 * 并发控制中间件（Concurrency Control Middleware）
 *
 * 业务场景：
 * - 限制单个用户的并发请求数，防止刷接口/并发写入导致的数据竞争
 * - 为关键写操作提供分布式锁，确保“单业务单据/单资源”原子性
 *
 * 注意：
 * - 该中间件只负责并发与锁控制，不负责业务逻辑
 * - 错误返回遵循统一 ApiResponse 格式
 */
class ConcurrencyControlMiddleware {
  /**
   * 构造函数：初始化分布式锁管理器与并发计数器
   *
   * @returns {void} 无返回值
   */
  constructor() {
    this.lockManager = new UnifiedDistributedLock()
    this.activeRequests = new Map()

    // 监听应用退出事件，清理资源
    process.on('SIGINT', () => {
      this.cleanup()
    })

    process.on('SIGTERM', () => {
      this.cleanup()
    })
  }

  /**
   * 限制特定用户的并发请求
   * @param {number} maxConcurrent 最大并发数，默认5
   * @returns {Function} Express中间件函数
   */
  limitUserConcurrency(maxConcurrent = 5) {
    return async (req, res, next) => {
      const user_id = req.user?.user_id

      // 如果没有用户信息，直接通过
      if (!user_id) {
        return next()
      }

      const userKey = `user_concurrency:${user_id}`
      const currentCount = this.activeRequests.get(userKey) || 0

      // 检查并发数限制
      if (currentCount >= maxConcurrent) {
        return res.status(429).json(
          ApiResponse.error(
            '并发请求过多，请稍后重试',
            'TOO_MANY_CONCURRENT_REQUESTS',
            {
              maxConcurrent,
              currentCount
            },
            -429
          )
        )
      }

      // 增加计数
      this.activeRequests.set(userKey, currentCount + 1)

      // 监听响应结束事件，减少计数
      const cleanup = () => {
        const count = this.activeRequests.get(userKey) || 0
        if (count <= 1) {
          this.activeRequests.delete(userKey)
        } else {
          this.activeRequests.set(userKey, count - 1)
        }
      }

      res.on('finish', cleanup)
      res.on('error', cleanup)
      res.on('close', cleanup)

      next()
    }
  }

  /**
   * 分布式锁中间件 - 确保关键操作的原子性
   * @param {string|Function} keyGenerator 锁key生成器
   * @param {Object} options 锁配置选项
   * @returns {Function} Express中间件函数
   */
  distributedLock(keyGenerator, options = {}) {
    const {
      ttl = 30000, // 锁过期时间，默认30秒
      maxRetries = 3, // 最大重试次数
      retryDelay = 100, // 重试延迟
      autoRenew = false, // 是否自动续期
      errorMessage = '资源被锁定，请稍后重试'
    } = options

    return async (req, res, next) => {
      const lockKey = typeof keyGenerator === 'function' ? keyGenerator(req) : keyGenerator

      if (!lockKey) {
        logger.error('[ConcurrencyControl] 锁key不能为空')
        return res
          .status(500)
          .json(ApiResponse.error('内部服务器错误', 'INVALID_LOCK_KEY', null, -500))
      }

      try {
        // 使用withLock方法自动管理锁的生命周期
        await this.lockManager.withLock(
          lockKey,
          async () => {
            // 在锁保护下执行请求处理
            return new Promise((resolve, reject) => {
              const originalEnd = res.end
              const originalJson = res.json

              // 重写响应方法以捕获完成事件
              res.end = function (...args) {
                resolve()
                return originalEnd.apply(this, args)
              }

              res.json = function (...args) {
                resolve()
                return originalJson.apply(this, args)
              }

              // 处理错误
              res.on('error', reject)

              // 处理客户端断开连接
              req.on('aborted', () => {
                reject(new Error('Client aborted request'))
              })

              // 继续处理请求
              next()
            })
          },
          {
            ttl,
            maxRetries,
            retryDelay,
            autoRenew
          }
        )
      } catch (error) {
        logger.error(`[ConcurrencyControl] 分布式锁错误: ${lockKey}`, error)

        // 根据错误类型返回不同的响应
        if (error.message.includes('无法获取资源锁')) {
          return res.status(423).json(
            ApiResponse.error(
              errorMessage,
              'RESOURCE_LOCKED',
              {
                lockKey,
                retryAfter: Math.ceil(ttl / 1000)
              },
              -423
            )
          )
        } else if (error.message.includes('Client aborted')) {
          // 客户端中断，不需要响应
        } else {
          return res.status(500).json(
            ApiResponse.error(
              '内部服务器错误',
              'LOCK_OPERATION_FAILED',
              {
                error: error.message
              },
              -500
            )
          )
        }
      }
    }
  }

  /**
   * 基于IP的并发控制
   * @param {number} maxConcurrent 最大并发数
   * @returns {Function} Express中间件函数
   */
  limitIPConcurrency(maxConcurrent = 10) {
    return async (req, res, next) => {
      const clientIP = req.ip || req.connection.remoteAddress
      const ipKey = `ip_concurrency:${clientIP}`
      const currentCount = this.activeRequests.get(ipKey) || 0

      if (currentCount >= maxConcurrent) {
        return res.status(429).json(
          ApiResponse.error(
            'IP并发请求过多，请稍后重试',
            'IP_TOO_MANY_CONCURRENT_REQUESTS',
            {
              maxConcurrent,
              currentCount,
              clientIP
            },
            -429
          )
        )
      }

      this.activeRequests.set(ipKey, currentCount + 1)

      const cleanup = () => {
        const count = this.activeRequests.get(ipKey) || 0
        if (count <= 1) {
          this.activeRequests.delete(ipKey)
        } else {
          this.activeRequests.set(ipKey, count - 1)
        }
      }

      res.on('finish', cleanup)
      res.on('error', cleanup)
      res.on('close', cleanup)

      next()
    }
  }

  /**
   * 获取并发统计信息
   * @returns {Object} 并发统计数据
   */
  getStats() {
    const userConcurrency = []
    const ipConcurrency = []

    for (const [key, count] of this.activeRequests.entries()) {
      if (key.startsWith('user_concurrency:')) {
        userConcurrency.push({
          user_id: key.replace('user_concurrency:', ''),
          concurrentRequests: count
        })
      } else if (key.startsWith('ip_concurrency:')) {
        ipConcurrency.push({
          ip: key.replace('ip_concurrency:', ''),
          concurrentRequests: count
        })
      }
    }

    return {
      totalActiveRequests: this.activeRequests.size,
      userConcurrency,
      ipConcurrency,
      timestamp: BeijingTimeHelper.formatForAPI(new Date()).iso
    }
  }

  /**
   * 清理资源
   *
   * @returns {Promise<void>} 无返回值，用于应用退出时释放锁管理器资源
   */
  async cleanup() {
    try {
      logger.info('[ConcurrencyControl] 正在清理资源...')

      // 清理活跃请求记录
      this.activeRequests.clear()

      // 关闭分布式锁连接
      if (this.lockManager) {
        await this.lockManager.disconnect()
      }

      logger.info('[ConcurrencyControl] 资源清理完成')
    } catch (error) {
      logger.error('[ConcurrencyControl] 资源清理失败:', error)
    }
  }
}

module.exports = ConcurrencyControlMiddleware
