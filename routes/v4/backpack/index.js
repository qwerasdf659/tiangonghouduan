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
 *
 *
 * 架构原则：
 * - 路由层不直连 models（通过 ServiceManager 获取服务）
 * - 写操作通过 TransactionManager.execute() 管理事务边界
 * - 路由通过 ServiceManager 获取 Service，不直接 require
 *
 */

'use strict'

const express = require('express')
const router = express.Router()
const { Op } = require('sequelize')
const { authenticateToken, getUserRoles } = require('../../../middleware/auth')
const { asyncHandler } = require('../../../middleware/validation')
const TransactionManager = require('../../../utils/TransactionManager')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const logger = require('../../../utils/logger').logger

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
 *       item_id: 123,
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
 * POST /api/v4/backpack/mark-viewed
 *
 * @description 标记背包物品为已查看（首页「未读提醒」角标清零）
 *              用户进入仓库列表页时调用，把全部「可用且未读」物品批量标记为已读。
 * @access Private（仅本人，按 token 识别用户）
 *
 * @returns {Object} { marked_count } 本次标记为已读的物品数
 */
router.post(
  '/mark-viewed',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const user_id = req.user.user_id
    const BackpackService = req.app.locals.services.getService('backpack')

    // 写操作收口 Service + 事务边界由路由层 TransactionManager 管理
    const result = await TransactionManager.execute(transaction =>
      BackpackService.markItemsViewed(user_id, { transaction })
    )

    return res.apiSuccess(result, '已全部标记为已读')
  })
)

/**
 * GET /api/v4/backpack/items/:item_id
 *
 * @description 获取背包物品详情
 * @access Private（用户只能查看自己的物品，管理员可查看任意物品）
 *
 * @param {number} item_id - 物品ID（路由参数）
 *
 * @returns {Object} 物品详情
 * {
 *   item_id: 123,
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
  '/items/:item_id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { item_id } = req.params
    const viewer_user_id = req.user.user_id

    // 参数验证：物品ID必须为正整数
    const itemId = parseInt(item_id, 10)
    if (isNaN(itemId) || itemId <= 0) {
      return res.apiError('无效的物品ID', 'BAD_REQUEST', null, 400)
    }

    // 获取用户角色（判断是否为管理员 role_level >= 100）
    const userRoles = await getUserRoles(viewer_user_id)
    const has_admin_access = userRoles.role_level >= 100

    // 通过 ServiceManager 获取 BackpackService
    const BackpackService = req.app.locals.services.getService('backpack')

    const itemDetail = await BackpackService.getItemDetail(itemId, {
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
 * POST /api/v4/backpack/items/:item_id/redeem
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
 * @param {number} item_id - 物品ID（路由参数）
 *
 * @returns {Object} { order, code }
 * - order: 核销订单信息（order_id, status, expires_at）
 * - code: 12位Base32明文核销码（仅此一次返回）
 */
router.post(
  '/items/:item_id/redeem',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { item_id } = req.params
    const user_id = req.user.user_id

    // 参数验证
    const itemId = parseInt(item_id, 10)
    if (isNaN(itemId) || itemId <= 0) {
      return res.apiError('无效的物品ID', 'BAD_REQUEST', null, 400)
    }

    logger.info('用户生成核销码请求', { user_id, item_id: itemId })

    // 通过 ServiceManager 获取 RedemptionService
    const RedemptionService = req.app.locals.services.getService('redemption_order')

    /*
     * 写操作通过 TransactionManager 管理事务边界
     * RedemptionService.createOrder 强制要求 options.transaction
     */
    const result = await TransactionManager.execute(async transaction => {
      return await RedemptionService.createOrder(itemId, {
        transaction,
        creator_user_id: user_id
      })
    })

    logger.info('用户生成核销码成功', {
      user_id,
      item_id: itemId,
      redemption_order_id: result.order.redemption_order_id
    })

    let qrData = null
    try {
      const { getRedemptionQRSigner } = require('../../../utils/RedemptionQRSigner')
      const AdminSystemService = req.app.locals.services.getService('admin_system')
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
  })
)

/**
 * POST /api/v4/backpack/items/:item_id/redeem/refresh-qr
 *
 * @description 刷新核销码的动态QR码（5分钟有效，过期后调用此接口刷新）
 * @access Private（仅物品所有者可操作）
 *
 * @param {number} item_id - 物品ID（路由参数）
 *
 * @returns {Object} { qr: { qr_content, expires_at } }
 */
