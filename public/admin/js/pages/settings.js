/**
 * 系统设置页面 - JavaScript逻辑
 * 从settings.html提取，遵循前端工程化最佳实践
 *
 * 依赖：
 * - /admin/js/admin-common.js (apiRequest, getToken, getCurrentUser, checkAdminPermission, logout)
 * - Bootstrap 5
 */

// ========== 页面初始化 ==========

document.addEventListener('DOMContentLoaded', function () {
  // 显示用户信息
  const userInfo = getCurrentUser()
  if (userInfo && userInfo.nickname) {
    document.getElementById('welcomeText').textContent = `欢迎，${userInfo.nickname}`
  }

  // Token和权限验证
  if (!getToken() || !checkAdminPermission()) {
    return
  }

  // 加载所有设置
  loadAllSettings()

  // ===== 静态按钮事件监听器 =====
  document.getElementById('logoutBtn').addEventListener('click', logout)
  document.getElementById('saveBasicSettingsBtn').addEventListener('click', saveBasicSettings)
  document.getElementById('saveLotterySettingsBtn').addEventListener('click', saveLotterySettings)
  document.getElementById('savePointsSettingsBtn').addEventListener('click', savePointsSettings)
  document
    .getElementById('saveNotificationSettingsBtn')
    .addEventListener('click', saveNotificationSettings)
  document.getElementById('saveSecuritySettingsBtn').addEventListener('click', saveSecuritySettings)

  // ===== 事件委托：缓存清理按钮 =====
  document.addEventListener('click', e => {
    const clearCacheBtn = e.target.closest('.clear-cache-btn')
    if (clearCacheBtn) {
      const cacheType = clearCacheBtn.dataset.cacheType
      clearCache(cacheType)
    }
  })

  // 平滑滚动
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault()
      const target = document.querySelector(this.getAttribute('href'))
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' })
      }
    })
  })
})

/**
 * 加载所有设置
 */
async function loadAllSettings() {
  showLoading()

  try {
    // 并行加载所有分类的设置
    const [basicRes, pointsRes, notificationRes, securityRes] = await Promise.all([
      apiRequest('/api/v4/console/settings/basic').catch(e => null),
      apiRequest('/api/v4/console/settings/points').catch(e => null),
      apiRequest('/api/v4/console/settings/notification').catch(e => null),
      apiRequest('/api/v4/console/settings/security').catch(e => null)
    ])

    // 加载基础设置
    if (basicRes && basicRes.success && basicRes.data.settings) {
      basicRes.data.settings.forEach(setting => {
        const { setting_key, parsed_value } = setting
        if (setting_key === 'system_name') setInputValue('systemName', parsed_value)
        if (setting_key === 'system_version') setInputValue('systemVersion', parsed_value)
        if (setting_key === 'customer_phone') setInputValue('customerServicePhone', parsed_value)
        if (setting_key === 'customer_email') setInputValue('customerServiceEmail', parsed_value)
      })
    }

    // 加载积分设置
    if (pointsRes && pointsRes.success && pointsRes.data.settings) {
      pointsRes.data.settings.forEach(setting => {
        const { setting_key, parsed_value } = setting
        if (setting_key === 'sign_in_points') setInputValue('dailyCheckInPoints', parsed_value)
        if (setting_key === 'initial_points') setInputValue('registerBonusPoints', parsed_value)
        if (setting_key === 'points_expire_days') setInputValue('pointsExpireDays', parsed_value)
        if (setting_key === 'budget_allocation_ratio')
          setInputValue('budget_allocation_ratio', parsed_value)
      })
    }

    // 加载通知设置
    if (notificationRes && notificationRes.success && notificationRes.data.settings) {
      notificationRes.data.settings.forEach(setting => {
        const { setting_key, parsed_value } = setting
        setCheckboxValue('smsEnabled', setting_key === 'sms_enabled' ? parsed_value : undefined)
        setCheckboxValue('emailEnabled', setting_key === 'email_enabled' ? parsed_value : undefined)
        setCheckboxValue(
          'appNotificationEnabled',
          setting_key === 'app_notification_enabled' ? parsed_value : undefined
        )
      })
    }

    // 加载安全设置
    if (securityRes && securityRes.success && securityRes.data.settings) {
      securityRes.data.settings.forEach(setting => {
        const { setting_key, parsed_value } = setting
        if (setting_key === 'max_login_attempts') setInputValue('loginFailLimit', parsed_value)
        if (setting_key === 'lockout_duration') setInputValue('lockoutDuration', parsed_value)
        if (setting_key === 'password_min_length') setInputValue('passwordMinLength', parsed_value)
        if (setting_key === 'api_rate_limit') setInputValue('apiRateLimit', parsed_value)
      })
    }

    console.log('✅ 所有设置加载完成')
  } catch (error) {
    console.error('加载设置失败:', error)
    showError('加载失败', error.message)
  } finally {
    hideLoading()
  }
}

/**
 * 安全设置输入框值
 */
function setInputValue(id, value) {
  const el = document.getElementById(id)
  if (el && value !== undefined) el.value = value
}

/**
 * 安全设置复选框值
 */
function setCheckboxValue(id, value) {
  const el = document.getElementById(id)
  if (el && value !== undefined) el.checked = value
}

/**
 * 保存基础设置
 */
