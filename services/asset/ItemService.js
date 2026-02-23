/**
 * 物品操作服务 — 三表模型双录记账版
 *
 * @description 处理所有物品生命周期操作，写入 items + item_ledger + item_holds 三表
 * @module services/asset/ItemService
 * @version 2.0.0
 * @date 2026-02-22
 *
 * 核心变化（从 V1 升级）：
 * - 铸造/转移/消耗 同时写 items 缓存 + item_ledger 双录
 * - 锁定/解锁 操作 item_holds 独立表（替代 JSON locks）
 * - SUM(delta) GROUP BY item_id == 0 即可验证物品守恒
 * - tracking_code 人类可读唯一标识
 *
 * 双录规则（每次操作写 2 条 item_ledger 记录）：
 * - 铸造：SYSTEM_MINT(-1) + 用户(+1)
 * - 转移：卖方(-1) + 买方(+1)
 * - 使用/过期/销毁：用户(-1) + SYSTEM_BURN(+1)
 *
 * 服务类型：静态类（无需实例化）
 * 服务键名：asset_item
 *
 * 依赖：Item, ItemLedger, ItemHold, Account（三表模型 + 统一账户体系）
 */

'use strict'

const { Op } = require('sequelize')
const logger = require('../../utils/logger')
const { requireTransaction } = require('../../utils/transactionHelpers')
const { attachDisplayNames, DICT_TYPES } = require('../../utils/displayNameHelper')
const TrackingCodeGenerator = require('../../utils/TrackingCodeGenerator')

/**
 * 物品操作服务类（三表模型双录版）
 *
 * @class ItemService
 */
