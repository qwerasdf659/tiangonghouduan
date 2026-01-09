/**
 * 素材转换规则管理页面
 * @description 管理素材资产之间的转换规则
 * @created 2026-01-09
 */

// 全局变量
let currentRules = []
let assetTypes = []
let addRuleModalInstance, editRuleModalInstance

/**
 * 页面初始化
 */
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
  addRuleModalInstance = new bootstrap.Modal(document.getElementById('addRuleModal'))
  editRuleModalInstance = new bootstrap.Modal(document.getElementById('editRuleModal'))

  // 加载资产类型和规则
  Promise.all([loadAssetTypes(), loadRules()])

  // 退出登录
  document.getElementById('logoutBtn').addEventListener('click', logout)

  // 提交添加
  document.getElementById('submitAddBtn').addEventListener('click', submitAddRule)

  // 提交编辑
  document.getElementById('submitEditBtn').addEventListener('click', submitEditRule)

  // 表格操作按钮事件委托
  document.getElementById('rulesTableBody').addEventListener('click', function (e) {
    // 编辑按钮
    const editBtn = e.target.closest('.edit-btn')
    if (editBtn) {
      const ruleId = editBtn.dataset.ruleId
      editRule(ruleId)
      return
    }

    // 切换状态按钮
    const toggleBtn = e.target.closest('.toggle-btn')
    if (toggleBtn) {
      const ruleId = toggleBtn.dataset.ruleId
      const currentStatus = toggleBtn.dataset.status === '1'
      toggleRuleStatus(ruleId, currentStatus)
      return
    }
  })
})

/**
 * 加载资产类型
 */
async function loadAssetTypes() {
  try {
    const response = await apiRequest('/api/v4/console/material/asset-types')
    if (response && response.success) {
      // 后端返回格式: { asset_types: [...] }
      assetTypes = response.data?.asset_types || []
      populateAssetSelects()
    }
  } catch (error) {
    console.error('加载资产类型失败:', error)
  }
}

/**
 * 填充资产选择框
 */
function populateAssetSelects() {
  const fromSelect = document.getElementById('fromAssetCode')
  const toSelect = document.getElementById('toAssetCode')

  const options = assetTypes
    .filter(a => a.is_enabled)
    .map(a => `<option value="${a.asset_code}">${a.display_name} (${a.asset_code})</option>`)
    .join('')

  fromSelect.innerHTML = '<option value="">请选择</option>' + options
  toSelect.innerHTML = '<option value="">请选择</option>' + options
}

/**
 * 加载转换规则列表
 */
