/**
 * @file 抽奖健康度管理路由
 * @description P1 需求：抽奖活动健康度评估接口
 *
 * @version 1.0.0
 * @date 2026-01-31
 *
 * 接口说明：
 * - GET /:id - 获取活动健康度报告
 * - GET /:id/tier-distribution - 获取档位分布
 * - GET /:id/diagnose - 获取问题诊断
 * - GET /:id/budget-rate - 获取预算消耗速度
 *
 * P1 任务对应：
 * - B-14：抽奖健康度计算服务 LotteryHealthService
 * - B-15：健康度接口 GET /api/v4/admin/lottery/health/:id
 * - B-16：档位分布
 * - B-17：问题诊断
 * - B-18：预算消耗速度
 *
 * 实现规范（V1.3.0）：
 * - 路由层禁止直接 require models
 * - 通过 ServiceManager 获取 lottery_health 服务
 * - 使用 res.apiSuccess / res.apiError 统一响应
 *
 * @see docs/后端数据库开发任务清单-2026年1月.md P1 阶段任务
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger

/**
 * 获取 LotteryHealthService 服务实例
 *
 * 遵循项目规范：通过 req.app.locals.services.getService 获取服务
 *
 * @param {Object} req - Express 请求对象
 * @returns {Object} LotteryHealthService 实例
 */
function getLotteryHealthService(req) {
  // 通过 app.locals.services 获取（项目标准模式）
  const service = req.app.locals.services?.getService('lottery_health')
  if (service) {
    return service
  }

  // 兜底：直接实例化（带模型注入）
  logger.warn('通过 app.locals.services 获取 lottery_health 失败，使用直接实例化')
  const { LotteryHealthService } = require('../../../services/lottery')
  const models = req.models || require('../../../models')
  return new LotteryHealthService(models)
}

/**
 * 验证活动ID参数
 * @private
 * @param {string} id - 活动ID字符串
 * @returns {number|null} 解析后的数字ID或null
 */
function parseAndValidateCampaignId(id) {
  const campaignId = parseInt(id, 10)
  if (isNaN(campaignId) || campaignId <= 0) {
    return null
  }
  return campaignId
}

/**
 * @api {get} /api/v4/admin/lottery/health/:id 获取活动健康度报告
 * @apiName GetCampaignHealthReport
 * @apiGroup LotteryHealth
 * @apiVersion 1.0.0
 *
 * @apiDescription P1 需求 B-14/B-15：获取抽奖活动的完整健康度评估报告
 * 包含预算、中奖率、库存、参与度、体验五个维度的评分和问题诊断
 *
 * @apiParam {Number} id 活动ID
 *
 * @apiQuery {Boolean} [use_cache=true] 是否使用缓存
 * @apiQuery {Number} [cache_ttl=300] 缓存TTL（秒）
 *
 * @apiSuccess {Boolean} success 请求是否成功
 * @apiSuccess {Object} data 健康度报告数据
 * @apiSuccess {Number} data.lottery_campaign_id 活动ID
 * @apiSuccess {String} data.campaign_name 活动名称
 * @apiSuccess {Number} data.overall_score 综合评分（0-100）
 * @apiSuccess {String} data.health_level 健康等级（healthy/warning/danger）
 * @apiSuccess {Object} data.dimensions 各维度评分
 * @apiSuccess {Array} data.issues 问题列表
 * @apiSuccess {Array} data.suggestions 优化建议
 *
 * @apiHeader {String} Authorization Bearer token
 *
 * @apiPermission admin
 */
router.get('/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const campaignId = parseAndValidateCampaignId(req.params.id)
  if (!campaignId) {
    return res.apiError('无效的活动ID', 'INVALID_CAMPAIGN_ID', null, 400)
  }

  const { use_cache = 'true', cache_ttl = '300' } = req.query

  logger.info('获取活动健康度报告', {
    lottery_campaign_id: campaignId,
    user_id: req.user?.user_id,
    use_cache
  })

  try {
    const healthService = getLotteryHealthService(req)

    const report = await healthService.getHealthReport(campaignId, {
      use_cache: use_cache === 'true',
      cache_ttl: parseInt(cache_ttl, 10) || 300
    })

    logger.info('活动健康度报告获取成功', {
      lottery_campaign_id: campaignId,
      overall_score: report.overall_score,
      health_level: report.health_level,
      issue_count: report.issues?.length || 0
    })

    return res.apiSuccess(report, '获取活动健康度报告成功')
  } catch (error) {
    logger.error('获取活动健康度报告失败', {
      lottery_campaign_id: campaignId,
      error: error.message,
      stack: error.stack
    })

    if (error.message === '活动不存在') {
      return res.apiError('活动不存在', 'CAMPAIGN_NOT_FOUND', null, 404)
    }

    return res.apiError(
      '获取活动健康度报告失败',
      'HEALTH_REPORT_ERROR',
      { error: error.message },
      500
    )
  }
})

