// pages/user/user.js - V4.0用户中心页面（完全符合V4.0统一引擎架构）
const app = getApp()
// 🔴 使用统一的工具函数导入（utils/index.js统一入口）
const { Wechat, API } = require('../../utils/index')
const { showToast, showLoading, hideLoading } = Wechat
// 💡 注：showLoading/hideLoading用于页面跳转，不是API调用

/**
 * V4.0用户中心页面 - 餐厅积分抽奖系统
 * 🎯 完全符合V4.0统一引擎架构
 * 🔴 功能说明：
 * - 我的积分（完整的积分展示和趋势）
 * - 我的统计（2x2网格布局，包含本月积分）
 * - 功能菜单（完整的功能导航）
 * - UUID角色系统（管理员权限识别）
 */
Page({
  data: {
    // 用户基础信息
    isLoggedIn: false,
    userInfo: null,
    // 🔴 新增：管理员权限标识
    isAdmin: false,

    // 积分信息 - 🔴 根据V4.0 API规范修正字段名
    totalPoints: 0,
    todayEarned: 0,
    todayConsumed: 0,
    totalEarned: 0,
    // 🔴 V4.0修正: total_spent → total_consumed（后端字段名变更）
    totalConsumed: 0,

    // 🗑️ V2.1：已删除VIP等级系统数据（vipLevelInfo、vipLevels等）

    // 🗑️ V2.1：已删除成就系统数据（achievements、unlockedAchievements、totalAchievements等）

    // 🔴 统计数据 - 根据旧项目的2x2网格设计
    statistics: {
      totalLottery: 0,
      totalExchange: 0,
      totalUpload: 0,
      // 🔴 新增：本月积分统计
      thisMonthPoints: 0,
      lotteryTrend: '→',
      exchangeTrend: '→',
      uploadTrend: '→',
      pointsTrend: '→'
    },

    // 🔴 功能菜单 - 根据旧项目的菜单设计
    menuItems: [
      {
        id: 'points-detail',
        name: '积分明细',
        description: '查看积分获得和消费记录',
        icon: '💰',
        color: '#4CAF50',
        type: 'page',
        url: '/pages/points-detail/points-detail'
      },
      {
        id: 'my-inventory',
        name: '我的库存',
        description: '管理已兑换商品库存',
        icon: '📦',
        color: '#00BCD4',
        type: 'page',
        url: '/pages/trade/inventory/inventory'
      },
      {
        id: 'trade-records',
        name: '交易记录',
        description: '查看完整交易历史记录',
        icon: '📊',
        color: '#3F51B5',
        type: 'page',
        url: '/pages/records/trade-upload-records/trade-upload-records?tab=0'
      },
      {
        id: 'upload-records',
        name: '上传记录',
        description: '查看拍照上传记录',
        icon: '📷',
        color: '#9C27B0',
        type: 'page',
        url: '/pages/records/trade-upload-records/trade-upload-records?tab=1'
      },
      {
        id: 'contact-service',
        name: '联系客服',
        description: '在线客服服务支持',
        icon: '📞',
        color: '#607D8B',
        type: 'action',
        action: 'onContactService'
      },
      {
        id: 'logout',
        name: '退出登录',
        description: '安全退出当前账号',
        icon: '🚪',
        color: '#F44336',
        type: 'action',
        action: 'logout'
      }
    ],

    // 页面状态
    loading: true,
    refreshing: false
  },

  // 🗑️ V2.1：已删除VIP等级计算系统（vipLevels数组、calculateVipLevel方法、updateVipLevelDisplay方法）

  /**
   * 生命周期函数 - 监听页面加载
   *
   * @description
   * 页面首次加载时调用，执行用户中心页面初始化操作。
   *
   * @param {object} options - 页面参数对象
   * @param {String} [options.scene] - 场景值
   * @returns {void}
   *
   * @example
   * // 微信小程序自动调用
   * onLoad({ scene: '1001' })
   */
  onLoad(options) {
    console.log('👤 用户中心页面加载 - v2.1（已移除成就和VIP等级）', options)
    this.initializePage()
  },

  /**
   * 生命周期函数 - 监听页面显示
   *
   * @description
   * 每次页面显示时调用，更新用户状态和数据。
   * 包括从其他页面返回、从后台切换到前台。
   *
   * @returns {void}
   *
   * @example
   * // 微信小程序自动调用
   * onShow()
   */
  onShow() {
    console.log('👤 用户中心页面显示')
    this.updateUserStatus()
    if (this.data.isLoggedIn) {
      this.refreshUserData()
    }
  },

  /**
   * 初始化用户中心页面
   *
   * @description
   * 页面初始化的核心方法，执行以下流程：
   * 1. 更新用户登录状态和基础信息
   * 2. 并行加载用户详细信息、统计数据、积分趋势
   * 3. 使用Promise.allSettled确保部分失败不影响整体
   * 4. 记录各项数据加载结果
   * 5. 异常处理：显示友好提示，支持下拉刷新
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
      // 🔧 安全更新用户状态
      this.updateUserStatus()

      // 🔧 如果用户未登录，直接返回，不进行数据加载
      if (!this.data.isLoggedIn) {
        console.log('👤 用户未登录，跳过数据加载')
        this.setData({ loading: false })
        return
      }

      console.log('👤 用户已登录，开始加载用户数据')

      // 🔧 分别处理各个数据加载，避免一个失败影响全部
      const loadPromises = [
        this.safeLoadUserInfo(),
        this.safeLoadUserStatistics(),
        this.safeLoadPointsTrend()
      ]

      // 🔧 等待所有数据加载完成（即使部分失败）
      const results = await Promise.allSettled(loadPromises)

      // 🔧 记录加载结果
      results.forEach((result, index) => {
        const taskNames = ['用户信息', '统计数据', '积分趋势']
        if (result.status === 'rejected') {
          console.warn(`⚠️ ${taskNames[index]}加载失败:`, result.reason)
        } else {
          console.log(`✅ ${taskNames[index]}加载成功`)
        }
      })

      // 🗑️ V2.1：已删除成就系统初始化调用（this.initAchievements()）

      console.log('✅ 用户中心页面初始化完成')
    } catch (error) {
      console.error('❌ 用户中心页面初始化失败', error)

      // 🔧 显示用户友好的错误信息
      wx.showToast({
        title: '页面加载失败，请下拉刷新',
        icon: 'none',
        duration: 3000
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 🔧 安全加载用户信息 - 增强错误处理
   */
  async safeLoadUserInfo() {
    try {
      return await this.loadUserInfo()
    } catch (error) {
      console.warn('⚠️ 用户信息加载失败:', error.message)
      // 使用缓存或默认数据
      return null
    }
  },

  /**
   * 🔧 安全加载用户统计 - 增强错误处理
   */
  async safeLoadUserStatistics() {
    try {
      return await this.loadUserStatistics()
    } catch (error) {
      console.warn('⚠️ 统计数据加载失败:', error.message)
      // 使用默认统计数据
      this.setData({
        statistics: {
          totalLottery: 0,
          totalExchange: 0,
          totalUpload: 0,
          thisMonthPoints: 0,
          lotteryTrend: '→',
          exchangeTrend: '→',
          uploadTrend: '→',
          pointsTrend: '→'
        }
      })
      return null
    }
  },

  /**
   * 🔧 安全加载积分趋势 - 增强错误处理
   */
  async safeLoadPointsTrend() {
    try {
      return await this.loadPointsTrend()
    } catch (error) {
      console.warn('⚠️ 积分趋势加载失败:', error.message)
      // 使用默认值
      this.setData({
        todayEarned: 0,
        todayConsumed: 0
      })
      return null
    }
  },

  /**
   * 刷新用户数据
   *
   * @description
   * 刷新用户中心的所有数据，用于页面显示时或下拉刷新时更新。
   *
   * 执行流程：
   * 1. 检查用户登录状态
   * 2. 并行刷新用户信息、统计数据、积分趋势
   * 3. 记录刷新结果（成功/失败）
   * 4. 根据成功情况给用户反馈
   *
   * @async
   * @returns {Promise<void>}
   *
   * @example
   * // 页面显示时刷新
   * this.refreshUserData()
   *
   * @example
   * // 下拉刷新
   * this.refreshUserData().finally(() => wx.stopPullDownRefresh())
   */
  async refreshUserData() {
    console.log('🔄 刷新用户数据开始...')

    try {
      // 🔧 如果用户未登录，直接返回
      if (!this.data.isLoggedIn) {
        console.log('👤 用户未登录，跳过数据刷新')
        return
      }

      // 🔧 设置刷新状态
      this.setData({ refreshing: true })

      // 🔧 更新用户状态（检查登录状态和权限）
      this.updateUserStatus()

      // 🔧 再次检查登录状态（可能在updateUserStatus中发生变化）
      if (!this.data.isLoggedIn) {
        console.log('👤 用户状态更新后发现未登录，停止数据刷新')
        return
      }

      // 🔧 并行刷新各类数据，提高加载速度
      const refreshPromises = [
        this.safeLoadUserInfo(),
        this.safeLoadUserStatistics(),
        this.safeLoadPointsTrend()
      ]

      // 🔧 等待所有数据刷新完成（即使部分失败也继续）
      const results = await Promise.allSettled(refreshPromises)

      // 🔧 记录刷新结果
      let successCount = 0
      results.forEach((result, index) => {
        const taskNames = ['用户信息', '统计数据', '积分趋势']
        if (result.status === 'fulfilled') {
          successCount++
          console.log(`✅ ${taskNames[index]}刷新成功`)
        } else {
          console.warn(`⚠️ ${taskNames[index]}刷新失败:`, result.reason)
        }
      })

      // 🗑️ V2.1：已删除成就系统刷新调用（this.initAchievements()）

      console.log(`✅ 用户数据刷新完成，成功项: ${successCount}/3`)

      // 🔧 根据成功情况给用户反馈
      if (successCount === 3) {
        // 全部成功，不显示toast，避免过度打扰
        console.log('🎉 所有数据刷新成功')
      } else if (successCount > 0) {
        // 部分成功
        wx.showToast({
          title: `数据已刷新 (${successCount}/3)`,
          icon: 'success',
          duration: 1500
        })
      } else {
        // 全部失败
        wx.showToast({
          title: '刷新失败，请检查网络',
          icon: 'none',
          duration: 2000
        })
      }
    } catch (error) {
      console.error('❌ 刷新用户数据时发生错误:', error)

      // 🔧 显示用户友好的错误信息
      wx.showToast({
        title: '数据刷新失败',
        icon: 'none',
        duration: 2000
      })
    } finally {
      // 🔧 清除刷新状态和loading状态
      // 🔴 修复：从管理员仪表板返回时，loading状态未被清除的问题
      this.setData({
        refreshing: false,
        loading: false
      })
      console.log('🔧 已清除loading和refreshing状态')
    }
  },

  /**
   * 🔴 更新用户状态 - 完全基于全局数据和后端API数据
   */
  /**
   * 更新用户登录状态
   *
   * @description
   * 从全局数据获取用户信息，更新页面的登录状态。
   * 同时检测用户是否为管理员（基于UUID角色系统）。
   *
   * UUID角色系统说明：
   * - 管理员角色通过user_role字段标识
   * - 或通过is_admin字段明确标识
   * - 管理员可访问管理后台和客服功能
   *
   * @returns {void}
   *
   * @example
   * // 页面显示时更新状态
   * this.updateUserStatus()
   */
  updateUserStatus() {
    const globalData = app.globalData

    // 🔧 修复：如果globalData.userInfo为空，尝试从Storage恢复
    let userInfo = globalData.userInfo
    if (!userInfo || !userInfo.user_id) {
      console.warn('⚠️ globalData.userInfo缺失，尝试从Storage恢复')
      userInfo = wx.getStorageSync('user_info')

      if (userInfo && userInfo.user_id) {
        // 恢复到globalData
        app.globalData.userInfo = userInfo
        console.log('✅ 从Storage恢复userInfo成功:', {
          user_id: userInfo.user_id,
          mobile: userInfo.mobile,
          nickname: userInfo.nickname
        })
      }
    }

    // 🔴 V4.0规范：使用统一的snake_case命名
    const isLoggedIn = globalData.isLoggedIn && globalData.access_token
    // 🔴 V4.0修复：使用UUID角色系统判断管理员权限
    const isAdmin = globalData.userRole === 'admin' || app.getUserRoleFromV4(userInfo) === 'admin'

    this.setData({
      isLoggedIn,
      userInfo,
      // 更新管理员权限标识
      isAdmin,
      // 🔴 V4.0规范
      totalPoints: globalData.points_balance || userInfo?.totalPoints || 0
    })

    console.log('👤 用户状态更新 (V4.0):', {
      isLoggedIn,
      isAdmin,
      userRole: globalData.userRole,
      userId: userInfo?.userId || userInfo?.user_id,
      totalPoints: this.data.totalPoints
    })
  },

  /**
   * 🔴 加载用户信息 - 使用新项目v2.0 API
   * ✅ V4.0修正：同时获取积分余额，确保数据一致性
   */
  async loadUserInfo() {
    try {
      const { getUserInfo, getPointsBalance } = API

      // 🔴 第1步：获取用户基本信息
      const result = await getUserInfo()

      if (result.success && result.data) {
        // 🔴 修复：提取user对象，避免嵌套结构覆盖globalData
        // API返回: {success: true, data: {user: {...}, timestamp: ...}}
        // 我们需要的是user对象，不是整个data对象
        const userInfo = result.data.user || result.data

        this.setData({
          userInfo
        })

        // 🔴 修复：不再调用updateUserInfo，避免覆盖登录时保存的完整用户信息
        // 登录时已经正确设置了包含权限字段的userInfo
        // app.updateUserInfo(userInfo)
        console.log('✅ 用户信息加载成功（不覆盖权限数据）')
      }

      // 🔴 第2步：获取用户积分余额（使用与抽奖页面相同的API）
      try {
        const balanceResult = await getPointsBalance()

        if (balanceResult && balanceResult.success && balanceResult.data) {
          const points = balanceResult.data.available_points || 0
          console.log('✅ 积分余额获取成功:', points)

          // 更新全局积分
          app.updatePointsBalance(points)

          // 更新页面显示
          this.setData({
            totalPoints: points
          })
        } else {
          console.warn('⚠️ 积分余额API返回失败，使用缓存值')
          this.setData({
            totalPoints: app.globalData.points_balance || 0
          })
        }
      } catch (pointsError) {
        console.error('❌ 获取积分余额异常:', pointsError)
        // 使用缓存值
        this.setData({
          totalPoints: app.globalData.points_balance || 0
        })
      }
    } catch (error) {
      console.error('❌ 加载用户信息失败', error)
    }
  },

  /**
   * 🔴 加载用户统计数据 - 根据旧项目的综合统计
   */
  async loadUserStatistics() {
    try {
      // 🔴 调用多个API获取综合统计数据
      const promises = [
        this.getLotteryStatistics(),
        this.getExchangeStatistics(),
        this.getUploadStatistics(),
        this.getPointsStatistics()
      ]

      const results = await Promise.allSettled(promises)

      // 🔴 合并统计结果
      const statistics = {
        totalLottery: 0,
        totalExchange: 0,
        totalUpload: 0,
        thisMonthPoints: 0,
        lotteryTrend: '→',
        exchangeTrend: '→',
        uploadTrend: '→',
        pointsTrend: '→'
      }

      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.success) {
          const data = result.value.data
          switch (index) {
          // 抽奖统计
          case 0:
            statistics.totalLottery = data.totalCount || 0
            statistics.lotteryTrend = data.trend || '→'
            break
            // 兑换统计
          case 1:
            statistics.totalExchange = data.totalCount || 0
            statistics.exchangeTrend = data.trend || '→'
            break
            // 上传统计
          case 2:
            statistics.totalUpload = data.totalCount || 0
            statistics.uploadTrend = data.trend || '→'
            break
            // 积分统计
          case 3:
            statistics.thisMonthPoints = data.thisMonthPoints || 0
            statistics.pointsTrend = data.trend || '→'
            break
          default:
            // 其他情况不处理
            break
          }
        }
      })

      this.setData({ statistics })
      console.log('✅ 用户统计数据加载成功:', statistics)
    } catch (error) {
      console.error('❌ 加载统计数据失败', error)
    }
  },

  /**
   * 🔴 获取抽奖统计数据
   */
  async getLotteryStatistics() {
    try {
      const { getLotteryHistory } = API
      const appInstance = getApp()
      const userId =
        appInstance.globalData.userInfo?.user_id || appInstance.globalData.userInfo?.userId

      if (!userId) {
        console.warn('⚠️ 未找到用户ID，无法获取抽奖统计')
        return { success: false }
      }

      // 只获取总数
      const result = await getLotteryHistory(userId, 1, 1)

      if (result.success) {
        return {
          success: true,
          data: {
            totalCount: result.data.pagination?.total || result.data.pagination?.totalCount || 0,
            trend: '→'
          }
        }
      }

      return { success: false }
    } catch (error) {
      console.warn('⚠️ 获取抽奖统计失败:', error)
      return { success: false }
    }
  },

  /**
   * 🔴 获取兑换统计数据
   */
  async getExchangeStatistics() {
    try {
      const { getExchangeRecords } = API
      const appInstance = getApp()
      const userId =
        appInstance.globalData.userInfo?.user_id || appInstance.globalData.userInfo?.userId

      if (!userId) {
        console.warn('⚠️ 未找到用户ID，无法获取兑换统计')
        return { success: false }
      }

      // 🔴 调用兑换记录API（只需第1页第1条，主要为了获取总数）
      const result = await getExchangeRecords(1, 1, null)

      if (result.success && result.data) {
        return {
          success: true,
          data: {
            totalCount: result.data.pagination?.total || result.data.pagination?.totalCount || 0,
            trend: '→'
          }
        }
      }

      return { success: false }
    } catch (error) {
      console.warn('⚠️ 获取兑换统计失败:', error)
      return { success: false }
    }
  },

  /**
   * 🔴 获取上传统计数据
   * ⚠️ 临时处理：V4.0后端暂未实现用户上传记录查询API
   * 📋 API状态：/uploads/my-submissions - 404 (未实现)
   * 📝 待后端实现 /api/v4/photo/my-uploads API后再启用
   */
  async getUploadStatistics() {
    try {
      // 🔴 临时方案：直接返回默认值，避免404错误
      console.log('⚠️ 上传统计API暂未实现，使用默认值')

      return {
        success: true,
        data: {
          totalCount: 0,
          trend: '→'
        }
      }
    } catch (error) {
      console.warn('⚠️ 获取上传统计失败:', error)
      return { success: false }
    }
  },

  /**
   * 🔴 获取积分统计数据
   */
  async getPointsStatistics() {
    try {
      // 🔴 这里可以调用积分统计API
      // 暂时返回默认值
      return {
        success: true,
        data: {
          thisMonthPoints: this.data.totalPoints || 0,
          trend: '→'
        }
      }
    } catch (error) {
      console.warn('⚠️ 获取积分统计失败:', error)
      return { success: false }
    }
  },

  /**
   * 🔴 加载积分趋势数据
   */
  async loadPointsTrend() {
    try {
      // 🔴 这里可以调用积分趋势API
      // 暂时使用默认值
      this.setData({
        todayEarned: 0,
        todayConsumed: 0
      })
    } catch (error) {
      console.error('❌ 加载积分趋势失败', error)
    }
  },

  // 点击手机号码
  /**
   * 点击手机号区域
   *
   * @description
   * 用户点击手机号显示区域时触发，显示完整手机号。
   *
   * @returns {void}
   *
   * @example
   * // WXML中绑定
   * <view bindtap="onPhoneTap">{{userInfo.mobile}}</view>
   */
  onPhoneTap() {
    if (!this.data.isLoggedIn) {
      this.redirectToAuth()
      return
    }

    wx.showModal({
      title: '手机号码',
      content: this.data.userInfo.mobile || this.data.userInfo.phone || '未设置',
      showCancel: false
    })
  },

  // 点击积分卡片
  /**
   * 点击积分区域
   *
   * @description
   * 用户点击积分显示区域时触发，跳转到积分明细页面。
   *
   * @returns {void}
   *
   * @example
   * // WXML中绑定
   * <view bindtap="onPointsTap">{{totalPoints}} 积分</view>
   */
  onPointsTap() {
    if (!this.data.isLoggedIn) {
      this.redirectToAuth()
      return
    }

    wx.navigateTo({
      url: '/pages/points-detail/points-detail'
    })
  },

  // 刷新统计数据
  async onRefreshStats() {
    try {
      // 💡 loading由APIClient自动处理，无需手动showLoading/hideLoading
      await this.loadUserStatistics()
      // 🗑️ V2.1：已删除成就系统刷新调用（this.initAchievements()）
      showToast('数据已刷新')
    } catch (error) {
      console.error('❌ 刷新统计失败', error)
      // 💡 错误提示由APIClient自动处理
    }
  },

  // 菜单项点击
  /**
   * 点击功能菜单项
   *
   * @description
   * 用户点击功能菜单项时触发，根据菜单类型执行不同操作：
   * - type='page'：跳转到指定页面
   * - type='action'：执行指定方法（如退出登录、联系客服）
   *
   * @param {object} e - 事件对象
   * @param {object} e.currentTarget - 触发事件的元素
   * @param {object} e.currentTarget.dataset - 元素的data-*属性
   * @param {object} e.currentTarget.dataset.item - 菜单项完整信息
   * @returns {void}
   *
   * @example
   * // WXML中绑定
   * <view bindtap="onMenuItemTap" data-item="{{menuItem}}">
   *   {{menuItem.name}}
   * </view>
   */
  onMenuItemTap(e) {
    const item = e.currentTarget.dataset.item
    if (!item) {
      return
    }

    if (!this.data.isLoggedIn) {
      this.redirectToAuth()
      return
    }

    // 🔴 根据菜单类型处理
    if (item.type === 'page') {
      wx.navigateTo({
        url: item.url
      })
    } else if (item.type === 'action' && item.action && typeof this[item.action] === 'function') {
      this[item.action]()
    }
  },

  // 注释：重复的方法已删除，保留下面更完善的实现版本

  /**
   * 🔴 退出登录 - 与旧项目逻辑保持一致
   */
  /**
   * 退出登录
   *
   * @description
   * 用户点击退出登录时触发，清除用户数据并跳转到登录页。
   *
   * 执行流程：
   * 1. 显示确认弹窗
   * 2. 清除本地存储的认证数据（token、userInfo等）
   * 3. 清除全局数据
   * 4. 跳转到登录页面
   *
   * @returns {void}
   *
   * @example
   * // WXML中绑定
   * <button bindtap="logout">退出登录</button>
   */
  logout() {
    console.log('🔄 退出登录')

    wx.showModal({
      title: '确认退出',
      content: '是否确认退出登录？',
      showCancel: true,
      cancelText: '取消',
      confirmText: '退出',
      success: res => {
        if (res.confirm) {
          // 🔴 清理用户数据（使用新项目的清理方法）
          app.clearAuthData()

          // 🔴 跳转到登录页（与旧项目保持一致）
          wx.reLaunch({
            url: '/pages/auth/auth'
          })

          console.log('✅ 用户已退出登录')
        }
      }
    })
  },

  // 重定向到登录页面
  redirectToAuth() {
    wx.navigateTo({
      url: '/pages/auth/auth'
    })
  },

  // 下拉刷新
  /**
   * 生命周期函数 - 监听用户下拉刷新
   *
   * @description
   * 用户在页面下拉时触发，刷新用户中心数据。
   * 刷新完成后自动停止下拉刷新动画。
   *
   * @returns {void}
   *
   * @example
   * // 微信小程序自动调用
   * onPullDownRefresh()
   */
  onPullDownRefresh() {
    this.refreshUserData().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 🔴 联系客服功能 - 支持在线反馈
   */
  /**
   * 联系客服
   *
   * @description
   * 用户点击联系客服时触发。
   * - 管理员：跳转到客服管理页面
   * - 普通用户：跳转到用户客服页面
   *
   * @returns {void}
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onContactService">联系客服</button>
   */
  onContactService() {
    console.log('📞 联系客服功能')

    // 检查登录状态
    if (!this.data.isLoggedIn) {
      wx.showToast({
        title: '请先登录后使用客服功能',
        icon: 'none'
      })
      return
    }

    // 显示客服选择列表
    wx.showActionSheet({
      itemList: ['💬 在线聊天', '💬 复制微信号'],
      success: res => {
        switch (res.tapIndex) {
        case 0:
          // 🚀 跳转到实时聊天页面
          console.log('🚀 跳转到实时聊天页面')
          wx.navigateTo({
            url: '/pages/chat/chat',
            success: () => {
              console.log('✅ 跳转聊天页面成功')
            },
            fail: error => {
              console.error('❌ 跳转聊天页面失败:', error)
              wx.showToast({
                title: '页面跳转失败',
                icon: 'none'
              })
            }
          })
          break
        case 1:
          // 🔴 复制客服微信号
          wx.setClipboardData({
            data: 'tg15818387910',
            success: () => {
              wx.showToast({
                title: '微信号已复制',
                icon: 'success'
              })
            }
          })
          break
        default:
          // 其他情况不处理
          break
        }
      },
      fail: error => {
        console.log('用户取消了客服选择')
      }
    })
  },

  // 分享
  /**
   * 生命周期函数 - 监听用户点击页面分享
   *
   * @description
   * 用户点击右上角分享按钮时触发，设置分享内容和路径。
   *
   * @returns {object} 分享配置对象
   * @returns {string} returns.title - 分享标题
   * @returns {string} returns.path - 分享路径
   *
   * @example
   * // 微信小程序自动调用
   * onShareAppMessage()
   * // { title: '一起来体验积分抽奖！', path: '/pages/user/user' }
   */
  onShareAppMessage() {
    return {
      title: '餐厅积分系统 - 我的积分中心',
      path: '/pages/user/user'
    }
  },

  /**
   * 🔴 跳转到管理员仪表板 - 强化页面隔离机制
   */
  async goToAdminDashboard() {
    if (!this.data.isLoggedIn) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return
    }

    if (!this.data.isAdmin) {
      wx.showToast({
        title: '需要管理员权限',
        icon: 'none'
      })
      return
    }

    try {
      console.log('🎛️ 强化隔离跳转到管理员仪表板')

      // 🔧 第一步：立即显示跳转loading，阻止任何内容泄露
      showLoading({
        title: '正在跳转...',
        // 强制遮罩，阻止页面交互
        mask: true
      })

      // 🔧 第二步：强制清理所有相关缓存和状态
      await this.forceCleanAdminCache()

      // 🔧 第三步：强制页面状态重置，确保干净环境
      await this.resetPageState()

      // 🔧 第四步：延迟确保当前页面状态完全稳定
      await new Promise(resolve => setTimeout(resolve, 200))

      // 🔧 第五步：使用navigateTo保留页面栈，支持返回操作
      wx.navigateTo({
        url: '/pages/admin/admin-dashboard/admin-dashboard?from=user',
        success: () => {
          console.log('✅ 管理员仪表板跳转成功')
          hideLoading()
        },
        fail: error => {
          console.error('❌ 管理员仪表板跳转失败:', error)
          hideLoading()
          wx.showToast({
            title: '跳转失败，请重试',
            icon: 'none'
          })
        }
      })
    } catch (error) {
      console.error('❌ 管理员仪表板跳转异常:', error)
      hideLoading()
      wx.showToast({
        title: '跳转异常，请重试',
        icon: 'none'
      })
    }
  },

  /**
   * 🔧 强化：强制清理管理员相关的所有缓存
   */
  async forceCleanAdminCache() {
    try {
      console.log('🧹 强制清理所有管理员相关缓存')

      // 清理页面状态缓存
      const adminCacheKeys = [
        'page_/pages/admin/admin-dashboard/admin-dashboard',
        'page_admin-dashboard',
        'admin_state_cache',
        'admin_loading_state',
        'admin_permission_cache',
        'cache_admin',
        'admin_navigation_state'
      ]

      // 并行清理所有缓存键
      const cleanPromises = adminCacheKeys.map(key => {
        return new Promise(resolve => {
          try {
            wx.removeStorageSync(key)
            resolve(true)
          } catch (err) {
            console.warn('⚠️ 清理缓存键失败:', key, err)
            resolve(false)
          }
        })
      })

      await Promise.all(cleanPromises)

      // 强制触发垃圾回收（如果支持）
      if (typeof wx.triggerGC === 'function') {
        wx.triggerGC()
      }

      console.log('✅ 所有管理员缓存已强制清理')
    } catch (error) {
      console.warn('⚠️ 强制清理缓存失败:', error)
    }
  },

  /**
   * 🔧 强化：重置页面状态，确保环境干净
   */
  async resetPageState() {
    try {
      console.log('🔄 强制重置页面状态')

      // 强制设置loading状态，阻止任何渲染
      this.setData({
        loading: true,
        refreshing: false
      })

      // 清理可能的定时器
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer)
        this.refreshTimer = null
      }

      // 小延迟确保状态设置生效
      await new Promise(resolve => setTimeout(resolve, 50))

      console.log('✅ 页面状态已重置')
    } catch (error) {
      console.warn('⚠️ 页面状态重置失败:', error)
    }
  }
})
