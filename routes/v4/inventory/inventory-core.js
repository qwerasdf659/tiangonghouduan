/**
 * 餐厅积分抽奖系统 V4.0 - 用户库存核心功能API
 *
 * 业务范围：
 * - 用户背包物品详情查看 → 使用 ItemInstance 模型
 * - 转让历史记录查询 → 使用 TradeRecord 模型
 * - 管理员库存统计 → 使用 ReportingService
 *
 * 架构规范：
 * - 路由层只负责：认证/鉴权、参数校验、调用Service、统一响应
 * - 使用统一错误处理 handleServiceError
 * - 使用统一响应 res.apiSuccess / res.apiError
 *
 * 创建时间：2025-12-11
 * 重构时间：2025-12-21 - 暴力重构移除 InventoryService
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const { validatePositiveInteger, handleServiceError } = require('../../../middleware/validation')

const logger = require('../../../utils/logger').logger
const serviceManager = require('../../../services')
// 注意：遵守"路由不直连 models"原则，所有数据库操作通过 Service 层完成

/**
 * 获取库存物品详情
 * GET /api/v4/inventory/item/:item_id
 *
 * 业务场景：用户查看库存物品的详细信息
 * 权限控制：只能查看自己的物品或管理员可以查看任意物品
 *
 * 重构说明（2025-12-21）：
 * - 原：直接查询 ItemInstance 模型
 * - 新：调用 BackpackService.getItemDetail()，遵守"路由不直连 models"原则
 */
router.get(
  '/item/:item_id',
  authenticateToken,
  validatePositiveInteger('item_id', 'params'),
  async (req, res) => {
    try {
      const itemId = req.validated.item_id
      const userId = req.user.user_id
      const isAdmin = req.user.role_level >= 100

      // 通过 BackpackService 获取物品详情
      const BackpackService = serviceManager.getService('backpack')
      const item = await BackpackService.getItemDetail(itemId, {
        viewer_user_id: userId,
        is_admin: isAdmin
      })

      if (!item) {
        return res.apiError('物品不存在', 'NOT_FOUND', null, 404)
      }

      logger.info('获取库存物品详情成功', {
        item_id: itemId,
        user_id: userId
      })

      return res.apiSuccess({ item }, '获取物品详情成功')
    } catch (error) {
      logger.error('获取物品详情失败', {
        error: error.message,
        item_id: req.validated.item_id,
        user_id: req.user?.user_id
      })

      // 处理权限错误
      if (error.code === 'FORBIDDEN') {
        return res.apiError('无权查看此物品', 'FORBIDDEN', null, 403)
      }

      return handleServiceError(error, res, '获取物品详情失败')
    }
  }
)

/**
 * 获取物品转让历史记录
 * GET /api/v4/inventory/transfer-history
 *
 * 重构说明（2025-12-21 暴力重构）：
 * - 原：直接查询 TradeRecord 模型
 * - 新：调用 BackpackService.getTransferHistory()，遵守"路由不直连 models"原则
 *
 * 权限规则：
 * - 普通用户：只能查看与自己直接相关的转让记录
 * - 管理员：可以查看指定物品的完整转让链条（通过item_id参数）
 */
router.get('/transfer-history', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, type = 'all', item_id } = req.query
    const userId = req.user.user_id
    const isAdmin = req.user.role_level >= 100

    // 参数验证：item_id 如果存在需要转为整数
    const itemIdParam = item_id ? parseInt(item_id, 10) : undefined
    if (item_id && (isNaN(itemIdParam) || itemIdParam <= 0)) {
      return res.apiError('无效的物品ID', 'BAD_REQUEST', null, 400)
    }

    // 通过 BackpackService 获取转让历史
    const BackpackService = serviceManager.getService('backpack')
    const result = await BackpackService.getTransferHistory(userId, {
      type,
      item_instance_id: itemIdParam,
      is_admin: isAdmin,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10)
    })

    logger.info('获取转让历史成功', {
      user_id: userId,
      total: result.pagination.total,
      type,
      page: parseInt(page, 10),
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
 * 业务场景：管理员查看系统库存运营数据
 *
 * 重构说明（2025-12-21 暴力重构）：
 * - 原：直接查询 ItemInstance 表
 * - 新：调用 ReportingService.getInventoryAdminStatistics()，遵守"路由不直连 models"原则
 */
router.get('/admin/statistics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 通过 ReportingService 获取库存统计
    const ReportingService = serviceManager.getService('reporting')
    const statistics = await ReportingService.getInventoryAdminStatistics()

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

    return handleServiceError(error, res, '获取库存统计失败')
  }
})

module.exports = router
