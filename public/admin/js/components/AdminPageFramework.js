/**
 * AdminPageFramework - 管理后台页面框架
 * @description 统一的页面组件化框架，整合所有重复的页面结构和逻辑
 * @version 2.0.0
 * @created 2026-01-09
 *
 * 使用方式：
 * const page = new AdminPageFramework({
 *   pageId: 'material-asset-types',
 *   title: '材料资产类型管理',
 *   icon: 'bi-gem',
 *   apiEndpoint: API_ENDPOINTS.MATERIAL.ASSET_TYPES,
 *   stats: [...],
 *   filters: [...],
 *   columns: [...],
 *   modals: {...}
 * })
 * page.init()
 */

class AdminPageFramework {
  constructor(config) {
    // 基础配置
    this.pageId = config.pageId
    this.title = config.title
    this.subtitle = config.subtitle || ''
    this.icon = config.icon || 'bi-file-earmark'
    this.emoji = config.emoji || '📋'

    // API配置
    this.apiEndpoint = config.apiEndpoint
    this.primaryKey = config.primaryKey || 'id'

    // 组件配置
    this.stats = config.stats || []
    this.filters = config.filters || []
    this.columns = config.columns || []
    this.actions = config.actions || []
    this.modals = config.modals || {}
    this.headerActions = config.headerActions || []

    // 分页配置
    this.pagination = config.pagination !== false
    this.pageSize = config.pageSize || 20
    this.currentPage = 1

    // 数据字段配置（指定后端返回的数据数组所在字段名）
    this.dataField = config.dataField || null
    
    // 独立统计接口配置（可选，如果配置了则单独调用统计接口）
    this.statsEndpoint = config.statsEndpoint || null

    // 数据
    this.data = []
    this.statsData = {}
    this.filterValues = {}

    // 回调函数
    this.onDataLoaded = config.onDataLoaded || null
    this.onRowRender = config.onRowRender || null
    this.beforeSubmit = config.beforeSubmit || null
    this.afterSubmit = config.afterSubmit || null
    this.customRenders = config.customRenders || {}

    // Bootstrap实例
    this.modalInstances = {}
    this.toastInstances = {}
  }

  /**
   * 初始化页面
   */
  async init() {
    // 权限检查
    if (!this.checkPermission()) {
      return
    }

    // 显示用户信息
    this.showUserInfo()

    // 渲染页面结构
    this.renderPageStructure()

    // 初始化Bootstrap组件
    this.initBootstrapComponents()

    // 绑定事件
    this.bindEvents()

    // 加载数据
    await this.loadData()
  }

  /**
   * 权限检查
   */
  checkPermission() {
    if (typeof checkAdminPermission === 'function') {
      return checkAdminPermission()
    }
    return true
  }

  /**
   * 显示用户信息
   */
  showUserInfo() {
    const welcomeEl = document.getElementById('welcomeText')
    if (welcomeEl && typeof getCurrentUser === 'function') {
      const user = getCurrentUser()
      if (user) {
        welcomeEl.textContent = `欢迎，${user.nickname || user.mobile}`
      }
    }
  }

  /**
   * 渲染页面结构
   */
  renderPageStructure() {
    const container = document.getElementById('pageContainer')
    if (!container) return

    let html = ''

    // 渲染页头操作区域
    if (this.headerActions.length > 0 || this.subtitle) {
      html += this.renderHeader()
    }

    // 渲染统计卡片
    if (this.stats.length > 0) {
      html += this.renderStatsCards()
    }

    // 渲染筛选表单
    if (this.filters.length > 0) {
      html += this.renderFilters()
    }

    // 渲染数据表格
    html += this.renderTable()

    container.innerHTML = html
  }

  /**
   * 渲染页头
   */
  renderHeader() {
    const actionsHtml = this.headerActions
      .map(
        action => `
      <button class="btn btn-${action.type || 'primary'}" 
              ${action.modal ? `data-bs-toggle="modal" data-bs-target="#${action.modal}"` : ''}
              ${action.id ? `id="${action.id}"` : ''}>
        <i class="bi ${action.icon}"></i> ${action.label}
      </button>
    `
      )
      .join('')

    return `
      <div class="card mb-3">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <h5 class="mb-0">
                <i class="bi ${this.icon}"></i> ${this.title}
              </h5>
              ${this.subtitle ? `<small class="text-muted">${this.subtitle}</small>` : ''}
            </div>
            <div class="d-flex gap-2">
              ${actionsHtml}
            </div>
          </div>
        </div>
      </div>
    `
  }

