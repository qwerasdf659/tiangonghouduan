/**
 * @file 批量操作管理路由（阶段C 批量操作API）
 * @description 后台批量操作接口：批量赠送抽奖次数、批量设置干预规则、批量核销等
 *
 * 技术决策来源：docs/抽奖运营后台-后端API开发需求文档.md
 *
 * 核心特性：
 * - 幂等性保障（Redis + MySQL 双重校验）
 * - 限流控制（动态配置）
 * - 部分成功模式（单条操作独立事务）
 * - 审计日志（关联 batch_operation_logs 表）
 *
 * @note 本模块故意在循环中使用 await（no-await-in-loop）
 *       以实现"部分成功"模式：单条操作失败不影响其他操作继续执行
 *       每个子操作使用独立事务，确保数据一致性
 *
 * API清单（阶段C）：
 * - B6: POST /api/v4/console/batch-operations/quota-grant     批量赠送抽奖次数
 * - B7: POST /api/v4/console/batch-operations/preset-rules    批量设置干预规则
 * - B8: POST /api/v4/console/batch-operations/redemption-verify 批量核销确认
 * - B9: POST /api/v4/console/batch-operations/campaign-status 批量活动状态切换
 * - B10: POST /api/v4/console/batch-operations/budget-adjust  批量预算调整
 *
 * 通用查询：
 * - GET /api/v4/console/batch-operations/logs                 批量操作日志列表
 * - GET /api/v4/console/batch-operations/logs/:id             批量操作日志详情
 *
 * 创建时间：2026-01-30
 * @version 1.0.0
 */

'use strict'

/* eslint-disable no-await-in-loop */
/**
 * 批量操作采用"部分成功"模式，循环中的 await 是设计需求
 * 每个子操作使用独立事务，确保单条失败不影响其他操作
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger
const BatchOperationService = require('../../../services/BatchOperationService')
const SystemConfigService = require('../../../services/SystemConfigService')
const { BatchOperationLog } = require('../../../models')
const { sequelize } = require('../../../models')

// ==================== 辅助函数 ====================

/**
 * 获取 LotteryQuotaService
 * @param {Object} req - Express 请求对象
 * @returns {Object} LotteryQuotaService
 */
function getLotteryQuotaService(req) {
  return req.app.locals.services.getService('lottery_quota')
}

/**
 * 获取 LotteryPresetService
 * @param {Object} req - Express 请求对象
 * @returns {Object} LotteryPresetService
 */
function getLotteryPresetService(req) {
  return req.app.locals.services.getService('lottery_preset')
}

/**
 * 获取 RedemptionService
 * @param {Object} req - Express 请求对象
 * @returns {Object} RedemptionService
 */
function getRedemptionService(req) {
  return req.app.locals.services.getService('redemption_order')
}

/**
 * 获取 ActivityService
 * @param {Object} req - Express 请求对象
 * @returns {Object} ActivityService
 */
function getActivityService(req) {
  return req.app.locals.services.getService('activity')
}

// ==================== B6: 批量赠送抽奖次数 ====================

/**
 * B6: 批量赠送抽奖次数
 * POST /api/v4/console/batch-operations/quota-grant
 *
 * 业务场景：
 * - 运营活动期间批量为用户赠送抽奖次数
 * - 客服补偿场景批量处理
 * - VIP用户批量权益发放
 *
 * 请求体：
 * {
 *   campaign_id: number,      // 必填：活动ID
 *   user_ids: number[],       // 必填：用户ID列表（最多100个）
 *   bonus_count: number,      // 必填：每人赠送次数
 *   reason: string            // 必填：赠送原因（用于审计）
 * }
 *
 * 响应：
 * {
 *   batch_log_id: number,     // 批处理日志ID
 *   status: string,           // 处理状态
 *   total_count: number,      // 总处理数量
 *   success_count: number,    // 成功数量
 *   fail_count: number,       // 失败数量
 *   success_rate: number,     // 成功率（百分比）
 *   result_details: {         // 详细结果
 *     success_items: [],      // 成功项
 *     failed_items: []        // 失败项（含错误信息）
 *   }
 * }
 */
