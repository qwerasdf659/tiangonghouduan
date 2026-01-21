/**
 * 配置工具页面
 * @description 系统配置管理和运维工具
 * @author Admin
 * @created 2026-01-09
 * @updated 2026-01-09 修改API路径适配后端接口，移除内联事件处理器
 *
 * 后端API路径（以后端为准）：
 * - GET /api/v4/console/settings - 获取所有设置概览
 * - GET /api/v4/console/settings/:category - 获取分类设置
 * - PUT /api/v4/console/settings/:category - 更新分类设置
 * - POST /api/v4/console/cache/clear - 清除缓存
 */

// ============================================
// 全局变量
// ============================================

let currentSettingKey = null
let currentCategory = null
let settingsData = {} // 按分类存储设置数据

// ============================================
// 页面初始化
// ============================================

document.addEventListener('DOMContentLoaded', function () {
  // 显示用户信息
  const userInfo = getCurrentUser()
  if (userInfo && userInfo.nickname) {
    document.getElementById('welcomeText').textContent = `欢迎，${userInfo.nickname}`
  }

  // 绑定事件监听器（避免内联事件处理器，符合CSP策略）
  bindEventListeners()

  // Token和权限验证
  if (!getToken() || !checkAdminPermission()) {
    return
  }

  // 加载配置列表
  loadConfigList()
})

/**
 * 绑定所有事件监听器
 */
function bindEventListeners() {
  // 退出登录
  document.getElementById('logoutBtn').addEventListener('click', logout)

  // 维护模式开关
  document.getElementById('maintenanceSwitch').addEventListener('change', function () {
    document.getElementById('maintenanceLabel').textContent = this.checked ? '开启' : '关闭'
  })

  // 快捷工具卡片
  document.getElementById('toolCacheManagement').addEventListener('click', showCacheManagement)
  document.getElementById('toolSystemConfig').addEventListener('click', showSystemConfig)
  document.getElementById('toolFeatureFlags').addEventListener('click', showFeatureFlags)
  document.getElementById('toolMaintenanceMode').addEventListener('click', showMaintenanceMode)

  // 新增配置按钮
  document.getElementById('btnAddConfig').addEventListener('click', showAddConfig)
  document.getElementById('btnAddConfigSubmit').addEventListener('click', addConfig)

  // 功能开关保存按钮
  document.getElementById('btnSaveFeatureFlags').addEventListener('click', saveFeatureFlags)

  // 维护模式保存按钮
  document.getElementById('btnSaveMaintenanceMode').addEventListener('click', saveMaintenanceMode)

  // 缓存清理按钮（使用事件委托）
  document.querySelectorAll('.btn-clear-cache').forEach(btn => {
    btn.addEventListener('click', function () {
      const cacheType = this.dataset.cacheType
      clearCache(cacheType)
    })
  })
}

// ============================================
// 配置列表管理
// ============================================

/**
 * 加载配置列表 - 获取所有分类的设置
 * 使用后端API: GET /api/v4/console/settings
 */
async function loadConfigList() {
  const listContainer = document.getElementById('configList')

  try {
    // 使用API_ENDPOINTS集中管理
    const response = await apiRequest(API_ENDPOINTS.SETTINGS.LIST)

    if (response && response.success) {
      const summary = response.data || {}
      const categories = summary.categories || {}

      if (Object.keys(categories).length === 0) {
        listContainer.innerHTML = `
          <div class="text-center py-4 text-muted">
            <i class="bi bi-inbox"></i>
            <p class="mt-2 mb-0">暂无配置项</p>
          </div>
        `
        return
      }

      // 构建分类列表，展示每个分类及其配置数量
      const categoryDisplayNames = {
        basic: { name: '基础设置', icon: 'bi-gear', color: 'primary' },
        points: { name: '积分设置', icon: 'bi-coin', color: 'warning' },
        notification: { name: '通知设置', icon: 'bi-bell', color: 'info' },
        security: { name: '安全设置', icon: 'bi-shield-lock', color: 'danger' },
        marketplace: { name: '市场设置', icon: 'bi-shop', color: 'success' }
      }

      listContainer.innerHTML = Object.entries(categories)
        .map(([category, count]) => {
          const display = categoryDisplayNames[category] || {
            name: category,
            icon: 'bi-folder',
            color: 'secondary'
          }
          return `
            <a href="javascript:void(0)" class="list-group-item list-group-item-action category-item" 
               data-category="${category}">
              <div class="d-flex justify-content-between align-items-center">
                <div>
                  <i class="bi ${display.icon} text-${display.color} me-2"></i>
                  <strong>${display.name}</strong>
                </div>
                <span class="badge bg-${display.color}">${count}项</span>
              </div>
            </a>
          `
        })
        .join('')

      // 绑定分类点击事件
      document.querySelectorAll('.category-item').forEach(item => {
        item.addEventListener('click', function () {
          const category = this.dataset.category
          loadCategorySettings(category)
        })
      })
    } else {
      throw new Error(response?.message || '获取设置失败')
    }
  } catch (error) {
    console.error('加载配置列表失败:', error)
    listContainer.innerHTML = `
      <div class="text-center py-4 text-danger">
        <i class="bi bi-exclamation-triangle"></i>
        <p class="mt-2 mb-0">加载失败: ${error.message}</p>
      </div>
    `
  }
}

