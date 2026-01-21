/**
 * 孤儿冻结清理页面
 *
 * @description 管理系统中的孤儿冻结数据（frozen_amount > 实际活跃挂牌冻结总额）
 * @created 2026-01-09
 * @updated 2026-01-09 - 适配后端API字段名，以后端为准；修复CSP内联事件问题
 *
 * 后端API说明：
 * - GET /api/v4/console/orphan-frozen/detect - 检测孤儿冻结
 * - GET /api/v4/console/orphan-frozen/stats - 获取统计信息
 * - POST /api/v4/console/orphan-frozen/cleanup - 清理孤儿冻结
 *
 * 后端返回字段（以此为准）：
 * - detect: { total, total_amount, orphan_list[] }
 * - orphan_list item: { user_id, account_id, asset_code, frozen_amount, listed_amount, orphan_amount, available_amount, description }
 * - stats: { total_orphan_count, total_orphan_amount, affected_user_count, by_asset[], checked_at }
 */

'use strict'

// 全局变量
let currentPage = 1
const pageSize = 20
let selectedItems = new Set()
let orphanDataCache = [] // 缓存后端返回的原始数据

/**
 * 页面初始化
 */
document.addEventListener('DOMContentLoaded', function () {
  // 显示用户信息
  const userInfo = getCurrentUser()
  if (userInfo && userInfo.nickname) {
    document.getElementById('welcomeText').textContent = `欢迎，${userInfo.nickname}`
  }

  // 事件监听器 - 顶部按钮
  document.getElementById('logoutBtn').addEventListener('click', logout)
  document.getElementById('refreshBtn').addEventListener('click', loadData)
  document.getElementById('scanBtn').addEventListener('click', scanOrphans)
  document.getElementById('batchCleanBtn').addEventListener('click', showCleanConfirmModal)
  document.getElementById('assetTypeFilter').addEventListener('change', loadData)

  // 事件监听器 - 全选和模态框
  document.getElementById('headerCheckbox').addEventListener('change', toggleSelectAll)
  document.getElementById('confirmClean').addEventListener('change', function () {
    document.getElementById('confirmCleanBtn').disabled = !this.checked
  })
  document.getElementById('confirmCleanBtn').addEventListener('click', executeClean)

  // 🔧 修复CSP问题：使用事件委托处理动态生成的元素事件
  setupEventDelegation()

  // Token和权限验证
  if (!getToken() || !checkAdminPermission()) {
    return
  }

  // 加载数据
  loadData()
})

/**
 * 设置事件委托 - 处理动态生成元素的事件
 * 使用事件委托避免CSP内联事件限制
 */
function setupEventDelegation() {
  const tbody = document.getElementById('dataTableBody')
  const paginationNav = document.getElementById('paginationNav')

  // 表格行事件委托
  tbody.addEventListener('change', function (e) {
    // 处理行checkbox选择
    if (e.target.classList.contains('row-checkbox')) {
      const accountId = e.target.dataset.accountId
      const assetCode = e.target.dataset.assetCode
      const itemKey = `${accountId}_${assetCode}`
      toggleRowSelection(itemKey)
    }
  })

  tbody.addEventListener('click', function (e) {
    // 处理清理按钮点击
    const cleanBtn = e.target.closest('.btn-clean-item')
    if (cleanBtn) {
      e.preventDefault()
      const userId = parseInt(cleanBtn.dataset.userId, 10)
      const assetCode = cleanBtn.dataset.assetCode
      cleanSingleItem(userId, assetCode)
    }
  })

  // 分页事件委托
  paginationNav.addEventListener('click', function (e) {
    const pageLink = e.target.closest('.page-link')
    if (pageLink && !pageLink.parentElement.classList.contains('disabled')) {
      e.preventDefault()
      const page = parseInt(pageLink.dataset.page, 10)
      if (!isNaN(page)) {
        goToPage(page)
      }
    }
  })
}

/**
 * 加载数据
 *
 * 调用后端API获取孤儿冻结数据和统计信息
 * 后端字段：
 * - /detect: { total, total_amount, orphan_list[] }
 * - /stats: { total_orphan_count, total_orphan_amount, affected_user_count, by_asset[] }
 */
