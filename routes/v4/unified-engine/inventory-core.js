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
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const { validatePositiveInteger, handleServiceError } = require('../../../middleware/validation')

const logger = require('../../../utils/logger').logger

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
