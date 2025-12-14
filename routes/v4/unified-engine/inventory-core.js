/**
 * 餐厅积分抽奖系统 V4.0 - 用户库存核心功能API
 *
 * 业务范围：
 * - 用户库存列表查询
 * - 库存物品详情查看
 * - 库存物品使用（核销）
 * - 库存物品转让
 * - 核销码生成与验证
 * - 转让历史记录查询
 * - 管理员库存统计
 *
 * 架构规范：
 * - 路由层只负责：认证/鉴权、参数校验、调用Service、统一响应
 * - 业务逻辑全部在 InventoryService 中处理
 * - 使用统一错误处理 handleServiceError
 * - 使用统一响应 res.apiSuccess / res.apiError
 *
 * 创建时间：2025-12-11
 * P2-A 任务：inventory.js 胖路由瘦身与拆分
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin, getUserRoles } = require('../../../middleware/auth')
const Logger = require('../../../services/UnifiedLotteryEngine/utils/Logger')
const { validatePositiveInteger, handleServiceError } = require('../../../middleware/validation')

const logger = new Logger('InventoryCoreAPI')

/**
 * 获取用户库存列表
 * GET /api/v4/inventory/user/:user_id
 *
 * 业务场景：用户查看自己或管理员查看指定用户的库存物品列表
 * 权限控制：用户只能查看自己的库存，管理员可以查看任意用户的库存
 */
router.get(
  '/user/:user_id',
  authenticateToken,
  validatePositiveInteger('user_id', 'params'),
  async (req, res) => {
    try {
      logger.info('开始处理库存列表请求', {
        user_id: req.validated.user_id,
        req_user_id: req.user?.user_id
      })

      const { status, type, page = 1, limit = 20 } = req.query
      const requestedUserId = req.validated.user_id

      // 调用 InventoryService 获取用户库存
      const InventoryService = req.app.locals.services.getService('inventory')
      const result = await InventoryService.getUserInventory(
        requestedUserId,
        { status, type, page, limit },
        { viewerId: req.user.user_id }
      )

      logger.info('获取用户库存成功', {
        user_id: requestedUserId,
        total: result.pagination.total,
        returned: result.inventory.length
      })

      return res.apiSuccess(result, '获取库存列表成功')
    } catch (error) {
      logger.error('获取用户库存失败', {
        error: error.message,
        user_id: req.validated.user_id,
        query: req.query
      })

      return handleServiceError(error, res, '获取库存列表失败')
    }
  }
)

/**
 * 获取库存物品详情
 * GET /api/v4/inventory/item/:item_id
 *
 * 业务场景：用户查看库存物品的详细信息
 * 权限控制：只能查看自己的物品或管理员可以查看任意物品
 */
router.get(
  '/item/:item_id',
  authenticateToken,
  validatePositiveInteger('item_id', 'params'),
  async (req, res) => {
    try {
      const itemId = req.validated.item_id

      // 调用 InventoryService 获取物品详情
      const InventoryService = req.app.locals.services.getService('inventory')
      const sanitizedItem = await InventoryService.getItemDetail(req.user.user_id, itemId)

      logger.info('获取库存物品详情成功', {
        item_id: itemId,
        user_id: req.user.user_id
      })

      return res.apiSuccess({ item: sanitizedItem }, '获取物品详情成功')
    } catch (error) {
      logger.error('获取物品详情失败', {
        error: error.message,
        item_id: req.validated.item_id,
        user_id: req.user?.user_id
      })

      return handleServiceError(error, res, '获取物品详情失败')
    }
  }
)

/**
 * 使用库存物品（Use Inventory Item - 库存物品使用API）
 * POST /api/v4/inventory/use/:item_id
 *
 * 业务场景：用户使用库存中的可用物品（如优惠券、实物商品等）
 * 幂等性控制：通过 business_id 防止重复使用
 */
router.post(
  '/use/:item_id',
  authenticateToken,
  validatePositiveInteger('item_id', 'params'),
  async (req, res) => {
    try {
      const itemId = req.validated.item_id
      const { verification_code } = req.body
      const userId = req.user.user_id

      // 生成 business_id 用于幂等性控制
      const business_id = `use_${userId}_${itemId}_${Date.now()}`

      // 调用 InventoryService 使用物品
      const InventoryService = req.app.locals.services.getService('inventory')
      const result = await InventoryService.useItem(userId, itemId, {
        verification_code,
        business_id
      })

      logger.info('库存物品使用成功', {
        item_id: itemId,
        user_id: req.user.user_id,
        item_name: result.item_name
      })

      return res.apiSuccess({ item: result }, '物品使用成功')
    } catch (error) {
      logger.error('使用库存物品失败', {
        error: error.message,
        item_id: req.validated.item_id,
        user_id: req.user?.user_id
      })

      return handleServiceError(error, res, '物品使用失败')
    }
  }
)

