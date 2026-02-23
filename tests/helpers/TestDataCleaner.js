/**
 * 统一测试数据清理器 - TestDataCleaner
 *
 * 创建时间：2026-01-29
 * 版本：1.0.0
 *
 * 职责：
 * - 提供统一的测试数据清理机制
 * - 支持注册需要清理的数据库记录
 * - 自动在 afterEach/afterAll 中执行清理
 * - 避免测试数据累积污染数据库
 *
 * 设计原则：
 * - 单例模式：全局共享一个清理器实例
 * - 延迟加载：模型按需加载，避免循环依赖
 * - 容错设计：清理失败不影响测试结果
 * - 日志追踪：记录清理操作便于调试
 *
 * 使用方式：
 * ```javascript
 * const { testCleaner, registerCleanup, cleanupAfterEach, cleanupAfterAll } = require('../helpers/TestDataCleaner')
 *
 * // 方式1：手动注册清理
 * const item = await Item.create({ ... })
 * registerCleanup('Item', 'item_id', item.item_id)
 *
 * // 方式2：使用便捷方法创建并自动注册
 * const order = await testCleaner.createAndRegister('TradeOrder', orderData)
 *
 * // 方式3：在 afterEach/afterAll 中自动清理
 * afterEach(cleanupAfterEach)
 * afterAll(cleanupAfterAll)
 * ```
 */

'use strict'

/**
 * 模型名称到主键字段的映射
 * 用于自动确定清理时使用的主键字段
 */
const MODEL_PRIMARY_KEYS = {
  // 核心业务模型
  User: 'user_id',
  Item: 'item_id',
  ItemTemplate: 'item_template_id',
  MarketListing: 'market_listing_id',
  TradeOrder: 'order_id',

  // 资产相关
  AccountAssetBalance: 'balance_id',
  AssetTransaction: 'transaction_id',
  Account: 'account_id',

  // 抽奖相关
  LotteryCampaign: 'lottery_campaign_id',
  LotteryRecord: 'record_id',
  LotteryPrize: 'lottery_prize_id',

  // 会话和消息
  CustomerSession: 'session_id',
  ChatMessage: 'message_id',

  // 幂等性
  ApiIdempotencyRequest: 'idempotency_key',

  // 图片资源
  ImageResources: 'resource_id',

  // 门店
  Store: 'store_id'
}

/**
 * 测试数据清理器类
 */
class TestDataCleaner {
  constructor() {
    /**
     * 待清理的数据记录
     * 结构：Map<modelName, Array<{ idField, idValue }>>
     */
    this._pendingCleanup = new Map()

    /**
     * 模型缓存（延迟加载）
     */
    this._modelCache = null

    /**
     * 清理统计
     */
    this._stats = {
      registered: 0,
      cleaned: 0,
      failed: 0
    }

    /**
     * 是否启用详细日志
     */
    this._verbose = process.env.TEST_CLEANER_VERBOSE === 'true'
  }

  /**
   * 获取模型（延迟加载）
   * @private
   */
  _getModels() {
    if (!this._modelCache) {
      try {
        this._modelCache = require('../../models')
      } catch (error) {
        console.error('❌ [TestDataCleaner] 加载模型失败:', error.message)
        this._modelCache = {}
      }
    }
    return this._modelCache
  }

  /**
   * 获取模型的主键字段
   * @param {string} modelName - 模型名称
   * @returns {string} 主键字段名
   */
  getPrimaryKey(modelName) {
    return MODEL_PRIMARY_KEYS[modelName] || 'id'
  }

  /**
   * 注册待清理的数据
   *
   * @param {string} modelName - 模型名称（如 'Item', 'TradeOrder'）
   * @param {string} idField - 主键字段名（如 'item_id'）
   * @param {number|string} idValue - 主键值
   *
   * @example
   * // 创建数据后注册清理
   * const item = await Item.create({ ... })
   * testCleaner.register('Item', 'item_id', item.item_id)
   */
  register(modelName, idField, idValue) {
    if (!idValue) {
      this._log('warn', `跳过注册：${modelName} 的 ${idField} 为空`)
      return
    }

    if (!this._pendingCleanup.has(modelName)) {
      this._pendingCleanup.set(modelName, [])
    }

    this._pendingCleanup.get(modelName).push({ idField, idValue })
    this._stats.registered++

    this._log('debug', `注册清理: ${modelName}.${idField}=${idValue}`)
  }

  /**
   * 注册待清理的数据（简化版，自动推断主键字段）
   *
   * @param {string} modelName - 模型名称
   * @param {number|string} idValue - 主键值
   *
   * @example
   * testCleaner.registerById('Item', item.item_id)
   */
  registerById(modelName, idValue) {
    const idField = this.getPrimaryKey(modelName)
    this.register(modelName, idField, idValue)
  }

  /**
   * 创建记录并自动注册清理
   *
   * @param {string} modelName - 模型名称
   * @param {Object} data - 创建数据
   * @param {Object} options - Sequelize 创建选项
   * @returns {Promise<Object>} 创建的记录
   *
   * @example
   * const order = await testCleaner.createAndRegister('TradeOrder', {
   *   buyer_user_id: userId,
   *   market_listing_id: listingId,
   *   // ...
   * })
   */
  async createAndRegister(modelName, data, options = {}) {
    const models = this._getModels()
    const Model = models[modelName]

    if (!Model) {
      throw new Error(`模型 ${modelName} 不存在`)
    }

    const record = await Model.create(data, options)
    const idField = this.getPrimaryKey(modelName)
    const idValue = record[idField]

    this.register(modelName, idField, idValue)

    return record
  }

