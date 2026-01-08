/**
 * 配置工具页面
 * @description 系统配置管理和运维工具
 * @author Admin
 * @created 2026-01-09
 */

// ============================================
// 全局变量
// ============================================

let currentConfigKey = null
let configData = []

// ============================================
// 页面初始化
// ============================================

document.addEventListener('DOMContentLoaded', function () {
  // 显示用户信息
  const userInfo = getCurrentUser()
  if (userInfo && userInfo.nickname) {
    document.getElementById('welcomeText').textContent = `欢迎，${userInfo.nickname}`
  }

  // 事件监听器
  document.getElementById('logoutBtn').addEventListener('click', logout)
  document.getElementById('maintenanceSwitch').addEventListener('change', function () {
    document.getElementById('maintenanceLabel').textContent = this.checked ? '开启' : '关闭'
  })

  // Token和权限验证
  if (!getToken() || !checkAdminPermission()) {
    return
  }

  // 加载配置列表
  loadConfigList()
})

// ============================================
// 配置列表管理
// ============================================

/**
 * 加载配置列表
 */
async function loadConfigList() {
  const listContainer = document.getElementById('configList')

  try {
    const response = await apiRequest('/api/v4/console/system/config')

    if (response && response.success) {
      configData = response.data || []

      if (configData.length === 0) {
        listContainer.innerHTML = `
          <div class="text-center py-4 text-muted">
            <i class="bi bi-inbox"></i>
            <p class="mt-2 mb-0">暂无配置项</p>
          </div>
        `
        return
      }

      listContainer.innerHTML = configData
        .map(
          config => `
        <a href="javascript:void(0)" class="list-group-item list-group-item-action" 
           onclick="showConfigDetail('${config.config_key}')">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <h6 class="mb-1">${config.config_key}</h6>
              <small class="text-muted">${config.description || '无描述'}</small>
            </div>
            <span class="badge bg-secondary">${config.config_type || 'string'}</span>
          </div>
        </a>
      `
        )
        .join('')
    }
  } catch (error) {
    console.error('加载配置列表失败:', error)
    listContainer.innerHTML = `
      <div class="text-center py-4 text-danger">
        <i class="bi bi-exclamation-triangle"></i>
        <p class="mt-2 mb-0">加载失败</p>
      </div>
    `
  }
}

/**
 * 显示配置详情
 */
function showConfigDetail(configKey) {
  currentConfigKey = configKey
  const config = configData.find(c => c.config_key === configKey)

  if (!config) {
    showErrorToast('配置项不存在')
    return
  }

  document.getElementById('detailTitle').innerHTML =
    `<i class="bi bi-pencil"></i> 编辑配置：${configKey}`

  document.getElementById('configDetail').innerHTML = `
    <form id="editConfigForm">
      <div class="mb-3">
        <label class="form-label">配置键名</label>
        <input type="text" class="form-control" value="${config.config_key}" readonly>
      </div>
      <div class="mb-3">
        <label class="form-label">配置值 <span class="text-danger">*</span></label>
        <textarea class="form-control json-editor" id="editConfigValue" rows="6">${formatConfigValue(config.config_value)}</textarea>
      </div>
      <div class="mb-3">
        <label class="form-label">配置说明</label>
        <input type="text" class="form-control" id="editConfigDescription" value="${config.description || ''}">
      </div>
      <div class="mb-3">
        <label class="form-label">配置类型</label>
        <select class="form-select" id="editConfigType">
          <option value="string" ${config.config_type === 'string' ? 'selected' : ''}>字符串</option>
          <option value="number" ${config.config_type === 'number' ? 'selected' : ''}>数字</option>
          <option value="boolean" ${config.config_type === 'boolean' ? 'selected' : ''}>布尔值</option>
          <option value="json" ${config.config_type === 'json' ? 'selected' : ''}>JSON对象</option>
        </select>
      </div>
      <div class="d-flex gap-2">
        <button type="button" class="btn btn-primary" onclick="saveConfig()">
          <i class="bi bi-save"></i> 保存配置
        </button>
        <button type="button" class="btn btn-outline-danger" onclick="deleteConfig()">
          <i class="bi bi-trash"></i> 删除配置
        </button>
      </div>
    </form>
  `
}

/**
 * 格式化配置值显示
 */
function formatConfigValue(value) {
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2)
  }
  return String(value)
}

