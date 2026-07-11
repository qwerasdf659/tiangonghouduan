/**
 * 用户域 B2C 兑换路由 - 以物易物端点（技术债务方案 7.4-8：路由拆分）
 *
 * 路径：/api/v4/exchange/barter（经 index.js 以 '/barter' 前缀挂载，
 * 对外 URL 与拆分前完全一致：GET /barter/recipes、POST /barter）
 *
 * 端点清单（纯搬移自原 routes/v4/exchange/index.js，逻辑不变）：
 * - GET  /recipes  → GET  /api/v4/exchange/barter/recipes  - 获取以物易物配方列表
 * - POST /         → POST /api/v4/exchange/barter          - 执行以物易物（B2C 官方合成）
 *
 * 架构规范：
 * - 通过 ServiceManager 获取服务（exchange_barter / idempotency）
 * - 写操作通过 TransactionManager.execute() 管理事务边界
 * - 并发防超：按 recipe_code 加 Redis 分布式锁（UnifiedDistributedLock）
 * - 统一使用 res.apiSuccess / res.apiError 响应
 *
 * @module routes/v4/exchange/barter
 * @created 2026-07-11（技术债务方案 7.4-8 拆分）
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { handleServiceError, asyncHandler } = require('../../../middleware/validation')
const TransactionManager = require('../../../utils/TransactionManager')
const UnifiedDistributedLock = require('../../../utils/UnifiedDistributedLock')

/**
 * GET /api/v4/exchange/barter/recipes
 *
 * @description 获取以物易物配方列表（旧物组合 → 官方产出物，仅启用项）。
 *              每项含产出商品展示字段（2026-07-11 小程序对接 B-1）：
 *              output_item_name（产出商品名）、output_fulfillment_type
 *              （'physical'=实物快递需选地址 / 'voucher' / 'virtual'，与履约分流同一判定源）。
 * @access Private（登录用户）
 *
 * @returns {Object} { recipes }
 */
router.get(
  '/recipes',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const BarterService = req.app.locals.services.getService('exchange_barter')
    const recipes = await BarterService.getEnabledRecipesForDisplay()
    return res.apiSuccess({ recipes })
  })
)

/**
 * POST /api/v4/exchange/barter
 *
 * @description 执行以物易物（B2C 官方合成）：用户旧物核销 → 官方库存产出新物。
 *              全程用户↔官方，无用户间转移；旧物真销毁、产出非货币型资产且方向等价/向下。
 *              履约分流（拍板⑩）：实物产出走 pending→发货链（address_id 必填），券/道具即时 completed。
 * @access Private（登录用户）
 *
 * @header {string} Idempotency-Key - 幂等键（必填）
 * @body {string} recipe_code - 配方码（必填）
 * @body {number[]} old_item_ids - 投入的旧物实例ID列表（必填，归属本人且 available）
 * @body {number} [address_id] - 收货地址主键（实物产出必填，校验归属本人，写入 address_snapshot）
 *
 * @returns {Object} { order_no, order_status, consumed_item_ids, minted_item }
 */
router.post(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const idempotency_key = req.headers['idempotency-key']
    if (!idempotency_key) {
      return res.apiError(
        '缺少必需的幂等键：请在 Header 中提供 Idempotency-Key',
        'MISSING_IDEMPOTENCY_KEY',
        { required_header: 'Idempotency-Key' },
        400
      )
    }

    const user_id = req.user.user_id
    const { recipe_code, old_item_ids, address_id } = req.body

    if (!recipe_code) {
      return res.apiError('recipe_code 不能为空', 'BAD_REQUEST', null, 400)
    }
    if (!Array.isArray(old_item_ids) || old_item_ids.length === 0) {
      return res.apiError('old_item_ids 必须是非空数组', 'BAD_REQUEST', null, 400)
    }

    const IdempotencyService = req.app.locals.services.getService('idempotency')
    const idempotencyResult = await IdempotencyService.getOrCreateRequest(idempotency_key, {
      api_path: '/api/v4/exchange/barter',
      http_method: 'POST',
      request_params: { recipe_code, old_item_ids, address_id: address_id || null },
      user_id
    })
    if (!idempotencyResult.should_process) {
      return res.apiSuccess({ ...idempotencyResult.response, is_duplicate: true })
    }

    try {
      const BarterService = req.app.locals.services.getService('exchange_barter')
      /*
       * 并发防超（工程加固 §9-3）：按 recipe_code 加 Redis 分布式锁，
       * 串行化"限量计数 + 落单"临界区——total_limit=1 时 N 并发恰好成功 1 笔。
       * 锁与幂等键互补：幂等键防同一请求重放，锁防不同用户并发超卖。
       */
      const distributedLock = new UnifiedDistributedLock()
      const result = await distributedLock.withLock(
        `barter_recipe:${recipe_code}`,
        async () => {
          // 事务边界由路由层管理（写操作收口到 Service + options.transaction）
          return TransactionManager.execute(async transaction => {
            return BarterService.executeBarter(
              user_id,
              recipe_code,
              old_item_ids,
              idempotency_key,
              { transaction, address_id: address_id || null }
            )
          })
        },
        { ttl: 15000 }
      )

      await IdempotencyService.markAsCompleted(idempotency_key, result.order_no, result)
      return res.apiSuccess(result, '以物易物兑换成功')
    } catch (error) {
      await IdempotencyService.markAsFailed(idempotency_key, error.message).catch(() => {})
      return handleServiceError(error, res, '以物易物兑换失败')
    }
  })
)

module.exports = router