/**
 * 加载指定分类的设置
 * 使用后端API: GET /api/v4/console/settings/:category
 */
async function loadCategorySettings(category) {
  currentCategory = category
  const detailContainer = document.getElementById('configDetail')
  const detailTitle = document.getElementById('detailTitle')

  const categoryNames = {
    basic: '基础设置',
    points: '积分设置',
    notification: '通知设置',
    security: '安全设置',
    marketplace: '市场设置'
  }

  detailTitle.innerHTML = `<i class="bi bi-list-check"></i> ${categoryNames[category] || category} 配置列表`
  detailContainer.innerHTML = `
    <div class="text-center py-4">
      <div class="spinner-border" role="status"></div>
      <p class="mt-2">加载中...</p>
    </div>
  `

  try {
    const response = await apiRequest(API.buildURL(API_ENDPOINTS.SETTINGS.CATEGORY, { category }))

    if (response && response.success) {
      const data = response.data || {}
      settingsData[category] = data.settings || []

      if (settingsData[category].length === 0) {
        detailContainer.innerHTML = `
          <div class="text-center py-5 text-muted">
            <i class="bi bi-inbox" style="font-size: 3rem;"></i>
            <p class="mt-3">该分类下暂无配置项</p>
          </div>
        `
        return
      }

      // 渲染配置项列表
      renderSettingsList(category, settingsData[category])
    } else {
      throw new Error(response?.message || '获取配置失败')
    }
  } catch (error) {
    console.error('加载分类配置失败:', error)
    detailContainer.innerHTML = `
      <div class="text-center py-4 text-danger">
        <i class="bi bi-exclamation-triangle"></i>
        <p class="mt-2">加载失败: ${error.message}</p>
      </div>
    `
  }
}

/**
 * 渲染配置项列表
 */
function renderSettingsList(category, settings) {
  const detailContainer = document.getElementById('configDetail')

  let html = `
    <form id="settingsForm">
      <div class="table-responsive">
        <table class="table table-hover">
          <thead class="table-light">
            <tr>
              <th style="width: 30%;">配置键</th>
              <th style="width: 35%;">配置值</th>
              <th style="width: 20%;">说明</th>
              <th style="width: 15%;">状态</th>
            </tr>
          </thead>
          <tbody>
  `

  settings.forEach(setting => {
    const isReadonly = setting.is_readonly
    const valueType = setting.value_type || 'string'

    html += `
      <tr>
        <td>
          <code class="text-primary">${setting.setting_key}</code>
          <br><small class="text-muted">${valueType}</small>
        </td>
        <td>
          ${
            isReadonly
              ? `<span class="config-value">${formatSettingValue(setting.parsed_value || setting.setting_value)}</span>`
              : renderSettingInput(setting)
          }
        </td>
        <td><small class="text-muted">${setting.description || '-'}</small></td>
        <td>
          ${
            isReadonly
              ? '<span class="badge bg-secondary">只读</span>'
              : '<span class="badge bg-success">可编辑</span>'
          }
        </td>
      </tr>
    `
  })

  html += `
          </tbody>
        </table>
      </div>
      <div class="mt-3 d-flex justify-content-end">
        <button type="button" class="btn btn-primary" id="btnSaveSettings">
          <i class="bi bi-save me-1"></i>保存更改
        </button>
      </div>
    </form>
  `

  detailContainer.innerHTML = html

  // 绑定保存按钮事件
  document.getElementById('btnSaveSettings').addEventListener('click', function () {
    saveSettings(category)
  })
}

/**
 * 渲染配置输入框
 */
