/**
 * 材料资产类型管理页面
 * @description 配置系统中的材料类型（碎片/水晶）
 * @author Admin
 * @created 2026-01-09
 */

// ============================================
// 全局变量
// ============================================

let currentAssetTypes = []
let addAssetTypeModalInstance, editAssetTypeModalInstance
let successToastInstance, errorToastInstance

// ============================================
// 页面初始化
// ============================================

document.addEventListener('DOMContentLoaded', function () {
  // 权限检查
  if (!checkAdminPermission()) {
    return
  }

  // 显示用户信息
  const user = getCurrentUser()
  if (user) {
    document.getElementById('welcomeText').textContent = `欢迎，${user.nickname || user.mobile}`
  }

  // 初始化模态框
  addAssetTypeModalInstance = new bootstrap.Modal(document.getElementById('addAssetTypeModal'))
  editAssetTypeModalInstance = new bootstrap.Modal(document.getElementById('editAssetTypeModal'))

  // 初始化Toast
  successToastInstance = new bootstrap.Toast(document.getElementById('successToast'))
  errorToastInstance = new bootstrap.Toast(document.getElementById('errorToast'))

  // 加载数据
  loadAssetTypes()

  // 退出登录
  document.getElementById('logoutBtn').addEventListener('click', logout)

  // 提交添加
  document.getElementById('submitAddBtn').addEventListener('click', submitAddAssetType)

  // 提交编辑
  document.getElementById('submitEditBtn').addEventListener('click', submitEditAssetType)

  // 表格操作按钮事件委托
  document.getElementById('assetTypesTableBody').addEventListener('click', function (e) {
    // 编辑按钮
    const editBtn = e.target.closest('.edit-btn')
    if (editBtn) {
      const assetCode = editBtn.dataset.assetCode
      editAssetType(assetCode)
      return
    }

    // 切换状态按钮
    const toggleBtn = e.target.closest('.toggle-btn')
    if (toggleBtn) {
      const assetCode = toggleBtn.dataset.assetCode
      const currentStatus = toggleBtn.dataset.status === '1'
      toggleAssetTypeStatus(assetCode, currentStatus)
      return
    }
  })
})

// ============================================
// 资产类型列表
// ============================================

/**
 * 加载资产类型列表
 */
