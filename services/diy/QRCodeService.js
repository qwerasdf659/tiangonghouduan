/**
 * DIY 作品小程序码生成服务
 *
 * 职责：
 * - 生成 DIY 作品的微信小程序码
 * - 缓存已生成的小程序码到 Sealos 对象存储
 *
 * @module services/diy/QRCodeService
 */

'use strict'

const logger = require('../../utils/logger').logger

/**
 * DIY 小程序码生成服务
 *
 * @class DiyQRCodeService
 */
class DiyQRCodeService {
  /**
   * 生成 DIY 作品小程序码
   *
   * @param {number} diyWorkId - 作品ID
   * @param {Object} options - 生成选项
   * @param {number} [options.width=280] - 小程序码宽度（px）
   * @param {string} [options.page] - 小程序页面路径
   * @returns {Promise<Object>} { qrcode_url, cached }
   */
  static async generateQRCode(diyWorkId, options = {}) {
    logger.info('生成DIY作品小程序码', { diy_work_id: diyWorkId, options })

    /* TODO: 对接微信小程序码 API（wxacode.getUnlimited），待微信小程序上线后实现 */
    throw new Error('小程序码生成功能待微信小程序上线后对接实现')
  }
}

module.exports = DiyQRCodeService
