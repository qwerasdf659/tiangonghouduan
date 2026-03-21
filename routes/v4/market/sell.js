/**
 * 交易市场模块 - 上架商品
 *
 * @route /api/v4/market
 * @description 用户上架商品到交易市场
 *
 * API列表：
 * - POST /list - 上架物品实例到交易市场
 * - POST /fungible-assets/list - 挂牌可叠加资产到市场（交易市场材料交易）
 *
 * 业务场景：
 * - 用户将库存物品/可叠加资产上架到交易市场出售
 * - 上架限制：材料和物品共享，最多同时上架10件
 * - 使用 Idempotency-Key（Header）进行幂等控制
 *
 * 幂等性保证（业界标准形态 - 破坏性重构 2026-01-02）：
 * - 统一只接受 Header Idempotency-Key，不接受 body 中的 business_id
 * - 缺失幂等键直接返回 400
 *
 * 创建时间：2025年12月22日
 * 更新时间：2026年01月02日 - 业界标准形态破坏性重构
 * 更新时间：2026年01月08日 - 实现可叠加资产挂牌功能（交易市场材料交易）
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { requireValidSession } = require('../../../middleware/sensitiveOperation') // 🔐 会话管理功能（2026-01-21）
const { handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger
// 事务边界治理 - 统一事务管理器
const TransactionManager = require('../../../utils/TransactionManager')
// P1-9：服务通过 ServiceManager 获取（B1-Injected + E2-Strict snake_case）

/*
 * 风控中间件（2026-01-14 多币种扩展新增）
 * - 挂牌操作执行 fail-closed 策略：Redis 不可用时拒绝挂牌
 * - 提供风控预检和上下文注入
 */
const {
  getMarketRiskControlMiddleware
} = require('../../../middleware/MarketRiskControlMiddleware')
const marketRiskMiddleware = getMarketRiskControlMiddleware()

/**
 * @route POST /api/v4/market/list
 * @desc 上架商品到交易市场
 * @access Private (需要登录)
 *
 * @header {string} Idempotency-Key - 幂等键（必填，不接受body参数）
 * @body {number} item_id - 物品ID（必填）
 * @body {number} price_amount - 售价（必填，大于0的整数）
 * @body {string} price_asset_code - 定价结算币种（必填，支持：DIAMOND/red_shard）
 * @body {string} condition - 物品状态（可选，默认good）
 *
 * @returns {Object} 上架结果
 * @returns {Object} data.listing - 挂牌信息
 * @returns {number} data.listing.market_listing_id - 挂牌ID
 * @returns {number} data.listing.item_id - 物品ID
 * @returns {number} data.listing.price_amount - 售价
 * @returns {boolean} data.listing.is_duplicate - 是否为幂等回放请求
 * @returns {Object} data.listing_status - 上架状态
 * @returns {number} data.listing_status.current - 当前上架数量
 * @returns {number} data.listing_status.limit - 上架上限
 * @returns {number} data.listing_status.remaining - 剩余可上架数量
 *
 * 业务场景：用户将库存物品上架到交易市场出售
 * 上架限制：最多同时上架10件商品
 * 幂等性控制（业界标准形态）：统一通过 Header Idempotency-Key 防止重复上架
 *
 * 多币种扩展（2026-01-14）：
 * - price_asset_code 参数支持选择结算币种
 * - 白名单由 system_settings.allowed_settlement_assets 控制
 * - 不同币种有不同的手续费计算逻辑
 */
