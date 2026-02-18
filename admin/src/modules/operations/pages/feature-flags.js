/**
 * 功能开关独立页面模块（data-table 迁移版）
 *
 * @file admin/src/modules/operations/pages/feature-flags.js
 * @description 从 system-settings.js 分离的功能开关独立页面
 * @version 2.0.0
 * @date 2026-02-07
 *
 * data-table 迁移：
 * - 表格渲染由 data-table 组件统一处理
 * - 页面只定义 columns + dataSource + actions
 * - 分页/排序/空状态/错误状态由 data-table 内置
 */

import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { request } from '../../../api/base.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system/index.js'

// 复用 system 模块的功能开关 composables
import {
  useFeatureFlagsState,
  useFeatureFlagsMethods
} from '../../system/composables/feature-flags.js'

// 标记是否已注册，避免重复注册
let _registered = false

/**
 * 注册功能开关页面组件
 */
function registerFeatureFlagsComponents() {
  // 防止重复注册
  if (_registered) {
    logger.debug('[FeatureFlags] 组件已注册，跳过')
    return
  }

  logger.debug('[FeatureFlags] 注册 Alpine 组件...')

  if (!Alpine || typeof createPageMixin !== 'function') {
    logger.error('[FeatureFlags] 关键依赖未加载')
    return
  }

  /**
   * 功能开关页面组件
   */
  Alpine.data('featureFlags', () => ({
    // 基础混入（不需要 pagination/tableSelection，data-table 内置）
    ...createPageMixin({ pagination: false, tableSelection: false }),

    // 从 composables 导入状态和方法
    ...useFeatureFlagsState(),
    ...useFeatureFlagsMethods(),

    // 页面状态
    saving: false,

    // ========== data-table 列配置 ==========
    tableColumns: [
      { key: 'flag_key', label: '开关键名', sortable: true, type: 'code' },
      { key: 'flag_name', label: '名称', sortable: true },
      { key: 'description', label: '功能描述',
        render: (val) => val
          ? `<span class="text-gray-600 text-sm">${val.length > 40 ? val.slice(0, 40) + '...' : val}</span>`
          : '<span class="text-gray-300">-</span>'
      },
      {
        key: 'is_enabled',
        label: '状态',
        sortable: true,
        type: 'status',
        statusMap: {
          true: { class: 'green', label: '启用' },
          false: { class: 'gray', label: '禁用' }
        }
      },
      {
        key: 'rollout_strategy',
        label: '发布策略',
        type: 'badge',
        badgeMap: {
          all: 'green',
          percentage: 'blue',
          user_list: 'yellow',
          user_segment: 'purple',
          schedule: 'orange'
        },
        labelMap: {
          all: '全量发布',
          percentage: '百分比灰度',
          user_list: '用户名单',
          user_segment: '用户分群',
          schedule: '定时发布'
        }
      },
      {
        key: 'rollout_percentage',
        label: '灰度比例',
        render: (val, row) => {
          if (row.rollout_strategy === 'percentage') {
            return `<span class="font-semibold text-blue-600">${val || 100}%</span>`
          }
          return '<span class="text-gray-400">-</span>'
        }
      },
      {
        key: '_whitelist',
        label: '白名单',
        render: (_val, row) => {
          const count = Array.isArray(row.whitelist_user_ids) ? row.whitelist_user_ids.length : 0
          return count > 0
            ? `<span class="text-blue-600 font-medium">${count}人</span>`
            : '<span class="text-gray-300">0</span>'
        }
      },
      {
        key: '_actions',
        label: '操作',
        type: 'actions',
        width: '160px',
        actions: [
          {
            name: 'toggle',
            label: '切换',
            icon: '🔄',
            class: 'text-green-600 hover:text-green-800'
          },
          {
            name: 'edit',
            label: '编辑',
            icon: '✏️',
            class: 'text-blue-600 hover:text-blue-800'
          },
          {
            name: 'delete',
            label: '删除',
            icon: '🗑️',
            class: 'text-red-500 hover:text-red-700'
          }
        ]
      }
    ],

    /**
     * data-table 数据源（不依赖 this，使用闭包导入）
     * @param {Object} params - 分页/排序/筛选参数
     * @returns {Promise<{items: Array, total: number}>}
     */
    async fetchTableData(params) {
      const queryParams = new URLSearchParams()
      // 传递筛选条件
      if (params.keyword) queryParams.append('keyword', params.keyword)
      if (params.is_enabled !== undefined && params.is_enabled !== '')
        queryParams.append('is_enabled', params.is_enabled)

      const queryString = queryParams.toString()
      const url = queryString
        ? `${SYSTEM_ENDPOINTS.FEATURE_FLAG_LIST}?${queryString}`
        : SYSTEM_ENDPOINTS.FEATURE_FLAG_LIST

      const response = await request({ url })
      if (response?.success) {
        const data = response.data
        let items = []
        if (Array.isArray(data)) items = data
        else if (data?.flags) items = data.flags
        else if (data?.list) items = data.list
        return { items, total: items.length }
      }
      throw new Error(response?.message || '加载功能开关失败')
    },

    /**
     * 处理表格操作事件（由 data-table actions 列 $dispatch）
     * @param {Object} detail - { action: string, row: Object }
     */
    handleTableAction(detail) {
      const { action, row } = detail
      switch (action) {
        case 'toggle':
          this.toggleFeatureFlag(row)
          break
        case 'edit':
          this.editFeatureFlag(row)
          break
        case 'delete':
          this.deleteFeatureFlag(row)
          break
        default:
          logger.warn('[FeatureFlags] 未知操作:', action)
      }
    },

    /**
     * 覆写 composable 的 loadFeatureFlags - 刷新 data-table
     * composable 内 save/toggle/delete 成功后调用此方法
     */
    async loadFeatureFlags() {
      window.dispatchEvent(new CustomEvent('dt-refresh'))
    },

    /**
     * 初始化
     */
    init() {
      logger.debug('[FeatureFlags] 功能开关页面初始化开始')

      if (!this.checkAuth()) {
        logger.warn('[FeatureFlags] 认证检查失败')
        return
      }

      // 数据加载由 data-table 组件的 init() 自动完成
      logger.info('[FeatureFlags] 页面初始化完成（data-table 模式）')
    }
  }))

  _registered = true
  logger.info('[FeatureFlags] Alpine 组件注册完成')
}

// 直接注册（ES模块导入的Alpine已经可用）
registerFeatureFlagsComponents()

// 作为后备，也监听alpine:init事件
document.addEventListener('alpine:init', () => {
  registerFeatureFlagsComponents()
})

export { registerFeatureFlagsComponents }
export default registerFeatureFlagsComponents
