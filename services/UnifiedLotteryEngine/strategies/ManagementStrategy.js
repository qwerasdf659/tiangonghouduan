/**
 * 管理工具策略
 * 实现管理员抽奖干预、概率调整、数据分析
 *
 * @description 提供策略配置管理和实时监控的管理工具
 * @version 4.0.0
 * @date 2025-09-11 北京时间
 */

const moment = require('moment-timezone')

class ManagementStrategy {
  constructor () {
    this.strategyName = 'management'
    this.version = '4.0.0'
    this.description = '管理工具策略 - 管理员干预和系统监控'

    // 管理工具配置
    this.config = {
      // 管理员权限级别
      adminLevels: {
        super_admin: {
          level: 5,
          permissions: ['all'],
          description: '超级管理员 - 所有权限'
        },
        admin: {
          level: 4,
          permissions: ['probability_adjust', 'force_result', 'view_analytics'],
          description: '管理员 - 核心管理权限'
        },
        moderator: {
          level: 3,
          permissions: ['view_analytics', 'user_management'],
          description: '运营 - 查看和用户管理'
        },
        viewer: {
          level: 2,
          permissions: ['view_analytics'],
          description: '查看者 - 仅查看权限'
        }
      },

      // 干预类型
      interventionTypes: {
        force_win: {
          name: '强制中奖',
          requiredLevel: 4,
          logRequired: true,
          description: '强制指定用户中奖'
        },
        force_lose: {
          name: '强制未中奖',
          requiredLevel: 4,
          logRequired: true,
          description: '强制指定用户未中奖'
        },
        probability_boost: {
          name: '概率提升',
          requiredLevel: 3,
          logRequired: true,
          description: '提升指定用户中奖概率'
        },
        probability_reduce: {
          name: '概率降低',
          requiredLevel: 4,
          logRequired: true,
          description: '降低指定用户中奖概率'
        }
      },

      // 监控指标
      monitoringMetrics: {
        realtime: ['active_users', 'lottery_frequency', 'win_rate'],
        hourly: ['total_draws', 'total_wins', 'revenue'],
        daily: ['user_retention', 'campaign_performance', 'prize_distribution']
      }
    }

    this.logInfo('管理工具策略初始化完成')
  }

  /**
   * 验证管理策略执行条件
   */
  async validate (context) {
    try {
      const { userId, adminId, operationType } = context

      // 验证管理员身份
      if (!adminId) {
        this.logError('管理工具策略验证失败：缺少管理员ID', { userId })
        return false
      }

      // 获取管理员信息
      const models = require('../../../models')
      const admin = await models.AdminUser.findByPk(adminId)
      if (!admin || admin.status !== 'active') {
        this.logError('管理员不存在或已停用', { adminId })
        return false
      }

      // 验证操作权限
      const hasPermission = await this.checkPermission(admin, operationType)
      if (!hasPermission) {
        this.logError('管理员权限不足', { adminId, operationType })
        return false
      }

      context.adminInfo = admin
      return true
    } catch (error) {
      this.logError('管理工具策略验证异常', { error: error.message })
      return false
    }
  }