router.post(
  '/list',
  authenticateToken,
  requireValidSession, // 🔐 市场挂牌属于敏感操作，需验证会话（2026-01-21 会话管理功能）
  marketRiskMiddleware.createListingRiskMiddleware(),
  async (req, res) => {
    // P1-9：通过 ServiceManager 获取服务（B1-Injected + E2-Strict snake_case）
    const IdempotencyService = req.app.locals.services.getService('idempotency')
    const MarketListingService = req.app.locals.services.getService('market_listing_core')

    // 【业界标准形态】强制从 Header 获取幂等键，不接受 body
    const idempotency_key = req.headers['idempotency-key']

    // 缺失幂等键直接返回 400
    if (!idempotency_key) {
      return res.apiError(
        '缺少必需的幂等键：请在 Header 中提供 Idempotency-Key。' +
          '重试时必须复用同一幂等键以防止重复上架。',
        'MISSING_IDEMPOTENCY_KEY',
        {
          required_header: 'Idempotency-Key',
          example: 'Idempotency-Key: market_list_<timestamp>_<random>'
        },
        400
      )
    }

    try {
      const userId = req.user.user_id
      const { item_id, price_amount } = req.body

      if (!item_id || price_amount === undefined) {
        return res.apiError('缺少必要参数：item_id 和 price_amount', 'BAD_REQUEST', null, 400)
      }

      const itemId = parseInt(item_id, 10)
      const priceAmountValue = parseInt(price_amount, 10)

      if (isNaN(itemId) || itemId <= 0) {
        return res.apiError('无效的物品ID', 'BAD_REQUEST', null, 400)
      }

      if (isNaN(priceAmountValue) || priceAmountValue <= 0) {
        return res.apiError('售价必须是大于0的整数', 'BAD_REQUEST', null, 400)
      }

      /*
       * 多币种扩展（2026-01-14）：price_asset_code 参数
       * - 必填参数（2026-01-20 清理兼容代码：移除默认值）
       * - 支持值：DIAMOND、red_shard（由 system_settings.allowed_settlement_assets 控制）
       * - 校验逻辑在 Service 层统一处理（白名单校验）
       */
      const priceAssetCode = req.body.price_asset_code
      if (!priceAssetCode) {
        return res.apiError(
          'price_asset_code 是必填参数（如 DIAMOND、red_shard）',
          'MISSING_REQUIRED_FIELD',
          { field: 'price_asset_code', allowed_values: ['DIAMOND', 'red_shard'] },
          400
        )
      }

      /*
       * 【入口幂等检查】防止同一次请求被重复提交
       * 统一使用 IdempotencyService 进行请求级幂等控制
       */
      const idempotencyResult = await IdempotencyService.getOrCreateRequest(idempotency_key, {
        api_path: '/api/v4/market/list',
        http_method: 'POST',
        request_params: {
          item_id: itemId,
          price_amount: priceAmountValue,
          price_asset_code: priceAssetCode
        },
        user_id: userId
      })

      // 如果已完成，直接返回首次结果（幂等性要求）+ is_duplicate 标记
      if (!idempotencyResult.should_process) {
        logger.info('🔄 入口幂等拦截：重复请求，返回首次结果', {
          idempotency_key,
          user_id: userId,
          item_id: itemId
        })
        const duplicateResponse = {
          ...idempotencyResult.response,
          is_duplicate: true
        }
        return res.apiSuccess(duplicateResponse, '上架成功（幂等回放）')
      }

      // 检查上架数量限制（通过 Service 层访问，符合路由层规范）
      const listingCountInfo = await MarketListingService.getUserActiveListingCount(userId)

      if (listingCountInfo.remaining_count <= 0) {
        await IdempotencyService.markAsFailed(idempotency_key, '上架数量已达上限')
        return res.apiError(
          `已达到最大上架数量限制（${listingCountInfo.max_count}件）`,
          'LISTING_LIMIT_EXCEEDED',
          {
            current: listingCountInfo.active_count,
            limit: listingCountInfo.max_count
          },
          400
        )
      }

      // 决策5B/0C：使用 MarketListingService 统一处理上架
      const responseData = await TransactionManager.execute(
        async transaction => {
          const { listing, is_duplicate } = await MarketListingService.createListing(
            {
              idempotency_key,
              seller_user_id: userId,
              item_id: itemId,
              price_amount: priceAmountValue,
              price_asset_code: priceAssetCode // 多币种扩展（2026-01-14）：使用请求参数
            },
            { transaction }
          )

          // 构建响应数据（使用从 listingCountInfo 获取的上架数量）
          const currentCount = listingCountInfo.active_count
          return {
            listing: {
              market_listing_id: listing.market_listing_id,
              item_id: itemId,
              price_amount: priceAmountValue,
              is_duplicate
            },
            listing_status: {
              current: currentCount + 1,
              limit: listingCountInfo.max_count,
              remaining: listingCountInfo.max_count - currentCount - 1
            },
            _market_listing_id: listing.market_listing_id, // 内部使用，记录幂等
            _is_duplicate: is_duplicate // 内部标记
          }
        },
        { description: 'market_list_item' }
      )

      // 如果是Service层幂等返回，也标记为成功
      if (!responseData._is_duplicate) {
        /*
         * 【标记请求完成】保存结果快照到入口幂等表
         */
        await IdempotencyService.markAsCompleted(
          idempotency_key,
          responseData._market_listing_id, // 业务事件ID = 挂牌ID
          { listing: responseData.listing, listing_status: responseData.listing_status }
        )
      }

      // 缓存失效已在 MarketListingService.createListing 中处理（决策5B）

      logger.info('商品上架成功', {
        user_id: userId,
        item_id: itemId,
        market_listing_id: responseData._market_listing_id,
        idempotency_key,
        price_amount: priceAmountValue,
        current_listings: responseData.listing_status.current,
        is_duplicate: responseData._is_duplicate
      })

      return res.apiSuccess(
        { listing: responseData.listing, listing_status: responseData.listing_status },
        '上架成功'
      )
    } catch (error) {
      // 标记幂等请求失败（允许重试）
      await IdempotencyService.markAsFailed(idempotency_key, error.message).catch(markError => {
        logger.error('标记幂等请求失败状态时出错:', markError)
      })

      // 数据库死锁错误处理（高并发场景）
      const isDeadlock =
        error.message?.includes('Deadlock') ||
        error.message?.includes('deadlock') ||
        error.parent?.code === 'ER_LOCK_DEADLOCK'
      if (isDeadlock) {
        logger.warn('数据库死锁（并发竞争），建议重试', {
          idempotency_key,
          user_id: req.user?.user_id
        })
        return res.apiError('服务繁忙，请稍后重试', 'CONCURRENT_CONFLICT', { retry_after: 1 }, 409)
      }

      // 处理幂等键冲突错误（409状态码）
      if (error.statusCode === 409) {
        logger.warn('幂等性错误:', {
          idempotency_key,
          error_code: error.errorCode,
          message: error.message
        })
        return res.apiError(error.message, error.errorCode || 'IDEMPOTENCY_ERROR', {}, 409)
      }

      logger.error('上架失败', {
        error: error.message,
        user_id: req.user?.user_id,
        idempotency_key
      })

      return handleServiceError(error, res, '上架失败')
    }
  }
)

