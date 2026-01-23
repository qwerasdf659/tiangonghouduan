/**
 * System Settings Page - Alpine.js Mixin 重构版
 * 系统设置整合页面组件
 *
 * @file admin/src/modules/system/pages/system-settings.js
 * @module SystemSettingsPage
 * @version 3.1.0
 * @date 2026-01-23
 * @author Admin System
 *
 * @description
 * 系统设置整合页面，通过标签页导航整合多个子模块功能：
 * - 系统配置 (system-config): 网站基本设置、功能开关、维护模式等
 * - 字典管理 (dict-management): 数据字典的增删改查和条目管理
 * - 功能开关 (feature-flags): 功能灰度发布控制
 * - 审计日志 (audit-logs): 系统操作日志查询和详情查看
 * - 定价配置 (pricing-config): 抽奖价格、积分汇率等配置
 *
 * @requires createPageMixin - 提供分页、认证检查、加载状态、模态框管理和消息提示等通用功能
 * @requires API_ENDPOINTS - API端点配置
 * @requires API - API工具类，用于构建URL
 * @requires Alpine - Alpine.js框架
 *
 * @example
 * <!-- HTML中使用 -->
 * <div x-data="systemSettings">
 *   <!-- 导航栏 -->
 *   <nav>
 *     <template x-for="page in subPages" :key="page.id">
 *       <button @click="switchPage(page.id)" x-text="page.name"></button>
 *     </template>
 *   </nav>
 *   <!-- 内容区域 -->
 *   <div x-show="currentPage === 'system-config'">...</div>
 * </div>
 */

/**
 * @typedef {Object} SystemConfig
 * @property {string} site_name - 网站名称
 * @property {string} contact_email - 联系邮箱
 * @property {string} service_phone - 客服电话
 * @property {boolean} enable_lottery - 是否启用抽奖功能
 * @property {boolean} enable_market - 是否启用市场功能
 * @property {boolean} enable_notification - 是否启用通知功能
 * @property {boolean} maintenance_mode - 是否开启维护模式
 * @property {number} daily_lottery_limit - 每日抽奖次数限制
 * @property {number} lottery_cost - 单次抽奖消耗积分
 * @property {number} max_login_attempts - 最大登录尝试次数
 * @property {number} session_timeout - 会话超时时间（分钟）
 */

/**
 * @typedef {Object} DictItem
 * @property {string} dict_code - 字典编码
 * @property {string} dict_name - 字典名称
 * @property {string} [description] - 字典描述
 * @property {string} [status] - 字典状态 ('active'|'inactive')
 * @property {Array<Object>} [items] - 字典条目列表
 */

/**
 * @typedef {Object} AuditLog
 * @property {number} log_id - 日志ID
 * @property {number} operator_id - 操作者ID
 * @property {string} operator_name - 操作者名称
 * @property {string} action - 操作类型 ('create'|'update'|'delete'|'login'|'logout')
 * @property {string} target - 操作目标
 * @property {string} created_at - 创建时间
 * @property {Object} [details] - 操作详情
 * @property {string} [ip_address] - IP地址
 */

/**
 * @typedef {Object} PricingConfig
 * @property {string} config_key - 配置键名
 * @property {string} config_name - 配置显示名称
 * @property {number|string} config_value - 配置值
 * @property {number|string} [default_value] - 默认值
 * @property {string} [unit] - 单位（如'积分'、'%'、'元'）
 * @property {string} [description] - 配置描述
 */

/**
 * @typedef {Object} FeatureFlag
 * @property {string} flag_key - 功能开关键名
 * @property {string} [description] - 功能描述
 * @property {boolean} is_enabled - 是否启用
 * @property {string} rollout_strategy - 发布策略 ('all'|'percentage'|'whitelist'|'blacklist')
 * @property {number} rollout_percentage - 灰度百分比
 * @property {string} [created_at] - 创建时间
 * @property {string} [updated_at] - 更新时间
 */

/**
 * @typedef {Object} SubPage
 * @property {string} id - 子页面ID
 * @property {string} name - 子页面名称
 * @property {string} [title] - 子页面标题（兼容字段）
 * @property {string} icon - 子页面图标（emoji或Bootstrap Icon类名）
 */

/**
 * 注册系统设置相关的Alpine.js组件
 * @function registerSystemSettingsComponents
 * @description
 * 使用可靠的延迟加载方式注册组件，确保Alpine.js、createPageMixin、API_ENDPOINTS和API都已加载。
 * 如果依赖未就绪，会自动延迟50ms后重试。
 * @returns {void}
 */
