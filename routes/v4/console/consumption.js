/**
 * 消费记录管理模块 - 管理员审核（Console 域）
 *
 * @route /api/v4/console/consumption
 * @description 平台管理员审核消费记录（通过/拒绝）
 *
 * 📌 域边界说明（2026-03-10 多级审核链改造）：
 * - 此模块属于 console 域
 * - 查询路由：admin(role_level >= 100)
 * - 审核路由(approve/reject)：business_manager(role_level >= 60) 及以上可进入路由
 *   具体审核权限由 ApprovalChainService.processStep() 精确校验
 * - 商家员工（merchant_staff/merchant_manager）使用 /api/v4/shop/* 提交和查询消费
 *
 * API列表：
 * - GET /pending - 管理员查询待审核的消费记录
 * - GET /records - 管理员查询所有消费记录（支持筛选、搜索、统计）
 * - POST /approve/:record_id - 管理员审核通过消费记录
 * - POST /reject/:record_id - 管理员审核拒绝消费记录
 * - GET /qrcode/:user_id - 管理员生成指定用户的动态二维码（2026-02-12 路由分离）
 *
 * 业务场景：
 * - 审核通过后自动奖励积分（1元=1分）
 * - 审核拒绝需要填写原因（5-500字符）
 *
 * 创建时间：2026年01月12日
 * 迁移说明：从 routes/v4/shop/consumption/review.js 迁移至 console 域
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger
const BeijingTimeHelper = require('../../../utils/timeHelper')
const TransactionManager = require('../../../utils/TransactionManager')

/**
 * @route GET /api/v4/console/consumption/pending
 * @desc 管理员查询待审核的消费记录
 * @access Private (管理员，role_level >= 100)
 *
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大100）
 *
 * @returns {Object} {
 *   records: Array - 待审核记录列表
 *   pagination: Object - 分页信息
 * }
 */
router.get('/pending', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 QueryService（V4.7.0 服务拆分）
    const QueryService = req.app.locals.services.getService('consumption_query')

    const { page = 1, page_size = 20 } = req.query

    // 分页参数验证
    const finalPageSize = Math.min(parseInt(page_size) || 20, 100)
    const finalPage = Math.max(parseInt(page) || 1, 1)

    logger.info('管理员查询待审核消费记录', {
      admin_id: req.user.user_id,
      page: finalPage,
      page_size: finalPageSize
    })

    // 调用服务层查询
    const result = await QueryService.getPendingConsumptionRecords({
      page: finalPage,
      page_size: finalPageSize
    })

    return res.apiSuccess(result, '查询成功')
  } catch (error) {
    logger.error('查询待审核记录失败', { error: error.message })
    return handleServiceError(error, res, '查询待审核记录失败')
  }
})

/**
 * @route GET /api/v4/console/consumption/records
 * @desc 管理员查询所有消费记录（支持筛选、搜索、统计）
 * @access Private (管理员，role_level >= 100)
 *
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大100）
 * @query {string} status - 状态筛选（pending/approved/rejected/all，默认all）
 * @query {string} search - 搜索关键词（手机号、用户昵称）
 * @query {number} store_id - 门店ID筛选（可选）
 * @query {string} start_date - 开始日期筛选（ISO格式，如 2026-02-01）
 * @query {string} end_date - 结束日期筛选（ISO格式，如 2026-02-28）
 *
 * @returns {Object} {
 *   records: Array - 消费记录列表
 *   pagination: Object - 分页信息
 *   statistics: Object - 统计数据（待审核、今日审核、通过、拒绝）
 * }
 */
router.get('/records', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 QueryService（V4.7.0 服务拆分）
    const QueryService = req.app.locals.services.getService('consumption_query')

    const {
      page = 1,
      page_size = 20,
      status = 'all',
      search = '',
      store_id,
      start_date,
      end_date
    } = req.query

    logger.info('管理员查询消费记录', {
      admin_id: req.user.user_id,
      page,
      page_size,
      status,
      search,
      store_id,
      start_date,
      end_date
    })

    // 调用服务层查询
    const result = await QueryService.getAdminRecords({
      page: parseInt(page),
      page_size: parseInt(page_size),
      status,
      search,
      store_id: store_id ? parseInt(store_id) : undefined,
      start_date: start_date || undefined,
      end_date: end_date || undefined
    })

    return res.apiSuccess(result, '查询成功')
  } catch (error) {
    logger.error('管理员查询消费记录失败', { error: error.message })
    return handleServiceError(error, res, '查询消费记录失败')
  }
})

