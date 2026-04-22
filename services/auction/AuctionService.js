/* eslint-disable no-await-in-loop -- 结算/取消拍卖需逐个用户处理资产操作，确保每个用户独立事务安全 */

/**
 * C2C 拍卖核心服务 - AuctionService
 * 用户间竞拍功能核心业务逻辑
 *
 * 职责范围：写操作（需要事务）
 * - createAuction(): 创建拍卖（校验物品所有权 → holdItem锁定 → 保存item_snapshot）
 * - placeBid(): 提交出价（卖方自拍校验 → 资产白名单 → 冻结 → 一口价即时结算）
 * - settleAuction(): 结算拍卖（settleFromFrozen → 手续费 → transferItem → 卖方入账 → 落选者解冻）
 * - cancelAuction(): 取消拍卖（有出价禁止卖方取消 → 解冻 → releaseHold）
 * - handleNoBid(): 流拍处理（releaseHold → status='no_bid'）
 *
 * 与 BidService 的核心区别：
 * - 卖方是普通用户（非管理员），需要校验物品所有权
 * - 结算涉及 transferItem（非 mintItem）+ 手续费 + 卖方入账
 * - 物品通过 holdItem/releaseHold 锁定/释放（BidService 无此逻辑）
 * - 支持一口价即时结算
 *
 * 事务边界：路由管理事务边界，Service 通过 options.transaction 接收
 *
 * @module services/auction/AuctionService
 * @created 2026-03-24（C2C用户间竞拍功能）
 * @see docs/C2C竞拍方案.md
 */

'use strict'

const logger = require('../../utils/logger').logger
const { AssetCode } = require('../../constants/AssetCode')
const BalanceService = require('../asset/BalanceService')
const ItemService = require('../asset/ItemService')
const FeeCalculator = require('../FeeCalculator')
const { Op } = require('sequelize')
const AdminSystemService = require('../AdminSystemService')

/**
 * 竞价资产硬编码黑名单（与 BidService 共享，决策1）
 */
const BID_FORBIDDEN_ASSETS = [AssetCode.POINTS, AssetCode.BUDGET_POINTS]

/* eslint-disable valid-jsdoc, require-jsdoc */
async function balanceFreeze(BS, payload, transaction) {
  return BS.freeze(payload, { transaction })
}
async function balanceUnfreeze(BS, payload, transaction) {
  return BS.unfreeze(payload, { transaction })
}
async function balanceSettleFromFrozen(BS, payload, transaction) {
  return BS.settleFromFrozen(payload, { transaction })
}
async function balanceChangeBalance(BS, payload, transaction) {
  return BS.changeBalance(payload, { transaction })
}
/* eslint-enable valid-jsdoc, require-jsdoc */

/** 动态白名单缓存（5分钟TTL，与 BidService 共享缓存策略） */
let _allowedAssetsCache = null
let _allowedAssetsCacheTime = 0
const CACHE_TTL_MS = 5 * 60 * 1000

/**
 * C2C 拍卖核心服务类
 *
 * @class AuctionService
 */
class AuctionService {
  /**
   * @param {Object} models - Sequelize 模型对象
   */
  constructor(models) {
    this.models = models
    this.AuctionListing = models.AuctionListing
    this.AuctionBid = models.AuctionBid
    this.Item = models.Item
    this.Account = models.Account
    this.MaterialAssetType = models.MaterialAssetType
    this.sequelize = models.sequelize
  }