async function loadData() {
  showLoading(true)
  const tbody = document.getElementById('dataTableBody')

  try {
    const assetType = document.getElementById('assetTypeFilter').value

    // 构建查询参数
    const detectParams = new URLSearchParams()
    if (assetType) {
      detectParams.append('asset_code', assetType)
    }

    // 并行获取检测结果和统计数据
    const [detectResponse, statsResponse] = await Promise.all([
      apiRequest(
        API_ENDPOINTS.ORPHAN_FROZEN.DETECT + (detectParams.toString() ? '?' + detectParams.toString() : '')
      ),
      apiRequest(API_ENDPOINTS.ORPHAN_FROZEN.STATS)
    ])

    // 处理检测结果 - 使用后端字段名
    if (detectResponse && detectResponse.success) {
      // 后端返回格式: { total, total_amount, orphan_list }
      const orphanList = detectResponse.data.orphan_list || []
      const total = detectResponse.data.total || 0
      const totalAmount = detectResponse.data.total_amount || 0

      // 缓存原始数据
      orphanDataCache = orphanList

      // 处理统计数据 - 使用后端字段名
      const stats = statsResponse?.data || {}

      // 更新统计卡片 - 适配后端字段
      // 后端stats字段: total_orphan_count, total_orphan_amount, affected_user_count
      document.getElementById('orphanCount').textContent = stats.total_orphan_count || total
      document.getElementById('frozenCount').textContent = stats.total_orphan_amount || totalAmount
      document.getElementById('expiredCount').textContent = stats.affected_user_count || 0
      document.getElementById('totalValue').textContent =
        '¥' + (stats.total_orphan_amount || totalAmount).toFixed(2)

      // 直接使用后端返回的数据渲染表格，不做字段转换
      renderTable(orphanList)

      // 简单分页（后端暂不支持分页，前端做假分页）
      const totalPages = Math.ceil(orphanList.length / pageSize) || 1
      renderPagination({
        current_page: currentPage,
        total_pages: totalPages
      })
    } else {
      const errorMsg = detectResponse?.message || '获取数据失败'
      console.error('加载数据失败:', errorMsg)
      tbody.innerHTML = `
        <tr>
          <td colspan="11" class="text-center py-5 text-muted">
            <i class="bi bi-inbox" style="font-size: 3rem;"></i>
            <p class="mt-2">${errorMsg}</p>
          </td>
        </tr>
      `
      // 清空统计
      document.getElementById('orphanCount').textContent = '0'
      document.getElementById('frozenCount').textContent = '0'
      document.getElementById('expiredCount').textContent = '0'
      document.getElementById('totalValue').textContent = '¥0.00'
    }
  } catch (error) {
    console.error('加载数据失败:', error)
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="text-center py-5 text-danger">
          <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
          <p class="mt-2">加载失败：${error.message}</p>
        </td>
      </tr>
    `
  } finally {
    showLoading(false)
  }
}

/**
 * 渲染表格
 *
 * 直接使用后端返回的字段名，不做映射转换
 * 🔧 修复CSP问题：移除内联事件，使用data属性和事件委托
 *
 * 后端orphan_list item字段：
 * - user_id: 用户ID
 * - account_id: 账户ID
 * - asset_code: 资产代码
 * - frozen_amount: 总冻结金额
 * - listed_amount: 活跃挂牌金额
 * - orphan_amount: 孤儿冻结金额
 * - available_amount: 可用余额
 * - description: 描述
 *
 * @param {Array} orphanList - 后端返回的孤儿冻结列表
 */
function renderTable(orphanList) {
  const tbody = document.getElementById('dataTableBody')

  if (!orphanList || orphanList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="text-center py-5 text-muted">
          <i class="bi bi-check-circle" style="font-size: 3rem;"></i>
          <p class="mt-2">暂无孤儿冻结数据，系统健康</p>
        </td>
      </tr>
    `
    return
  }

  // 分页处理
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = startIndex + pageSize
  const pageData = orphanList.slice(startIndex, endIndex)

  tbody.innerHTML = pageData
    .map((item, index) => {
      const rowIndex = startIndex + index + 1
      // 使用 account_id + asset_code 作为唯一标识
      const itemKey = `${item.account_id}_${item.asset_code}`
      const isChecked = selectedItems.has(itemKey)

      // 资产类型显示名称映射
      const assetCodeNames = {
        points: '积分',
        diamond: '钻石',
        gold_coin: '金币',
        silver_coin: '银币'
      }
      const assetName = assetCodeNames[item.asset_code] || item.asset_code

      // 🔧 修复CSP：移除onclick/onchange，改用data属性
      return `
      <tr>
        <td>
          <input type="checkbox" class="form-check-input row-checkbox" 
                 data-account-id="${item.account_id}" 
                 data-asset-code="${item.asset_code}"
                 data-user-id="${item.user_id}"
                 data-orphan-amount="${item.orphan_amount}"
                 ${isChecked ? 'checked' : ''}>
        </td>
        <td>${rowIndex}</td>
        <td><span class="badge bg-warning">孤儿冻结</span></td>
        <td>
          <span class="badge bg-secondary">${assetName}</span>
          <small class="text-muted d-block">${item.asset_code}</small>
        </td>
        <td>
          <strong class="text-danger">${item.orphan_amount}</strong>
          <small class="text-muted d-block">冻结: ${item.frozen_amount} / 挂牌: ${item.listed_amount}</small>
        </td>
        <td>
          <span class="badge bg-info">用户 #${item.user_id}</span>
          <small class="text-muted d-block">账户: ${item.account_id}</small>
        </td>
        <td>${item.description || '系统检测'}</td>
        <td>-</td>
        <td>-</td>
        <td><span class="badge bg-warning">待清理</span></td>
        <td>
          <button class="btn btn-sm btn-outline-danger btn-clean-item" 
                  data-user-id="${item.user_id}"
                  data-asset-code="${item.asset_code}"
                  title="清理此孤儿冻结">
            <i class="bi bi-trash"></i> 清理
          </button>
        </td>
      </tr>
    `
    })
    .join('')

  updateBatchButton()
}