async function loadRules() {
  const tbody = document.getElementById('rulesTableBody')
  tbody.innerHTML = `
    <tr>
      <td colspan="7" class="text-center py-5">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">加载中...</span>
        </div>
        <p class="mt-2 text-muted">正在加载数据...</p>
      </td>
    </tr>
  `

  try {
    const response = await apiRequest('/api/v4/console/material/conversion-rules')

    if (response && response.success) {
      // 后端返回格式: { rules: [...] }
      currentRules = response.data?.rules || []
      renderRules(currentRules)
      updateStatistics(currentRules)
    } else {
      showErrorToast(response?.message || '加载失败')
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-5 text-danger">
            <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
            <p class="mt-2">加载失败：${response?.message || '未知错误'}</p>
          </td>
        </tr>
      `
    }
  } catch (error) {
    console.error('加载转换规则失败:', error)
    showErrorToast(error.message)
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-5 text-danger">
          <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
          <p class="mt-2">加载失败：${error.message}</p>
        </td>
      </tr>
    `
  }
}

/**
 * 渲染转换规则列表
 */
function renderRules(rules) {
  const tbody = document.getElementById('rulesTableBody')

  if (rules.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-5">
          <i class="bi bi-inbox text-muted" style="font-size: 3rem;"></i>
          <p class="mt-2 text-muted">暂无转换规则，点击右上角添加</p>
        </td>
      </tr>
    `
    return
  }

  tbody.innerHTML = rules
    .map(
      rule => `
    <tr>
      <td><code>#${rule.rule_id}</code></td>
      <td>
        <div class="asset-flow">
          <span class="badge bg-warning">${rule.from_asset_code}</span>
          <i class="bi bi-arrow-right text-primary"></i>
          <span class="badge bg-success">${rule.to_asset_code}</span>
        </div>
      </td>
      <td>
        <strong>${rule.input_quantity}</strong> : <strong>${rule.output_quantity}</strong>
        <br><small class="text-muted">(${(rule.output_quantity / rule.input_quantity).toFixed(4)})</small>
      </td>
      <td>
        <small>${formatDate(rule.effective_at)}</small>
      </td>
      <td>
        <span class="badge ${rule.is_enabled ? 'bg-success' : 'bg-secondary'}">
          ${rule.is_enabled ? '已启用' : '已禁用'}
        </span>
      </td>
      <td>
        ${renderValidationBadges(rule)}
      </td>
      <td>
        <button class="btn btn-sm btn-primary edit-btn" data-rule-id="${rule.rule_id}">
          <i class="bi bi-pencil"></i> 编辑
        </button>
        <button class="btn btn-sm btn-${rule.is_enabled ? 'warning' : 'success'} toggle-btn"
                data-rule-id="${rule.rule_id}"
                data-status="${rule.is_enabled ? 1 : 0}">
          <i class="bi bi-${rule.is_enabled ? 'pause' : 'play'}-circle"></i>
          ${rule.is_enabled ? '禁用' : '启用'}
        </button>
      </td>
    </tr>
  `
    )
    .join('')
}

/**
 * 渲染风控校验徽章
 */
function renderValidationBadges(rule) {
  const badges = []

  if (rule.cycle_detected) {
    badges.push(
      '<span class="badge bg-danger" title="检测到循环转换"><i class="bi bi-exclamation-triangle"></i> 循环</span>'
    )
  }

  if (rule.arbitrage_detected) {
    badges.push(
      '<span class="badge bg-warning" title="检测到套利风险"><i class="bi bi-shield-exclamation"></i> 套利</span>'
    )
  }

  if (badges.length === 0) {
    badges.push('<span class="badge bg-success"><i class="bi bi-check-circle"></i> 正常</span>')
  }

  return badges.join(' ')
}

/**
 * 更新统计信息
 */
function updateStatistics(rules) {
  const total = rules.length
  const enabled = rules.filter(r => r.is_enabled).length
  const disabled = total - enabled
  const paths = new Set(rules.map(r => `${r.from_asset_code}-${r.to_asset_code}`)).size

  document.getElementById('totalRules').textContent = total
  document.getElementById('enabledRules').textContent = enabled
  document.getElementById('disabledRules').textContent = disabled
  document.getElementById('totalPaths').textContent = paths
}

/**
 * 提交添加转换规则
 */
async function submitAddRule() {
  const form = document.getElementById('addRuleForm')
  if (!form.checkValidity()) {
    form.reportValidity()
    return
  }

  const data = {
    from_asset_code: document.getElementById('fromAssetCode').value,
    to_asset_code: document.getElementById('toAssetCode').value,
    input_quantity: parseInt(document.getElementById('inputQuantity').value),
    output_quantity: parseInt(document.getElementById('outputQuantity').value),
    effective_at: document.getElementById('effectiveAt').value,
    is_enabled: parseInt(document.getElementById('isEnabled').value)
  }

  try {
    const submitBtn = document.getElementById('submitAddBtn')
    submitBtn.disabled = true
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>提交中...'

    const response = await apiRequest('/api/v4/console/material/conversion-rules', {
      method: 'POST',
      body: JSON.stringify(data)
    })

    if (response && response.success) {
      showSuccessToast('添加成功')
      addRuleModalInstance.hide()
      form.reset()
      loadRules()
    } else {
      showErrorToast(response?.message || '添加失败')
      // 显示风控警告
      if (response?.validation) {
        displayValidationWarnings('validationWarnings', response.validation)
      }
    }
  } catch (error) {
    console.error('添加转换规则失败:', error)
    showErrorToast(error.message)
  } finally {
    const submitBtn = document.getElementById('submitAddBtn')
    submitBtn.disabled = false
    submitBtn.innerHTML = '<i class="bi bi-check-lg"></i> 确认添加'
  }
}

/**
 * 编辑转换规则
 */
function editRule(ruleId) {
  const rule = currentRules.find(r => r.rule_id === parseInt(ruleId))
  if (!rule) return

  document.getElementById('editRuleId').value = rule.rule_id
  document.getElementById('editDirection').value = `${rule.from_asset_code} → ${rule.to_asset_code}`
  document.getElementById('editInputQuantity').value = rule.input_quantity
  document.getElementById('editOutputQuantity').value = rule.output_quantity
  document.getElementById('editEffectiveAt').value = formatDateTimeLocal(rule.effective_at)
  document.getElementById('editIsEnabled').value = rule.is_enabled ? '1' : '0'

  editRuleModalInstance.show()
}

/**
 * 提交编辑转换规则
 */
async function submitEditRule() {
  const form = document.getElementById('editRuleForm')
  if (!form.checkValidity()) {
    form.reportValidity()
    return
  }

  const ruleId = document.getElementById('editRuleId').value
  const data = {
    input_quantity: parseInt(document.getElementById('editInputQuantity').value),
    output_quantity: parseInt(document.getElementById('editOutputQuantity').value),
    effective_at: document.getElementById('editEffectiveAt').value,
    is_enabled: parseInt(document.getElementById('editIsEnabled').value)
  }

  try {
    const submitBtn = document.getElementById('submitEditBtn')
    submitBtn.disabled = true
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>保存中...'

    const response = await apiRequest(`/api/v4/console/material/conversion-rules/${ruleId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })

    if (response && response.success) {
      showSuccessToast('更新成功')
      editRuleModalInstance.hide()
      loadRules()
    } else {
      showErrorToast(response?.message || '更新失败')
      if (response?.validation) {
        displayValidationWarnings('editValidationWarnings', response.validation)
      }
    }
  } catch (error) {
    console.error('更新转换规则失败:', error)
    showErrorToast(error.message)
  } finally {
    const submitBtn = document.getElementById('submitEditBtn')
    submitBtn.disabled = false
    submitBtn.innerHTML = '<i class="bi bi-check-lg"></i> 保存更新'
  }
}

