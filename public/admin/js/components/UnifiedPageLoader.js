/**
 * UnifiedPageLoader - 统一页面加载器
 * @description 基于PageConfigRegistry动态加载和渲染管理页面
 * @version 2.0.0
 * @created 2026-01-09
 */

class UnifiedPageLoader {
  constructor(moduleId) {
    this.moduleId = moduleId
    this.currentPageId = null
    this.currentPage = null // AdminPageFramework实例
    this.module = PageConfigRegistry.getModuleConfig(moduleId)

    if (!this.module) {
      console.error(`模块不存在: ${moduleId}`)
      return
    }
  }

  /**
   * 初始化页面加载器
   */
  async init() {
    // 权限检查
    if (typeof checkAdminPermission === 'function' && !checkAdminPermission()) {
      return
    }

    // 显示用户信息
    this.showUserInfo()

    // 设置导航标题
    this.setNavTitle()

    // 渲染子页面导航
    this.renderSubNav()

    // 绑定全局事件
    this.bindGlobalEvents()

    // 从URL获取当前页面或默认第一个页面
    const urlParams = new URLSearchParams(window.location.search)
    const pageId = urlParams.get('page') || this.module.subPages[0]

    // 加载页面
    await this.loadPage(pageId)
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
   * 设置导航标题
   */
  setNavTitle() {
    document.title = `${this.module.name} - 管理后台`
    document.getElementById('pageTitle').textContent = `${this.module.name} - 管理后台`
    document.getElementById('navIcon').textContent = this.module.icon
    document.getElementById('navTitle').textContent = this.module.name
  }

  /**
   * 渲染子页面导航
   */
  renderSubNav() {
    const container = document.getElementById('subNavContainer')
    if (!container) return

    const pages = PageConfigRegistry.getModulePages(this.moduleId)

    const navHtml = `
      <div class="container-fluid">
        <ul class="nav nav-pills">
          ${pages
            .map(
              page => `
            <li class="nav-item">
              <a class="nav-link ${page.pageId === this.currentPageId ? 'active' : ''}" 
                 href="?page=${page.pageId}" 
                 data-page="${page.pageId}">
                <i class="bi ${page.icon} me-1"></i>${page.title}
              </a>
            </li>
          `
            )
            .join('')}
        </ul>
      </div>
    `

    container.innerHTML = navHtml

    // 绑定导航点击事件（使用SPA方式切换）
    container.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', async e => {
        e.preventDefault()
        const pageId = link.dataset.page
        await this.switchPage(pageId)
      })
    })
  }

  /**
   * 切换页面（SPA方式）
   */
  async switchPage(pageId) {
    if (pageId === this.currentPageId) return

    // 更新URL（不刷新页面）
    const url = new URL(window.location)
    url.searchParams.set('page', pageId)
    window.history.pushState({}, '', url)

    // 更新导航状态
    document.querySelectorAll('#subNavContainer .nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.page === pageId)
    })

    // 加载新页面
    await this.loadPage(pageId)
  }

  /**
   * 加载页面
   */
  async loadPage(pageId) {
    const pageConfig = PageConfigRegistry.getPageConfig(pageId)
    if (!pageConfig) {
      console.error(`页面配置不存在: ${pageId}`)
      this.showPageError(`页面 "${pageId}" 不存在`)
      return
    }

    this.currentPageId = pageId

    // 清空现有内容
    const container = document.getElementById('pageContainer')
    container.innerHTML =
      '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted">正在加载...</p></div>'

    // 清空模态框容器
    const modalsContainer = document.getElementById('modalsContainer')
    modalsContainer.innerHTML = ''

    try {
      // 根据页面类型选择渲染方式
      if (pageConfig.customLayout) {
        await this.loadCustomLayout(pageConfig)
      } else {
        await this.loadStandardPage(pageConfig)
      }
    } catch (error) {
      console.error('加载页面失败:', error)
      this.showPageError(error.message)
    }
  }

  /**
   * 加载标准页面（使用AdminPageFramework）
   */
  async loadStandardPage(pageConfig) {
    // 生成模态框HTML
    this.generateModals(pageConfig)

    // 创建AdminPageFramework实例
    this.currentPage = new AdminPageFramework({
      ...pageConfig,
      // 绑定自定义操作方法
      customRenders: this.getCustomRenders(pageConfig),
      onDataLoaded: (data, response) => this.onPageDataLoaded(pageConfig, data, response),
      beforeSubmit: (modalId, data) => this.beforeModalSubmit(pageConfig, modalId, data),
      afterSubmit: (modalId, response) => this.afterModalSubmit(pageConfig, modalId, response)
    })

    // 绑定操作回调
    this.bindActionCallbacks(pageConfig)

    // 初始化页面
    await this.currentPage.init()
  }

  /**
   * 加载自定义布局页面
   */
  async loadCustomLayout(pageConfig) {
    const container = document.getElementById('pageContainer')

    switch (pageConfig.customLayout) {
      case 'user-search-first':
        container.innerHTML = this.renderUserSearchLayout(pageConfig)
        this.initUserSearchLayout(pageConfig)
        break

      case 'stats-dashboard':
        container.innerHTML = this.renderStatsDashboard(pageConfig)
        await this.loadStatsDashboardData(pageConfig)
        break

      default:
        // 回退到标准布局
        await this.loadStandardPage(pageConfig)
    }
  }

  /**
   * 渲染用户搜索优先布局
   */
  renderUserSearchLayout(pageConfig) {
    const filtersHtml = pageConfig.filters
      .map(
        filter => `
      <div class="col-md-${filter.col || 4}">
        <label class="form-label">${filter.label}</label>
        <input type="${filter.type}" class="form-control" id="filter_${filter.key}" placeholder="${filter.placeholder || ''}">
      </div>
    `
      )
      .join('')

    return `
      <!-- 搜索区域 -->
      <div class="card mb-3">
        <div class="card-body">
          <h5 class="mb-3">
            <i class="bi bi-search"></i> ${pageConfig.title}
          </h5>
          <form id="searchForm" class="row g-3">
            ${filtersHtml}
            <div class="col-md-${12 - pageConfig.filters.reduce((sum, f) => sum + (f.col || 4), 0)} d-flex align-items-end">
              <button type="submit" class="btn btn-primary w-100">
                <i class="bi bi-search"></i> 查询
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- 用户信息区域（默认隐藏） -->
      <div id="userInfoSection" style="display: none;">
        <div class="card mb-3">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <h5 class="mb-1">
                  <i class="bi bi-person-circle"></i> <span id="userNickname">-</span>
                </h5>
                <p class="mb-0 text-muted">
                  <small>用户ID: <code id="userId">-</code> | 手机号: <span id="userMobile">-</span></small>
                </p>
              </div>
              ${
                pageConfig.headerActions?.length > 0
                  ? `
                <div class="d-flex gap-2">
                  ${pageConfig.headerActions
                    .map(
                      action => `
                    <button class="btn btn-${action.type || 'primary'}" 
                            ${action.modal ? `data-bs-toggle="modal" data-bs-target="#${action.modal}"` : ''}
                            ${action.id ? `id="${action.id}"` : ''}>
                      <i class="bi ${action.icon}"></i> ${action.label}
                    </button>
                  `
                    )
                    .join('')}
                </div>
              `
                  : ''
              }
            </div>
          </div>
        </div>

        <!-- 数据列表 -->
        <div class="card">
          <div class="card-body">
            <h5 class="mb-3">
              <i class="bi ${pageConfig.icon}"></i> ${pageConfig.subtitle || '数据列表'}
            </h5>
            <div class="table-responsive">
              <table class="table table-hover align-middle">
                <thead class="table-light">
                  <tr>
                    ${pageConfig.columns.map(col => `<th>${col.label}</th>`).join('')}
                    ${pageConfig.actions?.length > 0 ? '<th style="width: 200px;">操作</th>' : ''}
                  </tr>
                </thead>
                <tbody id="dataTableBody">
                  <tr>
                    <td colspan="${pageConfig.columns.length + (pageConfig.actions?.length > 0 ? 1 : 0)}" class="text-center py-5">
                      <i class="bi bi-inbox text-muted" style="font-size: 3rem;"></i>
                      <p class="mt-2 text-muted">请先搜索用户</p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态提示 -->
      <div id="emptyState" class="text-center py-5">
        <i class="bi bi-search text-muted" style="font-size: 4rem;"></i>
        <p class="mt-3 text-muted">${pageConfig.subtitle || '请输入条件进行查询'}</p>
      </div>
    `
  }

  /**
   * 初始化用户搜索布局
   */
  initUserSearchLayout(pageConfig) {
    const form = document.getElementById('searchForm')
    if (form) {
      form.addEventListener('submit', async e => {
        e.preventDefault()
        await this.handleUserSearch(pageConfig)
      })
    }

    // 生成模态框
    this.generateModals(pageConfig)
  }

  /**
   * 处理用户搜索
   */
  async handleUserSearch(pageConfig) {
    // 收集搜索参数
    const params = {}
    pageConfig.filters.forEach(filter => {
      const el = document.getElementById(`filter_${filter.key}`)
      if (el && el.value.trim()) {
        params[filter.key] = el.value.trim()
      }
    })

    if (Object.keys(params).length === 0) {
      this.showError('请至少输入一个搜索条件')
      return
    }

    // 显示加载状态
    document.getElementById('emptyState').style.display = 'none'
    document.getElementById('userInfoSection').style.display = 'block'

    const tbody = document.getElementById('dataTableBody')
    tbody.innerHTML = `
      <tr>
        <td colspan="${pageConfig.columns.length + 1}" class="text-center py-5">
          <div class="spinner-border text-primary"></div>
          <p class="mt-2 text-muted">正在查询...</p>
        </td>
      </tr>
    `

    try {
      const queryString = new URLSearchParams(params).toString()
      const url = `${pageConfig.apiEndpoint}/${params.user_id || params.mobile}/balance?${queryString}`
      const response = await apiRequest(url)

      if (response && response.success) {
        this.renderUserSearchResults(pageConfig, response.data)
      } else {
        throw new Error(response?.message || '查询失败')
      }
    } catch (error) {
      console.error('查询失败:', error)
      tbody.innerHTML = `
        <tr>
          <td colspan="${pageConfig.columns.length + 1}" class="text-center py-5 text-danger">
            <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
            <p class="mt-2">${error.message}</p>
          </td>
        </tr>
      `
    }
  }

  /**
   * 渲染用户搜索结果
   */
  renderUserSearchResults(pageConfig, data) {
    // 更新用户信息
    if (data.user) {
      document.getElementById('userNickname').textContent = data.user.nickname || '-'
      document.getElementById('userId').textContent = data.user.user_id || '-'
      document.getElementById('userMobile').textContent = data.user.mobile || '-'
    }

    // 渲染数据表格
    const tbody = document.getElementById('dataTableBody')
    const items = data.balances || data.items || data.list || []

    if (items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${pageConfig.columns.length + 1}" class="text-center py-5">
            <i class="bi bi-inbox text-muted" style="font-size: 3rem;"></i>
            <p class="mt-2 text-muted">暂无数据</p>
          </td>
        </tr>
      `
      return
    }

    tbody.innerHTML = items
      .map(row => {
        const cells = pageConfig.columns
          .map(col => {
            let value = this.getNestedValue(row, col.key)
            value = this.formatCellValue(value, col)
            return `<td>${value}</td>`
          })
          .join('')

        const actionCells =
          pageConfig.actions?.length > 0
            ? `
        <td>
          ${pageConfig.actions
            .map(action => {
              if (action.visible && !action.visible(row)) return ''
              const btnClass =
                typeof action.type === 'function' ? action.type(row) : action.type || 'primary'
              const icon = typeof action.icon === 'function' ? action.icon(row) : action.icon
              const label = typeof action.label === 'function' ? action.label(row) : action.label
              return `
              <button class="btn btn-sm btn-${btnClass}" 
                      data-action="${action.key}"
                      data-id="${row[pageConfig.primaryKey]}">
                <i class="bi ${icon}"></i> ${label}
              </button>
            `
            })
            .join(' ')}
        </td>
      `
            : ''

        return `<tr data-id="${row[pageConfig.primaryKey]}">${cells}${actionCells}</tr>`
      })
      .join('')

    // 绑定操作按钮事件
    tbody.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', e => this.handleTableAction(pageConfig, e))
    })
  }

  /**
   * 渲染统计仪表板布局
   */
  renderStatsDashboard(pageConfig) {
    const statsHtml = pageConfig.stats
      .map(
        stat => `
      <div class="col-md-3">
        <div class="card">
          <div class="card-body text-center">
            <h6 class="text-muted">${stat.label}</h6>
            <h3 class="text-${stat.color || 'primary'}" id="stat_${stat.key}">-</h3>
          </div>
        </div>
      </div>
    `
      )
      .join('')

    const filtersHtml =
      pageConfig.filters
        ?.map(
          filter => `
      <div class="col-md-${filter.col || 3}">
        <label class="form-label">${filter.label}</label>
        ${
          filter.type === 'select'
            ? `
          <select class="form-select" id="filter_${filter.key}">
            ${filter.options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
          </select>
        `
            : `
          <input type="${filter.type}" class="form-control" id="filter_${filter.key}" placeholder="${filter.placeholder || ''}">
        `
        }
      </div>
    `
        )
        .join('') || ''

    return `
      <!-- 页头 -->
      <div class="card mb-3">
        <div class="card-body">
          <h5 class="mb-0">
            <i class="bi ${pageConfig.icon}"></i> ${pageConfig.title}
          </h5>
          <small class="text-muted">${pageConfig.subtitle || ''}</small>
        </div>
      </div>

      <!-- 统计卡片 -->
      <div class="row g-3 mb-3">
        ${statsHtml}
      </div>

      <!-- 筛选器 -->
      ${
        filtersHtml
          ? `
        <div class="card mb-3">
          <div class="card-body">
            <form id="filterForm" class="row g-3">
              ${filtersHtml}
              <div class="col-md-3 d-flex align-items-end">
                <button type="submit" class="btn btn-primary">
                  <i class="bi bi-search"></i> 查询
                </button>
              </div>
            </form>
          </div>
        </div>
      `
          : ''
      }

      <!-- 图表区域（可选） -->
      <div class="card">
        <div class="card-body">
          <div id="chartContainer" class="text-center py-5 text-muted">
            <i class="bi bi-bar-chart" style="font-size: 3rem;"></i>
            <p class="mt-2">统计图表将在此显示</p>
          </div>
        </div>
      </div>
    `
  }

  /**
   * 加载统计仪表板数据
   */
  async loadStatsDashboardData(pageConfig) {
    try {
      const response = await apiRequest(pageConfig.apiEndpoint)

      if (response && response.success) {
        // 更新统计数据
        pageConfig.stats.forEach(stat => {
          const el = document.getElementById(`stat_${stat.key}`)
          if (el) {
            let value = '-'
            if (stat.field) {
              value = this.getNestedValue(response.data, stat.field) ?? '-'
            } else if (stat.compute) {
              value = stat.compute(response.data)
            }
            el.textContent = value
          }
        })
      }
    } catch (error) {
      console.error('加载统计数据失败:', error)
    }

    // 绑定筛选表单
    const form = document.getElementById('filterForm')
    if (form) {
      form.addEventListener('submit', async e => {
        e.preventDefault()
        await this.loadStatsDashboardData(pageConfig)
      })
    }
  }

  /**
   * 生成模态框HTML
   */
  generateModals(pageConfig) {
    const container = document.getElementById('modalsContainer')
    if (!container || !pageConfig.modals) return

    let modalsHtml = ''

    Object.entries(pageConfig.modals).forEach(([modalId, config]) => {
      const fieldsHtml =
        config.fields
          ?.map(
            field => `
        <div class="col-md-${field.col || 12}">
          <label class="form-label">${field.label} ${field.required ? '<span class="text-danger">*</span>' : ''}</label>
          ${this.generateFieldInput(field)}
          ${field.hint ? `<small class="text-muted">${field.hint}</small>` : ''}
        </div>
      `
          )
          .join('') || ''

      modalsHtml += `
        <div class="modal fade" id="${modalId}" tabindex="-1">
          <div class="modal-dialog ${config.size === 'lg' ? 'modal-lg' : ''}">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">
                  <i class="bi ${config.icon || 'bi-pencil'}"></i> ${config.title}
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">
                <form id="${config.formId || modalId + 'Form'}" class="row g-3">
                  ${fieldsHtml}
                </form>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                <button type="button" class="btn btn-primary" id="${config.submitBtn || modalId + 'SubmitBtn'}">
                  <i class="bi bi-check-lg"></i> 确认
                </button>
              </div>
            </div>
          </div>
        </div>
      `
    })

    container.innerHTML = modalsHtml

    // 初始化Bootstrap模态框
    Object.keys(pageConfig.modals).forEach(modalId => {
      const el = document.getElementById(modalId)
      if (el) {
        new bootstrap.Modal(el)
      }
    })
  }

  /**
   * 生成表单字段输入控件
   */
  generateFieldInput(field) {
    switch (field.type) {
      case 'select':
        return `
          <select class="form-select" id="${field.id}" ${field.required ? 'required' : ''} ${field.disabled ? 'disabled' : ''}>
            ${field.options?.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('') || ''}
          </select>
        `
      case 'textarea':
        return `
          <textarea class="form-control" id="${field.id}" rows="${field.rows || 3}" 
                    ${field.required ? 'required' : ''} placeholder="${field.placeholder || ''}"></textarea>
        `
      case 'number':
        return `
          <input type="number" class="form-control" id="${field.id}" 
                 ${field.required ? 'required' : ''} 
                 ${field.min !== undefined ? `min="${field.min}"` : ''} 
                 ${field.max !== undefined ? `max="${field.max}"` : ''}
                 ${field.disabled ? 'disabled' : ''}
                 value="${field.default || ''}"
                 placeholder="${field.placeholder || ''}">
        `
      default:
        return `
          <input type="${field.type || 'text'}" class="form-control" id="${field.id}" 
                 ${field.required ? 'required' : ''} 
                 ${field.disabled ? 'disabled' : ''}
                 value="${field.default || ''}"
                 placeholder="${field.placeholder || ''}">
        `
    }
  }

  /**
   * 获取嵌套属性值
   */
  getNestedValue(obj, path) {
    if (!path) return obj
    return path.split('.').reduce((current, key) => current?.[key], obj)
  }

  /**
   * 格式化单元格值
   */
  formatCellValue(value, col) {
    if (value === null || value === undefined) return '-'

    switch (col.type) {
      case 'code':
        return `<code>${this.escapeHtml(value)}</code>`
      case 'badge':
        const badgeClass = col.badgeMap?.[value] || 'secondary'
        const badgeText = col.labelMap?.[value] || value
        return `<span class="badge bg-${badgeClass}">${badgeText}</span>`
      case 'status':
        const statusConfig = col.statusMap?.[value] || {
          class: value ? 'success' : 'secondary',
          label: value ? '是' : '否'
        }
        return `<span class="badge bg-${statusConfig.class}">${statusConfig.label}</span>`
      case 'datetime':
        return this.formatDateTime(value)
      case 'date':
        return this.formatDate(value)
      case 'currency':
        return `<span class="text-${col.color || 'primary'} fw-bold">${value}</span>`
      case 'image':
        return value
          ? `<img src="${value}" style="max-width: 50px; max-height: 50px;" class="rounded">`
          : '-'
      default:
        if (col.render) {
          return col.render(value)
        }
        return this.escapeHtml(String(value))
    }
  }

  /**
   * 获取自定义渲染器
   */
  getCustomRenders(pageConfig) {
    const renders = {}
    pageConfig.columns?.forEach(col => {
      if (col.render) {
        renders[col.key] = col.render
      }
    })
    return renders
  }

  /**
   * 绑定操作回调
   */
  bindActionCallbacks(pageConfig) {
    if (!this.currentPage || !pageConfig.actions) return

    pageConfig.actions.forEach(action => {
      if (action.onClick && typeof action.onClick === 'string') {
        // 绑定预定义的操作方法
        const methodName = action.onClick
        this.currentPage.actions.find(a => a.key === action.key).onClick = (row, data, e) => {
          this[methodName]?.(pageConfig, row, data, e)
        }
      }
    })
  }

  /**
   * 处理表格操作
   */
  handleTableAction(pageConfig, e) {
    const btn = e.target.closest('[data-action]')
    if (!btn) return

    const actionKey = btn.dataset.action
    const id = btn.dataset.id

    const action = pageConfig.actions?.find(a => a.key === actionKey)
    if (action && action.onClick) {
      if (typeof action.onClick === 'string') {
        this[action.onClick]?.(pageConfig, { [pageConfig.primaryKey]: id }, btn.dataset, e)
      } else {
        action.onClick({ [pageConfig.primaryKey]: id }, btn.dataset, e)
      }
    }
  }

  // ==================== 通用操作方法 ====================

  /**
   * 打开编辑模态框
   */
  openEditModal(pageConfig, row) {
    const modalConfig = pageConfig.modals?.editModal
    if (!modalConfig) return

    // 填充表单数据
    modalConfig.fields?.forEach(field => {
      const el = document.getElementById(field.id)
      if (el) {
        el.value = row[field.key] ?? ''
      }
    })

    // 显示模态框
    const modal =
      bootstrap.Modal.getInstance(document.getElementById('editModal')) ||
      new bootstrap.Modal(document.getElementById('editModal'))
    modal.show()
  }

  /**
   * 切换状态
   */
  async toggleStatus(pageConfig, row) {
    const primaryKey = row[pageConfig.primaryKey]
    const currentStatus = row.is_enabled || row.status === 'active'
    const action = currentStatus ? 'disable' : 'enable'

    if (!confirm(`确定要${currentStatus ? '禁用' : '启用'}此项吗？`)) return

    try {
      const url = `${pageConfig.apiEndpoint}/${primaryKey}/${action}`
      const response = await apiRequest(url, { method: 'PUT' })

      if (response && response.success) {
        this.showSuccess(`${currentStatus ? '禁用' : '启用'}成功`)
        this.currentPage?.refresh()
      } else {
        throw new Error(response?.message || '操作失败')
      }
    } catch (error) {
      this.showError(error.message)
    }
  }

  /**
   * 显示详情
   */
  async showDetail(pageConfig, row) {
    console.log('显示详情:', row)

    // 用户详情增强处理
    if (pageConfig.pageId === 'user-list' && row.user_id) {
      await this.showUserDetailEnhanced(row)
      return
    }

    // 默认详情展示
    this.showGenericDetail(pageConfig, row)
  }

  /**
   * 增强版用户详情展示（P1第11项需求）
   */
  async showUserDetailEnhanced(user) {
    const userId = user.user_id
    const detailData = {
      basic: user,
      roles: [],
      premium: null,
      riskProfile: null,
      error: null
    }

    // 并行加载用户相关数据
    try {
      const [rolesRes, premiumRes, riskRes] = await Promise.allSettled([
        apiRequest(`/api/v4/console/system-data/user-roles?user_id=${userId}`),
        apiRequest(`/api/v4/console/user-premium/${userId}`),
        apiRequest(`/api/v4/console/risk-profiles/user/${userId}`)
      ])

      if (rolesRes.status === 'fulfilled' && rolesRes.value?.success) {
        detailData.roles = rolesRes.value.data || []
      }
      if (premiumRes.status === 'fulfilled' && premiumRes.value?.success) {
        detailData.premium = premiumRes.value.data
      }
      if (riskRes.status === 'fulfilled' && riskRes.value?.success) {
        detailData.riskProfile = riskRes.value.data
      }
    } catch (error) {
      console.error('加载用户扩展数据失败:', error)
      detailData.error = error.message
    }

    // 生成详情HTML
    const detailHtml = this.generateUserDetailHtml(detailData)
    this.showDetailModal('用户详情', detailHtml)
  }

  /**
   * 生成用户详情HTML
   */
  generateUserDetailHtml(data) {
    const { basic, roles, premium, riskProfile } = data
    const roleNames = roles.length > 0 
      ? roles.map(r => `<span class="badge bg-primary me-1">${r.role_name || r.name || '角色'}</span>`).join('') 
      : '<span class="text-muted">无角色分配</span>'

    return `
      <div class="row">
        <!-- 基本信息 -->
        <div class="col-md-6 mb-3">
          <div class="card h-100">
            <div class="card-header bg-primary text-white">
              <i class="bi bi-person me-2"></i>基本信息
            </div>
            <div class="card-body">
              <table class="table table-sm mb-0">
                <tr><th width="120">用户ID</th><td>${basic.user_id}</td></tr>
                <tr><th>昵称</th><td>${basic.nickname || '-'}</td></tr>
                <tr><th>手机号</th><td>${basic.mobile || '-'}</td></tr>
                <tr><th>状态</th><td><span class="badge ${basic.status === 'active' ? 'bg-success' : 'bg-danger'}">${basic.status === 'active' ? '正常' : '封禁'}</span></td></tr>
                <tr><th>积分</th><td><span class="text-warning">${basic.points || 0}</span></td></tr>
                <tr><th>注册时间</th><td>${basic.created_at ? new Date(basic.created_at).toLocaleString('zh-CN') : '-'}</td></tr>
                <tr><th>最后登录</th><td>${basic.last_login ? new Date(basic.last_login).toLocaleString('zh-CN') : '-'}</td></tr>
              </table>
            </div>
          </div>
        </div>
        
        <!-- 角色信息 -->
        <div class="col-md-6 mb-3">
          <div class="card h-100">
            <div class="card-header bg-info text-white">
              <i class="bi bi-shield me-2"></i>角色权限
            </div>
            <div class="card-body">
              <div class="mb-3">
                <label class="form-label fw-bold">当前角色</label>
                <div>${roleNames}</div>
              </div>
              ${premium ? `
              <div class="mb-3">
                <label class="form-label fw-bold">高级状态</label>
                <div>
                  <span class="badge ${premium.is_unlocked ? 'bg-success' : 'bg-secondary'}">
                    ${premium.is_unlocked ? '已解锁' : '未解锁'}
                  </span>
                  ${premium.expire_time ? `<small class="text-muted ms-2">过期时间: ${new Date(premium.expire_time).toLocaleString('zh-CN')}</small>` : ''}
                </div>
              </div>
              ` : '<div class="text-muted">高级状态信息不可用</div>'}
            </div>
          </div>
        </div>
        
        <!-- 风控配置 -->
        <div class="col-md-12 mb-3">
          <div class="card">
            <div class="card-header bg-warning text-dark">
              <i class="bi bi-shield-exclamation me-2"></i>风控配置
            </div>
            <div class="card-body">
              ${riskProfile ? `
              <div class="row">
                <div class="col-md-3">
                  <div class="text-center p-3 bg-light rounded">
                    <div class="fs-4 fw-bold text-primary">${riskProfile.daily_draw_limit || '无限制'}</div>
                    <div class="text-muted small">日抽奖限次</div>
                  </div>
                </div>
                <div class="col-md-3">
                  <div class="text-center p-3 bg-light rounded">
                    <div class="fs-4 fw-bold text-info">${riskProfile.daily_amount_limit || '无限制'}</div>
                    <div class="text-muted small">日消费限额</div>
                  </div>
                </div>
                <div class="col-md-3">
                  <div class="text-center p-3 bg-light rounded">
                    <div class="fs-4 fw-bold text-warning">${riskProfile.risk_level || '正常'}</div>
                    <div class="text-muted small">风险等级</div>
                  </div>
                </div>
                <div class="col-md-3">
                  <div class="text-center p-3 bg-light rounded">
                    <div class="fs-4 fw-bold ${riskProfile.is_blocked ? 'text-danger' : 'text-success'}">${riskProfile.is_blocked ? '已阻断' : '正常'}</div>
                    <div class="text-muted small">阻断状态</div>
                  </div>
                </div>
              </div>
              ` : '<div class="text-muted text-center py-3">风控配置信息不可用</div>'}
            </div>
          </div>
        </div>
      </div>
    `
  }

  /**
   * 通用详情展示
   */
  showGenericDetail(pageConfig, row) {
    const columns = pageConfig.columns || []
    let html = '<table class="table table-sm">'
    
    columns.forEach(col => {
      const value = row[col.key]
      let displayValue = value
      
      if (col.type === 'datetime' && value) {
        displayValue = new Date(value).toLocaleString('zh-CN')
      } else if (col.type === 'status') {
        displayValue = `<span class="badge bg-${value === 'active' ? 'success' : 'secondary'}">${value}</span>`
      } else if (col.type === 'badge') {
        displayValue = `<span class="badge bg-primary">${value}</span>`
      } else if (col.type === 'currency') {
        displayValue = `<span class="text-${col.color || 'primary'}">${value}</span>`
      }
      
      html += `<tr><th width="150">${col.label}</th><td>${displayValue ?? '-'}</td></tr>`
    })
    
    html += '</table>'
    this.showDetailModal(pageConfig.title + ' 详情', html)
  }

  /**
   * 显示详情模态框
   */
  showDetailModal(title, content) {
    // 检查是否已存在详情模态框
    let modal = document.getElementById('detailModal')
    if (!modal) {
      // 创建模态框
      modal = document.createElement('div')
      modal.id = 'detailModal'
      modal.className = 'modal fade'
      modal.tabIndex = -1
      modal.innerHTML = `
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="detailModalTitle"></h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body" id="detailModalBody"></div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
            </div>
          </div>
        </div>
      `
      document.body.appendChild(modal)
    }

    // 更新内容
    document.getElementById('detailModalTitle').textContent = title
    document.getElementById('detailModalBody').innerHTML = content

    // 显示模态框
    const bsModal = new bootstrap.Modal(modal)
    bsModal.show()
  }

  /**
   * 删除项目
   */
  async deleteItem(pageConfig, row) {
    const primaryKey = row[pageConfig.primaryKey]

    if (!confirm('确定要删除此项吗？此操作不可恢复。')) return

    try {
      const url = `${pageConfig.apiEndpoint}/${primaryKey}`
      const response = await apiRequest(url, { method: 'DELETE' })

      if (response && response.success) {
        this.showSuccess('删除成功')
        this.currentPage?.refresh()
      } else {
        throw new Error(response?.message || '删除失败')
      }
    } catch (error) {
      this.showError(error.message)
    }
  }

  // ==================== 页面数据回调 ====================

  onPageDataLoaded(pageConfig, data, response) {
    // 可以在这里处理数据加载后的逻辑
  }

  beforeModalSubmit(pageConfig, modalId, data) {
    // 可以在这里处理提交前的数据转换
    return data
  }

  afterModalSubmit(pageConfig, modalId, response) {
    // 可以在这里处理提交后的逻辑
  }

  // ==================== 全局事件 ====================

  bindGlobalEvents() {
    // 退出登录
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      if (typeof logout === 'function') logout()
    })

    // 浏览器前进/后退
    window.addEventListener('popstate', async () => {
      const params = new URLSearchParams(window.location.search)
      const pageId = params.get('page') || this.module.subPages[0]
      await this.loadPage(pageId)

      // 更新导航状态
      document.querySelectorAll('#subNavContainer .nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.page === pageId)
      })
    })
  }

  // ==================== 辅助方法 ====================

  showPageError(message) {
    const container = document.getElementById('pageContainer')
    container.innerHTML = `
      <div class="text-center py-5">
        <i class="bi bi-exclamation-triangle text-danger" style="font-size: 4rem;"></i>
        <h4 class="mt-3">页面加载失败</h4>
        <p class="text-muted">${this.escapeHtml(message)}</p>
        <button class="btn btn-primary" onclick="location.reload()">
          <i class="bi bi-arrow-clockwise"></i> 重新加载
        </button>
      </div>
    `
  }

  showSuccess(message) {
    if (typeof showSuccessToast === 'function') {
      showSuccessToast(message)
    } else {
      const toast = document.getElementById('successToast')
      const body = document.getElementById('successToastBody')
      if (toast && body) {
        body.textContent = message
        bootstrap.Toast.getOrCreateInstance(toast).show()
      } else {
        alert('✅ ' + message)
      }
    }
  }

  showError(message) {
    if (typeof showErrorToast === 'function') {
      showErrorToast(message)
    } else {
      const toast = document.getElementById('errorToast')
      const body = document.getElementById('errorToastBody')
      if (toast && body) {
        body.textContent = message
        bootstrap.Toast.getOrCreateInstance(toast).show()
      } else {
        alert('❌ ' + message)
      }
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
}

// 导出到全局
window.UnifiedPageLoader = UnifiedPageLoader