router.post('/quota-grant', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const operator_id = req.user.user_id
  const operation_type = BatchOperationLog.OPERATION_TYPES.QUOTA_GRANT_BATCH

  try {
    const { campaign_id, user_ids, bonus_count, reason } = req.body

    // ========== 参数验证 ==========
    if (!campaign_id || isNaN(parseInt(campaign_id))) {
      return res.apiError('campaign_id 必须为有效的活动ID', 'INVALID_CAMPAIGN_ID', null, 400)
    }

    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.apiError('user_ids 必须为非空数组', 'INVALID_USER_IDS', null, 400)
    }

    if (!bonus_count || parseInt(bonus_count) <= 0) {
      return res.apiError('bonus_count 必须为正整数', 'INVALID_BONUS_COUNT', null, 400)
    }

    if (!reason || reason.trim().length === 0) {
      return res.apiError('reason 不能为空', 'INVALID_REASON', null, 400)
    }

    // ========== 预检查 ==========
    const preCheckResult = await BatchOperationService.preCheck({
      operation_type,
      operator_id,
      operation_params: { campaign_id, user_ids, bonus_count, reason },
      items_count: user_ids.length
    })

    if (!preCheckResult.passed) {
      const firstError = preCheckResult.errors[0]

      // 如果是幂等冲突，返回已有的日志信息
      if (firstError.code === 'IDEMPOTENCY_CONFLICT') {
        logger.warn('批量赠送抽奖次数：幂等冲突', {
          operator_id,
          existing_log: firstError.existing_log
        })
        return res.apiError(
          '操作已提交或正在处理中，请勿重复提交',
          'IDEMPOTENCY_CONFLICT',
          {
            existing_batch_log_id: firstError.existing_log?.batch_log_id
          },
          409
        )
      }

      return res.apiError(
        firstError.message,
        firstError.code,
        { errors: preCheckResult.errors },
        429
      )
    }

    // ========== 创建批量操作日志 ==========
    const batchLog = await BatchOperationService.createOperationLog({
      operation_type,
      operator_id,
      total_count: user_ids.length,
      operation_params: { campaign_id, user_ids, bonus_count, reason },
      idempotency_key: preCheckResult.idempotency_key
    })

    // ========== 执行批量操作（部分成功模式） ==========
    const successItems = []
    const failedItems = []
    const LotteryQuotaService = getLotteryQuotaService(req)

    for (const user_id of user_ids) {
      const transaction = await sequelize.transaction()
      try {
        // 调用单用户赠送接口
        const result = await LotteryQuotaService.addBonusDrawCount(
          {
            user_id: parseInt(user_id),
            campaign_id: parseInt(campaign_id),
            bonus_count: parseInt(bonus_count),
            reason: `[批量赠送] ${reason.trim()}`
          },
          { transaction, admin_id: operator_id }
        )

        await transaction.commit()

        successItems.push({
          user_id: parseInt(user_id),
          new_bonus_count: result?.bonus_draw_count || result?.new_total_available,
          message: '赠送成功'
        })
      } catch (error) {
        await transaction.rollback()

        failedItems.push({
          user_id: parseInt(user_id),
          error_code: error.code || 'GRANT_FAILED',
          error_message: error.message || '赠送失败'
        })

        logger.warn('批量赠送单用户失败', {
          batch_log_id: batchLog.batch_log_id,
          user_id,
          error: error.message
        })
      }
    }

    // ========== 更新批量操作日志 ==========
    await BatchOperationService.updateProgress(batchLog.batch_log_id, {
      success_count: successItems.length,
      fail_count: failedItems.length,
      result_summary: {
        success_items: successItems,
        failed_items: failedItems,
        campaign_id,
        bonus_count,
        reason
      }
    })

    // 重新获取更新后的日志
    const finalLog = await BatchOperationService.getOperationDetail(batchLog.batch_log_id)

    logger.info('批量赠送抽奖次数完成', {
      batch_log_id: batchLog.batch_log_id,
      operator_id,
      campaign_id,
      total_count: user_ids.length,
      success_count: successItems.length,
      fail_count: failedItems.length
    })

    return res.apiSuccess(
      {
        batch_log_id: finalLog.batch_log_id,
        status: finalLog.status,
        status_name: finalLog.status_name,
        total_count: finalLog.total_count,
        success_count: finalLog.success_count,
        fail_count: finalLog.fail_count,
        success_rate: finalLog.success_rate,
        result_details: {
          success_items: successItems,
          failed_items: failedItems
        }
      },
      '批量赠送抽奖次数完成'
    )
  } catch (error) {
    logger.error('批量赠送抽奖次数失败', {
      operator_id,
      error: error.message,
      stack: error.stack
    })
    return res.apiError(`批量赠送失败：${error.message}`, 'BATCH_QUOTA_GRANT_FAILED', null, 500)
  }
})