class ItemService {
  /**
   * 铸造物品（抽奖/发放/竞价结算/管理员赠送）
   *
   * 双录写入：SYSTEM_MINT delta=-1 + 用户 delta=+1
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 目标用户ID（物品所有者）
   * @param {string} params.item_type - 物品类型（voucher/product/service）
   * @param {string} params.source - 物品来源（lottery/bid_settlement/exchange/admin/test）
   * @param {string} params.source_ref_id - 来源关联ID（lottery_draw_id / bid_product_id）
   * @param {string} params.item_name - 物品名称
   * @param {string} [params.item_description] - 物品描述
   * @param {number} [params.item_value=0] - 物品价值（积分计）
   * @param {number} [params.prize_definition_id] - 奖品定义ID
   * @param {string} [params.rarity_code='common'] - 稀有度代码
   * @param {string} params.business_type - 业务类型（lottery_mint/bid_settlement_mint 等）
   * @param {string} params.idempotency_key - 幂等键（调用方提供，如 lottery_session:item）
   * @param {Object} [params.meta] - 扩展元数据
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（强制要求）
   * @returns {Promise<{ item: Object, is_duplicate: boolean }>} 铸造结果
   */
  static async mintItem(params, options = {}) {
    const {
      user_id,
      item_type,
      source,
      source_ref_id,
      item_name,
      item_description,
      item_value = 0,
      prize_definition_id,
      rarity_code = 'common',
      business_type = 'lottery_mint',
      idempotency_key,
      meta = {}
    } = params
    const { transaction } = options

    requireTransaction(transaction, 'ItemService.mintItem')

    if (!user_id) throw new Error('user_id 是必填参数')
    if (!item_type) throw new Error('item_type 是必填参数')
    if (!item_name) throw new Error('item_name 是必填参数')
    if (!source) throw new Error('source 是必填参数')
    if (!idempotency_key) throw new Error('idempotency_key 是必填参数（幂等性控制）')

    const { Item, ItemLedger, Account } = require('../../models')

    try {
      // 幂等性检查：查找已有的铸造账本条目
      const existingEntry = await ItemLedger.findOne({
        where: {
          event_type: 'mint',
          business_type,
          idempotency_key: `${idempotency_key}:in`
        },
        transaction
      })

      if (existingEntry) {
        logger.info('⚠️ 幂等性检查：物品已铸造，返回原结果', {
          service: 'ItemService',
          method: 'mintItem',
          idempotency_key,
          item_id: existingEntry.item_id
        })
        const existingItem = await Item.findByPk(existingEntry.item_id, { transaction })
        return { item: existingItem, is_duplicate: true }
      }

      // 获取用户账户和系统铸造账户
      const userAccount = await this._getUserAccount(user_id, { transaction })
      const mintAccount = await Account.getSystemAccount('SYSTEM_MINT', { transaction })

      // 1. 创建 items 缓存记录
      const item = await Item.create(
        {
          tracking_code: 'TEMP', // 先占位，拿到 item_id 后回填
          owner_account_id: userAccount.account_id,
          status: 'available',
          item_type,
          item_name,
          item_description: item_description || '',
          item_value: Math.round(item_value) || 0,
          prize_definition_id: prize_definition_id || null,
          rarity_code,
          source,
          source_ref_id: source_ref_id || null
        },
        { transaction }
      )

      // 2. 生成 tracking_code 并回填
      const trackingCode = TrackingCodeGenerator.generate({
        item_id: item.item_id,
        source,
        created_at: item.created_at
      })
      await item.update({ tracking_code: trackingCode }, { transaction })

      // 3. 双录写入 item_ledger（SYSTEM_MINT -1 + 用户 +1）
      await ItemLedger.bulkCreate(
        [
          {
            item_id: item.item_id,
            account_id: mintAccount.account_id,
            delta: -1,
            counterpart_id: userAccount.account_id,
            event_type: 'mint',
            operator_type: 'system',
            business_type,
            idempotency_key: `${idempotency_key}:out`,
            meta: { source, source_ref_id, ...meta }
          },
          {
            item_id: item.item_id,
            account_id: userAccount.account_id,
            delta: 1,
            counterpart_id: mintAccount.account_id,
            event_type: 'mint',
            operator_type: 'system',
            business_type,
            idempotency_key: `${idempotency_key}:in`,
            meta: { source, source_ref_id, ...meta }
          }
        ],
        { transaction }
      )

      logger.info('✅ 物品铸造成功（双录）', {
        service: 'ItemService',
        method: 'mintItem',
        item_id: item.item_id,
        tracking_code: trackingCode,
        user_id,
        item_type,
        source,
        business_type
      })

      return { item, is_duplicate: false }
    } catch (error) {
      logger.error('❌ 物品铸造失败', {
        service: 'ItemService',
        method: 'mintItem',
        user_id,
        item_type,
        source,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 锁定物品（交易挂牌/生成兑换码/风控冻结）
   *
   * 锁定不涉及所有权变更，因此不写 item_ledger。
   * 只写 item_holds + 更新 items.status='held'。
   *
   * @param {Object} params - 参数对象
   * @param {number} params.item_id - 物品ID
   * @param {string} params.hold_type - 锁类型（trade/redemption/security）
   * @param {string} params.holder_ref - 持锁方引用（订单ID/兑换码ID/风控案件ID）
   * @param {Date} [params.expires_at] - 过期时间（security 类型可不传，表示永不过期）
   * @param {string} [params.reason] - 锁定原因
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（强制要求）
   * @returns {Promise<{ item: Object, hold: Object }>} 锁定结果
   */
  static async holdItem(params, options = {}) {
    const { item_id, hold_type, holder_ref, expires_at, reason } = params
    const { transaction } = options

    requireTransaction(transaction, 'ItemService.holdItem')

    if (!item_id) throw new Error('item_id 是必填参数')
    if (!hold_type) throw new Error('hold_type 是必填参数')
    if (!holder_ref) throw new Error('holder_ref 是必填参数')

    const { Item, ItemHold } = require('../../models')

    try {
      // 悲观锁获取物品
      const item = await Item.findByPk(item_id, {
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!item) throw new Error(`物品不存在：item_id=${item_id}`)
      if (item.isTerminal()) throw new Error(`物品已终态(${item.status})，不可锁定`)

      // 检查是否已有活跃锁
      const activeHold = await ItemHold.findOne({
        where: { item_id, status: 'active' },
        transaction
      })

      const priority = ItemHold.HOLD_PRIORITY[hold_type] || 1

      if (activeHold) {
        const { canOverride, reason: overrideReason } = activeHold.canBeOverriddenBy(hold_type)
        if (!canOverride) {
          throw new Error(
            `物品已被 ${activeHold.hold_type} 锁定（ref: ${activeHold.holder_ref}），${overrideReason}`
          )
        }
        // 高优先级覆盖：标记旧锁为 overridden
        await activeHold.update(
          {
            status: 'overridden',
            released_at: new Date(),
            reason: `被 ${hold_type} 覆盖`
          },
          { transaction }
        )

        logger.warn('⚠️ 高优先级锁覆盖', {
          service: 'ItemService',
          method: 'holdItem',
          item_id,
          old_type: activeHold.hold_type,
          new_type: hold_type
        })
      }

      // 创建新锁定记录
      const hold = await ItemHold.create(
        {
          item_id,
          hold_type,
          holder_ref,
          priority,
          status: 'active',
          reason: reason || `${hold_type} 锁定`,
          expires_at: expires_at || null
        },
        { transaction }
      )

      // 更新 items 缓存状态
      await item.update({ status: 'held' }, { transaction })

      logger.info('✅ 物品锁定成功', {
        service: 'ItemService',
        method: 'holdItem',
        item_id,
        hold_type,
        holder_ref,
        hold_id: hold.hold_id
      })

      return { item: await item.reload({ transaction }), hold }
    } catch (error) {
      logger.error('❌ 物品锁定失败', {
        service: 'ItemService',
        method: 'holdItem',
        item_id,
        hold_type,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 释放锁定
   *
   * @param {Object} params - 参数对象
   * @param {number} params.item_id - 物品ID
   * @param {string} params.holder_ref - 持锁方引用（精确匹配）
   * @param {string} params.hold_type - 锁类型（精确匹配）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（强制要求）
   * @returns {Promise<Object>} 释放后的物品
   */
  static async releaseHold(params, options = {}) {
    const { item_id, holder_ref, hold_type } = params
    const { transaction } = options

    requireTransaction(transaction, 'ItemService.releaseHold')

    const { Item, ItemHold } = require('../../models')

    try {
      const hold = await ItemHold.findOne({
        where: { item_id, holder_ref, hold_type, status: 'active' },
        transaction
      })

      if (!hold) {
        logger.warn('⚠️ 未找到匹配的活跃锁', {
          service: 'ItemService',
          method: 'releaseHold',
          item_id,
          holder_ref,
          hold_type
        })
        return await Item.findByPk(item_id, { transaction })
      }

      await hold.update(
        {
          status: 'released',
          released_at: new Date()
        },
        { transaction }
      )

      // 检查是否还有其他活跃锁
      const remainingHolds = await ItemHold.count({
        where: { item_id, status: 'active' },
        transaction
      })

      const item = await Item.findByPk(item_id, {
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      // 无其他活跃锁 → 恢复 available
      if (remainingHolds === 0 && item.status === 'held') {
        await item.update({ status: 'available' }, { transaction })
      }

      logger.info('✅ 物品锁定释放成功', {
        service: 'ItemService',
        method: 'releaseHold',
        item_id,
        holder_ref,
        hold_type,
        new_status: item.status
      })

      return await item.reload({ transaction })
    } catch (error) {
      logger.error('❌ 物品锁定释放失败', {
        service: 'ItemService',
        method: 'releaseHold',
        item_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 转移物品所有权（交易成交）
   *
   * 双录写入：卖方(-1) + 买方(+1)
   *
   * @param {Object} params - 参数对象
   * @param {number} params.item_id - 物品ID
   * @param {number} params.new_owner_user_id - 新所有者用户ID
   * @param {string} params.business_type - 业务类型（market_transfer/gift_transfer）
   * @param {string} params.idempotency_key - 幂等键（订单ID）
   * @param {Object} [params.meta] - 转移元数据
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（强制要求）
   * @returns {Promise<{ item: Object, is_duplicate: boolean }>} 转移结果
   */
  static async transferItem(params, options = {}) {
    const {
      item_id,
      new_owner_user_id,
      business_type = 'market_transfer',
      idempotency_key,
      meta = {}
    } = params
    const { transaction } = options

    requireTransaction(transaction, 'ItemService.transferItem')

    if (!item_id) throw new Error('item_id 是必填参数')
    if (!new_owner_user_id) throw new Error('new_owner_user_id 是必填参数')
    if (!idempotency_key) throw new Error('idempotency_key 是必填参数')

    const { Item, ItemLedger } = require('../../models')

    try {
      // 幂等性检查
      const existingEntry = await ItemLedger.findOne({
        where: { item_id, event_type: 'transfer', idempotency_key: `${idempotency_key}:in` },
        transaction
      })

      if (existingEntry) {
        const existingItem = await Item.findByPk(item_id, { transaction })
        return { item: existingItem, is_duplicate: true }
      }

      const item = await Item.findByPk(item_id, {
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!item) throw new Error(`物品不存在：item_id=${item_id}`)
      if (!['available', 'held'].includes(item.status)) {
        throw new Error(`物品状态不可转移：${item.status}`)
      }

      // 获取卖方和买方账户
      const oldOwnerAccount = await this._getAccountById(item.owner_account_id, { transaction })
      const newOwnerAccount = await this._getUserAccount(new_owner_user_id, { transaction })

      // 双录写入（卖方 -1 + 买方 +1）
      await ItemLedger.bulkCreate(
        [
          {
            item_id,
            account_id: oldOwnerAccount.account_id,
            delta: -1,
            counterpart_id: newOwnerAccount.account_id,
            event_type: 'transfer',
            operator_id: new_owner_user_id,
            operator_type: 'user',
            business_type,
            idempotency_key: `${idempotency_key}:out`,
            meta
          },
          {
            item_id,
            account_id: newOwnerAccount.account_id,
            delta: 1,
            counterpart_id: oldOwnerAccount.account_id,
            event_type: 'transfer',
            operator_id: new_owner_user_id,
            operator_type: 'user',
            business_type,
            idempotency_key: `${idempotency_key}:in`,
            meta
          }
        ],
        { transaction }
      )

      // 更新缓存：所有者变更 + 状态恢复
      await item.update(
        {
          owner_account_id: newOwnerAccount.account_id,
          status: 'available'
        },
        { transaction }
      )

      logger.info('✅ 物品转移成功（双录）', {
        service: 'ItemService',
        method: 'transferItem',
        item_id,
        from_account: oldOwnerAccount.account_id,
        to_account: newOwnerAccount.account_id
      })

      return { item: await item.reload({ transaction }), is_duplicate: false }
    } catch (error) {
      logger.error('❌ 物品转移失败', {
        service: 'ItemService',
        method: 'transferItem',
        item_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 消耗物品（核销/使用）
   *
   * 双录写入：用户(-1) + SYSTEM_BURN(+1)
   *
   * @param {Object} params - 参数对象
   * @param {number} params.item_id - 物品ID
   * @param {number} [params.operator_user_id] - 操作者用户ID
   * @param {string} params.business_type - 业务类型（redemption_use/backpack_use/admin_use）
   * @param {string} params.idempotency_key - 幂等键
   * @param {Object} [params.meta] - 消耗元数据
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（强制要求）
   * @returns {Promise<{ item: Object, is_duplicate: boolean }>} 消耗结果
   */
  static async consumeItem(params, options = {}) {
    const {
      item_id,
      operator_user_id,
      business_type = 'backpack_use',
      idempotency_key,
      meta = {}
    } = params
    const { transaction } = options

    requireTransaction(transaction, 'ItemService.consumeItem')

    if (!item_id) throw new Error('item_id 是必填参数')
    if (!idempotency_key) throw new Error('idempotency_key 是必填参数')

    const { Item, ItemLedger, Account } = require('../../models')

    try {
      // 幂等性检查
      const existingEntry = await ItemLedger.findOne({
        where: { item_id, event_type: 'use', idempotency_key: `${idempotency_key}:out` },
        transaction
      })

      if (existingEntry) {
        const existingItem = await Item.findByPk(item_id, { transaction })
        return { item: existingItem, is_duplicate: true }
      }

      const item = await Item.findByPk(item_id, {
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!item) throw new Error(`物品不存在：item_id=${item_id}`)
      if (!['available', 'held'].includes(item.status)) {
        throw new Error(`物品状态不可消耗：${item.status}`)
      }

      // 获取持有者账户和系统销毁账户
      const ownerAccount = await this._getAccountById(item.owner_account_id, { transaction })
      const burnAccount = await Account.getSystemAccount('SYSTEM_BURN', { transaction })

      // 双录写入（用户 -1 + SYSTEM_BURN +1）
      await ItemLedger.bulkCreate(
        [
          {
            item_id,
            account_id: ownerAccount.account_id,
            delta: -1,
            counterpart_id: burnAccount.account_id,
            event_type: 'use',
            operator_id: operator_user_id || null,
            operator_type: operator_user_id ? 'user' : 'system',
            business_type,
            idempotency_key: `${idempotency_key}:out`,
            meta
          },
          {
            item_id,
            account_id: burnAccount.account_id,
            delta: 1,
            counterpart_id: ownerAccount.account_id,
            event_type: 'use',
            operator_id: operator_user_id || null,
            operator_type: operator_user_id ? 'user' : 'system',
            business_type,
            idempotency_key: `${idempotency_key}:in`,
            meta
          }
        ],
        { transaction }
      )

      // 更新缓存：标记已使用
      await item.update({ status: 'used' }, { transaction })

      logger.info('✅ 物品消耗成功（双录）', {
        service: 'ItemService',
        method: 'consumeItem',
        item_id,
        operator_user_id,
        business_type
      })

      return { item: await item.reload({ transaction }), is_duplicate: false }
    } catch (error) {
      logger.error('❌ 物品消耗失败', {
        service: 'ItemService',
        method: 'consumeItem',
        item_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 物品过期处理
   *
   * 双录写入：用户(-1) + SYSTEM_BURN(+1)
   *
   * @param {Object} params - 参数对象
   * @param {number} params.item_id - 物品ID
   * @param {string} [params.reason] - 过期原因
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（强制要求）
   * @returns {Promise<Object>} 过期后的物品
   */
  static async expireItem(params, options = {}) {
    const { item_id, reason = '自动过期' } = params
    const { transaction } = options

    requireTransaction(transaction, 'ItemService.expireItem')

    const { Item, ItemLedger, Account } = require('../../models')

    const item = await Item.findByPk(item_id, {
      lock: transaction.LOCK.UPDATE,
      transaction
    })
    if (!item) throw new Error(`物品不存在：item_id=${item_id}`)

    const ownerAccount = await this._getAccountById(item.owner_account_id, { transaction })
    const burnAccount = await Account.getSystemAccount('SYSTEM_BURN', { transaction })

    await ItemLedger.bulkCreate(
      [
        {
          item_id,
          account_id: ownerAccount.account_id,
          delta: -1,
          counterpart_id: burnAccount.account_id,
          event_type: 'expire',
          operator_type: 'system',
          business_type: 'auto_expire',
          idempotency_key: `expire_${item_id}:out`,
          meta: { reason }
        },
        {
          item_id,
          account_id: burnAccount.account_id,
          delta: 1,
          counterpart_id: ownerAccount.account_id,
          event_type: 'expire',
          operator_type: 'system',
          business_type: 'auto_expire',
          idempotency_key: `expire_${item_id}:in`,
          meta: { reason }
        }
      ],
      { transaction }
    )

    await item.update({ status: 'expired' }, { transaction })

    return await item.reload({ transaction })
  }

  /**
   * 获取物品账本（流转历史）
   *
   * @param {Object} params - 参数对象
   * @param {number} [params.item_id] - 物品ID
   * @param {number} [params.account_id] - 账户ID
   * @param {Array<string>} [params.event_types] - 事件类型过滤
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @param {Object} options - 选项
   * @returns {Promise<Object>} { entries, total, page, page_size, total_pages }
   */
  static async getLedgerEntries(params, options = {}) {
    const { item_id, account_id, event_types, page = 1, page_size = 20 } = params
    const { transaction } = options

    const { ItemLedger } = require('../../models')

    const where = {}
    if (item_id) where.item_id = item_id
    if (account_id) where.account_id = account_id
    if (event_types && event_types.length > 0) {
      where.event_type = { [Op.in]: event_types }
    }

    const { count, rows } = await ItemLedger.findAndCountAll({
      where,
      limit: page_size,
      offset: (page - 1) * page_size,
      order: [['created_at', 'DESC']],
      transaction
    })

    return {
      entries: rows,
      total: count,
      page,
      page_size,
      total_pages: Math.ceil(count / page_size)
    }
  }

  /**
   * 获取用户物品列表（分页）
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID
   * @param {Object} [filters] - 筛选条件
   * @param {string} [filters.item_type] - 物品类型筛选
   * @param {string} [filters.status] - 状态筛选
   * @param {number} [filters.page=1] - 页码
   * @param {number} [filters.page_size=20] - 每页数量
   * @param {Object} options - 选项
   * @returns {Promise<Object>} { items, total, page, page_size, total_pages }
   */
  static async getUserItems(params, filters = {}, options = {}) {
    const { user_id } = params
    const { item_type, status, page = 1, page_size = 20 } = filters
    const { transaction } = options

    const { Item } = require('../../models')

    const userAccount = await this._getUserAccount(user_id, { transaction })

    const where = { owner_account_id: userAccount.account_id }
    if (item_type) where.item_type = item_type
    if (status) {
      where.status = status
    } else {
      where.status = { [Op.in]: ['available', 'held'] }
    }

    const { count, rows } = await Item.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: page_size,
      offset: (page - 1) * page_size,
      transaction
    })

    const items = rows.map(r => (r.toJSON ? r.toJSON() : r))
    await attachDisplayNames(items, [
      { field: 'status', dictType: DICT_TYPES.ITEM_STATUS },
      { field: 'item_type', dictType: DICT_TYPES.ITEM_TYPE }
    ])

    return { items, total: count, page, page_size, total_pages: Math.ceil(count / page_size) }
  }

  /**
   * 获取物品详情（含流转历史）
   *
   * @param {Object} params - 参数对象
   * @param {number} [params.item_id] - 物品ID（与 tracking_code 二选一）
   * @param {string} [params.tracking_code] - 追踪码
   * @param {Object} options - 选项
   * @returns {Promise<Object|null>} { item, ledger_entries, holds }
   */
  static async getItemDetail(params, options = {}) {
    const { item_id, tracking_code } = params
    const { transaction, ledger_limit = 20 } = options

    const { Item, ItemLedger, ItemHold } = require('../../models')

    const where = {}
    if (item_id) where.item_id = item_id
    else if (tracking_code) where.tracking_code = tracking_code
    else throw new Error('item_id 或 tracking_code 必须提供其中之一')

    const item = await Item.findOne({ where, transaction })
    if (!item) return null

    const ledgerEntries = await ItemLedger.findAll({
      where: { item_id: item.item_id },
      order: [['created_at', 'ASC']],
      limit: ledger_limit,
      transaction
    })

    const holds = await ItemHold.findAll({
      where: { item_id: item.item_id },
      order: [['created_at', 'DESC']],
      transaction
    })

    const itemData = item.toJSON ? item.toJSON() : item
    await attachDisplayNames(itemData, [
      { field: 'status', dictType: DICT_TYPES.ITEM_STATUS },
      { field: 'item_type', dictType: DICT_TYPES.ITEM_TYPE }
    ])

    return { item: itemData, ledger_entries: ledgerEntries, holds }
  }

  // ========== 内部辅助方法 ==========

  /**
   * 根据 user_id 获取用户账户
   *
   * @param {number} userId - 用户ID
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 账户对象
   * @private
   */
  static async _getUserAccount(userId, options = {}) {
    const BalanceService = require('./BalanceService')
    return await BalanceService.getOrCreateAccount({ user_id: userId }, options)
  }

  /**
   * 根据 account_id 直接获取账户
   *
   * @param {number} accountId - 账户ID
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 账户对象
   * @private
   */
  static async _getAccountById(accountId, options = {}) {
    const { Account } = require('../../models')
    const account = await Account.findByPk(accountId, options)
    if (!account) throw new Error(`账户不存在：account_id=${accountId}`)
    return account
  }
}

module.exports = ItemService
