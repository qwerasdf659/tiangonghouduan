/**
 * 通用资产调整页面
 * @description 管理用户的各类资产（积分、钻石、材料等）
 * @created 2026-01-09
 * @version 1.0.0
 */

// ============================================================
// 全局变量
// ============================================================
let currentUserId = null
let currentPage = 1
const pageSize = 20
let assetTypes = []
let campaigns = [] // 活动列表（用于BUDGET_POINTS选择）

// ============================================================
// 页面初始化
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
  // 显示用户信息
  const userInfo = getCurrentUser()
  if (userInfo && userInfo.nickname) {
    document.getElementById('welcomeText').textContent = `欢迎，${userInfo.nickname}`
  }

  // 事件监听器
  document.getElementById('logoutBtn').addEventListener('click', logout)
  document.getElementById('searchForm').addEventListener('submit', handleSearch)
  document.getElementById('submitAdjustBtn').addEventListener('click', submitAdjustAsset)
  document.getElementById('assetTypeFilter').addEventListener('change', loadAdjustmentRecords)
  // 资产类型选择变化时，显示/隐藏活动选择框
  document.getElementById('assetType').addEventListener('change', onAssetTypeChange)

  // Token和权限验证
  if (!getToken() || !checkAdminPermission()) {
    return
  }

  // 加载资产类型
  loadAssetTypes()

  // 加载活动列表（用于预算积分调整）
  loadCampaigns()
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
    const response = await apiRequest(API_ENDPOINTS.ASSET_ADJUSTMENT.ASSET_TYPES)
    if (response && response.success) {
      assetTypes = response.data.asset_types || response.data || []

      const select = document.getElementById('assetType')
      const filterSelect = document.getElementById('assetTypeFilter')

      // 清空现有选项（保留默认）
      select.innerHTML = '<option value="">请选择资产类型</option>'
      filterSelect.innerHTML = '<option value="">全部资产</option>'

      assetTypes.forEach(type => {
        const option = document.createElement('option')
        option.value = type.asset_code
        option.textContent = type.name || type.asset_code
        select.appendChild(option.cloneNode(true))
        filterSelect.appendChild(option)
      })
    }
  } catch (error) {
    console.error('加载资产类型失败:', error)
  }
}

/**
 * 加载活动列表
 * @description 用于预算积分调整时选择活动
 * @returns {Promise<void>}
 */
async function loadCampaigns() {
  try {
    // 使用活动预算批量状态接口获取活动列表
    const response = await apiRequest(`${API_ENDPOINTS.CAMPAIGN_BUDGET.BATCH_STATUS}?limit=50`)
    if (response && response.success) {
      campaigns = response.data.campaigns || []

      const select = document.getElementById('campaignId')
      select.innerHTML = '<option value="">请选择活动</option>'

      campaigns.forEach(campaign => {
        const option = document.createElement('option')
        option.value = campaign.campaign_id
        option.textContent = `${campaign.campaign_name || campaign.name || '活动' + campaign.campaign_id} (ID: ${campaign.campaign_id})`
        select.appendChild(option)
      })
    }
  } catch (error) {
    console.error('加载活动列表失败:', error)
  }
}

/**
 * 资产类型切换事件处理
 * @description 当选择预算积分时显示活动选择框
 */
function onAssetTypeChange() {
  const assetType = document.getElementById('assetType').value
  const campaignGroup = document.getElementById('campaignIdGroup')
  const campaignSelect = document.getElementById('campaignId')

  if (assetType === 'BUDGET_POINTS') {
    campaignGroup.style.display = 'block'
    campaignSelect.setAttribute('required', 'required')
  } else {
    campaignGroup.style.display = 'none'
    campaignSelect.removeAttribute('required')
    campaignSelect.value = ''
  }
}

