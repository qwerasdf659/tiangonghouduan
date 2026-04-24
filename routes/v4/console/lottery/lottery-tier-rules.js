/**
 * 🎯 抽奖档位规则管理路由 - API覆盖率补齐
 *
 * 业务职责：
 * - 提供lottery_tier_rules表的完整CRUD API
 * - 支持按活动、分层、档位查询规则
 * - 支持批量创建三档位规则
 *
 * 访问控制：
 * - 所有接口需要管理员权限（requireRoleLevel(100)）
 *
 * API端点：
 * - GET    /                           - 获取档位规则列表（分页）
 * - GET    /overview                   - 获取所有活动的分层配置概览
 * - GET    /campaign/:lottery_campaign_id      - 获取指定活动的档位规则
 * - GET    /validate/:lottery_campaign_id      - 验证指定活动的档位配置
 * - GET    /:id                        - 获取档位规则详情
 * - POST   /                           - 创建单个档位规则
 * - POST   /batch                      - 批量创建三档位规则
 * - PUT    /:id                        - 更新档位规则
 * - DELETE /:id                        - 删除档位规则
 */

'use strict'

const express = require('express')
const router = express.Router()

const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')
const logger = require('../../../../utils/logger').logger
const { asyncHandler } = require('../shared/middleware')

/**
 * 通过 ServiceManager 获取 LotteryTierRuleService
 *
 * @param {Object} req - Express请求对象
 * @returns {Object} LotteryTierRuleService实例
 */
const getLotteryTierRuleService = req => {
  return req.app.locals.services.getService('lottery_tier_rule')
}

/**
 * 中间件：认证 + 管理员权限
 */
router.use(authenticateToken, requireRoleLevel(100))

/**
 * GET / - 获取档位规则列表（分页）
 *
 * 查询参数：
 * - lottery_campaign_id: number - 活动ID（可选）
 * - segment_key: string - 用户分层标识（可选）
 * - tier_name: string - 档位名称（可选：high/mid/low）
 * - status: string - 规则状态（可选：active/inactive）
 * - page: number - 页码（默认1）
 * - page_size: number - 每页数量（默认20）
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const {
      lottery_campaign_id,
      segment_key,
      tier_name,
      status,
      page = 1,
      page_size = 20
    } = req.query

    const lotteryTierRuleService = getLotteryTierRuleService(req)

    const result = await lotteryTierRuleService.list({
      lottery_campaign_id: lottery_campaign_id ? parseInt(lottery_campaign_id, 10) : undefined,
      segment_key,
      tier_name,
      status,
      page: parseInt(page, 10),
      page_size: parseInt(page_size, 10)
    })

    logger.info('[GET /] 查询档位规则列表', {
      admin_id: req.user.user_id,
      params: req.query,
      total: result.total
    })

    return res.apiSuccess(result, '获取档位规则列表成功')
  })
)

/**
 * GET /overview - 获取所有活动的分层配置概览
 */
router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const lotteryTierRuleService = getLotteryTierRuleService(req)

    const overview = await lotteryTierRuleService.getConfigOverview()

    logger.info('[GET /overview] 获取配置概览', {
      admin_id: req.user.user_id,
      campaign_count: overview.length
    })

    return res.apiSuccess(
      {
        campaigns: overview,
        total: overview.length
      },
      '获取配置概览成功'
    )
  })
)

/**
 * GET /campaign/:lottery_campaign_id - 获取指定活动的档位规则
 *
 * 路径参数：
 * - lottery_campaign_id: number - 活动ID
 *
 * 查询参数：
 * - segment_key: string - 用户分层标识（默认'default'）
 */
router.get(
  '/campaign/:lottery_campaign_id',
  asyncHandler(async (req, res) => {
    const { lottery_campaign_id } = req.params
    const { segment_key = 'default' } = req.query

    const lotteryTierRuleService = getLotteryTierRuleService(req)

    const result = await lotteryTierRuleService.getByCampaignAndSegment(
      parseInt(lottery_campaign_id, 10),
      segment_key
    )

    logger.info('[GET /campaign/:lottery_campaign_id] 获取活动档位规则', {
      admin_id: req.user.user_id,
      lottery_campaign_id,
      segment_key,
      rules_count: result.rules.length
    })

    return res.apiSuccess(result, '获取活动档位规则成功')
  })
)

/**
 * GET /validate/:lottery_campaign_id - 验证指定活动的档位配置
 *
 * 路径参数：
 * - lottery_campaign_id: number - 活动ID
 *
 * 查询参数：
 * - segment_key: string - 用户分层标识（默认'default'）
 */
router.get(
  '/validate/:lottery_campaign_id',
  asyncHandler(async (req, res) => {
    const { lottery_campaign_id } = req.params
    const { segment_key = 'default' } = req.query

    const lotteryTierRuleService = getLotteryTierRuleService(req)

    const result = await lotteryTierRuleService.validateTierWeights(
      parseInt(lottery_campaign_id, 10),
      segment_key
    )

    logger.info('[GET /validate/:lottery_campaign_id] 验证档位配置', {
      admin_id: req.user.user_id,
      lottery_campaign_id,
      segment_key,
      is_valid: result.valid
    })

    return res.apiSuccess(result, result.valid ? '档位配置验证通过' : '档位配置验证失败')
  })
)

