/**
 * 统一决策引擎管理员API v4.0
 * 提供引擎配置、监控和管理功能
 *
 * @description 管理员专用接口，用于引擎参数调整、性能监控、数据分析
 * @version 4.0.0
 * @date 2025-09-10 16:49:01 北京时间
 */

const express = require('express')
const router = express.Router()
const models = require('../../../models')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const ApiResponse = require('../../../utils/ApiResponse') // 导入ApiResponse工具
const DecisionCore = require('../../../services/UnifiedLotteryEngine/core/DecisionCore')
const PerformanceMonitor = require('../../../services/UnifiedLotteryEngine/utils/PerformanceMonitor')
const DataCollector = require('../../../services/UnifiedLotteryEngine/utils/DataCollector')
const Logger = require('../../../services/UnifiedLotteryEngine/utils/Logger')
const { requireAdmin, authenticateToken, generateTokens } = require('../../../middleware/auth')
const { Op } = require('sequelize')
const sequelize = require('../../../models/index').sequelize

/**
 * 🔧 移除重复的响应格式中间件 - 现在使用统一的ApiResponse中间件
 * 通过app.js中的ApiResponse.middleware()提供统一格式
 */

// 初始化组件
const decisionCore = new DecisionCore()
const performanceMonitor = new PerformanceMonitor()
const dataCollector = new DataCollector()
const adminLogger = new Logger('AdminAPIv4') // 重命名以避免冲突

// 🔧 响应格式中间件已通过app.js的ApiResponse.middleware()统一提供

/**
 * V4管理员认证API
 * POST /api/v4/unified-engine/admin/auth
 * 专为V4统一引擎设计的管理员认证接口
 */
router.post('/auth', async (req, res) => {
  try {
    const { phone, verification_code } = req.body

    adminLogger.info('V4管理员认证请求', {
      phone: phone?.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'),
      timestamp: BeijingTimeHelper.apiTimestamp()
    })

    // 参数验证
    if (!phone || !verification_code) {
      return res.apiBadRequest('缺少必要参数：手机号或验证码')
    }

    // 🔴 开发环境验证码检查（生产环境需要真实短信验证）
    // 📝 生产环境部署时需要实现真实的短信验证码验证逻辑
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      if (verification_code !== '123456') {
        return res.apiError('开发环境请使用验证码: 123456', 'INVALID_VERIFICATION_CODE')
      }
    } else {
      // 🔴 TODO: 生产环境验证码验证逻辑
      // 📝 需要实现：
      // 1. 查询verification_codes表验证code有效性
      // 2. 检查验证码是否过期（通常5分钟有效期）
      // 3. 验证后删除或标记验证码已使用
      // 4. 集成真实短信服务商API
      console.warn('🚨 生产环境验证码验证逻辑需要实现')
    }

    // 查询用户信息
    const user = await models.User.findOne({
      where: { mobile: phone }
    })

    if (!user) {
      adminLogger.warn('V4管理员认证失败 - 用户不存在', { phone })
      return res.apiError('用户不存在', 'USER_NOT_FOUND')
    }

    // 验证管理员权限
    if (!user.is_admin) {
      adminLogger.warn('V4管理员认证失败 - 权限不足', {
        userId: user.user_id,
        phone: phone?.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
      })
      return res.apiError('需要管理员权限', 'INSUFFICIENT_PRIVILEGES')
    }

    // 生成V4引擎专用token
    const tokens = generateTokens(user)

    // 获取用户积分信息
    const userPoints = await models.UserPointsAccount.findOne({
      where: { user_id: user.user_id }
    })

    // 构造响应数据
    const responseData = {
      user: {
        user_id: user.user_id,
        mobile: user.mobile,
        is_admin: user.is_admin,
        created_at: user.created_at,
        updated_at: user.updated_at
      },
      points: userPoints
        ? {
          available_points: parseFloat(userPoints.available_points),
          total_earned: parseFloat(userPoints.total_earned),
          account_level: userPoints.account_level
        }
        : null,
      token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      engine_version: '4.0.0',
      auth_scope: ['admin', 'v4-unified-engine'],
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() // 2小时后过期
    }

    adminLogger.info('V4管理员认证成功', {
      adminId: user.user_id,
      engine_version: '4.0.0',
      timestamp: BeijingTimeHelper.apiTimestamp()
    })

    return res.json(ApiResponse.success(responseData, '管理员认证成功'))
  } catch (error) {
    adminLogger.error('V4管理员认证异常', {
      error: error.message,
      stack: error.stack,
      timestamp: BeijingTimeHelper.apiTimestamp()
    })

    return res.apiInternalError('认证服务异常，请稍后重试')
  }
})

/**
 * 获取引擎整体状态
 * GET /api/v4/unified-engine/admin/status
 */
router.get('/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    adminLogger.info('管理员查询引擎状态', { adminId: req.user.user_id })

    // 并行收集状态信息
    const [performanceStats, systemStats, decisionStats, recentAlerts] = await Promise.all([
      performanceMonitor.getStats(),
      dataCollector.collectSystemStats(),
      getDecisionStats(),
      getRecentAlerts()
    ])

    const engineStatus = {
      version: '4.0.0',
      status: 'running',
      uptime: process.uptime(),
      lastUpdate: new Date().toISOString(),

      performance: performanceStats,
      system: systemStats,
      decisions: decisionStats,
      alerts: recentAlerts,

      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
      },

      nodeVersion: process.version,
      platform: process.platform
    }

    return res.json({
      success: true,
      data: engineStatus,
      timestamp: BeijingTimeHelper.apiTimestamp()
    })
  } catch (error) {
    adminLogger.error('获取引擎状态失败', {
      adminId: req.user.user_id,
      error: error.message
    })

    return res.apiInternalError('服务器内部错误')
  }
})

/**
 * 获取决策记录分析
 * GET /api/v4/unified-engine/admin/decisions/analytics
 */
