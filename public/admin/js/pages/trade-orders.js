/**
 * C2C交易订单管理页面
 * @description 管理用户间的交易订单
 * @created 2026-01-09
 * @updated 2026-01-09 修复前端与后端数据结构对齐问题
 *
 * 后端字段说明（基于TradeOrder模型）:
 * - order_id: 订单ID
 * - listing_id: 挂牌ID
 * - buyer_user_id: 买家用户ID
 * - seller_user_id: 卖家用户ID
 * - asset_code: 结算资产代码（默认DIAMOND）
 * - gross_amount: 买家支付总额（DIAMOND单位）
 * - fee_amount: 平台手续费
 * - net_amount: 卖家实收金额
 * - status: 订单状态（created/frozen/completed/cancelled/failed）
 * - created_at: 创建时间
 * - completed_at: 完成时间
 */

// 全局变量
let currentPage = 1
const pageSize = 20

/**
 * 页面加载
 */
document.addEventListener('DOMContentLoaded', function () {
  checkAuth()
  loadTradeOrders()
  bindEvents()
})

/**
 * 权限检查
 */
function checkAuth() {
  const token = getToken()
  if (!token) {
    window.location.href = '/admin/login.html'
    return false
  }
  checkAdminPermission()
  return true
}

/**
 * 绑定事件
 */
function bindEvents() {
  document.getElementById('logoutBtn').addEventListener('click', logout)
  document.getElementById('searchBtn').addEventListener('click', handleSearch)
}

/**
 * 处理搜索
 */
function handleSearch() {
  currentPage = 1
  loadTradeOrders()
}

/**
 * 加载交易订单列表
 */
async function loadTradeOrders() {
  try {
    showLoading(true)

    const status = document.getElementById('statusFilter').value
    const buyerId = document.getElementById('buyerIdFilter').value.trim()
    const sellerId = document.getElementById('sellerIdFilter').value.trim()
    const listingId = document.getElementById('listingIdFilter').value.trim()
    const sortOrder = document.getElementById('sortOrder').value

    const params = new URLSearchParams({
      page: currentPage,
      page_size: pageSize,
      sort_order: sortOrder
    })

    if (status) params.append('status', status)
    if (buyerId) params.append('buyer_user_id', buyerId)
    if (sellerId) params.append('seller_user_id', sellerId)
    if (listingId) params.append('listing_id', listingId)

    const response = await apiRequest(`/api/v4/console/marketplace/trade_orders?${params}`)

    if (response && response.success) {
      // 后端返回格式: { success, data: { orders, pagination, filters } }
      const orders = response.data?.orders || []
      const pagination = response.data?.pagination || {}

      renderOrders(orders)
      renderPagination(pagination)
      updateStats(orders, pagination)
    } else {
      showError(response?.message || '加载失败')
      renderEmptyState()
    }
  } catch (error) {
    console.error('加载交易订单失败', error)
    showError('加载失败，请重试')
    renderEmptyState()
  } finally {
    showLoading(false)
  }
}

/**
 * 渲染空状态
 */