/**
 * @route POST /api/v4/console/consumption/approve/:id
 * @desc 管理员审核通过消费记录
 * @access Private (role_level >= 60，审核链场景由 ApprovalChainService 精确鉴权)
 *
 * API路径参数设计规范 V2.2（2026-01-20）：
 * - 消费记录是事务实体，使用数字ID（:id）作为标识符
 *
 * @param {number} id - 消费记录ID
 * @body {string} admin_notes - 审核备注（可选）
 *
 * @returns {Object} 审核结果
 * @returns {number} data.consumption_record_id - 消费记录ID
 * @returns {string} data.status - 新状态（approved）
 * @returns {number} data.points_awarded - 奖励的积分数
 * @returns {number} data.new_balance - 用户新的积分余额
 * @returns {string} data.reviewed_at - 审核时间（北京时间）
 *
 * @example
 * POST /api/v4/console/consumption/approve/123
 * {
 *   "admin_notes": "核实无误，审核通过"
 * }
 */
router.post('/approve/:id', authenticateToken, requireRoleLevel(60), async (req, res) => {
  try {
    const CoreService = req.app.locals.services.getService('consumption_core')
    const ApprovalChainService = req.app.locals.services.getService('approval_chain')

    const record_id = parseInt(req.params.id, 10)
    const { admin_notes } = req.body
    const reviewerId = req.user.user_id

    logger.info('审核消费记录', { record_id, reviewer_id: reviewerId })

    // 检查是否有审核链实例
    const chainInstance = await ApprovalChainService.getInstanceByAuditable(
      'consumption',
      record_id
    )

    if (chainInstance && chainInstance.status === 'in_progress') {
      // 有审核链：通过审核链步骤处理（重定向到 /approval-chain/steps/:id/approve）
      const pendingStep = chainInstance.steps?.find(s => s.status === 'pending')
      if (!pendingStep) {
        return res.apiBadRequest('当前审核链没有待处理的步骤')
      }
      return res.apiSuccess(
        {
          redirect: true,
          message: '该记录使用审核链流程，请通过审核链步骤审核',
          chain_instance_id: chainInstance.instance_id,
          pending_step_id: pendingStep.step_id,
          approval_chain_url: `/api/v4/console/approval-chain/steps/${pendingStep.step_id}/approve`
        },
        '该记录使用审核链流程'
      )
    }

    // 无审核链：走原有 CoreService.approveConsumption()（兼容存量数据）
    const result = await TransactionManager.execute(async transaction => {
      return await CoreService.approveConsumption(parseInt(record_id), {
        reviewer_id: reviewerId,
        admin_notes,
        transaction
      })
    })

    logger.info('✅ 消费记录审核通过（直接路径）', {
      record_id,
      user_id: result.consumption_record.user_id,
      points_awarded: result.points_awarded
    })

    return res.apiSuccess(
      {
        record_id: result.consumption_record.consumption_record_id,
        status: result.consumption_record.status,
        points_awarded: result.points_awarded,
        new_balance: result.new_balance,
        reviewed_at: BeijingTimeHelper.formatForAPI(result.consumption_record.reviewed_at)
      },
      `审核通过，已奖励${result.points_awarded}积分`
    )
  } catch (error) {
    logger.error('审核通过失败', {
      error: error.message,
      record_id: req.params.id,
      reviewer_id: req.user.user_id
    })
    return handleServiceError(error, res, '审核通过失败')
  }
})

/**
 * @route POST /api/v4/console/consumption/batch-review
 * @desc 批量审核消费记录（通过或拒绝）
 * @access Private (管理员，role_level >= 100)
 *
 * 📌 批量操作说明：
 * - 支持部分成功模式：单条失败不影响其他记录
 * - 支持幂等性控制：通过 idempotency_key 防止重复提交
 * - 审批通过自动发放积分
 *
 * @body {Array<number>} record_ids - 要审核的记录 ID 列表（最多100条）
 * @body {string} action - 审核动作（'approve' | 'reject'）
 * @body {string} [reason] - 审核原因（拒绝时必填）
 * @body {string} [idempotency_key] - 幂等性键（可选，建议使用）
 *
 * @returns {Object} 批量处理结果
 * @returns {string} data.operation_id - 操作 ID
 * @returns {Object} data.stats - 统计数据
 * @returns {Array} data.processed.success - 成功记录列表
 * @returns {Array} data.processed.failed - 失败记录列表
 * @returns {Array} data.processed.skipped - 跳过记录列表
 *
 * @example
 * POST /api/v4/console/consumption/batch-review
 * {
 *   "record_ids": [1, 2, 3, 4, 5],
 *   "action": "approve",
 *   "idempotency_key": "batch_review_20260131_001"
 * }
 */
