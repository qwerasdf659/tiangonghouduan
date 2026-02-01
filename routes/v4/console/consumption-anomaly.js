/**
 * @file 消费异常检测路由
 * @description P1 需求：消费记录异常检测和风险评估接口
 *
 * @version 1.0.0
 * @date 2026-01-31
 *
 * 接口说明：
 * - GET /summary - 获取异常汇总统计（B-27）
 * - GET /high-risk - 获取高风险记录列表（B-28）
 * - POST /detect/:id - 检测单条记录异常（B-26）
 * - POST /batch-detect - 批量检测异常（B-26）
 * - PUT /:id/mark - 手动标记异常（B-30）
 * - GET /rules - 获取异常规则配置
 *
 * P1 任务对应：
 * - B-25：消费异常检测服务 ConsumptionAnomalyService
 * - B-26：异常标记
 * - B-27：异常汇总接口
 * - B-28：高风险记录查询
 * - B-29：风险评分（集成在检测中）
 * - B-30：手动标记功能
 *
 * 实现规范（V1.3.0）：
 * - 路由层禁止直接 require models
 * - 通过 ServiceManager 获取 consumption_anomaly 服务
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
 * 获取 AnomalyService 服务
 *
 * @param {Object} req - Express 请求对象
 * @returns {Object} AnomalyService 类（静态方法）
 */
function getAnomalyService(req) {
  // 通过 app.locals.services 获取
  const service = req.app.locals.services?.getService('consumption_anomaly')
  if (service) {
    return service
  }

  // 兜底：直接引入
  logger.warn('通过 app.locals.services 获取 consumption_anomaly 失败，使用直接引入')
  return require('../../../services/consumption/AnomalyService')
}

/**
 * 获取 models
 * @private
 * @param {Object} req - Express 请求对象
 * @returns {Object} Sequelize 模型集合
 */
function getModels(req) {
  // Phase 3 收口：通过 ServiceManager 获取 models，避免直连
  return req.models || req.app.locals.models
}

/**
 * @api {get} /api/v4/admin/consumption-anomaly/summary 获取异常汇总统计
 * @apiName GetAnomalySummary
 * @apiGroup ConsumptionAnomaly
 * @apiVersion 1.0.0
 *
 * @apiDescription P1 需求 B-27：获取消费记录异常汇总统计
 *
 * @apiQuery {String} [status] 状态筛选（pending/approved/rejected）
 * @apiQuery {String} [start_date] 开始日期（ISO 格式）
 * @apiQuery {String} [end_date] 结束日期（ISO 格式）
 *
 * @apiSuccess {Boolean} success 请求是否成功
 * @apiSuccess {Object} data 汇总数据
 * @apiSuccess {Number} data.total_count 总记录数
 * @apiSuccess {Number} data.anomaly_count 异常记录数
 * @apiSuccess {Number} data.anomaly_ratio 异常比例（%）
 * @apiSuccess {Object} data.risk_distribution 风险等级分布
 * @apiSuccess {Object} data.flag_distribution 异常类型分布
 *
 * @apiHeader {String} Authorization Bearer token
 *
 * @apiPermission admin
 */
router.get('/summary', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const { status, start_date, end_date } = req.query

  logger.info('获取异常汇总统计', {
    status,
    start_date,
    end_date,
    user_id: req.user?.user_id
  })

  try {
    const anomalyService = getAnomalyService(req)
    const models = getModels(req)

    const summary = await anomalyService.getAnomalySummary(models, {
      status,
      start_date: start_date ? new Date(start_date) : undefined,
      end_date: end_date ? new Date(end_date) : undefined
    })

    logger.info('异常汇总统计获取成功', {
      total: summary.total_count,
      anomaly: summary.anomaly_count
    })

    return res.apiSuccess(summary, '获取异常汇总统计成功')
  } catch (error) {
    logger.error('获取异常汇总统计失败', {
      error: error.message,
      stack: error.stack
    })

    return res.apiError(
      '获取异常汇总统计失败',
      'ANOMALY_SUMMARY_ERROR',
      { error: error.message },
      500
    )
  }
})

/**
 * @api {get} /api/v4/admin/consumption-anomaly/high-risk 获取高风险记录列表
 * @apiName GetHighRiskRecords
 * @apiGroup ConsumptionAnomaly
 * @apiVersion 1.0.0
 *
 * @apiDescription P1 需求 B-28：获取高风险消费记录列表，用于优先审核
 *
 * @apiQuery {Number} [min_score=61] 最低异常评分
 * @apiQuery {String} [status=pending] 状态筛选
 * @apiQuery {Number} [page=1] 页码
 * @apiQuery {Number} [page_size=20] 每页数量
 *
 * @apiSuccess {Boolean} success 请求是否成功
 * @apiSuccess {Array} data.records 高风险记录列表
 * @apiSuccess {Object} data.pagination 分页信息
 *
 * @apiHeader {String} Authorization Bearer token
 *
 * @apiPermission admin
 */
