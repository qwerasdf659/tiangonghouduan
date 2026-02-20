/**
 * 消费记录管理模块 - 商家端二维码验证
 *
 * @route /api/v4/shop/consumption
 * @description 商家扫码验证用户身份（需商家域权限）
 *
 * API列表：
 * - GET /user-info - 验证二维码并获取用户详细信息（商家扫码后使用，需商家域权限）
 *
 * 📌 DB-3 迁移记录（2026-02-20）：
 * - GET /qrcode 已迁移到 /api/v4/user/consumption/qrcode（用户域）
 * - 原因：QR 码生成是消费者行为，不属于商家域（与 exchange → backpack 迁移同理）
 * - 迁移文件：routes/v4/user/consumption-qrcode.js
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
const { handleServiceError } = require('../../../../middleware/validation')
const QRCodeValidator = require('../../../../utils/QRCodeValidator')
const logger = require('../../../../utils/logger').logger

/*
 * 路由层合规性治理（2026-01-18）：
 * - 移除直接 require models
 * - 通过 ServiceManager 统一获取服务（B1-Injected + E2-Strict snake_case）
 * - UserService 通过 req.app.locals.services.getService('user') 获取
 * - 商家域审计日志（AC4.2）通过 MerchantOperationLogService 访问
 */

/*
 * GET /qrcode 已迁移到用户域（DB-3 修复，2026-02-20 方案B）
 * 新端点：GET /api/v4/user/consumption/qrcode
 * 迁移文件：routes/v4/user/consumption-qrcode.js
 * 原因：QR 码生成是消费者行为，按行为发起者归入 /user/ 域
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
  async (req, res) => {
    try {
      // 🔄 通过 ServiceManager 获取 QueryService（V4.7.0 服务拆分：getUserInfoByQRCode 在 QueryService 中）
      const QueryService = req.app.locals.services.getService('consumption_query')

      const { qr_code } = req.query

      // 参数验证
      if (!qr_code) {
        return res.apiError('二维码不能为空', 'BAD_REQUEST', null, 400)
      }

      // 先验证v2二维码格式
      if (QRCodeValidator.isV1QRCode(qr_code)) {
        return res.apiError(
          '二维码格式不支持，请刷新获取最新二维码',
          'INVALID_QRCODE_FORMAT',
          { hint: '请让顾客重新生成动态二维码' },
          400
        )
      }

      /*
       * 🏪 门店ID处理逻辑（与 /submit 统一，AC2.3）
       * - 如果已通过 requireMerchantPermission 验证，使用 req.verified_store_id
       * - 如果未传 store_id，从 req.user_stores 自动填充（单门店）
       * - 多门店员工必须传 store_id
       */
      let resolved_store_id =
        req.verified_store_id || (req.query.store_id ? parseInt(req.query.store_id, 10) : null)
      const user_stores = req.user_stores || []

      if (!resolved_store_id) {
        // 未传 store_id，尝试自动填充
        if (user_stores.length === 0) {
          return res.apiError(
            '您未绑定任何门店，无法扫码获取用户信息',
            'NO_STORE_BINDING',
            null,
            403
          )
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

      logger.info('商家扫码获取用户信息', {
        qr_code: qr_code.substring(0, 30) + '...',
        merchant_id: req.user.user_id,
        store_id: resolved_store_id
      })

      // 调用服务层获取用户信息（服务层内部会验证v2二维码）
      const userInfo = await QueryService.getUserInfoByQRCode(qr_code)

      logger.info('用户信息获取成功', {
        user_id: userInfo.user_id,
        nickname: userInfo.nickname,
        merchant_id: req.user.user_id
      })

      // 【AC4.2】记录商家域审计日志（扫码获取用户信息，通过 ServiceManager 获取服务）
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
        // 审计日志失败不应影响主流程
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
    } catch (error) {
      // 处理二维码验证特定错误
      if (error.code === 'QRCODE_EXPIRED') {
        return res.apiError('二维码已过期，请刷新后重试', 'QRCODE_EXPIRED', null, 400)
      }
      if (error.code === 'REPLAY_DETECTED') {
        return res.apiError('二维码已使用，请刷新后重试', 'REPLAY_DETECTED', null, 409)
      }
      if (error.code === 'INVALID_QRCODE_FORMAT') {
        return res.apiError(
          '二维码格式不支持，请刷新获取最新二维码',
          'INVALID_QRCODE_FORMAT',
          null,
          400
        )
      }
      logger.error('获取用户信息失败', { error: error.message })
      return handleServiceError(error, res, '获取用户信息失败')
    }
  }
)

module.exports = router
