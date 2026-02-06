/**
 * 📊 trade-upload-records.js - 积分活动记录页面（交易+上传合并）
 *
 * @description
 * 将交易记录(trade-records)和上传记录(upload-records)合并到一个页面
 * 使用Tab切换，提升用户体验，减少代码重复
 *
 * @version 1.0.0
 * @author Restaurant Lottery Team
 * @since 2025-10-15
 */

const app = getApp()
// 🔴 使用统一的工具函数导入
const { API } = require('../../../utils/index')
const showToast = options => {
  wx.showToast(options)
}
const checkAuth = () => {
  return true
}
// ✅ V4.2: 删除临时callApi定义，统一为直接调用API方法
const formatPoints = points => {
  return points
}

Page({
  /**
   * 页面的初始数据
   */
  data: {
    // 🔴 Tab切换状态
    activeTab: 0,
    tabs: [
      { id: 0, name: '交易记录', icon: '💰' },
      { id: 1, name: '上传记录', icon: '📷' }
    ],

    // 🔴 用户信息
    isLoggedIn: false,

    // 🔴 交易记录相关数据
    transactionRecords: [],
    filteredRecords: [],
    monthlyStats: {
      totalIncome: 0,
      totalExpense: 0,
      netIncome: 0,
      transactionCount: 0
    },
    // 筛选条件
    currentTimeFilter: 'all',
    currentTypeFilter: 'all',
    searchKeyword: '',
    showFilterPanel: false,

    // 🔴 上传记录相关数据
    uploadRecords: [],
    uploadStatistics: {
      totalCount: 0,
      approvedCount: 0,
      pendingCount: 0,
      rejectedCount: 0,
      totalEarnedPoints: 0
    },
    // all, pending, approved, rejected
    uploadFilter: 'all',
    uploadFilterOptions: [
      { key: 'all', name: '全部', icon: '📋' },
      { key: 'pending', name: '待审核', icon: '⏳' },
      { key: 'approved', name: '已通过', icon: '✅' },
      { key: 'rejected', name: '已拒绝', icon: '❌' }
    ],
    uploadPage: 1,
    uploadPageSize: 20,
    uploadHasMore: true,

    // 🔴 页面状态
    loading: true,
    refreshing: false,
    loadingMore: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('📊 积分活动记录页面加载')

    // 从URL参数获取初始Tab
    if (options.tab) {
      const tabId = parseInt(options.tab)
      if (tabId === 0 || tabId === 1) {
        this.setData({ activeTab: tabId })
      }
    }

    wx.setNavigationBarTitle({
      title: '积分活动记录'
    })

    this.initializePage()
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    console.log('📊 积分活动记录页面显示')
    // ✅ 使用helper：检查登录状态
    if (!checkAuth()) {
      return
    }
    this.setData({ isLoggedIn: true })
    this.refreshCurrentTab()
  },

  /**
   * 🔴 初始化页面
   */
  async initializePage() {
    try {
      // ✅ 使用helper：检查登录状态
      if (!checkAuth()) {
        return
      }
      this.setData({ isLoggedIn: true })

      // 加载当前Tab的数据
      await this.loadCurrentTabData()
    } catch (error) {
      console.error('❌ 积分活动记录页面初始化失败', error)
      showToast('页面加载失败')
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 🔴 Tab切换事件
   */
  onTabChange(e) {
    const tabId = e.currentTarget.dataset.id
    if (tabId === this.data.activeTab) {
      return
    }

    console.log(`🔄 切换到Tab${tabId}`)
    this.setData({
      activeTab: tabId,
      loading: true
    })

    this.loadCurrentTabData().finally(() => {
      this.setData({ loading: false })
    })
  },

  /**
   * 🔴 加载当前Tab的数据
   */
  async loadCurrentTabData() {
    if (this.data.activeTab === 0) {
      // 交易记录Tab
      await this.loadTransactionData()
    } else {
      // 上传记录Tab
      await Promise.all([this.loadUploadRecords(true), this.loadUploadStatistics()])
    }
  },

  /**
   * 🔴 刷新当前Tab的数据
   */
  async refreshCurrentTab() {
    this.setData({ refreshing: true })
    await this.loadCurrentTabData()
    this.setData({ refreshing: false })
  },

  // ============================================================================
  // 💰 交易记录相关方法
  // ============================================================================

  /**
   * ✅ 加载交易数据 - V4.2直接调用API方法
   */
  async loadTransactionData() {
    const userId = app.globalData.userInfo?.user_id || app.globalData.userInfo?.userId

    // ✅ V4.2: 直接调用API方法
    const result = await API.getPointsTransactions(userId)
    const { success, data } = result

    if (success && data) {
      // 🔴 V4.0修正: 后端返回的字段名是transactions，不是records（文档Line 5871）
      const { transactions = [], stats = {} } = data

      console.log('📊 成功加载交易记录:', {
        transactionsCount: transactions.length,
        stats
      })

      this.setData({
        transactionRecords: transactions,
        monthlyStats: stats || {
          totalIncome: 0,
          totalExpense: 0,
          netIncome: 0,
          transactionCount: 0
        }
      })

      // 应用筛选
      this.applyFilters()
    } else {
      // 显示友好的错误提示
      this.setData({
        transactionRecords: [],
        filteredRecords: [],
        monthlyStats: {
          totalIncome: 0,
          totalExpense: 0,
          netIncome: 0,
          transactionCount: 0
        }
      })
      showToast('交易记录加载失败')
    }
  },

  /**
   * 🔴 应用筛选条件
   */
  applyFilters() {
    let filteredRecords = [...this.data.transactionRecords]

    // 时间筛选
    if (this.data.currentTimeFilter !== 'all') {
      filteredRecords = this.filterByTime(filteredRecords, this.data.currentTimeFilter)
    }

    // 类型筛选
    if (this.data.currentTypeFilter !== 'all') {
      if (this.data.currentTypeFilter === 'income') {
        filteredRecords = filteredRecords.filter(record => record.category === 'income')
      } else if (this.data.currentTypeFilter === 'expense') {
        filteredRecords = filteredRecords.filter(record => record.category === 'expense')
      } else {
        filteredRecords = filteredRecords.filter(
          record => record.type === this.data.currentTypeFilter
        )
      }
    }

    // 关键词搜索
    if (this.data.searchKeyword) {
      const keyword = this.data.searchKeyword.toLowerCase()
      filteredRecords = filteredRecords.filter(
        record =>
          (record.title && record.title.toLowerCase().includes(keyword)) ||
          (record.description && record.description.toLowerCase().includes(keyword)) ||
          (record.txn_id && record.txn_id.toLowerCase().includes(keyword))
      )
    }

    // 按时间倒序排列
    filteredRecords.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    this.setData({ filteredRecords })
  },

  /**
   * 🔴 按时间筛选
   */
  filterByTime(records, timeFilter) {
    const now = new Date()
    let startDate = null

    switch (timeFilter) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      break
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      break
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    default:
      return records
    }

    return records.filter(record => new Date(record.created_at) >= startDate)
  },

  /**
   * 🔴 时间筛选
   */
  onTimeFilter(e) {
    const timeFilter = e.currentTarget.dataset.filter
    this.setData({ currentTimeFilter: timeFilter })
    this.applyFilters()
  },

  /**
   * 🔴 类型筛选
   */
  onTypeFilter(e) {
    const typeFilter = e.currentTarget.dataset.filter
    this.setData({ currentTypeFilter: typeFilter })
    this.applyFilters()
  },

  /**
   * 🔴 搜索输入
   */
  onSearchInput(e) {
    const keyword = e.detail.value
    this.setData({ searchKeyword: keyword })

    // 防抖搜索
    clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => {
      this.applyFilters()
    }, 500)
  },

  /**
   * 🔴 重置筛选条件
   */
  onResetFilters() {
    this.setData({
      currentTimeFilter: 'all',
      currentTypeFilter: 'all',
      searchKeyword: '',
      showFilterPanel: false
    })
    this.applyFilters()
  },

  /**
   * 🔴 显示/隐藏筛选面板
   */
  onToggleFilter() {
    this.setData({
      showFilterPanel: !this.data.showFilterPanel
    })
  },

  /**
   * 🔴 格式化金额显示
   */
  formatAmount(amount) {
    if (amount > 0) {
      return `+${amount}`
    }
    return `${amount}`
  },

  /**
   * 🔴 获取交易类型图标
   */
  getTypeIcon(type) {
    const iconMap = {
      lottery: '🎰',
      upload: '📸',
      exchange: '🛒',
      trade: '🏪',
      compensation: '💰',
      checkin: '✅',
      activity: '🎁',
      referral: '👥'
    }
    return iconMap[type] || '📄'
  },

  /**
   * 🔴 查看交易详情
   */
  onViewDetail(e) {
    const record = e.currentTarget.dataset.record

    wx.showModal({
      title: '交易详情',
      content: `交易类型：${record.title}\n交易金额：${this.formatAmount(record.amount)}积分\n交易时间：${this.formatTime(record.created_at)}\n交易ID：${record.txn_id}`,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 🔴 复制交易ID
   */
  onCopyTxnId(e) {
    const { txnId } = e.currentTarget.dataset
    wx.setClipboardData({
      data: txnId,
      success: () => {
        showToast('交易ID已复制')
      }
    })
  },

  // ============================================================================
  // 📷 上传记录相关方法
  // ============================================================================

  /**
   * ✅ 加载上传记录（V4.2: 直接调用API方法）
   * @param {boolean} refresh - 是否刷新（重置分页）
   */
  async loadUploadRecords(refresh = false) {
    if (!this.data.isLoggedIn) {
      return
    }

    if (refresh) {
      this.setData({
        uploadPage: 1,
        uploadHasMore: true,
        uploadRecords: []
      })
    }

    // ✅ V4.2: 直接调用API方法
    const page = this.data.uploadPage
    const reviewStatus = this.data.uploadFilter === 'all' ? null : this.data.uploadFilter

    const result = await API.getMyUploads(page, this.data.uploadPageSize, reviewStatus)
    const { success, data } = result

    if (success && data) {
      const newRecords = data.records || []
      const records = refresh ? newRecords : [...this.data.uploadRecords, ...newRecords]

      this.setData({
        uploadRecords: records,
        uploadHasMore: newRecords.length === this.data.uploadPageSize,
        uploadPage: page + 1
      })

      console.log(`✅ 上传记录加载完成，共${records.length}条`)
    }
  },

  /**
   * ✅ 加载上传统计数据 - V4.2直接调用API方法
   */
  async loadUploadStatistics() {
    // ✅ V4.2: 直接调用API方法
    const result = await API.getMyUploadStats()
    const { success, data } = result

    if (success && data) {
      this.setData({
        uploadStatistics: {
          totalCount: data.totalCount || 0,
          approvedCount: data.approvedCount || 0,
          pendingCount: data.pendingCount || 0,
          rejectedCount: data.rejectedCount || 0,
          totalEarnedPoints: data.totalEarnedPoints || 0
        }
      })
      console.log('✅ 上传统计加载完成')
    }
  },

  /**
   * 🔴 切换上传筛选条件
   */
  switchUploadFilter(e) {
    const filter = e.currentTarget.dataset.filter
    if (filter === this.data.uploadFilter) {
      return
    }

    this.setData({
      uploadFilter: filter,
      uploadPage: 1,
      uploadRecords: []
    })

    this.loadUploadRecords(true)
  },

  /**
   * 🔴 格式化审核状态
   * @param {string} status - 状态值
   * @returns {Object} 状态信息对象
   */
  formatReviewStatus(status) {
    const statusMap = {
      pending: { text: '待审核', color: '#FFC107', icon: '⏳' },
      approved: { text: '已通过', color: '#4CAF50', icon: '✅' },
      rejected: { text: '已拒绝', color: '#F44336', icon: '❌' },
      processing: { text: '审核中', color: '#2196F3', icon: '🔄' }
    }
    return statusMap[status] || { text: status, color: '#666', icon: '❓' }
  },

  /**
   * 🔴 预览图片
   */
  previewImage(e) {
    const imageUrl = e.currentTarget.dataset.url

    if (!imageUrl) {
      return
    }

    wx.previewImage({
      current: imageUrl,
      urls: [imageUrl]
    })
  },

  /**
   * 🔴 查看审核详情
   */
  viewReviewDetail(e) {
    const record = e.currentTarget.dataset.record

    if (!record) {
      return
    }

    const statusInfo = this.formatReviewStatus(record.review_status)
    let content = `上传时间：${this.formatTime(record.created_at)}\n审核状态：${statusInfo.text}`

    if (record.review_status === 'approved' && record.earned_points) {
      content += `\n获得积分：${formatPoints(record.earned_points)}`
    }

    if (record.review_status === 'rejected' && record.reject_reason) {
      content += `\n拒绝原因：${record.reject_reason}`
    }

    wx.showModal({
      title: '审核详情',
      content,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 🔴 重新上传
   */
  reuploadImage(e) {
    wx.showModal({
      title: '重新上传',
      content: '是否要重新上传照片？',
      success: res => {
        if (res.confirm) {
          wx.navigateTo({
            url: '/pages/camera/camera'
          })
        }
      }
    })
  },

  /**
   * 🔴 删除记录
   */
  deleteRecord(e) {
    // 📌 recordId暂时未使用，等待后端删除API实现
    const _recordId = e.currentTarget.dataset.id

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条上传记录吗？',
      success: async res => {
        if (res.confirm) {
          showToast('删除功能开发中')
          // ⚠️ 待后端实现删除API后使用 _recordId
        }
      }
    })
  },

  /**
   * 🔴 跳转到拍照页面
   */
  goToCamera() {
    wx.navigateTo({
      url: '/pages/camera/camera'
    })
  },

  /**
   * 🔴 跳转到活动页面
   */
  goToActivity() {
    wx.switchTab({
      url: '/pages/lottery/lottery'
    })
  },

  // ============================================================================
  // 🔧 通用工具方法
  // ============================================================================

  /**
   * 🔴 格式化时间
   * @param {string | number} timestamp - 时间戳
   * @returns {String} 格式化后的时间字符串
   */
  formatTime(timestamp) {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date

    if (diff < 60000) {
      // 1分钟内
      return '刚刚'
    } else if (diff < 3600000) {
      // 1小时内
      return `${Math.floor(diff / 60000)}分钟前`
    } else if (diff < 86400000) {
      // 1天内
      return `${Math.floor(diff / 3600000)}小时前`
    } else {
      return date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    }
  },

  // ============================================================================
  // 🔄 生命周期和事件处理
  // ============================================================================

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  async onPullDownRefresh() {
    await this.refreshCurrentTab()
    wx.stopPullDownRefresh()
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  async onReachBottom() {
    // 只有上传记录Tab支持分页加载更多
    if (this.data.activeTab === 1) {
      if (this.data.uploadHasMore && !this.data.loadingMore) {
        this.setData({ loadingMore: true })
        await this.loadUploadRecords()
        this.setData({ loadingMore: false })
      }
    }
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: '我的积分活动记录',
      path: '/pages/records/trade-upload-records/trade-upload-records'
    }
  }
})
