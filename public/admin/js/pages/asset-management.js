/**
 * 资产管理中心 - 整合页面
 * @description 整合资产类型配置、用户余额查询、流水记录、资产调整功能
 * @version 2.0.0
 * @created 2026-01-09
 *
 * 整合的原有页面：
 * - material-asset-types.html (资产类型配置)
 * - material-balances.html (用户余额查询)
 * - material-transactions.html (流水记录)
 * - diamond-accounts.html (钻石账户管理)
 */

// ============================================
// 全局变量
// ============================================

// 数据存储
let assetTypes = []
let userBalances = []
let transactions = []

// 当前用户（余额查询）
let currentQueryUserId = null

// 分页状态
let txCurrentPage = 1
const txPageSize = 20

// Bootstrap 实例
let addAssetTypeModal, editAssetTypeModal, adjustBalanceModal
let successToast, errorToast

// ============================================
// 页面初始化
// ============================================

document.addEventListener('DOMContentLoaded', function () {
  // 权限检查
  if (!checkAdminPermission()) return

  // 显示用户信息
  showUserInfo()

  // 初始化 Bootstrap 组件
  initBootstrapComponents()

  // 绑定事件
  bindEvents()

  // 加载初始数据
  loadAssetTypes()

  // Tab 切换时加载对应数据
  initTabHandlers()
})

/**
 * 显示用户信息
 */
function showUserInfo() {
  const user = getCurrentUser()
  if (user) {
    document.getElementById('welcomeText').textContent = `欢迎，${user.nickname || user.mobile}`
  }
}

/**
 * 初始化 Bootstrap 组件
 */
function initBootstrapComponents() {
  addAssetTypeModal = new bootstrap.Modal(document.getElementById('addAssetTypeModal'))
  editAssetTypeModal = new bootstrap.Modal(document.getElementById('editAssetTypeModal'))
  adjustBalanceModal = new bootstrap.Modal(document.getElementById('adjustBalanceModal'))

  successToast = new bootstrap.Toast(document.getElementById('successToast'))
  errorToast = new bootstrap.Toast(document.getElementById('errorToast'))
}

/**
 * 绑定事件
 */
function bindEvents() {
  // 退出登录
  document.getElementById('logoutBtn').addEventListener('click', logout)

  // ========== 资产类型相关 ==========
  document.getElementById('submitAddAssetTypeBtn').addEventListener('click', submitAddAssetType)
  document.getElementById('submitEditAssetTypeBtn').addEventListener('click', submitEditAssetType)
  document.getElementById('assetTypesTableBody').addEventListener('click', handleAssetTypeAction)

  // ========== 用户余额相关 ==========
  document.getElementById('balanceSearchForm').addEventListener('submit', handleBalanceSearch)
  document.getElementById('submitAdjustBalanceBtn').addEventListener('click', submitAdjustBalance)
  document.getElementById('balancesTableBody').addEventListener('click', handleBalanceAction)

  // ========== 流水记录相关 ==========
  document
    .getElementById('transactionFilterForm')
    .addEventListener('submit', handleTransactionSearch)
  document.getElementById('resetTxFilterBtn').addEventListener('click', resetTransactionFilter)

  // ========== 资产调整相关 ==========
  document.getElementById('adjustmentForm').addEventListener('submit', handleDirectAdjustment)
}

/**
 * Tab 切换处理
 */
function initTabHandlers() {
  const tabEls = document.querySelectorAll('#moduleTabs button[data-bs-toggle="pill"]')

  tabEls.forEach(tab => {
    tab.addEventListener('shown.bs.tab', function (e) {
      const targetId = e.target.getAttribute('data-bs-target')

      switch (targetId) {
        case '#asset-types-panel':
          if (assetTypes.length === 0) loadAssetTypes()
          break
        case '#transactions-panel':
          loadTransactions()
          populateAssetTypeSelect('filterTxAssetCode')
          break
        case '#adjustment-panel':
          populateAssetTypeSelect('adjAssetCode')
          break
      }
    })
  })
}

// ============================================
// 资产类型管理
// ============================================

/**
 * 加载资产类型列表
 */
