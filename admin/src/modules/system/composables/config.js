/**
 * 系统配置模块
 *
 * @file admin/src/modules/system/composables/config.js
 * @description 网站基本设置、全分类配置管理、活动下拉选择
 * @version 2.0.0
 * @date 2026-02-08
 */

import { logger } from '../../../utils/logger.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system/index.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery/index.js'
import { buildURL } from '../../../api/base.js'

/**
 * 配置分类显示名映射
 */
const CATEGORY_DISPLAY = {
  basic: { name: '基础设置', icon: '⚙️', description: '系统名称、客服信息、维护模式' },
  points: { name: '积分设置', icon: '🪙', description: '抽奖消耗、签到积分、预算比例' },
  notification: { name: '通知设置', icon: '🔔', description: '短信、邮件、APP推送开关' },
  security: { name: '安全设置', icon: '🔐', description: '登录限制、密码策略、API限流' },
  marketplace: { name: '市场设置', icon: '🏪', description: '上架数量、过期天数、价格阈值' },
  backpack: { name: '背包配置', icon: '🎒', description: '使用引导文案、物品操作规则' },
  redemption: { name: '核销设置', icon: '🎫', description: '核销码有效期、扫码规则、门店核销配置' }
}

/**
 * 需要活动下拉选择器的配置项 key 集合
 */
const CAMPAIGN_SELECT_KEYS = new Set([
  'merchant_review_campaign_id'
])

/**
 * 布尔类型配置项 key 集合
 */
const BOOLEAN_KEYS = new Set([
  'maintenance_mode',
  'sms_enabled',
  'email_enabled',
  'app_notification_enabled'
])

/**
 * 系统配置状态
 * @returns {Object} 状态对象
 */
export function useConfigState() {
  return {
    /** @type {Object} 分类显示配置 */
    categoryDisplay: CATEGORY_DISPLAY,

    /** @type {Array<string>} 所有分类 key 列表 */
    allCategories: Object.keys(CATEGORY_DISPLAY),

    /** @type {string} 当前展开的配置分类 */
    activeCategory: 'basic',

    /** @type {Object} 各分类的配置项列表 { basic: [...], points: [...], ... } */
    categorySettings: {},

    /** @type {Object} 各分类的可编辑配置值 { basic: { key: value }, ... } */
    editableSettings: {},

    /** @type {boolean} 分类配置加载中 */
    categoryLoading: false,

    /** @type {Object} 各分类配置项数量 */
    categoryCounts: {},

    /** @type {Array} 活动下拉选项列表 */
    campaignOptions: [],

    /** @type {boolean} 活动选项加载中 */
    campaignOptionsLoading: false,

    /** @type {Object} 原始配置（用于比较变更） */
    originalConfig: null,

    /** @type {boolean} 配置已修改 */
    configModified: false,

    /** @type {boolean} 保存中 */
    saving: false
  }
}

/**
 * 系统配置方法
 * @returns {Object} 方法对象
 */