  /**
   * 清理指定模型的所有已注册数据
   *
   * @param {string} modelName - 模型名称
   * @returns {Promise<{cleaned: number, failed: number}>} 清理结果
   */
  async cleanupModel(modelName) {
    const records = this._pendingCleanup.get(modelName) || []
    if (records.length === 0) {
      return { cleaned: 0, failed: 0 }
    }

    const models = this._getModels()
    const Model = models[modelName]

    if (!Model) {
      this._log('warn', `模型 ${modelName} 不存在，跳过清理`)
      return { cleaned: 0, failed: records.length }
    }

    let cleaned = 0
    let failed = 0

    for (const { idField, idValue } of records) {
      try {
        await Model.destroy({
          where: { [idField]: idValue },
          force: true // 硬删除
        })
        cleaned++
        this._stats.cleaned++
        this._log('debug', `清理成功: ${modelName}.${idField}=${idValue}`)
      } catch (error) {
        failed++
        this._stats.failed++
        this._log('warn', `清理失败: ${modelName}.${idField}=${idValue} - ${error.message}`)
      }
    }

    // 清空已处理的记录
    this._pendingCleanup.set(modelName, [])

    return { cleaned, failed }
  }

  /**
   * 清理所有已注册的数据
   *
   * @returns {Promise<{total: number, cleaned: number, failed: number}>} 清理结果
   */
  async cleanupAll() {
    const modelNames = Array.from(this._pendingCleanup.keys())
    let totalCleaned = 0
    let totalFailed = 0

    // 按依赖顺序清理（先清理依赖项，再清理被依赖项）
    const cleanupOrder = [
      'ChatMessage',
      'CustomerSession',
      'TradeOrder',
      'MarketListing',
      'Item',
      'AssetTransaction',
      'AccountAssetBalance',
      'LotteryRecord',
      'ApiIdempotencyRequest',
      // 其他模型
      ...modelNames.filter(
        name =>
          ![
            'ChatMessage',
            'CustomerSession',
            'TradeOrder',
            'MarketListing',
            'Item',
            'AssetTransaction',
            'AccountAssetBalance',
            'LotteryRecord',
            'ApiIdempotencyRequest'
          ].includes(name)
      )
    ]

    for (const modelName of cleanupOrder) {
      if (this._pendingCleanup.has(modelName)) {
        const result = await this.cleanupModel(modelName)
        totalCleaned += result.cleaned
        totalFailed += result.failed
      }
    }

    const total = totalCleaned + totalFailed
    if (total > 0) {
      this._log('info', `清理完成: ${totalCleaned}/${total} 成功, ${totalFailed} 失败`)
    }

    return { total, cleaned: totalCleaned, failed: totalFailed }
  }

  /**
   * 获取清理统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this._stats,
      pending: this.getPendingCount()
    }
  }

  /**
   * 获取待清理记录数量
   * @returns {number}
   */
  getPendingCount() {
    let count = 0
    for (const records of this._pendingCleanup.values()) {
      count += records.length
    }
    return count
  }

  /**
   * 重置清理器状态
   */
  reset() {
    this._pendingCleanup.clear()
    this._stats = { registered: 0, cleaned: 0, failed: 0 }
  }

  /**
   * 日志输出
   * @private
   */
  _log(level, message) {
    const prefix = '🧹 [TestDataCleaner]'

    if (level === 'debug' && !this._verbose) {
      return // 非详细模式下跳过 debug 日志
    }

    switch (level) {
      case 'info':
        console.log(`${prefix} ${message}`)
        break
      case 'warn':
        console.warn(`${prefix} ⚠️ ${message}`)
        break
      case 'error':
        console.error(`${prefix} ❌ ${message}`)
        break
      case 'debug':
        console.log(`${prefix} 🔍 ${message}`)
        break
    }
  }
}

// ========== 单例实例 ==========

/**
 * 全局测试数据清理器实例
 */
const testCleaner = new TestDataCleaner()

// ========== 便捷函数 ==========

/**
 * 注册待清理的数据（便捷函数）
 *
 * @param {string} modelName - 模型名称
 * @param {string} idField - 主键字段名
 * @param {number|string} idValue - 主键值
 */
function registerCleanup(modelName, idField, idValue) {
  testCleaner.register(modelName, idField, idValue)
}

/**
 * 注册待清理的数据（简化版，便捷函数）
 *
 * @param {string} modelName - 模型名称
 * @param {number|string} idValue - 主键值
 */
function registerCleanupById(modelName, idValue) {
  testCleaner.registerById(modelName, idValue)
}

/**
 * afterEach 钩子中调用的清理函数
 * 清理当前测试创建的所有数据
 *
 * @example
 * afterEach(cleanupAfterEach)
 */
async function cleanupAfterEach() {
  await testCleaner.cleanupAll()
}

/**
 * afterAll 钩子中调用的清理函数
 * 清理测试套件创建的所有数据并重置状态
 *
 * @example
 * afterAll(cleanupAfterAll)
 */
async function cleanupAfterAll() {
  await testCleaner.cleanupAll()
  testCleaner.reset()
}

// ========== 导出 ==========

module.exports = {
  // 清理器实例
  testCleaner,
  TestDataCleaner,

  // 便捷函数
  registerCleanup,
  registerCleanupById,
  cleanupAfterEach,
  cleanupAfterAll,

  // 常量
  MODEL_PRIMARY_KEYS
}