  /**
   * 获取竞价允许的资产类型（动态白名单，缓存5分钟，复用 BidService 同一逻辑）
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
    return result
  }

  /**
   * 创建 C2C 拍卖
   *
   * 流程：校验物品所有权 → holdItem锁定 → 保存item_snapshot → AuctionListing.create
   *
   * @param {number} userId - 卖方用户ID
   * @param {number} itemId - 拍卖物品ID
   * @param {Object} params - 拍卖参数
   * @param {string} [params.price_asset_code=AssetCode.STAR_STONE] - 出价资产类型（星石）
   * @param {number} params.start_price - 起拍价
   * @param {number} [params.min_bid_increment=10] - 最小加价幅度
   * @param {number|null} [params.buyout_price=null] - 一口价
   * @param {Date} params.start_time - 开始时间
   * @param {Date} params.end_time - 结束时间
   * @param {Object} options - { transaction }
   * @returns {Promise<Object>} 创建的拍卖挂牌记录
   */
  async createAuction(userId, itemId, params, options = {}) {
    const { transaction } = options

    if (!transaction) {
      throw new Error('AuctionService.createAuction 需要外部传入事务')
    }

    const {
      price_asset_code = AssetCode.STAR_STONE,
      start_price,
      min_bid_increment = 10,
      buyout_price = null,
      start_time,
      end_time
    } = params

    // ① 校验资产白名单
    const allowedAssets = await this._getAllowedBidAssets()
    if (!allowedAssets.includes(price_asset_code)) {
      throw new Error(`不允许使用 ${price_asset_code} 作为竞价资产`)
    }

    // ② 校验价格参数
    if (!start_price || start_price <= 0) {
      throw new Error('起拍价必须大于0')
    }
    if (min_bid_increment <= 0) {
      throw new Error('最小加价幅度必须大于0')
    }
    if (buyout_price != null && buyout_price <= start_price) {
      throw new Error('一口价必须大于起拍价')
    }

    // ③ 校验时间窗口（决策2：最低时长从 system_settings 读取）
    const startDate = new Date(start_time)
    const endDate = new Date(end_time)
    if (endDate <= startDate) {
      throw new Error('结束时间必须晚于开始时间')
    }
    const durationHours = (endDate - startDate) / (1000 * 60 * 60)
    const minDuration =
      Number(
        await AdminSystemService.getSettingValue('auction', 'auction_min_duration_hours', 2)
      ) || 2
    if (durationHours < minDuration) {
      throw new Error(`拍卖时长不得少于${minDuration}小时（当前${durationHours.toFixed(1)}小时）`)
    }

    // ④ 校验物品所有权（items.owner_account_id → accounts.user_id）
    const item = await this.Item.findByPk(itemId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    })
    if (!item) {
      throw new Error(`物品 ${itemId} 不存在`)
    }
    if (item.status !== 'available') {
      throw new Error(`物品状态为 ${item.status}，仅 available 状态可拍卖`)
    }

    const account = await this.Account.findByPk(item.owner_account_id, { transaction })
    if (!account || account.user_id !== userId) {
      throw new Error('该物品不属于当前用户，无法拍卖')
    }

    // ⑤ 检查同一物品是否已有进行中的拍卖
    const existingAuction = await this.AuctionListing.findOne({
      where: {
        item_id: itemId,
        status: { [Op.in]: ['pending', 'active'] }
      },
      transaction
    })
    if (existingAuction) {
      throw new Error('该物品已有进行中的拍卖')
    }

    // ⑥ 锁定物品（holdItem，hold_type='trade'）
    const holdExpiresAt = new Date(endDate.getTime() + 24 * 60 * 60 * 1000) // 拍卖结束后24小时安全窗口
    let holdResult
    try {
      holdResult = await ItemService.holdItem(
        {
          item_id: itemId,
          hold_type: 'trade',
          holder_ref: `auction_pending_${itemId}`,
          reason: 'C2C拍卖锁定',
          expires_at: holdExpiresAt
        },
        { transaction }
      )
    } catch (holdError) {
      if (holdError.message.includes('已被')) {
        throw new Error('物品当前有更高优先级的锁定，无法拍卖（可能正在核销或被安全冻结）')
      }
      throw holdError
    }

    // ⑦ 构建物品快照
    const itemSnapshot = {
      item_name: item.item_name,
      item_type: item.item_type,
      rarity_code: item.rarity_code || null,
      item_value: Number(item.item_value || 0),
      item_template_id: item.item_template_id || null,
      instance_attributes: item.instance_attributes || null
    }

