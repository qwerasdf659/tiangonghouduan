/**
 * 餐厅积分抽奖系统 V4.0 - 市场管理API
 *
 * @description 管理员查看市场统计信息和管理兑换商品
 * @version 3.0.0（P2-C架构重构版）
 * @created 2025-12-05
 * @updated 2025-12-11（P2-C重构：AdminMarketplaceService合并到ExchangeService）
 *
 * 核心功能：
 * - 查询所有用户的上架统计
 * - 识别接近上限和达到上限的用户
 * - 管理兑换商品（创建、更新、删除）
 * - 分页查询和筛选
 *
 * 架构原则：
 * - 路由层不直连 models（所有数据库操作通过 Service 层）
 * - 路由层不开启事务（事务管理在 Service 层）
 * - 通过 ServiceManager 统一获取服务实例
 * - 使用 ExchangeService 统一管理兑换市场业务
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')

const logger = require('../../../utils/logger').logger

/**
 * 管理员查询所有用户上架状态
 * GET /api/v4/admin/marketplace/listing-stats
 *
 * @description 查询所有用户的上架状态统计，支持筛选和分页
 *
 * 🎯 核心功能：
 * 1. 按用户分组统计在售商品数量
 * 2. 支持筛选（全部/接近上限/达到上限）
 * 3. 分页查询
 * 4. 返回用户详情和统计信息
 *
 * @query {number} page - 页码（默认1）
 * @query {number} limit - 每页数量（默认20）
 * @query {string} filter - 筛选条件：all/near_limit/at_limit（默认all）
 *
 * @returns {Object} 统计数据
 * @returns {Array} data.stats - 用户上架统计列表
 * @returns {Object} data.pagination - 分页信息
 * @returns {Object} data.summary - 总体统计摘要
 */
