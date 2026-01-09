/**
 * 活动预算配置页面
 *
 * @file public/admin/js/pages/campaign-budget.js
 * @description 管理抽奖活动的预算分配和使用情况
 * @version 1.1.0
 * @date 2026-01-09
 *
 * 依赖模块：
 * - /admin/js/admin-common.js  - Token管理、API请求、日期格式化
 * - /admin/js/common/toast.js  - Toast提示组件
 *
 * API端点：
 * - GET  /api/v4/console/campaign-budget/batch-status        - 批量获取预算状态
 * - PUT  /api/v4/console/campaign-budget/campaigns/:id       - 设置活动预算
 * - GET  /api/v4/console/activities                          - 获取活动列表
 *
 * 更新记录：
 * - 2026-01-09: 修复字段映射，直接使用后端字段名（campaign_id, campaign_name, pool_budget等）
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
  loadBudgetData()
})

/**
 * 绑定事件监听器
 */
function bindEventListeners() {
  // 退出登录
  document.getElementById('logoutBtn').addEventListener('click', logout)

  // 刷新数据
  document.getElementById('refreshBtn').addEventListener('click', loadBudgetData)

  // 提交预算设置
  document.getElementById('submitBudgetBtn').addEventListener('click', submitBudget)

  // 筛选器变更
  document.getElementById('statusFilter').addEventListener('change', loadBudgetData)
  document.getElementById('budgetTypeFilter').addEventListener('change', loadBudgetData)
}

// ==================== 数据加载函数 ====================

/**
 * 加载活动列表（用于设置预算的下拉选择）
 * 复用 batch-status API 获取活动列表，避免调用不存在的端点
 */
async function loadActivities() {
  try {
    // 使用 batch-status API 获取活动列表（该API已返回所有活动信息）
    const response = await apiRequest('/api/v4/console/campaign-budget/batch-status?limit=50')

    if (response && response.success) {
      // 后端返回格式：{ campaigns: [...], summary: {...} }
      const campaigns = response.data.campaigns || []
      const select = document.getElementById('modalActivitySelect')

      // 清空现有选项（保留第一个"请选择"选项）
      select.innerHTML = '<option value="">请选择活动</option>'

      campaigns.forEach(campaign => {
        const option = document.createElement('option')
        // 使用后端字段名：campaign_id, campaign_name
        option.value = campaign.campaign_id
        option.textContent = campaign.campaign_name
        select.appendChild(option)
      })
    }
  } catch (error) {
    console.error('加载活动列表失败:', error)
  }
}

/**
 * 加载预算数据
 * 使用 /api/v4/console/campaign-budget/batch-status 端点
 * 
 * 后端返回格式：
 * {
 *   campaigns: [{
 *     campaign_id, campaign_name, budget_mode, status,
 *     pool_budget: { total, remaining, used, usage_rate },
 *     statistics: { winning_draws, total_consumed }
 *   }],
 *   summary: { total_campaigns, total_budget, total_remaining, total_used }
 * }
 */
