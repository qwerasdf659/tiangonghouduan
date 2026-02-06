/**
 * 定价配置（积分配置）独立页面模块
 *
 * @file admin/src/modules/operations/pages/pricing-config.js
 * @description 从 system-settings.js 分离的定价配置独立页面
 * @version 1.0.0
 * @date 2026-01-28
 */

import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { request } from '../../../api/base.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system/index.js'

// 复用 system 模块的配置 composables（包含积分配置）
import { useConfigState, useConfigMethods } from '../../system/composables/config.js'

// 标记是否已注册
let _registered = false

/**
 * 注册定价配置页面组件
 */
function registerPricingConfigComponents() {
  if (_registered) {
    logger.debug('[PricingConfig] 组件已注册，跳过')
    return
  }

  logger.debug('[PricingConfig] 注册 Alpine 组件...')

  if (!Alpine || typeof createPageMixin !== 'function') {
    logger.error('[PricingConfig] 关键依赖未加载')
    return
  }

  /**
   * 定价配置页面组件
   */
  Alpine.data('pricingConfig', () => ({
    // 基础混入（不需要 pagination/tableSelection，data-table 内置）
    ...createPageMixin({ pagination: false, tableSelection: false }),

    // 从 composables 导入状态和方法
    ...useConfigState(),
    ...useConfigMethods(),

    // 页面状态
    saving: false,

    // ========== data-table 列配置 ==========
    tableColumns: [
      { key: 'setting_key', label: '配置项', sortable: true, type: 'code' },
      {
        key: 'parsed_value',
        label: '当前值',
        sortable: true,
        render: (val, row) => {
          const value = val || row.setting_value || '-'
          return `<span class="font-semibold text-yellow-600">${value}</span>`
        }
      },
      { key: 'display_name', label: '显示名称' },
      {
        key: '_actions',
        label: '操作',
        type: 'actions',
        width: '80px',
        actions: [
          { name: 'edit', label: '编辑', icon: '✏️', class: 'text-green-500 hover:text-green-700' }
        ]
      }
    ],

    /**
     * data-table 数据源
     */
    async fetchTableData(params) {
      const response = await request({
        url: SYSTEM_ENDPOINTS.SYSTEM_CONFIG_POINTS
      })
      if (response?.success && response.data) {
        const items = response.data.settings || []
        return { items, total: items.length }
      }
      throw new Error(response?.message || '加载积分配置失败')
    },

    /**
     * 处理表格操作事件
     */
    handleTableAction(detail) {
      const { action, row } = detail
      switch (action) {
        case 'edit':
          this.editPointsConfig(row)
          break
        default:
          logger.warn('[PricingConfig] 未知操作:', action)
      }
    },

    /**
     * 覆写 composable 的 loadPointsConfigs - 刷新 data-table
     */
    async loadPointsConfigs() {
      window.dispatchEvent(new CustomEvent('dt-refresh'))
    },

    /**
     * 初始化
     */
    init() {
      logger.debug('[PricingConfig] 定价配置页面初始化开始')

      if (!this.checkAuth()) {
        logger.warn('[PricingConfig] 认证检查失败')
        return
      }

      // 数据由 data-table 自动加载
      logger.info('[PricingConfig] 页面初始化完成（data-table 模式）')
    }
  }))

  _registered = true
  logger.info('[PricingConfig] Alpine 组件注册完成')
}

// 直接注册
registerPricingConfigComponents()

// 后备注册
document.addEventListener('alpine:init', () => {
  registerPricingConfigComponents()
})

export { registerPricingConfigComponents }
export default registerPricingConfigComponents
