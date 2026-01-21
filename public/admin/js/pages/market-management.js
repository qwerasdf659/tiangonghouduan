/**
 * 市场交易管理 - 整合页面
 * @description 整合商品管理、兑换订单、交易订单、统计分析功能
 * @version 2.0.0
 * @created 2026-01-09
 *
 * 整合的原有页面：
 * - exchange-market-items.html (商品管理)
 * - exchange-market-orders.html (兑换订单)
 * - trade-orders.html (交易订单)
 * - marketplace-stats.html (市场统计)
 */

// ============================================
// 全局变量
// ============================================

// 数据存储
let items = []
let orders = []
let tradeOrders = []

// 分页状态
let itemsPage = 1
let ordersPage = 1
let tradePage = 1
const pageSize = 20

// Bootstrap 实例
let addItemModal, editItemModal, orderDetailModal, updateStatusModal
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
  loadItems()

  // Tab 切换时加载对应数据
  initTabHandlers()
})

function showUserInfo() {
  const user = getCurrentUser()
  if (user) {
    document.getElementById('welcomeText').textContent = `欢迎，${user.nickname || user.mobile}`
  }
}

function initBootstrapComponents() {
  addItemModal = new bootstrap.Modal(document.getElementById('addItemModal'))
  editItemModal = new bootstrap.Modal(document.getElementById('editItemModal'))
  orderDetailModal = new bootstrap.Modal(document.getElementById('orderDetailModal'))
  updateStatusModal = new bootstrap.Modal(document.getElementById('updateStatusModal'))

  successToast = new bootstrap.Toast(document.getElementById('successToast'))
  errorToast = new bootstrap.Toast(document.getElementById('errorToast'))
}

function bindEvents() {
  // 退出登录
  document.getElementById('logoutBtn').addEventListener('click', logout)

  // ========== 商品管理 ==========
  document.getElementById('itemFilterForm').addEventListener('submit', e => {
    e.preventDefault()
    itemsPage = 1
    loadItems()
  })
  document.getElementById('resetItemFilterBtn').addEventListener('click', resetItemFilter)
  document.getElementById('submitAddItemBtn').addEventListener('click', submitAddItem)
  document.getElementById('submitEditItemBtn').addEventListener('click', submitEditItem)
  document.getElementById('itemsTableBody').addEventListener('click', handleItemAction)

  // ========== 兑换订单 ==========
  document.getElementById('orderFilterForm').addEventListener('submit', e => {
    e.preventDefault()
    ordersPage = 1
    loadOrders()
  })
  document.getElementById('resetOrderFilterBtn').addEventListener('click', resetOrderFilter)
  document.getElementById('submitUpdateStatusBtn').addEventListener('click', submitUpdateStatus)
  document.getElementById('ordersTableBody').addEventListener('click', handleOrderAction)

  // ========== 交易订单 ==========
  document.getElementById('tradeFilterForm').addEventListener('submit', e => {
    e.preventDefault()
    tradePage = 1
    loadTradeOrders()
  })
  document.getElementById('resetTradeFilterBtn').addEventListener('click', resetTradeFilter)
  document.getElementById('tradeOrdersTableBody').addEventListener('click', handleTradeAction)
}

function initTabHandlers() {
  const tabEls = document.querySelectorAll('#moduleTabs button[data-bs-toggle="pill"]')

  tabEls.forEach(tab => {
    tab.addEventListener('shown.bs.tab', function (e) {
      const targetId = e.target.getAttribute('data-bs-target')

      switch (targetId) {
        case '#items-panel':
          if (items.length === 0) loadItems()
          break
        case '#orders-panel':
          loadOrders()
          break
        case '#trade-panel':
          loadTradeOrders()
          break
        case '#stats-panel':
          loadStats()
          break
      }
    })
  })
}

// ============================================
// 商品管理
// ============================================

