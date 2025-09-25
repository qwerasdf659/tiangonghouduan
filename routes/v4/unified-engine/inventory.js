/**
 * 餐厅积分抽奖系统 V4.0 - 用户库存管理API
 * 处理用户库存的增删改查，包含icon字段支持
 *
 * 功能说明：
 * - 获取用户库存列表（支持icon字段显示）
 * - 查看库存物品详情
 * - 使用库存物品
 * - 转让库存物品
 * - 管理员库存管理
 *
 * 创建时间：2025年01月21日
 * 使用 Claude Sonnet 4 模型
 */

const express = require('express')
const router = express.Router()
const models = require('../../../models')
const ApiResponse = require('../../../utils/ApiResponse')
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const Logger = require('../../../services/UnifiedLotteryEngine/utils/Logger')

const logger = new Logger('InventoryAPI')

/**
 * 获取用户库存列表
 * GET /api/v4/inventory/user/:user_id
 */
router.get('/user/:user_id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.params
    const { status, type, page = 1, limit = 20 } = req.query

    // 构建查询条件
    const whereConditions = { user_id }

    if (status) {
      whereConditions.status = status
    }

    if (type) {
      whereConditions.type = type
    }

    // 分页参数
    const offset = (page - 1) * limit

    // 查询用户库存
    const { count, rows: inventory } = await models.UserInventory.findAndCountAll({
      where: whereConditions,
      attributes: [
        'id',
        'name',
        'description',
        'icon', // 🎯 包含新添加的icon字段
        'type',
        'value',
        'status',
        'source_type',
        'source_id',
        'acquired_at',
        'expires_at',
        'used_at',
        'verification_code',
        'verification_expires_at',
        'transfer_to_user_id',
        'transfer_at',
        'created_at',
        'updated_at'
      ],
      order: [['acquired_at', 'DESC']],
      limit: parseInt(limit),
      offset
    })

    // 处理数据，确保icon字段正确显示
    const processedInventory = inventory.map(item => {
      const itemData = item.toJSON()

      // 如果没有设置icon，根据type设置默认icon
      if (!itemData.icon) {
        switch (itemData.type) {
        case 'voucher':
          itemData.icon = '🎫'
          break
        case 'product':
          itemData.icon = '🎁'
          break
        case 'service':
          itemData.icon = '🔧'
          break
        default:
          itemData.icon = '📦'
        }
      }

      // 添加状态描述
      itemData.status_description = getStatusDescription(itemData.status)

      // 添加过期状态
      if (itemData.expires_at) {
        itemData.is_expired = new Date() > new Date(itemData.expires_at)
      }

      return itemData
    })

    logger.info('获取用户库存成功', {
      user_id,
      total: count,
      returned: inventory.length,
      filters: { status, type }
    })

    return ApiResponse.success(res, {
      inventory: processedInventory,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(count / limit)
      }
    }, '获取库存列表成功')
  } catch (error) {
    logger.error('获取用户库存失败', { error: error.message, user_id: req.params.user_id })
    return ApiResponse.error(res, '获取库存列表失败', 500)
  }
})

/**
 * 获取库存物品详情
 * GET /api/v4/inventory/item/:item_id
 */
router.get('/item/:item_id', authenticateToken, async (req, res) => {
  try {
    const { item_id } = req.params

    const item = await models.UserInventory.findOne({
      where: { id: item_id },
      include: [
        {
          model: models.User,
          as: 'user',
          attributes: ['user_id', 'mobile', 'nickname']
        }
      ]
    })

    if (!item) {
      return ApiResponse.error(res, '库存物品不存在', 404)
    }

    const itemData = item.toJSON()

    // 确保icon字段存在
    if (!itemData.icon) {
      switch (itemData.type) {
      case 'voucher':
        itemData.icon = '🎫'
        break
      case 'product':
        itemData.icon = '🎁'
        break
      case 'service':
        itemData.icon = '🔧'
        break
      default:
        itemData.icon = '📦'
      }
    }

    logger.info('获取库存物品详情成功', { item_id, user_id: item.user_id })

    return ApiResponse.success(res, { item: itemData }, '获取物品详情成功')
  } catch (error) {
    logger.error('获取库存物品详情失败', { error: error.message, item_id: req.params.item_id })
    return ApiResponse.error(res, '获取物品详情失败', 500)
  }
})

