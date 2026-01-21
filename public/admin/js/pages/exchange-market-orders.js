// public/admin/js/pages/exchange-market-orders.js
/**
 * 兑换订单管理页面
 * @description 管理兑换市场的订单，包括查看、筛选、更新状态等功能
 * @created 2026-01-09
 */

// 全局变量
let currentPage = 1
const pageSize = 20
let currentFilters = {
  status: '',
  order_no: ''
}

// 页面加载
document.addEventListener('DOMContentLoaded', function () {
  // 使用 admin-common.js 中的 checkAdminPermission() 进行权限验证
  if (!checkAdminPermission()) {
    return
  }
  loadOrders()
  bindEvents()
})

// 绑定事件
function bindEvents() {
  document.getElementById('logoutBtn').addEventListener('click', logout)
  document.getElementById('searchBtn').addEventListener('click', handleSearch)
  document.getElementById('submitUpdateStatusBtn').addEventListener('click', handleUpdateStatus)
}

// 处理搜索
function handleSearch() {
  currentFilters = {
    status: document.getElementById('statusFilter').value,
    order_no: document.getElementById('orderNoSearch').value.trim()
  }
  currentPage = 1
  loadOrders()
}

/**
 * 加载订单列表
 * ✅ 使用管理员专用API端点获取全量订单列表
 */
