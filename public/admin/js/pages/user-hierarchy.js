/**
 * 用户层级管理页面逻辑
 * @file public/admin/js/pages/user-hierarchy.js
 * @description 管理业务人员的上下级关系（区域负责人、业务经理、业务员）
 * @version 1.0.0
 * @date 2026-01-09
 */

// ================================
// 用户层级管理 - 前端逻辑
// ================================

// 状态变量
let currentPage = 1
const pageSize = 20
let rolesList = []
let currentDeactivateUserId = null

/**
 * 页面初始化
 */
document.addEventListener('DOMContentLoaded', async function () {
  // 检查登录状态
  if (!checkAuth()) return

  // 加载角色列表
  await loadRoles()

  // 加载数据
  await loadHierarchyList()

  // 绑定事件
  bindEvents()
})

/**
 * 加载可用角色列表
 */
async function loadRoles() {
  try {
    const response = await apiRequest(API_ENDPOINTS.USER_HIERARCHY.ROLES)
    if (response.success) {
      rolesList = response.data || []

      // 填充角色下拉框
      const roleSelect = document.getElementById('formRoleId')
      roleSelect.innerHTML = '<option value="">请选择角色</option>'
      rolesList.forEach(role => {
        roleSelect.innerHTML += `<option value="${role.role_id}">${role.role_name} (${role.level_name})</option>`
      })
    }
  } catch (error) {
    console.error('加载角色列表失败:', error)
  }
}

/**
 * 加载层级列表
 */
async function loadHierarchyList() {
  try {
    const params = new URLSearchParams({
      page: currentPage,
      page_size: pageSize
    })

    const roleLevel = document.getElementById('roleLevelFilter').value
    const status = document.getElementById('statusFilter').value
    const superiorId = document.getElementById('superiorFilter').value

    if (roleLevel) params.append('role_level', roleLevel)
    if (status) params.append('is_active', status)
    if (superiorId) params.append('superior_user_id', superiorId)

    const response = await apiRequest(`${API_ENDPOINTS.USER_HIERARCHY.LIST}?${params}`)

    if (response.success) {
      renderHierarchyTable(response.data)
      updateStatistics(response.data)
    } else {
      showErrorToast('加载层级列表失败: ' + (response.message || '未知错误'))
    }
  } catch (error) {
    console.error('加载层级列表失败:', error)
    showErrorToast('加载层级列表失败')
  }
}

/**
 * 渲染层级表格
 * @param {Object} data - 层级数据
 */
