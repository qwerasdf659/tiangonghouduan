// pages/points-detail/points-detail.js - 积分详情页面（基于旧项目逻辑重新实现）
const app = getApp()
// 🔴 使用新项目V2.0 API标准
const { API } = require('../../utils/index')
const checkAuth = () => {
  return true
}
// ✅ V4.2: 删除临时callApi定义，统一为直接调用API方法

// 🔴 时间格式化常量定义
const TIME_CONSTANTS = {
  // 1分钟的毫秒数
  ONE_MINUTE: 60000,
  // 1小时的毫秒数
  ONE_HOUR: 3600000,
  // 1天的毫秒数
  ONE_DAY: 86400000
}

// ====== 方案B重构：配置对象提取 ======
// 积分类型配置
const POINTS_CONFIG = {
  SINGLE: 100,
  THREE: 300,
  FIVE: 500,
  TEN: 1000
}

// 抽奖类型映射表
const LOTTERY_TYPE_MAP = {
  [POINTS_CONFIG.SINGLE]: '单抽',
  [POINTS_CONFIG.THREE]: '三连抽',
  [POINTS_CONFIG.FIVE]: '五连抽',
  [POINTS_CONFIG.TEN]: '十连抽'
}

// 业务类型识别规则配置
const BUSINESS_TYPE_CONFIG = [
  {
    keywords: ['兑换', 'exchange'],
    formatPositive: points => '商品兑换',
    formatNegative: points => `商品兑换   (-${Math.abs(points)}积分)`
  },
  {
    keywords: ['签到', 'daily'],
    formatPositive: points => `每日签到   (+${points}积分)`,
    formatNegative: points => '每日签到'
  },
  {
    keywords: ['上传', 'upload'],
    formatPositive: points => `图片上传   (+${points}积分)`,
    formatNegative: points => '图片上传'
  },
  {
    keywords: ['任务', 'task'],
    formatPositive: points => `任务奖励   (+${points}积分)`,
    formatNegative: points => '任务奖励'
  }
]

// ====== 方案B重构：子函数1 - 抽奖类型识别 ======
/**
 * 识别抽奖类型
 * @param {number} points - 积分数量（负数）
 * @param {string} description - 描述文本
 * @returns {string} 抽奖类型文本
 *
 * 复杂度：~10
 */
function identifyLotteryType(points, description) {
  const consumedPoints = Math.abs(points)
  const desc = description.toLowerCase()

  // 使用映射表快速查找标准类型
  if (LOTTERY_TYPE_MAP[consumedPoints]) {
    return LOTTERY_TYPE_MAP[consumedPoints]
  }

  // 处理multi描述（连抽）
  if (desc.includes('multi')) {
    const drawCount = Math.floor(consumedPoints / POINTS_CONFIG.SINGLE)
    const COUNT_THREE = 3
    const COUNT_FIVE = 5
    const COUNT_TEN = 10

    if (drawCount === COUNT_THREE) {
      return '三连抽'
    } else if (drawCount === COUNT_FIVE) {
      return '五连抽'
    } else if (drawCount === COUNT_TEN) {
      return '十连抽'
    } else if (drawCount > 1) {
      return `${drawCount}连抽`
    }
  }

  // 默认返回通用抽奖类型
  return '抽奖消费'
}

// ====== 方案B重构：子函数2 - 业务类型识别 ======
/**
 * 识别业务类型并格式化
 * @param {string} description - 描述文本
 * @param {number} points - 积分数量
 * @returns {string | null} 格式化文本，null表示未识别
 *
 * 复杂度：~8
 */
function identifyBusinessType(description, points) {
  const desc = description.toLowerCase()

  // 遍历业务类型配置
  for (const config of BUSINESS_TYPE_CONFIG) {
    const matched = config.keywords.some(keyword => desc.includes(keyword))
    if (matched) {
      // 根据积分正负选择格式化函数
      return points > 0 ? config.formatPositive(points) : config.formatNegative(points)
    }
  }

  // 未识别的类型
  return null
}

/**
 * 积分详情页面 - 餐厅积分抽奖系统v2.0
 * 🔴 基于旧项目逻辑重新实现，包含：
 * - 可用积分展示（与旧项目一致的UI）
 * - 筛选功能（全部记录、积分获得、积分消费）
 * - 积分记录列表（分页加载）
 * - 统计信息（记录总数、当前筛选状态）
 * - API调用（使用新项目v2.0标准）
 */
