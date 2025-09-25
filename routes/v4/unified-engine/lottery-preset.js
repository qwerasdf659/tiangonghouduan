/**
 * 抽奖预设管理路由
 * 为管理员提供用户抽奖结果预设功能
 * 实现运营干预：为特定用户预设抽奖结果，用户无感知
 * 创建时间：2025年01月21日
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const models = require('../../../models')
const BeijingTimeHelper = require('../../../utils/timeHelper')

/**
 * 为用户创建抽奖预设队列
 * POST /api/v4/lottery-preset/create
 */
router.post('/create', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const adminId = req.user.user_id
    const { user_id, presets } = req.body

    // 参数验证
    if (!user_id || !presets || !Array.isArray(presets) || presets.length === 0) {
      return res.apiError('参数错误：需要user_id和presets数组', 'INVALID_PARAMETERS')
    }

    // 验证目标用户存在
    const targetUser = await models.User.findByPk(user_id)
    if (!targetUser) {
      return res.apiError('目标用户不存在', 'USER_NOT_FOUND')
    }

    // 验证预设数据格式
    for (const preset of presets) {
      if (!preset.prize_id || !preset.queue_order) {
        return res.apiError('预设数据格式错误：需要prize_id和queue_order', 'INVALID_PRESET_DATA')
      }

      // 验证奖品存在
      const prize = await models.LotteryPrize.findByPk(preset.prize_id)
      if (!prize) {
        return res.apiError(`奖品ID ${preset.prize_id} 不存在`, 'PRIZE_NOT_FOUND')
      }
    }

    // 创建预设队列
    const createdPresets = await models.LotteryPreset.createPresetQueue(
      user_id,
      presets,
      adminId
    )

    console.log('🎯 管理员创建抽奖预设成功', {
      adminId,
      targetUserId: user_id,
      presetsCount: createdPresets.length,
      timestamp: BeijingTimeHelper.apiTimestamp()
    })

    return res.apiSuccess('抽奖预设创建成功', {
      user_id,
      presets_count: createdPresets.length,
      created_presets: createdPresets.map(preset => ({
        preset_id: preset.preset_id,
        prize_id: preset.prize_id,
        queue_order: preset.queue_order,
        status: preset.status
      }))
    })
  } catch (error) {
    console.error('❌ 创建抽奖预设失败:', error.message)
    return res.apiInternalError('创建抽奖预设失败')
  }
})

/**
 * 查看用户的抽奖预设列表
 * GET /api/v4/lottery-preset/user/:user_id
 */
router.get('/user/:user_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const adminId = req.user.user_id
    const { user_id } = req.params
    const { status = 'all' } = req.query

    // 验证目标用户存在
    const targetUser = await models.User.findByPk(user_id)
    if (!targetUser) {
      return res.apiError('目标用户不存在', 'USER_NOT_FOUND')
    }

    // 构建查询条件
    const whereCondition = { user_id }
    if (status !== 'all') {
      whereCondition.status = status
    }

    // 查询用户的预设
    const presets = await models.LotteryPreset.findAll({
      where: whereCondition,
      include: [
        {
          model: models.LotteryPrize,
          as: 'prize',
          attributes: ['prize_id', 'name', 'prize_type', 'prize_value', 'description']
        },
        {
          model: models.User,
          as: 'admin',
          attributes: ['user_id', 'username', 'nickname']
        }
      ],
      order: [['queue_order', 'ASC']]
    })

    // 获取统计信息
    const stats = await models.LotteryPreset.getUserPresetStats(user_id)

    console.log('🔍 管理员查看用户预设', {
      adminId,
      targetUserId: user_id,
      presetsCount: presets.length,
      timestamp: BeijingTimeHelper.apiTimestamp()
    })

    return res.apiSuccess('获取用户预设成功', {
      user: {
        user_id: targetUser.user_id,
        username: targetUser.username,
        nickname: targetUser.nickname
      },
      stats,
      presets: presets.map(preset => ({
        preset_id: preset.preset_id,
        prize_id: preset.prize_id,
        queue_order: preset.queue_order,
        status: preset.status,
        created_at: preset.created_at,
        prize: preset.prize,
        admin: preset.admin
      }))
    })
  } catch (error) {
    console.error('❌ 查看用户预设失败:', error.message)
    return res.apiInternalError('查看用户预设失败')
  }
})

/**
 * 清理用户的所有预设
 * DELETE /api/v4/lottery-preset/user/:user_id
 */
router.delete('/user/:user_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const adminId = req.user.user_id
    const { user_id } = req.params

    // 验证目标用户存在
    const targetUser = await models.User.findByPk(user_id)
    if (!targetUser) {
      return res.apiError('目标用户不存在', 'USER_NOT_FOUND')
    }

    // 清理用户的所有预设
    const deletedCount = await models.LotteryPreset.clearUserPresets(user_id)

    console.log('🗑️ 管理员清理用户预设', {
      adminId,
      targetUserId: user_id,
      deletedCount,
      timestamp: BeijingTimeHelper.apiTimestamp()
    })

    return res.apiSuccess('清理用户预设成功', {
      user_id,
      deleted_count: deletedCount
    })
  } catch (error) {
    console.error('❌ 清理用户预设失败:', error.message)
    return res.apiInternalError('清理用户预设失败')
  }
})

/**
 * 获取预设统计信息
 * GET /api/v4/lottery-preset/stats
 */
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const adminId = req.user.user_id

    // 获取总体统计
    const [totalPresets, pendingPresets, usedPresets, totalUsers] = await Promise.all([
      models.LotteryPreset.count(),
      models.LotteryPreset.count({ where: { status: 'pending' } }),
      models.LotteryPreset.count({ where: { status: 'used' } }),
      models.LotteryPreset.count({
        distinct: true,
        col: 'user_id'
      })
    ])

    // 获取奖品类型分布
    const prizeTypeStats = await models.LotteryPreset.findAll({
      attributes: [
        [models.sequelize.col('prize.prize_type'), 'prize_type'],
        [models.sequelize.fn('COUNT', models.sequelize.col('LotteryPreset.preset_id')), 'count']
      ],
      include: [
        {
          model: models.LotteryPrize,
          as: 'prize',
          attributes: []
        }
      ],
      group: ['prize.prize_type']
    })

    console.log('📊 管理员查看预设统计', {
      adminId,
      timestamp: BeijingTimeHelper.apiTimestamp()
    })

    return res.apiSuccess('获取预设统计成功', {
      total_presets: totalPresets,
      pending_presets: pendingPresets,
      used_presets: usedPresets,
      total_users_with_presets: totalUsers,
      usage_rate: totalPresets > 0 ? ((usedPresets / totalPresets) * 100).toFixed(2) : 0,
      prize_type_distribution: prizeTypeStats.map(stat => ({
        prize_type: stat.getDataValue('prize_type'),
        count: stat.getDataValue('count')
      }))
    })
  } catch (error) {
    console.error('❌ 获取预设统计失败:', error.message)
    return res.apiInternalError('获取预设统计失败')
  }
})

module.exports = router
