/**
 * 消费记录管理模块 - 二维码相关
 *
 * @route /api/v4/shop/consumption
 * @description 用户二维码生成与验证
 *
 * API列表：
 * - GET /qrcode/:user_id - 生成用户固定身份二维码（UUID版本）
 * - GET /user-info - 验证二维码并获取用户详细信息（管理员扫码后使用）
 *
 * 业务场景：
 * - 用户生成自己的二维码用于线下消费
 * - 商家扫码后获取用户信息，录入消费金额
 * - 二维码使用UUID版本，保护用户隐私
 *
 * 创建时间：2025年12月22日
 * 从consumption.js拆分而来
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const QRCodeValidator = require('../../../../utils/QRCodeValidator')
const logger = require('../../../../utils/logger').logger

/**
 * @route GET /api/v4/shop/consumption/qrcode/:user_id
 * @desc 生成用户固定身份二维码（UUID版本）
 * @access Private (用户本人或管理员)
 *
 * @param {number} user_id - 用户ID
 *
 * @returns {Object} 二维码信息
 * @returns {string} data.qr_code - 二维码字符串（格式：QR_{uuid}_{signature}）
 * @returns {number} data.user_id - 用户ID（内部标识）
 * @returns {string} data.user_uuid - 用户UUID（外部标识）
 * @returns {string} data.generated_at - 生成时间（北京时间）
 * @returns {string} data.validity - 有效期（permanent=永久有效）
 * @returns {string} data.note - 使用说明
 * @returns {string} data.usage - 使用方式
 *
 * @example
 * GET /api/v4/shop/consumption/qrcode/123
 * Response:
 * {
 *   "qr_code": "QR_550e8400-e29b-41d4-a716-446655440000_a1b2c3d4...",
 *   "user_id": 123,
 *   "user_uuid": "550e8400-e29b-41d4-a716-446655440000",
 *   "generated_at": "2025-12-17 14:30:00",
 *   "validity": "permanent",
 *   "note": "此二维码长期有效，可打印使用（UUID版本，隐私保护）",
 *   "usage": "请商家扫描此二维码录入消费金额"
 * }
 */
router.get('/qrcode/:user_id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.params

    // 参数验证：严格验证user_id，防止NaN绕过
    const userId = parseInt(user_id, 10)
    if (isNaN(userId) || userId <= 0) {
      logger.warn('无效的用户ID参数', { user_id, requester: req.user.user_id })
      return res.apiError('无效的用户ID，必须是正整数', 'BAD_REQUEST', null, 400)
    }

    // 权限检查：只能生成自己的二维码，或管理员(role_level >= 100)可生成任何用户
    if (req.user.user_id !== userId && req.user.role_level < 100) {
      logger.warn('权限验证失败', {
        requester: req.user.user_id,
        target: userId
      })
      return res.apiError('无权生成其他用户的二维码', 'FORBIDDEN', null, 403)
    }

    logger.info('生成用户二维码（UUID版本）', { user_id: userId })

    // 查询用户获取UUID
    const { User } = require('../../../../models')
    const user = await User.findByPk(userId, {
      attributes: ['user_id', 'user_uuid']
    })

    if (!user) {
      return res.apiError('用户不存在', 'NOT_FOUND', null, 404)
    }

    // 使用UUID生成二维码
    const qrCodeInfo = QRCodeValidator.generateQRCodeInfo(user.user_uuid)

    return res.apiSuccess(
      {
        qr_code: qrCodeInfo.qr_code,
        user_id: user.user_id,
        user_uuid: qrCodeInfo.user_uuid,
        generated_at: qrCodeInfo.generated_at,
        validity: qrCodeInfo.validity,
        note: qrCodeInfo.note,
        usage: '请商家扫描此二维码录入消费金额'
      },
      '二维码生成成功'
    )
  } catch (error) {
    logger.error('生成二维码失败', { error: error.message })
    return handleServiceError(error, res, '生成二维码失败')
  }
})

/**
 * @route GET /api/v4/shop/consumption/user-info
 * @desc 验证二维码并获取用户详细信息（管理员扫码后使用）
 * @access Private (管理员)
 *
 * 核心功能：
 * 1. ✅ 验证二维码有效性（HMAC-SHA256签名验证）
 * 2. ✅ 查询用户详细信息（昵称、手机号码）
 * 3. ✅ 替代原validate-qrcode接口（已删除冗余接口）
 *
 * @query {string} qr_code - 用户二维码（必填，格式：QR_{uuid}_{signature}）
 *
 * @returns {Object} 用户信息
 * @returns {number} data.user_id - 用户ID
 * @returns {string} data.user_uuid - 用户UUID
 * @returns {string} data.nickname - 用户昵称
 * @returns {string} data.mobile - 用户手机号码（完整号码）
 * @returns {string} data.qr_code - 二维码字符串
 *
 * @example 成功响应
 * GET /api/v4/shop/consumption/user-info?qr_code=QR_550e8400-...
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
 *     "qr_code": "QR_550e8400-..."
 *   }
 * }
 *
 * 业务场景：
 * - 管理员扫描用户二维码后，快速获取用户信息
 * - 用于消费录入页面显示用户身份
 * - 同时完成二维码验证和用户信息查询（一次调用，两个功能）
 */
router.get('/user-info', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ConsumptionService（符合TR-005规范）
    const ConsumptionService = req.app.locals.services.getService('consumption')

    const { qr_code } = req.query

    // 参数验证
    if (!qr_code) {
      return res.apiError('二维码不能为空', 'BAD_REQUEST', null, 400)
    }

    logger.info('获取用户信息', { qr_code: qr_code.substring(0, 20) + '...' })

    // 调用服务层获取用户信息
    const userInfo = await ConsumptionService.getUserInfoByQRCode(qr_code)

    logger.info('用户信息获取成功', {
      user_id: userInfo.user_id,
      nickname: userInfo.nickname
    })

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
    logger.error('获取用户信息失败', { error: error.message })
    return handleServiceError(error, res, '获取用户信息失败')
  }
})

module.exports = router
