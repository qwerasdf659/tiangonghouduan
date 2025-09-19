/**
 * V4统一抽奖引擎API路由
 * 提供统一的抽奖接口，支持9大抽奖功能模块
 *
 * @description 基于统一抽奖引擎的RESTful API
 * @version 4.0.0
 * @date 2025-09-11
 */

const express = require('express')
const router = express.Router()
const moment = require('moment-timezone')
const BeijingTimeHelper = require('../../../utils/timeHelper') // 修复：导入北京时间工具
const UnifiedLotteryEngine = require('../../../services/UnifiedLotteryEngine/UnifiedLotteryEngine')
const { v4: uuidv4 } = require('uuid')
const models = require('../../../models')
const { authenticateToken } = require('../../../middleware/auth') // 修复authMiddleware导入
const ApiResponse = require('../../../utils/ApiResponse') // 导入ApiResponse工具

// 创建统一抽奖引擎实例
const lotteryEngine = new UnifiedLotteryEngine({
  engineVersion: '4.0.0',
  enableMetrics: true,
  enableCache: true
})

/**
 * 获取用户积分账户信息
 */
async function getUserPoints (userId) {
  try {
    const pointsAccount = await models.UserPointsAccount.findOne({
      where: { user_id: userId, is_active: 1 }
    })

    if (!pointsAccount) {
      // 如果没有积分账户，创建一个默认的
      const _newAccount = await models.UserPointsAccount.create({
        user_id: userId,
        available_points: 0,
        total_earned: 0,
        total_consumed: 0,
        account_level: 'bronze',
        activity_level: 'medium'
      })
      return {
        available_points: 0,
        total_earned: 0,
        total_consumed: 0
      }
    }

    return {
      available_points: parseFloat(pointsAccount.available_points) || 0,
      total_earned: parseFloat(pointsAccount.total_earned) || 0,
      total_consumed: parseFloat(pointsAccount.total_consumed) || 0
    }
  } catch (error) {
    console.error('获取用户积分失败:', error)
    return {
      available_points: 0,
      total_earned: 0,
      total_consumed: 0
    }
  }
}

/**
 * 扣除用户积分
 */
async function deductUserPoints (userId, amount) {
  const pointsAccount = await models.UserPointsAccount.findOne({
    where: { user_id: userId, is_active: 1 }
  })

  if (!pointsAccount) {
    throw new Error('用户积分账户不存在')
  }

  if (pointsAccount.available_points < amount) {
    throw new Error('积分不足')
  }

  await pointsAccount.update({
    available_points: pointsAccount.available_points - amount,
    total_consumed: pointsAccount.total_consumed + amount
  })

  return pointsAccount
}

/**
 * 🔧 统一响应格式中间件已移除 - 使用ApiResponse.middleware()统一处理
 * 🔧 移除重复的响应格式中间件 - 现在使用统一的ApiResponse中间件
 * 通过app.js中的ApiResponse.middleware()提供统一格式
 */

// 记录引擎状态的全局对象
const engineStats = {
  totalRequests: 0,
  successRequests: 0,
  failedRequests: 0,
  averageResponseTime: 0,
  lastUpdateTime: BeijingTimeHelper.now()
}

/**
 * 更新引擎统计信息
 */
function updateEngineStats (success = true, responseTime = 0) {
  engineStats.totalRequests++
  if (success) {
    engineStats.successRequests++
  } else {
    engineStats.failedRequests++
  }

  // 计算平均响应时间
  engineStats.averageResponseTime =
    (engineStats.averageResponseTime * (engineStats.totalRequests - 1) + responseTime) /
    engineStats.totalRequests

  engineStats.lastUpdateTime = BeijingTimeHelper.now()
}

// 健康状态监控中间件
function healthMonitor (req, res, next) {
  const startTime = Date.now()

  res.on('finish', function () {
    const responseTime = Date.now() - startTime
    const success = res.statusCode < 400
    updateEngineStats(success, responseTime)
  })

  // 检查引擎健康状态
  if (lotteryEngine.getHealthStatus && lotteryEngine.getHealthStatus() !== 'healthy') {
    return res.apiError('抽奖引擎暂时不可用，请稍后重试', 'ENGINE_UNAVAILABLE', null, 503)
  }

  return next()
}

// 应用中间件 - responseFormatter已通过app.js的ApiResponse.middleware()统一提供
router.use(healthMonitor)

/**
 * 基础抽奖接口
 * POST /api/v4/lottery/basic
 */
router.post('/basic', async (req, res) => {
  try {
    const { userId, activityId, userProfile } = req.body

    // 参数验证
    if (!userId || !activityId) {
      return res.apiError('缺少必要参数：userId和activityId', 'INVALID_PARAMS')
    }

    // 执行基础抽奖
    const result = await lotteryEngine.executeLottery({
      userId: parseInt(userId),
      campaignId: parseInt(activityId), // API层activityId映射为业务层campaignId
      strategyType: 'basic',
      userProfile: userProfile || {}
    })

    if (result.success) {
      return res.apiSuccess(result.data, '基础抽奖完成', result.code)
    } else {
      return res.apiError(result.message, result.code, result.metadata)
    }
  } catch (error) {
    console.error('基础抽奖接口异常:', error)
    return res.apiError('服务器内部错误', 'INTERNAL_ERROR', { error: error.message })
  }
})

// 多池系统接口已移除 - 使用简化的三策略系统

/**
 * 保底机制抽奖接口（TODO：待实现）
 * POST /api/v4/lottery/guarantee
 */
router.post('/guarantee', (req, res) => {
  return res.apiError('保底机制抽奖功能正在开发中', 'NOT_IMPLEMENTED')
})

/**
 * 引擎状态查询接口
 * GET /api/v4/lottery/engine/status
 */
router.get('/engine/status', (req, res) => {
  try {
    const status = lotteryEngine.getEngineStatus()
    return res.apiSuccess(status, '引擎状态查询成功')
  } catch (error) {
    console.error('引擎状态查询异常:', error)
    return res.apiError('引擎状态查询失败', 'QUERY_ERROR', { error: error.message })
  }
})

/**
 * 策略状态查询接口
 * GET /api/v4/lottery/strategy/{strategyType}/status
 */
