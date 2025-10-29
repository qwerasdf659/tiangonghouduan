/**
 * 积分管理路由 - V4.0 统一版本
 * 🛡️ 权限管理：只有超级管理员(admin)和普通用户(user)两种角色
 * 创建时间：2025年01月21日
 * 更新时间：2025年01月28日
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, getUserRoles } = require('../../../middleware/auth')
const PointsService = require('../../../services/PointsService')
const BeijingTimeHelper = require('../../../utils/timeHelper')

/**
 * GET /balance - 获取当前用户积分余额
 *
 * @description 从JWT token中自动获取当前用户的积分余额信息
 * @route GET /api/v4/unified-engine/points/balance
 * @access Private (需要认证)
 */
router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.user_id

    // 获取用户积分信息
    const points_info = await PointsService.getUserPoints(user_id)

    return res.apiSuccess(
      {
        user_id,
        available_points: points_info.available_points,
        total_earned: points_info.total_earned,
        total_consumed: points_info.total_consumed,
        timestamp: BeijingTimeHelper.apiTimestamp()
      },
      '积分余额查询成功'
    )
  } catch (error) {
    console.error('积分余额查询失败:', error)
    return res.apiInternalError('积分余额查询失败', error.message, 'POINTS_BALANCE_ERROR')
  }
})

/**
 * GET /balance/:user_id - 获取指定用户积分余额
 *
 * @description 获取指定用户的积分余额信息（管理员可查询任意用户）
 * @route GET /api/v4/unified-engine/points/balance/:user_id
 * @access Private (需要认证)
 */
router.get('/balance/:user_id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.params
    const current_user_id = req.user.user_id

    // 🛡️ 权限检查：只能查询自己的积分，除非是超级管理员
    const currentUserRoles = await getUserRoles(current_user_id)
    if (parseInt(user_id) !== current_user_id && !currentUserRoles.isAdmin) {
      return res.apiError('无权限查询其他用户积分', 'PERMISSION_DENIED', {}, 403)
    }

    // 获取用户积分信息
    const points_info = await PointsService.getUserPoints(parseInt(user_id))

    return res.apiSuccess(
      {
        user_id: parseInt(user_id),
        available_points: points_info.available_points,
        total_earned: points_info.total_earned,
        total_consumed: points_info.total_consumed,
        timestamp: BeijingTimeHelper.apiTimestamp()
      },
      '积分余额查询成功'
    )
  } catch (error) {
    console.error('积分余额查询失败:', error)
    return res.apiInternalError('积分余额查询失败', error.message, 'POINTS_BALANCE_ERROR')
  }
})

/**
 * GET /transactions/:user_id - 获取用户积分交易历史
 *
 * @description 获取用户的积分交易记录，支持分页
 * @route GET /api/v4/unified-engine/points/transactions/:user_id
 * @access Private (需要认证)
 */
router.get('/transactions/:user_id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.params
    const { page = 1, limit = 20, type } = req.query

    // 🛡️ 参数验证：检查user_id是否有效
    if (!user_id || user_id === 'undefined' || user_id === 'null') {
      return res.apiError(
        '用户ID参数无效，请确保已登录并正确传递用户ID',
        'INVALID_USER_ID',
        {
          received_user_id: user_id,
          hint: '前端应从登录状态或JWT token中获取user_id'
        },
        400
      )
    }

    const user_id_int = parseInt(user_id)
    if (isNaN(user_id_int) || user_id_int <= 0) {
      return res.apiError(
        '用户ID必须是正整数',
        'INVALID_USER_ID_FORMAT',
        { received_user_id: user_id },
        400
      )
    }

    // 🎯 分页安全保护：最大100条记录（服务层也有保护，双重防护）
    const finalLimit = Math.min(parseInt(limit), 100)
    const current_user_id = req.user.user_id

    // 🛡️ 权限检查：只能查询自己的交易记录，除非是超级管理员
    const currentUserRoles = await getUserRoles(current_user_id)
    if (user_id_int !== current_user_id && !currentUserRoles.isAdmin) {
      return res.apiError('无权限查询其他用户交易记录', 'PERMISSION_DENIED', {}, 403)
    }

    // 获取交易记录
    const transactions = await PointsService.getUserTransactions(user_id_int, {
      page: parseInt(page),
      limit: finalLimit,
      type
    })

    return res.apiSuccess(
      {
        user_id: user_id_int,
        transactions: transactions.data,
        pagination: {
          page: parseInt(page),
          limit: finalLimit,
          total: transactions.total,
          pages: Math.ceil(transactions.total / finalLimit)
        },
        timestamp: BeijingTimeHelper.apiTimestamp()
      },
      '积分交易记录查询成功'
    )
  } catch (error) {
    console.error('积分交易记录查询失败:', error)
    return res.apiInternalError('积分交易记录查询失败', error.message, 'POINTS_TRANSACTIONS_ERROR')
  }
})

