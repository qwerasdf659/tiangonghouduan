/**
 * 兑换市场商品管理页面
 * @description 管理用户可兑换的官方商品
 * @author Admin
 * @created 2026-01-09
 */

// ============================================
// 全局变量
// ============================================

let currentPage = 1
const pageSize = 20
let currentFilters = {
  status: '',
  price_type: '',
  sort_by: 'sort_order'
}

// ============================================
// 页面初始化
// ============================================

document.addEventListener('DOMContentLoaded', function () {
  checkAuth()
  loadItems()
  bindEvents()
})

/**
 * 检查认证
 */
function checkAuth() {
  if (!getToken()) {
    window.location.href = '/admin/login.html'
    return
  }

  // 显示用户信息
  const userInfo = getCurrentUser()
  if (userInfo && userInfo.nickname) {
    document.getElementById('welcomeText').textContent = `欢迎，${userInfo.nickname}`
  }
}

/**
 * 绑定事件
 */
function bindEvents() {
  document.getElementById('logoutBtn').addEventListener('click', logout)
  document.getElementById('searchBtn').addEventListener('click', handleSearch)
  document.getElementById('submitAddItemBtn').addEventListener('click', handleAddItem)
  document.getElementById('submitEditItemBtn').addEventListener('click', handleEditItem)
}

// ============================================
// 商品列表
// ============================================

/**
 * 处理搜索
 */
function handleSearch() {
  currentFilters = {
    status: document.getElementById('statusFilter').value,
    price_type: document.getElementById('priceTypeFilter').value,
    sort_by: document.getElementById('sortByFilter').value
  }
  currentPage = 1
  loadItems()
}

/**
 * 加载商品列表
 */
async function loadItems() {
  try {
    showLoading(true)
    const token = getToken()

    const params = new URLSearchParams({
      page: currentPage,
      page_size: pageSize,
      sort_by: currentFilters.sort_by || 'sort_order',
      sort_order: 'ASC'
    })

    if (currentFilters.status) params.append('status', currentFilters.status)
    if (currentFilters.price_type) params.append('price_type', currentFilters.price_type)

    const response = await fetch(`/api/v4/shop/exchange/items?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    })

    const data = await response.json()

    if (data.success) {
      renderItems(data.data.items)
      renderPagination(data.data.pagination)
      updateStats(data.data.items)
    } else {
      showError(data.message || '加载失败')
    }
  } catch (error) {
    console.error('加载商品列表失败', error)
    showError('加载失败，请稍后重试')
  } finally {
    showLoading(false)
  }
}

/**
 * 渲染商品列表
 */
function renderItems(items) {
  const tbody = document.getElementById('itemsTableBody')

  if (!items || items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">暂无数据</td></tr>'
    return
  }

  tbody.innerHTML = items
    .map(item => {
      const stockClass =
        item.stock === 0 ? 'stock-warning' : item.stock <= 10 ? 'stock-low' : 'stock-ok'
      const statusBadge =
        item.status === 'active'
          ? '<span class="badge bg-success">上架</span>'
          : '<span class="badge bg-secondary">下架</span>'

      // 只显示虚拟价值（唯一支付方式）
      const priceDisplay = `<span class="badge bg-info">${item.virtual_value_price} 虚拟价值</span>`

      return `
      <tr>
        <td>${item.id}</td>
        <td>
          <div><strong>${escapeHtml(item.name)}</strong></div>
          <small class="text-muted">${escapeHtml(item.description || '')}</small>
        </td>
        <td>${getPriceTypeText(item.price_type)}</td>
        <td>${priceDisplay}</td>
        <td><span class="${stockClass}">${item.stock}</span></td>
        <td>${item.total_exchange_count || 0}</td>
        <td>${statusBadge}</td>
        <td>${item.sort_order}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary" onclick="editItem(${item.id})">
            <i class="bi bi-pencil"></i> 编辑
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteItem(${item.id})">
            <i class="bi bi-trash"></i> 删除
          </button>
        </td>
      </tr>
    `
    })
    .join('')
}

/**
 * 更新统计数据
 */
function updateStats(items) {
  const stats = {
    total: items.length,
    active: items.filter(i => i.status === 'active').length,
    lowStock: items.filter(i => i.stock <= 10 && i.stock > 0).length,
    totalExchanges: items.reduce((sum, i) => sum + (i.total_exchange_count || 0), 0)
  }

  document.getElementById('totalItems').textContent = stats.total
  document.getElementById('activeItems').textContent = stats.active
  document.getElementById('lowStockItems').textContent = stats.lowStock
  document.getElementById('totalExchanges').textContent = stats.totalExchanges
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
  loadItems()
}

// ============================================
// 商品操作
// ============================================

/**
 * 添加商品
 */
async function handleAddItem() {
  try {
    const form = document.getElementById('addItemForm')
    if (!form.checkValidity()) {
      form.reportValidity()
      return
    }

    showLoading(true)
    const formData = new FormData(form)
    const data = Object.fromEntries(formData.entries())

    // 类型转换
    data.virtual_value_price = parseFloat(data.virtual_value_price) || 0
    data.points_price = parseInt(data.points_price) || 0
    data.cost_price = parseFloat(data.cost_price) || 0
    data.stock = parseInt(data.stock) || 0
    data.sort_order = parseInt(data.sort_order) || 100

    const token = getToken()
    const response = await fetch('/api/v4/console/marketplace/exchange_market/items', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })

    const result = await response.json()

    if (result.success) {
      showSuccess('添加成功')
      bootstrap.Modal.getInstance(document.getElementById('addItemModal')).hide()
      form.reset()
      loadItems()
    } else {
      showError(result.message || '添加失败')
    }
  } catch (error) {
    console.error('添加商品失败', error)
    showError('添加失败，请稍后重试')
  } finally {
    showLoading(false)
  }
}

/**
 * 编辑商品
 */
async function editItem(itemId) {
  try {
    showLoading(true)
    const token = getToken()

    const response = await fetch(`/api/v4/shop/exchange/items/${itemId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })

    const data = await response.json()

    if (data.success) {
      const item = data.data.item

      document.getElementById('editItemId').value = item.id
      document.getElementById('editItemName').value = item.name
      document.getElementById('editItemDescription').value = item.description || ''
      document.getElementById('editPriceType').value = item.price_type
      document.getElementById('editVirtualPrice').value = item.virtual_value_price || 0
      document.getElementById('editPointsPrice').value = item.points_price || 0
      document.getElementById('editCostPrice').value = item.cost_price || 0
      document.getElementById('editStock').value = item.stock
      document.getElementById('editSortOrder').value = item.sort_order
      document.getElementById('editStatus').value = item.status

      new bootstrap.Modal(document.getElementById('editItemModal')).show()
    } else {
      showError(data.message || '获取商品信息失败')
    }
  } catch (error) {
    console.error('加载商品信息失败', error)
    showError('加载失败，请稍后重试')
  } finally {
    showLoading(false)
  }
}

