/**
 * 孤儿冻结清理页面
 * @description 管理系统中的孤儿数据和过期冻结数据
 * @created 2026-01-09
 */

// 全局变量
let currentPage = 1
const pageSize = 20
let selectedItems = new Set()

/**
 * 页面初始化
 */
document.addEventListener('DOMContentLoaded', function () {
  // 显示用户信息
  const userInfo = getCurrentUser()
  if (userInfo && userInfo.nickname) {
    document.getElementById('welcomeText').textContent = `欢迎，${userInfo.nickname}`
  }

  // 事件监听器
  document.getElementById('logoutBtn').addEventListener('click', logout)
  document.getElementById('refreshBtn').addEventListener('click', loadData)
  document.getElementById('scanBtn').addEventListener('click', scanOrphans)
  document.getElementById('batchCleanBtn').addEventListener('click', showCleanConfirmModal)
  document.getElementById('dataTypeFilter').addEventListener('change', loadData)
  document.getElementById('assetTypeFilter').addEventListener('change', loadData)
  document.getElementById('timeRangeFilter').addEventListener('change', loadData)

  document.getElementById('headerCheckbox').addEventListener('change', toggleSelectAll)
  document.getElementById('confirmClean').addEventListener('change', function () {
    document.getElementById('confirmCleanBtn').disabled = !this.checked
  })
  document.getElementById('confirmCleanBtn').addEventListener('click', executeClean)

  // Token和权限验证
  if (!getToken() || !checkAdminPermission()) {
    return
  }

  // 加载数据
  loadData()
})

/**
 * 加载数据
 */
