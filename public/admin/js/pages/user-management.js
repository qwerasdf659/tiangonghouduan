/**
 * 用户管理中心 - 整合页面 JavaScript
 * 整合了：用户列表、用户层级、商家积分审核
 */

document.addEventListener('DOMContentLoaded', function () {
  // 权限检查
  checkAdminPermission()

  // 显示欢迎信息
  const currentUser = getCurrentUser()
  if (currentUser) {
    document.getElementById('welcomeText').textContent =
      `欢迎，${currentUser.nickname || currentUser.mobile || '管理员'}`
  }

  // 退出按钮
  document.getElementById('logoutBtn').addEventListener('click', logout)

  // Tab切换处理
  const tabs = document.querySelectorAll('#userManagementTabs button')
  tabs.forEach(tab => {
    tab.addEventListener('shown.bs.tab', function (e) {
      const tabId = e.target.id
      switch (tabId) {
        case 'users-tab':
          usersModule.loadData()
          break
        case 'hierarchy-tab':
          hierarchyModule.loadData()
          break
        case 'merchant-points-tab':
          merchantPointsModule.loadData()
          break
      }
    })
  })

  // 初始加载用户列表
  usersModule.init()
  hierarchyModule.init()
  merchantPointsModule.init()
  usersModule.loadData()
})

