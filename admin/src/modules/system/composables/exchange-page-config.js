/**
 * 兑换页面配置管理 - Composable
 *
 * @file admin/src/modules/system/composables/exchange-page-config.js
 * @description 兑换页面配置的状态管理和操作方法（Tab/空间/筛选/卡片主题/运营参数）
 * @version 1.0.0
 * @date 2026-02-19
 * @see docs/exchange-config-implementation.md Section 五
 */

import { API_PREFIX } from '../../../api/base.js'
import { logger } from '../../../utils/logger.js'

/** 管理后台兑换页面配置 API 端点 */
export const EXCHANGE_PAGE_CONFIG_ENDPOINT = `${API_PREFIX}/console/system/exchange-page-config`

/** 卡片主题选项 */
const THEME_OPTIONS = [
  { value: 'A', label: 'A 毛玻璃', description: '毛玻璃风格，清新透明' },
  { value: 'B', label: 'B 电商', description: '电商风格，信息密度高' },
  { value: 'C', label: 'C 暗色', description: '暗色风格，沉浸体验' },
  { value: 'D', label: 'D 极简', description: '极简风格，突出内容' },
  { value: 'E', label: 'E 推荐', description: '推荐主题，综合最优' }
]

/** 空间布局选项 */
const LAYOUT_OPTIONS = [
  { value: 'waterfall', label: '瀑布流' },
  { value: 'grid', label: '网格' },
  { value: 'list', label: '列表' },
  { value: 'simple', label: '简洁' }
]

/** 库存显示模式选项 */
const STOCK_DISPLAY_OPTIONS = [
  { value: 'bar', label: '进度条' },
  { value: 'text', label: '文字' },
  { value: 'badge', label: '角标' }
]

/** 视图模式选项 */
const VIEW_MODE_OPTIONS = [
  { value: 'grid', label: '网格' },
  { value: 'list', label: '列表' }
]

/**
 * 兑换页面配置状态
 * @returns {Object} Alpine 响应式状态
 */
export function useExchangePageConfigState() {
  return {
    /** @type {Object|null} 完整配置数据 */
    config: null,

    /** @type {Object|null} 原始配置（用于重置） */
    originalConfig: null,

    /** @type {boolean} 配置加载中 */
    configLoading: false,

    /** @type {boolean} 保存中 */
    saving: false,

    /** @type {boolean} 配置已修改 */
    configModified: false,

    /** @type {string} 当前编辑的区块（tab/space/shop_filters/market_filters/card_display/ui） */
    activeSection: 'tabs',

    /** @type {string} 配置版本信息 */
    configVersion: '',

    /** @type {string} 配置最后更新时间 */
    configUpdatedAt: '',

    /** 选项常量 */
    themeOptions: THEME_OPTIONS,
    layoutOptions: LAYOUT_OPTIONS,
    stockDisplayOptions: STOCK_DISPLAY_OPTIONS,
    viewModeOptions: VIEW_MODE_OPTIONS,

    /** 区块导航 */
    sections: [
      { key: 'tabs', label: 'Tab 配置', icon: '📑' },
      { key: 'spaces', label: '空间配置', icon: '🌌' },
      { key: 'shop_filters', label: '商品筛选配置', icon: '🔍' },
      { key: 'market_filters', label: '交易市场筛选', icon: '💹' },
      { key: 'card_display', label: '卡片主题配置', icon: '🎨' },
      { key: 'ui', label: '运营参数', icon: '⚙️' }
    ]
  }
}

/**
 * 兑换页面配置操作方法
 * @returns {Object} Alpine 方法集合
 */
