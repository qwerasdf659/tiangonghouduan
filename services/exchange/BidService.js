/* eslint-disable no-await-in-loop -- 结算/取消竞价需逐个用户处理资产操作，确保每个用户独立事务安全 */

/**
 * 竞价核心服务 - BidService
 * 臻选空间/幸运空间竞价功能核心业务逻辑
 *
 * 职责范围：写操作（需要事务）
 * - placeBid(): 提交出价（校验资产白名单 → 冻结资产 + 记录）
 * - settleBidProduct(): 结算竞价（中标者扣除 + 落选者解冻 + 入背包）
 * - cancelBidProduct(): 取消竞价（全部解冻返还）
 *
 * 关键设计决策：
 * - 竞价资产白名单：动态查询 material_asset_types（决策9）+ 硬编码黑名单（决策1）
 * - 冻结/解冻/结算：复用 BalanceService 三个独立方法（L451/L638/L825）
 * - 中标入背包：ExchangeRecord(source='bid') + ItemInstance(meta快照)（决策5/7/10）
 * - 库存扣减：结算时 stock-1, sold_count+1（决策13）
 * - 事务边界：路由管理事务边界，Service通过 options.transaction 接收（禁止自管理事务）
 *
 * @module services/exchange/BidService
 * @created 2026-02-16（臻选空间/幸运空间/竞价功能）
 */

'use strict'

const logger = require('../../utils/logger').logger
const BalanceService = require('../asset/BalanceService')
const BeijingTimeHelper = require('../../utils/timeHelper')
const { Op, literal } = require('sequelize')

/**
 * 竞价资产硬编码黑名单（绝对禁止，决策1）
 * POINTS: 保留用于高级空间解锁等核心消费
 * BUDGET_POINTS: 系统内部资产，绝对不可暴露给前端
 */
const BID_FORBIDDEN_ASSETS = ['POINTS', 'BUDGET_POINTS']

/**
 * 动态白名单缓存（5分钟TTL，决策9）
 */
let _allowedAssetsCache = null
let _allowedAssetsCacheTime = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5分钟

/**
 * 竞价核心服务类
 *
 * @class BidService
 */
class BidService {
  /**
   * @param {Object} models - Sequelize 模型对象
   */
  constructor(models) {
    this.models = models
    this.BidProduct = models.BidProduct
    this.BidRecord = models.BidRecord
    this.ExchangeItem = models.ExchangeItem
    this.ExchangeRecord = models.ExchangeRecord
    this.ItemInstance = models.ItemInstance
    this.MaterialAssetType = models.MaterialAssetType
    this.sequelize = models.sequelize
  }

  /**
   * 获取竞价允许的资产类型（动态白名单，缓存5分钟）
   *
   * 查询逻辑（决策9）：
   * SELECT asset_code FROM material_asset_types
   * WHERE is_tradable = 1 AND asset_code NOT IN ('POINTS', 'BUDGET_POINTS')
   *
   * @returns {Promise<string[]>} 允许竞价的资产类型代码数组
   * @private
   */
  async _getAllowedBidAssets() {
    const now = Date.now()
    if (_allowedAssetsCache && now - _allowedAssetsCacheTime < CACHE_TTL_MS) {
      return _allowedAssetsCache
    }

    const allowed = await this.MaterialAssetType.findAll({
      where: {
        is_tradable: true,
        asset_code: { [Op.notIn]: BID_FORBIDDEN_ASSETS }
      },
      attributes: ['asset_code'],
      raw: true
    })

    const result = allowed.map(a => a.asset_code)
    _allowedAssetsCache = result // eslint-disable-line require-atomic-updates
    _allowedAssetsCacheTime = now // eslint-disable-line require-atomic-updates

    logger.info('[竞价服务] 刷新竞价资产白名单', { allowed: result })
    return result
  }