async function loadAssetTypes() {
  const tbody = document.getElementById('assetTypesTableBody')
  showTableLoading(tbody, 9)

  try {
    const response = await apiRequest('/api/v4/console/material/asset-types')

    if (response?.success) {
      // 后端返回格式: { asset_types: [...] }
      assetTypes = response.data?.asset_types || []
      renderAssetTypes()
      updateAssetTypeStats()
    } else {
      showTableError(tbody, 9, response?.message || '加载失败')
    }
  } catch (error) {
    console.error('加载资产类型失败:', error)
    showTableError(tbody, 9, error.message)
  }
}

/**
 * 渲染资产类型列表
 */
function renderAssetTypes() {
  const tbody = document.getElementById('assetTypesTableBody')

  if (assetTypes.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="9" class="text-center py-5">
        <i class="bi bi-inbox text-muted" style="font-size: 3rem;"></i>
        <p class="mt-2 text-muted">暂无资产类型，点击右上角添加</p>
      </td></tr>
    `
    return
  }

  tbody.innerHTML = assetTypes
    .map(
      asset => `
    <tr>
      <td><code>${asset.asset_code}</code></td>
      <td><strong>${escapeHtml(asset.display_name)}</strong></td>
      <td><span class="badge bg-info">${asset.group_code}</span></td>
      <td><span class="badge ${asset.form === 'shard' ? 'bg-warning' : 'bg-primary'}">${asset.form === 'shard' ? '碎片' : '水晶'}</span></td>
      <td><span class="badge bg-secondary">Tier ${asset.tier}</span></td>
      <td class="text-primary fw-bold">${asset.visible_value_points}</td>
      <td class="text-success fw-bold">${asset.budget_value_points}</td>
      <td><span class="badge ${asset.is_enabled ? 'bg-success' : 'bg-secondary'}">${asset.is_enabled ? '已启用' : '已禁用'}</span></td>
      <td>
        <button class="btn btn-sm btn-primary" data-action="edit" data-code="${asset.asset_code}">
          <i class="bi bi-pencil"></i> 编辑
        </button>
        <button class="btn btn-sm btn-${asset.is_enabled ? 'warning' : 'success'}" 
                data-action="toggle" data-code="${asset.asset_code}" data-status="${asset.is_enabled ? 1 : 0}">
          <i class="bi bi-${asset.is_enabled ? 'pause' : 'play'}-circle"></i>
          ${asset.is_enabled ? '禁用' : '启用'}
        </button>
      </td>
    </tr>
  `
    )
    .join('')
}

/**
 * 更新资产类型统计
 */
function updateAssetTypeStats() {
  const total = assetTypes.length
  const enabled = assetTypes.filter(a => a.is_enabled).length
  const disabled = total - enabled
  const groups = new Set(assetTypes.map(a => a.group_code)).size

  document.getElementById('stat_assetTypes_total').textContent = total
  document.getElementById('stat_assetTypes_enabled').textContent = enabled
  document.getElementById('stat_assetTypes_disabled').textContent = disabled
  document.getElementById('stat_assetTypes_groups').textContent = groups
}

/**
 * 处理资产类型表格操作
 */
function handleAssetTypeAction(e) {
  const btn = e.target.closest('[data-action]')
  if (!btn) return

  const action = btn.dataset.action
  const code = btn.dataset.code

  if (action === 'edit') {
    openEditAssetTypeModal(code)
  } else if (action === 'toggle') {
    const currentStatus = btn.dataset.status === '1'
    toggleAssetTypeStatus(code, currentStatus)
  }
}

/**
 * 提交添加资产类型
 */
async function submitAddAssetType() {
  const form = document.getElementById('addAssetTypeForm')
  if (!form.checkValidity()) {
    form.reportValidity()
    return
  }

  const data = {
    asset_code: document.getElementById('assetCode').value.trim(),
    display_name: document.getElementById('displayName').value.trim(),
    group_code: document.getElementById('groupCode').value.trim(),
    form: document.getElementById('form').value,
    tier: parseInt(document.getElementById('tier').value),
    visible_value_points: parseInt(document.getElementById('visibleValue').value),
    budget_value_points: parseInt(document.getElementById('budgetValue').value),
    sort_order: parseInt(document.getElementById('sortOrder').value || 0),
    is_enabled: parseInt(document.getElementById('isEnabled').value)
  }

  try {
    setButtonLoading('submitAddAssetTypeBtn', true)

    const response = await apiRequest('/api/v4/console/material/asset-types', {
      method: 'POST',
      body: JSON.stringify(data)
    })

    if (response?.success) {
      showSuccess('添加成功')
      addAssetTypeModal.hide()
      form.reset()
      loadAssetTypes()
    } else {
      showError(response?.message || '添加失败')
    }
  } catch (error) {
    showError(error.message)
  } finally {
    setButtonLoading('submitAddAssetTypeBtn', false, '<i class="bi bi-check-lg"></i> 确认添加')
  }
}

/**
 * 打开编辑资产类型模态框
 */
function openEditAssetTypeModal(assetCode) {
  const asset = assetTypes.find(a => a.asset_code === assetCode)
  if (!asset) return

  document.getElementById('editAssetCode').value = asset.asset_code
  document.getElementById('editAssetCodeDisplay').value = asset.asset_code
  document.getElementById('editDisplayName').value = asset.display_name
  document.getElementById('editGroupCode').value = asset.group_code
  document.getElementById('editForm').value = asset.form === 'shard' ? '碎片' : '水晶'
  document.getElementById('editTier').value = asset.tier
  document.getElementById('editSortOrder').value = asset.sort_order
  document.getElementById('editVisibleValue').value = asset.visible_value_points
  document.getElementById('editBudgetValue').value = asset.budget_value_points
  document.getElementById('editIsEnabled').value = asset.is_enabled ? '1' : '0'

  editAssetTypeModal.show()
}

/**
 * 提交编辑资产类型
 */
async function submitEditAssetType() {
  const form = document.getElementById('editAssetTypeForm')
  if (!form.checkValidity()) {
    form.reportValidity()
    return
  }

  const assetCode = document.getElementById('editAssetCode').value
  const data = {
    display_name: document.getElementById('editDisplayName').value.trim(),
    visible_value_points: parseInt(document.getElementById('editVisibleValue').value),
    budget_value_points: parseInt(document.getElementById('editBudgetValue').value),
    sort_order: parseInt(document.getElementById('editSortOrder').value || 0),
    is_enabled: parseInt(document.getElementById('editIsEnabled').value)
  }

  try {
    setButtonLoading('submitEditAssetTypeBtn', true)

    const response = await apiRequest(`/api/v4/console/material/asset-types/${assetCode}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })

    if (response?.success) {
      showSuccess('更新成功')
      editAssetTypeModal.hide()
      loadAssetTypes()
    } else {
      showError(response?.message || '更新失败')
    }
  } catch (error) {
    showError(error.message)
  } finally {
    setButtonLoading('submitEditAssetTypeBtn', false, '<i class="bi bi-check-lg"></i> 保存更新')
  }
}

