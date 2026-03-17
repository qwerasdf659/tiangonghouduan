/**
 * 快递100查询 Provider（主通道）
 *
 * API文档：https://api.kuaidi100.com/document
 * 需要 .env 配置：KUAIDI100_KEY, KUAIDI100_CUSTOMER
 *
 * @module services/shipping/providers/Kuaidi100Provider
 */

'use strict'

const crypto = require('crypto')
const logger = require('../../../utils/logger').logger
const { SHIPPING_COMPANIES } = require('../ShippingTrackService')

/** 快递100查询提供者 */
class Kuaidi100Provider {
  /** @param {Object} config - 配置（key, customer） */
  constructor(config) {
    this.name = 'kuaidi100'
    this.key = config.key
    this.customer = config.customer
    this.apiUrl = 'https://poll.kuaidi100.com/poll/query.do'
  }

  /**
   * 查询物流轨迹
   *
   * @param {string} shippingNo - 快递单号
   * @param {string} companyCode - 内部快递公司代码（如 sf）
   * @returns {Promise<Object>} 统一格式物流轨迹
   */
  async query(shippingNo, companyCode) {
    const company = SHIPPING_COMPANIES.find(c => c.code === companyCode)
    const kuaidi100Code = company?.kuaidi100 || companyCode

    const param = JSON.stringify({ com: kuaidi100Code, num: shippingNo })
    const sign = crypto
      .createHash('md5')
      .update(param + this.key + this.customer)
      .digest('hex')
      .toUpperCase()

    const body = `customer=${this.customer}&sign=${sign}&param=${encodeURIComponent(param)}`

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10000)
    })

    const data = await response.json()

    if (data.status !== '200' && data.returnCode !== '200') {
      logger.warn('[快递100] 查询失败', { message: data.message, returnCode: data.returnCode })
      return { success: false, message: data.message || '快递100查询失败' }
    }

    return {
      success: true,
      provider: this.name,
      state: this._mapState(data.state),
      company: company?.name || kuaidi100Code,
      shipping_no: shippingNo,
      tracks: (data.data || []).map(item => ({
        time: item.ftime || item.time,
        status: this._mapState(data.state),
        detail: item.context
      }))
    }
  }

  /**
   * 快递100状态码映射到统一状态
   * @param {string} state - 快递100状态码
   * @returns {string} 统一状态
   * @private
   */
  _mapState(state) {
    const map = {
      0: 'in_transit',
      1: 'picked_up',
      2: 'in_transit',
      3: 'delivered',
      4: 'returned',
      5: 'delivering',
      6: 'returned'
    }
    return map[state] || 'in_transit'
  }
}

module.exports = Kuaidi100Provider
