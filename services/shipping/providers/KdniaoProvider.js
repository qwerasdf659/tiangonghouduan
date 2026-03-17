/**
 * 快递鸟查询 Provider（备用通道）
 *
 * API文档：https://www.kdniao.com/api-track
 * 需要 .env 配置：KDNIAO_APP_ID, KDNIAO_APP_KEY
 * 免费额度：500次/天
 *
 * @module services/shipping/providers/KdniaoProvider
 */

'use strict'

const crypto = require('crypto')
const logger = require('../../../utils/logger').logger
const { SHIPPING_COMPANIES } = require('../ShippingTrackService')

/** 快递鸟查询提供者（备用通道） */
class KdniaoProvider {
  /** @param {Object} config - 配置（appId, appKey） */
  constructor(config) {
    this.name = 'kdniao'
    this.appId = config.appId
    this.appKey = config.appKey
    this.apiUrl = 'https://api.kdniao.com/Ebusiness/EbusinessOrderHandle.aspx'
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
    const kdniaoCode = company?.kdniao || companyCode.toUpperCase()

    const requestData = JSON.stringify({
      ShipperCode: kdniaoCode,
      LogisticCode: shippingNo
    })

    const dataSign = crypto
      .createHash('md5')
      .update(requestData + this.appKey)
      .digest('base64')

    const params = new URLSearchParams({
      EBusinessID: this.appId,
      RequestType: '1002',
      RequestData: encodeURIComponent(requestData),
      DataType: '2',
      DataSign: encodeURIComponent(dataSign)
    })

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(10000)
    })

    const data = await response.json()

    if (!data.Success) {
      logger.warn('[快递鸟] 查询失败', { reason: data.Reason })
      return { success: false, message: data.Reason || '快递鸟查询失败' }
    }

    return {
      success: true,
      provider: this.name,
      state: this._mapState(data.State),
      company: company?.name || kdniaoCode,
      shipping_no: shippingNo,
      tracks: (data.Traces || []).reverse().map(item => ({
        time: item.AcceptTime,
        status: this._mapState(data.State),
        detail: item.AcceptStation
      }))
    }
  }

  /**
   * 快递鸟状态码映射到统一状态
   * @param {string} state - 快递鸟状态码
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
    return map[String(state)] || 'in_transit'
  }
}

module.exports = KdniaoProvider