// ==================== 用户列表模块 ====================
const usersModule = {
  currentPage: 1,
  pageSize: 10,
  users: [],

  init() {
    // 搜索按钮
    document.getElementById('userSearchBtn').addEventListener('click', () => {
      this.currentPage = 1
      this.loadData()
    })

    // 重置按钮
    document.getElementById('userResetBtn').addEventListener('click', () => {
      document.getElementById('userTypeFilter').value = 'all'
      document.getElementById('userStatusFilter').value = 'all'
      document.getElementById('userSearchInput').value = ''
      this.currentPage = 1
      this.loadData()
    })

    // 筛选器变化
    document.getElementById('userTypeFilter').addEventListener('change', () => {
      this.currentPage = 1
      this.loadData()
    })
    document.getElementById('userStatusFilter').addEventListener('change', () => {
      this.currentPage = 1
      this.loadData()
    })
  },

  async loadData() {
    showLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('page', this.currentPage)
      params.append('page_size', this.pageSize)

      const userType = document.getElementById('userTypeFilter').value
      const status = document.getElementById('userStatusFilter').value
      const search = document.getElementById('userSearchInput').value.trim()

      if (userType && userType !== 'all') params.append('user_type', userType)
      if (status && status !== 'all') params.append('status', status)
      if (search) params.append('search', search)

      const response = await apiRequest(
        API_ENDPOINTS.USER.LIST + '?' + params.toString()
      )

      if (response && response.success) {
        this.users = response.data.users || response.data.items || []
        this.renderStats(response.data.stats || {})
        this.renderTable(this.users)
        this.renderPagination(response.data.pagination)
      } else {
        showErrorToast(response?.message || '加载用户列表失败')
        this.renderEmptyTable()
      }
    } catch (error) {
      console.error('加载用户列表失败:', error)
      showErrorToast(error.message || '网络错误')
      this.renderEmptyTable()
    } finally {
      showLoading(false)
    }
  },

  renderStats(stats) {
    document.getElementById('totalUsers').textContent = stats.total || this.users.length || '-'
    document.getElementById('todayUsers').textContent = stats.today || '-'
    document.getElementById('activeUsers').textContent = stats.active || '-'
    document.getElementById('vipUsers').textContent = stats.vip || '-'
  },

  renderTable(users) {
    const tbody = document.getElementById('usersTableBody')

    if (!users || users.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-5">
            <i class="bi bi-inbox text-muted" style="font-size: 3rem;"></i>
            <p class="mt-2 text-muted">暂无用户数据</p>
          </td>
        </tr>
      `
      return
    }

    tbody.innerHTML = users
      .map(
        user => `
      <tr>
        <td><code>${user.user_id}</code></td>
        <td>
          <div class="d-flex align-items-center">
            <img src="${user.avatar_url || '/admin/images/default-avatar.png'}" 
                 class="rounded-circle me-2" width="40" height="40" 
                 onerror="this.src='/admin/images/default-avatar.png'">
            <div>
              <div class="fw-bold">${user.nickname || '未设置昵称'}</div>
              <small class="text-muted">${user.mobile || '-'}</small>
            </div>
          </div>
        </td>
        <td>
          ${user.role_level >= 100 ? '<span class="badge bg-danger">管理员</span>' : ''}
          ${user.role_level >= 50 && user.role_level < 100 ? '<span class="badge bg-warning">高级用户</span>' : ''}
          ${user.role_level < 50 ? '<span class="badge bg-secondary">普通用户</span>' : ''}
          ${user.roles && user.roles.length > 0 ? user.roles.map(r => `<span class="badge bg-info ms-1">${r}</span>`).join('') : ''}
        </td>
        <td><span class="badge bg-info">${user.history_total_points || 0}</span></td>
        <td><small>${this.formatDate(user.created_at)}</small></td>
        <td><small>${this.formatDate(user.last_login)}</small></td>
        <td>
          <span class="badge ${user.status === 'banned' ? 'bg-danger' : 'bg-success'}">
            ${user.status === 'banned' ? '已封禁' : '正常'}
          </span>
        </td>
        <td>
          <button class="btn btn-sm btn-outline-primary" onclick="usersModule.viewDetail(${user.user_id})">
            <i class="bi bi-eye"></i>
          </button>
          <button class="btn btn-sm btn-outline-secondary" onclick="usersModule.manageRoles(${user.user_id})">
            <i class="bi bi-shield"></i>
          </button>
          <button class="btn btn-sm ${user.status === 'banned' ? 'btn-outline-success' : 'btn-outline-danger'}" 
                  onclick="usersModule.toggleBan(${user.user_id}, '${user.status}')">
            <i class="bi ${user.status === 'banned' ? 'bi-unlock' : 'bi-lock'}"></i>
          </button>
        </td>
      </tr>
    `
      )
      .join('')
  },

  renderEmptyTable() {
    document.getElementById('usersTableBody').innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-5 text-danger">
          <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
          <p class="mt-2">加载失败</p>
        </td>
      </tr>
    `
  },

  renderPagination(pagination) {
    const container = document.getElementById('usersPagination')
    if (!pagination || pagination.total_pages <= 1) {
      container.innerHTML = ''
      return
    }

    let html = ''
    html += `<li class="page-item ${this.currentPage === 1 ? 'disabled' : ''}">
               <a class="page-link" href="#" onclick="usersModule.changePage(${this.currentPage - 1})">上一页</a>
             </li>`

    for (let i = 1; i <= pagination.total_pages; i++) {
      html += `<li class="page-item ${this.currentPage === i ? 'active' : ''}">
                 <a class="page-link" href="#" onclick="usersModule.changePage(${i})">${i}</a>
               </li>`
    }

    html += `<li class="page-item ${this.currentPage === pagination.total_pages ? 'disabled' : ''}">
               <a class="page-link" href="#" onclick="usersModule.changePage(${this.currentPage + 1})">下一页</a>
             </li>`

    container.innerHTML = html
  },

  changePage(page) {
    if (page < 1) return
    this.currentPage = page
    this.loadData()
  },

  async viewDetail(userId) {
    showLoading(true)
    try {
      // 并行加载用户基本信息、高级状态、风控配置、抽奖状态
      const [userRes, premiumRes, riskRes, globalStateRes] = await Promise.allSettled([
        apiRequest(API.buildURL(API_ENDPOINTS.USER.DETAIL, { user_id: userId })),
        apiRequest(API.buildURL(API_ENDPOINTS.USER_PREMIUM.DETAIL, { user_id: userId })),
        apiRequest(API.buildURL(API_ENDPOINTS.RISK_PROFILES.USER, { user_id: userId })),
        apiRequest(API.buildURL(API_ENDPOINTS.LOTTERY_MONITORING.USER_GLOBAL_DETAIL, { user_id: userId }))
      ])

      if (userRes.status === 'fulfilled' && userRes.value && userRes.value.success) {
        const user = userRes.value.data.user || userRes.value.data

        // 解析高级状态
        let premiumHtml = '<span class="badge bg-secondary">未解锁</span>'
        if (premiumRes.status === 'fulfilled' && premiumRes.value?.success && premiumRes.value.data) {
          const premium = premiumRes.value.data
          if (premium.is_unlocked) {
            const expireDate = premium.expire_time ? this.formatDate(premium.expire_time) : '永久'
            premiumHtml = `<span class="badge bg-warning">✨ 已解锁</span> <small class="text-muted">到期：${expireDate}</small>`
          }
        }

        // 解析风控配置
        let riskHtml = '-'
        if (riskRes.status === 'fulfilled' && riskRes.value?.success && riskRes.value.data) {
          const risk = riskRes.value.data
          riskHtml = `
            <small>
              日限次：<span class="badge bg-info">${risk.daily_draw_limit || '无限'}</span>
              日限额：<span class="badge bg-info">${risk.daily_amount_limit || '无限'}</span>
              风险等级：<span class="badge ${risk.risk_level === 'high' ? 'bg-danger' : risk.risk_level === 'medium' ? 'bg-warning' : 'bg-success'}">${risk.risk_level || '正常'}</span>
            </small>
          `
        }

        // 解析全局运气状态
        let luckHtml = '-'
        if (globalStateRes.status === 'fulfilled' && globalStateRes.value?.success && globalStateRes.value.data) {
          const luck = globalStateRes.value.data
          const emptyRate = luck.historical_empty_rate ? (luck.historical_empty_rate * 100).toFixed(1) + '%' : '-'
          luckHtml = `
            <small>
              历史空奖率：<span class="badge bg-secondary">${emptyRate}</span>
              运气债务：<span class="badge ${luck.luck_debt > 0 ? 'bg-warning' : 'bg-success'}">${luck.luck_debt || 0}</span>
              总抽奖次数：<span class="badge bg-primary">${luck.total_draws || 0}</span>
            </small>
          `
        }

        // 渲染角色标签
        const rolesHtml =
          user.roles && user.roles.length > 0
            ? user.roles.map(r => `<span class="badge bg-info me-1">${r}</span>`).join('')
            : '<span class="text-muted">无角色</span>'

        document.getElementById('userDetailBody').innerHTML = `
          <div class="row">
            <div class="col-md-4 text-center">
              <img src="${user.avatar_url || '/admin/images/default-avatar.png'}" 
                   class="rounded-circle mb-3" width="100" height="100"
                   onerror="this.src='/admin/images/default-avatar.png'">
              <h5>${user.nickname || '未设置昵称'}</h5>
              <p class="text-muted">${user.mobile || '-'}</p>
              <div class="mb-2">${rolesHtml}</div>
              <div>${premiumHtml}</div>
            </div>
            <div class="col-md-8">
              <ul class="nav nav-tabs mb-3" id="userDetailTabs" role="tablist">
                <li class="nav-item" role="presentation">
                  <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#basicInfo" type="button">基本信息</button>
                </li>
                <li class="nav-item" role="presentation">
                  <button class="nav-link" data-bs-toggle="tab" data-bs-target="#riskInfo" type="button">风控配置</button>
                </li>
                <li class="nav-item" role="presentation">
                  <button class="nav-link" data-bs-toggle="tab" data-bs-target="#lotteryInfo" type="button">抽奖状态</button>
                </li>
              </ul>
              <div class="tab-content">
                <div class="tab-pane fade show active" id="basicInfo">
                  <table class="table table-sm">
                    <tr><td class="text-muted" width="120">用户ID</td><td>${user.user_id}</td></tr>
                    <tr><td class="text-muted">OpenID</td><td><code class="small">${user.openid || '-'}</code></td></tr>
                    <tr><td class="text-muted">历史总积分</td><td><span class="badge bg-primary">${user.history_total_points || 0}</span></td></tr>
                    <tr><td class="text-muted">角色等级</td><td>Lv.${user.role_level || 0}</td></tr>
                    <tr><td class="text-muted">注册时间</td><td>${this.formatDate(user.created_at)}</td></tr>
                    <tr><td class="text-muted">最后登录</td><td>${this.formatDate(user.last_login)}</td></tr>
                    <tr><td class="text-muted">状态</td><td>${user.status === 'banned' ? '<span class="badge bg-danger">已封禁</span>' : '<span class="badge bg-success">正常</span>'}</td></tr>
                  </table>
                </div>
                <div class="tab-pane fade" id="riskInfo">
                  <div class="card">
                    <div class="card-header"><i class="bi bi-shield-exclamation"></i> 风控配置</div>
                    <div class="card-body">${riskHtml}</div>
                  </div>
                </div>
                <div class="tab-pane fade" id="lotteryInfo">
                  <div class="card">
                    <div class="card-header"><i class="bi bi-dice-5"></i> 全局运气状态</div>
                    <div class="card-body">${luckHtml}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `
        new bootstrap.Modal(document.getElementById('userDetailModal')).show()
      } else {
        showErrorToast(userRes.value?.message || '获取用户详情失败')
      }
    } catch (error) {
      showErrorToast(error.message || '网络错误')
    } finally {
      showLoading(false)
    }
  },

  manageRoles(userId) {
    showErrorToast('角色管理功能开发中...')
  },

  async toggleBan(userId, currentStatus) {
    const action = currentStatus === 'banned' ? '解封' : '封禁'
    if (!confirm(`确定要${action}该用户吗？`)) return

    showLoading(true)
    try {
      const newStatus = currentStatus === 'banned' ? 'active' : 'banned'
      const response = await apiRequest(API.buildURL(API_ENDPOINTS.USER.UPDATE_STATUS, { user_id: userId }), {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      })

      if (response && response.success) {
        showSuccessToast(`${action}成功`)
        this.loadData()
      } else {
        showErrorToast(response?.message || `${action}失败`)
      }
    } catch (error) {
      showErrorToast(error.message || '网络错误')
    } finally {
      showLoading(false)
    }
  },

  formatDate(dateStr) {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN')
  }
}

