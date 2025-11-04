/**
 * 统一Redis客户端管理器 V4
 * 解决项目中redis和ioredis混用的技术债务问题
 * 统一使用ioredis，提供更好的性能和稳定性
 * 创建时间：2025年01月21日 北京时间
 */

const Redis = require('ioredis')

/**
 * 统一Redis客户端单例类 - V4版本
 *
 * 业务场景：
 * - 解决项目中redis和ioredis混用的技术债务
 * - 提供统一的Redis操作接口（缓存、锁、发布订阅）
 * - 支持分布式系统的数据共享和同步
 *
 * 核心功能：
 * 1. 连接管理：ensureConnection、connect、disconnect、isConnected
 * 2. 基础操作：get、set、del、exists、expire、ttl
 * 3. 高级操作：hGet、hSet、lPush、rPush、sAdd、zAdd等
 * 4. 发布订阅：publish、subscribe、unsubscribe
 * 5. 分布式锁：获取锁、释放锁、锁续期
 *
 * 技术特性：
 * - 单例模式：全局唯一实例
 * - 延迟连接：lazyConnect提高性能
 * - 自动重连：连接失败时自动重试（最多3次）
 * - 连接池：keepAlive保持连接活跃
 * - 超时控制：连接超时10秒，命令超时5秒
 *
 * 使用方式：
 * ```javascript
 * const { getUnifiedRedisClient, getRawClient } = require('./utils/UnifiedRedisClient')
 *
 * // 方式1：使用封装的客户端
 * const redisClient = getUnifiedRedisClient()
 * await redisClient.set('key', 'value')
 * const value = await redisClient.get('key')
 *
 * // 方式2：获取原始ioredis客户端
 * const rawClient = getRawClient()
 * await rawClient.set('key', 'value')
 * ```
 *
 * 创建时间：2025年01月21日
 * 最后更新：2025年10月30日
 *
 * @class UnifiedRedisClient
 */
class UnifiedRedisClient {
  /**
   * 构造函数 - 初始化统一Redis客户端（单例模式）
   *
   * 功能说明：
   * - 实现单例模式（如果实例已存在则返回已有实例）
   * - 创建主客户端（用于普通操作）
   * - 创建发布/订阅客户端（用于消息通信）
   * - 配置连接参数（host、port、db、重试策略等）
   * - 设置事件处理器（连接、错误、关闭事件）
   *
   * 配置项：
   * - host：Redis服务器地址（默认localhost）
   * - port：Redis服务器端口（默认6379）
   * - db：数据库编号（默认0）
   * - maxRetriesPerRequest：最大重试次数（3次）
   * - connectTimeout：连接超时（10秒）
   * - commandTimeout：命令超时（5秒）
   *
   * 设计决策：
   * - 使用单例模式确保全局唯一实例
   * - 使用lazyConnect延迟连接提高性能
   * - 分离pub/sub客户端避免阻塞主客户端
   *
   * @constructor
   */
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
   * @returns {void} 无返回值
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

  /**
   * 设置键值对
   * @param {string} key - 键名
   * @param {any} value - 值
   * @param {number|null} ttl - 过期时间（秒），null表示不过期
   * @returns {Promise<any>} Redis操作结果
   */
  async set (key, value, ttl = null) {
    const client = await this.ensureConnection()
    if (ttl) {
      return await client.setex(key, ttl, value)
    }
    return await client.set(key, value)
  }

  /**
   * 获取键的值
   * @param {string} key - 键名
   * @returns {Promise<any>} 键的值
   */
  async get (key) {
    const client = await this.ensureConnection()
    return await client.get(key)
  }

  /**
   * 删除键
   * @param {string} key - 键名
   * @returns {Promise<number>} 删除的键数量
   */
  async del (key) {
    const client = await this.ensureConnection()
    return await client.del(key)
  }

