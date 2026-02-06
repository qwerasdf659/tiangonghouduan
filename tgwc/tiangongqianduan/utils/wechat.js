// utils/wechat.js - 微信小程序工具类v2.0（基于产品功能结构描述文档v2.0）

const { getDevelopmentConfig } = require('../config/env.js')

/**
 * 🔴 微信小程序工具类v2.0 - 餐厅积分抽奖系统
 * 📊 完全符合产品功能结构描述文档v2.0
 * 🏗️ 支持多业务线分层存储架构
 * 🔐 开发阶段123456万能验证码支持
 */
class WechatUtils {
  /**
   * 初始化微信小程序环境（V2.0开发模式）
   * 
   * @description
   * 初始化微信小程序运行环境，检查开发模式配置。
   * 
   * **功能特点**:
   * - 检测是否启用V2.0统一认证模式
   * - 支持开发阶段万能验证码（123456由后端完全控制）
   * - 返回环境初始化状态和版本信息
   * 
   * **业务场景**:
   * - 应用启动时调用（app.js onLaunch）
   * - 验证开发环境配置
   * - 记录环境初始化日志
   * 
   * @returns {object} 初始化结果对象
   * @returns {boolean} returns.success - 初始化是否成功
   * @returns {string} returns.version - 微信工具类版本号
   * @returns {boolean} returns.developmentMode - 是否为开发模式
   * 
   * @example
   * // 在app.js中初始化
   * const { initializeWechatEnvironment } = require('./utils/wechat')
   * 
   * App({
   *   onLaunch() {
   *     const result = initializeWechatEnvironment()
   *     console.log('微信环境初始化:', result)
   *     // => { success: true, version: '2.0.0', developmentMode: true }
   *   }
   * })
   * 
   * @since 2025-10-31
   * @version 2.0.0
   * @see {@link config/env.js} getDevelopmentConfig()开发配置
   */
  static initializeWechatEnvironment() {
    const devConfig = getDevelopmentConfig()

    console.log('🚀 微信环境初始化v2.0', {
      isDevelopment: devConfig.enableUnifiedAuth
      // 🔴 万能验证码123456完全由后端控制，前端不记录
    })

    return {
      success: true,
      version: '2.0.0',
      developmentMode: devConfig.enableUnifiedAuth
    }
  }

  /**
   * 获取微信用户信息（开发/生产环境自动切换）
   * 
   * @description
   * 获取微信用户的基本资料信息，根据环境配置自动切换获取方式。
   * 
   * **环境区分**:
   * - 开发环境：返回模拟用户信息（避免频繁授权）
   * - 生产环境：调用wx.getUserProfile获取真实用户信息
   * 
   * **业务场景**:
   * - 用户首次登录时获取资料
   * - 完善用户档案
   * - 显示用户头像和昵称
   * 
   * **实现细节**:
   * - 开发模式通过getDevelopmentConfig().enableUnifiedAuth判断
   * - 生产环境需用户主动授权（微信政策要求）
   * - 返回统一格式的用户信息对象
   * 
   * @async
   * @returns {Promise<object>} 用户信息结果对象
   * @returns {boolean} returns.success - 获取是否成功
   * @returns {object} returns.userInfo - 用户信息对象
   * @returns {string} returns.userInfo.nickName - 用户昵称
   * @returns {string} returns.userInfo.avatarUrl - 用户头像URL
   * @returns {number} returns.userInfo.gender - 性别（0未知/1男/2女）
   * @returns {string} returns.userInfo.country - 国家
   * @returns {string} returns.userInfo.province - 省份
   * @returns {string} returns.userInfo.city - 城市
   * @returns {String} returns.source - 数据来源（'development_mock' | 'wechat_official'）
   * 
   * @example
   * // 页面中获取用户信息
   * const { getUserProfile } = require('../../utils/wechat')
   * 
   * async onGetUserInfo() {
   *   try {
   *     const result = await getUserProfile()
   *     if (result.success) {
   *       console.log('用户信息:', result.userInfo)
   *       this.setData({ userInfo: result.userInfo })
   *     }
   *   } catch (error) {
   *     console.error('获取用户信息失败:', error)
   *   }
   * }
   * 
   * @throws {Error} 用户拒绝授权或网络错误时抛出异常
   * 
   * @since 2025-10-31
   * @version 2.0.0
   * @see {@link config/env.js} getDevelopmentConfig()环境配置
   */
  static getUserProfile() {
    return new Promise((resolve, reject) => {
      const devConfig = getDevelopmentConfig()

      // 🚧 开发阶段：简化用户信息获取
      if (devConfig.enableUnifiedAuth) {
        console.log('📱 开发模式：使用模拟用户信息')
        resolve({
          success: true,
          userInfo: {
            nickName: '开发测试用户',
            avatarUrl: '/images/default-avatar.png',
            gender: 1,
            country: '中国',
            province: '广东',
            city: '深圳'
          },
          source: 'development_mock'
        })
        return
      }

      // 🔴 生产环境：标准微信用户信息获取
      wx.getUserProfile({
        desc: '用于完善会员资料',
        success(res) {
          console.log('✅ 获取用户信息成功', res.userInfo)
          resolve({
            success: true,
            userInfo: res.userInfo,
            source: 'wechat_official'
          })
        },
        fail(err) {
          console.error('❌ 获取用户信息失败', err)
          reject({
            success: false,
            error: err,
            message: '获取用户信息失败，请重试'
          })
        }
      })
    })
  }