// ==================== 用户层级模块 ====================
const hierarchyModule = {
  currentPage: 1,
  pageSize: 10,
  hierarchies: [],

  init() {
    document.getElementById('hierarchyRefreshBtn').addEventListener('click', () => this.loadData())
    document
      .getElementById('hierarchyCreateBtn')
      .addEventListener('click', () => this.showCreateModal())
    document
      .getElementById('saveHierarchyBtn')
      .addEventListener('click', () => this.saveHierarchy())

    document.getElementById('hierarchyRoleLevelFilter').addEventListener('change', () => {
      this.currentPage = 1
      this.loadData()
    })
    document.getElementById('hierarchyStatusFilter').addEventListener('change', () => {
      this.currentPage = 1
      this.loadData()
    })
  },

  async loadData() {
    showLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('page', this.currentPage)
      params.append('page_size', this.pageSize)

      const roleLevel = document.getElementById('hierarchyRoleLevelFilter').value
      const status = document.getElementById('hierarchyStatusFilter').value
      const superiorId = document.getElementById('hierarchySuperiorFilter').value

      if (roleLevel) params.append('role_level', roleLevel)
      if (status) params.append('is_active', status)
      if (superiorId) params.append('superior_id', superiorId)

      const response = await apiRequest(API_ENDPOINTS.USER_HIERARCHY.LIST + '?' + params.toString())

      if (response && response.success) {
        this.hierarchies = response.data.items || []
        this.renderStats(response.data.stats || {})
        this.renderTable(this.hierarchies)
        this.renderPagination(response.data.pagination)
        document.getElementById('hierarchyListInfo').textContent =
          `共 ${response.data.pagination?.total || this.hierarchies.length} 条`
      } else {
        showErrorToast(response?.message || '加载层级数据失败')
        this.renderEmptyTable()
      }
    } catch (error) {
      console.error('加载层级数据失败:', error)
      showErrorToast(error.message || '网络错误')
      this.renderEmptyTable()
    } finally {
      showLoading(false)
    }
  },

  renderStats(stats) {
    document.getElementById('hierarchyTotalCount').textContent =
      stats.total || this.hierarchies.length || 0
    document.getElementById('hierarchyActiveCount').textContent = stats.active || 0
    document.getElementById('hierarchyInactiveCount').textContent = stats.inactive || 0
    document.getElementById('hierarchyStoreAssignCount').textContent = stats.store_assigned || 0
  },

  renderTable(items) {
    const tbody = document.getElementById('hierarchyTableBody')

    if (!items || items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-5 text-muted">
            <i class="bi bi-inbox" style="font-size: 3rem;"></i>
            <p class="mt-2">暂无层级数据</p>
          </td>
        </tr>
      `
      return
    }

    tbody.innerHTML = items
      .map(
        item => `
      <tr class="${item.is_active ? '' : 'inactive-row'}">
        <td>${item.id}</td>
        <td>
          <strong>${item.user?.nickname || '用户' + item.user_id}</strong>
          <br><small class="text-muted">ID: ${item.user_id}</small>
        </td>
        <td>
          <span class="badge role-badge-${item.role?.role_level || ''}">${item.role?.role_name || '-'}</span>
        </td>
        <td>${item.superior_id ? `用户${item.superior_id}` : '-'}</td>
        <td>${item.store_id ? `门店${item.store_id}` : '-'}</td>
        <td>
          <span class="badge ${item.is_active ? 'bg-success' : 'bg-secondary'}">
            ${item.is_active ? '激活中' : '已停用'}
          </span>
        </td>
        <td><small>${this.formatDate(item.activated_at)}</small></td>
        <td>
          <button class="btn btn-sm btn-outline-warning" onclick="hierarchyModule.toggleActive(${item.id}, ${item.is_active})">
            <i class="bi ${item.is_active ? 'bi-pause' : 'bi-play'}"></i>
          </button>
        </td>
      </tr>
    `
      )
      .join('')
  },

  renderEmptyTable() {
    document.getElementById('hierarchyTableBody').innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-5 text-danger">
          <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
          <p class="mt-2">加载失败</p>
        </td>
      </tr>
    `
  },

  renderPagination(pagination) {
    const container = document.getElementById('hierarchyPagination')
    if (!pagination || pagination.total_pages <= 1) {
      container.innerHTML = ''
      return
    }

    let html = ''
    html += `<li class="page-item ${this.currentPage === 1 ? 'disabled' : ''}">
               <a class="page-link" href="#" onclick="hierarchyModule.changePage(${this.currentPage - 1})">上一页</a>
             </li>`

    for (let i = 1; i <= pagination.total_pages; i++) {
      html += `<li class="page-item ${this.currentPage === i ? 'active' : ''}">
                 <a class="page-link" href="#" onclick="hierarchyModule.changePage(${i})">${i}</a>
               </li>`
    }

    html += `<li class="page-item ${this.currentPage === pagination.total_pages ? 'disabled' : ''}">
               <a class="page-link" href="#" onclick="hierarchyModule.changePage(${this.currentPage + 1})">下一页</a>
             </li>`

    container.innerHTML = html
  },

  changePage(page) {
    if (page < 1) return
    this.currentPage = page
    this.loadData()
  },

  showCreateModal() {
    document.getElementById('hierarchyModalTitle').textContent = '新建层级关系'
    document.getElementById('hierarchyForm').reset()
    new bootstrap.Modal(document.getElementById('hierarchyModal')).show()
  },

  async saveHierarchy() {
    const userId = document.getElementById('formUserId').value
    const roleId = document.getElementById('formRoleId').value
    const superiorId = document.getElementById('formSuperiorId').value
    const storeId = document.getElementById('formStoreId').value

    if (!userId || !roleId) {
      showErrorToast('请填写必要字段')
      return
    }

    showLoading(true)
    try {
      const response = await apiRequest(API_ENDPOINTS.USER_HIERARCHY.CREATE, {
        method: 'POST',
        body: JSON.stringify({
          user_id: parseInt(userId),
          role_id: parseInt(roleId),
          superior_id: superiorId ? parseInt(superiorId) : null,
          store_id: storeId ? parseInt(storeId) : null
        })
      })

      if (response && response.success) {
        showSuccessToast('创建成功')
        bootstrap.Modal.getInstance(document.getElementById('hierarchyModal')).hide()
        this.loadData()
      } else {
        showErrorToast(response?.message || '创建失败')
      }
    } catch (error) {
      showErrorToast(error.message || '网络错误')
    } finally {
      showLoading(false)
    }
  },

  async toggleActive(id, isActive) {
    const action = isActive ? '停用' : '激活'
    if (!confirm(`确定要${action}该层级关系吗？`)) return

    showLoading(true)
    try {
      const response = await apiRequest(API.buildURL(API_ENDPOINTS.USER_HIERARCHY.UPDATE_STATUS, { id }), {
        method: 'PUT',
        body: JSON.stringify({ is_active: !isActive })
      })

      if (response && response.success) {
        showSuccessToast(`${action}成功`)
        this.loadData()
      } else {
        showErrorToast(response?.message || `${action}失败`)
      }
    } catch (error) {
      showErrorToast(error.message || '网络错误')
    } finally {
      showLoading(false)
    }
  },

  formatDate(dateStr) {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN')
  }
}

