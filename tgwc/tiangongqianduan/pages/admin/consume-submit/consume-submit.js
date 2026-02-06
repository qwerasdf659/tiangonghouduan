// pages/admin/consume-submit/consume-submit.js - 消费录入页面（V4.0）

const app = getApp()
// 🔴 使用统一的工具函数导入
const { API, Utils, Wechat, Validation } = require('../../../utils/index')
const { checkAuth } = Utils

/**
 * 消费录入页面（管理员/商家）
 *
 * @description
 * 管理员或商家扫描用户二维码后，录入消费金额和备注。
 *
 * 核心功能：
 * 1. 自动加载用户信息（昵称、完整手机号码）
 * 2. 输入消费金额（0.01-99999.99元）
 * 3. 输入商家备注（可选，最多200字）
 * 4. 提交消费记录到后端
 * 5. 后端自动计算积分（1元=1分，四舍五入）
 * 6. 创建status='pending'的待审核记录
 *
 * 技术要点：
 * - 前端不进行积分计算（后端权威）
 * - 消费金额范围：0.01-99999.99元
 * - 二维码验证由后端完成（HMAC-SHA256签名）
 * - 防重复提交：3分钟内相同用户+商家+二维码不能重复提交（后端实现）
 *
 * @file pages/admin/consume-submit/consume-submit.js
 * @version 1.0.0
 * @author Restaurant Lottery Team
 * @since 2025-11-07
 */