/**
 * POST /admin/adjust - 管理员调整用户积分
 *
 * @description 管理员专用接口，用于调整用户积分
 * @route POST /api/v4/unified-engine/points/admin/adjust
 * @access Private (需要超级管理员权限)
 */
router.post('/admin/adjust', authenticateToken, async (req, res) => {
  try {
    const { user_id, amount, reason, type = 'admin_adjust' } = req.body
    const admin_id = req.user.user_id

    // 🛡️ 权限检查：只有超级管理员可以调整积分
    const adminRoles = await getUserRoles(admin_id)
    if (!adminRoles.isAdmin) {
      return res.apiError('无权限执行此操作', 'PERMISSION_DENIED', {}, 403)
    }

    // 参数验证
    if (!user_id || !amount || !reason) {
      return res.apiError('用户ID、积分数量和调整原因不能为空', 'INVALID_PARAMS', {}, 400)
    }

    if (typeof amount !== 'number' || amount === 0) {
      return res.apiError('积分数量必须是非零数字', 'INVALID_PARAMS', {}, 400)
    }

    // 执行积分调整
    if (amount > 0) {
      await PointsService.addPoints(user_id, amount, {
        business_type: 'admin_adjust',
        source_type: 'admin',
        title: '管理员调整积分',
        description: reason,
        operator_id: admin_id
      })
    } else {
      await PointsService.consumePoints(user_id, Math.abs(amount), {
        business_type: 'admin_adjust',
        source_type: 'admin',
        title: '管理员调整积分',
        description: reason,
        operator_id: admin_id
      })
    }

    // 获取调整后的余额
    const points_info = await PointsService.getUserPoints(user_id)

    return res.apiSuccess(
      {
        user_id,
        adjustment: {
          amount,
          type,
          reason,
          admin_id,
          timestamp: BeijingTimeHelper.apiTimestamp()
        },
        new_balance: points_info.available_points
      },
      '积分调整成功'
    )
  } catch (error) {
    console.error('管理员积分调整失败:', error)
    return res.apiInternalError('积分调整失败', error.message, 'ADMIN_POINTS_ADJUST_ERROR')
  }
})

/**
 * GET /admin/statistics - 获取积分统计信息
 *
 * @description 管理员专用接口，获取积分系统统计信息
 * @route GET /api/v4/unified-engine/points/admin/statistics
 * @access Private (需要超级管理员权限)
 */
router.get('/admin/statistics', authenticateToken, async (req, res) => {
  try {
    const admin_id = req.user.user_id

    // 🛡️ 权限检查：只有超级管理员可以查看统计信息
    const adminRoles = await getUserRoles(admin_id)
    if (!adminRoles.isAdmin) {
      return res.apiError('无权限查看统计信息', 'PERMISSION_DENIED', {}, 403)
    }

    // 获取积分统计信息
    const { UserPointsAccount, PointsTransaction } = require('../../../models')
    const { Op } = require('sequelize')

    const [totalAccounts, activeAccounts, totalTransactions, recentTransactions] =
      await Promise.all([
        UserPointsAccount.count(),
        UserPointsAccount.count({ where: { is_active: true } }),
        PointsTransaction.count(),
        PointsTransaction.count({
          where: {
            transaction_time: {
              [Op.gte]: new Date(BeijingTimeHelper.timestamp() - 30 * 24 * 60 * 60 * 1000)
            }
          }
        })
      ])

    return res.apiSuccess(
      {
        statistics: {
          total_accounts: totalAccounts,
          active_accounts: activeAccounts,
          total_transactions: totalTransactions,
          recent_transactions: recentTransactions
        },
        timestamp: BeijingTimeHelper.apiTimestamp()
      },
      '积分统计信息获取成功'
    )
  } catch (error) {
    console.error('获取积分统计失败:', error)
    return res.apiInternalError('获取积分统计失败', error.message, 'POINTS_STATISTICS_ERROR')
  }
})