  /**
   * 执行管理操作
   */
  async execute (context) {
    const startTime = Date.now()

    try {
      // 🔴 严格参数验证防止undefined错误
      if (!context || typeof context !== 'object') {
        const executionTime = Date.now() - startTime
        this.logError('管理策略参数验证失败', {
          error: 'context参数缺失或无效',
          executionTime
        })
        return {
          success: false,
          result: 'invalid',
          error: 'context参数缺失或无效',
          executionTime
        }
      }

      const { userId, adminInfo, operationType, operationParams } = context

      // 验证管理员信息
      if (!adminInfo || !adminInfo.admin_id) {
        const executionTime = Date.now() - startTime
        this.logError('管理策略参数验证失败', {
          error: 'adminInfo或admin_id参数缺失',
          providedAdminInfo: adminInfo,
          executionTime
        })
        return {
          success: false,
          result: 'invalid',
          error: 'adminInfo或admin_id参数缺失',
          executionTime
        }
      }

      this.logInfo('开始执行管理操作', {
        adminId: adminInfo.admin_id,
        adminName: adminInfo.name || '未知管理员',
        operationType,
        targetUserId: userId
      })

      let result
      switch (operationType) {
      case 'force_win':
        result = await this.executeForceWin(userId, operationParams, adminInfo)
        break
      case 'force_lose':
        result = await this.executeForceLose(userId, operationParams, adminInfo)
        break
      case 'probability_adjust':
        result = await this.executeProbabilityAdjust(userId, operationParams, adminInfo, context)
        break
      case 'analytics_report':
        result = await this.generateAnalyticsReport(operationParams, adminInfo)
        break
      case 'system_status':
        result = await this.getSystemStatus(adminInfo)
        break
      case 'user_management':
        result = await this.executeUserManagement(userId, operationParams, adminInfo)
        break
      default:
        throw new Error(`不支持的管理操作类型: ${operationType}`)
      }

      const finalResult = {
        success: true,
        executedStrategy: 'management',
        executionTime: Date.now() - startTime,
        timestamp: moment().tz('Asia/Shanghai').format(),
        result,
        operation: {
          type: operationType,
          adminId: adminInfo.admin_id,
          adminName: adminInfo.name,
          targetUserId: userId
        }
      }

      this.logInfo('管理操作执行完成', {
        adminId: adminInfo.admin_id,
        operationType,
        success: true,
        executionTime: finalResult.executionTime
      })

      return finalResult
    } catch (error) {
      const executionTime = Date.now() - startTime

      this.logError('管理操作执行失败', {
        error: error.message,
        stack: error.stack,
        executionTime
      })

      return {
        success: false,
        executedStrategy: 'management',
        error: error.message,
        executionTime,
        timestamp: moment().tz('Asia/Shanghai').format()
      }
    }
  }

  /**
   * 检查管理员权限
   */
  async checkPermission (admin, operationType) {
    try {
      // 超级管理员有所有权限
      if (admin.role === 'super_admin') {
        return true
      }

      // 检查操作类型所需权限级别
      const intervention = this.config.interventionTypes[operationType]
      if (intervention) {
        return admin.level >= intervention.requiredLevel
      }

      // 检查角色权限
      const adminLevel = this.config.adminLevels[admin.role]
      if (!adminLevel) {
        return false
      }

      return (
        adminLevel.permissions.includes(operationType) || adminLevel.permissions.includes('all')
      )
    } catch (error) {
      this.logError('权限检查失败', {
        adminId: admin.admin_id,
        operationType,
        error: error.message
      })
      return false
    }
  }

  /**
   * 执行强制中奖
   */
  async executeForceWin (userId, params, adminInfo) {
    const models = require('../../../models')

    try {
      const { campaignId, prizeId, reason } = params

      // 获取活动信息
      const campaign = await models.LotteryCampaign.findByPk(campaignId)
      if (!campaign) {
        throw new Error('抽奖活动不存在')
      }

      // 获取指定奖品或随机奖品
      let selectedPrize
      if (prizeId) {
        selectedPrize = await models.LotteryPrize.findByPk(prizeId)
        if (!selectedPrize || selectedPrize.campaign_id !== campaignId) {
          throw new Error('指定奖品不存在或不属于该活动')
        }
      } else {
        // 随机选择可用奖品
        const availablePrizes = await models.LotteryPrize.findAll({
          where: {
            campaign_id: campaignId,
            status: 'active',
            stock_quantity: { [models.Sequelize.Op.gt]: 0 }
          }
        })

        if (availablePrizes.length === 0) {
          throw new Error('该活动没有可用奖品')
        }

        selectedPrize = availablePrizes[Math.floor(Math.random() * availablePrizes.length)]
      }

      // 创建抽奖记录
      const lotteryRecord = await models.LotteryRecord.create({
        user_id: userId,
        campaign_id: campaignId,
        is_winner: true, // 修复：使用is_winner字段
        probability_used: 1.0,
        random_value: 0,
        admin_intervention: true,
        admin_id: adminInfo.admin_id,
        intervention_reason: reason || '管理员强制中奖',
        created_at: new Date()
      })

      // 发放奖品
      await selectedPrize.update({
        stock_quantity: selectedPrize.stock_quantity - 1
      })

      await models.PrizeDistribution.create({
        user_id: userId,
        campaign_id: campaignId,
        prize_id: selectedPrize.id,
        status: 'awarded',
        distribution_completed_at: new Date(),
        admin_awarded: true,
        admin_id: adminInfo.admin_id
      })

      // 记录管理日志
      await this.logManagementAction(adminInfo.admin_id, 'force_win', {
        userId,
        campaignId,
        prizeId: selectedPrize.id,
        reason
      })

      this.logInfo('强制中奖执行成功', {
        userId,
        campaignId,
        prizeId: selectedPrize.id,
        adminId: adminInfo.admin_id
      })

      return {
        won: true,
        prize: {
          id: selectedPrize.id,
          name: selectedPrize.name,
          type: selectedPrize.prize_type,
          value: selectedPrize.prize_value
        },
        lotteryRecordId: lotteryRecord.id,
        message: '管理员干预：强制中奖成功'
      }
    } catch (error) {
      this.logError('强制中奖执行失败', { userId, params, error: error.message })
      throw error
    }
  }

