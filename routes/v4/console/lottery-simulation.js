'use strict'

/**
 * @file 策略效果模拟分析路由
 * @description 提供策略参数的 Monte Carlo 模拟、对比分析、灵敏度分析、
 *              目标反推、用户旅程模拟、一键应用和偏差追踪等 API。
 *
 * API 列表（7 个核心 + 历史记录 CRUD）：
 * - GET  /baseline/:lottery_campaign_id — 加载模拟基线
 * - POST /run — Monte Carlo 模拟
 * - POST /user-journey — 用户旅程模拟
 * - POST /sensitivity — 灵敏度分析
 * - POST /recommend — 目标反推
 * - POST /apply/:lottery_simulation_record_id — 一键应用到线上
 * - POST /drift/:lottery_simulation_record_id — 偏差追踪
 * - GET  /history/:lottery_campaign_id — 模拟历史列表
 *
 * 权限：authenticateToken + requireRoleLevel(100)（管理员）
 *
 * @module routes/v4/console/lottery-simulation
 * @see docs/策略效果模拟分析页面-设计方案.md Section 六
 * @since 2026-02-20
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const { logger } = require('../../../utils/logger')

/**
 * 从 ServiceManager 获取 StrategySimulationService
 * @param {Object} req - Express 请求对象
 * @returns {Object} StrategySimulationService 实例
 */
function getSimulationService(req) {
  return req.app.locals.services.getService('strategy_simulation')
}

// ==================== 统一中间件 ====================
router.use(authenticateToken, requireRoleLevel(100))

// ==================== 核心 API ====================

/**
 * GET /baseline/:lottery_campaign_id
 * 加载指定活动的模拟基线数据
 */
router.get('/baseline/:lottery_campaign_id', async (req, res) => {
  try {
    const { lottery_campaign_id } = req.params
    const service = getSimulationService(req)
    const baseline = await service.loadBaseline(Number(lottery_campaign_id))
    return res.apiSuccess(baseline, '基线数据加载成功')
  } catch (error) {
    logger.error('加载模拟基线失败', { error: error.message, params: req.params })
    return res.apiError(error.message, 'BASELINE_LOAD_ERROR', null, error.statusCode || 500)
  }
})

/**
 * POST /run
 * 执行 Monte Carlo 模拟
 */
router.post('/run', async (req, res) => {
  try {
    const { lottery_campaign_id, simulation_count = 10000, proposed_config, scenario } = req.body

    if (!lottery_campaign_id) {
      return res.apiError('缺少 lottery_campaign_id 参数', 'MISSING_PARAM', null, 400)
    }
    if (!scenario) {
      return res.apiError('缺少 scenario 参数', 'MISSING_PARAM', null, 400)
    }

    const allowedCounts = [1000, 5000, 10000, 50000]
    const count = allowedCounts.includes(simulation_count) ? simulation_count : 10000

    const service = getSimulationService(req)
    const result = await service.runSimulation(
      Number(lottery_campaign_id),
      proposed_config,
      scenario,
      count
    )

    const record = await service.saveSimulationRecord({
      lottery_campaign_id: Number(lottery_campaign_id),
      simulation_name: req.body.simulation_name || null,
      simulation_count: count,
      proposed_config: proposed_config || {},
      scenario,
      simulation_result: result.simulation_result,
      comparison: result.comparison,
      risk_assessment: result.risk_assessment,
      created_by: req.user?.user_id || null
    })

    return res.apiSuccess(
      {
        ...result,
        lottery_simulation_record_id: record.lottery_simulation_record_id
      },
      `Monte Carlo 模拟完成（${count} 次迭代）`
    )
  } catch (error) {
    logger.error('Monte Carlo 模拟失败', { error: error.message })
    return res.apiError(error.message, 'SIMULATION_RUN_ERROR', null, error.statusCode || 500)
  }
})

/**
 * POST /user-journey
 * 模拟单个用户的连续抽奖旅程
 */
router.post('/user-journey', async (req, res) => {
  try {
    const { lottery_campaign_id, proposed_config, user_profile, draw_count = 20 } = req.body

    if (!lottery_campaign_id || !user_profile) {
      return res.apiError(
        '缺少 lottery_campaign_id 或 user_profile 参数',
        'MISSING_PARAM',
        null,
        400
      )
    }

    const service = getSimulationService(req)
    const result = await service.simulateUserJourney(
      Number(lottery_campaign_id),
      proposed_config,
      user_profile,
      Math.min(draw_count, 100)
    )

    return res.apiSuccess(result, `用户旅程模拟完成（${draw_count} 次抽奖）`)
  } catch (error) {
    logger.error('用户旅程模拟失败', { error: error.message })
    return res.apiError(error.message, 'USER_JOURNEY_ERROR', null, error.statusCode || 500)
  }
})

// ==================== 增强 API ====================

/**
 * POST /sensitivity
 * 灵敏度分析：对目标参数进行扫射
 */