/**
 * GET /user/statistics/:user_id - 获取用户统计数据
 *
 * @description 获取用户的完整统计信息，包括抽奖、兑换、上传等数据
 * @route GET /api/v4/unified-engine/points/user/statistics/:user_id
 * @access Private (需要认证)
 */
router.get('/user/statistics/:user_id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.params
    const current_user_id = req.user.user_id

    // 🛡️ 权限检查：只能查询自己的统计数据，除非是超级管理员
    const currentUserRoles = await getUserRoles(current_user_id)
    if (parseInt(user_id) !== current_user_id && !currentUserRoles.isAdmin) {
      return res.apiError('无权限查询其他用户统计', 'PERMISSION_DENIED', {}, 403)
    }

    const { User } = require('../../../models')

    // 并行获取统计数据
    const [userInfo, pointsInfo, lotteryStats, exchangeStats, uploadStats, inventoryStats] =
      await Promise.all([
        User.findByPk(parseInt(user_id), {
          attributes: ['user_id', 'created_at', 'last_login', 'login_count']
        }),
        PointsService.getUserPoints(parseInt(user_id)),
        getLotteryStatistics(parseInt(user_id)),
        getExchangeStatistics(parseInt(user_id)),
        getUploadStatistics(parseInt(user_id)),
        getInventoryStatistics(parseInt(user_id))
      ])

    if (!userInfo) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND', {}, 404)
    }

    // 计算本月积分变化
    const monthStart = BeijingTimeHelper.createBeijingTime()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const monthPoints = await PointsService.getUserTransactions(parseInt(user_id), {
      startDate: monthStart,
      limit: 1000
    })

    const monthEarned = monthPoints.data
      .filter(t => t.transaction_type === 'earn')
      .reduce((sum, t) => sum + parseFloat(t.points_amount), 0)

    const statistics = {
      user_id: parseInt(user_id),
      account_created: userInfo.created_at,
      last_activity: userInfo.last_login,
      login_count: userInfo.login_count,

      // 积分统计
      points: {
        current_balance: pointsInfo.available_points,
        total_earned: pointsInfo.total_earned,
        total_consumed: pointsInfo.total_consumed,
        month_earned: monthEarned
      },

      // 抽奖统计
      lottery: lotteryStats,

      // 兑换统计
      exchange: exchangeStats,

      // 上传统计
      upload: uploadStats,

      // 库存统计
      inventory: inventoryStats,

      // 成就数据（基础实现）
      achievements: calculateAchievements({
        lottery: lotteryStats,
        exchange: exchangeStats,
        upload: uploadStats,
        totalEarned: pointsInfo.total_earned
      })
    }

    return res.apiSuccess(
      {
        statistics,
        timestamp: BeijingTimeHelper.apiTimestamp()
      },
      '用户统计数据获取成功'
    )
  } catch (error) {
    console.error('获取用户统计失败:', error)
    return res.apiInternalError('获取用户统计失败', error.message, 'USER_STATISTICS_ERROR')
  }
})

/**
 * 辅助函数：获取抽奖统计
 * @param {number} user_id - 用户ID
 * @returns {Promise<Object>} 抽奖统计数据
 */
async function getLotteryStatistics(user_id) {
  const { LotteryDraw } = require('../../../models')

  const [totalCount, thisMonth] = await Promise.all([
    LotteryDraw.count({ where: { user_id } }),
    LotteryDraw.count({
      where: {
        user_id,
        created_at: {
          [require('sequelize').Op.gte]: new Date(
            BeijingTimeHelper.createDatabaseTime().getFullYear(),
            BeijingTimeHelper.createDatabaseTime().getMonth(),
            1
          )
        }
      }
    })
  ])

  return {
    total_count: totalCount,
    month_count: thisMonth,
    last_draw: null // TODO: 获取最后抽奖时间
  }
}