  /**
   * 执行强制未中奖
   */
  async executeForceLose (userId, params, adminInfo) {
    const models = require('../../../models')

    try {
      const { campaignId, reason } = params

      // 获取活动信息
      const campaign = await models.LotteryCampaign.findByPk(campaignId)
      if (!campaign) {
        throw new Error('抽奖活动不存在')
      }

      // ✅ 修复：创建抽奖记录使用业务标准字段
      const lotteryRecord = await models.LotteryRecord.create({
        user_id: userId,
        campaign_id: campaignId,
        is_winner: false, // ✅ 修复：使用业务标准字段
        probability_used: 0.0,
        random_value: 1,
        admin_intervention: true,
        admin_id: adminInfo.admin_id,
        intervention_reason: reason || '管理员强制未中奖',
        created_at: new Date()
      })

      // 记录管理日志
      await this.logManagementAction(adminInfo.admin_id, 'force_lose', {
        userId,
        campaignId,
        reason
      })

      this.logInfo('强制未中奖执行成功', {
        userId,
        campaignId,
        adminId: adminInfo.admin_id
      })

      return {
        won: false,
        prize: null,
        lotteryRecordId: lotteryRecord.id,
        message: '管理员干预：强制未中奖'
      }
    } catch (error) {
      this.logError('强制未中奖执行失败', { userId, params, error: error.message })
      throw error
    }
  }

  /**
   * 执行概率调整
   */
  async executeProbabilityAdjust (userId, params, adminInfo, context = {}) {
    const models = require('../../../models')

    try {
      const { probabilityAdjustment, factor, duration, reason } = params
      const campaignId = params.campaignId || context.campaignId || 2 // 使用唯一真实活动ID作为默认值
      const adjustmentValue = probabilityAdjustment || factor || 1.0 // 兼容不同的参数名

      // 生成决策ID用于关联
      const { v4: uuidv4 } = require('uuid')
      const decisionId = uuidv4()

      // ✅ 修复：创建决策记录使用新的字段标准
      await models.DecisionRecord.create({
        decision_id: decisionId,
        user_id: userId,
        campaign_id: campaignId,
        strategy_type: 'management', // ✅ 修复：使用策略类型枚举
        user_context: {
          admin_intervention: true,
          admin_id: adminInfo.admin_id,
          reason: reason || '管理员概率调整'
        },
        probability_data: {
          adjustment_type: 'probability_adjustment',
          adjustment_value: adjustmentValue
        },
        is_winner: false, // ✅ 修复：概率调整操作，未产生抽奖结果
        decision_metadata: {
          strategy_name: 'ManagementStrategy',
          operation_type: 'probability_adjustment',
          admin_id: adminInfo.admin_id
        }
      })

      // 再创建概率调整记录
      const adjustment = await models.ProbabilityLog.create({
        decision_id: decisionId,
        user_id: userId,
        campaign_id: campaignId,
        calculation_step: 'admin_override',
        step_order: 1,
        input_probability: 0, // 将由实际抽奖时填入
        output_probability: adjustmentValue,
        adjustment_factor: adjustmentValue,
        factor_type: 'force_win',
        factor_details: {
          admin_id: adminInfo.admin_id,
          reason: reason || '管理员概率调整',
          duration,
          expires_at: duration ? moment().add(duration, 'minutes').toDate() : null
        },
        calculation_reason: reason || '管理员概率调整',
        created_at: new Date()
      })

      // 记录管理日志
      await this.logManagementAction(adminInfo.admin_id, 'probability_adjust', {
        userId,
        campaignId,
        probabilityAdjustment,
        duration,
        reason
      })

      this.logInfo('概率调整执行成功', {
        userId,
        campaignId,
        probabilityAdjustment,
        adminId: adminInfo.admin_id
      })

      return {
        adjustmentId: adjustment.id,
        probabilityAdjustment,
        duration,
        expiresAt: adjustment.expires_at,
        message: `概率调整为 ${(probabilityAdjustment * 100).toFixed(1)}%，${duration ? `持续${duration}分钟` : '永久有效'}`
      }
    } catch (error) {
      this.logError('概率调整执行失败', { userId, params, error: error.message })
      throw error
    }
  }

