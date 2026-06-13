/**
 * 物流 Webhook 回调路由（物流方案一·拍板③）
 *
 * 路径：/api/v4/webhooks/shipping
 *
 * 职责：
 * - 接收第三方快递网关（快递100/快递鸟）主动推送的运单轨迹
 * - 验签（防伪造推送）→ 按单号定位订单 → 幂等落库轨迹（dedup_key 唯一约束）
 *   → 若推送「已签收」则驱动订单状态机 shipped→received
 *
 * 安全说明：
 * - 本路由对第三方公网开放（无 JWT），安全边界依赖「第三方签名校验」：
 *   快递100 sign = MD5(param + KUAIDI100_KEY)，验签失败直接 401。
 * - ⚠️ 真实数据依赖（需运营在 .env 配置后才能验签通过）：KUAIDI100_KEY。
 *
 * 架构规范：
 * - 路由不直连 models，写操作通过 ServiceManager 取 Service + TransactionManager.execute 事务收口
 * - 统一 res.apiSuccess / res.apiError 响应
 *
 * @module routes/v4/webhooks/shipping
 */

'use strict'

/*
 * 说明：本路由是「对第三方快递网关的回调入口」，不是面向本系统前端的 API。
 * 快递100/快递鸟要求回调必须返回其约定的回执格式 { result, returnCode, message }，
 * 否则会判定推送失败并不断重试。因此回执处用原生 res.status().json() 返回第三方约定格式
 * （已逐行 eslint-disable 标注），不能用本项目面向前端的 res.apiSuccess / res.apiError。
 */

const express = require('express')
const router = express.Router()
const { asyncHandler } = require('../../../middleware/validation')
const TransactionManager = require('../../../utils/TransactionManager')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const logger = require('../../../utils/logger').logger
const { SHIPPING_COMPANIES } = require('../../../services/shipping/constants')

/**
 * 快递100状态码 → 本系统统一轨迹状态映射
 * （与 providers/Kuaidi100Provider._mapState 同源语义，集中在轨迹落库侧归一）
 * @param {string|number} state - 快递100 state 字段
 * @returns {string} 统一轨迹状态
 */
function mapKuaidi100Status(state) {
  const map = {
    0: 'in_transit',
    1: 'picked_up',
    2: 'in_transit',
    3: 'delivered',
    4: 'returned',
    5: 'delivering',
    6: 'returned',
    14: 'exception'
  }
  return map[state] || 'in_transit'
}

/**
 * POST /api/v4/webhooks/shipping/kuaidi100
 *
 * @description 快递100「订阅推送」回调入口。验签 + 幂等落库轨迹 + 签收驱动状态机。
 * @access Public（第三方网关调用，靠签名校验保证来源可信）
 *
 * @body {string} param - 推送报文 JSON 原文（含 status/lastResult.nu/com/data[]）
 * @body {string} sign - 签名 MD5(param + KUAIDI100_KEY)
 *
 * @returns {Object} 快递100 要求的回执格式 { result: true, returnCode: '200', message: 'ok' }
 */
router.post(
  '/kuaidi100',
  asyncHandler(async (req, res) => {
    const ShippingService = req.app.locals.services.getService('shipping_track')
    const ExchangeCoreService = req.app.locals.services.getService('exchange_core')
    const ExchangeQueryService = req.app.locals.services.getService('exchange_query')

    const paramRaw = req.body?.param
    const sign = req.body?.sign

    // 1. 验签（防伪造推送；KUAIDI100_KEY 未配置或签名不符直接拒绝）
    if (!ShippingService.verifyKuaidi100Signature(paramRaw, sign)) {
      logger.warn('[物流Webhook] 快递100验签失败，拒绝推送', {
        request_id: req.id,
        has_param: !!paramRaw,
        has_sign: !!sign
      })
      // 回执非成功，快递100 会重试
      // eslint-disable-next-line no-restricted-syntax -- webhook 须返回第三方约定回执格式，非本系统前端 API
      return res
        .status(401)
        .json({ result: false, returnCode: '400', message: 'sign verify failed' })
    }

    // 2. 解析报文
    let payload
    try {
      payload = typeof paramRaw === 'string' ? JSON.parse(paramRaw) : paramRaw
    } catch {
      // eslint-disable-next-line no-restricted-syntax -- webhook 须返回第三方约定回执格式
      return res.status(200).json({ result: false, returnCode: '400', message: 'invalid param' })
    }

    const lastResult = payload.lastResult || payload
    const shipping_no = lastResult.nu
    const kuaidi100Com = lastResult.com
    const dataList = Array.isArray(lastResult.data) ? lastResult.data : []

    if (!shipping_no) {
      // eslint-disable-next-line no-restricted-syntax -- webhook 须返回第三方约定回执格式
      return res.status(200).json({ result: false, returnCode: '400', message: 'missing nu' })
    }

    // 3. 按快递单号定位订单（读操作走 QueryService）
    const order = await ExchangeQueryService.getOrderByShippingNo(shipping_no)
    if (!order) {
      logger.warn('[物流Webhook] 未找到对应订单，丢弃推送', {
        request_id: req.id,
        shipping_no
      })
      // 回执成功避免第三方无意义重试（订单确实不存在）
      // eslint-disable-next-line no-restricted-syntax -- webhook 须返回第三方约定回执格式
      return res
        .status(200)
        .json({ result: true, returnCode: '200', message: 'order not found, ignored' })
    }

    // 内部快递公司代码反查（快递100代码 → 内部 code）
    const company = SHIPPING_COMPANIES.find(c => c.kuaidi100 === kuaidi100Com)
    const shipping_company = company?.code || order.shipping_company || null

    // 统一轨迹节点（一节点一行）
    const tracks = dataList.map(item => ({
      track_status: mapKuaidi100Status(payload.state ?? lastResult.state),
      track_detail: item.context || null,
      track_time: item.ftime || item.time || BeijingTimeHelper.createDatabaseTime(),
      raw: item
    }))

    // 4. 落库 + 签收驱动（写操作事务收口）
    const result = await TransactionManager.execute(async transaction => {
      const recordResult = await ShippingService.recordTracks(
        {
          exchange_record_id: order.exchange_record_id,
          order_no: order.order_no,
          shipping_no,
          shipping_company,
          provider: 'kuaidi100',
          tracks
        },
        { transaction }
      )

      // 推送含「已签收」→ 驱动订单 shipped→received
      let receiptDriven = null
      const hasDelivered = tracks.some(t => t.track_status === 'delivered')
      if (hasDelivered) {
        receiptDriven = await ExchangeCoreService.confirmReceiptByDelivery(order.order_no, {
          transaction
        })
      }
      return { recordResult, receiptDriven }
    })

    logger.info('[物流Webhook] 快递100推送处理完成', {
      request_id: req.id,
      order_no: order.order_no,
      shipping_no,
      inserted: result.recordResult.inserted,
      receipt_driven: result.receiptDriven?.driven || false
    })

    // 快递100 要求返回成功回执
    // eslint-disable-next-line no-restricted-syntax -- webhook 须返回第三方约定回执格式
    return res.status(200).json({ result: true, returnCode: '200', message: 'ok' })
  })
)

module.exports = router