// ==================== B9: 批量活动状态切换 ====================

/**
 * B9: 批量活动状态切换
 * POST /api/v4/console/batch-operations/campaign-status
 *
 * 业务场景：
 * - 节假日批量暂停/恢复活动
 * - 系统维护期间批量停止活动
 * - 季度末批量结束活动
 *
 * 请求体：
 * {
 *   campaign_ids: number[],   // 必填：活动ID列表（最多20个）
 *   target_status: string,    // 必填：目标状态（active/paused/ended）
 *   reason: string            // 必填：切换原因
 * }
 */
router.post('/campaign-status', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const operator_id = req.user.user_id
  const operation_type = BatchOperationLog.OPERATION_TYPES.CAMPAIGN_STATUS_BATCH

  try {
    const { campaign_ids, target_status, reason } = req.body

    // ========== 参数验证 ==========
    if (!Array.isArray(campaign_ids) || campaign_ids.length === 0) {
      return res.apiError('campaign_ids 必须为非空数组', 'INVALID_CAMPAIGN_IDS', null, 400)
    }

    const validStatuses = ['active', 'paused', 'ended']
    if (!target_status || !validStatuses.includes(target_status)) {
      return res.apiError(
        `target_status 必须为 ${validStatuses.join('/')}`,
        'INVALID_TARGET_STATUS',
        null,
        400
      )
    }

    if (!reason || reason.trim().length === 0) {
      return res.apiError('reason 不能为空', 'INVALID_REASON', null, 400)
    }

    // ========== 预检查 ==========
    const preCheckResult = await BatchOperationService.preCheck({
      operation_type,
      operator_id,
      operation_params: { campaign_ids, target_status, reason },
      items_count: campaign_ids.length
    })

    if (!preCheckResult.passed) {
      const firstError = preCheckResult.errors[0]
      if (firstError.code === 'IDEMPOTENCY_CONFLICT') {
        return res.apiError(
          '操作已提交或正在处理中',
          'IDEMPOTENCY_CONFLICT',
          {
            existing_batch_log_id: firstError.existing_log?.batch_log_id
          },
          409
        )
      }
      return res.apiError(
        firstError.message,
        firstError.code,
        { errors: preCheckResult.errors },
        429
      )
    }

    // ========== 创建批量操作日志 ==========
    const batchLog = await BatchOperationService.createOperationLog({
      operation_type,
      operator_id,
      total_count: campaign_ids.length,
      operation_params: { campaign_ids, target_status, reason },
      idempotency_key: preCheckResult.idempotency_key
    })

    // ========== 执行批量操作 ==========
    const successItems = []
    const failedItems = []
    const ActivityService = getActivityService(req)

    for (const campaign_id of campaign_ids) {
      const transaction = await sequelize.transaction()
      try {
        await ActivityService.updateCampaignStatus(parseInt(campaign_id), target_status, {
          reason: `[批量切换] ${reason.trim()}`,
          operator_id,
          transaction
        })

        await transaction.commit()

        successItems.push({
          campaign_id: parseInt(campaign_id),
          new_status: target_status,
          message: '状态切换成功'
        })
      } catch (error) {
        await transaction.rollback()

        failedItems.push({
          campaign_id: parseInt(campaign_id),
          error_code: error.code || 'STATUS_CHANGE_FAILED',
          error_message: error.message || '状态切换失败'
        })

        logger.warn('批量切换单活动状态失败', {
          batch_log_id: batchLog.batch_log_id,
          campaign_id,
          error: error.message
        })
      }
    }

    // ========== 更新批量操作日志 ==========
    await BatchOperationService.updateProgress(batchLog.batch_log_id, {
      success_count: successItems.length,
      fail_count: failedItems.length,
      result_summary: {
        success_items: successItems,
        failed_items: failedItems,
        target_status,
        reason
      }
    })

    const finalLog = await BatchOperationService.getOperationDetail(batchLog.batch_log_id)

    logger.info('批量活动状态切换完成', {
      batch_log_id: batchLog.batch_log_id,
      operator_id,
      target_status,
      total_count: campaign_ids.length,
      success_count: successItems.length,
      fail_count: failedItems.length
    })

    return res.apiSuccess(
      {
        batch_log_id: finalLog.batch_log_id,
        status: finalLog.status,
        status_name: finalLog.status_name,
        total_count: finalLog.total_count,
        success_count: finalLog.success_count,
        fail_count: finalLog.fail_count,
        success_rate: finalLog.success_rate,
        result_details: {
          success_items: successItems,
          failed_items: failedItems
        }
      },
      '批量活动状态切换完成'
    )
  } catch (error) {
    logger.error('批量活动状态切换失败', {
      operator_id,
      error: error.message,
      stack: error.stack
    })
    return res.apiError(
      `批量状态切换失败：${error.message}`,
      'BATCH_CAMPAIGN_STATUS_FAILED',
      null,
      500
    )
  }
})