  /**
   * 提交出价（核心业务方法）
   *
   * 业务流程（§4.7）：
   * 1. 校验 price_asset_code 不在黑名单 + 在动态白名单内
   * 2. 校验竞价商品状态 = active 且 end_time > NOW()
   * 3. SELECT ... FOR UPDATE 锁定 bid_products 行（防并发）
   * 4. 校验 bid_amount >= current_price + min_bid_increment
   * 5. 如果用户之前有出价 → 解冻之前的冻结金额
   * 6. 冻结新出价金额
   * 7. 更新之前最高出价记录的 is_winning = false
   * 8. 写入 bid_records 新记录
   * 9. 更新 bid_products.current_price 和 bid_count
   * 10. 返回出价结果
   *
   * @param {number} userId - 出价用户ID
   * @param {number} bidProductId - 竞价商品ID
   * @param {number} bidAmount - 出价金额
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填，路由层管理事务边界）
   * @param {string} options.idempotency_key - 幂等键（必填）
   * @returns {Promise<Object>} 出价结果
   */
  async placeBid(userId, bidProductId, bidAmount, options = {}) {
    const { transaction, idempotency_key } = options

    if (!transaction) {
      throw new Error('BidService.placeBid 需要外部传入事务（事务边界由路由层管理）')
    }
    if (!idempotency_key) {
      throw new Error('idempotency_key 是必填参数')
    }

    logger.info('[竞价服务] 提交出价', {
      user_id: userId,
      bid_product_id: bidProductId,
      bid_amount: bidAmount
    })

    /*
     * === Step 1: 校验竞价资产类型 ===
     * 1a. 硬编码黑名单（绝对禁止，优先级最高）
     */
    const bidProduct = await this.BidProduct.findByPk(bidProductId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!bidProduct) {
      const err = new Error('竞价商品不存在')
      err.statusCode = 404
      err.code = 'BID_PRODUCT_NOT_FOUND'
      throw err
    }

    const assetCode = bidProduct.price_asset_code

    if (BID_FORBIDDEN_ASSETS.includes(assetCode)) {
      const err = new Error(`资产类型 ${assetCode} 不允许用于竞价`)
      err.statusCode = 400
      err.code = 'ASSET_NOT_ALLOWED'
      throw err
    }

    // 1b. 动态白名单
    const allowedAssets = await this._getAllowedBidAssets()
    if (!allowedAssets.includes(assetCode)) {
      const err = new Error(`资产类型 ${assetCode} 不在竞价白名单中`)
      err.statusCode = 400
      err.code = 'ASSET_NOT_ALLOWED'
      throw err
    }

    // === Step 2: 校验竞价状态 ===
    if (bidProduct.status !== 'active') {
      const err = new Error('竞价不在进行中')
      err.statusCode = 400
      err.code = 'BID_NOT_ACTIVE'
      throw err
    }

    if (new Date(bidProduct.end_time) <= new Date()) {
      const err = new Error('竞价已结束')
      err.statusCode = 400
      err.code = 'BID_NOT_ACTIVE'
      throw err
    }

    // === Step 3: 校验出价金额 ===
    const currentPrice = Number(bidProduct.current_price) || Number(bidProduct.start_price)
    const minBid =
      bidProduct.bid_count > 0
        ? Number(bidProduct.current_price) + Number(bidProduct.min_bid_increment)
        : Number(bidProduct.start_price)

    if (bidAmount < minBid) {
      const err = new Error(
        `出价不能低于 ${minBid}（当前最高价 ${currentPrice} + 最小加价 ${bidProduct.min_bid_increment}）`
      )
      err.statusCode = 400
      err.code = 'BID_TOO_LOW'
      throw err
    }

    // === Step 4: 检查用户是否已是最高出价者 ===
    const existingWinningBid = await this.BidRecord.findOne({
      where: {
        bid_product_id: bidProductId,
        user_id: userId,
        is_winning: true
      },
      transaction
    })

    if (existingWinningBid) {
      const err = new Error('您已是当前最高出价者，无需重复出价')
      err.statusCode = 409
      err.code = 'SELF_OUTBID'
      throw err
    }

    // === Step 5: 如果用户之前有出价，先解冻之前的冻结金额 ===
    const previousBid = await this.BidRecord.findOne({
      where: { bid_product_id: bidProductId, user_id: userId },
      order: [['bid_amount', 'DESC']],
      transaction
    })

    if (previousBid) {
      logger.info('[竞价服务] 解冻用户之前的出价冻结', {
        user_id: userId,
        previous_amount: previousBid.bid_amount,
        previous_bid_id: previousBid.bid_record_id
      })

      await BalanceService.unfreeze(
        {
          user_id: userId,
          asset_code: assetCode,
          amount: Number(previousBid.bid_amount),
          business_type: 'bid_unfreeze',
          idempotency_key: `bid_unfreeze_${previousBid.bid_record_id}_${Date.now()}`,
          meta: { reference_type: 'bid_record', reference_id: previousBid.bid_record_id }
        },
        { transaction }
      )
    }

    // === Step 6: 冻结新出价金额 ===
    const freezeResult = await BalanceService.freeze(
      {
        user_id: userId,
        asset_code: assetCode,
        amount: bidAmount,
        business_type: 'bid_freeze',
        idempotency_key: `bid_freeze_${idempotency_key}`,
        meta: { reference_type: 'bid_product', reference_id: bidProductId }
      },
      { transaction }
    )

    /*
     * === Step 7: 更新之前最高出价记录的 is_winning = false ===
     * 先查询被超越的出价者（用于事务提交后发送通知）
     */
    const outbidRecord = await this.BidRecord.findOne({
      where: { bid_product_id: bidProductId, is_winning: true, user_id: { [Op.ne]: userId } },
      attributes: ['bid_record_id', 'user_id', 'bid_amount'],
      transaction
    })

    await this.BidRecord.update(
      { is_winning: false },
      {
        where: { bid_product_id: bidProductId, is_winning: true },
        transaction
      }
    )

    // === Step 8: 写入新出价记录 ===
    const newBidRecord = await this.BidRecord.create(
      {
        bid_product_id: bidProductId,
        user_id: userId,
        bid_amount: bidAmount,
        previous_highest: currentPrice,
        is_winning: true,
        is_final_winner: false,
        freeze_transaction_id: freezeResult.transaction_record?.asset_transaction_id || null,
        idempotency_key
      },
      { transaction }
    )

    // === Step 9: 更新 bid_products 冗余字段 ===
    await bidProduct.update(
      {
        current_price: bidAmount,
        bid_count: literal('bid_count + 1')
      },
      { transaction }
    )

    logger.info('[竞价服务] 出价成功', {
      user_id: userId,
      bid_product_id: bidProductId,
      bid_amount: bidAmount,
      bid_record_id: newBidRecord.bid_record_id,
      previous_highest: currentPrice
    })

    return {
      bid_record_id: newBidRecord.bid_record_id,
      bid_product_id: bidProductId,
      bid_amount: bidAmount,
      is_highest: true,
      previous_highest: currentPrice,
      remaining_available: freezeResult.balance?.available_amount ?? null,
      bid_count: Number(bidProduct.bid_count) + 1,
      message: '出价成功，您当前为最高出价者！',
      /**
       * 被超越的出价者信息（用于路由层事务提交后发送 bid_outbid 通知）
       * 若无人被超越（首次出价），值为 null
       */
      _outbid_info: outbidRecord
        ? {
            user_id: outbidRecord.user_id,
            previous_bid_amount: Number(outbidRecord.bid_amount)
          }
        : null
    }
  }

