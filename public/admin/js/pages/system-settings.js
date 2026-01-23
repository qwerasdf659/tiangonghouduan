/**
 * System Settings Page - Alpine.js Mixin 重构版
 * 系统设置整合页面组件
 * 
 * @file public/admin/js/pages/system-settings.js
 * @version 3.0.0
 * @date 2026-01-23
 * 
 * 包含子模块：
 * - 系统配置 (system-config)
 * - 字典管理 (dict-management)
 * - 审计日志 (audit-logs)
 * - 定价配置 (pricing-config)
 */

document.addEventListener('alpine:init', () => {
  console.log('[SystemSettings] 注册 Alpine 组件 (Mixin v3.0)...')

  // 全局 Store
  Alpine.store('systemPage', 'system-config')

  // 导航组件
  Alpine.data('systemNavigation', () => ({
    ...createPageMixin(),
    currentPage: 'system-config',
    subPages: [
      { id: 'system-config', title: '系统配置', icon: 'bi-gear' },
      { id: 'dict-management', title: '字典管理', icon: 'bi-book' },
      { id: 'audit-logs', title: '审计日志', icon: 'bi-journal-text' },
      { id: 'pricing-config', title: '定价配置', icon: 'bi-currency-dollar' }
    ],

    init() {
      console.log('✅ 系统设置导航初始化')
      if (!this.checkAuth()) return
      const urlParams = new URLSearchParams(window.location.search)
      this.currentPage = urlParams.get('page') || 'system-config'
      Alpine.store('systemPage', this.currentPage)
    },

    switchPage(pageId) {
      this.currentPage = pageId
      Alpine.store('systemPage', pageId)
      window.history.pushState({}, '', `?page=${pageId}`)
    }
  }))

  // 页面内容组件
  Alpine.data('systemPageContent', () => ({
    ...createPageMixin(),

    // 系统配置
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

    // 字典管理
    dictList: [],
    dictForm: { dict_code: '', dict_name: '', items: [] },
    editingDictCode: null,

    // 审计日志
    auditLogs: [],
    auditFilters: { action: '', startDate: '', endDate: '', keyword: '' },
    auditPagination: { total: 0, totalPages: 1 },
    selectedAuditLog: null,

    // 定价配置
    pricingConfigs: [],
    pricingDefaults: {},  // 存储默认值

    // 通用状态
    saving: false,

    get currentPage() {
      return Alpine.store('systemPage')
    },

    init() {
      console.log('✅ 系统设置内容初始化')
      this.loadPageData()
      this.$watch('$store.systemPage', () => this.loadPageData())
    },

    async loadPageData() {
      const page = this.currentPage
      await this.withLoading(async () => {
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
      }, { loadingText: '加载数据...' })
    },

    // ==================== 系统配置方法 ====================

    async loadSystemConfigs() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.SYSTEM_CONFIG?.LIST || '/api/v4/console/system/configs',
          {}, { showLoading: false }
        )
        if (response?.success) {
          const configs = response.data?.configs || response.data || {}
          // 合并到 systemConfigs
          Object.keys(configs).forEach(key => {
            if (this.systemConfigs.hasOwnProperty(key)) {
              this.systemConfigs[key] = configs[key]
            }
          })
        }
      } catch (error) {
        console.error('加载系统配置失败:', error)
      }
    },

    async saveAllConfigs() {
      this.saving = true
      try {
        const response = await this.apiCall(
          API_ENDPOINTS.SYSTEM_CONFIG?.UPDATE || '/api/v4/console/system/configs',
          {
            method: 'PUT',
            body: JSON.stringify({ configs: this.systemConfigs })
          }
        )
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

    // ==================== 字典管理方法 ====================

    async loadDictList() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.DICT?.LIST || '/api/v4/console/dict',
          {}, { showLoading: false }
        )
        if (response?.success) {
          this.dictList = response.data?.dicts || response.data?.list || []
        }
      } catch (error) {
        console.error('加载字典失败:', error)
        this.dictList = []
      }
    },

    openCreateDictModal() {
      this.editingDictCode = null
      this.dictForm = { dict_code: '', dict_name: '', items: [] }
      this.showModal('dictModal')
    },

    editDict(dict) {
      this.editingDictCode = dict.dict_code
      this.dictForm = {
        dict_code: dict.dict_code,
        dict_name: dict.dict_name,
        items: dict.items ? [...dict.items] : []
      }
      this.showModal('dictModal')
    },

    async deleteDict(dict) {
      await this.confirmAndExecute(
        `确认删除字典「${dict.dict_name}」？`,
        async () => {
          const response = await this.apiCall(
            API.buildURL(API_ENDPOINTS.DICT?.DELETE || '/api/v4/console/dict/:code', { code: dict.dict_code }),
            { method: 'DELETE' }
          )
          if (response?.success) this.loadDictList()
        },
        { successMessage: '字典已删除' }
      )
    },

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
            API.buildURL(API_ENDPOINTS.DICT?.UPDATE || '/api/v4/console/dict/:code', { code: this.editingDictCode }),
            { method: 'PUT', body: JSON.stringify(payload) }
          )
        } else {
          response = await this.apiCall(
            API_ENDPOINTS.DICT?.CREATE || '/api/v4/console/dict',
            { method: 'POST', body: JSON.stringify(payload) }
          )
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

    async loadAuditLogs() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page)
        params.append('page_size', this.pageSize)
        if (this.auditFilters.action) params.append('action', this.auditFilters.action)
        if (this.auditFilters.startDate) params.append('start_date', this.auditFilters.startDate)
        if (this.auditFilters.endDate) params.append('end_date', this.auditFilters.endDate)
        if (this.auditFilters.keyword) params.append('keyword', this.auditFilters.keyword)

        const response = await this.apiGet(
          `${API_ENDPOINTS.AUDIT_LOG?.LIST || '/api/v4/console/audit-logs'}?${params}`,
          {}, { showLoading: false }
        )
        if (response?.success) {
          this.auditLogs = response.data?.logs || response.data?.list || []
          if (response.data?.pagination) {
            this.auditPagination = {
              total: response.data.pagination.total || 0,
              totalPages: response.data.pagination.total_pages || 1
            }
          }
        }
      } catch (error) {
        console.error('加载审计日志失败:', error)
        this.auditLogs = []
      }
    },

    viewAuditDetail(log) {
      this.selectedAuditLog = log
      this.showModal('auditDetailModal')
    },

    changeAuditPage(newPage) {
      if (newPage < 1 || newPage > this.auditPagination.totalPages) return
      this.page = newPage
      this.loadAuditLogs()
    },

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

    async loadPricingConfigs() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.PRICING_CONFIG?.LIST || '/api/v4/console/pricing-configs',
          {}, { showLoading: false }
        )
        if (response?.success) {
          this.pricingConfigs = response.data?.configs || response.data?.list || []
          // 存储默认值（如果API返回）
          if (response.data?.defaults) {
            this.pricingDefaults = response.data.defaults
          } else {
            // 以当前值作为默认值备份
            this.pricingConfigs.forEach(config => {
              if (this.pricingDefaults[config.config_key] === undefined) {
                this.pricingDefaults[config.config_key] = config.default_value ?? config.config_value
              }
            })
          }
        }
      } catch (error) {
        console.error('加载定价配置失败:', error)
        // 使用模拟数据
        this.pricingConfigs = [
          { config_key: 'lottery_price', config_name: '单次抽奖价格', config_value: 10, default_value: 10, unit: '积分', description: '用户每次抽奖消耗的积分数量' },
          { config_key: 'exchange_fee', config_name: '兑换手续费', config_value: 5, default_value: 5, unit: '%', description: '兑换商品时收取的手续费比例' },
          { config_key: 'withdraw_min', config_name: '最低提现金额', config_value: 100, default_value: 100, unit: '元', description: '用户提现的最低金额要求' }
        ]
        // 存储默认值
        this.pricingConfigs.forEach(config => {
          this.pricingDefaults[config.config_key] = config.default_value
        })
      }
    },

    async savePricingConfigs() {
      this.saving = true
      try {
        const response = await this.apiCall(
          API_ENDPOINTS.PRICING_CONFIG?.UPDATE || '/api/v4/console/pricing-configs',
          {
            method: 'PUT',
            body: JSON.stringify({ configs: this.pricingConfigs })
          }
        )
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

    async resetPricing(config) {
      await this.confirmAndExecute(
        `确认将「${config.config_name}」重置为默认值？`,
        async () => {
          try {
            const response = await this.apiCall(
              API.buildURL(API_ENDPOINTS.PRICING_CONFIG?.RESET || '/api/v4/console/pricing-configs/:key/reset', { key: config.config_key }),
              { method: 'POST' }
            )
            if (response?.success) {
              // 更新配置值为默认值
              const defaultValue = response.data?.default_value ?? this.pricingDefaults[config.config_key]
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

    formatDateSafe(dateStr) {
      if (!dateStr) return '-'
      try {
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) return dateStr
        return date.toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        })
      } catch {
        return dateStr
      }
    }
  }))

  console.log('✅ [SystemSettings] Alpine 组件已注册')
})

console.log('📦 [SystemSettings] 页面脚本已加载')

