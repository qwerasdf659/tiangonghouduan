/**
 * ⚠️ 该文件已废弃（DEPRECATED）- P0-1架构重构 2025-12-12
 *
 * 废弃原因：
 * - 该路由调用不存在的 exchangeOperation 服务，导致调用时抛出 500 错误
 * - 功能已完整迁移到 /api/v4/exchange_market/* 新接口
 * - 新接口使用已注册的 ExchangeMarketService，避免服务不存在问题
 *
 * 迁移路径（Migration Path）：
 * - 旧接口：GET  /api/v4/inventory/products  → 新接口：GET  /api/v4/exchange_market/items
 * - 旧接口：POST /api/v4/inventory/exchange  → 新接口：POST /api/v4/exchange_market/exchange
 *
 * 处理方式：
 * - 该文件已在 routes/v4/unified-engine/inventory.js 中取消挂载
 * - 访问旧接口将返回 404 Not Found（路由不存在）
 * - 保留该文件仅供参考和历史记录
 *
 * 验收标准（P0-1）：
 * - ✅ /api/v4/inventory/exchange 返回 404，不再出现 500 错误
 * - ✅ 新兑换链路 /api/v4/exchange_market/* 不受影响
 *
 * ---
 *
 * 餐厅积分抽奖系统 V4.0 - 商品兑换功能API（已废弃）
 *
 * 业务范围：
 * - 兑换商品列表查询
 * - 执行商品兑换
 * - 兑换记录查询
 * - 取消兑换记录
 * - 软删除兑换记录
 * - 恢复已删除的兑换记录（管理员）
 *
 * 架构规范：
 * - 路由层只负责：认证/鉴权、参数校验、调用Service、统一响应
 * - 业务逻辑全部在 InventoryService 和 ExchangeOperationService 中处理
 * - 使用统一错误处理 handleServiceError
 * - 使用统一响应 res.apiSuccess / res.apiError
 *
 * 创建时间：2025-12-11
 * 废弃时间：2025-12-12
 * P2-A 任务：inventory.js 胖路由瘦身与拆分
 * P0-1 任务：旧兑换入口残留强制下线
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin, getUserRoles } = require('../../../middleware/auth')
const DataSanitizer = require('../../../services/DataSanitizer')
const Logger = require('../../../services/UnifiedLotteryEngine/utils/Logger')
const {
  validatePositiveInteger,
  validateEnumValue,
  validatePaginationParams,
  handleServiceError
} = require('../../../middleware/validation')

const logger = new Logger('InventoryExchangeAPI')

/**
 * 获取商品列表（可兑换商品）
 * GET /api/v4/inventory/products
 *
 * 业务场景：用户查看可兑换的商品列表
 */
router.get('/products', authenticateToken, async (req, res) => {
  try {
    const { space = 'lucky', category, page = 1, limit = 20 } = req.query

    // 调用 InventoryService 获取商品列表
    const InventoryService = req.app.locals.services.getService('inventory')
    const result = await InventoryService.getProducts(
      { space, category, page, limit },
      { viewerId: req.user.user_id }
    )

    logger.info('获取商品列表成功', {
      user_id: req.user.user_id,
      space,
      category,
      total: result.pagination.total,
      returned: result.products.length
    })

    return res.apiSuccess(result, '获取商品列表成功')
  } catch (error) {
    logger.error('获取商品列表失败', {
      error: error.message,
      query: req.query,
      user_id: req.user?.user_id
    })
    return handleServiceError(error, res, '获取商品列表失败')
  }
})

/**
 * 兑换商品
 * POST /api/v4/inventory/exchange
 *
 * 业务场景：用户使用积分兑换商品
 * 架构设计：通过 ExchangeOperationService 协调积分扣除、库存创建等跨领域操作
 */
router.post('/exchange', authenticateToken, async (req, res) => {
  try {
    const { product_id, quantity = 1, space = 'lucky' } = req.body
    const user_id = req.user.user_id

    // 通过 ServiceManager 获取 ExchangeOperationService
    const ExchangeOperationService = req.app.locals.services.getService('exchangeOperation')

    // 参数验证
    if (product_id === undefined || product_id === null) {
      return res.apiError('商品ID不能为空', 'INVALID_PARAMETER', null, 400)
    }

    if (quantity <= 0 || quantity > 10) {
      return res.apiError('兑换数量必须在1-10之间', 'INVALID_QUANTITY', null, 400)
    }

    // 验证空间参数
    if (!['lucky', 'premium'].includes(space)) {
      return res.apiError('空间参数错误，必须是lucky或premium', 'INVALID_SPACE', null, 400)
    }

    // 执行兑换（调用 ExchangeOperationService 协调多领域服务）
    const result = await ExchangeOperationService.createExchange(
      user_id,
      product_id,
      quantity,
      space
    )

    logger.info('商品兑换成功', {
      user_id,
      product_id,
      space,
      quantity,
      exchange_id: result.exchange_id,
      total_points: result.total_points
    })

    return res.apiSuccess(result, '商品兑换成功')
  } catch (error) {
    logger.error('商品兑换失败', {
      error: error.message,
      user_id: req.user.user_id,
      product_id: req.body.product_id
    })
    return res.apiError(error.message, 'EXCHANGE_FAILED', null, 500)
  }
})

module.exports = router
