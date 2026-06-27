/**
 * 消费记录管理模块 - 管理员审核（Console 域）
 *
 * @route /api/v4/console/consumption
 * @description 平台管理员审核消费记录（通过/拒绝）
 *
 * 📌 域边界说明（2026-06-12 消费审核收口审核链·单一路径零技术债）：
 * - 此模块属于 console 域，仅保留查询与二维码生成能力
 * - 查询路由：admin(role_level >= 100)
 * - ⚠️ 消费审核（通过/拒绝/批量）已全部收口到审核链，本模块不再提供审核写接口：
 *     单条：POST /api/v4/console/approval-chain/steps/:id/approve | /reject
 *     批量：POST /api/v4/console/approval-chain/steps/batch
 * - 商家员工（merchant_staff/merchant_manager）使用 /api/v4/shop/* 提交和查询消费
 *
 * API列表：
 * - GET /pending - 管理员查询待审核的消费记录
 * - GET /records - 管理员查询所有消费记录（支持筛选、搜索、统计）
 * - GET /qrcode/:user_id - 管理员生成指定用户的动态二维码（2026-02-12 路由分离）
 *
 * 业务场景：
 * - 审核统一走审核链，终审通过后由 ConsumptionAuditCallback 自动奖励积分（1元=1分）
 *
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const { asyncHandler } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger
const BeijingTimeHelper = require('../../../../utils/timeHelper')

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
router.get(
  '/pending',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
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
  })
)

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
router.get(
  '/records',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
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
  })
)

/*
 * 🗑️ 消费审核已收口到审核链（2026-06-12 单一路径零技术债重构）
 * 原 POST /approve/:id、/reject/:id、/batch-review 三个接口已删除（含无审核链时的 CoreService 直审兜底分支）。
 * 消费审核统一走：
 *   - 单条：POST /api/v4/console/approval-chain/steps/:id/approve | /reject
 *   - 批量：POST /api/v4/console/approval-chain/steps/batch
 * CoreService.approveConsumption / rejectConsumption 方法本身保留（由 ConsumptionAuditCallback 终审回调复用）。
 */

/**
 * @route GET /api/v4/console/consumption/qrcode/:user_id
 * @desc 管理员生成指定用户的动态身份二维码（v2版本）
 * @access Private (管理员，role_level >= 100)
 *
 * 路由分布：
 * - 用户端：GET /api/v4/user/consumption/qrcode（从 JWT Token 取身份）
 * - 管理端：GET /api/v4/console/consumption/qrcode/:user_id（admin专用，带审计日志）
 *
 * @param {number} user_id - 目标用户ID
 *
 * @returns {Object} 二维码信息
 * @returns {string} data.qr_code - 二维码字符串
 * @returns {number} data.user_id - 用户ID
 * @returns {string} data.user_uuid - 用户UUID
 * @returns {string} data.nonce - 一次性随机数
 * @returns {Object} data.expires_at - 过期时间（北京时间对象：{iso,beijing,timestamp,relative}）
 * @returns {Object} data.generated_at - 生成时间（北京时间对象：{iso,beijing,timestamp,relative}）
 * @returns {number} data.validity_seconds - 有效期（秒，数值型，前端倒计时直用）
 * @returns {string} data.algorithm - 签名算法
 * @returns {string} data.note - 使用说明
 * @returns {string} data.usage - 使用方式
 */
router.get(
  '/qrcode/:user_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
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
     * 防御性校验：确保 user_uuid 存在（缺失时由 Service 自动修复并回填）
     * 与用户端 /user/consumption/qrcode 保持一致的自动修复逻辑
     */
    let userUuid = user.user_uuid
    if (!userUuid || typeof userUuid !== 'string') {
      try {
        userUuid = await UserService.ensureUserUuid(user_id)
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
    const QRCodeValidator = require('../../../../utils/QRCodeValidator')
    const qrCodeInfo = QRCodeValidator.generateQRCodeInfo(userUuid)

    // 记录审计日志（非阻断）
    const AuditLogService = req.app.locals.services.getService('audit_log')
    const { OPERATION_TYPES } = require('../../../../constants/AuditOperationTypes')
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
        validity_seconds: qrCodeInfo.validity_seconds,
        algorithm: qrCodeInfo.algorithm,
        note: qrCodeInfo.note,
        usage: '管理员为用户生成的动态二维码'
      },
      '动态二维码生成成功'
    )
  })
)

module.exports = router