/**
 * 转让库存物品（Transfer Inventory Item）
 * POST /api/v4/inventory/transfer
 *
 * 业务场景：用户将库存物品转让给其他用户（礼物赠送、朋友共享等）
 * 幂等性控制：通过 business_id 防止重复转让
 */
router.post('/transfer', authenticateToken, async (req, res) => {
  try {
    const { item_id, target_user_id, transfer_note } = req.body
    const currentUserId = req.user.user_id

    // 参数验证
    if (!item_id || !target_user_id) {
      return res.apiError('物品ID和目标用户ID不能为空', 'BAD_REQUEST', null, 400)
    }

    const itemId = parseInt(item_id, 10)
    const targetUserId = parseInt(target_user_id, 10)

    if (isNaN(itemId) || itemId <= 0 || isNaN(targetUserId) || targetUserId <= 0) {
      return res.apiError('物品ID和目标用户ID必须是正整数', 'BAD_REQUEST', null, 400)
    }

    if (currentUserId === targetUserId) {
      return res.apiError('不能转让给自己', 'BAD_REQUEST', null, 400)
    }

    // 生成 business_id 用于幂等性控制
    const business_id = `transfer_${currentUserId}_${itemId}_${Date.now()}`

    // 调用 InventoryService 转让物品
    const InventoryService = req.app.locals.services.getService('inventory')
    const result = await InventoryService.transferItem(currentUserId, targetUserId, itemId, {
      transfer_note,
      business_id
    })

    logger.info('库存物品转让成功', {
      item_id: itemId,
      from_user_id: currentUserId,
      to_user_id: targetUserId,
      item_name: result.name,
      transfer_count: result.transfer_count
    })

    return res.apiSuccess(result, '物品转让成功')
  } catch (error) {
    logger.error('转让库存物品失败', {
      error: error.message,
      item_id: req.body.item_id,
      current_user: req.user.user_id,
      target_user: req.body.target_user_id
    })

    return handleServiceError(error, res, '物品转让失败')
  }
})

/**
 * 生成核销码API（Generate Verification Code）
 * POST /api/v4/inventory/generate-code/:item_id
 *
 * 业务场景：用户兑换商品后，为库存物品生成24小时有效的核销码，用于商家线下核销验证
 * 核心功能：
 * 1. 身份认证：JWT Token验证
 * 2. 权限验证：user_id匹配检查
 * 3. 状态验证：只有available状态的物品可以生成核销码
 * 4. 核销码生成：使用crypto.randomBytes()生成8位大写十六进制字符
 * 5. 过期时间设置：自动设置24小时后过期（北京时间）
 */
router.post(
  '/generate-code/:item_id',
  authenticateToken,
  validatePositiveInteger('item_id', 'params'),
  async (req, res) => {
    try {
      const itemId = req.validated.item_id
      const userId = req.user.user_id

      // 调用 InventoryService 生成核销码
      const InventoryService = req.app.locals.services.getService('inventory')
      const result = await InventoryService.generateVerificationCode(userId, itemId)

      logger.info('生成核销码成功', {
        item_id: itemId,
        user_id: userId,
        verification_code: result.verification_code,
        expires_at: result.expires_at
      })

      return res.apiSuccess(
        {
          verification_code: result.verification_code,
          expires_at: result.expires_at
        },
        '核销码生成成功'
      )
    } catch (error) {
      logger.error('生成核销码失败', {
        error: error.message,
        item_id: req.validated.item_id,
        user_id: req.user?.user_id
      })

      return handleServiceError(error, res, '生成核销码失败')
    }
  }
)

/**
 * 核销验证码（Verification Code Validation）
 * POST /api/v4/inventory/verification/verify
 *
 * 业务场景：商家核销用户的核销码，验证并使用库存物品
 * 权限要求：只允许商户（role_level >= 50）或管理员核销
 */