router.get('/decisions/analytics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { timeRange = '24h', campaignId, userId } = req.query

    adminLogger.info('管理员查询决策分析', {
      adminId: req.user.user_id,
      timeRange,
      campaignId,
      userId
    })

    // 计算时间范围
    const timeRangeMs = parseTimeRange(timeRange)
    const startTime = new Date(Date.now() - timeRangeMs)

    // 构建查询条件
    const whereConditions = {
      created_at: {
        [models.Sequelize.Op.gte]: startTime
      }
    }

    if (campaignId) {
      whereConditions.campaign_id = campaignId
    }
    if (userId) {
      whereConditions.user_id = userId
    }

    // 并行查询决策数据
    const [decisionRecords, probabilityLogs, winRateStats, guaranteeStats] = await Promise.all([
      models.DecisionRecord.findAll({
        where: whereConditions,
        include: [
          { model: models.User, as: 'user', attributes: ['username', 'is_admin'] },
          { model: models.LotteryCampaign, as: 'campaign', attributes: ['campaign_name'] }
        ],
        order: [['created_at', 'DESC']],
        limit: 1000
      }),
      models.ProbabilityLog.findAll({
        where: {
          created_at: {
            [models.Sequelize.Op.gte]: startTime
          }
        },
        order: [['created_at', 'DESC']],
        limit: 500
      }),
      calculateWinRateStats(whereConditions),
      calculateGuaranteeStats(whereConditions)
    ])

    // ✅ 修复：分析决策数据使用is_winner业务标准字段
    const analytics = {
      summary: {
        totalDecisions: decisionRecords.length,
        winCount: decisionRecords.filter(r => r.is_winner === true).length,
        loseCount: decisionRecords.filter(r => r.is_winner === false).length,
        averageExecutionTime: calculateAverageExecutionTime(decisionRecords),
        timeRange: {
          start: startTime.toISOString(),
          end: new Date().toISOString()
        }
      },

      winRateAnalysis: winRateStats,
      guaranteeAnalysis: guaranteeStats,

      performanceMetrics: {
        averageDecisionTime:
          decisionRecords.length > 0
            ? decisionRecords.reduce((sum, r) => sum + (r.execution_time_ms || 0), 0) /
              decisionRecords.length
            : 0,
        slowDecisions: decisionRecords.filter(r => r.execution_time_ms > 500).length
      },

      probabilityDistribution: analyzeProbabilityDistribution(probabilityLogs),

      userSegmentAnalysis: analyzeUserSegments(decisionRecords),

      campaignPerformance: analyzeCampaignPerformance(decisionRecords),

      recentDecisions: decisionRecords.slice(0, 50).map(record => ({
        decision_id: record.decision_id,
        user_id: record.user_id,
        username: record.user?.username,
        campaign_name: record.campaign?.campaign_name,
        result: record.decision_result,
        probability: record.final_probability,
        guarantee_triggered: record.guarantee_triggered,
        execution_time: record.execution_time_ms,
        created_at: record.created_at
      }))
    }

    return res.apiSuccess(analytics, '决策分析数据获取成功', 'ANALYTICS_SUCCESS')
  } catch (error) {
    adminLogger.error('获取决策分析失败', {
      adminId: req.user.user_id,
      error: error.message
    })

    return res.apiInternalError('决策分析数据获取失败', error.message, 'DECISION_ANALYTICS_ERROR')
  }
})

/**
 * 调整引擎参数配置
 * PUT /api/v4/unified-engine/admin/config
 */
router.put('/config', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const adminId = req.user.user_id
    const { configType, configData } = req.body

    adminLogger.info('管理员调整引擎配置', {
      adminId,
      configType,
      configData
    })

    // 验证配置类型和数据
    const validationResult = validateEngineConfig(configType, configData)
    if (!validationResult.valid) {
      return res.apiBadRequest('请求参数错误')
    }

    // 应用配置更改
    const updateResult = await applyEngineConfig(configType, configData, adminId)

    return res.json({
      success: true,
      data: {
        configType,
        applied: updateResult.applied,
        affectedComponents: updateResult.affectedComponents,
        appliedAt: new Date().toISOString(),
        appliedBy: adminId
      },
      message: '引擎配置已更新',
      timestamp: BeijingTimeHelper.apiTimestamp()
    })
  } catch (error) {
    adminLogger.error('更新引擎配置失败', {
      adminId: req.user.user_id,
      error: error.message
    })

    return res.apiInternalError('服务器内部错误')
  }
})

/**
 * 模拟抽奖测试
 * POST /api/v4/unified-engine/admin/test/simulate
 */
router.post('/test/simulate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId, campaignId, iterations = 1 } = req.body

    if (!userId || !campaignId) {
      return res.apiBadRequest('缺少必要参数：userId、campaignId')
    }

    if (iterations > 100) {
      return res.apiBadRequest('模拟次数不能超过100次')
    }

    adminLogger.info('管理员执行抽奖模拟', {
      adminId: req.user.user_id,
      userId,
      campaignId,
      iterations
    })

    // 执行模拟抽奖
    const simulationResults = []
    for (let i = 0; i < iterations; i++) {
      const testRequest = {
        userId,
        activityId: campaignId,
        lotteryType: 'test_simulation',
        pointsCost: 0,
        isTestMode: true
      }

      const result = await decisionCore.executeDecision(testRequest)
      simulationResults.push({
        iteration: i + 1,
        result: result.success ? result.data.result : 'error',
        probability: result.success ? result.data.probabilityUsed : null,
        guarantee: result.success ? result.data.guaranteeTriggered : null,
        executionTime: result.success ? result.data.executionTime : null,
        error: result.success ? null : result.error
      })
    }

    // 统计模拟结果
    const winCount = simulationResults.filter(r => r.result === 'win').length
    const loseCount = simulationResults.filter(r => r.result === 'lose').length
    const errorCount = simulationResults.filter(r => r.result === 'error').length
    const avgProbability =
      simulationResults
        .filter(r => r.probability !== null)
        .reduce((sum, r) => sum + r.probability, 0) /
      Math.max(simulationResults.length - errorCount, 1)

    const simulationSummary = {
      iterations,
      results: {
        wins: winCount,
        losses: loseCount,
        errors: errorCount
      },
      statistics: {
        winRate: ((winCount / iterations) * 100).toFixed(2) + '%',
        avgProbability: avgProbability.toFixed(4),
        successRate: (((iterations - errorCount) / iterations) * 100).toFixed(2) + '%'
      },
      detailedResults: simulationResults
    }

    return res.json({
      success: true,
      data: simulationSummary,
      message: '抽奖模拟完成',
      timestamp: BeijingTimeHelper.apiTimestamp()
    })
  } catch (error) {
    adminLogger.error('抽奖模拟失败', {
      adminId: req.user.user_id,
      error: error.message
    })

    return res.apiInternalError('服务器内部错误')
  }
})

