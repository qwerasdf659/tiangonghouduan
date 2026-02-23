/**
 * 物品全链路追踪服务（ItemLifecycleService）
 *
 * @description 根据 tracking_code 或 item_id 查询物品完整生命周期
 * @module services/asset/ItemLifecycleService
 * @version 1.0.0
 * @date 2026-02-22
 *
 * 职责范围：
 * - 全链路查询：getItemLifecycle（物品信息 + 来源 + 时间线 + 对账状态）
 * - 对账验证：reconcileItems / reconcileAssets
 * - 用户端时间线：getUserItemTimeline
 *
 * 服务类型：静态类（无需实例化）
 * 服务键名：asset_item_lifecycle
 */

'use strict'

const logger = require('../../utils/logger')
const TrackingCodeGenerator = require('../../utils/TrackingCodeGenerator')

/**
 * 物品全链路追踪服务
 *
 * @class ItemLifecycleService
 */
class ItemLifecycleService {
  /**
   * 获取物品完整生命周期（管理后台用）
   *
   * 返回结构对应架构文档 7.7 节的响应格式
   *
   * @param {string} identifier - tracking_code 或 item_id
   * @param {Object} [options] - 选项
   * @returns {Promise<Object|null>} 完整生命周期数据
   */
  static async getItemLifecycle(identifier, options = {}) {
    const { transaction } = options
    const { Item, ItemLedger, ItemHold, Account, LotteryDraw } = require('../../models')

    const resolved = TrackingCodeGenerator.resolveIdentifier(identifier)

    const where =
      resolved.type === 'tracking_code'
        ? { tracking_code: resolved.value }
        : { item_id: resolved.value }

    const item = await Item.findOne({ where, transaction })
    if (!item) return null

    // 获取账本条目（完整流转历史）
    const ledgerEntries = await ItemLedger.findAll({
      where: { item_id: item.item_id },
      order: [['created_at', 'ASC']],
      transaction
    })

    // 获取锁定历史
    const holds = await ItemHold.findAll({
      where: { item_id: item.item_id },
      order: [['created_at', 'ASC']],
      transaction
    })

    // 获取持有者信息
    const ownerAccount = await Account.findByPk(item.owner_account_id, { transaction })

    // 构建来源信息
    const origin = await this._buildOriginInfo(item, { transaction, LotteryDraw })

    // 构建时间线
    const timeline = this._buildTimeline(ledgerEntries, holds)

    // 对账验证（单物品守恒检查）
    const deltaSum = ledgerEntries.reduce((sum, entry) => sum + entry.delta, 0)

    return {
      tracking_code: item.tracking_code,
      item_id: item.item_id,
      item_name: item.item_name,
      item_type: item.item_type,
      item_value: item.item_value,
      item_description: item.item_description,
      rarity_code: item.rarity_code,
      status: item.status,
      owner_account_id: item.owner_account_id,
      owner_type: ownerAccount ? ownerAccount.account_type : 'unknown',
      source: item.source,
      source_ref_id: item.source_ref_id,
      created_at: item.created_at,
      origin,
      timeline,
      holds: holds.map(h => (h.toJSON ? h.toJSON() : h)),
      ledger_check: {
        sum_delta: deltaSum,
        entry_count: ledgerEntries.length,
        status: deltaSum === 0 ? 'balanced' : 'IMBALANCED'
      }
    }
  }

