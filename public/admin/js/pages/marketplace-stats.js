/**
 * 用户上架状态统计页面
 * @description 统计用户商品上架情况
 * @author Admin
 * @created 2026-01-09
 */

// ============================================
// 全局变量
// ============================================

let currentPage = 1
let pageSize = 20
let currentFilter = 'all'

// ============================================
// 页面初始化
// ============================================

document.addEventListener('DOMContentLoaded', function () {
  // 检查登录状态
  checkAuth()

  // 加载数据
  fetchStats()

  // 绑定事件
  document.getElementById('searchBtn').addEventListener('click', handleSearch)
  document.getElementById('resetBtn').addEventListener('click', handleReset)
  document.getElementById('filterSelect').addEventListener('change', handleFilterChange)
  document.getElementById('logoutBtn').addEventListener('click', handleLogout)
})

/**
 * 检查认证
 */
function checkAuth() {
  const token = localStorage.getItem('admin_token')
  if (!token) {
    window.location.href = '/admin/login.html'
    return
  }

  // 显示用户信息
  const userInfo = getCurrentUser()
  if (userInfo && userInfo.nickname) {
    document.getElementById('welcomeText').textContent = `欢迎，${userInfo.nickname}`
  }
}

// ============================================
// 数据获取
// ============================================

/**
 * 获取统计数据
 */
