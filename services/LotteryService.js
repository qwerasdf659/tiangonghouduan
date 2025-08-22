/**
 * 🔥 抽奖系统核心服务 v3 - 全新分离式架构
 * 创建时间：2025年08月19日 UTC
 * 更新时间：2025年08月21日 - 扩展连抽、多池、条件抽奖功能
 * 特点：与积分系统完全分离 + 事件驱动 + 独立业务逻辑
 * 功能：抽奖活动管理、奖品管理、抽奖执行、统计分析、连抽系统、多池系统
 */

'use strict'

const { LotteryCampaign, LotteryPrize, LotteryDraw, PrizeDistribution } = require('../models')
// const BusinessEvent = require('../models').BusinessEvent // 暂时注释，后续实现时使用
const PointsSystemService = require('./PointsSystemService')
const EventBusService = require('./EventBusService')
const { Op } = require('sequelize')
const { v4: uuidv4 } = require('uuid')

class LotteryService {
  /**
   * 🔥 抽奖活动管理
   */

  /**
   * 获取用户可参与的抽奖活动列表
   * @param {number} userId - 用户ID
   * @param {object} options - 筛选选项
   * @returns {object} 活动列表和统计信息
   */
  static async getAvailableCampaigns (userId, options = {}) {
    try {
      const whereClause = {
        status: 'active',
        is_active: true,
        start_time: { [Op.lte]: new Date() },
        end_time: { [Op.gte]: new Date() }
      }

      // 如果指定了类型筛选，添加类型条件
      if (options.type === 'pool') {
        whereClause.campaign_type = { [Op.like]: 'pool_%' }
      } else if (options.levelFilter) {
        // 等级筛选
        const levelOrder = ['bronze', 'silver', 'gold', 'diamond']
        const userLevelIndex = levelOrder.indexOf(options.levelFilter)
        whereClause[Op.or] = [
          { required_level: null },
          { required_level: { [Op.in]: levelOrder.slice(0, userLevelIndex + 1) } }
        ]
      }

      const campaigns = await LotteryCampaign.findAll({
        where: whereClause,
        include: [
          {
            model: LotteryPrize,
            as: 'prizes',
            where: { is_active: true },
            required: false
          }
        ],
        order: [
          ['is_featured', 'DESC'],
          ['created_at', 'DESC']
        ]
      })

      // 为每个活动添加用户参与统计
      const campaignsWithStats = await Promise.all(
        campaigns.map(async (campaign) => {
          const userDrawCount = await this.getUserDrawCountInCampaign(userId, campaign.campaign_id)
          const remainingDraws = campaign.max_draws_per_user_daily
            ? Math.max(0, campaign.max_draws_per_user_daily - userDrawCount)
            : '无限制'

          return {
            ...campaign.toJSON(),
            user_stats: {
              draws_today: userDrawCount,
              remaining_draws: remainingDraws,
              can_draw: remainingDraws === '无限制' || remainingDraws > 0
            }
          }
        })
      )

      return {
        success: true,
        data: {
          campaigns: campaignsWithStats,
          total_count: campaignsWithStats.length,
          active_count: campaignsWithStats.filter(c => c.user_stats.can_draw).length
        }
      }
    } catch (error) {
      console.error('获取可用活动失败:', error)
      return {
        success: false,
        error: 'FETCH_CAMPAIGNS_ERROR',
        message: '获取抽奖活动失败: ' + error.message
      }
    }
  }