function registerSystemSettingsComponents() {
  console.log('[SystemSettings] 注册 Alpine 组件 (Mixin v3.1)...')

  // 检查 Alpine 和 createPageMixin 是否可用
  if (typeof window.Alpine === 'undefined') {
    console.error('[SystemSettings] ❌ Alpine 未加载，延迟注册...')
    // 延迟重试
    setTimeout(registerSystemSettingsComponents, 50)
    return
  }

  if (typeof window.createPageMixin !== 'function') {
    console.error('[SystemSettings] ❌ createPageMixin 未加载，延迟注册...')
    setTimeout(registerSystemSettingsComponents, 50)
    return
  }

  if (typeof window.API_ENDPOINTS === 'undefined' || typeof window.API === 'undefined') {
    console.error('[SystemSettings] ❌ API_ENDPOINTS/API 未加载，延迟注册...')
    setTimeout(registerSystemSettingsComponents, 50)
    return
  }

  // 获取全局变量
  const Alpine = window.Alpine
  const createPageMixin = window.createPageMixin
  const API_ENDPOINTS = window.API_ENDPOINTS
  const API = window.API

  console.log('[SystemSettings] 依赖加载完成:', {
    Alpine: !!Alpine,
    createPageMixin: !!createPageMixin,
    API_ENDPOINTS: !!API_ENDPOINTS,
    API: !!API
  })

  // 全局 Store - 存储当前激活的子页面ID
  Alpine.store('systemPage', 'system-config')

  /**
   * 系统设置导航组件
   * @function systemNavigation
   * @description 提供子页面切换导航功能，与systemPageContent组件配合使用
   * @returns {Object} Alpine.js组件配置对象
   */
  Alpine.data('systemNavigation', () => ({
    ...createPageMixin(),

    /**
     * 当前激活的子页面ID
     * @type {string}
     */
    currentPage: 'system-config',

    /**
     * 子页面配置列表
     * @type {SubPage[]}
     */
    subPages: [
      { id: 'system-config', title: '系统配置', icon: 'bi-gear' },
      { id: 'dict-management', title: '字典管理', icon: 'bi-book' },
      { id: 'audit-logs', title: '审计日志', icon: 'bi-journal-text' },
      { id: 'pricing-config', title: '定价配置', icon: 'bi-currency-dollar' }
    ],

    /**
     * 初始化导航组件
     * @method init
     * @description 验证登录状态，从URL参数获取初始页面，同步到全局Store
     * @returns {void}
     */
    init() {
      console.log('✅ 系统设置导航初始化')
      if (!this.checkAuth()) return
      const urlParams = new URLSearchParams(window.location.search)
      this.currentPage = urlParams.get('page') || 'system-config'
      Alpine.store('systemPage', this.currentPage)
    },

    /**
     * 切换子页面
     * @method switchPage
     * @param {string} pageId - 目标子页面ID
     * @description 更新当前页面状态，同步到全局Store，并更新URL
     * @returns {void}
     */
    switchPage(pageId) {
      this.currentPage = pageId
      Alpine.store('systemPage', pageId)
      window.history.pushState({}, '', `?page=${pageId}`)
    }
  }))

  /**
   * 系统设置页面内容组件
   * @function systemPageContent
   * @description 根据当前激活的子页面渲染对应内容，与systemNavigation组件配合使用
   * @returns {Object} Alpine.js组件配置对象
   */
  Alpine.data('systemPageContent', () => ({
    ...createPageMixin(),

    /**
     * 系统配置（详细版）
     * @type {SystemConfig}
     */
    systemConfigs: {
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

    /**
     * 系统配置（简化版，供HTML模板直接绑定使用）
     * @type {{systemName: string, maintenanceMode: boolean}}
     */
    config: {
      systemName: '',
      maintenanceMode: false
    },

    /**
     * 字典列表
     * @type {DictItem[]}
     */
    dictList: [],

    /**
     * 字典编辑表单数据
     * @type {{dict_code: string, dict_name: string, items: Array<Object>}}
     */
    dictForm: { dict_code: '', dict_name: '', items: [] },

    /**
     * 当前编辑的字典编码（null表示新建模式）
     * @type {string|null}
     */
    editingDictCode: null,

    /**
     * 审计日志列表
     * @type {AuditLog[]}
     */
    auditLogs: [],

    /**
     * 审计日志筛选条件
     * @type {{action: string, startDate: string, endDate: string, keyword: string}}
     */
    auditFilters: { action: '', startDate: '', endDate: '', keyword: '' },

    /**
     * 审计日志分页信息
     * @type {{total: number, totalPages: number}}
     */
    auditPagination: { total: 0, totalPages: 1 },

    /**
     * 当前选中查看的审计日志
     * @type {AuditLog|null}
     */
    selectedAuditLog: null,

    /**
     * 定价配置列表
     * @type {PricingConfig[]}
     */
    pricingConfigs: [],

    /**
     * 定价配置默认值映射
     * @type {Object.<string, number|string>}
     */
    pricingDefaults: {},

    /**
     * 保存操作进行中标志
     * @type {boolean}
     */
    saving: false,

    /**
     * 获取当前激活的子页面ID
     * @returns {string}
     */
    get currentPage() {
      return Alpine.store('systemPage')
    },

    /**
     * 初始化页面内容组件
     * @method init
     * @description 加载当前页面数据，并监听全局Store变化自动重新加载
     * @returns {void}
     */
    init() {
      console.log('✅ 系统设置内容初始化')
      this.loadPageData()
      this.$watch('$store.systemPage', () => this.loadPageData())
    },

    /**
     * 根据当前页面加载对应数据
     * @async
     * @method loadPageData
     * @description 根据currentPage值分发到对应的数据加载方法
     * @returns {Promise<void>}
     */
    async loadPageData() {
      const page = this.currentPage
      await this.withLoading(
        async () => {
          switch (page) {
            case 'system-config':
              await this.loadSystemConfigs()
              break
            case 'dict-management':
              await this.loadDictList()
              break
            case 'audit-logs':
              await this.loadAuditLogs()
              break
            case 'pricing-config':
              await this.loadPricingConfigs()
              break
          }
        },
        { loadingText: '加载数据...' }
      )
    },

    // ==================== 系统配置方法 ====================

    /**
     * 加载系统配置
     * @async
     * @method loadSystemConfigs
     * @description 从后端获取系统配置并更新本地状态
     * @returns {Promise<void>}
     */
    async loadSystemConfigs() {
      try {
        const response = await this.apiGet(API_ENDPOINTS.SETTINGS.LIST, {}, { showLoading: false })
        if (response?.success) {
          const configs = response.data?.configs || response.data || {}
          // 合并到 systemConfigs
          Object.keys(configs).forEach(key => {
            if (this.systemConfigs.hasOwnProperty(key)) {
              this.systemConfigs[key] = configs[key]
            }
          })
          // 同步到简化版 config 对象（供HTML模板使用）
          this.config.systemName = configs.site_name || this.systemConfigs.site_name || ''
          this.config.maintenanceMode =
            configs.maintenance_mode || this.systemConfigs.maintenance_mode || false
        }
      } catch (error) {
        console.error('加载系统配置失败:', error)
      }
    },

    /**
     * 保存所有系统配置
     * @async
     * @method saveAllConfigs
     * @description 将systemConfigs对象保存到后端
     * @returns {Promise<void>}
     */
    async saveAllConfigs() {
      this.saving = true
      try {
        const response = await this.apiCall(API_ENDPOINTS.SETTINGS.UPDATE, {
          method: 'PUT',
          body: JSON.stringify({ configs: this.systemConfigs })
        })
        if (response?.success) {
          this.showSuccess('系统配置保存成功')
        }
      } catch (error) {
        console.error('保存系统配置失败:', error)
        this.showError('保存失败: ' + error.message)
      } finally {
        this.saving = false
      }
    },

    /**
     * 保存简化版配置（供HTML模板按钮调用）
     * @async
     * @method saveConfig
     * @description 同步config对象到systemConfigs后调用saveAllConfigs
     * @returns {Promise<void>}
     */
    async saveConfig() {
      // 同步 config 到 systemConfigs
      this.systemConfigs.site_name = this.config.systemName
      this.systemConfigs.maintenance_mode = this.config.maintenanceMode
      // 调用完整保存
      await this.saveAllConfigs()
    },

    // ==================== 字典管理方法 ====================

    /**
     * 加载字典列表
     * @async
     * @method loadDictList
     * @description 从后端获取所有字典分类
     * @returns {Promise<void>}
     */
    async loadDictList() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.DICT.CATEGORIES,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.dictList = response.data?.dicts || response.data?.list || []
        }
      } catch (error) {
        console.error('加载字典失败:', error)
        this.dictList = []
      }
    },

    /**
     * 打开创建字典模态框
     * @method openCreateDictModal
     * @description 重置表单并显示字典创建模态框
     * @returns {void}
     */
    openCreateDictModal() {
      this.editingDictCode = null
      this.dictForm = { dict_code: '', dict_name: '', items: [] }
      this.showModal('dictModal')
    },

    /**
     * 编辑字典
     * @method editDict
     * @param {DictItem} dict - 要编辑的字典对象
     * @description 填充表单数据并显示编辑模态框
     * @returns {void}
     */
    editDict(dict) {
      this.editingDictCode = dict.dict_code
      this.dictForm = {
        dict_code: dict.dict_code,
        dict_name: dict.dict_name,
        items: dict.items ? [...dict.items] : []
      }
      this.showModal('dictModal')
    },

    /**
     * 删除字典
     * @async
     * @method deleteDict
     * @param {DictItem} dict - 要删除的字典对象
     * @description 确认后删除指定字典
     * @returns {Promise<void>}
     */
    async deleteDict(dict) {
      await this.confirmAndExecute(
        `确认删除字典「${dict.dict_name}」？`,
        async () => {
          const response = await this.apiCall(
            API.buildURL(API_ENDPOINTS.DICT.DELETE_CATEGORY, { code: dict.dict_code }),
            { method: 'DELETE' }
          )
          if (response?.success) this.loadDictList()
        },
        { successMessage: '字典已删除' }
      )
    },

    /**
     * 管理字典条目
     * @method manageDictItems
     * @param {DictItem} dict - 要管理条目的字典对象
     * @description 打开字典条目管理模态框
     * @returns {void}
     */
    manageDictItems(dict) {
      this.editingDictCode = dict.dict_code
      this.dictForm = {
        dict_code: dict.dict_code,
        dict_name: dict.dict_name,
        items: dict.items ? [...dict.items] : []
      }
      this.showModal('dictItemsModal')
    },

    /**
     * 保存字典
     * @async
     * @method saveDict
     * @description 验证表单后创建或更新字典
     * @returns {Promise<void>}
     */
    async saveDict() {
      if (!this.dictForm.dict_code.trim() || !this.dictForm.dict_name.trim()) {
        this.showError('请填写字典编码和名称')
        return
      }

      this.saving = true
      try {
        const payload = {
          dict_code: this.dictForm.dict_code.trim(),
          dict_name: this.dictForm.dict_name.trim(),
          items: this.dictForm.items
        }

        let response
        if (this.editingDictCode) {
          response = await this.apiCall(
            API.buildURL(API_ENDPOINTS.DICT.UPDATE_CATEGORY, { code: this.editingDictCode }),
            { method: 'PUT', body: JSON.stringify(payload) }
          )
        } else {
          response = await this.apiCall(API_ENDPOINTS.DICT.CREATE_CATEGORY, {
            method: 'POST',
            body: JSON.stringify(payload)
          })
        }

        if (response?.success) {
          this.showSuccess(this.editingDictCode ? '字典更新成功' : '字典创建成功')
          this.hideModal('dictModal')
          this.loadDictList()
        }
      } catch (error) {
        console.error('保存字典失败:', error)
        this.showError('保存失败: ' + error.message)
      } finally {
        this.saving = false
      }
    },

    // ==================== 审计日志方法 ====================

    // [已废弃] 此方法由 systemSettings 组件中的同名方法替代
    // async loadAuditLogs() { ... },

    /**
     * 查看审计日志详情
     * @method viewAuditDetail
     * @param {AuditLog} log - 审计日志对象
     * @description 设置选中日志并显示详情模态框
     * @returns {void}
     */
    viewAuditDetail(log) {
      this.selectedAuditLog = log
      this.showModal('auditDetailModal')
    },

    /**
     * 切换审计日志页码
     * @method changeAuditPage
     * @param {number} newPage - 目标页码
     * @description 验证页码范围后重新加载数据
     * @returns {void}
     */
    changeAuditPage(newPage) {
      if (newPage < 1 || newPage > this.auditPagination.totalPages) return
      this.page = newPage
      this.loadAuditLogs()
    },

    /**
     * 获取审计操作类型对应的Bootstrap徽章CSS类
     * @method getAuditActionClass
     * @param {string} action - 操作类型
     * @returns {string} Bootstrap徽章CSS类名
     */
    getAuditActionClass(action) {
      const map = {
        create: 'bg-success',
        update: 'bg-info',
        delete: 'bg-danger',
        login: 'bg-primary',
        logout: 'bg-secondary'
      }
      return map[action] || 'bg-secondary'
    },

    /**
     * 获取审计操作类型的中文文本
     * @method getAuditActionText
     * @param {string} action - 操作类型
     * @returns {string} 操作类型中文文本
     */
    getAuditActionText(action) {
      const map = {
        create: '创建',
        update: '更新',
        delete: '删除',
        login: '登录',
        logout: '登出'
      }
      return map[action] || action
    },

    // ==================== 定价配置方法 ====================

    /**
     * 加载定价配置
     * @async
     * @method loadPricingConfigs
     * @description 从后端获取定价配置列表，失败时使用模拟数据
     * @returns {Promise<void>}
     */
    async loadPricingConfigs() {
      try {
        const response = await this.apiGet(API_ENDPOINTS.PRICING.LIST, {}, { showLoading: false })
        if (response?.success) {
          this.pricingConfigs = response.data?.configs || response.data?.list || []
          // 存储默认值（如果API返回）
          if (response.data?.defaults) {
            this.pricingDefaults = response.data.defaults
          } else {
            // 以当前值作为默认值备份
            this.pricingConfigs.forEach(config => {
              if (this.pricingDefaults[config.config_key] === undefined) {
                this.pricingDefaults[config.config_key] =
                  config.default_value ?? config.config_value
              }
            })
          }
        }
      } catch (error) {
        console.error('加载定价配置失败:', error)
        // 使用模拟数据
        this.pricingConfigs = [
          {
            config_key: 'lottery_price',
            config_name: '单次抽奖价格',
            config_value: 10,
            default_value: 10,
            unit: '积分',
            description: '用户每次抽奖消耗的积分数量'
          },
          {
            config_key: 'exchange_fee',
            config_name: '兑换手续费',
            config_value: 5,
            default_value: 5,
            unit: '%',
            description: '兑换商品时收取的手续费比例'
          },
          {
            config_key: 'withdraw_min',
            config_name: '最低提现金额',
            config_value: 100,
            default_value: 100,
            unit: '元',
            description: '用户提现的最低金额要求'
          }
        ]
        // 存储默认值
        this.pricingConfigs.forEach(config => {
          this.pricingDefaults[config.config_key] = config.default_value
        })
      }
    },

    /**
     * 保存定价配置
     * @async
     * @method savePricingConfigs
     * @description 将所有定价配置保存到后端
     * @returns {Promise<void>}
     */
    async savePricingConfigs() {
      this.saving = true
      try {
        const response = await this.apiCall(API_ENDPOINTS.PRICING.UPDATE, {
          method: 'PUT',
          body: JSON.stringify({ configs: this.pricingConfigs })
        })
        if (response?.success) {
          this.showSuccess('定价配置保存成功')
        }
      } catch (error) {
        console.error('保存定价配置失败:', error)
        this.showError('保存失败: ' + error.message)
      } finally {
        this.saving = false
      }
    },

    /**
     * 重置单个定价配置为默认值
     * @async
     * @method resetPricing
     * @param {PricingConfig} config - 要重置的配置对象
     * @description 确认后将指定配置重置为默认值
     * @returns {Promise<void>}
     */
    async resetPricing(config) {
      await this.confirmAndExecute(
        `确认将「${config.config_name}」重置为默认值？`,
        async () => {
          try {
            const response = await this.apiCall(
              API.buildURL(API_ENDPOINTS.PRICING.ROLLBACK, { code: config.config_key }),
              { method: 'POST' }
            )
            if (response?.success) {
              // 更新配置值为默认值
              const defaultValue =
                response.data?.default_value ?? this.pricingDefaults[config.config_key]
              if (defaultValue !== undefined) {
                config.config_value = defaultValue
              } else {
                // 如果没有返回默认值，则重新加载配置
                await this.loadPricingConfigs()
              }
              this.showSuccess(`「${config.config_name}」已重置为默认值`)
            }
          } catch (error) {
            console.error('重置定价配置失败:', error)
            this.showError('重置失败: ' + error.message)
          }
        },
        { confirmText: '确认重置', cancelText: '取消' }
      )
    },

    // ==================== 工具方法 ====================

    /**
     * 安全格式化日期时间
     * @method formatDateSafe
     * @param {string|Date|null} dateStr - 日期字符串或Date对象
     * @returns {string} 格式化后的中文日期时间字符串
     */
    formatDateSafe(dateStr) {
      if (!dateStr) return '-'
      try {
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) return dateStr
        return date.toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      } catch {
        return dateStr
      }
    }
  }))

  /**
   * 系统设置主组件（HTML直接使用的组件）
   * @function systemSettings
   * @description
   * 整合所有系统设置子模块的完整组件，支持：
   * - 系统配置管理
   * - 字典管理
   * - 功能开关管理
   * - 审计日志查看
   * - 定价配置管理
   * @returns {Object} Alpine.js组件配置对象
   */
  Alpine.data('systemSettings', () => ({
    ...createPageMixin(),

    // ==================== 导航状态 ====================

    /**
     * 当前激活的子页面ID
     * @type {string}
     */
    currentPage: 'system-config',

    /**
     * 子页面配置列表
     * @type {SubPage[]}
     */
    subPages: [
      { id: 'system-config', name: '系统配置', icon: '⚙️' },
      { id: 'dict-management', name: '字典管理', icon: '📚' },
      { id: 'feature-flags', name: '功能开关', icon: '🎚️' },
      { id: 'audit-logs', name: '审计日志', icon: '📋' },
      { id: 'pricing-config', name: '定价配置', icon: '💰' }
    ],

    // ==================== 系统配置状态 ====================

    /**
     * 系统配置数据
     * @type {SystemConfig}
     */
    systemConfigs: {
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

    // ==================== 字典管理状态 ====================

    /**
     * 字典列表
     * @type {DictItem[]}
     */
    dictList: [],

    /**
     * 字典编辑表单
     * @type {{dict_code: string, dict_name: string, items: Array<Object>}}
     */
    dictForm: { dict_code: '', dict_name: '', items: [] },

    /**
     * 当前编辑的字典编码
     * @type {string|null}
     */
    editingDictCode: null,

    // ==================== 审计日志状态 ====================

    /**
     * 审计日志列表
     * @type {AuditLog[]}
     */
    auditLogs: [],

    /**
     * 审计日志筛选条件
     * @type {{action: string, startDate: string, endDate: string, keyword: string}}
     */
    auditFilters: { action: '', startDate: '', endDate: '', keyword: '' },

    /**
     * 审计日志分页信息
     * @type {{total: number, totalPages: number}}
     */
    auditPagination: { total: 0, totalPages: 1 },

    /**
     * 审计日志当前页码
     * @type {number}
     */
    auditPage: 1,

    /**
     * 审计日志每页数量
     * @type {number}
     */
    auditPageSize: 20,

    /**
     * 当前选中的审计日志
     * @type {AuditLog|null}
     */
    selectedAuditLog: null,

    // ==================== 定价配置状态 ====================

    /**
     * 定价配置列表
     * @type {PricingConfig[]}
     */
    pricingConfigs: [],

    /**
     * 定价配置默认值映射
     * @type {Object.<string, number|string>}
     */
    pricingDefaults: {},

    // ==================== 功能开关状态 ====================

    /**
     * 功能开关列表
     * @type {FeatureFlag[]}
     */
    featureFlags: [],

    /**
     * 功能开关编辑表单
     * @type {FeatureFlag}
     */
    featureFlagForm: {
      flag_key: '',
      description: '',
      is_enabled: false,
      rollout_strategy: 'all',
      rollout_percentage: 100
    },

    /**
     * 当前编辑的功能开关键名
     * @type {string|null}
     */
    editingFlagKey: null,

    // ==================== 通用状态 ====================

    /**
     * 保存操作进行中标志
     * @type {boolean}
     */
    saving: false,

    // ==================== 生命周期方法 ====================

    /**
     * 初始化系统设置页面
     * @method init
     * @description
     * 执行以下初始化流程：
     * 1. 验证Mixin是否正确合并
     * 2. 检查用户登录状态
     * 3. 从URL参数获取初始页面（支持参数映射）
     * 4. 加载对应页面数据
     * @returns {void}
     */
    init() {
      console.log('✅ 系统设置页面初始化 (合并组件)')
      console.log('[SystemSettings] this.checkAuth:', typeof this.checkAuth)
      console.log('[SystemSettings] this.showModal:', typeof this.showModal)
      console.log('[SystemSettings] this.apiGet:', typeof this.apiGet)

      if (typeof this.checkAuth !== 'function') {
        console.error('[SystemSettings] ❌ createPageMixin 未正确合并！checkAuth 不存在')
        return
      }

      const authResult = this.checkAuth()
      console.log('[SystemSettings] checkAuth 结果:', authResult)
      if (!authResult) return

      const urlParams = new URLSearchParams(window.location.search)
      let pageParam = urlParams.get('page') || 'system-config'
      console.log('[SystemSettings] URL page 参数:', pageParam)

      // 🔧 URL 参数映射（兼容不同的参数格式）
      const pageMapping = {
        config: 'system-config',
        'config-tools': 'system-config', // 配置工具 → 系统配置
        'basic-settings': 'system-config', // 基础设置 → 系统配置
        dict: 'dict-management',
        audit: 'audit-logs',
        pricing: 'pricing-config',
        logs: 'audit-logs',
        'item-templates': 'system-config' // 物品模板 → 系统配置
      }

      // 如果参数在映射表中，使用映射值；否则检查是否为有效的子页面ID
      if (pageMapping[pageParam]) {
        pageParam = pageMapping[pageParam]
      } else if (!this.subPages.some(p => p.id === pageParam)) {
        // 如果不是有效的子页面ID，默认使用 system-config
        console.warn(`[SystemSettings] 无效的页面参数: ${pageParam}, 使用默认页面`)
        pageParam = 'system-config'
      }

      this.currentPage = pageParam
      console.log(`[SystemSettings] 当前页面: ${this.currentPage}`)
      this.loadPageData()
    },

    /**
     * 切换子页面
     * @method switchPage
     * @param {string} pageId - 目标子页面ID
     * @description 更新当前页面状态，更新URL，并加载对应数据
     * @returns {void}
     */
    switchPage(pageId) {
      this.currentPage = pageId
      window.history.pushState({}, '', `?page=${pageId}`)
      this.loadPageData()
    },

    /**
     * 根据当前页面加载对应数据
     * @async
     * @method loadPageData
     * @description 根据currentPage值分发到对应的数据加载方法
     * @returns {Promise<void>}
     */
    async loadPageData() {
      console.log('[SystemSettings] loadPageData 开始, currentPage:', this.currentPage)
      try {
        await this.withLoading(async () => {
          console.log('[SystemSettings] withLoading 内部执行')
          switch (this.currentPage) {
            case 'system-config':
              console.log('[SystemSettings] 加载系统配置...')
              await this.loadSystemConfigs()
              console.log('[SystemSettings] 系统配置加载完成')
              break
            case 'dict-management':
              await this.loadDictList()
              break
            case 'feature-flags':
              await this.loadFeatureFlags()
              break
            case 'audit-logs':
              await this.loadAuditLogs()
              break
            case 'pricing-config':
              await this.loadPricingConfigs()
              break
          }
        })
        console.log('[SystemSettings] loadPageData 完成')
      } catch (error) {
        console.error('[SystemSettings] loadPageData 错误:', error)
      }
    },

    // ==================== 系统配置方法 ====================

    /**
     * 加载系统配置
     * @async
     * @method loadSystemConfigs
     * @description 从后端获取系统配置列表并更新本地状态
     * @returns {Promise<void>}
     */
    async loadSystemConfigs() {
      try {
        // 使用 API_ENDPOINTS 统一配置
        const response = await this.apiGet(API_ENDPOINTS.SETTINGS.BASIC)
        console.log('[SystemSettings] loadSystemConfigs API响应:', response)

        if (response.success && response.data) {
          // 后端返回格式: { category: 'basic', count: n, settings: [...] }
          // 每个setting项包含: setting_key, setting_value, parsed_value, value_type
          const settings = response.data.settings || response.data

          if (Array.isArray(settings)) {
            settings.forEach(item => {
              // 🔧 修复：后端使用 setting_key 而不是 key
              const key = item.setting_key || item.key
              // 优先使用 parsed_value（已解析的值），否则使用 setting_value
              const value = item.parsed_value !== undefined ? item.parsed_value : item.setting_value

              if (key && this.systemConfigs.hasOwnProperty(key)) {
                this.systemConfigs[key] = value
                console.log(`[SystemSettings] 设置配置 ${key}:`, value)
              }
            })
          } else if (typeof settings === 'object') {
            // 如果是对象格式，直接合并
            Object.assign(this.systemConfigs, settings)
          }

          console.log('[SystemSettings] 系统配置已加载:', this.systemConfigs)
        }
      } catch (error) {
        console.error('加载系统配置失败:', error)
      }
    },

    /**
     * 保存系统配置
     * @async
     * @method saveSystemConfigs
     * @description 将systemConfigs对象中的所有配置保存到后端
     * @returns {Promise<void>}
     */
    async saveSystemConfigs() {
      try {
        this.saving = true
        // 🔧 修复：使用后端实际提供的API路径 PUT /api/v4/console/settings/basic
        // 后端期望的格式: { settings: { key1: value1, key2: value2, ... } }
        const payload = { settings: this.systemConfigs }
        console.log('[SystemSettings] 保存系统配置:', payload)

        const response = await this.apiPut(API_ENDPOINTS.SETTINGS.BASIC, payload)
        console.log('[SystemSettings] 保存响应:', response)

        if (response.success) {
          this.showSuccess('系统配置已保存')
        } else {
          this.showError(response.message || '保存失败')
        }
      } catch (error) {
        console.error('保存系统配置失败:', error)
        this.showError('保存失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    // ==================== 字典管理方法 ====================

    /**
     * 加载字典分类列表
     * @async
     * @method loadDictList
     * @description 从后端获取所有字典分类，并映射字段名到前端格式
     * @returns {Promise<void>}
     */
    async loadDictList() {
      try {
        // 使用 API_ENDPOINTS.DICTIONARY.CATEGORIES
        const response = await this.apiGet(API_ENDPOINTS.DICTIONARY.CATEGORIES)
        console.log('[SystemSettings] 字典列表API响应:', response)

        if (response.success && response.data) {
          // 后端返回格式: { list: [...], pagination: {...} }
          const dictData = response.data?.list || response.data
          this.dictList = Array.isArray(dictData)
            ? dictData.map(item => {
                // 字段映射：后端使用 category_code/display_name，前端使用 dict_code/dict_name
                const mapped = {
                  dict_code: item.category_code || item.dict_code || item.code,
                  dict_name: item.display_name || item.dict_name || item.name,
                  description: item.description || '',
                  status:
                    item.is_enabled !== undefined
                      ? item.is_enabled
                        ? 'active'
                        : 'inactive'
                      : 'active'
                }
                console.log('[SystemSettings] 映射字典项:', item, '->', mapped)
                return mapped
              })
            : []

          console.log('[SystemSettings] 字典列表已加载:', this.dictList.length, '条')
        }
      } catch (error) {
        console.error('加载字典失败:', error)
        this.dictList = []
      }
    },

    /**
     * 打开创建字典模态框
     * @method openCreateDictModal
     * @description 重置表单状态并显示字典创建模态框
     * @returns {void}
     */
    openCreateDictModal() {
      this.editingDictCode = null
      this.dictForm = { dict_code: '', dict_name: '', items: [], status: 'active' }
      this.showModal('dictModal')
    },

    /**
     * 编辑字典
     * @method editDict
     * @param {DictItem} dict - 要编辑的字典对象
     * @description 设置编辑状态并显示编辑模态框
     * @returns {void}
     */
    editDict(dict) {
      this.editingDictCode = dict.dict_code
      this.dictForm = { ...dict, status: dict.status || 'active' }
      this.showModal('dictModal')
    },

    /**
     * 管理字典条目
     * @method manageDictItems
     * @param {DictItem} dict - 要管理的字典对象
     * @description 设置当前字典并显示条目管理模态框
     * @returns {void}
     */
    manageDictItems(dict) {
      this.editingDictCode = dict.dict_code
      this.dictForm = { ...dict, items: dict.items || [] }
      this.showModal('dictItemsModal')
    },

    /**
     * 保存字典
     * @async
     * @method saveDict
     * @description 创建或更新字典，自动映射前端字段到后端格式
     * @returns {Promise<void>}
     */
    async saveDict() {
      try {
        this.saving = true
        // 🔧 使用后端实际提供的API路径：categories
        // 转换前端字段名到后端字段名
        const backendData = {
          category_code: this.dictForm.dict_code,
          display_name: this.dictForm.dict_name,
          description: this.dictForm.description || '',
          is_enabled: this.dictForm.status === 'active'
        }
        const endpoint = this.editingDictCode
          ? API.buildURL(API_ENDPOINTS.DICTIONARY.UPDATE_CATEGORY, { code: this.editingDictCode })
          : API_ENDPOINTS.DICTIONARY.CREATE_CATEGORY
        const method = this.editingDictCode ? 'apiPut' : 'apiPost'
        await this[method](endpoint, backendData)
        this.hideModal('dictModal')
        await this.loadDictList()
        this.showSuccess(this.editingDictCode ? '字典已更新' : '字典已创建')
      } catch (error) {
        this.showError('保存失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    // ==================== 功能开关管理方法 ====================

    /**
     * 加载功能开关列表
     * @async
     * @method loadFeatureFlags
     * @description 从后端获取所有功能开关配置
     * @returns {Promise<void>}
     */
    async loadFeatureFlags() {
      try {
        const response = await this.apiGet(API_ENDPOINTS.FEATURE_FLAGS.LIST)
        console.log('[SystemSettings] 功能开关API响应:', response)

        if (response.success && response.data) {
          const flagsData = response.data?.flags || response.data?.list || response.data
          this.featureFlags = Array.isArray(flagsData)
            ? flagsData.map(flag => ({
                flag_key: flag.flag_key || flag.key,
                description: flag.description || '',
                is_enabled: flag.is_enabled ?? false,
                rollout_strategy: flag.rollout_strategy || 'all',
                rollout_percentage: flag.rollout_percentage ?? 100,
                created_at: flag.created_at,
                updated_at: flag.updated_at
              }))
            : []
          console.log('[SystemSettings] 功能开关已加载:', this.featureFlags.length, '条')
        }
      } catch (error) {
        console.error('加载功能开关失败:', error)
        this.featureFlags = []
      }
    },

    /**
     * 打开创建功能开关模态框
     * @method openCreateFlagModal
     * @description 重置表单状态并显示功能开关创建模态框
     * @returns {void}
     */
    openCreateFlagModal() {
      this.editingFlagKey = null
      this.featureFlagForm = {
        flag_key: '',
        description: '',
        is_enabled: false,
        rollout_strategy: 'all',
        rollout_percentage: 100
      }
      this.showModal('featureFlagModal')
    },

    /**
     * 编辑功能开关
     * @method editFeatureFlag
     * @param {FeatureFlag} flag - 要编辑的功能开关对象
     * @description 设置编辑状态并显示编辑模态框
     * @returns {void}
     */
    editFeatureFlag(flag) {
      this.editingFlagKey = flag.flag_key
      this.featureFlagForm = {
        flag_key: flag.flag_key,
        description: flag.description || '',
        is_enabled: flag.is_enabled ?? false,
        rollout_strategy: flag.rollout_strategy || 'all',
        rollout_percentage: flag.rollout_percentage ?? 100
      }
      this.showModal('featureFlagModal')
    },

    /**
     * 保存功能开关
     * @async
     * @method saveFeatureFlag
     * @description 创建或更新功能开关配置
     * @returns {Promise<void>}
     */
    async saveFeatureFlag() {
      if (!this.featureFlagForm.flag_key?.trim()) {
        this.showError('请输入功能开关键名')
        return
      }

      try {
        this.saving = true
        const payload = {
          flag_key: this.featureFlagForm.flag_key.trim(),
          description: this.featureFlagForm.description?.trim() || '',
          is_enabled: this.featureFlagForm.is_enabled,
          rollout_strategy: this.featureFlagForm.rollout_strategy,
          rollout_percentage: parseInt(this.featureFlagForm.rollout_percentage) || 100
        }

        const endpoint = this.editingFlagKey
          ? API.buildURL(API_ENDPOINTS.FEATURE_FLAGS.UPDATE, { flag_id: this.editingFlagKey })
          : API_ENDPOINTS.FEATURE_FLAGS.LIST

        const method = this.editingFlagKey ? 'apiPut' : 'apiPost'
        await this[method](endpoint, payload)

        this.hideModal('featureFlagModal')
        await this.loadFeatureFlags()
        this.showSuccess(this.editingFlagKey ? '功能开关已更新' : '功能开关已创建')
      } catch (error) {
        console.error('保存功能开关失败:', error)
        this.showError('保存失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 切换功能开关状态
     * @async
     * @method toggleFeatureFlag
     * @param {FeatureFlag} flag - 要切换的功能开关对象
     * @description 切换功能开关的启用/禁用状态
     * @returns {Promise<void>}
     */
    async toggleFeatureFlag(flag) {
      try {
        const endpoint = API.buildURL(API_ENDPOINTS.FEATURE_FLAGS.TOGGLE, {
          flag_id: flag.flag_key
        })
        await this.apiCall(endpoint, { method: 'PATCH' })

        // 更新本地状态
        flag.is_enabled = !flag.is_enabled
        this.showSuccess(`功能开关「${flag.flag_key}」已${flag.is_enabled ? '开启' : '关闭'}`)
      } catch (error) {
        console.error('切换功能开关失败:', error)
        this.showError('操作失败: ' + (error.message || '未知错误'))
      }
    },

    /**
     * 删除功能开关
     * @async
     * @method deleteFeatureFlag
     * @param {FeatureFlag} flag - 要删除的功能开关对象
     * @description 确认后删除指定的功能开关（不可恢复）
     * @returns {Promise<void>}
     */
    async deleteFeatureFlag(flag) {
      await this.confirmAndExecute(
        `确认删除功能开关「${flag.flag_key}」？此操作不可恢复`,
        async () => {
          const endpoint = API.buildURL(API_ENDPOINTS.FEATURE_FLAGS.DETAIL, {
            flag_id: flag.flag_key
          })
          await this.apiCall(endpoint, { method: 'DELETE' })
          await this.loadFeatureFlags()
        },
        { successMessage: '功能开关已删除' }
      )
    },

    /**
     * 获取发布策略的中文文本
     * @method getStrategyText
     * @param {string} strategy - 发布策略代码
     * @returns {string} 策略中文文本
     */
    getStrategyText(strategy) {
      const map = {
        all: '全量发布',
        percentage: '按比例发布',
        whitelist: '白名单',
        blacklist: '黑名单'
      }
      return map[strategy] || strategy
    },

    // ==================== 审计日志方法 ====================

    /**
     * 加载审计日志
     * @async
     * @method loadAuditLogs
     * @description 根据筛选条件从后端获取审计日志列表
     * @returns {Promise<void>}
     */
    async loadAuditLogs() {
      try {
        // 🔧 修复：使用后端实际提供的API路径 /api/v4/console/system/audit-logs
        // 构建筛选参数（后端使用 operation_type 而不是 action）
        const params = {
          page: this.auditPage || 1,
          page_size: this.auditPageSize || 20
        }
        // 映射前端筛选字段到后端字段
        if (this.auditFilters.action) params.operation_type = this.auditFilters.action
        if (this.auditFilters.keyword) params.operator_id = this.auditFilters.keyword
        if (this.auditFilters.startDate) params.start_date = this.auditFilters.startDate
        if (this.auditFilters.endDate) params.end_date = this.auditFilters.endDate

        const response = await this.apiGet(API_ENDPOINTS.AUDIT_LOGS.LIST, params)
        console.log('[SystemSettings] 审计日志API响应:', response)

        if (response.success && response.data) {
          // 后端返回格式: { logs: [...], pagination: {...} }
          const auditData = response.data?.logs || response.data?.list || response.data
          this.auditLogs = Array.isArray(auditData)
            ? auditData.map(log => ({
                log_id: log.log_id || log.id,
                operator_id: log.operator_id,
                operator_name: log.operator?.nickname || log.operator?.mobile || log.operator_id,
                action: log.operation_type || log.action,
                target: log.target_type ? `${log.target_type}:${log.target_id}` : log.target,
                // 🔧 修复日期字段：后端返回 created_at (可能是 ISO 字符串或 Date 对象)
                created_at: log.created_at,
                details: log.details || log.operation_details,
                ip_address: log.ip_address
              }))
            : []

          this.auditPagination = {
            total: response.data.pagination?.total || this.auditLogs.length,
            totalPages: response.data.pagination?.total_pages || 1
          }

          console.log('[SystemSettings] 审计日志已加载:', this.auditLogs.length, '条')
        }
      } catch (error) {
        console.error('加载审计日志失败:', error)
      }
    },

    /**
     * 查看审计日志详情
     * @method viewAuditLog
     * @param {AuditLog} log - 审计日志对象
     * @description 设置选中的日志并显示详情模态框
     * @returns {void}
     */
    viewAuditLog(log) {
      this.selectedAuditLog = log
      this.showModal('auditDetailModal')
    },

    // ==================== 定价配置方法 ====================

    /**
     * 加载定价配置
     * @async
     * @method loadPricingConfigs
     * @description 从后端获取定价配置列表，支持数组和对象格式
     * @returns {Promise<void>}
     */
    async loadPricingConfigs() {
      try {
        // 使用 API_ENDPOINTS.SETTINGS.POINTS
        const response = await this.apiGet(API_ENDPOINTS.SETTINGS.POINTS)
        if (response.success && response.data) {
          const settings = response.data?.settings || response.data
          if (Array.isArray(settings)) {
            this.pricingConfigs = settings.map(item => ({
              config_key: item.key,
              config_name: item.display_name || item.key,
              config_value: item.value,
              default_value: item.default_value || item.value,
              unit: item.unit || '',
              description: item.description || ''
            }))
          } else {
            // 将对象转换为数组格式
            this.pricingConfigs = Object.entries(settings).map(([key, value]) => ({
              config_key: key,
              config_name: key,
              config_value: value,
              default_value: value,
              unit: '',
              description: ''
            }))
          }
        }
      } catch (error) {
        console.error('加载定价配置失败:', error)
      }
    },

    /**
     * 保存所有定价配置
     * @async
     * @method savePricingConfigs
     * @description 将pricingDefaults中的所有配置保存到后端
     * @returns {Promise<void>}
     */
    async savePricingConfigs() {
      try {
        this.saving = true
        // 使用后端设置API保存定价相关配置
        // PUT /api/v4/console/settings/points
        const settingsPayload = {}
        this.pricingDefaults.lottery_cost = this.pricingDefaults.lottery_cost || 2
        this.pricingDefaults.daily_lottery_limit = this.pricingDefaults.daily_lottery_limit || 10
        this.pricingDefaults.points_exchange_rate = this.pricingDefaults.points_exchange_rate || 100
        this.pricingDefaults.min_withdraw_amount = this.pricingDefaults.min_withdraw_amount || 10

        await this.apiPut(API_ENDPOINTS.SETTINGS.POINTS, {
          settings: this.pricingDefaults
        })
        this.showSuccess('定价配置已保存')
      } catch (error) {
        console.error('保存定价配置失败:', error)
        this.showError('保存失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 保存单个定价配置
     * @async
     * @method savePricingConfig
     * @param {PricingConfig} config - 要保存的配置对象
     * @description 保存指定的单个定价配置
     * @returns {Promise<void>}
     */
    async savePricingConfig(config) {
      try {
        this.saving = true
        // 🔧 修正：使用后端实际的定价配置API路径
        // 后端路由: PUT /api/v4/console/lottery-management/pricing-config/:id
        const configId = config.id || config.config_key
        const endpoint = `/api/v4/console/lottery-management/pricing-config/${configId}`
        await this.apiPut(endpoint, { value: config.config_value })
        this.showSuccess('配置已保存')
      } catch (error) {
        this.showError('保存失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    // ==================== 工具方法 ====================

    /**
     * 获取状态的中文文本
     * @method getStatusText
     * @param {string} status - 状态代码
     * @returns {string} 状态中文文本
     */
    getStatusText(status) {
      const map = { active: '生效中', inactive: '未生效', pending: '待审核' }
      return map[status] || status || '-'
    },

    /**
     * 安全格式化日期时间
     * @method formatDateSafe
     * @param {string|Date|number|null} dateStr - 日期字符串、Date对象或时间戳
     * @returns {string} 格式化后的中文日期时间字符串
     * @description 支持多种输入格式，处理无效日期
     */
    formatDateSafe(dateStr) {
      if (!dateStr) return '-'
      try {
        // 尝试解析日期
        let date
        if (typeof dateStr === 'string') {
          // ISO 格式或其他字符串格式
          date = new Date(dateStr)
        } else if (dateStr instanceof Date) {
          date = dateStr
        } else if (typeof dateStr === 'number') {
          // 时间戳
          date = new Date(dateStr)
        } else {
          return String(dateStr)
        }

        // 检查日期是否有效
        if (isNaN(date.getTime())) {
          console.warn('[formatDate] Invalid date:', dateStr)
          return 'Invalid Date'
        }

        // 格式化为中文本地时间
        return date.toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      } catch (error) {
        console.error('[formatDate] Error:', error, 'for input:', dateStr)
        return String(dateStr)
      }
    },

    /**
     * 格式化日期时间（别名方法）
     * @method formatDate
     * @param {string|Date|number|null} dateStr - 日期字符串、Date对象或时间戳
     * @returns {string} 格式化后的中文日期时间字符串
     * @description 兼容HTML模板调用，内部调用formatDateSafe
     */
    formatDate(dateStr) {
      return this.formatDateSafe(dateStr)
    },

    /**
     * 保存配置（别名方法）
     * @async
     * @method saveConfig
     * @description 兼容HTML模板调用，内部调用saveSystemConfigs
     * @returns {Promise<void>}
     */
    async saveConfig() {
      await this.saveSystemConfigs()
    },

    /**
     * 提交字典表单（别名方法）
     * @async
     * @method submitDictForm
     * @description 兼容HTML模板调用，内部调用saveDict
     * @returns {Promise<void>}
     */
    async submitDictForm() {
      await this.saveDict()
    },

    /**
     * 是否为编辑模式
     * @type {boolean}
     * @readonly
     * @description 根据editingDictCode判断当前是否在编辑模式
     */
    get isEditMode() {
      return !!this.editingDictCode
    }
  }))

  console.log('✅ [SystemSettings] Alpine 组件已注册')
}

// 🔧 修复：多种初始化方式确保组件被注册
// 方式1: 如果 Alpine 已经初始化，直接注册
if (typeof window.Alpine !== 'undefined' && typeof window.createPageMixin === 'function') {
  console.log('[SystemSettings] Alpine 已可用，直接注册组件')
  registerSystemSettingsComponents()
} else {
  // 方式2: 监听 alpine:init 事件（如果尚未触发）
  document.addEventListener('alpine:init', registerSystemSettingsComponents)

  // 方式3: DOMContentLoaded 时检查并注册（备用）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // 延迟一点确保 Alpine 已初始化
      setTimeout(registerSystemSettingsComponents, 100)
    })
  } else {
    // DOM 已加载，延迟一点确保 Alpine 初始化
    setTimeout(registerSystemSettingsComponents, 100)
  }
}

console.log('📦 [SystemSettings] 页面脚本已加载')
