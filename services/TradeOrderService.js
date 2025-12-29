/**
 * 交易订单服务（Trade Order Service）
 *
 * 职责：
 * - 订单域（Order Domain）核心服务
 * - 统一管理交易订单的创建、取消、完成
 * - 协调资产冻结/解冻/结算（调用 AssetService）
 * - 协调物品所有权变更（调用 ItemInstance）
 * - 提供强幂等性保证（business_id）
 *
 * 业务流程：
 * 1. 创建订单（createOrder）：
 *    - 锁定挂牌（MarketListing.status = locked）
 *    - 冻结买家资产（AssetService.freeze）
 *    - 创建订单记录（TradeOrder.status = frozen）
 * 2. 完成订单（completeOrder）：
 *    - 从冻结资产结算（AssetService.settleFromFrozen）
 *    - 转移物品所有权（ItemInstance.owner_user_id）
 *    - 更新订单状态（TradeOrder.status = completed）
 * 3. 取消订单（cancelOrder）：
 *    - 解冻买家资产（AssetService.unfreeze）
 *    - 解锁挂牌（MarketListing.status = on_sale）
 *    - 更新订单状态（TradeOrder.status = cancelled）
 *
 * 创建时间：2025-12-15（Phase 2）
 * 更新时间：2025-12-21 - 暴力重构移除 UserInventory 引用
 */