router.get('/listing-stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, filter = 'all' } = req.query

    /**
     * 从数据库读取最大上架数量配置（2025-12-30 配置管理三层分离方案）
     *
     * 读取优先级：
     * 1. DB system_settings.max_active_listings（全局配置）
     * 2. 代码默认值 10（兜底降级）
     *
     * @see docs/配置管理三层分离与校验统一方案.md
     */
    const AdminSystemService = req.app.locals.services.getService('adminSystem')
    const maxListings = await AdminSystemService.getSettingValue(
      'marketplace',
      'max_active_listings',
      10
    )

    logger.info('管理员查询用户上架状态', {
      admin_id: req.user.user_id,
      page,
      limit,
      filter
    })

    // 🎯 P2-C架构重构：通过 ServiceManager 获取 ExchangeService
    const ExchangeService = req.app.locals.services.getService('exchangeMarket')

    // 🎯 调用服务层方法获取用户上架统计
    const result = await ExchangeService.getUserListingStats({
      page,
      limit,
      filter,
      max_listings: maxListings
    })

    logger.info('查询用户上架状态成功', {
      admin_id: req.user.user_id,
      total_users: result.summary.total_users_with_listings,
      filtered_count: result.pagination.total,
      page: parseInt(page)
    })

    return res.apiSuccess(result)
  } catch (error) {
    logger.error('查询用户上架状态失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id
    })

    return res.apiError(error.message || '查询失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 创建兑换商品（管理员操作）
 * POST /api/v4/admin/marketplace/exchange_market/items
 *
 * V4.5.0 材料资产支付版本
 *
 * @body {string} item_name - 商品名称（必填，最长100字符）
 * @body {string} item_description - 商品描述（可选，最长500字符）
 * @body {string} cost_asset_code - 材料资产代码（必填，如 'red_shard'）
 * @body {number} cost_amount - 材料资产数量（必填，>0）
 * @body {number} cost_price - 成本价（必填）
 * @body {number} stock - 初始库存（必填，>=0）
 * @body {number} sort_order - 排序号（必填，默认100）
 * @body {string} status - 商品状态（必填：active/inactive）
 */
router.post('/exchange_market/items', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      item_name,
      item_description = '',
      cost_asset_code,
      cost_amount,
      cost_price,
      stock,
      sort_order = 100,
      status = 'active'
    } = req.body

    const admin_id = req.user.user_id

    logger.info('管理员创建兑换商品（材料资产支付）', {
      admin_id,
      item_name,
      cost_asset_code,
      cost_amount,
      stock
    })

    // 🎯 P2-C架构重构：通过 ServiceManager 获取 ExchangeService
    const ExchangeService = req.app.locals.services.getService('exchangeMarket')

    // 🎯 调用服务层方法创建商品（V4.5.0 材料资产支付）
    const result = await ExchangeService.createExchangeItem(
      {
        item_name,
        item_description,
        cost_asset_code,
        cost_amount,
        cost_price,
        stock,
        sort_order,
        status
      },
      admin_id
    )

    logger.info('兑换商品创建成功（材料资产支付）', {
      admin_id,
      item_id: result.item.id,
      item_name: result.item.item_name,
      cost_asset_code: result.item.cost_asset_code,
      cost_amount: result.item.cost_amount
    })

    return res.apiSuccess(result, '商品创建成功')
  } catch (error) {
    logger.error('创建兑换商品失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id
    })

    // 业务错误直接返回错误消息
    if (
      error.message.includes('不能为空') ||
      error.message.includes('最长') ||
      error.message.includes('无效') ||
      error.message.includes('必须')
    ) {
      return res.apiError(error.message, 'BAD_REQUEST', null, 400)
    }

    return res.apiError(error.message || '创建商品失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 更新兑换商品（管理员操作）
 * PUT /api/v4/admin/marketplace/exchange_market/items/:item_id
 *
 * V4.5.0 材料资产支付版本
 *
 * @param {number} item_id - 商品ID
 */
router.put('/exchange_market/items/:item_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { item_id } = req.params
    const {
      item_name,
      item_description,
      cost_asset_code,
      cost_amount,
      cost_price,
      stock,
      sort_order,
      status
    } = req.body

    const admin_id = req.user.user_id

    logger.info('管理员更新兑换商品（材料资产支付）', {
      admin_id,
      item_id,
      cost_asset_code,
      cost_amount
    })

    // 参数验证
    const itemId = parseInt(item_id)
    if (isNaN(itemId) || itemId <= 0) {
      return res.apiError('无效的商品ID', 'BAD_REQUEST', null, 400)
    }

    // 🎯 P2-C架构重构：通过 ServiceManager 获取 ExchangeService
    const ExchangeService = req.app.locals.services.getService('exchangeMarket')

    // 🎯 调用服务层方法更新商品（V4.5.0 材料资产支付）
    const result = await ExchangeService.updateExchangeItem(itemId, {
      item_name,
      item_description,
      cost_asset_code,
      cost_amount,
      cost_price,
      stock,
      sort_order,
      status
    })

    logger.info('兑换商品更新成功（材料资产支付）', {
      admin_id,
      item_id: itemId,
      item_name: result.item.item_name,
      cost_asset_code: result.item.cost_asset_code,
      cost_amount: result.item.cost_amount
    })

    return res.apiSuccess(result, '商品更新成功')
  } catch (error) {
    logger.error('更新兑换商品失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id,
      item_id: req.params.item_id
    })

    // 业务错误处理
    if (error.message === '商品不存在') {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }

    if (
      error.message.includes('不能为空') ||
      error.message.includes('最长') ||
      error.message.includes('无效') ||
      error.message.includes('必须')
    ) {
      return res.apiError(error.message, 'BAD_REQUEST', null, 400)
    }

    return res.apiError(error.message || '更新商品失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 删除兑换商品（管理员操作）
 * DELETE /api/v4/admin/marketplace/exchange_market/items/:item_id
 *
 * @param {number} item_id - 商品ID
 */
router.delete(
  '/exchange_market/items/:item_id',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { item_id } = req.params
      const admin_id = req.user.user_id

      logger.info('管理员删除兑换商品', {
        admin_id,
        item_id
      })

      // 参数验证
      const itemId = parseInt(item_id)
      if (isNaN(itemId) || itemId <= 0) {
        return res.apiError('无效的商品ID', 'BAD_REQUEST', null, 400)
      }

      // 🎯 P2-C架构重构：通过 ServiceManager 获取 ExchangeService
      const ExchangeService = req.app.locals.services.getService('exchangeMarket')

      // 🎯 调用服务层方法删除商品
      const result = await ExchangeService.deleteExchangeItem(itemId)

      logger.info('兑换商品删除操作完成', {
        admin_id,
        item_id: itemId,
        action: result.action,
        message: result.message
      })

      // 根据操作结果返回不同响应
      if (result.action === 'deactivated') {
        return res.apiSuccess(
          {
            item: result.item || null
          },
          result.message
        )
      }

      return res.apiSuccess({}, result.message)
    } catch (error) {
      logger.error('删除兑换商品失败', {
        error: error.message,
        stack: error.stack,
        admin_id: req.user?.user_id,
        item_id: req.params.item_id
      })

      // 业务错误处理
      if (error.message === '商品不存在') {
        return res.apiError(error.message, 'NOT_FOUND', null, 404)
      }

      return res.apiError(error.message || '删除商品失败', 'INTERNAL_ERROR', null, 500)
    }
  }
)

module.exports = router