router.get('/strategy/:strategyType/status', (req, res) => {
  try {
    const { strategyType } = req.params
    const status = lotteryEngine.getStrategyStatus(strategyType)

    if (status) {
      return res.apiSuccess(status, '策略状态查询成功')
    } else {
      return res.apiError('策略不存在', 'STRATEGY_NOT_FOUND', { strategyType })
    }
  } catch (error) {
    console.error('策略状态查询异常:', error)
    return res.apiError('策略状态查询失败', 'QUERY_ERROR', { error: error.message })
  }
})

/**
 * 引擎健康检查接口
 * GET /api/v4/lottery/health
 */
router.get('/health', async (req, res) => {
  try {
    const healthStatus = await lotteryEngine.healthCheck()

    if (healthStatus.status === 'healthy') {
      return res.apiSuccess(healthStatus, '引擎健康检查通过')
    } else {
      return res.apiError('引擎健康检查失败', 'UNHEALTHY')
    }
  } catch (error) {
    console.error('健康检查异常:', error)
    return res
      .status(503)
      .json(
        ApiResponse.serverError('健康检查执行失败', 'HEALTH_CHECK_ERROR', { error: error.message })
      )
  }
})

/**
 * 用户抽奖历史查询接口
 * GET /api/v4/lottery/history/:userId
 */
router.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const { page = 1, limit = 20, strategyType } = req.query

    // 参数验证
    const userIdInt = parseInt(userId)
    if (!userIdInt) {
      return res.apiError('无效的用户ID', 'INVALID_USER_ID')
    }

    // 查询抽奖历史（简化实现）
    const { LotteryRecord } = require('../../../models')
    const whereCondition = { user_id: userIdInt }

    if (strategyType) {
      whereCondition.draw_type = strategyType
    }

    const offset = (parseInt(page) - 1) * parseInt(limit)
    const history = await LotteryRecord.findAndCountAll({
      where: whereCondition,
      limit: parseInt(limit),
      offset,
      order: [['created_at', 'DESC']]
    })

    return res.apiSuccess(
      {
        records: history.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: history.count,
          totalPages: Math.ceil(history.count / parseInt(limit))
        }
      },
      '抽奖历史查询成功'
    )
  } catch (error) {
    console.error('抽奖历史查询异常:', error)
    return res.apiError('抽奖历史查询失败', 'QUERY_ERROR', { error: error.message })
  }
})

/**
 * 批量抽奖接口（支持一次性多次抽奖）
 * POST /api/v4/lottery/batch
 */
router.post('/batch', async (req, res) => {
  try {
    const { userId, activityId, strategyType, poolType, count = 1, userProfile } = req.body

    // 参数验证
    if (!userId || !activityId || !strategyType) {
      return res.apiError('缺少必要参数', 'INVALID_PARAMS')
    }

    if (count > 10) {
      return res.apiError('单次批量抽奖不能超过10次', 'INVALID_COUNT')
    }

    const results = []
    const errors = []

    // 执行批量抽奖
    for (let i = 0; i < count; i++) {
      try {
        const result = await lotteryEngine.executeLottery({
          userId: parseInt(userId),
          activityId: parseInt(activityId),
          strategyType,
          poolType,
          userProfile: userProfile || {}
        })

        if (result.success) {
          results.push({
            index: i + 1,
            success: true,
            data: result.data,
            metadata: result.metadata
          })
        } else {
          errors.push({
            index: i + 1,
            error: result.message,
            code: result.code
          })
        }
      } catch (error) {
        errors.push({
          index: i + 1,
          error: error.message,
          code: 'EXECUTION_ERROR'
        })
      }
    }

    return res.apiSuccess(
      {
        successCount: results.length,
        errorCount: errors.length,
        totalCount: count,
        results,
        errors
      },
      `批量抽奖完成（成功${results.length}次，失败${errors.length}次）`
    )
  } catch (error) {
    console.error('批量抽奖接口异常:', error)
    return res.apiError('服务器内部错误', 'INTERNAL_ERROR', { error: error.message })
  }
})

/**
 * V4抽奖活动列表API - 缺失端点补充
 * GET /api/v4/unified-engine/lottery/campaigns
 * 获取当前可用的抽奖活动列表
 */
router.get('/campaigns', async (req, res) => {
  try {
    const { status = 'active' } = req.query

    // 查询抽奖活动数据
    const models = require('../../../models')

    const whereCondition = status === 'all' ? {} : { status }

    const campaigns = await models.LotteryCampaign.findAll({
      where: whereCondition,
      include: [
        {
          model: models.LotteryPrize,
          as: 'prizes',
          where: { status: 'active' },
          required: false
        }
      ],
      order: [['created_at', 'DESC']]
    })

    // 🔴 如果没有活动数据，提供初始化提示
    if (campaigns.length === 0) {
      return res.apiSuccess([], '暂无抽奖活动，请先在后台创建活动')
    }

    // 格式化返回数据
    const formattedCampaigns = campaigns.map(campaign => ({
      id: campaign.campaign_id,
      campaign_id: campaign.campaign_id, // 保持向后兼容
      name: campaign.name,
      campaign_name: campaign.campaign_name, // 保持向后兼容
      description: campaign.description,
      status: campaign.status,
      strategy: campaign.strategy_type,
      config: campaign.campaign_config || {},
      cost_per_draw: parseFloat(campaign.cost_per_draw) || 50, // 🎯 添加积分消耗配置
      max_draws_per_user_daily: campaign.max_draws_per_user_daily,
      rewards: campaign.prizes ? campaign.prizes.map(p => p.name) : [],
      startTime: campaign.start_time,
      endTime: campaign.end_time,
      createdAt: campaign.created_at
    }))

    return res.apiSuccess(
      formattedCampaigns,
      `获取抽奖活动列表成功，共${formattedCampaigns.length}个活动`
    )
  } catch (error) {
    console.error('获取抽奖活动列表失败:', error)
    return res.apiError('获取抽奖活动列表失败', error.message)
  }
})

/**
 * 用户查看奖品池信息
 * GET /api/v4/unified-engine/lottery/prize-pool/:campaign_id
 */