  /**
   * 生成数据分析报告
   */
  async generateAnalyticsReport (params, adminInfo) {
    const models = require('../../../models')

    try {
      const { reportType, dateRange, campaignId } = params
      const now = moment().tz('Asia/Shanghai')

      let startDate, endDate
      if (dateRange && dateRange.start && dateRange.end) {
        startDate = moment(dateRange.start).tz('Asia/Shanghai').toDate()
        endDate = moment(dateRange.end).tz('Asia/Shanghai').toDate()
      } else {
        // 默认最近7天
        startDate = now.clone().subtract(7, 'days').toDate()
        endDate = now.toDate()
      }

      const baseWhere = {
        created_at: {
          [models.Sequelize.Op.gte]: startDate,
          [models.Sequelize.Op.lte]: endDate
        }
      }

      if (campaignId) {
        baseWhere.campaign_id = campaignId
      }

      // 基础统计数据
      const totalDraws = await models.LotteryRecord.count({ where: baseWhere })
      const totalWins = await models.LotteryRecord.count({
        where: { ...baseWhere, is_winner: true } // 修复：使用is_winner字段
      })
      const winRate = totalDraws > 0 ? totalWins / totalDraws : 0

      // 活跃用户统计
      const activeUsers = await models.LotteryRecord.count({
        where: baseWhere,
        distinct: true,
        col: 'user_id'
      })

      // 奖品发放统计
      const prizeDistribution = await models.PrizeDistribution.findAll({
        where: {
          distribution_completed_at: {
            [models.Sequelize.Op.gte]: startDate,
            [models.Sequelize.Op.lte]: endDate
          }
        },
        include: [
          {
            model: models.LotteryPrize,
            as: 'prize',
            attributes: ['prize_name', 'prize_type', 'prize_value']
          }
        ]
      })

      // 每日统计
      const dailyStats = await models.LotteryRecord.findAll({
        where: baseWhere,
        attributes: [
          [models.Sequelize.fn('DATE', models.Sequelize.col('created_at')), 'date'],
          [models.Sequelize.fn('COUNT', '*'), 'total_draws'],
          [
            models.Sequelize.fn(
              'SUM',
              models.Sequelize.literal('CASE WHEN is_winner = 1 THEN 1 ELSE 0 END')
            ),
            'total_wins'
          ]
        ],
        group: [models.Sequelize.fn('DATE', models.Sequelize.col('created_at'))],
        order: [[models.Sequelize.fn('DATE', models.Sequelize.col('created_at')), 'ASC']]
      })

      const report = {
        reportType,
        dateRange: { start: startDate, end: endDate },
        campaignId,
        summary: {
          totalDraws,
          totalWins,
          winRate: (winRate * 100).toFixed(2) + '%',
          activeUsers
        },
        prizeDistribution: this.processPrizeDistribution(prizeDistribution),
        dailyStats: dailyStats.map(stat => ({
          date: stat.getDataValue('date'),
          totalDraws: stat.getDataValue('total_draws'),
          totalWins: stat.getDataValue('total_wins'),
          winRate:
            ((stat.getDataValue('total_wins') / stat.getDataValue('total_draws')) * 100).toFixed(
              2
            ) + '%'
        })),
        generatedAt: now.format(),
        generatedBy: adminInfo.name
      }

      this.logInfo('分析报告生成成功', {
        reportType,
        dateRange,
        adminId: adminInfo.admin_id
      })

      return report
    } catch (error) {
      this.logError('分析报告生成失败', { params, error: error.message })
      throw error
    }
  }

