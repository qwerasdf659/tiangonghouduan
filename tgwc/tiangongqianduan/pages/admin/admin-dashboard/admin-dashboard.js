// pages/admin/admin-dashboard/admin-dashboard.js - 管理员仪表板页面
const app = getApp()
const { Wechat, Utils } = require('../../../utils/index')
const { showToast } = Wechat
const { checkAdmin } = Utils

/**
 * 管理员仪表板页面 - 餐厅积分抽奖系统v2.0
 * 功能：管理员专用功能集中管理页面
 * 权限：仅管理员用户可访问
 * 更新：移除了系统信息和快捷操作模块，保留核心管理功能菜单
 */
Page({
  data: {
    // 用户信息
    isLoggedIn: false,
    isAdmin: false,
    userInfo: null,

    // 管理员功能菜单配置
    adminMenuItems: [
      {
        id: 'admin-pending-reviews',
        name: '待审核管理',
        description: '管理用户上传的图片审核',
        icon: '📋',
        color: '#E91E63',
        type: 'page',
        url: '/pages/admin/pending-reviews/pending-reviews'
      },
      {
        id: 'admin-system-overview',
        name: '系统概览',
        description: '查看系统整体运营数据',
        icon: '📊',
        color: '#FF5722',
        type: 'action',
        action: 'onAdminSystemOverview'
      },
      {
        id: 'admin-user-management',
        name: '用户管理',
        description: '管理系统用户信息',
        icon: '👥',
        color: '#795548',
        type: 'action',
        action: 'onAdminUserManagement'
      },
      {
        id: 'admin-lottery-config',
        name: '抽奖配置',
        description: '配置抽奖奖品和概率',
        icon: '🎰',
        color: '#607D8B',
        type: 'action',
        action: 'onAdminLotteryConfig'
      },
      {
        id: 'admin-product-management',
        name: '商品管理',
        description: '管理兑换商品库存',
        icon: '📦',
        color: '#9E9E9E',
        type: 'action',
        action: 'onAdminProductManagement'
      },
      {
        id: 'admin-customer-service',
        name: '客服管理',
        description: '统一处理用户反馈和实时聊天',
        icon: '💬',
        color: '#4CAF50',
        type: 'page',
        url: '/pages/admin/customer-service/customer-service'
      },
      {
        id: 'admin-data-export',
        name: '数据导出',
        description: '导出系统运营数据',
        icon: '📥',
        color: '#673AB7',
        type: 'action',
        action: 'onAdminDataExport'
      }
    ],

    // 强化：页面状态管理 - 确保内容完整性
    // 强制loading状态，直到所有内容完全准备好
    loading: true,
    // 标记页面是否完成完整初始化
    initialized: false,
    // 标记权限检查是否完成
    accessChecked: false,
    // 新增：内容准备状态，确保UI数据完整
    contentReady: false,
    // 新增：渲染保护锁，防止提前渲染
    renderLocked: true
  },

  /**
   * 强化：页面加载 - 绝对阻止任何提前渲染
   */
  onLoad(options) {
    console.log('📊 管理员仪表板页面加载开始 - 强化隔离模式')

    // 强化：立即锁定渲染，确保绝对不会提前显示内容
    this.setData({
      loading: true,
      initialized: false,
      accessChecked: false,
      contentReady: false,
      renderLocked: true
    })

    // 强化：延迟执行权限检查，确保页面状态完全稳定
    setTimeout(() => {
      this.performSecureInitialization(options)
    }, 100)
  },

  /**
   * 强化：安全初始化流程
   */
  async performSecureInitialization(options) {
    try {
      console.log('🔒 开始安全初始化流程')

      // 第一步：更新用户状态并获取权限信息
      this.updateUserStatus()

      // 🔴 修复：直接检查权限，不使用checkAdmin()避免自动跳转
      // 因为checkAdmin()会弹窗并跳转，而我们需要先标记accessChecked
      // 💡 使用外层已声明的app实例，避免变量遮蔽
      const globalData = app.globalData
      const userInfo = globalData.userInfo

      // 详细日志：打印存储的用户信息
      console.log('🔍 详细用户信息检查:', {
        hasUserInfo: !!userInfo,
        userInfoKeys: userInfo ? Object.keys(userInfo) : [],
        is_admin: userInfo?.is_admin,
        user_role: userInfo?.user_role,
        role_level: userInfo?.role_level,
        roles: userInfo?.roles
      })

      // 判断是否管理员
      const isAdmin =
        userInfo &&
        (userInfo.is_admin === true ||
          userInfo.user_role === 'admin' ||
          (userInfo.role_level && userInfo.role_level >= 100))

      console.log('🔐 权限判断结果:', { isAdmin })

      // 🔴 立即标记权限已检查（在跳转前）
      this.setData({
        accessChecked: true,
        isLoggedIn: !!(globalData.isLoggedIn && globalData.access_token),
        isAdmin: !!isAdmin,
        userInfo: userInfo || null
      })

      // 如果不是管理员，再使用checkAdmin()处理跳转
      if (!isAdmin) {
        console.warn('⚠️ 用户不是管理员，准备跳转')
        checkAdmin() // 这会弹窗并跳转
        return
      }

      console.log('✅ 权限检查通过，继续初始化')

      // 第二步：准备所有UI数据
      await this.prepareAllContent()

      // 第三步：验证内容完整性
      const contentValid = this.validateContentIntegrity()
      if (!contentValid) {
        throw new Error('内容完整性验证失败')
      }

      // 第四步：解锁渲染并显示完整内容
      await this.unlockAndRender()

      console.log('✅ 管理员仪表板安全初始化完成')
    } catch (error) {
      console.error('❌ 安全初始化失败', error)
      this.handleInitializationError(error)
    }
  },

  /**
   * 强化：准备所有内容数据
   */
  async prepareAllContent() {
    console.log('📦 准备所有页面内容')

    // 确保用户信息完整
    this.updateUserStatus()

    // 验证菜单数据完整性
    if (!this.data.adminMenuItems || this.data.adminMenuItems.length === 0) {
      throw new Error('管理员菜单数据不完整')
    }

    // 小延迟确保数据设置完成
    await new Promise(resolve => setTimeout(resolve, 100))

    this.setData({
      contentReady: true
    })

    console.log('✅ 所有内容已准备完成')
  },

  /**
   * 强化：验证内容完整性
   */
  validateContentIntegrity() {
    console.log('🔍 验证内容完整性')

    // 检查关键状态
    const requiredStates = ['accessChecked', 'contentReady', 'isLoggedIn', 'isAdmin']

    for (const state of requiredStates) {
      if (!this.data[state]) {
        console.error(`❌ 关键状态缺失: ${state}`)
        return false
      }
    }

    // 检查用户信息
    if (!this.data.userInfo) {
      console.error('❌ 用户信息缺失')
      return false
    }

    // 检查菜单数据
    if (!this.data.adminMenuItems || this.data.adminMenuItems.length < 5) {
      console.error('❌ 管理员菜单数据不完整')
      return false
    }

    console.log('✅ 内容完整性验证通过')
    return true
  },

  /**
   * 强化：解锁渲染并显示完整内容
   */
  async unlockAndRender() {
    console.log('🔓 解锁渲染，显示完整内容')

    // 小延迟确保所有准备工作完成
    await new Promise(resolve => setTimeout(resolve, 150))

    // 一次性解锁所有状态，确保内容同时显示
    this.setData({
      loading: false,
      initialized: true,
      renderLocked: false
    })

    console.log('✅ 页面内容已完整显示')
  },

  /**
   * 强化：处理初始化错误
   */
  handleInitializationError(error) {
    console.error('🚨 初始化错误处理', error)

    wx.showModal({
      title: '页面加载失败',
      content: '管理员页面初始化失败，请重试',
      showCancel: false,
      confirmText: '返回',
      success: () => {
        wx.navigateBack({
          delta: 1
        })
      }
    })
  },

  /**
   * 强化：页面显示 - 完全重置状态，确保干净环境
   */
  onShow() {
    console.log('📊 管理员仪表板页面显示 - 强化模式')

    // 强化：如果页面未完全初始化，执行强制重置
    if (!this.data.initialized || !this.data.contentReady) {
      console.log('🔧 检测到页面状态不完整，执行强制重置')
      this.forceResetPageState()
      return
    }

    // 如果已初始化，只进行轻量级状态更新
    this.updateUserStatus()
    console.log('✅ 页面状态更新完成')
  },

  /**
   * 强化：强制重置页面状态
   */
  forceResetPageState() {
    console.log('🔒 强制重置页面状态')

    // 立即锁定渲染
    this.setData({
      loading: true,
      initialized: false,
      accessChecked: false,
      contentReady: false,
      renderLocked: true
    })

    // 延迟重新初始化，确保状态重置完成
    setTimeout(() => {
      this.performSecureInitialization()
    }, 150)
  },

  /**
   * 强化：页面隐藏时清理状态
   */
  onHide() {
    console.log('📊 管理员仪表板页面隐藏')
    // 清理可能的定时器
    if (this.initTimer) {
      clearTimeout(this.initTimer)
      this.initTimer = null
    }
  },

  /**
   * 强化：页面卸载时完全清理
   */
  onUnload() {
    console.log('📊 管理员仪表板页面卸载')

    // 清理所有定时器
    if (this.initTimer) {
      clearTimeout(this.initTimer)
      this.initTimer = null
    }

    // 强制重置状态，为下次加载准备
    this.setData({
      loading: true,
      initialized: false,
      accessChecked: false,
      contentReady: false,
      renderLocked: true
    })

    console.log('✅ 页面状态已完全清理')
  },

  /**
   * 新增：同步权限检查方法，避免异步渲染问题 - V4.0 使用JWT Token权限字段
   */
  checkAdminAccessSync() {
    const globalData = app.globalData
    // 🔴 修复：布尔值判断，避免返回token字符串
    const isLoggedIn = !!(globalData.isLoggedIn && globalData.access_token)

    // 🔴 修复：从userInfo中读取JWT Token的权限字段（snake_case命名）
    const userInfo = globalData.userInfo
    const isAdmin =
      userInfo &&
      (userInfo.is_admin === true ||
        userInfo.user_role === 'admin' ||
        (userInfo.role_level && userInfo.role_level >= 100))

    console.log('🔐 同步权限检查(V4.0):', {
      isLoggedIn,
      isAdmin,
      hasUserInfo: !!userInfo,
      userInfo_is_admin: userInfo?.is_admin,
      userInfo_user_role: userInfo?.user_role,
      userInfo_role_level: userInfo?.role_level,
      globalData_userRole: globalData.userRole,
      globalData_isLoggedIn: globalData.isLoggedIn,
      has_access_token: !!globalData.access_token
    })

    if (!isLoggedIn) {
      wx.showModal({
        title: '访问限制',
        content: '请先登录再访问管理员功能',
        showCancel: false,
        confirmText: '去登录',
        success: () => {
          wx.reLaunch({
            url: '/pages/auth/auth'
          })
        }
      })
      return false
    }

    if (!isAdmin) {
      wx.showModal({
        title: '权限不足',
        content: '此页面仅限管理员访问',
        showCancel: false,
        confirmText: '返回',
        success: () => {
          wx.navigateBack({
            delta: 1
          })
        }
      })
      return false
    }

    // 修复：权限验证通过，立即标记权限已检查
    this.setData({
      accessChecked: true,
      isLoggedIn,
      isAdmin,
      userInfo: globalData.userInfo || null
    })

    return true
  },

  /**
   * 更新用户状态 - V4.0 使用JWT Token权限字段
   */
  updateUserStatus() {
    const globalData = app.globalData
    // 🔴 修复：布尔值判断，避免返回token字符串
    const isLoggedIn = !!(globalData.isLoggedIn && globalData.access_token)

    // 🔴 修复：从userInfo中读取JWT Token的权限字段（snake_case命名）
    const userInfo = globalData.userInfo
    const isAdmin =
      userInfo &&
      (userInfo.is_admin === true ||
        userInfo.user_role === 'admin' ||
        (userInfo.role_level && userInfo.role_level >= 100))

    this.setData({
      isLoggedIn,
      isAdmin,
      userInfo: globalData.userInfo || null
    })

    console.log('📊 管理员仪表板状态更新(V4.0):', {
      isLoggedIn,
      isAdmin,
      hasUserInfo: !!userInfo,
      userInfo_is_admin: userInfo?.is_admin,
      userInfo_user_role: userInfo?.user_role,
      userInfo_role_level: userInfo?.role_level,
      globalData_userRole: globalData.userRole,
      user_id: userInfo?.user_id
    })
  },

  /**
   * 菜单项点击处理
   */
  onMenuItemTap(e) {
    const item = e.currentTarget.dataset.item
    if (!item) {
      return
    }

    if (!checkAdmin()) {
      return
    }

    // 根据菜单类型处理
    if (item.type === 'page') {
      wx.navigateTo({
        url: item.url
      })
    } else if (item.type === 'action' && item.action && typeof this[item.action] === 'function') {
      this[item.action]()
    }
  },

  /**
   * 管理员功能处理方法
   */

  // 系统概览
  onAdminSystemOverview() {
    if (!checkAdmin()) {
      return
    }

    wx.showModal({
      title: '系统概览',
      content: '系统概览功能开发中，敬请期待',
      showCancel: false
    })
  },

  // 用户管理
  onAdminUserManagement() {
    if (!checkAdmin()) {
      return
    }

    wx.showModal({
      title: '用户管理',
      content: '用户管理功能开发中，敬请期待',
      showCancel: false
    })
  },

  // 抽奖配置
  onAdminLotteryConfig() {
    if (!checkAdmin()) {
      return
    }

    wx.showModal({
      title: '抽奖配置',
      content: '抽奖配置功能开发中，敬请期待',
      showCancel: false
    })
  },

  // 商品管理
  onAdminProductManagement() {
    if (!checkAdmin()) {
      return
    }

    wx.showModal({
      title: '商品管理',
      content: '商品管理功能开发中，敬请期待',
      showCancel: false
    })
  },

  // 数据导出
  onAdminDataExport() {
    if (!checkAdmin()) {
      return
    }

    wx.showModal({
      title: '数据导出',
      content: '数据导出功能开发中，敬请期待',
      showCancel: false
    })
  },

  /**
   * 检查管理员权限
   */
  checkAdminPermission() {
    if (!this.data.isLoggedIn) {
      showToast('请先登录')
      return false
    }

    if (!this.data.isAdmin) {
      showToast('需要管理员权限')
      return false
    }

    return true
  },

  /**
   * 🔧 修复：返回上一页
   * 功能：处理左上角固定返回按钮点击事件
   * 修复内容：返回按钮已提升到最外层，z-index: 10000，
   *          确保在任何加载状态下都能响应点击
   * 用户体验：用户可以随时点击返回，无需等待页面加载完成
   */
  onBackTap() {
    console.log('🔙 点击返回按钮')
    wx.navigateBack({
      delta: 1
    })
  },

  /**
   * 分享功能
   */
  onShareAppMessage() {
    return {
      title: '餐厅积分系统 - 管理员仪表板',
      path: '/pages/admin/admin-dashboard/admin-dashboard'
    }
  }
})