  /**
   * 请求微信用户授权
   * 
   * @description
   * 向用户请求特定的微信授权（如定位、相机、相册等）。
   * 
   * **常用授权类型**:
   * - `scope.userLocation` - 地理位置
   * - `scope.camera` - 摄像头
   * - `scope.album` - 相册
   * - `scope.record` - 录音
   * - `scope.writePhotosAlbum` - 保存到相册
   * 
   * **业务场景**:
   * - 拍照上传前请求相机权限
   * - 选择图片前请求相册权限
   * - LBS功能前请求定位权限
   * 
   * @async
   * @param {string} scope - 授权类型（如'scope.camera'）
   * @returns {Promise<object>} 授权结果对象
   * @returns {boolean} returns.success - 授权是否成功
   * @returns {string} returns.scope - 授权类型
   * 
   * @example
   * // 请求相机权限
   * const { requestAuthorization } = require('../../utils/wechat')
   * 
   * async requestCameraPermission() {
   *   try {
   *     const result = await requestAuthorization('scope.camera')
   *     if (result.success) {
   *       console.log('相机权限已授权')
   *       // 可以调用wx.chooseImage等API
   *     }
   *   } catch (error) {
   *     console.warn('用户拒绝授权:', error)
   *     wx.showModal({
   *       title: '需要相机权限',
   *       content: '请在设置中开启相机权限'
   *     })
   *   }
   * }
   * 
   * @throws {Error} 用户拒绝授权时抛出异常
   * 
   * @since 2025-10-31
   * @version 2.0.0
   */
  static requestAuthorization(scope) {
    return new Promise((resolve, reject) => {
      wx.authorize({
        scope,
        success() {
          console.log(`✅ 授权成功: ${scope}`)
          resolve({ success: true, scope })
        },
        fail(err) {
          console.warn(`⚠️ 授权失败: ${scope}`, err)
          reject({ success: false, scope, error: err })
        }
      })
    })
  }

