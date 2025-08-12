/**
 * 餐厅积分抽奖系统 v2.0 - 库存管理路由
 * 实现用户库存物品的管理和操作API
 * 创建时间：2025年01月28日
 */

const express = require('express')
const InventoryService = require('../../services/InventoryService')
const { authenticateToken } = require('../../middleware/auth')
const ApiResponse = require('../../utils/ApiResponse')
const router = express.Router()

// 初始化库存管理服务
const inventoryService = new InventoryService()

/**
 * @route GET /api/v2/inventory
 * @desc 获取库存管理API信息
 * @access 公开
 */
router.get('/', (req, res) => {
  res.json(
    ApiResponse.success({
      module: 'inventory',
      description: '用户库存管理API',
      version: '2.0.0',
      endpoints: {
        'GET /list': '获取用户库存列表（需要认证）',
        'POST /use': '使用库存物品（需要认证）',
        'POST /transfer': '转让库存物品（需要认证）',
        'POST /generate-code': '生成核销码（需要认证）'
      },
      itemTypes: ['voucher', 'product', 'service'],
      itemStatuses: ['available', 'pending', 'used', 'expired', 'transferred'],
      supportedActions: ['use', 'transfer', 'generate_code']
    })
  )
})

/**
 * @route GET /api/v2/inventory/list
 * @desc 获取用户库存列表
 * @access 需要认证
 */
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id
    const {
      page,
      pageSize,
      category,
      status,
      keyword,
      sortBy
    } = req.query

    const options = {
      page: parseInt(page) || 1,
      pageSize: Math.min(parseInt(pageSize) || 20, 100), // 最多100条
      category,
      status,
      keyword,
      sortBy
    }

    const result = await inventoryService.getUserInventoryList(userId, options)

    res.json(ApiResponse.success(result, '获取库存列表成功'))
  } catch (error) {
    console.error('❌ 获取库存列表失败:', error.message)
    res.status(500).json(
      ApiResponse.error('获取库存列表失败', 'GET_INVENTORY_FAILED', error.message)
    )
  }
})

/**
 * @route POST /api/v2/inventory/use
 * @desc 使用库存物品
 * @access 需要认证
 */
router.post('/use', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id
    const { itemId } = req.body

    if (!itemId) {
      return res.status(400).json(
        ApiResponse.error('缺少物品ID', 'MISSING_ITEM_ID')
      )
    }

    const result = await inventoryService.useInventoryItem(userId, itemId)

    res.json(ApiResponse.success(result, '使用成功'))
  } catch (error) {
    console.error('❌ 使用库存物品失败:', error.message)

    let errorCode = 'USE_ITEM_FAILED'
    if (error.message.includes('不存在')) {
      errorCode = 'ITEM_NOT_FOUND'
    } else if (error.message.includes('不可用')) {
      errorCode = 'ITEM_NOT_AVAILABLE'
    } else if (error.message.includes('过期')) {
      errorCode = 'ITEM_EXPIRED'
    }

    res.status(400).json(
      ApiResponse.error(error.message, errorCode)
    )
  }
})

/**
 * @route POST /api/v2/inventory/transfer
 * @desc 转让库存物品
 * @access 需要认证
 */
