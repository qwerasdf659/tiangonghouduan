/**
 * 抽奖配额管理页面
 *
 * @file public/admin/js/pages/lottery-quota.js
 * @description 管理抽奖活动的配额分配和使用情况
 * @version 1.0.0
 * @date 2026-01-09
 *
 * 依赖模块：
 * - /admin/js/admin-common.js  - Token管理、API请求、日期格式化
 * - /admin/js/common/toast.js  - Toast提示组件
 *
 * API端点：
 * - GET  /api/v4/console/lottery-quota/statistics     - 获取配额统计数据
 * - GET  /api/v4/console/lottery-quota/rules          - 获取配额规则列表
 * - POST /api/v4/console/lottery-quota/rules          - 创建配额规则
 * - PUT  /api/v4/console/lottery-quota/rules/:id/disable - 禁用配额规则
 * - GET  /api/v4/activities                            - 获取活动列表
 */

// ==================== 全局变量 ====================

/**
 * 当前页码
 * @type {number}
 */
let currentPage = 1

/**
 * 每页显示数量
 * @type {number}
 */
const pageSize = 20

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

  // 绑定事件监听器
  bindEventListeners()

  // Token和权限验证
  if (!getToken() || !checkAdminPermission()) {
    return
  }

  // 加载初始数据
  loadActivities()
  loadStatistics()
  loadQuotaData()
})

/**
 * 绑定事件监听器
 * 集中管理所有事件绑定，便于维护
 */
function bindEventListeners() {
  // 退出登录
  document.getElementById('logoutBtn').addEventListener('click', logout)

  // 刷新数据
  document.getElementById('refreshBtn').addEventListener('click', refreshAll)

  // 提交配额调整
  document.getElementById('submitAdjustBtn').addEventListener('click', submitAdjustQuota)

  // 活动筛选变更
  document.getElementById('activitySelect').addEventListener('change', refreshAll)

  // 时间周期变更
  document.getElementById('periodSelect').addEventListener('change', loadQuotaData)
}

// ==================== 数据加载函数 ====================

/**
 * 加载配额统计数据
 * 使用 /api/v4/console/lottery-quota/statistics 端点
 */
async function loadStatistics() {
  try {
    const activityId = document.getElementById('activitySelect').value
    const params = new URLSearchParams()

    if (activityId) {
      params.append('campaign_id', activityId)
    }

    const url = params.toString()
      ? `/api/v4/console/lottery-quota/statistics?${params.toString()}`
      : '/api/v4/console/lottery-quota/statistics'

    const response = await apiRequest(url)

    if (response && response.success) {
      const { rules, quotas } = response.data

      // 更新规则统计卡片
      document.getElementById('totalQuota').textContent = rules?.total || 0
      document.getElementById('usedQuota').textContent = quotas?.today_used || 0
      document.getElementById('remainingQuota').textContent = quotas?.today_remaining || 0

      // 计算使用率
      const totalLimit = quotas?.today_limit || 0
      const usedCount = quotas?.today_used || 0
      const usageRate = totalLimit > 0 ? Math.round((usedCount / totalLimit) * 100) + '%' : '0%'
      document.getElementById('usageRate').textContent = usageRate
    }
  } catch (error) {
    console.error('加载统计数据失败:', error)
    // 统计数据加载失败不影响主功能，仅记录错误
  }
}

/**
 * 刷新所有数据（统计 + 规则列表）
 */
async function refreshAll() {
  await loadStatistics()
  await loadQuotaData()
}

/**
 * 加载活动列表
 * 使用 /api/v4/activities 端点
 */
async function loadActivities() {
  try {
    const response = await apiRequest('/api/v4/activities')

    if (response && response.success) {
      const activities = response.data.activities || response.data || []
      const select = document.getElementById('activitySelect')
      const modalSelect = document.getElementById('modalActivitySelect')

      activities.forEach(activity => {
        const option = document.createElement('option')
        option.value = activity.activity_id
        option.textContent = activity.name
        select.appendChild(option.cloneNode(true))
        modalSelect.appendChild(option)
      })
    }
  } catch (error) {
    console.error('加载活动列表失败:', error)
  }
}

/**
 * 加载配额规则数据
 * 使用 /api/v4/console/lottery-quota/rules 端点
 */
async function loadQuotaData() {
  showLoading(true)
  const tbody = document.getElementById('quotaTableBody')

  try {
    const activityId = document.getElementById('activitySelect').value
    const period = document.getElementById('periodSelect').value

    const params = new URLSearchParams({
      page: currentPage,
      page_size: pageSize,
      period: period
    })

    if (activityId) {
      params.append('activity_id', activityId)
    }

    const response = await apiRequest(`/api/v4/console/lottery-quota/rules?${params.toString()}`)

    if (response && response.success) {
      const { rules, pagination } = response.data

      // 渲染表格
      renderQuotaTable(rules || [])

      // 渲染分页
      if (pagination) {
        renderPagination(pagination)
      }
    } else {
      showErrorToast(response?.message || '加载失败')
    }
  } catch (error) {
    console.error('加载配额数据失败:', error)
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-5 text-danger">
          <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
          <p class="mt-2">加载失败：${error.message}</p>
        </td>
      </tr>
    `
  } finally {
    showLoading(false)
  }
}

// ==================== 渲染函数 ====================

/**
 * 渲染配额规则表格
 * @param {Array} rules - 配额规则数组
 */
function renderQuotaTable(rules) {
  const tbody = document.getElementById('quotaTableBody')

  if (!rules || rules.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-5 text-muted">
          <i class="bi bi-inbox" style="font-size: 3rem;"></i>
          <p class="mt-2">暂无配额规则</p>
        </td>
      </tr>
    `
    return
  }

  tbody.innerHTML = rules
    .map(rule => {
      const statusBadge =
        rule.status === 'active'
          ? '<span class="badge bg-success">有效</span>'
          : '<span class="badge bg-secondary">已禁用</span>'

      return `
      <tr>
        <td>${rule.rule_id}</td>
        <td>${rule.campaign_name || rule.campaign_id || '-'}</td>
        <td>${rule.scope_id || '-'}</td>
        <td>${getQuotaTypeText(rule.scope_type)}</td>
        <td>${rule.limit_value}</td>
        <td>${rule.priority || '-'}</td>
        <td>-</td>
        <td>${formatDate(rule.effective_to) || '永久'}</td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn btn-sm btn-outline-danger" onclick="disableRule(${rule.rule_id})" ${rule.status === 'inactive' ? 'disabled' : ''}>
            <i class="bi bi-x-circle"></i>
          </button>
        </td>
      </tr>
    `
    })
    .join('')
}

