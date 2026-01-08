/**
 * 登录页面 - JavaScript逻辑
 * 从login.html提取，遵循前端工程化最佳实践
 *
 * 注意：登录页面不依赖admin-common.js，因为用户尚未登录
 */

// ========== 页面初始化 ==========

document.addEventListener('DOMContentLoaded', function () {
  const loginForm = document.getElementById('loginForm')
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin)
  }

  // 检查是否已登录
  checkExistingSession()
})

/**
 * 检查是否已有登录会话
 */
function checkExistingSession() {
  const token = localStorage.getItem('admin_token')
  const user = localStorage.getItem('admin_user')

  if (token && user) {
    // 已有登录信息，直接跳转到仪表盘
    showStatus('检测到已登录状态，正在跳转...')
    setTimeout(() => {
      window.location.href = '/admin/dashboard.html'
    }, 500)
  }
}

/**
 * 显示登录状态消息
 * @param {string} message - 消息内容
 * @param {boolean} isError - 是否为错误消息
 */
function showStatus(message, isError = false) {
  const statusDiv = document.getElementById('loginStatus')
  if (statusDiv) {
    statusDiv.innerHTML = `
      <div class="alert alert-${isError ? 'danger' : 'info'}" role="alert">
        ${message}
      </div>
    `
  }
}

/**
 * 登录处理函数
 * @param {Event} e - 表单提交事件
 */
async function handleLogin(e) {
  e.preventDefault()

  const phone = document.getElementById('phone').value.trim()
  const code = document.getElementById('code').value.trim()

  // 基础验证
  if (!phone) {
    showStatus('请输入手机号', true)
    return
  }

  if (!code) {
    showStatus('请输入验证码', true)
    return
  }

  showStatus('正在登录...')

  try {
    // 统一使用console auth认证端点
    const response = await fetch('/api/v4/console/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: phone, // 使用mobile参数
        verification_code: code
      })
    })

    const result = await response.json()
    console.log('登录响应:', result)

    // 后端返回的是access_token，不是token
    if (result.success && result.data && result.data.access_token) {
      const user = result.data.user

      // 权限检查（基于user.roles数组或is_admin字段）
      const hasAdminAccess = checkAdminAccess(user)

      if (hasAdminAccess) {
        showStatus('✅ 登录成功，正在跳转...')

        // 保存Token和用户信息
        localStorage.setItem('admin_token', result.data.access_token)
        localStorage.setItem('admin_user', JSON.stringify(user))

        // 延迟跳转，让用户看到成功消息
        setTimeout(() => {
          window.location.href = '/admin/dashboard.html'
        }, 1000)
      } else {
        showStatus('❌ 此账号没有管理员权限，请联系系统管理员', true)
      }
    } else {
      showStatus(`❌ 登录失败: ${result.message || '未知错误'}`, true)
    }
  } catch (error) {
    console.error('登录错误:', error)
    showStatus(`❌ 网络错误: ${error.message}`, true)
  }
}

/**
 * 检查用户是否有管理员权限
 * @param {Object} user - 用户信息对象
 * @returns {boolean} 是否有管理员权限
 */
function checkAdminAccess(user) {
  if (!user) return false

  // 检查is_admin字段
  if (user.is_admin === true) return true

  // 检查roles数组
  if (user.roles && Array.isArray(user.roles)) {
    return user.roles.some(role => {
      // 支持对象形式的role
      if (typeof role === 'object') {
        return role.role_name === 'admin' || role.role_level >= 100
      }
      // 支持字符串形式的role
      if (typeof role === 'string') {
        return role === 'admin'
      }
      return false
    })
  }

  // 检查role_level字段
  if (user.role_level && user.role_level >= 100) return true

  return false
}
