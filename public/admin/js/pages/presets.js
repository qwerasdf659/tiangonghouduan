/**
 * 抽奖干预管理页面脚本
 * @description 管理员预设特定用户的抽奖结果
 * @file /admin/js/pages/presets.js
 * @created 2026-01-09
 *
 * 依赖：
 * - /admin/js/admin-common.js（通用工具函数：apiRequest, getToken, getCurrentUser, logout, showLoading, checkAdminPermission, formatDate）
 * - /admin/js/common/toast.js（Toast提示组件：showSuccessToast, showErrorToast, showWarningToast, showInfoToast）
 * - Bootstrap 5（模态框、样式组件）
 */

/* global apiRequest, getToken, getCurrentUser, logout, showLoading, checkAdminPermission, formatDate */
/* global showSuccessToast, showErrorToast, showWarningToast, showInfoToast */
/* global bootstrap */

// 分页和数据状态
let currentPage = 1
const pageSize = 10
let allPrizes = []

/**
 * 页面初始化
 */
document.addEventListener('DOMContentLoaded', function () {
  // 显示用户信息
  const userInfo = getCurrentUser()
  if (userInfo && userInfo.nickname) {
    document.getElementById('welcomeText').textContent = `欢迎，${userInfo.nickname}`
  }

  // 事件监听器
  document.getElementById('logoutBtn').addEventListener('click', logout)
  document.getElementById('prizeSelect').addEventListener('change', updatePrizePreview)

  // Token和权限验证
  if (!getToken() || !checkAdminPermission()) {
    return
  }

  // 加载数据
  loadPrizes()
  loadInterventions()
})

/**
 * 加载奖品列表
 * @description 获取可用于干预设置的奖品列表
 */
async function loadPrizes() {
  try {
    // ✅ 对齐后端API：/api/v4/console/prize-pool/list 返回 { data: { prizes: [...], statistics: {...} } }
    const response = await apiRequest('/api/v4/console/prize-pool/list')

    if (response && response.success) {
      // 正确提取奖品数组：response.data.prizes（后端返回的是对象，不是数组）
      allPrizes = response.data?.prizes || []
      renderPrizeOptions()
    }
  } catch (error) {
    console.error('加载奖品列表失败:', error)
  }
}

/**
 * 渲染奖品选项到下拉框
 */
function renderPrizeOptions() {
  const select = document.getElementById('prizeSelect')
  select.innerHTML =
    '<option value="">请选择奖品</option>' +
    allPrizes
      .map(
        prize => `
      <option value="${prize.prize_id}" 
        data-name="${prize.prize_name}" 
        data-value="${prize.prize_value || 0}"
        data-type="${prize.prize_type || 'virtual'}">
        ${prize.prize_name} (¥${(prize.prize_value || 0).toFixed(2)})
      </option>
    `
      )
      .join('')
}

/**
 * 更新奖品预览显示
 */
function updatePrizePreview() {
  const select = document.getElementById('prizeSelect')
  const preview = document.getElementById('prizePreview')
  const selected = select.options[select.selectedIndex]

  if (select.value) {
    const name = selected.dataset.name
    const value = selected.dataset.value
    const type = getPrizeTypeLabel(selected.dataset.type)

    preview.innerHTML = `
      <div class="d-flex justify-content-between">
        <span><strong>${name}</strong></span>
        <span class="badge bg-primary">${type}</span>
      </div>
      <div class="text-success fw-bold">¥${parseFloat(value).toFixed(2)}</div>
    `
    preview.classList.remove('text-muted')
  } else {
    preview.innerHTML = '未选择奖品'
    preview.classList.add('text-muted')
  }
}

/**
 * 获取奖品类型标签
 * @param {string} type - 奖品类型
 * @returns {string} 中文标签
 */
function getPrizeTypeLabel(type) {
  const labels = {
    physical: '实物',
    virtual: '虚拟',
    points: '积分',
    coupon: '优惠券'
  }
  return labels[type] || '未知'
}

/**
 * 搜索用户
 * @description 根据关键词搜索用户，用于选择干预目标
 */