// ==================== B7: 批量设置干预规则 ====================

/**
 * B7: 批量设置干预规则
 * POST /api/v4/console/batch-operations/preset-rules
 *
 * 业务场景：
 * - 新用户首抽必中活动
 * - VIP用户大奖保底
 * - 活动期间批量配置中奖规则
 *
 * 请求体：
 * {
 *   rules: Array<{
 *     user_id: number,        // 必填：目标用户ID
 *     campaign_id: number,    // 必填：活动ID
 *     prize_id: number,       // 必填：预设奖品ID
 *     trigger_type: string,   // 必填：触发类型（first_draw/nth_draw/time_based）
 *     trigger_value: number   // 可选：触发值（如第N次）
 *   }>,
 *   reason: string            // 必填：设置原因
 * }
 */
router.post('/preset-rules', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const operator_id = req.user.user_id
  const operation_type = BatchOperationLog.OPERATION_TYPES.PRESET_BATCH

  try {
    const { rules, reason } = req.body

    // ========== 参数验证 ==========
    if (!Array.isArray(rules) || rules.length === 0) {
      return res.apiError('rules 必须为非空数组', 'INVALID_RULES', null, 400)
    }

    if (!reason || reason.trim().length === 0) {
      return res.apiError('reason 不能为空', 'INVALID_REASON', null, 400)
    }

    // 验证每条规则的必填字段
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i]
      if (!rule.user_id || !rule.campaign_id || !rule.prize_id) {
        return res.apiError(
          `规则[${i}]缺少必填字段：user_id、campaign_id、prize_id`,
          'INVALID_RULE_PARAMS',
          null,
          400
        )
      }
    }

    // ========== 预检查 ==========
    const preCheckResult = await BatchOperationService.preCheck({
      operation_type,
      operator_id,
      operation_params: { rules, reason },
      items_count: rules.length
    })

    if (!preCheckResult.passed) {
      const firstError = preCheckResult.errors[0]
      if (firstError.code === 'IDEMPOTENCY_CONFLICT') {
        return res.apiError(
          '操作已提交或正在处理中',
          'IDEMPOTENCY_CONFLICT',
          {
            existing_batch_log_id: firstError.existing_log?.batch_log_id
          },
          409
        )
      }
      return res.apiError(
        firstError.message,
        firstError.code,
        { errors: preCheckResult.errors },
        429
      )
    }

    // ========== 创建批量操作日志 ==========
    const batchLog = await BatchOperationService.createOperationLog({
      operation_type,
      operator_id,
      total_count: rules.length,
      operation_params: { rules, reason },
      idempotency_key: preCheckResult.idempotency_key
    })

    // ========== 执行批量操作 ==========
    const successItems = []
    const failedItems = []
    const LotteryPresetService = getLotteryPresetService(req)

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i]
      const transaction = await sequelize.transaction()
      try {
        const preset = await LotteryPresetService.createPreset(
          {
            user_id: parseInt(rule.user_id),
            campaign_id: parseInt(rule.campaign_id),
            prize_id: parseInt(rule.prize_id),
            trigger_type: rule.trigger_type || 'first_draw',
            trigger_value: rule.trigger_value || 1,
            reason: `[批量设置] ${reason.trim()}`,
            created_by: operator_id
          },
          { transaction }
        )

        await transaction.commit()

        successItems.push({
          index: i,
          user_id: rule.user_id,
          campaign_id: rule.campaign_id,
          preset_id: preset?.preset_id,
          message: '规则创建成功'
        })
      } catch (error) {
        await transaction.rollback()

        failedItems.push({
          index: i,
          user_id: rule.user_id,
          campaign_id: rule.campaign_id,
          error_code: error.code || 'PRESET_CREATE_FAILED',
          error_message: error.message || '规则创建失败'
        })

        logger.warn('批量创建单条干预规则失败', {
          batch_log_id: batchLog.batch_log_id,
          rule_index: i,
          error: error.message
        })
      }
    }

    // ========== 更新批量操作日志 ==========
    await BatchOperationService.updateProgress(batchLog.batch_log_id, {
      success_count: successItems.length,
      fail_count: failedItems.length,
      result_summary: {
        success_items: successItems,
        failed_items: failedItems,
        reason
      }
    })

    const finalLog = await BatchOperationService.getOperationDetail(batchLog.batch_log_id)

    logger.info('批量设置干预规则完成', {
      batch_log_id: batchLog.batch_log_id,
      operator_id,
      total_count: rules.length,
      success_count: successItems.length,
      fail_count: failedItems.length
    })

    return res.apiSuccess(
      {
        batch_log_id: finalLog.batch_log_id,
        status: finalLog.status,
        status_name: finalLog.status_name,
        total_count: finalLog.total_count,
        success_count: finalLog.success_count,
        fail_count: finalLog.fail_count,
        success_rate: finalLog.success_rate,
        result_details: {
          success_items: successItems,
          failed_items: failedItems
        }
      },
      '批量设置干预规则完成'
    )
  } catch (error) {
    logger.error('批量设置干预规则失败', {
      operator_id,
      error: error.message,
      stack: error.stack
    })
    return res.apiError(`批量设置失败：${error.message}`, 'BATCH_PRESET_FAILED', null, 500)
  }
})