router.post('/verification/verify', authenticateToken, async (req, res) => {
  try {
    const { verification_code } = req.body
    const merchantId = req.user.user_id

    // 格式验证
    const InventoryService = req.app.locals.services.getService('inventory')
    const formatValidation = InventoryService.validateVerificationCodeFormat(verification_code)
    if (!formatValidation.valid) {
      return res.apiError(formatValidation.error, 'BAD_REQUEST', null, 400)
    }

    // 权限验证（只允许商户或管理员核销）
    const userRoles = await getUserRoles(merchantId)
    if (userRoles.role_level < 50) {
      return res.apiError('权限不足，只有商户或管理员可以核销', 'FORBIDDEN', null, 403)
    }

    // 调用 InventoryService 执行核销
    const result = await InventoryService.verifyCode(
      merchantId,
      verification_code.trim().toUpperCase()
    )

    // 异步发送通知（不阻塞响应）
    const NotificationService = req.app.locals.services.getService('notification')
    NotificationService.send(result.user_id, {
      type: 'verification_success',
      title: '核销通知',
      content: `您的${result.item_name}已被核销成功`,
      data: {
        inventory_id: result.item_id,
        name: result.item_name,
        used_at: result.used_at
      }
    }).catch(error => {
      logger.warn('核销通知发送失败（不影响核销结果）', {
        error: error.message,
        user_id: result.user_id
      })
    })

    logger.info('核销验证成功', {
      inventory_id: result.item_id,
      operator_id: merchantId
    })

    return res.apiSuccess(
      {
        inventory_id: result.item_id,
        name: result.item_name,
        user_id: result.user_id,
        status: result.status,
        used_at: result.used_at,
        operator: {
          user_id: merchantId,
          nickname: req.user.nickname || userRoles.roleName || '商户'
        }
      },
      '核销成功'
    )
  } catch (error) {
    logger.error('核销验证失败', {
      error: error.message,
      operator_id: req.user.user_id
    })

    return handleServiceError(error, res, '核销验证失败')
  }
})

/**
 * 获取物品转让历史记录
 * GET /api/v4/inventory/transfer-history
 *
 * 权限规则：
 * - 普通用户（role_level < 100）：只能查看与自己直接相关的一手转让记录
 * - 管理员（role_level >= 100）：可以查看指定物品的完整转让链条（通过item_id参数）
 */
router.get('/transfer-history', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, type = 'all', item_id } = req.query
    const userId = req.user.user_id

    // 参数验证：item_id 如果存在需要转为整数
    const itemIdParam = item_id ? parseInt(item_id, 10) : undefined
    if (item_id && (isNaN(itemIdParam) || itemIdParam <= 0)) {
      return res.apiError('无效的物品ID', 'BAD_REQUEST', null, 400)
    }

    // 调用 InventoryService 获取转让历史
    const InventoryService = req.app.locals.services.getService('inventory')
    const result = await InventoryService.getTransferHistory(
      userId,
      { direction: type, item_id: itemIdParam, page, limit },
      { viewerId: userId }
    )

    logger.info('获取转让历史成功', {
      user_id: userId,
      total: result.pagination.total,
      type,
      page: parseInt(page),
      query_item_id: itemIdParam || null,
      view_mode: result.filter.view_mode
    })

    return res.apiSuccess(
      {
        transfer_history: result.records,
        pagination: result.pagination,
        filter: result.filter
      },
      result.filter.view_mode === 'complete_chain' ? '物品完整转让链条获取成功' : '转让历史获取成功'
    )
  } catch (error) {
    logger.error('获取转让历史失败', {
      error: error.message,
      user_id: req.user.user_id
    })

    return handleServiceError(error, res, '获取转让历史失败')
  }
})

/**
 * 获取管理员库存统计
 * GET /api/v4/inventory/admin/statistics
 *
 * 业务场景：管理员查看系统库存运营数据，支持运营决策和数据分析
 * 统计维度：状态统计、类型分布、最近动态、多维度使用率
 */
router.get('/admin/statistics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 调用 InventoryService 获取统计数据
    const InventoryService = req.app.locals.services.getService('inventory')
    const statistics = await InventoryService.getAdminStatistics()

    logger.info('管理员获取库存统计成功', {
      admin_id: req.user.user_id,
      total_items: statistics.total_items,
      available_items: statistics.available_items
    })

    return res.apiSuccess({ statistics }, '获取库存统计成功')
  } catch (error) {
    logger.error('获取库存统计失败', {
      error: error.message,
      admin_id: req.user?.user_id
    })

    // 根据错误类型返回不同错误码
    if (error.name === 'SequelizeConnectionError') {
      return res.apiError('数据库连接失败，请稍后重试', 'DATABASE_CONNECTION_ERROR', null, 503)
    } else if (error.name === 'SequelizeTimeoutError') {
      return res.apiError('查询超时，请稍后重试', 'QUERY_TIMEOUT', null, 504)
    } else if (error.name === 'SequelizeDatabaseError') {
      return res.apiError('数据库查询异常', 'DATABASE_QUERY_ERROR', null, 500)
    } else {
      return res.apiError('获取库存统计失败', 'STATISTICS_ERROR', { error_type: error.name }, 500)
    }
  }
})

module.exports = router
