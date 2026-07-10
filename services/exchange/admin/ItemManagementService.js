'use strict'

/**
 * 兑换市场管理 - 商品运营操作服务
 *
 * 职责范围（2026-07-11 写路径收口后）：
 * - pinItem(): 置顶/取消置顶商品
 * - recommendItem(): 推荐/取消推荐商品
 * - batchUpdateSort(): 批量调整商品排序
 *
 * ⚠️ 写路径收口说明（2026-07-11 暴力重构，方案文档 §十二-C.8）：
 * 商品 CRUD（创建/更新/删除）的唯一权威写路径 = ExchangeItemService
 * （createExchangeItem/updateExchangeItem/deleteExchangeItem，routes/v4/console/exchange/items.js 使用）。
 * 本服务原有的同名 CRUD 副本（含 _logStockChange/_cascadeDeleteItemChildren/_updateSpuSummary
 * 私有方法）为路由从未使用的死代码双轨，已整体删除——单一写路径，铸造模板守卫/缓存失效
 * 等业务规则只需在权威路径维护一份。
 *
 * @module services/exchange/admin/ItemManagementService
 */

const BusinessError = require('../../../utils/BusinessError')
const { BusinessCacheHelper } = require('../../../utils/BusinessCacheHelper')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const { assertAndGetTransaction } = require('../../../utils/transactionHelpers')

/**
 * 兑换市场管理 - 商品运营操作服务（实例服务，依赖 models）
 */
class ItemManagementService {
  /**
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
    this.ExchangeItem = models.ExchangeItem
    this.sequelize = models.sequelize
  }

  /**
   * 置顶/取消置顶商品
   *
   * @param {number} exchange_item_id - 商品ID
   * @param {boolean} [is_pinned] - 目标置顶状态（不传则取反当前值）
   * @param {Object} options - 选项（必须含 transaction）
   * @returns {Promise<Object>} { exchange_item_id, is_pinned }
   */
  async pinItem(exchange_item_id, is_pinned, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ItemManagementService.pinItem')
    const item = await this.ExchangeItem.findByPk(exchange_item_id, {
      lock: transaction.LOCK.UPDATE,
      transaction
    })
    if (!item) {
      throw new BusinessError('商品不存在', 'EXCHANGE_ITEM_NOT_FOUND', 404)
    }
    const pinned = is_pinned !== undefined ? !!is_pinned : !item.is_pinned
    await item.update(
      {
        is_pinned: pinned,
        pinned_at: pinned ? BeijingTimeHelper.createDatabaseTime() : null
      },
      { transaction }
    )
    return { exchange_item_id, is_pinned: pinned }
  }

  /**
   * 推荐/取消推荐商品
   *
   * @param {number} exchange_item_id - 商品ID
   * @param {boolean} [is_recommended] - 目标推荐状态（不传则取反当前值）
   * @param {Object} options - 选项（必须含 transaction）
   * @returns {Promise<Object>} { exchange_item_id, is_recommended }
   */
  async recommendItem(exchange_item_id, is_recommended, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ItemManagementService.recommendItem')
    const item = await this.ExchangeItem.findByPk(exchange_item_id, {
      lock: transaction.LOCK.UPDATE,
      transaction
    })
    if (!item) {
      throw new BusinessError('商品不存在', 'EXCHANGE_ITEM_NOT_FOUND', 404)
    }
    const recommended = is_recommended !== undefined ? !!is_recommended : !item.is_recommended
    await item.update({ is_recommended: recommended }, { transaction })
    return { exchange_item_id, is_recommended: recommended }
  }

  /**
   * 批量调整商品排序
   *
   * @param {Array<{exchange_item_id:number, sort_order:number}>} items - 排序项
   * @param {Object} options - 选项（必须含 transaction）
   * @returns {Promise<Object>} { updated_count }
   */
  async batchUpdateSort(items, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ItemManagementService.batchUpdateSort')
    const valid = items.filter(
      ({ exchange_item_id, sort_order }) => exchange_item_id && sort_order !== undefined
    )
    for (const { exchange_item_id, sort_order } of valid) {
      // 同一事务内的顺序写：禁止 Promise.all（事务内并发写冲突）
      // eslint-disable-next-line no-await-in-loop
      await this.ExchangeItem.update(
        { sort_order: parseInt(sort_order, 10) },
        { where: { exchange_item_id }, transaction }
      )
    }
    await BusinessCacheHelper.invalidateExchangeItems('batch_sort')
    return { updated_count: valid.length }
  }
}

module.exports = ItemManagementService