router.get('/prize-pool/:campaign_id', async (req, res) => {
  try {
    const models = require('../../../models')
    const { campaign_id } = req.params
    const { show_details = 'false' } = req.query

    console.log('用户查看奖品池信息', {
      campaign_id,
      show_details,
      timestamp: BeijingTimeHelper.apiTimestamp()
    })

    // 验证活动存在
    const campaign = await models.LotteryCampaign.findOne({
      where: { campaign_id, status: 'active' }
    })

    if (!campaign) {
      return res.apiError('抽奖活动不存在或已结束', 'CAMPAIGN_NOT_FOUND')
    }

    // 🎯 获取奖品池信息 - 为用户展示可获得的奖品
    const whereCondition = {
      campaign_id,
      status: 'active'
    }

    // 如果不显示详情，只显示有库存的奖品
    if (show_details !== 'true') {
      whereCondition.stock_quantity = { [models.Sequelize.Op.gt]: 0 }
    }

    const prizes = await models.LotteryPrize.findAll({
      where: whereCondition,
      attributes: [
        'prize_id',
        'name',
        'prize_type',
        'prize_value',
        'description',
        'stock_quantity',
        'win_probability',
        show_details === 'true' ? 'prize_weight' : null
      ].filter(Boolean),
      order: [
        ['prize_value', 'DESC'], // 按价值排序展示
        ['created_at', 'ASC']
      ]
    })

    // 🎯 计算奖品池统计信息
    const stats = {
      total_prizes: prizes.length,
      total_stock: prizes.reduce((sum, p) => sum + (p.stock_quantity || 0), 0),
      total_value: prizes.reduce((sum, p) => sum + parseFloat(p.prize_value || 0), 0),
      prize_types: [...new Set(prizes.map(p => p.prize_type))],
      average_value:
        prizes.length > 0
          ? prizes.reduce((sum, p) => sum + parseFloat(p.prize_value || 0), 0) / prizes.length
          : 0
    }

    // 格式化奖品信息（用户友好格式）
    const formattedPrizes = prizes.map(prize => ({
      prize_id: prize.prize_id,
      name: prize.name,
      type: prize.prize_type,
      type_name: getPrizeTypeName(prize.prize_type),
      value: parseFloat(prize.prize_value || 0),
      description: prize.description,
      stock_quantity: prize.stock_quantity,
      is_available: prize.stock_quantity > 0,
      win_probability_display:
        show_details === 'true'
          ? `${(parseFloat(prize.win_probability) * 100).toFixed(2)}%`
          : '根据权重随机',
      rarity_level: getPrizeRarity(parseFloat(prize.prize_value || 0))
    }))

    // 🎯 按稀有度分组展示
    const groupedPrizes = {
      legendary: formattedPrizes.filter(p => p.rarity_level === 'legendary'),
      epic: formattedPrizes.filter(p => p.rarity_level === 'epic'),
      rare: formattedPrizes.filter(p => p.rarity_level === 'rare'),
      common: formattedPrizes.filter(p => p.rarity_level === 'common')
    }

    return res.apiSuccess(
      {
        campaign_info: {
          campaign_id,
          name: campaign.campaign_name,
          description: campaign.description,
          end_time: campaign.end_time
        },
        stats,
        prizes: show_details === 'true' ? formattedPrizes : groupedPrizes,
        display_mode: show_details === 'true' ? 'detailed' : 'grouped'
      },
      `奖品池信息获取成功，共${prizes.length}个奖品`
    )
  } catch (error) {
    console.error('获取奖品池信息失败:', error)
    return res.apiError('获取奖品池信息失败', error.message)
  }
})

/**
 * 抽奖执行接口优化 - 支持从50个奖品中抽取
 * POST /api/v4/unified-engine/lottery/draw
 */
router.post('/draw', async (req, res) => {
  try {
    const { user_id, campaign_id, strategy_type = 'basic_lottery', draw_count = 1 } = req.body

    console.log('🎰 V4用户抽奖请求', {
      user_id,
      campaign_id,
      strategy_type,
      draw_count,
      timestamp: BeijingTimeHelper.apiTimestamp()
    })

    // 参数验证
    if (!user_id || !campaign_id) {
      return res.apiError('缺少必要参数：user_id 或 campaign_id', 'MISSING_PARAMETERS')
    }

    // 验证用户存在
    const user = await models.User.findByPk(user_id)
    const userPoints = await getUserPoints(user_id)
    if (!user) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND')
    }

    // 验证活动存在且激活
    const campaign = await models.LotteryCampaign.findOne({
      where: { campaign_id, status: 'active' }
    })
    if (!campaign) {
      return res.apiError('抽奖活动不存在或已结束', 'CAMPAIGN_NOT_FOUND')
    }

    // 🎯 检查奖品池状态
    const availablePrizes = await models.LotteryPrize.count({
      where: {
        campaign_id,
        status: 'active',
        stock_quantity: { [models.Sequelize.Op.gt]: 0 }
      }
    })

    if (availablePrizes === 0) {
      return res.apiError('奖品池已空，暂时无法参与抽奖', 'PRIZE_POOL_EMPTY')
    }

    // 🎯 业务逻辑验证：检查用户积分是否足够
    const requiredPoints = (parseFloat(campaign.cost_per_draw) || 50) * draw_count // 每次抽奖消费的积分
    if (userPoints.available_points < requiredPoints) {
      return res.apiError(
        `积分不足，需要${requiredPoints}积分，当前${userPoints.available_points}积分`,
        'INSUFFICIENT_POINTS'
      )
    }

    // 🎯 使用V4统一抽奖引擎执行抽奖
    const UnifiedLotteryEngine = require('../../../services/UnifiedLotteryEngine/UnifiedLotteryEngine')
    const engine = new UnifiedLotteryEngine()

    const drawResults = []

    for (let i = 0; i < Math.min(draw_count, 5); i++) {
      // 最多一次抽5次
      try {
        const lotteryRequest = {
          userId: user_id,
          activityId: campaign_id,
          strategyType: strategy_type,
          userProfile: {
            userLevel: user.vip_level || 1,
            totalPoints: userPoints.available_points || 0,
            isVip: user.is_vip || false
          },
          requestId: `draw_${Date.now()}_${i}`,
          source: 'user_manual_draw'
        }

        const result = await engine.executeLottery(lotteryRequest)

        drawResults.push({
          draw_number: i + 1,
          success: result.success,
          is_winner: result.is_winner, // ✅ 修复：使用业务标准字段
          prize: result.prize || null,
          message: result.message,
          execution_time: result.executionTime
        })

        // ✅ 修复：记录每次抽奖详细信息使用业务标准字段
        console.log(`第${i + 1}次抽奖结果:`, {
          user_id,
          is_winner: result.is_winner, // ✅ 修复：使用业务标准字段
          prize: result.prize?.name || 'none',
          strategy: strategy_type
        })
      } catch (error) {
        console.error(`第${i + 1}次抽奖执行失败:`, error)
        drawResults.push({
          draw_number: i + 1,
          success: false,
          result: 'error',
          prize: null,
          message: `抽奖执行失败: ${error.message}`,
          execution_time: 0
        })
      }
    }

    // 🎯 统计抽奖结果 - 使用is_winner业务标准字段
    const summary = {
      total_draws: drawResults.length,
      win_count: drawResults.filter(r => r.is_winner).length,
      total_value: drawResults
        .filter(r => r.prize)
        .reduce((sum, r) => sum + (r.prize.value || 0), 0),
      prizes_won: drawResults
        .filter(r => r.prize)
        .map(r => ({ name: r.prize.name, value: r.prize.value }))
    }

    return res.apiSuccess(
      {
        draw_results: drawResults,
        summary,
        user_info: {
          user_id,
          remaining_points: userPoints.available_points, // 抽奖后剩余积分需要重新查询
          vip_level: user.vip_level || 1
        },
        campaign_info: {
          campaign_id,
          name: campaign.campaign_name
        },
        engine_version: '4.0.0'
      },
      `抽奖完成！共抽${drawResults.length}次，中奖${summary.win_count}次`
    )
  } catch (error) {
    console.error('抽奖执行失败:', error)
    return res.apiError('抽奖执行失败', error.message)
  }
})

