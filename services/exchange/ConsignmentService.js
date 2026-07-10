/**
 * @file 寄卖服务（ConsignmentService）— S3 二手回流/寄卖
 * @description 寄卖单 CRUD + 状态机 + 所有权流转（复用 items + item_ledger）
 * @module services/exchange/ConsignmentService
 */

'use strict'

/* eslint-disable valid-jsdoc, require-jsdoc */

const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const { logger } = require('../../utils/logger')
const BeijingTimeHelper = require('../../utils/timeHelper')
const BusinessError = require('../../utils/BusinessError')
const BusinessSeqCodeGenerator = require('../../utils/BusinessSeqCodeGenerator')
const { Op } = require('sequelize')
const { ItemLedger, Account } = require('../../models')

/** 状态机合法流转 */
const STATUS_TRANSITIONS = {
  pending: ['listed', 'rejected'],
  listed: ['sold', 'withdrawn'],
  sold: [],
  withdrawn: [],
  rejected: []
}

/** 默认计价资产 */
const DEFAULT_LIST_ASSET_CODE = 'star_stone'

/**
 * 计价资产禁用清单（拍板 #32：points/budget_points 禁用，与 DIY 支付白名单同口径，
 * 见 services/diy/MaterialService.js 的 forbidden 校验）
 */
const FORBIDDEN_LIST_ASSET_CODES = ['points', 'budget_points']

/**
 * @class ConsignmentService
 */
class ConsignmentService {
  /**
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
    this.sequelize = models.sequelize
  }

  /**
   * 分页查询寄卖单
   */
  async listConsignments(filters = {}, pagination = {}) {
    const { ConsignmentOrder, Item, Account } = this.models
    const { Op } = this.sequelize.Sequelize

    const page = Math.max(1, parseInt(pagination.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(pagination.page_size, 10) || 20))
    const offset = (page - 1) * pageSize

    const where = {}
    if (filters.status) where.status = filters.status
    if (filters.consignor_account_id) {
      const aid = Number(filters.consignor_account_id)
      if (!Number.isNaN(aid)) where.consignor_account_id = aid
    }
    if (filters.keyword && String(filters.keyword).trim()) {
      where.order_no = { [Op.like]: `%${String(filters.keyword).trim()}%` }
    }

    const { rows, count } = await ConsignmentOrder.findAndCountAll({
      where,
      include: [
        {
          model: Item,
          as: 'item',
          attributes: ['item_id', 'tracking_code', 'item_name', 'status', 'source']
        },
        {
          model: Account,
          as: 'consignor',
          attributes: ['account_id', 'user_id', 'account_type']
        }
      ],
      order: [['consignment_id', 'DESC']],
      limit: pageSize,
      offset
    })

    return {
      items: rows.map(r => r.toJSON()),
      total: count,
      page,
      page_size: pageSize,
      total_pages: Math.ceil(count / pageSize)
    }
  }

  /**
   * 查询寄卖单详情
   */
  async getConsignment(consignmentId, options = {}) {
    const { ConsignmentOrder, Item, Account, ExchangeItem } = this.models
    const transaction = options.transaction || null

    const cid = Number(consignmentId)
    if (Number.isNaN(cid)) {
      throw new BusinessError('consignment_id 无效', 'CONSIGNMENT_INVALID_ID', 400)
    }

    const row = await ConsignmentOrder.findByPk(cid, {
      transaction,
      include: [
        { model: Item, as: 'item' },
        { model: Account, as: 'consignor' },
        { model: ExchangeItem, as: 'relistItem', required: false }
      ]
    })

    if (!row) {
      throw new BusinessError('寄卖单不存在', 'CONSIGNMENT_NOT_FOUND', 404)
    }

    const result = row.toJSON()
    result.max_list_price = await this._getMaxListPrice(row.item_id, { transaction })
    return result
  }