  /**
   * 渲染统计卡片
   */
  renderStatsCards() {
    const colClass = `col-md-${Math.floor(12 / this.stats.length)}`

    const cardsHtml = this.stats
      .map(
        stat => `
      <div class="${colClass}">
        <div class="card ${stat.border ? `border-${stat.border}` : ''}">
          <div class="card-body text-center">
            <h6 class="text-muted">${stat.label}</h6>
            <h3 class="text-${stat.color || 'primary'}" id="stat_${stat.key}">-</h3>
          </div>
        </div>
      </div>
    `
      )
      .join('')

    return `
      <div class="row g-3 mb-3">
        ${cardsHtml}
      </div>
    `
  }

  /**
   * 渲染筛选表单
   */
  renderFilters() {
    const filtersHtml = this.filters
      .map(filter => {
        let inputHtml = ''

        switch (filter.type) {
          case 'select':
            const optionsHtml = filter.options
              .map(opt => `<option value="${opt.value}">${opt.label}</option>`)
              .join('')
            inputHtml = `
            <select class="form-select" id="filter_${filter.key}" ${filter.disabled ? 'disabled' : ''}>
              ${optionsHtml}
            </select>
          `
            break
          case 'date':
          case 'datetime-local':
            inputHtml = `
            <input type="${filter.type}" class="form-control" id="filter_${filter.key}" placeholder="${filter.placeholder || ''}">
          `
            break
          case 'number':
            inputHtml = `
            <input type="number" class="form-control" id="filter_${filter.key}" 
                   placeholder="${filter.placeholder || ''}" 
                   ${filter.min !== undefined ? `min="${filter.min}"` : ''}>
          `
            break
          default:
            inputHtml = `
            <input type="text" class="form-control" id="filter_${filter.key}" placeholder="${filter.placeholder || ''}">
          `
        }

        return `
        <div class="col-md-${filter.col || 3}">
          ${filter.label ? `<label class="form-label">${filter.label}</label>` : ''}
          ${inputHtml}
          ${filter.hint ? `<small class="text-muted">${filter.hint}</small>` : ''}
        </div>
      `
      })
      .join('')

    return `
      <div class="card mb-3">
        <div class="card-body">
          <form id="filterForm" class="row g-3">
            ${filtersHtml}
            <div class="col-md-${12 - (this.filters.reduce((sum, f) => sum + (f.col || 3), 0) % 12) || 3} d-flex align-items-end gap-2">
              <button type="submit" class="btn btn-primary flex-fill">
                <i class="bi bi-search"></i> 查询
              </button>
              <button type="button" class="btn btn-secondary" id="resetFilterBtn">
                <i class="bi bi-arrow-counterclockwise"></i> 重置
              </button>
            </div>
          </form>
        </div>
      </div>
    `
  }

  /**
   * 渲染数据表格
   */
  renderTable() {
    const headerHtml = this.columns
      .map(col => `<th ${col.width ? `style="width: ${col.width}"` : ''}>${col.label}</th>`)
      .join('')

    const actionsHeader = this.actions.length > 0 ? '<th style="width: 200px;">操作</th>' : ''

    return `
      <div class="card">
        <div class="card-body">
          <div class="table-responsive">
            <table class="table table-hover align-middle">
              <thead class="table-light">
                <tr>
                  ${headerHtml}
                  ${actionsHeader}
                </tr>
              </thead>
              <tbody id="dataTableBody">
                <tr>
                  <td colspan="${this.columns.length + (this.actions.length > 0 ? 1 : 0)}" class="text-center py-5">
                    <div class="spinner-border text-primary" role="status">
                      <span class="visually-hidden">加载中...</span>
                    </div>
                    <p class="mt-2 text-muted">正在加载数据...</p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          ${this.pagination ? this.renderPagination() : ''}
        </div>
      </div>
    `
  }

  /**
   * 渲染分页
   */
  renderPagination() {
    return `
      <nav aria-label="分页" class="mt-3">
        <ul class="pagination justify-content-end mb-0" id="paginationContainer"></ul>
      </nav>
    `
  }

