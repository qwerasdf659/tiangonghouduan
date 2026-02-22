/**
 * 背包域路由 - 用户物品操作统一入口
 *
 * 顶层路径：/api/v4/backpack
 *
 * 职责：
 * - 查询用户背包（双轨架构：assets[] + items[]）
 * - 查询物品详情
 * - 用户生成核销码（redeem）
 * - 用户直接使用物品（use）
 * - 用户兑换商品（exchange 子路由）
 *
 * 域边界说明（2026-02-07 阻塞项核实决策）：
 * - /backpack = 100% 用户域，所有登录用户可访问
 * - /shop = 100% 商家专属，不在此域
 * - 用户"生成核销码"是用户侧操作，放在用户域（参考美团模式）
 * - 商家"扫码核销"是商家侧操作，保留在 /shop 域
 *
 * 架构原则：
 * - 路由层不直连 models（通过 ServiceManager 获取服务）
 * - 写操作通过 TransactionManager.execute() 管理事务边界
 * - 路由通过 ServiceManager 获取 Service，不直接 require
 *
 * 创建时间：2025-12-29
 * 更新时间：2026-02-07（新增物品详情/核销码/使用/兑换路由）
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, getUserRoles } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const TransactionManager = require('../../../utils/TransactionManager')
const logger = require('../../../utils/logger').logger

/**
 * 错误处理包装器
 *
 * @param {Function} fn - 异步处理函数
 * @returns {Function} 包装后的中间件函数
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * GET /api/v4/backpack
 *
 * @description 查询用户背包（资产 + 物品）
 * @access Private
 *
 * 返回数据结构：
 * {
 *   assets: [      // 可叠加资产
 *     {
 *       asset_code: 'MATERIAL_001',
 *       display_name: '蓝色碎片',
 *       total_amount: 100,
 *       frozen_amount: 10,
 *       available_amount: 90
 *     }
 *   ],
 *   items: [       // 不可叠加物品
 *     {
 *       item_instance_id: 123,
 *       item_type: '优惠券',
 *       status: 'available',
 *       has_redemption_code: true,
 *       acquired_at: '2025-12-17T10:00:00+08:00'
 *     }
 *   ]
 * }
 */
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const user_id = req.user.user_id

    // 通过 ServiceManager 获取 BackpackService
    const BackpackService = req.app.locals.services.getService('backpack')

    const backpack = await BackpackService.getUserBackpack(user_id)

    return res.apiSuccess(backpack)
  })
)

/**
 * GET /api/v4/backpack/stats
 *
 * @description 查询用户背包统计信息
 * @access Private
 */
router.get(
  '/stats',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const user_id = req.user.user_id

    // 通过 ServiceManager 获取 BackpackService
    const BackpackService = req.app.locals.services.getService('backpack')

    const stats = await BackpackService.getBackpackStats(user_id)

    return res.apiSuccess(stats)
  })
)

/**
 * GET /api/v4/backpack/items/:item_instance_id
 *
 * @description 获取背包物品详情
 * @access Private（用户只能查看自己的物品，管理员可查看任意物品）
 *
 * @param {number} item_instance_id - 物品实例ID（路由参数）
 *
 * @returns {Object} 物品详情
 * {
 *   item_instance_id: 123,
 *   item_type: 'voucher',
 *   name: '10元代金券',
 *   status: 'available',
 *   rarity: 'common',
 *   description: '满100元可用',
 *   acquired_at: '2026-01-02T12:35:32.000+08:00',
 *   expires_at: null,
 *   is_owner: true,
 *   has_redemption_code: false
 * }
 */