router.get('/high-risk', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const { min_score = '61', status = 'pending', page = '1', page_size = '20' } = req.query

  logger.info('获取高风险记录', {
    min_score,
    status,
    page,
    user_id: req.user?.user_id
  })

  try {
    const anomalyService = getAnomalyService(req)
    const models = getModels(req)

    const result = await anomalyService.getHighRiskRecords(models, {
      min_score: parseInt(min_score, 10) || 61,
      status: status || undefined,
      page: parseInt(page, 10) || 1,
      page_size: parseInt(page_size, 10) || 20
    })

    logger.info('高风险记录获取成功', {
      total: result.pagination.total_count,
      returned: result.records.length
    })

    return res.apiSuccess(result, '获取高风险记录成功')
  } catch (error) {
    logger.error('获取高风险记录失败', {
      error: error.message,
      stack: error.stack
    })

    return res.apiError('获取高风险记录失败', 'HIGH_RISK_ERROR', { error: error.message }, 500)
  }
})

/**
 * @api {post} /api/v4/admin/consumption-anomaly/detect/:id 检测单条记录异常
 * @apiName DetectRecordAnomaly
 * @apiGroup ConsumptionAnomaly
 * @apiVersion 1.0.0
 *
 * @apiDescription P1 需求 B-26：检测单条消费记录的异常并保存结果
 *
 * @apiParam {Number} id 消费记录ID
 *
 * @apiBody {Boolean} [save=true] 是否保存检测结果
 *
 * @apiSuccess {Boolean} success 请求是否成功
 * @apiSuccess {Object} data 检测结果
 * @apiSuccess {Array} data.anomaly_flags 异常标记数组
 * @apiSuccess {Number} data.anomaly_score 异常评分
 * @apiSuccess {String} data.risk_level 风险等级
 *
 * @apiHeader {String} Authorization Bearer token
 *
 * @apiPermission admin
 */
router.post('/detect/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const recordId = parseInt(req.params.id, 10)
  if (isNaN(recordId) || recordId <= 0) {
    return res.apiError('无效的记录ID', 'INVALID_RECORD_ID', null, 400)
  }

  const { save = true } = req.body

  logger.info('检测单条记录异常', {
    record_id: recordId,
    save,
    user_id: req.user?.user_id
  })

  try {
    const anomalyService = getAnomalyService(req)
    const models = getModels(req)

    // 获取记录
    const record = await models.ConsumptionRecord.findByPk(recordId)
    if (!record) {
      return res.apiError('消费记录不存在', 'RECORD_NOT_FOUND', null, 404)
    }

    const result = await anomalyService.detectAnomalies(record, {
      models,
      save: save !== false
    })

    logger.info('异常检测完成', {
      record_id: recordId,
      anomaly_flags: result.anomaly_flags,
      anomaly_score: result.anomaly_score
    })

    return res.apiSuccess(result, '异常检测完成')
  } catch (error) {
    logger.error('异常检测失败', {
      record_id: recordId,
      error: error.message,
      stack: error.stack
    })

    return res.apiError('异常检测失败', 'DETECT_ERROR', { error: error.message }, 500)
  }
})

/**
 * @api {post} /api/v4/admin/consumption-anomaly/batch-detect 批量检测异常
 * @apiName BatchDetectAnomaly
 * @apiGroup ConsumptionAnomaly
 * @apiVersion 1.0.0
 *
 * @apiDescription P1 需求 B-26：批量检测消费记录异常
 *
 * @apiBody {Array} record_ids 记录ID数组
 * @apiBody {Boolean} [save=true] 是否保存检测结果
 *
 * @apiSuccess {Boolean} success 请求是否成功
 * @apiSuccess {Object} data 批量检测结果
 * @apiSuccess {Number} data.total 总数
 * @apiSuccess {Number} data.detected 检测完成数
 * @apiSuccess {Number} data.anomaly_count 异常记录数
 * @apiSuccess {Number} data.high_risk_count 高风险记录数
 *
 * @apiHeader {String} Authorization Bearer token
 *
 * @apiPermission admin
 */
