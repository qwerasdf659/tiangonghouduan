/**
 * 全局氛围主题配置管理 - Composable
 *
 * @file admin/src/modules/system/composables/app-theme-config.js
 * @description 全局氛围主题配置的状态管理和操作方法
 * @version 1.0.0
 * @date 2026-03-06
 * @see docs/项目特效主题体系分析报告.md
 */

import { API_PREFIX, request } from '../../../api/base.js'
import { logger } from '../../../utils/logger.js'

/** 全局主题配置 API 端点 */
export const APP_THEME_CONFIG_ENDPOINT = `${API_PREFIX}/console/system/app-theme-config`

/**
 * 全局氛围主题配置 - 状态
 * @returns {Object} Alpine 响应式状态
 */
export function useAppThemeConfigState() {
  return {
    /** 当前选中的主题标识 */
    currentTheme: 'default',
    /** 初始加载时的主题（用于检测是否修改） */
    originalTheme: 'default',
    /** 主题元信息（后端返回，包含 label/primary_color/description） */
    themeMeta: {},
    /** 合法主题列表 */
    validThemes: [],
    /** 配置最后更新时间 */
    configUpdatedAt: null,
    /** 是否正在加载 */
    loading: false,
    /** 是否正在保存 */
    saving: false,
    /** 是否有未保存的修改 */
    configModified: false
  }
}

/**
 * 全局氛围主题配置 - 方法
 * @returns {Object} Alpine 方法集合
 */
export function useAppThemeConfigMethods() {
  return {
    /**
     * 加载当前全局主题配置
     */
    async loadAppThemeConfig() {
      this.loading = true
      try {
        const response = await request({ url: APP_THEME_CONFIG_ENDPOINT, method: 'GET' })

        if (response.success) {
          const data = response.data
          this.currentTheme = data.theme || 'default'
          this.originalTheme = data.theme || 'default'
          this.themeMeta = data.theme_meta || {}
          this.validThemes = data.valid_themes || []
          this.configUpdatedAt = data.updated_at || null
          this.configModified = false
          logger.info('全局主题配置加载成功', { theme: this.currentTheme })
        } else {
          Alpine.store('notification').show(response.message || '加载失败', 'error')
        }
      } catch (error) {
        logger.error('加载全局主题配置失败', error)
        Alpine.store('notification').show('加载全局主题配置失败', 'error')
      } finally {
        this.loading = false
      }
    },

    /**
     * 选择主题（标记为已修改但不立即保存）
     * @param {string} themeValue - 主题标识
     */
    selectTheme(themeValue) {
      this.currentTheme = themeValue
      this.configModified = this.currentTheme !== this.originalTheme
    },

    /**
     * 保存全局主题配置
     */
    async saveAppThemeConfig() {
      if (!this.configModified) return

      this.saving = true
      try {
        const response = await request({
          url: APP_THEME_CONFIG_ENDPOINT,
          method: 'PUT',
          data: { theme: this.currentTheme }
        })

        if (response.success) {
          this.originalTheme = this.currentTheme
          this.configModified = false
          Alpine.store('notification').show(response.message || '全局主题配置更新成功', 'success')
          logger.info('全局主题配置保存成功', { theme: this.currentTheme })
        } else {
          Alpine.store('notification').show(response.message || '保存失败', 'error')
        }
      } catch (error) {
        logger.error('保存全局主题配置失败', error)
        Alpine.store('notification').show('保存全局主题配置失败', 'error')
      } finally {
        this.saving = false
      }
    },

    /**
     * 重置为初始值（撤销未保存的修改）
     */
    resetAppThemeConfig() {
      this.currentTheme = this.originalTheme
      this.configModified = false
    },

    /**
     * 获取主题卡片展示数据（按固定顺序）
     * @returns {Array} 主题选项列表
     */
    getThemeCards() {
      const themeOrder = [
        'default',
        'gold_luxury',
        'purple_mystery',
        'spring_festival',
        'christmas',
        'summer'
      ]
      const backgroundMap = {
        default: '#fff8f0',
        gold_luxury: '#1a1a2e',
        purple_mystery: '#1a1a3e',
        spring_festival: '#fff5f5',
        christmas: '#f0fff0',
        summer: '#f0f8ff'
      }
      const iconMap = {
        default: '🌤️',
        gold_luxury: '✨',
        purple_mystery: '🔮',
        spring_festival: '🧨',
        christmas: '🎄',
        summer: '🏖️'
      }

      return themeOrder.map((key) => {
        const meta = this.themeMeta[key] || {}
        return {
          value: key,
          label: meta.label || key,
          primary_color: meta.primary_color || '#999',
          background_color: backgroundMap[key] || '#fff',
          description: meta.description || '',
          icon: iconMap[key] || '🎨'
        }
      })
    }
  }
}
