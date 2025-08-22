/**
 * 🔥 动态概率系统API接口 v3 - 概率引擎和分析
 * 创建时间：2025年01月21日 UTC
 * 特点：动态概率计算 + 系统平衡 + 市场分析 + 概率优化
 * 路径：/api/v3/probability
 * 基于：DynamicProbabilityService (16KB, 539行) - 企业级实现
 */

'use strict'

const express = require('express')
const router = express.Router()
const DynamicProbabilityService = require('../../services/DynamicProbabilityService')
const { requireUser, requireAdmin } = require('../../middleware/auth')
const validationMiddleware = require('../../middleware/validation')

/**
 * GET /api/v3/probability/system/stats/:campaignId
 * 获取系统概率统计数据
 */
router.get('/system/stats/:campaignId', requireAdmin, async (req, res) => {
  try {
    const { campaignId } = req.params

    console.log(`📊 系统概率统计: 活动=${campaignId}`)

    // 调用现有Service方法获取系统统计
    const systemStats = await DynamicProbabilityService.getSystemStatistics(campaignId)

    res.json({
      success: true,
      data: {
        campaignId: parseInt(campaignId),
        statistics: systemStats,
        timestamp: new Date().toISOString()
      },
      message: '系统概率统计获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 系统概率统计失败:', error)
    res.status(500).json({
      success: false,
      error: 'PROBABILITY_STATS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * POST /api/v3/probability/calculate
 * 计算用户动态概率（内部接口）
 */
router.post('/calculate',
  requireUser,
  validationMiddleware([
    { field: 'campaignId', type: 'number', required: true },
    { field: 'baseProbability', type: 'number', required: true, min: 0, max: 1 }
  ]),
  async (req, res) => {
    try {
      const userId = req.user.user_id
      const { campaignId, baseProbability } = req.body

      console.log(`🎯 计算动态概率: 用户=${userId}, 活动=${campaignId}, 基础概率=${baseProbability}`)

      // 调用现有Service方法计算动态概率
      const probabilityResult = await DynamicProbabilityService.calculateDynamicProbability(
        userId,
        campaignId,
        baseProbability
      )

      res.json({
        success: true,
        data: {
          userId,
          campaignId,
          baseProbability,
          adjustedProbability: probabilityResult.adjustedProbability,
          factors: probabilityResult.factors,
          explanation: probabilityResult.explanation,
          confidence: probabilityResult.confidence
        },
        message: '动态概率计算成功',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('❌ 动态概率计算失败:', error)
      res.status(500).json({
        success: false,
        error: 'PROBABILITY_CALCULATION_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * GET /api/v3/probability/history/:campaignId
 * 获取概率调整历史（管理员接口）
 */
router.get('/history/:campaignId', requireAdmin, async (req, res) => {
  try {
    const { campaignId } = req.params
    const { days = 7 } = req.query

    console.log(`📜 概率调整历史: 活动=${campaignId}, 天数=${days}`)

    // 调用现有Service方法获取概率调整历史
    const adjustmentHistory = await DynamicProbabilityService.getProbabilityAdjustmentHistory(
      campaignId,
      parseInt(days)
    )

    res.json({
      success: true,
      data: {
        campaignId: parseInt(campaignId),
        days: parseInt(days),
        history: adjustmentHistory,
        totalAdjustments: adjustmentHistory.length
      },
      message: '概率调整历史获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 概率调整历史获取失败:', error)
    res.status(500).json({
      success: false,
      error: 'PROBABILITY_HISTORY_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/probability/analysis/:campaignId
 * 分析概率有效性（管理员接口）
 */
router.get('/analysis/:campaignId', requireAdmin, async (req, res) => {
  try {
    const { campaignId } = req.params

    console.log(`🔍 概率有效性分析: 活动=${campaignId}`)

    // 调用现有Service方法分析概率有效性
    const effectivenessAnalysis = await DynamicProbabilityService.analyzeProbabilityEffectiveness(campaignId)

    res.json({
      success: true,
      data: {
        campaignId: parseInt(campaignId),
        analysis: effectivenessAnalysis,
        recommendations: effectivenessAnalysis.recommendations,
        metrics: effectivenessAnalysis.metrics
      },
      message: '概率有效性分析完成',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 概率有效性分析失败:', error)
    res.status(500).json({
      success: false,
      error: 'PROBABILITY_ANALYSIS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * POST /api/v3/probability/optimize/:campaignId
 * 优化概率参数（管理员接口）
 */
router.post('/optimize/:campaignId', requireAdmin, async (req, res) => {
  try {
    const { campaignId } = req.params

    console.log(`⚡ 概率参数优化: 活动=${campaignId}`)

    // 调用现有Service方法优化概率参数
    const optimizationResult = await DynamicProbabilityService.optimizeProbabilityParameters(campaignId)

    res.json({
      success: true,
      data: {
        campaignId: parseInt(campaignId),
        optimizations: optimizationResult.optimizations,
        oldParameters: optimizationResult.oldParameters,
        newParameters: optimizationResult.newParameters,
        expectedImprovement: optimizationResult.expectedImprovement
      },
      message: '概率参数优化完成',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 概率参数优化失败:', error)
    res.status(500).json({
      success: false,
      error: 'PROBABILITY_OPTIMIZATION_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/probability/time-patterns
 * 获取时间模式数据（管理员接口）
 */
router.get('/time-patterns', requireAdmin, async (req, res) => {
  try {
    console.log('🕐 获取时间模式数据')

    // 调用现有Service方法获取时间模式数据
    const timePatternData = await DynamicProbabilityService.getTimePatternData()

    res.json({
      success: true,
      data: {
        patterns: timePatternData,
        summary: {
          peakHours: timePatternData.peakHours,
          lowActivityHours: timePatternData.lowActivityHours,
          recommendations: timePatternData.recommendations
        }
      },
      message: '时间模式数据获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 时间模式数据获取失败:', error)
    res.status(500).json({
      success: false,
      error: 'TIME_PATTERN_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/probability/market-demand/:campaignId
 * 获取市场需求因子分析（管理员接口）
 */
router.get('/market-demand/:campaignId', requireAdmin, async (req, res) => {
  try {
    const { campaignId } = req.params

    console.log(`📈 市场需求分析: 活动=${campaignId}`)

    // 调用现有Service方法计算市场需求因子
    const marketDemandFactor = await DynamicProbabilityService.calculateMarketDemandFactor(campaignId)

    res.json({
      success: true,
      data: {
        campaignId: parseInt(campaignId),
        marketDemandFactor: marketDemandFactor.factor,
        analysis: marketDemandFactor.analysis,
        trends: marketDemandFactor.trends,
        recommendations: marketDemandFactor.recommendations
      },
      message: '市场需求分析完成',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 市场需求分析失败:', error)
    res.status(500).json({
      success: false,
      error: 'MARKET_DEMAND_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * GET /api/v3/probability/user/:userId/factor
 * 获取用户个人概率因子（管理员接口）
 */
router.get('/user/:userId/factor', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params
    const { campaignId } = req.query

    console.log(`👤 用户概率因子: 用户=${userId}, 活动=${campaignId}`)

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_CAMPAIGN_ID',
        message: '缺少活动ID参数',
        timestamp: new Date().toISOString()
      })
    }

    // 计算用户的概率因子（需要基础概率作为参考）
    const probabilityResult = await DynamicProbabilityService.calculateDynamicProbability(
      userId,
      campaignId,
      0.1 // 使用标准概率作为参考
    )

    res.json({
      success: true,
      data: {
        userId: parseInt(userId),
        campaignId: parseInt(campaignId),
        userFactors: probabilityResult.factors.userFactor,
        behaviorFactors: probabilityResult.factors.behaviorFactor,
        timeFactors: probabilityResult.factors.timeFactor,
        overallMultiplier: probabilityResult.factors.overallMultiplier
      },
      message: '用户概率因子获取成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ 用户概率因子获取失败:', error)
    res.status(500).json({
      success: false,
      error: 'USER_FACTOR_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

module.exports = router