router.get(
  '/items/:item_instance_id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { item_instance_id } = req.params
    const viewer_user_id = req.user.user_id

    // 参数验证：物品实例ID必须为正整数
    const instanceId = parseInt(item_instance_id, 10)
    if (isNaN(instanceId) || instanceId <= 0) {
      return res.apiError('无效的物品实例ID', 'BAD_REQUEST', null, 400)
    }

    // 获取用户角色（判断是否为管理员 role_level >= 100）
    const userRoles = await getUserRoles(viewer_user_id)
    const has_admin_access = userRoles.role_level >= 100

    // 通过 ServiceManager 获取 BackpackService
    const BackpackService = req.app.locals.services.getService('backpack')

    const itemDetail = await BackpackService.getItemDetail(instanceId, {
      viewer_user_id,
      has_admin_access
    })

    if (!itemDetail) {
      return res.apiError('物品不存在', 'NOT_FOUND', null, 404)
    }

    /*
     * γ 模式（D2 决策）：BackpackService 已是完整的领域转换层，
     * 不再经过 DataSanitizer（避免 ghost field 风险）。
     * BackpackService._getItems() 已从 meta JSON 提取面向用户的字段，
     * 不输出 owner_user_id、locks、item_template_id 等内部字段。
     */
    return res.apiSuccess(itemDetail, '获取物品详情成功')
  })
)

/**
 * POST /api/v4/backpack/items/:item_instance_id/redeem
 *
 * @description 用户为自己的物品生成核销码
 * @access Private（仅物品所有者或管理员可操作）
 *
 * 业务流程（美团模式）：
 * 1. 用户在小程序"背包"中选择一个 voucher/product 类型的物品
 * 2. 点击"生成核销码" → 调用此接口
 * 3. 后端生成12位Base32核销码，创建核销订单（30天有效）
 * 4. 返回明文核销码给用户（仅此一次）
 * 5. 用户到店出示核销码 → 商家调用 POST /shop/redemption/fulfill 完成核销
 *
 * @param {number} item_instance_id - 物品实例ID（路由参数）
 *
 * @returns {Object} { order, code }
 * - order: 核销订单信息（order_id, status, expires_at）
 * - code: 12位Base32明文核销码（仅此一次返回）
 */
router.post(
  '/items/:item_instance_id/redeem',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { item_instance_id } = req.params
    const user_id = req.user.user_id

    // 参数验证
    const instanceId = parseInt(item_instance_id, 10)
    if (isNaN(instanceId) || instanceId <= 0) {
      return res.apiError('无效的物品实例ID', 'BAD_REQUEST', null, 400)
    }

    logger.info('用户生成核销码请求', { user_id, item_instance_id: instanceId })

    try {
      // 通过 ServiceManager 获取 RedemptionService
      const RedemptionService = req.app.locals.services.getService('redemption_order')

      /*
       * 写操作通过 TransactionManager 管理事务边界
       * RedemptionService.createOrder 强制要求 options.transaction
       */
      const result = await TransactionManager.execute(async transaction => {
        return await RedemptionService.createOrder(instanceId, {
          transaction,
          creator_user_id: user_id
        })
      })

      logger.info('用户生成核销码成功', {
        user_id,
        item_instance_id: instanceId,
        redemption_order_id: result.order.redemption_order_id
      })

      let qrData = null
      try {
        const { getRedemptionQRSigner } = require('../../../utils/RedemptionQRSigner')
        const AdminSystemService = require('../../../services/AdminSystemService')
        const signer = getRedemptionQRSigner()
        const codeHash = require('../../../utils/RedemptionCodeGenerator').hash(result.code)
        const qrExpiryMinutes = Number(
          await AdminSystemService.getSettingValue('redemption', 'qr_code_expiry_minutes', 5)
        )
        qrData = signer.sign(result.order.redemption_order_id, codeHash, {
          expiry_ms: qrExpiryMinutes * 60 * 1000
        })
      } catch (qrError) {
        logger.warn('QR码生成失败（不影响文本码使用）', { error: qrError.message })
      }

      return res.apiSuccess(
        {
          order: {
            redemption_order_id: result.order.redemption_order_id,
            status: result.order.status,
            expires_at: result.order.expires_at
          },
          code: result.code,
          qr: qrData
        },
        '核销码生成成功，请在有效期内到店出示'
      )
    } catch (error) {
      logger.error('用户生成核销码失败', {
        error: error.message,
        user_id,
        item_instance_id: instanceId
      })
      return handleServiceError(error, res, '生成核销码失败')
    }
  })
)