async function searchUser() {
  const keyword = document.getElementById('searchUserInput').value.trim()
  if (!keyword) {
    showErrorToast('请输入搜索关键词')
    return
  }

  const resultDiv = document.getElementById('userSearchResult')
  resultDiv.innerHTML =
    '<div class="text-center py-2"><div class="spinner-border spinner-border-sm"></div> 搜索中...</div>'

  try {
    // ✅ 使用user-management端点搜索用户
    const response = await apiRequest(
      `/api/v4/console/user-management/users?search=${encodeURIComponent(keyword)}&page_size=10`
    )

    if (response && response.success) {
      const users = response.data?.list || response.data || []

      if (users.length === 0) {
        resultDiv.innerHTML = '<div class="alert alert-warning py-2 mb-0">未找到匹配的用户</div>'
        return
      }

      resultDiv.innerHTML = `
        <div class="list-group">
          ${users
            .map(
              user => `
            <a href="javascript:void(0)" class="list-group-item list-group-item-action" 
               onclick="selectUser(${user.user_id}, '${user.nickname || ''}', '${user.mobile || ''}')">
              <div class="d-flex justify-content-between align-items-center">
                <div>
                  <strong>${user.nickname || '未设置昵称'}</strong>
                  <small class="text-muted ms-2">${user.mobile || ''}</small>
                </div>
                <span class="badge bg-secondary">ID: ${user.user_id}</span>
              </div>
            </a>
          `
            )
            .join('')}
        </div>
      `
    }
  } catch (error) {
    console.error('搜索用户失败:', error)
    resultDiv.innerHTML = '<div class="alert alert-danger py-2 mb-0">搜索失败</div>'
  }
}

/**
 * 选择用户
 * @param {number} userId - 用户ID
 * @param {string} nickname - 用户昵称
 * @param {string} mobile - 用户手机号
 */
function selectUser(userId, nickname, mobile) {
  document.getElementById('targetUserId').value = userId
  document.getElementById('selectedUserInfo').textContent =
    `${nickname || '未设置昵称'} (${mobile || 'ID:' + userId})`
  document.getElementById('selectedUser').style.display = 'block'
  document.getElementById('userSearchResult').innerHTML = ''
}

/**
 * 加载干预规则列表
 * @description 从后端获取干预规则列表并渲染表格
 */
