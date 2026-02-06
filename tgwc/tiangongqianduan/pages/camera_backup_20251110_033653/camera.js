// pages/camera/camera.js - 发现页面 - 多功能入口中心

const app = getApp()
// 🔴 使用统一的工具函数导入v2.1（修复小程序路径解析问题）
const { Wechat, API, Utils } = require('../../utils/index')
const { showToast } = Wechat
const { checkAuth } = Utils

/**
 * 发现页面 - 餐厅积分抽奖系统v2.0
 *
 * 📋 页面定位：
 * 多功能入口中心，集合各种精彩内容和实用工具
 *
 * 💡 业务流程：
 * 1. 用户消费后打开小程序，展示身份二维码
 * 2. 商家扫描用户二维码，在商家端输入消费金额
 * 3. 提交后进入审核状态，积分冻结
 * 4. 平台工作人员24小时内审核
 * 5. 审核通过后，冻结积分转为可用积分
 *
 * 📱 当前功能模块：
 * - 消费记录（审核中、已通过、已拒绝）
 * - 积分余额（可用积分 + 冻结积分）
 * - 审核状态和时间查询
 *
 * 🎯 未来扩展（可选）：
 * - 每日任务中心
 * - 限时活动推荐
 * - 积分排行榜
 * - 系统公告通知
 */
