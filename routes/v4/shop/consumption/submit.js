/**
 * 消费记录管理模块 - 商家提交
 *
 * @route /api/v4/shop/consumption
 * @description 商家扫码录入消费记录
 *
 * API列表：
 * - POST /submit - 商家提交消费记录
 *
 * 业务场景：
 * - 商家扫描用户二维码后录入消费金额
 * - 消费记录创建后状态为pending，等待管理员审核
 * - 审核通过后自动奖励积分（1元=1分）
 *
 * 权限控制（2026年01月12日 商家员工域权限体系升级）：
 * - requireMerchantPermission('consumption:create', { scope: 'store' })
 * - 验证用户具有 consumption:create 权限
 * - 验证用户在请求的门店在职（如传递 store_id）或自动填充唯一门店
 *
 * 二维码验证（V2动态码）：
 * - 仅支持 V2 动态身份码（QRV2_...）
 * - 验证签名、过期时间、nonce防重放
 * - 旧永久码（QR_...）直接拒绝
 *
 * 幂等性保证（业界标准形态 - 破坏性重构 2026-01-02）：
 * - 统一只接受 Header Idempotency-Key
 * - 服务端不再自动生成幂等键，缺失幂等键直接返回 400
 *
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireMerchantPermission } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const { logger, sanitize } = require('../../../../utils/logger')
const BeijingTimeHelper = require('../../../../utils/timeHelper')
const TransactionManager = require('../../../../utils/TransactionManager')
const QRCodeValidator = require('../../../../utils/QRCodeValidator')

/**
 * @route POST /api/v4/shop/consumption/submit
 * @desc 商家提交消费记录（扫码录入）
 * @access Private (需要 consumption:create 权限，商家员工/店长/管理员)
 *
 * @header {string} Idempotency-Key - 幂等键（必填，不接受body参数）
 * @body {string} qr_code - 用户二维码（必填，V2格式：QRV2_{base64_payload}_{signature}）
 * @body {number} consumption_amount - 消费金额（元，必填，范围：0.01-99999.99）
 * @body {number} store_id - 门店ID（可选：单门店员工自动填充，多门店员工必传）
 * @body {string} merchant_notes - 商家备注（可选，最大500字符）
 *
 * @returns {Object} 创建的消费记录信息
 * @returns {number} data.consumption_record_id - 消费记录ID
 * @returns {number} data.user_id - 用户ID
 * @returns {number} data.store_id - 门店ID
 * @returns {number} data.consumption_amount - 消费金额
 * @returns {number} data.points_to_award - 待奖励积分（1元=1分）
 * @returns {string} data.status - 状态（pending）
 * @returns {string} data.status_name - 状态名称（待审核）
 * @returns {string} data.created_at - 创建时间（北京时间）
 * @returns {boolean} data.is_duplicate - 是否为幂等回放请求
 *
 * 业务场景：商家扫描用户二维码后录入消费金额
 *
 * 权限验证链：
 * 1. authenticateToken - 验证JWT有效性
 * 2. requireMerchantPermission('consumption:create', { scope: 'store' }) - 验证商家权限和门店归属
 *
 * 二维码验证：
 * - 仅支持V2动态码（QRV2_...），包含exp+nonce防重放
 * - V1永久码（QR_...）直接拒绝，返回400
 *
 * 幂等性控制（业界标准形态）：统一通过 Header Idempotency-Key 防止重复提交
 */
