/**
 * 用户管理页面
 *
 * @file public/admin/js/pages/users.js
 * @description 用户列表、详情、角色管理、封禁解封、概率调整等功能
 * @version 1.0.0
 * @date 2026-01-09
 *
 * 依赖模块：
 * - /admin/js/admin-common.js  - Token管理、API请求、日期格式化
 * - /admin/js/common/toast.js  - Toast提示组件
 *
 * API端点：
 * - GET  /api/v4/console/user-management/users          - 获取用户列表
 * - GET  /api/v4/console/user-management/users/:id      - 获取用户详情
 * - GET  /api/v4/console/user-management/roles          - 获取角色列表
 * - PUT  /api/v4/console/user-management/users/:id/role - 更新用户角色
 * - PUT  /api/v4/console/user-management/users/:id/status - 更新用户状态
 * - GET  /api/v4/console/system/dashboard               - 获取仪表板统计
 * - GET  /api/v4/console/prize-pool/:campaign_code      - 获取奖品列表
 * - POST /api/v4/console/lottery-management/probability-adjust - 概率调整
 */

// ==================== 全局变量 ====================

/** 当前页码 @type {number} */
let currentPage = 1

/** 当前操作的用户ID @type {number|null} */
let currentUserId = null

/** 可用角色列表 @type {Array} */
let availableRoles = []

/** 每页显示数量 @type {number} */
const pageSize = 20

/** 当前概率调整的用户ID @type {number|null} */
let currentProbabilityUserId = null

/** 所有奖品数据 @type {Array} */
let allPrizes = []

/** 默认头像（Base64 SVG） @type {string} */
const defaultAvatar =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgZmlsbD0iI2NjYyIgY2xhc3M9ImJpIGJpLXBlcnNvbi1jaXJjbGUiIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHBhdGggZD0iTTExIDZhMyAzIDAgMSAxLTYgMCAzIDMgMCAwIDEgNiAweiIvPjxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgZD0iTTAgOGE4IDggMCAxIDEgMTYgMEE4IDggMCAwIDEgMCA4em04IDdhNyA3IDAgMCAwIDUuMzg3LTIuNTAzQTEzLjkzMyAxMy45MzMgMCAwIDAgOCAxMS41YTEzLjkzMyAxMy45MzMgMCAwIDAtNS4zODcgMS4wMDdBNyA3IDAgMCAwIDggMTV6Ii8+PC9zdmc+'

// ==================== 页面初始化 ====================

/**
 * 页面DOM加载完成后的初始化函数
 */
document.addEventListener('DOMContentLoaded', function () {
  // 显示用户信息
  const userInfo = getCurrentUser()
  if (userInfo && userInfo.nickname) {
    document.getElementById('welcomeText').textContent = `欢迎，${userInfo.nickname}`
  }

  // Token和权限验证
  if (!getToken() || !checkAdminPermission()) {
    return
  }

  // 绑定事件监听器
  bindEventListeners()

  // 加载初始数据
  loadAvailableRoles()
  loadDashboardStatistics()
  loadUsers()
})

/**
 * 绑定事件监听器
 * 集中管理所有事件绑定，便于维护
 */
function bindEventListeners() {
  // 退出登录按钮
  document.getElementById('logoutBtn').addEventListener('click', logout)

  // 搜索按钮
  document.getElementById('searchBtn').addEventListener('click', () => {
    currentPage = 1
    loadUsers()
  })

  // 重置按钮
  document.getElementById('resetBtn').addEventListener('click', resetFilters)

  // 筛选器变化时重新加载
  document.getElementById('userTypeFilter').addEventListener('change', () => {
    currentPage = 1
    loadUsers()
  })

  document.getElementById('statusFilter').addEventListener('change', () => {
    currentPage = 1
    loadUsers()
  })

  // 搜索框回车触发搜索
  document.getElementById('searchInput').addEventListener('keypress', e => {
    if (e.key === 'Enter') {
      currentPage = 1
      loadUsers()
    }
  })

  // 保存角色按钮
  document.getElementById('saveRolesBtn').addEventListener('click', saveUserRoles)

  // 保存概率设置按钮
  document.getElementById('saveProbabilityBtn').addEventListener('click', saveProbabilityAdjustment)

  // 调整模式切换事件
  document.querySelectorAll('input[name="adjustmentMode"]').forEach(radio => {
    radio.addEventListener('change', toggleAdjustmentMode)
  })

  // 奖品选择和概率输入变化时更新预览
  const targetPrizeSelect = document.getElementById('targetPrizeSelect')
  const customProbability = document.getElementById('customProbability')
  if (targetPrizeSelect) targetPrizeSelect.addEventListener('change', updateProbabilityPreview)
  if (customProbability) customProbability.addEventListener('input', updateProbabilityPreview)

  // 事件委托：用户表格操作按钮
  document.getElementById('usersTableBody').addEventListener('click', handleTableActions)

  // 事件委托：分页按钮
  document.getElementById('pagination').addEventListener('click', handlePaginationClick)

  // 图片加载错误处理
  document.getElementById('usersTableBody').addEventListener(
    'error',
    e => {
      if (e.target.classList.contains('user-avatar-img')) {
        e.target.src = defaultAvatar
        e.target.alt = '默认头像'
      }
    },
    true
  )
}