async function loadData() {
  showLoading(true)
  const tbody = document.getElementById('dataTableBody')

  try {
    const dataType = document.getElementById('dataTypeFilter').value
    const assetType = document.getElementById('assetTypeFilter').value
    const timeRange = document.getElementById('timeRangeFilter').value

    const params = new URLSearchParams({
      page: currentPage,
      page_size: pageSize
    })

    if (dataType) params.append('data_type', dataType)
    if (assetType) params.append('asset_type', assetType)
    if (timeRange) params.append('days', timeRange)

    const response = await apiRequest(`/api/v4/console/system/orphan-frozen?${params.toString()}`)

    if (response && response.success) {
      const { records, statistics, pagination } = response.data

      // 更新统计
      document.getElementById('orphanCount').textContent = statistics?.orphan_count || 0
      document.getElementById('frozenCount').textContent = statistics?.frozen_count || 0
      document.getElementById('expiredCount').textContent = statistics?.expired_count || 0
      document.getElementById('totalValue').textContent =
        '¥' + (statistics?.total_value || 0).toFixed(2)

      // 渲染表格
      renderTable(records || [])

      // 渲染分页
      if (pagination) {
        renderPagination(pagination)
      }
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="11" class="text-center py-5 text-muted">
            <i class="bi bi-inbox" style="font-size: 3rem;"></i>
            <p class="mt-2">暂无数据</p>
          </td>
        </tr>
      `
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
 */
function renderTable(records) {
  const tbody = document.getElementById('dataTableBody')

  if (!records || records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="text-center py-5 text-muted">
          <i class="bi bi-check-circle" style="font-size: 3rem;"></i>
          <p class="mt-2">暂无孤儿或冻结数据</p>
        </td>
      </tr>
    `
    return
  }

  tbody.innerHTML = records
    .map(record => {
      const typeBadge =
        {
          orphan: '<span class="badge bg-danger">孤儿</span>',
          frozen: '<span class="badge bg-info">冻结</span>',
          expired: '<span class="badge bg-warning">过期</span>'
        }[record.data_type] || '<span class="badge bg-secondary">未知</span>'

      const statusBadge = record.is_cleaned
        ? '<span class="badge bg-secondary">已清理</span>'
        : '<span class="badge bg-warning">待清理</span>'

      const isChecked = selectedItems.has(record.record_id)

      return `
      <tr>
        <td>
          <input type="checkbox" class="form-check-input row-checkbox" 
                 data-id="${record.record_id}" 
                 ${isChecked ? 'checked' : ''}
                 ${record.is_cleaned ? 'disabled' : ''}
                 onchange="toggleRowSelection(${record.record_id})">
        </td>
        <td>${record.record_id}</td>
        <td>${typeBadge}</td>
        <td>${record.asset_type_name || record.asset_type || '-'}</td>
        <td>${record.amount || 0}</td>
        <td>${record.user_nickname || record.user_id || '-'}</td>
        <td>${record.source || '-'}</td>
        <td>${formatDate(record.created_at)}</td>
        <td>${formatDate(record.expired_at) || '-'}</td>
        <td>${statusBadge}</td>
        <td>
          ${
            !record.is_cleaned
              ? `
            <button class="btn btn-sm btn-outline-primary" onclick="restoreRecord(${record.record_id})">
              <i class="bi bi-arrow-counterclockwise"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="cleanSingle(${record.record_id})">
              <i class="bi bi-trash"></i>
            </button>
          `
              : '-'
          }
        </td>
      </tr>
    `
    })
    .join('')

  updateBatchButton()
}

/**
 * 切换行选择
 */
function toggleRowSelection(recordId) {
  if (selectedItems.has(recordId)) {
    selectedItems.delete(recordId)
  } else {
    selectedItems.add(recordId)
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
    const recordId = parseInt(checkbox.dataset.id)
    if (isChecked) {
      selectedItems.add(recordId)
    } else {
      selectedItems.delete(recordId)
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
 */
async function scanOrphans() {
  showLoading(true)

  try {
    const response = await apiRequest('/api/v4/console/system/orphan-frozen/scan', {
      method: 'POST'
    })

    if (response && response.success) {
      showSuccessToast(`扫描完成，发现 ${response.data.found_count || 0} 条孤儿数据`)
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

  document.getElementById('cleanSummaryList').innerHTML = `
    <li>选中数据数量：<strong>${selectedItems.size}</strong> 条</li>
  `
  document.getElementById('cleanReason').value = ''
  document.getElementById('confirmClean').checked = false
  document.getElementById('confirmCleanBtn').disabled = true

  new bootstrap.Modal(document.getElementById('cleanConfirmModal')).show()
}

/**
 * 执行清理
 */
async function executeClean() {
  const reason = document.getElementById('cleanReason').value.trim()
  if (!reason) {
    showErrorToast('请输入清理原因')
    return
  }

  showLoading(true)

  try {
    const response = await apiRequest('/api/v4/console/system/orphan-frozen/clean', {
      method: 'POST',
      body: JSON.stringify({
        record_ids: Array.from(selectedItems),
        reason: reason
      })
    })

    if (response && response.success) {
      showSuccessToast(`成功清理 ${response.data.cleaned_count || selectedItems.size} 条数据`)
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
 */
async function cleanSingle(recordId) {
  if (!confirm('确定要清理这条数据吗？此操作不可恢复。')) {
    return
  }

  showLoading(true)

  try {
    const response = await apiRequest(`/api/v4/console/system/orphan-frozen/${recordId}/clean`, {
      method: 'POST',
      body: JSON.stringify({
        reason: '管理员手动清理'
      })
    })

    if (response && response.success) {
      showSuccessToast('清理成功')
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
 * 恢复记录
 */
async function restoreRecord(recordId) {
  if (!confirm('确定要恢复这条数据吗？')) {
    return
  }

  showLoading(true)

  try {
    const response = await apiRequest(`/api/v4/console/system/orphan-frozen/${recordId}/restore`, {
      method: 'POST'
    })

    if (response && response.success) {
      showSuccessToast('恢复成功')
      loadData()
    } else {
      showErrorToast(response?.message || '恢复失败')
    }
  } catch (error) {
    console.error('恢复失败:', error)
    showErrorToast('恢复失败：' + error.message)
  } finally {
    showLoading(false)
  }
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
  loadData()
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
 * 显示成功提示
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
 */
function showErrorToast(message) {
  if (typeof ToastUtils !== 'undefined') {
    ToastUtils.error(message)
  } else {
    alert('❌ ' + message)
  }
}