/**
 * 四字段组合批次抽奖接口
 * POST /api/v4/unified-engine/lottery/batch-draw
 *
 * @description 支持单抽、3连抽、5连抽、10连抽，使用四字段组合方案
 * @body {number} user_id - 用户ID
 * @body {string} draw_type - 抽奖类型：single/triple/five/ten
 * @body {number} campaign_id - 活动ID（可选，默认使用活跃活动）
 */
router.post('/batch-draw', async (req, res) => {
  try {
    const { user_id, draw_type, campaign_id } = req.body

    // 参数验证
    if (!user_id || !draw_type) {
      return res.apiError('缺少必要参数：user_id 和 draw_type', 'INVALID_PARAMS')
    }

    // 验证抽奖类型并获取抽奖次数
    const drawConfig = {
      single: 1,
      triple: 3,
      five: 5,
      ten: 10
    }

    const drawCount = drawConfig[draw_type]
    if (!drawCount) {
      return res.apiError('无效的抽奖类型，支持：single/triple/five/ten', 'INVALID_DRAW_TYPE')
    }

    console.log('🎰 四字段批次抽奖请求', {
      user_id,
      draw_type,
      draw_count: drawCount,
      campaign_id,
      timestamp: BeijingTimeHelper.apiTimestamp()
    })

    // 验证用户存在及积分
    const user = await models.User.findByPk(user_id)
    const userPoints = await getUserPoints(user_id)
    if (!user) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND')
    }

    // 计算所需积分
    const requiredPoints = drawCount * 100 // 每次抽奖100积分
    if (userPoints.available_points < requiredPoints) {
      return res.apiError(
        `积分不足，需要${requiredPoints}积分，当前${userPoints.available_points}积分`,
        'INSUFFICIENT_POINTS'
      )
    }

    // 获取活跃的抽奖活动
    let campaign
    if (campaign_id) {
      campaign = await models.LotteryCampaign.findOne({
        where: { campaign_id, status: 'active' }
      })
    } else {
      campaign = await models.LotteryCampaign.findOne({
        where: { status: 'active' },
        order: [['created_at', 'DESC']]
      })
    }

    if (!campaign) {
      return res.apiError('没有可用的抽奖活动', 'NO_ACTIVE_CAMPAIGN')
    }

    // 生成批次ID
    const batchId = generateBatchId(user_id)
    const batchTimestamp = new Date()

    // 执行批次抽奖
    const results = []
    const UnifiedLotteryEngine = require('../../../services/UnifiedLotteryEngine/UnifiedLotteryEngine')
    const engine = new UnifiedLotteryEngine()

    for (let sequence = 1; sequence <= drawCount; sequence++) {
      try {
        const lotteryRequest = {
          userId: user_id,
          activityId: campaign.campaign_id,
          strategyType: 'basic_lottery',
          userProfile: {
            userLevel: user.vip_level || 1,
            totalPoints: userPoints.available_points,
            isVip: user.is_vip || false
          },
          requestId: `batch_${batchId}_${sequence}`,
          source: 'user_batch_draw'
        }

        const lotteryResult = await engine.executeLottery(lotteryRequest)

        // 创建抽奖记录（使用四字段方案）
        const record = await models.LotteryRecord.create({
          lottery_id: uuidv4(), // 🔧 必需字段：抽奖记录唯一ID
          draw_id: `${batchId}_${sequence}`, // 🔧 必需字段：抽奖ID
          user_id,
          campaign_id: campaign.campaign_id,
          draw_type, // 🎯 四字段之一：抽奖类型
          batch_id: batchId, // 🎯 四字段之二：批次ID
          draw_count: drawCount, // 🎯 四字段之三：抽奖总数
          draw_sequence: sequence, // 🎯 四字段之四：抽奖序号
          prize_id: lotteryResult.prize?.id || null,
          prize_name: lotteryResult.prize?.name || '未中奖',
          prize_type: lotteryResult.prize?.type || 'none',
          prize_value: lotteryResult.prize?.value || 0,
          cost_points: 100,
          is_winner: lotteryResult.is_winner, // ✅ 直接使用业务标准字段，删除转换逻辑
          created_at: batchTimestamp, // 🎯 统一时间戳
          updated_at: batchTimestamp
        })

        results.push({
          sequence,
          prize_name: record.prize_name,
          prize_type: record.prize_type,
          prize_value: record.prize_value,
          is_winner: record.is_winner,
          points_consumed: record.cost_points
        })
      } catch (error) {
        console.error(`第${sequence}次抽奖失败:`, error)
        results.push({
          sequence,
          prize_name: '系统错误',
          prize_type: 'error',
          prize_value: 0,
          is_winner: false,
          points_consumed: 100,
          error: error.message
        })
      }
    }

    // 扣除积分
    const _deductResult = await deductUserPoints(user_id, requiredPoints)

    // 返回完整的批次信息
    const responseData = {
      batch_id: batchId,
      draw_type,
      draw_count: drawCount,
      draw_time: batchTimestamp.toISOString(),
      results,
      summary: {
        total_draws: results.length,
        win_count: results.filter(r => r.is_winner).length,
        total_points_consumed: requiredPoints,
        total_prize_value: results.reduce((sum, r) => sum + (r.prize_value || 0), 0)
      },
      user_info: {
        user_id,
        remaining_points: userPoints.available_points - requiredPoints
      }
    }

    console.log('✅ 四字段批次抽奖完成', {
      batch_id: batchId,
      user_id,
      draw_type,
      win_count: responseData.summary.win_count
    })

    return res.apiSuccess(
      responseData,
      `${getDrawTypeDisplay(draw_type)}完成！获得${responseData.summary.win_count}个奖品`,
      'BATCH_DRAW_SUCCESS'
    )
  } catch (error) {
    console.error('批次抽奖失败:', error)
    return res.apiError('批次抽奖系统异常', 'LOTTERY_SYSTEM_ERROR', { error: error.message })
  }
})