/**
 * 切换资产类型状态
 */
async function toggleAssetTypeStatus(assetCode, currentStatus) {
  const newStatus = currentStatus ? 0 : 1
  const action = newStatus ? '启用' : '禁用'

  if (!confirm(`确定要${action}该资产类型吗？`)) return

  try {
    const response = await apiRequest(`/api/v4/console/material/asset-types/${assetCode}`, {
      method: 'PUT',
      body: JSON.stringify({ is_enabled: newStatus })
    })

    if (response?.success) {
      showSuccess(`${action}成功`)
      loadAssetTypes()
    } else {
      showError(response?.message || `${action}失败`)
    }
  } catch (error) {
    showError(error.message)
  }
}

// ============================================
// 用户余额查询
// ============================================

/**
 * 搜索用户余额
 */
async function handleBalanceSearch(e) {
  e.preventDefault()

  const userId = document.getElementById('searchUserId').value.trim()
  const mobile = document.getElementById('searchMobile').value.trim()

  if (!userId && !mobile) {
    showError('请输入用户ID或手机号')
    return
  }

  try {
    showLoading(true)

    const params = new URLSearchParams()
    if (userId) params.append('user_id', userId)
    if (mobile) params.append('mobile', mobile)

    const response = await apiRequest(`/api/v4/console/asset-adjustment/balances?${params}`)

    if (response?.success) {
      currentQueryUserId = response.data.user?.user_id
      userBalances = response.data.balances || []

      // 显示用户信息
      document.getElementById('userInfoSection').style.display = 'block'
      document.getElementById('balanceUserName').textContent =
        response.data.user?.nickname || '未知用户'
      document.getElementById('balanceUserId').textContent = currentQueryUserId
      document.getElementById('balanceUserMobile').textContent = response.data.user?.mobile || '-'
      document.getElementById('adjustUserId').value = currentQueryUserId

      // 渲染余额列表
      renderUserBalances()

      // 更新调整余额模态框的资产选项
      populateAssetTypeSelect('adjustAssetCode')
    } else {
      showError(response?.message || '查询失败')
    }
  } catch (error) {
    showError(error.message)
  } finally {
    showLoading(false)
  }
}