/**
 * V4管理员仪表板API - 缺失端点补充
 * GET /api/v4/unified-engine/admin/dashboard
 * 提供统一的管理员仪表板数据
 */
router.get('/dashboard', authenticateToken, requireAdmin, async (req, res) => {
  try {
    adminLogger.info('V4管理员仪表板数据请求', {
      adminId: req.user?.user_id,
      timestamp: BeijingTimeHelper.apiTimestamp()
    })

    // 获取系统整体统计数据
    const [userStats, lotteryStats, systemStatus] = await Promise.all([
      // 用户统计
      models.User.findAndCountAll({
        where: { status: 'active' },
        attributes: ['user_id', 'is_admin', 'created_at'], // ✅ 使用实际存在的is_admin字段
        raw: true
      }),

      // 抽奖统计
      models.LotteryRecord
        ? models.LotteryRecord.findAndCountAll({
          attributes: ['draw_id', 'is_winner', 'created_at'], // ✅ 使用正确的字段名
          raw: true
        })
        : { count: 0, rows: [] },

      // 系统性能监控
      performanceMonitor.getStats() // ✅ 使用正确的方法名
    ])

    // 今日统计（北京时间）
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const todayStats = {
      newUsers: userStats.rows.filter(u => new Date(u.created_at) >= todayStart).length,
      lotteryCount: lotteryStats.rows.filter(l => new Date(l.created_at) >= todayStart).length,
      systemUptime: Math.floor(process.uptime())
    }

    const dashboardData = {
      summary: {
        totalUsers: userStats.count,
        activeUsers: userStats.rows.filter(u => u.is_admin === false || u.is_admin === 0).length, // ✅ 普通用户
        adminUsers: userStats.rows.filter(u => u.is_admin === true || u.is_admin === 1).length, // ✅ 管理员用户
        totalLotteries: lotteryStats.count,
        todayStats
      },
      system: {
        status: systemStatus,
        architecture: 'V4 Unified Engine',
        timezone: 'Asia/Shanghai',
        timestamp: BeijingTimeHelper.apiTimestamp()
      },
      performance: {
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        nodeVersion: process.version
      }
    }

    return res.apiSuccess(dashboardData, 'V4管理员仪表板数据获取成功')
  } catch (error) {
    adminLogger.error('V4管理员仪表板数据获取失败', error)
    return res.apiInternalError('V4管理员仪表板数据获取失败', error.message, 'DASHBOARD_ERROR')
  }
})

/**
 * 奖品池管理 - 批量添加奖品到奖品池
 * POST /api/v4/unified-engine/admin/prize-pool/batch-add
 */
router.post('/prize-pool/batch-add', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const adminId = req.user.user_id
    const { campaign_id, prizes } = req.body

    adminLogger.info('管理员批量添加奖品到奖品池', {
      adminId,
      campaign_id,
      prizeCount: prizes?.length,
      timestamp: BeijingTimeHelper.apiTimestamp()
    })

    // 参数验证
    if (!campaign_id || !Array.isArray(prizes) || prizes.length === 0) {
      return res.apiBadRequest('缺少活动ID或奖品列表')
    }

    // 验证活动存在且管理员有权限管理
    const campaign = await models.LotteryCampaign.findOne({
      where: { campaign_id }
    })

    if (!campaign) {
      return res.apiError('抽奖活动不存在', 'CAMPAIGN_NOT_FOUND')
    }

    // 批量创建奖品记录
    const createdPrizes = []
    const errors = []

    for (let i = 0; i < prizes.length; i++) {
      const prizeData = prizes[i]

      try {
        // 验证必需字段
        if (!prizeData.name || !prizeData.prize_type) {
          errors.push(`第${i + 1}个奖品缺少必需字段`)
          continue
        }

        const newPrize = await models.LotteryPrize.create({
          campaign_id,
          name: prizeData.name,
          prize_type: prizeData.prize_type, // 'points', 'physical', 'virtual', 'coupon'
          prize_value: prizeData.prize_value || 0,
          description: prizeData.description || '',
          win_probability: prizeData.win_probability || 0.1, // 默认10%概率
          prize_weight: prizeData.prize_weight || 100, // 默认权重100
          stock_quantity: prizeData.stock_quantity || 1, // 库存数量
          max_daily_wins: prizeData.max_daily_wins || null, // 每日最大中奖次数
          status: prizeData.status || 'active',
          created_by: adminId,
          created_at: new Date(),
          updated_at: new Date()
        })

        createdPrizes.push({
          prize_id: newPrize.prize_id,
          name: newPrize.name,
          type: newPrize.prize_type,
          value: newPrize.prize_value,
          stock: newPrize.stock_quantity
        })

        adminLogger.info(`奖品创建成功: ${newPrize.name}`, {
          adminId,
          prizeId: newPrize.prize_id,
          campaign_id
        })
      } catch (error) {
        errors.push(`第${i + 1}个奖品创建失败: ${error.message}`)
        adminLogger.error('奖品创建失败', {
          adminId,
          prizeData,
          error: error.message
        })
      }
    }

    // 统计奖品池信息
    const totalPrizes = await models.LotteryPrize.count({
      where: { campaign_id, status: 'active' }
    })

    const totalStock = await models.LotteryPrize.sum('stock_quantity', {
      where: { campaign_id, status: 'active' }
    })

    return res.json({
      success: true,
      data: {
        campaign_id,
        created_count: createdPrizes.length,
        total_prizes: totalPrizes,
        total_stock: totalStock || 0,
        created_prizes: createdPrizes.slice(0, 10), // 只返回前10个，避免响应过大
        errors: errors.length > 0 ? errors : null
      },
      message: `成功添加 ${createdPrizes.length} 个奖品到奖品池`,
      timestamp: BeijingTimeHelper.apiTimestamp()
    })
  } catch (error) {
    adminLogger.error('批量添加奖品失败', {
      adminId: req.user.user_id,
      error: error.message
    })

    return res.apiInternalError('服务器内部错误')
  }
})

