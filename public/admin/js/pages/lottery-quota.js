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

  // 提交配额规则创建
  document.getElementById('submitAdjustBtn').addEventListener('click', submitCreateRule)

  // 活动筛选变更
  document.getElementById('activitySelect').addEventListener('change', refreshAll)

  // 时间周期变更
  document.getElementById('periodSelect').addEventListener('change', loadQuotaData)

  // 规则类型变更 - 控制活动选择框显示/隐藏
  const ruleTypeSelect = document.getElementById('ruleType')
  if (ruleTypeSelect) {
    ruleTypeSelect.addEventListener('change', function() {
      const campaignContainer = document.getElementById('campaignSelectContainer')
      const modalActivitySelect = document.getElementById('modalActivitySelect')
      if (this.value === 'campaign') {
        campaignContainer.style.display = 'block'
        modalActivitySelect.setAttribute('required', 'required')
      } else {
        campaignContainer.style.display = 'none'
        modalActivitySelect.removeAttribute('required')
      }
    })
  }
}

// ==================== 数据加载函数 ====================

/**
 * 加载配额统计数据
 * 使用 /api/v4/console/lottery-quota/statistics 端点
 */
async function loadStatistics() {
  try {
    // 直接使用后端字段名 campaign_id
    const campaignId = document.getElementById('activitySelect').value
    const params = new URLSearchParams()

    if (campaignId) {
      params.append('campaign_id', campaignId)
    }

    const url = params.toString()
      ? `/api/v4/console/lottery-quota/statistics?${params.toString()}`
      : '/api/v4/console/lottery-quota/statistics'

    const response = await apiRequest(url)

    if (response && response.success) {
      // 直接使用后端返回的字段名
      const { rules, quotas } = response.data

      // 更新规则统计卡片（使用后端字段）
      document.getElementById('totalQuota').textContent = rules?.total || 0
      document.getElementById('usedQuota').textContent = quotas?.today_used || 0
      document.getElementById('remainingQuota').textContent = quotas?.today_remaining || 0

      // 计算使用率（使用后端字段 today_limit）
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
        // 直接使用后端字段名 campaign_id（以后端为准）
        option.value = activity.campaign_id
        option.textContent = activity.name || activity.campaign_name
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
    // 直接使用后端字段名 campaign_id
    const campaignId = document.getElementById('activitySelect').value
    const period = document.getElementById('periodSelect').value

    const params = new URLSearchParams({
      page: currentPage,
      page_size: pageSize,
      period: period
    })

    // 使用后端字段名 campaign_id（而不是 activity_id）
    if (campaignId) {
      params.append('campaign_id', campaignId)
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
 * 直接使用后端返回的字段名（以后端为准）
 * 
 * 后端返回字段：
 * - rule_id: 规则ID（字符串）
 * - scope_type: 规则类型（global/campaign/role/user）
 * - scope_id: 作用范围ID
 * - limit_value: 每日上限
 * - priority: 优先级
 * - status: 状态（active/inactive）
 * - effective_from/effective_to: 生效时间范围
 * 
 * @param {Array} rules - 配额规则数组
 */
function renderQuotaTable(rules) {
  const tbody = document.getElementById('quotaTableBody')

  if (!rules || rules.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-5 text-muted">
          <i class="bi bi-inbox" style="font-size: 3rem;"></i>
          <p class="mt-2">暂无配额规则</p>
        </td>
      </tr>
    `
    return
  }

  tbody.innerHTML = rules
    .map(rule => {
      // 直接使用后端字段 status
      const statusBadge =
        rule.status === 'active'
          ? '<span class="badge bg-success">有效</span>'
          : '<span class="badge bg-secondary">已禁用</span>'

      // 直接使用后端字段 scope_type
      const scopeTypeText = getQuotaTypeText(rule.scope_type)
      
      // 直接使用后端字段 scope_type 和 scope_id
      let scopeText = '-'
      if (rule.scope_type === 'global') {
        scopeText = '全局'
      } else if (rule.scope_type === 'campaign') {
        scopeText = `活动ID: ${rule.scope_id}`
      } else if (rule.scope_type === 'role') {
        scopeText = `角色: ${rule.scope_id}`
      } else if (rule.scope_type === 'user') {
        scopeText = `用户ID: ${rule.scope_id}`
      }

      // 直接使用后端字段 effective_from 和 effective_to
      let effectiveText = '永久有效'
      if (rule.effective_from || rule.effective_to) {
        const from = rule.effective_from ? formatDate(rule.effective_from) : '开始'
        const to = rule.effective_to ? formatDate(rule.effective_to) : '永久'
        effectiveText = `${from} ~ ${to}`
      }

      // 直接使用后端字段 rule_id, limit_value, priority
      return `
      <tr>
        <td>${rule.rule_id}</td>
        <td><span class="badge bg-primary">${scopeTypeText}</span></td>
        <td>${scopeText}</td>
        <td><strong>${rule.limit_value}</strong> 次/天</td>
        <td>${rule.priority ?? '-'}</td>
        <td><small>${effectiveText}</small></td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn btn-sm btn-outline-danger" onclick="disableRule('${rule.rule_id}')" ${rule.status === 'inactive' ? 'disabled' : ''} title="禁用规则">
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
 * 直接使用后端字段 rule_id（后端返回的是字符串类型）
 * 
 * @param {string|number} ruleId - 规则ID（后端返回字符串，但也兼容数字）
 */
async function disableRule(ruleId) {
  if (!confirm('确定要禁用此规则吗？')) {
    return
  }

  try {
    // 直接使用后端API路径，rule_id 作为路径参数
    const response = await apiRequest(`/api/v4/console/lottery-quota/rules/${ruleId}/disable`, {
      method: 'PUT'
    })

    if (response && response.success) {
      showSuccessToast('规则已禁用')
      loadQuotaData()
      loadStatistics()  // 同时刷新统计数据
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
 * 
 * 后端API参数（以后端为准，直接使用后端字段名）：
 * - rule_type: 规则类型（global/campaign/role/user）
 * - campaign_id: 活动ID（campaign类型必填，使用后端字段名）
 * - limit_value: 每日抽奖次数上限
 * - reason: 创建原因（可选）
 */
async function submitCreateRule() {
  const form = document.getElementById('adjustQuotaForm')

  if (!form.checkValidity()) {
    form.reportValidity()
    return
  }

  // 直接使用后端字段名 rule_type
  const ruleType = document.getElementById('ruleType')?.value
  if (!ruleType) {
    showErrorToast('请选择规则类型')
    return
  }

  // 直接使用后端字段名 limit_value
  const limitValue = parseInt(document.getElementById('limitValue')?.value)
  if (!limitValue || limitValue <= 0) {
    showErrorToast('请输入有效的每日上限次数')
    return
  }

  // 构建请求数据（直接使用后端字段名，无复杂映射）
  const data = {
    rule_type: ruleType,       // 后端字段
    limit_value: limitValue,   // 后端字段
    reason: document.getElementById('adjustReason')?.value?.trim() || null
  }

  // 如果是活动规则，添加 campaign_id（后端字段名）
  if (ruleType === 'campaign') {
    const campaignId = document.getElementById('modalActivitySelect')?.value
    if (!campaignId) {
      showErrorToast('活动规则必须选择一个活动')
      return
    }
    data.campaign_id = parseInt(campaignId)  // 后端字段名
  }

  try {
    const submitBtn = document.getElementById('submitAdjustBtn')
    submitBtn.disabled = true
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>创建中...'

    const response = await apiRequest('/api/v4/console/lottery-quota/rules', {
      method: 'POST',
      body: JSON.stringify(data)
    })

    if (response && response.success) {
      showSuccessToast('配额规则创建成功')
      bootstrap.Modal.getInstance(document.getElementById('adjustQuotaModal')).hide()
      form.reset()
      // 重置活动选择容器的显示状态
      document.getElementById('campaignSelectContainer').style.display = 'none'
      // 刷新统计和列表
      await refreshAll()
    } else {
      showErrorToast(response?.message || '创建失败')
    }
  } catch (error) {
    console.error('配额规则创建失败:', error)
    showErrorToast(error.message)
  } finally {
    const submitBtn = document.getElementById('submitAdjustBtn')
    submitBtn.disabled = false
    submitBtn.innerHTML = '创建规则'
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