/**
 * @route POST /api/v4/market/fungible-assets/list
 * @desc 挂牌可叠加资产到市场（交易市场材料交易）
 * @access Private (需要登录)
 *
 * @header {string} Idempotency-Key - 幂等键（必填，不接受body参数）
 * @body {string} offer_asset_code - 挂卖资产代码（如 red_shard，必填）
 * @body {number} offer_amount - 挂卖数量（正整数，必填）
 * @body {number} price_amount - 定价金额（必填，大于0）
 * @body {string} price_asset_code - 定价结算币种（必填，支持：DIAMOND/red_shard）
 *
 * @returns {Object} 挂牌结果
 * @returns {Object} data.listing - 挂牌信息
 * @returns {number} data.listing.market_listing_id - 挂牌ID
 * @returns {string} data.listing.offer_asset_code - 挂卖资产代码
 * @returns {number} data.listing.offer_amount - 挂卖数量
 * @returns {number} data.listing.price_amount - 定价金额
 * @returns {string} data.listing.price_asset_code - 结算币种代码
 * @returns {boolean} data.listing.is_duplicate - 是否为幂等回放请求
 * @returns {Object} data.listing_status - 上架状态
 * @returns {Object} data.balance_after - 冻结后余额信息
 *
 * 业务场景：用户将可叠加资产（如材料）挂牌到交易市场出售
 *
 * 多币种扩展（2026-01-14）：
 * - price_asset_code 参数支持选择结算币种
 * - 白名单由 system_settings.allowed_settlement_assets 控制
 * 挂牌限制：材料和物品共享，最多同时上架10件
 * 幂等性控制：通过 Header Idempotency-Key 防止重复挂牌
 */