// ==================== B8: 批量核销确认 ====================

/**
 * B8: 批量核销确认
 * POST /api/v4/console/batch-operations/redemption-verify
 *
 * 业务场景：
 * - 门店下班前批量核销未处理订单
 * - 活动结束后批量处理待核销订单
 * - 系统对账批量确认订单
 *
 * 请求体：
 * {
 *   order_ids: number[],      // 必填：兑换订单ID列表（最多200个）
 *   reason: string            // 必填：核销原因
 * }
 */
router.post('/redemption-verify', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const operator_id = req.user.user_id
  const operation_type = BatchOperationLog.OPERATION_TYPES.REDEMPTION_VERIFY_BATCH

  try {
    const { order_ids, reason } = req.body

    // ========== 参数验证 ==========
    if (!Array.isArray(order_ids) || order_ids.length === 0) {
      return res.apiError('order_ids 必须为非空数组', 'INVALID_ORDER_IDS', null, 400)
    }

    if (!reason || reason.trim().length === 0) {
      return res.apiError('reason 不能为空', 'INVALID_REASON', null, 400)
    }

    // ========== 预检查 ==========
    const preCheckResult = await BatchOperationService.preCheck({
      operation_type,
      operator_id,
      operation_params: { order_ids, reason },
      items_count: order_ids.length
    })

    if (!preCheckResult.passed) {
      const firstError = preCheckResult.errors[0]
      if (firstError.code === 'IDEMPOTENCY_CONFLICT') {
        return res.apiError(
          '操作已提交或正在处理中',
          'IDEMPOTENCY_CONFLICT',
          {
            existing_batch_log_id: firstError.existing_log?.batch_log_id
          },
          409
        )
      }
      return res.apiError(
        firstError.message,
        firstError.code,
        { errors: preCheckResult.errors },
        429
      )
    }

    // ========== 创建批量操作日志 ==========
    const batchLog = await BatchOperationService.createOperationLog({
      operation_type,
      operator_id,
      total_count: order_ids.length,
      operation_params: { order_ids, reason },
      idempotency_key: preCheckResult.idempotency_key
    })

    // ========== 执行批量操作 ==========
    const successItems = []
    const failedItems = []
    const RedemptionService = getRedemptionService(req)

    for (const order_id of order_ids) {
      const transaction = await sequelize.transaction()
      try {
        await RedemptionService.verifyOrder(parseInt(order_id), {
          verifier_id: operator_id,
          verify_reason: `[批量核销] ${reason.trim()}`,
          transaction
        })

        await transaction.commit()

        successItems.push({
          order_id: parseInt(order_id),
          status: 'verified',
          message: '核销成功'
        })
      } catch (error) {
        await transaction.rollback()

        failedItems.push({
          order_id: parseInt(order_id),
          error_code: error.code || 'VERIFY_FAILED',
          error_message: error.message || '核销失败'
        })

        logger.warn('批量核销单订单失败', {
          batch_log_id: batchLog.batch_log_id,
          order_id,
          error: error.message
        })
      }
    }

    // ========== 更新批量操作日志 ==========
    await BatchOperationService.updateProgress(batchLog.batch_log_id, {
      success_count: successItems.length,
      fail_count: failedItems.length,
      result_summary: {
        success_items: successItems,
        failed_items: failedItems,
        reason
      }
    })

    const finalLog = await BatchOperationService.getOperationDetail(batchLog.batch_log_id)

    logger.info('批量核销确认完成', {
      batch_log_id: batchLog.batch_log_id,
      operator_id,
      total_count: order_ids.length,
      success_count: successItems.length,
      fail_count: failedItems.length
    })

    return res.apiSuccess(
      {
        batch_log_id: finalLog.batch_log_id,
        status: finalLog.status,
        status_name: finalLog.status_name,
        total_count: finalLog.total_count,
        success_count: finalLog.success_count,
        fail_count: finalLog.fail_count,
        success_rate: finalLog.success_rate,
        result_details: {
          success_items: successItems,
          failed_items: failedItems
        }
      },
      '批量核销确认完成'
    )
  } catch (error) {
    logger.error('批量核销确认失败', {
      operator_id,
      error: error.message,
      stack: error.stack
    })
    return res.apiError(
      `批量核销失败：${error.message}`,
      'BATCH_REDEMPTION_VERIFY_FAILED',
      null,
      500
    )
  }
})