async function loadOrders() {
  try {
    showLoading(true)
    const token = getToken()

    const params = new URLSearchParams({
      page: currentPage,
      page_size: pageSize
    })

    if (currentFilters.status) params.append('status', currentFilters.status)

    const response = await fetch(`${API_ENDPOINTS.MARKETPLACE.EXCHANGE_ORDERS}?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    })

    const data = await response.json()

    if (data.success) {
      renderOrders(data.data.orders)
      renderPagination(data.data.pagination)
      updateStats(data.data.orders)
    } else {
      showError(data.message || '加载失败')
    }
  } catch (error) {
    console.error('加载订单列表失败', error)
    showError('加载失败，请稍后重试')
  } finally {
    showLoading(false)
  }
}

/**
 * 渲染订单列表
 * ✅ 直接使用后端返回的字段：pay_asset_code, pay_amount
 */
function renderOrders(orders) {
  const tbody = document.getElementById('ordersTableBody')

  if (!orders || orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">暂无数据</td></tr>'
    return
  }

  tbody.innerHTML = orders
    .map(order => {
      const statusBadge = getStatusBadge(order.status)
      // 直接使用后端字段 pay_asset_code 获取资产类型文本
      const paymentTypeText = getAssetTypeText(order.pay_asset_code)
      // 直接使用后端字段 pay_amount 显示支付数量
      const paymentAmount = `<span class="badge bg-info">${order.pay_amount || 0} ${getAssetUnit(order.pay_asset_code)}</span>`

      return `
      <tr>
        <td><code>${order.order_no}</code></td>
        <td>ID: ${order.user_id}</td>
        <td>
          <div><strong>${escapeHtml(order.item_snapshot?.name || '-')}</strong></div>
          <small class="text-muted">${escapeHtml(order.item_snapshot?.description || '')}</small>
        </td>
        <td>${order.quantity}</td>
        <td>${paymentTypeText}</td>
        <td>${paymentAmount}</td>
        <td>${statusBadge}</td>
        <td>${formatDate(order.exchange_time || order.created_at)}</td>
        <td>
          <button class="btn btn-sm btn-outline-info" onclick="viewOrderDetail('${order.order_no}')">
            <i class="bi bi-eye"></i> 详情
          </button>
          ${
            order.status === 'pending'
              ? `
            <button class="btn btn-sm btn-outline-primary" onclick="updateOrderStatus('${order.order_no}')">
              <i class="bi bi-arrow-repeat"></i> 更新
            </button>
          `
              : ''
          }
        </td>
      </tr>
    `
    })
    .join('')
}

/**
 * 更新统计数据
 */
function updateStats(orders) {
  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    shipped: orders.filter(o => o.status === 'shipped').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length
  }

  document.getElementById('totalOrders').textContent = stats.total
  document.getElementById('pendingOrders').textContent = stats.pending
  document.getElementById('shippedOrders').textContent = stats.shipped
  document.getElementById('cancelledOrders').textContent = stats.cancelled
}

/**
 * 查看订单详情
 * ✅ 直接使用后端返回的字段：pay_asset_code, pay_amount, total_cost, admin_remark
 */
async function viewOrderDetail(orderNo) {
  try {
    showLoading(true)
    const token = getToken()

    const response = await fetch(API.buildURL(API_ENDPOINTS.MARKETPLACE.EXCHANGE_ORDER_DETAIL, { order_no: orderNo }), {
      headers: { Authorization: `Bearer ${token}` }
    })

    const data = await response.json()

    if (data.success) {
      const order = data.data.order

      document.getElementById('detailOrderNo').textContent = order.order_no
      document.getElementById('detailStatus').innerHTML = getStatusBadge(order.status)
      document.getElementById('detailExchangeTime').textContent = formatDate(
        order.exchange_time || order.created_at
      )
      document.getElementById('detailShippedAt').textContent = order.shipped_at
        ? formatDate(order.shipped_at)
        : '-'
      document.getElementById('detailUserId').textContent = order.user_id
      document.getElementById('detailItemName').textContent = order.item_snapshot?.name || '-'
      document.getElementById('detailItemDesc').textContent =
        order.item_snapshot?.description || '-'
      document.getElementById('detailQuantity').textContent = order.quantity
      // 直接使用后端字段
      document.getElementById('detailPaymentType').textContent = getAssetTypeText(
        order.pay_asset_code
      )
      document.getElementById('detailVirtualPaid').textContent =
        `${order.pay_amount || 0} ${getAssetUnit(order.pay_asset_code)}`
      document.getElementById('detailCost').textContent = order.total_cost || '-'
      document.getElementById('detailRemark').textContent = order.admin_remark || '-'

      // 显示支付信息行
      document.getElementById('detailVirtualRow').style.display = 'table-row'
      document.getElementById('detailPointsRow').style.display = 'none'

      new bootstrap.Modal(document.getElementById('orderDetailModal')).show()
    } else {
      showError(data.message || '获取订单详情失败')
    }
  } catch (error) {
    console.error('获取订单详情失败', error)
    showError('获取失败，请稍后重试')
  } finally {
    showLoading(false)
  }
}

/**
 * 打开更新状态对话框
 */
function updateOrderStatus(orderNo) {
  document.getElementById('updateOrderNo').value = orderNo
  document.getElementById('newStatus').value = ''
  document.getElementById('statusRemark').value = ''
  new bootstrap.Modal(document.getElementById('updateStatusModal')).show()
}

/**
 * 提交状态更新
 */
async function handleUpdateStatus() {
  try {
    const orderNo = document.getElementById('updateOrderNo').value
    const newStatus = document.getElementById('newStatus').value
    const remark = document.getElementById('statusRemark').value.trim()

    if (!newStatus) {
      showError('请选择新状态')
      return
    }

    showLoading(true)
    const token = getToken()

    const response = await fetch(API.buildURL(API_ENDPOINTS.MARKETPLACE.EXCHANGE_ORDER_STATUS, { order_no: orderNo }), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: newStatus, remark })
    })

    const data = await response.json()

    if (data.success) {
      showSuccess('状态更新成功')
      bootstrap.Modal.getInstance(document.getElementById('updateStatusModal')).hide()
      loadOrders()
    } else {
      showError(data.message || '更新失败')
    }
  } catch (error) {
    console.error('更新订单状态失败', error)
    showError('更新失败，请稍后重试')
  } finally {
    showLoading(false)
  }
}

/**
 * 渲染分页
 */
function renderPagination(pagination) {
  const paginationEl = document.getElementById('pagination')
  if (!pagination || pagination.total_pages <= 1) {
    paginationEl.innerHTML = ''
    return
  }

  let html = ''
  for (let i = 1; i <= pagination.total_pages; i++) {
    html += `
      <li class="page-item ${i === currentPage ? 'active' : ''}">
        <a class="page-link" href="#" onclick="changePage(${i}); return false;">${i}</a>
      </li>
    `
  }
  paginationEl.innerHTML = html
}

/**
 * 切换页码
 */
function changePage(page) {
  currentPage = page
  loadOrders()
}

// ==================== 工具函数 ====================

/**
 * 获取状态标签HTML
 */
function getStatusBadge(status) {
  const map = {
    pending: '<span class="badge bg-warning">待处理</span>',
    completed: '<span class="badge bg-info">已完成</span>',
    shipped: '<span class="badge bg-success">已发货</span>',
    cancelled: '<span class="badge bg-secondary">已取消</span>'
  }
  return map[status] || `<span class="badge bg-secondary">${status}</span>`
}

/**
 * 根据后端返回的 pay_asset_code 获取资产类型显示文本
 * ✅ 直接使用后端字段 pay_asset_code
 */
function getAssetTypeText(assetCode) {
  const assetMap = {
    // 积分类型
    points_virtual_value: '虚拟价值',
    points_lottery: '抽奖积分',
    points_consumption: '消费积分',
    coins: '金币',
    // 材料类型（碎片等）
    red_shard: '红色碎片',
    blue_shard: '蓝色碎片',
    green_shard: '绿色碎片',
    gold_shard: '金色碎片',
    purple_shard: '紫色碎片',
    shard: '碎片',
    // 其他材料
    crystal: '水晶',
    gem: '宝石',
    ticket: '兑换券'
  }
  return assetMap[assetCode] || assetCode || '未知'
}

/**
 * 根据后端返回的 pay_asset_code 获取资产单位
 * ✅ 直接使用后端字段 pay_asset_code
 */
function getAssetUnit(assetCode) {
  const unitMap = {
    // 积分类型
    points_virtual_value: '虚拟值',
    points_lottery: '积分',
    points_consumption: '积分',
    coins: '金币',
    // 材料类型
    red_shard: '个',
    blue_shard: '个',
    green_shard: '个',
    gold_shard: '个',
    purple_shard: '个',
    shard: '个',
    crystal: '个',
    gem: '个',
    ticket: '张'
  }
  return unitMap[assetCode] || '个'
}

/**
 * 格式化日期
 */
function formatDate(dateStr) {
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
 * 转义HTML特殊字符
 */
function escapeHtml(text) {
  if (!text) return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * 显示/隐藏加载遮罩
 */
function showLoading(show) {
  document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none'
}

/**
 * 显示成功消息
 */
function showSuccess(message) {
  if (typeof showSuccessToast === 'function') {
    showSuccessToast(message)
  } else {
    alert(message)
  }
}

/**
 * 显示错误消息
 */
function showError(message) {
  if (typeof showErrorToast === 'function') {
    showErrorToast(message)
  } else {
    alert(message)
  }
}