async function loadItems() {
  const tbody = document.getElementById('itemsTableBody')
  showTableLoading(tbody, 8)

  try {
    const params = new URLSearchParams({
      page: itemsPage,
      page_size: pageSize
    })

    const status = document.getElementById('filterItemStatus').value
    const keyword = document.getElementById('filterItemKeyword').value.trim()
    if (status) params.append('status', status)
    if (keyword) params.append('keyword', keyword)

    const response = await apiRequest(`${API_ENDPOINTS.MARKETPLACE.EXCHANGE_ITEMS}?${params}`)

    if (response?.success) {
      items = response.data.items || response.data || []
      renderItems()
      updateItemStats()
      if (response.data.pagination) {
        renderPagination('itemsPagination', response.data.pagination, itemsPage, p => {
          itemsPage = p
          loadItems()
        })
      }
    } else {
      showTableError(tbody, 8, response?.message || '加载失败')
    }
  } catch (error) {
    showTableError(tbody, 8, error.message)
  }
}

function renderItems() {
  const tbody = document.getElementById('itemsTableBody')

  if (items.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="8" class="text-center text-muted py-4">暂无商品数据</td></tr>'
    return
  }

  tbody.innerHTML = items
    .map(item => {
      const stockClass =
        item.stock === 0 ? 'danger' : item.stock < 10 ? 'warning stock-warning' : 'success'
      // 后端字段：name, description, image_url, cost_asset_code, cost_amount, stock, sold_count
      const imageUrl = item.image_url || item.image || ''
      return `
      <tr>
        <td>${item.item_id}</td>
        <td>
          <div class="d-flex align-items-center">
            ${imageUrl ? `<img src="${imageUrl}" class="item-image me-2">` : '<div class="item-image me-2 bg-secondary d-flex align-items-center justify-content-center text-white"><i class="bi bi-image"></i></div>'}
            <div>
              <strong>${escapeHtml(item.name)}</strong>
              ${item.description ? `<br><small class="text-muted">${escapeHtml(item.description)}</small>` : ''}
            </div>
          </div>
        </td>
        <td><span class="badge bg-info">${item.cost_amount || 0} ${getAssetText(item.cost_asset_code)}</span></td>
        <td><span class="text-${stockClass} fw-bold">${item.stock}</span></td>
        <td>${item.sold_count || 0}</td>
        <td><span class="badge ${item.status === 'active' ? 'bg-success' : 'bg-secondary'}">${item.status === 'active' ? '上架' : '下架'}</span></td>
        <td>${formatDateTime(item.created_at)}</td>
        <td>
          <button class="btn btn-sm btn-primary" data-action="edit" data-id="${item.item_id}">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm btn-${item.status === 'active' ? 'warning' : 'success'}" 
                  data-action="toggle" data-id="${item.item_id}" data-status="${item.status}">
            <i class="bi bi-${item.status === 'active' ? 'toggle-off' : 'toggle-on'}"></i>
          </button>
        </td>
      </tr>
    `
    })
    .join('')
}

function updateItemStats() {
  // 后端字段：sold_count 替代 exchange_count
  const total = items.length
  const active = items.filter(i => i.status === 'active').length
  const lowStock = items.filter(i => i.stock < 10).length
  const exchanges = items.reduce((sum, i) => sum + (i.sold_count || 0), 0)

  document.getElementById('stat_items_total').textContent = total
  document.getElementById('stat_items_active').textContent = active
  document.getElementById('stat_items_lowStock').textContent = lowStock
  document.getElementById('stat_items_exchanges').textContent = exchanges
}

function handleItemAction(e) {
  const btn = e.target.closest('[data-action]')
  if (!btn) return

  const action = btn.dataset.action
  const id = btn.dataset.id

  if (action === 'edit') {
    openEditItemModal(id)
  } else if (action === 'toggle') {
    toggleItemStatus(id, btn.dataset.status)
  }
}

function resetItemFilter() {
  document.getElementById('filterItemStatus').value = ''
  document.getElementById('filterItemKeyword').value = ''
  itemsPage = 1
  loadItems()
}