  /**
   * 结算竞价商品（定时任务调用）
   *
   * 结算流程（§5.4）：
   * - 有出价：中标者扣除冻结 → 创建 ExchangeRecord + ItemInstance → 库存扣减 → 落选者解冻
   * - 无出价：标记为 no_bid（流拍）
   *
   * @param {number} bidProductId - 竞价商品ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @returns {Promise<Object>} 结算结果
   */
  async settleBidProduct(bidProductId, options = {}) {
    const { transaction } = options

    if (!transaction) {
      throw new Error('BidService.settleBidProduct 需要外部传入事务')
    }

    logger.info('[竞价结算] 开始结算', { bid_product_id: bidProductId })

    // 锁定竞价商品记录
    const bidProduct = await this.BidProduct.findByPk(bidProductId, {
      lock: transaction.LOCK.UPDATE,
      transaction,
      include: [
        {
          model: this.ExchangeItem,
          as: 'exchangeItem'
        }
      ]
    })

    if (!bidProduct) {
      throw new Error(`竞价商品 ${bidProductId} 不存在`)
    }

    // 更新状态为 ended
    await bidProduct.update({ status: 'ended' }, { transaction })

    // === 分支判断：有出价 vs 无出价 ===
    if (bidProduct.bid_count === 0) {
      // 流拍（决策16）
      await bidProduct.update({ status: 'no_bid' }, { transaction })
      logger.info('[竞价结算] 流拍，无人出价', { bid_product_id: bidProductId })
      return { status: 'no_bid', bid_product_id: bidProductId }
    }

    // === 有出价，正常结算 ===

    // 找到最高出价（中标者）
    const winnerBid = await this.BidRecord.findOne({
      where: { bid_product_id: bidProductId, is_winning: true },
      transaction
    })

    if (!winnerBid) {
      throw new Error(
        `竞价 ${bidProductId} 有 ${bidProduct.bid_count} 次出价但找不到 is_winning=true 的记录`
      )
    }

    const winnerId = winnerBid.user_id
    const winningAmount = Number(winnerBid.bid_amount)
    const assetCode = bidProduct.price_asset_code
    const exchangeItem = bidProduct.exchangeItem

    // a. 标记最终中标者
    await winnerBid.update({ is_final_winner: true }, { transaction })

    // b. 中标者冻结资产正式扣除
    await BalanceService.settleFromFrozen(
      {
        user_id: winnerId,
        asset_code: assetCode,
        amount: winningAmount,
        business_type: 'bid_settle_winner',
        idempotency_key: `bid_settle_winner_${bidProductId}`,
        meta: { reference_type: 'bid_product', reference_id: bidProductId }
      },
      { transaction }
    )

    // c. 创建 ExchangeRecord（决策10：source = 'bid'）
    const orderNo = `BID${Date.now()}${Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0')}`
    await this.ExchangeRecord.create(
      {
        user_id: winnerId,
        exchange_item_id: exchangeItem.exchange_item_id,
        pay_asset_code: assetCode,
        pay_amount: winningAmount,
        order_no: orderNo,
        idempotency_key: `bid_settle_order_${bidProductId}`,
        business_id: `bid_settle_${bidProductId}`,
        source: 'bid',
        status: 'completed',
        item_snapshot: {
          item_name: exchangeItem.item_name,
          description: exchangeItem.description,
          cost_asset_code: exchangeItem.cost_asset_code,
          cost_amount: Number(exchangeItem.cost_amount)
        },
        exchange_time: new Date()
      },
      { transaction }
    )

    // d. 中标商品入背包（三表模型：通过 ItemService.mintItem 双录写入）
    const ItemService = require('../asset/ItemService')
    await ItemService.mintItem(
      {
        user_id: winnerId,
        item_type: 'product',
        source: 'bid_settlement',
        source_ref_id: String(bidProductId),
        item_name: exchangeItem.item_name,
        item_description: exchangeItem.description || '',
        item_value: Number(exchangeItem.cost_amount) || 0,
        business_type: 'bid_settlement_mint',
        idempotency_key: `bid_settle_item_${bidProductId}`,
        meta: {
          bid_product_id: bidProductId,
          exchange_item_id: exchangeItem.exchange_item_id,
          primary_image_id: exchangeItem.primary_image_id,
          category: exchangeItem.category,
          original_cost_asset_code: exchangeItem.cost_asset_code,
          original_cost_amount: Number(exchangeItem.cost_amount),
          bid_winning_amount: winningAmount,
          bid_asset_code: assetCode
        }
      },
      { transaction }
    )

    // e. 扣减库存（决策13：乐观锁防超卖）
    const [affectedRows] = await this.ExchangeItem.update(
      {
        stock: literal('stock - 1'),
        sold_count: literal('sold_count + 1')
      },
      {
        where: {
          exchange_item_id: exchangeItem.exchange_item_id,
          stock: { [Op.gt]: 0 }
        },
        transaction
      }
    )

    if (affectedRows === 0) {
      throw new Error(`商品 ${exchangeItem.exchange_item_id} 库存不足，无法完成竞价结算`)
    }

    // f. 落选者冻结资产解冻返还
    const loserBids = await this.BidRecord.findAll({
      where: {
        bid_product_id: bidProductId,
        user_id: { [Op.ne]: winnerId }
      },
      attributes: ['bid_record_id', 'user_id', 'bid_amount'],
      transaction
    })

    // 按用户分组（每个用户只需解冻最高出价的冻结额）
    const loserMap = new Map()
    for (const bid of loserBids) {
      const uid = bid.user_id
      if (!loserMap.has(uid) || Number(bid.bid_amount) > Number(loserMap.get(uid).bid_amount)) {
        loserMap.set(uid, bid)
      }
    }

    for (const [loserId, bid] of loserMap) {
      await BalanceService.unfreeze(
        {
          user_id: loserId,
          asset_code: assetCode,
          amount: Number(bid.bid_amount),
          business_type: 'bid_settle_refund',
          idempotency_key: `bid_settle_refund_${bid.bid_record_id}`,
          meta: { reference_type: 'bid_record', reference_id: bid.bid_record_id }
        },
        { transaction }
      )
    }

    // g. 更新竞价商品状态
    await bidProduct.update(
      {
        status: 'settled',
        winner_user_id: winnerId,
        winner_bid_id: winnerBid.bid_record_id
      },
      { transaction }
    )

    logger.info('[竞价结算] 结算完成', {
      bid_product_id: bidProductId,
      winner_user_id: winnerId,
      winning_amount: winningAmount,
      loser_count: loserMap.size
    })

    return {
      status: 'settled',
      bid_product_id: bidProductId,
      winner_user_id: winnerId,
      winning_amount: winningAmount,
      item_name: exchangeItem.item_name,
      price_asset_code: assetCode,
      loser_count: loserMap.size,
      /**
       * 落选用户列表（用于事务提交后发送 bid_lost 通知）
       * 格式：[{ user_id, bid_amount }]
       */
      _losers: Array.from(loserMap).map(([uid, bid]) => ({
        user_id: uid,
        bid_amount: Number(bid.bid_amount)
      }))
    }
  }