/**
 * 奖品池管理 - 查看奖品池状态
 * GET /api/v4/unified-engine/admin/prize-pool/:campaign_id
 */
router.get('/prize-pool/:campaign_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const adminId = req.user.user_id
    const { campaign_id } = req.params
    const { page = 1, limit = 20, status = 'all' } = req.query

    adminLogger.info('管理员查看奖品池状态', {
      adminId,
      campaign_id,
      page,
      limit,
      status
    })

    // 构建查询条件
    const whereCondition = { campaign_id }
    if (status !== 'all') {
      whereCondition.status = status
    }

    // 获取奖品列表
    const { count, rows: prizes } = await models.LotteryPrize.findAndCountAll({
      where: whereCondition,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      include: [
        {
          model: models.PrizeDistribution,
          as: 'distributions',
          // 🎯 业务语义统一修复：使用distributed_at字段
          attributes: ['id', 'user_id', 'status', 'distributed_at'],
          required: false
        }
      ]
    })

    // 统计信息
    const stats = {
      total_prizes: count,
      active_prizes: await models.LotteryPrize.count({
        where: { campaign_id, status: 'active' }
      }),
      out_of_stock: await models.LotteryPrize.count({
        where: { campaign_id, status: 'out_of_stock' }
      }),
      total_stock:
        (await models.LotteryPrize.sum('stock_quantity', {
          where: { campaign_id, status: 'active' }
        })) || 0,
      total_value:
        (await models.LotteryPrize.sum('prize_value', {
          where: { campaign_id, status: 'active' }
        })) || 0
    }

    // 格式化奖品数据
    const formattedPrizes = prizes.map(prize => ({
      prize_id: prize.prize_id,
      name: prize.name,
      type: prize.prize_type,
      value: parseFloat(prize.prize_value),
      stock_quantity: prize.stock_quantity,
      win_probability: parseFloat(prize.win_probability),
      prize_weight: prize.prize_weight,
      status: prize.status,
      won_count: prize.distributions ? prize.distributions.length : 0,
      created_at: prize.created_at,
      is_available: prize.isAvailable()
    }))

    return res.apiSuccess(
      {
        campaign_id,
        stats,
        prizes: formattedPrizes,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / parseInt(limit))
        }
      },
      `获取奖品池信息成功，共${count}个奖品`,
      'PRIZE_POOL_SUCCESS'
    )
  } catch (error) {
    adminLogger.error('获取奖品池信息失败', {
      adminId: req.user.user_id,
      error: error.message
    })

    return res.apiInternalError('获取奖品池信息失败', error.message, 'PRIZE_POOL_ERROR')
  }
})

/**
 * 奖品池管理 - 更新奖品信息
 * PUT /api/v4/unified-engine/admin/prize-pool/prize/:prize_id
 */
router.put('/prize-pool/prize/:prize_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const adminId = req.user.user_id
    const { prize_id } = req.params
    const updateData = req.body

    adminLogger.info('管理员更新奖品信息', {
      adminId,
      prize_id,
      updateData
    })

    // 查找奖品
    const prize = await models.LotteryPrize.findByPk(prize_id)
    if (!prize) {
      return res.apiError('奖品不存在', 'PRIZE_NOT_FOUND')
    }

    // 更新奖品信息
    const allowedFields = [
      'name',
      'description',
      'prize_value',
      'win_probability',
      'prize_weight',
      'stock_quantity',
      'max_daily_wins',
      'status'
    ]

    const filteredData = {}
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        filteredData[field] = updateData[field]
      }
    })

    filteredData.updated_at = new Date()
    filteredData.updated_by = adminId

    await prize.update(filteredData)

    return res.json({
      success: true,
      data: {
        prize_id,
        updated_fields: Object.keys(filteredData),
        prize_info: {
          name: prize.name,
          type: prize.prize_type,
          value: parseFloat(prize.prize_value),
          stock: prize.stock_quantity,
          probability: parseFloat(prize.win_probability),
          weight: prize.prize_weight,
          status: prize.status
        }
      },
      message: '奖品信息更新成功',
      timestamp: BeijingTimeHelper.apiTimestamp()
    })
  } catch (error) {
    adminLogger.error('更新奖品信息失败', {
      adminId: req.user.user_id,
      error: error.message
    })

    return res.apiInternalError('服务器内部错误')
  }
})

/**
 * 管理员为特定用户设置奖品队列
 * POST /api/v4/unified-engine/admin/user-specific-queue
 */
