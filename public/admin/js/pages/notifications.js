/**
 * 系统通知中心页面 - JavaScript逻辑
 * 从notifications.html提取，遵循前端工程化最佳实践
 */

// ========== 全局变量 ==========
let allNotifications = []
let wsConnection = null

// ========== 页面初始化 ==========

document.addEventListener('DOMContentLoaded', function () {
  const userInfo = getCurrentUser()
  if (userInfo && userInfo.nickname) {
    document.getElementById('welcomeText').textContent = `欢迎，${userInfo.nickname}`
  }

  loadNotifications()

  document.getElementById('logoutBtn').addEventListener('click', logout)
  document
    .getElementById('loadNotificationsBtn')
    .addEventListener('click', () => loadNotifications())
  document.getElementById('markAllAsReadBtn').addEventListener('click', markAllAsRead)
  document.getElementById('clearAllBtn').addEventListener('click', clearAll)
  document.getElementById('sendNotificationBtn').addEventListener('click', sendNotification)
  document.getElementById('typeFilter').addEventListener('change', loadNotifications)
  document.getElementById('statusFilter').addEventListener('change', loadNotifications)

  document.getElementById('notificationsList').addEventListener('click', e => {
    const notifItem = e.target.closest('.notification-item')
    if (notifItem) {
      const notifId = parseInt(notifItem.dataset.notificationId)
      if (!isNaN(notifId)) {
        viewNotification(notifId)
      }
    }
  })

  initWebSocket()
  setInterval(() => loadNotifications(true), 30000)
})

function initWebSocket() {
  try {
    if (typeof io === 'undefined') {
      console.warn('Socket.IO客户端未加载')
      return
    }

    wsConnection = io({
      auth: { token: getToken() }
    })

    wsConnection.on('connect', () => {
      console.log('✅ Socket.IO连接成功', wsConnection.id)
      wsConnection.emit('auth', { token: getToken(), role: 'admin' })
    })

    wsConnection.on('notification', data => {
      console.log('📬 收到新通知:', data)
      loadNotifications(true)
    })

    wsConnection.on('connect_error', error => {
      console.error('Socket.IO连接错误:', error)
    })

    wsConnection.on('disconnect', reason => {
      console.log('Socket.IO连接已断开:', reason)
    })

    wsConnection.on('reconnect', attemptNumber => {
      console.log('✅ Socket.IO重连成功，尝试次数:', attemptNumber)
    })
  } catch (error) {
    console.error('Socket.IO初始化失败:', error)
  }
}

async function loadNotifications(silent = false) {
  if (!silent) showLoading()

  try {
    const type = document.getElementById('typeFilter').value
    const status = document.getElementById('statusFilter').value

    const params = new URLSearchParams()
    if (type !== 'all') params.append('type', type)
    if (status !== 'all') params.append('status', status)

    const response = await apiRequest(`/api/v4/system/notifications?${params.toString()}`)

    if (response && response.success) {
      allNotifications = response.data.notifications || []
      renderNotifications(allNotifications)
      updateStatistics(response.data)
    } else if (!silent) {
      showError('加载失败', response?.message || '获取通知失败')
    }
  } catch (error) {
    console.error('加载通知失败:', error)
    if (!silent) showError('加载失败', error.message)
  } finally {
    if (!silent) hideLoading()
  }
}

function renderNotifications(notifications) {
  const container = document.getElementById('notificationsList')

  if (notifications.length === 0) {
    container.innerHTML = `
      <div class="text-center py-5">
        <i class="bi bi-bell-slash text-muted" style="font-size: 3rem;"></i>
        <p class="mt-2 text-muted">暂无通知</p>
      </div>
    `
    return
  }

  container.innerHTML = notifications
    .map(
      notif => `
    <div class="notification-item p-3 border-bottom ${notif.is_read ? '' : 'unread'}" 
         data-notification-id="${notif.notification_id || notif.id}">
      <div class="d-flex">
        <div class="flex-shrink-0 me-3">
          ${getNotificationIcon(notif.type)}
        </div>
        <div class="flex-grow-1">
          <div class="d-flex justify-content-between align-items-start mb-1">
            <h6 class="mb-0 ${notif.is_read ? 'text-muted' : 'fw-bold'}">${notif.title}</h6>
            <small class="text-muted">${formatRelativeTime(notif.created_at)}</small>
          </div>
          <p class="text-muted small mb-1">${notif.content.substring(0, 100)}${notif.content.length > 100 ? '...' : ''}</p>
          <div class="d-flex align-items-center">
            <span class="badge ${getNotificationTypeBadge(notif.type)} me-2">${getNotificationTypeText(notif.type)}</span>
            ${notif.is_read ? '' : '<span class="badge bg-danger">未读</span>'}
          </div>
        </div>
      </div>
    </div>
  `
    )
    .join('')
}

function getNotificationIcon(type) {
  const icons = {
    system: '<i class="bi bi-info-circle-fill text-primary" style="font-size: 2rem;"></i>',
    user: '<i class="bi bi-person-fill text-success" style="font-size: 2rem;"></i>',
    order: '<i class="bi bi-cart-fill text-warning" style="font-size: 2rem;"></i>',
    alert: '<i class="bi bi-exclamation-triangle-fill text-danger" style="font-size: 2rem;"></i>'
  }
  return icons[type] || icons.system
}