/**
 * 保存配置
 */
async function saveConfig() {
  if (!currentConfigKey) return

  const configValue = document.getElementById('editConfigValue').value
  const description = document.getElementById('editConfigDescription').value
  const configType = document.getElementById('editConfigType').value

  showLoading(true)

  try {
    const response = await apiRequest(`/api/v4/console/system/config/${currentConfigKey}`, {
      method: 'PUT',
      body: JSON.stringify({
        config_value: configValue,
        description: description,
        config_type: configType
      })
    })

    if (response && response.success) {
      showSuccessToast('配置保存成功')
      loadConfigList()
    } else {
      throw new Error(response?.message || '保存失败')
    }
  } catch (error) {
    console.error('保存配置失败:', error)
    showErrorToast('保存失败：' + error.message)
  } finally {
    showLoading(false)
  }
}

/**
 * 删除配置
 */
async function deleteConfig() {
  if (!currentConfigKey) return

  if (!confirm(`确定要删除配置项 "${currentConfigKey}" 吗？此操作不可恢复！`)) {
    return
  }

  showLoading(true)

  try {
    const response = await apiRequest(`/api/v4/console/system/config/${currentConfigKey}`, {
      method: 'DELETE'
    })

    if (response && response.success) {
      showSuccessToast('配置删除成功')
      currentConfigKey = null
      document.getElementById('configDetail').innerHTML = `
        <div class="text-center py-5 text-muted">
          <i class="bi bi-hand-index" style="font-size: 3rem;"></i>
          <p class="mt-3">请从左侧选择一个配置项</p>
        </div>
      `
      loadConfigList()
    } else {
      throw new Error(response?.message || '删除失败')
    }
  } catch (error) {
    console.error('删除配置失败:', error)
    showErrorToast('删除失败：' + error.message)
  } finally {
    showLoading(false)
  }
}

// ============================================
// 新增配置
// ============================================

/**
 * 显示新增配置模态框
 */
function showAddConfig() {
  document.getElementById('addConfigForm').reset()
  new bootstrap.Modal(document.getElementById('addConfigModal')).show()
}

/**
 * 添加配置
 */
async function addConfig() {
  const configKey = document.getElementById('newConfigKey').value.trim()
  const configValue = document.getElementById('newConfigValue').value
  const description = document.getElementById('newConfigDescription').value
  const configType = document.getElementById('newConfigType').value

  if (!configKey) {
    showErrorToast('请输入配置键名')
    return
  }

  showLoading(true)

  try {
    const response = await apiRequest('/api/v4/console/system/config', {
      method: 'POST',
      body: JSON.stringify({
        config_key: configKey,
        config_value: configValue,
        description: description,
        config_type: configType
      })
    })

    if (response && response.success) {
      showSuccessToast('配置添加成功')
      bootstrap.Modal.getInstance(document.getElementById('addConfigModal')).hide()
      loadConfigList()
    } else {
      throw new Error(response?.message || '添加失败')
    }
  } catch (error) {
    console.error('添加配置失败:', error)
    showErrorToast('添加失败：' + error.message)
  } finally {
    showLoading(false)
  }
}

// ============================================
// 缓存管理
// ============================================

/**
 * 显示缓存管理
 */
function showCacheManagement() {
  new bootstrap.Modal(document.getElementById('cacheModal')).show()
}

/**
 * 清理缓存
 */
async function clearCache(type) {
  if (!confirm(`确定要清理 ${type === 'all' ? '全部' : type} 缓存吗？`)) {
    return
  }

  showLoading(true)

  try {
    const response = await apiRequest('/api/v4/console/system/cache/clear', {
      method: 'POST',
      body: JSON.stringify({ cache_type: type })
    })

    if (response && response.success) {
      showSuccessToast('缓存清理成功')
    } else {
      throw new Error(response?.message || '清理失败')
    }
  } catch (error) {
    console.error('清理缓存失败:', error)
    showErrorToast('清理失败：' + error.message)
  } finally {
    showLoading(false)
  }
}

// ============================================
// 系统配置跳转
// ============================================

/**
 * 显示系统配置
 */
function showSystemConfig() {
  window.location.href = '/admin/system-config.html'
}

// ============================================
// 功能开关
// ============================================

/**
 * 显示功能开关
 */