async function loadInterventions() {
  const tbody = document.getElementById('interventionTableBody')

  try {
    const params = new URLSearchParams({
      page: currentPage,
      page_size: pageSize
    })

    const status = document.getElementById('statusFilter').value
    const userSearch = document.getElementById('userSearch').value.trim()
    const prizeType = document.getElementById('prizeTypeFilter').value

    if (status) params.append('status', status)
    if (userSearch) params.append('user_search', userSearch)
    if (prizeType) params.append('prize_type', prizeType)

    // ✅ 使用console管理端点 - 后端返回格式: { data: { interventions: [...], pagination: {...} } }
    const response = await apiRequest(`/api/v4/console/lottery-management/interventions?${params}`)

    if (response && response.success) {
      // 正确提取数据：后端返回 interventions 数组和 pagination 对象
      const interventions = response.data?.interventions || []
      const pagination = response.data?.pagination || {}
      const total = pagination.total || interventions.length

      document.getElementById('totalCount').textContent = total

      if (interventions.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="9" class="text-center py-5 text-muted">
              <i class="bi bi-inbox" style="font-size: 3rem;"></i>
              <p class="mt-2">暂无干预规则</p>
            </td>
          </tr>
        `
        return
      }

      // 字段映射对齐后端API返回格式：
      // setting_id, user_info.nickname, user_info.mobile, prize_info?.prize_name,
      // prize_info?.prize_value, expires_at, operator?.nickname
      tbody.innerHTML = interventions
        .map(
          item => `
        <tr>
          <td><code>${item.setting_id || ''}</code></td>
          <td>
            <strong>${item.user_info?.nickname || '未知'}</strong>
            <br><small class="text-muted">${item.user_info?.mobile || 'ID:' + item.user_id}</small>
          </td>
          <td>${item.prize_info?.prize_name || item.setting_type || '概率调整'}</td>
          <td class="text-success fw-bold">${item.prize_info ? '¥' + (item.prize_info.prize_value || 0).toFixed(2) : '-'}</td>
          <td>${getStatusBadge(item.status)}</td>
          <td><small>${formatDate(item.created_at)}</small></td>
          <td><small>${item.expires_at ? formatDate(item.expires_at) : '永不过期'}</small></td>
          <td>${item.operator?.nickname || '系统'}</td>
          <td>
            <button class="btn btn-sm btn-outline-primary me-1" onclick="viewIntervention('${item.setting_id}')">
              <i class="bi bi-eye"></i>
            </button>
            ${
              item.status === 'active'
                ? `
              <button class="btn btn-sm btn-outline-danger" onclick="cancelIntervention('${item.setting_id}')">
                <i class="bi bi-x"></i>
              </button>
            `
                : ''
            }
          </td>
        </tr>
      `
        )
        .join('')

      renderPagination(total)
    }
  } catch (error) {
    console.error('加载干预规则失败:', error)
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-5 text-danger">
          <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
          <p class="mt-2">加载失败</p>
        </td>
      </tr>
    `
  }
}

/**
 * 获取状态标签HTML
 * @param {string} status - 状态值
 * @returns {string} HTML标签
 */
function getStatusBadge(status) {
  const badges = {
    active: '<span class="badge bg-success">待触发</span>',
    used: '<span class="badge bg-secondary">已使用</span>',
    expired: '<span class="badge bg-danger">已过期</span>',
    cancelled: '<span class="badge bg-warning text-dark">已取消</span>'
  }
  return badges[status] || '<span class="badge bg-light text-dark">未知</span>'
}

/**
 * 渲染分页控件
 * @param {number} total - 总记录数
 */
function renderPagination(total) {
  const pagination = document.getElementById('pagination')
  const totalPages = Math.ceil(total / pageSize)

  if (totalPages <= 1) {
    pagination.innerHTML = ''
    return
  }

  let html = ''

  if (currentPage > 1) {
    html += `<li class="page-item"><a class="page-link" href="javascript:void(0)" onclick="goToPage(${currentPage - 1})">上一页</a></li>`
  }

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      html += `<li class="page-item ${i === currentPage ? 'active' : ''}">
        <a class="page-link" href="javascript:void(0)" onclick="goToPage(${i})">${i}</a>
      </li>`
    } else if (i === currentPage - 3 || i === currentPage + 3) {
      html += `<li class="page-item disabled"><span class="page-link">...</span></li>`
    }
  }

  if (currentPage < totalPages) {
    html += `<li class="page-item"><a class="page-link" href="javascript:void(0)" onclick="goToPage(${currentPage + 1})">下一页</a></li>`
  }

  pagination.innerHTML = html
}

/**
 * 跳转到指定页
 * @param {number} page - 页码
 */
function goToPage(page) {
  currentPage = page
  loadInterventions()
}

/**
 * 创建干预规则（强制中奖）
 * @description ✅ 对齐后端：使用 /api/v4/console/lottery-management/force-win 端点
 */
async function createIntervention() {
  const targetUserId = document.getElementById('targetUserId').value
  const prizeId = document.getElementById('prizeSelect').value
  const expireTime = document.getElementById('expireTime').value
  const reason = document.getElementById('interventionReason').value.trim() || '管理员强制中奖'
  const note = document.getElementById('interventionNote').value.trim()

  if (!targetUserId) {
    showErrorToast('请选择目标用户')
    return
  }

  if (!prizeId) {
    showErrorToast('请选择预设奖品')
    return
  }

  showLoading(true)

  try {
    // ✅ 对齐后端 force-control 模块
    // 计算持续时间（分钟）
    let durationMinutes = null
    if (expireTime) {
      const expireDate = new Date(expireTime)
      const now = new Date()
      const diffMs = expireDate - now
      if (diffMs > 0) {
        durationMinutes = Math.ceil(diffMs / (1000 * 60))
      }
    }

    const response = await apiRequest('/api/v4/console/lottery-management/force-win', {
      method: 'POST',
      body: JSON.stringify({
        user_id: parseInt(targetUserId),
        prize_id: parseInt(prizeId),
        duration_minutes: durationMinutes,
        reason: note ? `${reason} - ${note}` : reason
      })
    })

    if (response && response.success) {
      showSuccessToast('干预规则创建成功')
      bootstrap.Modal.getInstance(document.getElementById('createInterventionModal')).hide()
      resetForm()
      loadInterventions()
    } else {
      throw new Error(response?.message || '创建失败')
    }
  } catch (error) {
    console.error('创建干预规则失败:', error)
    showErrorToast('创建失败：' + error.message)
  } finally {
    showLoading(false)
  }
}

