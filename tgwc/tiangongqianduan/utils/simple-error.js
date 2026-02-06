/**
 * 🎯 极简错误处理工具（50行代码）
 * 📦 功能：显示错误提示 + JWT过期处理 + 错误日志
 * 🎪 适用场景：小型项目（DAU<5000），微信小程序
 * 🔧 设计原则：简单、直接、零学习成本
 * 
 * @file 天工小程序 - 极简错误处理工具
 * @version 1.0.0
 * @author Restaurant Lottery Team
 * @since 2025-10-30
 */

/**
 * 显示错误提示（微信小程序弹窗）
 * @param {string} message - 错误消息内容
 * @param {String} [title='操作失败'] - 弹窗标题
 */
function showError(message, title = '操作失败') {
  wx.showModal({
    title,
    content: message || '操作失败，请稍后重试',
    showCancel: false,
    confirmText: '知道了'
  })
}

/**
 * 显示成功提示（微信小程序Toast）
 * @param {string} message - 成功消息内容
 */
function showSuccess(message) {
  wx.showToast({
    title: message || '操作成功',
    icon: 'success',
    duration: 2000
  })
}

/**
 * 处理JWT Token过期（自动清理+跳转登录页）
 */
function handleJWTExpired() {
  wx.showModal({
    title: '登录已过期',
    content: '请重新登录',
    showCancel: false,
    success: () => {
      // 清理本地存储的认证数据
      wx.removeStorageSync('access_token')
      wx.removeStorageSync('refresh_token')
      wx.removeStorageSync('user_info')
      // 跳转到登录页
      wx.redirectTo({ url: '/pages/auth/auth' })
    }
  })
}

/**
 * 统一错误处理（核心函数，推荐使用）
 * @param {Error | object} error - 错误对象
 * @param {String} [context='操作'] - 错误上下文/业务场景
 */
function handleError(error, context = '操作') {
  // 记录错误日志（方便调试）
  console.error(`❌ ${context}失败:`, error)

  // 提取错误消息（兼容多种错误对象格式）
  const message = error.message || error.msg || '未知错误'

  // 场景1：JWT Token过期或认证失败
  if (message.includes('jwt') || message.includes('token') || message.includes('认证')) {
    return handleJWTExpired()
  }

  // 场景2：网络连接错误
  if (message.includes('network') || message.includes('timeout')) {
    return showError('网络连接失败，请检查网络设置', '网络错误')
  }

  // 场景3：默认业务错误
  showError(`${context}失败：${message}`)
}

module.exports = {
  showError,
  showSuccess,
  handleJWTExpired,
  handleError
}