Page({
  /**
   * 页面数据
   */
  data: {
    // 二维码信息
    qrCode: '', // 扫描到的二维码字符串

    // 用户信息（从后端API获取）
    userInfo: null, // { user_id, nickname, mobile }
    userInfoLoading: false, // 用户信息加载状态

    // 表单数据
    consumeAmount: '', // 消费金额（字符串，保留小数）
    merchantNotes: '', // 商家备注（可选）

    // 页面状态
    loading: false, // 提交状态
    submitted: false // 是否已提交（防止重复提交）
  },

  /**
   * 生命周期函数 - 监听页面加载
   *
   * @param {object} options - 页面参数
   * @param {String} options.qrCode - 扫描到的二维码字符串（URL编码）
   */
  onLoad(options) {
    console.log('📋 消费录入页面加载，参数:', options)

    // 🔴 权限验证：必须是管理员或商家
    if (!checkAuth()) {
      console.error('❌ 用户未登录，跳转到登录页')
      return
    }

    // 🔴 检查管理员权限（后续可扩展为商家权限）
    const userInfo = app.globalData.userInfo
    const isAdmin =
      (userInfo && userInfo.role === 'admin') ||
      (userInfo && userInfo.is_admin === true) ||
      (userInfo && userInfo.user_role === 'admin')

    if (!isAdmin) {
      console.error('❌ 用户无管理员权限')
      wx.showModal({
        title: '权限不足',
        content: '您没有权限访问此页面，仅管理员和商家可录入消费。',
        showCancel: false,
        success: () => {
          wx.navigateBack()
        }
      })
      return
    }

    // 🔴 获取二维码参数
    if (!options.qrCode) {
      console.error('❌ 缺少二维码参数')
      wx.showModal({
        title: '参数错误',
        content: '缺少二维码参数，请重新扫码。',
        showCancel: false,
        success: () => {
          wx.navigateBack()
        }
      })
      return
    }

    // URL解码二维码
    const qrCode = decodeURIComponent(options.qrCode)
    console.log('✅ 二维码解码成功:', qrCode)

    this.setData({ qrCode })

    // 🔴 自动加载用户信息
    this.loadUserInfo()
  },

  /**
   * 根据二维码加载用户信息
   *
   * @description
   * 调用后端API `GET /api/v4/consumption/user-info?qr_code=xxx`
   * 获取用户昵称和完整手机号码（不脱敏）。
   *
   * ✅ API已在文档中完整定义（含实现方案）
   * 📋 文档位置：《管理员扫码审核功能技术方案-重构版.md》Line 323-423
   * 📝 包含：API规范、后端路由代码示例、Service层方法示例
   *
   * @async
   * @returns {Promise<void>}
   */
  async loadUserInfo() {
    this.setData({ userInfoLoading: true })

    try {
      console.log('🔍 开始获取用户信息，二维码:', this.data.qrCode)

      // 🔴 调用后端API：根据二维码获取用户信息（按文档Line 323-423实现）
      const result = await API.getUserInfoByQRCode(this.data.qrCode)

      if (result && result.success && result.data) {
        this.setData({
          userInfo: result.data,
          userInfoLoading: false
        })
        console.log('✅ 用户信息加载成功:', result.data)
      } else {
        throw new Error(result.message || '获取用户信息失败')
      }
    } catch (error) {
      console.error('❌ 加载用户信息失败:', error)

      this.setData({
        userInfo: null,
        userInfoLoading: false
      })

      wx.showModal({
        title: '加载失败',
        content: `无法获取用户信息：${error.message}\n\n可能的原因：\n1. 二维码无效或已过期\n2. 用户不存在\n3. 网络连接异常`,
        showCancel: true,
        cancelText: '返回',
        confirmText: '重试',
        success: res => {
          if (res.confirm) {
            this.loadUserInfo()
          } else {
            wx.navigateBack()
          }
        }
      })
    }
  },

  /**
   * 消费金额输入事件
   *
   * @description
   * 用户输入消费金额时触发，实时更新数据。
   *
   * @param {object} e - 事件对象
   * @param {object} e.detail - 事件详情
   * @param {string} e.detail.value - 输入的金额（字符串）
   */
  onAmountInput(e) {
    const amount = e.detail.value
    console.log('💰 消费金额输入:', amount)

    this.setData({
      consumeAmount: amount
    })
  },

  /**
   * 商家备注输入事件
   *
   * @description
   * 用户输入商家备注时触发，实时更新数据。
   *
   * @param {object} e - 事件对象
   * @param {object} e.detail - 事件详情
   * @param {string} e.detail.value - 输入的备注内容
   */
  onNotesInput(e) {
    const notes = e.detail.value
    console.log('📝 商家备注输入:', notes)

    this.setData({
      merchantNotes: notes
    })
  },

  /**
   * 提交消费记录
   *
   * @description
   * 验证表单数据后，调用后端API提交消费记录。
   *
   * 验证规则：
   * 1. 用户信息必须加载成功
   * 2. 消费金额必填，范围：0.01-99999.99元
   * 3. 商家备注可选，最多200字
   *
   * 提交流程：
   * 1. 前端验证
   * 2. 调用后端API `POST /api/v4/consumption/submit`
   * 3. 后端验证二维码（HMAC-SHA256签名）
   * 4. 后端计算积分（1元=1分，Math.round四舍五入）
   * 5. 后端创建status='pending'的待审核记录
   * 6. 返回成功提示，2秒后自动返回上一页
   *
   * @async
   * @returns {Promise<void>}
   */
  async onSubmit() {
    // 🔴 防止重复提交
    if (this.data.loading || this.data.submitted) {
      console.warn('⚠️ 请勿重复提交')
      return
    }

    // 🔴 验证用户信息
    if (!this.data.userInfo) {
      wx.showToast({
        title: '用户信息未加载',
        icon: 'none',
        duration: 2000
      })
      return
    }

    // 🔴 验证消费金额
    const amount = parseFloat(this.data.consumeAmount)

    if (!this.data.consumeAmount || isNaN(amount)) {
      wx.showToast({
        title: '请输入消费金额',
        icon: 'none',
        duration: 2000
      })
      return
    }

    if (amount < 0.01) {
      wx.showToast({
        title: '消费金额至少0.01元',
        icon: 'none',
        duration: 2000
      })
      return
    }

    if (amount > 99999.99) {
      wx.showToast({
        title: '消费金额不能超过99999.99元',
        icon: 'none',
        duration: 2000
      })
      return
    }

    // 🔴 二次确认
    const confirmResult = await new Promise(resolve => {
      wx.showModal({
        title: '确认提交',
        content: `用户：${this.data.userInfo.nickname || this.data.userInfo.mobile}\n消费金额：¥${amount.toFixed(2)}元\n\n提交后将创建待审核记录，请确认信息无误。`,
        success: res => {
          resolve(res.confirm)
        }
      })
    })

    if (!confirmResult) {
      console.log('ℹ️ 用户取消提交')
      return
    }

    // 🔴 开始提交
    this.setData({ loading: true })

    try {
      console.log('📤 开始提交消费记录...')
      console.log('📋 提交参数:', {
        qr_code: this.data.qrCode,
        consumption_amount: amount,
        merchant_notes: this.data.merchantNotes || undefined
      })

      // 🔴 调用后端API提交消费记录
      const result = await API.submitConsumption({
        qr_code: this.data.qrCode,
        consumption_amount: amount,
        merchant_notes: this.data.merchantNotes || undefined
      })

      console.log('✅ 提交成功:', result)

      // 🔴 标记已提交（防止重复提交）
      this.setData({ submitted: true })

      // 🔴 显示成功提示
      wx.showModal({
        title: '提交成功',
        content: `消费记录已提交！\n\n预计奖励积分：${result.data.points_to_award || '待审核'}分\n记录状态：待审核\n\n管理员审核通过后，积分将自动发放给用户。`,
        showCancel: false,
        success: () => {
          // 2秒后自动返回上一页
          setTimeout(() => {
            wx.navigateBack()
          }, 1000)
        }
      })
    } catch (error) {
      console.error('❌ 提交失败:', error)

      // 🔴 根据错误类型显示不同提示
      let errorMessage = error.message || '提交失败，请重试'

      if (error.message && error.message.includes('二维码')) {
        errorMessage = '二维码无效或已过期，请重新扫码'
      } else if (error.message && error.message.includes('重复')) {
        errorMessage = '检测到重复提交，请3分钟后再试'
      } else if (error.message && error.message.includes('权限')) {
        errorMessage = '您没有权限提交消费记录'
      }

      wx.showModal({
        title: '提交失败',
        content: errorMessage,
        showCancel: true,
        cancelText: '返回',
        confirmText: '重试',
        success: res => {
          if (!res.confirm) {
            wx.navigateBack()
          }
        }
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 生命周期函数 - 监听页面显示
   */
  onShow() {
    console.log('📋 消费录入页面显示')
  },

  /**
   * 生命周期函数 - 监听页面隐藏
   */
  onHide() {
    console.log('📋 消费录入页面隐藏')
  },

  /**
   * 生命周期函数 - 监听页面卸载
   */
  onUnload() {
    console.log('📋 消费录入页面卸载')
  }
})