  /**
   * 创建寄卖单（pending）
   */
  async createConsignment(data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ConsignmentService.createConsignment')
    const { ConsignmentOrder, Item } = this.models

    const itemId = Number(data.item_id)
    if (Number.isNaN(itemId)) {
      throw new BusinessError('item_id 无效', 'CONSIGNMENT_INVALID_ITEM', 400)
    }

    const consignorAccountId = Number(data.consignor_account_id)
    if (Number.isNaN(consignorAccountId)) {
      throw new BusinessError('consignor_account_id 无效', 'CONSIGNMENT_INVALID_CONSIGNOR', 400)
    }

    const listPrice = data.list_price != null ? Number(data.list_price) : null
    const listAssetCode = data.list_asset_code || DEFAULT_LIST_ASSET_CODE

    if (FORBIDDEN_LIST_ASSET_CODES.includes(listAssetCode)) {
      throw new BusinessError(
        `计价资产 ${listAssetCode} 禁止用于寄卖（拍板 #32：points/budget_points 禁用）`,
        'CONSIGNMENT_FORBIDDEN_ASSET_CODE',
        400
      )
    }

    if (listPrice != null && (!Number.isFinite(listPrice) || listPrice <= 0)) {
      throw new BusinessError('寄卖定价必须为正数', 'CONSIGNMENT_INVALID_PRICE', 400)
    }

    const item = await Item.findByPk(itemId, { transaction, lock: transaction.LOCK.UPDATE })
    if (!item) {
      throw new BusinessError('物品不存在', 'CONSIGNMENT_ITEM_NOT_FOUND', 404)
    }
    if (!item.tracking_code) {
      throw new BusinessError(
        '物品缺少 tracking_code，不可寄卖',
        'CONSIGNMENT_NO_TRACKING_CODE',
        400
      )
    }
    if (item.owner_account_id !== consignorAccountId) {
      throw new BusinessError('寄卖人非物品当前持有者', 'CONSIGNMENT_OWNER_MISMATCH', 409)
    }
    if (!['available', 'held'].includes(item.status)) {
      throw new BusinessError(`物品状态 ${item.status} 不可寄卖`, 'CONSIGNMENT_ITEM_STATUS', 409)
    }

    const existingActive = await ConsignmentOrder.findOne({
      where: {
        item_id: itemId,
        status: { [Op.in]: ['pending', 'listed'] }
      },
      transaction
    })
    if (existingActive) {
      throw new BusinessError('该物品已有进行中的寄卖单', 'CONSIGNMENT_DUPLICATE', 409)
    }

    if (listPrice != null) {
      const maxPrice = await this._getMaxListPrice(itemId, { transaction })
      if (maxPrice != null && listPrice > maxPrice) {
        throw new BusinessError(
          `寄卖定价 ${listPrice} 超过原兑换价值上限 ${maxPrice}`,
          'CONSIGNMENT_PRICE_EXCEEDS_MAX',
          400
        )
      }
    }

    const orderNo = await BusinessSeqCodeGenerator.generateWithRetry({
      prefix: 'CS',
      model: ConsignmentOrder,
      field: 'order_no',
      transaction
    })

    const created = await ConsignmentOrder.create(
      {
        order_no: orderNo,
        item_id: itemId,
        consignor_account_id: consignorAccountId,
        list_price: listPrice,
        list_asset_code: listAssetCode,
        relist_item_id: data.relist_item_id || null,
        status: 'pending'
      },
      { transaction }
    )

    logger.info('[S3] 寄卖单创建成功', {
      consignment_id: created.consignment_id,
      order_no: orderNo,
      ts: BeijingTimeHelper.apiTimestamp()
    })

    return this.getConsignment(created.consignment_id, { transaction })
  }

  /**
   * 审核上架（pending → listed）：物品转入平台托管账户
   */
  async listConsignment(consignmentId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ConsignmentService.listConsignment')

    const order = await this._getOrderForTransition(consignmentId, 'listed', { transaction })

    if (order.list_price != null) {
      const maxPrice = await this._getMaxListPrice(order.item_id, { transaction })
      if (maxPrice != null && order.list_price > maxPrice) {
        throw new BusinessError(
          `寄卖定价超过原兑换价值上限 ${maxPrice}`,
          'CONSIGNMENT_PRICE_EXCEEDS_MAX',
          400
        )
      }
    }

    const escrowAccount = await Account.getSystemAccount('SYSTEM_ESCROW', { transaction })
    await this._transferItemBetweenAccounts(
      order.item_id,
      order.consignor_account_id,
      escrowAccount.account_id,
      {
        business_type: 'consignment_list',
        idempotency_key: `consignment_list_${order.consignment_id}`,
        transaction
      }
    )

    await order.update({ status: 'listed' }, { transaction })
    logger.info('[S3] 寄卖单已上架', {
      consignment_id: order.consignment_id,
      ts: BeijingTimeHelper.apiTimestamp()
    })
    return this.getConsignment(order.consignment_id, { transaction })
  }

  /**
   * 标记售出（listed → sold）
   */
  async markConsignmentSold(consignmentId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ConsignmentService.markConsignmentSold')
    const order = await this._getOrderForTransition(consignmentId, 'sold', { transaction })
    await order.update({ status: 'sold' }, { transaction })
    logger.info('[S3] 寄卖单已售出', {
      consignment_id: order.consignment_id,
      ts: BeijingTimeHelper.apiTimestamp()
    })
    return this.getConsignment(order.consignment_id, { transaction })
  }