/**
 * 渲染用户余额列表
 */
function renderUserBalances() {
  const tbody = document.getElementById('balancesTableBody')

  if (userBalances.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="text-center text-muted py-4">暂无资产余额</td></tr>'
    return
  }

  tbody.innerHTML = userBalances
    .map(
      balance => `
    <tr>
      <td><code>${balance.asset_code}</code></td>
      <td><strong>${escapeHtml(balance.display_name || balance.asset_code)}</strong></td>
      <td><span class="badge bg-info">${balance.group_code || '-'}</span></td>
      <td class="text-success fw-bold fs-5">${balance.balance}</td>
      <td class="text-primary">${balance.visible_value || '-'}</td>
      <td>
        <button class="btn btn-sm btn-success" data-action="adjust" data-code="${balance.asset_code}">
          <i class="bi bi-plus-slash-minus"></i> 调整
        </button>
      </td>
    </tr>
  `
    )
    .join('')
}

/**
 * 处理余额表格操作
 */
function handleBalanceAction(e) {
  const btn = e.target.closest('[data-action]')
  if (!btn) return

  const action = btn.dataset.action
  const code = btn.dataset.code

  if (action === 'adjust') {
    document.getElementById('adjustUserId').value = currentQueryUserId
    document.getElementById('adjustAssetCode').value = code
    document.getElementById('adjustAmount').value = ''
    document.getElementById('adjustReason').value = ''
    adjustBalanceModal.show()
  }
}

/**
 * 提交调整余额
 */
async function submitAdjustBalance() {
  const form = document.getElementById('adjustBalanceForm')
  if (!form.checkValidity()) {
    form.reportValidity()
    return
  }

  const data = {
    user_id: parseInt(document.getElementById('adjustUserId').value),
    asset_code: document.getElementById('adjustAssetCode').value,
    amount: parseInt(document.getElementById('adjustAmount').value),
    reason: document.getElementById('adjustReason').value.trim()
  }

  try {
    setButtonLoading('submitAdjustBalanceBtn', true)

    const response = await apiRequest('/api/v4/console/asset-adjustment/adjust', {
      method: 'POST',
      body: JSON.stringify(data)
    })

    if (response?.success) {
      showSuccess('调整成功')
      adjustBalanceModal.hide()

      // 重新搜索用户余额
      if (currentQueryUserId) {
        document.getElementById('searchUserId').value = currentQueryUserId
        document.getElementById('balanceSearchForm').dispatchEvent(new Event('submit'))
      }
    } else {
      showError(response?.message || '调整失败')
    }
  } catch (error) {
    showError(error.message)
  } finally {
    setButtonLoading('submitAdjustBalanceBtn', false, '<i class="bi bi-check-lg"></i> 确认调整')
  }
}

// ============================================
// 流水记录查询
// ============================================

/**
 * 加载流水记录
 */
async function loadTransactions() {
  const tbody = document.getElementById('transactionsTableBody')
  showTableLoading(tbody, 9)

  try {
    const params = new URLSearchParams({
      page: txCurrentPage,
      page_size: txPageSize
    })

    // 筛选条件 - 与后端 /api/v4/console/assets/transactions 参数对应
    const userId = document.getElementById('filterTxUserId').value.trim()
    const assetCode = document.getElementById('filterTxAssetCode').value
    const businessType = document.getElementById('filterTxType').value
    const startDate = document.getElementById('filterTxStartTime').value
    const endDate = document.getElementById('filterTxEndTime').value

    // user_id 是必填参数
    if (!userId) {
      showTableError(tbody, 9, '请输入用户ID后再查询')
      return
    }

    params.append('user_id', userId)
    if (assetCode) params.append('asset_code', assetCode)
    if (businessType) params.append('business_type', businessType)
    if (startDate) params.append('start_date', startDate)
    if (endDate) params.append('end_date', endDate)

    // 注意：流水记录API在 /api/v4/console/assets/transactions
    const response = await apiRequest(`/api/v4/console/assets/transactions?${params}`)

    if (response?.success) {
      // 后端返回格式: { transactions: [...], pagination: {...} }
      transactions = response.data?.transactions || []
      renderTransactions()
      updateTransactionStats()

      if (response.data?.pagination) {
        renderTxPagination(response.data.pagination)
      }
    } else {
      showTableError(tbody, 9, response?.message || '加载失败')
    }
  } catch (error) {
    console.error('加载流水记录失败:', error)
    showTableError(tbody, 9, error.message)
  }
}