router.post('/user-specific-queue', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const adminId = req.user.user_id
    const { target_user_id, campaign_id, prize_queue, admin_note, expires_in_days } = req.body

    console.log('管理员设置用户特定奖品队列', {
      adminId,
      target_user_id,
      campaign_id,
      prizeCount: prize_queue?.length,
      timestamp: BeijingTimeHelper.apiTimestamp()
    })

    // 参数验证
    if (
      !target_user_id ||
      !campaign_id ||
      !Array.isArray(prize_queue) ||
      prize_queue.length === 0
    ) {
      return res.apiBadRequest('缺少必要参数：target_user_id, campaign_id, prize_queue')
    }

    // 验证奖品队列格式
    for (let i = 0; i < prize_queue.length; i++) {
      const prize = prize_queue[i]
      if (!prize.prize_number || !prize.prize_id) {
        return res.apiBadRequest(`第${i + 1}个奖品缺少prize_number或prize_id`)
      }

      if (prize.prize_number < 1 || prize.prize_number > 10) {
        return res.apiBadRequest(`奖品编号必须在1-10之间，当前：${prize.prize_number}`)
      }
    }

    const models = require('../../../models')

    // 验证目标用户存在
    const targetUser = await models.User.findByPk(target_user_id)
    if (!targetUser) {
      return res.apiError('目标用户不存在', 'USER_NOT_FOUND')
    }

    // 验证活动存在
    const campaign = await models.LotteryCampaign.findByPk(campaign_id)
    if (!campaign) {
      return res.apiError('抽奖活动不存在', 'CAMPAIGN_NOT_FOUND')
    }

    // 验证所有奖品ID是否存在且属于该活动
    const prizeIds = prize_queue.map(p => p.prize_id)
    const existingPrizes = await models.LotteryPrize.findAll({
      where: {
        prize_id: { [models.Sequelize.Op.in]: prizeIds },
        campaign_id
      }
    })

    if (existingPrizes.length !== prizeIds.length) {
      return res.apiBadRequest('部分奖品不存在或不属于该活动')
    }

    // 计算过期时间
    let expiresAt = null
    if (expires_in_days && expires_in_days > 0) {
      expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + expires_in_days)
    }

    // 🎯 创建用户特定奖品队列
    const queueData = prize_queue.map(prize => ({
      ...prize,
      expires_at: expiresAt
    }))

    const createdQueue = await models.UserSpecificPrizeQueue.createUserQueue(
      target_user_id,
      campaign_id,
      queueData,
      adminId,
      admin_note || '管理员设置特定奖品队列'
    )

    // 记录管理操作日志
    console.log('✅ 用户特定奖品队列创建成功', {
      adminId,
      targetUserId: target_user_id,
      campaignId: campaign_id,
      queueLength: createdQueue.length,
      prizeSequence: prize_queue.map(p => p.prize_number).join(','),
      expiresAt: expiresAt?.toISOString()
    })

    return res.json({
      success: true,
      message: '用户特定奖品队列设置成功',
      data: {
        queue_records: createdQueue.length,
        target_user_id,
        campaign_id,
        prize_sequence: prize_queue.map(p => p.prize_number),
        expires_at: expiresAt,
        admin_note
      },
      timestamp: BeijingTimeHelper.apiTimestamp()
    })
  } catch (error) {
    console.error('❌ 设置用户特定奖品队列失败:', error)
    return res.apiInternalError('服务器内部错误')
  }
})

/**
 * 查看用户的特定奖品队列状态
 * GET /api/v4/unified-engine/admin/user-specific-queue/:user_id/:campaign_id
 */
router.get(
  '/user-specific-queue/:user_id/:campaign_id',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { user_id, campaign_id } = req.params
      const { include_completed = 'false' } = req.query

      console.log('管理员查看用户特定奖品队列', {
        adminId: req.user.user_id,
        user_id,
        campaign_id,
        include_completed,
        timestamp: BeijingTimeHelper.apiTimestamp()
      })

      const models = require('../../../models')

      // 构建查询条件
      const whereCondition = {
        user_id: parseInt(user_id),
        campaign_id: parseInt(campaign_id)
      }

      if (include_completed !== 'true') {
        whereCondition.status = { [models.Sequelize.Op.ne]: 'completed' }
      }

      // 查询用户特定奖品队列
      const queueRecords = await models.UserSpecificPrizeQueue.findAll({
        where: whereCondition,
        include: [
          {
            model: models.LotteryPrize,
            as: 'prize',
            attributes: ['prize_id', 'prize_name', 'prize_type', 'prize_value', 'description']
          },
          {
            model: models.User,
            as: 'user',
            attributes: ['user_id', 'mobile', 'nickname']
          },
          {
            model: models.User,
            as: 'admin',
            attributes: ['user_id', 'mobile', 'nickname']
          }
        ],
        order: [['queue_order', 'ASC']]
      })

      // 获取队列统计
      const stats = await models.UserSpecificPrizeQueue.getUserQueueStats(
        parseInt(user_id),
        parseInt(campaign_id)
      )

      return res.json({
        success: true,
        message: '用户特定奖品队列查询成功',
        data: {
          queue_records: queueRecords.map(record => ({
            queue_id: record.queue_id,
            prize_number: record.prize_number,
            queue_order: record.queue_order,
            status: record.status,
            prize: record.prize,
            distributed_at: record.distributed_at,
            expires_at: record.expires_at,
            admin_note: record.admin_note,
            created_at: record.created_at
          })),
          statistics: stats,
          user_info: queueRecords.length > 0 ? queueRecords[0].user : null,
          admin_info: queueRecords.length > 0 ? queueRecords[0].admin : null
        },
        timestamp: BeijingTimeHelper.apiTimestamp()
      })
    } catch (error) {
      console.error('❌ 查询用户特定奖品队列失败:', error)
      return res.apiInternalError('服务器内部错误')
    }
  }
)

/**
 * 取消用户的特定奖品队列（批量操作）
 * DELETE /api/v4/unified-engine/admin/user-specific-queue/:user_id/:campaign_id
 */
router.delete(
  '/user-specific-queue/:user_id/:campaign_id',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { user_id, campaign_id } = req.params
      const { reason } = req.body
      const adminId = req.user.user_id

      console.log('管理员取消用户特定奖品队列', {
        adminId,
        user_id,
        campaign_id,
        reason,
        timestamp: BeijingTimeHelper.apiTimestamp()
      })

      const models = require('../../../models')

      // 查询待取消的队列记录
      const pendingRecords = await models.UserSpecificPrizeQueue.findAll({
        where: {
          user_id: parseInt(user_id),
          campaign_id: parseInt(campaign_id),
          status: 'pending'
        }
      })

      if (pendingRecords.length === 0) {
        return res.json({
          success: true,
          message: '该用户没有待发放的特定奖品队列',
          data: { cancelled_count: 0 },
          timestamp: BeijingTimeHelper.apiTimestamp()
        })
      }

      // 批量更新状态为已取消
      const [updatedCount] = await models.UserSpecificPrizeQueue.update(
        {
          status: 'cancelled',
          admin_note: `${reason ? reason + ' - ' : ''}管理员取消 (${new Date().toISOString()})`,
          updated_at: new Date()
        },
        {
          where: {
            user_id: parseInt(user_id),
            campaign_id: parseInt(campaign_id),
            status: 'pending'
          }
        }
      )

      console.log('✅ 用户特定奖品队列取消成功', {
        adminId,
        user_id,
        campaign_id,
        cancelledCount: updatedCount
      })

      return res.json({
        success: true,
        message: '用户特定奖品队列取消成功',
        data: {
          cancelled_count: updatedCount,
          reason
        },
        timestamp: BeijingTimeHelper.apiTimestamp()
      })
    } catch (error) {
      console.error('❌ 取消用户特定奖品队列失败:', error)
      return res.apiInternalError('服务器内部错误')
    }
  }
)

