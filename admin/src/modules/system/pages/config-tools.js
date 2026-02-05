/**
 * Config Tools Page - Alpine.js Components
 * 配置工具页面组件 (Mode A: Alpine.data() 标准模式)
 *
 * @file admin/src/modules/system/pages/config-tools.js
 * @module ConfigToolsPage
 * @version 3.0.0
 * @date 2026-01-23
 * @author Admin System
 *
 * @description
 * 系统配置工具管理页面，提供以下功能：
 * - 系统配置列表展示和管理
 * - 分类配置设置（基础设置、积分设置、通知设置、安全设置、市场设置）
 * - 功能开关控制（Feature Flags）
 * - 维护模式管理
 * - 配置项的增删改查
 *
 * @requires createDashboardMixin - 仪表板基础Mixin，提供认证、loading状态等
 * @requires SYSTEM_ENDPOINTS - 系统API端点配置对象
 * @requires apiRequest - API请求工具函数
 * @requires showLoading - 显示全局loading
 * @requires hideLoading - 隐藏全局loading
 *
 * @example
 * // HTML中使用
 * <div x-data="configToolsPage">
 *   <div x-show="!configListLoaded">加载中...</div>
 *   <template x-for="(count, category) in categoryCounts">
 *     <div @click="loadCategorySettings(category)">...</div>
 *   </template>
 * </div>
 */

import { logger } from '../../../utils/logger.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system/index.js'
import { buildURL, request } from '../../../api/base.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'

// API请求封装
const apiRequest = async (url, options = {}) => {
  return await request({ url, ...options })
}

// 全局loading函数
const showLoading = () => {
  if (typeof Alpine !== 'undefined' && Alpine.store && Alpine.store('loading')) {
    Alpine.store('loading').show()
  }
}
const hideLoading = () => {
  if (typeof Alpine !== 'undefined' && Alpine.store && Alpine.store('loading')) {
    Alpine.store('loading').hide()
  }
}