  /**
   * 显示消息提示框（Toast）
   * 
   * @description
   * 在页面中央显示轻量级的消息提示，自动消失。
   * 
   * **图标类型**:
   * - `success` - 成功图标（绿色对勾）
   * - `error` - 错误图标（红色叉号）
   * - `loading` - 加载图标（转圈）
   * - `none` - 无图标（默认）
   * 
   * **业务场景**:
   * - 操作成功提示（如"兑换成功"）
   * - 操作失败提示（如"积分不足"）
   * - 验证错误提示（如"请输入手机号"）
   * - 通用消息通知
   * 
   * **使用建议**:
   * - 提示文字不超过15个汉字
   * - 使用简洁明确的表述
   * - 持续时间1.5-3秒为宜
   * 
   * @param {string} title - 提示文本内容（不超过15个字）
   * @param {String} [icon='none'] - 图标类型（'success'|'error'|'loading'|'none'）
   * @param {Number} [duration=2000] - 提示持续时间（毫秒）
   * @returns {void}
   * 
   * @example
   * // 成功提示
   * const { showToast } = require('../../utils/wechat')
   * showToast('兑换成功', 'success', 2000)
   * 
   * @example
   * // 错误提示
   * showToast('积分不足', 'error')
   * 
   * @example
   * // 普通提示
   * showToast('请输入手机号')
   * 
   * @since 2025-10-31
   * @version 2.0.0
   */
  static showToast(title, icon = 'none', duration = 2000) {
    wx.showToast({
      title,
      icon,
      duration,
      mask: true
    })
  }

  /**
   * 显示加载中提示框（Loading）
   * 
   * @description
   * 显示模态加载提示框，需要主动调用hideLoading关闭。
   * 
   * **功能特点**:
   * - 显示加载动画（转圈图标）
   * - 阻止用户操作（mask遮罩）
   * - 不会自动消失，必须手动关闭
   * 
   * **业务场景**:
   * - API请求期间（如加载商品列表）
   * - 数据处理中（如提交表单）
   * - 异步操作等待（如文件上传）
   * 
   * **使用规范**:
   * - 必须与hideLoading()配对使用
   * - 避免长时间显示（超过10秒应给提示）
   * - 注意异常情况下的关闭处理
   * 
   * @param {string} [title='加载中...'] - 加载提示文本
   * @returns {void}
   * 
   * @example
   * // 基础使用（配对使用）
   * const { showLoading, hideLoading } = require('../../utils/wechat')
   * 
   * async loadData() {
   *   showLoading('加载中...')
   *   try {
   *     const data = await API.getProducts()
   *     this.setData({ products: data })
   *   } catch (error) {
   *     console.error('加载失败:', error)
   *   } finally {
   *     hideLoading() // 确保关闭loading
   *   }
   * }
   * 
   * @example
   * // 自定义提示文本
   * showLoading('提交中...')
   * 
   * @since 2025-10-31
   * @version 2.0.0
   * @see {@link hideLoading} 必须配对使用
   */
  static showLoading(title = '加载中...') {
    wx.showLoading({
      title,
      mask: true
    })
  }

  /**
   * 隐藏加载中提示框
   * 
   * @description
   * 关闭通过showLoading()显示的加载提示框。
   * 
   * **使用规范**:
   * - 必须与showLoading()配对使用
   * - 建议在finally块中调用，确保一定关闭
   * - 异步操作结束时立即调用
   * 
   * **业务场景**:
   * - API请求完成后关闭loading
   * - 数据处理完成后关闭loading
   * - 发生错误时关闭loading
   * 
   * @returns {void}
   * 
   * @example
   * // 标准配对使用
   * const { showLoading, hideLoading } = require('../../utils/wechat')
   * 
   * async submitForm() {
   *   showLoading('提交中...')
   *   try {
   *     await API.submitData(formData)
   *     showToast('提交成功', 'success')
   *   } catch (error) {
   *     showToast('提交失败', 'error')
   *   } finally {
   *     hideLoading() // 确保关闭
   *   }
   * }
   * 
   * @since 2025-10-31
   * @version 2.0.0
   * @see {@link showLoading} 必须配对使用
   */
  static hideLoading() {
    wx.hideLoading()
  }