/**
 * POST /api/v4/backpack/items/:item_instance_id/redeem/refresh-qr
 *
 * @description 刷新核销码的动态QR码（5分钟有效，过期后调用此接口刷新）
 * @access Private（仅物品所有者可操作）
 *
 * @param {number} item_instance_id - 物品实例ID（路由参数）
 *
 * @returns {Object} { qr: { qr_content, expires_at } }
 */
router.post(
  '/items/:item_instance_id/redeem/refresh-qr',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { item_instance_id } = req.params
    const user_id = req.user.user_id

    const instanceId = parseInt(item_instance_id, 10)
    if (isNaN(instanceId) || instanceId <= 0) {
      return res.apiError('无效的物品实例ID', 'BAD_REQUEST', null, 400)
    }

    try {
      const RedemptionService = req.app.locals.services.getService('redemption_order')

      // 查找该物品的 pending 核销订单
      const order = await RedemptionService.getOrderByItem(instanceId)

      if (!order) {
        return res.apiError('该物品没有待核销订单', 'NOT_FOUND', null, 404)
      }

      if (order.status !== 'pending') {
        return res.apiError('核销订单状态异常', 'ORDER_STATUS_INVALID', null, 400)
      }

      if (order.isExpired()) {
        return res.apiError('核销码已过期，请重新生成', 'ORDER_EXPIRED', null, 400)
      }

      const { getRedemptionQRSigner } = require('../../../utils/RedemptionQRSigner')
      const AdminSystemService = require('../../../services/AdminSystemService')
      const signer = getRedemptionQRSigner()
      const qrExpiryMinutes = Number(
        await AdminSystemService.getSettingValue('redemption', 'qr_code_expiry_minutes', 5)
      )
      const qrData = signer.sign(order.redemption_order_id, order.code_hash, {
        expiry_ms: qrExpiryMinutes * 60 * 1000
      })

      return res.apiSuccess(
        {
          redemption_order_id: order.redemption_order_id,
          qr: qrData
        },
        'QR码刷新成功'
      )
    } catch (error) {
      logger.error('QR码刷新失败', {
        error: error.message,
        user_id,
        item_instance_id: instanceId
      })
      return handleServiceError(error, res, 'QR码刷新失败')
    }
  })
)

/**
 * POST /api/v4/backpack/items/:item_instance_id/use
 *
 * @description 用户直接使用物品（纯线上数字物品/可直接使用的物品）
 * @access Private（仅物品所有者可操作）
 *
 * 业务场景：
 * - 使用虚拟道具（如体验卡、增益道具）
 * - 直接消耗不需要到店核销的物品
 * - 物品状态从 available → used
 *
 * 与 redeem 的区别：
 * - redeem：生成核销码 → 到店核销（O2O线下场景，voucher/product 类型）
 * - use：直接使用 → 立即生效（纯线上场景）
 *
 * @param {number} item_instance_id - 物品实例ID（路由参数）
 *
 * @returns {Object} { item_instance, is_duplicate }
 */