  /**
   * 获取指定抽奖活动的详细信息
   * @param {number} campaignId - 活动ID
   * @param {number} userId - 用户ID
   * @returns {object} 活动详情
   */
  static async getCampaignDetail (campaignId, userId) {
    try {
      const campaign = await LotteryCampaign.findByPk(campaignId, {
        include: [
          {
            model: LotteryPrize,
            as: 'prizes',
            where: { is_activity: true }, // 修复字段名：is_active -> is_activity
            required: false,
            order: [['probability', 'DESC']]
          }
        ]
      })

      if (!campaign) {
        return {
          success: false,
          error: 'CAMPAIGN_NOT_FOUND',
          message: '抽奖活动不存在'
        }
      }

      // 检查活动是否可参与
      const now = new Date()
      if (now < campaign.start_time || now > campaign.end_time) {
        return {
          success: false,
          error: 'CAMPAIGN_NOT_ACTIVE',
          message: '抽奖活动不在有效期内'
        }
      }

      // 获取用户参与统计
      const userDrawsToday = await LotteryDraw.count({
        where: {
          user_id: userId,
          campaign_id: campaignId,
          created_at: {
            [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      })

      // 获取活动总体统计
      const totalParticipants = await LotteryDraw.count({
        where: { campaign_id: campaignId },
        distinct: true,
        col: 'user_id'
      })

      const totalDraws = await LotteryDraw.count({
        where: { campaign_id: campaignId }
      })

      const totalWinners = await LotteryDraw.count({
        where: {
          campaign_id: campaignId,
          is_winner: true
        }
      })

      const campaignData = campaign.toJSON()
      campaignData.user_stats = {
        draws_today: userDrawsToday,
        remaining_draws: Math.max(0, campaign.max_draws_per_user_daily - userDrawsToday),
        can_draw: userDrawsToday < campaign.max_draws_per_user_daily
      }
      campaignData.campaign_stats = {
        total_participants: totalParticipants,
        total_draws: totalDraws,
        total_winners: totalWinners,
        win_rate: totalDraws > 0 ? ((totalWinners / totalDraws) * 100).toFixed(2) : 0
      }

      return {
        success: true,
        campaign: campaignData
      }
    } catch (error) {
      console.error('获取抽奖活动详情失败:', error)
      return {
        success: false,
        error: 'GET_CAMPAIGN_DETAIL_FAILED',
        message: '获取活动详情失败'
      }
    }
  }

  /**
   * 🔥 抽奖执行核心逻辑
   */

  /**
   * 执行抽奖操作
   * @param {number} userId - 用户ID
   * @param {number} campaignId - 活动ID
   * @param {object} options - 抽奖选项
   * @returns {object} 抽奖结果
   */
  static async executeDraw (userId, campaignId, options = {}) {
    try {
      // 🔥 第一步：验证活动有效性
      const campaign = await LotteryCampaign.findByPk(campaignId, {
        include: [
          {
            model: LotteryPrize,
            as: 'prizes',
            where: { is_activity: true }, // 修复字段名：is_active -> is_activity
            required: false,
            order: [['probability', 'ASC']]
          }
        ]
      })

      if (!campaign || !campaign.is_active) {
        return {
          success: false,
          error: 'CAMPAIGN_NOT_AVAILABLE',
          message: '抽奖活动不可用'
        }
      }

      // 检查活动时间
      const now = new Date()
      if (now < campaign.start_time || now > campaign.end_time) {
        return {
          success: false,
          error: 'CAMPAIGN_TIME_INVALID',
          message: '抽奖活动不在有效期内'
        }
      }

      // 🔥 第二步：检查用户抽奖次数限制
      const userDrawsToday = await LotteryDraw.count({
        where: {
          user_id: userId,
          campaign_id: campaignId,
          created_at: {
            [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      })

      if (userDrawsToday >= campaign.max_draws_per_user_daily) {
        return {
          success: false,
          error: 'DAILY_LIMIT_EXCEEDED',
          message: `每日最多可抽奖${campaign.max_draws_per_user_daily}次`,
          details: {
            draws_today: userDrawsToday,
            daily_limit: campaign.max_draws_per_user_daily
          }
        }
      }

      // 🔥 第三步：验证并扣除积分（通过事件总线与积分系统通信）
      let pointsResult
      if (campaign.cost_per_draw > 0) {
        pointsResult = await PointsSystemService.consumePoints(userId, campaign.cost_per_draw, {
          source: 'lottery_draw',
          source_id: campaignId,
          description: `参与抽奖活动：${campaign.campaign_name}`
        })

        if (!pointsResult.success) {
          return {
            success: false,
            error: 'INSUFFICIENT_POINTS',
            message: pointsResult.message || '积分不足',
            details: {
              required_points: campaign.cost_per_draw,
              user_points: pointsResult.current_points || 0
            }
          }
        }
      }

      // 🔥 第四步：执行抽奖算法
      const drawResult = await this._executeLotteryAlgorithm(campaign, userId)

      // 🔥 第五步：记录抽奖结果
      const drawRecord = await LotteryDraw.create({
        user_id: userId,
        campaign_id: campaignId,
        campaign_code: options.campaign_code || campaign.campaign_code,
        draw_time: new Date(),
        is_winner: drawResult.isWinner,
        prize_id: drawResult.prize ? drawResult.prize.prize_id : null,
        points_consumed: campaign.cost_per_draw,
        draw_details: JSON.stringify({
          algorithm_result: drawResult.algorithmDetails,
          user_draws_today: userDrawsToday + 1,
          event_source: options.event_source || 'user_request'
        })
      })

      // 🔥 第六步：如果中奖，处理奖品分发
      let prizeDistribution = null
      if (drawResult.isWinner && drawResult.prize) {
        prizeDistribution = await PrizeDistribution.create({
          user_id: userId,
          prize_id: drawResult.prize.prize_id,
          draw_id: drawRecord.draw_id,
          campaign_id: campaignId,
          status: 'pending',
          distribution_time: new Date(),
          expiry_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7天后过期
          distribution_details: JSON.stringify({
            prize_type: drawResult.prize.prize_type,
            prize_value: drawResult.prize.prize_value,
            auto_distribution: drawResult.prize.prize_type === 'points'
          })
        })

        // 如果是积分奖品，自动发放
        if (drawResult.prize.prize_type === 'points') {
          const pointsGrantResult = await PointsSystemService.addPoints(
            userId,
            parseFloat(drawResult.prize.prize_value),
            {
              source: 'lottery_prize',
              source_id: drawRecord.draw_id,
              description: `抽奖获得奖品：${drawResult.prize.prize_name}`
            }
          )

          if (pointsGrantResult.success) {
            await prizeDistribution.update({
              status: 'distributed',
              actual_distribution_time: new Date()
            })
          }
        }
      }

      // 🔥 第七步：发送事件通知（事件总线）
      await EventBusService.emit('lottery:draw_completed', {
        user_id: userId,
        campaign_id: campaignId,
        draw_id: drawRecord.draw_id,
        is_winner: drawResult.isWinner,
        prize_id: drawResult.prize ? drawResult.prize.prize_id : null,
        points_consumed: campaign.cost_per_draw,
        timestamp: new Date().toISOString()
      })

      // 🔥 返回完整的抽奖结果
      return {
        success: true,
        draw: drawRecord.toJSON(),
        campaign: {
          campaign_id: campaign.campaign_id,
          campaign_name: campaign.campaign_name,
          campaign_type: campaign.campaign_type
        },
        prize: drawResult.prize,
        prize_distribution: prizeDistribution ? prizeDistribution.toJSON() : null,
        points_remaining: pointsResult ? pointsResult.remaining_points : null
      }
    } catch (error) {
      console.error('执行抽奖失败:', error)
      return {
        success: false,
        error: 'LOTTERY_EXECUTION_FAILED',
        message: '抽奖执行失败，请稍后重试'
      }
    }
  }

  /**
   * 🔥 抽奖算法核心实现
   * @param {object} campaign - 抽奖活动信息
   * @param {number} userId - 用户ID
   * @returns {object} 抽奖结果
   */
  static async _executeLotteryAlgorithm (campaign, userId) {
    try {
      const prizes = campaign.prizes || []
      if (prizes.length === 0) {
        return {
          isWinner: false,
          prize: null,
          algorithmDetails: { reason: 'no_prizes_available' }
        }
      }

      // 🔥 概率抽奖算法
      const random = Math.random() * 100 // 0-100的随机数
      let cumulativeProbability = 0

      console.log(`🎲 抽奖算法执行: 用户ID=${userId}, 随机数=${random.toFixed(4)}`)

      for (const prize of prizes) {
        cumulativeProbability += parseFloat(prize.probability)

        console.log(
          `🎯 检查奖品: ${prize.prize_name}, 概率=${prize.probability}%, 累计概率=${cumulativeProbability.toFixed(4)}%`
        )

        if (random <= cumulativeProbability) {
          // 🔥 中奖！检查库存
          if (prize.stock_quantity > 0) {
            // 扣除库存
            await LotteryPrize.update(
              { stock_quantity: prize.stock_quantity - 1 },
              { where: { prize_id: prize.prize_id } }
            )

            console.log(
              `🎉 中奖结果: 奖品=${prize.prize_name}, 剩余库存=${prize.stock_quantity - 1}`
            )

            return {
              isWinner: true,
              prize: prize.toJSON(),
              algorithmDetails: {
                random_number: random,
                winning_probability: cumulativeProbability,
                prize_probability: prize.probability,
                algorithm: 'cumulative_probability'
              }
            }
          } else {
            console.log(`📦 库存不足: 奖品=${prize.prize_name}, 库存=${prize.stock_quantity}`)
            // 库存不足，继续下一个奖品
            continue
          }
        }
      }

      // 未中奖
      console.log(
        `😔 未中奖: 随机数=${random.toFixed(4)}, 总概率=${cumulativeProbability.toFixed(4)}%`
      )

      return {
        isWinner: false,
        prize: null,
        algorithmDetails: {
          random_number: random,
          total_probability: cumulativeProbability,
          algorithm: 'cumulative_probability'
        }
      }
    } catch (error) {
      console.error('抽奖算法执行失败:', error)
      return {
        isWinner: false,
        prize: null,
        algorithmDetails: { error: error.message }
      }
    }
  }

  /**
   * 🔥 用户抽奖记录管理
   */

  /**
   * 获取用户抽奖历史记录
   * @param {number} userId - 用户ID
   * @param {object} options - 查询选项
   * @returns {object} 抽奖记录列表
   */
  static async getUserDrawHistory (userId, options = {}) {
    try {
      const { page = 1, limit = 20, campaign_id, is_winner } = options

      const whereClause = { user_id: userId }
      if (campaign_id) whereClause.campaign_id = campaign_id
      if (is_winner !== null) whereClause.is_winner = is_winner

      const { count, rows } = await LotteryDraw.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: LotteryCampaign,
            as: 'campaign',
            attributes: ['campaign_name', 'campaign_type']
          },
          {
            model: LotteryPrize,
            as: 'prize',
            required: false,
            attributes: ['prize_name', 'prize_type', 'prize_value']
          },
          {
            model: PrizeDistribution,
            as: 'prizeDistribution',
            required: false,
            attributes: ['status', 'distribution_time', 'actual_distribution_time']
          }
        ],
        order: [['draw_time', 'DESC']],
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit)
      })

      // 计算统计信息
      const totalDraws = await LotteryDraw.count({ where: { user_id: userId } })
      const totalWins = await LotteryDraw.count({ where: { user_id: userId, is_winner: true } })
      const totalPointsConsumed = await LotteryDraw.sum('points_consumed', {
        where: { user_id: userId }
      })

      return {
        success: true,
        draws: rows,
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / parseInt(limit)),
        statistics: {
          total_draws: totalDraws,
          total_wins: totalWins,
          win_rate: totalDraws > 0 ? ((totalWins / totalDraws) * 100).toFixed(2) : 0,
          total_points_consumed: totalPointsConsumed || 0
        }
      }
    } catch (error) {
      console.error('获取用户抽奖记录失败:', error)
      return {
        success: false,
        error: 'GET_USER_DRAW_HISTORY_FAILED',
        message: '获取抽奖记录失败'
      }
    }
  }