// ============================================================
// 用户搜索和资产加载
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

  let targetUserId = userId

  // 如果提供了手机号，先通过手机号查询用户ID
  if (mobile && !userId) {
    try {
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

  // 加载用户资产信息
  await loadUserAssets(targetUserId)
}

/**
 * 加载用户资产信息
 * @param {number|string} userId - 用户ID
 * @returns {Promise<void>}
 */
async function loadUserAssets(userId) {
  currentUserId = userId
  currentPage = 1
  showLoading(true)

  try {
    const response = await apiRequest(API.buildURL(API_ENDPOINTS.ASSET_ADJUSTMENT.USER_BALANCES, { user_id: userId }))

    if (response && response.success) {
      const { user, balances } = response.data

      // 显示用户信息
      document.getElementById('userId').textContent = user.user_id
      document.getElementById('userNickname').textContent = user.nickname || '未设置'
      document.getElementById('userMobile').textContent = maskPhone(user.mobile) || '-'

      // 渲染资产卡片
      renderAssetCards(balances)

      // 显示用户资产区域
      document.getElementById('userAssetsSection').style.display = 'block'
      document.getElementById('emptyState').style.display = 'none'

      // 加载调整记录
      loadAdjustmentRecords()
    } else {
      showErrorToast(response?.message || '查询失败')
    }
  } catch (error) {
    console.error('加载用户资产失败:', error)
    showErrorToast(error.message)
  } finally {
    showLoading(false)
  }
}

// ============================================================
// 渲染函数
// ============================================================

/**
 * 渲染资产卡片
 * @param {Array} balances - 资产余额列表
 */
function renderAssetCards(balances) {
  const container = document.getElementById('assetCardsContainer')

  if (!balances || balances.length === 0) {
    container.innerHTML = `
      <div class="col-12">
        <div class="alert alert-info">该用户暂无资产记录</div>
      </div>
    `
    return
  }

  container.innerHTML = balances
    .map(balance => {
      const iconClass = getAssetIcon(balance.asset_code)
      const cardClass = balance.asset_code.toLowerCase()

      return `
      <div class="col-md-3">
        <div class="card asset-card ${cardClass}">
          <div class="card-body text-center">
            <i class="bi ${iconClass}" style="font-size: 2rem;"></i>
            <h4 class="mt-2 mb-0">${balance.balance || 0}</h4>
            <small class="text-muted">${balance.asset_name || balance.asset_code}</small>
          </div>
        </div>
      </div>
    `
    })
    .join('')
}

/**
 * 获取资产图标
 * @param {string} assetCode - 资产代码
 * @returns {string} Bootstrap图标类名
 */
function getAssetIcon(assetCode) {
  const icons = {
    POINTS: 'bi-star-fill text-warning',
    DIAMOND: 'bi-gem text-info',
    GOLD: 'bi-coin text-warning',
    SILVER: 'bi-circle-fill text-secondary'
  }
  return icons[assetCode] || 'bi-box text-primary'
}

// ============================================================
// 调整记录管理
// ============================================================

/**
 * 加载调整记录
 * @returns {Promise<void>}
 */
async function loadAdjustmentRecords() {
  if (!currentUserId) return

  const tbody = document.getElementById('adjustmentTableBody')
  tbody.innerHTML = `
    <tr>
      <td colspan="7" class="text-center py-5">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">加载中...</span>
        </div>
      </td>
    </tr>
  `

  try {
    const assetType = document.getElementById('assetTypeFilter').value
    const params = new URLSearchParams({
      user_id: currentUserId,
      page: currentPage,
      page_size: pageSize
    })

    if (assetType) {
      params.append('asset_code', assetType)
    }

    const response = await apiRequest(`${API_ENDPOINTS.ASSETS.TRANSACTIONS}?${params.toString()}`)

    if (response && response.success) {
      const { transactions, pagination } = response.data
      renderAdjustmentTable(transactions)
      if (pagination) {
        renderPagination(pagination)
      }
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-5 text-muted">
            <i class="bi bi-inbox" style="font-size: 3rem;"></i>
            <p class="mt-2">暂无调整记录</p>
          </td>
        </tr>
      `
    }
  } catch (error) {
    console.error('加载调整记录失败:', error)
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-5 text-danger">
          <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
          <p class="mt-2">加载失败：${error.message}</p>
        </td>
      </tr>
    `
  }
}

/**
 * 渲染调整记录表格
 * @param {Array} transactions - 交易记录列表
 */
function renderAdjustmentTable(transactions) {
  const tbody = document.getElementById('adjustmentTableBody')

  if (!transactions || transactions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-5 text-muted">
          <i class="bi bi-inbox" style="font-size: 3rem;"></i>
          <p class="mt-2">暂无调整记录</p>
        </td>
      </tr>
    `
    return
  }

  tbody.innerHTML = transactions
    .map(tx => {
      const amountClass = tx.amount >= 0 ? 'text-success' : 'text-danger'
      const amountPrefix = tx.amount >= 0 ? '+' : ''

      return `
      <tr>
        <td>${formatDate(tx.created_at)}</td>
        <td>${tx.asset_name || tx.asset_code}</td>
        <td>${tx.tx_type || '-'}</td>
        <td class="${amountClass}">${amountPrefix}${tx.amount}</td>
        <td>${tx.balance_after || '-'}</td>
        <td>${tx.reason || tx.description || '-'}</td>
        <td>${tx.operator_name || '-'}</td>
      </tr>
    `
    })
    .join('')
}

// ============================================================
// 分页功能
// ============================================================

/**
 * 渲染分页
 * @param {Object} pagination - 分页信息
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

/**
 * 跳转到指定页
 * @param {number} page - 页码
 */
function goToPage(page) {
  currentPage = page
  loadAdjustmentRecords()
}

// ============================================================
// 资产调整操作
// ============================================================

/**
 * 提交资产调整
 * @returns {Promise<void>}
 */
async function submitAdjustAsset() {
  const form = document.getElementById('adjustAssetForm')
  if (!form.checkValidity()) {
    form.reportValidity()
    return
  }

  const assetCode = document.getElementById('assetType').value
  const adjustType = document.getElementById('adjustType').value
  const amount = parseInt(document.getElementById('adjustAmount').value)

  // 构建请求数据
  const data = {
    user_id: currentUserId,
    asset_code: assetCode,
    // 后端使用amount字段，正数=增加，负数=扣减
    amount: adjustType === 'decrease' ? -Math.abs(amount) : Math.abs(amount),
    reason: document.getElementById('adjustReason').value.trim(),
    idempotency_key: `asset_adjust_${currentUserId}_${assetCode}_${Date.now()}`
  }

  // 预算积分必须提供campaign_id
  if (assetCode === 'BUDGET_POINTS') {
    const campaignId = document.getElementById('campaignId').value
    if (!campaignId) {
      showErrorToast('调整预算积分必须选择活动')
      return
    }
    data.campaign_id = parseInt(campaignId)
  }

  try {
    const submitBtn = document.getElementById('submitAdjustBtn')
    submitBtn.disabled = true
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>提交中...'

    const response = await apiRequest(API_ENDPOINTS.ASSET_ADJUSTMENT.ADJUST, {
      method: 'POST',
      body: JSON.stringify(data)
    })

    if (response && response.success) {
      showSuccessToast('资产调整成功')
      bootstrap.Modal.getInstance(document.getElementById('adjustAssetModal')).hide()
      form.reset()
      // 重置活动选择框显示状态
      document.getElementById('campaignIdGroup').style.display = 'none'
      loadUserAssets(currentUserId)
    } else {
      showErrorToast(response?.message || '调整失败')
    }
  } catch (error) {
    console.error('资产调整失败:', error)
    showErrorToast(error.message)
  } finally {
    const submitBtn = document.getElementById('submitAdjustBtn')
    submitBtn.disabled = false
    submitBtn.innerHTML = '确认调整'
  }
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 显示/隐藏加载状态
 * @param {boolean} show - 是否显示
 */
function showLoading(show) {
  document.getElementById('loadingOverlay').classList.toggle('show', show)
}