export function useExchangePageConfigMethods() {
  return {
    /**
     * 加载兑换页面配置
     */
    async loadExchangePageConfig() {
      this.configLoading = true
      try {
        const response = await this.apiGet(EXCHANGE_PAGE_CONFIG_ENDPOINT)
        if (response?.success && response.data) {
          this.config = { ...response.data }
          delete this.config.version
          delete this.config.updated_at
          this.originalConfig = JSON.parse(JSON.stringify(this.config))
          this.configVersion = response.data.version || ''
          this.configUpdatedAt = response.data.updated_at || ''
          this.configModified = false
          logger.info('[ExchangePageConfig] 配置加载成功')
        } else {
          this.showError(response?.message || '加载兑换页面配置失败')
        }
      } catch (error) {
        logger.error('[ExchangePageConfig] 加载配置失败', error)
        this.showError('加载兑换页面配置失败: ' + error.message)
      } finally {
        this.configLoading = false
      }
    },

    /**
     * 保存兑换页面配置
     */
    async saveExchangePageConfig() {
      if (!this.config) return

      this.saving = true
      try {
        const response = await this.apiPut(EXCHANGE_PAGE_CONFIG_ENDPOINT, this.config)
        if (response?.success) {
          this.originalConfig = JSON.parse(JSON.stringify(this.config))
          this.configModified = false
          this.configVersion = Date.now().toString()
          this.configUpdatedAt = new Date().toISOString()
          this.showSuccess('兑换页面配置保存成功，小程序下次打开页面自动生效')
          logger.info('[ExchangePageConfig] 配置保存成功')
        } else {
          const errorDetail = response?.data?.errors?.join('\n') || response?.message || '保存失败'
          this.showError('保存失败: ' + errorDetail)
        }
      } catch (error) {
        logger.error('[ExchangePageConfig] 保存配置失败', error)
        this.showError('保存兑换页面配置失败: ' + error.message)
      } finally {
        this.saving = false
      }
    },

    /**
     * 重置配置到上次加载的值
     */
    resetExchangePageConfig() {
      if (this.originalConfig) {
        this.config = JSON.parse(JSON.stringify(this.originalConfig))
        this.configModified = false
        this.showInfo('配置已重置')
      }
    },

    /**
     * 标记配置已修改
     */
    markConfigModified() {
      this.configModified = true
    },

    // ========== Tab 操作 ==========

    /**
     * 添加新 Tab
     */
    addTab() {
      if (!this.config?.tabs) return
      const newTab = {
        key: `tab_${Date.now()}`,
        label: '新标签页',
        icon: 'info',
        enabled: true,
        sort_order: this.config.tabs.length + 1
      }
      this.config.tabs.push(newTab)
      this.markConfigModified()
    },

    /**
     * 删除 Tab
     * @param {number} index - Tab 索引
     */
    removeTab(index) {
      if (!this.config?.tabs) return
      this.config.tabs.splice(index, 1)
      this.config.tabs.forEach((tab, i) => {
        tab.sort_order = i + 1
      })
      this.markConfigModified()
    },

    /**
     * 移动 Tab 排序
     * @param {number} index - 当前索引
     * @param {number} direction - 移动方向（-1上移，1下移）
     */
    moveTab(index, direction) {
      if (!this.config?.tabs) return
      const newIndex = index + direction
      if (newIndex < 0 || newIndex >= this.config.tabs.length) return
      const temp = this.config.tabs[index]
      this.config.tabs[index] = this.config.tabs[newIndex]
      this.config.tabs[newIndex] = temp
      this.config.tabs.forEach((tab, i) => {
        tab.sort_order = i + 1
      })
      this.markConfigModified()
    },

    // ========== 空间操作 ==========

    addSpace() {
      if (!this.config?.spaces) return
      const newSpace = {
        id: `space_${Date.now()}`,
        name: '新空间',
        subtitle: '',
        description: '',
        layout: 'grid',
        color: '#3b82f6',
        bgGradient: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)',
        locked: false,
        enabled: true,
        sort_order: this.config.spaces.length + 1
      }
      this.config.spaces.push(newSpace)
      this.markConfigModified()
    },

    removeSpace(index) {
      if (!this.config?.spaces) return
      this.config.spaces.splice(index, 1)
      this.config.spaces.forEach((s, i) => {
        s.sort_order = i + 1
      })
      this.markConfigModified()
    },

    moveSpace(index, direction) {
      if (!this.config?.spaces) return
      const newIndex = index + direction
      if (newIndex < 0 || newIndex >= this.config.spaces.length) return
      const temp = this.config.spaces[index]
      this.config.spaces[index] = this.config.spaces[newIndex]
      this.config.spaces[newIndex] = temp
      this.config.spaces.forEach((s, i) => {
        s.sort_order = i + 1
      })
      this.markConfigModified()
    },

    // ========== 筛选项操作 ==========

    /**
     * 添加筛选项
     * @param {string} filterGroup - 筛选组路径（如 'shop_filters.categories'）
     */
    addFilterOption(filterGroup) {
      const parts = filterGroup.split('.')
      let target = this.config
      for (const part of parts) {
        if (!target[part]) return
        target = target[part]
      }
      if (!Array.isArray(target)) return

      target.push({ value: '', label: '新选项' })
      this.markConfigModified()
    },

    /**
     * 删除筛选项
     * @param {string} filterGroup - 筛选组路径
     * @param {number} index - 选项索引
     */
    removeFilterOption(filterGroup, index) {
      const parts = filterGroup.split('.')
      let target = this.config
      for (const part of parts) {
        if (!target[part]) return
        target = target[part]
      }
      if (!Array.isArray(target)) return

      target.splice(index, 1)
      this.markConfigModified()
    },

    /**
     * 添加价格区间
     */
    addCostRange() {
      if (!this.config?.shop_filters?.cost_ranges) return
      this.config.shop_filters.cost_ranges.push({ label: '新区间', min: 0, max: 100 })
      this.markConfigModified()
    },

    /**
     * 删除价格区间
     * @param {number} index - 区间索引
     */
    removeCostRange(index) {
      if (!this.config?.shop_filters?.cost_ranges) return
      this.config.shop_filters.cost_ranges.splice(index, 1)
      this.markConfigModified()
    },

  }
}
