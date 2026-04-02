/**
 * 平台星石管理 - Alpine.js 组件
 *
 * 业务功能：
 * - 展示所有系统账户的星石余额概览
 * - 运营可从多个系统账户销毁星石（SYSTEM_BURN 不可逆转账）
 * - 销毁历史记录查看
 *
 * @module admin/src/modules/content/pages/platform-star-stone
 */

import { logger } from '../../../utils/logger.js'
import { request } from '../../../api/base.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system/index.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'

document.addEventListener('alpine:init', () => {
  logger.info('[PlatformStarStone] 注册 Alpine 组件...')

  Alpine.data('platformStarStone', () => ({
    ...createPageMixin(),

    /** @type {Object} 余额概览数据 */
    balance: {},
    /** @type {string} 销毁来源账户代码 */
    burn_source: 'SYSTEM_PLATFORM_FEE',
    /** @type {number|null} 销毁数量 */
    burn_amount: null,
    /** @type {string} 销毁原因 */
    burn_reason: '',
    /** @type {boolean} 是否正在执行销毁 */
    burning: false,
    /** @type {string} 操作提示消息 */
    message: '',
    /** @type {string} 消息类型 success/error */
    message_type: 'success',
    /** @type {Array} 销毁历史记录 */
    burn_history: [],
    /** @type {number} 销毁历史总条数 */
    burn_total: 0,

    async init() {
      logger.info('[PlatformStarStone] 初始化...')
      await Promise.all([this.loadBalance(), this.loadBurnHistory()])
    },

    /**
     * 加载所有系统账户星石余额
     */
    async loadBalance() {
      try {
        const res = await request({
          url: SYSTEM_ENDPOINTS.PLATFORM_STAR_STONE_BALANCE,
          method: 'GET'
        })
        if (res.success) {
          this.balance = res.data
          if (!this.burn_source && res.data.burnable_accounts?.length) {
            this.burn_source = res.data.burnable_accounts[0]
          }
        }
      } catch (error) {
        logger.error('[PlatformStarStone] 余额查询失败', error)
        this.showMessage('余额查询失败: ' + error.message, 'error')
      }
    },

    /**
     * 加载销毁历史
     */
    async loadBurnHistory() {
      try {
        const res = await request({
          url: SYSTEM_ENDPOINTS.PLATFORM_STAR_STONE_BURN_HISTORY,
          method: 'GET',
          params: { page: 1, page_size: 50 }
        })
        if (res.success) {
          this.burn_history = res.data.items || []
          this.burn_total = res.data.pagination?.total || 0
        }
      } catch (error) {
        logger.error('[PlatformStarStone] 销毁历史查询失败', error)
      }
    },

    /**
     * 获取指定系统账户的中文名称
     * @param {string} code - 系统账户代码
     * @returns {string}
     */
    getAccountLabel(code) {
      const acc = (this.balance.system_accounts || []).find(a => a.system_code === code)
      return acc?.label || code
    },

    /**
     * 获取指定系统账户的星石余额（显示用）
     * @param {string} code - 系统账户代码
     * @returns {string}
     */
    getAccountBalance(code) {
      const acc = (this.balance.system_accounts || []).find(a => a.system_code === code)
      return this.formatNumber(acc?.star_stone_balance || 0)
    },

    /**
     * 确认并执行销毁操作
     */
    async confirmBurn() {
      if (!this.burn_amount || this.burn_amount <= 0) return

      const sourceLabel = this.getAccountLabel(this.burn_source)
      const available = this.getAccountBalanceRaw(this.burn_source)
      if (this.burn_amount > available) {
        this.showMessage(
          `${sourceLabel} 余额不足：可用 ${available}，请求销毁 ${this.burn_amount}`,
          'error'
        )
        return
      }

      const confirmed = window.confirm(
        `确认从【${sourceLabel}】账户销毁 ${this.burn_amount} 星石？\n此操作不可撤回！`
      )
      if (!confirmed) return

      this.burning = true
      this.message = ''

      try {
        const res = await request({
          url: SYSTEM_ENDPOINTS.PLATFORM_STAR_STONE_BURN,
          method: 'POST',
          data: {
            amount: this.burn_amount,
            reason: this.burn_reason || '运营手动销毁',
            source_account: this.burn_source
          }
        })

        if (res.success) {
          const d = res.data
          this.showMessage(
            `销毁成功：从【${d.source_label}】销毁 ${d.burned_amount} 星石，` +
              `销毁前余额 ${d.balance_before}，销毁后余额 ${d.balance_after}`,
            'success'
          )
          this.burn_amount = null
          this.burn_reason = ''
          await Promise.all([this.loadBalance(), this.loadBurnHistory()])
        } else {
          this.showMessage('销毁失败: ' + (res.message || '未知错误'), 'error')
        }
      } catch (error) {
        logger.error('[PlatformStarStone] 销毁失败', error)
        this.showMessage('销毁失败: ' + error.message, 'error')
      } finally {
        this.burning = false
      }
    },

    /**
     * 获取指定账户原始数字余额
     * @param {string} code
     * @returns {number}
     */
    getAccountBalanceRaw(code) {
      const acc = (this.balance.system_accounts || []).find(a => a.system_code === code)
      return acc?.star_stone_balance || 0
    },

    /**
     * 格式化数字（千分位）
     * @param {number|string|null} val
     * @returns {string}
     */
    formatNumber(val) {
      if (val === null || val === undefined) return '0'
      const num = Number(val)
      if (isNaN(num)) return '0'
      return num.toLocaleString('zh-CN')
    },

    /**
     * 格式化日期时间为北京时间
     * @param {string} dateStr
     * @returns {string}
     */
    formatDateTime(dateStr) {
      if (!dateStr) return '-'
      try {
        const d = new Date(dateStr)
        return d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      } catch {
        return dateStr
      }
    },

    /**
     * 显示操作提示消息
     * @param {string} msg
     * @param {string} type
     */
    showMessage(msg, type = 'success') {
      this.message = msg
      this.message_type = type
    }
  }))

  logger.info('[PlatformStarStone] Alpine 组件注册完成')
})