/**
 * 使用库存物品
 * POST /api/v4/inventory/use/:item_id
 */
router.post('/use/:item_id', authenticateToken, async (req, res) => {
  try {
    const { item_id } = req.params
    const { verification_code } = req.body

    const item = await models.UserInventory.findOne({
      where: { id: item_id }
    })

    if (!item) {
      return ApiResponse.error(res, '库存物品不存在', 404)
    }

    // 检查物品状态
    if (item.status !== 'available') {
      return ApiResponse.error(res, '物品不可使用', 400)
    }

    // 检查是否过期
    if (item.expires_at && new Date() > new Date(item.expires_at)) {
      await item.update({ status: 'expired' })
      return ApiResponse.error(res, '物品已过期', 400)
    }

    // 如果需要验证码，检查验证码
    if (item.verification_code && item.verification_code !== verification_code) {
      return ApiResponse.error(res, '验证码错误', 400)
    }

    // 使用物品
    await item.update({
      status: 'used',
      used_at: new Date()
    })

    logger.info('库存物品使用成功', {
      item_id,
      user_id: item.user_id,
      item_name: item.name
    })

    return ApiResponse.success(res, { item }, '物品使用成功')
  } catch (error) {
    logger.error('使用库存物品失败', { error: error.message, item_id: req.params.item_id })
    return ApiResponse.error(res, '物品使用失败', 500)
  }
})

/**
 * 管理员获取所有用户库存统计
 * GET /api/v4/inventory/admin/statistics
 */
router.get('/admin/statistics', requireAdmin, async (req, res) => {
  try {
    // 获取库存统计数据
    const [
      totalItems,
      availableItems,
      usedItems,
      expiredItems,
      typeStats,
      recentItems
    ] = await Promise.all([
      models.UserInventory.count(),
      models.UserInventory.count({ where: { status: 'available' } }),
      models.UserInventory.count({ where: { status: 'used' } }),
      models.UserInventory.count({ where: { status: 'expired' } }),
      models.UserInventory.findAll({
        attributes: [
          'type',
          'icon',
          [models.sequelize.fn('COUNT', '*'), 'count']
        ],
        group: ['type', 'icon']
      }),
      models.UserInventory.findAll({
        attributes: ['id', 'name', 'type', 'icon', 'status', 'created_at'],
        order: [['created_at', 'DESC']],
        limit: 10
      })
    ])

    const statistics = {
      total_items: totalItems,
      available_items: availableItems,
      used_items: usedItems,
      expired_items: expiredItems,
      usage_rate: totalItems > 0 ? ((usedItems / totalItems) * 100).toFixed(2) : 0,
      type_distribution: typeStats.map(stat => ({
        type: stat.type,
        icon: stat.icon || getDefaultIcon(stat.type),
        count: parseInt(stat.dataValues.count)
      })),
      recent_items: recentItems.map(item => ({
        ...item.toJSON(),
        icon: item.icon || getDefaultIcon(item.type)
      }))
    }

    logger.info('管理员获取库存统计成功', { admin_id: req.user.user_id })

    return ApiResponse.success(res, { statistics }, '获取库存统计成功')
  } catch (error) {
    logger.error('获取库存统计失败', { error: error.message })
    return ApiResponse.error(res, '获取库存统计失败', 500)
  }
})

/**
 * 辅助函数：获取状态描述
 */
function getStatusDescription (status) {
  const statusMap = {
    available: '可用',
    pending: '待处理',
    used: '已使用',
    expired: '已过期',
    transferred: '已转让'
  }
  return statusMap[status] || status
}

/**
 * 辅助函数：获取默认图标
 */
function getDefaultIcon (type) {
  const iconMap = {
    voucher: '🎫',
    product: '🎁',
    service: '🔧'
  }
  return iconMap[type] || '📦'
}

module.exports = router