router.post('/sensitivity', async (req, res) => {
  try {
    const {
      lottery_campaign_id,
      target_param,
      range,
      simulation_count_per_step = 5000,
      scenario
    } = req.body

    if (!lottery_campaign_id || !target_param || !range || !scenario) {
      return res.apiError('缺少必要参数', 'MISSING_PARAM', null, 400)
    }

    const service = getSimulationService(req)
    const result = await service.runSensitivityAnalysis(
      Number(lottery_campaign_id),
      target_param,
      range,
      Math.min(simulation_count_per_step, 10000),
      scenario
    )

    return res.apiSuccess(result, '灵敏度分析完成')
  } catch (error) {
    logger.error('灵敏度分析失败', { error: error.message })
    return res.apiError(error.message, 'SENSITIVITY_ERROR', null, error.statusCode || 500)
  }
})

/**
 * POST /recommend
 * 目标反推：搜索满足约束条件的参数组合
 */
router.post('/recommend', async (req, res) => {
  try {
    const { lottery_campaign_id, constraints, adjustable_params, scenario } = req.body

    if (!lottery_campaign_id || !constraints || !adjustable_params || !scenario) {
      return res.apiError('缺少必要参数', 'MISSING_PARAM', null, 400)
    }

    const service = getSimulationService(req)
    const result = await service.recommendConfig(
      Number(lottery_campaign_id),
      constraints,
      adjustable_params,
      scenario
    )

    return res.apiSuccess(result, `目标反推完成，找到 ${result.recommendations.length} 个推荐方案`)
  } catch (error) {
    logger.error('目标反推失败', { error: error.message })
    return res.apiError(error.message, 'RECOMMEND_ERROR', null, error.statusCode || 500)
  }
})

/**
 * POST /apply/:lottery_simulation_record_id
 * 一键应用模拟配置到线上
 */
router.post('/apply/:lottery_simulation_record_id', async (req, res) => {
  try {
    const { lottery_simulation_record_id } = req.params
    const operator_id = req.user?.user_id

    if (!operator_id) {
      return res.apiError('无法获取操作者身份', 'AUTH_ERROR', null, 401)
    }

    const TransactionManager = require('../../../utils/TransactionManager')

    const result = await TransactionManager.execute(async transaction => {
      const service = getSimulationService(req)
      return service.applySimulation(Number(lottery_simulation_record_id), operator_id, {
        transaction
      })
    })

    return res.apiSuccess(result, '模拟配置已应用到线上')
  } catch (error) {
    logger.error('应用模拟配置失败', { error: error.message })
    return res.apiError(error.message, 'APPLY_ERROR', null, error.statusCode || 500)
  }
})

/**
 * POST /drift/:lottery_simulation_record_id
 * 计算模拟预测与实际数据的偏差
 */
router.post('/drift/:lottery_simulation_record_id', async (req, res) => {
  try {
    const { lottery_simulation_record_id } = req.params

    const service = getSimulationService(req)
    const result = await service.calculateDrift(Number(lottery_simulation_record_id))

    return res.apiSuccess(result, '偏差追踪计算完成')
  } catch (error) {
    logger.error('偏差追踪计算失败', { error: error.message })
    return res.apiError(error.message, 'DRIFT_ERROR', null, error.statusCode || 500)
  }
})

// ==================== 运维闭环 API（Phase 7）====================

/**
 * POST /schedule/:lottery_simulation_record_id
 * 定时应用模拟配置（指定未来生效时间）
 */
router.post('/schedule/:lottery_simulation_record_id', async (req, res) => {
  try {
    const { lottery_simulation_record_id } = req.params
    const { scheduled_at } = req.body
    const operator_id = req.user?.user_id

    if (!scheduled_at) {
      return res.apiError('缺少 scheduled_at 参数', 'MISSING_PARAM', null, 400)
    }
    if (!operator_id) {
      return res.apiError('无法获取操作者身份', 'AUTH_ERROR', null, 401)
    }

    const TransactionManager = require('../../../utils/TransactionManager')

    const result = await TransactionManager.execute(async transaction => {
      const service = getSimulationService(req)
      return service.scheduleConfigActivation(
        Number(lottery_simulation_record_id),
        operator_id,
        scheduled_at,
        { transaction }
      )
    })

    return res.apiSuccess(result, '配置定时生效已设置')
  } catch (error) {
    logger.error('定时配置设置失败', { error: error.message })
    return res.apiError(error.message, 'SCHEDULE_ERROR', null, error.statusCode || 500)
  }
})

/**
 * GET /version-history/:lottery_campaign_id
 * 获取策略配置的变更历史（含版本回滚信息）
 */
router.get('/version-history/:lottery_campaign_id', async (req, res) => {
  try {
    const { lottery_campaign_id } = req.params
    const { limit = 50, offset = 0 } = req.query

    const service = getSimulationService(req)
    const result = await service.getConfigVersionHistory(Number(lottery_campaign_id), {
      limit: Number(limit),
      offset: Number(offset)
    })

    return res.apiSuccess(result, '配置变更历史查询成功')
  } catch (error) {
    logger.error('查询配置变更历史失败', { error: error.message })
    return res.apiError(error.message, 'VERSION_HISTORY_ERROR', null, 500)
  }
})