// 管理端：为特定用户分配特定奖品 - V4新增功能
router.post('/assign-user-prizes', authenticateToken, requireAdmin, async (req, res) => {
  const transaction = await sequelize.transaction()

  try {
    const {
      user_id, // 目标用户ID
      campaign_id, // 活动ID
      prize_assignments, // 奖品分配数组，格式：[{prize_number: 1, prize_id: 123}, {prize_number: 2, prize_id: 124}, ...]
      admin_note, // 管理员备注
      expires_at // 过期时间（可选）
    } = req.body

    console.log('🎯 V4管理员分配奖品请求:', {
      user_id,
      campaign_id,
      assignments: prize_assignments,
      admin: req.user.user_id
    })

    // 1. 验证参数
    if (!user_id || !campaign_id || !prize_assignments || !Array.isArray(prize_assignments)) {
      await transaction.rollback()
      return res.apiBadRequest('请求参数错误')
    }

    // 验证奖品分配数组长度（最多5个）
    if (prize_assignments.length === 0 || prize_assignments.length > 5) {
      await transaction.rollback()
      return res.apiBadRequest('请求参数错误')
    }

    // 验证奖品编号范围（1-10号）
    const invalidPrizes = prize_assignments.filter(
      p => !p.prize_number || p.prize_number < 1 || p.prize_number > 10 || !p.prize_id
    )
    if (invalidPrizes.length > 0) {
      await transaction.rollback()
      return res.apiBadRequest('请求参数错误')
    }

    // 2. 验证用户和活动是否存在
    const [user, campaign] = await Promise.all([
      models.User.findByPk(user_id),
      models.LotteryCampaign.findByPk(campaign_id)
    ])

    if (!user) {
      await transaction.rollback()
      return res.apiNotFound('资源不存在')
    }

    if (!campaign || !campaign.isActive()) {
      await transaction.rollback()
      return res.apiNotFound('资源不存在')
    }

    // 3. 验证奖品是否存在且属于该活动
    const prizeIds = prize_assignments.map(p => p.prize_id)
    const prizes = await models.LotteryPrize.findAll({
      where: {
        prize_id: { [Op.in]: prizeIds },
        campaign_id
      },
      transaction
    })

    if (prizes.length !== prize_assignments.length) {
      await transaction.rollback()
      return res.apiBadRequest('请求参数错误')
    }

    // 4. 清除该用户在该活动中的现有预设奖品（如果有）
    const deletedCount = await models.UserSpecificPrizeQueue.destroy({
      where: {
        user_id,
        campaign_id,
        status: 'pending'
      },
      transaction
    })

    if (deletedCount > 0) {
      console.log(`🗑️ 清除用户${user_id}现有预设奖品${deletedCount}个`)
    }

    // 5. 创建新的奖品队列
    const queueData = prize_assignments.map((assignment, index) => ({
      user_id,
      campaign_id,
      prize_id: assignment.prize_id,
      prize_number: assignment.prize_number,
      queue_order: index + 1, // 队列顺序从1开始
      admin_id: req.user.user_id,
      admin_note: admin_note || `管理员预设奖品：${assignment.prize_number}号奖品`,
      expires_at: expires_at || null,
      status: 'pending',
      created_at: new Date(),
      updated_at: new Date()
    }))

    const createdQueues = await models.UserSpecificPrizeQueue.bulkCreate(queueData, {
      transaction
    })

    await transaction.commit()

    // 6. 记录管理操作日志
    console.log(
      `✅ V4管理员${req.user.user_id}为用户${user_id}分配了${prize_assignments.length}个预设奖品`
    )

    // 返回成功结果
    return res.json({
      success: true,
      message: `成功为用户${user.username}分配了${prize_assignments.length}个预设奖品`,
      data: {
        user_id,
        username: user.username,
        campaign_id,
        assigned_prizes: prize_assignments.map((assignment, index) => ({
          queue_order: index + 1,
          prize_number: assignment.prize_number,
          prize_id: assignment.prize_id,
          prize_name: prizes.find(p => p.prize_id === assignment.prize_id)?.prize_name
        })),
        total_assigned: createdQueues.length,
        assigned_by: req.user.username,
        assigned_at: new Date().toISOString()
      }
    })
  } catch (error) {
    await transaction.rollback()
    console.error('❌ V4管理员分配奖品失败:', error)
    return res.apiInternalError('服务器内部错误')
  }
})

// 获取用户的预设奖品队列状态 - V4新增功能
router.get(
  '/user-prize-queue/:user_id/:campaign_id',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { user_id, campaign_id } = req.params

      const queueItems = await models.UserSpecificPrizeQueue.findAll({
        where: {
          user_id: parseInt(user_id),
          campaign_id: parseInt(campaign_id)
        },
        include: [
          {
            model: models.LotteryPrize,
            as: 'prize',
            attributes: ['prize_id', 'prize_name', 'prize_type', 'prize_value']
          },
          {
            model: models.User,
            as: 'user',
            attributes: ['user_id', 'username']
          },
          {
            model: models.User,
            as: 'admin',
            attributes: ['user_id', 'username']
          }
        ],
        order: [['queue_order', 'ASC']]
      })

      // 统计信息
      const stats = {
        total: queueItems.length,
        pending: queueItems.filter(item => item.status === 'pending').length,
        completed: queueItems.filter(item => item.status === 'completed').length,
        expired: queueItems.filter(item => item.status === 'expired').length,
        cancelled: queueItems.filter(item => item.status === 'cancelled').length
      }

      return res.json({
        success: true,
        data: {
          user_id: parseInt(user_id),
          campaign_id: parseInt(campaign_id),
          queue_items: queueItems,
          statistics: stats
        }
      })
    } catch (error) {
      console.error('❌ 获取用户奖品队列失败:', error)
      return res.apiInternalError('服务器内部错误')
    }
  }
)