router.post(
  '/items/:item_instance_id/use',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { item_instance_id } = req.params
    const user_id = req.user.user_id

    // 参数验证
    const instanceId = parseInt(item_instance_id, 10)
    if (isNaN(instanceId) || instanceId <= 0) {
      return res.apiError('无效的物品实例ID', 'BAD_REQUEST', null, 400)
    }

    logger.info('用户直接使用物品请求', { user_id, item_instance_id: instanceId })

    try {
      /*
       * 通过 ServiceManager 获取服务
       * - BackpackService：验证物品所有权
       * - ItemService (asset_item)：执行物品消耗
       */
      const BackpackService = req.app.locals.services.getService('backpack')
      const ItemService = req.app.locals.services.getService('asset_item')

      // 写操作通过 TransactionManager 管理事务边界
      const result = await TransactionManager.execute(async transaction => {
        /*
         * 1. 验证物品存在且属于当前用户
         * 使用 getItemDetail 进行所有权检查（非管理员模式）
         */
        const itemDetail = await BackpackService.getItemDetail(instanceId, {
          viewer_user_id: user_id,
          has_admin_access: false,
          transaction
        })

        if (!itemDetail) {
          const notFoundError = new Error('物品不存在')
          notFoundError.statusCode = 404
          throw notFoundError
        }

        // 2. 验证物品状态（只有 available 状态的物品才能直接使用）
        if (itemDetail.status !== 'available') {
          const statusError = new Error(`物品当前状态为"${itemDetail.status}"，无法使用`)
          statusError.statusCode = 400
          throw statusError
        }

        // 3. 调用 ItemService.consumeItem 执行物品消耗
        const consumeResult = await ItemService.consumeItem(
          {
            item_instance_id: instanceId,
            operator_user_id: user_id,
            business_type: 'backpack_use',
            idempotency_key: `backpack_use_${instanceId}_${user_id}_${Date.now()}`,
            meta: {
              source: 'backpack',
              action: 'direct_use'
            }
          },
          { transaction }
        )

        return consumeResult
      })

      logger.info('用户直接使用物品成功', {
        user_id,
        item_instance_id: instanceId,
        is_duplicate: result.is_duplicate
      })

      const instructions = await BackpackService.getUseInstructions(result.item_instance)

      return res.apiSuccess(
        {
          item_instance_id: instanceId,
          status: 'used',
          is_duplicate: result.is_duplicate,
          instructions
        },
        result.is_duplicate ? '物品已使用（幂等回放）' : '物品使用成功'
      )
    } catch (error) {
      logger.error('用户直接使用物品失败', {
        error: error.message,
        user_id,
        item_instance_id: instanceId
      })
      return handleServiceError(error, res, '使用物品失败')
    }
  })
)

/*
 * ========================================
 * 兑换子路由挂载
 * 用户端兑换商品（从 /shop/exchange 迁移到 /backpack/exchange）
 * ========================================
 */
const exchangeRoutes = require('./exchange')
router.use('/exchange', exchangeRoutes)

/*
 * ========================================
 * 竞价子路由挂载
 * 用户端竞价功能（臻选空间/幸运空间竞价 2026-02-16）
 * ========================================
 */
const bidRoutes = require('./bid')
router.use('/bid', bidRoutes)

/**
 * ========================================
 * 物品流转时间线（资产全链路追踪 2026-02-22）
 * ========================================
 */

/**
 * GET /items/:item_id/timeline - 用户查看自己物品的流转历史
 *
 * 仅返回与当前用户相关的记录
 *
 * @route GET /api/v4/backpack/items/:item_id/timeline
 */
router.get('/items/:item_id/timeline', async (req, res) => {
  try {
    const ItemLifecycleService = require('../../../services/asset/ItemLifecycleService')
    const { Item } = require('../../../models')
    const BalanceService = require('../../../services/asset/BalanceService')

    const userId = req.user?.user_id
    if (!userId) return res.apiError('UNAUTHORIZED', '未登录', 401)

    const account = await BalanceService.getOrCreateAccount({ user_id: userId })
    const item = await Item.findByPk(req.params.item_id)

    if (!item || item.owner_account_id !== account.account_id) {
      return res.apiError('ITEM_NOT_FOUND', '物品不存在或无权访问', 404)
    }

    const lifecycle = await ItemLifecycleService.getLifecycle(item.item_id)
    if (!lifecycle) return res.apiError('ITEM_NOT_FOUND', '物品不存在', 404)

    return res.apiSuccess({
      tracking_code: lifecycle.tracking_code,
      item_name: lifecycle.item_name,
      item_type: lifecycle.item_type,
      status: lifecycle.status,
      timeline: lifecycle.timeline
    }, '获取物品时间线成功')
  } catch (error) {
    const logger = require('../../../utils/logger')
    logger.error('获取物品时间线失败', { error: error.message })
    return res.apiError('TIMELINE_QUERY_FAILED', error.message, 500)
  }
})

module.exports = router