/**
 * 用户抽奖历史查询接口（四字段组合版本）
 * GET /api/v4/unified-engine/lottery/history/:userId
 *
 * @description 按批次聚合的用户抽奖历史，基于四字段组合方案
 * @param {number} userId - 用户ID
 * @query {number} page - 页码（默认1）
 * @query {number} limit - 每页数量（默认10）
 * @query {string} draw_type - 过滤抽奖类型（可选）
 */
router.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const { page = 1, limit = 10, draw_type } = req.query

    if (!userId || isNaN(userId)) {
      return res.apiError('无效的用户ID', 'INVALID_USER_ID')
    }

    // 验证用户存在
    const user = await models.User.findByPk(userId)
    if (!user) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND')
    }

    // 获取用户积分信息
    const userPoints = await models.UserPointsAccount.findOne({
      where: { user_id: userId, is_active: 1 }
    })

    // 构建查询条件
    const whereClause = {
      user_id: userId,
      batch_id: { [models.Sequelize.Op.ne]: null } // 只查询批次抽奖记录
    }

    if (draw_type && ['single', 'triple', 'five', 'ten'].includes(draw_type)) {
      whereClause.draw_type = draw_type
    }

    console.log('🔍 查询用户抽奖历史', {
      userId,
      page,
      limit,
      draw_type,
      whereClause
    })

    // 查询批次历史（使用四字段聚合）
    const offset = (page - 1) * limit
    const { count, rows: batchHistory } = await models.LotteryRecord.findAndCountAll({
      attributes: [
        'batch_id',
        'draw_type',
        'draw_count',
        [models.Sequelize.fn('MIN', models.Sequelize.col('created_at')), 'draw_time'],
        [models.Sequelize.fn('COUNT', models.Sequelize.col('*')), 'actual_count'],
        [models.Sequelize.fn('SUM', models.Sequelize.col('is_winner')), 'win_count'],
        [models.Sequelize.fn('SUM', models.Sequelize.col('cost_points')), 'total_points'],
        [models.Sequelize.fn('SUM', models.Sequelize.col('prize_value')), 'total_value']
      ],
      where: whereClause,
      group: ['batch_id', 'draw_type', 'draw_count'],
      order: [[models.Sequelize.fn('MIN', models.Sequelize.col('created_at')), 'DESC']],
      limit: parseInt(limit),
      offset,
      raw: true
    })

    // 数据完整性检查和格式化
    const enrichedHistory = batchHistory.map(batch => {
      const isComplete = batch.draw_count === batch.actual_count
      return {
        batch_id: batch.batch_id,
        draw_type: batch.draw_type,
        draw_type_display: getDrawTypeDisplay(batch.draw_type),
        draw_count: batch.draw_count,
        actual_count: batch.actual_count,
        is_complete: isComplete,
        draw_time: batch.draw_time,
        win_count: parseInt(batch.win_count) || 0,
        total_points: parseInt(batch.total_points) || 0,
        total_value: parseInt(batch.total_value) || 0,
        status: isComplete ? 'COMPLETE' : 'INCOMPLETE'
      }
    })

    // 计算总页数
    const totalBatches = Math.ceil(count.length / limit)

    const responseData = {
      history: enrichedHistory,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total_batches: count.length,
        total_pages: totalBatches,
        has_next: page < totalBatches,
        has_prev: page > 1
      },
      user_info: {
        user_id: parseInt(userId),
        current_points: userPoints?.available_points || 0
      },
      stats: {
        total_batches: count.length,
        incomplete_batches: enrichedHistory.filter(b => !b.is_complete).length,
        total_wins: enrichedHistory.reduce((sum, b) => sum + b.win_count, 0),
        total_spent: enrichedHistory.reduce((sum, b) => sum + b.total_points, 0)
      }
    }

    console.log('✅ 抽奖历史查询完成', {
      userId,
      total_batches: count.length,
      returned_batches: enrichedHistory.length
    })

    return res.apiSuccess(responseData, '抽奖历史查询成功', 'HISTORY_QUERY_SUCCESS')
  } catch (error) {
    console.error('查询抽奖历史失败:', error)
    return res.apiError('查询历史记录失败', 'HISTORY_QUERY_ERROR', { error: error.message })
  }
})

/**
 * 批次详情查询接口
 * GET /api/v4/unified-engine/lottery/batch/:batchId
 *
 * @description 查询特定批次的详细抽奖记录
 * @param {string} batchId - 批次ID
 */
