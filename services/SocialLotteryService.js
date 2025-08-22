/**
 * 🔥 社交抽奖系统Service v3 - 多人协作抽奖核心服务
 * 创建时间：2025年08月22日 UTC
 * 特点：分布式锁 + 房间管理 + 实时通知 + 积分结算
 * 技术栈：Sequelize + Redis + WebSocket + 事务处理
 */

'use strict'

const { sequelize } = require('../models')
const EventBusService = require('./EventBusService')
const LotteryService = require('./LotteryService')
const WebSocketService = require('./WebSocketService')
const { v4: uuidv4 } = require('uuid')
const Redis = require('redis')

class SocialLotteryService {
  constructor () {
    this.models = require('../models')
    this.activeLocks = new Map() // 本地锁映射
    this.redis = Redis.createClient() // Redis分布式锁
    this.redis.on('error', (err) => console.error('Redis客户端错误:', err))
    this.init()
  }

  /**
   * 初始化Redis连接
   */
  async init () {
    try {
      if (!this.redis.isOpen) {
        await this.redis.connect()
        console.log('✅ SocialLotteryService Redis连接成功')
      }
    } catch (error) {
      console.error('❌ SocialLotteryService Redis连接失败:', error)
    }
  }

  /**
   * 创建社交抽奖房间
   * @param {number} creatorId - 创建者用户ID
   * @param {number} campaignId - 抽奖活动ID
   * @param {object} options - 房间配置选项
   */
  async createRoom (creatorId, campaignId, options = {}) {
    const transaction = await sequelize.transaction()

    try {
      // 生成唯一房间ID
      const roomId = `room_${Date.now()}_${uuidv4().substr(0, 8)}`

      console.log(`🏠 创建社交抽奖房间: 房间=${roomId}, 创建者=${creatorId}, 活动=${campaignId}`)

      // 验证抽奖活动是否存在且支持社交模式
      const campaign = await this.models.LotteryCampaign.findByPk(campaignId, { transaction })
      if (!campaign) {
        await transaction.rollback()
        return {
          success: false,
          error: 'CAMPAIGN_NOT_FOUND',
          message: '抽奖活动不存在'
        }
      }

      // 检查活动状态
      if (campaign.status !== 'active') {
        await transaction.rollback()
        return {
          success: false,
          error: 'CAMPAIGN_NOT_ACTIVE',
          message: '抽奖活动未激活'
        }
      }

      // 验证创建者积分余额
      const creatorPoints = await this.models.UserPointsAccount.findOne({
        where: { user_id: creatorId },
        transaction
      })

      const minContribution = options.minContribution || 100
      if (!creatorPoints || creatorPoints.available_points < minContribution) {
        await transaction.rollback()
        return {
          success: false,
          error: 'INSUFFICIENT_POINTS',
          message: `创建房间需要至少${minContribution}积分`
        }
      }

      // 创建社交抽奖房间记录
      const roomData = {
        room_id: roomId,
        creator_user_id: creatorId,
        campaign_id: campaignId,
        max_participants: Math.min(options.maxParticipants || 5, 10), // 最多10人
        min_contribution: minContribution,
        current_participants: 1, // 创建者自动加入
        total_contribution_points: 0,
        status: 'waiting',
        settings: JSON.stringify({
          auto_start: options.autoStart !== false, // 默认自动开始
          private_room: options.privateRoom || false,
          invitation_required: options.invitationRequired || false,
          room_password: options.roomPassword || null
        }),
        expires_at: new Date(Date.now() + 30 * 60 * 1000), // 30分钟后过期
        created_at: new Date(),
        updated_at: new Date()
      }

      // 使用原生SQL插入，避免Sequelize模型未定义问题
      await sequelize.query(`
        INSERT INTO social_lottery_rooms (
          room_id, creator_user_id, campaign_id, max_participants, min_contribution,
          current_participants, total_contribution_points, status, settings, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, {
        replacements: [
          roomData.room_id, roomData.creator_user_id, roomData.campaign_id,
          roomData.max_participants, roomData.min_contribution, roomData.current_participants,
          roomData.total_contribution_points, roomData.status, roomData.settings,
          roomData.expires_at, roomData.created_at, roomData.updated_at
        ],
        transaction
      })

      // 创建者自动加入房间
      await sequelize.query(`
        INSERT INTO social_lottery_participants (
          room_id, user_id, contribution_points, role, joined_at
        ) VALUES (?, ?, ?, ?, ?)
      `, {
        replacements: [roomId, creatorId, 0, 'creator', new Date()],
        transaction
      })

      await transaction.commit()

      // 触发房间创建事件
      await EventBusService.emit('social_lottery_room_created', {
        roomId,
        creatorId,
        campaignId,
        roomData
      })

      // 广播新房间创建（如果是公开房间）
      if (!options.privateRoom) {
        WebSocketService.broadcastToLobby('new_social_room', {
          roomId,
          campaignName: campaign.name,
          creatorId,
          maxParticipants: roomData.max_participants,
          minContribution: roomData.min_contribution
        })
      }

      console.log(`✅ 社交抽奖房间创建成功: ${roomId}`)

      return {
        success: true,
        data: {
          roomId,
          room: roomData,
          joinUrl: `/social-lottery/rooms/${roomId}`,
          shareCode: roomId.substr(-8).toUpperCase()
        },
        message: '社交抽奖房间创建成功'
      }
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 创建社交抽奖房间失败:', error)
      return {
        success: false,
        error: 'CREATE_ROOM_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 加入社交抽奖房间 - 带分布式锁机制
   * @param {number} userId - 用户ID
   * @param {string} roomId - 房间ID
   * @param {number} contributionPoints - 贡献积分
   */
  async joinRoom (userId, roomId, contributionPoints) {
    // 分布式锁键名
    const lockKey = `room_lock:${roomId}`
    const lockValue = uuidv4()
    const lockTimeout = 5000 // 5秒锁超时

    try {
      // 获取分布式锁
      const lockAcquired = await this.redis.set(lockKey, lockValue, {
        PX: lockTimeout,
        NX: true
      })

      if (!lockAcquired) {
        return {
          success: false,
          error: 'ROOM_BUSY',
          message: '房间正在处理其他操作，请稍后重试'
        }
      }

      console.log(`🔐 获取房间锁成功: ${roomId}, 用户=${userId}`)

      const transaction = await sequelize.transaction()

      try {
        // 检查房间状态
        const [roomRows] = await sequelize.query(`
          SELECT * FROM social_lottery_rooms WHERE room_id = ?
        `, {
          replacements: [roomId],
          transaction
        })

        if (roomRows.length === 0) {
          await transaction.rollback()
          return {
            success: false,
            error: 'ROOM_NOT_FOUND',
            message: '房间不存在'
          }
        }

        const room = roomRows[0]

        // 检查房间状态
        if (room.status !== 'waiting') {
          await transaction.rollback()
          return {
            success: false,
            error: 'ROOM_NOT_AVAILABLE',
            message: '房间不可用或已开始抽奖'
          }
        }

        // 检查房间是否过期
        if (new Date() > new Date(room.expires_at)) {
          await transaction.rollback()
          return {
            success: false,
            error: 'ROOM_EXPIRED',
            message: '房间已过期'
          }
        }

        // 检查房间是否已满
        if (room.current_participants >= room.max_participants) {
          await transaction.rollback()
          return {
            success: false,
            error: 'ROOM_FULL',
            message: '房间已满'
          }
        }

        // 检查用户是否已在房间中
        const [existingMembers] = await sequelize.query(`
          SELECT * FROM social_lottery_participants WHERE room_id = ? AND user_id = ?
        `, {
          replacements: [roomId, userId],
          transaction
        })

        if (existingMembers.length > 0) {
          await transaction.rollback()
          return {
            success: false,
            error: 'ALREADY_JOINED',
            message: '您已在此房间中'
          }
        }

        // 验证贡献积分
        if (contributionPoints < room.min_contribution) {
          await transaction.rollback()
          return {
            success: false,
            error: 'INSUFFICIENT_CONTRIBUTION',
            message: `最少需要贡献${room.min_contribution}积分`
          }
        }

        // 验证用户积分余额
        const userPoints = await this.models.UserPointsAccount.findOne({
          where: { user_id: userId },
          transaction
        })

        if (!userPoints || userPoints.available_points < contributionPoints) {
          await transaction.rollback()
          return {
            success: false,
            error: 'INSUFFICIENT_POINTS',
            message: '积分余额不足'
          }
        }

        // 扣除积分(暂时冻结)
        await userPoints.update({
          available_points: userPoints.available_points - contributionPoints,
          frozen_points: userPoints.frozen_points + contributionPoints
        }, { transaction })

        // 加入房间
        await sequelize.query(`
          INSERT INTO social_lottery_participants (
            room_id, user_id, contribution_points, role, joined_at
          ) VALUES (?, ?, ?, ?, ?)
        `, {
          replacements: [roomId, userId, contributionPoints, 'participant', new Date()],
          transaction
        })

        // 更新房间参与者数量
        const newParticipantCount = room.current_participants + 1
        const newTotalContribution = room.total_contribution_points + contributionPoints

        await sequelize.query(`
          UPDATE social_lottery_rooms 
          SET current_participants = ?, total_contribution_points = ?, updated_at = ?
          WHERE room_id = ?
        `, {
          replacements: [newParticipantCount, newTotalContribution, new Date(), roomId],
          transaction
        })

        await transaction.commit()

        // 实时通知房间内所有用户
        WebSocketService.broadcastToRoom(roomId, 'user_joined', {
          userId,
          contributionPoints,
          currentParticipants: newParticipantCount,
          maxParticipants: room.max_participants,
          totalContribution: newTotalContribution
        })

        // 检查是否满足自动开始条件
        const settings = JSON.parse(room.settings)
        if (newParticipantCount >= room.max_participants && settings.auto_start) {
          // 异步执行抽奖，避免阻塞响应
          setImmediate(() => this.executeSocialDraw(roomId))
        }

        console.log(`✅ 用户${userId}成功加入房间${roomId}`)

        return {
          success: true,
          data: {
            roomId,
            participantCount: newParticipantCount,
            totalContribution: newTotalContribution,
            willAutoStart: newParticipantCount >= room.max_participants && settings.auto_start
          },
          message: '成功加入抽奖房间'
        }
      } catch (innerError) {
        await transaction.rollback()
        throw innerError
      }
    } catch (error) {
      console.error(`❌ 加入房间失败: ${error.message}`)
      return {
        success: false,
        error: 'JOIN_ROOM_FAILED',
        message: error.message
      }
    } finally {
      // 释放分布式锁
      try {
        const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `
        await this.redis.eval(script, {
          keys: [lockKey],
          arguments: [lockValue]
        })
        console.log(`🔓 释放房间锁: ${roomId}`)
      } catch (lockError) {
        console.error('释放锁失败:', lockError)
      }
    }
  }