  /**
   * 物品守恒对账（批量）
   *
   * @returns {Promise<Object>} 对账结果
   */
  static async reconcileItems() {
    const { sequelize } = require('../../models')

    // 物品守恒：SUM(delta) GROUP BY item_id 是否全为 0
    const [imbalanced] = await sequelize.query(`
      SELECT item_id, SUM(delta) AS balance
      FROM item_ledger
      GROUP BY item_id
      HAVING balance != 0
    `)

    // 持有者一致性（严格检查非 legacy 物品，legacy 物品单独统计）
    const [ownerMismatchStrict] = await sequelize.query(`
      SELECT l.item_id, l.account_id AS ledger_owner, i.owner_account_id AS cache_owner
      FROM (
        SELECT item_id, account_id
        FROM item_ledger
        WHERE (item_id, account_id) IN (
          SELECT item_id, account_id FROM item_ledger
          GROUP BY item_id, account_id
          HAVING SUM(delta) = 1
        )
      ) l
      JOIN items i ON l.item_id = i.item_id
      WHERE l.account_id != i.owner_account_id AND i.source != 'legacy'
    `)

    const [[{ legacy_mismatch: legacyMismatchCount }]] = await sequelize.query(`
      SELECT COUNT(*) AS legacy_mismatch
      FROM (
        SELECT item_id, account_id
        FROM item_ledger
        WHERE (item_id, account_id) IN (
          SELECT item_id, account_id FROM item_ledger
          GROUP BY item_id, account_id
          HAVING SUM(delta) = 1
        )
      ) l
      JOIN items i ON l.item_id = i.item_id
      WHERE l.account_id != i.owner_account_id AND i.source = 'legacy'
    `)

    // 铸造数量一致性：只检查非 legacy 物品是否都有对应的 mint 入账
    const [[{ orphan_count: orphanItemCount }]] = await sequelize.query(`
      SELECT COUNT(*) AS orphan_count
      FROM items i
      WHERE i.source != 'legacy'
        AND NOT EXISTS (
          SELECT 1 FROM item_ledger il
          WHERE il.item_id = i.item_id AND il.event_type = 'mint' AND il.delta = 1
        )
    `)
    const [[{ total_items: totalItems }]] = await sequelize.query(
      'SELECT COUNT(*) AS total_items FROM items'
    )
    const [[{ legacy_count: legacyCount }]] = await sequelize.query(
      "SELECT COUNT(*) AS legacy_count FROM items WHERE source = 'legacy'"
    )
    const [[{ no_ledger: noLedgerCount }]] = await sequelize.query(
      'SELECT COUNT(*) AS no_ledger FROM items WHERE item_id NOT IN (SELECT DISTINCT item_id FROM item_ledger)'
    )

    return {
      checked_at: new Date().toISOString(),
      item_conservation: {
        status: imbalanced.length === 0 ? 'PASS' : 'FAIL',
        imbalanced_count: imbalanced.length,
        imbalanced_items: imbalanced.slice(0, 20)
      },
      owner_consistency: {
        status: ownerMismatchStrict.length === 0 ? 'PASS' : 'FAIL',
        mismatch_count: ownerMismatchStrict.length,
        mismatches: ownerMismatchStrict.slice(0, 20),
        legacy_mismatches: Number(legacyMismatchCount)
      },
      mint_count_consistency: {
        status: Number(orphanItemCount) === 0 ? 'PASS' : 'FAIL',
        total_items: Number(totalItems),
        legacy_items: Number(legacyCount),
        items_without_mint: Number(orphanItemCount),
        items_without_any_ledger: Number(noLedgerCount)
      }
    }
  }

  /**
   * 资产守恒对账
   *
   * @returns {Promise<Object>} 对账结果
   */
  static async reconcileAssets() {
    const { sequelize } = require('../../models')

    // 全局守恒：SUM(delta_amount) GROUP BY asset_code 是否全为 0
    const [globalCheck] = await sequelize.query(`
      SELECT asset_code, SUM(delta_amount) AS total_delta
      FROM asset_transactions
      GROUP BY asset_code
    `)

    // 账户余额一致性（排除 BIGINT 溢出记录）
    const [balanceMismatch] = await sequelize.query(`
      SELECT 
        b.account_id, b.asset_code,
        (b.available_amount + b.frozen_amount) AS recorded_balance,
        COALESCE(t.tx_sum, 0) AS calculated_balance,
        (b.available_amount + b.frozen_amount) - COALESCE(t.tx_sum, 0) AS difference
      FROM account_asset_balances b
      LEFT JOIN (
        SELECT account_id, asset_code, SUM(delta_amount) AS tx_sum
        FROM asset_transactions
        WHERE delta_amount > -9000000000000000000
        GROUP BY account_id, asset_code
      ) t ON b.account_id = t.account_id AND b.asset_code = t.asset_code
      HAVING difference != 0
      LIMIT 50
    `)

    return {
      checked_at: new Date().toISOString(),
      global_conservation: {
        status: globalCheck.every(r => Number(r.total_delta) === 0) ? 'PASS' : 'WARNING',
        by_asset_code: globalCheck.map(r => ({
          asset_code: r.asset_code,
          total_delta: Number(r.total_delta)
        }))
      },
      balance_consistency: {
        status: balanceMismatch.length === 0 ? 'PASS' : 'FAIL',
        mismatch_count: balanceMismatch.length,
        mismatches: balanceMismatch.slice(0, 20)
      }
    }
  }

