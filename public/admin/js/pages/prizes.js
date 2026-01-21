/**
 * 奖品池配置页面 - JavaScript逻辑
 * 从prizes.html提取，遵循前端工程化最佳实践
 *
 * 依赖：
 * - /admin/js/admin-common.js (apiRequest, getToken, getCurrentUser, checkAdminPermission, logout, formatNumber)
 * - /admin/js/resource-config.js (ResourceConfig)
 * - Bootstrap 5
 */

// ========== 全局变量 ==========
let defaultPrizeImage = '/admin/images/default-prize.png'
let currentPrizes = []

// ========== 页面初始化 ==========

document.addEventListener('DOMContentLoaded', function () {
  // 获取默认图片
  if (typeof ResourceConfig !== 'undefined') {
    defaultPrizeImage = ResourceConfig.getImage('defaultPrize')
  }

  // 显示用户信息
  const userInfo = getCurrentUser()
  if (userInfo && userInfo.nickname) {
    document.getElementById('welcomeText').textContent = `欢迎，${userInfo.nickname}`
  }

  // Token和权限验证
  if (!getToken() || !checkAdminPermission()) {
    return
  }

  // 加载奖品列表
  loadPrizes()

  // ===== 静态按钮事件监听器 =====
  document.getElementById('logoutBtn').addEventListener('click', logout)
  document.getElementById('submitAddPrizeBtn').addEventListener('click', submitAddPrize)
  document.getElementById('submitEditPrizeBtn').addEventListener('click', submitEditPrize)

  // ===== 事件委托：奖品操作按钮 =====
  document.getElementById('prizesTableBody').addEventListener('click', e => {
    const editBtn = e.target.closest('.prize-edit-btn')
    if (editBtn) {
      editPrize(parseInt(editBtn.dataset.prizeId))
      return
    }

    const stockBtn = e.target.closest('.prize-stock-btn')
    if (stockBtn) {
      addStock(parseInt(stockBtn.dataset.prizeId))
      return
    }

    const deleteBtn = e.target.closest('.prize-delete-btn')
    if (deleteBtn) {
      deletePrize(parseInt(deleteBtn.dataset.prizeId))
      return
    }
  })

  // ===== 图片加载错误处理 =====
  document.getElementById('prizesTableBody').addEventListener(
    'error',
    e => {
      if (e.target.classList.contains('prize-img')) {
        e.target.src = defaultPrizeImage
      }
    },
    true
  )

  // 图片预览
  const prizeImageInput = document.getElementById('prizeImageInput')
  if (prizeImageInput) {
    prizeImageInput.addEventListener('change', function (e) {
      previewImage(e.target, 'imagePreview', 'imagePreviewContainer')
    })
  }

  const editPrizeImageInput = document.getElementById('editPrizeImageInput')
  if (editPrizeImageInput) {
    editPrizeImageInput.addEventListener('change', function (e) {
      previewImage(e.target, 'editImagePreview', 'editImagePreviewContainer')
    })
  }
})

/**
 * 加载奖品列表
 */
async function loadPrizes() {
  showLoading()

  try {
    const response = await apiRequest(API_ENDPOINTS.PRIZE.LIST)

    if (response && response.success) {
      currentPrizes = response.data.prizes || response.data.list || []
      renderPrizes(currentPrizes)
      updateStatistics(response.data)
    } else {
      showError('加载失败', response?.message || '获取数据失败')
    }
  } catch (error) {
    console.error('加载奖品失败:', error)
    showError('加载失败', error.message)
  } finally {
    hideLoading()
  }
}

/**
 * 渲染奖品列表
 * 
 * 🔧 2026-01-21 修复：适配后端返回的字段名
 * - description → prize_description
 * - current_stock → stock_quantity
 * - initial_stock → stock_quantity
 * - claimed_count → total_win_count
 * - image_url → 根据image_id处理
 */
