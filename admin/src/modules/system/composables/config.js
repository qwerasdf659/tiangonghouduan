/**
 * 系统配置模块
 *
 * @file admin/src/modules/system/composables/config.js
 * @description 网站基本设置、功能开关、维护模式
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system/index.js'
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
    /** @type {Array} 积分配置列表（原定价配置） */
    pointsConfigs: [],
    /** @type {Object} 编辑中的积分配置 */
    editingPoints: null,
    /** @type {Object} 积分配置默认值（使用后端字段名） */
    pointsDefaults: {
      lottery_cost_points: 100, // 抽奖消耗积分
      daily_lottery_limit: 10, // 每日抽奖次数限制
      sign_in_points: 10, // 签到积分
      initial_points: 0 // 新用户初始积分
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
        logger.debug('[SystemConfig] 开始加载配置, 调用接口:', SYSTEM_ENDPOINTS.SYSTEM_CONFIG_GET)
        const response = await this.apiGet(
          SYSTEM_ENDPOINTS.SYSTEM_CONFIG_GET,
          {},
          { showLoading: false }
        )
        logger.debug('[SystemConfig] API 响应:', response)

        if (response?.success && response.data) {
          // 后端返回 settings 数组格式，转换为键值对
          // 字段名: setting_key, setting_value (或 parsed_value)
          const settingsArray = response.data.settings || []
          logger.debug('[SystemConfig] settings 数组:', settingsArray)

          const settingsMap = {}
          settingsArray.forEach(item => {
            // 后端字段名是 setting_key 和 parsed_value/setting_value
            const key = item.setting_key || item.key
            const value =
              item.parsed_value !== undefined ? item.parsed_value : item.setting_value || item.value
            if (key) {
              settingsMap[key] = value
            }
          })

          logger.debug('[SystemConfig] 解析后的配置映射:', settingsMap)

          // 使用后端数据填充配置，保持默认值
          this.systemConfig = {
            site_name: settingsMap.system_name || settingsMap.site_name || '',
            contact_email: settingsMap.contact_email || settingsMap.customer_email || '',
            service_phone: settingsMap.customer_phone || settingsMap.service_phone || '',
            enable_lottery:
              settingsMap.enable_lottery !== false && settingsMap.enable_lottery !== 'false',
            enable_market:
              settingsMap.enable_market !== false && settingsMap.enable_market !== 'false',
            enable_notification:
              settingsMap.enable_notification !== false &&
              settingsMap.enable_notification !== 'false',
            maintenance_mode:
              settingsMap.maintenance_mode === true || settingsMap.maintenance_mode === 'true',
            daily_lottery_limit: parseInt(settingsMap.daily_lottery_limit) || 10,
            lottery_cost: parseInt(settingsMap.lottery_cost) || 100,
            max_login_attempts: parseInt(settingsMap.max_login_attempts) || 5,
            session_timeout: parseInt(settingsMap.session_timeout) || 30
          }
          this.originalConfig = JSON.parse(JSON.stringify(this.systemConfig))
          this.configModified = false
          logger.debug('[SystemConfig] 最终 systemConfig:', this.systemConfig)
        } else {
          logger.warn('[SystemConfig] API 返回失败或无数据:', response)
        }
      } catch (error) {
        logger.error('[SystemConfig] 加载系统配置失败:', error)
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

    // ==================== 积分配置（定价配置）====================

    /**
     * 加载积分配置（从后端 points 分类）
     * @description 后端返回格式: { settings: [{ setting_key, setting_value, parsed_value, display_name }, ...] }
     */
    async loadPointsConfigs() {
      try {
        logger.debug(
          '[SystemConfig] 开始加载积分配置, 调用接口:',
          SYSTEM_ENDPOINTS.SYSTEM_CONFIG_POINTS
        )
        const response = await this.apiGet(
          SYSTEM_ENDPOINTS.SYSTEM_CONFIG_POINTS,
          {},
          { showLoading: false }
        )
        logger.debug('[SystemConfig] 积分配置 API 响应:', response)

        if (response?.success && response.data) {
          // 后端返回 settings 数组格式
          const settingsArray = response.data.settings || []
          this.pointsConfigs = settingsArray

          // 将配置列表转换为 pointsDefaults 对象
          settingsArray.forEach(config => {
            const key = config.setting_key || config.key
            const value =
              config.parsed_value !== undefined ? config.parsed_value : config.setting_value
            if (key && this.pointsDefaults.hasOwnProperty(key)) {
              this.pointsDefaults[key] =
                typeof value === 'number' ? value : parseInt(value) || this.pointsDefaults[key]
            }
          })

          logger.debug('[SystemConfig] 解析后的积分配置:', this.pointsDefaults)
        }
      } catch (error) {
        logger.error('[SystemConfig] 加载积分配置失败:', error)
        this.pointsConfigs = []
      }
    },

    /**
     * 保存积分配置（批量保存到后端 points 分类）
     * @description PUT /api/v4/console/settings/points { settings: { key: value, ... } }
     */
    async savePointsConfigs() {
      try {
        this.saving = true
        // 构建后端期望的格式（使用后端字段名）
        const settingsData = {
          settings: {
            lottery_cost_points: this.pointsDefaults.lottery_cost_points,
            daily_lottery_limit: this.pointsDefaults.daily_lottery_limit,
            sign_in_points: this.pointsDefaults.sign_in_points,
            initial_points: this.pointsDefaults.initial_points
          }
        }

        logger.debug('[SystemConfig] 保存积分配置, 数据:', settingsData)

        const response = await this.apiCall(SYSTEM_ENDPOINTS.SYSTEM_CONFIG_UPDATE_POINTS, {
          method: 'PUT',
          data: settingsData
        })

        if (response?.success) {
          this.showSuccess('积分配置保存成功')
        }
      } catch (error) {
        this.showError('保存积分配置失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 编辑积分配置
     * @param {Object} config - 积分配置对象
     */
    editPointsConfig(config) {
      this.editingPoints = { ...config }
      this.showModal('pointsModal')
    },

    /**
     * 保存单个积分配置项
     */
    async savePointsConfig() {
      if (!this.editingPoints) return

      try {
        this.saving = true
        // 使用 points 分类端点保存单个配置
        const settingsData = {
          settings: {
            [this.editingPoints.setting_key]: this.editingPoints.setting_value
          }
        }

        const response = await this.apiCall(SYSTEM_ENDPOINTS.SYSTEM_CONFIG_UPDATE_POINTS, {
          method: 'PUT',
          data: settingsData
        })

        if (response?.success) {
          this.showSuccess('积分配置保存成功')
          this.hideModal('pointsModal')
          await this.loadPointsConfigs()
        }
      } catch (error) {
        this.showError('保存积分配置失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    }
  }
}

export default { useConfigState, useConfigMethods }
