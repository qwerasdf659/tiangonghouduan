/**
 * 消费二维码 - 用户端（任何已登录用户均可生成）
 *
 * @route GET /api/v4/user/consumption/qrcode
 * @description 消费者生成自己的动态身份二维码，供商家扫码录入消费
 *
 * 三端路由分布：
 * - 用户端 GET /api/v4/user/consumption/qrcode（本文件，仅需登录）
 * - 商家端 GET /api/v4/shop/consumption/user-info（需商家域权限）
 * - 管理端 GET /api/v4/console/consumption/qrcode/:user_id（admin专用）
 *
 * 适用区域：中国（北京时间 Asia/Shanghai）
 */

const express = require('express')
const router = express.Router()
const { handleServiceError } = require('../../../middleware/validation')
const QRCodeValidator = require('../../../utils/QRCodeValidator')
const logger = require('../../../utils/logger').logger

/**
 * @route GET /api/v4/user/consumption/qrcode
 * @desc 生成当前用户动态身份二维码（v2版本，5分钟有效，一次性）
 * @access Private（任何已登录用户，从 JWT Token 取身份）
 *
 * @returns {Object} 二维码信息
 * @returns {string} data.qr_code - 二维码字符串（格式：QRV2_{base64_payload}_{signature}）
 * @returns {number} data.user_id - 用户ID（内部标识）
 * @returns {string} data.user_uuid - 用户UUID（外部标识）
 * @returns {string} data.nonce - 一次性随机数
 * @returns {Object} data.expires_at - 过期时间（北京时间对象：{iso,beijing,timestamp,relative}）
 * @returns {Object} data.generated_at - 生成时间（北京时间对象：{iso,beijing,timestamp,relative}）
 * @returns {number} data.validity_seconds - 有效期（秒，数值型，前端倒计时直用）
 * @returns {string} data.algorithm - 签名算法
 * @returns {string} data.note - 使用说明
 * @returns {string} data.usage - 使用方式
 */
router.get('/qrcode', async (req, res) => {
  try {
    const userId = req.user.user_id

    logger.info('用户生成消费动态二维码（v2版本）', { user_id: userId })

    const UserService = req.app.locals.services.getService('user')
    let user
    try {
      user = await UserService.getUserById(userId)
    } catch (error) {
      if (error.code === 'USER_NOT_FOUND') {
        return res.apiError('用户不存在', 'NOT_FOUND', null, 404)
      }
      throw error
    }

    /*
     * 防御性校验：确保 user_uuid 存在（缺失时由 Service 自动修复并回填）
     * 缺失场景：Redis缓存不一致 / 迁移未回填 / 直接SQL插入
     */
    let userUuid = user.user_uuid
    if (!userUuid || typeof userUuid !== 'string') {
      try {
        userUuid = await UserService.ensureUserUuid(userId)
      } catch (repairError) {
        logger.error('用户 user_uuid 自动修复失败', {
          user_id: userId,
          error: repairError.message
        })
        return res.apiError('用户身份信息异常，请联系客服处理', 'USER_UUID_MISSING', null, 500)
      }
    }

    const qrCodeInfo = QRCodeValidator.generateQRCodeInfo(userUuid)

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
        usage: '请商家扫描此二维码录入消费金额'
      },
      '动态二维码生成成功'
    )
  } catch (error) {
    logger.error('生成动态二维码失败', { error: error.message })
    return handleServiceError(error, res, '生成动态二维码失败')
  }
})

module.exports = router