router.post('/batch-review', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ConsumptionBatchService（符合TR-005规范）
    const ConsumptionBatchService = req.app.locals.services.getService('consumption_batch')

    const { record_ids, action, reason, idempotency_key } = req.body
    const operator_id = req.user.user_id

    logger.info('[批量审核] 开始批量审核消费记录', {
      admin_id: operator_id,
      record_count: record_ids?.length || 0,
      action,
      idempotency_key
    })

    const result = await ConsumptionBatchService.batchReview({
      record_ids,
      action,
      reason,
      operator_id,
      idempotency_key
    })

    // 如果是重复操作，返回之前的结果
    if (result.is_duplicate) {
      logger.warn('[批量审核] 检测到重复操作', { idempotency_key })
      return res.apiSuccess(result, '操作已执行（重复请求）')
    }

    logger.info('[批量审核] 批量审核完成', {
      operation_id: result.operation_id,
      success: result.stats.success_count,
      failed: result.stats.failed_count,
      skipped: result.stats.skipped_count
    })

    return res.apiSuccess(
      result,
      `批量审核完成：成功${result.stats.success_count}条，失败${result.stats.failed_count}条，跳过${result.stats.skipped_count}条`
    )
  } catch (error) {
    logger.error('[批量审核] 批量审核失败', { error: error.message })
    return handleServiceError(error, res, '批量审核失败')
  }
})

/**
 * @route POST /api/v4/console/consumption/reject/:id
 * @desc 管理员审核拒绝消费记录
 * @access Private (role_level >= 60，审核链场景由 ApprovalChainService 精确鉴权)
 *
 * API路径参数设计规范 V2.2（2026-01-20）：
 * - 消费记录是事务实体，使用数字ID（:id）作为标识符
 *
 * @param {number} id - 消费记录ID
 * @body {string} admin_notes - 拒绝原因（必填，5-500字符）
 *
 * @returns {Object} 审核结果
 * @returns {number} data.consumption_record_id - 消费记录ID
 * @returns {string} data.status - 新状态（rejected）
 * @returns {string} data.reject_reason - 拒绝原因
 * @returns {string} data.reviewed_at - 审核时间（北京时间）
 *
 * @example
 * POST /api/v4/console/consumption/reject/123
 * {
 *   "admin_notes": "消费金额与实际不符"
 * }
 */
router.post('/reject/:id', authenticateToken, requireRoleLevel(60), async (req, res) => {
  try {
    const CoreService = req.app.locals.services.getService('consumption_core')
    const ApprovalChainService = req.app.locals.services.getService('approval_chain')

    const record_id = parseInt(req.params.id, 10)
    const { admin_notes } = req.body
    const reviewerId = req.user.user_id

    // 验证拒绝原因（5-500字符）
    if (!admin_notes || admin_notes.trim().length < 5) {
      return res.apiError('拒绝原因不能为空，且至少5个字符', 'BAD_REQUEST', null, 400)
    }

    if (admin_notes.length > 500) {
      return res.apiError('拒绝原因最多500个字符，请精简描述', 'BAD_REQUEST', null, 400)
    }

    logger.info('管理员审核拒绝消费记录', {
      record_id,
      reviewer_id: reviewerId
    })

    // 检查是否有审核链实例（与 approve 路由行为一致）
    const chainInstance = await ApprovalChainService.getInstanceByAuditable(
      'consumption',
      record_id
    )

    if (chainInstance && chainInstance.status === 'in_progress') {
      const pendingStep = chainInstance.steps?.find(s => s.status === 'pending')
      if (!pendingStep) {
        return res.apiBadRequest('当前审核链没有待处理的步骤')
      }
      return res.apiSuccess(
        {
          redirect: true,
          message: '该记录使用审核链流程，请通过审核链步骤拒绝',
          chain_instance_id: chainInstance.instance_id,
          pending_step_id: pendingStep.step_id,
          approval_chain_url: `/api/v4/console/approval-chain/steps/${pendingStep.step_id}/reject`
        },
        '该记录使用审核链流程'
      )
    }

    // 无审核链：走原有 CoreService.rejectConsumption()（兼容存量数据）
    const result = await TransactionManager.execute(async transaction => {
      return await CoreService.rejectConsumption(parseInt(record_id), {
        reviewer_id: reviewerId,
        admin_notes,
        transaction
      })
    })

    logger.info('✅ 消费记录审核拒绝（直接路径）', {
      record_id,
      reason: admin_notes.substring(0, 50)
    })

    return res.apiSuccess(
      {
        record_id: result.consumption_record.consumption_record_id,
        status: result.consumption_record.status,
        reject_reason: result.reject_reason,
        reviewed_at: BeijingTimeHelper.formatForAPI(result.consumption_record.reviewed_at)
      },
      '已拒绝该消费记录'
    )
  } catch (error) {
    logger.error('审核拒绝失败', { error: error.message })
    return handleServiceError(error, res, '审核拒绝失败')
  }
})