    // ⑧ 获取手续费率（getFeeRateByAsset 返回 { rate, min_fee, ... }）
    const feeRateInfo = await FeeCalculator.getFeeRateByAsset(price_asset_code)
    const feeRate = feeRateInfo?.rate || 0.05

    // ⑨ 创建拍卖记录
    const auctionListing = await this.AuctionListing.create(
      {
        seller_user_id: userId,
        item_id: itemId,
        price_asset_code,
        start_price,
        current_price: 0,
        min_bid_increment,
        buyout_price,
        start_time: startDate,
        end_time: endDate,
        status: 'pending',
        fee_rate: feeRate,
        bid_count: 0,
        unique_bidders: 0,
        item_snapshot: itemSnapshot,
        retry_count: 0
      },
      { transaction }
    )

    // ⑩ 更新 holder_ref 为包含实际 auction_listing_id
    await holdResult.hold.update(
      { holder_ref: `auction_${auctionListing.auction_listing_id}` },
      { transaction }
    )

    logger.info('[C2C拍卖] 创建成功', {
      auction_listing_id: auctionListing.auction_listing_id,
      seller_user_id: userId,
      item_id: itemId,
      price_asset_code,
      start_price,
      buyout_price,
      start_time: startDate.toISOString(),
      end_time: endDate.toISOString()
    })