router.post('/transfer', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id
    const { itemId, targetUserId, targetUserPhone, message } = req.body

    if (!itemId) {
      return res.status(400).json(
        ApiResponse.error('缺少物品ID', 'MISSING_ITEM_ID')
      )
    }

    let finalTargetUserId = targetUserId

    // 如果提供的是手机号，需要查找用户ID
    if (!finalTargetUserId && targetUserPhone) {
      const { User } = require('../../models')
      const targetUser = await User.findOne({
        where: { mobile: targetUserPhone }
      })

      if (!targetUser) {
        return res.status(400).json(
          ApiResponse.error('目标用户不存在', 'TARGET_USER_NOT_FOUND')
        )
      }

      finalTargetUserId = targetUser.user_id
    }

    if (!finalTargetUserId) {
      return res.status(400).json(
        ApiResponse.error('缺少目标用户信息', 'MISSING_TARGET_USER')
      )
    }

    // 不能转让给自己
    if (finalTargetUserId === userId) {
      return res.status(400).json(
        ApiResponse.error('不能转让给自己', 'CANNOT_TRANSFER_TO_SELF')
      )
    }

    const result = await inventoryService.transferInventoryItem(
      userId,
      itemId,
      finalTargetUserId,
      message || ''
    )

    res.json(ApiResponse.success(result, '转让成功'))
  } catch (error) {
    console.error('❌ 转让库存物品失败:', error.message)

    let errorCode = 'TRANSFER_FAILED'
    if (error.message.includes('不存在')) {
      errorCode = 'ITEM_NOT_FOUND'
    } else if (error.message.includes('不可转让')) {
      errorCode = 'ITEM_NOT_TRANSFERABLE'
    } else if (error.message.includes('过期')) {
      errorCode = 'ITEM_EXPIRED'
    } else if (error.message.includes('目标用户')) {
      errorCode = 'TARGET_USER_NOT_FOUND'
    }

    res.status(400).json(
      ApiResponse.error(error.message, errorCode)
    )
  }
})

/**
 * @route POST /api/v2/inventory/generate-code
 * @desc 生成核销码
 * @access 需要认证
 */
router.post('/generate-code', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id
    const { itemId } = req.body

    if (!itemId) {
      return res.status(400).json(
        ApiResponse.error('缺少物品ID', 'MISSING_ITEM_ID')
      )
    }

    const result = await inventoryService.generateVerificationCode(userId, itemId)

    res.json(ApiResponse.success(result, '核销码生成成功'))
  } catch (error) {
    console.error('❌ 生成核销码失败:', error.message)

    let errorCode = 'GENERATE_CODE_FAILED'
    if (error.message.includes('不存在')) {
      errorCode = 'ITEM_NOT_FOUND'
    } else if (error.message.includes('不支持')) {
      errorCode = 'OPERATION_NOT_SUPPORTED'
    }

    res.status(400).json(
      ApiResponse.error(error.message, errorCode)
    )
  }
})

/**
 * @route GET /api/v2/inventory/stats
 * @desc 获取库存统计信息
 * @access 需要认证
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id

    // 获取基础统计信息
    const totalValue = await inventoryService.calculateTotalValue(userId)
    const categoryStats = await inventoryService.getCategoryStats(userId)

    // 获取即将过期的物品数量
    const { UserInventory } = require('../../models')
    const { Op } = require('sequelize')

    const expiringSoonCount = await UserInventory.count({
      where: {
        user_id: userId,
        status: 'available',
        expires_at: {
          [Op.and]: [
            { [Op.not]: null },
            { [Op.between]: [new Date(), new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)] }
          ]
        }
      }
    })

    const result = {
      totalValue,
      categoryStats,
      expiringSoonCount,
      generatedAt: new Date().toISOString()
    }

    res.json(ApiResponse.success(result, '获取库存统计成功'))
  } catch (error) {
    console.error('❌ 获取库存统计失败:', error.message)
    res.status(500).json(
      ApiResponse.error('获取库存统计失败', 'GET_STATS_FAILED', error.message)
    )
  }
})

/**
 * @route GET /api/v2/inventory/health
 * @desc 库存管理健康检查
 * @access 公开
 */
router.get('/health', async (req, res) => {
  try {
    const { UserInventory } = require('../../models')

    // 检查数据库连接
    const totalItems = await UserInventory.count()

    res.json(
      ApiResponse.success({
        status: 'healthy',
        module: 'inventory',
        version: '2.0.0',
        totalItems,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      }, '库存管理服务正常')
    )
  } catch (error) {
    console.error('❌ 库存管理健康检查失败:', error.message)
    res.status(500).json(
      ApiResponse.error('库存管理服务异常', 'HEALTH_CHECK_FAILED', error.message)
    )
  }
})

module.exports = router