router.post(
  '/submit',
  authenticateToken,
  requireMerchantPermission('consumption:create', { scope: 'store', storeIdParam: 'body' }),
  async (req, res) => {
    const IdempotencyService = req.app.locals.services.getService('idempotency')
    const CoreService = req.app.locals.services.getService('consumption_core')

    // 【业界标准形态】强制从 Header 获取幂等键，不接受 body，不服务端生成
    const idempotency_key = req.headers['idempotency-key']

    // 缺失幂等键直接返回 400
    if (!idempotency_key) {
      return res.apiError(
        '缺少必需的幂等键：请在 Header 中提供 Idempotency-Key。' +
          '重试时必须复用同一幂等键以防止重复提交。',
        'MISSING_IDEMPOTENCY_KEY',
        {
          required_header: 'Idempotency-Key',
          example: 'Idempotency-Key: consumption_submit_<timestamp>_<random>'
        },
        400
      )
    }

    try {
      const { qr_code, consumption_amount, merchant_notes, store_id } = req.body
      const merchantId = req.user.user_id

      // 参数验证：二维码必填
      if (!qr_code) {
        return res.apiError('二维码不能为空', 'BAD_REQUEST', null, 400)
      }

      // 参数验证：消费金额必须大于0
      if (!consumption_amount || consumption_amount <= 0) {
        return res.apiError('消费金额必须大于0', 'BAD_REQUEST', null, 400)
      }

      // 参数验证：消费金额上限
      if (consumption_amount > 99999.99) {
        return res.apiError('消费金额不能超过99999.99元', 'BAD_REQUEST', null, 400)
      }

      /*
       * 🔒 V2 动态二维码验证（防重放）
       * - 验证签名、过期时间、nonce一次性
       * - 旧V1永久码直接拒绝
       */
      const qr_validation = await QRCodeValidator.validateQRCodeV2WithNonce(qr_code)
      if (!qr_validation.valid) {
        logger.warn('🚫 二维码验证失败', {
          merchant_id: merchantId,
          error_code: qr_validation.error_code,
          error: qr_validation.error
        })
        return res.apiError(
          qr_validation.error,
          qr_validation.error_code,
          null,
          qr_validation.http_status || 400
        )
      }

      /*
       * 🏪 门店ID处理逻辑（AC2.3）
       * - 如果已通过 requireMerchantPermission 验证，使用 req.verified_store_id
       * - 如果未传 store_id，从 req.user_stores 自动填充（单门店）
       * - 多门店员工必须传 store_id
       */
      let resolved_store_id = req.verified_store_id || store_id
      const user_stores = req.user_stores || []

      if (!resolved_store_id) {
        // 未传 store_id，尝试自动填充
        if (user_stores.length === 0) {
          return res.apiError('您未绑定任何门店，无法录入消费记录', 'NO_STORE_BINDING', null, 403)
        } else if (user_stores.length === 1) {
          // 单门店员工：自动填充
          resolved_store_id = user_stores[0].store_id
          logger.info(`🏪 自动填充门店ID: ${resolved_store_id} (用户仅绑定一个门店)`)
        } else {
          // 多门店员工：必须明确指定
          return res.apiError(
            '您绑定了多个门店，请明确指定 store_id 参数',
            'MULTIPLE_STORES_REQUIRE_STORE_ID',
            {
              available_stores: user_stores.map(s => ({
                store_id: s.store_id,
                store_name: s.store_name
              }))
            },
            400
          )
        }
      }

      // 架构决策5：使用统一脱敏函数记录日志
      logger.info('商家提交消费记录', {
        merchant_id: merchantId,
        store_id: resolved_store_id,
        user_uuid: sanitize.user_uuid(qr_validation.user_uuid), // 脱敏：仅前8位
        consumption_amount,
        idempotency_key: sanitize.idempotency_key(idempotency_key) // 脱敏：截断到50字符
      })

      /*
       * 🛡️ 【AC5 风控检查】执行频次阻断 + 金额/关联告警
       * - 频次超限（10次/60秒）→ 阻断提交返回 429
       * - 金额/关联异常 → 仅告警，不阻断
       * - 通过 ServiceManager 获取服务
       */
      const MerchantRiskControlService = req.app.locals.services.getService('merchant_risk_control')
      const riskCheckResult = await MerchantRiskControlService.performFullRiskCheck({
        operator_id: merchantId,
        store_id: resolved_store_id,
        target_user_id: null, // 用户ID在QR验证后服务层获取
        consumption_amount: parseFloat(consumption_amount)
      })

      if (riskCheckResult.blocked) {
        logger.warn('🚫 风控阻断消费提交', {
          merchant_id: merchantId,
          store_id: resolved_store_id,
          block_reason: riskCheckResult.blockReason,
          block_code: riskCheckResult.blockCode
        })

        // 记录被阻断的审计日志（通过 ServiceManager 获取服务）
        try {
          const MerchantOperationLogService =
            req.app.locals.services.getService('merchant_operation_log')
          await MerchantOperationLogService.createLog({
            operator_id: merchantId,
            store_id: resolved_store_id,
            operation_type: 'submit_consumption',
            action: 'create',
            request_id: req.id || null,
            ip_address: req.ip,
            user_agent: req.headers['user-agent'],
            result: 'blocked',
            error_message: riskCheckResult.blockReason,
            consumption_amount: parseFloat(consumption_amount),
            extra_data: {
              block_code: riskCheckResult.blockCode,
              idempotency_key
            }
          })
        } catch (logError) {
          logger.error('⚠️ 阻断审计日志记录失败', { error: logError.message })
        }

        return res.apiError(
          riskCheckResult.blockReason,
          riskCheckResult.blockCode,
          { alerts: riskCheckResult.alerts },
          riskCheckResult.blockStatusCode || 429
        )
      }

      // 如果有告警（非阻断），记录到日志
      if (riskCheckResult.hasAlerts) {
        logger.info('⚠️ 风控告警（非阻断）', {
          merchant_id: merchantId,
          store_id: resolved_store_id,
          alert_count: riskCheckResult.alertCount,
          alerts: riskCheckResult.alerts.map(a => a.type)
        })
      }

      /*
       * 【入口幂等检查】防止同一次请求被重复提交
       * 统一使用 IdempotencyService 进行请求级幂等控制
       *
       * 架构决策5脱敏：qr_code 完全不落日志，仅记录 user_uuid 前8位
       */
      const idempotencyResult = await IdempotencyService.getOrCreateRequest(idempotency_key, {
        api_path: '/api/v4/shop/consumption/submit',
        http_method: 'POST',
        request_params: {
          user_uuid_prefix: sanitize.user_uuid(qr_validation.user_uuid), // 脱敏：仅前8位
          consumption_amount
        },
        user_id: merchantId
      })

      // 如果已完成，直接返回首次结果（幂等性要求）+ is_duplicate 标记
      if (!idempotencyResult.should_process) {
        logger.info('🔄 入口幂等拦截：重复请求，返回首次结果', {
          idempotency_key: sanitize.idempotency_key(idempotency_key),
          merchant_id: merchantId
        })
        const duplicateResponse = {
          ...idempotencyResult.response,
          is_duplicate: true
        }
        return res.apiSuccess(duplicateResponse, '消费记录已存在（幂等回放）')
      }

      /*
       * 调用服务层处理（传入幂等键 + store_id + user_uuid）
       * 使用 TransactionManager 统一事务边界（符合治理决策）
       *
       * V2升级：传入从二维码验证获取的 user_uuid，避免服务层重复验证
       */
      const result = await TransactionManager.execute(async transaction => {
        return await CoreService.merchantSubmitConsumption(
          {
            qr_code, // 保留完整二维码用于记录
            user_uuid: qr_validation.user_uuid, // V2：直接传入已验证的 user_uuid
            consumption_amount,
            merchant_notes,
            merchant_id: merchantId,
            store_id: resolved_store_id, // 门店ID（已验证或自动填充）
            idempotency_key // 业界标准形态：统一使用 idempotency_key
          },
          { transaction } // ✅ 事务通过 options 参数传入，而非 data 对象
        )
      })

      // 从服务层获取 record 和 is_duplicate 标志
      const record = result.record || result
      const isDuplicate = result.is_duplicate === true

      // 构建响应数据
      const responseData = {
        record_id: record.consumption_record_id,
        user_id: record.user_id,
        store_id: record.store_id, // 门店ID
        consumption_amount: parseFloat(record.consumption_amount),
        points_to_award: record.points_to_award,
        status: record.status,
        status_name: record.getStatusName ? record.getStatusName() : record.status,
        created_at: BeijingTimeHelper.formatForAPI(record.created_at),
        is_duplicate: isDuplicate
      }

      /*
       * 【标记请求完成】保存结果快照到入口幂等表
       */
      await IdempotencyService.markAsCompleted(
        idempotency_key,
        record.consumption_record_id, // 业务事件ID = 消费记录ID
        responseData
      )

      logger.info('✅ 消费记录创建成功', {
        record_id: record.consumption_record_id,
        user_id: record.user_id,
        idempotency_key: sanitize.idempotency_key(idempotency_key),
        is_duplicate: isDuplicate
      })

      // 【AC4.2】记录商家域审计日志（提交消费记录，通过 ServiceManager 获取服务）
      if (!isDuplicate) {
        try {
          const MerchantOperationLogService =
            req.app.locals.services.getService('merchant_operation_log')
          await MerchantOperationLogService.createLog({
            operator_id: merchantId,
            store_id: resolved_store_id,
            operation_type: 'submit_consumption',
            action: 'create',
            target_user_id: record.user_id,
            related_record_id: record.consumption_record_id,
            consumption_amount: parseFloat(consumption_amount),
            request_id: req.id || null,
            ip_address: req.ip,
            user_agent: req.headers['user-agent'],
            result: 'success',
            idempotency_key,
            extra_data: {
              points_to_award: record.points_to_award,
              risk_alerts: riskCheckResult.hasAlerts ? riskCheckResult.alerts.map(a => a.type) : []
            }
          })
          logger.debug('📝 商家审计日志已记录', { record_id: record.consumption_record_id })
        } catch (logError) {
          // 审计日志失败不应影响主流程
          logger.error('⚠️ 商家审计日志记录失败（非阻断）', { error: logError.message })
        }
      }

      return res.apiSuccess(
        responseData,
        isDuplicate ? '消费记录已存在（幂等回放）' : '消费记录提交成功，等待审核'
      )
    } catch (error) {
      // 标记幂等请求失败（允许重试）
      await IdempotencyService.markAsFailed(idempotency_key, error.message).catch(markError => {
        logger.error('标记幂等请求失败状态时出错:', markError)
      })

      // 数据库死锁错误处理（高并发场景）
      const isDeadlock =
        error.message?.includes('Deadlock') ||
        error.message?.includes('deadlock') ||
        error.parent?.code === 'ER_LOCK_DEADLOCK'
      if (isDeadlock) {
        logger.warn('数据库死锁（并发竞争），建议重试', {
          idempotency_key: sanitize.idempotency_key(idempotency_key)
        })
        return res.apiError('服务繁忙，请稍后重试', 'CONCURRENT_CONFLICT', { retry_after: 1 }, 409)
      }

      // 处理幂等键冲突错误（409状态码）
      if (error.statusCode === 409) {
        logger.warn('幂等性错误:', {
          idempotency_key: sanitize.idempotency_key(idempotency_key),
          error_code: error.errorCode,
          message: error.message
        })
        return res.apiError(error.message, error.errorCode || 'IDEMPOTENCY_ERROR', {}, 409)
      }

      logger.error('提交消费记录失败', {
        error: error.message,
        idempotency_key: sanitize.idempotency_key(idempotency_key)
      })
      return handleServiceError(error, res, '提交消费记录失败')
    }
  }
)

module.exports = router