    return auctionListing
  }

  /**
   * C2C 拍卖出价
   *
   * 参考 BidService.placeBid，增加卖方自拍校验 + 一口价即时结算
   *
   * @param {number} userId - 出价用户ID
   * @param {number} auctionListingId - 拍卖ID
   * @param {number} bidAmount - 出价金额
   * @param {Object} options - { transaction, idempotency_key }
   * @returns {Promise<Object>} 出价结果
   */
  async placeBid(userId, auctionListingId, bidAmount, options = {}) {
    const { transaction, idempotency_key } = options

    if (!transaction) {
      throw new Error('AuctionService.placeBid 需要外部传入事务')
    }
    if (!idempotency_key) {
      throw new Error('placeBid 需要 idempotency_key')
    }

    // 锁定拍卖记录
    const auctionListing = await this.AuctionListing.findByPk(auctionListingId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!auctionListing) {
      throw new Error(`拍卖 ${auctionListingId} 不存在`)
    }

    // 状态校验
    if (auctionListing.status !== 'active') {
      throw new Error(`拍卖状态为 ${auctionListing.status}，仅 active 可出价`)
    }
    if (new Date(auctionListing.end_time) <= new Date()) {
      throw new Error('拍卖已过期')
    }

    // 卖方自拍校验（C2C核心差异）
    if (auctionListing.seller_user_id === userId) {
      throw new Error('不能对自己发起的拍卖出价')
    }

    const assetCode = auctionListing.price_asset_code

    // 资产白名单校验
    const allowedAssets = await this._getAllowedBidAssets()
    if (!allowedAssets.includes(assetCode)) {
      throw new Error(`资产 ${assetCode} 不在允许竞价列表中`)
    }

    // 出价金额校验
    const currentPrice = Number(auctionListing.current_price)
    const startPrice = Number(auctionListing.start_price)
    const minIncrement = Number(auctionListing.min_bid_increment)

    if (currentPrice === 0) {
      if (bidAmount < startPrice) {
        throw new Error(`首次出价不得低于起拍价 ${startPrice}`)
      }
    } else {
      if (bidAmount < currentPrice + minIncrement) {
        throw new Error(
          `出价必须 >= ${currentPrice + minIncrement}（当前价 ${currentPrice} + 最小加价 ${minIncrement}）`
        )
      }
    }

    // 检查用户是否已是当前最高出价者
    const myCurrentWinning = await this.AuctionBid.findOne({
      where: {
        auction_listing_id: auctionListingId,
        user_id: userId,
        is_winning: true
      },
      transaction
    })
    if (myCurrentWinning) {
      throw new Error('您已是当前最高出价者，无需重复出价')
    }

    // 解冻该用户之前的出价冻结（如有）
    const myPreviousBid = await this.AuctionBid.findOne({
      where: {
        auction_listing_id: auctionListingId,
        user_id: userId
      },
      order: [['bid_amount', 'DESC']],
      transaction
    })

    if (myPreviousBid) {
      await balanceUnfreeze(
        BalanceService,
        {
          user_id: userId,
          asset_code: assetCode,
          amount: Number(myPreviousBid.bid_amount),
          business_type: 'auction_bid_replaced',
          idempotency_key: `auction_unfreeze_${myPreviousBid.auction_bid_id}`,
          meta: { reference_type: 'auction_bid', reference_id: myPreviousBid.auction_bid_id }
        },
        transaction
      )
    }

    // 冻结新出价金额
    const freezeResult = await balanceFreeze(
      BalanceService,
      {
        user_id: userId,
        asset_code: assetCode,
        amount: bidAmount,
        business_type: 'auction_bid_freeze',
        idempotency_key: `auction_freeze_${idempotency_key}`,
        meta: { reference_type: 'auction_listing', reference_id: auctionListingId }
      },
      transaction
    )

    // 清除之前的 is_winning 标记
    await this.AuctionBid.update(
      { is_winning: false },
      {
        where: { auction_listing_id: auctionListingId, is_winning: true },
        transaction
      }
    )

    // 记录被超越的用户信息（用于 WebSocket 推送）
    let outbidUserId = null
    if (currentPrice > 0) {
      const previousWinner = await this.AuctionBid.findOne({
        where: { auction_listing_id: auctionListingId, bid_amount: currentPrice },
        attributes: ['user_id'],
        transaction
      })
      if (previousWinner) {
        outbidUserId = previousWinner.user_id
      }
    }

    // 创建出价记录
    const auctionBid = await this.AuctionBid.create(
      {
        auction_listing_id: auctionListingId,
        user_id: userId,
        bid_amount: bidAmount,
        previous_highest: currentPrice,
        is_winning: true,
        is_final_winner: false,
        freeze_transaction_id: freezeResult?.transaction_id || null,
        idempotency_key
      },
      { transaction }
    )

    // 更新拍卖统计
    const uniqueBidders = await this.AuctionBid.count({
      where: { auction_listing_id: auctionListingId },
      distinct: true,
      col: 'user_id',
      transaction
    })

    await auctionListing.update(
      {
        current_price: bidAmount,
        bid_count: auctionListing.bid_count + 1,
        unique_bidders: uniqueBidders
      },
      { transaction }
    )

    logger.info('[C2C拍卖] 出价成功', {
      auction_listing_id: auctionListingId,
      user_id: userId,
      bid_amount: bidAmount,
      previous_highest: currentPrice,
      bid_count: auctionListing.bid_count + 1
    })

    const result = {
      auction_bid_id: auctionBid.auction_bid_id,
      auction_listing_id: auctionListingId,
      user_id: userId,
      bid_amount: bidAmount,
      previous_highest: currentPrice,
      is_winning: true,
      _outbid_user_id: outbidUserId,
      _seller_user_id: auctionListing.seller_user_id,
      _item_snapshot: auctionListing.item_snapshot
    }

    // 一口价即时结算（决策1：V1直接支持）
    const buyoutPrice = auctionListing.buyout_price
    if (buyoutPrice != null && bidAmount >= buyoutPrice) {
      logger.info('[C2C拍卖] 触发一口价即时结算', {
        auction_listing_id: auctionListingId,
        buyout_price: buyoutPrice,
        bid_amount: bidAmount
      })
      const settleResult = await this.settleAuction(auctionListingId, { transaction })
      result._buyout_settled = true
      result._settle_result = settleResult
    }

    return result
  }

  /**
   * 结算 C2C 拍卖
   *
   * 流程（§7 对齐）：
   * ① settleFromFrozen(中标者) → ② 计算手续费 → ③ transferItem(物品转移)
   * → ④ changeBalance(卖方入账net_amount) → ⑤ changeBalance(平台手续费)
   * → ⑥ 落选者unfreeze → ⑦ releaseHold(释放物品锁定) → ⑧ 更新拍卖状态
   *
   * @param {number} auctionListingId - 拍卖ID
   * @param {Object} options - { transaction }
   * @returns {Promise<Object>} 结算结果
   */
  async settleAuction(auctionListingId, options = {}) {
    const { transaction } = options

    if (!transaction) {
      throw new Error('AuctionService.settleAuction 需要外部传入事务')
    }

    logger.info('[C2C拍卖结算] 开始结算', { auction_listing_id: auctionListingId })

    const auctionListing = await this.AuctionListing.findByPk(auctionListingId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!auctionListing) {
      throw new Error(`拍卖 ${auctionListingId} 不存在`)
    }

    // 更新状态为 ended
    await auctionListing.update({ status: 'ended' }, { transaction })

    // 流拍分支
    if (auctionListing.bid_count === 0) {
      await this.handleNoBid(auctionListingId, { transaction })
      logger.info('[C2C拍卖结算] 流拍', { auction_listing_id: auctionListingId })
      return { status: 'no_bid', auction_listing_id: auctionListingId }
    }

    // 找到中标者
    const winnerBid = await this.AuctionBid.findOne({
      where: { auction_listing_id: auctionListingId, is_winning: true },
      transaction
    })

    if (!winnerBid) {
      throw new Error(
        `拍卖 ${auctionListingId} 有 ${auctionListing.bid_count} 次出价但找不到 is_winning=true 的记录`
      )
    }

    const winnerId = winnerBid.user_id
    const winningAmount = Number(winnerBid.bid_amount)
    const assetCode = auctionListing.price_asset_code
    const sellerId = auctionListing.seller_user_id
    const itemId = auctionListing.item_id

    // a. 标记最终中标者
    await winnerBid.update({ is_final_winner: true }, { transaction })

    // ① 中标者冻结资产正式扣除
    await balanceSettleFromFrozen(
      BalanceService,
      {
        user_id: winnerId,
        asset_code: assetCode,
        amount: winningAmount,
        business_type: 'auction_settle_winner',
        idempotency_key: `auction_settle_winner_${auctionListingId}`,
        meta: { reference_type: 'auction_listing', reference_id: auctionListingId }
      },
      transaction
    )

    // ② 计算手续费（复用 FeeCalculator）
    const itemValue = Number(auctionListing.item_snapshot?.item_value || 0)
    const feeInfo = FeeCalculator.calculateFeeByAsset(assetCode, itemValue, winningAmount)
    const feeAmount = feeInfo.fee || 0
    const netAmount = winningAmount - feeAmount

    // ③ 物品转移（transferItem，双录 item_ledger）
    await ItemService.transferItem(
      {
        item_id: itemId,
        new_owner_user_id: winnerId,
        business_type: 'auction_settlement_transfer',
        idempotency_key: `auction_settle_item_${auctionListingId}`,
        meta: {
          auction_listing_id: auctionListingId,
          seller_user_id: sellerId,
          winning_amount: winningAmount
        }
      },
      { transaction }
    )

    // ④ 卖方入账（net_amount）
    const { Account: AccountModel } = this.models
    const escrowAccount = await AccountModel.findOne({
      where: { account_type: 'system', account_code: 'SYSTEM_ESCROW' },
      transaction
    })
    const escrowAccountId = escrowAccount ? escrowAccount.account_id : 4

    await balanceChangeBalance(
      BalanceService,
      {
        user_id: sellerId,
        asset_code: assetCode,
        delta_amount: netAmount,
        business_type: 'auction_settle_seller_credit',
        idempotency_key: `auction_settle_seller_${auctionListingId}`,
        counterpart_account_id: escrowAccountId,
        meta: {
          reference_type: 'auction_listing',
          reference_id: auctionListingId,
          gross_amount: winningAmount,
          fee_amount: feeAmount
        }
      },
      transaction
    )

    // ⑤ 平台手续费入账（SYSTEM_PLATFORM_FEE）
    if (feeAmount > 0) {
      await balanceChangeBalance(
        BalanceService,
        {
          system_code: 'SYSTEM_PLATFORM_FEE',
          asset_code: assetCode,
          delta_amount: feeAmount,
          business_type: 'auction_settle_platform_fee',
          idempotency_key: `auction_settle_fee_${auctionListingId}`,
          counterpart_account_id: escrowAccountId,
          meta: {
            reference_type: 'auction_listing',
            reference_id: auctionListingId,
            fee_rate: auctionListing.fee_rate
          }
        },
        transaction
      )
    }

    // ⑥ 落选者解冻返还
    const loserBids = await this.AuctionBid.findAll({
      where: {
        auction_listing_id: auctionListingId,
        user_id: { [Op.ne]: winnerId }
      },
      attributes: ['auction_bid_id', 'user_id', 'bid_amount'],
      transaction
    })

    const loserMap = new Map()
    for (const bid of loserBids) {
      const uid = bid.user_id
      if (!loserMap.has(uid) || Number(bid.bid_amount) > Number(loserMap.get(uid).bid_amount)) {
        loserMap.set(uid, bid)
      }
    }

    for (const [loserId, bid] of loserMap) {
      await balanceUnfreeze(
        BalanceService,
        {
          user_id: loserId,
          asset_code: assetCode,
          amount: Number(bid.bid_amount),
          business_type: 'auction_settle_refund',
          idempotency_key: `auction_settle_refund_${bid.auction_bid_id}`,
          meta: { reference_type: 'auction_bid', reference_id: bid.auction_bid_id }
        },
        transaction
      )
    }

    // ⑦ 释放物品锁定（结算后物品已转移，需释放卖方的 hold）
    try {
      await ItemService.releaseHold(
        {
          item_id: itemId,
          holder_ref: `auction_${auctionListingId}`,
          hold_type: 'trade'
        },
        { transaction }
      )
    } catch (releaseError) {
      logger.warn('[C2C拍卖结算] 释放物品锁定异常（非致命，物品已转移）', {
        auction_listing_id: auctionListingId,
        error: releaseError.message
      })
    }

    // ⑧ 更新拍卖状态
    await auctionListing.update(
      {
        status: 'settled',
        winner_user_id: winnerId,
        winner_bid_id: winnerBid.auction_bid_id,
        gross_amount: winningAmount,
        fee_amount: feeAmount,
        net_amount: netAmount
      },
      { transaction }
    )

    logger.info('[C2C拍卖结算] 结算完成', {
      auction_listing_id: auctionListingId,
      winner_user_id: winnerId,
      winning_amount: winningAmount,
      fee_amount: feeAmount,
      net_amount: netAmount,
      loser_count: loserMap.size
    })

    return {
      status: 'settled',
      auction_listing_id: auctionListingId,
      winner_user_id: winnerId,
      winning_amount: winningAmount,
      fee_amount: feeAmount,
      net_amount: netAmount,
      seller_user_id: sellerId,
      item_name: auctionListing.item_snapshot?.item_name || '',
      price_asset_code: assetCode,
      loser_count: loserMap.size,
      _losers: Array.from(loserMap).map(([uid, bid]) => ({
        user_id: uid,
        bid_amount: Number(bid.bid_amount)
      }))
    }
  }

  /**
   * 取消 C2C 拍卖
   *
   * 卖方取消：bid_count === 0 时允许（有出价后禁止卖方取消）
   * 管理员取消：任何状态均可
   *
   * @param {number} auctionListingId - 拍卖ID
   * @param {number} operatorId - 操作者用户ID
   * @param {boolean} isAdmin - 是否管理员操作
   * @param {Object} options - { transaction }
   * @returns {Promise<Object>} 取消结果
   */
  async cancelAuction(auctionListingId, operatorId, isAdmin, options = {}) {
    const { transaction } = options

    if (!transaction) {
      throw new Error('AuctionService.cancelAuction 需要外部传入事务')
    }

    logger.info('[C2C拍卖取消] 开始', {
      auction_listing_id: auctionListingId,
      operator_id: operatorId,
      is_admin: isAdmin
    })

    const auctionListing = await this.AuctionListing.findByPk(auctionListingId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!auctionListing) {
      throw new Error(`拍卖 ${auctionListingId} 不存在`)
    }

    if (!['pending', 'active'].includes(auctionListing.status)) {
      throw new Error(`拍卖状态为 ${auctionListing.status}，仅 pending/active 可取消`)
    }

    // 卖方取消：需校验 bid_count === 0
    if (!isAdmin) {
      if (auctionListing.seller_user_id !== operatorId) {
        throw new Error('只有卖方或管理员可以取消拍卖')
      }
      if (auctionListing.bid_count > 0) {
        throw new Error('已有出价后卖方不可取消，如需取消请联系管理员')
      }
    }

    const assetCode = auctionListing.price_asset_code

    // 解冻所有出价者
    const allBids = await this.AuctionBid.findAll({
      where: { auction_listing_id: auctionListingId },
      attributes: ['auction_bid_id', 'user_id', 'bid_amount'],
      transaction
    })

    const userBidMap = new Map()
    for (const bid of allBids) {
      const uid = bid.user_id
      if (!userBidMap.has(uid) || Number(bid.bid_amount) > Number(userBidMap.get(uid).bid_amount)) {
        userBidMap.set(uid, bid)
      }
    }

    for (const [uid, bid] of userBidMap) {
      await balanceUnfreeze(
        BalanceService,
        {
          user_id: uid,
          asset_code: assetCode,
          amount: Number(bid.bid_amount),
          business_type: 'auction_cancel_refund',
          idempotency_key: `auction_cancel_refund_${bid.auction_bid_id}`,
          meta: { reference_type: 'auction_listing', reference_id: auctionListingId }
        },
        transaction
      )
    }

    // 释放物品锁定
    try {
      await ItemService.releaseHold(
        {
          item_id: auctionListing.item_id,
          holder_ref: `auction_${auctionListingId}`,
          hold_type: 'trade'
        },
        { transaction }
      )
    } catch (releaseError) {
      logger.warn('[C2C拍卖取消] 释放物品锁定异常', {
        auction_listing_id: auctionListingId,
        error: releaseError.message
      })
    }

    await auctionListing.update({ status: 'cancelled' }, { transaction })

    logger.info('[C2C拍卖取消] 完成', {
      auction_listing_id: auctionListingId,
      refunded_users: userBidMap.size
    })

    return {
      status: 'cancelled',
      auction_listing_id: auctionListingId,
      refunded_users: userBidMap.size
    }
  }

  /**
   * 流拍处理（无人出价，释放物品锁定）
   *
   * @param {number} auctionListingId - 拍卖ID
   * @param {Object} options - { transaction }
   * @returns {Promise<Object>} 处理结果
   */
  async handleNoBid(auctionListingId, options = {}) {
    const { transaction } = options

    if (!transaction) {
      throw new Error('AuctionService.handleNoBid 需要外部传入事务')
    }

    const auctionListing = await this.AuctionListing.findByPk(auctionListingId, { transaction })
    if (!auctionListing) {
      throw new Error(`拍卖 ${auctionListingId} 不存在`)
    }

    // 释放物品锁定
    try {
      await ItemService.releaseHold(
        {
          item_id: auctionListing.item_id,
          holder_ref: `auction_${auctionListingId}`,
          hold_type: 'trade'
        },
        { transaction }
      )
    } catch (releaseError) {
      logger.warn('[C2C拍卖流拍] 释放物品锁定异常', {
        auction_listing_id: auctionListingId,
        error: releaseError.message
      })
    }

    await auctionListing.update({ status: 'no_bid' }, { transaction })

    logger.info('[C2C拍卖] 流拍处理完成', { auction_listing_id: auctionListingId })
    return { status: 'no_bid', auction_listing_id: auctionListingId }
  }
}

module.exports = AuctionService