router.post('/batch-detect', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const { record_ids, save = true } = req.body

  if (!Array.isArray(record_ids) || record_ids.length === 0) {
    return res.apiError('record_ids 必须是非空数组', 'INVALID_RECORD_IDS', null, 400)
  }

  if (record_ids.length > 100) {
    return res.apiError('单次批量检测最多100条记录', 'TOO_MANY_RECORDS', null, 400)
  }

  logger.info('批量检测异常', {
    record_count: record_ids.length,
    save,
    user_id: req.user?.user_id
  })

  try {
    const anomalyService = getAnomalyService(req)
    const models = getModels(req)

    // 批量获取记录
    const records = await models.ConsumptionRecord.findAll({
      where: {
        record_id: { [require('sequelize').Op.in]: record_ids },
        is_deleted: 0
      }
    })

    if (records.length === 0) {
      return res.apiError('未找到有效记录', 'RECORDS_NOT_FOUND', null, 404)
    }

    const result = await anomalyService.batchDetect(records, {
      models,
      save: save !== false
    })

    logger.info('批量异常检测完成', {
      total: result.total,
      anomaly_count: result.anomaly_count,
      high_risk_count: result.high_risk_count,
      duration_ms: result.duration_ms
    })

    return res.apiSuccess(result, '批量异常检测完成')
  } catch (error) {
    logger.error('批量异常检测失败', {
      error: error.message,
      stack: error.stack
    })

    return res.apiError('批量异常检测失败', 'BATCH_DETECT_ERROR', { error: error.message }, 500)
  }
})

/**
 * @api {put} /api/v4/admin/consumption-anomaly/:id/mark 手动标记异常
 * @apiName MarkAnomaly
 * @apiGroup ConsumptionAnomaly
 * @apiVersion 1.0.0
 *
 * @apiDescription P1 需求 B-30：手动标记消费记录的异常
 *
 * @apiParam {Number} id 消费记录ID
 *
 * @apiBody {Array} flags 异常标记数组
 * @apiBody {Number} score 异常评分（0-100）
 * @apiBody {String} [reason] 标记原因
 *
 * @apiSuccess {Boolean} success 请求是否成功
 * @apiSuccess {Object} data 更新后的异常信息
 *
 * @apiHeader {String} Authorization Bearer token
 *
 * @apiPermission admin
 */
router.put('/:id/mark', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const recordId = parseInt(req.params.id, 10)
  if (isNaN(recordId) || recordId <= 0) {
    return res.apiError('无效的记录ID', 'INVALID_RECORD_ID', null, 400)
  }

  const { flags, score, reason } = req.body

  if (!Array.isArray(flags)) {
    return res.apiError('flags 必须是数组', 'INVALID_FLAGS', null, 400)
  }

  if (typeof score !== 'number' || score < 0 || score > 100) {
    return res.apiError('score 必须是 0-100 之间的数字', 'INVALID_SCORE', null, 400)
  }

  logger.info('手动标记异常', {
    record_id: recordId,
    flags,
    score,
    user_id: req.user?.user_id
  })

  try {
    const anomalyService = getAnomalyService(req)
    const models = getModels(req)

    const result = await anomalyService.markAnomaly(
      models,
      recordId,
      { flags, score },
      {
        operator_id: req.user?.user_id,
        reason,
        ip_address: req.ip
      }
    )

    logger.info('手动标记异常成功', {
      record_id: recordId,
      new_flags: result.anomaly_flags,
      new_score: result.anomaly_score
    })

    return res.apiSuccess(result, '手动标记异常成功')
  } catch (error) {
    logger.error('手动标记异常失败', {
      record_id: recordId,
      error: error.message,
      stack: error.stack
    })

    if (error.message === '消费记录不存在') {
      return res.apiError('消费记录不存在', 'RECORD_NOT_FOUND', null, 404)
    }

    if (error.message.includes('无效的异常标记')) {
      return res.apiError(error.message, 'INVALID_FLAGS', null, 400)
    }

    return res.apiError('手动标记异常失败', 'MARK_ERROR', { error: error.message }, 500)
  }
})

/**
 * @api {get} /api/v4/admin/consumption-anomaly/rules 获取异常规则配置
 * @apiName GetAnomalyRules
 * @apiGroup ConsumptionAnomaly
 * @apiVersion 1.0.0
 *
 * @apiDescription 获取当前配置的异常检测规则
 *
 * @apiSuccess {Boolean} success 请求是否成功
 * @apiSuccess {Object} data 异常规则配置
 *
 * @apiHeader {String} Authorization Bearer token
 *
 * @apiPermission admin
 */
router.get('/rules', authenticateToken, requireRoleLevel(100), async (req, res) => {
  logger.info('获取异常规则配置', {
    user_id: req.user?.user_id
  })

  try {
    const anomalyService = getAnomalyService(req)
    const rules = anomalyService.getAnomalyRules()

    return res.apiSuccess(rules, '获取异常规则配置成功')
  } catch (error) {
    logger.error('获取异常规则配置失败', {
      error: error.message
    })

    return res.apiError('获取异常规则配置失败', 'RULES_ERROR', { error: error.message }, 500)
  }
})

module.exports = router
