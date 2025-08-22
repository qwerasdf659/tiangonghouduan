/**
 * 🔥 社交抽奖系统API接口 v3 - 多人协作抽奖
 * 创建时间：2025年08月22日 UTC
 * 特点：房间管理 + 实时通知 + 分布式锁 + 积分结算
 * 路径：/api/v3/social
 * 基于：SocialLotteryService (24KB) - 新开发功能
 */

'use strict'

const express = require('express')
const router = express.Router()
const SocialLotteryService = require('../../services/SocialLotteryService')
const { requireUser, requireAdmin } = require('../../middleware/auth')
const validationMiddleware = require('../../middleware/validation')

/**
 * POST /api/v3/social/rooms
 * 创建社交抽奖房间
 */
router.post('/rooms',
  requireUser,
  validationMiddleware([
    { field: 'campaignId', type: 'number', required: true, min: 1 },
    { field: 'maxParticipants', type: 'number', required: false, min: 2, max: 10 },
    { field: 'minContribution', type: 'number', required: false, min: 50, max: 10000 },
    { field: 'autoStart', type: 'boolean', required: false },
    { field: 'privateRoom', type: 'boolean', required: false },
    { field: 'invitationRequired', type: 'boolean', required: false },
    { field: 'roomPassword', type: 'string', required: false, maxLength: 20 }
  ]),
  async (req, res) => {
    try {
      const userId = req.user.user_id
      const { campaignId, maxParticipants, minContribution, autoStart, privateRoom, invitationRequired, roomPassword } = req.body

      console.log(`🏠 创建社交抽奖房间请求: 用户=${userId}, 活动=${campaignId}`)

      const options = {
        maxParticipants,
        minContribution,
        autoStart,
        privateRoom,
        invitationRequired,
        roomPassword
      }

      const result = await SocialLotteryService.createRoom(userId, campaignId, options)

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
          message: result.message,
          timestamp: new Date().toISOString()
        })
      }

      res.status(201).json({
        success: true,
        data: result.data,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ 创建社交抽奖房间失败:', error)
      res.status(500).json({
        success: false,
        error: 'CREATE_ROOM_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * POST /api/v3/social/rooms/:roomId/join
 * 加入社交抽奖房间
 */
router.post('/rooms/:roomId/join',
  requireUser,
  validationMiddleware([
    { field: 'contributionPoints', type: 'number', required: true, min: 50, max: 10000 },
    { field: 'roomPassword', type: 'string', required: false, maxLength: 20 }
  ]),
  async (req, res) => {
    try {
      const userId = req.user.user_id
      const { roomId } = req.params
      const { contributionPoints, roomPassword: _roomPassword } = req.body

      console.log(`🚪 加入社交抽奖房间请求: 用户=${userId}, 房间=${roomId}, 贡献=${contributionPoints}`)

      // TODO: 验证房间密码(如果有的话) - _roomPassword

      const result = await SocialLotteryService.joinRoom(userId, roomId, contributionPoints)

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
          message: result.message,
          timestamp: new Date().toISOString()
        })
      }

      res.json({
        success: true,
        data: result.data,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ 加入社交抽奖房间失败:', error)
      res.status(500).json({
        success: false,
        error: 'JOIN_ROOM_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * GET /api/v3/social/rooms/:roomId
 * 获取社交抽奖房间详情
 */
router.get('/rooms/:roomId', requireUser, async (req, res) => {
  try {
    const { roomId } = req.params
    const userId = req.user.user_id

    console.log(`🔍 获取房间详情: 房间=${roomId}, 用户=${userId}`)

    const result = await SocialLotteryService.getRoomDetails(roomId)

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    }

    // 检查用户是否有权限查看房间
    const isParticipant = result.data.members.some(member => member.user_id === userId)
    const isCreator = result.data.room.creator_user_id === userId
    const isAdmin = req.user.role === 'admin'

    if (!isParticipant && !isCreator && !isAdmin && result.data.room.settings.private_room) {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: '无权访问私人房间',
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: result.data,
      message: '房间详情获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 获取房间详情失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_ROOM_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * POST /api/v3/social/rooms/:roomId/start
 * 手动开始社交抽奖（仅创建者或管理员）
 */
router.post('/rooms/:roomId/start', requireUser, async (req, res) => {
  try {
    const { roomId } = req.params
    const userId = req.user.user_id

    console.log(`🎲 手动开始社交抽奖: 房间=${roomId}, 用户=${userId}`)

    // 验证权限：只有创建者或管理员可以手动开始
    const roomDetails = await SocialLotteryService.getRoomDetails(roomId)
    if (!roomDetails.success) {
      return res.status(404).json({
        success: false,
        error: 'ROOM_NOT_FOUND',
        message: '房间不存在',
        timestamp: new Date().toISOString()
      })
    }

    const isCreator = roomDetails.data.room.creator_user_id === userId
    const isAdmin = req.user.role === 'admin'

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: '只有房间创建者或管理员可以开始抽奖',
        timestamp: new Date().toISOString()
      })
    }

    // 检查房间状态
    if (roomDetails.data.room.status !== 'waiting') {
      return res.status(400).json({
        success: false,
        error: 'ROOM_NOT_READY',
        message: '房间状态不允许开始抽奖',
        timestamp: new Date().toISOString()
      })
    }

    // 检查参与者数量
    if (roomDetails.data.members.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'INSUFFICIENT_PARTICIPANTS',
        message: '至少需要2人参与才能开始抽奖',
        timestamp: new Date().toISOString()
      })
    }

    // 执行抽奖
    const result = await SocialLotteryService.executeSocialDraw(roomId)

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: result.data,
      message: result.message,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 手动开始社交抽奖失败:', error)
    res.status(500).json({
      success: false,
      error: 'START_DRAW_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * DELETE /api/v3/social/rooms/:roomId
 * 取消社交抽奖房间（仅创建者或管理员）
 */
router.delete('/rooms/:roomId', requireUser, async (req, res) => {
  try {
    const { roomId } = req.params
    const userId = req.user.user_id

    console.log(`🚫 取消社交抽奖房间: 房间=${roomId}, 用户=${userId}`)

    // 验证权限
    const roomDetails = await SocialLotteryService.getRoomDetails(roomId)
    if (!roomDetails.success) {
      return res.status(404).json({
        success: false,
        error: 'ROOM_NOT_FOUND',
        message: '房间不存在',
        timestamp: new Date().toISOString()
      })
    }

    const isCreator = roomDetails.data.room.creator_user_id === userId
    const isAdmin = req.user.role === 'admin'

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: '只有房间创建者或管理员可以取消房间',
        timestamp: new Date().toISOString()
      })
    }

    // 只能取消等待中的房间
    if (roomDetails.data.room.status !== 'waiting') {
      return res.status(400).json({
        success: false,
        error: 'ROOM_CANNOT_CANCEL',
        message: '只能取消等待中的房间',
        timestamp: new Date().toISOString()
      })
    }

    await SocialLotteryService.cancelRoom(roomId, 'USER_CANCELLED')

    res.json({
      success: true,
      data: { roomId },
      message: '房间已成功取消',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 取消社交抽奖房间失败:', error)
    res.status(500).json({
      success: false,
      error: 'CANCEL_ROOM_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/social/rooms
 * 获取公开的社交抽奖房间列表
 */
router.get('/rooms', async (req, res) => {
  try {
    const { status = 'waiting', page = 1, limit = 20 } = req.query
    const offset = (page - 1) * limit

    console.log(`📋 获取社交抽奖房间列表: 状态=${status}, 页码=${page}`)

    const { sequelize } = require('../../models')

    const [rooms] = await sequelize.query(`
      SELECT slc.*, lc.name as campaign_name, lc.description as campaign_description,
             u.username as creator_name, u.avatar as creator_avatar
      FROM social_lottery_rooms slc
      JOIN lottery_campaigns lc ON slc.campaign_id = lc.campaign_id
      JOIN users u ON slc.creator_user_id = u.user_id
      WHERE slc.status = ? 
        AND JSON_EXTRACT(slc.settings, '$.private_room') = false
        AND slc.expires_at > NOW()
      ORDER BY slc.created_at DESC
      LIMIT ? OFFSET ?
    `, {
      replacements: [status, parseInt(limit), parseInt(offset)]
    })

    // 处理设置字段
    const processedRooms = rooms.map(room => ({
      ...room,
      settings: JSON.parse(room.settings || '{}'),
      available_slots: room.max_participants - room.current_participants
    }))

    res.json({
      success: true,
      data: {
        rooms: processedRooms,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: processedRooms.length
        }
      },
      message: '房间列表获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 获取房间列表失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_ROOMS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/social/user/:userId/rooms
 * 获取用户参与的社交抽奖房间
 */
router.get('/user/:userId/rooms', requireUser, async (req, res) => {
  try {
    const { userId } = req.params
    const requestUserId = req.user.user_id

    // 权限验证：用户只能查看自己的房间，管理员可以查看任何用户
    if (parseInt(userId) !== requestUserId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: '无权查看其他用户的房间',
        timestamp: new Date().toISOString()
      })
    }

    console.log(`👤 获取用户房间: 用户=${userId}`)

    const { sequelize } = require('../../models')

    const [rooms] = await sequelize.query(`
      SELECT slc.*, lc.name as campaign_name, 
             slm.contribution_points, slm.role, slm.draw_result, slm.joined_at
      FROM social_lottery_participants slm
      JOIN social_lottery_rooms slc ON slm.room_id = slc.room_id
      JOIN lottery_campaigns lc ON slc.campaign_id = lc.campaign_id
      WHERE slm.user_id = ?
      ORDER BY slm.joined_at DESC
    `, {
      replacements: [userId]
    })

    // 处理结果
    const processedRooms = rooms.map(room => ({
      ...room,
      settings: JSON.parse(room.settings || '{}'),
      draw_result: room.draw_result ? JSON.parse(room.draw_result) : null
    }))

    res.json({
      success: true,
      data: { rooms: processedRooms },
      message: '用户房间获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 获取用户房间失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_USER_ROOMS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * POST /api/v3/social/admin/cleanup
 * 管理员清理过期房间
 */
router.post('/admin/cleanup', requireAdmin, async (req, res) => {
  try {
    console.log('🧹 管理员清理过期房间')

    await SocialLotteryService.cleanupExpiredRooms()

    res.json({
      success: true,
      data: { action: 'cleanup_completed' },
      message: '过期房间清理完成',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 清理过期房间失败:', error)
    res.status(500).json({
      success: false,
      error: 'CLEANUP_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/social/stats
 * 获取社交抽奖统计数据
 */
router.get('/stats', async (req, res) => {
  try {
    console.log('📊 获取社交抽奖统计数据')

    const { sequelize } = require('../../models')

    const [stats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_rooms,
        COUNT(CASE WHEN status = 'waiting' THEN 1 END) as waiting_rooms,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_rooms,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_rooms,
        SUM(current_participants) as total_participants,
        SUM(total_contribution_points) as total_points_contributed,
        AVG(current_participants) as avg_participants_per_room
      FROM social_lottery_rooms
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    `)

    const [memberStats] = await sequelize.query(`
      SELECT 
        COUNT(DISTINCT user_id) as unique_participants,
        COUNT(*) as total_participations,
        AVG(contribution_points) as avg_contribution_per_user
      FROM social_lottery_participants
      WHERE joined_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    `)

    res.json({
      success: true,
      data: {
        room_stats: stats[0],
        member_stats: memberStats[0],
        period: 'last_7_days'
      },
      message: '统计数据获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 获取统计数据失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_STATS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

module.exports = router
