// pages/chat/chat.js - 聊天会话列表页面
// 使用统一的工具函数导入
const { Utils, Wechat, API, Constants } = require('../../utils/index.js')
const { formatDateMessage, checkAuth } = Utils
const { showToast } = Wechat
// 🔴 导入项目核心常量（魔术数字优化）
const { DELAY, TIME } = Constants

Page({
  data: {
    // 搜索相关
    searchKeyword: '',

    // 会话列表数据
    customerServicePreview: '',
    customerServiceUnread: 0,
    systemNotifyPreview: '',
    systemNotifyUnread: 0,
    systemNotifyTime: '',
    aiAssistantPreview: '',
    aiAssistantUnread: 0,
    aiAssistantTime: '',
    techSupportPreview: '',
    techSupportUnread: 0,
    techSupportTime: '',
    activityConsultPreview: '',
    activityConsultUnread: 0,
    activityConsultTime: '',
    feedbackPreview: '',
    feedbackUnread: 0,
    feedbackTime: '',

    // 总未读数
    totalUnreadCount: 0,

    // 加载状态
    loading: false,
    hasSession: true,

    // 弹窗聊天相关
    showChatModal: false,
    currentChatType: 'customer-service',
    currentChatName: '在线客服',
    currentChatIcon: '🎧',
    isOnline: false,

    // 聊天消息
    messages: [],
    inputContent: '',
    inputFocused: false,
    isLoadingHistory: false,
    scrollToBottom: false,
    showTypingIndicator: false,
    typingUser: '',

    // WebSocket相关
    wsConnected: false,
    sessionId: '',
    userId: '',
    token: '',

    // 会话状态
    sessionStatus: 'connecting'
  },

  /**
   * 生命周期函数--监听页面加载
   *
   * @param {Object} options - 页面参数对象
   * @description
   * 聊天会话列表页面的入口函数，初始化用户信息和加载会话数据。
   *
   * **初始化流程**：
   * 1. 检查用户登录状态（未登录自动跳转到登录页）
   * 2. 初始化用户信息（userId, token）
   * 3. 加载所有会话数据（客服、系统通知、AI助手等）
   *
   * **V4.0特性**：
   * - 使用统一的认证检查（utils/auth-helper.js::checkAuth）
   * - 完全依赖后端真实数据
   * - 不使用任何mock数据
   *
   * @returns {void}
   */
  onLoad(options) {
    console.log('🚀 聊天会话列表页面加载')

    // 🔴 使用统一的认证检查
    if (!checkAuth()) {
      console.warn('⚠️ 用户未登录，已自动跳转')
      return
    }

    this.initializeUser()
    this.loadSessionData()
  },

  onShow() {
    console.log('📱 聊天页面显示')

    // 🔴 使用统一的认证检查
    if (!checkAuth()) {
      console.warn('⚠️ 用户未登录，已自动跳转')
      return
    }

    this.loadSessionData()
  },

  // 页面卸载时清理资源
  onUnload() {
    console.log('📱 聊天页面卸载，清理WebSocket订阅')
    this.disconnectWebSocket()
  },

  /**
   * 初始化用户信息
   *
   * @description
   * 从全局状态中获取用户信息和Token，用于后续的API调用和WebSocket连接。
   *
   * **获取信息**：
   * - userId: 用户唯一标识
   * - token: JWT访问令牌
   * - userInfo: 用户基本信息
   *
   * **存储位置**：
   * - app.globalData.userInfo
   * - app.globalData.access_token
   * - wx.getStorageSync('access_token')
   *
   * @returns {void}
   */
  initializeUser() {
    const app = getApp()

    if (app && app.globalData) {
      this.setData({
        userId: app.globalData.userInfo?.userId || '',
        token: app.globalData.access_token || ''
      })

      console.log('✅ 用户信息初始化完成', {
        userId: this.data.userId,
        hasToken: !!this.data.token
      })
    }
  },

  /**
   * 加载所有会话列表数据
   *
   * @async
   * @description
   * 并行加载所有类型的会话数据（客服、系统通知、AI助手、技术支持、活动咨询、反馈）。
   *
   * **加载流程**：
   * 1. 设置loading状态
   * 2. 按顺序调用6个会话数据加载方法
   * 3. 计算总未读数
   * 4. 更新hasSession状态
   * 5. 取消loading状态
   *
   * **V4.0特性**：
   * - 完全使用后端真实API数据
   * - 客服聊天使用真实API，其他类型如未实现则不加载模拟数据
   * - 统一错误处理和用户提示
   *
   * **错误处理**：
   * - API调用失败时显示错误信息，不使用模拟数据
   * - 提示用户需要后端实现相应接口
   *
   * @returns {Promise<void>}
   *
   * @throws {Error} API调用失败时抛出异常
   */
  async loadSessionData() {
    console.log('📊 开始加载会话数据')
    this.setData({ loading: true })

    try {
      // 🔴 V4.0修正: 只加载有真实API支持的会话数据
      // 客服聊天使用真实API，其他类型如未实现则不加载模拟数据
      await this.loadCustomerServiceData()
      await this.loadSystemNotifyData()
      await this.loadAIAssistantData()
      await this.loadTechSupportData()
      await this.loadActivityConsultData()
      await this.loadFeedbackData()

      this.updateTotalUnreadCount()
    } catch (error) {
      console.error('❌ 加载会话数据失败:', error)
      showToast('加载会话数据失败')
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 加载在线客服数据
   *
   * @description
   * 从后端API获取客服会话的最新消息和未读数。
   *
   * @async
   * @returns {Promise<void>}
   *
   * @example
   * await this.loadCustomerServiceData()
   */
  async loadCustomerServiceData() {
    try {
      // 🔴 V4.0: 调用后端API获取客服会话数据
      const { getChatSessions } = API
      const result = await getChatSessions()

      if (result && result.success && result.data && result.data.sessions) {
        // 查找客服会话数据
        const csSession = result.data.sessions.find(s => s.session_type === 'customer-service')

        if (csSession) {
          this.setData({
            customerServicePreview: csSession.last_message || '',
            customerServiceUnread: csSession.unread_count || 0,
            isOnline: csSession.is_online || false
          })
          console.log('✅ 客服会话数据加载成功')
        } else {
          // 如果后端没有返回客服会话，显示默认提示
          this.setData({
            customerServicePreview: '暂无消息',
            customerServiceUnread: 0,
            isOnline: false
          })
        }
      } else {
        throw new Error('后端未返回有效的会话数据')
      }
    } catch (error) {
      console.error('❌ 加载客服数据失败:', error)
      // 🔴 提供明确的错误提示，不使用模拟数据
      this.setData({
        customerServicePreview: '加载失败，请稍后重试',
        customerServiceUnread: 0,
        isOnline: false
      })
    }
  },

  /**
   * 加载系统通知数据
   *
   * @description
   * 从后端API获取系统通知的最新消息和未读数。
   *
   * @async
   * @returns {Promise<void>}
   */
  async loadSystemNotifyData() {
    try {
      // 🔴 V4.0: 调用后端API获取系统通知数据
      const { getChatSessions } = API
      const result = await getChatSessions()

      if (result && result.success && result.data && result.data.sessions) {
        const notifySession = result.data.sessions.find(s => s.session_type === 'system-notify')

        if (notifySession) {
          this.setData({
            systemNotifyPreview: notifySession.last_message || '',
            systemNotifyUnread: notifySession.unread_count || 0,
            systemNotifyTime: formatDateMessage(notifySession.last_update_time)
          })
        } else {
          this.setData({
            systemNotifyPreview: '暂无通知',
            systemNotifyUnread: 0,
            systemNotifyTime: ''
          })
        }
      }
    } catch (error) {
      console.error('❌ 加载系统通知数据失败:', error)
      this.setData({
        systemNotifyPreview: '加载失败',
        systemNotifyUnread: 0,
        systemNotifyTime: ''
      })
    }
  },

  /**
   * 加载AI助手数据
   *
   * @description
   * 从后端API获取AI助手的最新消息和未读数。
   *
   * @async
   * @returns {Promise<void>}
   */
  async loadAIAssistantData() {
    try {
      // 🔴 V4.0: 调用后端API获取AI助手数据
      const { getChatSessions } = API
      const result = await getChatSessions()

      if (result && result.success && result.data && result.data.sessions) {
        const aiSession = result.data.sessions.find(s => s.session_type === 'ai-assistant')

        if (aiSession) {
          this.setData({
            aiAssistantPreview: aiSession.last_message || '',
            aiAssistantUnread: aiSession.unread_count || 0,
            aiAssistantTime: formatDateMessage(aiSession.last_update_time)
          })
        } else {
          this.setData({
            aiAssistantPreview: '暂无消息',
            aiAssistantUnread: 0,
            aiAssistantTime: ''
          })
        }
      }
    } catch (error) {
      console.error('❌ 加载AI助手数据失败:', error)
      this.setData({
        aiAssistantPreview: '加载失败',
        aiAssistantUnread: 0,
        aiAssistantTime: ''
      })
    }
  },

  /**
   * 加载技术支持数据
   *
   * @description
   * 从后端API获取技术支持的最新消息和未读数。
   *
   * @async
   * @returns {Promise<void>}
   */
  async loadTechSupportData() {
    try {
      // 🔴 V4.0: 调用后端API获取技术支持数据
      const { getChatSessions } = API
      const result = await getChatSessions()

      if (result && result.success && result.data && result.data.sessions) {
        const techSession = result.data.sessions.find(s => s.session_type === 'tech-support')

        if (techSession) {
          this.setData({
            techSupportPreview: techSession.last_message || '',
            techSupportUnread: techSession.unread_count || 0,
            techSupportTime: formatDateMessage(techSession.last_update_time)
          })
        } else {
          this.setData({
            techSupportPreview: '暂无消息',
            techSupportUnread: 0,
            techSupportTime: ''
          })
        }
      }
    } catch (error) {
      console.error('❌ 加载技术支持数据失败:', error)
      this.setData({
        techSupportPreview: '加载失败',
        techSupportUnread: 0,
        techSupportTime: ''
      })
    }
  },

  /**
   * 加载活动咨询数据
   *
   * @description
   * 从后端API获取活动咨询的最新消息和未读数。
   *
   * @async
   * @returns {Promise<void>}
   */
  async loadActivityConsultData() {
    try {
      // 🔴 V4.0: 调用后端API获取活动咨询数据
      const { getChatSessions } = API
      const result = await getChatSessions()

      if (result && result.success && result.data && result.data.sessions) {
        const activitySession = result.data.sessions.find(s => s.session_type === 'activity')

        if (activitySession) {
          this.setData({
            activityConsultPreview: activitySession.last_message || '',
            activityConsultUnread: activitySession.unread_count || 0,
            activityConsultTime: formatDateMessage(activitySession.last_update_time)
          })
        } else {
          this.setData({
            activityConsultPreview: '暂无消息',
            activityConsultUnread: 0,
            activityConsultTime: ''
          })
        }
      }
    } catch (error) {
      console.error('❌ 加载活动咨询数据失败:', error)
      this.setData({
        activityConsultPreview: '加载失败',
        activityConsultUnread: 0,
        activityConsultTime: ''
      })
    }
  },

  /**
   * 加载反馈建议数据
   *
   * @description
   * 从后端API获取反馈建议的最新消息和未读数。
   *
   * @async
   * @returns {Promise<void>}
   */
  async loadFeedbackData() {
    try {
      // 🔴 V4.0: 调用后端API获取反馈建议数据
      const { getChatSessions } = API
      const result = await getChatSessions()

      if (result && result.success && result.data && result.data.sessions) {
        const feedbackSession = result.data.sessions.find(s => s.session_type === 'feedback')

        if (feedbackSession) {
          this.setData({
            feedbackPreview: feedbackSession.last_message || '',
            feedbackUnread: feedbackSession.unread_count || 0,
            feedbackTime: formatDateMessage(feedbackSession.last_update_time)
          })
        } else {
          this.setData({
            feedbackPreview: '暂无消息',
            feedbackUnread: 0,
            feedbackTime: ''
          })
        }
      }
    } catch (error) {
      console.error('❌ 加载反馈建议数据失败:', error)
      this.setData({
        feedbackPreview: '加载失败',
        feedbackUnread: 0,
        feedbackTime: ''
      })
    }
  },

  // 更新总未读数
  updateTotalUnreadCount() {
    const total =
      this.data.customerServiceUnread +
      this.data.systemNotifyUnread +
      this.data.aiAssistantUnread +
      this.data.techSupportUnread +
      this.data.activityConsultUnread +
      this.data.feedbackUnread

    this.setData({ totalUnreadCount: total })

    // 更新tabBar徽章
    if (total > 0) {
      // 假设聊天是第3个tab
      wx.setTabBarBadge({
        index: 2,
        text: total > 99 ? '99+' : total.toString()
      })
    } else {
      wx.removeTabBarBadge({ index: 2 })
    }
  },

  // 刷新会话列表
  async refreshSessionList() {
    console.log('🔧 刷新会话列表')
    await this.loadSessionData()
  },

  // 搜索输入
  onSearchInput(e) {
    const keyword = e.detail.value
    this.setData({ searchKeyword: keyword })

    // 实现搜索功能
    if (keyword.trim()) {
      this.performSearch(keyword)
    }
  },

  // 清除搜索
  clearSearch() {
    this.setData({ searchKeyword: '' })
  },

  // 执行搜索
  performSearch(keyword) {
    console.log('🔍 搜索关键词', keyword)
    // 实现搜索逻辑
  },

  // 开始新聊天
  startNewChat() {
    console.log('✨ 开始新聊天')
    this.enterCustomerService()
  },

  // 进入在线客服
  async enterCustomerService() {
    console.log('🎧 进入在线客服')

    // 修复：先创建聊天会话获取sessionId
    try {
      // 💡 loading由APIClient自动处理，无需手动showLoading

      // 调用API创建聊天会话
      const sessionResult = await API.createChatSession({
        source: 'mobile'
      })

      if (sessionResult.success && sessionResult.data.session) {
        const session = sessionResult.data.session
        console.log('✅ 聊天会话创建成功:', session)

        // 保存会话信息
        this.setData({
          sessionId: session.sessionId,
          sessionStatus: session.status || 'waiting'
        })

        // 打开聊天弹窗
        this.openChatModal('customer-service', '在线客服', '🎧')

        // 清除未读消息
        this.setData({
          customerServiceUnread: 0,
          showChatModal: true
        })
        this.updateTotalUnreadCount()

        // 连接WebSocket
        this.connectWebSocket()

        // 显示成功提示
        showToast('客服连接成功')
      } else {
        // 💡 loading由APIClient自动处理，无需手动hideLoading
        console.error('❌ 创建聊天会话失败:', sessionResult.message)
        showToast(sessionResult.message || '连接客服失败，请稍后重试')
      }
    } catch (error) {
      // 💡 loading由APIClient自动处理，无需手动hideLoading
      console.error('❌ 进入客服服务出错:', error)
      showToast('连接客服时出现错误，请稍后重试')
    }
  },

  // 进入系统通知
  enterSystemNotify() {
    console.log('📢 进入系统通知')
    this.openChatModal('system', '系统通知', '📢')
    this.setData({ systemNotifyUnread: 0 })
    this.updateTotalUnreadCount()
  },

  // 进入AI助手
  enterAIAssistant() {
    console.log('🤖 进入AI助手')
    this.openChatModal('ai', 'AI助手', '🤖')
    this.setData({ aiAssistantUnread: 0 })
    this.updateTotalUnreadCount()
  },

  // 进入技术支持
  enterTechSupport() {
    console.log('🛠️ 进入技术支持')
    this.openChatModal('tech', '技术支持', '🛠️')
    this.setData({ techSupportUnread: 0 })
    this.updateTotalUnreadCount()
  },

  // 进入活动咨询
  enterActivityConsult() {
    console.log('🎉 进入活动咨询')
    this.openChatModal('activity', '活动咨询', '🎉')
    this.setData({ activityConsultUnread: 0 })
    this.updateTotalUnreadCount()
  },

  // 进入反馈建议
  enterFeedback() {
    console.log('💬 进入反馈建议')
    this.openChatModal('feedback', '反馈建议', '💬')
    this.setData({ feedbackUnread: 0 })
    this.updateTotalUnreadCount()
  },

  // 打开聊天弹窗
  openChatModal(type, name, icon) {
    this.setData({
      showChatModal: true,
      currentChatType: type,
      currentChatName: name,
      currentChatIcon: icon,
      isOnline: type === 'customer-service',
      // 修复：不再清空消息历史，保留之前的聊天记录
      inputContent: ''
    })

    // 加载对应类型的历史消息
    this.loadChatHistory(type)
  },

  // 关闭聊天弹窗
  closeChatModal() {
    console.log('❌ 关闭聊天弹窗')
    this.setData({ showChatModal: false })
    this.disconnectWebSocket()
  },

  // 加载聊天历史
  async loadChatHistory(type) {
    console.log('📚 加载聊天历史:', type)
    this.setData({ isLoadingHistory: true })

    try {
      if (type === 'customer-service') {
        // 加载客服聊天历史
        await this.loadCustomerServiceHistory()
      } else {
        // 加载其他类型的消息历史
        this.loadOtherTypeHistory(type)
      }
    } catch (error) {
      console.error('❌ 加载历史消息失败:', error)
      showToast('加载历史消息失败')
    } finally {
      this.setData({ isLoadingHistory: false })
    }
  },

  // 加载客服聊天历史
  async loadCustomerServiceHistory() {
    try {
      // 修复：使用真实API获取聊天历史，而不是模拟数据
      if (this.data.sessionId) {
        console.log('📚 从API加载聊天历史，会话ID:', this.data.sessionId)

        const historyResult = await API.getChatHistory({
          sessionId: this.data.sessionId,
          page: 1,
          pageSize: 50
        })

        if (historyResult.success && historyResult.data.messages) {
          // 配合后端v2.0.1：使用新的消息判断逻辑
          const apiMessages = historyResult.data.messages.map(msg => {
            const senderId = msg.senderId || msg.senderInfo?.userId || null

            // 关键修复：使用与addMessage相同的判断逻辑
            let isOwn = false

            if (msg.messageSource) {
              // 优先基于messageSource判断（后端v2.0.1新特性）
              switch (msg.messageSource) {
                case 'user_client':
                  // 用户端发送→显示右边
                  isOwn = true
                  break
                case 'admin_client':
                  // 管理员端发送→显示左边
                  isOwn = false
                  break
                case 'system':
                  // 系统消息→显示左边
                  isOwn = false
                  break
                default:
                  isOwn = false
              }
            } else if (msg.senderType) {
              // 兜底：基于senderType判断
              isOwn = msg.senderType === 'user'
            } else {
              // 最后兜底：基于senderId判断（可能存在身份混淆）
              isOwn = senderId === this.data.userId
              console.warn(
                '⚠️ [历史消息] 缺少messageSource和senderType，使用senderId判断可能不准确'
              )
            }

            // 调试信息：验证历史消息判断逻辑
            console.log('📚 [历史消息v2.0.1]', {
              content: msg.content?.substring(0, 30) + '...',
              senderId,
              senderType: msg.senderType,
              messageSource: msg.messageSource,
              currentUserId: this.data.userId,
              isOwn,
              position: isOwn ? '右边(用户)' : '左边(客服)',
              判断依据: msg.messageSource
                ? 'messageSource'
                : msg.senderType
                  ? 'senderType'
                  : 'senderId',
              后端版本: 'v2.0.1'
            })

            return {
              id: msg.messageId,
              content: msg.content,
              messageType: msg.messageType || 'text',
              isOwn,
              // 修复：使用正确计算的isOwn值
              status: isOwn ? 'sent' : 'read',
              timestamp: new Date(msg.createdAt).getTime(),
              timeText: this.formatMessageTime(msg.createdAt),
              // 历史消息都显示时间
              showTime: true,
              attachments: msg.attachments || [],
              // 新增：保留原始数据用于调试
              _debug: {
                originalSenderId: msg.senderId,
                senderInfo: msg.senderInfo,
                senderType: msg.senderType
              }
            }
          })

          // 关键修复：按时间戳排序，确保最早的消息在前面，最新的消息在后面
          const sortedMessages = apiMessages.sort((a, b) => a.timestamp - b.timestamp)

          console.log('✅ 成功加载聊天历史:', sortedMessages.length, '条消息')
          console.log('📅 消息时间范围:', {
            最早消息: sortedMessages[0]?.timeText,
            最新消息: sortedMessages[sortedMessages.length - 1]?.timeText
          })
          console.log('📊 消息对齐统计:', {
            用户消息数量: sortedMessages.filter(m => m.isOwn).length,
            客服消息数量: sortedMessages.filter(m => !m.isOwn).length,
            当前用户ID: this.data.userId
          })

          this.setData({
            messages: sortedMessages,
            scrollToBottom: true
          })
          return
        } else {
          console.warn('⚠️ API返回的历史消息为空或格式错误:', historyResult)
        }
      }

      // 如果没有sessionId或API调用失败，显示欢迎消息
      console.log('📝 显示默认欢迎消息')
      const welcomeMessage = {
        id: 'welcome_' + Date.now(),
        content: '您好！欢迎使用天工积分系统，请问有什么可以帮助您的吗？',
        messageType: 'text',
        isOwn: false,
        status: 'read',
        timestamp: Date.now(),
        timeText: '刚刚',
        showTime: true
      }

      this.setData({
        messages: [welcomeMessage],
        scrollToBottom: true
      })
    } catch (error) {
      console.error('❌ 加载客服历史失败:', error)
      // 加载失败时显示友好提示
      const errorMessage = {
        id: 'error_' + Date.now(),
        content: '历史消息加载失败，但您可以开始新的对话。客服将为您提供帮助。',
        messageType: 'system',
        isOwn: false,
        status: 'read',
        timestamp: Date.now(),
        timeText: '刚刚',
        showTime: true
      }

      this.setData({
        messages: [errorMessage],
        scrollToBottom: true
      })
    }
  },

  // 加载其他类型历史 - 仅从后端API获取真实数据
  async loadOtherTypeHistory(type) {
    console.log('📱 开始加载聊天历史', type)

    // 设置加载状态
    this.setData({
      loading: true,
      messages: []
    })

    try {
      // 调用后端API获取真实聊天历史数据
      // 获取最近50条消息
      const response = await API.getChatHistory({
        type,
        limit: 50
      })

      if (response.success && response.data) {
        // 处理后端返回的真实消息数据
        const realMessages = response.data.map(msg => ({
          id: msg.id || msg._id,
          content: msg.content || msg.message || '',
          messageType: msg.messageType || msg.type || 'text',
          isOwn: msg.isOwn || false,
          timestamp: new Date(msg.timestamp || msg.createdAt).getTime(),
          timeText: this.formatMessageTime(msg.timestamp || msg.createdAt),
          showTime: true
        }))

        // 按时间排序真实消息
        const sortedRealMessages = realMessages.sort((a, b) => a.timestamp - b.timestamp)

        console.log('📱 成功加载真实聊天历史:', type, sortedRealMessages.length, '条消息')

        this.setData({
          messages: sortedRealMessages,
          scrollToBottom: true,
          loading: false
        })
      } else {
        // API调用失败时显示错误信息，不使用模拟数据
        console.warn('⚠️ 获取聊天历史失败:', response.message || '未知错误')
        this.setData({
          messages: [],
          loading: false,
          hasError: true,
          errorMessage: `无法加载${type}聊天历史，请稍后重试`
        })

        wx.showToast({
          title: '加载聊天历史失败',
          icon: 'none',
          duration: DELAY.TOAST_LONG
        })
      }
    } catch (error) {
      console.error('❌ 加载聊天历史异常:', error)

      // 发生异常时显示错误信息，不使用模拟数据
      this.setData({
        messages: [],
        loading: false,
        hasError: true,
        errorMessage: '系统异常，请联系客服'
      })

      wx.showToast({
        title: '系统异常',
        icon: 'none',
        duration: DELAY.TOAST_LONG
      })
    }
  },

  // 新增：格式化消息时间的辅助函数
  formatMessageTime(timeString) {
    try {
      const messageTime = new Date(timeString)
      const now = new Date()
      const diffMinutes = Math.floor((now - messageTime) / (1000 * 60))

      if (diffMinutes < 1) {
        return '刚刚'
      }
      if (diffMinutes < 60) {
        return `${diffMinutes}分钟前`
      }

      const diffHours = Math.floor(diffMinutes / 60)
      if (diffHours < 24) {
        return `${diffHours}小时前`
      }

      const diffDays = Math.floor(diffHours / 24)
      if (diffDays < 7) {
        return `${diffDays}天前`
      }

      // 超过7天显示具体日期
      return messageTime.toLocaleDateString()
    } catch (error) {
      console.warn('⚠️ 时间格式化失败', error)
      return '未知时间'
    }
  },

  // 连接WebSocket
  connectWebSocket() {
    if (!this.data.token || !this.data.userId) {
      console.warn('⚠️ 缺少必要信息，无法连接WebSocket')
      return
    }

    const app = getApp()

    // 安全检查app对象和方法是否存在
    if (!app || typeof app.subscribeWebSocketMessages !== 'function') {
      console.error('❌ app对象或WebSocket管理方法不可用')
      // 降级到显示错误信息
      wx.showModal({
        title: '连接失败',
        content: '系统初始化未完成，请重启小程序',
        showCancel: false,
        confirmText: '确定'
      })
      return
    }

    // 使用统一WebSocket管理
    console.log('🔐 用户端使用统一WebSocket连接')

    // 订阅WebSocket消息
    app.subscribeWebSocketMessages('chat_page', (eventName, data) => {
      this.handleUnifiedWebSocketMessage(eventName, data)
    })

    // 尝试连接统一WebSocket
    app
      .connectWebSocket()
      .then(() => {
        console.log('✅ 用户端WebSocket连接成功')
        this.setData({
          wsConnected: true,
          sessionStatus: 'active'
        })

        wx.showToast({
          title: '客服连接成功',
          icon: 'success',
          duration: DELAY.TOAST_LONG
        })
      })
      .catch(error => {
        console.error('❌ 用户端WebSocket连接失败:', error)
        this.setData({
          wsConnected: false,
          sessionStatus: 'connection_failed'
        })

        wx.showToast({
          title: '连接客服失败，请检查网络',
          icon: 'none',
          duration: DELAY.RETRY
        })
      })
  },

  // 处理统一WebSocket消息
  handleUnifiedWebSocketMessage(eventName, data) {
    console.log('📢 用户端收到统一WebSocket消息:', eventName, data)

    switch (eventName) {
      case 'websocket_connected':
        this.setData({
          wsConnected: true,
          sessionStatus: 'active'
        })
        break

      case 'websocket_error':
      case 'websocket_closed':
        this.setData({
          wsConnected: false,
          sessionStatus: 'disconnected'
        })
        break

      case 'websocket_max_reconnect_reached':
        wx.showModal({
          title: '连接失败',
          content: '客服连接异常，请检查网络后重试',
          confirmText: '重试',
          cancelText: '取消',
          success: res => {
            if (res.confirm) {
              const app = getApp()
              app.connectWebSocket()
            }
          }
        })
        break

      case 'new_user_message':
        this.addMessage(data)
        break

      case 'admin_message':
        console.log('👨‍💼 用户端收到管理员消息:', data)
        this.handleAdminMessage(data)
        break

      case 'admin_chat_message':
        console.log('👨‍💼 用户端收到管理员消息(兼容旧格式):', data)
        this.handleAdminMessage(data)
        break

      case 'user_typing':
        this.handleTypingIndicator(data)
        break

      case 'session_status':
        this.updateSessionStatus(data)
        break

      default:
        console.log('🔧 用户端未处理的消息类型', eventName)
    }
  },

  // 处理管理员消息
  handleAdminMessage(messageData) {
    console.log('👨‍💼 处理管理员消息', messageData)
    console.log('🔍 [管理员消息调试] 原始数据检查', {
      messageId: messageData.messageId,
      content: messageData.content?.substring(0, 30) + '...',
      adminId: messageData.adminId,
      senderId: messageData.senderId,
      senderType: messageData.senderType,
      messageSource: messageData.messageSource,
      原始完整数据: messageData
    })

    // 转换管理员消息格式为标准消息格式
    const adminMessage = {
      id: messageData.messageId || `admin_msg_${Date.now()}`,
      content: messageData.content,
      messageType: messageData.messageType || 'text',
      senderId: messageData.adminId || messageData.senderId,
      senderType: 'admin',
      // 关键修复：传递messageSource字段
      messageSource: messageData.messageSource || 'admin_client',
      timestamp: messageData.timestamp || Date.now(),
      createdAt: messageData.createdAt || new Date().toISOString(),
      attachments: messageData.attachments || []
    }

    // 调用现有的添加消息方法
    this.addMessage(adminMessage)

    // 修复：移除"收到客服回复"弹窗提示，用户已能在界面中看到新消息
    // 保持消息正常显示，不需要额外的Toast干扰用户体验

    console.log('✅ 管理员消息处理完成')
  },

  // 断开WebSocket连接
  disconnectWebSocket() {
    const app = getApp()

    // 安全检查app对象和方法是否存在
    if (app && typeof app.unsubscribeWebSocketMessages === 'function') {
      // 取消消息订阅
      app.unsubscribeWebSocketMessages('chat_page')
    } else {
      console.warn('⚠️ app对象或unsubscribeWebSocketMessages方法不可用')
    }

    // 更新本地状态
    this.setData({
      wsConnected: false,
      sessionStatus: 'disconnected'
    })

    console.log('📱 用户端已断开WebSocket连接')
  },

  // 添加消息
  addMessage(messageData) {
    // 获取发送者ID，优先使用senderId，其次使用senderInfo中的userId
    const senderId = messageData.senderId || messageData.senderInfo?.userId || null

    // 配合后端v2.0.1：基于messageSource判断消息显示位置
    let isOwn = false

    if (messageData.messageSource) {
      // 优先基于messageSource判断（后端v2.0.1新特性）
      switch (messageData.messageSource) {
        case 'user_client':
          // 用户端发送→显示右边
          isOwn = true
          break
        case 'admin_client':
          // 管理员端发送→显示左边
          isOwn = false
          break
        case 'system':
          // 系统消息→显示左边
          isOwn = false
          break
        default:
          isOwn = false
      }
    } else if (messageData.senderType) {
      // 兜底：基于senderType判断
      isOwn = messageData.senderType === 'user'
    } else {
      // 最后兜底：基于senderId判断（可能存在身份混淆）
      isOwn = senderId === this.data.userId
      console.warn('⚠️ [聊天] 缺少messageSource和senderType，使用senderId判断可能不准确')
    }

    // 数据验证：检查关键字段
    if (!senderId) {
      console.warn('⚠️ [聊天] senderId为空，可能影响消息布局')
    }
    if (!messageData.senderType) {
      console.warn('⚠️ [聊天] senderType为空，建议后端补充此字段')
    }

    // 调试信息：验证后端v2.0.1消息布局是否正确
    console.log('📢 [聊天消息v2.0.1]', {
      content: messageData.content?.substring(0, 30) + '...',
      senderId,
      senderType: messageData.senderType,
      messageSource: messageData.messageSource,
      currentUserId: this.data.userId,
      isOwn,
      position: isOwn ? '右边(用户)' : '左边(客服)',
      判断依据: messageData.messageSource
        ? 'messageSource'
        : messageData.senderType
          ? 'senderType'
          : 'senderId',
      后端版本: 'v2.0.1'
    })

    const newMessage = {
      id: messageData.id || `msg_${Date.now()}`,
      content: messageData.content,
      messageType: messageData.messageType || 'text',
      isOwn,
      // 修复：使用正确计算的isOwn值
      status: isOwn ? 'sent' : 'read',
      timestamp: messageData.timestamp || Date.now(),
      timeText: formatDateMessage(messageData.timestamp || Date.now()),
      showTime: this.shouldShowTime(messageData.timestamp || Date.now()),
      attachments: messageData.attachments || [],
      // 新增：保留原始数据用于调试
      _debug: {
        originalSenderId: messageData.senderId,
        senderInfo: messageData.senderInfo,
        senderType: messageData.senderType
      }
    }

    const messages = [...this.data.messages, newMessage]
    this.setData({
      messages,
      scrollToBottom: true
    })

    // 如果是对方发送的消息，更新会话预览
    if (!newMessage.isOwn) {
      this.updateSessionPreview(messageData.content)
    }
  },

  // 判断是否显示时间
  shouldShowTime(timestamp) {
    const messages = this.data.messages
    if (messages.length === 0) {
      return true
    }

    // 注意：现在消息已按时间排序（最早的在前，最新的在后）
    // 获取最后一条消息（最新的消息）的时间戳
    const lastMessage = messages[messages.length - 1]

    // 修复：应该比较当前消息与上一条消息的时间间隔
    // 如果当前消息比最后一条消息新超过5分钟，则显示时间
    const timeDiff = Math.abs(timestamp - lastMessage.timestamp)

    console.log('⏰ 时间显示判断:', {
      当前消息时间: new Date(timestamp).toLocaleTimeString(),
      最后消息时间: new Date(lastMessage.timestamp).toLocaleTimeString(),
      时间差: Math.floor(timeDiff / TIME.MINUTE) + '分钟',
      // 5分钟
      是否显示时间: timeDiff > TIME.MINUTE * 5
    })

    // 5分钟间隔显示时间
    return timeDiff > 300000
  },

  // 更新会话预览
  updateSessionPreview(content) {
    if (this.data.currentChatType === 'customer-service') {
      this.setData({
        customerServicePreview: content,
        customerServiceUnread: this.data.showChatModal ? 0 : this.data.customerServiceUnread + 1
      })
      this.updateTotalUnreadCount()
    }
  },

  // 处理输入状态指示器
  handleTypingIndicator(data) {
    this.setData({
      showTypingIndicator: data.isTyping,
      typingUser: data.userName
    })

    if (data.isTyping) {
      setTimeout(() => {
        this.setData({ showTypingIndicator: false })
      }, DELAY.RETRY)
    }
  },

  // 更新会话状态
  updateSessionStatus(data) {
    this.setData({ sessionStatus: data.status })
  },

  // 输入内容变化
  onInputChange(e) {
    console.log('⌨️ [调试] 输入框内容变化', e.detail.value)
    this.setData({ inputContent: e.detail.value })
    console.log('⌨️ [调试] 更新后的inputContent:', this.data.inputContent)
  },

  // 输入框获得焦点
  onInputFocus() {
    console.log('⌨️ [调试] 输入框获得焦点')
    this.setData({
      inputFocused: true,
      scrollToBottom: true
    })
  },

  // 输入框失去焦点
  onInputBlur() {
    console.log('⌨️ [调试] 输入框失去焦点')
    this.setData({ inputFocused: false })
  },

  // 发送消息
  async sendMessage() {
    const content = this.data.inputContent.trim()

    if (!content) {
      showToast('请输入消息内容')
      return
    }

    // 检查sessionId是否存在
    if (!this.data.sessionId && this.data.currentChatType === 'customer-service') {
      showToast('会话连接中，请稍后重试')
      return
    }

    console.log('📨 [发送消息]', content.substring(0, 30) + '...')

    // 创建消息对象
    const message = {
      id: `local_${Date.now()}`,
      content,
      messageType: 'text',
      isOwn: true,
      status: 'sending',
      timestamp: Date.now(),
      timeText: formatDateMessage(Date.now()),
      showTime: this.shouldShowTime(Date.now())
    }

    try {
      // 立即更新本地消息列表
      const messages = [...this.data.messages, message]
      this.setData({
        messages,
        inputContent: '',
        scrollToBottom: true
      })

      // 对于客服聊天，同时使用API和WebSocket发送消息
      if (this.data.currentChatType === 'customer-service' && this.data.sessionId) {
        // 1. 通过API发送消息（确保存储到数据库）
        try {
          const apiResult = await API.sendChatMessage({
            sessionId: this.data.sessionId,
            content,
            messageType: 'text',
            tempMessageId: message.id,
            // 配合后端v2.0.1：明确标识消息来源为用户端
            messageSource: 'user_client',
            // 配合后端v2.0.1：强制设置为用户消息
            senderType: 'user'
          })

          if (apiResult.success) {
            console.log('✅ [调试] API消息发送成功', apiResult.data)

            // 更新消息状态为已发送
            const updatedMessages = this.data.messages.map(msg =>
              msg.id === message.id
                ? {
                  ...msg,
                  status: 'sent',
                  id: apiResult.data.messageId || msg.id
                }
                : msg
            )
            this.setData({ messages: updatedMessages })
          } else {
            console.error('❌ [调试] API消息发送失败', apiResult.message)
            throw new Error(apiResult.message || 'API发送失败')
          }
        } catch (apiError) {
          console.error('❌ [调试] API发送消息出错', apiError)
          // API失败不影响WebSocket发送，继续执行
        }

        // 2. 通过WebSocket发送消息（实时通知）
        if (this.websocket && this.data.wsConnected) {
          console.log('⌨️ [调试] 准备发送WebSocket消息')

          const wsMessage = {
            type: 'send_message',
            sessionId: this.data.sessionId,
            content,
            messageType: 'text',
            // 配合后端v2.0.1：标识消息来源为用户端
            messageSource: 'user_client',
            senderType: 'user'
          }

          console.log('⌨️ [调试] WebSocket消息内容:', wsMessage)

          try {
            this.websocket.send({
              data: JSON.stringify(wsMessage)
            })
            console.log('✅ [调试] WebSocket消息发送成功')
          } catch (wsError) {
            console.error('❌ [调试] WebSocket发送失败', wsError)
            // WebSocket失败不影响整体发送流程
          }
        } else {
          console.log('⚠️ [调试] WebSocket未连接，跳过实时发送')
        }
      } else {
        // 🔴 V4.0修正: 非客服类型的聊天暂未实现，明确提示用户
        console.warn('⚠️ 非客服聊天功能暂未实现，等待后端API开发')
        showToast({
          title: '该聊天类型暂未开放',
          icon: 'none'
        })

        // 移除未发送成功的消息
        const updatedMessages = this.data.messages.filter(msg => msg.id !== message.id)
        this.setData({ messages: updatedMessages })
      }
    } catch (error) {
      console.error('❌ [调试] sendMessage函数执行出错:', error)
      showToast('发送消息时出现错误')

      // 更新消息状态为失败
      const updatedMessages = this.data.messages.map(msg =>
        msg.id === message.id ? { ...msg, status: 'failed' } : msg
      )
      this.setData({ messages: updatedMessages })
    }
  },

  // 🔴 V4.0修正: 删除模拟消息回复函数
  // 原函数违反项目规则"不使用mock数据、模拟数据"
  // 如需支持非客服类型聊天，应等待后端提供相应API
  // simulateMessageResponse 函数已删除

  // 发送图片
  sendImage() {
    console.log('📷 发送图片')
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: res => {
        // 处理图片上传
        this.uploadImage(res.tempFilePaths[0])
      }
    })
  },

  // 上传图片
  async uploadImage(filePath) {
    // 💡 loading由APIClient自动处理，无需手动showLoading

    try {
      // 🔴 V4.0修正: 使用真实的图片上传API（V4.0文档 Line 70）
      const uploadResult = await API.uploadImage(filePath, 'chat', '聊天图片')

      if (uploadResult.success && uploadResult.data) {
        const message = {
          id: `img_${Date.now()}`,
          content: '[图片]',
          messageType: 'image',
          isOwn: true,
          status: 'sent',
          timestamp: Date.now(),
          timeText: formatDateMessage(Date.now()),
          showTime: this.shouldShowTime(Date.now()),
          // 🔴 使用真实上传后的图片URL
          attachments: [{ url: uploadResult.data.url || filePath }]
        }

        const messages = [...this.data.messages, message]
        this.setData({
          messages,
          scrollToBottom: true
        })
      } else {
        throw new Error('图片上传失败')
      }
    } catch (error) {
      // 💡 loading由APIClient自动处理，无需手动hideLoading
      console.error('❌ 图片上传失败:', error)
      showToast({
        title: '图片上传失败',
        icon: 'error'
      })
    }
  },

  // 发送位置
  sendLocation() {
    console.log('📍 发送位置')
    wx.chooseLocation({
      success: res => {
        const message = {
          id: `loc_${Date.now()}`,
          content: `[位置] ${res.name}`,
          messageType: 'location',
          isOwn: true,
          status: 'sent',
          timestamp: Date.now(),
          timeText: formatDateMessage(Date.now()),
          showTime: this.shouldShowTime(Date.now()),
          location: res
        }

        const messages = [...this.data.messages, message]
        this.setData({
          messages,
          scrollToBottom: true
        })
      }
    })
  },

  // 发送文件
  sendFile() {
    console.log('📎 发送文件')
    showToast('文件发送功能开发中')
  },

  // 预览图片
  previewImage(e) {
    const src = e.currentTarget.dataset.src
    wx.previewImage({
      urls: [src],
      current: src
    })
  },

  // 显示聊天菜单
  showChatMenu() {
    console.log('☰ 显示聊天菜单')
    wx.showActionSheet({
      itemList: ['清空聊天记录', '查看会话信息', '举报'],
      success: res => {
        switch (res.tapIndex) {
          case 0:
            this.clearChatHistory()
            break
          case 1:
            this.showSessionInfo()
            break
          case 2:
            this.reportChat()
            break
          default:
            // 无效的选项索引
            break
        }
      }
    })
  },

  // 清空聊天记录
  clearChatHistory() {
    wx.showModal({
      title: '清空聊天记录',
      content: '确定要清空当前聊天记录吗？',
      success: res => {
        if (res.confirm) {
          this.setData({ messages: [] })
          showToast('聊天记录已清空')
        }
      }
    })
  },

  // 显示会话信息
  showSessionInfo() {
    wx.showModal({
      title: '会话信息',
      content: `会话类型：${this.data.currentChatName}\n状态：${this.data.isOnline ? '在线' : '离线'}`,
      showCancel: false
    })
  },

  // 举报聊天
  reportChat() {
    showToast('举报功能开发中')
  },

  // 新增：遮罩层点击事件 - 只有点击遮罩层本身才关闭弹窗
  onModalMaskTap(e) {
    // 只有当点击的是遮罩层本身（不是子元素）时才关闭弹窗
    if (e.target === e.currentTarget) {
      console.log('🔒 点击遮罩层，关闭聊天弹窗')
      this.closeChatModal()
    }
  },

  // 新增：弹窗内容区域点击事件 - 阻止事件冒泡
  onModalContentTap(e) {
    console.log('🔒 点击弹窗内容区域，阻止关闭')
    // 阻止事件冒泡到遮罩层，这样点击内容区域不会关闭弹窗
    // 这个函数存在就足够了，catchtap会自动阻止冒泡
  },

  // 新增：消息区域点击事件 - 阻止事件冒泡
  onMessagesAreaTap(e) {
    console.log('💬 点击消息区域，阻止关闭')
    // 阻止事件冒泡
  },

  // 新增：输入区域点击事件 - 阻止事件冒泡
  onInputAreaTap(e) {
    console.log('📝 点击输入区域，阻止关闭')
    // 阻止事件冒泡，确保点击输入区域不会关闭弹窗
  },

  // 新增：输入工具栏点击事件 - 阻止事件冒泡
  onInputToolbarTap(e) {
    console.log('⌨️ 点击输入工具栏，阻止关闭')
    // 阻止事件冒泡
  },

  // 新增：输入框包装器点击事件 - 阻止事件冒泡
  onInputWrapperTap(e) {
    console.log('📝 点击输入框包装器，阻止关闭')
    // 阻止事件冒泡
  },

  // 新增：输入框点击事件 - 阻止事件冒泡
  onTextareaTap(e) {
    console.log('📝 点击输入框，阻止关闭')
    // 阻止事件冒泡，确保点击输入框不会关闭弹窗
  },

  // 新增：发送按钮包装器点击事件 - 阻止事件冒泡
  onSendWrapperTap(e) {
    console.log('📨 点击发送按钮区域，阻止关闭')
    // 阻止事件冒泡
  },

  // 新增：内置发送按钮点击事件 - 阻止事件冒泡
  onInlineSendTap(e) {
    console.log('⌨️ [调试] 内置发送按钮被点击')
    console.log('⌨️ [调试] 点击事件对象:', e)
    console.log('⌨️ [调试] 当前输入内容:', this.data.inputContent)
    console.log(
      '⌨️ [调试] 输入内容长度:',
      this.data.inputContent ? this.data.inputContent.length : 0
    )
    console.log(
      '⌨️ [调试] 输入内容trim后:',
      this.data.inputContent ? this.data.inputContent.trim() : ''
    )
    console.log(
      '⌨️ [调试] 按钮应该是的状态:',
      this.data.inputContent && this.data.inputContent.trim() ? 'active' : 'inactive'
    )
    console.log('⌨️ [调试] 阻止事件冒泡，防止关闭弹窗')

    // 阻止事件冒泡，防止关闭弹窗（catchtap自动处理）
    // 直接调用发送消息函数
    console.log('⌨️ [调试] 准备调用sendMessage函数')
    this.sendMessage()
  }
})