  /**
   * 🔥 奖品管理
   */

  /**
   * 获取奖品列表
   * @param {object} options - 查询选项
   * @returns {object} 奖品列表
   */
  static async getPrizesList (options = {}) {
    try {
      const { campaign_id, prize_type, is_active } = options

      const whereClause = {}
      if (campaign_id) whereClause.campaign_id = campaign_id
      if (prize_type) whereClause.prize_type = prize_type
      if (is_active !== null) whereClause.is_active = is_active

      const prizes = await LotteryPrize.findAll({
        where: whereClause,
        include: [
          {
            model: LotteryCampaign,
            as: 'campaign',
            attributes: ['campaign_name', 'campaign_status']
          }
        ],
        order: [
          ['probability', 'DESC'],
          ['created_at', 'DESC']
        ]
      })

      // 计算统计信息
      const totalPrizes = prizes.length
      const activePrizes = prizes.filter(p => p.is_active).length
      const totalValue = prizes.reduce((sum, prize) => {
        return sum + (prize.prize_type === 'points' ? parseFloat(prize.prize_value) : 0)
      }, 0)

      return {
        success: true,
        prizes,
        statistics: {
          total_prizes: totalPrizes,
          active_prizes: activePrizes,
          total_points_value: totalValue
        }
      }
    } catch (error) {
      console.error('获取奖品列表失败:', error)
      return {
        success: false,
        error: 'GET_PRIZES_LIST_FAILED',
        message: '获取奖品列表失败'
      }
    }
  }

