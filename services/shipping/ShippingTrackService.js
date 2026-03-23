/**
 * 快递查询抽象层 — 双通道降级策略（快递100主 + 快递鸟备）
 *
 * 功能：
 * - 统一调用接口查询物流轨迹
 * - 快递100故障/超时自动降级到快递鸟
 * - Redis 缓存物流轨迹（已签收24h，其他10min）
 *
 * @module services/shipping/ShippingTrackService
 * @version 1.0.0
 */

'use strict'

const logger = require('../../utils/logger').logger

/** 常用快递公司字典（快递100代码 / 快递鸟代码 双映射） */
const SHIPPING_COMPANIES = [
  { code: 'sf', name: '顺丰速运', kuaidi100: 'shunfeng', kdniao: 'SF' },
  { code: 'yt', name: '圆通速递', kuaidi100: 'yuantong', kdniao: 'YTO' },
  { code: 'zt', name: '中通快递', kuaidi100: 'zhongtong', kdniao: 'ZTO' },
  { code: 'sto', name: '申通快递', kuaidi100: 'shentong', kdniao: 'STO' },
  { code: 'yd', name: '韵达快递', kuaidi100: 'yunda', kdniao: 'YD' },
  { code: 'jd', name: '京东物流', kuaidi100: 'jd', kdniao: 'JD' },
  { code: 'ems', name: 'EMS', kuaidi100: 'ems', kdniao: 'EMS' },
  { code: 'dbkd', name: '德邦快递', kuaidi100: 'debangkuaidi', kdniao: 'DBL' },
  { code: 'yzbk', name: '邮政包裹', kuaidi100: 'youzhengguonei', kdniao: 'YZPY' }
]

/**
 * 快递查询抽象层
 * @returns {ShippingTrackService} 实例
 */
class ShippingTrackService {
  /** 初始化 Provider 列表 */
  constructor() {
    this.providers = []
    this._initProviders()
  }

  /**
   * 初始化快递查询 Provider（按优先级排列）
   * 缺少 API Key 的 Provider 自动跳过
   * @returns {void}
   * @private
   */
  _initProviders() {
    try {
      const Kuaidi100Provider = require('./providers/Kuaidi100Provider')
      if (process.env.KUAIDI100_KEY && process.env.KUAIDI100_CUSTOMER) {
        this.providers.push(
          new Kuaidi100Provider({
            key: process.env.KUAIDI100_KEY,
            customer: process.env.KUAIDI100_CUSTOMER
          })
        )
        logger.info('[快递查询] 快递100 Provider 已注册（主通道）')
      }
    } catch {
      logger.warn('[快递查询] 快递100 Provider 加载失败')
    }

    try {
      const KdniaoProvider = require('./providers/KdniaoProvider')
      if (process.env.KDNIAO_APP_ID && process.env.KDNIAO_APP_KEY) {
        this.providers.push(
          new KdniaoProvider({
            appId: process.env.KDNIAO_APP_ID,
            appKey: process.env.KDNIAO_APP_KEY
          })
        )
        logger.info('[快递查询] 快递鸟 Provider 已注册（备用通道）')
      }
    } catch {
      logger.warn('[快递查询] 快递鸟 Provider 加载失败')
    }

    if (this.providers.length === 0) {
      logger.warn('[快递查询] 未配置任何快递查询 Provider（需设置 KUAIDI100_KEY 或 KDNIAO_APP_ID）')
    }
  }

  /**
   * 查询物流轨迹（自动降级 + Redis 缓存）
   *
   * @param {string} shippingNo - 快递单号
   * @param {string} companyCode - 快递公司代码（本系统内部代码，如 sf/yt/zt）
   * @returns {Promise<Object>} 统一格式的物流轨迹
   */
  async queryTrack(shippingNo, companyCode) {
    if (!shippingNo || !companyCode) {
      return { success: false, message: '快递单号和快递公司代码不能为空' }
    }

    // Redis 缓存检查
    try {
      const { getRedisClient } = require('../../utils/UnifiedRedisClient')
      const redis = await getRedisClient()
      const cacheKey = `app:v4:shipping:track:${shippingNo}`
      const cached = await redis.get(cacheKey)
      if (cached) {
        logger.info('[快递查询] 命中缓存', { shippingNo })
        return JSON.parse(cached)
      }
    } catch {
      /* Redis 不可用时降级为直接查询 */
    }

    // 依次尝试各 Provider
    for (const provider of this.providers) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const result = await provider.query(shippingNo, companyCode)
        if (result.success) {
          // 写入缓存（已签收 24h，其他 10min）
          try {
            const { getRedisClient } = require('../../utils/UnifiedRedisClient')
            // eslint-disable-next-line no-await-in-loop
            const redis = await getRedisClient()
            const cacheKey = `app:v4:shipping:track:${shippingNo}`
            const ttl = result.state === 'delivered' ? 86400 : 600
            // eslint-disable-next-line no-await-in-loop
            await redis.setex(cacheKey, ttl, JSON.stringify(result))
          } catch {
            /* 缓存写入失败不影响返回 */
          }
          return result
        }
      } catch (err) {
        logger.warn(`[快递查询] ${provider.name} 查询失败，尝试下一个`, {
          error: err.message,
          shippingNo,
          companyCode
        })
      }
    }

    return {
      success: false,
      message:
        this.providers.length === 0
          ? '未配置快递查询 API（请在 .env 中设置 KUAIDI100_KEY 或 KDNIAO_APP_ID）'
          : '所有快递查询通道均不可用，请稍后重试'
    }
  }

  /**
   * 获取快递公司列表（供前端下拉选择）
   * @returns {Array<Object>} 快递公司列表
   */
  getCompanies() {
    return SHIPPING_COMPANIES.map(c => ({
      code: c.code,
      name: c.name
    }))
  }

  /**
   * 根据内部代码获取快递公司信息（含各平台映射代码）
   * @param {string} code - 内部快递公司代码
   * @returns {Object|null} 快递公司信息
   */
  getCompanyByCode(code) {
    return SHIPPING_COMPANIES.find(c => c.code === code) || null
  }
}

module.exports = ShippingTrackService
module.exports.SHIPPING_COMPANIES = SHIPPING_COMPANIES