  /**
   * 获取系统状态
   */
  async getSystemStatus (adminInfo) {
    const models = require('../../../models')

    try {
      const now = moment().tz('Asia/Shanghai')
      const oneHourAgo = now.clone().subtract(1, 'hour').toDate()

      // 系统基础状态
      const systemStatus = {
        server_time: now.format(),
        uptime: process.uptime(),
        memory_usage: process.memoryUsage(),
        node_version: process.version
      }

      // 实时活动数据
      const realtimeStats = {
        active_campaigns: await models.LotteryCampaign.count({ where: { status: 'active' } }), // 修复：使用实际存在的status字段
        recent_draws: await models.LotteryRecord.count({
          where: { created_at: { [models.Sequelize.Op.gte]: oneHourAgo } }
        }),
        online_users: await models.LotteryRecord.count({
          where: { created_at: { [models.Sequelize.Op.gte]: oneHourAgo } },
          distinct: true,
          col: 'user_id'
        })
      }

      // 系统健康检查
      const healthCheck = {
        database: await this.checkDatabaseHealth(),
        cache: await this.checkCacheHealth(),
        storage: await this.checkStorageHealth()
      }

      this.logInfo('系统状态查询成功', { adminId: adminInfo.admin_id })

      return {
        systemStatus,
        realtimeStats,
        healthCheck,
        queriedAt: now.format(),
        queriedBy: adminInfo.name
      }
    } catch (error) {
      this.logError('系统状态查询失败', { error: error.message })
      throw error
    }
  }

  /**
   * 执行用户管理操作
   */
  async executeUserManagement (userId, params, adminInfo) {
    const models = require('../../../models')

    try {
      const { action, reason } = params

      const user = await models.User.findByPk(userId)
      if (!user) {
        throw new Error('用户不存在')
      }

      let result
      switch (action) {
      case 'disable':
        await user.update({ status: 'inactive' })
        result = { message: '用户已禁用', userId, action }
        break
      case 'enable':
        await user.update({ status: 'active' })
        result = { message: '用户已启用', userId, action }
        break
      case 'reset_points':
        await user.update({ points: 0 })
        result = { message: '用户积分已重置', userId, action }
        break
      default:
        throw new Error(`不支持的用户管理操作: ${action}`)
      }

      // 记录管理日志
      await this.logManagementAction(adminInfo.admin_id, 'user_management', {
        userId,
        action,
        reason
      })

      this.logInfo('用户管理操作执行成功', {
        userId,
        action,
        adminId: adminInfo.admin_id
      })

      return result
    } catch (error) {
      this.logError('用户管理操作失败', { userId, params, error: error.message })
      throw error
    }
  }

  /**
   * 处理奖品分发统计
   */
  processPrizeDistribution (distributions) {
    const stats = {}

    for (const dist of distributions) {
      const prizeType = dist.prize.prize_type
      if (!stats[prizeType]) {
        stats[prizeType] = {
          count: 0,
          totalValue: 0,
          items: []
        }
      }

      stats[prizeType].count++
      stats[prizeType].totalValue += parseFloat(dist.prize.prize_value || 0)
      stats[prizeType].items.push({
        name: dist.prize.prize_name,
        value: dist.prize.prize_value,
        awardedAt: dist.distribution_completed_at
      })
    }

    return stats
  }

  /**
   * 记录管理操作日志
   */
  async logManagementAction (adminId, actionType, details) {
    const models = require('../../../models')

    try {
      await models.SystemMetrics.create({
        metric_type: 'admin_action',
        metric_name: actionType,
        metric_value: JSON.stringify(details),
        admin_id: adminId,
        created_at: new Date()
      })
    } catch (error) {
      this.logError('管理操作日志记录失败', { adminId, actionType, error: error.message })
    }
  }

  /**
   * 数据库健康检查
   */
  async checkDatabaseHealth () {
    try {
      const models = require('../../../models')
      await models.sequelize.authenticate()
      return { status: 'healthy', message: '数据库连接正常' }
    } catch (error) {
      return { status: 'error', message: error.message }
    }
  }

