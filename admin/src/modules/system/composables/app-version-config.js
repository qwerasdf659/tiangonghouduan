/**
 * 小程序版本闸门配置管理 - Composable
 *
 * @file admin/src/modules/system/composables/app-version-config.js
 * @description 版本闸门配置的状态管理和操作方法（最低/最新版本、强更开关、提示文案）
 * @version 1.0.0
 * @date 2026-06-03
 */

import { API_PREFIX } from '../../../api/base.js'
import { logger } from '../../../utils/logger.js'

/** 管理后台版本闸门配置 API 端点 */
export const APP_VERSION_CONFIG_ENDPOINT = `${API_PREFIX}/console/system/app-version-config`

/** 语义化版本号格式校验（x.y.z，与后端 SEMVER_PATTERN 一致） */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/

/**
 * 版本闸门配置 - 状态
 * @returns {Object} Alpine 响应式状态
 */
export function useAppVersionConfigState() {
  return {
    /** @type {Object|null} 完整配置数据 */
    config: null,

    /** @type {Object|null} 原始配置（用于重置/检测修改） */
    originalConfig: null,

    /** @type {boolean} 配置加载中 */
    configLoading: false,

    /** @type {boolean} 保存中 */
    saving: false,

    /** @type {boolean} 配置已修改 */
    configModified: false
  }
}

/**
 * 版本闸门配置 - 方法
 * @returns {Object} Alpine 方法集合
 */
export function useAppVersionConfigMethods() {
  return {
    /**
     * 加载版本闸门配置
     */
    async loadAppVersionConfig() {
      this.configLoading = true
      try {
        const response = await this.apiGet(APP_VERSION_CONFIG_ENDPOINT)
        if (response?.success && response.data) {
          /* latest_version 为 null 时表单用空字符串承载，保存时再归一回 null */
          this.config = {
            ...response.data,
            latest_version: response.data.latest_version ?? ''
          }
          this.originalConfig = JSON.parse(JSON.stringify(this.config))
          this.configModified = false
          logger.info('[AppVersionConfig] 配置加载成功')
        } else {
          this.showError(response?.message || '加载版本闸门配置失败')
        }
      } catch (error) {
        logger.error('[AppVersionConfig] 加载配置失败', error)
        this.showError('加载版本闸门配置失败: ' + error.message)
      } finally {
        this.configLoading = false
      }
    },

    /**
     * 保存版本闸门配置
     */
    async saveAppVersionConfig() {
      if (!this.config) return

      /* 前端先做与后端一致的轻量校验，避免无效请求 */
      const errors = this.validateConfigLocal()
      if (errors.length > 0) {
        this.showError('配置校验失败：\n' + errors.join('\n'))
        return
      }

      this.saving = true
      try {
        const response = await this.apiPut(APP_VERSION_CONFIG_ENDPOINT, this.config)
        if (response?.success) {
          this.originalConfig = JSON.parse(JSON.stringify(this.config))
          this.configModified = false
          this.showSuccess('版本闸门配置保存成功，小程序下次启动自动生效')
          logger.info('[AppVersionConfig] 配置保存成功')
        } else {
          const errorDetail = response?.data?.errors?.join('\n') || response?.message || '保存失败'
          this.showError('保存失败: ' + errorDetail)
        }
      } catch (error) {
        logger.error('[AppVersionConfig] 保存配置失败', error)
        this.showError('保存版本闸门配置失败: ' + error.message)
      } finally {
        this.saving = false
      }
    },

    /**
     * 本地校验（与后端 validateAppVersionConfig 同口径）
     * @returns {string[]} 错误信息数组（空数组表示通过）
     */
    validateConfigLocal() {
      const errors = []
      const c = this.config || {}
      if (!SEMVER_PATTERN.test(c.min_version || '')) {
        errors.push('最低可用版本必须是 x.y.z 格式（如 5.2.0）')
      }
      if (c.latest_version && !SEMVER_PATTERN.test(c.latest_version)) {
        errors.push('最新版本号为空或 x.y.z 格式（如 5.3.0）')
      }
      if (!c.update_message || c.update_message.trim() === '') {
        errors.push('更新提示文案不能为空')
      }
      return errors
    },

    /**
     * 重置配置到上次加载的值
     */
    resetAppVersionConfig() {
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
    }
  }
}
