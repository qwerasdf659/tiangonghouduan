/**
 * 店员核销页面 - Alpine.js 组件
 *
 * @file admin/src/modules/operations/pages/redemption-scan.js
 * @description 商家店员扫码/输入文本码核销物品
 *   - 浏览器摄像头扫QR码（navigator.mediaDevices.getUserMedia）
 *   - 手动输入 XXXX-YYYY-ZZZZ 格式文本码
 *   - 调用后端 POST /api/v4/shop/redemption/scan (QR) 或 /fulfill (文本码)
 * @version 1.0.0
 * @date 2026-02-23
 */

import { logger } from '../../../utils/logger.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'
import { RedemptionAPI } from '../../../api/redemption.js'

function registerRedemptionScanComponents() {
  logger.info('[RedemptionScan] 注册 Alpine 组件...')

  if (typeof window.Alpine === 'undefined') {
    logger.error('[RedemptionScan] Alpine.js 未加载')
    return
  }

  Alpine.data('redemptionScan', () => ({
    ...createPageMixin(),

    // 输入模式
    mode: 'text',

    // 文本码输入
    redeem_code: '',

    // 核销状态
    processing: false,
    result: null,
    error_message: '',

    // 核销历史（本次会话）
    history: [],

    async init() {
      logger.info('[RedemptionScan] 初始化')
      if (!this.checkAuth()) return
    },

    async fulfillByTextCode() {
      const code = this.redeem_code.trim()
      if (!code) {
        Alpine.store('notification').show('请输入兑换码', 'warning')
        return
      }

      this.processing = true
      this.result = null
      this.error_message = ''

      try {
        const res = await RedemptionAPI.fulfillByCode({ redeem_code: code })

        if (res.success) {
          this.result = {
            type: 'success',
            message: '核销成功',
            data: res.data
          }
          this.history.unshift({
            code,
            status: 'success',
            time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
            data: res.data
          })
          this.redeem_code = ''
          Alpine.store('notification').show('核销成功', 'success')
        } else {
          this.result = { type: 'error', message: res.message }
          this.error_message = res.message
          this.history.unshift({
            code,
            status: 'failed',
            time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
            error: res.message
          })
          Alpine.store('notification').show(res.message || '核销失败', 'error')
        }
      } catch (error) {
        this.result = { type: 'error', message: error.message }
        this.error_message = error.message
        Alpine.store('notification').show('核销失败：' + error.message, 'error')
      } finally {
        this.processing = false
      }
    },

    async fulfillByScan(qrContent) {
      this.processing = true
      this.result = null
      this.error_message = ''

      try {
        const res = await RedemptionAPI.scanRedeem({ qr_content: qrContent })

        if (res.success) {
          this.result = {
            type: 'success',
            message: '扫码核销成功',
            data: res.data
          }
          this.history.unshift({
            code: qrContent.substring(0, 20) + '...',
            status: 'success',
            time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
            data: res.data
          })
          Alpine.store('notification').show('扫码核销成功', 'success')
        } else {
          this.result = { type: 'error', message: res.message }
          this.error_message = res.message
          Alpine.store('notification').show(res.message || '扫码核销失败', 'error')
        }
      } catch (error) {
        this.result = { type: 'error', message: error.message }
        Alpine.store('notification').show('扫码核销失败：' + error.message, 'error')
      } finally {
        this.processing = false
      }
    },

    clearResult() {
      this.result = null
      this.error_message = ''
    },

    clearHistory() {
      this.history = []
    },

    formatDate(dateStr) {
      if (!dateStr) return '-'
      return new Date(dateStr).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    }
  }))
}

document.addEventListener('alpine:init', registerRedemptionScanComponents)