/**
 * 处理表格操作按钮点击事件
 * @param {Event} e - 点击事件
 */
function handleTableActions(e) {
  // 查看详情按钮
  const detailBtn = e.target.closest('.user-detail-btn')
  if (detailBtn) {
    const userId = parseInt(detailBtn.dataset.userId)
    viewUserDetail(userId)
    return
  }

  // 概率调整按钮
  const probabilityBtn = e.target.closest('.user-probability-btn')
  if (probabilityBtn) {
    const userId = parseInt(probabilityBtn.dataset.userId)
    const userMobile = probabilityBtn.dataset.userMobile
    openProbabilityModal(userId, userMobile)
    return
  }

  // 管理角色按钮
  const rolesBtn = e.target.closest('.user-roles-btn')
  if (rolesBtn) {
    const userId = parseInt(rolesBtn.dataset.userId)
    manageRoles(userId)
    return
  }

  // 封禁按钮
  const banBtn = e.target.closest('.user-ban-btn')
  if (banBtn) {
    const userId = parseInt(banBtn.dataset.userId)
    banUser(userId)
    return
  }

  // 解封按钮
  const unbanBtn = e.target.closest('.user-unban-btn')
  if (unbanBtn) {
    const userId = parseInt(unbanBtn.dataset.userId)
    unbanUser(userId)
    return
  }
}

/**
 * 处理分页按钮点击事件
 * @param {Event} e - 点击事件
 */
function handlePaginationClick(e) {
  e.preventDefault()
  const pageBtn = e.target.closest('.page-nav-btn')
  if (pageBtn && !pageBtn.closest('.disabled') && !pageBtn.closest('.active')) {
    const page = parseInt(pageBtn.dataset.page)
    if (!isNaN(page) && page > 0) {
      changePage(page)
    }
  }
}

// ==================== 数据加载函数 ====================

/**
 * 加载可用角色列表
 */
async function loadAvailableRoles() {
  try {
    const response = await apiRequest('/api/v4/console/user-management/roles')
    if (response && response.success) {
      availableRoles = response.data.roles || response.data.list || []
    }
  } catch (error) {
    console.error('加载角色列表失败:', error)
  }
}

/**
 * 加载用户列表
 * @param {boolean} silent - 是否静默刷新
 */
async function loadUsers(silent = false) {
  if (!silent) {
    showLoading()
  }

  try {
    const userType = document.getElementById('userTypeFilter').value
    const status = document.getElementById('statusFilter').value
    const search = document.getElementById('searchInput').value.trim()

    // 构建查询参数
    const params = new URLSearchParams({
      page: currentPage,
      limit: pageSize
    })

    if (userType !== 'all') {
      params.append('type', userType)
    }

    if (status !== 'all') {
      params.append('status', status)
    }

    if (search) {
      params.append('search', search)
    }

    const response = await apiRequest(`/api/v4/console/user-management/users?${params.toString()}`)

    if (response && response.success) {
      renderUsers(response.data)
      updateStatistics(response.data)
    } else {
      showErrorToast(response?.message || '获取数据失败')
    }
  } catch (error) {
    console.error('加载用户失败:', error)
    showErrorToast(error.message)
  } finally {
    hideLoading()
  }
}

/**
 * 从Dashboard API加载统计数据
 */