/**
 * POST /rollback/:log_id
 * 回滚到指定版本的配置
 */
router.post('/rollback/:log_id', async (req, res) => {
  try {
    const { log_id } = req.params
    const operator_id = req.user?.user_id

    if (!operator_id) {
      return res.apiError('无法获取操作者身份', 'AUTH_ERROR', null, 401)
    }

    const TransactionManager = require('../../../utils/TransactionManager')

    const result = await TransactionManager.execute(async transaction => {
      const service = getSimulationService(req)
      return service.rollbackConfig(Number(log_id), operator_id, { transaction })
    })

    return res.apiSuccess(result, '配置回滚成功')
  } catch (error) {
    logger.error('配置回滚失败', { error: error.message })
    return res.apiError(error.message, 'ROLLBACK_ERROR', null, error.statusCode || 500)
  }
})

/**
 * GET /budget-pacing/:lottery_campaign_id
 * 获取预算消耗趋势和耗尽日期预测
 */
router.get('/budget-pacing/:lottery_campaign_id', async (req, res) => {
  try {
    const { lottery_campaign_id } = req.params

    const service = getSimulationService(req)
    const result = await service.getBudgetPacingForecast(Number(lottery_campaign_id))

    return res.apiSuccess(result, '预算节奏预测查询成功')
  } catch (error) {
    logger.error('预算节奏预测失败', { error: error.message })
    return res.apiError(error.message, 'BUDGET_PACING_ERROR', null, error.statusCode || 500)
  }
})

/**
 * POST /circuit-breaker/:lottery_simulation_record_id
 * 创建异常熔断监控规则
 */
router.post('/circuit-breaker/:lottery_simulation_record_id', async (req, res) => {
  try {
    const { lottery_simulation_record_id } = req.params
    const { tolerance } = req.body

    const TransactionManager = require('../../../utils/TransactionManager')

    const result = await TransactionManager.execute(async transaction => {
      const service = getSimulationService(req)
      return service.createCircuitBreakerRules(Number(lottery_simulation_record_id), {
        transaction,
        tolerance: tolerance || 0.03
      })
    })

    return res.apiSuccess(result, '熔断监控规则已创建')
  } catch (error) {
    logger.error('创建熔断规则失败', { error: error.message })
    return res.apiError(error.message, 'CIRCUIT_BREAKER_ERROR', null, error.statusCode || 500)
  }
})

/**
 * GET /circuit-breaker-status/:lottery_campaign_id
 * 检查异常熔断状态
 */
router.get('/circuit-breaker-status/:lottery_campaign_id', async (req, res) => {
  try {
    const { lottery_campaign_id } = req.params

    const service = getSimulationService(req)
    const result = await service.checkCircuitBreakerStatus(Number(lottery_campaign_id))

    return res.apiSuccess(result, '熔断状态检查完成')
  } catch (error) {
    logger.error('熔断状态检查失败', { error: error.message })
    return res.apiError(error.message, 'CIRCUIT_BREAKER_STATUS_ERROR', null, 500)
  }
})

// ==================== 历史记录 CRUD ====================

/**
 * GET /history/:lottery_campaign_id
 * 获取指定活动的模拟历史列表
 */
router.get('/history/:lottery_campaign_id', async (req, res) => {
  try {
    const { lottery_campaign_id } = req.params
    const { limit = 20, offset = 0 } = req.query

    const service = getSimulationService(req)
    const result = await service.getSimulationHistory(Number(lottery_campaign_id), {
      limit: Math.min(Number(limit), 50),
      offset: Number(offset)
    })

    return res.apiSuccess(
      {
        records: result.rows,
        total: result.count,
        limit: Number(limit),
        offset: Number(offset)
      },
      '模拟历史查询成功'
    )
  } catch (error) {
    logger.error('查询模拟历史失败', { error: error.message })
    return res.apiError(error.message, 'HISTORY_QUERY_ERROR', null, 500)
  }
})

/**
 * GET /record/:lottery_simulation_record_id
 * 获取单条模拟记录详情
 */
router.get('/record/:lottery_simulation_record_id', async (req, res) => {
  try {
    const { lottery_simulation_record_id } = req.params
    const service = getSimulationService(req)
    const record = await service.getSimulationRecord(Number(lottery_simulation_record_id))
    if (!record) {
      return res.apiError('模拟记录不存在', 'NOT_FOUND', null, 404)
    }

    return res.apiSuccess(record, '模拟记录获取成功')
  } catch (error) {
    logger.error('获取模拟记录失败', { error: error.message })
    return res.apiError(error.message, 'RECORD_QUERY_ERROR', null, 500)
  }
})

module.exports = router