  /**
   * 执行社交抽奖
   * @param {string} roomId - 房间ID
   */
  async executeSocialDraw (roomId) {
    const transaction = await sequelize.transaction()

    try {
      console.log(`🎲 开始执行社交抽奖: ${roomId}`)

      // 获取房间信息
      const [roomRows] = await sequelize.query(`
        SELECT * FROM social_lottery_rooms WHERE room_id = ?
      `, {
        replacements: [roomId],
        transaction
      })

      if (roomRows.length === 0) {
        await transaction.rollback()
        return { success: false, error: 'ROOM_NOT_FOUND' }
      }

      const room = roomRows[0]

      if (room.status !== 'waiting') {
        await transaction.rollback()
        return { success: false, error: 'ROOM_NOT_READY' }
      }

      // 更新房间状态为进行中
      await sequelize.query(`
        UPDATE social_lottery_rooms 
        SET status = 'active', updated_at = ?
        WHERE room_id = ?
      `, {
        replacements: [new Date(), roomId],
        transaction
      })

      // 获取房间所有参与者
      const [members] = await sequelize.query(`
        SELECT slm.*, u.username 
        FROM social_lottery_participants slm
        JOIN users u ON slm.user_id = u.user_id  
        WHERE slm.room_id = ?
        ORDER BY slm.joined_at
      `, {
        replacements: [roomId],
        transaction
      })

      // 为每个参与者执行抽奖
      const drawResults = []

      for (const member of members) {
        try {
          // 计算社交抽奖增强参数
          const socialBonus = {
            participantCount: members.length,
            contributionPoints: member.contribution_points,
            roomMultiplier: this.calculateRoomMultiplier(members.length),
            totalContribution: room.total_contribution_points
          }

          // 调用核心抽奖服务
          const drawResult = await LotteryService.executeDraw(
            member.user_id,
            room.campaign_id,
            {
              socialBonus: true,
              ...socialBonus
            },
            transaction
          )

          const result = {
            userId: member.user_id,
            username: member.username,
            contributionPoints: member.contribution_points,
            role: member.role,
            result: drawResult
          }

          drawResults.push(result)

          // 更新参与者抽奖结果
          await sequelize.query(`
            UPDATE social_lottery_participants 
            SET draw_result = ?, draw_completed = true
            WHERE room_id = ? AND user_id = ?
          `, {
            replacements: [JSON.stringify(drawResult), roomId, member.user_id],
            transaction
          })

          console.log(`✅ 用户${member.user_id}抽奖完成:`, drawResult.success ? '中奖' : '未中奖')
        } catch (drawError) {
          console.error(`❌ 用户${member.user_id}抽奖失败:`, drawError)
          drawResults.push({
            userId: member.user_id,
            username: member.username,
            contributionPoints: member.contribution_points,
            role: member.role,
            result: { success: false, error: 'DRAW_FAILED', message: drawError.message }
          })
        }
      }

      // 积分结算
      await this.settleSocialLotteryPoints(roomId, drawResults, transaction)

      // 更新房间状态为完成
      await sequelize.query(`
        UPDATE social_lottery_rooms 
        SET status = 'completed', completed_at = ?, draw_results = ?, updated_at = ?
        WHERE room_id = ?
      `, {
        replacements: [new Date(), JSON.stringify(drawResults), new Date(), roomId],
        transaction
      })

      await transaction.commit()

      // 实时通知抽奖结果
      const winnerCount = drawResults.filter(r => r.result.success && r.result.data?.prize).length

      WebSocketService.broadcastToRoom(roomId, 'lottery_completed', {
        results: drawResults,
        totalParticipants: members.length,
        winnerCount,
        roomStats: {
          totalContribution: room.total_contribution_points,
          roomMultiplier: this.calculateRoomMultiplier(members.length)
        }
      })

      // 发送业务事件
      await EventBusService.emit('social_lottery_completed', {
        roomId,
        campaignId: room.campaign_id,
        participants: members.length,
        results: drawResults,
        winnerCount
      })

      console.log(`🎉 社交抽奖完成: ${roomId}, 中奖人数: ${winnerCount}/${members.length}`)

      return {
        success: true,
        data: {
          roomId,
          results: drawResults,
          stats: {
            totalParticipants: members.length,
            totalContribution: room.total_contribution_points,
            winnerCount
          }
        },
        message: '社交抽奖执行完成'
      }
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 执行社交抽奖失败:', error)
      return {
        success: false,
        error: 'SOCIAL_DRAW_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 计算房间人数加成倍数
   * @param {number} participantCount - 参与人数
   */
  calculateRoomMultiplier (participantCount) {
    if (participantCount >= 8) return 2.0 // 8人+: 2.0倍
    if (participantCount >= 5) return 1.5 // 5-7人: 1.5倍
    if (participantCount >= 3) return 1.3 // 3-4人: 1.3倍
    if (participantCount >= 2) return 1.1 // 2人: 1.1倍
    return 1.0 // 1人: 无加成
  }

  /**
   * 社交抽奖积分结算
   * @param {string} roomId - 房间ID
   * @param {Array} drawResults - 抽奖结果
   * @param {object} transaction - 数据库事务
   */
  async settleSocialLotteryPoints (roomId, drawResults, transaction) {
    console.log(`💰 开始积分结算: ${roomId}`)

    for (const result of drawResults) {
      try {
        // 获取参与者信息
        const [memberRows] = await sequelize.query(`
          SELECT * FROM social_lottery_participants 
          WHERE room_id = ? AND user_id = ?
        `, {
          replacements: [roomId, result.userId],
          transaction
        })

        if (memberRows.length === 0) continue

        const member = memberRows[0]

        // 获取用户积分账户
        const userPoints = await this.models.UserPointsAccount.findOne({
          where: { user_id: result.userId },
          transaction
        })

        if (!userPoints) continue

        if (result.result.success && result.result.data?.prize) {
          // 中奖：解冻贡献积分，正常消费
          await userPoints.update({
            frozen_points: userPoints.frozen_points - member.contribution_points,
            total_spent: userPoints.total_spent + member.contribution_points
          }, { transaction })

          console.log(`✅ 中奖用户${result.userId}积分结算完成`)
        } else {
          // 未中奖：返还50%贡献积分作为安慰奖
          const refundAmount = Math.floor(member.contribution_points * 0.5)
          const actualSpent = member.contribution_points - refundAmount

          await userPoints.update({
            available_points: userPoints.available_points + refundAmount,
            frozen_points: userPoints.frozen_points - member.contribution_points,
            total_spent: userPoints.total_spent + actualSpent
          }, { transaction })

          console.log(`🎁 未中奖用户${result.userId}返还积分: ${refundAmount}`)
        }
      } catch (error) {
        console.error(`❌ 用户${result.userId}积分结算失败:`, error)
      }
    }
  }

  /**
   * 获取房间详情
   * @param {string} roomId - 房间ID
   */
  async getRoomDetails (roomId) {
    try {
      const [roomRows] = await sequelize.query(`
        SELECT slc.*, lc.name as campaign_name, lc.description as campaign_description,
               u.username as creator_name
        FROM social_lottery_rooms slc
        JOIN lottery_campaigns lc ON slc.campaign_id = lc.campaign_id
        JOIN users u ON slc.creator_user_id = u.user_id
        WHERE slc.room_id = ?
      `)

      if (roomRows.length === 0) {
        return {
          success: false,
          error: 'ROOM_NOT_FOUND',
          message: '房间不存在'
        }
      }

      const room = roomRows[0]

      // 获取参与者列表
      const [members] = await sequelize.query(`
        SELECT slm.*, u.username, u.avatar
        FROM social_lottery_participants slm
        JOIN users u ON slm.user_id = u.user_id
        WHERE slm.room_id = ?
        ORDER BY slm.joined_at
      `, {
        replacements: [roomId]
      })

      return {
        success: true,
        data: {
          room: {
            ...room,
            settings: JSON.parse(room.settings || '{}'),
            draw_results: room.draw_results ? JSON.parse(room.draw_results) : null
          },
          members
        }
      }
    } catch (error) {
      console.error('❌ 获取房间详情失败:', error)
      return {
        success: false,
        error: 'GET_ROOM_FAILED',
        message: error.message
      }
    }
  }

  /**
   * 清理过期房间
   */
  async cleanupExpiredRooms () {
    try {
      const [expiredRooms] = await sequelize.query(`
        SELECT room_id FROM social_lottery_rooms 
        WHERE status = 'waiting' AND expires_at < NOW()
      `)

      for (const room of expiredRooms) {
        await this.cancelRoom(room.room_id, 'EXPIRED')
      }

      console.log(`🧹 清理过期房间: ${expiredRooms.length}个`)
    } catch (error) {
      console.error('❌ 清理过期房间失败:', error)
    }
  }

  /**
   * 取消房间
   * @param {string} roomId - 房间ID
   * @param {string} reason - 取消原因
   */
  async cancelRoom (roomId, reason = 'CANCELLED') {
    const transaction = await sequelize.transaction()

    try {
      // 更新房间状态
      await sequelize.query(`
        UPDATE social_lottery_rooms 
        SET status = 'cancelled', updated_at = ?
        WHERE room_id = ? AND status = 'waiting'
      `, {
        replacements: [new Date(), roomId],
        transaction
      })

      // 退还所有参与者的积分
      const [members] = await sequelize.query(`
        SELECT * FROM social_lottery_participants WHERE room_id = ?
      `, {
        replacements: [roomId],
        transaction
      })

      for (const member of members) {
        if (member.contribution_points > 0) {
          const userPoints = await this.models.UserPointsAccount.findOne({
            where: { user_id: member.user_id },
            transaction
          })

          if (userPoints) {
            await userPoints.update({
              available_points: userPoints.available_points + member.contribution_points,
              frozen_points: userPoints.frozen_points - member.contribution_points
            }, { transaction })
          }
        }
      }

      await transaction.commit()

      // 通知房间成员
      WebSocketService.broadcastToRoom(roomId, 'room_cancelled', {
        reason,
        message: reason === 'EXPIRED' ? '房间已过期' : '房间已取消'
      })

      console.log(`🚫 房间已取消: ${roomId}, 原因: ${reason}`)
    } catch (error) {
      await transaction.rollback()
      console.error(`❌ 取消房间失败: ${error.message}`)
    }
  }
}

module.exports = new SocialLotteryService()