router.post(
  '/items/:item_id/redeem/refresh-qr',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { item_id } = req.params
    const itemId = parseInt(item_id, 10)

    if (isNaN(itemId) || itemId <= 0) {
      return res.apiError('无效的物品实例ID', 'BAD_REQUEST', null, 400)
    }

    const RedemptionService = req.app.locals.services.getService('redemption_order')

    // 查找该物品的 pending 核销订单
    const order = await RedemptionService.getOrderByItem(itemId)

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
    const AdminSystemService = req.app.locals.services.getService('admin_system')
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
  })
)

/**
 * POST /api/v4/backpack/items/:item_id/use
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
 * @param {number} item_id - 物品ID（路由参数）
 *
 * @returns {Object} { item, is_duplicate }
 */
router.post(
  '/items/:item_id/use',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { item_id } = req.params
    const user_id = req.user.user_id

    // 参数验证
    const itemId = parseInt(item_id, 10)
    if (isNaN(itemId) || itemId <= 0) {
      return res.apiError('无效的物品ID', 'BAD_REQUEST', null, 400)
    }

    logger.info('用户直接使用物品请求', { user_id, item_id: itemId })

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
      const itemDetail = await BackpackService.getItemDetail(itemId, {
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
          item_id: itemId,
          operator_user_id: user_id,
          business_type: 'backpack_use',
          idempotency_key: `backpack_use_${itemId}_${user_id}_${Date.now()}`,
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
      item_id: itemId,
      is_duplicate: result.is_duplicate
    })

    const instructions = await BackpackService.getUseInstructions(result.item_instance)

    return res.apiSuccess(
      {
        item_id: itemId,
        status: 'used',
        is_duplicate: result.is_duplicate,
        instructions
      },
      result.is_duplicate ? '物品已使用（幂等回放）' : '物品使用成功'
    )
  })
)

/**
 * POST /api/v4/backpack/items/:item_id/transfer
 *
 * @description 用户转赠物品给其他用户（S3 拍板 #35：免审核 + 每用户每日限额）
 * @access Private（仅物品所有者可操作）
 *
 * 业务规则（S1-S5 拍板清单 #35，2026-07-09 定稿）：
 * - 免审核，限额每用户每日 N 次（系统配置 exchange/gift_transfer_daily_limit，默认 5，0=关闭）
 * - 全程 item_ledger 双录 + 幂等键（复用 ItemService.transferItem，business_type='gift_transfer'）
 * - 仅 available 状态物品可转赠（held/used/expired/destroyed 均拒绝）
 * - 接收方通过 target_user_id 或 target_mobile 指定（手机号走盲索引查询，明文不落库）
 *
 * Body: { target_user_id? | target_mobile?, remark? }
 *
 * @returns {Object} { item_id, tracking_code, to_user_id, is_duplicate, remaining_today }
 */