  /**
   * 🔥 管理员功能
   */

  /**
   * 创建抽奖活动
   * @param {object} campaignData - 活动数据
   * @param {object} options - 创建选项
   * @returns {object} 创建结果
   */
  static async createCampaign (campaignData, options = {}) {
    try {
      // 验证活动代码唯一性
      const existingCampaign = await LotteryCampaign.findOne({
        where: { campaign_code: campaignData.campaign_code }
      })

      if (existingCampaign) {
        return {
          success: false,
          error: 'CAMPAIGN_CODE_EXISTS',
          message: '活动代码已存在'
        }
      }

      // 创建活动
      const campaign = await LotteryCampaign.create({
        ...campaignData,
        status: 'active', // 修复字段名：is_active -> status，campaign_status -> status
        created_by: options.created_by,
        created_at: new Date(),
        updated_at: new Date()
      })

      // 记录创建事件
      await EventBusService.emit('lottery:campaign_created', {
        campaign_id: campaign.campaign_id,
        campaign_name: campaign.campaign_name,
        created_by: options.created_by,
        timestamp: new Date().toISOString()
      })

      return {
        success: true,
        campaign: campaign.toJSON()
      }
    } catch (error) {
      console.error('创建抽奖活动失败:', error)
      return {
        success: false,
        error: 'CREATE_CAMPAIGN_FAILED',
        message: '创建抽奖活动失败'
      }
    }
  }

  /**
   * 更新抽奖活动
   * @param {number} campaignId - 活动ID
   * @param {object} updateData - 更新数据
   * @param {object} options - 更新选项
   * @returns {object} 更新结果
   */
  static async updateCampaign (campaignId, updateData, options = {}) {
    try {
      const campaign = await LotteryCampaign.findByPk(campaignId)
      if (!campaign) {
        return {
          success: false,
          error: 'CAMPAIGN_NOT_FOUND',
          message: '抽奖活动不存在'
        }
      }

      // 更新活动
      await campaign.update({
        ...updateData,
        updated_by: options.updated_by,
        updated_at: new Date()
      })

      // 记录更新事件
      await EventBusService.emit('lottery:campaign_updated', {
        campaign_id: campaignId,
        updated_fields: Object.keys(updateData),
        updated_by: options.updated_by,
        timestamp: new Date().toISOString()
      })

      return {
        success: true,
        campaign: campaign.toJSON()
      }
    } catch (error) {
      console.error('更新抽奖活动失败:', error)
      return {
        success: false,
        error: 'UPDATE_CAMPAIGN_FAILED',
        message: '更新抽奖活动失败'
      }
    }
  }

  /**
   * 🔥 统计分析
   */

