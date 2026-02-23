/**
 * 交易订单服务（Trade Order Service）
 *
 * 职责：
 * - 订单域（Order Domain）核心服务
 * - 统一管理交易订单的创建、取消、完成
 * - 协调资产冻结/解冻/结算（调用 BalanceService/ItemService）
 * - 协调物品所有权变更（调用 Item）
 * - 提供强幂等性保证（idempotency_key）
 * - 管理后台订单查询（合并自 TradeOrderQueryService）
 *
 * 业务流程：
 * 1. 创建订单（createOrder）：
 *    - 锁定挂牌（MarketListing.status = locked）
 *    - 冻结买家资产（BalanceService.freeze）
 *    - 创建订单记录（TradeOrder.status = frozen）
 * 2. 完成订单（completeOrder）：
 *    - 从冻结资产结算（BalanceService.settleFromFrozen）
 *    - 转移物品所有权（Item.owner_user_id）
 *    - 更新订单状态（TradeOrder.status = completed）
 * 3. 取消订单（cancelOrder）：
 *    - 解冻买家资产（BalanceService.unfreeze）
 *    - 解锁挂牌（MarketListing.status = on_sale）
 *    - 更新订单状态（TradeOrder.status = cancelled）
 *
 * 服务合并记录（2026-01-21）：
 * - 合并 TradeOrderQueryService 的所有查询方法到本服务
 * - 原因：减少服务数量，统一订单相关操作
 *
 * 创建时间：2025-12-15（Phase 2）
 * 更新时间：2026-01-21 - 合并 TradeOrderQueryService
 */

const { Op, fn, col } = require('sequelize')
const { sequelize, TradeOrder, MarketListing, Item, User } = require('../models')
const { attachDisplayNames, DICT_TYPES } = require('../utils/displayNameHelper')
// V4.7.0 AssetService 拆分：使用子服务替代原 AssetService（2026-01-31）
const BalanceService = require('./asset/BalanceService')
const ItemService = require('./asset/ItemService')
const AdminSystemService = require('./AdminSystemService')
const logger = require('../utils/logger')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')
const { BusinessCacheHelper } = require('../utils/BusinessCacheHelper')

/**
 * 获取允许的结算币种白名单（多币种扩展 - 2026-01-14）
 *
 * 从 system_settings 读取 allowed_settlement_assets 配置
 * 默认值：['DIAMOND', 'red_shard']
 *
 * @returns {Promise<string[]>} 允许的结算币种代码数组
 */
async function getAllowedSettlementAssets() {
  const whitelist = await AdminSystemService.getSettingValue(
    'marketplace',
    'allowed_settlement_assets',
    ['DIAMOND', 'red_shard'] // 默认值
  )

  // 如果是字符串（JSON格式），解析为数组
  if (typeof whitelist === 'string') {
    try {
      return JSON.parse(whitelist)
    } catch (e) {
      logger.warn('[TradeOrderService] 解析 allowed_settlement_assets 失败，使用默认值', {
        whitelist
      })
      return ['DIAMOND', 'red_shard']
    }
  }

  return Array.isArray(whitelist) ? whitelist : ['DIAMOND', 'red_shard']
}

/**
 * 校验结算币种是否在白名单中
 *
 * @param {string} asset_code - 结算币种代码
 * @returns {Promise<boolean>} 是否允许
 */
async function isAssetCodeAllowed(asset_code) {
  const whitelist = await getAllowedSettlementAssets()
  return whitelist.includes(asset_code)
}

/**
 * 交易订单服务类
 *
 * @class TradeOrderService
 * @description 订单域核心服务，负责交易订单的全生命周期管理
 */
