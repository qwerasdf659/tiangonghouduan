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
    editingPricing: null,
    /** @type {Object} 定价默认值（用于定价配置表单） */
    pricingDefaults: {
      lottery_cost: 100,
      daily_lottery_limit: 10,
      points_exchange_rate: 100,
      min_withdraw_amount: 10
    }
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
     * @description 从 /api/v4/console/settings/basic 加载基础设置
     *              后端返回格式: { settings: [{ setting_key, setting_value, parsed_value, ... }, ...] }
     */
    async loadSystemConfig() {
      try {
        console.log('[SystemConfig] 开始加载配置, 调用接口:', SYSTEM_ENDPOINTS.SYSTEM_CONFIG_GET)
        const response = await this.apiGet(
          SYSTEM_ENDPOINTS.SYSTEM_CONFIG_GET,
          {},
          { showLoading: false }
        )
        console.log('[SystemConfig] API 响应:', response)
        
        if (response?.success && response.data) {
          // 后端返回 settings 数组格式，转换为键值对
          // 字段名: setting_key, setting_value (或 parsed_value)
          const settingsArray = response.data.settings || []
          console.log('[SystemConfig] settings 数组:', settingsArray)
          
          const settingsMap = {}
          settingsArray.forEach(item => {
            // 后端字段名是 setting_key 和 parsed_value/setting_value
            const key = item.setting_key || item.key
            const value = item.parsed_value !== undefined ? item.parsed_value : (item.setting_value || item.value)
            if (key) {
              settingsMap[key] = value
            }
          })

          console.log('[SystemConfig] 解析后的配置映射:', settingsMap)

          // 使用后端数据填充配置，保持默认值
          this.systemConfig = {
            site_name: settingsMap.system_name || settingsMap.site_name || '',
            contact_email: settingsMap.contact_email || settingsMap.customer_email || '',
            service_phone: settingsMap.customer_phone || settingsMap.service_phone || '',
            enable_lottery: settingsMap.enable_lottery !== false && settingsMap.enable_lottery !== 'false',
            enable_market: settingsMap.enable_market !== false && settingsMap.enable_market !== 'false',
            enable_notification: settingsMap.enable_notification !== false && settingsMap.enable_notification !== 'false',
            maintenance_mode: settingsMap.maintenance_mode === true || settingsMap.maintenance_mode === 'true',
            daily_lottery_limit: parseInt(settingsMap.daily_lottery_limit) || 10,
            lottery_cost: parseInt(settingsMap.lottery_cost) || 100,
            max_login_attempts: parseInt(settingsMap.max_login_attempts) || 5,
            session_timeout: parseInt(settingsMap.session_timeout) || 30
          }
          this.originalConfig = JSON.parse(JSON.stringify(this.systemConfig))
          this.configModified = false
          console.log('[SystemConfig] 最终 systemConfig:', this.systemConfig)
        } else {
          console.warn('[SystemConfig] API 返回失败或无数据:', response)
        }
      } catch (error) {
        console.error('[SystemConfig] 加载系统配置失败:', error)
        logger.error('加载系统配置失败:', error)
      }
    },

    /**
     * 保存系统配置
     * @description PUT /api/v4/console/settings/basic
     *              后端期望格式: { settings: { key: value, ... } }
     */
    async saveSystemConfig() {
      try {
        this.saving = true
        // 转换为后端期望的格式
        const settingsData = {
          settings: {
            system_name: this.systemConfig.site_name,
            customer_phone: this.systemConfig.service_phone,
            contact_email: this.systemConfig.contact_email,
            maintenance_mode: this.systemConfig.maintenance_mode,
            enable_lottery: this.systemConfig.enable_lottery,
            enable_market: this.systemConfig.enable_market,
            enable_notification: this.systemConfig.enable_notification,
            daily_lottery_limit: this.systemConfig.daily_lottery_limit,
            lottery_cost: this.systemConfig.lottery_cost,
            max_login_attempts: this.systemConfig.max_login_attempts,
            session_timeout: this.systemConfig.session_timeout
          }
        }

        const response = await this.apiCall(SYSTEM_ENDPOINTS.SYSTEM_CONFIG_UPDATE, {
          method: 'PUT',
          data: settingsData
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
     * @description PUT /api/v4/console/settings/basic
     *              后端期望格式: { settings: { maintenance_mode: boolean } }
     */
    async toggleMaintenanceMode() {
      const newMode = !this.systemConfig.maintenance_mode
      await this.confirmAndExecute(
        `确定${newMode ? '开启' : '关闭'}维护模式？${newMode ? '开启后用户将无法访问系统' : ''}`,
        async () => {
          const response = await this.apiCall(SYSTEM_ENDPOINTS.SYSTEM_CONFIG_MAINTENANCE, {
            method: 'PUT',
            data: { settings: { maintenance_mode: newMode } }
          })
          if (response?.success) {
            this.systemConfig.maintenance_mode = newMode
            if (this.originalConfig) {
              this.originalConfig.maintenance_mode = newMode
            }
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
          // 将配置列表转换为 pricingDefaults 对象
          this.pricingConfigs.forEach(config => {
            const key = config.config_key || config.key
            const value = config.config_value || config.value
            if (key && this.pricingDefaults.hasOwnProperty(key)) {
              this.pricingDefaults[key] = parseInt(value) || this.pricingDefaults[key]
            }
          })
        }
      } catch (error) {
        logger.error('加载定价配置失败:', error)
        this.pricingConfigs = []
      }
    },

    /**
     * 保存定价配置（批量保存）
     */
    async savePricingConfigs() {
      try {
        this.saving = true
        // 构建配置数据
        const settingsData = {
          settings: {
            lottery_cost: this.pricingDefaults.lottery_cost,
            daily_lottery_limit: this.pricingDefaults.daily_lottery_limit,
            points_exchange_rate: this.pricingDefaults.points_exchange_rate,
            min_withdraw_amount: this.pricingDefaults.min_withdraw_amount
          }
        }

        const response = await this.apiCall(SYSTEM_ENDPOINTS.SYSTEM_CONFIG_UPDATE, {
          method: 'PUT',
          data: settingsData
        })

        if (response?.success) {
          this.showSuccess('定价配置保存成功')
        }
      } catch (error) {
        this.showError('保存定价配置失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
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