// 辅助函数
function parseTimeRange (timeRange) {
  const timeRanges = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  }

  return timeRanges[timeRange] || timeRanges['24h']
}

async function getDecisionStats () {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [totalToday, winsToday, totalAll] = await Promise.all([
    models.DecisionRecord.count({
      where: {
        created_at: { [models.Sequelize.Op.gte]: today }
      }
    }),
    models.DecisionRecord.count({
      where: {
        created_at: { [models.Sequelize.Op.gte]: today },
        decision_result: 'win'
      }
    }),
    models.DecisionRecord.count()
  ])

  return {
    totalToday,
    winsToday,
    lossesToday: totalToday - winsToday,
    winRateToday: totalToday > 0 ? ((winsToday / totalToday) * 100).toFixed(2) + '%' : '0%',
    totalAllTime: totalAll
  }
}

async function getRecentAlerts () {
  // 这里可以集成告警系统
  return []
}

async function calculateWinRateStats (whereConditions) {
  const records = await models.DecisionRecord.findAll({
    where: whereConditions,
    attributes: ['decision_result', 'final_probability']
  })

  const winCount = records.filter(r => r.decision_result === 'win').length
  const totalCount = records.length

  return {
    totalDecisions: totalCount,
    winCount,
    loseCount: totalCount - winCount,
    winRate: totalCount > 0 ? winCount / totalCount : 0,
    averageProbability:
      records.length > 0
        ? records.reduce((sum, r) => sum + parseFloat(r.final_probability || 0), 0) / records.length
        : 0
  }
}

async function calculateGuaranteeStats (whereConditions) {
  const guaranteeRecords = await models.DecisionRecord.findAll({
    where: {
      ...whereConditions,
      guarantee_triggered: true
    },
    attributes: ['guarantee_type', 'consecutive_losses']
  })

  const guaranteeTypes = {}
  guaranteeRecords.forEach(record => {
    const type = record.guarantee_type || 'unknown'
    guaranteeTypes[type] = (guaranteeTypes[type] || 0) + 1
  })

  return {
    totalGuaranteeTriggered: guaranteeRecords.length,
    guaranteeTypes,
    averageConsecutiveLosses:
      guaranteeRecords.length > 0
        ? guaranteeRecords.reduce((sum, r) => sum + (r.consecutive_losses || 0), 0) /
          guaranteeRecords.length
        : 0
  }
}

function calculateAverageExecutionTime (records) {
  const validTimes = records.map(r => r.execution_time_ms).filter(time => time && time > 0)

  return validTimes.length > 0
    ? Math.round(validTimes.reduce((sum, time) => sum + time, 0) / validTimes.length)
    : 0
}

function analyzeProbabilityDistribution (logs) {
  const distribution = { low: 0, medium: 0, high: 0 }

  logs.forEach(log => {
    const prob = parseFloat(log.output_probability || 0)
    if (prob < 0.2) {
      distribution.low++
    } else if (prob < 0.5) {
      distribution.medium++
    } else {
      distribution.high++
    }
  })

  return distribution
}

function analyzeUserSegments (records) {
  const segments = { admin: 0, standard: 0 } // ✅ V4简化：只区分管理员和标准用户

  records.forEach(record => {
    if (record.user?.is_admin) {
      segments.admin++
    } else {
      segments.standard++ // ✅ V4简化：统一为标准用户
    }
  })

  return segments
}

function analyzeCampaignPerformance (records) {
  const campaigns = {}

  records.forEach(record => {
    const campaignName = record.campaign?.campaign_name || 'Unknown'
    if (!campaigns[campaignName]) {
      campaigns[campaignName] = { total: 0, wins: 0, losses: 0 }
    }
    campaigns[campaignName].total++
    if (record.decision_result === 'win') {
      campaigns[campaignName].wins++
    } else {
      campaigns[campaignName].losses++
    }
  })

  // 计算胜率
  Object.keys(campaigns).forEach(campaignName => {
    const campaign = campaigns[campaignName]
    campaign.winRate = campaign.total > 0 ? campaign.wins / campaign.total : 0
  })

  return campaigns
}

function validateEngineConfig (configType, configData) {
  // 基本配置类型验证
  const validTypes = ['probability', 'guarantee', 'pool_selection', 'performance']

  if (!validTypes.includes(configType)) {
    return {
      valid: false,
      message: `无效的配置类型: ${configType}`
    }
  }

  // 配置数据验证
  if (!configData || typeof configData !== 'object') {
    return {
      valid: false,
      message: '配置数据必须是有效的对象'
    }
  }

  return { valid: true }
}

async function applyEngineConfig (configType, configData, adminId) {
  // 🔴 实际的引擎配置应用逻辑（替换模拟结果）
  try {
    const models = require('../../../models')

    // 记录配置变更日志
    console.log('应用引擎配置', {
      configType,
      adminId,
      timestamp: BeijingTimeHelper.apiTimestamp()
    })

    // 根据配置类型应用不同的配置
    switch (configType) {
    case 'probability':
      // 应用概率配置
      await applyProbabilityConfig(configData, adminId)
      break

    case 'strategy':
      // 应用策略配置
      await applyStrategyConfig(configData, adminId)
      break

    case 'general':
      // 应用通用配置
      await applyGeneralConfig(configData, adminId)
      break

    default:
      throw new Error(`未知的配置类型: ${configType}`)
    }

    // ✅ 修复：记录配置应用成功，使用新字段标准
    await models.DecisionRecord.create({
      user_id: adminId, // 管理员作为用户ID
      campaign_id: 1, // 系统配置操作，使用默认活动ID
      strategy_type: 'management',
      user_context: {
        admin_operation: true,
        operation_type: 'CONFIG_UPDATE'
      },
      probability_data: {
        config_type: configType,
        config_data: configData
      },
      is_winner: false, // ✅ 配置操作不涉及中奖
      decision_metadata: {
        operation_type: 'CONFIG_UPDATE',
        admin_id: adminId,
        applied: true
      }
    })

    return {
      applied: true,
      affectedComponents: [configType],
      timestamp: BeijingTimeHelper.apiTimestamp()
    }
  } catch (error) {
    console.error('应用引擎配置失败:', error)
    throw error
  }
}