const { sequelize, TradeOrder, MarketListing, ItemInstance } = require('../models')
const AssetService = require('./AssetService')
const logger = require('../utils/logger')

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
   * 1. 幂等性检查（business_id）
   * 2. 验证挂牌状态（on_sale）
   * 3. 锁定挂牌（status = locked）
   * 4. 冻结买家资产（AssetService.freeze）
   * 5. 创建订单记录（status = frozen）
   *
   * 幂等性规则：
   * - 相同 business_id + 相同参数 → 返回已有订单（is_duplicate=true）
   * - 相同 business_id + 不同参数 → 返回 409 冲突错误
   *
   * @param {Object} params - 订单参数
   * @param {string} params.business_id - 业务幂等ID（必需，格式：buy_listing_{listing_id}_{timestamp}）
   * @param {number} params.listing_id - 挂牌ID
   * @param {number} params.buyer_user_id - 买家用户ID
   * @param {Object} [options] - 事务选项
   * @param {Object} [options.transaction] - Sequelize事务对象（可选，用于外部事务）
   * @returns {Promise<Object>} 订单创建结果 {order, is_duplicate}
   * @throws {Error} 参数验证失败、挂牌不存在、挂牌状态异常、余额不足等
   */
  static async createOrder(params, options = {}) {
    const { business_id, listing_id, buyer_user_id } = params

    // 1. 参数验证
    if (!business_id) {
      throw new Error('business_id 是必需参数')
    }
    if (!listing_id) {
      throw new Error('listing_id 是必需参数')
    }
    if (!buyer_user_id) {
      throw new Error('buyer_user_id 是必需参数')
    }

    // 2. 幂等性检查
    const existingOrder = await TradeOrder.findOne({
      where: { business_id },
      transaction: options.transaction
    })

    if (existingOrder) {
      /**
       * 🔴 Phase 3 - P3-7：补齐交易市场 409 冲突校验（参数一致性）
       * 🔴 P1-2 强化：幂等回放路径也强制校验 DIAMOND-only
       *
       * 参数一致性指纹（来自文档）：
       * - listing_id
       * - buyer_user_id
       * - gross_amount（或 price_amount）
       * - asset_code（强制 DIAMOND）
       *
       * 目的：防止同一 business_id 被用于不同的业务参数
       */

      // 🔴 P1-2 关键修复：幂等回放路径强制校验已有订单的 asset_code 必须为 DIAMOND
      if (existingOrder.asset_code !== 'DIAMOND') {
        const error = new Error(
          `幂等回放发现异常订单：订单 ${existingOrder.order_id} 的 asset_code=${existingOrder.asset_code}，` +
            '不符合交易市场强制约束（只允许 DIAMOND）'
        )
        error.code = 'INVALID_ASSET_CODE'
        error.statusCode = 500 // 数据异常，服务端错误
        error.details = {
          order_id: existingOrder.order_id,
          business_id: existingOrder.business_id,
          asset_code: existingOrder.asset_code,
          expected: 'DIAMOND'
        }
        throw error
      }

      // 先查询挂牌信息获取 gross_amount 和 asset_code
      const tempListing = await MarketListing.findOne({
        where: { listing_id },
        transaction: options.transaction
      })

      if (!tempListing) {
        throw new Error(`挂牌不存在: ${listing_id}`)
      }

      // 🔴 P1-2 关键修复：幂等回放路径强制校验当前挂牌的 price_asset_code 必须为 DIAMOND
      if (tempListing.price_asset_code !== 'DIAMOND') {
        const error = new Error(
          `挂牌定价资产不合法: ${tempListing.price_asset_code}（交易市场只允许 DIAMOND）`
        )
        error.code = 'INVALID_ASSET_CODE'
        error.statusCode = 400
        error.details = {
          listing_id: tempListing.listing_id,
          price_asset_code: tempListing.price_asset_code,
          expected: 'DIAMOND'
        }
        throw error
      }

      const currentGrossAmount = tempListing.price_amount // gross_amount = price_amount
      const currentAssetCode = tempListing.price_asset_code // 已强制校验为 DIAMOND

      // 验证参数一致性（严格校验）
      const parameterMismatch = []

      if (existingOrder.listing_id !== listing_id) {
        parameterMismatch.push(`listing_id: ${existingOrder.listing_id} ≠ ${listing_id}`)
      }
      if (existingOrder.buyer_user_id !== buyer_user_id) {
        parameterMismatch.push(`buyer_user_id: ${existingOrder.buyer_user_id} ≠ ${buyer_user_id}`)
      }
      if (existingOrder.gross_amount !== currentGrossAmount) {
        parameterMismatch.push(
          `gross_amount: ${existingOrder.gross_amount} ≠ ${currentGrossAmount}`
        )
      }
      if (existingOrder.asset_code !== currentAssetCode) {
        parameterMismatch.push(`asset_code: ${existingOrder.asset_code} ≠ ${currentAssetCode}`)
      }

      if (parameterMismatch.length > 0) {
        const error = new Error(`business_id 冲突：${business_id} 已存在但参数不一致`)
        error.code = 'CONFLICT'
        error.statusCode = 409
        error.details = {
          business_id,
          existing_order_id: existingOrder.order_id,
          mismatched_parameters: parameterMismatch
        }
        throw error
      }

      logger.info(`[TradeOrderService] 幂等返回已有订单: ${existingOrder.order_id}`)
      return {
        order: existingOrder,
        is_duplicate: true
      }
    }

    // 3. 创建新订单（使用事务）
    const transaction = options.transaction || (await sequelize.transaction())

    try {
      // 3.1 查询挂牌信息
      const listing = await MarketListing.findOne({
        where: { listing_id },
        include: [
          {
            model: ItemInstance,
            as: 'offerItem',
            required: false
          }
        ],
        // 🔴 并发保护：对挂牌行加 FOR UPDATE，避免并发双买
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!listing) {
        throw new Error(`挂牌不存在: ${listing_id}`)
      }

      if (listing.status !== 'on_sale') {
        throw new Error(`挂牌状态异常: ${listing.status}，期望 on_sale`)
      }

      if (listing.seller_user_id === buyer_user_id) {
        throw new Error('不能购买自己的挂牌')
      }

      // 🔴 文档硬约束：交易市场结算币种只允许 DIAMOND
      if (listing.price_asset_code !== 'DIAMOND') {
        throw new Error(`挂牌定价资产不合法: ${listing.price_asset_code}（只允许 DIAMOND）`)
      }

      // 🔴 文档硬约束：可叠加资产挂牌购买时必须校验卖家标的已冻结
      if (listing.listing_kind === 'fungible_asset') {
        if (!listing.seller_offer_frozen) {
          throw new Error('卖家标的资产未冻结，挂牌状态异常（seller_offer_frozen=false）')
        }
        if (
          !listing.offer_asset_code ||
          !listing.offer_amount ||
          Number(listing.offer_amount) <= 0
        ) {
          throw new Error('可叠加资产挂牌标的信息缺失（offer_asset_code/offer_amount）')
        }
      }

      // 🔴 文档硬约束：不可叠加物品购买时必须校验并锁定 item_instances（所有权真相）
      if (listing.listing_kind === 'item_instance') {
        if (!listing.offer_item_instance_id) {
          throw new Error('挂牌缺少标的物品实例ID（offer_item_instance_id）')
        }

        const itemInstance = await ItemInstance.findOne({
          where: { item_instance_id: listing.offer_item_instance_id },
          lock: transaction.LOCK.UPDATE,
          transaction
        })

        if (!itemInstance) {
          throw new Error(`物品实例不存在: ${listing.offer_item_instance_id}`)
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
         * 🔴 文档硬约束：统一 5% 手续费 + min_fee=1（计算由 FeeCalculator 读取配置）
         * - item_instance：优先取 ItemInstance.meta.value 作为“价值锚点”
         * - fungible_asset：用 price_amount 作为价值锚点（当前单档位等价）
         */
        const itemValue =
          listing.listing_kind === 'item_instance'
            ? listing.offerItem?.meta?.value || listing.price_amount
            : listing.price_amount

        const feeInfo = FeeCalculator.calculateItemFee(itemValue, listing.price_amount)
        feeAmount = feeInfo.fee
        feeRate = feeInfo.rate

        logger.info('[TradeOrderService] 手续费计算完成', {
          item_value: itemValue,
          price_amount: listing.price_amount,
          fee_amount: feeAmount,
          fee_rate: feeRate,
          tier: feeInfo.tier
        })
      } else {
        logger.info('[TradeOrderService] 手续费已禁用或物品信息缺失，跳过手续费计算')
      }

      // 计算对账金额
      const grossAmount = listing.price_amount
      const netAmount = listing.price_amount - feeAmount

      // 验证对账公式
      if (grossAmount !== feeAmount + netAmount) {
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
       * 🔴 关键可靠性修复：避免“孤儿冻结”
       * 先创建订单（created）并把 listing.locked_by_order_id 绑定到订单，
       * 再冻结买家资产，最后把订单推进到 frozen。
       *
       * 这样即使后续异常，定时任务也能通过 locked_by_order_id 找到订单并走 cancelOrder 解冻。
       */

      // 3.4 创建订单记录（created）
      const order = await TradeOrder.create(
        {
          business_id,
          listing_id,
          buyer_user_id,
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
          locked_by_order_id: order.order_id
        },
        { transaction }
      )

      // 3.6 冻结买家资产
      const freezeResult = await AssetService.freeze(
        {
          business_id, // 使用同一 business_id
          business_type: 'order_freeze_buyer', // 通过 business_type 区分冻结分录
          user_id: buyer_user_id,
          asset_code: listing.price_asset_code,
          amount: grossAmount,
          meta: {
            order_action: 'freeze',
            order_id: order.order_id,
            listing_id,
            freeze_reason: `购买挂牌 ${listing_id}`
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

      // 提交事务
      if (!options.transaction) {
        await transaction.commit()
      }

      logger.info(`[TradeOrderService] 订单创建成功: ${order.order_id}`, {
        business_id,
        listing_id,
        buyer_user_id
      })

      return {
        order,
        is_duplicate: false
      }
    } catch (error) {
      // 回滚事务
      if (!options.transaction) {
        await transaction.rollback()
      }

      logger.error(`[TradeOrderService] 订单创建失败: ${error.message}`, {
        business_id,
        listing_id,
        buyer_user_id
      })

      throw error
    }
  }

  /**
   * 完成交易订单
   *
   * 业务流程：
   * 1. 验证订单状态（frozen）
   * 2. 从冻结资产结算（AssetService.settleFromFrozen）
   * 3. 转移物品所有权（ItemInstance.owner_user_id）
   * 4. 更新订单状态（completed）
   * 5. 更新挂牌状态（sold）
   *
   * @param {Object} params - 完成订单参数
   * @param {number} params.order_id - 订单ID
   * @param {string} params.business_id - 业务幂等ID（必需）
   * @param {Object} [options] - 事务选项
   * @param {Object} [options.transaction] - Sequelize事务对象（可选）
   * @returns {Promise<Object>} 完成结果 {order, settlement}
   * @throws {Error} 订单不存在、状态异常等
   */
  static async completeOrder(params, options = {}) {
    const { order_id, business_id } = params

    // 参数验证
    if (!order_id) {
      throw new Error('order_id 是必需参数')
    }
    if (!business_id) {
      throw new Error('business_id 是必需参数')
    }

    const transaction = options.transaction || (await sequelize.transaction())

    try {
      // 1. 查询订单
      const order = await TradeOrder.findOne({
        where: { order_id },
        include: [
          {
            model: MarketListing,
            as: 'listing'
          }
        ],
        transaction
      })

      if (!order) {
        throw new Error(`订单不存在: ${order_id}`)
      }

      if (order.status !== 'frozen') {
        throw new Error(`订单状态异常: ${order.status}，期望 frozen`)
      }

      const listing = order.listing

      // 2. 从冻结资产结算（三笔：买家扣减、卖家入账、平台手续费）

      // 2.1 买家从冻结资产扣减
      await AssetService.settleFromFrozen(
        {
          business_id, // 使用同一 business_id
          business_type: 'order_settle_buyer_debit',
          user_id: order.buyer_user_id,
          asset_code: order.asset_code,
          amount: order.gross_amount,
          meta: {
            order_id: order.order_id,
            listing_id: order.listing_id,
            gross_amount: order.gross_amount,
            fee_amount: order.fee_amount,
            net_amount: order.net_amount
          }
        },
        { transaction }
      )

      // 2.2 卖家入账（实收金额）
      if (order.net_amount > 0) {
        await AssetService.changeBalance(
          {
            business_id, // 使用同一 business_id
            business_type: 'order_settle_seller_credit',
            user_id: order.seller_user_id,
            asset_code: order.asset_code,
            delta_amount: order.net_amount,
            meta: {
              order_id: order.order_id,
              listing_id: order.listing_id,
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
        await AssetService.changeBalance(
          {
            business_id, // 使用同一 business_id
            business_type: 'order_settle_platform_fee_credit',
            system_code: 'SYSTEM_PLATFORM_FEE',
            asset_code: order.asset_code,
            delta_amount: order.fee_amount,
            meta: {
              order_id: order.order_id,
              listing_id: order.listing_id,
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
      if (listing.listing_kind === 'item_instance' && listing.offer_item_instance_id) {
        // 🔴 统一资产域架构：使用 AssetService.transferItem() 转移物品所有权
        const { ItemInstance } = require('../models')
        const itemInstance = await ItemInstance.findOne({
          where: { item_instance_id: listing.offer_item_instance_id },
          lock: transaction.LOCK.UPDATE,
          transaction
        })

        if (!itemInstance) {
          throw new Error(`物品实例不存在: ${listing.offer_item_instance_id}`)
        }

        // 所有权一致性校验（防止异常数据导致越权转移）
        if (Number(itemInstance.owner_user_id) !== Number(order.seller_user_id)) {
          throw new Error('物品所有权异常：物品不属于卖家，禁止成交转移')
        }

        // 使用 AssetService.transferItem() 转移所有权（自动记录事件）
        const AssetService = require('./AssetService')
        await AssetService.transferItem(
          {
            item_instance_id: itemInstance.item_instance_id,
            new_owner_id: order.buyer_user_id,
            business_type: 'market_transfer',
            business_id: order.order_id,
            meta: {
              listing_id: order.listing_id,
              from_user: order.seller_user_id,
              to_user: order.buyer_user_id,
              gross_amount: order.gross_amount,
              fee_amount: order.fee_amount,
              net_amount: order.net_amount
            }
          },
          { transaction }
        )

        logger.info('[TradeOrderService] 物品所有权已转移（通过 AssetService.transferItem）', {
          item_instance_id: itemInstance.item_instance_id,
          from: order.seller_user_id,
          to: order.buyer_user_id
        })
      } else if (listing.listing_kind === 'fungible_asset' && listing.offer_asset_code) {
        /**
         * 🔴 Phase 3 - P3-6：可叠加资产成交交付（双分录）
         *
         * 业务流程：
         * - 卖家：从冻结扣减标的资产（listing_settle_seller_offer_debit）
         * - 买家：收到标的资产入账（listing_transfer_buyer_offer_credit）
         */

        // 3.2.1 卖家：从冻结扣减标的资产
        await AssetService.settleFromFrozen(
          {
            business_id, // 使用同一 business_id
            business_type: 'listing_settle_seller_offer_debit',
            user_id: order.seller_user_id,
            asset_code: listing.offer_asset_code,
            amount: listing.offer_amount,
            meta: {
              order_id: order.order_id,
              listing_id: order.listing_id,
              buyer_user_id: order.buyer_user_id,
              offer_asset_code: listing.offer_asset_code,
              offer_amount: listing.offer_amount,
              action: 'seller_offer_debit'
            }
          },
          { transaction }
        )

        logger.info('[TradeOrderService] 卖家标的资产已从冻结扣减', {
          order_id,
          seller_user_id: order.seller_user_id,
          asset_code: listing.offer_asset_code,
          amount: listing.offer_amount
        })

        // 3.2.2 买家：收到标的资产入账
        await AssetService.changeBalance(
          {
            business_id, // 使用同一 business_id
            business_type: 'listing_transfer_buyer_offer_credit',
            user_id: order.buyer_user_id,
            asset_code: listing.offer_asset_code,
            delta_amount: listing.offer_amount,
            meta: {
              order_id: order.order_id,
              listing_id: order.listing_id,
              seller_user_id: order.seller_user_id,
              offer_asset_code: listing.offer_asset_code,
              offer_amount: listing.offer_amount,
              action: 'buyer_offer_credit'
            }
          },
          { transaction }
        )

        logger.info('[TradeOrderService] 买家已收到标的资产', {
          order_id,
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

      // 提交事务
      if (!options.transaction) {
        await transaction.commit()
      }

      logger.info(`[TradeOrderService] 订单完成: ${order_id}`, {
        business_id,
        buyer_user_id: order.buyer_user_id,
        seller_user_id: order.seller_user_id,
        gross_amount: order.gross_amount,
        fee_amount: order.fee_amount,
        net_amount: order.net_amount
      })

      return {
        order
      }
    } catch (error) {
      // 回滚事务
      if (!options.transaction) {
        await transaction.rollback()
      }

      logger.error(`[TradeOrderService] 订单完成失败: ${error.message}`, {
        order_id,
        business_id
      })

      throw error
    }
  }

  /**
   * 取消交易订单
   *
   * 业务流程：
   * 1. 验证订单状态（frozen）
   * 2. 解冻买家资产（AssetService.unfreeze）
   * 3. 解锁挂牌（status = on_sale）
   * 4. 更新订单状态（cancelled）
   *
   * @param {Object} params - 取消订单参数
   * @param {number} params.order_id - 订单ID
   * @param {string} params.business_id - 业务幂等ID（必需）
   * @param {string} [params.cancel_reason] - 取消原因（可选）
   * @param {Object} [options] - 事务选项
   * @param {Object} [options.transaction] - Sequelize事务对象（可选）
   * @returns {Promise<Object>} 取消结果 {order, unfreeze}
   * @throws {Error} 订单不存在、状态异常等
   */
  static async cancelOrder(params, options = {}) {
    const { order_id, business_id, cancel_reason } = params

    // 参数验证
    if (!order_id) {
      throw new Error('order_id 是必需参数')
    }
    if (!business_id) {
      throw new Error('business_id 是必需参数')
    }

    const transaction = options.transaction || (await sequelize.transaction())

    try {
      // 1. 查询订单
      const order = await TradeOrder.findOne({
        where: { order_id },
        include: [
          {
            model: MarketListing,
            as: 'listing'
          }
        ],
        transaction
      })

      if (!order) {
        throw new Error(`订单不存在: ${order_id}`)
      }

      if (order.status !== 'frozen' && order.status !== 'created') {
        throw new Error(`订单状态异常: ${order.status}，期望 frozen 或 created`)
      }

      const listing = order.listing

      // 2. 解冻买家资产
      const unfreezeResult = await AssetService.unfreeze(
        {
          business_id, // 使用同一 business_id
          business_type: 'order_unfreeze_buyer', // 通过 business_type 区分解冻分录
          user_id: order.buyer_user_id,
          asset_code: order.asset_code,
          amount: order.gross_amount,
          meta: {
            order_action: 'unfreeze',
            order_id,
            unfreeze_reason: cancel_reason || `取消订单 ${order_id}`
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

      // 提交事务
      if (!options.transaction) {
        await transaction.commit()
      }

      logger.info(`[TradeOrderService] 订单取消: ${order_id}`, {
        business_id,
        cancel_reason
      })

      return {
        order,
        unfreeze: unfreezeResult
      }
    } catch (error) {
      // 回滚事务
      if (!options.transaction) {
        await transaction.rollback()
      }

      logger.error(`[TradeOrderService] 订单取消失败: ${error.message}`, {
        order_id,
        business_id
      })

      throw error
    }
  }

  /**
   * 查询订单详情
   *
   * @param {number} order_id - 订单ID
   * @returns {Promise<Object>} 订单详情
   */
  static async getOrderDetail(order_id) {
    const order = await TradeOrder.findOne({
      where: { order_id },
      include: [
        {
          model: MarketListing,
          as: 'listing',
          include: [
            {
              model: ItemInstance,
              as: 'offerItem'
            }
          ]
        }
      ]
    })

    if (!order) {
      throw new Error(`订单不存在: ${order_id}`)
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
}

module.exports = TradeOrderService