function renderHierarchyTable(data) {
  const tbody = document.getElementById('hierarchyTableBody')
  const rows = data.rows || []

  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-muted py-4">
          <i class="bi bi-inbox"></i> 暂无数据
        </td>
      </tr>
    `
    document.getElementById('listInfo').textContent = '共 0 条记录'
    return
  }

  tbody.innerHTML = rows
    .map(h => {
      const roleLevel = h.role_level || 40
      const roleBadgeClass = `role-badge-${roleLevel}`
      const rowClass = h.is_active ? '' : 'inactive-row'

      return `
      <tr class="${rowClass}">
        <td>${h.hierarchy_id}</td>
        <td>
          <div><strong>${h.user_nickname || '未设置'}</strong></div>
          <small class="text-muted">${h.user_mobile || '-'} (ID: ${h.user_id})</small>
        </td>
        <td>
          <span class="badge ${roleBadgeClass}">${h.role_name || '-'}</span>
          <small class="d-block text-muted">级别: ${roleLevel}</small>
        </td>
        <td>
          ${
            h.superior_user_id
              ? `<div>${h.superior_nickname || '-'}</div><small class="text-muted">ID: ${h.superior_user_id}</small>`
              : '<span class="text-muted">-（顶级）</span>'
          }
        </td>
        <td>${h.store_id || '<span class="text-muted">-</span>'}</td>
        <td>
          ${
            h.is_active
              ? '<span class="badge bg-success">激活中</span>'
              : `<span class="badge bg-secondary">已停用</span><br><small class="text-muted">${h.deactivation_reason || ''}</small>`
          }
        </td>
        <td><small>${formatDate(h.activated_at)}</small></td>
        <td>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" onclick="viewSubordinates(${h.user_id})" title="查看下级">
              <i class="bi bi-diagram-2"></i>
            </button>
            ${
              h.is_active
                ? `<button class="btn btn-outline-warning" onclick="openDeactivateModal(${h.user_id}, '${h.user_nickname || h.user_mobile}')" title="停用">
                    <i class="bi bi-pause-circle"></i>
                  </button>`
                : `<button class="btn btn-outline-success" onclick="activateUser(${h.user_id})" title="激活">
                    <i class="bi bi-play-circle"></i>
                  </button>`
            }
          </div>
        </td>
      </tr>
    `
    })
    .join('')

  // 更新列表信息和分页
  document.getElementById('listInfo').textContent = `共 ${data.count} 条记录`
  renderPagination(data.pagination)
}

/**
 * 更新统计信息
 * @param {Object} data - 统计数据
 */
function updateStatistics(data) {
  const rows = data.rows || []
  const activeRows = rows.filter(r => r.is_active)
  const inactiveRows = rows.filter(r => !r.is_active)
  const storeAssigned = rows.filter(r => r.store_id)

  document.getElementById('totalCount').textContent = data.count || 0
  document.getElementById('activeCount').textContent = activeRows.length
  document.getElementById('inactiveCount').textContent = inactiveRows.length
  document.getElementById('storeAssignCount').textContent = storeAssigned.length
}

/**
 * 渲染分页
 * @param {Object} pagination - 分页信息
 */
function renderPagination(pagination) {
  const paginationEl = document.getElementById('pagination')
  if (!pagination || pagination.total_pages <= 1) {
    paginationEl.innerHTML = ''
    return
  }

  let html = ''
  const { page, total_pages } = pagination

  // 上一页
  html += `<li class="page-item ${page <= 1 ? 'disabled' : ''}">
    <a class="page-link" href="#" onclick="goToPage(${page - 1}); return false;">上一页</a>
  </li>`

  // 页码
  for (let i = 1; i <= total_pages; i++) {
    if (i === 1 || i === total_pages || (i >= page - 2 && i <= page + 2)) {
      html += `<li class="page-item ${i === page ? 'active' : ''}">
        <a class="page-link" href="#" onclick="goToPage(${i}); return false;">${i}</a>
      </li>`
    } else if (i === page - 3 || i === page + 3) {
      html += `<li class="page-item disabled"><span class="page-link">...</span></li>`
    }
  }

  // 下一页
  html += `<li class="page-item ${page >= total_pages ? 'disabled' : ''}">
    <a class="page-link" href="#" onclick="goToPage(${page + 1}); return false;">下一页</a>
  </li>`

  paginationEl.innerHTML = html
}

/**
 * 跳转到指定页
 * @param {number} page - 页码
 */
function goToPage(page) {
  if (page < 1) return
  currentPage = page
  loadHierarchyList()
}

/**
 * 绑定事件
 */
function bindEvents() {
  // 刷新按钮
  document.getElementById('refreshBtn').addEventListener('click', () => {
    currentPage = 1
    loadHierarchyList()
  })

  // 筛选条件变化
  ;['roleLevelFilter', 'statusFilter'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      currentPage = 1
      loadHierarchyList()
    })
  })

  // 上级ID输入回车
  document.getElementById('superiorFilter').addEventListener('keypress', e => {
    if (e.key === 'Enter') {
      currentPage = 1
      loadHierarchyList()
    }
  })

  // 新建层级按钮
  document.getElementById('createBtn').addEventListener('click', openCreateModal)

  // 保存层级按钮
  document.getElementById('saveHierarchyBtn').addEventListener('click', saveHierarchy)

  // 确认停用按钮
  document.getElementById('confirmDeactivateBtn').addEventListener('click', confirmDeactivate)

  // 导出按钮
  document.getElementById('exportBtn').addEventListener('click', exportData)

  // 退出登录
  document.getElementById('logoutBtn').addEventListener('click', logout)
}

/**
 * 打开新建层级模态框
 */
function openCreateModal() {
  document.getElementById('modalTitle').textContent = '新建层级关系'
  document.getElementById('hierarchyForm').reset()

  const modal = new bootstrap.Modal(document.getElementById('hierarchyModal'))
  modal.show()
}

/**
 * 保存层级关系
 */
async function saveHierarchy() {
  const userId = document.getElementById('formUserId').value
  const roleId = document.getElementById('formRoleId').value
  const superiorId = document.getElementById('formSuperiorId').value
  const storeId = document.getElementById('formStoreId').value

  if (!userId || !roleId) {
    showWarningToast('请填写必填字段')
    return
  }

  try {
    const response = await apiRequest(API_ENDPOINTS.USER_HIERARCHY.CREATE, {
      method: 'POST',
      body: JSON.stringify({
        user_id: parseInt(userId),
        role_id: parseInt(roleId),
        superior_user_id: superiorId ? parseInt(superiorId) : null,
        store_id: storeId ? parseInt(storeId) : null
      })
    })

    if (response.success) {
      showSuccessToast('创建层级关系成功')
      bootstrap.Modal.getInstance(document.getElementById('hierarchyModal')).hide()
      loadHierarchyList()
    } else {
      showErrorToast('创建失败: ' + (response.message || '未知错误'))
    }
  } catch (error) {
    console.error('保存层级关系失败:', error)
    showErrorToast('保存失败')
  }
}

/**
 * 查看下级用户
 * @param {number} userId - 用户ID
 */
async function viewSubordinates(userId) {
  const modal = new bootstrap.Modal(document.getElementById('subordinatesModal'))
  modal.show()

  document.getElementById('subordinatesList').innerHTML = `
    <div class="text-center text-muted py-4">
      <i class="bi bi-hourglass-split"></i> 加载中...
    </div>
  `

  try {
    const response = await apiRequest(API.buildURL(API_ENDPOINTS.USER_HIERARCHY.SUBORDINATES, { user_id: userId }))

    if (response.success) {
      const subordinates = response.data.subordinates || []

      if (subordinates.length === 0) {
        document.getElementById('subordinatesList').innerHTML = `
          <div class="text-center text-muted py-4">
            <i class="bi bi-inbox"></i> 该用户暂无下级
          </div>
        `
        return
      }

      let html =
        '<table class="table table-sm"><thead><tr><th>用户</th><th>角色</th><th>状态</th></tr></thead><tbody>'
      subordinates.forEach(sub => {
        const roleLevel = sub.role_level || 40
        const roleBadgeClass = `role-badge-${roleLevel}`
        html += `
          <tr>
            <td>${sub.user_nickname || '-'} <small class="text-muted">(${sub.user_mobile || '-'})</small></td>
            <td><span class="badge ${roleBadgeClass}">${sub.role_name || '-'}</span></td>
            <td>${sub.is_active ? '<span class="badge bg-success">激活</span>' : '<span class="badge bg-secondary">停用</span>'}</td>
          </tr>
        `
      })
      html += '</tbody></table>'

      document.getElementById('subordinatesList').innerHTML = html
    } else {
      document.getElementById('subordinatesList').innerHTML = `
        <div class="alert alert-danger">加载失败: ${response.message || '未知错误'}</div>
      `
    }
  } catch (error) {
    console.error('查看下级失败:', error)
    document.getElementById('subordinatesList').innerHTML = `
      <div class="alert alert-danger">加载失败</div>
    `
  }
}

/**
 * 打开停用模态框
 * @param {number} userId - 用户ID
 * @param {string} userInfo - 用户信息描述
 */
function openDeactivateModal(userId, userInfo) {
  currentDeactivateUserId = userId
  document.getElementById('deactivateUserInfo').textContent = userInfo + ' (ID: ' + userId + ')'
  document.getElementById('deactivateReason').value = ''
  document.getElementById('includeSubordinates').checked = false

  const modal = new bootstrap.Modal(document.getElementById('deactivateModal'))
  modal.show()
}

/**
 * 确认停用
 */
async function confirmDeactivate() {
  const reason = document.getElementById('deactivateReason').value.trim()
  const includeSubordinates = document.getElementById('includeSubordinates').checked

  if (!reason) {
    showWarningToast('请填写停用原因')
    return
  }

  try {
    const response = await apiRequest(
      API.buildURL(API_ENDPOINTS.USER_HIERARCHY.DEACTIVATE, { user_id: currentDeactivateUserId }),
      {
        method: 'POST',
        body: JSON.stringify({
          reason: reason,
          include_subordinates: includeSubordinates
        })
      }
    )

    if (response.success) {
      showSuccessToast(`成功停用 ${response.data.deactivated_count} 个用户的权限`)
      bootstrap.Modal.getInstance(document.getElementById('deactivateModal')).hide()
      loadHierarchyList()
    } else {
      showErrorToast('停用失败: ' + (response.message || '未知错误'))
    }
  } catch (error) {
    console.error('停用失败:', error)
    showErrorToast('停用失败')
  }
}

/**
 * 激活用户
 * @param {number} userId - 用户ID
 */
async function activateUser(userId) {
  if (!confirm('确定要激活该用户的层级权限吗？')) return

  try {
    const response = await apiRequest(API.buildURL(API_ENDPOINTS.USER_HIERARCHY.ACTIVATE, { user_id: userId }), {
      method: 'POST',
      body: JSON.stringify({
        include_subordinates: false
      })
    })

    if (response.success) {
      showSuccessToast('激活成功')
      loadHierarchyList()
    } else {
      showErrorToast('激活失败: ' + (response.message || '未知错误'))
    }
  } catch (error) {
    console.error('激活失败:', error)
    showErrorToast('激活失败')
  }
}

/**
 * 导出数据
 */
function exportData() {
  showInfoToast('导出功能开发中')
}

/**
 * 检查用户认证状态
 * @returns {boolean} 是否已认证
 */
function checkAuth() {
  const token = getToken()
  if (!token) {
    window.location.href = '/admin/login.html'
    return false
  }

  // 更新欢迎信息
  const user = getCurrentUser()
  if (user && user.nickname) {
    const welcomeText = document.getElementById('welcomeText')
    if (welcomeText) {
      welcomeText.textContent = `欢迎，${user.nickname}`
    }
  }

  return true
}