// 应用概率配置的具体实现
async function applyProbabilityConfig (configData, adminId) {
  const models = require('../../../models')

  // 更新概率配置
  if (configData.probability_settings) {
    const { probability_settings } = configData

    // 这里可以更新数据库中的概率配置
    await models.BusinessConfigs.upsert({
      config_key: 'probability_settings',
      config_value: JSON.stringify(probability_settings),
      updated_by: adminId,
      updated_at: new Date()
    })
  }
}

// 应用策略配置的具体实现
async function applyStrategyConfig (configData, adminId) {
  const models = require('../../../models')

  // 更新策略配置
  if (configData.strategy_settings) {
    const { strategy_settings } = configData

    // 更新策略配置
    await models.BusinessConfigs.upsert({
      config_key: 'strategy_settings',
      config_value: JSON.stringify(strategy_settings),
      updated_by: adminId,
      updated_at: new Date()
    })
  }
}

// 应用通用配置的具体实现
async function applyGeneralConfig (configData, adminId) {
  const models = require('../../../models')

  // 更新通用配置
  if (configData.general_settings) {
    const { general_settings } = configData

    // 更新通用配置
    await models.BusinessConfigs.upsert({
      config_key: 'general_settings',
      config_value: JSON.stringify(general_settings),
      updated_by: adminId,
      updated_at: new Date()
    })
  }
}

/**
 * 获取用户列表API (管理员)
 * GET /api/v4/unified-engine/admin/users
 */
router.get('/users', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token || !token.startsWith('dev_token_')) {
      return res.apiError('Token无效', 'INVALID_TOKEN')
    }

    const adminId = token.split('_')[2]

    // 验证管理员权限
    const admin = await models.User.findByPk(adminId)
    if (!admin || !admin.is_admin) {
      return res.apiError('权限不足，需要管理员权限', 'INSUFFICIENT_PERMISSIONS')
    }

    const { page = 1, limit = 20 } = req.query
    const offset = (page - 1) * limit

    // 查询用户列表
    const { count, rows: users } = await models.User.findAndCountAll({
      attributes: ['user_id', 'mobile', 'nickname', 'is_admin', 'status', 'created_at'],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    })

    return res.json({
      success: true,
      message: '获取用户列表成功',
      data: {
        users: users.map(user => ({
          id: user.user_id,
          mobile: user.mobile,
          nickname: user.nickname,
          is_admin: user.is_admin,
          status: user.status,
          created_at: user.created_at
        })),
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total: count,
          total_pages: Math.ceil(count / limit)
        }
      },
      timestamp: BeijingTimeHelper.apiTimestamp()
    })
  } catch (error) {
    console.error('V4获取用户列表错误:', error)
    return res.apiInternalError('获取用户列表失败')
  }
})

/**
 * 积分调整API (管理员)
 * POST /api/v4/unified-engine/admin/points/adjust
 */
router.post('/points/adjust', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const adminId = req.user.user_id
    const { user_id, points, reason, operation } = req.body

    console.log('🎯 管理员积分调整请求', {
      adminId,
      user_id,
      points,
      reason,
      operation,
      timestamp: BeijingTimeHelper.apiTimestamp()
    })

    // 🎯 业务逻辑验证：数据完整性约束
    if (!user_id || typeof points !== 'number' || !reason) {
      return res.apiError('缺少必要参数：user_id、points、reason', 'MISSING_PARAMETERS')
    }

    // 业务规则验证：异常大的负数应该被拒绝
    if (points < -99999) {
      return res.apiError('积分调整数值异常，不允许超过-99999积分', 'INVALID_POINTS_VALUE')
    }

    // 验证操作类型
    if (!operation || !['add', 'subtract', 'set'].includes(operation)) {
      return res.apiError('操作类型必须是：add、subtract、set 之一', 'INVALID_OPERATION')
    }

    // 验证目标用户存在
    const targetUser = await models.User.findByPk(user_id)
    if (!targetUser) {
      return res.apiError('目标用户不存在', 'USER_NOT_FOUND')
    }

    // 获取用户积分账户
    let userPointsAccount = await models.UserPointsAccount.findOne({
      where: { user_id }
    })

    if (!userPointsAccount) {
      // 创建新的积分账户
      userPointsAccount = await models.UserPointsAccount.create({
        user_id,
        available_points: 0,
        total_earned: 0,
        total_consumed: 0,
        account_level: 1
      })
    }

    const oldPoints = parseFloat(userPointsAccount.available_points) || 0
    let newPoints = oldPoints

    // 执行积分调整
    switch (operation) {
    case 'add':
      newPoints = oldPoints + points
      break
    case 'subtract':
      newPoints = oldPoints - points
      break
    case 'set':
      newPoints = points
      break
    }

    // 确保积分不为负数
    if (newPoints < 0) {
      return res.apiError('积分调整后不能为负数', 'NEGATIVE_POINTS_NOT_ALLOWED')
    }

    // 更新积分账户
    await userPointsAccount.update({
      available_points: newPoints,
      updated_at: new Date()
    })

    // 创建积分变更记录
    await models.PointsTransaction.create({
      user_id,
      transaction_type: operation === 'add' ? 'earn' : 'consume',
      points: Math.abs(points),
      reason: `管理员调整：${reason}`,
      admin_id: adminId,
      status: 'completed'
    })

    return res.apiSuccess(
      {
        user_id,
        old_points: oldPoints,
        adjustment: points,
        new_points: newPoints,
        operation,
        reason,
        adjusted_by: adminId,
        adjusted_at: new Date().toISOString()
      },
      '积分调整成功',
      'POINTS_ADJUST_SUCCESS'
    )
  } catch (error) {
    console.error('积分调整失败', {
      adminId: req.user.user_id,
      error: error.message
    })

    return res.apiInternalError('积分调整失败', error.message, 'POINTS_ADJUST_ERROR')
  }
})

module.exports = router