/**
 * @api {get} /api/v4/admin/lottery/health/:id/tier-distribution 获取档位分布
 * @apiName GetCampaignTierDistribution
 * @apiGroup LotteryHealth
 * @apiVersion 1.0.0
 *
 * @apiDescription P1 需求 B-16：获取活动各档位的抽奖分布统计
 *
 * @apiParam {Number} id 活动ID
 *
 * @apiSuccess {Boolean} success 请求是否成功
 * @apiSuccess {Object} data 档位分布数据
 * @apiSuccess {Object} data.counts 各档位抽奖次数
 * @apiSuccess {Object} data.percentages 各档位占比
 *
 * @apiHeader {String} Authorization Bearer token
 *
 * @apiPermission admin
 */
router.get('/:id/tier-distribution', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const campaignId = parseAndValidateCampaignId(req.params.id)
  if (!campaignId) {
    return res.apiError('无效的活动ID', 'INVALID_CAMPAIGN_ID', null, 400)
  }

  logger.info('获取活动档位分布', {
    lottery_campaign_id: campaignId,
    user_id: req.user?.user_id
  })

  try {
    const healthService = getLotteryHealthService(req)

    // 获取完整报告后提取档位分布
    const report = await healthService.getHealthReport(campaignId, {
      use_cache: true,
      cache_ttl: 300
    })

    const tierDistribution = report.dimensions?.win_rate?.details?.tier_distribution || {
      counts: { high: 0, mid: 0, low: 0, empty: 0, total: 0 },
      percentages: { high: 0, mid: 0, low: 0, empty: 0 }
    }

    logger.info('活动档位分布获取成功', {
      lottery_campaign_id: campaignId,
      total_draws: tierDistribution.counts?.total || 0
    })

    return res.apiSuccess(
      {
        lottery_campaign_id: campaignId,
        tier_distribution: tierDistribution
      },
      '获取档位分布成功'
    )
  } catch (error) {
    logger.error('获取活动档位分布失败', {
      lottery_campaign_id: campaignId,
      error: error.message
    })

    if (error.message === '活动不存在') {
      return res.apiError('活动不存在', 'CAMPAIGN_NOT_FOUND', null, 404)
    }

    return res.apiError(
      '获取档位分布失败',
      'TIER_DISTRIBUTION_ERROR',
      { error: error.message },
      500
    )
  }
})

/**
 * @api {get} /api/v4/admin/lottery/health/:id/diagnose 获取问题诊断
 * @apiName GetCampaignDiagnosis
 * @apiGroup LotteryHealth
 * @apiVersion 1.0.0
 *
 * @apiDescription P1 需求 B-17：获取活动运营问题诊断和优化建议
 *
 * @apiParam {Number} id 活动ID
 *
 * @apiSuccess {Boolean} success 请求是否成功
 * @apiSuccess {Object} data 诊断数据
 * @apiSuccess {Array} data.issues 问题列表
 * @apiSuccess {Array} data.suggestions 优化建议
 *
 * @apiHeader {String} Authorization Bearer token
 *
 * @apiPermission admin
 */