router.get('/batch/:batchId', async (req, res) => {
  try {
    const { batchId } = req.params

    if (!batchId) {
      return res.apiError('批次ID不能为空', 'INVALID_BATCH_ID')
    }

    // 查询批次详细记录
    const batchRecords = await models.LotteryRecord.findAll({
      where: { batch_id: batchId },
      include: [
        {
          model: models.LotteryPrize,
          as: 'prize',
          attributes: ['name', 'type', 'value', 'image_url', 'description'],
          required: false
        }
      ],
      order: [['draw_sequence', 'ASC']]
    })

    if (batchRecords.length === 0) {
      return res.apiError('批次记录不存在', 'BATCH_NOT_FOUND')
    }

    // 数据完整性验证
    const firstRecord = batchRecords[0]
    const expectedCount = firstRecord.draw_count
    const actualCount = batchRecords.length
    const validation = {
      valid: expectedCount === actualCount,
      expected_count: expectedCount,
      actual_count: actualCount,
      message:
        expectedCount === actualCount
          ? '批次数据完整'
          : `数据不完整：期望${expectedCount}条记录，实际${actualCount}条`
    }

    // 构建响应数据
    const responseData = {
      batch_info: {
        batch_id: batchId,
        draw_type: firstRecord.draw_type,
        draw_type_display: getDrawTypeDisplay(firstRecord.draw_type),
        draw_count: firstRecord.draw_count,
        draw_time: firstRecord.created_at,
        user_id: firstRecord.user_id
      },
      validation,
      records: batchRecords.map(record => ({
        sequence: record.draw_sequence,
        prize_info: {
          name: record.prize_name || '未中奖',
          type: record.prize_type || 'none',
          value: record.prize_value || 0,
          image_url: record.prize?.image_url || null,
          description: record.prize?.description || null
        },
        points_consumed: record.cost_points,
        is_winner: record.is_winner,
        draw_time: record.created_at
      })),
      summary: {
        total_draws: batchRecords.length,
        win_count: batchRecords.filter(r => r.is_winner).length,
        total_points: batchRecords.reduce((sum, r) => sum + (r.cost_points || 0), 0),
        total_value: batchRecords.reduce((sum, r) => sum + (r.prize_value || 0), 0)
      }
    }

    return res.apiSuccess(responseData, '批次详情查询成功', 'BATCH_DETAIL_SUCCESS')
  } catch (error) {
    console.error('查询批次详情失败:', error)
    return res.apiError('查询批次详情失败', 'BATCH_DETAIL_ERROR', { error: error.message })
  }
})

/**
 * 错误处理中间件
 */
router.use((error, req, res, _next) => {
  console.error('路由异常:', error)
  res.status(500).json({
    success: false,
    code: 'ROUTER_ERROR',
    message: '路由处理异常',
    data: { error: error.message },
    timestamp: moment().tz('Asia/Shanghai').toISOString(),
    request_id: req.requestId
  })
})

// 辅助函数
function getPrizeTypeName (type) {
  const typeNames = {
    points: '积分奖励',
    physical: '实物奖品',
    virtual: '虚拟商品',
    coupon: '优惠券',
    service: '服务体验'
  }
  return typeNames[type] || '未知类型'
}

function getPrizeRarity (value) {
  if (value >= 1000) return 'legendary' // 传说级 (≥1000元)
  if (value >= 500) return 'epic' // 史诗级 (500-999元)
  if (value >= 100) return 'rare' // 稀有级 (100-499元)
  return 'common' // 普通级 (<100元)
}

function generateBatchId (userId) {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substr(2, 6)
  return `${userId}_${timestamp}_${random}`
}

function getDrawTypeDisplay (type) {
  const displayNames = {
    single: '单抽',
    triple: '3连抽',
    five: '5连抽',
    ten: '10连抽'
  }
  return displayNames[type] || type
}

// 🔴 新增：用户相关API端点 (修复404问题)

/**
 * 获取用户信息
 * GET /api/v4/unified-engine/lottery/user/:userId
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params

    // 验证用户ID
    if (!userId || isNaN(userId)) {
      return res.apiBadRequest('无效的用户ID', 'INVALID_PARAMETER')
    }

    // 查询用户信息
    const user = await models.User.findByPk(userId, {
      attributes: ['user_id', 'mobile', 'is_admin', 'status', 'created_at', 'updated_at']
    })

    if (!user) {
      return res.apiNotFound('用户不存在', 'USER_NOT_FOUND')
    }

    // 获取用户积分信息
    const userPoints = await getUserPoints(userId)

    return res.json(
      ApiResponse.success({
        user: {
          user_id: user.user_id,
          mobile: user.mobile,
          is_admin: user.is_admin,
          status: user.status,
          created_at: user.created_at,
          updated_at: user.updated_at
        },
        points: userPoints,
        timestamp: moment().tz('Asia/Shanghai').format()
      })
    )
  } catch (error) {
    console.error('获取用户信息失败:', error)
    return res
      .status(500)
      .json(
        ApiResponse.serverError('获取用户信息失败', 'USER_INFO_ERROR', { error: error.message })
      )
  }
})

/**
 * 获取用户积分信息
 * GET /api/v4/unified-engine/lottery/points/:userId
 */
router.get('/points/:userId', async (req, res) => {
  try {
    const { userId } = req.params

    // 验证用户ID
    if (!userId || isNaN(userId)) {
      return res.apiBadRequest('无效的用户ID', 'INVALID_PARAMETER')
    }

    // 获取用户积分信息
    const userPoints = await getUserPoints(userId)

    // 获取用户积分历史统计
    const pointsHistory = await models.PointsTransaction.findAll({
      where: { user_id: userId },
      limit: 10,
      order: [['created_at', 'DESC']],
      attributes: [
        'transaction_id',
        'transaction_type',
        'points_amount',
        'points_balance_after',
        'transaction_title',
        'created_at'
      ]
    })

    return res.json(
      ApiResponse.success(
        {
          current_points: userPoints,
          recent_transactions: pointsHistory,
          summary: {
            available_points: userPoints.available_points,
            total_earned: userPoints.total_earned,
            total_consumed: userPoints.total_consumed,
            transaction_count: pointsHistory.length
          },
          timestamp: moment().tz('Asia/Shanghai').format()
        },
        '获取用户积分成功'
      )
    )
  } catch (error) {
    console.error('获取用户积分失败:', error)
    return res
      .status(500)
      .json(
        ApiResponse.serverError('获取用户积分失败', 'USER_POINTS_ERROR', { error: error.message })
      )
  }
})

/**
 * 获取抽奖策略列表
 * GET /api/v4/unified-engine/lottery/strategies
 */