/**
 * 切换行选择
 * @param {string} itemKey - 行唯一标识 (account_id_asset_code)
 */
function toggleRowSelection(itemKey) {
  if (selectedItems.has(itemKey)) {
    selectedItems.delete(itemKey)
  } else {
    selectedItems.add(itemKey)
  }
  updateBatchButton()
}

/**
 * 切换全选
 */
function toggleSelectAll() {
  const isChecked = document.getElementById('headerCheckbox').checked
  const checkboxes = document.querySelectorAll('.row-checkbox:not(:disabled)')

  checkboxes.forEach(checkbox => {
    checkbox.checked = isChecked
    const accountId = checkbox.dataset.accountId
    const assetCode = checkbox.dataset.assetCode
    const itemKey = `${accountId}_${assetCode}`

    if (isChecked) {
      selectedItems.add(itemKey)
    } else {
      selectedItems.delete(itemKey)
    }
  })

  updateBatchButton()
}

/**
 * 更新批量操作按钮状态
 */
function updateBatchButton() {
  document.getElementById('batchCleanBtn').disabled = selectedItems.size === 0
}

/**
 * 扫描孤儿数据
 *
 * 调用后端 /detect API 进行扫描
 * 后端返回: { total, total_amount, orphan_list }
 */
async function scanOrphans() {
  showLoading(true)

  try {
    const response = await apiRequest(API_ENDPOINTS.ORPHAN_FROZEN.DETECT, {
      method: 'GET'
    })

    if (response && response.success) {
      // 使用后端字段 total
      const foundCount = response.data.total || 0
      showSuccessToast(`扫描完成，发现 ${foundCount} 条孤儿冻结数据`)
      loadData()
    } else {
      showErrorToast(response?.message || '扫描失败')
    }
  } catch (error) {
    console.error('扫描失败:', error)
    showErrorToast('扫描失败：' + error.message)
  } finally {
    showLoading(false)
  }
}

/**
 * 显示清理确认模态框
 */
function showCleanConfirmModal() {
  if (selectedItems.size === 0) {
    showErrorToast('请先选择要清理的数据')
    return
  }

  // 计算选中项的总金额
  let totalOrphanAmount = 0
  const checkboxes = document.querySelectorAll('.row-checkbox:checked')
  checkboxes.forEach(cb => {
    totalOrphanAmount += parseInt(cb.dataset.orphanAmount || 0, 10)
  })

  document.getElementById('cleanSummaryList').innerHTML = `
    <li>选中数据数量：<strong>${selectedItems.size}</strong> 条</li>
    <li>涉及孤儿冻结总额：<strong class="text-danger">${totalOrphanAmount}</strong></li>
    <li class="text-warning">清理后孤儿冻结金额将解冻到可用余额</li>
  `
  document.getElementById('cleanReason').value = ''
  document.getElementById('confirmClean').checked = false
  document.getElementById('confirmCleanBtn').disabled = true

  new bootstrap.Modal(document.getElementById('cleanConfirmModal')).show()
}

/**
 * 执行清理
 *
 * 调用后端 POST /cleanup API
 * 请求参数：{ dry_run, user_id, asset_code, reason, operator_name }
 * 后端返回：{ dry_run, detected, cleaned, failed, total_amount, details }
 */
