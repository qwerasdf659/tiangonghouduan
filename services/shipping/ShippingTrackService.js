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

const crypto = require('crypto')
const logger = require('../../utils/logger').logger
const Kuaidi100Provider = require('./providers/Kuaidi100Provider')
const KdniaoProvider = require('./providers/KdniaoProvider')
const { getRedisClient } = require('../../utils/UnifiedRedisClient')
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')

/** 常用快递公司字典 - 从 constants.js 引入避免循环依赖 */
const { SHIPPING_COMPANIES } = require('./constants')

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

  /**
   * 向第三方网关订阅某运单的轨迹推送（发货成功后调用，物流方案一）
   *
   * ⚠️ 真实数据依赖（需运营在 .env 配置后才会真正发起订阅）：
   *   KUAIDI100_KEY / KUAIDI100_CUSTOMER（快递100「订阅推送」服务，需付费/实名开通）
   *   或 KDNIAO_APP_ID / KDNIAO_APP_KEY（快递鸟「即时查询+订阅」套餐）
   *   SHIPPING_WEBHOOK_CALLBACK_URL（你的后端公网回调地址）
   * 未配置时本方法仅记录日志并返回 { subscribed:false }，不阻断发货主流程。
   *
   * @param {Object} params - 订阅参数
   * @param {string} params.shippingNo - 快递单号
   * @param {string} params.companyCode - 内部快递公司代码（sf/yt/zt…）
   * @returns {Promise<Object>} { subscribed: boolean, provider?: string, message?: string }
   */
  async subscribe({ shippingNo, companyCode }) {
    if (!shippingNo || !companyCode) {
      return { subscribed: false, message: '快递单号和快递公司代码不能为空' }
    }

    const callbackUrl = process.env.SHIPPING_WEBHOOK_CALLBACK_URL
    const hasKuaidi100 = !!(process.env.KUAIDI100_KEY && process.env.KUAIDI100_CUSTOMER)

    // 前置条件未配齐：仅记录日志、不阻断发货（待运营在 .env 填入真实密钥与回调地址后生效）
    if (!callbackUrl || !hasKuaidi100) {
      logger.warn(
        '[快递订阅] 跳过订阅：缺少快递100密钥或 webhook 回调地址（需在 .env 配置真实值）',
        {
          shippingNo,
          companyCode,
          has_kuaidi100: hasKuaidi100,
          has_callback: !!callbackUrl
        }
      )
      return {
        subscribed: false,
        message: '未配置快递100订阅推送密钥或回调地址（.env 需填真实值）'
      }
    }

    try {
      const company = SHIPPING_COMPANIES.find(c => c.code === companyCode)
      const kuaidi100Code = company?.kuaidi100 || companyCode
      const param = {
        company: kuaidi100Code,
        number: shippingNo,
        key: process.env.KUAIDI100_KEY,
        parameters: { callbackurl: callbackUrl }
      }
      const sign = crypto
        .createHash('md5')
        .update(JSON.stringify(param) + process.env.KUAIDI100_KEY + process.env.KUAIDI100_CUSTOMER)
        .digest('hex')
        .toUpperCase()
      const body = `schema=json&param=${encodeURIComponent(JSON.stringify(param))}&sign=${sign}`

      const response = await fetch('https://poll.kuaidi100.com/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(10000)
      })
      const data = await response.json()
      const ok = data.result === true || data.returnCode === '200'
      logger.info('[快递订阅] 快递100订阅结果', {
        shippingNo,
        companyCode,
        ok,
        message: data.message
      })
      return { subscribed: ok, provider: 'kuaidi100', message: data.message }
    } catch (err) {
      logger.warn('[快递订阅] 快递100订阅失败（非致命，不阻断发货）', {
        shippingNo,
        companyCode,
        error: err.message
      })
      return { subscribed: false, provider: 'kuaidi100', message: err.message }
    }
  }

  /**
   * 校验快递100 webhook 回调签名（防伪造推送）
   *
   * 快递100 推送约定：sign = MD5(param + salt)，salt 取 .env 的 KUAIDI100_KEY。
   * 未配置 KUAIDI100_KEY 时返回 false（拒绝未验签的推送）。
   *
   * @param {string} paramRaw - 推送报文 param 原文（未解码）
   * @param {string} sign - 推送携带的签名
   * @returns {boolean} 验签是否通过
   */
  verifyKuaidi100Signature(paramRaw, sign) {
    const salt = process.env.KUAIDI100_KEY
    if (!salt || !sign || !paramRaw) return false
    const expected = crypto
      .createHash('md5')
      .update(paramRaw + salt)
      .digest('hex')
      .toUpperCase()
    return expected === String(sign).toUpperCase()
  }

  /**
   * 将统一轨迹节点批量落库（webhook 回调驱动，物流方案一）
   *
   * 幂等：以 dedup_key（shipping_no+track_time+status）唯一约束去重，重复推送自动跳过。
   * 写操作通过外部事务收口（由调用方路由用 TransactionManager.execute 提供 transaction）。
   *
   * @param {Object} params - 落库参数
   * @param {number} params.exchange_record_id - 关联订单ID
   * @param {string} params.order_no - 订单号
   * @param {string} params.shipping_no - 快递单号
   * @param {string} params.shipping_company - 内部快递公司代码
   * @param {string} params.provider - 来源通道（kuaidi100/kdniao/manual）
   * @param {Array<Object>} params.tracks - 统一轨迹节点 [{ track_status, track_detail, track_time, raw }]
   * @param {Object} options - { transaction }（必填）
   * @returns {Promise<Object>} { inserted: number, latest_status: string|null }
   */
  async recordTracks(params, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ShippingTrackService.recordTracks')
    const { ShippingTrack } = require('../../models')
    const {
      exchange_record_id,
      order_no,
      shipping_no,
      shipping_company = null,
      provider = 'kuaidi100',
      tracks = []
    } = params

    let inserted = 0
    let latestStatus = null
    let latestTime = null

    for (const node of tracks) {
      const dedupKey = ShippingTrack.buildDedupKey(shipping_no, node.track_time, node.track_status)
      // findOrCreate 借助 dedup_key 唯一约束实现幂等去重（重复推送不重复写入）
      // eslint-disable-next-line no-await-in-loop
      const [, created] = await ShippingTrack.findOrCreate({
        where: { dedup_key: dedupKey },
        defaults: {
          exchange_record_id,
          order_no,
          shipping_no,
          shipping_company,
          track_status: node.track_status,
          track_detail: node.track_detail || null,
          track_time: node.track_time,
          provider,
          raw_data: node.raw || null,
          dedup_key: dedupKey
        },
        transaction
      })
      if (created) inserted += 1
      // 记录最新节点（按 track_time）
      const t = new Date(node.track_time).getTime()
      if (latestTime === null || t >= latestTime) {
        latestTime = t
        latestStatus = node.track_status
      }
    }

    logger.info('[快递轨迹] 轨迹落库完成', {
      order_no,
      shipping_no,
      total: tracks.length,
      inserted,
      latest_status: latestStatus
    })

    return { inserted, latest_status: latestStatus }
  }

  /**
   * 读取某订单的全量轨迹（优先读自有轨迹表，物流方案一·秒回）
   *
   * @param {number} exchange_record_id - 兑换订单ID
   * @returns {Promise<Array<Object>>} 按时间升序的轨迹节点数组
   */
  async getOrderTracks(exchange_record_id) {
    const { ShippingTrack } = require('../../models')
    const rows = await ShippingTrack.scope({ method: ['byOrder', exchange_record_id] }).findAll()
    return rows.map(r => ({
      track_status: r.track_status,
      track_detail: r.track_detail,
      track_time: r.track_time,
      provider: r.provider
    }))
  }
}

module.exports = ShippingTrackService
module.exports.SHIPPING_COMPANIES = SHIPPING_COMPANIES