/**
 * 提交编辑
 */
async function handleEditItem() {
  try {
    const form = document.getElementById('editItemForm')
    if (!form.checkValidity()) {
      form.reportValidity()
      return
    }

    showLoading(true)
    const formData = new FormData(form)
    const data = Object.fromEntries(formData.entries())
    const itemId = data.item_id
    delete data.item_id

    // 类型转换
    data.virtual_value_price = parseFloat(data.virtual_value_price) || 0
    data.points_price = parseInt(data.points_price) || 0
    data.cost_price = parseFloat(data.cost_price) || 0
    data.stock = parseInt(data.stock) || 0
    data.sort_order = parseInt(data.sort_order) || 100

    const token = getToken()
    const response = await fetch(`/api/v4/console/marketplace/exchange_market/items/${itemId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })

    const result = await response.json()

    if (result.success) {
      showSuccess('更新成功')
      bootstrap.Modal.getInstance(document.getElementById('editItemModal')).hide()
      loadItems()
    } else {
      showError(result.message || '更新失败')
    }
  } catch (error) {
    console.error('更新商品失败', error)
    showError('更新失败，请稍后重试')
  } finally {
    showLoading(false)
  }
}

/**
 * 删除商品
 */
async function deleteItem(itemId) {
  if (!confirm('确定要删除这个商品吗？此操作不可恢复！')) {
    return
  }

  try {
    showLoading(true)
    const token = getToken()

    const response = await fetch(`/api/v4/console/marketplace/exchange_market/items/${itemId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })

    const data = await response.json()

    if (data.success) {
      showSuccess('删除成功')
      loadItems()
    } else {
      showError(data.message || '删除失败')
    }
  } catch (error) {
    console.error('删除商品失败', error)
    showError('删除失败，请稍后重试')
  } finally {
    showLoading(false)
  }
}

// ============================================
// 工具函数
// ============================================

/**
 * 获取支付方式文本
 */
function getPriceTypeText(type) {
  return '虚拟价值'
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

/**
 * 显示加载状态
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