function renderPrizes(prizes) {
  const tbody = document.getElementById('prizesTableBody')

  if (prizes.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-5">
          <i class="bi bi-inbox text-muted" style="font-size: 3rem;"></i>
          <p class="mt-2 text-muted">暂无奖品，点击右上角添加奖品</p>
        </td>
      </tr>
    `
    return
  }

  tbody.innerHTML = prizes
    .map(
      prize => `
    <tr>
      <td>${prize.prize_id || prize.id}</td>
      <td>
        <div class="d-flex align-items-center">
          <img src="${prize.image_url || defaultPrizeImage}" 
               class="prize-image me-3 prize-img" 
               alt="${prize.prize_name}"
               onerror="this.src='${defaultPrizeImage}'">
          <div>
            <div class="fw-bold">${prize.prize_name}</div>
            <small class="text-muted">${prize.prize_description || '暂无描述'}</small>
          </div>
        </div>
      </td>
      <td>${getPrizeTypeLabel(prize.prize_type)}</td>
      <td class="fw-bold text-primary">¥${(prize.prize_value || 0).toFixed(2)}</td>
      <td>${renderStockBadge(prize.remaining_quantity, prize.stock_quantity)}</td>
      <td class="text-info">${formatNumber(prize.total_win_count || 0)}</td>
      <td>${renderPrizeStatus(prize)}</td>
      <td>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary prize-edit-btn" data-prize-id="${prize.prize_id || prize.id}">
            <i class="bi bi-pencil"></i> 编辑
          </button>
          <button class="btn btn-outline-success prize-stock-btn" data-prize-id="${prize.prize_id || prize.id}">
            <i class="bi bi-plus-circle"></i> 补货
          </button>
          <button class="btn btn-outline-danger prize-delete-btn" data-prize-id="${prize.prize_id || prize.id}">
            <i class="bi bi-trash"></i> 删除
          </button>
        </div>
      </td>
    </tr>
  `
    )
    .join('')
}

/**
 * 获取奖品类型标签
 */
function getPrizeTypeLabel(type) {
  const labels = {
    physical: '<span class="badge bg-primary">实物奖品</span>',
    virtual: '<span class="badge bg-info">虚拟奖品</span>',
    points: '<span class="badge bg-success">积分奖励</span>',
    coupon: '<span class="badge bg-warning text-dark">优惠券</span>'
  }
  return labels[type] || '<span class="badge bg-secondary">未知</span>'
}

/**
 * 渲染库存徽章
 * 
 * 🔧 2026-01-21 修复：参数改为 (remaining, total)
 * - remaining: 剩余库存 (remaining_quantity)
 * - total: 总库存 (stock_quantity)
 */
function renderStockBadge(remaining, total) {
  const current = remaining || 0
  const initial = total || 0
  const percentage = initial > 0 ? (current / initial) * 100 : 0
  let badgeClass = 'bg-success'
  let icon = 'check-circle'

  if (current === 0) {
    badgeClass = 'bg-danger'
    icon = 'x-circle'
  } else if (percentage < 20) {
    badgeClass = 'bg-warning text-dark'
    icon = 'exclamation-circle'
  }

  return `
    <span class="badge ${badgeClass} stock-badge">
      <i class="bi bi-${icon}"></i> ${current}/${initial}
    </span>
  `
}

/**
 * 渲染奖品状态
 * 
 * 🔧 2026-01-21 修复：使用后端字段
 * - remaining_quantity: 剩余库存
 * - stock_quantity: 总库存
 */
function renderPrizeStatus(prize) {
  const remaining = prize.remaining_quantity || 0
  const total = prize.stock_quantity || 0
  
  if (remaining === 0) {
    return '<span class="badge bg-danger">已售罄</span>'
  } else if (remaining < total * 0.2) {
    return '<span class="badge bg-warning text-dark">库存不足</span>'
  } else {
    return '<span class="badge bg-success">正常</span>'
  }
}

/**
 * 更新统计信息
 * 
 * 🔧 2026-01-21 修复：适配后端返回的统计字段
 * 后端返回: { total, active, inactive, out_of_stock, total_stock, remaining_stock }
 * 前端显示: 奖品总数, 库存充足, 库存不足, 已领取
 */
function updateStatistics(data) {
  if (data.statistics) {
    const stats = data.statistics
    // 奖品总数
    document.getElementById('totalPrizes').textContent = formatNumber(stats.total || 0)
    // 库存充足 = 活跃的奖品数 - 无库存的
    document.getElementById('inStockPrizes').textContent = formatNumber(
      (stats.active || 0) - (stats.out_of_stock || 0)
    )
    // 库存不足 = 无库存的奖品数
    document.getElementById('lowStockPrizes').textContent = formatNumber(
      stats.out_of_stock || 0
    )
    // 已领取 = 总库存 - 剩余库存
    const claimed = (stats.total_stock || 0) - (stats.remaining_stock || 0)
    document.getElementById('claimedPrizes').textContent = formatNumber(claimed)
  }
}

/**
 * 图片预览
 */
function previewImage(input, previewId, containerId) {
  if (input.files && input.files[0]) {
    const reader = new FileReader()
    reader.onload = function (e) {
      document.getElementById(previewId).src = e.target.result
      document.getElementById(containerId).style.display = 'block'
    }
    reader.readAsDataURL(input.files[0])
  }
}

/**
 * 提交添加奖品
 */
async function submitAddPrize() {
  const form = document.getElementById('addPrizeForm')
  if (!form.checkValidity()) {
    form.reportValidity()
    return
  }

  showLoading()

  try {
    const prizeData = {
      name: document.getElementById('prizeName').value,
      type: document.getElementById('prizeType').value,
      value: parseFloat(document.getElementById('prizeValue').value) || 0,
      quantity: parseInt(document.getElementById('prizeStock').value) || 0,
      description: document.getElementById('prizeDescription').value || '',
      probability: 1,
      image_id: null,
      angle: 0,
      color: '#FF6B6B'
    }

    const response = await apiRequest(API_ENDPOINTS.PRIZE.BATCH_ADD, {
      method: 'POST',
      body: JSON.stringify({
        campaign_id: 1,
        prizes: [prizeData]
      })
    })

    if (response && response.success) {
      showSuccess('添加成功', '奖品已添加到奖品池')
      bootstrap.Modal.getInstance(document.getElementById('addPrizeModal')).hide()
      form.reset()
      document.getElementById('imagePreviewContainer').style.display = 'none'
      loadPrizes()
    } else {
      showError('添加失败', response?.message || '操作失败')
    }
  } catch (error) {
    console.error('添加奖品失败:', error)
    showError('添加失败', error.message)
  } finally {
    hideLoading()
  }
}

/**
 * 编辑奖品
 * 
 * 🔧 2026-01-21 修复：使用后端字段名
 * - current_stock → stock_quantity
 * - description → prize_description
 */
function editPrize(prizeId) {
  const prize = currentPrizes.find(p => (p.prize_id || p.id) === prizeId)
  if (!prize) {
    alert('奖品不存在')
    return
  }

  document.getElementById('editPrizeId').value = prizeId
  document.getElementById('editPrizeName').value = prize.prize_name
  document.getElementById('editPrizeType').value = prize.prize_type
  document.getElementById('editPrizeValue').value = prize.prize_value
  document.getElementById('editPrizeStock').value = prize.stock_quantity || 0
  document.getElementById('editPrizeDescription').value = prize.prize_description || ''

  // 处理图片显示
  if (prize.image_url) {
    document.getElementById('editImagePreview').src = prize.image_url
    document.getElementById('editImagePreviewContainer').style.display = 'block'
  } else {
    document.getElementById('editImagePreview').src = defaultPrizeImage
    document.getElementById('editImagePreviewContainer').style.display = 'block'
  }

  new bootstrap.Modal(document.getElementById('editPrizeModal')).show()
}

/**
 * 提交编辑奖品
 */
async function submitEditPrize() {
  const form = document.getElementById('editPrizeForm')
  if (!form.checkValidity()) {
    form.reportValidity()
    return
  }

  const prizeId = document.getElementById('editPrizeId').value

  showLoading()

  try {
    const updateData = {
      name: document.getElementById('editPrizeName').value,
      type: document.getElementById('editPrizeType').value,
      value: parseFloat(document.getElementById('editPrizeValue').value) || 0,
      quantity: parseInt(document.getElementById('editPrizeStock').value) || 0,
      description: document.getElementById('editPrizeDescription').value || ''
    }

    const result = await apiRequest(API.buildURL(API_ENDPOINTS.PRIZE.UPDATE, { prize_id: prizeId }), {
      method: 'PUT',
      body: JSON.stringify(updateData)
    })

    if (result && result.success) {
      showSuccess('更新成功', '奖品信息已更新')
      bootstrap.Modal.getInstance(document.getElementById('editPrizeModal')).hide()
      loadPrizes()
    } else {
      showError('更新失败', result?.message || '操作失败')
    }
  } catch (error) {
    console.error('更新奖品失败:', error)
    showError('更新失败', error.message)
  } finally {
    hideLoading()
  }
}

/**
 * 补货
 */
async function addStock(prizeId) {
  const quantity = prompt('请输入补货数量：')
  if (!quantity || isNaN(quantity) || parseInt(quantity) <= 0) {
    alert('请输入有效的补货数量')
    return
  }

  showLoading()

  try {
    const response = await apiRequest(API.buildURL(API_ENDPOINTS.PRIZE.ADD_STOCK, { prize_id: prizeId }), {
      method: 'POST',
      body: JSON.stringify({ quantity: parseInt(quantity) })
    })

    if (response && response.success) {
      showSuccess('补货成功', `已补充 ${quantity} 件库存`)
      loadPrizes()
    } else {
      showError('补货失败', response?.message || '操作失败')
    }
  } catch (error) {
    console.error('补货失败:', error)
    showError('补货失败', error.message)
  } finally {
    hideLoading()
  }
}

/**
 * 删除奖品
 */
async function deletePrize(prizeId) {
  if (!confirm('确认删除该奖品？删除后无法恢复。')) {
    return
  }

  showLoading()

  try {
    const response = await apiRequest(API.buildURL(API_ENDPOINTS.PRIZE.DELETE, { prize_id: prizeId }), {
      method: 'DELETE'
    })

    if (response && response.success) {
      showSuccess('删除成功', '奖品已从奖品池中删除')
      loadPrizes()
    } else {
      showError('删除失败', response?.message || '操作失败')
    }
  } catch (error) {
    console.error('删除奖品失败:', error)
    showError('删除失败', error.message)
  } finally {
    hideLoading()
  }
}

/**
 * 显示加载状态
 */
function showLoading() {
  const overlay = document.getElementById('loadingOverlay')
  if (overlay) overlay.classList.add('show')
}

/**
 * 隐藏加载状态
 */
function hideLoading() {
  const overlay = document.getElementById('loadingOverlay')
  if (overlay) overlay.classList.remove('show')
}

/**
 * 显示成功提示
 */
function showSuccess(title, message) {
  alert(`✅ ${title}\n${message}`)
}

/**
 * 显示错误提示
 */
function showError(title, message) {
  alert(`❌ ${title}\n${message}`)
}