// ==================== B10: 批量预算调整 ====================

/**
 * B10: 批量预算调整
 * POST /api/v4/console/batch-operations/budget-adjust
 *
 * 业务场景：
 * - 季度末批量调整活动预算
 * - 活动促销期间批量增加预算
 * - 运营策略调整批量更新预算
 *
 * 请求体：
 * {
 *   adjustments: Array<{
 *     campaign_id: number,    // 必填：活动ID
 *     adjustment_type: string,// 必填：调整类型（increase/decrease/set）
 *     amount: number          // 必填：调整金额或目标值
 *   }>,
 *   reason: string            // 必填：调整原因
 * }
 */
router.post('/budget-adjust', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const operator_id = req.user.user_id
  const operation_type = BatchOperationLog.OPERATION_TYPES.BUDGET_ADJUST_BATCH

  try {
    const { adjustments, reason } = req.body

    // ========== 参数验证 ==========
    if (!Array.isArray(adjustments) || adjustments.length === 0) {
      return res.apiError('adjustments 必须为非空数组', 'INVALID_ADJUSTMENTS', null, 400)
    }

    if (!reason || reason.trim().length === 0) {
      return res.apiError('reason 不能为空', 'INVALID_REASON', null, 400)
    }

    // 验证每条调整的必填字段
    const validAdjustmentTypes = ['increase', 'decrease', 'set']
    for (let i = 0; i < adjustments.length; i++) {
      const adj = adjustments[i]
      if (!adj.campaign_id || !adj.adjustment_type || adj.amount === undefined) {
        return res.apiError(
          `调整项[${i}]缺少必填字段：campaign_id、adjustment_type、amount`,
          'INVALID_ADJUSTMENT_PARAMS',
          null,
          400
        )
      }
      if (!validAdjustmentTypes.includes(adj.adjustment_type)) {
        return res.apiError(
          `调整项[${i}]的adjustment_type必须为 ${validAdjustmentTypes.join('/')}`,
          'INVALID_ADJUSTMENT_TYPE',
          null,
          400
        )
      }
    }

    // ========== 预检查 ==========
    const preCheckResult = await BatchOperationService.preCheck({
      operation_type,
      operator_id,
      operation_params: { adjustments, reason },
      items_count: adjustments.length
    })

    if (!preCheckResult.passed) {
      const firstError = preCheckResult.errors[0]
      if (firstError.code === 'IDEMPOTENCY_CONFLICT') {
        return res.apiError(
          '操作已提交或正在处理中',
          'IDEMPOTENCY_CONFLICT',
          {
            existing_batch_log_id: firstError.existing_log?.batch_log_id
          },
          409
        )
      }
      return res.apiError(
        firstError.message,
        firstError.code,
        { errors: preCheckResult.errors },
        429
      )
    }

    // ========== 创建批量操作日志 ==========
    const batchLog = await BatchOperationService.createOperationLog({
      operation_type,
      operator_id,
      total_count: adjustments.length,
      operation_params: { adjustments, reason },
      idempotency_key: preCheckResult.idempotency_key
    })

    // ========== 执行批量操作 ==========
    const successItems = []
    const failedItems = []
    const ActivityService = getActivityService(req)

    for (let i = 0; i < adjustments.length; i++) {
      const adj = adjustments[i]
      const transaction = await sequelize.transaction()
      try {
        const result = await ActivityService.adjustCampaignBudget(
          parseInt(adj.campaign_id),
          adj.adjustment_type,
          parseFloat(adj.amount),
          {
            reason: `[批量调整] ${reason.trim()}`,
            operator_id,
            transaction
          }
        )

        await transaction.commit()

        successItems.push({
          index: i,
          campaign_id: adj.campaign_id,
          adjustment_type: adj.adjustment_type,
          amount: adj.amount,
          new_budget: result?.new_budget,
          message: '预算调整成功'
        })
      } catch (error) {
        await transaction.rollback()

        failedItems.push({
          index: i,
          campaign_id: adj.campaign_id,
          adjustment_type: adj.adjustment_type,
          amount: adj.amount,
          error_code: error.code || 'BUDGET_ADJUST_FAILED',
          error_message: error.message || '预算调整失败'
        })

        logger.warn('批量调整单活动预算失败', {
          batch_log_id: batchLog.batch_log_id,
          campaign_id: adj.campaign_id,
          error: error.message
        })
      }
    }

    // ========== 更新批量操作日志 ==========
    await BatchOperationService.updateProgress(batchLog.batch_log_id, {
      success_count: successItems.length,
      fail_count: failedItems.length,
      result_summary: {
        success_items: successItems,
        failed_items: failedItems,
        reason
      }
    })

    const finalLog = await BatchOperationService.getOperationDetail(batchLog.batch_log_id)

    logger.info('批量预算调整完成', {
      batch_log_id: batchLog.batch_log_id,
      operator_id,
      total_count: adjustments.length,
      success_count: successItems.length,
      fail_count: failedItems.length
    })

    return res.apiSuccess(
      {
        batch_log_id: finalLog.batch_log_id,
        status: finalLog.status,
        status_name: finalLog.status_name,
        total_count: finalLog.total_count,
        success_count: finalLog.success_count,
        fail_count: finalLog.fail_count,
        success_rate: finalLog.success_rate,
        result_details: {
          success_items: successItems,
          failed_items: failedItems
        }
      },
      '批量预算调整完成'
    )
  } catch (error) {
    logger.error('批量预算调整失败', {
      operator_id,
      error: error.message,
      stack: error.stack
    })
    return res.apiError(
      `批量预算调整失败：${error.message}`,
      'BATCH_BUDGET_ADJUST_FAILED',
      null,
      500
    )
  }
})