/**
 * 渲染流水记录
 */
function renderTransactions() {
  const tbody = document.getElementById('transactionsTableBody')

  if (transactions.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="9" class="text-center text-muted py-4">暂无流水记录</td></tr>'
    return
  }

  tbody.innerHTML = transactions
    .map(tx => {
      // 根据金额判断增减（后端 amount 字段已经是带符号的）
      const isIncrease = tx.amount > 0
      const displayAmount = Math.abs(tx.amount)
      return `
      <tr>
        <td><code>${tx.transaction_id}</code></td>
        <td><span class="badge bg-info">${tx.asset_code}</span> ${tx.asset_name || ''}</td>
        <td><span class="text-${isIncrease ? 'success' : 'danger'} fw-bold">${isIncrease ? '+增加' : '-减少'}</span></td>
        <td><span class="text-${isIncrease ? 'success' : 'danger'} fw-bold">${isIncrease ? '+' : '-'}${displayAmount}</span></td>
        <td class="text-muted">${tx.balance_before}</td>
        <td class="text-info fw-bold">${tx.balance_after}</td>
        <td>${tx.tx_type || '-'}</td>
        <td>${formatDateTime(tx.created_at)}</td>
        <td>
          <button class="btn btn-sm btn-outline-info" onclick="viewTransactionDetail('${tx.transaction_id}')">
            <i class="bi bi-eye"></i>
          </button>
        </td>
      </tr>
    `
    })
    .join('')
}

/**
 * 更新流水统计
 */
function updateTransactionStats() {
  const total = transactions.length
  // 根据金额正负判断增减
  const increase = transactions.filter(t => t.amount > 0).length
  const decrease = transactions.filter(t => t.amount < 0).length

  document.getElementById('stat_tx_total').textContent = total
  document.getElementById('stat_tx_increase').textContent = increase
  document.getElementById('stat_tx_decrease').textContent = decrease
}

/**
 * 搜索流水
 */
function handleTransactionSearch(e) {
  e.preventDefault()
  txCurrentPage = 1
  loadTransactions()
}

/**
 * 重置流水筛选
 */
function resetTransactionFilter() {
  document.getElementById('filterTxUserId').value = ''
  document.getElementById('filterTxAssetCode').value = ''
  document.getElementById('filterTxType').value = ''
  document.getElementById('filterTxStartTime').value = ''
  document.getElementById('filterTxEndTime').value = ''
  txCurrentPage = 1
  loadTransactions()
}

/**
 * 渲染流水分页
 */
function renderTxPagination(pagination) {
  const container = document.getElementById('txPagination')
  if (!pagination || pagination.total_pages <= 1) {
    container.innerHTML = ''
    return
  }

  let html = ''

  html += `<li class="page-item ${txCurrentPage === 1 ? 'disabled' : ''}">
    <a class="page-link" href="#" onclick="changeTxPage(${txCurrentPage - 1}); return false;">上一页</a>
  </li>`

  for (let i = 1; i <= pagination.total_pages; i++) {
    if (
      i === 1 ||
      i === pagination.total_pages ||
      (i >= txCurrentPage - 2 && i <= txCurrentPage + 2)
    ) {
      html += `<li class="page-item ${i === txCurrentPage ? 'active' : ''}">
        <a class="page-link" href="#" onclick="changeTxPage(${i}); return false;">${i}</a>
      </li>`
    } else if (i === txCurrentPage - 3 || i === txCurrentPage + 3) {
      html += '<li class="page-item disabled"><span class="page-link">...</span></li>'
    }
  }

  html += `<li class="page-item ${txCurrentPage === pagination.total_pages ? 'disabled' : ''}">
    <a class="page-link" href="#" onclick="changeTxPage(${txCurrentPage + 1}); return false;">下一页</a>
  </li>`

  container.innerHTML = html
}