  /**
   * 页面跳转（保留当前页面）
   * 
   * @description
   * 跳转到应用内的某个页面，保留当前页面，支持返回。
   * 自动构建URL查询参数。
   * 
   * **功能特点**:
   * - 自动构建查询参数字符串
   * - 自动URL编码特殊字符
   * - 支持传递多个参数
   * - 失败时自动提示用户
   * 
   * **业务场景**:
   * - 商品列表跳转到商品详情
   * - 首页跳转到抽奖页面
   * - 用户中心跳转到积分明细
   * 
   * **限制说明**:
   * - 页面栈最多10层，超过会自动关闭最早的页面
   * - 不能跳转到tabbar页面（使用wx.switchTab）
   * - url必须以'/'开头
   * 
   * @param {String} url - 目标页面路径（如'/pages/detail/detail'）
   * @param {Object} [params={}] - URL查询参数对象
   * @returns {void}
   * 
   * @example
   * // 基础跳转（无参数）
   * const { navigateTo } = require('../../utils/wechat')
   * navigateTo('/pages/lottery/lottery')
   * 
   * @example
   * // 带参数跳转
   * navigateTo('/pages/detail/detail', {
   *   product_id: '123',
   *   source: 'exchange'
   * })
   * // 实际跳转: /pages/detail/detail?product_id=123&source=exchange
   * 
   * @example
   * // 多个参数
   * navigateTo('/pages/user/user', {
   *   tab: 'records',
   *   filter: 'recent',
   *   page: 1
   * })
   * 
   * @since 2025-10-31
   * @version 2.0.0
   */
  static navigateTo(url, params = {}) {
    // 构建查询参数
    const queryString = Object.keys(params)
      .map(key => `${key}=${encodeURIComponent(params[key])}`)
      .join('&')

    const fullUrl = queryString ? `${url}?${queryString}` : url

    wx.navigateTo({
      url: fullUrl,
      success() {
        console.log(`✅ 页面跳转成功: ${fullUrl}`)
      },
      fail(err) {
        console.error(`❌ 页面跳转失败: ${fullUrl}`, err)
        this.showToast('页面跳转失败')
      }
    })
  }

  /**
   * 返回上一页或多层页面
   * 
   * @description
   * 关闭当前页面，返回上一页面或多级页面。
   * 
   * **功能特点**:
   * - 支持返回多层页面
   * - 自动关闭当前页面
   * - 失败时自动提示用户
   * 
   * **业务场景**:
   * - 详情页返回列表页
   * - 表单提交成功后返回
   * - 取消操作返回上一页
   * 
   * **限制说明**:
   * - delta最大值为当前页面栈层数-1
   * - 如果delta超过当前层数，返回到首页
   * - tabbar页面不会被关闭
   * 
   * @param {number} [delta=1] - 返回的页面数（1表示返回上一页）
   * @returns {void}
   * 
   * @example
   * // 返回上一页
   * const { navigateBack } = require('../../utils/wechat')
   * navigateBack()
   * 
   * @example
   * // 返回上两页
   * navigateBack(2)
   * 
   * @example
   * // 表单提交成功后返回
   * async onSubmit() {
   *   try {
   *     await API.submitForm(formData)
   *     showToast('提交成功', 'success')
   *     setTimeout(() => {
   *       navigateBack()
   *     }, 1500)
   *   } catch (error) {
   *     showToast('提交失败', 'error')
   *   }
   * }
   * 
   * @since 2025-10-31
   * @version 2.0.0
   */
  static navigateBack(delta = 1) {
    wx.navigateBack({
      delta,
      success() {
        console.log(`✅ 返回上一页成功, delta: ${delta}`)
      },
      fail(err) {
        console.error('❌ 返回上一页失败', err)
        this.showToast('返回失败')
      }
    })
  }