export function useConfigMethods() {
  return {
    /**
     * 加载所有分类的配置概览（获取各分类配置项数量）
     */
    async loadConfigSummary() {
      try {
        logger.debug('[SystemConfig] 加载配置概览')
        const response = await this.apiGet(
          SYSTEM_ENDPOINTS.SETTING_LIST,
          {},
          { showLoading: false }
        )
        if (response?.success && response.data) {
          this.categoryCounts = response.data.categories || {}
          logger.debug('[SystemConfig] 配置概览:', this.categoryCounts)
        }
      } catch (error) {
        logger.error('[SystemConfig] 加载配置概览失败:', error)
      }
    },

    /**
     * 加载指定分类的全部配置项
     * @param {string} category - 分类标识（basic/points/notification/security/marketplace/backpack/redemption）
     */
    async loadCategoryConfig(category) {
      try {
        this.categoryLoading = true
        logger.debug('[SystemConfig] 加载分类配置:', category)

        const url = buildURL(SYSTEM_ENDPOINTS.SETTING_CATEGORY, { category })
        const response = await this.apiGet(url, {}, { showLoading: false })

        if (response?.success && response.data) {
          const settings = response.data.settings || []
          this.categorySettings[category] = settings

          // 初始化可编辑值
          const editable = {}
          settings.forEach(item => {
            const key = item.setting_key
            let value = item.parsed_value !== undefined ? item.parsed_value : item.setting_value
            // JSON 类型转为字符串展示
            if (item.value_type === 'json' && typeof value === 'object') {
              value = JSON.stringify(value, null, 2)
            }
            editable[key] = value
          })
          this.editableSettings[category] = editable

          logger.debug(`[SystemConfig] ${category} 加载完成, ${settings.length} 项配置`)
        }
      } catch (error) {
        logger.error(`[SystemConfig] 加载 ${category} 配置失败:`, error)
        this.categorySettings[category] = []
        this.editableSettings[category] = {}
      } finally {
        this.categoryLoading = false
      }
    },

    /**
     * 切换当前展开的分类（手风琴模式）
     * @param {string} category - 分类标识
     */
    async switchCategory(category) {
      if (this.activeCategory === category) {
        // 再次点击同一分类不做操作
        return
      }
      this.activeCategory = category

      // 如果该分类未加载过，则加载
      if (!this.categorySettings[category] || this.categorySettings[category].length === 0) {
        await this.loadCategoryConfig(category)
      }
    },

    /**
     * 加载活动下拉选项
     * @description 从 /api/v4/console/lottery-campaigns 获取活动列表
     */
    async loadCampaignOptions() {
      try {
        this.campaignOptionsLoading = true
        logger.debug('[SystemConfig] 加载活动选项列表')

        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.CAMPAIGN_LIST}?page_size=100`,
          {},
          { showLoading: false }
        )

        const data = response?.success ? response.data : response
        if (data) {
          const campaigns = data.campaigns || data.list || []
          this.campaignOptions = campaigns.map(c => ({
            value: c.campaign_code || String(c.lottery_campaign_id),
            label: `${c.campaign_name} (${c.campaign_code || c.lottery_campaign_id})`,
            status: c.status,
            lottery_campaign_id: c.lottery_campaign_id
          }))
          logger.debug(`[SystemConfig] 活动选项加载完成, ${this.campaignOptions.length} 个活动`)
        }
      } catch (error) {
        logger.error('[SystemConfig] 加载活动选项失败:', error)
        this.campaignOptions = []
      } finally {
        this.campaignOptionsLoading = false
      }
    },

    /**
     * 判断配置项是否需要活动下拉选择器
     * @param {string} key - 配置项 key
     * @returns {boolean}
     */
    isCampaignSelectKey(key) {
      return CAMPAIGN_SELECT_KEYS.has(key)
    },

    /**
     * 判断配置项是否为布尔类型
     * @param {Object} setting - 配置项对象
     * @returns {boolean}
     */
    isBooleanSetting(setting) {
      if (setting.value_type === 'boolean') return true
      return BOOLEAN_KEYS.has(setting.setting_key)
    },

    /**
     * 判断配置项是否为数字类型
     * @param {Object} setting - 配置项对象
     * @returns {boolean}
     */
    isNumberSetting(setting) {
      return setting.value_type === 'number'
    },

    /**
     * 判断配置项是否为 JSON 类型
     * @param {Object} setting - 配置项对象
     * @returns {boolean}
     */
    isJsonSetting(setting) {
      return setting.value_type === 'json'
    },

    /**
     * 保存指定分类的配置
     * @param {string} category - 分类标识
     */
    async saveCategoryConfig(category) {
      const editable = this.editableSettings[category]
      const settings = this.categorySettings[category]
      if (!editable || !settings) {
        this.showError('没有可保存的配置')
        return
      }

      // 构建更新数据（排除只读项）
      const settingsToUpdate = {}
      let hasError = false

      settings.forEach(setting => {
        if (setting.is_readonly) return
        const key = setting.setting_key
        let value = editable[key]

        // JSON 类型验证
        if (setting.value_type === 'json' && typeof value === 'string') {
          try {
            value = JSON.parse(value)
          } catch (_e) {
            this.showError(`配置项 ${setting.display_name || key} 的 JSON 格式无效`)
            hasError = true
            return
          }
        }

        // 布尔类型转换
        if (this.isBooleanSetting(setting)) {
          value = value === true || value === 'true'
        }

        // 数字类型转换
        if (this.isNumberSetting(setting) && typeof value === 'string') {
          value = parseFloat(value)
          if (isNaN(value)) {
            this.showError(`配置项 ${setting.display_name || key} 必须是有效数字`)
            hasError = true
            return
          }
        }

        settingsToUpdate[key] = value
      })

      if (hasError || Object.keys(settingsToUpdate).length === 0) return

      try {
        this.saving = true
        logger.debug(`[SystemConfig] 保存 ${category} 配置:`, settingsToUpdate)

        const url = buildURL(SYSTEM_ENDPOINTS.SETTING_UPDATE, { category })
        const response = await this.apiCall(url, {
          method: 'PUT',
          data: { settings: settingsToUpdate }
        })

        if (response?.success || response) {
          this.showSuccess(`${CATEGORY_DISPLAY[category]?.name || category} 配置保存成功`)
          // 重新加载该分类配置
          await this.loadCategoryConfig(category)
        }
      } catch (error) {
        logger.error(`[SystemConfig] 保存 ${category} 配置失败:`, error)
        this.showError('保存配置失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 初始化所有配置（加载默认分类 + 活动选项）
     */
    async loadSystemConfig() {
      await Promise.all([
        this.loadConfigSummary(),
        this.loadCategoryConfig('basic'),
        this.loadCampaignOptions()
      ])
    },

    /**
     * 保存系统配置（兼容旧接口）
     */
    async saveSystemConfig() {
      await this.saveCategoryConfig(this.activeCategory)
    }
  }
}

export default { useConfigState, useConfigMethods }