Page({
  data: {
    // 用户信息
    isLoggedIn: false,
    pointsBalance: 0, // 可用积分
    frozenPoints: 0, // 冻结积分（审核中）
    userInfo: {},

    // 消费记录列表
    consumeRecords: [],
    // 筛选状态：all-全部, pending-审核中, approved-已通过, rejected-已拒绝
    filterStatus: 'all',
    filterOptions: [
      { key: 'all', name: '全部', icon: '📋' },
      { key: 'pending', name: '审核中', icon: '⏳' },
      { key: 'approved', name: '已通过', icon: '✅' },
      { key: 'rejected', name: '已拒绝', icon: '❌' }
    ],

    // 统计信息
    statistics: {
      totalCount: 0, // 总记录数
      pendingCount: 0, // 审核中数量
      approvedCount: 0, // 已通过数量
      rejectedCount: 0, // 已拒绝数量
      totalAmount: 0, // 总消费金额
      totalPoints: 0 // 总获得积分
    },

    // 分页
    page: 1,
    pageSize: 20,
    hasMore: true,

    // 页面状态
    loading: false,
    refreshing: false
  },

  onLoad(options) {
    console.log('🔍 发现页面加载', options)
    this.initializePage()
  },

  onShow() {
    console.log('🔍 发现页面显示')

    // 🔴 使用统一的认证检查
    if (!checkAuth()) {
      console.warn('⚠️ 用户未登录，已自动跳转')
      return
    }

    // 更新页面数据
    const globalData = app.globalData
    this.setData({
      isLoggedIn: true,
      pointsBalance: globalData.points_balance || 0,
      userInfo: globalData.userInfo || {}
    })

    // 🔑 刷新数据
    this.refreshPageData()
  },

  /**
   * 初始化页面
   * 检查登录状态，加载消费记录
   */
  initializePage() {
    // 🔴 使用统一的认证检查
    if (!checkAuth()) {
      console.warn('⚠️ 用户未登录，已自动跳转')
      return
    }

    // 加载消费记录
    this.loadConsumeRecords()
  },

  /**
   * 刷新页面数据
   * 包括用户积分和消费记录
   */
  async refreshPageData() {
    if (!this.data.isLoggedIn) {
      return
    }

    try {
      // 1. 刷新用户积分数据
      await this.refreshUserPoints()

      // 2. 重新加载消费记录
      this.setData({
        page: 1,
        consumeRecords: [],
        hasMore: true
      })
      await this.loadConsumeRecords()
    } catch (error) {
      console.error('⚠️ 刷新页面数据失败:', error)
    }
  },

  /**
   * 刷新用户积分数据
   * 获取可用积分和冻结积分
   */
  async refreshUserPoints() {
    try {
      const response = await API.getPointsBalance()

      if (response && response.success && response.data) {
        this.setData({
          pointsBalance: response.data.available_points || 0,
          frozenPoints: response.data.frozen_points || 0
        })
        console.log('✅ 积分数据刷新成功:', {
          available: response.data.available_points,
          frozen: response.data.frozen_points
        })
      }
    } catch (error) {
      console.error('❌ 刷新积分数据失败:', error)
    }
  },

  /**
   * 加载消费记录
   * 从后端API获取用户的消费记录列表
   */
  async loadConsumeRecords() {
    if (this.data.loading || !this.data.hasMore) {
      return
    }

    this.setData({ loading: true })

    try {
      // 💡 loading由APIClient自动处理

      // 调用后端API获取消费记录
      // 🔴 注意:这里需要后端提供相应的API接口
      const response = await API.getConsumeRecords({
        page: this.data.page,
        pageSize: this.data.pageSize,
        status: this.data.filterStatus === 'all' ? undefined : this.data.filterStatus
      })

      if (response && response.success && response.data) {
        const records = response.data.records || []
        const statistics = response.data.statistics || {}

        this.setData({
          consumeRecords:
            this.data.page === 1 ? records : [...this.data.consumeRecords, ...records],
          statistics: {
            totalCount: statistics.totalCount || 0,
            pendingCount: statistics.pendingCount || 0,
            approvedCount: statistics.approvedCount || 0,
            rejectedCount: statistics.rejectedCount || 0,
            totalAmount: statistics.totalAmount || 0,
            totalPoints: statistics.totalPoints || 0
          },
          hasMore: records.length >= this.data.pageSize,
          page: this.data.page + 1,
          loading: false
        })

        console.log('✅ 消费记录加载成功，共', records.length, '条')
      } else {
        throw new Error(response.message || '加载失败')
      }
    } catch (error) {
      // 💡 loading由APIClient自动处理
      console.error('❌ 加载消费记录失败:', error)

      this.setData({ loading: false })

      showToast({
        title: error.message || '加载失败，请重试',
        icon: 'none'
      })
    }
  },

  /**
   * 筛选状态切换
   * @param {Object} e - 事件对象
   */
  onFilterChange(e) {
    const status = e.currentTarget.dataset.status

    if (this.data.filterStatus === status) {
      return
    }

    console.log('🔍 筛选状态切换:', status)

    this.setData({
      filterStatus: status,
      page: 1,
      consumeRecords: [],
      hasMore: true
    })

    this.loadConsumeRecords()
  },

  /**
   * 下拉刷新
   */
  async onPullDownRefresh() {
    console.log('🔄 下拉刷新')

    this.setData({
      refreshing: true,
      page: 1,
      consumeRecords: [],
      hasMore: true
    })

    await this.refreshPageData()

    wx.stopPullDownRefresh()
    this.setData({ refreshing: false })
  },

  /**
   * 上拉加载更多
   */
  onReachBottom() {
    console.log('📄 上拉加载更多')
    this.loadConsumeRecords()
  },

  /**
   * 查看记录详情
   * @param {Object} e - 事件对象
   */
  onViewDetail(e) {
    const record = e.currentTarget.dataset.record

    if (!record) {
      return
    }

    // 显示详情弹窗
    const statusText = this.getStatusText(record.status)
    const statusIcon = this.getStatusIcon(record.status)

    let content = `${statusIcon} 状态：${statusText}\n`
    content += `💰 消费金额：¥${record.amount}\n`
    content += `⭐ 获得积分：${record.points || 0}分\n`
    content += `📅 消费时间：${this.formatTime(record.created_at)}\n`

    if (record.status === 'approved' && record.approved_at) {
      content += `✅ 审核时间：${this.formatTime(record.approved_at)}\n`
    }

    if (record.status === 'rejected' && record.reject_reason) {
      content += `❌ 拒绝原因：${record.reject_reason}\n`
    }

    if (record.merchant_name) {
      content += `🏪 商家：${record.merchant_name}`
    }

    wx.showModal({
      title: '消费记录详情',
      content,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 获取状态文本
   */
  getStatusText(status) {
    const statusMap = {
      pending: '审核中',
      approved: '已通过',
      rejected: '已拒绝'
    }
    return statusMap[status] || '未知'
  },

  /**
   * 获取状态图标
   */
  getStatusIcon(status) {
    const iconMap = {
      pending: '⏳',
      approved: '✅',
      rejected: '❌'
    }
    return iconMap[status] || '❓'
  },

  /**
   * 格式化时间
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
   * 跳转到首页查看二维码
   */
  goToShowQRCode() {
    wx.switchTab({
      url: '/pages/home/home'
    })
  },

  // ========== 以下为旧代码，已弃用，保留以防引用错误 ==========
  // 拍照（已废弃）
  onTakePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      maxDuration: 30,
      camera: 'back',
      success: res => {
        console.log('📷 拍照成功:', res)
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.setSelectedImage(tempFilePath)
      },
      fail: error => {
        console.error('❌ 拍照失败:', error)
        if (error.errMsg !== 'chooseMedia:fail cancel') {
          showToast('拍照失败，请重试')
        }
      }
    })
  },

  // 从相册选择
  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: res => {
        console.log('🖼️ 选择图片成功:', res)
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.setSelectedImage(tempFilePath)
      },
      fail: error => {
        console.error('❌ 选择图片失败:', error)
        if (error.errMsg !== 'chooseMedia:fail cancel') {
          showToast('选择图片失败，请重试')
        }
      }
    })
  },

  // 设置选中的图片 - ✅ 智能压缩方案（≤10MB直接用，>10MB多级压缩）
  async setSelectedImage(tempFilePath) {
    try {
      // 第1步：获取原图文件大小（使用wx.getFileSystemManager().getFileInfo）
      const fileInfo = await new Promise((resolve, reject) => {
        wx.getFileSystemManager().getFileInfo({
          filePath: tempFilePath,
          success: resolve,
          fail: reject
        })
      })

      const fileSize = fileInfo.size // 图片大小（单位：字节）
      const MAX_SIZE = 10 * 1024 * 1024 // 10MB限制（10485760字节）

      console.log(`📷 原图大小: ${(fileSize / 1024 / 1024).toFixed(2)}MB`)

      // 第2步：判断是否需要压缩
      if (fileSize <= MAX_SIZE) {
        // ✅ 小于等于10MB，直接使用原图（保留最佳质量）
        console.log('✅ 照片大小合适，直接使用')
        this.setData({
          selectedImage: tempFilePath,
          imagePreview: tempFilePath
        })
        return
      }

      // 第3步：超过10MB，开始多级压缩
      console.log('⚠️ 照片超过10MB，开始压缩...')

      // 💡 图片压缩过程较快，无需显示loading

      // 压缩质量档位（从高到低）
      const qualityLevels = [80, 60, 40, 20]

      // 尝试每个档位
      for (const quality of qualityLevels) {
        try {
          // 压缩图片
          const compressRes = await new Promise((resolve, reject) => {
            wx.compressImage({
              src: tempFilePath, // 始终用原图压缩（质量更好）
              quality, // 当前质量档位
              success: resolve,
              fail: reject
            })
          })

          // 检查压缩后的大小（使用wx.getFileSystemManager().getFileInfo获取文件大小）
          const compressedInfo = await new Promise((resolve, reject) => {
            wx.getFileSystemManager().getFileInfo({
              filePath: compressRes.tempFilePath,
              success: resolve,
              fail: reject
            })
          })
          const compressedSize = compressedInfo.size

          console.log(`🔄 压缩质量${quality}，大小: ${(compressedSize / 1024 / 1024).toFixed(2)}MB`)

          // 检查是否满足要求
          if (compressedSize <= MAX_SIZE) {
            // ✅ 压缩成功，满足10MB限制

            this.setData({
              selectedImage: compressRes.tempFilePath,
              imagePreview: compressRes.tempFilePath
            })

            console.log(
              `✅ 压缩成功！质量${quality}，从${(fileSize / 1024 / 1024).toFixed(2)}MB压缩到${(compressedSize / 1024 / 1024).toFixed(2)}MB`
            )
            return
          }
        } catch (error) {
          // 压缩失败，尝试下一个档位
          console.warn(`⚠️ 质量${quality}压缩失败:`, error)
          continue
        }
      }

      // ❌ 所有档位都失败，照片太大

      wx.showModal({
        title: '照片过大',
        content: '照片大小超过限制，请重新拍摄或选择其他照片',
        showCancel: false,
        confirmText: '知道了'
      })

      console.error('❌ 所有压缩档位都失败，照片太大')
    } catch (error) {
      // 异常情况：获取图片信息失败
      console.error('❌ 处理图片失败:', error)

      // 降级方案：使用原图（可能上传失败，但至少不会卡住）
      this.setData({
        selectedImage: tempFilePath,
        imagePreview: tempFilePath
      })
    }
  },

  // 预览图片
  onPreviewImage() {
    if (!this.data.imagePreview) {
      return
    }

    wx.previewImage({
      urls: [this.data.imagePreview],
      current: this.data.imagePreview
    })
  },

  // 删除图片
  onDeleteImage() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这张图片吗？',
      success: res => {
        if (res.confirm) {
          this.setData({
            selectedImage: null,
            imagePreview: null
          })
          showToast('图片已删除')
        }
      }
    })
  },

  // 提交上传
  async onConfirmUpload() {
    if (!this.data.selectedImage) {
      showToast('请先拍照或选择图片')
      return
    }

    if (!this.data.isLoggedIn) {
      showToast('请先登录')
      return
    }

    try {
      // 🔴 直接调用后端API，不使用模拟进度
      const result = await this.uploadImage(this.data.selectedImage)

      if (result && result.success) {
        // 清空已上传的图片
        this.setData({
          selectedImage: null,
          imagePreview: null
        })

        // ✅ 移除自动跳转逻辑，保持在当前页面
        // 用户可以继续拍照上传，或点击页面上的"查看上传记录"按钮主动跳转
        console.log('✅ 图片上传成功，用户可继续拍照上传')
      }
      // 错误处理已在uploadImage函数中完成
    } catch (error) {
      console.error('❌ 上传失败:', error)
      showToast(`上传失败: ${error.message}`)
    }
  },

  // 上传图片 - 🔴 使用后端真实API：API.uploadImage
  async uploadImage(imagePath) {
    try {
      // 💡 loading由APIClient自动处理

      // 🔴 使用后端真实数据，调用正确的API方法(避免命名冲突,直接使用API.uploadImage)
      // 参数: imagePath, category(食品), description(拍照上传)
      const result = await API.uploadImage(imagePath, 'food', '拍照上传')

      if (result && result.success) {
        showToast('上传成功，等待审核')

        // 刷新用户数据以更新积分
        await this.refreshUserData()

        // 返回结果给调用者
        return result
      } else {
        // ❌ 准确的错误提示
        const errorMsg = result?.message || '上传失败'
        showToast(`上传失败: ${errorMsg}`)
        console.error('❌ 图片上传失败:', result)
        throw new Error(errorMsg)
      }
    } catch (error) {
      // 💡 loading由APIClient自动处理
      console.error('❌ 上传图片异常:', error)
      // 提供更详细的错误信息
      const errorMsg = error.message || '网络异常,请检查您的网络连接'
      showToast(`上传失败: ${errorMsg}`)
      throw error
    }
  },

  // 跳转到上传记录
  goToUploadRecords() {
    wx.navigateTo({
      url: '/pages/records/trade-upload-records/trade-upload-records?tab=1'
    })
  },

  // 跳转到积分明细
  goToPointsDetail() {
    wx.navigateTo({
      url: '/pages/points-detail/points-detail'
    })
  },

  // 🔴 已删除 redirectToAuth() 方法，现在 checkAuth() 会自动处理跳转

  // 重置表单
  resetForm() {
    this.setData({
      selectedImage: null,
      imagePreview: null,
      uploading: false,
      uploadProgress: 0
    })
    console.log('✅ 表单已重置')
  },

  // 分享
  onShareAppMessage() {
    return {
      title: '上传小票赚积分，快来试试！',
      path: '/pages/camera/camera'
    }
  }
})