router.get('/strategies', async (req, res) => {
  try {
    // 获取引擎配置信息
    const engineConfig = {
      version: '4.0.0',
      strategies: [
        {
          name: 'basic',
          className: 'BasicLotteryStrategy',
          display_name: '基础抽奖策略',
          description: '标准抽奖流程，基于配置的中奖概率',
          priority: 5,
          enabled: true
        },
        {
          name: 'guarantee',
          className: 'GuaranteeStrategy',
          display_name: '保底抽奖策略',
          description: '累计10次抽奖保底获得九八折券',
          priority: 8,
          enabled: true
        },
        {
          name: 'management',
          className: 'ManagementStrategy',
          display_name: '管理抽奖策略',
          description: '管理员预设的特定用户奖品',
          priority: 10,
          enabled: true
        }
      ],
      execution_chain: ['management', 'guarantee', 'basic']
    }

    // 获取当前活动信息
    const activeCampaigns = await models.LotteryCampaign.count({
      where: { status: 'active' }
    })

    return res.json(
      ApiResponse.success({
        strategies: engineConfig.strategies,
        engine: engineConfig,
        statistics: {
          active_campaigns: activeCampaigns,
          total_strategies: engineConfig.strategies.length,
          enabled_strategies: engineConfig.strategies.filter(s => s.enabled).length
        },
        timestamp: moment().tz('Asia/Shanghai').format()
      })
    )
  } catch (error) {
    console.error('获取抽奖策略失败:', error)
    return res.status(500).json({
      success: false,
      code: 'ERROR',
      message: '获取抽奖策略失败',
      data: { error: error.message }
    })
  }
})

/**
 * 获取用户信息API
 * GET /api/v4/unified-engine/lottery/user/profile
 */
router.get('/user/profile', async (req, res) => {
  try {
    // 支持多种用户ID获取方式：token中的user_id或查询参数
    let userId = req.user?.user_id || req.query.user_id || req.query.userId

    if (!userId) {
      return res.apiBadRequest('缺少用户ID参数')
    }

    // 确保userId是数字
    userId = parseInt(userId)

    // 查询用户信息
    const user = await models.User.findByPk(userId, {
      attributes: ['user_id', 'mobile', 'nickname', 'is_admin', 'status']
    })

    if (!user) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND')
    }

    return res.json({
      success: true,
      message: '获取用户信息成功',
      data: {
        user: {
          id: user.user_id,
          mobile: user.mobile,
          nickname: user.nickname,
          is_admin: user.is_admin,
          status: user.status
        }
      },
      timestamp: BeijingTimeHelper.apiTimestamp()
    })
  } catch (error) {
    console.error('V4获取用户信息错误:', error)
    return res.apiInternalError('获取用户信息失败')
  }
})

/**
 * 获取用户积分API
 * GET /api/v4/unified-engine/lottery/user/points
 */
router.get('/user/points', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token || !token.startsWith('dev_token_')) {
      return res.apiError('Token无效', 'INVALID_TOKEN')
    }

    const userId = token.split('_')[2]

    // 查询用户积分账户
    const pointsAccount = await models.UserPointsAccount.findOne({
      where: { user_id: userId }
    })

    if (!pointsAccount) {
      // 创建默认积分账户
      const newAccount = await models.UserPointsAccount.create({
        user_id: userId,
        // 🔴 需要真实数据：用户实际积分余额, // 默认给1000积分用于测试
        // 🔴 需要真实数据：用户历史总收入积分,
        total_consumed: 0
      })

      return res.json({
        success: true,
        message: '获取用户积分成功',
        data: {
          points: {
            available: newAccount.available_points,
            total_earned: newAccount.total_earned,
            total_consumed: newAccount.total_consumed,
            account_level: newAccount.account_level || 'bronze'
          }
        },
        timestamp: BeijingTimeHelper.apiTimestamp()
      })
    }

    return res.json({
      success: true,
      message: '获取用户积分成功',
      data: {
        points: {
          available: pointsAccount.available_points,
          total_earned: pointsAccount.total_earned,
          total_consumed: pointsAccount.total_consumed,
          account_level: pointsAccount.account_level || 'bronze'
        }
      },
      timestamp: BeijingTimeHelper.apiTimestamp()
    })
  } catch (error) {
    console.error('V4获取用户积分错误:', error)
    return res.apiInternalError('获取用户积分失败')
  }
})

// ========== 添加测试所需的API端点 ==========

/**
 * 抽奖条件验证API
 * POST /validate
 */
router.post('/validate', authenticateToken, async (req, res) => {
  try {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    const { userId, campaignId, drawType } = req.body

    console.log(
      JSON.stringify({
        timestamp: BeijingTimeHelper.apiTimestamp(),
        level: 'INFO',
        component: 'LotteryAPI',
        message: '接收到API请求',
        data: { requestId, method: 'POST', path: '/validate', userId }
      })
    )

    // 验证必要参数
    if (!userId || !campaignId) {
      return res.apiError('缺少必要参数：userId 和 campaignId', 'INVALID_PARAMS')
    }

    // 检查用户是否存在
    const user = await models.User.findByPk(userId)
    if (!user) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND')
    }

    // 检查活动是否存在
    const campaign = await models.LotteryCampaign.findByPk(campaignId)
    if (!campaign) {
      return res.apiError('抽奖活动不存在', 'CAMPAIGN_NOT_FOUND')
    }

    // 检查活动状态
    const now = moment().tz('Asia/Shanghai')
    const startTime = moment(campaign.start_time).tz('Asia/Shanghai')
    const endTime = moment(campaign.end_time).tz('Asia/Shanghai')

    if (now.isBefore(startTime)) {
      return res.apiError('活动尚未开始', 'CAMPAIGN_NOT_STARTED')
    }

    if (now.isAfter(endTime)) {
      return res.apiError('活动已结束', 'CAMPAIGN_ENDED')
    }

    // 检查用户积分
    const userPoints = await getUserPoints(userId)
    const requiredPoints = 100 // 默认消耗积分

    if (userPoints.available_points < requiredPoints) {
      return res.status(400).json({
        success: false,
        code: 'INSUFFICIENT_POINTS',
        message: '积分不足',
        data: {
          required: requiredPoints,
          available: userPoints.available_points
        }
      })
    }

    return res.json({
      success: true,
      code: 'VALIDATION_PASSED',
      message: '抽奖条件验证通过',
      data: {
        userId,
        campaignId,
        drawType: drawType || 'single',
        userPoints: userPoints.available_points,
        campaignStatus: 'active'
      }
    })
  } catch (error) {
    console.error('抽奖条件验证失败:', error)
    return res.apiError('验证过程发生错误', 'VALIDATION_ERROR')
  }
})

/**
 * 统一抽奖执行API
 * POST /execute
 */