/**
 * 切换规则状态
 */
async function toggleRuleStatus(ruleId, currentStatus) {
  const newStatus = currentStatus ? 0 : 1
  const action = newStatus ? '启用' : '禁用'

  if (!confirm(`确定要${action}该转换规则吗？`)) {
    return
  }

  try {
    const response = await apiRequest(`/api/v4/console/material/conversion-rules/${ruleId}`, {
      method: 'PUT',
      body: JSON.stringify({ is_enabled: newStatus })
    })

    if (response && response.success) {
      showSuccessToast(`${action}成功`)
      loadRules()
    } else {
      showErrorToast(response?.message || `${action}失败`)
    }
  } catch (error) {
    console.error(`${action}转换规则失败:`, error)
    showErrorToast(error.message)
  }
}

/**
 * 显示风控校验警告
 */
function displayValidationWarnings(containerId, validation) {
  const container = document.getElementById(containerId)
  const warnings = []

  if (validation.cycle_detected) {
    warnings.push(
      '<div class="validation-warning mb-2"><i class="bi bi-exclamation-triangle text-warning"></i> <strong>循环检测：</strong>检测到循环转换路径，可能导致无限套利</div>'
    )
  }

  if (validation.arbitrage_detected) {
    warnings.push(
      '<div class="validation-warning"><i class="bi bi-shield-exclamation text-warning"></i> <strong>套利检测：</strong>检测到套利风险，建议调整转换比例</div>'
    )
  }

  container.innerHTML = warnings.join('')
}

/**
 * 格式化日期时间为本地输入格式
 */
function formatDateTimeLocal(dateString) {
  const date = new Date(dateString)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
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