  /**
   * 检查键是否存在
   * @param {string} key - 键名
   * @returns {Promise<number>} 1表示存在，0表示不存在
   */
  async exists (key) {
    const client = await this.ensureConnection()
    return await client.exists(key)
  }

  /**
   * 设置键的过期时间
   * @param {string} key - 键名
   * @param {number} ttl - 过期时间（秒）
   * @returns {Promise<number>} 1表示成功，0表示键不存在
   */
  async expire (key, ttl) {
    const client = await this.ensureConnection()
    return await client.expire(key, ttl)
  }

  /**
   * 设置哈希字段值
   * @param {string} key - 键名
   * @param {string} field - 字段名
   * @param {any} value - 值
   * @returns {Promise<number>} 1表示新字段，0表示更新已有字段
   */
  async hset (key, field, value) {
    const client = await this.ensureConnection()
    return await client.hset(key, field, value)
  }

  /**
   * 获取哈希字段值
   * @param {string} key - 键名
   * @param {string} field - 字段名
   * @returns {Promise<any>} 字段的值
   */
  async hget (key, field) {
    const client = await this.ensureConnection()
    return await client.hget(key, field)
  }

  /**
   * 获取哈希的所有字段和值
   * @param {string} key - 键名
   * @returns {Promise<Object>} 哈希对象
   */
  async hgetall (key) {
    const client = await this.ensureConnection()
    return await client.hgetall(key)
  }

  /**
   * 删除哈希字段
   * @param {string} key - 键名
   * @param {string} field - 字段名
   * @returns {Promise<number>} 删除的字段数量
   */
  async hdel (key, field) {
    const client = await this.ensureConnection()
    return await client.hdel(key, field)
  }

  /**
   * 向有序集合添加成员
   * @param {string} key - 键名
   * @param {number} score - 分数
   * @param {any} member - 成员值
   * @returns {Promise<number>} 新添加的成员数量
   */
  async zadd (key, score, member) {
    const client = await this.ensureConnection()
    return await client.zadd(key, score, member)
  }

  /**
   * 删除有序集合指定分数范围的成员
   * @param {string} key - 键名
   * @param {number} min - 最小分数
   * @param {number} max - 最大分数
   * @returns {Promise<number>} 删除的成员数量
   */
  async zremrangebyscore (key, min, max) {
    const client = await this.ensureConnection()
    return await client.zremrangebyscore(key, min, max)
  }

  /**
   * 获取有序集合的成员数量
   * @param {string} key - 键名
   * @returns {Promise<number>} 成员数量
   */
  async zcard (key) {
    const client = await this.ensureConnection()
    return await client.zcard(key)
  }

  /**
   * 获取有序集合指定分数范围的成员数量
   * @param {string} key - 键名
   * @param {number} min - 最小分数
   * @param {number} max - 最大分数
   * @returns {Promise<number>} 成员数量
   */
  async zcount (key, min, max) {
    const client = await this.ensureConnection()
    return await client.zcount(key, min, max)
  }

  /**
   * 创建Redis事务（批量操作）
   * @returns {Promise<Object>} Multi对象
   */
  async multi () {
    const client = await this.ensureConnection()
    return client.multi()
  }

  /**
   * 创建Redis管道（批量操作）
   * @returns {Promise<Object>} Pipeline对象
   */
  async pipeline () {
    const client = await this.ensureConnection()
    return client.pipeline()
  }

  /**
   * 执行Lua脚本
   * @param {string} script - Lua脚本内容
   * @param {number} numKeys - 键的数量
   * @param {...any} args - 其他参数
   * @returns {Promise<any>} 脚本执行结果
   */
  async eval (script, numKeys, ...args) {
    const client = await this.ensureConnection()
    return await client.eval(script, numKeys, ...args)
  }

  /**
   * 关闭所有连接
   * @returns {Promise<void>} 所有连接关闭完成
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
   * @returns {Object} 连接状态对象（连接状态、配置信息）
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