// ==================== 通用查询接口 ====================

/**
 * 查询批量操作日志列表
 * GET /api/v4/console/batch-operations/logs
 *
 * Query参数：
 * - operator_id: 操作人ID（可选）
 * - operation_type: 操作类型（可选）
 * - status: 状态（可选）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 */
router.get('/logs', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { operator_id, operation_type, status, page = 1, page_size = 20 } = req.query

    const result = await BatchOperationService.queryOperationLogs({
      operator_id,
      operation_type,
      status,
      limit: parseInt(page_size),
      offset: (parseInt(page) - 1) * parseInt(page_size)
    })

    return res.apiSuccess(
      {
        logs: result.logs,
        pagination: {
          page: parseInt(page),
          page_size: parseInt(page_size),
          total_count: result.total,
          total_pages: Math.ceil(result.total / parseInt(page_size))
        }
      },
      '查询批量操作日志成功'
    )
  } catch (error) {
    logger.error('查询批量操作日志失败', { error: error.message })
    return res.apiError(`查询失败：${error.message}`, 'QUERY_LOGS_FAILED', null, 500)
  }
})

/**
 * 获取批量操作日志详情
 * GET /api/v4/console/batch-operations/logs/:id
 */
router.get('/logs/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const batch_log_id = parseInt(req.params.id, 10)

    if (isNaN(batch_log_id) || batch_log_id <= 0) {
      return res.apiError('无效的日志ID', 'INVALID_LOG_ID', null, 400)
    }

    const detail = await BatchOperationService.getOperationDetail(batch_log_id)

    if (!detail) {
      return res.apiError('批量操作日志不存在', 'LOG_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(detail, '获取批量操作日志详情成功')
  } catch (error) {
    logger.error('获取批量操作日志详情失败', { error: error.message })
    return res.apiError(`获取详情失败：${error.message}`, 'GET_LOG_DETAIL_FAILED', null, 500)
  }
})

/**
 * 获取系统配置（批量操作限流配置）
 * GET /api/v4/console/batch-operations/config
 */
router.get('/config', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const configs = await SystemConfigService.getAllBatchConfigs()

    return res.apiSuccess(
      {
        configs,
        operation_types: BatchOperationLog.OPERATION_TYPE_NAMES,
        statuses: BatchOperationLog.STATUS_NAMES
      },
      '获取批量操作配置成功'
    )
  } catch (error) {
    logger.error('获取批量操作配置失败', { error: error.message })
    return res.apiError(`获取配置失败：${error.message}`, 'GET_CONFIG_FAILED', null, 500)
  }
})

module.exports = router