async function submitAddItem() {
  const form = document.getElementById('addItemForm')
  if (!form.checkValidity()) {
    form.reportValidity()
    return
  }

  // 后端字段：item_name, item_description, cost_asset_code, cost_amount, cost_price, stock, status
  const data = {
    item_name: document.getElementById('itemName').value.trim(),
    item_description: document.getElementById('itemDescription').value.trim(),
    cost_asset_code: document.getElementById('itemPriceUnit').value,
    cost_amount: parseInt(document.getElementById('itemPrice').value),
    cost_price: parseFloat(document.getElementById('itemCostPrice')?.value) || 0,
    stock: parseInt(document.getElementById('itemStock').value),
    status: document.getElementById('itemStatus').value
  }

  try {
    setButtonLoading('submitAddItemBtn', true)

    const response = await apiRequest(API_ENDPOINTS.MARKETPLACE.EXCHANGE_ITEMS, {
      method: 'POST',
      body: JSON.stringify(data)
    })

    if (response?.success) {
      showSuccess('添加成功')
      addItemModal.hide()
      form.reset()
      loadItems()
    } else {
      showError(response?.message || '添加失败')
    }
  } catch (error) {
    showError(error.message)
  } finally {
    setButtonLoading('submitAddItemBtn', false, '<i class="bi bi-check-lg"></i> 确认添加')
  }
}

function openEditItemModal(itemId) {
  const item = items.find(i => i.item_id == itemId)
  if (!item) return

  // 后端字段：name, description, image_url, cost_asset_code, cost_amount, cost_price, stock, status
  document.getElementById('editItemId').value = item.item_id
  document.getElementById('editItemName').value = item.name || ''
  document.getElementById('editItemDescription').value = item.description || ''
  document.getElementById('editItemImage').value = item.image_url || ''
  document.getElementById('editItemPrice').value = item.cost_amount || 0
  document.getElementById('editItemPriceUnit').value = item.cost_asset_code || 'red_shard'
  document.getElementById('editItemStock').value = item.stock || 0
  document.getElementById('editItemStatus').value = item.status || 'active'
  // 成本价字段（如果存在）
  if (document.getElementById('editItemCostPrice')) {
    document.getElementById('editItemCostPrice').value = item.cost_price || 0
  }

  editItemModal.show()
}

async function submitEditItem() {
  const form = document.getElementById('editItemForm')
  if (!form.checkValidity()) {
    form.reportValidity()
    return
  }

  const itemId = document.getElementById('editItemId').value
  // 后端字段：item_name, item_description, cost_asset_code, cost_amount, cost_price, stock, status
  const data = {
    item_name: document.getElementById('editItemName').value.trim(),
    item_description: document.getElementById('editItemDescription').value.trim(),
    cost_asset_code: document.getElementById('editItemPriceUnit').value,
    cost_amount: parseInt(document.getElementById('editItemPrice').value),
    stock: parseInt(document.getElementById('editItemStock').value),
    status: document.getElementById('editItemStatus').value
  }
  // 成本价字段（如果存在）
  if (document.getElementById('editItemCostPrice')) {
    data.cost_price = parseFloat(document.getElementById('editItemCostPrice').value) || 0
  }

  try {
    setButtonLoading('submitEditItemBtn', true)

    const response = await apiRequest(
      API.buildURL(API_ENDPOINTS.MARKETPLACE.EXCHANGE_ITEM_DETAIL, { item_id: itemId }),
      {
        method: 'PUT',
        body: JSON.stringify(data)
      }
    )

    if (response?.success) {
      showSuccess('更新成功')
      editItemModal.hide()
      loadItems()
    } else {
      showError(response?.message || '更新失败')
    }
  } catch (error) {
    showError(error.message)
  } finally {
    setButtonLoading('submitEditItemBtn', false, '<i class="bi bi-check-lg"></i> 保存更新')
  }
}

