/**
 * 材料流水查询页面
 * @description 查询和展示用户的材料/资产交易流水记录
 * @created 2026-01-09
 * @version 1.0.0
 */

// ============================================================
// 全局变量
// ============================================================
let assetTypes = []
let currentPage = 1
let pageSize = 20
let totalRecords = 0
let successToastInstance, errorToastInstance

// ============================================================
// 页面初始化
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
  // 权限检查
  if (!checkAdminPermission()) {
    return
  }

  // 显示用户信息
  const user = getCurrentUser()
  if (user) {
    document.getElementById('welcomeText').textContent = `欢迎，${user.nickname || user.mobile}`
  }

  // 初始化Toast
  successToastInstance = new bootstrap.Toast(document.getElementById('successToast'))
  errorToastInstance = new bootstrap.Toast(document.getElementById('errorToast'))

  // 加载资产类型
  loadAssetTypes()

  // 退出登录
  document.getElementById('logoutBtn').addEventListener('click', logout)

  // 筛选表单提交
  document.getElementById('filterForm').addEventListener('submit', handleFilter)

  // 重置按钮
  document.getElementById('resetBtn').addEventListener('click', resetFilter)
})

// ============================================================
// 资产类型管理
// ============================================================

/**
 * 加载资产类型
 * @returns {Promise<void>}
 */
async function loadAssetTypes() {
  try {
    const response = await apiRequest('/api/v4/console/asset-adjustment/asset-types')
    if (response && response.success) {
      // 后端返回格式: { asset_types: [...], total: n }
      assetTypes = response.data.asset_types || response.data || []
      populateAssetSelect()
    }
  } catch (error) {
    console.error('加载资产类型失败:', error)
  }
}

/**
 * 填充资产选择框
 */
function populateAssetSelect() {
  const select = document.getElementById('filterAssetCode')
  const options = assetTypes
    .map(a => `<option value="${a.asset_code}">${a.display_name} (${a.asset_code})</option>`)
    .join('')

  select.innerHTML = '<option value="">全部</option>' + options
}

// ============================================================
// 筛选功能
// ============================================================

/**
 * 处理筛选
 * @param {Event} e - 表单提交事件
 */
function handleFilter(e) {
  e.preventDefault()
  currentPage = 1
  loadTransactions()
}

/**
 * 重置筛选
 */
function resetFilter() {
  document.getElementById('filterForm').reset()
  currentPage = 1
  const tbody = document.getElementById('transactionsTableBody')
  tbody.innerHTML = `
    <tr>
      <td colspan="10" class="text-center py-5">
        <i class="bi bi-inbox text-muted" style="font-size: 3rem;"></i>
        <p class="mt-2 text-muted">请设置筛选条件并点击查询</p>
      </td>
    </tr>
  `
  document.getElementById('paginationNav').style.display = 'none'
  resetStatistics()
}

// ============================================================
// 数据加载和渲染
// ============================================================

/**
 * 加载交易流水
 * @returns {Promise<void>}
 */
async function loadTransactions() {
  const tbody = document.getElementById('transactionsTableBody')
  tbody.innerHTML = `
    <tr>
      <td colspan="10" class="text-center py-5">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">加载中...</span>
        </div>
        <p class="mt-2 text-muted">正在加载数据...</p>
      </td>
    </tr>
  `

  // 构建查询参数
  const params = new URLSearchParams()

  const userId = document.getElementById('filterUserId').value.trim()
  const businessId = document.getElementById('filterBusinessId').value.trim()
  const assetCode = document.getElementById('filterAssetCode').value
  const txType = document.getElementById('filterTxType').value
  const startTime = document.getElementById('filterStartTime').value
  const endTime = document.getElementById('filterEndTime').value

  // ✅ 对齐后端：/api/v4/console/assets/transactions 需要 user_id 参数
  if (!userId) {
    showErrorToast('请输入用户ID（必填）')
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-5 text-warning">
          <i class="bi bi-info-circle" style="font-size: 2rem;"></i>
          <p class="mt-2">请输入用户ID后查询</p>
        </td>
      </tr>
    `
    return
  }

  params.append('user_id', userId)
  if (businessId) params.append('business_id', businessId)
  if (assetCode) params.append('asset_code', assetCode)
  if (txType) params.append('tx_type', txType)
  if (startTime) params.append('start_time', startTime)
  if (endTime) params.append('end_time', endTime)

  params.append('page', currentPage)
  params.append('page_size', pageSize)

  try {
    const response = await apiRequest(`/api/v4/console/assets/transactions?${params.toString()}`)

    if (response && response.success) {
      const { transactions, pagination } = response.data

      totalRecords = pagination.total
      renderTransactions(transactions)
      updateStatistics(transactions)
      renderPagination(pagination)
    } else {
      showErrorToast(response?.message || '查询失败')
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center py-5 text-danger">
            <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
            <p class="mt-2">查询失败：${response?.message || '未知错误'}</p>
          </td>
        </tr>
      `
    }
  } catch (error) {
    console.error('加载交易流水失败:', error)
    showErrorToast(error.message)
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-5 text-danger">
          <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
          <p class="mt-2">加载失败：${error.message}</p>
        </td>
      </tr>
    `
  }
}

/**
 * 渲染交易流水列表
 * @param {Array} transactions - 交易记录列表
 */
function renderTransactions(transactions) {
  const tbody = document.getElementById('transactionsTableBody')

  if (transactions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-5">
          <i class="bi bi-inbox text-muted" style="font-size: 3rem;"></i>
          <p class="mt-2 text-muted">未找到符合条件的记录</p>
        </td>
      </tr>
    `
    return
  }

  tbody.innerHTML = transactions
    .map(
      tx => `
    <tr>
      <td><code>#${tx.tx_id}</code></td>
      <td><code>${tx.user_id}</code></td>
      <td>
        <span class="badge bg-info">${tx.asset_code}</span>
      </td>
      <td>
        <span class="badge ${tx.tx_type === 'increase' ? 'bg-success' : 'bg-danger'}">
          ${getTxTypeLabel(tx.tx_type)}
        </span>
      </td>
      <td>
        <span class="${tx.tx_type === 'increase' ? 'tx-increase' : 'tx-decrease'}">
          ${tx.tx_type === 'increase' ? '+' : '-'}${tx.amount}
        </span>
      </td>
      <td>${tx.balance_before}</td>
      <td>${tx.balance_after}</td>
      <td>
        <span class="badge bg-secondary">${tx.business_type || '-'}</span>
      </td>
      <td><small><code>${tx.business_id || '-'}</code></small></td>
      <td>
        <small>${formatDate(tx.created_at)}</small>
      </td>
    </tr>
  `
    )
    .join('')
}

