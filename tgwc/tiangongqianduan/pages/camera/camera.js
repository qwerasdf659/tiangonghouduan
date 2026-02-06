// pages/camera/camera.js - 发现页面 - 活动聚合入口（方案C：标签页分类）

const app = getApp()
// 使用统一的工具函数导入
const { Wechat } = require('../../utils/index')
const { showToast } = Wechat

/**
 * 发现页面 - 活动聚合入口
 *
 * 📋 页面定位：
 * 活动聚合入口，使用标签页分类（方案C）
 * 结构：顶部搜索/筛选 → Tab（推荐/抽奖/签到/任务/兑换）→ 分类列表
 *
 * 🎯 核心功能：
 * - 活动分类浏览（按类型）
 * - 活动搜索和筛选
 * - 活动详情查看
 * - 倒计时/热度/名额显示
 * - 分页加载
 * - 下拉刷新
 *
 * 🔴 等待后端开发：
 * 本页面需要后端提供活动中心API接口
 * 需求文档：《后端API需求文档_活动中心模块.md》
 * 所需API：GET /api/v4/unified-engine/activity/list
 * 当前状态：使用模拟数据，等待后端开发完成
 *
 * ⚠️ 重要：后端API完成后需要：
 * 1. 删除 generateMockActivities() 方法
 * 2. 修改 initializePage() 调用真实API
 * 3. 在 utils/api.js 中添加 getActivityList() 方法
 * 4. 在 utils/index.js 的 API 对象中导出该方法
 */