  /**
   * 初始化Bootstrap组件
   */
  initBootstrapComponents() {
    // 初始化模态框
    Object.keys(this.modals).forEach(modalId => {
      const el = document.getElementById(modalId)
      if (el) {
        this.modalInstances[modalId] = new bootstrap.Modal(el)
      }
    })

    // 初始化Toast
    const successToast = document.getElementById('successToast')
    const errorToast = document.getElementById('errorToast')

    if (successToast) {
      this.toastInstances.success = new bootstrap.Toast(successToast)
    }
    if (errorToast) {
      this.toastInstances.error = new bootstrap.Toast(errorToast)
    }
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 退出登录
    const logoutBtn = document.getElementById('logoutBtn')
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        if (typeof logout === 'function') logout()
      })
    }

    // 筛选表单提交
    const filterForm = document.getElementById('filterForm')
    if (filterForm) {
      filterForm.addEventListener('submit', e => {
        e.preventDefault()
        this.handleSearch()
      })
    }

    // 重置筛选
    const resetBtn = document.getElementById('resetFilterBtn')
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetFilters())
    }

    // 表格操作按钮事件委托
    const tableBody = document.getElementById('dataTableBody')
    if (tableBody) {
      tableBody.addEventListener('click', e => this.handleTableAction(e))
    }

    // 绑定模态框提交按钮
    Object.entries(this.modals).forEach(([modalId, modalConfig]) => {
      if (modalConfig.submitBtn) {
        const btn = document.getElementById(modalConfig.submitBtn)
        if (btn) {
          btn.addEventListener('click', () => this.handleModalSubmit(modalId, modalConfig))
        }
      }
    })

    // 绑定自定义头部操作按钮
    this.headerActions.forEach(action => {
      if (action.onClick && action.id) {
        const btn = document.getElementById(action.id)
        if (btn) {
          btn.addEventListener('click', () => action.onClick.call(this))
        }
      }
    })
  }

  /**
   * 加载数据
   */
  async loadData() {
    const tbody = document.getElementById('dataTableBody')
    this.showTableLoading(tbody)

    try {
      // 构建查询参数
      const params = new URLSearchParams()
      if (this.pagination) {
        params.append('page', this.currentPage)
        params.append('page_size', this.pageSize)
      }

      // 添加筛选参数
      Object.entries(this.filterValues).forEach(([key, value]) => {
        if (value !== '' && value !== undefined && value !== null) {
          params.append(key, value)
        }
      })

      const url = `${this.apiEndpoint}${params.toString() ? '?' + params.toString() : ''}`
      const response = await apiRequest(url)

      if (response && response.success) {
        this.data = this.extractData(response.data)
        this.renderTableData()
        
        // 调试日志：检查响应数据结构
        console.log('[AdminPageFramework] response.data:', response.data)
        console.log('[AdminPageFramework] statistics字段:', response.data?.statistics)
        
        // 如果配置了独立的统计接口，则单独加载统计数据
        if (this.statsEndpoint) {
          await this.loadStatsFromEndpoint()
        } else {
          this.updateStats(response.data)
        }

        if (this.pagination && response.data.pagination) {
          this.renderPaginationControls(response.data.pagination)
        }

        if (this.onDataLoaded) {
          this.onDataLoaded.call(this, this.data, response.data)
        }
      } else {
        this.showTableError(tbody, response?.message || '加载失败')
      }
    } catch (error) {
      console.error('加载数据失败:', error)
      this.showTableError(tbody, error.message)
    }
  }

  /**
   * 从响应中提取数据数组
   */
  extractData(data) {
    // 1. 优先使用配置中指定的 dataField
    if (this.dataField && data[this.dataField]) {
      return data[this.dataField]
    }
    
    // 2. 尝试多种常见的数据结构
    if (Array.isArray(data)) return data
    if (data.list) return data.list
    if (data.items) return data.items
    if (data.orders) return data.orders
    if (data.records) return data.records
    if (data.users) return data.users  // 添加对 users 字段的支持
    if (data.data) return Array.isArray(data.data) ? data.data : []
    return []
  }

  /**
   * 渲染表格数据
   */
  renderTableData() {
    const tbody = document.getElementById('dataTableBody')
    if (!tbody) return

    if (this.data.length === 0) {
      this.showTableEmpty(tbody)
      return
    }

    tbody.innerHTML = this.data
      .map((row, index) => {
        const cells = this.columns
          .map(col => {
            let value = this.getNestedValue(row, col.key)

            // 使用自定义渲染器
            if (col.render) {
              value = col.render(value, row, index)
            } else if (this.customRenders[col.key]) {
              value = this.customRenders[col.key](value, row, index)
            } else {
              value = this.defaultCellRender(value, col)
            }

            return `<td>${value}</td>`
          })
          .join('')

        // 渲染操作按钮
        const actionCells = this.actions.length > 0 ? `<td>${this.renderRowActions(row)}</td>` : ''

        // 允许自定义行渲染
        if (this.onRowRender) {
          return this.onRowRender(row, cells, actionCells, index)
        }

        return `<tr data-id="${row[this.primaryKey]}">${cells}${actionCells}</tr>`
      })
      .join('')
  }

  /**
   * 获取嵌套属性值
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj)
  }

  /**
   * 默认单元格渲染
   */
  defaultCellRender(value, col) {
    if (value === null || value === undefined) return '-'

    // 根据列类型格式化
    switch (col.type) {
      case 'code':
        return `<code>${this.escapeHtml(value)}</code>`
      case 'badge':
        const badgeClass = col.badgeMap?.[value] || 'secondary'
        const badgeText = col.labelMap?.[value] || value
        return `<span class="badge bg-${badgeClass}">${badgeText}</span>`
      case 'status':
        return this.renderStatusBadge(value, col.statusMap)
      case 'date':
        return this.formatDate(value)
      case 'datetime':
        return this.formatDateTime(value)
      case 'currency':
        return `<span class="text-${col.color || 'primary'} fw-bold">${value}</span>`
      case 'image':
        return value
          ? `<img src="${value}" style="max-width: 50px; max-height: 50px;" class="rounded">`
          : '-'
      default:
        return this.escapeHtml(String(value))
    }
  }

  /**
   * 渲染状态徽章
   */
  renderStatusBadge(value, statusMap = {}) {
    const defaultMap = {
      1: { class: 'success', label: '已启用' },
      0: { class: 'secondary', label: '已禁用' },
      true: { class: 'success', label: '是' },
      false: { class: 'secondary', label: '否' },
      active: { class: 'success', label: '正常' },
      inactive: { class: 'secondary', label: '禁用' },
      pending: { class: 'warning', label: '待处理' },
      completed: { class: 'info', label: '已完成' },
      shipped: { class: 'success', label: '已发货' },
      cancelled: { class: 'secondary', label: '已取消' }
    }

    const config = statusMap[value] || defaultMap[value] || { class: 'secondary', label: value }
    return `<span class="badge bg-${config.class}">${config.label}</span>`
  }

  /**
   * 渲染行操作按钮
   */
  renderRowActions(row) {
    return this.actions
      .map(action => {
        // 检查是否应该显示此按钮
        if (action.visible && !action.visible(row)) {
          return ''
        }

        const btnClass =
          typeof action.type === 'function' ? action.type(row) : action.type || 'primary'
        const icon = typeof action.icon === 'function' ? action.icon(row) : action.icon
        const label = typeof action.label === 'function' ? action.label(row) : action.label

        return `
        <button class="btn btn-sm btn-${btnClass} ${action.class || ''}" 
                data-action="${action.key}"
                data-id="${row[this.primaryKey]}"
                ${
                  action.dataAttrs
                    ? Object.entries(action.dataAttrs)
                        .map(([k, v]) => `data-${k}="${typeof v === 'function' ? v(row) : row[v]}"`)
                        .join(' ')
                    : ''
                }>
          <i class="bi ${icon}"></i> ${label}
        </button>
      `
      })
      .join(' ')
  }

  /**
   * 处理表格操作
   */
  handleTableAction(e) {
    const btn = e.target.closest('[data-action]')
    if (!btn) return

    const actionKey = btn.dataset.action
    const id = btn.dataset.id
    const row = this.data.find(r => String(r[this.primaryKey]) === String(id))

    const action = this.actions.find(a => a.key === actionKey)
    if (action && action.onClick) {
      action.onClick.call(this, row, btn.dataset, e)
    }
  }

  /**
   * 处理搜索
   */
  handleSearch() {
    // 收集筛选值
    this.filterValues = {}
    this.filters.forEach(filter => {
      const el = document.getElementById(`filter_${filter.key}`)
      if (el) {
        this.filterValues[filter.key] = el.value.trim()
      }
    })

    this.currentPage = 1
    this.loadData()
  }

  /**
   * 重置筛选
   */
  resetFilters() {
    this.filters.forEach(filter => {
      const el = document.getElementById(`filter_${filter.key}`)
      if (el) {
        el.value = filter.default || ''
      }
    })
    this.filterValues = {}
    this.currentPage = 1
    this.loadData()
  }

  /**
   * 从独立统计接口加载数据
   */
  async loadStatsFromEndpoint() {
    if (!this.statsEndpoint) return
    
    try {
      const response = await apiRequest(this.statsEndpoint)
      
      if (response && response.success) {
        this.statsData = response.data
        this.updateStats(response.data)
      } else {
        console.warn('加载统计数据失败:', response?.message)
      }
    } catch (error) {
      console.error('加载统计接口失败:', error)
    }
  }

  /**
   * 更新统计数据
   */
  updateStats(responseData) {
    // 🔍 调试：打印传入的响应数据
    console.log('[AdminPageFramework.updateStats] 开始更新统计数据')
    console.log('[AdminPageFramework.updateStats] responseData:', responseData)
    console.log('[AdminPageFramework.updateStats] this.stats配置:', this.stats)
    
    this.stats.forEach(stat => {
      const el = document.getElementById(`stat_${stat.key}`)
      if (!el) {
        console.warn(`[AdminPageFramework.updateStats] 找不到元素: stat_${stat.key}`)
        return
      }

      let value = '-'

      if (stat.compute) {
        // 使用计算函数
        value = stat.compute(this.data, responseData)
        console.log(`[AdminPageFramework.updateStats] stat.key=${stat.key}, 使用compute函数, value=${value}`)
      } else if (stat.field) {
        // 从响应数据中直接取值
        const rawValue = this.getNestedValue(responseData, stat.field)
        value = rawValue ?? '-'
        console.log(`[AdminPageFramework.updateStats] stat.key=${stat.key}, field=${stat.field}, rawValue=${rawValue}, value=${value}`)
      } else {
        // 从数据数组中统计
        value = this.data.length
        console.log(`[AdminPageFramework.updateStats] stat.key=${stat.key}, 使用data.length, value=${value}`)
      }

      el.textContent = value
    })
    
    console.log('[AdminPageFramework.updateStats] 统计数据更新完成')
  }

  /**
   * 处理模态框提交
   */
  async handleModalSubmit(modalId, modalConfig) {
    const form = document.getElementById(modalConfig.formId)
    if (form && !form.checkValidity()) {
      form.reportValidity()
      return
    }

    // 收集表单数据
    const formData = this.collectFormData(modalConfig)

    // 执行前置处理
    if (this.beforeSubmit) {
      const result = await this.beforeSubmit(modalId, formData)
      if (result === false) return
      if (result) Object.assign(formData, result)
    }

    const submitBtn = document.getElementById(modalConfig.submitBtn)
    const originalText = submitBtn.innerHTML

    try {
      submitBtn.disabled = true
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>提交中...'

      const method = modalConfig.method || 'POST'
      const url =
        typeof modalConfig.url === 'function'
          ? modalConfig.url(formData)
          : modalConfig.url || this.apiEndpoint

      const response = await apiRequest(url, {
        method,
        body: JSON.stringify(formData)
      })

      if (response && response.success) {
        this.showSuccess(modalConfig.successMessage || '操作成功')
        this.modalInstances[modalId]?.hide()

        if (form) form.reset()

        if (this.afterSubmit) {
          this.afterSubmit(modalId, response.data)
        }

        await this.loadData()
      } else {
        this.showError(response?.message || '操作失败')
      }
    } catch (error) {
      console.error('提交失败:', error)
      this.showError(error.message)
    } finally {
      submitBtn.disabled = false
      submitBtn.innerHTML = originalText
    }
  }

  /**
   * 收集表单数据
   */
  collectFormData(modalConfig) {
    const data = {}

    if (modalConfig.fields) {
      modalConfig.fields.forEach(field => {
        const el = document.getElementById(field.id)
        if (el) {
          let value = el.value

          // 类型转换
          if (field.type === 'number' || field.type === 'integer') {
            value = parseInt(value) || 0
          } else if (field.type === 'float') {
            value = parseFloat(value) || 0
          } else if (field.type === 'boolean') {
            value = el.checked || el.value === '1' || el.value === 'true'
          } else {
            value = value.trim()
          }

          data[field.key || field.id] = value
        }
      })
    }

    return data
  }

  /**
   * 渲染分页控件
   */
  renderPaginationControls(pagination) {
    const container = document.getElementById('paginationContainer')
    if (!container || !pagination) return

    if (pagination.total_pages <= 1) {
      container.innerHTML = ''
      return
    }

    let html = ''

    // 上一页
    html += `
      <li class="page-item ${this.currentPage === 1 ? 'disabled' : ''}">
        <a class="page-link" href="#" data-page="${this.currentPage - 1}">上一页</a>
      </li>
    `

    // 页码
    for (let i = 1; i <= pagination.total_pages; i++) {
      if (
        i === 1 ||
        i === pagination.total_pages ||
        (i >= this.currentPage - 2 && i <= this.currentPage + 2)
      ) {
        html += `
          <li class="page-item ${i === this.currentPage ? 'active' : ''}">
            <a class="page-link" href="#" data-page="${i}">${i}</a>
          </li>
        `
      } else if (i === this.currentPage - 3 || i === this.currentPage + 3) {
        html += '<li class="page-item disabled"><span class="page-link">...</span></li>'
      }
    }

    // 下一页
    html += `
      <li class="page-item ${this.currentPage === pagination.total_pages ? 'disabled' : ''}">
        <a class="page-link" href="#" data-page="${this.currentPage + 1}">下一页</a>
      </li>
    `

    container.innerHTML = html

    // 绑定分页点击事件
    container.querySelectorAll('a[data-page]').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault()
        const page = parseInt(link.dataset.page)
        if (page >= 1 && page <= pagination.total_pages && page !== this.currentPage) {
          this.currentPage = page
          this.loadData()
        }
      })
    })
  }

  // ==================== 辅助方法 ====================

  showTableLoading(tbody) {
    const colspan = this.columns.length + (this.actions.length > 0 ? 1 : 0)
    tbody.innerHTML = `
      <tr>
        <td colspan="${colspan}" class="text-center py-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">加载中...</span>
          </div>
          <p class="mt-2 text-muted">正在加载数据...</p>
        </td>
      </tr>
    `
  }

  showTableEmpty(tbody) {
    const colspan = this.columns.length + (this.actions.length > 0 ? 1 : 0)
    tbody.innerHTML = `
      <tr>
        <td colspan="${colspan}" class="text-center py-5">
          <i class="bi bi-inbox text-muted" style="font-size: 3rem;"></i>
          <p class="mt-2 text-muted">暂无数据</p>
        </td>
      </tr>
    `
  }

  showTableError(tbody, message) {
    const colspan = this.columns.length + (this.actions.length > 0 ? 1 : 0)
    tbody.innerHTML = `
      <tr>
        <td colspan="${colspan}" class="text-center py-5 text-danger">
          <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
          <p class="mt-2">加载失败：${this.escapeHtml(message)}</p>
          <button class="btn btn-outline-primary btn-sm" onclick="location.reload()">
            <i class="bi bi-arrow-clockwise"></i> 重新加载
          </button>
        </td>
      </tr>
    `
  }

  showSuccess(message) {
    if (this.toastInstances.success) {
      const body = document.getElementById('successToastBody')
      if (body) body.textContent = message
      this.toastInstances.success.show()
    } else if (typeof showSuccessToast === 'function') {
      showSuccessToast(message)
    } else {
      alert('✅ ' + message)
    }
  }

  showError(message) {
    if (this.toastInstances.error) {
      const body = document.getElementById('errorToastBody')
      if (body) body.textContent = message
      this.toastInstances.error.show()
    } else if (typeof showErrorToast === 'function') {
      showErrorToast(message)
    } else {
      alert('❌ ' + message)
    }
  }

  formatDate(dateStr) {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-CN')
  }

  formatDateTime(dateStr) {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  escapeHtml(text) {
    if (!text) return ''
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  // ==================== 公共方法 ====================

  /**
   * 刷新数据
   */
  refresh() {
    return this.loadData()
  }

  /**
   * 打开模态框
   */
  openModal(modalId, data = {}) {
    if (this.modalInstances[modalId]) {
      // 填充数据
      Object.entries(data).forEach(([key, value]) => {
        const el = document.getElementById(key)
        if (el) el.value = value
      })
      this.modalInstances[modalId].show()
    }
  }

  /**
   * 关闭模态框
   */
  closeModal(modalId) {
    if (this.modalInstances[modalId]) {
      this.modalInstances[modalId].hide()
    }
  }

  /**
   * 获取当前选中的行
   */
  getSelectedRow(id) {
    return this.data.find(r => String(r[this.primaryKey]) === String(id))
  }
}

// 导出到全局
window.AdminPageFramework = AdminPageFramework