router.get('/:id/diagnose', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const campaignId = parseAndValidateCampaignId(req.params.id)
  if (!campaignId) {
    return res.apiError('无效的活动ID', 'INVALID_CAMPAIGN_ID', null, 400)
  }

  logger.info('获取活动问题诊断', {
    lottery_campaign_id: campaignId,
    user_id: req.user?.user_id
  })

  try {
    const healthService = getLotteryHealthService(req)

    // 获取完整报告后提取问题诊断
    const report = await healthService.getHealthReport(campaignId, {
      use_cache: true,
      cache_ttl: 300
    })

    const diagnosis = {
      lottery_campaign_id: campaignId,
      campaign_name: report.campaign_name,
      overall_score: report.overall_score,
      health_level: report.health_level,
      issues: report.issues || [],
      suggestions: report.suggestions || [],
      dimension_summary: {
        budget: {
          score: report.dimensions?.budget?.score || 0,
          max_score: report.dimensions?.budget?.max_score || 30,
          level: report.dimensions?.budget?.level || 'unknown'
        },
        win_rate: {
          score: report.dimensions?.win_rate?.score || 0,
          max_score: report.dimensions?.win_rate?.max_score || 25,
          level: report.dimensions?.win_rate?.level || 'unknown'
        },
        inventory: {
          score: report.dimensions?.inventory?.score || 0,
          max_score: report.dimensions?.inventory?.max_score || 20,
          level: report.dimensions?.inventory?.level || 'unknown'
        },
        participation: {
          score: report.dimensions?.participation?.score || 0,
          max_score: report.dimensions?.participation?.max_score || 15,
          level: report.dimensions?.participation?.level || 'unknown'
        },
        experience: {
          score: report.dimensions?.experience?.score || 0,
          max_score: report.dimensions?.experience?.max_score || 10,
          level: report.dimensions?.experience?.level || 'unknown'
        }
      }
    }

    logger.info('活动问题诊断获取成功', {
      lottery_campaign_id: campaignId,
      issue_count: diagnosis.issues.length,
      suggestion_count: diagnosis.suggestions.length
    })

    return res.apiSuccess(diagnosis, '获取问题诊断成功')
  } catch (error) {
    logger.error('获取活动问题诊断失败', {
      lottery_campaign_id: campaignId,
      error: error.message
    })

    if (error.message === '活动不存在') {
      return res.apiError('活动不存在', 'CAMPAIGN_NOT_FOUND', null, 404)
    }

    return res.apiError('获取问题诊断失败', 'DIAGNOSIS_ERROR', { error: error.message }, 500)
  }
})

/**
 * @api {get} /api/v4/admin/lottery/health/:id/budget-rate 获取预算消耗速度
 * @apiName GetCampaignBudgetRate
 * @apiGroup LotteryHealth
 * @apiVersion 1.0.0
 *
 * @apiDescription P1 需求 B-18：获取活动预算消耗速度和剩余预算预估
 *
 * @apiParam {Number} id 活动ID
 *
 * @apiSuccess {Boolean} success 请求是否成功
 * @apiSuccess {Object} data 预算消耗数据
 * @apiSuccess {Number} data.total_budget 总预算
 * @apiSuccess {Number} data.used_budget 已使用预算
 * @apiSuccess {Number} data.remaining_budget 剩余预算
 * @apiSuccess {Number} data.usage_ratio 使用比例
 * @apiSuccess {Number} data.daily_consumption 日均消耗
 * @apiSuccess {Number|String} data.estimated_remaining_days 预计剩余天数
 *
 * @apiHeader {String} Authorization Bearer token
 *
 * @apiPermission admin
 */
router.get('/:id/budget-rate', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const campaignId = parseAndValidateCampaignId(req.params.id)
  if (!campaignId) {
    return res.apiError('无效的活动ID', 'INVALID_CAMPAIGN_ID', null, 400)
  }

  logger.info('获取活动预算消耗速度', {
    lottery_campaign_id: campaignId,
    user_id: req.user?.user_id
  })

  try {
    const healthService = getLotteryHealthService(req)

    // 获取完整报告后提取预算数据
    const report = await healthService.getHealthReport(campaignId, {
      use_cache: true,
      cache_ttl: 300
    })

    const budgetDetails = report.dimensions?.budget?.details || {}

    const budgetRate = {
      lottery_campaign_id: campaignId,
      campaign_name: report.campaign_name,
      budget_health_level: report.dimensions?.budget?.level || 'unknown',
      budget_score: report.dimensions?.budget?.score || 0,
      budget_max_score: report.dimensions?.budget?.max_score || 30,
      total_budget: budgetDetails.total_budget || 0,
      used_budget: budgetDetails.used_budget || 0,
      remaining_budget: budgetDetails.remaining_budget || 0,
      usage_ratio: budgetDetails.usage_ratio || 0,
      remaining_ratio: budgetDetails.remaining_ratio || 1,
      running_days: budgetDetails.running_days || 0,
      daily_consumption: budgetDetails.daily_consumption || 0,
      estimated_remaining_days: budgetDetails.estimated_remaining_days || '无限'
    }

    logger.info('活动预算消耗速度获取成功', {
      lottery_campaign_id: campaignId,
      usage_ratio: budgetRate.usage_ratio,
      daily_consumption: budgetRate.daily_consumption
    })

    return res.apiSuccess(budgetRate, '获取预算消耗速度成功')
  } catch (error) {
    logger.error('获取活动预算消耗速度失败', {
      lottery_campaign_id: campaignId,
      error: error.message
    })

    if (error.message === '活动不存在') {
      return res.apiError('活动不存在', 'CAMPAIGN_NOT_FOUND', null, 404)
    }

    return res.apiError('获取预算消耗速度失败', 'BUDGET_RATE_ERROR', { error: error.message }, 500)
  }
})

module.exports = router