  /**
   * 取消竞价商品（管理员操作）
   *
   * @param {number} bidProductId - 竞价商品ID
   * @param {string} reason - 取消原因
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @returns {Promise<Object>} 取消结果
   */
  async cancelBidProduct(bidProductId, reason, options = {}) {
    const { transaction } = options

    if (!transaction) {
      throw new Error('BidService.cancelBidProduct 需要外部传入事务')
    }

    logger.info('[竞价取消] 开始取消', { bid_product_id: bidProductId, reason })

    const bidProduct = await this.BidProduct.findByPk(bidProductId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!bidProduct) {
      throw new Error(`竞价商品 ${bidProductId} 不存在`)
    }

    if (!['pending', 'active'].includes(bidProduct.status)) {
      throw new Error(`竞价状态为 ${bidProduct.status}，无法取消（仅 pending/active 可取消）`)
    }

    const assetCode = bidProduct.price_asset_code

    // 解冻所有出价者的冻结资产
    const allBids = await this.BidRecord.findAll({
      where: { bid_product_id: bidProductId },
      attributes: ['bid_record_id', 'user_id', 'bid_amount'],
      transaction
    })

    // 按用户分组取最高出价（每个用户只冻结了最新一次出价的金额）
    const userBidMap = new Map()
    for (const bid of allBids) {
      const uid = bid.user_id
      if (!userBidMap.has(uid) || Number(bid.bid_amount) > Number(userBidMap.get(uid).bid_amount)) {
        userBidMap.set(uid, bid)
      }
    }

    for (const [uid, bid] of userBidMap) {
      await BalanceService.unfreeze(
        {
          user_id: uid,
          asset_code: assetCode,
          amount: Number(bid.bid_amount),
          business_type: 'bid_cancel_refund',
          idempotency_key: `bid_cancel_refund_${bid.bid_record_id}`,
          meta: { reference_type: 'bid_product', reference_id: bidProductId, reason }
        },
        { transaction }
      )
    }

    // 更新竞价状态
    await bidProduct.update({ status: 'cancelled' }, { transaction })

    logger.info('[竞价取消] 取消完成', {
      bid_product_id: bidProductId,
      refunded_users: userBidMap.size
    })

    return {
      status: 'cancelled',
      bid_product_id: bidProductId,
      refunded_users: userBidMap.size,
      reason
    }
  }
}

module.exports = BidService