async function saveBasicSettings() {
  showLoading()

  try {
    const settings = {
      system_name: document.getElementById('systemName').value,
      customer_phone: document.getElementById('customerServicePhone').value,
      customer_email: document.getElementById('customerServiceEmail').value
    }

    const response = await apiRequest('/api/v4/console/settings/basic', {
      method: 'PUT',
      body: JSON.stringify({ settings })
    })

    if (response && response.success) {
      showSuccess('保存成功', '基础设置已更新')
    } else {
      showError('保存失败', response?.message || '保存基础设置失败')
    }
  } catch (error) {
    console.error('保存设置失败:', error)
    showError('保存失败', error.message)
  } finally {
    hideLoading()
  }
}

/**
 * 保存抽奖设置
 */
async function saveLotterySettings() {
  showLoading()

  try {
    // 提示用户：抽奖核心配置需要修改代码
    alert(
      '💡 抽奖配置说明\n\n' +
        '✅ 运营配置（可通过界面修改）：\n' +
        '   - 请前往【用户管理】页面\n' +
        '   - 点击用户的【概率】按钮\n' +
        '   - 可设置特定用户的中奖率\n' +
        '\n' +
        '⚙️ 算法配置（需要技术团队修改代码）：\n' +
        '   - 基础中奖率：config/business.config.js\n' +
        '   - 保底触发规则：BasicGuaranteeStrategy.js\n' +
        '   - 连抽定价：config/business.config.js\n' +
        '\n' +
        '修改算法配置后需要重启服务生效。'
    )
  } catch (error) {
    console.error('保存设置失败:', error)
    showError('保存失败', error.message)
  } finally {
    hideLoading()
  }
}

/**
 * 保存积分设置
 */
async function savePointsSettings() {
  showLoading()

  try {
    const settings = {
      sign_in_points: parseInt(document.getElementById('dailyCheckInPoints').value),
      initial_points: parseInt(document.getElementById('registerBonusPoints').value),
      points_expire_days: parseInt(document.getElementById('pointsExpireDays').value),
      budget_allocation_ratio: parseFloat(document.getElementById('budget_allocation_ratio').value)
    }

    const response = await apiRequest('/api/v4/console/settings/points', {
      method: 'PUT',
      body: JSON.stringify({ settings })
    })

    if (response && response.success) {
      showSuccess('保存成功', '积分设置已更新（包括预算分配系数）')
    } else {
      showError('保存失败', response?.message || '保存积分设置失败')
    }
  } catch (error) {
    console.error('保存设置失败:', error)
    showError('保存失败', error.message)
  } finally {
    hideLoading()
  }
}

/**
 * 保存通知设置
 */
async function saveNotificationSettings() {
  showLoading()

  try {
    const settings = {
      sms_enabled: document.getElementById('smsEnabled')?.checked || false,
      email_enabled: document.getElementById('emailEnabled')?.checked || false,
      app_notification_enabled: document.getElementById('appNotificationEnabled')?.checked !== false
    }

    const response = await apiRequest('/api/v4/console/settings/notification', {
      method: 'PUT',
      body: JSON.stringify({ settings })
    })

    if (response && response.success) {
      showSuccess('保存成功', '通知设置已更新')
    } else {
      showError('保存失败', response?.message || '保存通知设置失败')
    }
  } catch (error) {
    console.error('保存设置失败:', error)
    showError('保存失败', error.message)
  } finally {
    hideLoading()
  }
}

/**
 * 保存安全设置
 */
async function saveSecuritySettings() {
  showLoading()

  try {
    const settings = {
      max_login_attempts: parseInt(document.getElementById('loginFailLimit').value),
      lockout_duration: parseInt(document.getElementById('lockoutDuration').value),
      password_min_length: parseInt(document.getElementById('passwordMinLength')?.value || 6),
      api_rate_limit: parseInt(document.getElementById('apiRateLimit')?.value || 100)
    }

    const response = await apiRequest('/api/v4/console/settings/security', {
      method: 'PUT',
      body: JSON.stringify({ settings })
    })

    if (response && response.success) {
      showSuccess('保存成功', '安全设置已更新')
    } else {
      showError('保存失败', response?.message || '保存安全设置失败')
    }
  } catch (error) {
    console.error('保存设置失败:', error)
    showError('保存失败', error.message)
  } finally {
    hideLoading()
  }
}

/**
 * 清除缓存
 * @param {string} type - 缓存类型
 */
async function clearCache(type) {
  if (
    !confirm(
      `确认清除${type === 'all' ? '全部' : type}缓存？\n清除后需要一定时间重建缓存，可能暂时影响性能。`
    )
  ) {
    return
  }

  showLoading()

  try {
    // 根据类型构建pattern
    let pattern = '*' // 默认全部
    if (type === 'rate_limit') pattern = 'rate_limit:*'
    else if (type === 'user') pattern = 'user_*'
    else if (type === 'prize') pattern = 'prize_*'

    const response = await apiRequest('/api/v4/console/cache/clear', {
      method: 'POST',
      body: JSON.stringify({ pattern, confirm: true })
    })

    if (response && response.success) {
      showSuccess('清除成功', `已清除${response.data.cleared_count}个缓存键`)
    } else {
      showError('清除失败', response?.message || '缓存清除失败')
    }
  } catch (error) {
    console.error('清除缓存失败:', error)
    showError('清除失败', error.message)
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