  /**
   * 获取抽奖系统统计信息
   * @param {object} options - 统计选项
   * @returns {object} 统计数据
   */
  static async getLotteryStatistics (options = {}) {
    try {
      const { time_range = '7d', campaign_id } = options

      // 计算时间范围
      const endTime = new Date()
      let startTime
      switch (time_range) {
      case '1d':
        startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000)
        break
      case '7d':
        startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        startTime = new Date(endTime.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      default:
        startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000)
      }

      const timeFilter = {
        created_at: {
          [Op.gte]: startTime,
          [Op.lte]: endTime
        }
      }

      if (campaign_id) {
        timeFilter.campaign_id = campaign_id
      }

      // 基础统计
      const totalDraws = await LotteryDraw.count({ where: timeFilter })
      const totalWinners = await LotteryDraw.count({ where: { ...timeFilter, is_winner: true } })
      const uniqueParticipants = await LotteryDraw.count({
        where: timeFilter,
        distinct: true,
        col: 'user_id'
      })
      const totalPointsConsumed = await LotteryDraw.sum('points_consumed', { where: timeFilter })

      // 每日统计
      const dailyStats = await LotteryDraw.findAll({
        where: timeFilter,
        attributes: [
          [LotteryDraw.sequelize.fn('DATE', LotteryDraw.sequelize.col('created_at')), 'date'],
          [LotteryDraw.sequelize.fn('COUNT', '*'), 'total_draws'],
          [
            LotteryDraw.sequelize.fn(
              'SUM',
              LotteryDraw.sequelize.literal('CASE WHEN is_winner = true THEN 1 ELSE 0 END')
            ),
            'winners'
          ],
          [
            LotteryDraw.sequelize.fn(
              'COUNT',
              LotteryDraw.sequelize.fn('DISTINCT', LotteryDraw.sequelize.col('user_id'))
            ),
            'participants'
          ]
        ],
        group: [LotteryDraw.sequelize.fn('DATE', LotteryDraw.sequelize.col('created_at'))],
        order: [[LotteryDraw.sequelize.fn('DATE', LotteryDraw.sequelize.col('created_at')), 'ASC']]
      })

      // 活动排行
      const campaignRanking = await LotteryDraw.findAll({
        where: timeFilter,
        include: [
          {
            model: LotteryCampaign,
            as: 'campaign',
            attributes: ['campaign_name']
          }
        ],
        attributes: [
          'campaign_id',
          [LotteryDraw.sequelize.fn('COUNT', '*'), 'total_draws'],
          [
            LotteryDraw.sequelize.fn(
              'COUNT',
              LotteryDraw.sequelize.fn('DISTINCT', LotteryDraw.sequelize.col('user_id'))
            ),
            'participants'
          ]
        ],
        group: ['campaign_id'],
        order: [[LotteryDraw.sequelize.fn('COUNT', '*'), 'DESC']],
        limit: 10
      })

      return {
        success: true,
        statistics: {
          summary: {
            total_draws: totalDraws,
            total_winners: totalWinners,
            unique_participants: uniqueParticipants,
            win_rate: totalDraws > 0 ? ((totalWinners / totalDraws) * 100).toFixed(2) : 0,
            total_points_consumed: totalPointsConsumed || 0,
            time_range,
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString()
          },
          daily_trends: dailyStats,
          campaign_ranking: campaignRanking
        }
      }
    } catch (error) {
      console.error('获取抽奖统计失败:', error)
      return {
        success: false,
        error: 'GET_LOTTERY_STATISTICS_FAILED',
        message: '获取抽奖统计失败'
      }
    }
  }

  /**
   * 🔥 连抽系统 - 核心功能扩展
   * 连续抽奖功能，支持5/10/20连抽并提供折扣优惠
   * @param {number} userId - 用户ID
   * @param {number} campaignId - 活动ID
   * @param {number} drawCount - 抽奖次数 (5, 10, 20)
   * @param {object} options - 额外选项
   * @returns {object} 连抽结果
   */
  static async performMultipleDraw (userId, campaignId, drawCount, _options = {}) {
    console.log(`🎯 开始${drawCount}连抽 - 用户:${userId}, 活动:${campaignId}`)

    // 输入验证
    const allowedCounts = [5, 10, 20]
    if (!allowedCounts.includes(drawCount)) {
      throw new Error(`连抽次数只支持: ${allowedCounts.join(', ')}`)
    }

    const transaction = await require('../models').sequelize.transaction()

    try {
      // 1. 检查活动状态 (复用现有方法)
      const campaign = await LotteryCampaign.findByPk(campaignId)
      if (!campaign || campaign.status !== 'active') {
        throw new Error('活动不存在或已结束')
      }

      // 2. 计算连抽折扣 (简化规则，无需AI)
      const discountRates = {
        5: 0.95, // 5连抽 5%折扣
        10: 0.85, // 10连抽 15%折扣
        20: 0.70 // 20连抽 30%折扣
      }
      const discountRate = discountRates[drawCount]

      // 3. 计算总消耗积分
      const singleCost = parseFloat(campaign.cost_per_draw)
      const totalCost = Math.floor(singleCost * drawCount * discountRate)

      console.log(`💰 连抽成本计算: 单次${singleCost} × ${drawCount} × ${discountRate} = ${totalCost}`)

      // 4. 检查用户积分 (复用现有方法)
      const userAccount = await PointsSystemService.getUserPointsAccount(userId)
      if (!userAccount.success || userAccount.data.available_points < totalCost) {
        throw new Error(`积分不足，需要${totalCost}积分，当前${userAccount.data.available_points || 0}积分`)
      }

      // 5. 生成批次ID
      const batchId = `batch_${Date.now()}_${uuidv4().substr(0, 8)}`

      // 6. 执行连续抽奖
      const results = []
      for (let i = 0; i < drawCount; i++) {
        console.log(`🎲 执行第${i + 1}/${drawCount}次抽奖`)

        // 复用现有单次抽奖逻辑，添加批次信息
        const drawResult = await this._performSingleDrawInBatch(userId, campaignId, {
          transaction,
          batchInfo: {
            batch_id: batchId,
            batch_size: drawCount,
            batch_index: i,
            discount_applied: discountRate
          }
        })

        results.push(drawResult)
      }

      // 7. 统一扣除积分 (使用现有积分系统)
      const pointsResult = await PointsSystemService.consumePoints(userId, totalCost, {
        source: 'lottery_multi_draw',
        description: `${drawCount}连抽消费`,
        metadata: {
          batch_id: batchId,
          draw_count: drawCount,
          discount_rate: discountRate,
          campaign_id: campaignId
        }
      })

      if (!pointsResult.success) {
        throw new Error(pointsResult.message || '积分扣除失败')
      }

      // 8. 触发事件 (利用现有事件总线)
      await EventBusService.emit('lottery:multi_draw_completed', {
        user_id: userId,
        campaign_id: campaignId,
        batch_id: batchId,
        draw_count: drawCount,
        total_cost: totalCost,
        results
      })

      await transaction.commit()

      console.log(`✅ ${drawCount}连抽完成 - 批次:${batchId}`)

      return {
        success: true,
        batch_id: batchId,
        draw_count: drawCount,
        total_cost: totalCost,
        discount_rate: discountRate,
        results,
        summary: this._generateDrawSummary(results)
      }
    } catch (error) {
      await transaction.rollback()
      console.error(`❌ ${drawCount}连抽失败:`, error.message)
      throw error
    }
  }

  /**
   * 批次中的单次抽奖 - 内部方法
   * @param {number} userId - 用户ID
   * @param {number} campaignId - 活动ID
   * @param {object} options - 选项
   * @returns {object} 抽奖结果
   */
  static async _performSingleDrawInBatch (userId, campaignId, options = {}) {
    const { transaction, batchInfo } = options
    const campaign = await LotteryCampaign.findByPk(campaignId)

    // 执行抽奖算法
    const drawResult = await this._executeLotteryAlgorithm(campaign, userId)

    // 记录抽奖结果（包含批次信息）
    const drawRecord = await LotteryDraw.create({
      user_id: userId,
      campaign_id: campaignId,
      campaign_code: campaign.campaign_code,
      draw_time: new Date(),
      is_winner: drawResult.isWinner,
      prize_id: drawResult.prize ? drawResult.prize.prize_id : null,
      points_consumed: 0, // 批次中单次不记录积分消费，由批次统一处理
      batch_id: batchInfo.batch_id,
      batch_size: batchInfo.batch_size,
      batch_index: batchInfo.batch_index,
      discount_applied: batchInfo.discount_applied,
      draw_details: JSON.stringify({
        algorithm_result: drawResult.algorithmDetails,
        batch_info: batchInfo,
        event_source: 'multi_draw_batch'
      })
    }, { transaction })

    // 如果中奖，处理奖品分发
    let prizeDistribution = null
    if (drawResult.isWinner && drawResult.prize) {
      prizeDistribution = await PrizeDistribution.create({
        user_id: userId,
        prize_id: drawResult.prize.prize_id,
        campaign_id: campaignId,
        distribution_method: 'auto',
        distribution_status: 'pending',
        distribution_data: JSON.stringify({
          source: 'multi_draw_batch',
          batch_id: batchInfo.batch_id,
          batch_index: batchInfo.batch_index
        })
      }, { transaction })
    }

    return {
      draw_id: drawRecord.draw_id,
      is_winner: drawResult.isWinner,
      prize: drawResult.prize,
      batch_info: batchInfo,
      prize_distribution: prizeDistribution
    }
  }

  /**
   * 生成抽奖结果摘要
   * @param {Array} results - 抽奖结果数组
   * @returns {object} 摘要信息
   */
  static _generateDrawSummary (results) {
    const summary = {
      total_draws: results.length,
      prizes_won: results.filter(r => r.is_winner).length,
      win_rate: 0,
      rarity_stats: {
        common: 0,
        rare: 0,
        epic: 0,
        legendary: 0
      }
    }

    summary.win_rate = summary.total_draws > 0 ? (summary.prizes_won / summary.total_draws * 100).toFixed(1) + '%' : '0%'

    // 统计稀有度分布
    results.forEach(result => {
      if (result.is_winner && result.prize) {
        const rarity = result.prize.rarity || 'common'
        summary.rarity_stats[rarity]++
      }
    })

    return summary
  }

  /**
   * 🎱 多池系统 - 获取用户可访问的抽奖池
   * @param {number} userId - 用户ID
   * @returns {object} 池列表和用户信息
   */
  static async getAvailablePools (userId) {
    try {
      // 1. 获取用户账户信息 (复用现有方法)
      const userAccount = await PointsSystemService.getUserPointsAccount(userId)
      if (!userAccount.success) {
        throw new Error('无法获取用户积分账户信息')
      }

      const userLevel = userAccount.data.account_level
      const totalEarned = userAccount.data.total_earned

      console.log(`🎱 查询用户${userId}可用池, 等级:${userLevel}, 总积分:${totalEarned}`)

      // 2. 等级优先级映射
      const levelPriority = {
        bronze: 1,
        silver: 2,
        gold: 3,
        diamond: 4
      }

      const userLevelPriority = levelPriority[userLevel] || 1

      // 3. 查询所有活跃的池 (复用现有查询逻辑)
      const allPools = await LotteryCampaign.findAll({
        where: {
          campaign_type: { [Op.like]: 'pool_%' },
          status: 'active',
          is_active: true
        },
        include: [
          {
            model: LotteryPrize,
            as: 'prizes',
            where: { is_active: true },
            required: false
          }
        ],
        order: [['cost_per_draw', 'ASC']]
      })

      // 4. 过滤用户可访问的池
      const availablePools = []

      for (const pool of allPools) {
        const poolLevelPriority = levelPriority[pool.required_level] || 1

        // 等级检查
        if (userLevelPriority < poolLevelPriority) {
          continue // 等级不足，跳过
        }

        // 新手池特殊检查
        if (pool.campaign_type === 'pool_newbie') {
          const rules = pool.pool_rules || {}

          // 检查总积分限制
          if (rules.user_limit_condition === 'total_earned < 100' && totalEarned >= 100) {
            continue // 不再是新手，跳过
          }

          // 检查注册时间限制 (如果有的话)
          if (rules.time_limit_days) {
            const userCreatedAt = new Date(userAccount.data.created_at)
            const daysSinceRegister = Math.floor((Date.now() - userCreatedAt.getTime()) / (1000 * 60 * 60 * 24))

            if (daysSinceRegister > rules.time_limit_days) {
              continue // 超过新手期，跳过
            }
          }
        }

        // 5. 添加池状态信息
        const userDrawCount = await this.getUserDrawCountInCampaign(userId, pool.campaign_id)
        const poolInfo = {
          ...pool.toJSON(),
          access_status: 'available',
          user_draw_count: userDrawCount,
          remaining_draws: pool.max_draws_per_user_daily
            ? Math.max(0, pool.max_draws_per_user_daily - userDrawCount)
            : '无限制'
        }

        availablePools.push(poolInfo)
      }

      console.log(`🎱 用户${userId}可访问${availablePools.length}个池`)

      return {
        success: true,
        pools: availablePools,
        user_info: {
          level: userLevel,
          total_earned: totalEarned,
          available_points: userAccount.data.available_points
        }
      }
    } catch (error) {
      console.error('获取可用池失败:', error)
      throw error
    }
  }

  /**
   * 🎱 池专属抽奖逻辑
   * @param {number} userId - 用户ID
   * @param {number} poolCampaignId - 池活动ID
   * @param {object} options - 选项
   * @returns {object} 抽奖结果
   */
  static async drawFromPool (userId, poolCampaignId, options = {}) {
    try {
      // 1. 验证池访问权限
      const poolAccess = await this.validatePoolAccess(userId, poolCampaignId)
      if (!poolAccess.canAccess) {
        throw new Error(poolAccess.reason)
      }

      const pool = poolAccess.pool
      const poolRules = pool.pool_rules || {}

      // 2. 应用池特殊规则
      const adjustedOptions = { ...options }

      // 新手池保底机制
      if (pool.campaign_type === 'pool_newbie' && poolRules.guaranteed_prize) {
        adjustedOptions.guaranteedWin = true
      }

      // VIP池保底稀有
      if (pool.campaign_type === 'pool_vip' && poolRules.guaranteed_rare) {
        const userDrawCount = await this.getUserDrawCountInCampaign(userId, poolCampaignId)
        if ((userDrawCount + 1) % poolRules.guaranteed_rare === 0) {
          adjustedOptions.forceRarity = 'rare'
        }
      }

      // 3. 执行抽奖 (复用现有逻辑)
      const result = await this.executeDraw(userId, poolCampaignId, adjustedOptions)

      // 4. 池特殊奖励处理
      if (poolRules.newbie_bonus && pool.campaign_type === 'pool_basic') {
        result.bonus_multiplier = poolRules.newbie_bonus
      }

      return result
    } catch (error) {
      console.error('池抽奖失败:', error)
      throw error
    }
  }

  /**
   * 🎱 验证用户池访问权限
   * @param {number} userId - 用户ID
   * @param {number} poolCampaignId - 池活动ID
   * @returns {object} 权限检查结果
   */
  static async validatePoolAccess (userId, poolCampaignId) {
    const pool = await LotteryCampaign.findByPk(poolCampaignId)

    if (!pool || !pool.campaign_type.startsWith('pool_')) {
      return { canAccess: false, reason: '池不存在或无效' }
    }

    const userAccount = await PointsSystemService.getUserPointsAccount(userId)
    if (!userAccount.success) {
      return { canAccess: false, reason: '无法获取用户信息' }
    }

    // 等级检查
    const levelOrder = ['bronze', 'silver', 'gold', 'diamond']
    const userLevelIndex = levelOrder.indexOf(userAccount.data.account_level)
    const requiredLevelIndex = levelOrder.indexOf(pool.required_level)

    if (requiredLevelIndex > -1 && userLevelIndex < requiredLevelIndex) {
      return {
        canAccess: false,
        reason: `需要${pool.required_level}等级，当前${userAccount.data.account_level}等级`
      }
    }

    return { canAccess: true, pool }
  }

  /**
   * 🔒 条件抽奖 - 高级权限检查
   * @param {number} userId - 用户ID
   * @param {number} campaignId - 活动ID
   * @param {object} additionalChecks - 额外检查项
   * @returns {object} 权限检查结果
   */
  static async checkAdvancedDrawPermission (userId, campaignId, additionalChecks = {}) {
    try {
      // 1. 获取用户详细信息
      const userAccount = await PointsSystemService.getUserPointsAccount(userId)
      if (!userAccount.success) {
        throw new Error('无法获取用户积分账户信息')
      }

      const campaign = await LotteryCampaign.findByPk(campaignId)
      if (!campaign) {
        throw new Error('活动不存在')
      }

      const checkResults = {
        basic_access: true,
        level_check: true,
        behavior_check: true,
        time_check: true,
        frequency_check: true,
        special_conditions: true,
        messages: []
      }

      // 2. 等级权限检查
      if (campaign.required_level) {
        const levelOrder = ['bronze', 'silver', 'gold', 'diamond']
        const userLevelIndex = levelOrder.indexOf(userAccount.data.account_level)
        const requiredLevelIndex = levelOrder.indexOf(campaign.required_level)

        if (userLevelIndex < requiredLevelIndex) {
          checkResults.level_check = false
          checkResults.messages.push(`需要${campaign.required_level}等级，当前${userAccount.data.account_level}等级`)
        }
      }

      // 3. 行为评分检查 (使用现有behavior_score字段)
      const minBehaviorScore = additionalChecks.minBehaviorScore || 0
      if (userAccount.data.behavior_score < minBehaviorScore) {
        checkResults.behavior_check = false
        checkResults.messages.push(`行为评分不足，需要${minBehaviorScore}分，当前${userAccount.data.behavior_score}分`)
      }

      // 4. 时间窗口检查
      if (additionalChecks.timeWindow) {
        const now = new Date()
        const { startHour, endHour } = additionalChecks.timeWindow
        const currentHour = now.getHours()

        if (currentHour < startHour || currentHour > endHour) {
          checkResults.time_check = false
          checkResults.messages.push(`限时活动，开放时间：${startHour}:00-${endHour}:00`)
        }
      }

      // 5. 频率限制检查
      if (additionalChecks.frequencyLimit) {
        const { period, maxDraws } = additionalChecks.frequencyLimit
        const recentDraws = await this.getUserRecentDrawCount(userId, campaignId, period)

        if (recentDraws >= maxDraws) {
          Object.assign(checkResults, {
            frequency_check: false,
            messages: [...checkResults.messages, `${period}内最多抽奖${maxDraws}次，已达上限`]
          })
        }
      }

      // 6. VIP专享检查
      if (additionalChecks.vipOnly) {
        const isVip = ['gold', 'diamond'].includes(userAccount.data.account_level)
        if (!isVip) {
          Object.assign(checkResults, {
            special_conditions: false,
            messages: [...checkResults.messages, 'VIP专享活动，需要Gold或Diamond等级']
          })
        }
      }

      // 7. 综合结果
      const canDraw = Object.keys(checkResults)
        .filter(key => key !== 'messages')
        .every(key => checkResults[key])

      return {
        canDraw,
        checkResults,
        user: {
          level: userAccount.data.account_level,
          behavior_score: userAccount.data.behavior_score,
          total_earned: userAccount.data.total_earned
        },
        recommendation: canDraw ? null : this._generateUpgradeRecommendation(userAccount, checkResults)
      }
    } catch (error) {
      console.error('高级权限检查失败:', error)
      throw error
    }
  }

  /**
   * 生成用户升级建议
   * @param {object} userAccount - 用户账户信息
   * @param {object} checkResults - 检查结果
   * @returns {Array} 升级建议列表
   */
  static _generateUpgradeRecommendation (userAccount, checkResults) {
    const recommendations = []

    if (!checkResults.level_check) {
      const currentLevel = userAccount.data.account_level
      const pointsToNext = this._getPointsRequiredForNextLevel(currentLevel)
      recommendations.push(`积累${pointsToNext}积分可升级到下一等级`)
    }

    if (!checkResults.behavior_check) {
      recommendations.push('提升行为评分：每日登录、完成任务、参与活动')
    }

    if (!checkResults.frequency_check) {
      recommendations.push('请稍后再试，或参与其他活动')
    }

    return recommendations
  }

  /**
   * 获取升级所需积分 (基于现有等级系统)
   * @param {string} currentLevel - 当前等级
   * @returns {number} 所需积分
   */
  static _getPointsRequiredForNextLevel (currentLevel) {
    const levelThresholds = {
      bronze: 500, // 到silver需要500积分
      silver: 2000, // 到gold需要2000积分
      gold: 10000, // 到diamond需要10000积分
      diamond: 0 // 已是最高等级
    }

    return levelThresholds[currentLevel] || 0
  }

  /**
   * 获取用户最近抽奖次数
   * @param {number} userId - 用户ID
   * @param {number} campaignId - 活动ID
   * @param {string} period - 时间段
   * @returns {number} 抽奖次数
   */
  static async getUserRecentDrawCount (userId, campaignId, period) {
    const periodHours = {
      hour: 1,
      day: 24,
      week: 168
    }

    const hours = periodHours[period] || 24
    const since = new Date(Date.now() - hours * 60 * 60 * 1000)

    const count = await LotteryDraw.count({
      where: {
        user_id: userId,
        campaign_id: campaignId,
        created_at: { [Op.gte]: since }
      }
    })

    return count
  }

  /**
   * 获取用户在特定活动中的抽奖次数
   * @param {number} userId - 用户ID
   * @param {number} campaignId - 活动ID
   * @returns {number} 抽奖次数
   */
  static async getUserDrawCountInCampaign (userId, campaignId) {
    const count = await LotteryDraw.count({
      where: {
        user_id: userId,
        campaign_id: campaignId,
        created_at: {
          [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
        }
      }
    })
    return count
  }
}

module.exports = LotteryService