async function showFeatureFlags() {
  const modal = new bootstrap.Modal(document.getElementById('featureFlagsModal'))
  modal.show()

  const content = document.getElementById('featureFlagsContent')

  try {
    const response = await apiRequest('/api/v4/console/system/feature-flags')

    if (response && response.success) {
      const flags = response.data || []

      if (flags.length === 0) {
        content.innerHTML = `
          <div class="text-center py-4 text-muted">
            <i class="bi bi-inbox"></i>
            <p class="mt-2">暂无功能开关配置</p>
          </div>
        `
        return
      }

      content.innerHTML = `
        <table class="table">
          <thead>
            <tr>
              <th>功能名称</th>
              <th>说明</th>
              <th style="width: 100px;">状态</th>
            </tr>
          </thead>
          <tbody>
            ${flags
              .map(
                flag => `
              <tr>
                <td><code>${flag.flag_key}</code></td>
                <td>${flag.description || '-'}</td>
                <td>
                  <div class="form-check form-switch">
                    <input class="form-check-input feature-flag" type="checkbox" 
                      data-key="${flag.flag_key}" ${flag.enabled ? 'checked' : ''}>
                  </div>
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `
    }
  } catch (error) {
    console.error('加载功能开关失败:', error)
    content.innerHTML = `
      <div class="text-center py-4 text-danger">
        <i class="bi bi-exclamation-triangle"></i>
        <p class="mt-2">加载失败</p>
      </div>
    `
  }
}

/**
 * 保存功能开关
 */
async function saveFeatureFlags() {
  const flags = []
  document.querySelectorAll('.feature-flag').forEach(checkbox => {
    flags.push({
      flag_key: checkbox.dataset.key,
      enabled: checkbox.checked
    })
  })

  showLoading(true)

  try {
    const response = await apiRequest('/api/v4/console/system/feature-flags', {
      method: 'PUT',
      body: JSON.stringify({ flags })
    })

    if (response && response.success) {
      showSuccessToast('功能开关保存成功')
      bootstrap.Modal.getInstance(document.getElementById('featureFlagsModal')).hide()
    } else {
      throw new Error(response?.message || '保存失败')
    }
  } catch (error) {
    console.error('保存功能开关失败:', error)
    showErrorToast('保存失败：' + error.message)
  } finally {
    showLoading(false)
  }
}

// ============================================
// 维护模式
// ============================================

/**
 * 显示维护模式
 */
async function showMaintenanceMode() {
  const modal = new bootstrap.Modal(document.getElementById('maintenanceModal'))
  modal.show()

  try {
    const response = await apiRequest('/api/v4/console/system/maintenance')

    if (response && response.success) {
      const maintenance = response.data || {}
      document.getElementById('maintenanceSwitch').checked = maintenance.enabled || false
      document.getElementById('maintenanceLabel').textContent = maintenance.enabled
        ? '开启'
        : '关闭'
      document.getElementById('maintenanceMessage').value = maintenance.message || ''

      if (maintenance.end_time) {
        document.getElementById('maintenanceEndTime').value = maintenance.end_time.slice(0, 16)
      }
    }
  } catch (error) {
    console.error('加载维护模式配置失败:', error)
  }
}

/**
 * 保存维护模式
 */
async function saveMaintenanceMode() {
  const enabled = document.getElementById('maintenanceSwitch').checked
  const message = document.getElementById('maintenanceMessage').value
  const endTime = document.getElementById('maintenanceEndTime').value

  showLoading(true)

  try {
    const response = await apiRequest('/api/v4/console/system/maintenance', {
      method: 'PUT',
      body: JSON.stringify({
        enabled: enabled,
        message: message,
        end_time: endTime ? new Date(endTime).toISOString() : null
      })
    })

    if (response && response.success) {
      showSuccessToast('维护模式设置成功')
      bootstrap.Modal.getInstance(document.getElementById('maintenanceModal')).hide()
    } else {
      throw new Error(response?.message || '保存失败')
    }
  } catch (error) {
    console.error('保存维护模式失败:', error)
    showErrorToast('保存失败：' + error.message)
  } finally {
    showLoading(false)
  }
}

// ============================================
// 工具函数
// ============================================

/**
 * 显示/隐藏加载状态
 */
function showLoading(show) {
  document.getElementById('loadingOverlay').classList.toggle('show', show)
}