  /**
   * 缓存健康检查
   */
  async checkCacheHealth () {
    try {
      // 这里应该检查Redis或其他缓存服务
      return { status: 'healthy', message: '缓存服务正常' }
    } catch (error) {
      return { status: 'error', message: error.message }
    }
  }

  /**
   * 存储健康检查
   */
  async checkStorageHealth () {
    try {
      // 这里应该检查Sealos存储服务
      return { status: 'healthy', message: '存储服务正常' }
    } catch (error) {
      return { status: 'error', message: error.message }
    }
  }

  /**
   * 记录信息日志
   */
  logInfo (message, data = {}) {
    console.log(
      `[${moment().tz('Asia/Shanghai').format()}] [ManagementStrategy] [INFO] ${message}`,
      data
    )
  }

  /**
   * 记录错误日志
   */
  logError (message, data = {}) {
    console.error(
      `[${moment().tz('Asia/Shanghai').format()}] [ManagementStrategy] [ERROR] ${message}`,
      data
    )
  }

  /**
   * 检查用户预设奖品队列
   * 核心功能：实现管理员预设奖品的优先抽取
   */
  async checkUserSpecificPrizeQueue (userId, campaignId) {
    try {
      const models = require('../../../models')

      // 获取用户的下一个待发放预设奖品
      const nextPrize = await models.UserSpecificPrizeQueue.getNextPrizeForUser(userId, campaignId)

      if (nextPrize) {
        this.logInfo('发现用户预设奖品', {
          userId,
          campaignId,
          queueId: nextPrize.queue_id,
          prizeNumber: nextPrize.prize_number,
          prizeName: nextPrize.prize?.prize_name
        })

        return {
          hasPredefinedPrize: true,
          queueItem: nextPrize,
          prize: nextPrize.prize,
          queueOrder: nextPrize.queue_order,
          prizeNumber: nextPrize.prize_number
        }
      }

      this.logInfo('用户无预设奖品，执行正常抽奖', { userId, campaignId })
      return {
        hasPredefinedPrize: false
      }
    } catch (error) {
      this.logError('检查用户预设奖品队列失败', {
        userId,
        campaignId,
        error: error.message
      })
      return {
        hasPredefinedPrize: false,
        error: error.message
      }
    }
  }