function renderSettingInput(setting) {
  const key = setting.setting_key
  const value = setting.parsed_value !== undefined ? setting.parsed_value : setting.setting_value
  const valueType = setting.value_type || 'string'

  switch (valueType) {
    case 'boolean':
      return `
        <div class="form-check form-switch">
          <input class="form-check-input setting-input" type="checkbox" 
            data-key="${key}" data-type="boolean" ${value ? 'checked' : ''}>
        </div>
      `
    case 'number':
    case 'integer':
      return `
        <input type="number" class="form-control form-control-sm setting-input" 
          data-key="${key}" data-type="number" value="${value || 0}">
      `
    case 'json':
      return `
        <textarea class="form-control form-control-sm setting-input json-editor" 
          data-key="${key}" data-type="json" rows="3">${JSON.stringify(value, null, 2)}</textarea>
      `
    default:
      return `
        <input type="text" class="form-control form-control-sm setting-input" 
          data-key="${key}" data-type="string" value="${value || ''}">
      `
  }
}

/**
 * 格式化配置值显示
 */
function formatSettingValue(value) {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

/**
 * 保存配置 - 批量更新分类设置
 * 使用后端API: PUT /api/v4/console/settings/:category
 */
async function saveSettings(category) {
  // 收集所有修改的配置项
  const settingsToUpdate = {}
  let hasError = false

  document.querySelectorAll('.setting-input').forEach(input => {
    const key = input.dataset.key
    const type = input.dataset.type
    let value

    if (type === 'boolean') {
      value = input.checked
    } else if (type === 'number') {
      value = parseFloat(input.value)
    } else if (type === 'json') {
      try {
        value = JSON.parse(input.value)
      } catch (e) {
        console.error(`JSON解析失败: ${key}`, e)
        showErrorToast(`配置项 ${key} 的JSON格式无效`)
        hasError = true
        return
      }
    } else {
      value = input.value
    }

    settingsToUpdate[key] = value
  })

  if (hasError) return

  if (Object.keys(settingsToUpdate).length === 0) {
    showErrorToast('没有可保存的配置项')
    return
  }

  showLoading(true)

  try {
    const response = await apiRequest(API.buildURL(API_ENDPOINTS.SETTINGS.UPDATE, { category }), {
      method: 'PUT',
      body: JSON.stringify({ settings: settingsToUpdate })
    })

    if (response && response.success) {
      const result = response.data || {}
      if (result.error_count > 0) {
        showErrorToast(`部分配置更新失败: ${result.errors?.map(e => e.setting_key).join(', ')}`)
      } else {
        showSuccessToast(`${category}设置保存成功`)
      }
      // 重新加载配置列表
      loadCategorySettings(category)
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
 * 显示配置详情（兼容旧逻辑）
 */
function showConfigDetail(configKey) {
  // 如果需要单独编辑某个配置项，可以实现此函数
  console.log('查看配置详情:', configKey)
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
 * 添加配置 - 需要先选择分类
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

  if (!currentCategory) {
    showErrorToast('请先从左侧选择一个配置分类')
    return
  }

  showLoading(true)

  try {
    // 将新配置添加到当前分类
    let value = configValue
    if (configType === 'number') {
      value = parseFloat(configValue)
    } else if (configType === 'boolean') {
      value = configValue.toLowerCase() === 'true'
    } else if (configType === 'json') {
      try {
        value = JSON.parse(configValue)
      } catch (e) {
        throw new Error('JSON格式无效')
      }
    }

    const settingsToUpdate = { [configKey]: value }

    const response = await apiRequest(API.buildURL(API_ENDPOINTS.SETTINGS.UPDATE, { category: currentCategory }), {
      method: 'PUT',
      body: JSON.stringify({ settings: settingsToUpdate })
    })

    if (response && response.success) {
      showSuccessToast('配置添加成功')
      bootstrap.Modal.getInstance(document.getElementById('addConfigModal')).hide()
      loadCategorySettings(currentCategory)
      loadConfigList() // 刷新左侧列表
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
 * 清理缓存 - 使用后端API: POST /api/v4/console/cache/clear
 */
async function clearCache(type) {
  if (!confirm(`确定要清理 ${type === 'all' ? '全部' : type} 缓存吗？`)) {
    return
  }

  showLoading(true)

  try {
    // 根据类型构建缓存模式
    const patternMap = {
      user: 'user:*',
      config: 'settings:*',
      activity: 'activity:*',
      all: '*'
    }

    const response = await apiRequest(API_ENDPOINTS.CACHE.CLEAR, {
      method: 'POST',
      body: JSON.stringify({
        pattern: patternMap[type] || type,
        confirm: true // 后端要求的确认参数
      })
    })

    if (response && response.success) {
      const result = response.data || {}
      showSuccessToast(`缓存清理成功，清理了 ${result.cleared_count || 0} 个缓存键`)
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
 * 显示系统配置 - 直接在当前页面加载基础设置
 */
function showSystemConfig() {
  loadCategorySettings('basic')
}

// ============================================
// 功能开关
// ============================================

/**
 * 显示功能开关 - 从security分类获取功能开关设置
 */
async function showFeatureFlags() {
  const modal = new bootstrap.Modal(document.getElementById('featureFlagsModal'))
  modal.show()

  const content = document.getElementById('featureFlagsContent')
  content.innerHTML = `
    <div class="text-center py-4">
      <div class="spinner-border" role="status"></div>
      <p class="mt-2">加载中...</p>
    </div>
  `

  try {
    // 功能开关通常存储在security分类中
    const response = await apiRequest(API_ENDPOINTS.SETTINGS.SECURITY)

    if (response && response.success) {
      const settings = response.data?.settings || []

      // 过滤出开关类型的配置（布尔类型）
      const flags = settings.filter(s => s.value_type === 'boolean')

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
                <td><code>${flag.setting_key}</code></td>
                <td>${flag.description || '-'}</td>
                <td>
                  <div class="form-check form-switch">
                    <input class="form-check-input feature-flag" type="checkbox" 
                      data-key="${flag.setting_key}" ${flag.parsed_value ? 'checked' : ''}>
                  </div>
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `
    } else {
      throw new Error(response?.message || '加载失败')
    }
  } catch (error) {
    console.error('加载功能开关失败:', error)
    content.innerHTML = `
      <div class="text-center py-4 text-danger">
        <i class="bi bi-exclamation-triangle"></i>
        <p class="mt-2">加载失败: ${error.message}</p>
      </div>
    `
  }
}

/**
 * 保存功能开关
 */
async function saveFeatureFlags() {
  const flags = {}
  document.querySelectorAll('.feature-flag').forEach(checkbox => {
    flags[checkbox.dataset.key] = checkbox.checked
  })

  showLoading(true)

  try {
    const response = await apiRequest(API_ENDPOINTS.SETTINGS.SECURITY, {
      method: 'PUT',
      body: JSON.stringify({ settings: flags })
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
 * 显示维护模式 - 从basic分类获取维护模式设置
 */
async function showMaintenanceMode() {
  const modal = new bootstrap.Modal(document.getElementById('maintenanceModal'))
  modal.show()

  try {
    const response = await apiRequest(API_ENDPOINTS.SETTINGS.BASIC)

    if (response && response.success) {
      const settings = response.data?.settings || []

      // 查找维护模式相关配置
      const maintenanceEnabled = settings.find(s => s.setting_key === 'maintenance_mode')
      const maintenanceMessage = settings.find(s => s.setting_key === 'maintenance_message')
      const maintenanceEndTime = settings.find(s => s.setting_key === 'maintenance_end_time')

      document.getElementById('maintenanceSwitch').checked =
        maintenanceEnabled?.parsed_value || false
      document.getElementById('maintenanceLabel').textContent = maintenanceEnabled?.parsed_value
        ? '开启'
        : '关闭'
      document.getElementById('maintenanceMessage').value =
        maintenanceMessage?.parsed_value ||
        '系统正在升级维护中，预计30分钟后恢复，给您带来不便敬请谅解。'

      if (maintenanceEndTime?.parsed_value) {
        const endTime = new Date(maintenanceEndTime.parsed_value)
        document.getElementById('maintenanceEndTime').value = endTime.toISOString().slice(0, 16)
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
    const settings = {
      maintenance_mode: enabled,
      maintenance_message: message
    }

    if (endTime) {
      settings.maintenance_end_time = new Date(endTime).toISOString()
    }

    const response = await apiRequest(API_ENDPOINTS.SETTINGS.BASIC, {
      method: 'PUT',
      body: JSON.stringify({ settings })
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

/**
 * 显示成功提示
 */
function showSuccessToast(message) {
  // 使用简单的alert，或者集成toast组件
  alert('✅ ' + message)
}

/**
 * 显示错误提示
 */
function showErrorToast(message) {
  alert('❌ ' + message)
}
