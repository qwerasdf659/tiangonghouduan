/**
 * 系统配置模块
 *
 * @file admin/src/modules/system/composables/config.js
 * @description 网站基本设置、功能开关、维护模式
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system.js'
import { buildURL } from '../../../api/base.js'

/**
 * 系统配置状态
 * @returns {Object} 状态对象
 */
export function useConfigState() {
  return {
    /** @type {Object} 系统配置 */
    systemConfig: {
      site_name: '',
      contact_email: '',
      service_phone: '',
      enable_lottery: true,
      enable_market: true,
      enable_notification: true,
      maintenance_mode: false,
      daily_lottery_limit: 10,
      lottery_cost: 100,
      max_login_attempts: 5,
      session_timeout: 30
    },
    /** @type {Object} 原始配置（用于比较变更） */
    originalConfig: null,
    /** @type {boolean} 配置已修改 */
    configModified: false,
    /** @type {Array} 定价配置列表 */
    pricingConfigs: [],
    /** @type {Object} 编辑中的定价配置 */
    editingPricing: null
  }
}

/**
 * 系统配置方法
 * @returns {Object} 方法对象
 */
export function useConfigMethods() {
  return {
    /**
     * 加载系统配置
     */
    async loadSystemConfig() {
      try {
        const response = await this.apiGet(
          SYSTEM_ENDPOINTS.SYSTEM_CONFIG_GET,
          {},
          { showLoading: false }
        )
        if (response?.success && response.data) {
          this.systemConfig = {
            site_name: response.data.site_name || '',
            contact_email: response.data.contact_email || '',
            service_phone: response.data.service_phone || '',
            enable_lottery: response.data.enable_lottery !== false,
            enable_market: response.data.enable_market !== false,
            enable_notification: response.data.enable_notification !== false,
            maintenance_mode: response.data.maintenance_mode === true,
            daily_lottery_limit: response.data.daily_lottery_limit || 10,
            lottery_cost: response.data.lottery_cost || 100,
            max_login_attempts: response.data.max_login_attempts || 5,
            session_timeout: response.data.session_timeout || 30
          }
          this.originalConfig = JSON.parse(JSON.stringify(this.systemConfig))
          this.configModified = false
        }
      } catch (error) {
        logger.error('加载系统配置失败:', error)
      }
    },

    /**
     * 保存系统配置
     */
    async saveSystemConfig() {
      try {
        this.saving = true
        const response = await this.apiCall(SYSTEM_ENDPOINTS.SYSTEM_CONFIG_UPDATE, {
          method: 'PUT',
          data: this.systemConfig
        })

        if (response?.success) {
          this.showSuccess('系统配置保存成功')
          this.originalConfig = JSON.parse(JSON.stringify(this.systemConfig))
          this.configModified = false
        }
      } catch (error) {
        this.showError('保存系统配置失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 重置系统配置
     */
    resetSystemConfig() {
      if (this.originalConfig) {
        this.systemConfig = JSON.parse(JSON.stringify(this.originalConfig))
        this.configModified = false
        this.showSuccess('已恢复到上次保存的配置')
      }
    },

    /**
     * 检测配置变更
     */
    checkConfigModified() {
      if (!this.originalConfig) return
      this.configModified =
        JSON.stringify(this.systemConfig) !== JSON.stringify(this.originalConfig)
    },

    /**
     * 切换维护模式
     */
    async toggleMaintenanceMode() {
      const newMode = !this.systemConfig.maintenance_mode
      await this.confirmAndExecute(
        `确定${newMode ? '开启' : '关闭'}维护模式？${newMode ? '开启后用户将无法访问系统' : ''}`,
        async () => {
          const response = await this.apiCall(SYSTEM_ENDPOINTS.SYSTEM_CONFIG_MAINTENANCE, {
            method: 'PUT',
            data: { maintenance_mode: newMode }
          })
          if (response?.success) {
            this.systemConfig.maintenance_mode = newMode
            this.originalConfig.maintenance_mode = newMode
          }
        },
        { successMessage: `维护模式已${newMode ? '开启' : '关闭'}` }
      )
    },

    // ==================== 定价配置 ====================

    /**
     * 加载定价配置
     */
    async loadPricingConfigs() {
      try {
        const response = await this.apiGet(
          SYSTEM_ENDPOINTS.SYSTEM_CONFIG_PRICING,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.pricingConfigs = response.data?.configs || response.data?.list || []
        }
      } catch (error) {
        logger.error('加载定价配置失败:', error)
        this.pricingConfigs = []
      }
    },

    /**
     * 编辑定价配置
     * @param {Object} config - 定价配置对象
     */
    editPricingConfig(config) {
      this.editingPricing = { ...config }
      this.showModal('pricingModal')
    },

    /**
     * 保存定价配置
     */
    async savePricingConfig() {
      if (!this.editingPricing) return

      try {
        this.saving = true
        const response = await this.apiCall(
          buildURL(SYSTEM_ENDPOINTS.SYSTEM_CONFIG_UPDATE_PRICING, {
            key: this.editingPricing.config_key
          }),
          {
            method: 'PUT',
            data: { config_value: this.editingPricing.config_value }
          }
        )

        if (response?.success) {
          this.showSuccess('定价配置保存成功')
          this.hideModal('pricingModal')
          await this.loadPricingConfigs()
        }
      } catch (error) {
        this.showError('保存定价配置失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    }
  }
}

export default { useConfigState, useConfigMethods }