/**
 * @route GET /api/v4/console/consumption/qrcode/:user_id
 * @desc 管理员生成指定用户的动态身份二维码（v2版本）
 * @access Private (管理员，role_level >= 100)
 *
 * 路由分离：
 * - 用户端：GET /api/v4/user/consumption/qrcode（从JWT Token取身份，DB-3 迁移到 user 域）
 * - 管理端：GET /api/v4/console/consumption/qrcode/:user_id（admin专用，带审计日志）
 *
 * @param {number} user_id - 目标用户ID
 *
 * @returns {Object} 二维码信息
 * @returns {string} data.qr_code - 二维码字符串
 * @returns {number} data.user_id - 用户ID
 * @returns {string} data.user_uuid - 用户UUID
 * @returns {string} data.nonce - 一次性随机数
 * @returns {string} data.expires_at - 过期时间（北京时间）
 * @returns {string} data.generated_at - 生成时间（北京时间）
 * @returns {string} data.validity - 有效期描述
 * @returns {string} data.algorithm - 签名算法
 * @returns {string} data.note - 使用说明
 * @returns {string} data.usage - 使用方式
 */
router.get('/qrcode/:user_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const user_id = parseInt(req.params.user_id, 10)
    if (isNaN(user_id) || user_id <= 0) {
      return res.apiError('无效的用户ID，必须是正整数', 'BAD_REQUEST', null, 400)
    }

    const admin_id = req.user.user_id

    logger.info('管理员生成用户动态二维码', { admin_id, target_user_id: user_id })

    // 通过 ServiceManager 获取 UserService
    const UserService = req.app.locals.services.getService('user')
    let user
    try {
      user = await UserService.getUserById(user_id)
    } catch (error) {
      if (error.code === 'USER_NOT_FOUND') {
        return res.apiError('用户不存在', 'NOT_FOUND', null, 404)
      }
      throw error
    }

    /*
     * 防御性校验：确保 user_uuid 存在且为字符串类型
     * 与用户端 /user/consumption/qrcode 保持一致的自动修复逻辑
     */
    let userUuid = user.user_uuid
    if (!userUuid || typeof userUuid !== 'string') {
      logger.warn('目标用户缺少 user_uuid，执行自动修复', {
        admin_id,
        target_user_id: user_id,
        current_uuid: userUuid,
        current_type: typeof userUuid
      })

      const { v4: uuidv4 } = require('uuid')
      userUuid = uuidv4()
      try {
        /** 通过模型实例更新（不直接 require sequelize.models） */
        if (typeof user.update === 'function') {
          await user.update({ user_uuid: userUuid })
        } else {
          const { User } = req.app.locals.models
          await User.update({ user_uuid: userUuid }, { where: { user_id } })
        }

        const { BusinessCacheHelper } = require('../../../utils/BusinessCacheHelper')
        await BusinessCacheHelper.invalidateUser(
          { user_id, mobile: user.mobile },
          'admin_auto_repair_missing_uuid'
        )

        logger.info('管理员端自动修复用户 user_uuid 成功', {
          admin_id,
          target_user_id: user_id,
          new_uuid: userUuid.substring(0, 8) + '...'
        })
      } catch (repairError) {
        logger.error('管理员端自动修复 user_uuid 失败', {
          admin_id,
          target_user_id: user_id,
          error: repairError.message
        })
        return res.apiError('目标用户身份信息异常，请联系技术支持', 'USER_UUID_MISSING', null, 500)
      }
    }

    // 使用UUID生成v2动态二维码
    const QRCodeValidator = require('../../../utils/QRCodeValidator')
    const qrCodeInfo = QRCodeValidator.generateQRCodeInfo(userUuid)

    // 记录审计日志（非阻断）
    const AuditLogService = require('../../../services/AuditLogService')
    const { OPERATION_TYPES } = require('../../../constants/AuditOperationTypes')
    AuditLogService.logOperation({
      admin_id,
      operation_type: OPERATION_TYPES.ADMIN_VIEW_USER_DATA,
      action: 'generate_user_qrcode',
      target_user_id: user_id,
      details: { target_user_uuid: userUuid },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      timestamp: BeijingTimeHelper.now()
    }).catch(err => logger.error('审计日志记录失败（非阻断）', { error: err.message }))

    return res.apiSuccess(
      {
        qr_code: qrCodeInfo.qr_code,
        user_id: user.user_id,
        user_uuid: qrCodeInfo.user_uuid,
        nonce: qrCodeInfo.nonce,
        expires_at: qrCodeInfo.expires_at,
        generated_at: qrCodeInfo.generated_at,
        validity: qrCodeInfo.validity,
        algorithm: qrCodeInfo.algorithm,
        note: qrCodeInfo.note,
        usage: '管理员为用户生成的动态二维码'
      },
      '动态二维码生成成功'
    )
  } catch (error) {
    logger.error('管理员生成用户二维码失败', { error: error.message })
    return handleServiceError(error, res, '生成动态二维码失败')
  }
})

module.exports = router
