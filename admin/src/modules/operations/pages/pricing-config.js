/**
 * 定价配置（积分配置）独立页面模块
 *
 * @file admin/src/modules/operations/pages/pricing-config.js
 * @description 从 system-settings.js 分离的定价配置独立页面
 * @version 2.0.0
 * @date 2026-02-08
 */

import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { request, buildURL } from '../../../api/base.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system/index.js'

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

    // 页面状态
    saving: false,

    // ========== 积分默认值对象（供顶部表单 x-model 绑定） ==========
    pointsDefaults: {
      lottery_cost_points: 0,
      daily_lottery_limit: 0,
      sign_in_points: 0,
      initial_points: 0
    },

    // ========== 编辑中的配置项（供 Modal x-model 绑定） ==========
    editingPoints: null,

    // ========== data-table 列配置 ==========
    tableColumns: [
      { key: 'setting_key', label: '配置项', sortable: true, type: 'code' },
      {
        key: 'parsed_value',
        label: '当前值',
        sortable: true,
        render: (val, row) => {
          const value = val !== undefined && val !== null ? val : (row.setting_value || '-')
          return `<span class="font-semibold text-yellow-600">${value}</span>`
        }
      },
      { key: 'display_name', label: '显示名称' },
      {
        key: 'updated_at',
        label: '最后更新',
        render: (val) => {
          if (!val) return '-'
          try {
            return new Date(val).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
          } catch {
            return val
          }
        }
      },
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
     * data-table 数据源 - 从后端获取积分配置列表
     */
    async fetchTableData() {
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
     * 打开编辑 Modal
     * @param {Object} row - 配置项数据
     */
    editPointsConfig(row) {
      logger.debug('[PricingConfig] 编辑配置项:', row.setting_key)
      this.editingPoints = {
        setting_key: row.setting_key,
        setting_value: row.parsed_value !== undefined ? row.parsed_value : row.setting_value,
        display_name: row.display_name || row.setting_key,
        value_type: row.value_type
      }
      this.showModal('pointsModal')
    },

    /**
     * 保存单个配置项（Modal 内保存）
     */
    async savePointsConfig() {
      if (!this.editingPoints) return

      try {
        this.saving = true
        const key = this.editingPoints.setting_key
        let value = this.editingPoints.setting_value

        // 数字类型转换
        if (this.editingPoints.value_type === 'number') {
          value = parseFloat(value)
          if (isNaN(value)) {
            this.showError('请输入有效的数字')
            return
          }
        }

        logger.debug('[PricingConfig] 保存配置:', key, '=', value)

        const response = await request({
          url: buildURL(SYSTEM_ENDPOINTS.SETTING_UPDATE, { category: 'points' }),
          method: 'PUT',
          data: { settings: { [key]: value } }
        })

        if (response?.success) {
          this.showSuccess(`配置项 "${this.editingPoints.display_name}" 保存成功`)
          this.hideModal('pointsModal')
          this.editingPoints = null
          // 刷新 data-table 和顶部表单
          await this._loadPointsDefaults()
          window.dispatchEvent(new CustomEvent('dt-refresh'))
        } else {
          this.showError(response?.message || '保存失败')
        }
      } catch (error) {
        logger.error('[PricingConfig] 保存配置失败:', error)
        this.showError('保存配置失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 批量保存顶部表单中的积分配置
     */
    async savePointsConfigs() {
      try {
        this.saving = true
        const settings = { ...this.pointsDefaults }

        // 确保都是数字
        for (const key of Object.keys(settings)) {
          const val = parseFloat(settings[key])
          if (isNaN(val)) {
            this.showError(`"${key}" 必须是有效的数字`)
            return
          }
          settings[key] = val
        }

        logger.debug('[PricingConfig] 批量保存配置:', settings)

        const response = await request({
          url: buildURL(SYSTEM_ENDPOINTS.SETTING_UPDATE, { category: 'points' }),
          method: 'PUT',
          data: { settings }
        })

        if (response?.success) {
          this.showSuccess('积分配置保存成功')
          // 刷新 data-table
          window.dispatchEvent(new CustomEvent('dt-refresh'))
        } else {
          this.showError(response?.message || '保存失败')
        }
      } catch (error) {
        logger.error('[PricingConfig] 批量保存失败:', error)
        this.showError('保存配置失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 从后端加载积分配置到 pointsDefaults（供顶部表单绑定）
     * @private
     */
    async _loadPointsDefaults() {
      try {
        const response = await request({
          url: SYSTEM_ENDPOINTS.SYSTEM_CONFIG_POINTS
        })
        if (response?.success && response.data?.settings) {
          const settings = response.data.settings
          for (const item of settings) {
            if (this.pointsDefaults.hasOwnProperty(item.setting_key)) {
              this.pointsDefaults[item.setting_key] =
                item.parsed_value !== undefined ? item.parsed_value : item.setting_value
            }
          }
          logger.debug('[PricingConfig] pointsDefaults 已加载:', this.pointsDefaults)
        }
      } catch (error) {
        logger.error('[PricingConfig] 加载积分默认值失败:', error)
      }
    },

    /**
     * 初始化
     */
    async init() {
      logger.debug('[PricingConfig] 定价配置页面初始化开始')

      if (!this.checkAuth()) {
        logger.warn('[PricingConfig] 认证检查失败')
        return
      }

      // 加载顶部表单的默认值
      await this._loadPointsDefaults()

      // data-table 数据由组件自动加载
      logger.info('[PricingConfig] 页面初始化完成')
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