async function fetchStats() {
  try {
    const token = localStorage.getItem('admin_token')
    const params = new URLSearchParams({
      page: currentPage,
      limit: pageSize,
      filter: currentFilter
    })

    const response = await fetch(`/api/v4/console/marketplace/listing-stats?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    const data = await response.json()

    if (data.success) {
      updateSummary(data.data.summary)
      updateTable(data.data.stats)
      updatePagination(data.data.pagination)
    } else {
      showError('获取数据失败')
    }
  } catch (error) {
    console.error('获取统计数据失败', error)
    showError('获取数据失败，请稍后重试')
  }
}

/**
 * 更新统计概览
 */
function updateSummary(summary) {
  document.getElementById('totalUsersWithListings').textContent = summary.total_users_with_listings
  document.getElementById('usersNearLimit').textContent = summary.users_near_limit
  document.getElementById('usersAtLimit').textContent = summary.users_at_limit
}

/**
 * 更新表格
 *
 * 后端返回的stats字段格式：
 * - user_id: 用户ID
 * - mobile: 手机号
 * - nickname: 昵称
 * - status: 用户状态
 * - listing_count: 上架数量
 * - remaining_quota: 剩余配额
 * - is_at_limit: 是否达到上限
 */
function updateTable(stats) {
  const tbody = document.getElementById('statsTableBody')

  if (!stats || stats.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">暂无数据</td></tr>'
    return
  }

  // 获取最大上架限制（默认10）
  const maxListings = 10

  tbody.innerHTML = stats
    .map(item => {
      // 计算百分比
      const percentage = Math.min(100, Math.round((item.listing_count / maxListings) * 100))
      // 确定上架状态
      const listingStatus = item.is_at_limit
        ? 'at_limit'
        : item.listing_count >= maxListings * 0.8
          ? 'near_limit'
          : 'normal'

      return `
    <tr>
      <td>${item.user_id}</td>
      <td>${item.nickname || '-'}</td>
      <td>${item.mobile || '-'}</td>
      <td>
        <div>
          <span class="badge ${getStatusBadgeClass(listingStatus)}">
            ${item.listing_count} / ${maxListings}
          </span>
          <div class="progress mt-2" style="height: 8px;">
            <div class="progress-bar ${getProgressClass(percentage)}" 
                 role="progressbar" 
                 style="width: ${percentage}%"
                 aria-valuenow="${percentage}" 
                 aria-valuemin="0" 
                 aria-valuemax="100">
            </div>
          </div>
        </div>
      </td>
      <td>
        <span class="${item.remaining_quota === 0 ? 'text-danger fw-bold' : ''}">
          ${item.remaining_quota} 件
        </span>
      </td>
      <td>
        <span class="badge ${getStatusTagClass(listingStatus)}">
          ${getStatusText(listingStatus)}
        </span>
      </td>
      <td>${getUserStatusBadge(item.status)}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary btn-view-listings" data-user-id="${item.user_id}">
          查看商品
        </button>
      </td>
    </tr>
  `
    })
    .join('')

  // 使用 addEventListener 绑定事件（避免 CSP 内联脚本警告）
  tbody.querySelectorAll('.btn-view-listings').forEach(btn => {
    btn.addEventListener('click', function () {
      const userId = this.getAttribute('data-user-id')
      viewUserListings(userId)
    })
  })
}

/**
 * 更新分页
 */
function updatePagination(pagination) {
  const paginationEl = document.getElementById('pagination')
  const totalPages = pagination.total_pages

  if (totalPages <= 1) {
    paginationEl.innerHTML = ''
    return
  }

  let html = ''

  // 上一页
  html += `
    <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
      <a class="page-link page-btn" href="#" data-page="${currentPage - 1}">上一页</a>
    </li>
  `

  // 页码
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      html += `
        <li class="page-item ${i === currentPage ? 'active' : ''}">
          <a class="page-link page-btn" href="#" data-page="${i}">${i}</a>
        </li>
      `
    } else if (i === currentPage - 3 || i === currentPage + 3) {
      html += '<li class="page-item disabled"><span class="page-link">...</span></li>'
    }
  }

  // 下一页
  html += `
    <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
      <a class="page-link page-btn" href="#" data-page="${currentPage + 1}">下一页</a>
    </li>
  `

  paginationEl.innerHTML = html

  // 使用 addEventListener 绑定分页事件（避免 CSP 内联脚本警告）
  paginationEl.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', function (e) {
      e.preventDefault()
      const page = parseInt(this.getAttribute('data-page'))
      if (!isNaN(page) && page >= 1 && page <= totalPages) {
        changePage(page)
      }
    })
  })
}

// ============================================
// 事件处理
// ============================================

/**
 * 切换页码
 */
function changePage(page) {
  currentPage = page
  fetchStats()
}

/**
 * 处理搜索
 */
function handleSearch() {
  currentPage = 1
  fetchStats()
}

/**
 * 处理重置
 */
function handleReset() {
  currentFilter = 'all'
  currentPage = 1
  document.getElementById('filterSelect').value = 'all'
  fetchStats()
}

/**
 * 处理筛选变化
 */
function handleFilterChange(e) {
  currentFilter = e.target.value
  currentPage = 1
  fetchStats()
}

/**
 * 查看用户商品
 */
function viewUserListings(userId) {
  window.location.href = `/admin/users.html?user_id=${userId}&tab=inventory`
}

/**
 * 退出登录
 */
function handleLogout() {
  localStorage.removeItem('admin_token')
  window.location.href = '/admin/login.html'
}

// ============================================
// 辅助函数
// ============================================

/**
 * 获取状态徽章样式
 */
function getStatusBadgeClass(status) {
  const classMap = {
    at_limit: 'bg-danger',
    near_limit: 'bg-warning',
    normal: 'bg-success'
  }
  return classMap[status] || 'bg-secondary'
}

/**
 * 获取进度条样式
 */
function getProgressClass(percentage) {
  if (percentage >= 100) return 'bg-danger'
  if (percentage >= 80) return 'bg-warning'
  return 'bg-success'
}

/**
 * 获取状态标签样式
 */
function getStatusTagClass(status) {
  const classMap = {
    at_limit: 'bg-danger',
    near_limit: 'bg-warning',
    normal: 'bg-success'
  }
  return classMap[status] || 'bg-secondary'
}

/**
 * 获取状态文本
 */
function getStatusText(status) {
  const textMap = {
    at_limit: '已满',
    near_limit: '接近',
    normal: '正常'
  }
  return textMap[status] || '未知'
}

/**
 * 格式化日期
 */
function formatDate(dateStr) {
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

/**
 * 获取用户状态徽章
 *
 * 后端返回的status字段是用户账户状态：
 * - active: 正常
 * - inactive: 禁用
 * - suspended: 暂停
 */
function getUserStatusBadge(status) {
  const statusMap = {
    active: { text: '正常', class: 'bg-success' },
    inactive: { text: '禁用', class: 'bg-danger' },
    suspended: { text: '暂停', class: 'bg-warning' }
  }
  const config = statusMap[status] || { text: status || '未知', class: 'bg-secondary' }
  return `<span class="badge ${config.class}">${config.text}</span>`
}

/**
 * 显示错误
 */
function showError(message) {
  alert(message)
}
