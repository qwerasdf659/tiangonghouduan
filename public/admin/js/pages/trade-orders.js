/**
 * C2C交易订单管理页面
 * @description 管理用户间的交易订单
 * @created 2026-01-09
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
      const orders = response.data.orders || response.data.list || []
      renderOrders(orders)
      renderPagination(response.data.pagination)
      updateStats(orders)
    } else {
      showError(response?.message || '加载失败')
    }
  } catch (error) {
    console.error('加载交易订单失败', error)
    showError('加载失败，请重试')
  } finally {
    showLoading(false)
  }
}

/**
 * 渲染订单列表
 */
function renderOrders(orders) {
  const tbody = document.getElementById('ordersTableBody')

  if (!orders || orders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-5 text-muted">
          <i class="bi bi-inbox" style="font-size: 3rem;"></i>
          <p class="mt-2">暂无交易订单</p>
        </td>
      </tr>
    `
    return
  }

  tbody.innerHTML = orders
    .map(order => {
      const statusBadge = getStatusBadge(order.status)

      return `
      <tr>
        <td>${order.order_id}</td>
        <td>${order.listing_id || '-'}</td>
        <td>
          <span class="text-primary">${order.buyer_nickname || order.buyer_user_id}</span>
        </td>
        <td>
          <span class="text-success">${order.seller_nickname || order.seller_user_id}</span>
        </td>
        <td>${order.item_name || '-'}</td>
        <td class="text-warning"><strong>¥${(order.price || 0).toFixed(2)}</strong></td>
        <td>${statusBadge}</td>
        <td>${formatDate(order.created_at)}</td>
        <td>${formatDate(order.completed_at) || '-'}</td>
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
 */
function getStatusBadge(status) {
  const badges = {
    pending: '<span class="badge bg-warning">待支付</span>',
    paid: '<span class="badge bg-info">已支付</span>',
    completed: '<span class="badge bg-success">已完成</span>',
    cancelled: '<span class="badge bg-secondary">已取消</span>',
    refunded: '<span class="badge bg-danger">已退款</span>'
  }
  return badges[status] || `<span class="badge bg-secondary">${status}</span>`
}

/**
 * 更新统计信息
 */
function updateStats(orders) {
  if (!orders) return

  const total = orders.length
  const completed = orders.filter(o => o.status === 'completed').length
  const pending = orders.filter(o => o.status === 'pending').length
  const totalAmount = orders
    .filter(o => o.status === 'completed')
    .reduce((sum, o) => sum + (o.price || 0), 0)

  const totalEl = document.getElementById('totalOrders')
  const completedEl = document.getElementById('completedOrders')
  const pendingEl = document.getElementById('pendingOrders')
  const amountEl = document.getElementById('totalAmount')

  if (totalEl) totalEl.textContent = total
  if (completedEl) completedEl.textContent = completed
  if (pendingEl) pendingEl.textContent = pending
  if (amountEl) amountEl.textContent = '¥' + totalAmount.toFixed(2)
}

/**
 * 查看订单详情
 */
async function viewOrderDetail(orderId) {
  try {
    showLoading(true)

    const response = await apiRequest(`/api/v4/console/marketplace/trade_orders/${orderId}`)

    if (response && response.success) {
      const order = response.data.order || response.data
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
 */
function renderOrderDetail(order) {
  const container = document.getElementById('orderDetailBody')

  container.innerHTML = `
    <div class="row">
      <div class="col-md-6">
        <h6 class="text-muted mb-3">订单信息</h6>
        <table class="table table-sm">
          <tr>
            <td class="text-muted">订单ID</td>
            <td>${order.order_id}</td>
          </tr>
          <tr>
            <td class="text-muted">挂单ID</td>
            <td>${order.listing_id || '-'}</td>
          </tr>
          <tr>
            <td class="text-muted">商品名称</td>
            <td>${order.item_name || '-'}</td>
          </tr>
          <tr>
            <td class="text-muted">交易金额</td>
            <td class="text-warning"><strong>¥${(order.price || 0).toFixed(2)}</strong></td>
          </tr>
          <tr>
            <td class="text-muted">订单状态</td>
            <td>${getStatusBadge(order.status)}</td>
          </tr>
          <tr>
            <td class="text-muted">创建时间</td>
            <td>${formatDate(order.created_at)}</td>
          </tr>
          <tr>
            <td class="text-muted">完成时间</td>
            <td>${formatDate(order.completed_at) || '-'}</td>
          </tr>
        </table>
      </div>
      <div class="col-md-6">
        <h6 class="text-muted mb-3">交易双方</h6>
        <table class="table table-sm">
          <tr>
            <td class="text-muted">买家ID</td>
            <td>${order.buyer_user_id}</td>
          </tr>
          <tr>
            <td class="text-muted">买家昵称</td>
            <td>${order.buyer_nickname || '-'}</td>
          </tr>
          <tr>
            <td class="text-muted">卖家ID</td>
            <td>${order.seller_user_id}</td>
          </tr>
          <tr>
            <td class="text-muted">卖家昵称</td>
            <td>${order.seller_nickname || '-'}</td>
          </tr>
        </table>
        ${
          order.remark
            ? `
        <h6 class="text-muted mb-2 mt-3">订单备注</h6>
        <p class="small">${order.remark}</p>
        `
            : ''
        }
      </div>
    </div>
  `
}

/**
 * 渲染分页
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
 */
function goToPage(page) {
  currentPage = page
  loadTradeOrders()
}

/**
 * 显示/隐藏加载状态
 */
function showLoading(show) {
  const overlay = document.getElementById('loadingOverlay')
  if (overlay) {
    overlay.classList.toggle('show', show)
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
