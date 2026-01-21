/**
 * 钻石账户管理页面
 * @description 查询和管理用户的钻石账户，包括余额查询和调整功能
 * @created 2026-01-09
 * @version 1.0.0
 */

// ============================================================
// 全局变量
// ============================================================
let currentUserId = null
let currentPage = 1
let pageSize = 20
let currentTxTypeFilter = ''
let adjustBalanceModalInstance
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

  // 初始化模态框
  adjustBalanceModalInstance = new bootstrap.Modal(document.getElementById('adjustBalanceModal'))

  // 初始化Toast
  successToastInstance = new bootstrap.Toast(document.getElementById('successToast'))
  errorToastInstance = new bootstrap.Toast(document.getElementById('errorToast'))

  // 退出登录
  document.getElementById('logoutBtn').addEventListener('click', logout)

  // 搜索表单提交
  document.getElementById('searchForm').addEventListener('submit', handleSearch)

  // 提交调整
  document.getElementById('submitAdjustBtn').addEventListener('click', submitAdjustBalance)

  // 流水类型筛选
  document.querySelectorAll('input[name="txTypeFilter"]').forEach(radio => {
    radio.addEventListener('change', function () {
      currentTxTypeFilter = this.value
      currentPage = 1
      if (currentUserId) {
        loadTransactions(currentUserId)
      }
    })
  })
})

// ============================================================
// 搜索功能
// ============================================================

/**
 * 处理搜索
 * @param {Event} e - 表单提交事件
 * @returns {Promise<void>}
 */
async function handleSearch(e) {
  e.preventDefault()

  const userId = document.getElementById('searchUserId').value.trim()
  const mobile = document.getElementById('searchMobile').value.trim()

  if (!userId && !mobile) {
    showErrorToast('请输入用户ID或手机号')
    return
  }

  // 如果提供了手机号，先通过手机号查询用户ID
  let targetUserId = userId
  if (mobile && !userId) {
    try {
      // ✅ 对齐后端：user-management返回用户列表，取第一个匹配用户
      const userResponse = await apiRequest(
        `${API_ENDPOINTS.USER.LIST}?search=${mobile}`
      )
      if (userResponse && userResponse.success && userResponse.data) {
        const users = userResponse.data.users || userResponse.data
        if (users.length > 0) {
          targetUserId = users[0].user_id
        } else {
          showErrorToast('未找到该手机号对应的用户')
          return
        }
      } else {
        showErrorToast('查询用户失败')
        return
      }
    } catch (error) {
      showErrorToast('查询用户失败：' + error.message)
      return
    }
  }

  // 加载用户钻石账户信息
  await loadUserDiamondAccount(targetUserId)
}

// ============================================================
// 数据加载
// ============================================================

/**
 * 加载用户钻石账户信息
 * @param {number|string} userId - 用户ID
 * @returns {Promise<void>}
 */
async function loadUserDiamondAccount(userId) {
  currentUserId = userId
  currentPage = 1

  try {
    // ✅ 改用统一资产调整端点查询用户资产余额（文档决策：钻石统一到资产中心）
    const response = await apiRequest(API.buildURL(API_ENDPOINTS.ASSET_ADJUSTMENT.USER_BALANCES, { user_id: userId }))

    if (response && response.success) {
      const { user, balances } = response.data

      // 显示用户信息
      document.getElementById('userId').textContent = user.user_id
      document.getElementById('userNickname').textContent = user.nickname || '未设置'
      document.getElementById('userMobile').textContent = maskPhone(user.mobile) || '-'

      // ✅ 对齐后端：从 balances 数组中找到 DIAMOND 资产的余额
      const diamondBalance = balances.find(b => b.asset_code === 'DIAMOND')
      document.getElementById('diamondBalance').textContent = diamondBalance?.available_amount || 0
      document.getElementById('balanceUpdatedAt').textContent = '最近更新'
      document.getElementById('totalIncome').textContent = diamondBalance?.total || 0
      document.getElementById('totalExpense').textContent = diamondBalance?.frozen_amount || 0

      // 显示用户信息区域
      document.getElementById('userInfoSection').style.display = 'block'
      document.getElementById('emptyState').style.display = 'none'

      // 加载流水记录
      loadTransactions(userId)
    } else {
      showErrorToast(response?.message || '查询失败')
    }
  } catch (error) {
    console.error('加载用户钻石账户失败:', error)
    showErrorToast(error.message)
  }
}

/**
 * 加载钻石流水记录
 * @param {number|string} userId - 用户ID
 * @returns {Promise<void>}
 */