  /**
   * 撤回寄卖（listed → withdrawn）：物品归还寄卖人
   */
  async withdrawConsignment(consignmentId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ConsignmentService.withdrawConsignment')
    const order = await this._getOrderForTransition(consignmentId, 'withdrawn', { transaction })

    const escrowAccount = await Account.getSystemAccount('SYSTEM_ESCROW', { transaction })
    await this._transferItemBetweenAccounts(
      order.item_id,
      escrowAccount.account_id,
      order.consignor_account_id,
      {
        business_type: 'consignment_withdraw',
        idempotency_key: `consignment_withdraw_${order.consignment_id}`,
        transaction
      }
    )

    await order.update({ status: 'withdrawn' }, { transaction })
    logger.info('[S3] 寄卖单已撤回', {
      consignment_id: order.consignment_id,
      ts: BeijingTimeHelper.apiTimestamp()
    })
    return this.getConsignment(order.consignment_id, { transaction })
  }

  /**
   * 驳回寄卖（pending → rejected）
   */
  async rejectConsignment(consignmentId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ConsignmentService.rejectConsignment')
    const order = await this._getOrderForTransition(consignmentId, 'rejected', { transaction })
    await order.update({ status: 'rejected' }, { transaction })
    logger.info('[S3] 寄卖单已驳回', {
      consignment_id: order.consignment_id,
      ts: BeijingTimeHelper.apiTimestamp()
    })
    return this.getConsignment(order.consignment_id, { transaction })
  }

  /**
   * 获取物品原兑换价值上限（DIY 作品取 total_cost，其他取 exchange_records.pay_amount）
   * @private
   */
  async _getMaxListPrice(itemId, options = {}) {
    const { Item, DiyWork, ExchangeRecord } = this.models
    const transaction = options.transaction || null

    const item = await Item.findByPk(itemId, { transaction })
    if (!item) return null

    if (item.source === 'diy' && item.source_ref_id) {
      const work = await DiyWork.findByPk(item.source_ref_id, { transaction })
      if (work && work.total_cost && work.total_cost.payments) {
        return work.total_cost.payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
      }
    }

    const record = await ExchangeRecord.findOne({
      where: { item_id: itemId },
      order: [['exchange_record_id', 'DESC']],
      transaction
    })
    if (record && record.pay_amount != null) {
      return Number(record.pay_amount)
    }

    return null
  }

  /**
   * 状态流转校验并锁定订单
   * @private
   */
  async _getOrderForTransition(consignmentId, targetStatus, options) {
    const transaction = assertAndGetTransaction(
      options,
      'ConsignmentService._getOrderForTransition'
    )
    const { ConsignmentOrder } = this.models

    const cid = Number(consignmentId)
    const order = await ConsignmentOrder.findByPk(cid, {
      transaction,
      lock: transaction.LOCK.UPDATE
    })
    if (!order) {
      throw new BusinessError('寄卖单不存在', 'CONSIGNMENT_NOT_FOUND', 404)
    }

    const allowed = STATUS_TRANSITIONS[order.status] || []
    if (!allowed.includes(targetStatus)) {
      throw new BusinessError(
        `状态 ${order.status} 不可流转到 ${targetStatus}`,
        'CONSIGNMENT_INVALID_TRANSITION',
        409
      )
    }
    return order
  }

  /**
   * 账户间转移物品所有权（双录 item_ledger）
   * @private
   */
  async _transferItemBetweenAccounts(itemId, fromAccountId, toAccountId, options) {
    const { transaction, business_type, idempotency_key } = options
    const { Item } = this.models

    const existingEntry = await ItemLedger.findOne({
      where: { item_id: itemId, event_type: 'transfer', idempotency_key: `${idempotency_key}:in` },
      transaction
    })
    if (existingEntry) return

    const item = await Item.findByPk(itemId, { lock: transaction.LOCK.UPDATE, transaction })
    if (!item) {
      throw new BusinessError('物品不存在', 'CONSIGNMENT_ITEM_NOT_FOUND', 404)
    }
    if (item.owner_account_id !== fromAccountId) {
      throw new BusinessError('物品当前持有者与预期不符', 'CONSIGNMENT_OWNER_MISMATCH', 409)
    }

    await ItemLedger.bulkCreate(
      [
        {
          item_id: itemId,
          account_id: fromAccountId,
          delta: -1,
          counterpart_id: toAccountId,
          event_type: 'transfer',
          operator_type: 'system',
          business_type,
          idempotency_key: `${idempotency_key}:out`,
          meta: { consignment: true }
        },
        {
          item_id: itemId,
          account_id: toAccountId,
          delta: 1,
          counterpart_id: fromAccountId,
          event_type: 'transfer',
          operator_type: 'system',
          business_type,
          idempotency_key: `${idempotency_key}:in`,
          meta: { consignment: true }
        }
      ],
      { transaction }
    )

    await item.update({ owner_account_id: toAccountId, status: 'available' }, { transaction })
  }
}

module.exports = ConsignmentService