router.post(
  '/fungible-assets/list',
  authenticateToken,
  requireValidSession, // 🔐 可叠加资产挂牌属于敏感操作，需验证会话（2026-01-21 会话管理功能）
  marketRiskMiddleware.createListingRiskMiddleware(),
  async (req, res) => {
    // P1-9：通过 ServiceManager 获取服务（B1-Injected + E2-Strict snake_case）
    const IdempotencyService = req.app.locals.services.getService('idempotency')
    const MarketListingService = req.app.locals.services.getService('market_listing_core')

    // 【业界标准形态】强制从 Header 获取幂等键
    const idempotency_key = req.headers['idempotency-key']

    // 缺失幂等键直接返回 400
    if (!idempotency_key) {
      return res.apiError(
        '缺少必需的幂等键：请在 Header 中提供 Idempotency-Key。' +
          '重试时必须复用同一幂等键以防止重复挂牌。',
        'MISSING_IDEMPOTENCY_KEY',
        {
          required_header: 'Idempotency-Key',
          example: 'Idempotency-Key: fungible_list_<timestamp>_<random>'
        },
        400
      )
    }

    try {
      const userId = req.user.user_id
      const { offer_asset_code, offer_amount, price_amount } = req.body

      // 参数验证
      if (!offer_asset_code) {
        return res.apiError(
          '缺少必要参数：offer_asset_code（挂卖资产代码）',
          'BAD_REQUEST',
          { required: ['offer_asset_code', 'offer_amount', 'price_amount'] },
          400
        )
      }

      if (!offer_amount || offer_amount === undefined) {
        return res.apiError(
          '缺少必要参数：offer_amount（挂卖数量）',
          'BAD_REQUEST',
          { required: ['offer_asset_code', 'offer_amount', 'price_amount'] },
          400
        )
      }

      if (!price_amount || price_amount === undefined) {
        return res.apiError(
          '缺少必要参数：price_amount（定价金额）',
          'BAD_REQUEST',
          { required: ['offer_asset_code', 'offer_amount', 'price_amount'] },
          400
        )
      }

      const offerAmountValue = parseInt(offer_amount, 10)
      const priceAmountValue = parseInt(price_amount, 10)

      if (isNaN(offerAmountValue) || offerAmountValue <= 0 || !Number.isInteger(offerAmountValue)) {
        return res.apiError('挂卖数量必须是大于0的正整数', 'BAD_REQUEST', null, 400)
      }

      if (isNaN(priceAmountValue) || priceAmountValue <= 0) {
        return res.apiError('定价金额必须是大于0的整数', 'BAD_REQUEST', null, 400)
      }

      /*
       * 多币种扩展（2026-01-14）：price_asset_code 参数
       * - 必填参数（2026-01-20 清理兼容代码：移除默认值）
       * - 支持值：DIAMOND、red_shard（由 system_settings.allowed_settlement_assets 控制）
       */
      const priceAssetCode = req.body.price_asset_code
      if (!priceAssetCode) {
        return res.apiError(
          'price_asset_code 是必填参数（如 DIAMOND、red_shard）',
          'MISSING_REQUIRED_FIELD',
          { field: 'price_asset_code', allowed_values: ['DIAMOND', 'red_shard'] },
          400
        )
      }

      /*
       * 【入口幂等检查】防止同一次请求被重复提交
       */
      const idempotencyResult = await IdempotencyService.getOrCreateRequest(idempotency_key, {
        api_path: '/api/v4/market/fungible-assets/list',
        http_method: 'POST',
        request_params: {
          offer_asset_code,
          offer_amount: offerAmountValue,
          price_amount: priceAmountValue,
          price_asset_code: priceAssetCode
        },
        user_id: userId
      })

      // 如果已完成，直接返回首次结果
      if (!idempotencyResult.should_process) {
        logger.info('🔄 入口幂等拦截：重复请求，返回首次结果', {
          idempotency_key,
          user_id: userId,
          offer_asset_code
        })
        const duplicateResponse = {
          ...idempotencyResult.response,
          is_duplicate: true
        }
        return res.apiSuccess(duplicateResponse, '挂牌成功（幂等回放）')
      }

      // 使用事务执行挂牌操作
      const responseData = await TransactionManager.execute(
        async transaction => {
          const { listing, freeze_result, is_duplicate } =
            await MarketListingService.createFungibleAssetListing(
              {
                idempotency_key,
                seller_user_id: userId,
                offer_asset_code,
                offer_amount: offerAmountValue,
                price_amount: priceAmountValue,
                price_asset_code: priceAssetCode // 多币种扩展（2026-01-14）：使用请求参数
              },
              { transaction }
            )

          // 获取用户当前挂牌状态
          const listingStatus = await MarketListingService.getUserActiveListingCount(userId, {
            transaction
          })

          // 构建响应数据
          return {
            listing: {
              market_listing_id: listing.market_listing_id,
              listing_kind: 'fungible_asset',
              offer_asset_code: listing.offer_asset_code,
              offer_amount: Number(listing.offer_amount),
              price_amount: Number(listing.price_amount),
              price_asset_code: listing.price_asset_code,
              status: listing.status,
              is_duplicate
            },
            listing_status: {
              current: listingStatus.active_count,
              limit: listingStatus.max_count,
              remaining: listingStatus.remaining_count
            },
            balance_after: freeze_result?.balance
              ? {
                  available_amount: Number(freeze_result.balance.available_amount),
                  frozen_amount: Number(freeze_result.balance.frozen_amount)
                }
              : null,
            _market_listing_id: listing.market_listing_id,
            _is_duplicate: is_duplicate
          }
        },
        { description: 'market_list_fungible_asset' }
      )

      // 记录幂等完成状态
      if (!responseData._is_duplicate) {
        await IdempotencyService.markAsCompleted(idempotency_key, responseData._market_listing_id, {
          listing: responseData.listing,
          listing_status: responseData.listing_status,
          balance_after: responseData.balance_after
        })
      }

      logger.info('可叠加资产挂牌成功', {
        user_id: userId,
        market_listing_id: responseData._market_listing_id,
        offer_asset_code,
        offer_amount: offerAmountValue,
        price_amount: priceAmountValue,
        idempotency_key,
        is_duplicate: responseData._is_duplicate
      })

      return res.apiSuccess(
        {
          listing: responseData.listing,
          listing_status: responseData.listing_status,
          balance_after: responseData.balance_after
        },
        '挂牌成功'
      )
    } catch (error) {
      // 标记幂等请求失败
      await IdempotencyService.markAsFailed(idempotency_key, error.message).catch(markError => {
        logger.error('标记幂等请求失败状态时出错:', markError)
      })

      // 数据库死锁错误处理（高并发场景）
      const isDeadlock =
        error.message?.includes('Deadlock') ||
        error.message?.includes('deadlock') ||
        error.parent?.code === 'ER_LOCK_DEADLOCK'
      if (isDeadlock) {
        logger.warn('数据库死锁（并发竞争），建议重试', {
          idempotency_key,
          user_id: req.user?.user_id
        })
        return res.apiError('服务繁忙，请稍后重试', 'CONCURRENT_CONFLICT', { retry_after: 1 }, 409)
      }

      // 处理特定错误码
      if (error.code === 'LISTING_LIMIT_EXCEEDED') {
        return res.apiError(error.message, error.code, error.details, 400)
      }
      if (error.code === 'INSUFFICIENT_BALANCE') {
        return res.apiError(error.message, error.code, error.details, 400)
      }
      if (error.code === 'INVALID_ASSET_TYPE') {
        return res.apiError(error.message, error.code, null, 400)
      }
      if (error.statusCode === 409) {
        return res.apiError(error.message, error.code || 'IDEMPOTENCY_ERROR', error.details, 409)
      }

      logger.error('可叠加资产挂牌失败', {
        error: error.message,
        user_id: req.user?.user_id,
        idempotency_key,
        offer_asset_code: req.body?.offer_asset_code
      })

      return handleServiceError(error, res, '挂牌失败')
    }
  }
)

module.exports = router
