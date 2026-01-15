/**
 * 客服工作台页面 - JavaScript逻辑
 * 从customer-service.html提取，遵循前端工程化最佳实践
 */

// ========== 全局变量 ==========
let currentSessionId = null
let allSessions = []
let wsConnection = null
let messagePollingInterval = null

// ========== 页面初始化 ==========

document.addEventListener('DOMContentLoaded', function () {
  const userInfo = getCurrentUser()
  if (userInfo && userInfo.nickname) {
    document.getElementById('welcomeText').textContent = `欢迎，${userInfo.nickname}`
  }

  loadSessions()
  loadAdminList()
  initWebSocket()

  // 事件监听器
  document.getElementById('logoutBtn').addEventListener('click', logout)
  document.getElementById('sessionSearchBtn').addEventListener('click', () => loadSessions())
  document.getElementById('sessionStatusFilter').addEventListener('change', () => loadSessions())
  document.getElementById('sessionSearch').addEventListener('keypress', e => {
    if (e.key === 'Enter') loadSessions()
  })

  document.getElementById('transferSessionBtn').addEventListener('click', transferSession)
  document.getElementById('closeSessionBtn').addEventListener('click', closeSession)
  document.getElementById('viewUserInfoBtn').addEventListener('click', viewUserInfo)
  document.getElementById('sendMessageBtn').addEventListener('click', sendMessage)
  document.getElementById('submitTransferBtn').addEventListener('click', submitTransfer)

  document.getElementById('messageInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  })

  // 事件委托：会话列表项
  document.getElementById('sessionsList').addEventListener('click', e => {
    const sessionItem = e.target.closest('.session-item')
    if (sessionItem) {
      const sessionId = sessionItem.dataset.sessionId // 保持字符串类型，与后端一致
      if (sessionId) openSession(sessionId)
    }
  })

  // 事件委托：快捷回复按钮
  document.querySelector('.quick-replies').addEventListener('click', e => {
    const quickReplyBtn = e.target.closest('.quick-reply-btn')
    if (quickReplyBtn) {
      insertQuickReply(quickReplyBtn.dataset.reply)
    }
  })

  // 图片加载错误处理
  const defaultAvatar =
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgZmlsbD0iI2NjYyIgY2xhc3M9ImJpIGJpLXBlcnNvbi1jaXJjbGUiIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHBhdGggZD0iTTExIDZhMyAzIDAgMSAxLTYgMCAzIDMgMCAwIDEgNiAweiIvPjxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgZD0iTTAgOGE4IDggMCAxIDEgMTYgMEE4IDggMCAwIDEgMCA4em04IDdhNyA3IDAgMCAwIDUuMzg3LTIuNTAzQTEzLjkzMyAxMy45MzMgMCAwIDAgOCAxMS41YTEzLjkzMyAxMy45MzMgMCAwIDAtNS4zODcgMS4wMDdBNyA3IDAgMCAwIDggMTV6Ii8+PC9zdmc+'
  document.getElementById('sessionsList').addEventListener(
    'error',
    e => {
      if (e.target.classList.contains('session-avatar-img')) {
        e.target.src = defaultAvatar
        e.target.alt = '默认头像'
      }
    },
    true
  )

  // 定期轮询刷新会话列表
  setInterval(() => loadSessions(true), 30000)
})

// 页面卸载时关闭WebSocket
window.addEventListener('beforeunload', () => {
  if (wsConnection) wsConnection.disconnect()
})

function initWebSocket() {
  try {
    // 检查Socket.IO库是否已加载
    if (typeof io === 'undefined') {
      console.warn('⚠️ Socket.IO库未加载，WebSocket功能不可用，使用轮询模式')
      // 启用备用轮询模式
      if (!messagePollingInterval) {
        messagePollingInterval = setInterval(() => {
          if (currentSessionId) {
            loadSessionMessages(currentSessionId, true)
          }
        }, 5000)
      }
      return
    }

    wsConnection = io({
      auth: { token: getToken() },
      transports: ['websocket', 'polling']
    })

    wsConnection.on('connect', () => console.log('✅ WebSocket连接成功'))
    wsConnection.on('message', data => handleWebSocketMessage(data))
    wsConnection.on('new_message', data => handleWebSocketMessage({ type: 'new_message', ...data }))
    wsConnection.on('session_update', data =>
      handleWebSocketMessage({ type: 'session_update', ...data })
    )
    wsConnection.on('error', error => console.error('WebSocket错误:', error))
    wsConnection.on('disconnect', reason => console.log('WebSocket连接已断开:', reason))
    wsConnection.on('connect_error', error => console.error('WebSocket连接失败:', error))
  } catch (error) {
    console.error('WebSocket初始化失败:', error)
    // 启用备用轮询模式
    if (!messagePollingInterval) {
      messagePollingInterval = setInterval(() => {
        if (currentSessionId) {
          loadSessionMessages(currentSessionId, true)
        }
      }, 5000)
    }
  }
}

// 加载会话消息（备用轮询模式使用）
async function loadSessionMessages(sessionId, silent = false) {
  if (!silent) showLoading()
  try {
    const response = await apiRequest(
      `/api/v4/console/customer-service/sessions/${sessionId}/messages`
    )
    if (response && response.success) {
      renderMessages(response.data.messages || [])
    }
  } catch (error) {
    if (!silent) console.error('加载消息失败:', error)
  } finally {
    if (!silent) hideLoading()
  }
}

function handleWebSocketMessage(data) {
  switch (data.type) {
    case 'new_message':
      if (String(data.session_id) === String(currentSessionId)) {
        appendMessage(data.message)
        scrollToBottom()
      }
      loadSessions(true)
      break
    case 'new_session':
      loadSessions(true)
      break
    case 'session_closed':
      if (String(data.session_id) === String(currentSessionId)) {
        alert('当前会话已被关闭')
        closeCurrentChat()
      }
      loadSessions(true)
      break
  }
}

async function loadSessions(silent = false) {
  if (!silent) showLoading()

  try {
    const status = document.getElementById('sessionStatusFilter').value
    const search = document.getElementById('sessionSearch').value.trim()

    const params = new URLSearchParams()
    if (status !== 'all') params.append('status', status)
    if (search) params.append('search', search)

    const response = await apiRequest(
      `/api/v4/console/customer-service/sessions?${params.toString()}`
    )

    if (response && response.success) {
      allSessions = response.data.sessions || response.data.list || []
      renderSessions(allSessions)
    } else if (!silent) {
      showError('加载失败', response?.message || '获取会话列表失败')
    }
  } catch (error) {
    console.error('加载会话失败:', error)
    if (!silent) showError('加载失败', error.message)
  } finally {
    if (!silent) hideLoading()
  }
}

function renderSessions(sessions) {
  const container = document.getElementById('sessionsList')
  const defaultAvatar =
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgZmlsbD0iI2NjYyIgY2xhc3M9ImJpIGJpLXBlcnNvbi1jaXJjbGUiIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHBhdGggZD0iTTExIDZhMyAzIDAgMSAxLTYgMCAzIDMgMCAwIDEgNiAweiIvPjxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgZD0iTTAgOGE4IDggMCAxIDEgMTYgMEE4IDggMCAwIDEgMCA4em04IDdhNyA3IDAgMCAwIDUuMzg3LTIuNTAzQTEzLjkzMyAxMy45MzMgMCAwIDAgOCAxMS41YTEzLjkzMyAxMy45MzMgMCAwIDAtNS4zODcgMS4wMDdBNyA3IDAgMCAwIDggMTV6Ii8+PC9zdmc+'

  if (sessions.length === 0) {
    container.innerHTML = `
      <div class="text-center py-5">
        <i class="bi bi-inbox text-muted" style="font-size: 3rem;"></i>
        <p class="mt-2 text-muted small">暂无会话</p>
      </div>
    `
    return
  }

  container.innerHTML = sessions
    .map(session => {
      // 适配后端数据结构：后端返回 session.user 对象而非扁平字段
      const userNickname = session.user?.nickname || session.user_nickname || '未命名用户'
      const userMobile = session.user?.mobile || session.user_mobile || ''
      const userAvatar = session.user?.avatar_url || session.user_avatar || defaultAvatar
      const userId = session.user?.user_id || session.user_id
      const lastMessage = session.last_message?.content || session.last_message || '暂无消息'

      return `
    <div class="session-item ${String(session.session_id) === String(currentSessionId) ? 'active' : ''}" 
         data-session-id="${session.session_id}" data-user-id="${userId}">
      <div class="d-flex justify-content-between align-items-start mb-1">
        <div class="d-flex align-items-center flex-fill">
          <img src="${userAvatar}" 
               class="rounded-circle me-2 session-avatar-img" 
               style="width: 36px; height: 36px;"
               alt="头像"
               onerror="this.src='${defaultAvatar}'">
          <div class="flex-fill">
            <div class="fw-bold small">${userNickname}</div>
            <div class="text-muted" style="font-size: 0.75rem;">${maskPhone(userMobile)}</div>
          </div>
        </div>
        ${session.unread_count > 0 ? `<span class="unread-badge">${session.unread_count}</span>` : ''}
      </div>
      <div class="text-muted small text-truncate">${typeof lastMessage === 'string' ? lastMessage : '暂无消息'}</div>
      <div class="d-flex justify-content-between align-items-center mt-1">
        <span class="badge ${getSessionStatusBadge(session.status)}">${getSessionStatusText(session.status)}</span>
        <small class="text-muted" style="font-size: 0.7rem;">${formatRelativeTime(session.updated_at)}</small>
      </div>
    </div>
  `
    })
    .join('')
}

function getSessionStatusBadge(status) {
  const badges = { waiting: 'bg-warning text-dark', active: 'bg-success', closed: 'bg-secondary' }
  return badges[status] || 'bg-secondary'
}

function getSessionStatusText(status) {
  const texts = { waiting: '待处理', active: '进行中', closed: '已关闭' }
  return texts[status] || '未知'
}

async function openSession(sessionId) {
  if (String(sessionId) === String(currentSessionId)) return
  currentSessionId = sessionId // 保持原始类型（字符串）
  showLoading()

  try {
    const response = await apiRequest(
      `/api/v4/console/customer-service/sessions/${sessionId}/messages`
    )
    if (response && response.success) {
      const session = response.data.session
      const messages = response.data.messages || []
      const defaultAvatar =
        'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgZmlsbD0iI2NjYyIgY2xhc3M9ImJpIGJpLXBlcnNvbi1jaXJjbGUiIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHBhdGggZD0iTTExIDZhMyAzIDAgMSAxLTYgMCAzIDMgMCAwIDEgNiAweiIvPjxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgZD0iTTAgOGE4IDggMCAxIDEgMTYgMEE4IDggMCAwIDEgMCA4em04IDdhNyA3IDAgMCAwIDUuMzg3LTIuNTAzQTEzLjkzMyAxMy45MzMgMCAwIDAgOCAxMS41YTEzLjkzMyAxMy45MzMgMCAwIDAtNS4zODcgMS4wMDdBNyA3IDAgMCAwIDggMTV6Ii8+PC9zdmc+'

      // 适配后端数据结构：后端返回 session.user 对象
      const userNickname = session.user?.nickname || session.user_nickname || '未命名用户'
      const userMobile = session.user?.mobile || session.user_mobile || ''
      const userAvatar = session.user?.avatar_url || session.user_avatar || defaultAvatar

      const avatarElement = document.getElementById('chatUserAvatar')
      avatarElement.src = userAvatar
      avatarElement.onerror = function () {
        this.src = defaultAvatar
      }

      document.getElementById('chatUserName').textContent = userNickname
      document.getElementById('chatUserMobile').textContent = maskPhone(userMobile)

      renderMessages(messages)
      document.getElementById('emptyState').style.display = 'none'
      document.getElementById('chatInterface').style.display = 'flex'
      markAsRead(sessionId)
      loadSessions(true)
    } else {
      showError('打开失败', response?.message || '获取会话信息失败')
    }
  } catch (error) {
    console.error('打开会话失败:', error)
    showError('打开失败', error.message)
  } finally {
    hideLoading()
  }
}

function renderMessages(messages) {
  const container = document.getElementById('chatMessages')
  container.innerHTML = ''
  messages.forEach(msg => appendMessage(msg))
  scrollToBottom()
}

function appendMessage(message) {
  const container = document.getElementById('chatMessages')
  const isAdmin = message.sender_type === 'admin'
  const messageHtml = `
    <div class="message-item ${isAdmin ? 'admin-message' : 'user-message'}">
      <div>
        <div class="message-bubble">${escapeHtml(message.message_content || message.content)}</div>
        <div class="message-time ${isAdmin ? 'text-end' : ''}">${formatDate(message.created_at)}</div>
      </div>
    </div>
  `
  container.insertAdjacentHTML('beforeend', messageHtml)
}

function scrollToBottom() {
  const container = document.getElementById('chatMessages')
  container.scrollTop = container.scrollHeight
}

async function sendMessage() {
  const input = document.getElementById('messageInput')
  const content = input.value.trim()
  if (!content) {
    showError('发送失败', '请输入消息内容')
    return
  }
  if (!currentSessionId) {
    showError('发送失败', '请先选择一个会话')
    return
  }

  try {
    const response = await apiRequest(
      `/api/v4/console/customer-service/sessions/${currentSessionId}/send`,
      {
        method: 'POST',
        body: JSON.stringify({ content: content })
      }
    )

    if (response && response.success) {
      input.value = ''
      appendMessage({
        sender_type: 'admin',
        message_content: content,
        created_at: new Date().toISOString()
      })
      scrollToBottom()
      if (wsConnection && wsConnection.connected) {
        wsConnection.emit('send_message', { session_id: currentSessionId, content: content })
      }
    } else {
      showError('发送失败', response?.message || '消息发送失败')
    }
  } catch (error) {
    console.error('发送消息失败:', error)
    showError('发送失败', error.message)
  }
}

function insertQuickReply(text) {
  document.getElementById('messageInput').value = text
  document.getElementById('messageInput').focus()
}

async function markAsRead(sessionId) {
  try {
    await apiRequest(`/api/v4/console/customer-service/sessions/${sessionId}/mark-read`, {
      method: 'POST'
    })
  } catch (error) {
    console.error('标记已读失败:', error)
  }
}

async function viewUserInfo() {
  if (!currentSessionId) {
    showError('操作失败', '请先选择一个会话')
    return
  }
  showLoading()

  try {
    const session = allSessions.find(s => String(s.session_id) === String(currentSessionId))
    if (!session) return

    // 适配后端数据结构：后端返回 session.user.user_id
    const userId = session.user?.user_id || session.user_id
    if (!userId) {
      showError('查看失败', '无法获取用户ID')
      return
    }

    const response = await apiRequest(`/api/v4/console/user-management/users/${userId}`)
    if (response && response.success) {
      const user = response.data.user || response.data
      renderUserInfo(user)
      new bootstrap.Modal(document.getElementById('userInfoModal')).show()
    }
  } catch (error) {
    console.error('获取用户信息失败:', error)
    showError('查看失败', error.message)
  } finally {
    hideLoading()
  }
}

function renderUserInfo(user) {
  const defaultAvatar =
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgZmlsbD0iI2NjYyIgY2xhc3M9ImJpIGJpLXBlcnNvbi1jaXJjbGUiIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHBhdGggZD0iTTExIDZhMyAzIDAgMSAxLTYgMCAzIDMgMCAwIDEgNiAweiIvPjxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgZD0iTTAgOGE4IDggMCAxIDEgMTYgMEE4IDggMCAwIDEgMCA4em04IDdhNyA3IDAgMCAwIDUuMzg3LTIuNTAzQTEzLjkzMyAxMy45MzMgMCAwIDAgOCAxMS41YTEzLjkzMyAxMy45MzMgMCAwIDAtNS4zODcgMS4wMDdBNyA3IDAgMCAwIDggMTV6Ii8+PC9zdmc+'
  document.getElementById('userInfoBody').innerHTML = `
    <div class="text-center mb-3">
      <img src="${user.avatar_url || defaultAvatar}" class="rounded-circle" style="width: 80px; height: 80px;" onerror="this.src='${defaultAvatar}'" alt="头像">
    </div>
    <div class="row g-2">
      <div class="col-6"><strong>用户ID：</strong>${user.user_id || user.id}</div>
      <div class="col-6"><strong>昵称：</strong>${user.nickname || '未设置'}</div>
      <div class="col-6"><strong>手机号：</strong>${user.mobile || '-'}</div>
      <div class="col-6"><strong>积分：</strong><span class="text-primary">${formatNumber(user.points_balance || 0)}</span></div>
      <div class="col-6"><strong>注册时间：</strong>${formatDate(user.created_at)}</div>
      <div class="col-6"><strong>最后活跃：</strong>${user.last_active_at ? formatDate(user.last_active_at) : '从未'}</div>
    </div>
  `
}

async function loadAdminList() {
  try {
    const response = await apiRequest('/api/v4/console/user-management/users?role_filter=admin')
    if (response && response.success) {
      const admins = response.data.users || []
      const select = document.getElementById('transferTargetSelect')
      select.innerHTML =
        '<option value="">请选择...</option>' +
        admins
          .map(
            admin => `<option value="${admin.user_id}">${admin.nickname || admin.mobile}</option>`
          )
          .join('')
    }
  } catch (error) {
    console.error('加载客服列表失败:', error)
  }
}

function transferSession() {
  if (!currentSessionId) {
    showError('操作失败', '请先选择一个会话')
    return
  }
  new bootstrap.Modal(document.getElementById('transferModal')).show()
}

async function submitTransfer() {
  if (!currentSessionId) {
    showError('操作失败', '请先选择一个会话')
    return
  }

  const targetId = document.getElementById('transferTargetSelect').value
  if (!targetId) {
    showError('转接失败', '请选择接收客服')
    return
  }

  showLoading()
  try {
    const response = await apiRequest(
      `/api/v4/console/customer-service/sessions/${currentSessionId}/transfer`,
      {
        method: 'POST',
        body: JSON.stringify({ target_admin_id: parseInt(targetId) })
      }
    )

    if (response && response.success) {
      showSuccess('转接成功', '会话已转接')
      bootstrap.Modal.getInstance(document.getElementById('transferModal')).hide()
      closeCurrentChat()
      loadSessions()
    } else {
      showError('转接失败', response?.message || '操作失败')
    }
  } catch (error) {
    console.error('转接失败:', error)
    showError('转接失败', error.message)
  } finally {
    hideLoading()
  }
}

async function closeSession() {
  // 检查是否有选中的会话
  if (!currentSessionId) {
    showError('操作失败', '请先选择一个会话')
    return
  }

  if (!confirm('确认结束当前会话？')) return
  showLoading()

  try {
    const response = await apiRequest(
      `/api/v4/console/customer-service/sessions/${currentSessionId}/close`,
      { method: 'POST', body: JSON.stringify({ close_reason: '问题已解决' }) }
    )
    if (response && response.success) {
      showSuccess('操作成功', '会话已关闭')
      closeCurrentChat()
      loadSessions()
    } else {
      showError('操作失败', response?.message || '关闭会话失败')
    }
  } catch (error) {
    console.error('关闭会话失败:', error)
    showError('操作失败', error.message)
  } finally {
    hideLoading()
  }
}

function closeCurrentChat() {
  currentSessionId = null
  document.getElementById('chatInterface').style.display = 'none'
  document.getElementById('emptyState').style.display = 'flex'
  document.getElementById('messageInput').value = ''
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
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
