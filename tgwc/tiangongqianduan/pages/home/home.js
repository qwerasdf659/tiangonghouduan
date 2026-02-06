// pages/home/home.js - 首页逻辑
const app = getApp()
// 使用统一的工具函数导入 v2.1（修复小程序路径解析问题）
const { Wechat, API } = require('../../utils/index')
const { showToast } = Wechat

/**
 * 首页 - 餐厅积分抽奖系统v2.0
 * 📊 完全符合产品功能结构描述文档v2.0
 * 🛠️ 支持多业务线分层存储架构
 * 🔧 融合旧项目UI功能，提供完整用户体验
 *
 * 💡 新业务流程（2025更新）：
 * 1. 用户消费后打开小程序，展示身份二维码
 * 2. 商家扫描用户二维码，在商家端输入消费金额
 * 3. 提交后进入审核状态，积分冻结
 * 4. 平台工作人员24小时内审核
 * 5. 审核通过后，冻结积分转为可用积分
 */
Page({
  /**
   * 页面的初始数据
   *
   * 📊 数据结构说明：
   * - 用户信息：从app.globalData同步
   * - 积分数据：从后端API getPointsBalance获取
   * - 抽奖配置：从后端API getLotteryConfig获取
   * - 系统公告：从后端API getHomeAnnouncements获取
   */
  data: {
    // ========== 用户基础信息（从app.globalData同步）==========
    userInfo: null, // 用户信息对象（包含user_id, nickname, mobile, is_admin等字段）
    isLoggedIn: false, // 用户登录状态（true表示已登录且Token有效）

    // ========== 系统状态（用于判断后端服务可用性）==========
    systemReady: false, // 系统就绪状态（后端服务是否正常，默认true）
    backendConnected: false, // 后端连接状态（API是否可访问，默认true）

    // ========== 积分信息（从后端API getPointsBalance获取）==========
    pointsBalance: 0, // 当前可用积分余额（从API response.data.available_points获取）
    todayEarned: 0, // 今日获得积分总数（从API response.data.todayEarned获取）
    totalEarned: 0, // 历史累计获得积分总数（从API response.data.totalEarned获取）

    // ========== 抽奖配置（从后端API getLotteryConfig获取）==========
    lotteryConfig: {
      dailyFreeCount: 3, // 每日免费抽奖次数（后端配置，开发环境默认3次）
      usedFreeCount: 0, // 今日已使用免费次数（从后端实时获取，用于显示剩余次数）
      nextFreeTime: null // 下次免费抽奖时间（用于倒计时显示，格式：ISO 8601时间字符串）
    },

    // ========== 快捷功能入口（UI配置，前端定义）==========
    quickActions: [
      {
        name: '🎁 抽奖', // 功能名称（带emoji图标）
        path: '/pages/lottery/lottery', // 跳转路径（TabBar页面）
        description: '每日抽奖赢积分' // 功能描述
      },
      {
        name: '🔍 发现', // 功能名称
        path: '/pages/camera/camera', // 跳转路径（普通页面）
        description: '精彩内容等你探索' // 功能描述
      },
      {
        name: '🎁 兑换', // 功能名称
        path: '/pages/exchange/exchange', // 跳转路径（TabBar页面）
        description: '积分兑换好礼' // 功能描述
      },
      {
        name: '👤 我的', // 功能名称
        path: '/pages/user/user', // 跳转路径（TabBar页面）
        description: '个人中心' // 功能描述
      }
    ],

    // ========== 系统公告（从后端API getHomeAnnouncements获取）==========
    announcements: [], // 首页公告列表（展示重要通知、活动信息等，数组为空表示无公告或未加载）

    // ========== 页面状态 ==========
    loading: true, // 页面加载状态（true表示正在加载数据，false表示加载完成）
    refreshing: false, // 下拉刷新状态（true表示正在刷新，false表示刷新完成）

    // ========== 欢迎界面状态（首次访问或未登录用户显示）==========
    showWelcomeModal: false, // 是否显示欢迎弹窗（false使用showModal替代，true显示自定义弹窗）
    isFirstVisit: true, // 是否首次访问（基于本地存储判断，用于显示引导）

    // ========== 登录提示状态（用户未登录时显示）==========
    showLoginPrompt: false // 是否显示登录提示（true表示需要显示登录引导）
  },

  /**
   * 生命周期函数 - 监听页面加载
   *
   * @description
   * 页面首次加载时调用，执行初始化操作：
   * 1. 初始化登录提示标记（避免重复显示）
   * 2. 调用initializePage()进行页面数据加载
   *
   * @param {object} options - 页面参数对象
   * @param {string} [options.scene] - 场景值（如扫码进入、分享进入等）
   * @param {String} [options.referrer] - 来源页面信息
   * @returns {void}
   *
   * @example
   * // 微信小程序自动调用
   * onLoad({ scene: '1001' })
   */
  onLoad(options) {
    console.log('🏠 首页加载', options)
    // 初始化登录提示标记（防止重复显示登录弹窗）
    this.loginPromptShown = false
    this.initializePage()
  },

  /**
   * 生命周期函数 - 监听页面显示
   *
   * @description
   * 每次页面显示时调用（包括从后台切换到前台），执行以下操作：
   * 1. 检查是否从登录页面返回，重置登录提示标记
   * 2. 检查用户登录状态，同步全局数据
   * 3. 注册状态变化监听器
   * 4. 根据情况显示欢迎弹窗
   *
   * @returns {void}
   *
   * @example
   * // 微信小程序自动调用（页面显示时）
   * onShow()
   */
  onShow() {
    console.log('🏠 首页显示')

    // 检查是否从登录相关页面返回
    const pages = getCurrentPages()
    const prevPage = pages.length > 1 ? pages[pages.length - 2] : null
    const isFromAuthPage =
      prevPage && (prevPage.route.includes('auth') || prevPage.route.includes('login'))

    if (isFromAuthPage) {
      console.log('🔧 从登录页面返回，重置登录提示标记')
      this.loginPromptShown = false
    }

    // 检查用户状态和刷新数据
    this.checkLoginStatus()
    this.registerStatusListener()

    // 如果页面已加载完成且从非认证页面进入，可能需要显示欢迎弹窗
    if (!this.data.loading && !isFromAuthPage) {
      this.showWelcomeModalIfNeeded()
    }
  },

  /**
   * 生命周期函数 - 监听页面隐藏
   *
   * @description
   * 页面隐藏时调用（如切换到其他页面、进入后台），
   * 执行清理操作：取消状态变化监听器，避免内存泄漏
   *
   * @returns {void}
   *
   * @example
   * // 微信小程序自动调用（页面隐藏时）
   * onHide()
   */
  onHide() {
    this.unregisterStatusListener()
  },

  /**
   * 注册状态变化监听器
   *
   * @description
   * 注册全局状态变化监听器，当用户登录状态改变时自动更新页面数据。
   * 使用场景：用户从登录页面返回后，自动刷新首页数据。
   *
   * 业务逻辑：
   * 1. 检查是否已存在监听器（避免重复注册）
   * 2. 创建监听器回调函数
   * 3. 根据登录状态更新页面数据和UI
   * 4. 将监听器添加到app.statusListeners数组
   *
   * @returns {void}
   *
   * @example
   * // 页面显示时注册监听器
   * this.registerStatusListener()
   */
  registerStatusListener() {
    if (this.statusChangeHandler) {
      return
    }

    this.statusChangeHandler = data => {
      console.log('📡 首页收到状态变化通知:', data)

      if (data.isLoggedIn) {
        this.setData({
          isLoggedIn: true,
          userInfo: data.userInfo,
          showLoginPrompt: false
        })
        this.loginPromptShown = false
        console.log('✅ 首页状态已更新为已登录')
        // 已登录用户加载完整数据
        this.loadPageData()
      } else {
        this.setData({
          isLoggedIn: false,
          userInfo: null,
          showLoginPrompt: true
        })
        this.loginPromptShown = false
        console.log('📝 首页状态已更新为未登录')
      }
    }

    if (app.statusListeners) {
      app.statusListeners.push(this.statusChangeHandler)
    } else {
      app.statusListeners = [this.statusChangeHandler]
    }
  },

  /**
   * 移除状态变化监听器
   *
   * @description
   * 取消注册全局状态变化监听器，避免内存泄漏。
   * 在页面隐藏(onHide)时调用，清理监听器资源。
   *
   * 业务逻辑：
   * 1. 检查监听器是否存在
   * 2. 从app.statusListeners数组中移除
   * 3. 将监听器引用设置为null
   *
   * @returns {void}
   *
   * @example
   * // 页面隐藏时移除监听器
   * this.unregisterStatusListener()
   */
  unregisterStatusListener() {
    if (this.statusChangeHandler && app.statusListeners) {
      const index = app.statusListeners.indexOf(this.statusChangeHandler)
      if (index > -1) {
        app.statusListeners.splice(index, 1)
      }
      this.statusChangeHandler = null
    }
  },

  /**
   * 初始化页面
   *
   * @description
   * 页面初始化的核心方法，执行完整的初始化流程：
   * 1. 显示加载提示
   * 2. 检查系统状态（后端服务是否可用）
   * 3. 检查用户登录状态（Token是否有效）
   * 4. 根据登录状态加载相应数据：
   *    - 已登录：加载完整数据（积分、抽奖配置、公告等）
   *    - 未登录：显示默认数据和登录提示
   * 5. 隐藏加载提示，显示欢迎弹窗
   *
   * @async
   * @returns {Promise<void>}
   *
   * @throws {Error} 页面初始化失败时抛出错误
   *
   * @example
   * // 页面加载时调用
   * await this.initializePage()
   */
  async initializePage() {
    try {
      // 💡 loading由各API调用自动处理，无需手动showLoading

      // 检查系统状态
      this.checkSystemStatus()

      // 检查登录状态
      const loginStatus = this.checkLoginStatus()

      if (loginStatus) {
        // 已登录用户：加载完整数据
        await this.loadPageData()
      } else {
        // 未登录用户：显示默认数据和登录提示
        this.setData({
          pointsBalance: 0,
          todayEarned: 0,
          totalEarned: 0,
          showLoginPrompt: true
        })
      }
    } catch (error) {
      console.error('❌ 首页初始化失败', error)
      showToast('页面加载失败，请重试')
    } finally {
      // 💡 loading由APIClient自动处理，无需手动hideLoading
      this.setData({ loading: false })

      // 页面初始化完成后，检查是否需要显示欢迎弹窗
      this.showWelcomeModalIfNeeded()
    }
  },

  /**
   * 检查系统状态
   *
   * @description
   * 检查后端服务是否可用，判断系统就绪状态。
   * 简化版检查：检查app.globalData.baseUrl是否存在，默认为true。
   *
   * 业务逻辑：
   * - systemReady: 系统是否就绪（后端服务是否配置）
   * - backendConnected: 后端是否连接（与systemReady保持一致）
   *
   * @returns {void}
   *
   * @example
   * // 页面初始化时检查系统状态
   * this.checkSystemStatus()
   */
  checkSystemStatus() {
    // 简化检查，默认为true（生产环境应实现完整的健康检查）
    const systemReady = !!app.globalData.baseUrl || true
    const backendConnected = systemReady

    this.setData({
      systemReady, // 系统就绪状态
      backendConnected // 后端连接状态
    })
  },

  /**
   * 检查用户登录状态
   *
   * @description
   * 从app.globalData同步用户登录状态和用户信息到页面。
   * 用于页面显示时更新登录状态，保持数据同步。
   *
   * 业务逻辑：
   * 1. 从app.globalData获取isLoggedIn和access_token
   * 2. 判断登录状态：需要同时满足isLoggedIn=true且存在有效Token
   * 3. 获取用户信息对象
   * 4. 更新页面data，控制登录提示显示
   *
   * @returns {boolean} 是否已登录（true表示已登录且Token有效）
   *
   * @example
   * // 页面显示时检查登录状态
   * const isLoggedIn = this.checkLoginStatus()
   * if (!isLoggedIn) {
   *   console.log('用户未登录')
   * }
   */
  checkLoginStatus() {
    const globalData = app.globalData
    const isLoggedIn = globalData.isLoggedIn && globalData.access_token
    const userInfo = globalData.userInfo

    console.log('🔍 首页检查登录状态', {
      isLoggedIn,
      hasUserInfo: !!userInfo,
      hasToken: !!globalData.access_token
    })

    this.setData({
      isLoggedIn,
      userInfo,
      showLoginPrompt: !isLoggedIn
    })

    return isLoggedIn
  },

  /**
   * 显示欢迎弹窗（页面初始化完成后调用）
   *
   * @description
   * 智能判断是否需要显示欢迎登录弹窗，避免重复显示。
   *
   * 业务逻辑：
   * 1. 检查用户登录状态
   * 2. 检查是否已显示过弹窗（loginPromptShown标记）
   * 3. 检查当前页面路径（避免在登录页显示）
   * 4. 满足条件时显示欢迎Modal，引导用户登录
   *
   * 显示条件：
   * - 用户未登录
   * - 本次会话未显示过
   * - 当前不在登录相关页面
   *
   * @returns {void}
   *
   * @example
   * // 页面初始化完成后调用
   * this.showWelcomeModalIfNeeded()
   */
  showWelcomeModalIfNeeded() {
    const globalData = app.globalData
    const isLoggedIn = globalData.isLoggedIn && globalData.access_token

    // 未登录用户显示登录提示框（优化显示时机）
    if (!isLoggedIn && !this.loginPromptShown) {
      // 检查当前页面路径，避免在登录相关页面弹出提示
      const pages = getCurrentPages()
      const currentPage = pages[pages.length - 1]
      const currentRoute = currentPage ? currentPage.route : ''

      if (!currentRoute.includes('auth') && !currentRoute.includes('login')) {
        this.loginPromptShown = true

        // 页面初始化完成后立即显示弹窗，确保同步体验
        wx.showModal({
          title: '欢迎使用',
          content: '请先登录以享受完整功能\n\n🎁 抽奖赢积分\n📷 拍照获奖励\n🎁 积分换好礼',
          confirmText: '立即登录',
          cancelText: '稍后',
          confirmColor: '#FF6B35',
          success: res => {
            if (res.confirm) {
              this.navigateToLogin()
            }
          }
        })
      }
    }
  },

  /**
   * 加载页面数据（已登录用户专用）
   *
   * @description
   * 并行加载首页所需的所有数据，提升加载速度。
   * 使用Promise.all并行请求，减少总耗时。
   *
   * 加载的数据包括：
   * 1. 积分数据（余额、今日获得、历史总计）
   * 2. 抽奖配置（免费次数、已使用次数、下次时间）
   * 3. 系统公告（首页公告列表）
   *
   * 数据来源：
   * - loadPointsData() -> API getPointsBalance
   * - loadLotteryConfig() -> API getLotteryConfig
   * - loadAnnouncementsData() -> API getHomeAnnouncements
   *
   * @async
   * @returns {Promise<void>}
   *
   * @throws {Error} 数据加载失败时抛出错误
   *
   * @example
   * // 用户登录后加载数据
   * if (isLoggedIn) {
   *   await this.loadPageData()
   * }
   */
  async loadPageData() {
    try {
      // 并行加载所有数据
      const [pointsResult, lotteryResult, announcementsResult] = await Promise.all([
        this.loadPointsData(),
        this.loadLotteryConfig(),
        // 新增：从后端加载公告数据
        this.loadAnnouncementsData()
      ])

      // 处理积分数据
      if (pointsResult.success) {
        this.setData({
          pointsBalance: pointsResult.data.available_points || 0,
          todayEarned: pointsResult.data.todayEarned || 0,
          totalEarned: pointsResult.data.totalEarned || 0
        })
      }

      // 处理抽奖配置
      if (lotteryResult.success) {
        this.setData({
          lotteryConfig: {
            dailyFreeCount: lotteryResult.data.dailyFreeCount || 3,
            usedFreeCount: lotteryResult.data.usedFreeCount || 0,
            nextFreeTime: lotteryResult.data.nextFreeTime || null
          }
        })
      }

      // 处理公告数据
      if (announcementsResult.success) {
        this.setData({
          announcements: announcementsResult.data.announcements || []
        })
      } else {
        // API缺失时显示明确错误提示，不提供默认内容
        console.error('🚨 API缺失：api/v4/system/announcements 接口未实现')
        this.setData({
          // 空数组，让UI显示"暂无公告"状态
          announcements: [],
          announcementError: 'API接口缺失：api/v4/system/announcements 尚未实现'
        })
      }

      console.log('✅ 首页数据加载完成')
    } catch (error) {
      console.error('❌ 加载页面数据失败:', error)
      showToast('数据加载失败，请重试')
    }
  },

  /**
   * 加载积分数据
   *
   * @description
   * 从后端API获取用户积分数据，包括当前余额、今日获得、历史总计。
   * ✅ V4.2: 统一为直接调用API方法，不使用callApi封装。
   *
   * API接口: getPointsBalance
   * 文档位置: V4.0文档 Line 1312-1364
   *
   * @async
   * @returns {Promise<Object>} API响应对象 { success, data: { balance, todayEarned, totalEarned } }
   *
   * @example
   * const result = await this.loadPointsData()
   * if (result.success) {
   *   const { balance } = result.data
   * }
   */
  async loadPointsData() {
    // ✅ 直接调用API方法
    const { getPointsBalance } = API
    const result = await getPointsBalance()

    return result
  },

  /**
   * 加载抽奖配置
   *
   * @description
   * 从后端API获取抽奖配置数据，包括每日免费次数、已使用次数等。
   * ✅ V4.2: 统一为直接调用API方法，不使用callApi封装。
   *
   * API接口: getLotteryConfig
   * 文档位置: V4.0文档 Line 1256-1299
   * 参数: campaign_code='BASIC_LOTTERY' (基础抽奖活动代码)
   *
   * @async
   * @returns {Promise<Object>} API响应对象 { success, data: { dailyFreeCount, usedFreeCount, nextFreeTime } }
   *
   * @example
   * const result = await this.loadLotteryConfig()
   * if (result.success) {
   *   const { dailyFreeCount } = result.data
   * }
   */
  async loadLotteryConfig() {
    // ✅ 直接调用API方法
    const { getLotteryConfig } = API
    const result = await getLotteryConfig('BASIC_LOTTERY')

    return result
  },

  /**
   * 加载系统公告数据
   *
   * @description
   * 从后端API获取首页公告列表，展示重要通知和活动信息。
   * ✅ V4.2: 统一为直接调用API方法，不使用callApi封装。
   *
   * API接口: getHomeAnnouncements
   * 文档位置: V4.0文档 Line 2640-2665
   *
   * @async
   * @returns {Promise<Object>} API响应对象 { success, data: { announcements: [] } }
   *
   * @example
   * const result = await this.loadAnnouncementsData()
   * if (result.success) {
   *   const { announcements } = result.data
   * }
   */
  async loadAnnouncementsData() {
    // ✅ 直接调用API方法
    const { getHomeAnnouncements } = API
    const result = await getHomeAnnouncements()

    return result
  },

  /**
   * 快捷功能点击事件处理
   *
   * @description
   * 处理首页快捷功能入口的点击事件，根据登录状态跳转到对应页面。
   *
   * 业务逻辑：
   * 1. 检查用户登录状态
   * 2. 未登录：显示登录提示Modal
   * 3. 已登录：根据页面类型选择跳转方式
   *    - TabBar页面：使用wx.switchTab
   *    - 普通页面：使用wx.navigateTo
   *
   * @param {Object} e - 微信小程序事件对象
   * @param {Object} e.currentTarget - 当前触发事件的元素
   * @param {Object} e.currentTarget.dataset - 数据集
   * @param {Object} e.currentTarget.dataset.action - 功能配置对象 { name, path, description }
   * @returns {void}
   *
   * @example
   * // WXML绑定
   * <view bindtap="onQuickActionTap" data-action="{{item}}">
   *   {{item.name}}
   * </view>
   */
  onQuickActionTap(e) {
    const action = e.currentTarget.dataset.action
    console.log('点击快捷功能:', action)

    // 检查是否需要登录
    if (!this.data.isLoggedIn) {
      wx.showModal({
        title: '需要登录',
        content: '请先登录后使用此功能',
        confirmText: '去登录',
        cancelText: '取消',
        confirmColor: '#FF6B35',
        success: res => {
          if (res.confirm) {
            this.navigateToLogin()
          }
        }
      })
      return
    }

    // 跳转到对应页面
    if (action && action.path) {
      // 根据路径类型选择跳转方式
      if (action.path.includes('lottery') || action.path.includes('exchange')) {
        // TabBar页面使用switchTab
        wx.switchTab({
          url: action.path,
          fail: error => {
            console.error('TabBar页面跳转失败:', error)
            // 如果switchTab失败，尝试navigateTo
            wx.navigateTo({
              url: action.path,
              fail: navError => {
                console.error('页面跳转失败:', navError)
                showToast('跳转失败，请重试')
              }
            })
          }
        })
      } else {
        // 普通页面使用navigateTo
        wx.navigateTo({
          url: action.path,
          fail: error => {
            console.error('页面跳转失败:', error)
            showToast('跳转失败，请重试')
          }
        })
      }
    }
  },

  /**
   * 跳转到登录页面
   *
   * @description
   * 处理登录按钮点击，跳转到登录页面。
   * 设置登录提示已显示标记，避免重复弹窗。
   *
   * 业务逻辑：
   * 1. 设置loginPromptShown = true（标记已显示）
   * 2. 使用wx.navigateTo跳转到登录页
   * 3. 成功：记录日志
   * 4. 失败：重置标记，显示错误提示
   *
   * @returns {void}
   *
   * @example
   * // 登录按钮点击
   * this.navigateToLogin()
   */
  navigateToLogin() {
    this.loginPromptShown = true
    console.log('👆 用户点击登录按钮，跳转到登录页面')

    wx.navigateTo({
      url: '/pages/auth/auth',
      success: () => {
        console.log('✅ 成功跳转到登录页面')
      },
      fail: error => {
        console.error('❌ 跳转登录页面失败:', error)
        this.loginPromptShown = false
        showToast('跳转失败，请重试')
      }
    })
  },

  /**
   * 关闭欢迎弹窗
   *
   * @description
   * 关闭首页欢迎弹窗，用于用户主动关闭或点击操作后自动关闭。
   *
   * @returns {void}
   *
   * @example
   * // 关闭弹窗
   * this.closeWelcomeModal()
   */
  closeWelcomeModal() {
    this.setData({
      showWelcomeModal: false
    })
  },

  /**
   * 从欢迎界面跳转到登录页
   *
   * @description
   * 关闭欢迎弹窗并跳转到登录页面。
   * 注意：当前版本使用wx.showModal的回调直接跳转。
   *
   * @returns {void}
   *
   * @example
   * // 欢迎弹窗"立即登录"按钮
   * this.goToLoginFromWelcome()
   */
  goToLoginFromWelcome() {
    this.closeWelcomeModal()
    this.navigateToLogin()
  },

  /**
   * 下拉刷新事件处理
   *
   * @description
   * 处理页面下拉刷新操作，重新加载页面数据。
   *
   * 业务逻辑：
   * 1. 重新检查系统状态
   * 2. 如果已登录，重新加载页面数据
   * 3. 显示刷新成功提示
   * 4. 停止下拉刷新动画
   *
   * @async
   * @returns {Promise<void>}
   *
   * @example
   * // 微信小程序自动调用（用户下拉页面时）
   * await onPullDownRefresh()
   */
  async onPullDownRefresh() {
    console.log('🔄 首页下拉刷新')

    try {
      // 重新检查系统状态和用户状态
      this.checkSystemStatus()

      if (this.data.isLoggedIn) {
        await this.loadPageData()
      }

      showToast('刷新成功')
    } catch (error) {
      console.error('❌ 下拉刷新失败', error)
      showToast('刷新失败，请重试')
    } finally {
      wx.stopPullDownRefresh()
    }
  },

  /**
   * 分享给好友
   *
   * @description
   * 自定义分享给好友的内容，设置分享标题、路径和图片。
   * 微信小程序生命周期函数，用户点击右上角分享时调用。
   *
   * @returns {object} 分享配置对象
   * @returns {string} returns.title - 分享标题
   * @returns {string} returns.path - 分享路径（打开后跳转的页面）
   * @returns {String} returns.imageUrl - 分享图片URL
   *
   * @example
   * // 微信小程序自动调用（用户点击分享时）
   * const shareConfig = onShareAppMessage()
   */
  onShareAppMessage() {
    return {
      title: '餐厅积分抽奖系统 - 拍照赢积分', // 分享标题
      path: '/pages/lottery/lottery', // 分享路径（跳转到抽奖页面）
      imageUrl: '/images/share-banner.png' // 分享图片
    }
  },

  /**
   * 分享到朋友圈
   *
   * @description
   * 自定义分享到朋友圈的内容，设置分享标题和图片。
   * 微信小程序生命周期函数，用户点击右上角分享到朋友圈时调用。
   * 注意：需要在app.json中配置 "showShareTimeline": true
   *
   * @returns {object} 分享配置对象
   * @returns {string} returns.title - 分享标题
   * @returns {String} returns.imageUrl - 分享图片URL
   *
   * @example
   * // 微信小程序自动调用（用户分享到朋友圈时）
   * const shareConfig = onShareTimeline()
   */
  onShareTimeline() {
    return {
      title: '餐厅积分抽奖系统 - 积分兑好礼', // 分享标题
      imageUrl: '/images/share-banner.png' // 分享图片
    }
  },

  /**
   * 二维码生成成功回调
   *
   * @description
   * 当二维码组件生成成功时触发
   *
   * @param {Object} e - 事件对象
   * @param {Object} e.detail - 事件详情
   * @param {String} e.detail.image - 二维码图片路径
   * @param {Object} e.detail.userInfo - 用户信息
   */
  onQRCodeSuccess(e) {
    console.log('✅ 二维码生成成功:', e.detail)
  },

  /**
   * 二维码生成失败回调
   *
   * @description
   * 当二维码组件生成失败时触发
   *
   * @param {object} e - 事件对象
   * @param {object} e.detail - 事件详情
   * @param {String} e.detail.message - 错误信息
   */
  onQRCodeError(e) {
    console.error('❌ 二维码生成失败:', e.detail)
    showToast('二维码生成失败：' + e.detail.message)
  },

  /**
   * 二维码保存成功回调
   *
   * @description
   * 当用户保存二维码到相册成功时触发
   *
   * @param {object} e - 事件对象
   * @param {object} e.detail - 事件详情
   * @param {String} e.detail.filePath - 保存的文件路径
   */
  onQRCodeSaved(e) {
    console.log('💾 二维码已保存:', e.detail)
  }
})