/**
 * 辅助函数：获取兑换统计
 * @param {number} user_id - 用户ID
 * @returns {Promise<Object>} 兑换统计数据
 */
async function getExchangeStatistics(user_id) {
  const { ExchangeRecords } = require('../../../models')

  const [totalCount, totalPoints, thisMonth] = await Promise.all([
    ExchangeRecords.count({ where: { user_id } }),
    ExchangeRecords.sum('total_points', { where: { user_id } }) || 0,
    ExchangeRecords.count({
      where: {
        user_id,
        exchange_time: {
          [require('sequelize').Op.gte]: new Date(
            BeijingTimeHelper.createDatabaseTime().getFullYear(),
            BeijingTimeHelper.createDatabaseTime().getMonth(),
            1
          )
        }
      }
    })
  ])

  return {
    total_count: totalCount,
    total_points: totalPoints,
    month_count: thisMonth
  }
}

/**
 * 辅助函数：获取上传统计
 * @param {number} user_id - 用户ID
 * @returns {Promise<Object>} 上传统计数据
 */
async function getUploadStatistics(user_id) {
  const { ImageResources } = require('../../../models')

  const [totalCount, approvedCount, thisMonth] = await Promise.all([
    ImageResources.count({ where: { user_id, source_module: 'user_upload' } }),
    ImageResources.count({
      where: { user_id, source_module: 'user_upload', review_status: 'approved' }
    }),
    ImageResources.count({
      where: {
        user_id,
        source_module: 'user_upload',
        created_at: {
          [require('sequelize').Op.gte]: new Date(
            BeijingTimeHelper.createDatabaseTime().getFullYear(),
            BeijingTimeHelper.createDatabaseTime().getMonth(),
            1
          )
        }
      }
    })
  ])

  return {
    total_count: totalCount,
    approved_count: approvedCount,
    approval_rate: totalCount > 0 ? ((approvedCount / totalCount) * 100).toFixed(1) : 0,
    month_count: thisMonth
  }
}

/**
 * 辅助函数：获取库存统计
 * @param {number} user_id - 用户ID
 * @returns {Promise<Object>} 库存统计数据
 */
async function getInventoryStatistics(user_id) {
  const { UserInventory } = require('../../../models')

  const [totalCount, availableCount, usedCount] = await Promise.all([
    UserInventory.count({ where: { user_id } }),
    UserInventory.count({ where: { user_id, status: 'available' } }),
    UserInventory.count({ where: { user_id, status: 'used' } })
  ])

  return {
    total_count: totalCount,
    available_count: availableCount,
    used_count: usedCount,
    usage_rate: totalCount > 0 ? ((usedCount / totalCount) * 100).toFixed(1) : 0
  }
}

/**
 * 辅助函数：计算成就
 * @param {Object} stats - 统计数据
 * @returns {Array} 成就列表
 */
function calculateAchievements(stats) {
  const achievements = []

  // 抽奖相关成就
  if (stats.lottery.total_count >= 1) {
    achievements.push({
      id: 'first_lottery',
      name: '初试身手',
      description: '完成第一次抽奖',
      unlocked: true,
      category: 'lottery'
    })
  }

  if (stats.lottery.total_count >= 10) {
    achievements.push({
      id: 'lottery_enthusiast',
      name: '抽奖达人',
      description: '完成10次抽奖',
      unlocked: true,
      category: 'lottery'
    })
  }

  // 兑换相关成就
  if (stats.exchange.total_count >= 1) {
    achievements.push({
      id: 'first_exchange',
      name: '首次兑换',
      description: '完成第一次商品兑换',
      unlocked: true,
      category: 'exchange'
    })
  }

  // 积分相关成就
  if (stats.totalEarned >= 1000) {
    achievements.push({
      id: 'points_collector',
      name: '积分收集者',
      description: '累计获得1000积分',
      unlocked: true,
      category: 'points'
    })
  }

  return achievements
}

module.exports = router