async function loadBudgetData() {
  showLoading(true)
  const tbody = document.getElementById('budgetTableBody')

  try {
    const status = document.getElementById('statusFilter').value
    const budgetType = document.getElementById('budgetTypeFilter').value

    const params = new URLSearchParams({
      limit: pageSize
    })

    const response = await apiRequest(
      `/api/v4/console/campaign-budget/batch-status?${params.toString()}`
    )

    if (response && response.success) {
      // 直接使用后端返回的数据结构，不做字段映射
      const { campaigns, summary } = response.data

      // 更新统计卡片 - 使用后端字段名
      document.getElementById('totalBudget').textContent =
        '¥' + (summary?.total_budget || 0).toFixed(2)
      document.getElementById('usedBudget').textContent =
        '¥' + (summary?.total_used || 0).toFixed(2)
      document.getElementById('remainingBudget').textContent =
        '¥' + (summary?.total_remaining || 0).toFixed(2)
      document.getElementById('activeCampaigns').textContent = summary?.total_campaigns || 0

      // 前端筛选（如果后端不支持筛选参数）
      let filteredCampaigns = campaigns || []
      if (status) {
        filteredCampaigns = filteredCampaigns.filter(c => c.status === status)
      }
      if (budgetType) {
        filteredCampaigns = filteredCampaigns.filter(c => c.budget_mode === budgetType)
      }

      // 渲染表格
      renderBudgetTable(filteredCampaigns)

      // 分页（当前后端不返回分页信息，所以隐藏分页）
      document.getElementById('paginationNav').innerHTML = ''
    } else {
      showErrorToast(response?.message || '加载失败')
    }
  } catch (error) {
    console.error('加载预算数据失败:', error)
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-5 text-danger">
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
 * 渲染预算表格
 * 直接使用后端返回的字段名：
 * - campaign_id, campaign_name, budget_mode, status
 * - pool_budget.total, pool_budget.used, pool_budget.remaining, pool_budget.usage_rate
 * 
 * @param {Array} campaigns - 后端返回的活动数组
 */
function renderBudgetTable(campaigns) {
  const tbody = document.getElementById('budgetTableBody')

  if (!campaigns || campaigns.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-5 text-muted">
          <i class="bi bi-inbox" style="font-size: 3rem;"></i>
          <p class="mt-2">暂无预算数据</p>
        </td>
      </tr>
    `
    return
  }

  tbody.innerHTML = campaigns
    .map(campaign => {
      // 直接使用后端字段
      const poolBudget = campaign.pool_budget || {}
      const total = poolBudget.total || 0
      const used = poolBudget.used || 0
      const remaining = poolBudget.remaining || 0
      
      // 计算使用率
      const usageRate = total > 0 ? ((used / total) * 100).toFixed(1) : 0
      const usageClass =
        usageRate >= 90 ? 'bg-danger' : usageRate >= 70 ? 'bg-warning' : 'bg-success'

      // 状态徽章
      const statusBadge =
        {
          active: '<span class="badge bg-success">进行中</span>',
          pending: '<span class="badge bg-warning">待开始</span>',
          ended: '<span class="badge bg-secondary">已结束</span>',
          draft: '<span class="badge bg-info">草稿</span>'
        }[campaign.status] || '<span class="badge bg-secondary">未知</span>'

      // 预算模式显示
      const budgetModeText = {
        pool: '总预算',
        user: '用户预算',
        daily: '每日预算',
        none: '无预算'
      }[campaign.budget_mode] || campaign.budget_mode || '未设置'

      return `
      <tr>
        <td>${campaign.campaign_id}</td>
        <td>${campaign.campaign_name || '-'}</td>
        <td>${budgetModeText}</td>
        <td>¥${total.toFixed(2)}</td>
        <td>¥${used.toFixed(2)}</td>
        <td>
          <div class="progress" style="height: 20px;">
            <div class="progress-bar ${usageClass}" role="progressbar" 
                 style="width: ${usageRate}%;" 
                 aria-valuenow="${usageRate}" aria-valuemin="0" aria-valuemax="100">
              ${usageRate}%
            </div>
          </div>
        </td>
        <td>${statusBadge}</td>
        <td>${campaign.valid_until ? formatDate(campaign.valid_until) : '-'}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary" onclick="editBudget(${campaign.campaign_id})">
            <i class="bi bi-pencil"></i>
          </button>
        </td>
      </tr>
    `
    })
    .join('')
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

  html += `
    <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
      <a class="page-link" href="#" onclick="goToPage(${currentPage - 1}); return false;">上一页</a>
    </li>
  `

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
  loadBudgetData()
}

/**
 * 提交预算设置
 * PUT /api/v4/console/campaign-budget/campaigns/:campaign_id
 * 
 * 请求体使用后端字段名：
 * - budget_mode: 预算模式
 * - pool_budget_total: 预算总额
 */
async function submitBudget() {
  const form = document.getElementById('setBudgetForm')

  if (!form.checkValidity()) {
    form.reportValidity()
    return
  }

  const campaignId = parseInt(document.getElementById('modalActivitySelect').value)
  if (!campaignId) {
    showErrorToast('请选择活动')
    return
  }

  // 使用后端期望的字段名
  const data = {
    budget_mode: document.getElementById('budgetType')?.value || 'pool',
    pool_budget_total: parseFloat(document.getElementById('budgetAmount').value)
  }

  try {
    const submitBtn = document.getElementById('submitBudgetBtn')
    submitBtn.disabled = true
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>提交中...'

    const response = await apiRequest(`/api/v4/console/campaign-budget/campaigns/${campaignId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })

    if (response && response.success) {
      showSuccessToast('预算设置成功')
      bootstrap.Modal.getInstance(document.getElementById('setBudgetModal')).hide()
      form.reset()
      loadBudgetData()
    } else {
      showErrorToast(response?.message || '设置失败')
    }
  } catch (error) {
    console.error('预算设置失败:', error)
    showErrorToast(error.message)
  } finally {
    const submitBtn = document.getElementById('submitBudgetBtn')
    submitBtn.disabled = false
    submitBtn.innerHTML = '确认设置'
  }
}

/**
 * 编辑预算
 * @param {number} campaignId - 活动ID
 */
function editBudget(campaignId) {
  // 填充表单并打开模态框
  document.getElementById('modalActivitySelect').value = campaignId
  
  const modal = new bootstrap.Modal(document.getElementById('setBudgetModal'))
  modal.show()
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