document.addEventListener('alpine:init', () => {
  // 使用 createPageMixin 获取标准功能（包含 modal 支持）
  const baseMixin =
    typeof createPageMixin === 'function'
      ? createPageMixin({ modal: true, asyncData: true, authGuard: true })
      : {}

  /**
   * 配置工具页面Alpine.js组件
   * @component configToolsPage
   * @description 系统配置管理的主组件，包含配置列表、分类设置、功能开关等功能
   * @mixes createDashboardMixin
   *
   * @property {boolean} configListLoaded - 配置列表是否已加载
   * @property {Object.<string, number>} categoryCounts - 各分类配置项数量
   * @property {string|null} currentCategory - 当前选中的配置分类
   * @property {Array<Object>} categorySettings - 当前分类的配置项列表
   * @property {boolean} settingsLoading - 配置设置是否正在加载
   * @property {Object.<string, any>} editableSettings - 可编辑的配置项值映射
   * @property {Object.<string, Object>} categoryDisplayMap - 分类显示配置映射
   * @property {Array<Object>} featureFlags - 功能开关列表
   * @property {Object} maintenanceForm - 维护模式表单数据
   * @property {Object} newConfig - 新建配置项表单数据
   */
  Alpine.data('configToolsPage', () => ({
    ...baseMixin,

    /** @type {boolean} 配置列表是否已加载完成 */
    configListLoaded: false,
    categoryCounts: {},
    currentCategory: null,
    categorySettings: [],
    settingsLoading: false,
    editableSettings: {},
    detailTitle: '配置详情',
    categoryDisplayMap: {
      basic: { name: '基础设置', icon: 'bi-gear', color: 'primary' },
      points: { name: '积分设置', icon: 'bi-coin', color: 'warning' },
      notification: { name: '通知设置', icon: 'bi-bell', color: 'info' },
      security: { name: '安全设置', icon: 'bi-shield-lock', color: 'danger' },
      marketplace: { name: '市场设置', icon: 'bi-shop', color: 'success' }
    },
    categoryNames: {
      basic: '基础设置',
      points: '积分设置',
      notification: '通知设置',
      security: '安全设置',
      marketplace: '市场设置'
    },
    featureFlagsLoading: false,
    featureFlags: [],
    dictionaries: [], // 数据字典列表
    logs: [], // 日志列表
    diagnosticResult: null, // 诊断结果（null 时不显示）
    featureFlagValues: {},

    // 操作状态变量（解决 Alpine Expression Error）
    recalculating: false, // 数据重算状态
    diagnosing: false, // 诊断状态
    maintenanceMode: false, // 维护模式状态

    // 字典表单
    dictForm: {
      dict_code: '',
      dict_name: '',
      dict_value: '',
      sort_order: 0,
      status: 'active'
    },
    editingDictId: null,

    maintenanceForm: {
      enabled: false,
      message: '系统正在升级维护中，预计30分钟后恢复，给您带来不便敬请谅解。',
      end_time: ''
    },
    /** @type {Object} 新建配置项的表单数据 */
    newConfig: { key: '', value: '', description: '', type: 'string' },
    /** @type {Object} 配置项编辑表单数据 */
    configForm: { key: '', value: '', description: '', type: 'string' },

    /**
     * 组件初始化方法
     * @async
     * @description 组件挂载时自动调用，加载配置列表
     * @returns {void}
     */
    init() {
      logger.info('[ConfigTools] 初始化开始')
      this.loadConfigList()
      // 异步加载其他数据
      this.initData()
    },

    /**
     * 获取分类的显示配置
     * @param {string} category - 配置分类标识符
     * @returns {Object} 分类显示配置对象
     * @returns {string} returns.name - 分类显示名称
     * @returns {string} returns.icon - 分类图标类名
     * @returns {string} returns.color - 分类颜色标识
     * @example
     * getCategoryDisplay('basic') // { name: '基础设置', icon: 'bi-gear', color: 'primary' }
     */
    getCategoryDisplay(category) {
      return (
        this.categoryDisplayMap[category] || {
          name: category,
          icon: 'bi-folder',
          color: 'secondary'
        }
      )
    },

    /**
     * 格式化配置值用于显示
     * @param {*} value - 配置项的值
     * @returns {string} 格式化后的显示字符串
     * @example
     * formatSettingValue(true)     // '是'
     * formatSettingValue(false)    // '否'
     * formatSettingValue({a: 1})   // '{"a": 1}'
     * formatSettingValue(null)     // '-'
     */
    formatSettingValue(value) {
      if (value === null || value === undefined) return '-'
      if (typeof value === 'boolean') return value ? '是' : '否'
      if (typeof value === 'object') return JSON.stringify(value, null, 2)
      return String(value)
    },

    /**
     * 加载配置列表摘要信息
     * @async
     * @description 从后端API获取各配置分类的配置项数量统计
     * @returns {Promise<void>}
     * @fires SYSTEM_ENDPOINTS.SETTING_LIST
     */
    async loadConfigList() {
      try {
        const response = await apiRequest(SYSTEM_ENDPOINTS.SETTING_LIST)
        if (response && response.success) {
          const summary = response.data || {}
          this.categoryCounts = summary.categories || {}
        }
      } catch (error) {
        logger.error('加载配置列表失败:', error)
      } finally {
        this.configListLoaded = true
      }
    },

    /**
     * 加载指定分类的配置设置
     * @async
     * @param {string} category - 配置分类标识符 (basic|points|notification|security|marketplace)
     * @description 加载指定分类的所有配置项，并初始化可编辑设置
     * @returns {Promise<void>}
     * @fires SYSTEM_ENDPOINTS.SETTING_CATEGORY
     */
    async loadCategorySettings(category) {
      this.currentCategory = category
      this.settingsLoading = true
      this.detailTitle = (this.categoryNames[category] || category) + ' 配置列表'
      this.editableSettings = {}

      try {
        const response = await apiRequest(buildURL(SYSTEM_ENDPOINTS.SETTING_CATEGORY, { category }))
        if (response && response.success) {
          const data = response.data || {}
          this.categorySettings = data.settings || []

          // Initialize editable settings
          this.categorySettings.forEach(setting => {
            if (!setting.is_readonly) {
              let value =
                setting.parsed_value !== undefined ? setting.parsed_value : setting.setting_value
              if (setting.value_type === 'json' && typeof value === 'object') {
                value = JSON.stringify(value, null, 2)
              }
              this.editableSettings[setting.setting_key] = value
            }
          })
        }
      } catch (error) {
        logger.error('加载分类配置失败:', error)
        this.categorySettings = []
      } finally {
        this.settingsLoading = false
      }
    },

    /**
     * 保存当前分类的配置设置
     * @async
     * @description 将editableSettings中的修改保存到后端，支持JSON类型验证
     * @returns {Promise<void>}
     * @throws {Error} 当JSON格式无效或保存失败时
     * @fires SYSTEM_ENDPOINTS.SETTING_UPDATE
     */
    async saveSettings() {
      const settingsToUpdate = {}
      let hasError = false

      this.categorySettings.forEach(setting => {
        if (setting.is_readonly) return

        const key = setting.setting_key
        let value = this.editableSettings[key]

        if (setting.value_type === 'json' && typeof value === 'string') {
          try {
            value = JSON.parse(value)
          } catch (e) {
            this.$toast.error(`配置项 ${key} 的JSON格式无效`)
            hasError = true
            return
          }
        }

        settingsToUpdate[key] = value
      })

      if (hasError || Object.keys(settingsToUpdate).length === 0) return

      showLoading()
      try {
        const response = await apiRequest(
          buildURL(SYSTEM_ENDPOINTS.SETTING_UPDATE, { category: this.currentCategory }),
          {
            method: 'PUT',
            data: { settings: settingsToUpdate }
          }
        )

        if (response && response.success) {
          this.$toast.success('设置保存成功')
          this.loadCategorySettings(this.currentCategory)
        } else {
          throw new Error(response?.message || '保存失败')
        }
      } catch (error) {
        this.$toast.error('保存失败：' + error.message)
      } finally {
        hideLoading()
      }
    },

    // 注意：缓存清理功能已移除，后端不支持 /api/v4/console/cache/clear
    // 可用的缓存操作请使用字典缓存刷新: /api/v4/system/dictionaries/cache/refresh

    /**
     * 显示功能开关管理模态框
     * @async
     * @description 打开功能开关模态框并加载安全设置中的布尔类型配置项
     * @returns {Promise<void>}
     * @fires SYSTEM_ENDPOINTS.SETTING_SECURITY
     */
    async showFeatureFlagsModal() {
      this.featureFlagsLoading = true
      this.featureFlags = []
      this.featureFlagValues = {}
      this.showModal('featureFlagsModal')

      try {
        const response = await apiRequest(SYSTEM_ENDPOINTS.SETTING_SECURITY)
        if (response && response.success) {
          const settings = response.data?.settings || []
          this.featureFlags = settings.filter(s => s.value_type === 'boolean')
          this.featureFlags.forEach(flag => {
            this.featureFlagValues[flag.setting_key] = flag.parsed_value || false
          })
        }
      } catch (error) {
        logger.error('加载功能开关失败:', error)
      } finally {
        this.featureFlagsLoading = false
      }
    },

    /**
     * 保存功能开关设置
     * @async
     * @description 将功能开关的开启/关闭状态保存到后端
     * @returns {Promise<void>}
     * @throws {Error} 当保存失败时
     * @fires SYSTEM_ENDPOINTS.SETTING_SECURITY
     */
    async saveFeatureFlags() {
      showLoading()
      try {
        const response = await apiRequest(SYSTEM_ENDPOINTS.SETTING_SECURITY, {
          method: 'PUT',
          data: { settings: this.featureFlagValues }
        })

        if (response && response.success) {
          this.$toast.success('功能开关保存成功')
          this.hideModal('featureFlagsModal')
        } else {
          throw new Error(response?.message || '保存失败')
        }
      } catch (error) {
        this.$toast.error('保存失败：' + error.message)
      } finally {
        hideLoading()
      }
    },

    /**
     * 显示维护模式管理模态框
     * @async
     * @description 打开维护模式模态框并加载当前维护模式设置
     * @returns {Promise<void>}
     * @fires SYSTEM_ENDPOINTS.SETTING_BASIC
     */
    async showMaintenanceModal() {
      this.showModal('maintenanceModal')

      try {
        const response = await apiRequest(SYSTEM_ENDPOINTS.SETTING_BASIC)
        if (response && response.success) {
          const settings = response.data?.settings || []
          const maintenanceEnabled = settings.find(s => s.setting_key === 'maintenance_mode')
          const maintenanceMessage = settings.find(s => s.setting_key === 'maintenance_message')
          const maintenanceEndTime = settings.find(s => s.setting_key === 'maintenance_end_time')

          this.maintenanceForm.enabled = maintenanceEnabled?.parsed_value || false
          this.maintenanceForm.message =
            maintenanceMessage?.parsed_value ||
            '系统正在升级维护中，预计30分钟后恢复，给您带来不便敬请谅解。'

          if (maintenanceEndTime?.parsed_value) {
            const endTime = new Date(maintenanceEndTime.parsed_value)
            this.maintenanceForm.end_time = endTime.toISOString().slice(0, 16)
          }
        }
      } catch (error) {
        logger.error('加载维护模式配置失败:', error)
      }
    },

    /**
     * 保存维护模式设置
     * @async
     * @description 将维护模式的启用状态、提示消息和结束时间保存到后端
     * @returns {Promise<void>}
     * @throws {Error} 当保存失败时
     * @fires SYSTEM_ENDPOINTS.SETTING_BASIC
     */
    async saveMaintenanceMode() {
      showLoading()
      try {
        const settings = {
          maintenance_mode: this.maintenanceForm.enabled,
          maintenance_message: this.maintenanceForm.message
        }

        if (this.maintenanceForm.end_time) {
          settings.maintenance_end_time = new Date(this.maintenanceForm.end_time).toISOString()
        }

        const response = await apiRequest(SYSTEM_ENDPOINTS.SETTING_BASIC, {
          method: 'PUT',
          data: { settings }
        })

        if (response && response.success) {
          this.$toast.success('维护模式设置成功')
          this.hideModal('maintenanceModal')
        } else {
          throw new Error(response?.message || '保存失败')
        }
      } catch (error) {
        this.$toast.error('保存失败：' + error.message)
      } finally {
        hideLoading()
      }
    },

    /**
     * 显示添加配置项模态框
     * @description 打开新建配置项的模态框并重置表单数据
     * @returns {void}
     */
    showAddConfigModal() {
      this.newConfig = { key: '', value: '', description: '', type: 'string' }
      this.showModal('addConfigModal')
    },

    /**
     * 添加新的配置项
     * @async
     * @description 将新配置项添加到当前选中的配置分类中，支持多种数据类型
     * @returns {Promise<void>}
     * @throws {Error} 当配置键名为空、未选择分类或保存失败时
     * @fires SYSTEM_ENDPOINTS.SETTING_UPDATE
     */
    async addConfig() {
      if (!this.newConfig.key.trim()) {
        this.$toast.warning('请输入配置键名')
        return
      }

      if (!this.currentCategory) {
        this.$toast.warning('请先从左侧选择一个配置分类')
        return
      }

      showLoading()
      try {
        let value = this.newConfig.value
        if (this.newConfig.type === 'number') {
          value = parseFloat(value)
        } else if (this.newConfig.type === 'boolean') {
          value = value.toLowerCase() === 'true'
        } else if (this.newConfig.type === 'json') {
          value = JSON.parse(value)
        }

        const settingsToUpdate = { [this.newConfig.key]: value }
        const response = await apiRequest(
          buildURL(SYSTEM_ENDPOINTS.SETTING_UPDATE, { category: this.currentCategory }),
          {
            method: 'PUT',
            data: { settings: settingsToUpdate }
          }
        )

        if (response && response.success) {
          this.showSuccess('配置添加成功')
          this.hideModal('addConfigModal')
          this.loadCategorySettings(this.currentCategory)
          this.loadConfigList()
        } else {
          throw new Error(response?.message || '添加失败')
        }
      } catch (error) {
        this.showError('添加失败：' + error.message)
      } finally {
        hideLoading()
      }
    },

    // ==================== 新增方法（解决 Alpine Expression Error）====================

    /**
     * 数据统计重算
     * @async
     */
    async recalculateStats() {
      if (this.recalculating) return

      this.recalculating = true
      try {
        // 使用仪表盘 API 刷新统计数据
        const response = await apiRequest(SYSTEM_ENDPOINTS.DASHBOARD)
        if (response && response.success) {
          this.showSuccess('数据统计重算完成')
          logger.info('[ConfigTools] 数据统计重算成功', response.data)
        } else {
          throw new Error(response?.message || '重算失败')
        }
      } catch (error) {
        this.showError('数据重算失败：' + error.message)
        logger.error('[ConfigTools] 数据统计重算失败:', error)
      } finally {
        this.recalculating = false
      }
    },

    /**
     * 系统诊断
     * @async
     */
    async runDiagnostics() {
      if (this.diagnosing) return

      this.diagnosing = true
      this.diagnosticResult = null

      try {
        // 使用健康检查 API 进行系统诊断
        const response = await apiRequest(SYSTEM_ENDPOINTS.HEALTH)

        if (response) {
          // 构建诊断结果对象
          this.diagnosticResult = {
            数据库: {
              status: response.checks?.database?.status === 'connected' ? 'ok' : 'error',
              message:
                response.checks?.database?.status === 'connected'
                  ? `连接正常 (延迟: ${response.checks?.database?.latency || 0}ms)`
                  : '连接异常'
            },
            Redis缓存: {
              status: response.checks?.redis?.status === 'connected' ? 'ok' : 'error',
              message:
                response.checks?.redis?.status === 'connected' ? '连接正常' : '连接异常或未配置'
            },
            系统状态: {
              status: response.status === 'healthy' ? 'ok' : 'error',
              message: response.status === 'healthy' ? '系统运行正常' : '系统存在异常'
            },
            运行时间: {
              status: 'ok',
              message: `已运行 ${Math.floor((response.uptime || 0) / 3600)} 小时`
            }
          }

          this.showSuccess('系统诊断完成')
          logger.info('[ConfigTools] 系统诊断完成', this.diagnosticResult)
        } else {
          throw new Error('诊断响应异常')
        }
      } catch (error) {
        this.diagnosticResult = {
          诊断错误: {
            status: 'error',
            message: error.message || '诊断失败'
          }
        }
        this.showError('系统诊断失败：' + error.message)
        logger.error('[ConfigTools] 系统诊断失败:', error)
      } finally {
        this.diagnosing = false
      }
    },

    /**
     * 加载操作日志
     * @async
     */
    async loadLogs() {
      try {
        const response = await apiRequest(SYSTEM_ENDPOINTS.AUDIT_LOG_LIST + '?limit=20')
        if (response && response.success) {
          this.logs = response.data?.logs || response.data?.list || []
          logger.info('[ConfigTools] 加载日志成功', { count: this.logs.length })
        }
      } catch (error) {
        logger.error('[ConfigTools] 加载日志失败:', error)
        this.logs = []
      }
    },

    /**
     * 加载数据字典
     * @async
     */
    async loadDictionaries() {
      try {
        const response = await apiRequest(SYSTEM_ENDPOINTS.DICT_ALL)
        if (response && response.success) {
          // 合并所有字典类型并转换为统一格式
          const categories = response.data?.categories || []
          const rarities = response.data?.rarities || []
          const assetGroups = response.data?.asset_groups || []

          // 转换为统一格式：dict_id, dict_code, dict_name, dict_value, sort_order, status
          this.dictionaries = [
            ...categories.map((d, idx) => ({
              dict_id: `cat_${d.category_code || idx}`,
              dict_code: d.category_code || '',
              dict_name: d.display_name || '',
              dict_value: d.description || '',
              sort_order: d.sort_order || 0,
              status: 'active',
              dict_type: 'category',
              _raw: d
            })),
            ...rarities.map((d, idx) => ({
              dict_id: `rar_${d.rarity_code || idx}`,
              dict_code: d.rarity_code || '',
              dict_name: d.display_name || '',
              dict_value: d.color_hex || d.description || '',
              sort_order: d.sort_order || 0,
              status: 'active',
              dict_type: 'rarity',
              _raw: d
            })),
            ...assetGroups.map((d, idx) => ({
              dict_id: `grp_${d.group_code || idx}`,
              dict_code: d.group_code || '',
              dict_name: d.display_name || '',
              dict_value: d.description || '',
              sort_order: d.sort_order || 0,
              status: 'active',
              dict_type: 'asset_group',
              _raw: d
            }))
          ]

          logger.info('[ConfigTools] 加载数据字典成功', { count: this.dictionaries.length })
        }
      } catch (error) {
        logger.error('[ConfigTools] 加载数据字典失败:', error)
        this.dictionaries = []
      }
    },

    /**
     * 打开添加字典模态框
     */
    openAddDictModal() {
      this.dictForm = {
        dict_code: '',
        dict_name: '',
        dict_value: '',
        sort_order: 0,
        status: 'active'
      }
      this.editingDictId = null
      this.showModal('addDictModal')
    },

    /**
     * 编辑字典
     * @param {Object} dict - 字典对象
     */
    editDict(dict) {
      logger.info('[ConfigTools] 编辑字典', dict)
      this.dictForm = {
        dict_code: dict.dict_code,
        dict_name: dict.dict_name,
        dict_value: dict.dict_value,
        sort_order: dict.sort_order,
        status: dict.status,
        dict_type: dict.dict_type
      }
      this.editingDictId = dict.dict_id
      this.showModal('addDictModal')
    },

    /**
     * 删除字典
     * @param {Object} dict - 字典对象
     */
    async deleteDict(dict) {
      if (!confirm(`确定要删除字典 "${dict.dict_name}" 吗？`)) {
        return
      }

      // 使用转换后的 dict_code 字段
      const code = dict.dict_code
      if (!code) {
        this.showError('删除失败：字典代码不存在')
        return
      }

      showLoading()
      try {
        let url = ''

        // 根据 dict_type 选择 API
        if (dict.dict_type === 'category') {
          url = buildURL(SYSTEM_ENDPOINTS.DICT_CATEGORY_DELETE, { code })
        } else if (dict.dict_type === 'rarity') {
          url = buildURL(SYSTEM_ENDPOINTS.DICT_RARITY_DELETE, { code })
        } else if (dict.dict_type === 'asset_group') {
          url = buildURL(SYSTEM_ENDPOINTS.DICT_ASSET_GROUP_DELETE, { code })
        } else {
          throw new Error('未知的字典类型')
        }

        logger.info('[ConfigTools] 删除字典', { code, type: dict.dict_type, url })

        const response = await apiRequest(url, { method: 'DELETE' })
        if (response && response.success) {
          this.showSuccess(`字典 "${dict.dict_name}" 删除成功`)
          this.loadDictionaries()
        } else {
          throw new Error(response?.message || '删除失败')
        }
      } catch (error) {
        this.showError('删除失败：' + error.message)
        logger.error('[ConfigTools] 删除字典失败:', error)
      } finally {
        hideLoading()
      }
    },

    /**
     * 提交字典表单（新增或编辑）
     * @async
     */
    async submitDict() {
      if (!this.dictForm.dict_code || !this.dictForm.dict_name) {
        this.showWarning('请填写字典代码和名称')
        return
      }

      showLoading()
      try {
        const code = this.dictForm.dict_code
        const dictType = this.dictForm.dict_type || 'category'
        const isEdit = !!this.editingDictId

        // 构建请求数据
        const requestData = {
          display_name: this.dictForm.dict_name,
          description: this.dictForm.dict_value || '',
          sort_order: parseInt(this.dictForm.sort_order) || 0
        }

        let url = ''
        const method = isEdit ? 'PUT' : 'POST'

        // 根据字典类型选择 API
        if (dictType === 'category') {
          url = isEdit
            ? buildURL(SYSTEM_ENDPOINTS.DICT_CATEGORY_UPDATE, { code })
            : SYSTEM_ENDPOINTS.DICT_CATEGORY_LIST
          if (!isEdit) requestData.category_code = code
        } else if (dictType === 'rarity') {
          url = isEdit
            ? buildURL(SYSTEM_ENDPOINTS.DICT_RARITY_UPDATE, { code })
            : SYSTEM_ENDPOINTS.DICT_RARITY_LIST
          if (!isEdit) requestData.rarity_code = code
        } else if (dictType === 'asset_group') {
          url = isEdit
            ? buildURL(SYSTEM_ENDPOINTS.DICT_ASSET_GROUP_UPDATE, { code })
            : SYSTEM_ENDPOINTS.DICT_ASSET_GROUP_LIST
          if (!isEdit) requestData.group_code = code
        }

        logger.info('[ConfigTools] 提交字典', { isEdit, dictType, code, url, requestData })

        const response = await apiRequest(url, {
          method,
          data: requestData // 使用 data 而非 body，request 函数会自动 JSON.stringify
        })

        if (response && response.success) {
          this.showSuccess(isEdit ? '修改成功' : '新增成功')
          this.hideModal('addDictModal')
          this.loadDictionaries()
        } else {
          throw new Error(response?.message || '操作失败')
        }
      } catch (error) {
        this.showError('操作失败：' + error.message)
        logger.error('[ConfigTools] 提交字典失败:', error)
      } finally {
        hideLoading()
      }
    },

    /**
     * 切换维护模式
     * @async
     */
    async toggleMaintenanceMode() {
      showLoading()
      try {
        const newMode = !this.maintenanceMode
        const settings = {
          maintenance_mode: newMode,
          maintenance_message: this.maintenanceForm.message
        }

        if (this.maintenanceForm.end_time) {
          settings.maintenance_end_time = new Date(this.maintenanceForm.end_time).toISOString()
        }

        const response = await apiRequest(SYSTEM_ENDPOINTS.SETTING_BASIC, {
          method: 'PUT',
          data: { settings }
        })

        if (response && response.success) {
          this.maintenanceMode = newMode
          this.maintenanceForm.enabled = newMode
          this.showSuccess(newMode ? '维护模式已开启' : '维护模式已关闭')
          this.hideModal('maintenanceModal')
        } else {
          throw new Error(response?.message || '操作失败')
        }
      } catch (error) {
        this.showError('操作失败：' + error.message)
      } finally {
        hideLoading()
      }
    },

    /**
     * 切换功能开关
     * @param {Object} flag - 功能开关对象
     */
    async toggleFeatureFlag(flag) {
      try {
        const flagKey = flag.setting_key || flag.flag_key
        this.featureFlagValues[flagKey] = !this.featureFlagValues[flagKey]
        logger.info('[ConfigTools] 功能开关切换', {
          key: flagKey,
          value: this.featureFlagValues[flagKey]
        })
      } catch (error) {
        this.showError('切换失败：' + error.message)
      }
    },

    /**
     * 提交添加配置
     * @async
     */
    async submitAddConfig() {
      if (!this.configForm.key.trim()) {
        this.showWarning('请输入配置键名')
        return
      }

      if (!this.currentCategory) {
        this.showWarning('请先从左侧选择一个配置分类')
        return
      }

      showLoading()
      try {
        let value = this.configForm.value
        // 根据值类型进行转换
        if (value === 'true') value = true
        else if (value === 'false') value = false
        else if (!isNaN(Number(value)) && value.trim() !== '') value = Number(value)

        const settingsToUpdate = { [this.configForm.key]: value }
        const response = await apiRequest(
          buildURL(SYSTEM_ENDPOINTS.SETTING_UPDATE, { category: this.currentCategory }),
          {
            method: 'PUT',
            data: { settings: settingsToUpdate }
          }
        )

        if (response && response.success) {
          this.showSuccess('配置添加成功')
          this.hideModal('addConfigModal')
          this.loadCategorySettings(this.currentCategory)
          this.loadConfigList()
        } else {
          throw new Error(response?.message || '添加失败')
        }
      } catch (error) {
        this.showError('添加失败：' + error.message)
      } finally {
        hideLoading()
      }
    },

    /**
     * 组件初始化后加载数据
     */
    async initData() {
      await Promise.all([this.loadDictionaries(), this.loadLogs()])
    }
  }))

  logger.info('[ConfigTools] Alpine 组件已注册')
})