async function toggleItemStatus(itemId, currentStatus) {
  const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
  const action = newStatus === 'active' ? '上架' : '下架'

  if (!confirm(`确定要${action}该商品吗？`)) return

  try {
    const response = await apiRequest(
      API.buildURL(API_ENDPOINTS.MARKETPLACE.EXCHANGE_ITEM_DETAIL, { item_id: itemId }),
      {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      }
    )

    if (response?.success) {
      showSuccess(`${action}成功`)
      loadItems()
    } else {
      showError(response?.message || `${action}失败`)
    }
  } catch (error) {
    showError(error.message)
  }
}

// ============================================
// 兑换订单管理
// ============================================

async function loadOrders() {
  const tbody = document.getElementById('ordersTableBody')
  showTableLoading(tbody, 9)

  try {
    const params = new URLSearchParams({
      page: ordersPage,
      page_size: pageSize
    })

    const status = document.getElementById('filterOrderStatus').value
    const orderNo = document.getElementById('filterOrderNo').value.trim()
    if (status) params.append('status', status)
    if (orderNo) params.append('order_no', orderNo)

    const response = await apiRequest(
      API_ENDPOINTS.MARKETPLACE.EXCHANGE_ORDERS + '?' + params
    )

    if (response?.success) {
      orders = response.data.orders || response.data || []
      renderOrders()
      updateOrderStats()
      if (response.data.pagination) {
        renderPagination('ordersPagination', response.data.pagination, ordersPage, p => {
          ordersPage = p
          loadOrders()
        })
      }
    } else {
      showTableError(tbody, 9, response?.message || '加载失败')
    }
  } catch (error) {
    showTableError(tbody, 9, error.message)
  }
}

function renderOrders() {
  const tbody = document.getElementById('ordersTableBody')

  if (orders.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="9" class="text-center text-muted py-4">暂无订单数据</td></tr>'
    return
  }

  tbody.innerHTML = orders
    .map(
      order => `
    <tr>
      <td><code>${order.order_no}</code></td>
      <td>ID: ${order.user_id}</td>
      <td>
        <div><strong>${escapeHtml(order.item_snapshot?.name || '-')}</strong></div>
        <small class="text-muted">${escapeHtml(order.item_snapshot?.description || '')}</small>
      </td>
      <td>${order.quantity}</td>
      <td>${getAssetText(order.pay_asset_code)}</td>
      <td><span class="badge bg-info">${order.pay_amount} ${getAssetUnit(order.pay_asset_code)}</span></td>
      <td>${getStatusBadge(order.status)}</td>
      <td>${formatDateTime(order.exchange_time || order.created_at)}</td>
      <td>
        <button class="btn btn-sm btn-outline-info" data-action="detail" data-order="${order.order_no}">
          <i class="bi bi-eye"></i>
        </button>
        ${
          order.status === 'pending'
            ? `
          <button class="btn btn-sm btn-outline-primary" data-action="update" data-order="${order.order_no}">
            <i class="bi bi-arrow-repeat"></i>
          </button>
        `
            : ''
        }
      </td>
    </tr>
  `
    )
    .join('')
}

function updateOrderStats() {
  const total = orders.length
  const pending = orders.filter(o => o.status === 'pending').length
  const shipped = orders.filter(o => o.status === 'shipped').length
  const cancelled = orders.filter(o => o.status === 'cancelled').length

  document.getElementById('stat_orders_total').textContent = total
  document.getElementById('stat_orders_pending').textContent = pending
  document.getElementById('stat_orders_shipped').textContent = shipped
  document.getElementById('stat_orders_cancelled').textContent = cancelled
}

function handleOrderAction(e) {
  const btn = e.target.closest('[data-action]')
  if (!btn) return

  const action = btn.dataset.action
  const orderNo = btn.dataset.order

  if (action === 'detail') {
    viewOrderDetail(orderNo)
  } else if (action === 'update') {
    document.getElementById('updateOrderNo').value = orderNo
    document.getElementById('newStatus').value = ''
    document.getElementById('statusRemark').value = ''
    updateStatusModal.show()
  }
}