async function executeClean() {
  const reason = document.getElementById('cleanReason').value.trim()
  if (!reason) {
    showErrorToast('请输入清理原因')
    return
  }

  showLoading(true)

  try {
    // 调用后端清理API（清理全部检测到的孤儿冻结）
    const response = await apiRequest(API_ENDPOINTS.ORPHAN_FROZEN.CLEANUP, {
      method: 'POST',
      body: JSON.stringify({
        dry_run: false, // 实际清理
        reason: reason,
        operator_name: getCurrentUser()?.nickname || '管理员'
      })
    })

    if (response && response.success) {
      // 使用后端字段 cleaned
      const cleanedCount = response.data.cleaned || 0
      const failedCount = response.data.failed || 0

      if (failedCount > 0) {
        showSuccessToast(`清理完成：成功 ${cleanedCount} 条，失败 ${failedCount} 条`)
      } else {
        showSuccessToast(`成功清理 ${cleanedCount} 条孤儿冻结数据`)
      }

      bootstrap.Modal.getInstance(document.getElementById('cleanConfirmModal')).hide()
      selectedItems.clear()
      loadData()
    } else {
      showErrorToast(response?.message || '清理失败')
    }
  } catch (error) {
    console.error('清理失败:', error)
    showErrorToast('清理失败：' + error.message)
  } finally {
    showLoading(false)
  }
}

/**
 * 清理单条记录
 *
 * 按指定用户和资产类型清理
 *
 * @param {number} userId - 用户ID
 * @param {string} assetCode - 资产代码
 */
async function cleanSingleItem(userId, assetCode) {
  if (
    !confirm(
      `确定要清理用户 #${userId} 的 ${assetCode} 孤儿冻结吗？\n\n此操作会将孤儿冻结金额解冻到可用余额。`
    )
  ) {
    return
  }

  showLoading(true)

  try {
    // 调用后端清理API，指定user_id和asset_code
    const response = await apiRequest(API_ENDPOINTS.ORPHAN_FROZEN.CLEANUP, {
      method: 'POST',
      body: JSON.stringify({
        dry_run: false,
        user_id: userId,
        asset_code: assetCode,
        reason: '管理员手动清理单条孤儿冻结',
        operator_name: getCurrentUser()?.nickname || '管理员'
      })
    })

    if (response && response.success) {
      const cleanedCount = response.data.cleaned || 0
      showSuccessToast(`清理成功：已解冻 ${cleanedCount} 条孤儿冻结`)
      loadData()
    } else {
      showErrorToast(response?.message || '清理失败')
    }
  } catch (error) {
    console.error('清理失败:', error)
    showErrorToast('清理失败：' + error.message)
  } finally {
    showLoading(false)
  }
}

/**
 * 渲染分页
 * 🔧 修复CSP问题：移除onclick内联事件，改用data属性
 * @param {Object} pagination - 分页信息
 */
function renderPagination(pagination) {
  const nav = document.getElementById('paginationNav')
  if (!pagination || pagination.total_pages <= 1) {
    nav.innerHTML = ''
    return
  }

  let html = '<ul class="pagination pagination-sm justify-content-center mb-0">'

  // 上一页按钮
  html += `
    <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
      <a class="page-link" href="#" data-page="${currentPage - 1}">上一页</a>
    </li>
  `

  // 页码按钮
  for (let i = 1; i <= pagination.total_pages; i++) {
    if (i === 1 || i === pagination.total_pages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      html += `
        <li class="page-item ${i === currentPage ? 'active' : ''}">
          <a class="page-link" href="#" data-page="${i}">${i}</a>
        </li>
      `
    } else if (i === currentPage - 3 || i === currentPage + 3) {
      html += '<li class="page-item disabled"><span class="page-link">...</span></li>'
    }
  }

  // 下一页按钮
  html += `
    <li class="page-item ${currentPage === pagination.total_pages ? 'disabled' : ''}">
      <a class="page-link" href="#" data-page="${currentPage + 1}">下一页</a>
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
  if (page < 1) return
  const totalPages = Math.ceil(orphanDataCache.length / pageSize) || 1
  if (page > totalPages) return

  currentPage = page
  // 重新渲染表格（使用缓存数据）
  renderTable(orphanDataCache)
  renderPagination({
    current_page: currentPage,
    total_pages: totalPages
  })
}

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

/**
 * 显示成功提示
 * @param {string} message - 提示信息
 */
function showSuccessToast(message) {
  if (typeof ToastUtils !== 'undefined') {
    ToastUtils.success(message)
  } else {
    alert('✅ ' + message)
  }
}

/**
 * 显示错误提示
 * @param {string} message - 提示信息
 */
function showErrorToast(message) {
  if (typeof ToastUtils !== 'undefined') {
    ToastUtils.error(message)
  } else {
    alert('❌ ' + message)
  }
}