/**
 * 重置表单
 */
function resetForm() {
  document.getElementById('interventionForm').reset()
  document.getElementById('selectedUser').style.display = 'none'
  document.getElementById('targetUserId').value = ''
  document.getElementById('userSearchResult').innerHTML = ''
  document.getElementById('prizePreview').innerHTML = '未选择奖品'
  document.getElementById('prizePreview').classList.add('text-muted')
}

/**
 * 查看干预规则详情
 * @description 后端返回格式: { setting_id, user, setting_type, setting_data, prize_id, prize_name, reason, status, expires_at, operator, created_at }
 * @param {string} id - 干预规则ID
 */
async function viewIntervention(id) {
  try {
    const response = await apiRequest(`/api/v4/console/lottery-management/interventions/${id}`)

    if (response && response.success) {
      const item = response.data

      // 字段映射对齐后端API：setting_id, user.nickname, user.mobile, prize_name, reason, expires_at, operator
      document.getElementById('viewInterventionBody').innerHTML = `
        <div class="mb-3">
          <label class="form-label text-muted">规则ID</label>
          <div><code>${item.setting_id || ''}</code></div>
        </div>
        <div class="mb-3">
          <label class="form-label text-muted">目标用户</label>
          <div><strong>${item.user?.nickname || '未知'}</strong> (${item.user?.mobile || 'ID:' + item.user?.user_id})</div>
        </div>
        <div class="mb-3">
          <label class="form-label text-muted">设置类型</label>
          <div>${getSettingTypeLabel(item.setting_type)}</div>
        </div>
        <div class="mb-3">
          <label class="form-label text-muted">预设奖品</label>
          <div><strong>${item.prize_name || '未指定奖品'}</strong></div>
        </div>
        <div class="mb-3">
          <label class="form-label text-muted">状态</label>
          <div>${getStatusBadge(item.status)}</div>
        </div>
        <div class="mb-3">
          <label class="form-label text-muted">干预原因</label>
          <div>${item.reason || '未填写'}</div>
        </div>
        <div class="mb-3">
          <label class="form-label text-muted">操作管理员</label>
          <div>${item.operator?.nickname || '系统'}</div>
        </div>
        <div class="row">
          <div class="col-6">
            <label class="form-label text-muted">创建时间</label>
            <div><small>${formatDate(item.created_at)}</small></div>
          </div>
          <div class="col-6">
            <label class="form-label text-muted">过期时间</label>
            <div><small>${item.expires_at ? formatDate(item.expires_at) : '永不过期'}</small></div>
          </div>
        </div>
        ${
          item.status === 'used' && item.setting_data?.used_at
            ? `
          <div class="mt-3 alert alert-success">
            <strong>使用时间：</strong>${formatDate(item.setting_data.used_at)}
          </div>
        `
            : ''
        }
      `

      new bootstrap.Modal(document.getElementById('viewInterventionModal')).show()
    }
  } catch (error) {
    console.error('获取干预规则详情失败:', error)
    showErrorToast('获取详情失败')
  }
}

/**
 * 获取设置类型标签
 * @param {string} type - 设置类型
 * @returns {string} 中文标签
 */
function getSettingTypeLabel(type) {
  const labels = {
    probability_adjust: '概率调整',
    force_win: '强制中奖',
    force_lose: '强制不中奖',
    blacklist: '黑名单'
  }
  return labels[type] || type || '未知类型'
}

/**
 * 取消干预规则
 * @param {string} id - 干预规则ID
 */
async function cancelIntervention(id) {
  if (!confirm('确定要取消此干预规则吗？取消后无法恢复。')) {
    return
  }

  showLoading(true)

  try {
    const response = await apiRequest(
      `/api/v4/console/lottery-management/interventions/${id}/cancel`,
      {
        method: 'POST'
      }
    )

    if (response && response.success) {
      showSuccessToast('干预规则已取消')
      loadInterventions()
    } else {
      throw new Error(response?.message || '取消失败')
    }
  } catch (error) {
    console.error('取消干预规则失败:', error)
    showErrorToast('取消失败：' + error.message)
  } finally {
    showLoading(false)
  }
}