class TradeOrderService {
  /**
   * 创建交易订单
   *
   * 业务流程：
   * 1. 幂等性检查（idempotency_key）
   * 2. 验证挂牌状态（on_sale）
   * 3. 锁定挂牌（status = locked）
   * 4. 冻结买家资产（BalanceService.freeze）
   * 5. 创建订单记录（status = frozen）
   *
   * 幂等性规则：
   * - 相同 idempotency_key + 相同参数 → 返回已有订单（is_duplicate=true）
   * - 相同 idempotency_key + 不同参数 → 返回 409 冲突错误
   *
   * @param {Object} params - 订单参数
   * @param {string} params.idempotency_key - 幂等键（必需，格式：market_purchase_<timestamp>_<random>）
   * @param {number} params.market_listing_id - 挂牌ID
   * @param {number} params.buyer_id - 买家用户ID
   * @param {Object} [options] - 事务选项
   * @param {Object} [options.transaction] - Sequelize事务对象（可选，用于外部事务）
   * @returns {Promise<Object>} 订单创建结果 {trade_order_id, is_duplicate}
   * @throws {Error} 参数验证失败、挂牌不存在、挂牌状态异常、余额不足等
   */
  static async createOrder(params, options = {}) {
    const { idempotency_key, market_listing_id, buyer_id } = params

    // 1. 参数验证
    if (!idempotency_key) {
      throw new Error('idempotency_key 是必需参数')
    }
    if (!market_listing_id) {
      throw new Error('market_listing_id 是必需参数')
    }
    if (!buyer_id) {
      throw new Error('buyer_id 是必需参数')
    }

    // 2. 幂等性检查（使用业界标准字段名 idempotency_key）
    const existingOrder = await TradeOrder.findOne({
      where: { idempotency_key },
      transaction: options.transaction
    })

    if (existingOrder) {
      /**
       * 幂等性校验：参数一致性检查
       *
       * 参数一致性指纹：
       * - market_listing_id
       * - buyer_user_id
       * - gross_amount（或 price_amount）
       * - asset_code（白名单校验 - 2026-01-14 多币种扩展）
       *
       * 目的：防止同一 idempotency_key 被用于不同的业务参数
       */

      // 校验已有订单的 asset_code 是否在白名单中（多币种扩展 - 2026-01-14）
      const existingAssetAllowed = await isAssetCodeAllowed(existingOrder.asset_code)
      if (!existingAssetAllowed) {
        const whitelist = await getAllowedSettlementAssets()
        const error = new Error(
          `幂等回放发现异常订单：订单 ${existingOrder.trade_order_id} 的 asset_code=${existingOrder.asset_code}，` +
            `不在允许的结算币种白名单中（当前白名单：${whitelist.join(', ')}）`
        )
        error.code = 'INVALID_ASSET_CODE'
        error.statusCode = 500 // 数据异常，服务端错误
        error.details = {
          trade_order_id: existingOrder.trade_order_id,
          idempotency_key: existingOrder.idempotency_key,
          asset_code: existingOrder.asset_code,
          allowed: whitelist
        }
        throw error
      }

      // 先查询挂牌信息获取 gross_amount 和 asset_code
      const tempListing = await MarketListing.findOne({
        where: { market_listing_id },
        transaction: options.transaction
      })

      if (!tempListing) {
        throw new Error(`挂牌不存在: ${market_listing_id}`)
      }

      // 校验当前挂牌的 price_asset_code 是否在白名单中（多币种扩展 - 2026-01-14）
      const listingAssetAllowed = await isAssetCodeAllowed(tempListing.price_asset_code)
      if (!listingAssetAllowed) {
        const whitelist = await getAllowedSettlementAssets()
        const error = new Error(
          `挂牌定价资产不合法: ${tempListing.price_asset_code}（不在允许的结算币种白名单中）`
        )
        error.code = 'INVALID_ASSET_CODE'
        error.statusCode = 400
        error.details = {
          market_listing_id: tempListing.market_listing_id,
          price_asset_code: tempListing.price_asset_code,
          allowed: whitelist
        }
        throw error
      }

      const currentGrossAmount = tempListing.price_amount // gross_amount = price_amount
      const currentAssetCode = tempListing.price_asset_code // 已通过白名单校验

      // 验证参数一致性（严格校验）
      /*
       * 验证参数一致性
       * 注意：数据库字段可能为字符串类型，需要转换后比较
       */
      const parameterMismatch = []

      if (Number(existingOrder.market_listing_id) !== Number(market_listing_id)) {
        parameterMismatch.push(
          `market_listing_id: ${existingOrder.market_listing_id} ≠ ${market_listing_id}`
        )
      }
      if (Number(existingOrder.buyer_user_id) !== Number(buyer_id)) {
        parameterMismatch.push(`buyer_user_id: ${existingOrder.buyer_user_id} ≠ ${buyer_id}`)
      }
      if (Number(existingOrder.gross_amount) !== Number(currentGrossAmount)) {
        parameterMismatch.push(
          `gross_amount: ${existingOrder.gross_amount} ≠ ${currentGrossAmount}`
        )
      }
      if (String(existingOrder.asset_code) !== String(currentAssetCode)) {
        parameterMismatch.push(`asset_code: ${existingOrder.asset_code} ≠ ${currentAssetCode}`)
      }

      if (parameterMismatch.length > 0) {
        const error = new Error(`idempotency_key 冲突：${idempotency_key} 已存在但参数不一致`)
        error.code = 'CONFLICT'
        error.statusCode = 409
        error.details = {
          idempotency_key,
          existing_trade_order_id: existingOrder.trade_order_id,
          mismatched_parameters: parameterMismatch
        }
        throw error
      }

      logger.info(`[TradeOrderService] 幂等返回已有订单: ${existingOrder.trade_order_id}`)
      return {
        trade_order_id: existingOrder.trade_order_id,
        is_duplicate: true
      }
    }

    // 3. 创建新订单（强制要求事务边界 - 2026-01-05 治理决策）
    const transaction = assertAndGetTransaction(options, 'TradeOrderService.createOrder')

    // 3.1 查询挂牌信息
    const listing = await MarketListing.findOne({
      where: { market_listing_id },
      include: [
        {
          model: Item,
          as: 'offerItem',
          required: false
        }
      ],
      // 并发保护：对挂牌行加 FOR UPDATE，避免并发双买
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!listing) {
      throw new Error(`挂牌不存在: ${market_listing_id}`)
    }

    if (listing.status !== 'on_sale') {
      throw new Error(`挂牌状态异常: ${listing.status}，期望 on_sale`)
    }

    if (listing.seller_user_id === buyer_id) {
      throw new Error('不能购买自己的挂牌')
    }

    // 交易市场结算币种白名单校验（多币种扩展 - 2026-01-14）
    const priceAssetAllowed = await isAssetCodeAllowed(listing.price_asset_code)
    if (!priceAssetAllowed) {
      const whitelist = await getAllowedSettlementAssets()
      throw new Error(
        `挂牌定价资产不合法: ${listing.price_asset_code}（不在允许的结算币种白名单中：${whitelist.join(', ')}）`
      )
    }

    // 可叠加资产挂牌购买时必须校验卖家标的已冻结
    if (listing.listing_kind === 'fungible_asset') {
      if (!listing.seller_offer_frozen) {
        throw new Error('卖家标的资产未冻结，挂牌状态异常（seller_offer_frozen=false）')
      }
      if (!listing.offer_asset_code || !listing.offer_amount || Number(listing.offer_amount) <= 0) {
        throw new Error('可叠加资产挂牌标的信息缺失（offer_asset_code/offer_amount）')
      }
    }

    // 不可叠加物品购买时必须校验并锁定 items（所有权真相）
    if (listing.listing_kind === 'item') {
      if (!listing.offer_item_id) {
        throw new Error('挂牌缺少标的物品ID（offer_item_id）')
      }

      const itemInstance = await Item.findOne({
        where: { item_id: listing.offer_item_id },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!itemInstance) {
        throw new Error(`物品不存在: ${listing.offer_item_id}`)
      }
      if (Number(itemInstance.owner_user_id) !== Number(listing.seller_user_id)) {
        throw new Error('物品所有权异常：物品不属于当前卖家，禁止购买')
      }
      const allowedStatuses = ['locked', 'available']
      if (!allowedStatuses.includes(itemInstance.status)) {
        throw new Error(`物品实例状态不可购买：${itemInstance.status}`)
      }
    }

    // 3.2 计算手续费
    const FeeCalculator = require('./FeeCalculator')
    const FEE_RULES = require('../config/fee_rules')

    let feeAmount = 0
    let feeRate = 0

    // 检查手续费开关
    const feeEnabled =
      FEE_RULES.enabled &&
      FEE_RULES.trade_type_fees &&
      FEE_RULES.trade_type_fees.market_purchase &&
      FEE_RULES.trade_type_fees.market_purchase.enabled

    if (feeEnabled) {
      /*
       * 多币种手续费计算（2026-01-14 扩展）
       *
       * 计费模式：
       * - DIAMOND：分档模式（基于 itemValue 分档 + ceil + 最低费 1）
       * - red_shard 等其他币种：单一费率模式（从 system_settings 读取费率和最低费）
       *
       * 价值锚点：
       * - item：优先取 Item.meta.value 作为"价值锚点"
       * - fungible_asset：用 price_amount 作为价值锚点
       */
      const itemValue =
        listing.listing_kind === 'item'
          ? listing.offerItem?.meta?.value || listing.price_amount
          : listing.price_amount

      // 使用多币种手续费计算方法（2026-01-14 多币种扩展）
      const feeInfo = await FeeCalculator.calculateFeeByAsset(
        listing.price_asset_code, // 结算币种
        itemValue, // 价值锚点（DIAMOND 分档模式使用）
        listing.price_amount // 用户定价
      )
      feeAmount = feeInfo.fee
      feeRate = feeInfo.rate

      logger.info('[TradeOrderService] 手续费计算完成（多币种）', {
        asset_code: listing.price_asset_code,
        item_value: itemValue,
        price_amount: listing.price_amount,
        fee_amount: feeAmount,
        fee_rate: feeRate,
        calculation_mode: feeInfo.calculation_mode,
        tier: feeInfo.tier
      })
    } else {
      logger.info('[TradeOrderService] 手续费已禁用或物品信息缺失，跳过手续费计算')
    }

    // 计算对账金额（确保类型一致，避免 Decimal 类型比较问题）
    const grossAmount = Number(listing.price_amount)
    const netAmount = grossAmount - feeAmount

    // 验证对账公式（使用数值比较，处理可能的浮点精度问题）
    const expectedSum = feeAmount + netAmount
    if (Math.abs(grossAmount - expectedSum) > 0.001) {
      throw new Error(
        `对账金额错误：gross_amount(${grossAmount}) ≠ fee_amount(${feeAmount}) + net_amount(${netAmount})`
      )
    }

    // 3.3 锁定挂牌
    await listing.update(
      {
        status: 'locked',
        locked_at: new Date()
      },
      { transaction }
    )

    /**
     * 关键可靠性修复：避免"孤儿冻结"
     * 先创建订单（created）并把 listing.locked_by_order_id 绑定到订单，
     * 再冻结买家资产，最后把订单推进到 frozen。
     *
     * 这样即使后续异常，定时任务也能通过 locked_by_order_id 找到订单并走 cancelOrder 解冻。
     */

    /*
     * 3.4 创建订单记录（created）
     * 生成业务唯一键（格式：trade_order_{buyer_id}_{market_listing_id}_{timestamp}）
     */
    const business_id = `trade_order_${buyer_id}_${market_listing_id}_${Date.now()}`

    const order = await TradeOrder.create(
      {
        business_id, // ✅ 业务唯一键（事务边界治理 - 2026-01-05）
        idempotency_key,
        market_listing_id,
        buyer_user_id: buyer_id,
        seller_user_id: listing.seller_user_id,
        asset_code: listing.price_asset_code,
        gross_amount: grossAmount,
        fee_amount: feeAmount,
        net_amount: netAmount,
        status: 'created',
        meta: {
          fee_rate: feeRate
        }
      },
      { transaction }
    )

    // 3.5 更新挂牌的锁定订单ID（绑定订单）
    await listing.update(
      {
        locked_by_order_id: order.trade_order_id
      },
      { transaction }
    )

    // 3.6 冻结买家资产（幂等键派生规则：${root_idempotency_key}:freeze_buyer）
    // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction
    const freezeResult = await BalanceService.freeze(
      {
        idempotency_key: `${idempotency_key}:freeze_buyer`, // 派生幂等键（文档规范：统一以根幂等键派生）
        business_type: 'order_freeze_buyer', // 通过 business_type 区分冻结分录
        user_id: buyer_id,
        asset_code: listing.price_asset_code,
        amount: grossAmount,
        meta: {
          order_action: 'freeze',
          trade_order_id: order.trade_order_id,
          market_listing_id,
          freeze_reason: `购买挂牌 ${market_listing_id}`
        }
      },
      { transaction }
    )

    // 3.7 推进订单状态：created -> frozen
    await order.update(
      {
        status: 'frozen',
        meta: {
          ...order.meta,
          freeze_transaction_id: freezeResult?.transaction_record?.transaction_id || null
        }
      },
      { transaction }
    )

    logger.info(`[TradeOrderService] 订单创建成功: ${order.trade_order_id}`, {
      idempotency_key,
      market_listing_id,
      buyer_id
    })

    return {
      trade_order_id: order.trade_order_id,
      is_duplicate: false
    }
  }

  /**
   * 完成交易订单
   *
   * 业务流程：
   * 1. 验证订单状态（frozen）
   * 2. 从冻结资产结算（BalanceService.settleFromFrozen）
   * 3. 转移物品所有权（Item.owner_user_id）
   * 4. 更新订单状态（completed）
   * 5. 更新挂牌状态（sold）
   *
   * @param {Object} params - 完成订单参数
   * @param {number} params.trade_order_id - 订单ID
   * @param {number} params.buyer_id - 买家用户ID（用于验证）
   * @param {Object} [options] - 事务选项
   * @param {Object} [options.transaction] - Sequelize事务对象（可选）
   * @returns {Promise<Object>} 完成结果 {order, fee_amount, net_amount}
   * @throws {Error} 订单不存在、状态异常等
   */
  static async completeOrder(params, options = {}) {
    const { trade_order_id, buyer_id: _buyer_id } = params

    // 参数验证
    if (!trade_order_id) {
      throw new Error('trade_order_id 是必需参数')
    }

    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'TradeOrderService.completeOrder')

    // 1. 查询订单
    const order = await TradeOrder.findOne({
      where: { trade_order_id },
      include: [
        {
          model: MarketListing,
          as: 'listing'
        }
      ],
      transaction
    })

    if (!order) {
      throw new Error(`订单不存在: ${trade_order_id}`)
    }

    if (order.status !== 'frozen') {
      throw new Error(`订单状态异常: ${order.status}，期望 frozen`)
    }

    const listing = order.listing

    // 从订单记录获取幂等键（用于派生子事务幂等键）
    const idempotency_key = order.idempotency_key

    // 2. 从冻结资产结算（三笔：买家扣减、卖家入账、平台手续费）

    // 获取双录所需的账户ID（买家、卖家）
    const buyerAccount = await BalanceService.getOrCreateAccount(
      { user_id: order.buyer_user_id },
      { transaction }
    )
    const sellerAccount = await BalanceService.getOrCreateAccount(
      { user_id: order.seller_user_id },
      { transaction }
    )

    // 2.1 买家从冻结资产扣减
    // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction
    await BalanceService.settleFromFrozen(
      {
        idempotency_key: `${idempotency_key}:settle_buyer`, // 派生子幂等键
        business_type: 'order_settle_buyer_debit',
        user_id: order.buyer_user_id,
        asset_code: order.asset_code,
        amount: order.gross_amount,
        meta: {
          trade_order_id: order.trade_order_id,
          market_listing_id: order.market_listing_id,
          gross_amount: order.gross_amount,
          fee_amount: order.fee_amount,
          net_amount: order.net_amount
        }
      },
      { transaction }
    )

    // 2.2 卖家入账（实收金额）
    if (order.net_amount > 0) {
      // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction
      await BalanceService.changeBalance(
        {
          idempotency_key: `${idempotency_key}:credit_seller`,
          business_type: 'order_settle_seller_credit',
          user_id: order.seller_user_id,
          asset_code: order.asset_code,
          delta_amount: order.net_amount,
          counterpart_account_id: buyerAccount.account_id,
          meta: {
            trade_order_id: order.trade_order_id,
            market_listing_id: order.market_listing_id,
            buyer_user_id: order.buyer_user_id,
            gross_amount: order.gross_amount,
            fee_amount: order.fee_amount,
            net_amount: order.net_amount
          }
        },
        { transaction }
      )
    }

    // 2.3 平台手续费入账（如果手续费>0）
    if (order.fee_amount > 0) {
      // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction
      await BalanceService.changeBalance(
        {
          idempotency_key: `${idempotency_key}:credit_platform_fee`,
          business_type: 'order_settle_platform_fee_credit',
          system_code: 'SYSTEM_PLATFORM_FEE',
          asset_code: order.asset_code,
          delta_amount: order.fee_amount,
          counterpart_account_id: buyerAccount.account_id,
          meta: {
            trade_order_id: order.trade_order_id,
            market_listing_id: order.market_listing_id,
            buyer_user_id: order.buyer_user_id,
            seller_user_id: order.seller_user_id,
            gross_amount: order.gross_amount,
            fee_amount: order.fee_amount
          }
        },
        { transaction }
      )
    }

    // 3. 转移物品所有权或交付可叠加资产
    if (listing.listing_kind === 'item' && listing.offer_item_id) {
      // 统一资产域架构：使用 ItemService.transferItem() 转移物品所有权
      const itemInstance = await Item.findOne({
        where: { item_id: listing.offer_item_id },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!itemInstance) {
        throw new Error(`物品不存在: ${listing.offer_item_id}`)
      }

      // 所有权一致性校验（防止异常数据导致越权转移）
      if (Number(itemInstance.owner_user_id) !== Number(order.seller_user_id)) {
        throw new Error('物品所有权异常：物品不属于卖家，禁止成交转移')
      }

      // 使用 ItemService.transferItem() 转移所有权（自动记录事件）
      // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction
      await ItemService.transferItem(
        {
          item_id: itemInstance.item_id,
          new_owner_id: order.buyer_user_id,
          business_type: 'market_transfer',
          idempotency_key: `${idempotency_key}:transfer_item`, // 派生子幂等键
          meta: {
            market_listing_id: order.market_listing_id,
            from_user: order.seller_user_id,
            to_user: order.buyer_user_id,
            gross_amount: order.gross_amount,
            fee_amount: order.fee_amount,
            net_amount: order.net_amount
          }
        },
        { transaction }
      )

      logger.info('[TradeOrderService] 物品所有权已转移（通过 ItemService.transferItem）', {
        item_id: itemInstance.item_id,
        from: order.seller_user_id,
        to: order.buyer_user_id
      })
    } else if (listing.listing_kind === 'fungible_asset' && listing.offer_asset_code) {
      /**
       * 可叠加资产成交交付（双分录）
       *
       * 业务流程：
       * - 卖家：从冻结扣减标的资产（listing_settle_seller_offer_debit）
       * - 买家：收到标的资产入账（listing_transfer_buyer_offer_credit）
       */

      // 3.2.1 卖家：从冻结扣减标的资产
      // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction
      await BalanceService.settleFromFrozen(
        {
          idempotency_key: `${idempotency_key}:settle_seller_offer`, // 派生子幂等键
          business_type: 'listing_settle_seller_offer_debit',
          user_id: order.seller_user_id,
          asset_code: listing.offer_asset_code,
          amount: listing.offer_amount,
          meta: {
            trade_order_id: order.trade_order_id,
            market_listing_id: order.market_listing_id,
            buyer_user_id: order.buyer_user_id,
            offer_asset_code: listing.offer_asset_code,
            offer_amount: listing.offer_amount,
            action: 'seller_offer_debit'
          }
        },
        { transaction }
      )

      logger.info('[TradeOrderService] 卖家标的资产已从冻结扣减', {
        trade_order_id,
        seller_user_id: order.seller_user_id,
        asset_code: listing.offer_asset_code,
        amount: listing.offer_amount
      })

      // 3.2.2 买家：收到标的资产入账
      // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction
      await BalanceService.changeBalance(
        {
          idempotency_key: `${idempotency_key}:credit_buyer_offer`,
          business_type: 'listing_transfer_buyer_offer_credit',
          user_id: order.buyer_user_id,
          asset_code: listing.offer_asset_code,
          delta_amount: listing.offer_amount,
          counterpart_account_id: sellerAccount.account_id,
          meta: {
            trade_order_id: order.trade_order_id,
            market_listing_id: order.market_listing_id,
            seller_user_id: order.seller_user_id,
            offer_asset_code: listing.offer_asset_code,
            offer_amount: listing.offer_amount,
            action: 'buyer_offer_credit'
          }
        },
        { transaction }
      )

      logger.info('[TradeOrderService] 买家已收到标的资产', {
        trade_order_id,
        buyer_user_id: order.buyer_user_id,
        asset_code: listing.offer_asset_code,
        amount: listing.offer_amount
      })
    }

    // 4. 更新订单状态
    await order.update(
      {
        status: 'completed',
        completed_at: new Date()
      },
      { transaction }
    )

    // 5. 更新挂牌状态
    await listing.update(
      {
        status: 'sold',
        locked_by_order_id: null,
        locked_at: null
      },
      { transaction }
    )

    // 决策5B：成交后失效市场列表缓存（Service层）
    try {
      await BusinessCacheHelper.invalidateMarketListings('listing_sold')
    } catch (cacheError) {
      logger.warn('[交易市场] 缓存失效失败（非致命）:', cacheError.message)
    }

    // 6. 发送通知给买家和卖家
    const NotificationService = require('./NotificationService')
    try {
      // 通知卖家：挂牌已售出
      await NotificationService.notifyListingSold(order.seller_user_id, {
        market_listing_id: order.market_listing_id,
        offer_asset_code: listing.offer_asset_code || listing.offer_item_id?.toString(),
        offer_amount: Number(listing.offer_amount) || 1,
        price_amount: Number(order.gross_amount),
        net_amount: Number(order.net_amount)
      })
    } catch (notifyError) {
      logger.warn('[TradeOrderService] 发送卖家售出通知失败（非致命）:', notifyError.message)
    }

    try {
      // 通知买家：购买成功
      await NotificationService.notifyPurchaseCompleted(order.buyer_user_id, {
        trade_order_id: order.trade_order_id,
        offer_asset_code: listing.offer_asset_code || listing.offer_item_id?.toString(),
        offer_amount: Number(listing.offer_amount) || 1,
        price_amount: Number(order.gross_amount)
      })
    } catch (notifyError) {
      logger.warn('[TradeOrderService] 发送买家购买成功通知失败（非致命）:', notifyError.message)
    }

    logger.info(`[TradeOrderService] 订单完成: ${trade_order_id}`, {
      idempotency_key,
      buyer_user_id: order.buyer_user_id,
      seller_user_id: order.seller_user_id,
      gross_amount: order.gross_amount,
      fee_amount: order.fee_amount,
      net_amount: order.net_amount
    })

    return {
      order,
      fee_amount: order.fee_amount,
      net_amount: order.net_amount
    }
  }

  /**
   * 取消交易订单
   *
   * 业务流程：
   * 1. 验证订单状态（frozen）
   * 2. 解冻买家资产（BalanceService.unfreeze）
   * 3. 解锁挂牌（status = on_sale）
   * 4. 更新订单状态（cancelled）
   *
   * @param {Object} params - 取消订单参数
   * @param {number} params.trade_order_id - 订单ID
   * @param {string} [params.cancel_reason] - 取消原因（可选）
   * @param {Object} [options] - 事务选项
   * @param {Object} [options.transaction] - Sequelize事务对象（可选）
   * @returns {Promise<Object>} 取消结果 {order, unfreeze}
   * @throws {Error} 订单不存在、状态异常等
   */
  static async cancelOrder(params, options = {}) {
    const { trade_order_id, cancel_reason } = params

    // 参数验证
    if (!trade_order_id) {
      throw new Error('trade_order_id 是必需参数')
    }

    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'TradeOrderService.cancelOrder')

    // 1. 查询订单
    const order = await TradeOrder.findOne({
      where: { trade_order_id },
      include: [
        {
          model: MarketListing,
          as: 'listing'
        }
      ],
      transaction
    })

    if (!order) {
      throw new Error(`订单不存在: ${trade_order_id}`)
    }

    if (order.status !== 'frozen' && order.status !== 'created') {
      throw new Error(`订单状态异常: ${order.status}，期望 frozen 或 created`)
    }

    const listing = order.listing

    // 从订单记录获取幂等键（用于派生子事务幂等键）
    const idempotency_key = order.idempotency_key

    // 2. 解冻买家资产
    // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction
    const unfreezeResult = await BalanceService.unfreeze(
      {
        idempotency_key: `${idempotency_key}:unfreeze_buyer`, // 派生子幂等键
        business_type: 'order_unfreeze_buyer', // 通过 business_type 区分解冻分录
        user_id: order.buyer_user_id,
        asset_code: order.asset_code,
        amount: order.gross_amount,
        meta: {
          order_action: 'unfreeze',
          trade_order_id,
          unfreeze_reason: cancel_reason || `取消订单 ${trade_order_id}`
        }
      },
      { transaction }
    )

    // 3. 解锁挂牌
    await listing.update(
      {
        status: 'on_sale',
        locked_by_order_id: null,
        locked_at: null
      },
      { transaction }
    )

    // 决策5B：取消订单后失效市场列表缓存（Service层）
    try {
      await BusinessCacheHelper.invalidateMarketListings('listing_relisted')
    } catch (cacheError) {
      logger.warn('[交易市场] 缓存失效失败（非致命）:', cacheError.message)
    }

    // 4. 更新订单状态
    await order.update(
      {
        status: 'cancelled',
        cancelled_at: new Date(),
        meta: {
          ...order.meta,
          cancel_reason: cancel_reason || '用户取消'
        }
      },
      { transaction }
    )

    logger.info(`[TradeOrderService] 订单取消: ${trade_order_id}`, {
      idempotency_key,
      cancel_reason
    })

    return {
      order,
      unfreeze: unfreezeResult
    }
  }

  /**
   * 查询订单详情
   *
   * @param {number} trade_order_id - 订单ID
   * @returns {Promise<Object>} 订单详情
   */
  static async getOrderDetail(trade_order_id) {
    const order = await TradeOrder.findOne({
      where: { trade_order_id },
      include: [
        {
          model: MarketListing,
          as: 'listing',
          include: [
            {
              model: Item,
              as: 'offerItem'
            }
          ]
        }
      ]
    })

    if (!order) {
      throw new Error(`订单不存在: ${trade_order_id}`)
    }

    return order
  }

  /**
   * 查询用户订单列表
   *
   * @param {Object} params - 查询参数
   * @param {number} params.user_id - 用户ID
   * @param {string} [params.role] - 角色类型（buyer/seller）
   * @param {string} [params.status] - 订单状态
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} 订单列表 {orders, total, page, page_size}
   */
  static async getUserOrders(params) {
    const { user_id, role, status, page = 1, page_size = 20 } = params

    const where = {}

    if (role === 'buyer') {
      where.buyer_user_id = user_id
    } else if (role === 'seller') {
      where.seller_user_id = user_id
    } else {
      // 默认查询买家和卖家订单
      where[sequelize.Sequelize.Op.or] = [{ buyer_user_id: user_id }, { seller_user_id: user_id }]
    }

    if (status) {
      where.status = status
    }

    const { count, rows } = await TradeOrder.findAndCountAll({
      where,
      include: [
        {
          model: MarketListing,
          as: 'listing'
        }
      ],
      order: [['created_at', 'DESC']],
      limit: page_size,
      offset: (page - 1) * page_size
    })

    return {
      orders: rows,
      total: count,
      page,
      page_size
    }
  }

  /*
   * ==========================================
   * 以下方法合并自 TradeOrderQueryService（2026-01-21）
   * 管理后台专用的只读查询方法
   * ==========================================
   */

  /**
   * 查询交易订单列表（管理后台用，支持完整筛选条件）
   *
   * @param {Object} options - 查询参数
   * @param {number} [options.buyer_user_id] - 买家用户ID
   * @param {number} [options.seller_user_id] - 卖家用户ID
   * @param {number} [options.market_listing_id] - 挂牌ID
   * @param {string} [options.status] - 订单状态（created/frozen/completed/cancelled/failed）
   * @param {string} [options.asset_code] - 结算资产代码
   * @param {string} [options.start_time] - 开始时间（ISO8601格式，北京时间）
   * @param {string} [options.end_time] - 结束时间（ISO8601格式，北京时间）
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 订单列表和分页信息
   */
  static async getOrders(options = {}) {
    const {
      buyer_user_id,
      seller_user_id,
      market_listing_id,
      status,
      asset_code,
      start_time,
      end_time,
      page = 1,
      page_size = 20
    } = options

    const where = {}

    if (buyer_user_id) where.buyer_user_id = buyer_user_id
    if (seller_user_id) where.seller_user_id = seller_user_id
    if (market_listing_id) where.market_listing_id = market_listing_id
    if (status) where.status = status
    if (asset_code) where.asset_code = asset_code

    // 时间范围过滤
    if (start_time || end_time) {
      where.created_at = {}
      if (start_time) where.created_at[Op.gte] = new Date(start_time)
      if (end_time) where.created_at[Op.lte] = new Date(end_time)
    }

    const offset = (page - 1) * page_size

    const { count, rows } = await TradeOrder.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'buyer',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: User,
          as: 'seller',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: MarketListing,
          as: 'listing',
          attributes: [
            'market_listing_id',
            'listing_kind',
            'offer_item_id',
            'offer_asset_code',
            'offer_amount',
            'price_amount',
            'status'
          ]
        }
      ],
      order: [['created_at', 'DESC']],
      limit: page_size,
      offset
    })

    // 添加中文显示名称（2026-01-22 迁移到数据库字典表）
    const ordersData = rows.map(row => row.get({ plain: true }))

    // 为订单状态添加显示名称
    await attachDisplayNames(ordersData, [
      { field: 'status', dictType: DICT_TYPES.TRADE_ORDER_STATUS }
    ])

    // 为关联的挂牌添加状态显示名称
    for (const order of ordersData) {
      if (order.listing) {
        // eslint-disable-next-line no-await-in-loop -- 需要顺序处理每个订单的关联数据
        await attachDisplayNames(order.listing, [
          { field: 'status', dictType: DICT_TYPES.LISTING_STATUS }
        ])
      }
    }

    return {
      orders: ordersData,
      pagination: {
        total_count: count,
        page,
        page_size,
        total_pages: Math.ceil(count / page_size)
      }
    }
  }

  /**
   * 获取单个交易订单详情（管理后台用，包含中文显示名称）
   *
   * @param {number} trade_order_id - 订单ID
   * @returns {Promise<Object|null>} 订单详情或null
   */
  static async getOrderById(trade_order_id) {
    const order = await TradeOrder.findByPk(trade_order_id, {
      include: [
        {
          model: User,
          as: 'buyer',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: User,
          as: 'seller',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: MarketListing,
          as: 'listing',
          attributes: [
            'market_listing_id',
            'listing_kind',
            'offer_item_id',
            'offer_asset_code',
            'offer_amount',
            'price_amount',
            'status',
            'created_at'
          ]
        }
      ]
    })

    if (!order) return null

    // 添加中文显示名称（2026-01-22 迁移到数据库字典表）
    const orderData = order.get({ plain: true })
    await attachDisplayNames(orderData, [
      { field: 'status', dictType: DICT_TYPES.TRADE_ORDER_STATUS }
    ])

    // 为关联的挂牌添加状态显示名称
    if (orderData.listing) {
      await attachDisplayNames(orderData.listing, [
        { field: 'status', dictType: DICT_TYPES.LISTING_STATUS }
      ])
    }

    return orderData
  }

  /**
   * 根据业务ID查询订单（管理后台用）
   *
   * @param {string} business_id - 业务唯一键
   * @returns {Promise<Object|null>} 订单详情或null
   */
  static async getOrderByBusinessId(business_id) {
    const order = await TradeOrder.findOne({
      where: { business_id },
      include: [
        {
          model: User,
          as: 'buyer',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: User,
          as: 'seller',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: MarketListing,
          as: 'listing',
          attributes: [
            'market_listing_id',
            'listing_kind',
            'offer_item_id',
            'offer_asset_code',
            'offer_amount',
            'price_amount',
            'status'
          ]
        }
      ]
    })

    if (!order) return null

    // 添加中文显示名称（2026-01-22 迁移到数据库字典表）
    const orderData = order.get({ plain: true })
    await attachDisplayNames(orderData, [
      { field: 'status', dictType: DICT_TYPES.TRADE_ORDER_STATUS }
    ])

    // 为关联的挂牌添加状态显示名称
    if (orderData.listing) {
      await attachDisplayNames(orderData.listing, [
        { field: 'status', dictType: DICT_TYPES.LISTING_STATUS }
      ])
    }

    return orderData
  }

  /**
   * 获取交易订单统计汇总（管理后台用）
   *
   * @param {Object} options - 查询参数
   * @param {string} [options.start_time] - 开始时间
   * @param {string} [options.end_time] - 结束时间
   * @param {number} [options.seller_user_id] - 卖家用户ID（可选）
   * @param {number} [options.buyer_user_id] - 买家用户ID（可选）
   * @returns {Promise<Object>} 统计汇总数据
   */
  static async getOrderStats(options = {}) {
    const { start_time, end_time, seller_user_id, buyer_user_id } = options

    const where = {}
    if (seller_user_id) where.seller_user_id = seller_user_id
    if (buyer_user_id) where.buyer_user_id = buyer_user_id
    if (start_time || end_time) {
      where.created_at = {}
      if (start_time) where.created_at[Op.gte] = new Date(start_time)
      if (end_time) where.created_at[Op.lte] = new Date(end_time)
    }

    // 按状态统计
    const statusStats = await TradeOrder.findAll({
      attributes: ['status', [fn('COUNT', col('trade_order_id')), 'count']],
      where,
      group: ['status'],
      raw: true
    })

    // 金额汇总统计
    const amountStats = await TradeOrder.findOne({
      attributes: [
        [fn('COUNT', col('trade_order_id')), 'total_orders'],
        [fn('SUM', col('gross_amount')), 'total_gross_amount'],
        [fn('SUM', col('fee_amount')), 'total_fee_amount'],
        [fn('SUM', col('net_amount')), 'total_net_amount']
      ],
      where: { ...where, status: 'completed' },
      raw: true
    })

    // 添加中文显示名称（2026-01-22 迁移到数据库字典表）
    const byStatusWithDisplayNames = {}
    for (const item of statusStats) {
      // 为每个状态添加显示名称
      const statusData = { status: item.status }
      // eslint-disable-next-line no-await-in-loop -- 需要顺序处理每个状态的显示名称
      await attachDisplayNames(statusData, [
        { field: 'status', dictType: DICT_TYPES.TRADE_ORDER_STATUS }
      ])
      byStatusWithDisplayNames[item.status] = {
        count: parseInt(item.count) || 0,
        display_name: statusData.status_display
      }
    }

    return {
      period: { start_time, end_time },
      by_status: byStatusWithDisplayNames,
      completed_summary: {
        total_orders: parseInt(amountStats?.total_orders) || 0,
        total_gross_amount: parseInt(amountStats?.total_gross_amount) || 0,
        total_fee_amount: parseInt(amountStats?.total_fee_amount) || 0,
        total_net_amount: parseInt(amountStats?.total_net_amount) || 0
      }
    }
  }

  /**
   * 获取用户的交易历史统计（管理后台用）
   *
   * @param {number} user_id - 用户ID
   * @returns {Promise<Object>} 用户交易统计
   */
  static async getUserTradeStats(user_id) {
    // 作为买家的统计
    const buyerStats = await TradeOrder.findOne({
      attributes: [
        [fn('COUNT', col('trade_order_id')), 'total_orders'],
        [fn('SUM', col('gross_amount')), 'total_spent']
      ],
      where: { buyer_user_id: user_id, status: 'completed' },
      raw: true
    })

    // 作为卖家的统计
    const sellerStats = await TradeOrder.findOne({
      attributes: [
        [fn('COUNT', col('trade_order_id')), 'total_orders'],
        [fn('SUM', col('net_amount')), 'total_earned']
      ],
      where: { seller_user_id: user_id, status: 'completed' },
      raw: true
    })

    return {
      user_id,
      as_buyer: {
        total_orders: parseInt(buyerStats?.total_orders) || 0,
        total_spent: parseInt(buyerStats?.total_spent) || 0
      },
      as_seller: {
        total_orders: parseInt(sellerStats?.total_orders) || 0,
        total_earned: parseInt(sellerStats?.total_earned) || 0
      }
    }
  }
}

module.exports = TradeOrderService
