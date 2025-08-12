/**
 * 餐厅积分抽奖系统 v2.0 - 权限管理路由
 * 实现臻选空间权限的管理和操作API
 * 创建时间：2025年01月28日
 */

const express = require('express')
const PermissionService = require('../../services/PermissionService')
const { authenticateToken } = require('../../middleware/auth')
const ApiResponse = require('../../utils/ApiResponse')
const router = express.Router()

// 初始化权限管理服务
const permissionService = new PermissionService()

/**
 * @route GET /api/v2/permissions
 * @desc 获取权限管理API信息
 * @access 公开
 */
router.get('/', (req, res) => {
  res.json(
    ApiResponse.success({
      module: 'permissions',
      description: '臻选空间权限管理API',
      version: '2.0.0',
      endpoints: {
        'GET /premium-space/status': '获取臻选空间权限状态（需要认证）',
        'POST /premium-space/unlock': '解锁臻选空间（需要认证）',
        'POST /premium-space/renew': '续费臻选空间（需要认证）',
        'GET /premium-space/stats': '获取权限统计信息（需要认证）'
      },
      permissionTypes: ['premium_space'],
      unlockTypes: ['24hours', 'month', 'year'],
      pricing: {
        '24hours': '100积分/24小时',
        month: '2000积分/30天',
        year: '20000积分/365天'
      },
      requirements: {
        cumulativePoints: '需要累计积分 >= 500,000',
        currentPoints: '需要可用积分 >= 解锁费用',
        dailyLimit: '每天最多解锁5次'
      }
    })
  )
})

/**
 * @route GET /api/v2/permissions/premium-space/status
 * @desc 获取臻选空间权限状态
 * @access 需要认证
 */
router.get('/premium-space/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    console.log('📋 获取权限状态:', userId)

    // 检查权限状态
    const status = await permissionService.checkPremiumSpaceStatus(userId)

    res.json(
      ApiResponse.success({
        hasPermission: status.hasPermission,
        isExpired: status.isExpired,
        expiresAt: status.expiresAt,
        remainingTime: status.remainingTime,
        unlockCount: status.unlockCount,
        totalSpentOnUnlock: status.totalSpentOnUnlock,
        canUnlock: status.canUnlock,
        points: {
          historical: status.historicalPoints,
          current: status.currentPoints,
          required: status.requiredPoints,
          unlockCost: status.unlockCost
        },
        message: status.hasPermission
          ? '已拥有臻选空间权限'
          : status.canUnlock
            ? '可以解锁臻选空间'
            : '权限解锁条件不满足'
      })
    )
  } catch (error) {
    console.error('❌ 获取权限状态失败:', error.message)
    res.status(500).json(
      ApiResponse.error('获取权限状态失败', error.message)
    )
  }
})

/**
 * @route POST /api/v2/permissions/premium-space/unlock
 * @desc 解锁臻选空间权限
 * @access 需要认证
 */
router.post('/premium-space/unlock', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const { unlockType = '24hours', confirmSpend } = req.body

    console.log('🔓 解锁臻选空间:', {
      userId,
      unlockType,
      confirmSpend
    })

    // 参数验证
    if (!confirmSpend || typeof confirmSpend !== 'number') {
      return res.status(400).json(
        ApiResponse.error('参数错误', '请确认消费积分数量')
      )
    }

    if (!['24hours', 'month', 'year'].includes(unlockType)) {
      return res.status(400).json(
        ApiResponse.error('参数错误', '无效的解锁类型')
      )
    }

    // 执行解锁
    const result = await permissionService.unlockPremiumSpace(
      userId,
      unlockType,
      confirmSpend
    )

    res.json(
      ApiResponse.success({
        ...result,
        message: '臻选空间解锁成功'
      })
    )
  } catch (error) {
    console.error('❌ 解锁权限失败:', error.message)

    if (error.message.includes('积分不足')) {
      return res.status(400).json(
        ApiResponse.error('积分不足', '当前积分不足以解锁臻选空间')
      )
    }

    if (error.message.includes('累计积分不足')) {
      return res.status(403).json(
        ApiResponse.error('权限不足', error.message)
      )
    }

    if (error.message.includes('今日解锁次数已达上限')) {
      return res.status(429).json(
        ApiResponse.error('操作频繁', error.message)
      )
    }

    if (error.message.includes('确认消费积分')) {
      return res.status(400).json(
        ApiResponse.error('参数错误', '确认消费积分与实际费用不符')
      )
    }

    res.status(500).json(
      ApiResponse.error('解锁失败', error.message)
    )
  }
})