async function loadDashboardStatistics() {
  try {
    const response = await apiRequest('/api/v4/console/system/dashboard')
    if (response && response.success && response.data) {
      const overview = response.data.overview || {}
      const today = response.data.today || {}

      document.getElementById('totalUsers').textContent = formatNumber(overview.total_users || 0)
      document.getElementById('todayUsers').textContent = formatNumber(today.new_users || 0)
      document.getElementById('activeUsers').textContent = formatNumber(overview.active_users || 0)
      document.getElementById('vipUsers').textContent = formatNumber(overview.vip_users || 0)
    }
  } catch (error) {
    console.error('加载仪表板统计失败:', error)
  }
}

// ==================== 渲染函数 ====================

/**
 * 渲染用户列表
 * @param {Object} data - API返回的数据
 */
function renderUsers(data) {
  const tbody = document.getElementById('usersTableBody')
  const users = data.users || data.list || []

  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-5">
          <i class="bi bi-inbox text-muted" style="font-size: 3rem;"></i>
          <p class="mt-2 text-muted">暂无数据</p>
        </td>
      </tr>
    `
    renderPagination(0, 0)
    return
  }

  tbody.innerHTML = users
    .map(
      user => `
    <tr>
      <td>${user.user_id}</td>
      <td>
        <div class="d-flex align-items-center">
          <img src="${user.avatar_url || defaultAvatar}" 
               class="user-avatar me-3 user-avatar-img" 
               alt="头像"
               onerror="this.src='${defaultAvatar}'">
          <div>
            <div class="fw-bold">${user.nickname || '未设置昵称'}</div>
            <small class="text-muted">${maskPhone(user.mobile || '-')}</small>
          </div>
        </div>
      </td>
      <td>${renderRoleBadges(user.roles, user.role_level)}</td>
      <td class="text-primary fw-bold">${formatNumber(user.history_total_points || 0)}</td>
      <td>
        ${
          user.created_at
            ? `<div>${formatDate(user.created_at)}</div>
           <small class="text-muted">${formatRelativeTime(user.created_at)}</small>`
            : '<span class="text-muted">-</span>'
        }
      </td>
      <td>
        ${
          user.last_login
            ? `<div>${formatDate(user.last_login)}</div>
           <small class="text-muted">${formatRelativeTime(user.last_login)}</small>`
            : '<span class="text-muted">从未登录</span>'
        }
      </td>
      <td>${renderStatusBadge(user.status)}</td>
      <td>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary user-detail-btn" data-user-id="${user.user_id}">
            <i class="bi bi-eye"></i> 详情
          </button>
          <button class="btn btn-outline-info user-probability-btn" data-user-id="${user.user_id}" data-user-mobile="${user.mobile}">
            <i class="bi bi-percent"></i> 概率
          </button>
          <button class="btn btn-outline-warning user-roles-btn" data-user-id="${user.user_id}">
            <i class="bi bi-shield"></i> 角色
          </button>
          ${
            user.status === 'active'
              ? `<button class="btn btn-outline-danger user-ban-btn" data-user-id="${user.user_id}">
              <i class="bi bi-x-circle"></i> 封禁
            </button>`
              : `<button class="btn btn-outline-success user-unban-btn" data-user-id="${user.user_id}">
              <i class="bi bi-check-circle"></i> 解封
            </button>`
          }
        </div>
      </td>
    </tr>
  `
    )
    .join('')

  // 渲染分页
  const total = data.total || users.length
  renderPagination(total, currentPage)
}

/**
 * 渲染角色徽章
 * @param {Array} roles - 角色数组
 * @param {number} roleLevel - 用户最高角色等级
 * @returns {string} HTML字符串
 */
function renderRoleBadges(roles, roleLevel = 0) {
  if (!roles || roles.length === 0) {
    return '<span class="text-muted small">无角色</span>'
  }

  const bgColor = roleLevel >= 100 ? 'bg-danger' : roleLevel >= 50 ? 'bg-warning' : 'bg-secondary'

  return roles
    .map(roleName => {
      const name = typeof roleName === 'string' ? roleName : roleName.role_name
      return `<span class="badge ${bgColor} role-badge">${name}</span>`
    })
    .join(' ')
}

/**
 * 渲染状态徽章
 * @param {string} status - 状态
 * @returns {string} HTML字符串
 */
function renderStatusBadge(status) {
  const badges = {
    active: '<span class="badge bg-success"><i class="bi bi-check-circle"></i> 正常</span>',
    banned: '<span class="badge bg-danger"><i class="bi bi-x-circle"></i> 已封禁</span>'
  }
  return badges[status] || '<span class="badge bg-secondary">未知</span>'
}

/**
 * 渲染分页
 * @param {number} total - 总记录数
 * @param {number} current - 当前页码
 */
function renderPagination(total, current) {
  const pagination = document.getElementById('pagination')
  const totalPages = Math.ceil(total / pageSize)

  if (totalPages <= 1) {
    pagination.innerHTML = `
      <li class="page-item disabled">
        <span class="page-link">共 ${total} 条记录</span>
      </li>
    `
    return
  }

  let html = `
    <li class="page-item ${current === 1 ? 'disabled' : ''}">
      <a class="page-link page-nav-btn" href="#" data-page="${current - 1}">上一页</a>
    </li>
  `

  // 显示页码
  const maxPages = 7
  let startPage = Math.max(1, current - Math.floor(maxPages / 2))
  let endPage = Math.min(totalPages, startPage + maxPages - 1)

  if (endPage - startPage < maxPages - 1) {
    startPage = Math.max(1, endPage - maxPages + 1)
  }

  if (startPage > 1) {
    html += `<li class="page-item"><a class="page-link page-nav-btn" href="#" data-page="1">1</a></li>`
    if (startPage > 2) {
      html += `<li class="page-item disabled"><span class="page-link">...</span></li>`
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `
      <li class="page-item ${i === current ? 'active' : ''}">
        <a class="page-link page-nav-btn" href="#" data-page="${i}">${i}</a>
      </li>
    `
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      html += `<li class="page-item disabled"><span class="page-link">...</span></li>`
    }
    html += `<li class="page-item"><a class="page-link page-nav-btn" href="#" data-page="${totalPages}">${totalPages}</a></li>`
  }

  html += `
    <li class="page-item ${current === totalPages ? 'disabled' : ''}">
      <a class="page-link page-nav-btn" href="#" data-page="${current + 1}">下一页</a>
    </li>
  `

  pagination.innerHTML = html
}

/**
 * 更新统计信息
 * @param {Object} data - API返回的数据
 */
function updateStatistics(data) {
  if (data.pagination) {
    document.getElementById('totalUsers').textContent = formatNumber(data.pagination.total || 0)
  }
}

// ==================== 用户操作函数 ====================

/**
 * 切换页码
 * @param {number} page - 目标页码
 */
function changePage(page) {
  currentPage = page
  loadUsers()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

/**
 * 重置筛选器
 */
function resetFilters() {
  document.getElementById('userTypeFilter').value = 'all'
  document.getElementById('statusFilter').value = 'all'
  document.getElementById('searchInput').value = ''
  currentPage = 1
  loadUsers()
}

/**
 * 查看用户详情
 * @param {number} userId - 用户ID
 */
async function viewUserDetail(userId) {
  showLoading()

  try {
    const response = await apiRequest(`/api/v4/console/user-management/users/${userId}`)

    if (response && response.success) {
      const user = response.data.user || response.data
      renderUserDetail(user)
      new bootstrap.Modal(document.getElementById('userDetailModal')).show()
    } else {
      showErrorToast(response?.message || '获取用户详情失败')
    }
  } catch (error) {
    console.error('获取用户详情失败:', error)
    showErrorToast(error.message)
  } finally {
    hideLoading()
  }
}

/**
 * 渲染用户详情
 * @param {Object} user - 用户对象
 */
function renderUserDetail(user) {
  const roleLevel = user.role_level || 0
  const rolesDisplay = renderRoleBadges(user.roles, roleLevel)

  const detailHtml = `
    <div class="row g-3">
      <div class="col-md-12 text-center mb-3">
        <img src="${user.avatar_url || defaultAvatar}" 
             class="rounded-circle" 
             style="width: 100px; height: 100px;"
             alt="头像"
             onerror="this.src='${defaultAvatar}'">
      </div>
      <div class="col-md-6">
        <strong>用户ID：</strong>${user.user_id}
      </div>
      <div class="col-md-6">
        <strong>昵称：</strong>${user.nickname || '未设置'}
      </div>
      <div class="col-md-6">
        <strong>手机号：</strong>${user.mobile || '-'}
      </div>
      <div class="col-md-6">
        <strong>权限等级：</strong>Lv.${roleLevel}
      </div>
      <div class="col-md-6">
        <strong>角色：</strong>${rolesDisplay}
      </div>
      <div class="col-md-6">
        <strong>状态：</strong>${renderStatusBadge(user.status)}
      </div>
      <div class="col-md-6">
        <strong>历史总积分：</strong>
        <span class="text-primary fw-bold">${formatNumber(user.history_total_points || 0)}</span>
      </div>
      <div class="col-md-6">
        <strong>连续失败次数：</strong>${user.consecutive_fail_count || 0}
      </div>
      <div class="col-md-6">
        <strong>注册时间：</strong>${user.created_at ? formatDate(user.created_at) : '-'}
      </div>
      <div class="col-md-6">
        <strong>最后登录：</strong>
        ${user.last_login ? formatDate(user.last_login) : '从未登录'}
      </div>
    </div>
  `

  document.getElementById('userDetailBody').innerHTML = detailHtml
}

/**
 * 管理用户角色
 * @param {number} userId - 用户ID
 */
async function manageRoles(userId) {
  currentUserId = userId
  showLoading()

  try {
    const response = await apiRequest(`/api/v4/console/user-management/users/${userId}`)

    if (response && response.success) {
      const user = response.data.user || response.data
      const userRoles = user.roles || []
      renderRolesCheckboxes(userRoles)
      new bootstrap.Modal(document.getElementById('roleModal')).show()
    } else {
      showErrorToast(response?.message || '获取用户角色失败')
    }
  } catch (error) {
    console.error('获取用户角色失败:', error)
    showErrorToast(error.message)
  } finally {
    hideLoading()
  }
}

/**
 * 渲染角色复选框
 * @param {Array} userRoles - 用户当前角色
 */
function renderRolesCheckboxes(userRoles) {
  const container = document.getElementById('rolesCheckboxes')

  const userRoleNames = userRoles.map(r => {
    if (typeof r === 'string') return r
    return r.role_name
  })

  container.innerHTML = availableRoles
    .map(
      role => `
    <div class="form-check">
      <input class="form-check-input" 
             type="radio" 
             name="userRole"
             id="role_${role.id}" 
             value="${role.role_name}"
             data-role-level="${role.role_level}"
             ${userRoleNames.includes(role.role_name) ? 'checked' : ''}>
      <label class="form-check-label" for="role_${role.id}">
        <span class="badge ${role.role_level >= 100 ? 'bg-danger' : role.role_level >= 50 ? 'bg-warning' : 'bg-secondary'} me-2">
          Lv.${role.role_level} ${role.role_name}
        </span>
        <small class="text-muted">${role.description || ''}</small>
      </label>
    </div>
  `
    )
    .join('')
}

/**
 * 保存用户角色
 */
async function saveUserRoles() {
  const selectedRadio = document.querySelector('#rolesCheckboxes input[type="radio"]:checked')

  if (!selectedRadio) {
    showErrorToast('请选择一个角色')
    return
  }

  const roleName = selectedRadio.value

  if (!roleName) {
    showErrorToast('无法获取角色名称')
    return
  }

  showLoading()

  try {
    const response = await apiRequest(
      `/api/v4/console/user-management/users/${currentUserId}/role`,
      {
        method: 'PUT',
        body: JSON.stringify({
          role_name: roleName,
          reason: '管理员手动更新角色'
        })
      }
    )

    if (response && response.success) {
      showSuccessToast('用户角色已更新')
      bootstrap.Modal.getInstance(document.getElementById('roleModal')).hide()
      loadUsers(true)
    } else {
      showErrorToast(response?.message || '操作失败')
    }
  } catch (error) {
    console.error('保存角色失败:', error)
    showErrorToast(error.message)
  } finally {
    hideLoading()
  }
}

/**
 * 封禁用户
 * @param {number} userId - 用户ID
 */
async function banUser(userId) {
  if (!confirm('确认封禁该用户？封禁后用户将无法登录和使用系统功能。')) {
    return
  }

  showLoading()

  try {
    const response = await apiRequest(`/api/v4/console/user-management/users/${userId}/status`, {
      method: 'PUT',
      body: JSON.stringify({
        status: 'banned',
        reason: '管理员手动封禁'
      })
    })

    if (response && response.success) {
      showSuccessToast('用户已被封禁')
      loadUsers(true)
    } else {
      showErrorToast(response?.message || '封禁失败')
    }
  } catch (error) {
    console.error('封禁用户失败:', error)
    showErrorToast(error.message)
  } finally {
    hideLoading()
  }
}

/**
 * 解封用户
 * @param {number} userId - 用户ID
 */
async function unbanUser(userId) {
  if (!confirm('确认解封该用户？解封后用户可以正常登录和使用系统功能。')) {
    return
  }

  showLoading()

  try {
    const response = await apiRequest(`/api/v4/console/user-management/users/${userId}/status`, {
      method: 'PUT',
      body: JSON.stringify({
        status: 'active',
        reason: '管理员手动解封'
      })
    })

    if (response && response.success) {
      showSuccessToast('用户已解封')
      loadUsers(true)
    } else {
      showErrorToast(response?.message || '解封失败')
    }
  } catch (error) {
    console.error('解封用户失败:', error)
    showErrorToast(error.message)
  } finally {
    hideLoading()
  }
}

// ==================== 概率调整功能 ====================

/**
 * 打开概率调整模态框
 * @param {number} userId - 用户ID
 * @param {string} userMobile - 用户手机号
 */
async function openProbabilityModal(userId, userMobile) {
  currentProbabilityUserId = userId

  document.getElementById('probModalUserId').textContent = userId
  document.getElementById('probModalUserMobile').textContent = userMobile

  await loadPrizesForProbability()

  new bootstrap.Modal(document.getElementById('probabilityModal')).show()
}

/**
 * 加载奖品列表（用于特定奖品调整）
 */
async function loadPrizesForProbability() {
  try {
    const response = await apiRequest('/api/v4/console/prize-pool/BASIC_LOTTERY')

    if (response && response.success) {
      const prizes = response.data.prizes || []
      allPrizes = prizes

      const select = document.getElementById('targetPrizeSelect')
      select.innerHTML =
        '<option value="">请选择奖品...</option>' +
        prizes
          .map(prize => {
            const probability = (parseFloat(prize.win_probability || 0) * 100).toFixed(1)
            return `<option value="${prize.prize_id}" data-probability="${prize.win_probability}">
            ${prize.prize_name} (当前概率${probability}%)
          </option>`
          })
          .join('')
    }
  } catch (error) {
    console.error('加载奖品列表失败:', error)
  }
}

/**
 * 切换调整模式（全局/特定）
 */
function toggleAdjustmentMode() {
  const mode = document.querySelector('input[name="adjustmentMode"]:checked').value

  const globalArea = document.getElementById('globalAdjustArea')
  const specificArea = document.getElementById('specificAdjustArea')

  if (mode === 'global') {
    globalArea.style.display = 'block'
    specificArea.style.display = 'none'
  } else {
    globalArea.style.display = 'none'
    specificArea.style.display = 'block'
  }
}

/**
 * 更新概率预览
 */
function updateProbabilityPreview() {
  const targetPrizeSelect = document.getElementById('targetPrizeSelect')
  const customProbabilityInput = document.getElementById('customProbability')

  const selectedPrizeId = parseInt(targetPrizeSelect.value)
  const newProbability = parseFloat(customProbabilityInput.value) / 100

  if (!selectedPrizeId || !newProbability) {
    document.getElementById('probabilityPreview').innerHTML =
      '<p class="text-muted mb-0">请选择奖品并设置概率</p>'
    return
  }

  const targetPrize = allPrizes.find(p => p.prize_id === selectedPrizeId)
  if (!targetPrize) return

  const otherPrizesTotalProb = allPrizes
    .filter(p => p.prize_id !== selectedPrizeId)
    .reduce((sum, p) => sum + parseFloat(p.win_probability || 0), 0)

  const remainingProb = 1.0 - newProbability
  const scaleFactor = otherPrizesTotalProb > 0 ? remainingProb / otherPrizesTotalProb : 0

  let previewHtml = '<table class="table table-sm mb-0">'
  previewHtml += '<thead><tr><th>奖品</th><th>原概率</th><th>→</th><th>新概率</th></tr></thead>'
  previewHtml += '<tbody>'

  allPrizes.forEach(prize => {
    const originalProb = parseFloat(prize.win_probability || 0)
    let adjustedProb
    let isTarget = false

    if (prize.prize_id === selectedPrizeId) {
      adjustedProb = newProbability
      isTarget = true
    } else {
      adjustedProb = originalProb * scaleFactor
    }

    const className = isTarget ? 'table-info' : ''
    previewHtml += `
      <tr class="${className}">
        <td>${prize.prize_name}${isTarget ? ' 🎯' : ''}</td>
        <td>${(originalProb * 100).toFixed(1)}%</td>
        <td><i class="bi bi-arrow-right"></i></td>
        <td class="fw-bold ${isTarget ? 'text-info' : ''}">${(adjustedProb * 100).toFixed(1)}%</td>
      </tr>
    `
  })

  const totalAdjusted = allPrizes.reduce((sum, prize) => {
    if (prize.prize_id === selectedPrizeId) return sum + newProbability
    const originalProb = parseFloat(prize.win_probability || 0)
    return sum + originalProb * scaleFactor
  }, 0)

  previewHtml += `
    <tr class="table-light fw-bold">
      <td>总计</td>
      <td>100%</td>
      <td></td>
      <td>${(totalAdjusted * 100).toFixed(1)}%</td>
    </tr>
  `
  previewHtml += '</tbody></table>'

  document.getElementById('probabilityPreview').innerHTML = previewHtml
}

/**
 * 保存概率调整设置
 */
async function saveProbabilityAdjustment() {
  if (!currentProbabilityUserId) {
    showErrorToast('未选择用户')
    return
  }

  const mode = document.querySelector('input[name="adjustmentMode"]:checked').value
  const durationMinutes = parseInt(document.getElementById('durationMinutes').value)
  const reason = document.getElementById('probabilityReason').value || '管理员概率调整'

  let requestData = {
    user_id: currentProbabilityUserId,
    duration_minutes: durationMinutes,
    reason: reason
  }

  if (mode === 'global') {
    const multiplier = parseFloat(document.getElementById('probabilityMultiplier').value)
    if (!multiplier || multiplier < 0.1 || multiplier > 10) {
      showErrorToast('概率倍数必须在0.1-10之间')
      return
    }
    requestData.probability_multiplier = multiplier
  } else {
    const prizeId = parseInt(document.getElementById('targetPrizeSelect').value)
    const customProb = parseFloat(document.getElementById('customProbability').value) / 100

    if (!prizeId) {
      showErrorToast('请选择要调整的奖品')
      return
    }

    if (!customProb || customProb < 0.01 || customProb > 1.0) {
      showErrorToast('自定义概率必须在1%-100%之间')
      return
    }

    requestData.prize_id = prizeId
    requestData.custom_probability = customProb
  }

  showLoading()

  try {
    const response = await apiRequest('/api/v4/console/lottery-management/probability-adjust', {
      method: 'POST',
      body: JSON.stringify(requestData)
    })

    if (response && response.success) {
      showSuccessToast(response.message || '用户概率调整成功')
      bootstrap.Modal.getInstance(document.getElementById('probabilityModal')).hide()

      // 重置表单
      document.getElementById('probabilityMultiplier').value = '2.0'
      document.getElementById('customProbability').value = '50'
      document.getElementById('targetPrizeSelect').value = ''
      document.getElementById('probabilityReason').value = ''
      document.getElementById('modeGlobal').checked = true
      toggleAdjustmentMode()
    } else {
      showErrorToast(response?.message || '概率调整失败')
    }
  } catch (error) {
    console.error('概率调整失败:', error)
    showErrorToast(error.message)
  } finally {
    hideLoading()
  }
}

// ==================== 工具函数 ====================

/**
 * 显示加载状态
 */
function showLoading() {
  const overlay = document.getElementById('loadingOverlay')
  if (overlay) {
    overlay.classList.add('show')
  }
}

/**
 * 隐藏加载状态
 */
function hideLoading() {
  const overlay = document.getElementById('loadingOverlay')
  if (overlay) {
    overlay.classList.remove('show')
  }
}