async function loadAssetTypes() {
  const tbody = document.getElementById('assetTypesTableBody')
  tbody.innerHTML = `
    <tr>
      <td colspan="10" class="text-center py-5">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">加载中...</span>
        </div>
        <p class="mt-2 text-muted">正在加载数据...</p>
      </td>
    </tr>
  `

  try {
    const response = await apiRequest(API_ENDPOINTS.MATERIAL.ASSET_TYPES)

    if (response && response.success) {
      // 后端返回格式: { asset_types: [...] }
      currentAssetTypes = response.data?.asset_types || []
      renderAssetTypes(currentAssetTypes)
      updateStatistics(currentAssetTypes)
    } else {
      showErrorToast(response?.message || '加载失败')
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center py-5 text-danger">
            <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
            <p class="mt-2">加载失败：${response?.message || '未知错误'}</p>
          </td>
        </tr>
      `
    }
  } catch (error) {
    console.error('加载资产类型失败:', error)
    showErrorToast(error.message)
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-5 text-danger">
          <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
          <p class="mt-2">加载失败：${error.message}</p>
        </td>
      </tr>
    `
  }
}

/**
 * 渲染资产类型列表
 */
function renderAssetTypes(assetTypes) {
  const tbody = document.getElementById('assetTypesTableBody')

  if (assetTypes.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-5">
          <i class="bi bi-inbox text-muted" style="font-size: 3rem;"></i>
          <p class="mt-2 text-muted">暂无资产类型，点击右上角添加</p>
        </td>
      </tr>
    `
    return
  }

  tbody.innerHTML = assetTypes
    .map(
      asset => `
    <tr>
      <td><code>${asset.asset_code}</code></td>
      <td><strong>${asset.display_name}</strong></td>
      <td><span class="badge bg-info">${asset.group_code}</span></td>
      <td><span class="badge ${asset.form === 'shard' ? 'bg-warning' : 'bg-primary'}">${getFormLabel(asset.form)}</span></td>
      <td><span class="badge bg-secondary">Tier ${asset.tier}</span></td>
      <td class="text-primary fw-bold">${asset.visible_value_points}</td>
      <td class="text-success fw-bold">${asset.budget_value_points}</td>
      <td>${asset.sort_order}</td>
      <td>
        <span class="badge ${asset.is_enabled ? 'bg-success' : 'bg-secondary'}">
          ${asset.is_enabled ? '已启用' : '已禁用'}
        </span>
      </td>
      <td>
        <button class="btn btn-sm btn-primary edit-btn" data-asset-code="${asset.asset_code}">
          <i class="bi bi-pencil"></i> 编辑
        </button>
        <button class="btn btn-sm btn-${asset.is_enabled ? 'warning' : 'success'} toggle-btn"
                data-asset-code="${asset.asset_code}"
                data-status="${asset.is_enabled ? 1 : 0}">
          <i class="bi bi-${asset.is_enabled ? 'pause' : 'play'}-circle"></i>
          ${asset.is_enabled ? '禁用' : '启用'}
        </button>
      </td>
    </tr>
  `
    )
    .join('')
}

/**
 * 更新统计信息
 */
function updateStatistics(assetTypes) {
  const total = assetTypes.length
  const enabled = assetTypes.filter(a => a.is_enabled).length
  const disabled = total - enabled
  const groups = new Set(assetTypes.map(a => a.group_code)).size

  document.getElementById('totalAssets').textContent = total
  document.getElementById('enabledAssets').textContent = enabled
  document.getElementById('disabledAssets').textContent = disabled
  document.getElementById('totalGroups').textContent = groups
}

// ============================================
// 添加资产类型
// ============================================

/**
 * 提交添加资产类型
 */
async function submitAddAssetType() {
  const form = document.getElementById('addAssetTypeForm')
  if (!form.checkValidity()) {
    form.reportValidity()
    return
  }

  const data = {
    asset_code: document.getElementById('assetCode').value.trim(),
    display_name: document.getElementById('displayName').value.trim(),
    group_code: document.getElementById('groupCode').value.trim(),
    form: document.getElementById('form').value,
    tier: parseInt(document.getElementById('tier').value),
    visible_value_points: parseInt(document.getElementById('visibleValue').value),
    budget_value_points: parseInt(document.getElementById('budgetValue').value),
    sort_order: parseInt(document.getElementById('sortOrder').value || 0),
    is_enabled: parseInt(document.getElementById('isEnabled').value)
  }

  try {
    const submitBtn = document.getElementById('submitAddBtn')
    submitBtn.disabled = true
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>提交中...'

    const response = await apiRequest(API_ENDPOINTS.MATERIAL.ASSET_TYPES, {
      method: 'POST',
      body: JSON.stringify(data)
    })

    if (response && response.success) {
      showSuccessToast('添加成功')
      addAssetTypeModalInstance.hide()
      form.reset()
      loadAssetTypes()
    } else {
      showErrorToast(response?.message || '添加失败')
    }
  } catch (error) {
    console.error('添加资产类型失败:', error)
    showErrorToast(error.message)
  } finally {
    const submitBtn = document.getElementById('submitAddBtn')
    submitBtn.disabled = false
    submitBtn.innerHTML = '<i class="bi bi-check-lg"></i> 确认添加'
  }
}

// ============================================
// 编辑资产类型
// ============================================

/**
 * 编辑资产类型
 */
function editAssetType(assetCode) {
  const asset = currentAssetTypes.find(a => a.asset_code === assetCode)
  if (!asset) return

  document.getElementById('editAssetCode').value = asset.asset_code
  document.getElementById('editAssetCodeDisplay').value = asset.asset_code
  document.getElementById('editDisplayName').value = asset.display_name
  document.getElementById('editGroupCode').value = asset.group_code
  document.getElementById('editForm').value = getFormLabel(asset.form)
  document.getElementById('editTier').value = asset.tier
  document.getElementById('editSortOrder').value = asset.sort_order
  document.getElementById('editVisibleValue').value = asset.visible_value_points
  document.getElementById('editBudgetValue').value = asset.budget_value_points
  document.getElementById('editIsEnabled').value = asset.is_enabled ? '1' : '0'

  editAssetTypeModalInstance.show()
}

/**
 * 提交编辑资产类型
 */
async function submitEditAssetType() {
  const form = document.getElementById('editAssetTypeForm')
  if (!form.checkValidity()) {
    form.reportValidity()
    return
  }

  const assetCode = document.getElementById('editAssetCode').value
  const data = {
    display_name: document.getElementById('editDisplayName').value.trim(),
    visible_value_points: parseInt(document.getElementById('editVisibleValue').value),
    budget_value_points: parseInt(document.getElementById('editBudgetValue').value),
    sort_order: parseInt(document.getElementById('editSortOrder').value || 0),
    is_enabled: parseInt(document.getElementById('editIsEnabled').value)
  }

  try {
    const submitBtn = document.getElementById('submitEditBtn')
    submitBtn.disabled = true
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>保存中...'

    const response = await apiRequest(API.buildURL(API_ENDPOINTS.MATERIAL.ASSET_TYPE_DETAIL, { asset_code: assetCode }), {
      method: 'PUT',
      body: JSON.stringify(data)
    })

    if (response && response.success) {
      showSuccessToast('更新成功')
      editAssetTypeModalInstance.hide()
      loadAssetTypes()
    } else {
      showErrorToast(response?.message || '更新失败')
    }
  } catch (error) {
    console.error('更新资产类型失败:', error)
    showErrorToast(error.message)
  } finally {
    const submitBtn = document.getElementById('submitEditBtn')
    submitBtn.disabled = false
    submitBtn.innerHTML = '<i class="bi bi-check-lg"></i> 保存更新'
  }
}

/**
 * 切换资产类型状态
 */
async function toggleAssetTypeStatus(assetCode, currentStatus) {
  const newStatus = currentStatus ? 0 : 1
  const action = newStatus ? '启用' : '禁用'

  if (!confirm(`确定要${action}该资产类型吗？`)) {
    return
  }

  try {
    const response = await apiRequest(API.buildURL(API_ENDPOINTS.MATERIAL.ASSET_TYPE_DETAIL, { asset_code: assetCode }), {
      method: 'PUT',
      body: JSON.stringify({ is_enabled: newStatus })
    })

    if (response && response.success) {
      showSuccessToast(`${action}成功`)
      loadAssetTypes()
    } else {
      showErrorToast(response?.message || `${action}失败`)
    }
  } catch (error) {
    console.error(`${action}资产类型失败:`, error)
    showErrorToast(error.message)
  }
}

// ============================================
// 辅助函数
// ============================================

/**
 * 获取形态标签
 */
function getFormLabel(form) {
  const labels = {
    shard: '碎片',
    crystal: '水晶'
  }
  return labels[form] || form
}

/**
 * 显示成功提示
 */
function showSuccessToast(message) {
  document.getElementById('successToastBody').textContent = message
  successToastInstance.show()
}

/**
 * 显示错误提示
 */
function showErrorToast(message) {
  document.getElementById('errorToastBody').textContent = message
  errorToastInstance.show()
}