async function viewOrderDetail(orderNo) {
  try {
    showLoading(true)

    const response = await apiRequest(
      API.buildURL(API_ENDPOINTS.MARKETPLACE.EXCHANGE_ORDER_DETAIL, { order_no: orderNo })
    )

    if (response?.success) {
      const order = response.data.order
      document.getElementById('detailOrderNo').textContent = order.order_no
      document.getElementById('detailStatus').innerHTML = getStatusBadge(order.status)
      document.getElementById('detailExchangeTime').textContent = formatDateTime(
        order.exchange_time || order.created_at
      )
      document.getElementById('detailUserId').textContent = order.user_id
      document.getElementById('detailItemName').textContent = order.item_snapshot?.name || '-'
      document.getElementById('detailQuantity').textContent = order.quantity
      document.getElementById('detailPaymentType').textContent = getAssetText(order.pay_asset_code)
      document.getElementById('detailPayAmount').textContent =
        `${order.pay_amount} ${getAssetUnit(order.pay_asset_code)}`
      orderDetailModal.show()
    } else {
      showError(response?.message || '获取订单详情失败')
    }
  } catch (error) {
    showError(error.message)
  } finally {
    showLoading(false)
  }
}

async function submitUpdateStatus() {
  const orderNo = document.getElementById('updateOrderNo').value
  const newStatus = document.getElementById('newStatus').value
  const remark = document.getElementById('statusRemark').value.trim()

  if (!newStatus) {
    showError('请选择新状态')
    return
  }

  try {
    setButtonLoading('submitUpdateStatusBtn', true)

    const response = await apiRequest(API.buildURL(API_ENDPOINTS.MARKETPLACE.EXCHANGE_ORDER_STATUS, { order_no: orderNo }), {
      method: 'POST',
      body: JSON.stringify({ status: newStatus, remark })
    })

    if (response?.success) {
      showSuccess('状态更新成功')
      updateStatusModal.hide()
      loadOrders()
    } else {
      showError(response?.message || '更新失败')
    }
  } catch (error) {
    showError(error.message)
  } finally {
    setButtonLoading('submitUpdateStatusBtn', false, '<i class="bi bi-check-lg"></i> 确认更新')
  }
}

function resetOrderFilter() {
  document.getElementById('filterOrderStatus').value = ''
  document.getElementById('filterOrderNo').value = ''
  ordersPage = 1
  loadOrders()
}

// ============================================
// 交易订单管理
// ============================================

async function loadTradeOrders() {
  const tbody = document.getElementById('tradeOrdersTableBody')
  showTableLoading(tbody, 8)

  try {
    const params = new URLSearchParams({
      page: tradePage,
      page_size: pageSize
    })

    const status = document.getElementById('filterTradeStatus').value
    const sellerId = document.getElementById('filterTradeSellerId').value.trim()
    const buyerId = document.getElementById('filterTradeBuyerId').value.trim()
    const orderNo = document.getElementById('filterTradeOrderNo').value.trim()

    if (status) params.append('status', status)
    if (sellerId) params.append('seller_id', sellerId)
    if (buyerId) params.append('buyer_id', buyerId)
    if (orderNo) params.append('order_no', orderNo)

    const response = await apiRequest(API_ENDPOINTS.MARKETPLACE.TRADE_ORDERS + '?' + params)

    if (response?.success) {
      tradeOrders = response.data.orders || response.data || []
      renderTradeOrders()
      updateTradeStats()
      if (response.data.pagination) {
        renderPagination('tradePagination', response.data.pagination, tradePage, p => {
          tradePage = p
          loadTradeOrders()
        })
      }
    } else {
      showTableError(tbody, 8, response?.message || '加载失败')
    }
  } catch (error) {
    showTableError(tbody, 8, error.message)
  }
}