/**
 * @route POST /api/v2/permissions/premium-space/renew
 * @desc 续费臻选空间权限
 * @access 需要认证
 */
router.post('/premium-space/renew', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId
    const { renewType = '24hours', confirmSpend } = req.body

    console.log('🔄 续费臻选空间:', {
      userId,
      renewType,
      confirmSpend
    })

    // 参数验证
    if (!confirmSpend || typeof confirmSpend !== 'number') {
      return res.status(400).json(
        ApiResponse.error('参数错误', '请确认消费积分数量')
      )
    }

    if (!['24hours', 'month', 'year'].includes(renewType)) {
      return res.status(400).json(
        ApiResponse.error('参数错误', '无效的续费类型')
      )
    }

    // 执行续费
    const result = await permissionService.renewPremiumSpace(
      userId,
      renewType,
      confirmSpend
    )

    res.json(
      ApiResponse.success({
        ...result,
        message: '臻选空间续费成功'
      })
    )
  } catch (error) {
    console.error('❌ 续费权限失败:', error.message)

    if (error.message.includes('积分不足')) {
      return res.status(400).json(
        ApiResponse.error('积分不足', '当前积分不足以续费臻选空间')
      )
    }

    if (error.message.includes('尚未解锁')) {
      return res.status(403).json(
        ApiResponse.error('权限不足', '请先解锁臻选空间')
      )
    }

    res.status(500).json(
      ApiResponse.error('续费失败', error.message)
    )
  }
})

/**
 * @route GET /api/v2/permissions/premium-space/stats
 * @desc 获取用户权限统计信息
 * @access 需要认证
 */
router.get('/premium-space/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId

    // 获取权限统计
    const stats = await permissionService.getUserPermissionStats(userId)

    res.json(
      ApiResponse.success({
        ...stats,
        message: '权限统计获取成功'
      })
    )
  } catch (error) {
    console.error('❌ 获取权限统计失败:', error.message)
    res.status(500).json(
      ApiResponse.error('获取统计失败', error.message)
    )
  }
})

/**
 * @route POST /api/v2/permissions/batch-check
 * @desc 批量检查用户权限状态（管理员功能）
 * @access 需要认证
 */
router.post('/batch-check', authenticateToken, async (req, res) => {
  try {
    const { userIds } = req.body

    if (!userIds || !Array.isArray(userIds)) {
      return res.status(400).json(
        ApiResponse.error('参数错误', '用户ID列表格式错误')
      )
    }

    // 限制批量检查数量
    if (userIds.length > 100) {
      return res.status(400).json(
        ApiResponse.error('参数错误', '单次最多检查100个用户')
      )
    }

    // 批量检查权限
    const results = await permissionService.batchCheckPermissions(userIds)

    res.json(
      ApiResponse.success({
        results,
        totalCount: userIds.length,
        message: '批量权限检查完成'
      })
    )
  } catch (error) {
    console.error('❌ 批量检查权限失败:', error.message)
    res.status(500).json(
      ApiResponse.error('批量检查失败', error.message)
    )
  }
})

/**
 * @route GET /api/v2/permissions/pricing
 * @desc 获取权限解锁价格信息
 * @access 公开
 */
router.get('/pricing', (req, res) => {
  // 从权限服务获取价格配置
  const config = {
    '24hours': { cost: 100, duration: 24, description: '24小时权限' },
    month: { cost: 2000, duration: 720, description: '30天权限' },
    year: { cost: 20000, duration: 8760, description: '365天权限' }
  }

  res.json(
    ApiResponse.success({
      pricing: config,
      requirements: {
        cumulativePoints: 500000,
        description: '需要累计积分达到50万才能解锁臻选空间'
      },
      dailyLimit: 5,
      message: '价格信息获取成功'
    })
  )
})

module.exports = router
