/**
 * 仪表盘页面 - JavaScript逻辑
 * 从dashboard.html提取，遵循前端工程化最佳实践
 *
 * 依赖：
 * - /admin/js/admin-common.js (apiRequest, getToken, getCurrentUser, formatNumber, handleApiError, logout, checkAdminPermission)
 */

// ========== 页面初始化 ==========

document.addEventListener('DOMContentLoaded', function () {
  // 显示用户信息
  displayUserInfo()

  // 退出登录按钮
  const logoutBtn = document.getElementById('logoutBtn')
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout)
  }

  // 检查权限并加载数据
  if (getToken() && checkAdminPermission()) {
    loadDashboardData()
    // 每分钟刷新一次数据
    setInterval(loadDashboardData, 60000)
  }
})

/**
 * 显示用户信息
 */
function displayUserInfo() {
  const userInfo = getCurrentUser()
  const welcomeText = document.getElementById('welcomeText')

  if (userInfo && userInfo.nickname && welcomeText) {
    welcomeText.textContent = `欢迎，${userInfo.nickname}`
  }
}

/**
 * 加载仪表盘数据
 * 使用现有管理API：/api/v4/console/system/dashboard
 *
 * 后端数据结构（V4.0统一抽奖引擎 - 语义更新）：
 * {
 *   overview: { total_users, active_users, total_lotteries, high_tier_rate },
 *   today: { new_users, lottery_draws, high_tier_wins, high_tier_rate, points_consumed },
 *   customer_service: { today_sessions, today_messages },
 *   system: { uptime, memory_usage, cpu_usage, timestamp }
 * }
 * 
 * 注意：V4.0语义更新，使用 high_tier_wins/high_tier_rate 替代 wins/win_rate
 */
async function loadDashboardData() {
  try {
    const response = await apiRequest('/api/v4/console/system/dashboard')

    if (response && response.success && response.data) {
      const data = response.data

      // 适配后端V4数据结构 - 总用户数据
      if (data.overview) {
        updateElementText('totalUsers', formatNumber(data.overview.total_users || 0))
      }

      // 适配后端V4.0数据结构 - 今日数据（语义更新：high_tier_wins/high_tier_rate）
      if (data.today) {
        updateElementText('todayNewUsers', data.today.new_users || 0)
        updateElementText('todayDraws', formatNumber(data.today.lottery_draws || 0))
        // V4.0语义更新：使用 high_tier_wins 替代 wins
        updateElementText('todayWins', formatNumber(data.today.high_tier_wins || data.today.wins || 0))
        // V4.0语义更新：使用 high_tier_rate 替代 win_rate
        updateElementText('winRate', (data.today.high_tier_rate || data.today.win_rate || 0) + '%')
        updateElementText('points', formatNumber(data.today.points_consumed || 0))
      }

      // 适配后端V4数据结构 - 客服会话数据
      if (data.customer_service) {
        updateElementText('sessions', formatNumber(data.customer_service.today_sessions || 0))
        updateElementText('messages', formatNumber(data.customer_service.today_messages || 0))
      }

      console.log('✅ 仪表盘数据加载成功', {
        total_users: data.overview?.total_users,
        today_new_users: data.today?.new_users,
        today_draws: data.today?.lottery_draws,
        today_high_tier_wins: data.today?.high_tier_wins,
        high_tier_rate: data.today?.high_tier_rate
      })
    } else {
      console.warn('⚠️ 仪表盘API返回数据格式异常:', response)
    }
  } catch (error) {
    console.error('❌ 加载仪表盘数据失败:', error)
    handleApiError(error, '加载仪表盘数据')
  }
}

/**
 * 安全更新DOM元素文本
 * @param {string} elementId - 元素ID
 * @param {string|number} text - 要显示的文本
 */
function updateElementText(elementId, text) {
  const element = document.getElementById(elementId)
  if (element) {
    element.textContent = text
  }
}