/**
 * 获取配额规则类型文字
 * @param {string} type - 规则类型 (global/campaign/role/user)
 * @returns {string} 类型中文描述
 */
function getQuotaTypeText(type) {
  const types = {
    global: '全局规则',
    campaign: '活动规则',
    role: '角色规则',
    user: '用户规则'
  }
  return types[type] || type
}

/**
 * 渲染分页组件
 * @param {Object} pagination - 分页信息对象
 */
function renderPagination(pagination) {
  const nav = document.getElementById('paginationNav')

  if (!pagination || pagination.total_pages <= 1) {
    nav.innerHTML = ''
    return
  }

  let html = '<ul class="pagination pagination-sm justify-content-center mb-0">'

  // 上一页
  html += `
    <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
      <a class="page-link" href="#" onclick="goToPage(${currentPage - 1}); return false;">上一页</a>
    </li>
  `

  // 页码
  for (let i = 1; i <= pagination.total_pages; i++) {
    if (i === 1 || i === pagination.total_pages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      html += `
        <li class="page-item ${i === currentPage ? 'active' : ''}">
          <a class="page-link" href="#" onclick="goToPage(${i}); return false;">${i}</a>
        </li>
      `
    } else if (i === currentPage - 3 || i === currentPage + 3) {
      html += '<li class="page-item disabled"><span class="page-link">...</span></li>'
    }
  }

  // 下一页
  html += `
    <li class="page-item ${currentPage === pagination.total_pages ? 'disabled' : ''}">
      <a class="page-link" href="#" onclick="goToPage(${currentPage + 1}); return false;">下一页</a>
    </li>
  `

  html += '</ul>'
  nav.innerHTML = html
}

// ==================== 操作函数 ====================

/**
 * 跳转到指定页
 * @param {number} page - 页码
 */
function goToPage(page) {
  currentPage = page
  loadQuotaData()
}

/**
 * 禁用配额规则
 * @param {number} ruleId - 规则ID
 */
async function disableRule(ruleId) {
  if (!confirm('确定要禁用此规则吗？')) {
    return
  }

  try {
    const response = await apiRequest(`/api/v4/console/lottery-quota/rules/${ruleId}/disable`, {
      method: 'PUT'
    })

    if (response && response.success) {
      showSuccessToast('规则已禁用')
      loadQuotaData()
    } else {
      showErrorToast(response?.message || '禁用失败')
    }
  } catch (error) {
    console.error('禁用规则失败:', error)
    showErrorToast(error.message)
  }
}

/**
 * 提交配额规则创建
 * POST /api/v4/console/lottery-quota/rules
 */
async function submitAdjustQuota() {
  const form = document.getElementById('adjustQuotaForm')

  if (!form.checkValidity()) {
    form.reportValidity()
    return
  }

  const ruleType = document.getElementById('adjustType')?.value || 'campaign'
  const data = {
    rule_type: ruleType,
    campaign_id: parseInt(document.getElementById('modalActivitySelect').value) || null,
    limit_value: parseInt(document.getElementById('adjustAmount').value),
    reason: document.getElementById('adjustReason').value.trim()
  }

  try {
    const submitBtn = document.getElementById('submitAdjustBtn')
    submitBtn.disabled = true
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>提交中...'

    const response = await apiRequest('/api/v4/console/lottery-quota/rules', {
      method: 'POST',
      body: JSON.stringify(data)
    })

    if (response && response.success) {
      showSuccessToast('配额规则创建成功')
      bootstrap.Modal.getInstance(document.getElementById('adjustQuotaModal')).hide()
      form.reset()
      loadQuotaData()
    } else {
      showErrorToast(response?.message || '创建失败')
    }
  } catch (error) {
    console.error('配额规则创建失败:', error)
    showErrorToast(error.message)
  } finally {
    const submitBtn = document.getElementById('submitAdjustBtn')
    submitBtn.disabled = false
    submitBtn.innerHTML = '确认创建'
  }
}

/**
 * 编辑配额规则（当前仅支持禁用）
 * @param {number} quotaId - 配额ID
 */
function editQuota(quotaId) {
  showInfoToast('请使用禁用按钮来停用规则，规则禁用后需新建规则')
}

// ==================== 工具函数 ====================

/**
 * 显示/隐藏加载状态
 * @param {boolean} show - 是否显示
 */
function showLoading(show) {
  const overlay = document.getElementById('loadingOverlay')
  if (overlay) {
    overlay.classList.toggle('show', show)
  }
}