function renderEmptyState() {
  const tbody = document.getElementById('ordersTableBody')
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-5 text-muted">
          <i class="bi bi-inbox" style="font-size: 3rem;"></i>
          <p class="mt-2">暂无交易订单</p>
        </td>
      </tr>
    `
  }
  // 清空分页
  const pagination = document.getElementById('pagination')
  if (pagination) {
    pagination.innerHTML = ''
  }
  // 重置统计
  updateStatsWithValues(0, 0, 0, 0)
}

/**
 * 更新统计数值
 */
function updateStatsWithValues(total, created, frozen, completed) {
  const totalEl = document.getElementById('totalOrders')
  const createdEl = document.getElementById('createdOrders')
  const frozenEl = document.getElementById('frozenOrders')
  const completedEl = document.getElementById('completedOrders')

  if (totalEl) totalEl.textContent = total
  if (createdEl) createdEl.textContent = created
  if (frozenEl) frozenEl.textContent = frozen
  if (completedEl) completedEl.textContent = completed
}

/**
 * 渲染订单列表
 *
 * 后端返回的订单字段（基于TradeOrder模型 + include listing）:
 * - order_id: 订单ID
 * - listing_id: 挂牌ID
 * - buyer_user_id: 买家ID
 * - seller_user_id: 卖家ID
 * - gross_amount: 买家支付总额（DIAMOND，整数）
 * - fee_amount: 平台手续费（DIAMOND，整数）
 * - net_amount: 卖家实收金额（DIAMOND，整数）
 * - asset_code: 结算资产代码（固定DIAMOND）
 * - status: 订单状态 (created/frozen/completed/cancelled/failed)
 * - created_at: 创建时间
 * - completed_at: 完成时间
 * - listing: 关联的挂牌信息（包含offerItem）
 */
function renderOrders(orders) {
  const tbody = document.getElementById('ordersTableBody')

  if (!orders || orders.length === 0) {
    renderEmptyState()
    return
  }

  tbody.innerHTML = orders
    .map(order => {
      const statusBadge = getStatusBadge(order.status)

      // 从关联的listing获取资产信息
      const listing = order.listing || {}
      const assetCode = listing.asset_code || order.asset_code || 'DIAMOND'

      // 金额显示（后端使用gross_amount/fee_amount/net_amount字段，单位是整数DIAMOND）
      const grossAmount = parseInt(order.gross_amount) || 0
      const feeAmount = parseInt(order.fee_amount) || 0

      return `
      <tr>
        <td><span class="badge bg-light text-dark">#${order.order_id}</span></td>
        <td>
          <small class="text-muted">挂牌#${order.listing_id || '-'}</small><br>
          <span class="badge bg-secondary">${assetCode}</span>
        </td>
        <td>
          <span class="text-primary fw-bold">${order.buyer_user_id}</span>
        </td>
        <td>
          <span class="text-success fw-bold">${order.seller_user_id}</span>
        </td>
        <td class="text-warning"><strong>💎${grossAmount}</strong></td>
        <td class="text-muted">💎${feeAmount}</td>
        <td>${statusBadge}</td>
        <td><small>${formatDate(order.created_at)}</small></td>
        <td>
          <button class="btn btn-sm btn-outline-primary" onclick="viewOrderDetail(${order.order_id})">
            <i class="bi bi-eye"></i> 详情
          </button>
        </td>
      </tr>
    `
    })
    .join('')
}

/**
 * 获取状态徽章
 *
 * C2C订单状态（基于TradeOrder模型）:
 * - created: 已创建/进行中
 * - frozen: 已冻结（买家资产已冻结，等待结算）
 * - completed: 已完成（终态）
 * - cancelled: 已取消（终态）
 * - failed: 失败（终态）
 */
function getStatusBadge(status) {
  const badges = {
    created: '<span class="badge bg-warning">进行中</span>',
    frozen: '<span class="badge bg-info">冻结中</span>',
    completed: '<span class="badge bg-success">已完成</span>',
    cancelled: '<span class="badge bg-secondary">已取消</span>',
    failed: '<span class="badge bg-danger">失败</span>'
  }
  return badges[status] || `<span class="badge bg-secondary">${status || '未知'}</span>`
}

/**
 * 更新统计信息
 *
 * HTML中的统计卡片ID:
 * - totalOrders: 订单总数
 * - createdOrders: 进行中（状态=created）
 * - frozenOrders: 冻结中（状态=frozen）
 * - completedOrders: 已完成（状态=completed）
 */
function updateStats(orders, pagination) {
  // 使用分页信息中的总数
  const total = pagination?.total || orders?.length || 0

  // 统计当前页面各状态数量（注：这只是当前页的统计，不是全量）
  const createdCount = orders?.filter(o => o.status === 'created').length || 0
  const frozenCount = orders?.filter(o => o.status === 'frozen').length || 0
  const completedCount = orders?.filter(o => o.status === 'completed').length || 0

  updateStatsWithValues(total, createdCount, frozenCount, completedCount)
}

/**
 * 查看订单详情
 */
async function viewOrderDetail(orderId) {
  try {
    showLoading(true)

    const response = await apiRequest(`/api/v4/console/marketplace/trade_orders/${orderId}`)

    if (response && response.success) {
      // 后端返回格式: { success, data: { success, order } }
      const order = response.data?.order || response.data
      renderOrderDetail(order)
      new bootstrap.Modal(document.getElementById('orderDetailModal')).show()
    } else {
      showError(response?.message || '获取订单详情失败')
    }
  } catch (error) {
    console.error('获取订单详情失败:', error)
    showError('获取详情失败')
  } finally {
    showLoading(false)
  }
}

/**
 * 渲染订单详情
 *
 * 使用模态框中已有的元素ID:
 * - detailOrderId, detailStatus, detailCreatedAt, detailCompletedAt
 * - detailListingId, detailAssetCode
 * - detailBuyerId, detailSellerId
 * - detailTotalPrice, detailFee, detailSellerReceive
 *
 * 后端字段映射:
 * - gross_amount → 买家支付总额（显示在detailTotalPrice）
 * - fee_amount → 平台手续费（显示在detailFee）
 * - net_amount → 卖家实收金额（显示在detailSellerReceive）
 */
function renderOrderDetail(order) {
  if (!order) return

  // 订单基本信息
  const orderIdEl = document.getElementById('detailOrderId')
  const statusEl = document.getElementById('detailStatus')
  const createdAtEl = document.getElementById('detailCreatedAt')
  const completedAtEl = document.getElementById('detailCompletedAt')

  if (orderIdEl) orderIdEl.textContent = `#${order.order_id}`
  if (statusEl) statusEl.innerHTML = getStatusBadge(order.status)
  if (createdAtEl) createdAtEl.textContent = formatDate(order.created_at)
  if (completedAtEl)
    completedAtEl.textContent = order.completed_at ? formatDate(order.completed_at) : '-'

  // 挂牌信息
  const listingIdEl = document.getElementById('detailListingId')
  const assetCodeEl = document.getElementById('detailAssetCode')

  const listing = order.listing || {}
  if (listingIdEl) listingIdEl.textContent = `#${order.listing_id || '-'}`
  if (assetCodeEl) assetCodeEl.textContent = listing.asset_code || order.asset_code || 'DIAMOND'

  // 交易双方
  const buyerIdEl = document.getElementById('detailBuyerId')
  const sellerIdEl = document.getElementById('detailSellerId')

  if (buyerIdEl) buyerIdEl.textContent = order.buyer_user_id || '-'
  if (sellerIdEl) sellerIdEl.textContent = order.seller_user_id || '-'

  // 金额信息（后端字段：gross_amount, fee_amount, net_amount，单位是整数DIAMOND）
  const totalPriceEl = document.getElementById('detailTotalPrice')
  const feeEl = document.getElementById('detailFee')
  const sellerReceiveEl = document.getElementById('detailSellerReceive')

  const grossAmount = parseInt(order.gross_amount) || 0
  const feeAmount = parseInt(order.fee_amount) || 0
  const netAmount = parseInt(order.net_amount) || 0

  if (totalPriceEl) totalPriceEl.textContent = `💎${grossAmount}`
  if (feeEl) feeEl.textContent = `💎${feeAmount}`
  if (sellerReceiveEl) sellerReceiveEl.textContent = `💎${netAmount}`
}

/**
 * 渲染分页
 *
 * HTML中分页容器ID: pagination (不是paginationNav)
 * 后端分页格式: { total, page, page_size, total_pages }
 */
function renderPagination(pagination) {
  // 修复: 使用正确的元素ID 'pagination' 而不是 'paginationNav'
  const nav = document.getElementById('pagination')

  if (!nav) {
    console.warn('分页容器元素不存在')
    return
  }

  if (!pagination || pagination.total_pages <= 1) {
    nav.innerHTML = ''
    return
  }

  let html = ''

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

  nav.innerHTML = html
}

/**
 * 跳转到指定页
 */
function goToPage(page) {
  if (page < 1) return
  currentPage = page
  loadTradeOrders()
}

/**
 * 显示/隐藏加载状态
 */
function showLoading(show) {
  const overlay = document.getElementById('loadingOverlay')
  if (overlay) {
    overlay.style.display = show ? 'flex' : 'none'
  }
}

/**
 * 显示错误提示
 */
function showError(message) {
  if (typeof ToastUtils !== 'undefined') {
    ToastUtils.error(message)
  } else {
    alert('❌ ' + message)
  }
}