  /**
   * 获取用户物品时间线（用户端，仅返回与自己相关的记录）
   *
   * @param {number} userId - 用户ID
   * @param {number} itemId - 物品ID
   * @param {Object} [options] - 选项
   * @returns {Promise<Object|null>} 时间线数据
   */
  static async getUserItemTimeline(userId, itemId, options = {}) {
    const { transaction } = options
    const { Item, ItemLedger } = require('../../models')
    const BalanceService = require('./BalanceService')

    const userAccount = await BalanceService.getOrCreateAccount(
      { user_id: userId },
      { transaction }
    )

    const item = await Item.findOne({
      where: { item_id: itemId, owner_account_id: userAccount.account_id },
      transaction
    })

    if (!item) return null

    const entries = await ItemLedger.findAll({
      where: { item_id: itemId },
      order: [['created_at', 'ASC']],
      transaction
    })

    // 只返回与该用户相关的条目
    const userEntries = entries.filter(
      e => e.account_id === userAccount.account_id || e.counterpart_id === userAccount.account_id
    )

    return {
      tracking_code: item.tracking_code,
      item_name: item.item_name,
      item_type: item.item_type,
      status: item.status,
      timeline: userEntries.map(e => ({
        time: e.created_at,
        event: e.event_type,
        direction:
          e.account_id === userAccount.account_id ? (e.delta > 0 ? 'in' : 'out') : 'related',
        business_type: e.business_type
      }))
    }
  }

  // ========== 内部辅助方法 ==========

  /**
   * 构建来源信息（关联抽奖记录等上游数据）
   *
   * @param {Object} item - 物品实例
   * @param {Object} [options] - 选项（含 transaction、LotteryDraw 模型）
   * @returns {Promise<Object>} 来源信息
   * @private
   */
  static async _buildOriginInfo(item, options = {}) {
    const { transaction, LotteryDraw } = options
    const origin = {
      source: item.source,
      source_ref_id: item.source_ref_id
    }

    if (item.source === 'lottery' && item.source_ref_id && LotteryDraw) {
      try {
        const draw = await LotteryDraw.findOne({
          where: { lottery_draw_id: item.source_ref_id },
          attributes: ['lottery_draw_id', 'lottery_campaign_id', 'prize_name', 'created_at'],
          transaction
        })
        if (draw) {
          origin.lottery_draw_id = draw.lottery_draw_id
          origin.lottery_campaign_id = draw.lottery_campaign_id
          origin.prize_name = draw.prize_name
          origin.won_at = draw.created_at
        }
      } catch (err) {
        logger.warn('获取抽奖来源信息失败（非致命）', { error: err.message })
      }
    }

    return origin
  }

  /**
   * 从账本和锁定记录构建时间线（按时间排序）
   *
   * @param {Array} ledgerEntries - 账本条目数组
   * @param {Array} holds - 锁定记录数组
   * @returns {Array<Object>} 按时间排序的事件时间线
   * @private
   */
  static _buildTimeline(ledgerEntries, holds) {
    const events = []

    // 只取入账方的记录避免重复（双录中 delta=+1 的一方）
    const inEntries = ledgerEntries.filter(e => e.delta === 1)
    for (const entry of inEntries) {
      events.push({
        time: entry.created_at,
        event: entry.event_type,
        business_type: entry.business_type,
        detail: this._describeEvent(entry)
      })
    }

    for (const hold of holds) {
      events.push({
        time: hold.created_at,
        event: 'hold',
        business_type: `hold_${hold.hold_type}`,
        detail: `${hold.hold_type} 锁定（ref: ${hold.holder_ref}）`
      })

      if (hold.released_at) {
        events.push({
          time: hold.released_at,
          event: 'release',
          business_type: `release_${hold.hold_type}`,
          detail: `${hold.hold_type} 释放（${hold.status}）`
        })
      }
    }

    events.sort((a, b) => new Date(a.time) - new Date(b.time))
    return events
  }

  /**
   * 生成事件描述文本（中文，用于管理后台展示）
   *
   * @param {Object} entry - 账本条目
   * @returns {string} 事件描述
   * @private
   */
  static _describeEvent(entry) {
    const descriptions = {
      mint: '铸造',
      transfer: '所有权转移',
      use: '使用/核销',
      expire: '自动过期',
      destroy: '销毁'
    }
    return `${descriptions[entry.event_type] || entry.event_type}（${entry.business_type}）`
  }
}

module.exports = ItemLifecycleService