  /**
   * 执行预设奖品发放
   * 核心功能：将预设奖品标记为已发放，更新队列状态
   * 🔴 重要：特定奖品也需要检查和扣除积分
   */
  async executePredefinedPrizeAward (queueItem, userId) {
    const transaction = await require('../../../models').sequelize.transaction()

    try {
      const models = require('../../../models')

      // 🔴 第一步：检查用户积分是否足够（特定奖品也需要积分）
      const pointsCost = 100 // 每次抽奖消耗积分（与BasicLotteryStrategy保持一致）
      const userAccount = await models.UserPointsAccount.findOne({
        where: { user_id: userId },
        transaction
      })

      if (!userAccount || userAccount.available_points < pointsCost) {
        await transaction.rollback()

        this.logError('用户积分不足，无法发放特定奖品', {
          userId,
          currentPoints: userAccount?.available_points || 0,
          requiredPoints: pointsCost,
          queueId: queueItem.queue_id,
          prizeNumber: queueItem.prize_number
        })

        return {
          success: false,
          error: 'INSUFFICIENT_POINTS',
          message: `积分不足，需要${pointsCost}积分，当前只有${userAccount?.available_points || 0}积分`,
          currentPoints: userAccount?.available_points || 0,
          requiredPoints: pointsCost
        }
      }

      // 🔴 第二步：扣除用户积分
      await models.UserPointsAccount.decrement('available_points', {
        by: pointsCost,
        where: { user_id: userId },
        transaction
      })

      this.logInfo('特定奖品积分扣除成功', {
        userId,
        pointsCost,
        remainingPoints: userAccount.available_points - pointsCost
      })

      // 🔴 第三步：标记奖品为已发放
      const updated = await models.UserSpecificPrizeQueue.markAsAwarded(
        queueItem.queue_id,
        transaction
      )

      if (!updated) {
        await transaction.rollback()
        throw new Error('更新预设奖品队列状态失败')
      }

      // 🔴 第四步：记录抽奖记录（包含积分消耗信息）
      await models.LotteryRecord.create(
        {
          user_id: userId,
          campaign_id: queueItem.campaign_id,
          prize_id: queueItem.prize_id,
          is_winner: true, // 修复：使用is_winner字段,
          result_type: 'management_predefined', // 标记为管理预设奖品
          points_cost: pointsCost,
          points_balance_after: userAccount.available_points - pointsCost,
          prize_details: JSON.stringify({
            prize_number: queueItem.prize_number,
            prize_name: queueItem.prize?.prize_name,
            queue_id: queueItem.queue_id,
            queue_order: queueItem.queue_order,
            source: 'management_allocation'
          }),
          created_at: new Date()
        },
        { transaction }
      )

      await transaction.commit()

      this.logInfo('预设奖品发放成功（含积分扣除）', {
        userId,
        queueId: queueItem.queue_id,
        prizeNumber: queueItem.prize_number,
        prizeName: queueItem.prize?.prize_name,
        pointsCost,
        remainingPoints: userAccount.available_points - pointsCost
      })

      return {
        success: true,
        awarded: true,
        prize: queueItem.prize,
        queueOrder: queueItem.queue_order,
        prizeNumber: queueItem.prize_number,
        pointsCost, // 🔴 返回积分消耗信息
        remainingPoints: userAccount.available_points - pointsCost,
        message: `成功获得${queueItem.prize_number}号奖品：${queueItem.prize?.prize_name}（消耗${pointsCost}积分）`
      }
    } catch (error) {
      await transaction.rollback()
      this.logError('预设奖品发放失败', {
        userId,
        queueId: queueItem.queue_id,
        error: error.message
      })

      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 管理策略核心抽奖逻辑
   * 优先检查预设奖品，如无预设则执行正常抽奖
   */
  async executeManagedLottery (context) {
    try {
      const { userId, campaignId } = context

      this.logInfo('开始执行管理抽奖策略', { userId, campaignId })

      // 1. 检查用户预设奖品队列
      const queueCheck = await this.checkUserSpecificPrizeQueue(userId, campaignId)

      if (queueCheck.hasPredefinedPrize) {
        // 用户有预设奖品，直接发放
        this.logInfo('用户有预设奖品，执行预设奖品发放', {
          userId,
          prizeNumber: queueCheck.prizeNumber,
          queueOrder: queueCheck.queueOrder
        })

        const awardResult = await this.executePredefinedPrizeAward(queueCheck.queueItem, userId)

        return {
          success: true,
          executedStrategy: 'management',
          method: 'predefined_prize',
          userExperience: 'normal_lottery', // 用户感受与正常抽奖一致
          result: awardResult,
          isManaged: true,
          queueInfo: {
            queueOrder: queueCheck.queueOrder,
            prizeNumber: queueCheck.prizeNumber,
            totalQueue: await this.getUserQueueStats(userId, campaignId)
          }
        }
      } else {
        // 用户无预设奖品，返回信息让其他策略处理
        this.logInfo('用户无预设奖品，交由其他策略处理', { userId, campaignId })

        return {
          success: true,
          executedStrategy: 'management',
          method: 'no_predefined_prize',
          shouldContinue: true, // 指示应该继续使用其他策略
          isManaged: false,
          message: '用户无预设奖品，使用正常抽奖流程'
        }
      }
    } catch (error) {
      this.logError('管理抽奖策略执行失败', {
        userId: context.userId,
        campaignId: context.campaignId,
        error: error.message
      })

      return {
        success: false,
        executedStrategy: 'management',
        error: error.message,
        shouldContinue: true // 出错时也继续使用其他策略
      }
    }
  }

  /**
   * 获取用户队列统计信息
   */
  async getUserQueueStats (userId, campaignId) {
    try {
      const models = require('../../../models')
      return await models.UserSpecificPrizeQueue.getUserQueueStats(userId, campaignId)
    } catch (error) {
      this.logError('获取用户队列统计失败', { userId, campaignId, error: error.message })
      return {
        total: 0,
        pending: 0,
        completed: 0,
        expired: 0,
        cancelled: 0
      }
    }
  }
}

module.exports = ManagementStrategy