async function loadTransactions(userId) {
  const tbody = document.getElementById('transactionsTableBody')
  tbody.innerHTML = `
    <tr>
      <td colspan="9" class="text-center py-5">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">加载中...</span>
        </div>
        <p class="mt-2 text-muted">正在加载数据...</p>
      </td>
    </tr>
  `

  // 构建查询参数
  const params = new URLSearchParams()
  params.append('user_id', userId)
  params.append('page', currentPage)
  params.append('page_size', pageSize)

  if (currentTxTypeFilter) {
    params.append('tx_type', currentTxTypeFilter)
  }

  try {
    // ✅ 钻石流水查询（使用统一资产流水端点，过滤asset_code=DIAMOND）
    params.append('asset_code', 'DIAMOND')
    const response = await apiRequest(`${API_ENDPOINTS.ASSETS.TRANSACTIONS}?${params.toString()}`)

    if (response && response.success) {
      const { transactions, pagination } = response.data
      renderTransactions(transactions)
      renderPagination(pagination)
    } else {
      showErrorToast(response?.message || '加载流水失败')
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center py-5 text-danger">
            <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
            <p class="mt-2">加载失败：${response?.message || '未知错误'}</p>
          </td>
        </tr>
      `
    }
  } catch (error) {
    console.error('加载钻石流水失败:', error)
    showErrorToast(error.message)
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-5 text-danger">
          <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
          <p class="mt-2">加载失败：${error.message}</p>
        </td>
      </tr>
    `
  }
}

// ============================================================
// 渲染函数
// ============================================================

/**
 * 渲染流水记录列表
 * @param {Array} transactions - 交易记录列表
 */
function renderTransactions(transactions) {
  const tbody = document.getElementById('transactionsTableBody')

  if (transactions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-5">
          <i class="bi bi-inbox text-muted" style="font-size: 3rem;"></i>
          <p class="mt-2 text-muted">暂无流水记录</p>
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
        <span class="badge bg-secondary">${getBusinessTypeLabel(tx.business_type)}</span>
      </td>
      <td><small><code>${tx.business_id || '-'}</code></small></td>
      <td><small>${tx.remark || '-'}</small></td>
      <td>
        <small>${formatDate(tx.created_at)}</small>
      </td>
    </tr>
  `
    )
    .join('')
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
  loadTransactions(currentUserId)
  window.scrollTo({ top: 300, behavior: 'smooth' })
}

// ============================================================
// 余额调整功能
// ============================================================

/**
 * 提交调整余额
 * @returns {Promise<void>}
 */
async function submitAdjustBalance() {
  const form = document.getElementById('adjustBalanceForm')
  if (!form.checkValidity()) {
    form.reportValidity()
    return
  }

  if (!currentUserId) {
    showErrorToast('未选择用户')
    return
  }

  const data = {
    adjust_type: document.getElementById('adjustType').value,
    amount: parseInt(document.getElementById('adjustAmount').value),
    business_type: document.getElementById('businessType').value,
    reason: document.getElementById('adjustReason').value.trim()
  }

  try {
    const submitBtn = document.getElementById('submitAdjustBtn')
    submitBtn.disabled = true
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>提交中...'

    // ✅ 使用统一资产调整端点（文档决策：钻石统一到资产中心）
    const adjustData = {
      user_id: currentUserId,
      asset_code: 'DIAMOND', // 钻石资产类型
      adjust_type: data.adjust_type,
      amount: data.amount,
      reason: data.reason,
      idempotency_key: `diamond_adjust_${currentUserId}_${Date.now()}` // 幂等键
    }
    const response = await apiRequest(API_ENDPOINTS.ASSET_ADJUSTMENT.ADJUST, {
      method: 'POST',
      body: JSON.stringify(adjustData)
    })

    if (response && response.success) {
      showSuccessToast('调整成功')
      adjustBalanceModalInstance.hide()
      form.reset()
      loadUserDiamondAccount(currentUserId)
    } else {
      showErrorToast(response?.message || '调整失败')
    }
  } catch (error) {
    console.error('调整余额失败:', error)
    showErrorToast(error.message)
  } finally {
    const submitBtn = document.getElementById('submitAdjustBtn')
    submitBtn.disabled = false
    submitBtn.innerHTML = '<i class="bi bi-check-lg"></i> 确认调整'
  }
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
    increase: '收入',
    decrease: '支出'
  }
  return labels[txType] || txType
}

/**
 * 获取业务类型标签
 * @param {string} businessType - 业务类型
 * @returns {string} 中文标签
 */
function getBusinessTypeLabel(businessType) {
  const labels = {
    manual_adjust: '手动调整',
    compensation: '补偿',
    penalty: '扣除',
    refund: '退款',
    lottery: '抽奖',
    exchange: '兑换',
    market_sale: '市场出售',
    market_purchase: '市场购买'
  }
  return labels[businessType] || businessType
}

/**
 * 手机号脱敏
 * @param {string} phone - 手机号
 * @returns {string} 脱敏后的手机号
 */
function maskPhone(phone) {
  if (!phone || phone.length !== 11) return phone
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
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