function getNotificationTypeBadge(type) {
  const badges = {
    system: 'bg-primary',
    user: 'bg-success',
    order: 'bg-warning text-dark',
    alert: 'bg-danger'
  }
  return badges[type] || 'bg-secondary'
}

function getNotificationTypeText(type) {
  const texts = { system: '系统通知', user: '用户动态', order: '订单消息', alert: '警告提醒' }
  return texts[type] || '未知'
}

function updateStatistics(data) {
  if (data.statistics) {
    document.getElementById('totalNotifications').textContent = formatNumber(
      data.statistics.total || 0
    )
    document.getElementById('unreadNotifications').textContent = formatNumber(
      data.statistics.unread || 0
    )
    document.getElementById('todayNotifications').textContent = formatNumber(
      data.statistics.today || 0
    )
    document.getElementById('weekNotifications').textContent = formatNumber(
      data.statistics.week || 0
    )
  }
}

async function viewNotification(notificationId) {
  showLoading()

  try {
    const response = await apiRequest(`/api/v4/system/notifications/${notificationId}`)

    if (response && response.success) {
      const notif = response.data.notification || response.data
      renderNotificationDetail(notif)

      if (!notif.is_read) {
        await markAsRead(notificationId)
        loadNotifications(true)
      }

      new bootstrap.Modal(document.getElementById('notificationDetailModal')).show()
    } else {
      showError('获取失败', response?.message || '获取通知详情失败')
    }
  } catch (error) {
    console.error('查看通知失败:', error)
    showError('获取失败', error.message)
  } finally {
    hideLoading()
  }
}

function renderNotificationDetail(notif) {
  document.getElementById('notificationDetailTitle').textContent = notif.title

  const detailHtml = `
    <div class="mb-3">
      <div class="d-flex align-items-center mb-2">
        ${getNotificationIcon(notif.type)}
        <span class="badge ${getNotificationTypeBadge(notif.type)} ms-2">${getNotificationTypeText(notif.type)}</span>
      </div>
    </div>
    <div class="mb-3">
      <h6 class="text-muted">通知时间</h6>
      <p>${formatDate(notif.created_at)}</p>
    </div>
    <div class="mb-3">
      <h6 class="text-muted">通知内容</h6>
      <p class="text-break">${notif.content}</p>
    </div>
    ${notif.link ? `<div class="mb-3"><h6 class="text-muted">相关链接</h6><a href="${notif.link}" class="btn btn-sm btn-outline-primary" target="_blank"><i class="bi bi-box-arrow-up-right"></i> 查看详情</a></div>` : ''}
  `

  document.getElementById('notificationDetailBody').innerHTML = detailHtml
}

async function markAsRead(notificationId) {
  try {
    await apiRequest(`/api/v4/system/notifications/${notificationId}/read`, { method: 'POST' })
  } catch (error) {
    console.error('标记已读失败:', error)
  }
}

async function markAllAsRead() {
  if (!confirm('确认将所有通知标记为已读？')) return

  showLoading()

  try {
    const response = await apiRequest('/api/v4/system/notifications/read-all', { method: 'POST' })

    if (response && response.success) {
      showSuccess('操作成功', '所有通知已标记为已读')
      loadNotifications()
    } else {
      showError('操作失败', response?.message || '操作失败')
    }
  } catch (error) {
    console.error('标记已读失败:', error)
    showError('操作失败', error.message)
  } finally {
    hideLoading()
  }
}

async function clearAll() {
  if (!confirm('确认清空所有通知？此操作不可恢复！')) return

  showLoading()

  try {
    const response = await apiRequest('/api/v4/system/notifications/clear', { method: 'DELETE' })

    if (response && response.success) {
      showSuccess('操作成功', '所有通知已清空')
      loadNotifications()
    } else {
      showError('操作失败', response?.message || '操作失败')
    }
  } catch (error) {
    console.error('清空失败:', error)
    showError('操作失败', error.message)
  } finally {
    hideLoading()
  }
}

async function sendNotification() {
  const form = document.getElementById('sendNotificationForm')
  if (!form.checkValidity()) {
    form.reportValidity()
    return
  }

  const type = document.getElementById('notificationType').value
  const title = document.getElementById('notificationTitle').value
  const content = document.getElementById('notificationContent').value
  const target = document.getElementById('notificationTarget').value

  showLoading()

  try {
    const response = await apiRequest('/api/v4/system/notifications/send', {
      method: 'POST',
      body: JSON.stringify({ type, title, content, target })
    })

    if (response && response.success) {
      showSuccess('发送成功', '通知已发送')
      bootstrap.Modal.getInstance(document.getElementById('sendNotificationModal')).hide()
      form.reset()
      loadNotifications()
    } else {
      showError('发送失败', response?.message || '操作失败')
    }
  } catch (error) {
    console.error('发送通知失败:', error)
    showError('发送失败', error.message)
  } finally {
    hideLoading()
  }
}

function showLoading() {
  document.getElementById('loadingOverlay').classList.add('show')
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('show')
}

function showSuccess(title, message) {
  alert(`✅ ${title}\n${message}`)
}

function showError(title, message) {
  alert(`❌ ${title}\n${message}`)
}

window.addEventListener('beforeunload', () => {
  if (wsConnection && wsConnection.connected) {
    wsConnection.disconnect()
  }
})