function renderTradeOrders() {
  const tbody = document.getElementById('tradeOrdersTableBody')

  if (tradeOrders.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="8" class="text-center text-muted py-4">暂无交易订单数据</td></tr>'
    return
  }

  tbody.innerHTML = tradeOrders
    .map(
      order => `
    <tr>
      <td><code>${order.order_no}</code></td>
      <td>ID: ${order.seller_id}</td>
      <td>ID: ${order.buyer_id}</td>
      <td>${escapeHtml(order.item_name || '-')}</td>
      <td class="text-primary fw-bold">${order.price}</td>
      <td>${getStatusBadge(order.status)}</td>
      <td>${formatDateTime(order.created_at)}</td>
      <td>
        <button class="btn btn-sm btn-outline-info" data-action="detail" data-order="${order.order_no}">
          <i class="bi bi-eye"></i>
        </button>
      </td>
    </tr>
  `
    )
    .join('')
}

function updateTradeStats() {
  const total = tradeOrders.length
  const pending = tradeOrders.filter(o => o.status === 'pending').length
  const completed = tradeOrders.filter(o => o.status === 'completed').length

  document.getElementById('stat_trade_total').textContent = total
  document.getElementById('stat_trade_pending').textContent = pending
  document.getElementById('stat_trade_completed').textContent = completed
}

function handleTradeAction(e) {
  const btn = e.target.closest('[data-action]')
  if (!btn) return

  const action = btn.dataset.action
  const orderNo = btn.dataset.order

  if (action === 'detail') {
    const order = tradeOrders.find(o => o.order_no === orderNo)
    if (order) {
      alert(
        `交易订单详情：\n订单号：${order.order_no}\n卖家ID：${order.seller_id}\n买家ID：${order.buyer_id}\n商品：${order.item_name}\n价格：${order.price}\n状态：${order.status}`
      )
    }
  }
}

function resetTradeFilter() {
  document.getElementById('filterTradeStatus').value = ''
  document.getElementById('filterTradeSellerId').value = ''
  document.getElementById('filterTradeBuyerId').value = ''
  document.getElementById('filterTradeOrderNo').value = ''
  tradePage = 1
  loadTradeOrders()
}

// ============================================
// 统计分析
// ============================================

async function loadStats() {
  // 简单的统计展示
  const orderStatusChart = document.getElementById('orderStatusChart')
  const exchangeTrendChart = document.getElementById('exchangeTrendChart')
  const topItemsTableBody = document.getElementById('topItemsTableBody')

  // 订单状态分布（使用已加载的数据）
  if (orders.length > 0) {
    const statusCount = {
      pending: orders.filter(o => o.status === 'pending').length,
      shipped: orders.filter(o => o.status === 'shipped').length,
      completed: orders.filter(o => o.status === 'completed').length,
      cancelled: orders.filter(o => o.status === 'cancelled').length
    }

    orderStatusChart.innerHTML = `
      <div class="d-flex justify-content-around text-center">
        <div><div class="fs-3 text-warning">${statusCount.pending}</div><small>待处理</small></div>
        <div><div class="fs-3 text-info">${statusCount.completed}</div><small>已完成</small></div>
        <div><div class="fs-3 text-success">${statusCount.shipped}</div><small>已发货</small></div>
        <div><div class="fs-3 text-secondary">${statusCount.cancelled}</div><small>已取消</small></div>
      </div>
    `
  } else {
    orderStatusChart.innerHTML = '<p class="text-muted">暂无数据</p>'
  }

  // 趋势图占位
  exchangeTrendChart.innerHTML = '<p class="text-muted">趋势分析图表开发中...</p>'

  // 热门商品（后端字段：sold_count 替代 exchange_count）
  if (items.length > 0) {
    const topItems = [...items]
      .sort((a, b) => (b.sold_count || 0) - (a.sold_count || 0))
      .slice(0, 10)

    topItemsTableBody.innerHTML = topItems
      .map(
        (item, index) => `
      <tr>
        <td><span class="badge ${index < 3 ? 'bg-warning' : 'bg-secondary'}">${index + 1}</span></td>
        <td>${escapeHtml(item.name)}</td>
        <td class="text-primary fw-bold">${item.sold_count || 0}</td>
        <td>-</td>
        <td><span class="badge bg-info">${item.cost_amount || 0} ${getAssetText(item.cost_asset_code)}</span></td>
      </tr>
    `
      )
      .join('')
  } else {
    topItemsTableBody.innerHTML =
      '<tr><td colspan="5" class="text-center text-muted py-4">暂无数据</td></tr>'
  }
}