// ==================== 商家积分审核模块 ====================
const merchantPointsModule = {
  currentPage: 1,
  pageSize: 10,
  reviews: [],
  selectedIds: [],

  init() {
    document.getElementById('merchantRefreshBtn').addEventListener('click', () => this.loadData())

    document.getElementById('merchantStatusFilter').addEventListener('change', () => {
      this.currentPage = 1
      this.loadData()
    })

    document.getElementById('merchantSelectAll').addEventListener('change', e => {
      this.toggleSelectAll(e.target.checked)
    })

    document
      .getElementById('approveBtn')
      .addEventListener('click', () => this.handleReview('approved'))
    document
      .getElementById('rejectBtn')
      .addEventListener('click', () => this.handleReview('rejected'))

    document
      .getElementById('merchantBatchApproveBtn')
      .addEventListener('click', () => this.batchReview('approved'))
    document
      .getElementById('merchantBatchRejectBtn')
      .addEventListener('click', () => this.batchReview('rejected'))
  },

  async loadData() {
    showLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('page', this.currentPage)
      params.append('page_size', this.pageSize)

      const status = document.getElementById('merchantStatusFilter').value
      const priority = document.getElementById('merchantPriorityFilter').value
      const timeRange = document.getElementById('merchantTimeRangeFilter').value

      if (status) params.append('status', status)
      if (priority) params.append('priority', priority)
      if (timeRange) params.append('time_range', timeRange)

      const response = await apiRequest(API_ENDPOINTS.MERCHANT_POINTS.LIST + '?' + params.toString())

      if (response && response.success) {
        this.reviews = response.data.items || []
        this.renderStats(response.data.stats || {})
        this.renderTable(this.reviews)
        this.renderPagination(response.data.pagination)
      } else {
        showErrorToast(response?.message || '加载审核数据失败')
        this.renderEmptyTable()
      }
    } catch (error) {
      console.error('加载审核数据失败:', error)
      showErrorToast(error.message || '网络错误')
      this.renderEmptyTable()
    } finally {
      showLoading(false)
    }
  },

  renderStats(stats) {
    document.getElementById('merchantPendingCount').textContent = stats.pending || 0
    document.getElementById('merchantApprovedCount').textContent = stats.approved || 0
    document.getElementById('merchantRejectedCount').textContent = stats.rejected || 0
    document.getElementById('merchantTotalPoints').textContent = stats.today_points || 0
  },

  renderTable(items) {
    const tbody = document.getElementById('merchantReviewTableBody')

    if (!items || items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center py-5 text-muted">
            <i class="bi bi-inbox" style="font-size: 3rem;"></i>
            <p class="mt-2">暂无审核数据</p>
          </td>
        </tr>
      `
      return
    }

    tbody.innerHTML = items
      .map(
        item => `
      <tr>
        <td>
          <input type="checkbox" class="form-check-input review-checkbox" 
                 value="${item.id}" ${item.status === 'pending' ? '' : 'disabled'}
                 onchange="merchantPointsModule.updateSelection()">
        </td>
        <td><code>${item.id}</code></td>
        <td>
          <strong>${item.applicant?.nickname || '用户' + item.user_id}</strong>
          <br><small class="text-muted">ID: ${item.user_id}</small>
        </td>
        <td><span class="badge bg-warning text-dark fs-6">${item.points}</span></td>
        <td><small>${item.remark || '-'}</small></td>
        <td><small>${this.formatDate(item.created_at)}</small></td>
        <td>
          <span class="badge ${this.getStatusBadgeClass(item.status)}">
            ${this.getStatusText(item.status)}
          </span>
        </td>
        <td><small>${item.reviewer?.nickname || '-'}</small></td>
        <td>
          ${
            item.status === 'pending'
              ? `
            <button class="btn btn-sm btn-outline-primary" onclick="merchantPointsModule.showReviewModal(${item.id})">
              <i class="bi bi-check-square"></i> 审核
            </button>
          `
              : '-'
          }
        </td>
      </tr>
    `
      )
      .join('')
  },

  renderEmptyTable() {
    document.getElementById('merchantReviewTableBody').innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-5 text-danger">
          <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
          <p class="mt-2">加载失败</p>
        </td>
      </tr>
    `
  },

  renderPagination(pagination) {
    const container = document.getElementById('merchantPagination')
    if (!pagination || pagination.total_pages <= 1) {
      container.innerHTML = ''
      return
    }

    let html = ''
    html += `<li class="page-item ${this.currentPage === 1 ? 'disabled' : ''}">
               <a class="page-link" href="#" onclick="merchantPointsModule.changePage(${this.currentPage - 1})">上一页</a>
             </li>`

    for (let i = 1; i <= pagination.total_pages; i++) {
      html += `<li class="page-item ${this.currentPage === i ? 'active' : ''}">
                 <a class="page-link" href="#" onclick="merchantPointsModule.changePage(${i})">${i}</a>
               </li>`
    }

    html += `<li class="page-item ${this.currentPage === pagination.total_pages ? 'disabled' : ''}">
               <a class="page-link" href="#" onclick="merchantPointsModule.changePage(${this.currentPage + 1})">下一页</a>
             </li>`

    container.innerHTML = html
  },

  changePage(page) {
    if (page < 1) return
    this.currentPage = page
    this.loadData()
  },

  showReviewModal(id) {
    const item = this.reviews.find(r => r.id === id)
    if (!item) return

    this.currentReviewId = id
    document.getElementById('modalApplyId').textContent = item.id
    document.getElementById('modalUser').textContent =
      item.applicant?.nickname || '用户' + item.user_id
    document.getElementById('modalPoints').textContent = item.points
    document.getElementById('modalRemark').textContent = item.remark || '-'
    document.getElementById('reviewComment').value = ''

    new bootstrap.Modal(document.getElementById('reviewModal')).show()
  },

  async handleReview(status) {
    if (!this.currentReviewId) return

    showLoading(true)
    try {
      const comment = document.getElementById('reviewComment').value
      const response = await apiRequest(API.buildURL(API_ENDPOINTS.MERCHANT_POINTS.DETAIL, { id: this.currentReviewId }), {
        method: 'PUT',
        body: JSON.stringify({ status, comment })
      })

      if (response && response.success) {
        showSuccessToast(`${status === 'approved' ? '审核通过' : '已拒绝'}`)
        bootstrap.Modal.getInstance(document.getElementById('reviewModal')).hide()
        this.loadData()
      } else {
        showErrorToast(response?.message || '操作失败')
      }
    } catch (error) {
      showErrorToast(error.message || '网络错误')
    } finally {
      showLoading(false)
    }
  },

  toggleSelectAll(checked) {
    document.querySelectorAll('.review-checkbox:not(:disabled)').forEach(cb => {
      cb.checked = checked
    })
    this.updateSelection()
  },

  updateSelection() {
    this.selectedIds = Array.from(document.querySelectorAll('.review-checkbox:checked')).map(cb =>
      parseInt(cb.value)
    )
    const hasSelection = this.selectedIds.length > 0
    document.getElementById('merchantBatchApproveBtn').disabled = !hasSelection
    document.getElementById('merchantBatchRejectBtn').disabled = !hasSelection
  },

  async batchReview(status) {
    if (this.selectedIds.length === 0) return

    const action = status === 'approved' ? '批量通过' : '批量拒绝'
    if (!confirm(`确定要${action} ${this.selectedIds.length} 条申请吗？`)) return

    showLoading(true)
    try {
      const response = await apiRequest(API_ENDPOINTS.MERCHANT_POINTS.BATCH, {
        method: 'PUT',
        body: JSON.stringify({ ids: this.selectedIds, status })
      })

      if (response && response.success) {
        showSuccessToast(`${action}成功`)
        this.loadData()
      } else {
        showErrorToast(response?.message || '操作失败')
      }
    } catch (error) {
      showErrorToast(error.message || '网络错误')
    } finally {
      showLoading(false)
    }
  },

  getStatusBadgeClass(status) {
    const classes = {
      pending: 'bg-warning text-dark',
      approved: 'bg-success',
      rejected: 'bg-danger'
    }
    return classes[status] || 'bg-secondary'
  },

  getStatusText(status) {
    const texts = {
      pending: '待审核',
      approved: '已通过',
      rejected: '已拒绝'
    }
    return texts[status] || status
  },

  formatDate(dateStr) {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN')
  }
}

// ==================== 公共函数 ====================
function showLoading(show) {
  document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none'
}

function showSuccessToast(message) {
  const toast = document.getElementById('successToast')
  document.getElementById('successToastBody').textContent = message
  new bootstrap.Toast(toast).show()
}

function showErrorToast(message) {
  const toast = document.getElementById('errorToast')
  document.getElementById('errorToastBody').textContent = message
  new bootstrap.Toast(toast).show()
}