/**
 * 切换流水页码
 */
function changeTxPage(page) {
  txCurrentPage = page
  loadTransactions()
}

/**
 * 查看流水详情
 */
function viewTransactionDetail(transactionId) {
  const tx = transactions.find(t => t.transaction_id == transactionId)
  if (tx) {
    const isIncrease = tx.amount > 0
    alert(`流水详情：
流水ID: ${tx.transaction_id}
资产: ${tx.asset_name || tx.asset_code}
类型: ${isIncrease ? '增加' : '减少'}
金额: ${isIncrease ? '+' : ''}${tx.amount}
变动前余额: ${tx.balance_before}
变动后余额: ${tx.balance_after}
业务类型: ${tx.tx_type || '-'}
原因: ${tx.reason || '无'}
幂等键: ${tx.idempotency_key || '-'}
操作人: ${tx.operator_name || '-'}
时间: ${formatDateTime(tx.created_at)}`)
  }
}

// ============================================
// 资产调整（独立表单）
// ============================================

/**
 * 处理直接调整
 */
async function handleDirectAdjustment(e) {
  e.preventDefault()

  const form = e.target
  if (!form.checkValidity()) {
    form.reportValidity()
    return
  }

  const data = {
    user_id: parseInt(document.getElementById('adjUserId').value),
    asset_code: document.getElementById('adjAssetCode').value,
    amount: parseInt(document.getElementById('adjAmount').value),
    reason: document.getElementById('adjReason').value.trim()
  }

  try {
    showLoading(true)

    const response = await apiRequest('/api/v4/console/asset-adjustment/adjust', {
      method: 'POST',
      body: JSON.stringify(data)
    })

    if (response?.success) {
      showSuccess('资产调整成功')
      form.reset()
    } else {
      showError(response?.message || '调整失败')
    }
  } catch (error) {
    showError(error.message)
  } finally {
    showLoading(false)
  }
}

// ============================================
// 辅助函数
// ============================================

/**
 * 填充资产类型下拉选项
 */
function populateAssetTypeSelect(selectId) {
  const select = document.getElementById(selectId)
  if (!select) return

  const currentValue = select.value
  select.innerHTML = '<option value="">请选择</option>'

  assetTypes
    .filter(a => a.is_enabled)
    .forEach(asset => {
      const option = document.createElement('option')
      option.value = asset.asset_code
      option.textContent = `${asset.display_name} (${asset.asset_code})`
      select.appendChild(option)
    })

  if (currentValue) {
    select.value = currentValue
  }
}

/**
 * 显示表格加载状态
 */
function showTableLoading(tbody, colspan) {
  tbody.innerHTML = `
    <tr><td colspan="${colspan}" class="text-center py-5">
      <div class="spinner-border text-primary"></div>
      <p class="mt-2 text-muted">正在加载数据...</p>
    </td></tr>
  `
}

/**
 * 显示表格错误
 */
function showTableError(tbody, colspan, message) {
  tbody.innerHTML = `
    <tr><td colspan="${colspan}" class="text-center py-5 text-danger">
      <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
      <p class="mt-2">加载失败：${escapeHtml(message)}</p>
    </td></tr>
  `
}

/**
 * 设置按钮加载状态
 */
function setButtonLoading(btnId, loading, originalText = '') {
  const btn = document.getElementById(btnId)
  if (!btn) return

  if (loading) {
    btn.disabled = true
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>处理中...'
  } else {
    btn.disabled = false
    btn.innerHTML = originalText
  }
}

/**
 * 显示/隐藏加载遮罩
 */
function showLoading(show) {
  const overlay = document.getElementById('loadingOverlay')
  if (overlay) {
    overlay.classList.toggle('show', show)
  }
}

/**
 * 显示成功提示
 */
function showSuccess(message) {
  document.getElementById('successToastBody').textContent = message
  successToast.show()
}

/**
 * 显示错误提示
 */
function showError(message) {
  document.getElementById('errorToastBody').textContent = message
  errorToast.show()
}

/**
 * 格式化日期时间
 */
function formatDateTime(dateStr) {
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
 * HTML转义
 */
function escapeHtml(text) {
  if (!text) return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// 暴露到全局（分页需要）
window.changeTxPage = changeTxPage
window.viewTransactionDetail = viewTransactionDetail