  /**
   * 获取系统信息（兼容微信新API）
   * 
   * @description
   * 获取设备系统信息、窗口信息、设置信息等。
   * 
   * **🔧 重要更新**:
   * - 微信已弃用`wx.getSystemInfo`
   * - 现使用`Promise.all`并行调用新API:
   *   - `wx.getWindowInfo()` - 窗口信息
   *   - `wx.getSystemSetting()` - 系统设置
   *   - `wx.getDeviceInfo()` - 设备信息
   *   - `wx.getAppBaseInfo()` - 应用基础信息
   * - 合并所有信息返回，保持向后兼容
   * 
   * **返回信息包含**:
   * - 窗口尺寸（windowWidth、windowHeight、pixelRatio）
   * - 设备信息（platform、system、brand、model）
   * - 应用信息（version、SDKVersion）
   * - 系统设置（theme、deviceOrientation）
   * 
   * **业务场景**:
   * - 页面布局适配（根据窗口尺寸）
   * - 设备识别（iOS/Android）
   * - 功能兼容性检查（微信版本）
   * - 用户行为分析（设备信息统计）
   * 
   * @async
   * @returns {Promise<object>} 系统信息结果对象
   * @returns {boolean} returns.success - 获取是否成功
   * @returns {object} returns.systemInfo - 系统信息对象
   * @returns {number} returns.systemInfo.windowWidth - 可使用窗口宽度（px）
   * @returns {number} returns.systemInfo.windowHeight - 可使用窗口高度（px）
   * @returns {number} returns.systemInfo.pixelRatio - 设备像素比
   * @returns {string} returns.systemInfo.platform - 客户端平台（'ios'|'android'|'windows'|'mac'）
   * @returns {string} returns.systemInfo.system - 操作系统及版本
   * @returns {string} returns.systemInfo.version - 微信版本号
   * 
   * @example
   * // 获取系统信息
   * const { getSystemInfo } = require('../../utils/wechat')
   * 
   * async onLoad() {
   *   try {
   *     const result = await getSystemInfo()
   *     if (result.success) {
   *       const { windowWidth, windowHeight, platform } = result.systemInfo
   *       console.log('窗口尺寸:', windowWidth, windowHeight)
   *       console.log('平台:', platform)
   *       
   *       // 根据窗口宽度适配布局
   *       this.setData({
   *         isSmallScreen: windowWidth < 375
   *       })
   *     }
   *   } catch (error) {
   *     console.error('获取系统信息失败:', error)
   *   }
   * }
   * 
   * @example
   * // 检查微信版本是否支持某功能
   * const result = await getSystemInfo()
   * const version = result.systemInfo.version
   * const isSupported = compareVersion(version, '7.0.0') >= 0
   * 
   * @throws {Error} API调用失败时抛出异常
   * 
   * @since 2025-10-31
   * @version 2.0.0
   */
  static getSystemInfo() {
    return new Promise((resolve, reject) => {
      // 🔧 使用Promise.all并行获取系统的各个方面信息
      Promise.all([
        new Promise((res, rej) => wx.getWindowInfo({ success: res, fail: rej })),
        new Promise((res, rej) => wx.getSystemSetting({ success: res, fail: rej })),
        new Promise((res, rej) => wx.getDeviceInfo({ success: res, fail: rej })),
        new Promise((res, rej) => wx.getAppBaseInfo({ success: res, fail: rej }))
      ])
        .then(([windowInfo, systemSetting, deviceInfo, appBaseInfo]) => {
          // 🔧 合并所有信息到一个对象中，保持兼容性
          const combinedSystemInfo = {
            ...windowInfo,
            ...systemSetting,
            ...deviceInfo,
            ...appBaseInfo,
            // 保持原有字段兼容性
            windowWidth: windowInfo.windowWidth,
            windowHeight: windowInfo.windowHeight,
            pixelRatio: windowInfo.pixelRatio,
            platform: deviceInfo.platform,
            system: deviceInfo.system,
            version: appBaseInfo.version
          }

          console.log('✅ 系统信息获取成功', combinedSystemInfo)
          resolve({
            success: true,
            systemInfo: combinedSystemInfo
          })
        })
        .catch(err => {
          console.error('❌ 系统信息获取失败', err)
          reject({
            success: false,
            error: err
          })
        })
    })
  }
}

// 🔴 导出工具类和初始化函数
module.exports = {
  WechatUtils,
  initializeWechatEnvironment: WechatUtils.initializeWechatEnvironment,
  getUserProfile: WechatUtils.getUserProfile,
  showToast: WechatUtils.showToast,
  showLoading: WechatUtils.showLoading,
  hideLoading: WechatUtils.hideLoading,
  navigateTo: WechatUtils.navigateTo,
  navigateBack: WechatUtils.navigateBack
}