Page({
  data: {
    // 用户信息
    loading: false,
    userInfo: null,
    totalPoints: 0,

    // 积分记录
    pointsRecords: [],
    filteredPointsRecords: [],
    // 筛选条件：all, earn, consume
    pointsFilter: 'all',
    hasMoreRecords: false,
    currentPage: 1,
    pageSize: 20,
    lastUpdateTime: '',

    // 页面状态
    refreshing: false,

    // 🔑 新增：Token诊断状态
    tokenStatus: {
      hasToken: false,
      tokenValid: false,
      tokenExpired: false,
      lastCheck: null
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('💰 积分明细页面加载 - v2.0实现')
    this.initPage()
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {
    wx.setNavigationBarTitle({
      title: '积分明细'
    })
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    console.log('💰 积分明细页面显示')
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    console.log('🔄 下拉刷新积分明细')
    this.refreshPointsData().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {
    if (this.data.hasMoreRecords && !this.data.loading) {
      this.loadMoreRecords()
    }
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: '我的积分明细 - 餐厅积分系统',
      path: '/pages/points-detail/points-detail'
    }
  },

  /**
   * 🔴 初始化页面 - 基于旧项目逻辑
   */
  initPage() {
    console.log('🔧 开始初始化积分明细页面...')

    // 🔴 使用统一的认证检查
    if (!checkAuth()) {
      console.warn('⚠️ 用户未登录，已自动跳转')
      return
    }

    // 🔴 从全局获取用户信息，如果没有则从Storage恢复
    let globalUserInfo = app.globalData.userInfo

    if (!globalUserInfo || !globalUserInfo.user_id) {
      console.log('⚠️ globalData没有用户信息，尝试从Storage恢复...')
      try {
        const storedUserInfo = wx.getStorageSync('user_info')
        if (storedUserInfo && storedUserInfo.user_id) {
          globalUserInfo = storedUserInfo
          app.globalData.userInfo = storedUserInfo
          console.log('✅ 从Storage恢复用户信息成功:', {
            user_id: storedUserInfo.user_id,
            mobile: storedUserInfo.mobile
          })
        } else {
          console.error('❌ Storage中也没有用户信息，跳转登录页')
          checkAuth() // 会自动跳转到登录页
          return
        }
      } catch (error) {
        console.error('❌ 从Storage恢复用户信息失败:', error)
        checkAuth()
        return
      }
    }

    const totalPoints = app.globalData.points_balance || globalUserInfo?.totalPoints || 0

    if (globalUserInfo) {
      this.setData({
        userInfo: globalUserInfo,
        totalPoints
      })
    }

    // 🔴 加载积分记录
    this.loadPointsRecords()

    console.log('✅ 积分明细页面初始化完成')
  },

  /**
   * 🔴 加载积分记录 - 使用新项目V2.0 API
   * 注意：根据接口文档2.0，积分API已实现
   */
  async loadPointsRecords() {
    if (this.data.loading) {
      console.log('⚠️ 正在加载中，跳过重复请求')
      return
    }

    console.log('📊 开始加载积分记录...')
    this.setData({ loading: true, hasError: false })

    try {
      // 🔴 使用统一的认证检查（替代diagnoseTokenStatus）
      if (!checkAuth()) {
        console.warn('⚠️ 用户未登录，已自动跳转')
        this.setData({ loading: false })
        return
      }

      console.log('✅ 认证检查通过，继续API请求')

      // 🔑 API请求（带详细状态码监控）
      const userId = app.globalData.userInfo?.user_id

      // 🔧 调试：检查userId是否有效
      console.log('🔍 获取userId:', {
        userId,
        userInfo: app.globalData.userInfo,
        hasUserInfo: !!app.globalData.userInfo,
        userInfoKeys: app.globalData.userInfo ? Object.keys(app.globalData.userInfo) : []
      })

      if (!userId) {
        throw new Error('用户ID获取失败，请重新登录')
      }

      const result = await API.getPointsTransactions(
        userId,
        this.data.currentPage,
        this.data.pageSize,
        this.data.pointsFilter
      )

      console.log('🔍 API响应详情:', {
        success: result.success,
        message: result.message,
        dataType: typeof result.data,
        // 🔴 V4.0修正: 字段名transactions，不是records
        transactionsCount: result.data?.transactions?.length || 0,
        hasData: !!result.data
      })

      if (result.success && result.data) {
        // 🔴 V4.0修正: 后端返回的字段名是transactions，不是records（文档Line 5871）
        const { transactions, pagination } = result.data

        // 🔑 处理记录数据
        let processedRecords = transactions || []

        // 🎰 智能聚合抽奖记录
        processedRecords = this.aggregateLotteryRecords(processedRecords)

        const formattedRecords = processedRecords.map(record => {
          // 🔧 修正：使用正确的字段名points_amount（根据API文档第7610行）
          const pointsValue = record.points_amount || record.points || 0

          // 🔧 修正：根据transaction_type确定显示的符号
          const displayPoints = record.transaction_type === 'earn' ? pointsValue : -pointsValue

          // 🔥 优先使用后端返回的transaction_title（完整业务描述）
          const displayTitle =
            record.transaction_title || record.description || record.source_text || '积分记录'

          // 🔥 直接使用后端返回的时间，不进行计算（前端只负责展示）
          const displayTime = record.transaction_time || record.created_at || record.timestamp || ''

          // 🔥 格式化金额显示（带符号）
          const displayAmount =
            record.transaction_type === 'earn'
              ? `+${Math.abs(pointsValue)}`
              : `-${Math.abs(pointsValue)}`

          return {
            ...record,
            displayTitle, // 业务标题（如"兑换商品：测试商品"）
            displayTime, // 友好时间（如"2小时前"）
            displayAmount, // 带符号的金额（如"+100"）
            displayPoints // 数值（用于计算）
          }
        })

        console.log('✅ 格式化记录完成', {
          原始记录数: transactions?.length || 0,
          格式化记录数: formattedRecords.length,
          抽奖记录数: formattedRecords.filter(r => r.isLotteryConsume).length
        })

        this.setData({
          pointsRecords: formattedRecords,
          hasMoreRecords: pagination?.hasMore || false,
          lastUpdateTime: new Date().toLocaleString(),
          loading: false,
          hasError: false
        })

        // 🔑 设置数据后立即调用筛选函数
        this.filterPointsRecords()

        console.log(`✅ 积分记录加载成功 - 共${formattedRecords.length}条记录`)
      } else {
        throw new Error(result.message || '获取积分记录失败')
      }
    } catch (error) {
      console.error('❌ 获取积分记录失败:', error)
      this.setData({ loading: false })

      const errorMsg = error.message || '获取积分记录失败'
      const errorCode = error.code || error.status || -1

      console.log('🔍 错误详细信息:', {
        message: errorMsg,
        code: errorCode,
        needReauth: error.needReauth,
        fullError: error
      })

      // 特别处理404错误
      const ERROR_NOT_FOUND = 404
      if (errorCode === ERROR_NOT_FOUND || errorMsg.includes('404')) {
        console.warn('🚨 收到404错误 - 可能是API路径问题或服务未启动')

        wx.showModal({
          title: '⚠️ 服务暂时不可用',
          content:
            '积分记录服务暂时不可用，这是后端API问题。\n\n请联系技术支持处理：\n• API端点可能未部署\n• 服务器可能重启中\n• 路由配置可能有问题',
          showCancel: true,
          cancelText: '稍后重试',
          confirmText: '联系客服',
          confirmColor: '#FF6B35',
          success: res => {
            if (res.confirm) {
              wx.showToast({
                title: '请联系技术支持',
                icon: 'none'
              })
            }
          }
        })
        return
      }

      // 认证错误处理（checkAuth会自动处理跳转）
      const ERROR_UNAUTHORIZED = 401
      if (
        error.needReauth ||
        errorCode === ERROR_UNAUTHORIZED ||
        errorMsg.includes('身份验证已过期') ||
        errorMsg.includes('登录已过期')
      ) {
        console.log('🔒 认证错误，使用统一认证处理')
        // 会自动跳转到登录页
        checkAuth()
        return
      }

      // 服务器错误处理
      const ERROR_SERVER = 500
      if (errorCode >= ERROR_SERVER) {
        wx.showModal({
          title: '🚨 服务器暂时繁忙',
          content: `服务器遇到问题(${errorCode})：\n\n${errorMsg}\n\n建议操作：\n• 稍后重新尝试\n• 检查网络连接\n• 联系技术支持`,
          showCancel: true,
          cancelText: '重新加载',
          confirmText: '返回上页',
          confirmColor: '#FF6B35',
          success: res => {
            if (res.confirm) {
              wx.navigateBack()
            } else {
              this.loadPointsRecords()
            }
          }
        })
        return
      }

      // 通用错误处理
      wx.showModal({
        title: '💔 数据加载失败',
        content: `积分记录加载遇到问题：\n\n${errorMsg}\n\n建议操作：\n• 检查网络连接\n• 稍后重新尝试\n• 如持续出现请联系客服`,
        showCancel: true,
        cancelText: '重新加载',
        confirmText: '返回上页',
        confirmColor: '#FF6B35',
        success: res => {
          if (res.confirm) {
            wx.navigateBack()
          } else {
            this.loadPointsRecords()
          }
        }
      })
    }
  },

  /**
   * 🔴 刷新积分数据
   */
  async refreshPointsData() {
    this.setData({
      currentPage: 1,
      pointsRecords: []
    })

    // 🔴 同时更新用户积分余额 - V4.2直接调用API方法
    const result = await API.getPointsBalance()
    const { success, data } = result

    if (success && data) {
      this.setData({
        totalPoints: data.available_points || 0
      })
    }

    return this.loadPointsRecords()
  },

  /**
   * 🔴 加载更多记录
   */
  loadMoreRecords() {
    if (this.data.loading || !this.data.hasMoreRecords) {
      return
    }

    console.log('📄 加载更多积分记录...', {
      currentPage: this.data.currentPage,
      nextPage: this.data.currentPage + 1
    })

    this.setData({
      currentPage: this.data.currentPage + 1
    })

    this.loadPointsRecords()
  },

  /**
   * 🔴 积分明细筛选切换
   */
  onPointsFilterChange(e) {
    const filter = e.currentTarget.dataset.filter
    console.log('🔍 切换积分筛选', filter)

    this.setData({
      pointsFilter: filter,
      currentPage: 1,
      pointsRecords: []
    })

    this.loadPointsRecords()
  },

  /**
   * 🔴 筛选积分记录
   * 注意：后端返回字段是points_amount和transaction_type，不是points
   */
  filterPointsRecords() {
    const pointsRecords = this.data.pointsRecords || []
    console.log('🔍 筛选积分记录', {
      原始记录数量: pointsRecords.length,
      筛选条件: this.data.pointsFilter
    })

    let filtered = [...pointsRecords]

    switch (this.data.pointsFilter) {
    case 'earn':
      // 🔧 修正：根据transaction_type字段筛选，而不是points字段
      filtered = filtered.filter(record => record.transaction_type === 'earn')
      break
    case 'consume':
      // 🔧 修正：根据transaction_type字段筛选，而不是points字段
      filtered = filtered.filter(record => record.transaction_type === 'consume')
      break
    default:
      break
    }

    console.log('✅ 筛选完成', { 筛选后记录数量: filtered.length })

    this.setData({
      filteredPointsRecords: filtered
    })

    if (pointsRecords.length > 0 && filtered.length === 0) {
      const filterText = this.data.pointsFilter === 'earn' ? '获得' : '消费'
      wx.showToast({
        title: `暂无${filterText}记录`,
        icon: 'none',
        duration: 2000
      })
    }
  },

  /**
   * 🔴 格式化时间显示
   */
  formatTime(timeString) {
    if (!timeString) {
      return '未知时间'
    }

    try {
      const date = new Date(timeString)
      const now = new Date()
      const diff = now - date

      if (diff < TIME_CONSTANTS.ONE_MINUTE) {
        return '刚刚'
      } else if (diff < TIME_CONSTANTS.ONE_HOUR) {
        return Math.floor(diff / TIME_CONSTANTS.ONE_MINUTE) + '分钟前'
      } else if (diff < TIME_CONSTANTS.ONE_DAY) {
        return Math.floor(diff / TIME_CONSTANTS.ONE_HOUR) + '小时前'
      } else {
        return date.toLocaleDateString()
      }
    } catch (error) {
      console.error('❌ 时间格式化失败', error)
      return timeString
    }
  },

  /**
   * 🔥 格式化交易时间为友好显示（新增）
   * @param {string} time - 交易时间
   * @returns {String} 友好的时间显示
   */
  formatTransactionTime(time) {
    if (!time) {
      return ''
    }

    try {
      // 🔥 iOS兼容性修复：
      // 方案1: "2025-10-25 23:05:02" → "2025/10/25 23:05:02"（推荐，更符合用户习惯）
      // 方案2: "2025-10-25 23:05:02" → "2025-10-25T23:05:02"（ISO标准格式）
      let formattedTime = time

      if (typeof time === 'string') {
        // 移除毫秒部分（如果有）
        formattedTime = time.replace(/\.\d+$/, '')

        // 优先使用 "/" 格式，iOS和Android都支持
        if (formattedTime.includes('-') && !formattedTime.includes('T')) {
          formattedTime = formattedTime.replace(/-/g, '/')
        }
      }

      const transactionDate = new Date(formattedTime)

      // 验证日期是否有效
      if (isNaN(transactionDate.getTime())) {
        console.warn('⚠️ 无效的日期格式:', time)
        return time
      }

      const now = new Date()
      const diffMs = now - transactionDate
      const diffMinutes = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMinutes / 60)
      const diffDays = Math.floor(diffHours / 24)

      // 1小时内显示"XX分钟前"
      if (diffMinutes < 60) {
        return diffMinutes <= 0 ? '刚刚' : `${diffMinutes}分钟前`
      }

      // 24小时内显示"XX小时前"
      if (diffHours < 24) {
        return `${diffHours}小时前`
      }

      // 7天内显示"XX天前"
      if (diffDays < 7) {
        return `${diffDays}天前`
      }

      // 超过7天显示具体日期
      const month = transactionDate.getMonth() + 1
      const day = transactionDate.getDate()
      const hour = String(transactionDate.getHours()).padStart(2, '0')
      const minute = String(transactionDate.getMinutes()).padStart(2, '0')

      return `${month}月${day}日 ${hour}:${minute}`
    } catch (error) {
      console.error('❌ 交易时间格式化失败', error)
      return time
    }
  },

  /**
   * 🔑 智能格式化抽奖描述 - 方案B重构版
   *
   * 优化后复杂度：从44降至~15
   *
   * 优化策略：
   * 1. 提取抽奖类型识别 → identifyLotteryType()
   * 2. 提取业务类型识别 → identifyBusinessType()
   * 3. 提取时间格式化 → formatDetailedTime()（已存在）
   * 4. 主函数负责流程控制和组装
   */
  formatLotteryDescription(description, points, timestamp) {
    // ===== 前置检查 =====
    if (!description) {
      console.log('⚠️ 描述为空，使用默认值')
      return '积分变动'
    }

    try {
      const desc = description.toString().toLowerCase()

      // ===== 步骤1：检测抽奖类型 =====
      const isLotteryRelated =
        desc.includes('抽奖') ||
        desc.includes('lottery') ||
        desc.includes('single') ||
        desc.includes('multi')
      const isNegativePoints = points < 0

      // ===== 步骤2：处理抽奖类型记录 =====
      if (isLotteryRelated && isNegativePoints) {
        const consumedPoints = Math.abs(points)
        const lotteryType = identifyLotteryType(points, desc)
        const lotteryFormattedTime = timestamp ? this.formatDetailedTime(timestamp) : ''

        const displayText = `✨${lotteryType}   (-${consumedPoints}积分)`
        return lotteryFormattedTime ? `${displayText}    ${lotteryFormattedTime}` : displayText
      }

      // ===== 步骤3：处理其他业务类型记录 =====
      const businessFormat = identifyBusinessType(desc, points)
      if (businessFormat) {
        const businessFormattedTime = timestamp ? this.formatDetailedTime(timestamp) : ''
        return businessFormattedTime
          ? `${businessFormat}    ${businessFormattedTime}`
          : businessFormat
      }

      // ===== 步骤4：默认处理（清理描述） =====
      const cleanedDescription =
        description
          .replace(/[-第\d+次]/g, '')
          .replace(/single|multi/gi, '')
          .trim() || '积分变动'
      const formattedTime = timestamp ? this.formatDetailedTime(timestamp) : ''
      return formattedTime ? `${cleanedDescription}    ${formattedTime}` : cleanedDescription
    } catch (error) {
      console.error('❌ 描述格式化失败', error, { description, points })
      return description || '积分变动'
    }
  },

  /**
   * 🔑 格式化详细时间
   */
  formatDetailedTime(timeString) {
    if (!timeString) {
      return ''
    }

    try {
      const date = new Date(timeString)

      if (isNaN(date.getTime())) {
        console.warn('⚠️ 无效的时间格式', timeString)
        return ''
      }

      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')

      return `${year}年${month}月${day}日 ${hours}时${minutes}分${seconds}秒`
    } catch (error) {
      console.error('❌ 详细时间格式化失败', error)
      return ''
    }
  },

  /**
   * 🔴 返回上一页
   */
  onBackTap() {
    wx.navigateBack()
  },

  // 🔴 已删除 diagnoseTokenStatus() 和 forceReLogin() 方法
  // 现在统一使用 checkAuth() 和 clearAuthData() 从 auth-helper.js

  /**
   * 🔑 手动刷新
   */
  async handleManualRefresh() {
    console.log('🔧 执行手动刷新...')

    // 🔴 使用统一的认证检查
    if (!checkAuth()) {
      console.warn('⚠️ 用户未登录，已自动跳转')
      return
    }

    this.setData({
      currentPage: 1,
      pointsRecords: [],
      hasMoreRecords: true
    })

    await this.loadPointsRecords()
  },

  /**
   * 🎰 智能聚合抽奖记录
   */
  aggregateLotteryRecords(records) {
    if (!records || records.length === 0) {
      return []
    }

    console.log('🎰 开始聚合抽奖记录', { 原始记录数: records.length })

    const lotteryRecords = []
    const otherRecords = []

    records.forEach(record => {
      const desc = (record.description || record.reason || '').toLowerCase()
      const isLottery =
        desc.includes('抽奖') ||
        desc.includes('lottery') ||
        desc.includes('single') ||
        desc.includes('multi')
      // 🔧 修正：使用正确的字段transaction_type判断消耗类型
      const isConsume = record.transaction_type === 'consume'

      if (isLottery && isConsume) {
        lotteryRecords.push(record)
      } else {
        otherRecords.push(record)
      }
    })

    console.log('🔍 记录分类:', {
      抽奖记录数: lotteryRecords.length,
      其他记录数: otherRecords.length
    })

    const aggregatedLottery = this.groupLotteryByTime(lotteryRecords)
    const allRecords = [...aggregatedLottery, ...otherRecords]

    allRecords.sort((a, b) => {
      const timeA = new Date(a.createTime || a.created_at || a.timestamp).getTime()
      const timeB = new Date(b.createTime || b.created_at || b.timestamp).getTime()
      return timeB - timeA
    })

    console.log('✅ 抽奖记录聚合完成:', {
      最终记录数: allRecords.length
    })

    return allRecords
  },

  /**
   * 🎰 按时间分组聚合
   */
  groupLotteryByTime(lotteryRecords) {
    if (lotteryRecords.length === 0) {
      return []
    }

    const timeGroups = new Map()

    lotteryRecords.forEach(record => {
      const timestamp = record.createTime || record.created_at || record.timestamp
      if (!timestamp) {
        return
      }

      const date = new Date(timestamp)
      const minuteKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`

      if (!timeGroups.has(minuteKey)) {
        timeGroups.set(minuteKey, [])
      }
      timeGroups.get(minuteKey).push(record)
    })

    const aggregatedRecords = []
    timeGroups.forEach(groupRecords => {
      if (groupRecords.length === 1) {
        aggregatedRecords.push(groupRecords[0])
      } else {
        // 🔧 修正：使用正确的字段points_amount累加积分
        const totalPoints = groupRecords.reduce((sum, r) => sum + (r.points_amount || 0), 0)
        const drawCount = groupRecords.length

        const aggregatedRecord = {
          ...groupRecords[0],
          id: `aggregated_${groupRecords[0].id}_${drawCount}`,
          points_amount: totalPoints, // 🔧 修正：使用正确的字段名
          description: `multi抽奖-聚合${drawCount}次`,
          reason: '连抽聚合记录',
          createTime: groupRecords[0].createTime,
          created_at: groupRecords[0].created_at,
          timestamp: groupRecords[0].timestamp,
          isAggregated: true,
          originalCount: drawCount,
          originalRecords: groupRecords
        }

        aggregatedRecords.push(aggregatedRecord)
      }
    })

    return aggregatedRecords
  }
})