// ============================================================
// 统计功能
// ============================================================

/**
 * 更新统计信息
 * @param {Array} transactions - 交易记录列表
 */
function updateStatistics(transactions) {
  const increaseCount = transactions.filter(tx => tx.tx_type === 'increase').length
  const decreaseCount = transactions.filter(tx => tx.tx_type === 'decrease').length

  document.getElementById('totalTransactions').textContent = totalRecords
  document.getElementById('increaseCount').textContent = increaseCount
  document.getElementById('decreaseCount').textContent = decreaseCount
}

/**
 * 重置统计信息
 */
function resetStatistics() {
  document.getElementById('totalTransactions').textContent = '-'
  document.getElementById('increaseCount').textContent = '-'
  document.getElementById('decreaseCount').textContent = '-'
  document.getElementById('currentPage').textContent = '1'
  document.getElementById('totalPages').textContent = '1'
}

// ============================================================
// 分页功能
// ============================================================

/**
 * 渲染分页控件
 * @param {Object} pagination - 分页信息
 */
function renderPagination(pagination) {
  const { current_page, total_pages, has_prev, has_next } = pagination

  document.getElementById('currentPage').textContent = current_page
  document.getElementById('totalPages').textContent = total_pages

  if (total_pages <= 1) {
    document.getElementById('paginationNav').style.display = 'none'
    return
  }

  document.getElementById('paginationNav').style.display = 'block'

  const paginationEl = document.getElementById('pagination')
  let html = ''

  // 上一页
  html += `
    <li class="page-item ${!has_prev ? 'disabled' : ''}">
      <a class="page-link" href="#" onclick="changePage(${current_page - 1}); return false;">上一页</a>
    </li>
  `

  // 页码
  const maxVisible = 5
  let startPage = Math.max(1, current_page - Math.floor(maxVisible / 2))
  let endPage = Math.min(total_pages, startPage + maxVisible - 1)

  if (endPage - startPage < maxVisible - 1) {
    startPage = Math.max(1, endPage - maxVisible + 1)
  }

  if (startPage > 1) {
    html += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(1); return false;">1</a></li>`
    if (startPage > 2) {
      html += `<li class="page-item disabled"><span class="page-link">...</span></li>`
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `
      <li class="page-item ${i === current_page ? 'active' : ''}">
        <a class="page-link" href="#" onclick="changePage(${i}); return false;">${i}</a>
      </li>
    `
  }

  if (endPage < total_pages) {
    if (endPage < total_pages - 1) {
      html += `<li class="page-item disabled"><span class="page-link">...</span></li>`
    }
    html += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(${total_pages}); return false;">${total_pages}</a></li>`
  }

  // 下一页
  html += `
    <li class="page-item ${!has_next ? 'disabled' : ''}">
      <a class="page-link" href="#" onclick="changePage(${current_page + 1}); return false;">下一页</a>
    </li>
  `

  paginationEl.innerHTML = html
}

/**
 * 切换页码
 * @param {number} page - 目标页码
 */
function changePage(page) {
  currentPage = page
  loadTransactions()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 获取交易类型标签
 * @param {string} txType - 交易类型
 * @returns {string} 中文标签
 */
function getTxTypeLabel(txType) {
  const labels = {
    increase: '增加',
    decrease: '减少'
  }
  return labels[txType] || txType
}

/**
 * 显示成功提示
 * @param {string} message - 提示消息
 */
function showSuccessToast(message) {
  document.getElementById('successToastBody').textContent = message
  successToastInstance.show()
}

/**
 * 显示错误提示
 * @param {string} message - 错误消息
 */
function showErrorToast(message) {
  document.getElementById('errorToastBody').textContent = message
  errorToastInstance.show()
}
