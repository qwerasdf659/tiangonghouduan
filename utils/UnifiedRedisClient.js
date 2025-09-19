/**
 * 统一Redis客户端管理器 V4
 * 解决项目中redis和ioredis混用的技术债务问题
 * 统一使用ioredis，提供更好的性能和稳定性
 * 创建时间：2025年01月21日 北京时间
 */

const Redis = require('ioredis')

/**
 * 统一Redis客户端单例类
 */
class UnifiedRedisClient {
  constructor () {
    if (UnifiedRedisClient.instance) {
      return UnifiedRedisClient.instance
    }

    // 统一配置 - 基于项目实际需求
    this.config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      db: process.env.REDIS_DB || 0,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true, // 延迟连接，提高性能
      keepAlive: true,
      connectTimeout: 10000,
      commandTimeout: 5000,
      family: 4 // IPv4
    }

    // 创建主客户端
    this.client = new Redis(this.config)

    // 创建发布/订阅客户端（如果需要）
    this.pubClient = new Redis(this.config)
    this.subClient = new Redis(this.config)

    // 连接状态管理
    this.isConnected = false
    this.connectionPromise = null

    // 统一错误处理
    this.setupEventHandlers()

    UnifiedRedisClient.instance = this
  }

  /**
   * 设置事件处理器
   */
  setupEventHandlers () {
    // 主客户端事件
    this.client.on('connect', () => {
      console.log('[UnifiedRedisClient] 主客户端连接成功')
      this.isConnected = true
    })

    this.client.on('error', err => {
      console.error('[UnifiedRedisClient] 主客户端连接错误:', err)
      this.isConnected = false
    })

    this.client.on('close', () => {
      console.log('[UnifiedRedisClient] 主客户端连接关闭')
      this.isConnected = false
    })

    // 发布客户端事件
    this.pubClient.on('connect', () => {
      console.log('[UnifiedRedisClient] 发布客户端连接成功')
    })

    this.pubClient.on('error', err => {
      console.error('[UnifiedRedisClient] 发布客户端错误:', err)
    })

    // 订阅客户端事件
    this.subClient.on('connect', () => {
      console.log('[UnifiedRedisClient] 订阅客户端连接成功')
    })

    this.subClient.on('error', err => {
      console.error('[UnifiedRedisClient] 订阅客户端错误:', err)
    })
  }

  /**
   * 获取主客户端实例
   * @returns {Redis} Redis客户端实例
   */
  getClient () {
    return this.client
  }

  /**
   * 获取发布客户端实例
   * @returns {Redis} 发布客户端实例
   */
  getPubClient () {
    return this.pubClient
  }

  /**
   * 获取订阅客户端实例
   * @returns {Redis} 订阅客户端实例
   */
  getSubClient () {
    return this.subClient
  }

  /**
   * 确保连接成功
   * @returns {Promise<Redis>} 连接的客户端
   */
  async ensureConnection () {
    if (this.isConnected) {
      return this.client
    }

    if (!this.connectionPromise) {
      this.connectionPromise = this.client.connect()
    }

    await this.connectionPromise
    return this.client
  }

  /**
   * 健康检查
   * @returns {Promise<boolean>} 连接是否健康
   */
  async healthCheck () {
    try {
      const result = await this.client.ping()
      return result === 'PONG'
    } catch (error) {
      console.error('[UnifiedRedisClient] 健康检查失败:', error)
      return false
    }
  }

  /**
   * 统一的操作方法 - 基本操作
   */

  // 字符串操作
  async set (key, value, ttl = null) {
    const client = await this.ensureConnection()
    if (ttl) {
      return await client.setex(key, ttl, value)
    }
    return await client.set(key, value)
  }

  async get (key) {
    const client = await this.ensureConnection()
    return await client.get(key)
  }

  async del (key) {
    const client = await this.ensureConnection()
    return await client.del(key)
  }

  async exists (key) {
    const client = await this.ensureConnection()
    return await client.exists(key)
  }

  async expire (key, ttl) {
    const client = await this.ensureConnection()
    return await client.expire(key, ttl)
  }

  // 哈希操作
  async hset (key, field, value) {
    const client = await this.ensureConnection()
    return await client.hset(key, field, value)
  }

  async hget (key, field) {
    const client = await this.ensureConnection()
    return await client.hget(key, field)
  }

  async hgetall (key) {
    const client = await this.ensureConnection()
    return await client.hgetall(key)
  }

  async hdel (key, field) {
    const client = await this.ensureConnection()
    return await client.hdel(key, field)
  }

  // 有序集合操作（用于滑动窗口限流等）
  async zadd (key, score, member) {
    const client = await this.ensureConnection()
    return await client.zadd(key, score, member)
  }

  async zremrangebyscore (key, min, max) {
    const client = await this.ensureConnection()
    return await client.zremrangebyscore(key, min, max)
  }

  async zcard (key) {
    const client = await this.ensureConnection()
    return await client.zcard(key)
  }

  async zcount (key, min, max) {
    const client = await this.ensureConnection()
    return await client.zcount(key, min, max)
  }

  // 原子性操作支持
  async multi () {
    const client = await this.ensureConnection()
    return client.multi()
  }

  async pipeline () {
    const client = await this.ensureConnection()
    return client.pipeline()
  }

  // Lua脚本支持
  async eval (script, numKeys, ...args) {
    const client = await this.ensureConnection()
    return await client.eval(script, numKeys, ...args)
  }

  /**
   * 关闭所有连接
   */
  async disconnect () {
    const promises = []

    if (this.client) {
      promises.push(this.client.disconnect())
    }

    if (this.pubClient) {
      promises.push(this.pubClient.disconnect())
    }

    if (this.subClient) {
      promises.push(this.subClient.disconnect())
    }

    await Promise.all(promises)
    this.isConnected = false
    console.log('[UnifiedRedisClient] 所有连接已关闭')
  }

  /**
   * 获取连接状态
   */
  getStatus () {
    return {
      isConnected: this.isConnected,
      config: {
        host: this.config.host,
        port: this.config.port,
        db: this.config.db
      },
      clients: {
        main: this.client.status,
        pub: this.pubClient.status,
        sub: this.subClient.status
      }
    }
  }
}

// 创建单例实例
let redisClient = null

/**
 * 获取统一Redis客户端实例
 * @returns {UnifiedRedisClient} Redis客户端实例
 */
function getRedisClient () {
  if (!redisClient) {
    redisClient = new UnifiedRedisClient()
  }
  return redisClient
}

/**
 * 获取原生ioredis客户端（向后兼容）
 * @returns {Redis} 原生ioredis客户端
 */
function getRawClient () {
  return getRedisClient().getClient()
}

/**
 * 快速健康检查
 * @returns {Promise<boolean>} 连接是否健康
 */
async function isRedisHealthy () {
  try {
    const client = getRedisClient()
    return await client.healthCheck()
  } catch (error) {
    return false
  }
}

// 导出接口
module.exports = {
  UnifiedRedisClient,
  getRedisClient,
  getRawClient,
  isRedisHealthy
}
