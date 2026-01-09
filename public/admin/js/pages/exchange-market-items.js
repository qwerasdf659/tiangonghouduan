/**
 * 兑换市场商品管理页面
 * @description 管理用户可兑换的官方商品
 * @author Admin
 * @created 2026-01-09
 * @updated 2026-01-09 适配后端V4.5.0材料资产支付字段
 *
 * 后端字段对照（以后端为准）：
 * - item_id: 商品ID
 * - name: 商品名称
 * - description: 商品描述
 * - cost_asset_code: 支付资产类型（如 red_shard）
 * - cost_amount: 消耗数量
 * - cost_price: 成本价
 * - stock: 库存
 * - sold_count: 已售数量
 * - sort_order: 排序号
 * - status: 状态（active/inactive）
 */

// ============================================
// 全局变量
// ============================================

let currentPage = 1
const pageSize = 20
let currentFilters = {
  status: '',
  cost_asset_code: '',
  sort_by: 'sort_order'
}
let assetTypes = [] // 缓存材料资产类型列表

// ============================================
// 页面初始化
// ============================================

document.addEventListener('DOMContentLoaded', function () {
  checkAuth()
  loadAssetTypes() // 加载材料资产类型
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
// 材料资产类型加载
// ============================================

/**
 * 加载材料资产类型列表
 */
async function loadAssetTypes() {
  try {
    const token = getToken()
    const response = await fetch('/api/v4/console/material/asset-types?is_enabled=true', {
      headers: { Authorization: `Bearer ${token}` }
    })

    const data = await response.json()

    if (data.success && data.data && data.data.asset_types) {
      assetTypes = data.data.asset_types
      populateAssetTypeSelects()
    } else {
      console.warn('加载材料资产类型失败', data.message)
      // 使用默认选项
      assetTypes = [
        { asset_code: 'red_shard', display_name: '碎红水晶' },
        { asset_code: 'red_crystal', display_name: '完整红水晶' }
      ]
      populateAssetTypeSelects()
    }
  } catch (error) {
    console.error('加载材料资产类型失败', error)
    // 使用默认选项
    assetTypes = [
      { asset_code: 'red_shard', display_name: '碎红水晶' },
      { asset_code: 'red_crystal', display_name: '完整红水晶' }
    ]
    populateAssetTypeSelects()
  }
}

/**
 * 填充资产类型选择器
 */
function populateAssetTypeSelects() {
  const selects = ['addAssetCodeSelect', 'editAssetCodeSelect', 'assetCodeFilter']

  selects.forEach(selectId => {
    const select = document.getElementById(selectId)
    if (!select) return

    // 保留第一个选项（默认提示）
    const firstOption = select.options[0]
    select.innerHTML = ''
    select.appendChild(firstOption)

    // 添加资产类型选项
    assetTypes.forEach(asset => {
      const option = document.createElement('option')
      option.value = asset.asset_code
      option.textContent = `${asset.display_name} (${asset.asset_code})`
      select.appendChild(option)
    })
  })
}

/**
 * 获取资产类型显示名称
 */
function getAssetDisplayName(assetCode) {
  const asset = assetTypes.find(a => a.asset_code === assetCode)
  return asset ? asset.display_name : assetCode
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
    cost_asset_code: document.getElementById('assetCodeFilter').value,
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
    if (currentFilters.cost_asset_code) params.append('cost_asset_code', currentFilters.cost_asset_code)

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
 * 
 * DataSanitizer 返回的字段（以后端为准）：
 * - id: 商品ID（DataSanitizer 将 item_id 映射为 id）
 * - name: 商品名称
 * - description: 商品描述
 * - cost_asset_code: 支付资产类型
 * - cost_amount: 消耗数量
 * - stock: 库存
 * - status: 状态
 * - sort_order: 排序号
 * - cost_price: 成本价（管理员可见）
 * - total_exchange_count: 已售数量（管理员可见）
 */
function renderItems(items) {
  const tbody = document.getElementById('itemsTableBody')

  if (!items || items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">暂无数据</td></tr>'
    return
  }

  tbody.innerHTML = items
    .map(item => {
      // 兼容处理：优先使用 id，兼容 item_id
      const itemId = item.id || item.item_id
      const stockClass =
        item.stock === 0 ? 'stock-warning' : item.stock <= 10 ? 'stock-low' : 'stock-ok'
      const statusBadge =
        item.status === 'active'
          ? '<span class="badge bg-success">上架</span>'
          : '<span class="badge bg-secondary">下架</span>'

      // 显示支付资产信息
      const assetDisplay = item.cost_asset_code
        ? `<span class="badge bg-info">${getAssetDisplayName(item.cost_asset_code)}</span>`
        : '<span class="badge bg-secondary">未设置</span>'

      // 已售数量：DataSanitizer返回 total_exchange_count（管理员可见）
      const soldCount = item.total_exchange_count || item.sold_count || 0

      return `
      <tr>
        <td>${itemId}</td>
        <td>
          <div><strong>${escapeHtml(item.name)}</strong></div>
          <small class="text-muted">${escapeHtml(item.description || '')}</small>
        </td>
        <td>${assetDisplay}</td>
        <td><span class="badge bg-warning text-dark">${item.cost_amount || 0}</span></td>
        <td><span class="${stockClass}">${item.stock}</span></td>
        <td>${soldCount}</td>
        <td>${statusBadge}</td>
        <td>${item.sort_order}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary" onclick="editItem(${itemId})">
            <i class="bi bi-pencil"></i> 编辑
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteItem(${itemId})">
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
 * 字段说明：total_exchange_count 是管理员可见的已售数量
 */
function updateStats(items) {
  const stats = {
    total: items.length,
    active: items.filter(i => i.status === 'active').length,
    lowStock: items.filter(i => i.stock <= 10 && i.stock > 0).length,
    // 兼容处理：优先使用 total_exchange_count，兼容 sold_count
    totalSold: items.reduce((sum, i) => sum + (i.total_exchange_count || i.sold_count || 0), 0)
  }

  document.getElementById('totalItems').textContent = stats.total
  document.getElementById('activeItems').textContent = stats.active
  document.getElementById('lowStockItems').textContent = stats.lowStock
  document.getElementById('totalExchanges').textContent = stats.totalSold
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
 * 发送后端期望的字段：item_name, item_description, cost_asset_code, cost_amount, cost_price, stock, sort_order, status
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

    // 构建后端期望的请求体（使用后端字段名）
    const requestData = {
      item_name: formData.get('item_name'),
      item_description: formData.get('item_description') || '',
      cost_asset_code: formData.get('cost_asset_code'),
      cost_amount: parseInt(formData.get('cost_amount')) || 0,
      cost_price: parseFloat(formData.get('cost_price')) || 0,
      stock: parseInt(formData.get('stock')) || 0,
      sort_order: parseInt(formData.get('sort_order')) || 100,
      status: formData.get('status') || 'active'
    }

    // 验证必填字段
    if (!requestData.cost_asset_code) {
      showError('请选择支付资产类型')
      return
    }
    if (requestData.cost_amount <= 0) {
      showError('材料消耗数量必须大于0')
      return
    }

    const token = getToken()
    const response = await fetch('/api/v4/console/marketplace/exchange_market/items', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
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
 * 编辑商品 - 加载商品详情
 * 
 * DataSanitizer 返回的字段：
 * - id: 商品ID（DataSanitizer 将 item_id 映射为 id）
 * - name, description, cost_asset_code, cost_amount, stock, status, sort_order
 * - cost_price: 成本价（管理员可见）
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

      // 填充表单（兼容 id 和 item_id）
      document.getElementById('editItemId').value = item.id || item.item_id
      document.getElementById('editItemName').value = item.name || ''
      document.getElementById('editItemDescription').value = item.description || ''
      document.getElementById('editAssetCodeSelect').value = item.cost_asset_code || ''
      document.getElementById('editCostAmount').value = item.cost_amount || 0
      document.getElementById('editCostPrice').value = item.cost_price || 0
      document.getElementById('editStock').value = item.stock || 0
      document.getElementById('editSortOrder').value = item.sort_order || 100
      document.getElementById('editStatus').value = item.status || 'active'

      // display_points 是可选展示字段，后端可能没有
      const displayPointsEl = document.getElementById('editDisplayPoints')
      if (displayPointsEl) {
        displayPointsEl.value = item.display_points || 0
      }

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
 * 发送后端期望的字段：item_name, item_description, cost_asset_code, cost_amount, cost_price, stock, sort_order, status
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
    const itemId = formData.get('item_id')

    // 构建后端期望的请求体（使用后端字段名）
    const requestData = {
      item_name: formData.get('item_name'),
      item_description: formData.get('item_description') || '',
      cost_asset_code: formData.get('cost_asset_code'),
      cost_amount: parseInt(formData.get('cost_amount')) || 0,
      cost_price: parseFloat(formData.get('cost_price')) || 0,
      stock: parseInt(formData.get('stock')) || 0,
      sort_order: parseInt(formData.get('sort_order')) || 100,
      status: formData.get('status') || 'active'
    }

    // 验证必填字段
    if (!requestData.cost_asset_code) {
      showError('请选择支付资产类型')
      return
    }
    if (requestData.cost_amount <= 0) {
      showError('材料消耗数量必须大于0')
      return
    }

    const token = getToken()
    const response = await fetch(`/api/v4/console/marketplace/exchange_market/items/${itemId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
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