// ============================================
// 辅助函数
// ============================================

function getAssetText(assetCode) {
  const map = {
    points_virtual_value: '虚拟价值',
    points_lottery: '抽奖积分',
    points_consumption: '消费积分',
    coins: '金币',
    red_shard: '红色碎片',
    shard: '碎片',
    crystal: '水晶'
  }
  return map[assetCode] || assetCode || '未知'
}

function getAssetUnit(assetCode) {
  const map = {
    points_virtual_value: '虚拟值',
    points_lottery: '积分',
    coins: '金币',
    shard: '个',
    crystal: '个'
  }
  return map[assetCode] || '个'
}

function getStatusBadge(status) {
  const map = {
    pending: '<span class="badge bg-warning">待处理</span>',
    completed: '<span class="badge bg-info">已完成</span>',
    shipped: '<span class="badge bg-success">已发货</span>',
    cancelled: '<span class="badge bg-secondary">已取消</span>'
  }
  return map[status] || `<span class="badge bg-secondary">${status}</span>`
}

function showTableLoading(tbody, colspan) {
  tbody.innerHTML = `
    <tr><td colspan="${colspan}" class="text-center py-5">
      <div class="spinner-border text-primary"></div>
      <p class="mt-2 text-muted">正在加载数据...</p>
    </td></tr>
  `
}

function showTableError(tbody, colspan, message) {
  tbody.innerHTML = `
    <tr><td colspan="${colspan}" class="text-center py-5 text-danger">
      <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
      <p class="mt-2">加载失败：${escapeHtml(message)}</p>
    </td></tr>
  `
}

function renderPagination(containerId, pagination, currentPage, onPageChange) {
  const container = document.getElementById(containerId)
  if (!pagination || pagination.total_pages <= 1) {
    container.innerHTML = ''
    return
  }

  let html = `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
    <a class="page-link" href="#" data-page="${currentPage - 1}">上一页</a>
  </li>`

  for (let i = 1; i <= pagination.total_pages; i++) {
    if (i === 1 || i === pagination.total_pages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      html += `<li class="page-item ${i === currentPage ? 'active' : ''}">
        <a class="page-link" href="#" data-page="${i}">${i}</a>
      </li>`
    } else if (i === currentPage - 3 || i === currentPage + 3) {
      html += '<li class="page-item disabled"><span class="page-link">...</span></li>'
    }
  }

  html += `<li class="page-item ${currentPage === pagination.total_pages ? 'disabled' : ''}">
    <a class="page-link" href="#" data-page="${currentPage + 1}">下一页</a>
  </li>`

  container.innerHTML = html

  container.querySelectorAll('a[data-page]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault()
      const page = parseInt(link.dataset.page)
      if (page >= 1 && page <= pagination.total_pages && page !== currentPage) {
        onPageChange(page)
      }
    })
  })
}

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

function showLoading(show) {
  document.getElementById('loadingOverlay').classList.toggle('show', show)
}

function showSuccess(message) {
  document.getElementById('successToastBody').textContent = message
  successToast.show()
}

function showError(message) {
  document.getElementById('errorToastBody').textContent = message
  errorToast.show()
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function escapeHtml(text) {
  if (!text) return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
