/**
 * 物品全链路追踪页面
 *
 * @description 输入 tracking_code 或 item_id，查看物品完整生命周期
 * @module modules/asset/pages/item-lifecycle
 * @version 1.0.0
 * @date 2026-02-22
 */

import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { ASSET_ENDPOINTS } from '../../../api/asset.js'
import { request, buildURL } from '../../../api/base.js'

document.addEventListener('alpine:init', () => {
  Alpine.data('itemLifecyclePage', () => ({
    ...createPageMixin(),

    /** 搜索标识符（tracking_code 或 item_id） */
    search_identifier: '',

    /** 生命周期查询结果 */
    lifecycle_data: null,

    /** 加载状态 */
    loading: false,

    /** 是否已搜索过 */
    searched: false,

    /**
     * 页面初始化
     */
    init() {
      if (!this.checkAuth()) return
      console.log('[item-lifecycle] 页面初始化完成')
    },

    /**
     * 查询物品生命周期
     */
    async searchItem() {
      const identifier = this.search_identifier.trim()
      if (!identifier) {
        Alpine.store('notification').show('请输入追踪码或物品ID', 'warning')
        return
      }

      this.loading = true
      this.searched = true

      try {
        const url = buildURL(ASSET_ENDPOINTS.ITEM_LIFECYCLE, { identifier })
        const response = await request({ url })

        if (response.success && response.data) {
          this.lifecycle_data = response.data
        } else {
          this.lifecycle_data = null
          Alpine.store('notification').show(response.message || '物品不存在', 'error')
        }
      } catch (error) {
        this.lifecycle_data = null
        Alpine.store('notification').show(`查询失败：${error.message}`, 'error')
      } finally {
        this.loading = false
      }
    },

    /**
     * 状态中文映射
     *
     * @param {string} status - 物品状态
     * @returns {string} 中文显示
     */
    statusDisplay(status) {
      const map = {
        available: '可用',
        held: '锁定中',
        used: '已使用',
        expired: '已过期',
        destroyed: '已销毁'
      }
      return map[status] || status
    },

    /**
     * 格式化日期时间（北京时间）
     *
     * @param {string} dateStr - 日期字符串
     * @returns {string} 格式化后的日期
     */
    formatDateTime(dateStr) {
      if (!dateStr) return '-'
      try {
        const date = new Date(dateStr)
        return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      } catch {
        return dateStr
      }
    }
  }))
})
