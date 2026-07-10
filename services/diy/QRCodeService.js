/**
 * DIY 作品小程序码生成服务（拍板决议 11.5-C / 11.8-⑦）
 *
 * 职责：
 * - 调微信 wxacode.getUnlimited 生成 DIY 作品分享小程序码
 * - 缓存到 Sealos 对象存储确定性路径 diy-qrcodes/work_{id}.png（生成一次、后续走缓存）
 *
 * 链路：作者请求 → 校验作品归属 → 缓存命中直接回 URL
 *       → 未命中：获取 access_token → wxacode.getUnlimited(scene=diy_work_id={id},
 *         page=packageDIY/diy-lite/diy-lite) → 上传 Sealos 确定性路径 → 回 URL
 *
 * 依赖：
 * - .env 的 WX_APPID / WX_SECRET（微信凭据，唯一真相源）
 * - config/business.config.js 的 diy.qrcode（页面路径/宽度/存储目录，代码层固定规则）
 * - 小程序码扫码可用性依赖小程序提审发布（拍板 ⑦：实现随首次提审绑定，
 *   提审前小程序端隐藏二维码入口；本服务代码已可用，仅落地页未上线）
 *
 * @module services/diy/QRCodeService
 */

'use strict'

const axios = require('axios')
const logger = require('../../utils/logger').logger
const businessConfig = require('../../config/business.config')
const { DiyWork } = require('../../models')

/** DIY 小程序码固定规则（页面路径写入 config 常量，不硬编码） */
const QRCODE_CONFIG = businessConfig.diy.qrcode

/**
 * DIY 小程序码生成服务
 *
 * @class DiyQRCodeService
 */
class DiyQRCodeService {
  /**
   * 生成/获取 DIY 作品小程序码
   *
   * 签名与路由调用对齐（routes/v4/diy.js 三参调用）：
   * generateQRCode(workId, userId, serviceManager)
   *
   * @param {number} diyWorkId - 作品 ID
   * @param {number} userId - 请求用户 user_id（作者校验：仅作者可生成分享码）
   * @param {Object} serviceManager - ServiceManager 实例（获取 sealos_storage / diy 服务）
   * @returns {Promise<{qrcode_url: string, cached: boolean}>} 小程序码公网 URL 与缓存命中标识
   */
  static async generateQRCode(diyWorkId, userId, serviceManager) {
    // ========== 作品存在性 + 作者校验 ==========
    const work = await DiyWork.findByPk(diyWorkId)
    if (!work) {
      const error = new Error('作品不存在')
      error.statusCode = 404
      throw error
    }

    const DIYService = serviceManager.getService('diy')
    const accountId = await DIYService.getAccountIdByUserId(userId)
    if (Number(work.account_id) !== Number(accountId)) {
      const error = new Error('无权生成该作品的小程序码')
      error.statusCode = 403
      throw error
    }

    /* 草稿不生成分享码（与 11.5-E 分享还原口径一致：仅 frozen/completed 可被分享） */
    if (!['frozen', 'completed'].includes(work.status)) {
      const error = new Error(`作品状态为 ${work.status}，仅冻结/已完成的作品可生成分享码`)
      error.statusCode = 409
      throw error
    }

    // ========== 缓存命中检查（确定性路径） ==========
    const SealosStorageServiceClass = serviceManager.getService('sealos_storage')
    const storage = new SealosStorageServiceClass()
    const objectKey = `${QRCODE_CONFIG.storage_folder}/work_${diyWorkId}.png`

    const cached = await storage.fileExists(objectKey)
    if (cached) {
      logger.info('[DIYService] 小程序码缓存命中', { diy_work_id: diyWorkId, objectKey })
      return { qrcode_url: storage.getPublicUrl(objectKey), cached: true }
    }

    // ========== 调微信生成小程序码 ==========
    const qrcodeBuffer = await DiyQRCodeService._fetchWxacodeBuffer(diyWorkId)

    // ========== 上传 Sealos 确定性路径并回 URL ==========
    await storage.uploadBufferAtKey(qrcodeBuffer, objectKey, 'image/png')

    logger.info('[DIYService] 小程序码生成并缓存成功', {
      diy_work_id: diyWorkId,
      objectKey,
      size: qrcodeBuffer.length
    })

    return { qrcode_url: storage.getPublicUrl(objectKey), cached: false }
  }

  /**
   * 调微信 wxacode.getUnlimited 获取小程序码图片 Buffer
   *
   * scene 格式：diy_work_id={id}（微信限制 32 字符，BIGINT 作品 ID 也不会超）
   * page：packageDIY/diy-lite/diy-lite（config 常量，diy-lite 为唯一生产设计台）
   *
   * @param {number} diyWorkId - 作品 ID
   * @returns {Promise<Buffer>} PNG 图片 Buffer
   * @private
   */
  static async _fetchWxacodeBuffer(diyWorkId) {
    const appId = process.env.WX_APPID
    const appSecret = process.env.WX_SECRET
    if (!appId || !appSecret) {
      const error = new Error('微信小程序配置缺失：WX_APPID 或 WX_SECRET 未配置（.env）')
      error.statusCode = 500
      throw error
    }

    // Step 1: 获取 access_token（client_credential 模式，与登录链路同款调用方式）
    const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`
    const tokenRes = await axios.get(tokenUrl, { timeout: 5000 })
    if (!tokenRes.data.access_token) {
      logger.error('[DIYService] 获取微信 access_token 失败', {
        wx_errcode: tokenRes.data.errcode,
        wx_errmsg: tokenRes.data.errmsg
      })
      const error = new Error(`微信 access_token 获取失败: ${tokenRes.data.errmsg || '未知错误'}`)
      error.statusCode = 502
      throw error
    }

    // Step 2: wxacode.getUnlimited（成功返回图片二进制，失败返回 JSON 错误体）
    const wxacodeUrl = `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${tokenRes.data.access_token}`
    const wxacodeRes = await axios.post(
      wxacodeUrl,
      {
        scene: `diy_work_id=${diyWorkId}`,
        page: QRCODE_CONFIG.page,
        width: QRCODE_CONFIG.width,
        check_path: true // 校验 page 是否已发布（提审前调用会报错，属预期，见拍板 ⑦）
      },
      { timeout: 10000, responseType: 'arraybuffer' }
    )

    const contentType = wxacodeRes.headers['content-type'] || ''
    if (contentType.includes('application/json')) {
      /* 微信返回 JSON 说明生成失败（如页面未发布 41030、scene 非法 40130 等） */
      const errBody = JSON.parse(Buffer.from(wxacodeRes.data).toString('utf8'))
      logger.error('[DIYService] wxacode.getUnlimited 失败', {
        diy_work_id: diyWorkId,
        wx_errcode: errBody.errcode,
        wx_errmsg: errBody.errmsg
      })
      const error = new Error(
        `微信小程序码生成失败: ${errBody.errmsg}（errcode=${errBody.errcode}，页面未发布时属预期，需随小程序首次提审后可用）`
      )
      error.statusCode = 502
      throw error
    }

    return Buffer.from(wxacodeRes.data)
  }
}

module.exports = DiyQRCodeService