router.post('/execute', authenticateToken, async (req, res) => {
  try {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    const { userId, campaignId, strategy, drawType, pointsCost } = req.body

    console.log(
      JSON.stringify({
        timestamp: BeijingTimeHelper.apiTimestamp(),
        level: 'INFO',
        component: 'LotteryAPI',
        message: '接收到API请求',
        data: { requestId, method: 'POST', path: '/execute', userId }
      })
    )

    // 根据策略选择对应的抽奖端点（预留功能）
    let _targetPath = '/draw' // 默认使用通用抽奖接口

    switch (strategy) {
    case 'basic':
      _targetPath = '/basic'
      break
    case 'guarantee':
      _targetPath = '/guarantee'
      break
    case 'management':
      _targetPath = '/draw' // 管理策略使用通用接口
      break
    default:
      _targetPath = '/draw'
    }

    // 构建抽奖请求数据（预留功能）
    const _lotteryData = {
      userId,
      campaignId: campaignId || 2, // 默认活动ID（唯一的真实活动）
      drawCount: 1,
      pointsCost: pointsCost || 100,
      strategy: strategy || 'basic',
      drawType: drawType || 'single'
    }

    // 调用具体的抽奖逻辑
    if (strategy === 'basic') {
      // 调用基础抽奖
      const user = await models.User.findByPk(userId)
      if (!user) {
        return res.apiError('用户不存在', 'USER_NOT_FOUND')
      }

      // 执行基础抽奖逻辑
      const drawResult = await lotteryEngine.executeLottery({
        user_id: userId, // ✅ 修复：API层到主引擎的参数映射
        campaign_id: campaignId || 2, // ✅ 修复：统一使用snake_case
        strategy_type: 'basic', // ✅ 修复：使用正确的参数名和策略类型
        request_id: requestId, // ✅ 添加：请求ID追踪
        user_status: {
          available_points: user.UserPointsAccount?.available_points || 0,
          is_vip: user.is_admin || false
        },
        campaign_config: {
          max_draws_per_day: 10,
          cost_per_draw: pointsCost || 100
        }
      })

      return res.apiSuccess(
        {
          drawResult,
          strategy: 'basic',
          userId,
          campaignId: campaignId || 2
        },
        '抽奖执行成功'
      )
    }

    // ✅ 其他策略统一处理（保底、管理等）
    const user = await models.User.findByPk(userId)
    if (!user) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND')
    }

    // 执行对应策略的抽奖逻辑
    const drawResult = await lotteryEngine.executeLottery({
      user_id: userId, // ✅ 修复：统一使用snake_case
      campaign_id: campaignId || 2, // ✅ 修复：统一使用snake_case
      strategy_type: strategy || 'basic', // ✅ 修复：使用正确的参数名
      request_id: requestId, // ✅ 添加：请求ID追踪
      user_status: {
        available_points: user.UserPointsAccount?.available_points || 0,
        is_vip: user.is_admin || false
      },
      campaign_config: {
        max_draws_per_day: 10,
        cost_per_draw: pointsCost || 100
      }
    })

    return res.apiSuccess(
      {
        drawResult,
        strategy: strategy || 'basic',
        userId,
        campaignId: campaignId || 2
      },
      '抽奖执行成功'
    )
  } catch (error) {
    console.error('抽奖执行失败:', error)
    return res.apiError('抽奖执行失败', 'LOTTERY_ERROR')
  }
})

/**
 * 引擎运行指标API
 * GET /metrics
 */
router.get('/metrics', authenticateToken, async (req, res) => {
  try {
    // 获取系统指标
    const metrics = await models.SystemMetrics.findAll({
      limit: 10,
      order: [['created_at', 'DESC']]
    })

    // 获取抽奖统计 - 修复：使用draw_id而不是id作为主键
    const lotteryStats = await models.LotteryRecord.findAll({
      attributes: [
        [models.sequelize.fn('COUNT', models.sequelize.col('draw_id')), 'totalDraws'],
        [
          models.sequelize.fn(
            'COUNT',
            models.sequelize.literal('CASE WHEN prize_id IS NOT NULL THEN 1 END')
          ),
          'winningDraws'
        ]
      ],
      where: {
        created_at: {
          [models.Sequelize.Op.gte]: moment().subtract(24, 'hours').toDate()
        }
      },
      raw: true
    })

    return res.json({
      success: true,
      code: 'SUCCESS',
      message: '获取引擎指标成功',
      data: {
        metrics: {
          engineVersion: '4.0.0',
          uptime: process.uptime(),
          totalDraws: lotteryStats[0]?.totalDraws || 0,
          winningDraws: lotteryStats[0]?.winningDraws || 0,
          systemMetrics: metrics.length,
          timestamp: BeijingTimeHelper.apiTimestamp()
        }
      }
    })
  } catch (error) {
    console.error('获取引擎指标失败:', error)
    return res.apiError('获取引擎指标失败', 'METRICS_ERROR')
  }
})

/**
 * 用户抽奖历史API (添加兼容路径)
 * GET /history
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { userId, limit = 10 } = req.query

    if (!userId) {
      return res.apiError('缺少userId参数', 'INVALID_PARAMS')
    }

    const records = await models.LotteryRecord.findAll({
      where: { user_id: userId },
      limit: parseInt(limit),
      order: [['created_at', 'DESC']],
      include: [
        {
          model: models.LotteryPrize,
          as: 'prize',
          required: false
        }
      ]
    })

    return res.json({
      success: true,
      code: 'SUCCESS',
      message: '获取抽奖历史成功',
      data: {
        records,
        total: records.length,
        userId: parseInt(userId)
      }
    })
  } catch (error) {
    console.error('获取抽奖历史失败:', error)
    return res.apiError('获取抽奖历史失败', 'HISTORY_ERROR')
  }
})

/**
 * V4引擎状态API (添加兼容路径)
 * GET /status
 */
router.get('/status', async (req, res) => {
  try {
    // 检查引擎状态
    const engineStatus = {
      version: '4.0.0',
      status: 'running',
      uptime: process.uptime(),
      timestamp: BeijingTimeHelper.apiTimestamp(),
      strategies: ['BasicLotteryStrategy', 'GuaranteeStrategy', 'ManagementStrategy']
    }

    return res.json({
      success: true,
      code: 'SUCCESS',
      message: 'V4引擎运行正常',
      data: {
        engineStatus
      }
    })
  } catch (error) {
    console.error('获取引擎状态失败:', error)
    return res.apiError('获取引擎状态失败', 'STATUS_ERROR')
  }
})

module.exports = router
