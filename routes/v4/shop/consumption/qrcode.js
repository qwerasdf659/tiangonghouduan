/**
 * 消费记录管理模块 - 商家端二维码验证
 *
 * @route /api/v4/shop/consumption
 * @description 商家扫码验证用户身份（需商家域权限）
 *
 * API列表：
 * - GET /user-info - 验证二维码并获取用户详细信息（商家扫码后使用，需商家域权限）
 *
 * 路由分布：
 * - 用户端 GET /qrcode → /api/v4/user/consumption/qrcode（仅需 authenticateToken）
 * - 商家端 GET /user-info → 本文件（需 requireMerchantDomainAccess + requireMerchantPermission）
 * - 管理端 GET /qrcode/:user_id → /api/v4/console/consumption/qrcode/:user_id（admin专用）
 *
 * 业务场景：
 * - 用户生成自己的动态二维码用于线下消费
 * - 商家扫码后获取用户信息，录入消费金额
 * - v2版本：动态码 + nonce防重放 + 5分钟有效期 + HMAC签名
 *
 * 创建时间：2025年12月22日
 * 从consumption.js拆分而来
 * 更新时间：2026年1月12日
 * v2动态二维码升级 - 移除v1永久码支持
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireMerchantPermission } = require('../../../../middleware/auth')
const { asyncHandler } = require('../../../../middleware/validation')
const QRCodeValidator = require('../../../../utils/QRCodeValidator')
const logger = require('../../../../utils/logger').logger

/*
 * 路由层合规性治理（2026-01-18）：
 * - 移除直接 require models
 * - 通过 ServiceManager 统一获取服务（B1-Injected + E2-Strict snake_case）
 * - UserService 通过 req.app.locals.services.getService('user') 获取
 * - 商家域审计日志（AC4.2）通过 MerchantOperationLogService 访问
 */

/**
 * @route GET /api/v4/shop/consumption/user-info
 * @desc 验证二维码并获取用户详细信息（商家扫码后使用）
 * @access Private (商家员工或管理员，需 consumption:scan_user 权限)
 *
 * 核心功能：
 * 1. ✅ 验证v2动态二维码有效性（HMAC-SHA256签名 + nonce防重放 + 5分钟过期）
 * 2. ✅ 查询用户详细信息（昵称、手机号码）
 * 3. ✅ 门店级权限验证（仅能扫描所属门店的顾客）
 *
 * @query {string} qr_code - 用户v2动态二维码（必填，格式：QRV2_{base64_payload}_{signature}）
 * @query {number} store_id - 门店ID（可选，商家仅单店时自动填充）
 *
 * @returns {Object} 用户信息
 * @returns {number} data.user_id - 用户ID
 * @returns {string} data.user_uuid - 用户UUID
 * @returns {string} data.nickname - 用户昵称
 * @returns {string} data.mobile - 用户手机号码（完整号码）
 * @returns {string} data.qr_code - 二维码字符串
 *
 * @example 成功响应
 * GET /api/v4/shop/consumption/user-info?qr_code=QRV2_eyJ1c2VyX3V1aWQ...&store_id=1
 * Response:
 * {
 *   "success": true,
 *   "code": "SUCCESS",
 *   "message": "用户信息获取成功",
 *   "data": {
 *     "user_id": 123,
 *     "user_uuid": "550e8400-e29b-41d4-a716-446655440000",
 *     "nickname": "张三",
 *     "mobile": "13800138000",
 *     "qr_code": "QRV2_..."
 *   }
 * }
 *
 * 业务场景：
 * - 商家员工扫描用户动态二维码后，快速获取用户信息
 * - 用于消费录入页面显示用户身份
 * - 同时完成二维码验证和用户信息查询（一次调用，两个功能）
 * - v2版本：动态码验证后立即失效，防止重放攻击
 *
 * 错误响应：
 * - 400 INVALID_QRCODE_FORMAT: v1永久码不再支持，请刷新获取最新二维码
 * - 400 QRCODE_EXPIRED: 二维码已过期，请刷新后重试
 * - 409 REPLAY_DETECTED: 二维码已使用，请刷新后重试
 */
router.get(
  '/user-info',
  authenticateToken,
  requireMerchantPermission('consumption:scan_user', { scope: 'store', storeIdParam: 'query' }),
  asyncHandler(async (req, res) => {
    const QueryService = req.app.locals.services.getService('consumption_query')

    const { qr_code } = req.query

    if (!qr_code) {
      return res.apiError('二维码不能为空', 'BAD_REQUEST', null, 400)
    }

    if (QRCodeValidator.detectVersion(qr_code) !== 'v2') {
      return res.apiError(
        '二维码格式不支持，请刷新获取最新二维码',
        'INVALID_QRCODE_FORMAT',
        { hint: '请让顾客重新生成动态二维码' },
        400
      )
    }

    let resolved_store_id =
      req.verified_store_id || (req.query.store_id ? parseInt(req.query.store_id, 10) : null)
    const user_stores = req.user_stores || []

    if (!resolved_store_id) {
      if (user_stores.length === 0) {
        return res.apiError('您未绑定任何门店，无法扫码获取用户信息', 'NO_STORE_BINDING', null, 403)
      } else if (user_stores.length === 1) {
        resolved_store_id = user_stores[0].store_id
        logger.info(`🏪 自动填充门店ID: ${resolved_store_id} (用户仅绑定一个门店)`)
      } else {
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

    logger.info('商家扫码获取用户信息', {
      qr_code: qr_code.substring(0, 30) + '...',
      merchant_id: req.user.user_id,
      store_id: resolved_store_id
    })

    const userInfo = await QueryService.getUserInfoByQRCode(qr_code)

    logger.info('用户信息获取成功', {
      user_id: userInfo.user_id,
      nickname: userInfo.nickname,
      merchant_id: req.user.user_id
    })

    try {
      const MerchantOperationLogService =
        req.app.locals.services.getService('merchant_operation_log')
      await MerchantOperationLogService.createLog({
        operator_id: req.user.user_id,
        store_id: resolved_store_id,
        operation_type: 'scan_user',
        action: 'scan',
        target_user_id: userInfo.user_id,
        request_id: req.id || null,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        result: 'success',
        extra_data: {
          user_uuid: userInfo.user_uuid
        }
      })
      logger.debug('📝 商家审计日志已记录', { user_id: userInfo.user_id })
    } catch (logError) {
      logger.error('⚠️ 商家审计日志记录失败（非阻断）', { error: logError.message })
    }

    return res.apiSuccess(
      {
        user_id: userInfo.user_id,
        user_uuid: userInfo.user_uuid,
        nickname: userInfo.nickname,
        mobile: userInfo.mobile,
        qr_code
      },
      '用户信息获取成功'
    )
  })
)

module.exports = router