/**
 * GET /:id - 获取档位规则详情
 *
 * 路径参数：
 * - id: number - 档位规则ID
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params

    const lotteryTierRuleService = getLotteryTierRuleService(req)

    const rule = await lotteryTierRuleService.getById(parseInt(id, 10))

    if (!rule) {
      return res.apiError('档位规则不存在', 'TIER_RULE_NOT_FOUND', null, 404)
    }

    logger.info('[GET /:id] 获取档位规则详情', {
      admin_id: req.user.user_id,
      tier_rule_id: id
    })

    return res.apiSuccess(rule, '获取档位规则详情成功')
  })
)

/**
 * POST / - 创建单个档位规则
 *
 * 请求体：
 * - lottery_campaign_id: number - 活动ID（必填）
 * - segment_key: string - 用户分层标识（默认'default'）
 * - tier_name: string - 档位名称（必填：high/mid/low）
 * - tier_weight: number - 档位权重（必填）
 * - status: string - 规则状态（默认'active'）
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { lottery_campaign_id, segment_key, tier_name, tier_weight, status } = req.body
    const lotteryTierRuleService = getLotteryTierRuleService(req)

    const result = await TransactionManager.executeInTransaction(async transaction => {
      return await lotteryTierRuleService.create(
        {
          lottery_campaign_id,
          segment_key,
          tier_name,
          tier_weight,
          status,
          created_by: req.user.user_id
        },
        { transaction }
      )
    })

    logger.info('[POST /] 创建档位规则', {
      admin_id: req.user.user_id,
      tier_rule_id: result.tier_rule_id,
      lottery_campaign_id,
      tier_name
    })

    return res.apiSuccess(result, '创建档位规则成功')
  })
)

/**
 * POST /batch - 批量创建三档位规则
 *
 * 请求体：
 * - lottery_campaign_id: number - 活动ID（必填）
 * - segment_key: string - 用户分层标识（默认'default'）
 * - weights: object - 各档位权重（必填）
 *   - high: number - 高档位权重
 *   - mid: number - 中档位权重
 *   - low: number - 低档位权重
 */
router.post(
  '/batch',
  asyncHandler(async (req, res) => {
    const { lottery_campaign_id, segment_key, weights } = req.body
    const lotteryTierRuleService = getLotteryTierRuleService(req)

    // 验证必填字段
    if (!lottery_campaign_id) {
      return res.apiError('活动ID（lottery_campaign_id）不能为空', 'INVALID_PARAMS', null, 400)
    }
    if (!weights || typeof weights !== 'object') {
      return res.apiError('权重配置（weights）不能为空', 'INVALID_PARAMS', null, 400)
    }
    if (weights.high === undefined || weights.mid === undefined || weights.low === undefined) {
      return res.apiError('权重配置必须包含 high/mid/low 三个档位', 'INVALID_PARAMS', null, 400)
    }

    const result = await TransactionManager.executeInTransaction(async transaction => {
      return await lotteryTierRuleService.createTierRules(
        {
          lottery_campaign_id,
          segment_key,
          weights,
          created_by: req.user.user_id
        },
        { transaction }
      )
    })

    logger.info('[POST /batch] 批量创建档位规则', {
      admin_id: req.user.user_id,
      lottery_campaign_id,
      segment_key,
      created_count: result.length
    })

    return res.apiSuccess(
      {
        rules: result,
        total: result.length
      },
      '批量创建档位规则成功'
    )
  })
)

/**
 * PUT /:id - 更新档位规则
 *
 * 路径参数：
 * - id: number - 档位规则ID
 *
 * 请求体：
 * - tier_weight: number - 档位权重（可选）
 * - status: string - 规则状态（可选）
 */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { tier_weight, status } = req.body
    const lotteryTierRuleService = getLotteryTierRuleService(req)

    const result = await TransactionManager.executeInTransaction(async transaction => {
      return await lotteryTierRuleService.update(
        parseInt(id, 10),
        {
          tier_weight,
          status,
          updated_by: req.user.user_id
        },
        { transaction }
      )
    })

    logger.info('[PUT /:id] 更新档位规则', {
      admin_id: req.user.user_id,
      tier_rule_id: id,
      tier_weight,
      status
    })

    return res.apiSuccess(result, '更新档位规则成功')
  })
)

/**
 * DELETE /:id - 删除档位规则
 *
 * 路径参数：
 * - id: number - 档位规则ID
 */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const lotteryTierRuleService = getLotteryTierRuleService(req)

    await TransactionManager.executeInTransaction(async transaction => {
      return await lotteryTierRuleService.delete(parseInt(id, 10), { transaction })
    })

    logger.info('[DELETE /:id] 删除档位规则', {
      admin_id: req.user.user_id,
      tier_rule_id: id
    })

    return res.apiSuccess({ tier_rule_id: parseInt(id, 10) }, '删除档位规则成功')
  })
)

module.exports = router