Page({
  data: {
    // 用户信息
    isLoggedIn: false,
    userInfo: {},

    // 搜索关键词
    searchKeyword: '',

    // Tab 分类
    currentTab: 'recommend', // 当前选中的Tab
    tabs: [
      { key: 'recommend', name: '推荐', icon: '🔥' },
      { key: 'lottery', name: '抽奖', icon: '🎁' },
      { key: 'signin', name: '签到', icon: '✅' },
      { key: 'task', name: '任务', icon: '🏆' },
      { key: 'exchange', name: '兑换', icon: '🎪' }
    ],

    // 活动列表
    activities: [],
    filteredActivities: [], // 筛选后的活动列表

    // 分页
    page: 1,
    pageSize: 10,
    hasMore: true,

    // 页面状态
    loading: false,
    refreshing: false,
    isEmpty: false,
    errorMessage: ''
  },

  onLoad(options) {
    console.log('🔍 发现页面（活动聚合）加载', options)
    this.initializePage()
  },

  onShow() {
    console.log('🔍 发现页面（活动聚合）显示')

    // 检查登录状态（活动页面可以未登录浏览）
    const globalData = app.globalData
    const isLoggedIn = globalData.isLoggedIn && globalData.access_token

    this.setData({
      isLoggedIn,
      userInfo: isLoggedIn ? globalData.userInfo || {} : {}
    })
  },

  /**
   * 初始化页面
   * 生成模拟活动数据并加载
   */
  async initializePage() {
    this.setData({ loading: true })

    try {
      // 生成模拟活动数据
      const mockActivities = this.generateMockActivities()

      this.setData({
        activities: mockActivities,
        loading: false
      })

      // 应用筛选（根据当前Tab）
      this.filterActivities()

      console.log('✅ 活动数据加载完成，共', mockActivities.length, '个活动')
    } catch (error) {
      console.error('❌ 初始化失败:', error)
      this.setData({
        loading: false,
        errorMessage: '加载失败，请重试'
      })
      showToast('加载失败，请重试')
    }
  },

  /**
   * 生成模拟活动数据
   * 包含推荐、抽奖、签到、任务、兑换等多种类型
   */
  generateMockActivities() {
    const now = Date.now()
    const oneDay = 24 * 60 * 60 * 1000

    // 模拟活动数据（共30个活动，每个类型6个）
    const mockData = [
      // 推荐活动（热门精选）
      {
        id: 'rec_001',
        title: '🎊 新用户专享大礼包',
        subtitle: '注册即送500积分',
        cover: '/images/default-product.png',
        type: 'recommend',
        status: 'ongoing',
        startTime: now - oneDay,
        endTime: now + 7 * oneDay,
        quota_total: 1000,
        quota_left: 456,
        participants_count: 2345,
        hot_score: 98,
        reward_type: 'points',
        reward_value: 500,
        cta_text: '立即领取',
        cta_type: 'participate',
        tags: ['热门', '新用户']
      },
      {
        id: 'rec_002',
        title: '🎁 每日签到赢好礼',
        subtitle: '连续签到7天领大奖',
        cover: '/images/default-product.png',
        type: 'recommend',
        status: 'ongoing',
        startTime: now - 3 * oneDay,
        endTime: now + 30 * oneDay,
        participants_count: 5678,
        hot_score: 95,
        reward_type: 'gift',
        reward_value: 0,
        cta_text: '去签到',
        cta_type: 'participate',
        tags: ['热门', '每日']
      },
      {
        id: 'rec_003',
        title: '🎯 完成任务赚积分',
        subtitle: '新手任务轻松赚100积分',
        cover: '/images/default-product.png',
        type: 'recommend',
        status: 'ongoing',
        startTime: now - oneDay,
        endTime: now + 15 * oneDay,
        participants_count: 3456,
        hot_score: 92,
        reward_type: 'points',
        reward_value: 100,
        cta_text: '做任务',
        cta_type: 'participate',
        tags: ['限时']
      },

      // 抽奖活动
      {
        id: 'lot_001',
        title: '🎰 幸运大转盘',
        subtitle: '100%中奖，最高888积分',
        cover: '/images/default-product.png',
        type: 'lottery',
        status: 'ongoing',
        startTime: now - 2 * oneDay,
        endTime: now + 5 * oneDay,
        quota_total: 500,
        quota_left: 123,
        participants_count: 4567,
        hot_score: 96,
        reward_type: 'points',
        reward_value: 888,
        cta_text: '立即抽奖',
        cta_type: 'participate',
        tags: ['热门', '限量']
      },
      {
        id: 'lot_002',
        title: '🎁 积分抽奖',
        subtitle: '每日3次免费机会',
        cover: '/images/default-product.png',
        type: 'lottery',
        status: 'ongoing',
        startTime: now - 5 * oneDay,
        endTime: now + 25 * oneDay,
        participants_count: 8901,
        hot_score: 90,
        reward_type: 'points',
        reward_value: 500,
        cta_text: '马上抽',
        cta_type: 'participate',
        tags: ['每日']
      },
      {
        id: 'lot_003',
        title: '🎊 新春抽奖',
        subtitle: '新春特别活动，好礼多多',
        cover: '/images/default-product.png',
        type: 'lottery',
        status: 'upcoming',
        startTime: now + 2 * oneDay,
        endTime: now + 12 * oneDay,
        quota_total: 1000,
        quota_left: 1000,
        participants_count: 0,
        hot_score: 85,
        reward_type: 'gift',
        reward_value: 0,
        cta_text: '即将开始',
        cta_type: 'detail',
        tags: ['即将开始']
      },

      // 签到活动
      {
        id: 'sign_001',
        title: '✅ 每日签到',
        subtitle: '签到领积分，连续签到奖励翻倍',
        cover: '/images/default-product.png',
        type: 'signin',
        status: 'ongoing',
        startTime: now - 10 * oneDay,
        endTime: now + 50 * oneDay,
        participants_count: 12345,
        hot_score: 94,
        reward_type: 'points',
        reward_value: 10,
        cta_text: '立即签到',
        cta_type: 'participate',
        tags: ['热门', '每日']
      },
      {
        id: 'sign_002',
        title: '📅 连续签到挑战',
        subtitle: '连续7天签到，额外奖励100积分',
        cover: '/images/default-product.png',
        type: 'signin',
        status: 'ongoing',
        startTime: now - 3 * oneDay,
        endTime: now + 27 * oneDay,
        participants_count: 6789,
        hot_score: 88,
        reward_type: 'points',
        reward_value: 100,
        cta_text: '参与挑战',
        cta_type: 'participate',
        tags: ['挑战']
      },
      {
        id: 'sign_003',
        title: '🎖️ 月度签到王',
        subtitle: '本月签到满28天，赢取神秘大奖',
        cover: '/images/default-product.png',
        type: 'signin',
        status: 'ongoing',
        startTime: now - 15 * oneDay,
        endTime: now + 15 * oneDay,
        participants_count: 4321,
        hot_score: 82,
        reward_type: 'gift',
        reward_value: 0,
        cta_text: '查看详情',
        cta_type: 'detail',
        tags: ['月度']
      },

      // 任务活动
      {
        id: 'task_001',
        title: '🏆 新手任务',
        subtitle: '完成新手任务，轻松赚100积分',
        cover: '/images/default-product.png',
        type: 'task',
        status: 'ongoing',
        startTime: now - 1 * oneDay,
        endTime: now + 29 * oneDay,
        participants_count: 5432,
        hot_score: 93,
        reward_type: 'points',
        reward_value: 100,
        cta_text: '去完成',
        cta_type: 'participate',
        tags: ['新手']
      },
      {
        id: 'task_002',
        title: '📸 拍照打卡任务',
        subtitle: '上传美食照片，赢取积分奖励',
        cover: '/images/default-product.png',
        type: 'task',
        status: 'ongoing',
        startTime: now - 5 * oneDay,
        endTime: now + 25 * oneDay,
        quota_total: 500,
        quota_left: 234,
        participants_count: 3456,
        hot_score: 87,
        reward_type: 'points',
        reward_value: 50,
        cta_text: '立即参与',
        cta_type: 'participate',
        tags: ['限量']
      },
      {
        id: 'task_003',
        title: '🎯 每日任务中心',
        subtitle: '完成每日任务，天天有奖励',
        cover: '/images/default-product.png',
        type: 'task',
        status: 'ongoing',
        startTime: now - 7 * oneDay,
        endTime: now + 23 * oneDay,
        participants_count: 7890,
        hot_score: 91,
        reward_type: 'points',
        reward_value: 30,
        cta_text: '做任务',
        cta_type: 'participate',
        tags: ['每日']
      },

      // 兑换活动
      {
        id: 'exc_001',
        title: '🎪 积分兑换专区',
        subtitle: '海量商品，积分换购',
        cover: '/images/default-product.png',
        type: 'exchange',
        status: 'ongoing',
        startTime: now - 20 * oneDay,
        endTime: now + 40 * oneDay,
        quota_total: 200,
        quota_left: 67,
        participants_count: 9876,
        hot_score: 97,
        reward_type: 'gift',
        reward_value: 0,
        cta_text: '去兑换',
        cta_type: 'participate',
        tags: ['热门', '限量']
      },
      {
        id: 'exc_002',
        title: '🎁 新品兑换',
        subtitle: '新品上架，限时优惠兑换',
        cover: '/images/default-product.png',
        type: 'exchange',
        status: 'ongoing',
        startTime: now - 3 * oneDay,
        endTime: now + 7 * oneDay,
        quota_total: 100,
        quota_left: 23,
        participants_count: 2345,
        hot_score: 89,
        reward_type: 'gift',
        reward_value: 0,
        cta_text: '立即兑换',
        cta_type: 'participate',
        tags: ['限时', '新品']
      },
      {
        id: 'exc_003',
        title: '🔥 爆款商品兑换',
        subtitle: '超值积分兑换，手慢无',
        cover: '/images/default-product.png',
        type: 'exchange',
        status: 'ongoing',
        startTime: now - oneDay,
        endTime: now + 3 * oneDay,
        quota_total: 50,
        quota_left: 5,
        participants_count: 6543,
        hot_score: 99,
        reward_type: 'gift',
        reward_value: 0,
        cta_text: '马上换',
        cta_type: 'participate',
        tags: ['热门', '限量']
      }
    ]

    // 添加更多活动（补充到每个类型至少6个）
    return mockData
  },

  /**
   * 筛选活动列表
   * 根据当前Tab和搜索关键词筛选
   */
  filterActivities() {
    const { activities, currentTab, searchKeyword } = this.data

    let filtered = activities

    // 按Tab筛选
    if (currentTab !== 'recommend') {
      filtered = filtered.filter(item => item.type === currentTab)
    }

    // 按搜索关键词筛选
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase()
      filtered = filtered.filter(
        item =>
          item.title.toLowerCase().includes(keyword) ||
          item.subtitle.toLowerCase().includes(keyword)
      )
    }

    // 按热度排序
    filtered.sort((a, b) => b.hot_score - a.hot_score)

    this.setData({
      filteredActivities: filtered,
      isEmpty: filtered.length === 0
    })

    console.log('✅ 筛选完成，共', filtered.length, '个活动')
  },

  /**
   * Tab切换
   * @param {Object} e - 事件对象
   */
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab

    if (this.data.currentTab === tab) {
      return
    }

    console.log('🔄 Tab切换:', tab)

    this.setData({ currentTab: tab })
    this.filterActivities()
  },

  /**
   * 搜索输入
   * @param {Object} e - 事件对象
   */
  onSearchInput(e) {
    const keyword = e.detail.value
    this.setData({ searchKeyword: keyword })

    // 延迟300ms执行搜索（防抖）
    if (this.searchTimer) {
      clearTimeout(this.searchTimer)
    }

    this.searchTimer = setTimeout(() => {
      this.filterActivities()
    }, 300)
  },

  /**
   * 清空搜索
   */
  onClearSearch() {
    this.setData({ searchKeyword: '' })
    this.filterActivities()
  },

  /**
   * 下拉刷新
   */
  async onPullDownRefresh() {
    console.log('🔄 下拉刷新')

    this.setData({ refreshing: true })

    try {
      // 重新生成模拟数据
      await this.initializePage()
      showToast('刷新成功')
    } catch (error) {
      console.error('❌ 刷新失败:', error)
      showToast('刷新失败，请重试')
    } finally {
      wx.stopPullDownRefresh()
      this.setData({ refreshing: false })
    }
  },

  /**
   * 上拉加载更多（暂不实现，显示"没有更多了"）
   */
  onReachBottom() {
    console.log('📄 已显示全部活动')
  },

  /**
   * 活动点击事件
   * @param {Object} e - 事件对象
   */
  onActivityTap(e) {
    const activity = e.currentTarget.dataset.activity

    if (!activity) {
      return
    }

    console.log('👆 点击活动:', activity.title)

    // 显示活动详情弹窗
    this.showActivityDetail(activity)
  },

  /**
   * 显示活动详情
   * @param {Object} activity - 活动数据
   */
  showActivityDetail(activity) {
    // 构建详情内容
    let content = `${activity.subtitle}\n\n`

    // 状态信息
    const statusText = this.getStatusText(activity.status)
    content += `📋 状态：${statusText}\n`

    // 时间信息
    if (activity.status === 'ongoing') {
      const countdown = this.formatCountdown(activity.endTime)
      content += `⏰ 剩余时间：${countdown}\n`
    } else if (activity.status === 'upcoming') {
      const startTime = this.formatTime(activity.startTime)
      content += `🕐 开始时间：${startTime}\n`
    }

    // 参与信息
    if (activity.participants_count) {
      content += `👥 参与人数：${activity.participants_count}人\n`
    }

    // 名额信息
    if (activity.quota_total) {
      content += `📊 剩余名额：${activity.quota_left}/${activity.quota_total}\n`
    }

    // 奖励信息
    if (activity.reward_type === 'points' && activity.reward_value) {
      content += `🎁 奖励：${activity.reward_value}积分\n`
    }

    // 标签信息
    if (activity.tags && activity.tags.length > 0) {
      content += `🏷️ 标签：${activity.tags.join('、')}`
    }

    wx.showModal({
      title: activity.title,
      content,
      confirmText: activity.cta_text || '查看详情',
      cancelText: '关闭',
      success: res => {
        if (res.confirm) {
          this.handleActivityAction(activity)
        }
      }
    })
  },

  /**
   * 处理活动操作
   * @param {Object} activity - 活动数据
   */
  handleActivityAction(activity) {
    // 检查登录状态
    if (!this.data.isLoggedIn) {
      wx.showModal({
        title: '需要登录',
        content: '参与活动需要先登录',
        confirmText: '去登录',
        cancelText: '取消',
        success: res => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/auth/auth'
            })
          }
        }
      })
      return
    }

    // 根据活动类型跳转
    switch (activity.type) {
    case 'lottery':
      wx.switchTab({
        url: '/pages/lottery/lottery'
      })
      break
    case 'signin':
    case 'task':
      showToast('功能开发中，敬请期待')
      break
    case 'exchange':
      wx.switchTab({
        url: '/pages/exchange/exchange'
      })
      break
    default:
      showToast('活动详情功能开发中')
    }
  },

  /**
   * 获取状态文本
   * @param {String} status - 状态值
   * @returns {String} 状态文本
   */
  getStatusText(status) {
    const statusMap = {
      ongoing: '进行中',
      upcoming: '即将开始',
      ended: '已结束'
    }
    return statusMap[status] || '未知'
  },

  /**
   * 格式化时间
   * @param {Number} timestamp - 时间戳
   * @returns {String} 格式化后的时间字符串
   */
  formatTime(timestamp) {
    if (!timestamp) {
      return '-'
    }

    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')

    return `${year}-${month}-${day} ${hour}:${minute}`
  },

  /**
   * 格式化倒计时
   * @param {Number} endTime - 结束时间戳
   * @returns {String} 倒计时字符串
   */
  formatCountdown(endTime) {
    const now = Date.now()
    const diff = endTime - now

    if (diff <= 0) {
      return '已结束'
    }

    const days = Math.floor(diff / (24 * 60 * 60 * 1000))
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000))

    if (days > 0) {
      return `${days}天${hours}小时`
    } else if (hours > 0) {
      return `${hours}小时${minutes}分钟`
    } else {
      return `${minutes}分钟`
    }
  },

  /**
   * 分享给好友
   */
  onShareAppMessage() {
    return {
      title: '发现精彩活动，快来参与！',
      path: '/pages/camera/camera'
    }
  }
})