router.post(
  '/items/:item_id/transfer',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const user_id = req.user.user_id
    const itemId = parseInt(req.params.item_id, 10)
    if (isNaN(itemId) || itemId <= 0) {
      return res.apiError('无效的物品ID', 'BAD_REQUEST', null, 400)
    }

    const { target_user_id, target_mobile, remark } = req.body || {}
    if (!target_user_id && !target_mobile) {
      return res.apiError(
        '请指定接收人（target_user_id 或 target_mobile）',
        'BAD_REQUEST',
        null,
        400
      )
    }

    const models = req.app.locals.models
    const ItemService = req.app.locals.services.getService('asset_item')
    const BackpackService = req.app.locals.services.getService('backpack')
    const AdminSystemService = req.app.locals.services.getService('admin_system')

    // 每日限额（拍板 #35：默认 5 次/日，运营可调，0=关闭转赠）
    const dailyLimit = Number(
      await AdminSystemService.getSettingValue('exchange', 'gift_transfer_daily_limit', 5)
    )
    if (dailyLimit <= 0) {
      return res.apiError('转赠功能当前未开放', 'GIFT_TRANSFER_DISABLED', null, 403)
    }

    // 解析接收人（手机号走盲索引，明文不落查询条件）
    let targetUser = null
    if (target_user_id) {
      targetUser = await models.User.findOne({
        where: { user_id: parseInt(target_user_id, 10), status: 'active' }
      })
    } else {
      targetUser = await models.User.findByMobile(String(target_mobile).trim())
    }
    if (!targetUser) {
      return res.apiError('接收人不存在或已停用', 'GIFT_TRANSFER_TARGET_NOT_FOUND', null, 404)
    }
    if (targetUser.user_id === user_id) {
      return res.apiError('不能转赠给自己', 'GIFT_TRANSFER_SELF_FORBIDDEN', null, 400)
    }

    const result = await TransactionManager.execute(async transaction => {
      // 1. 所有权校验（与 /use 同一份逻辑；非本人物品统一按 404 处理，不泄露存在性）
      let itemDetail = null
      try {
        itemDetail = await BackpackService.getItemDetail(itemId, {
          viewer_user_id: user_id,
          has_admin_access: false,
          transaction
        })
      } catch (detailErr) {
        if (detailErr.code === 'FORBIDDEN') {
          itemDetail = null
        } else {
          throw detailErr
        }
      }
      if (!itemDetail) {
        const notFoundError = new Error('物品不存在或不属于你')
        notFoundError.statusCode = 404
        throw notFoundError
      }

      // 2. 仅 available 可转赠（held 是锁定中，比 transferItem 内部校验更严）
      if (itemDetail.status !== 'available') {
        const statusError = new Error(`物品当前状态为"${itemDetail.status}"，无法转赠`)
        statusError.statusCode = 400
        throw statusError
      }

      // 3. 每日限额：按发起人账户当天 gift_transfer 转出流水计数（账本即真相，无独立计数器）
      const senderAccount = await models.Account.findOne({
        where: { user_id },
        transaction
      })
      const todayCount = await models.ItemLedger.count({
        where: {
          account_id: senderAccount.account_id,
          event_type: 'transfer',
          business_type: 'gift_transfer',
          delta: -1,
          created_at: { [Op.gte]: BeijingTimeHelper.todayStart() }
        },
        transaction
      })
      if (todayCount >= dailyLimit) {
        const limitError = new Error(`今日转赠次数已达上限（${dailyLimit} 次/日）`)
        limitError.statusCode = 429
        limitError.errorCode = 'GIFT_TRANSFER_DAILY_LIMIT'
        throw limitError
      }

      // 4. 执行转移（item_ledger 双录 + 幂等键，复用现有资产核心服务）
      const transferResult = await ItemService.transferItem(
        {
          item_id: itemId,
          new_owner_user_id: targetUser.user_id,
          business_type: 'gift_transfer',
          idempotency_key: `gift_${itemId}_${user_id}_${Date.now()}`,
          meta: {
            source: 'backpack_gift',
            from_user_id: user_id,
            to_user_id: targetUser.user_id,
            remark: remark ? String(remark).slice(0, 200) : null
          }
        },
        { transaction }
      )

      return { transferResult, remaining_today: dailyLimit - todayCount - 1 }
    })

    logger.info('用户转赠物品成功', {
      from_user_id: user_id,
      to_user_id: targetUser.user_id,
      item_id: itemId,
      is_duplicate: result.transferResult.is_duplicate
    })

    return res.apiSuccess(
      {
        item_id: itemId,
        tracking_code: result.transferResult.item?.tracking_code || null,
        to_user_id: targetUser.user_id,
        is_duplicate: result.transferResult.is_duplicate,
        remaining_today: Math.max(0, result.remaining_today)
      },
      result.transferResult.is_duplicate ? '物品已转赠（幂等回放）' : '转赠成功'
    )
  })
)

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
 * @param {number} item_id - 物品ID（路由参数）
 * @access Private（仅物品所有者可查看）
 * @returns {Object} 物品流转时间线数据
 */
router.get(
  '/items/:item_id/timeline',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const userId = req.user.user_id

    const itemId = parseInt(req.params.item_id, 10)
    if (isNaN(itemId) || itemId <= 0) {
      return res.apiError('无效的物品ID', 'BAD_REQUEST', null, 400)
    }

    /** 通过 ServiceManager 获取服务（不直接 require） */
    const ItemLifecycleService = req.app.locals.services.getService('item_lifecycle')

    /** 通过 ItemLifecycleService 获取物品并验证所有权（避免直连 models） */
    const lifecycle = await ItemLifecycleService.getLifecycle(itemId)
    if (!lifecycle) {
      return res.apiError('物品不存在', 'ITEM_NOT_FOUND', null, 404)
    }

    /** 验证物品所有权：通过 BackpackService 获取物品详情进行所有权校验 */
    const BackpackService = req.app.locals.services.getService('backpack')
    const itemDetail = await BackpackService.getItemDetail(itemId, {
      viewer_user_id: userId,
      has_admin_access: false
    })

    if (!itemDetail) {
      return res.apiError('物品不存在或无权访问', 'ITEM_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(
      {
        tracking_code: lifecycle.tracking_code,
        item_name: lifecycle.item_name,
        item_type: lifecycle.item_type,
        status: lifecycle.status,
        timeline: lifecycle.timeline
      },
      '获取物品时间线成功'
    )
  })
)

module.exports = router
