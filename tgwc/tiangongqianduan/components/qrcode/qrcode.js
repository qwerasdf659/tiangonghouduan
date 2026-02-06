/**
 * 用户身份二维码组件 - V4.0统一架构
 *
 * @file components/qrcode/qrcode.js
 * @description
 * 用于生成和显示用户身份二维码的组件，供商家扫描使用。
 *
 * **技术方案**：
 * - Canvas 2D API（微信小程序）
 * - weapp-qrcode库（二维码生成）
 * - H级纠错（30%容错能力）
 *
 * **V4.0特性**：
 * - 统一使用utils/index.js导入工具函数
 * - 移除旧版Canvas API兼容代码（仅支持Canvas 2D）
 * - 完全依赖后端真实数据
 *
 * @version 4.0.0
 * @since 2025-10-31
 */

const QRCode = require('../../utils/weapp-qrcode.js')
// 🔴 V4.0规范：统一使用utils/index.js导入工具函数
const { API } = require('../../utils/index')

/**
 * 用户身份二维码组件
 *
 * @component qrcode
 * @description
 * 用于生成和显示用户身份二维码的组件，供商家扫描使用
 *
 * 💡 新业务流程（2025更新）：
 * 1. 用户消费后打开小程序，展示此二维码
 * 2. 商家扫描用户二维码，在商家端输入消费金额
 * 3. 提交后进入审核状态，积分冻结（24小时内审核）
 * 4. 审核通过后，冻结积分转为可用积分
 *
 * 🔧 技术特性：
 * - 自动获取用户身份信息（user_id + signature）
 * - 使用weapp-qrcode库生成二维码
 * - H级纠错（30%容错能力）
 * - 支持本地缓存（24小时）
 * - 支持刷新和保存到相册
 */
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 二维码尺寸（单位：px）
    size: {
      type: Number,
      value: 300
    },
    // 是否显示标题
    showTitle: {
      type: Boolean,
      value: true
    },
    // 标题文字
    title: {
      type: String,
      value: '我的身份二维码'
    },
    // 是否显示用户信息
    showUserInfo: {
      type: Boolean,
      value: false
    },
    // 是否显示操作按钮
    showActions: {
      type: Boolean,
      value: true
    },
    // 是否自动生成（组件加载后自动生成二维码）
    autoGenerate: {
      type: Boolean,
      value: true
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    qrCodeImage: '', // 二维码图片路径
    loading: false, // 加载状态
    errorMessage: '', // 错误信息
    userInfo: null, // 用户信息
    qrContent: '' // 二维码内容（JSON字符串）
  },

  /**
   * 组件生命周期函数 - 在组件实例进入页面节点树时执行
   */
  attached() {
    console.log('🔲 二维码组件已加载')

    // 如果设置了自动生成，则立即生成二维码
    if (this.properties.autoGenerate) {
      this.generateQRCode()
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 生成二维码（主要方法）
     *
     * @description
     * 完整的二维码生成流程：
     * 1. 从缓存读取（如果存在且未过期）
     * 2. 调用API获取用户身份信息（user_id + signature）
     * 3. 构造二维码内容（JSON格式，供商家扫描验证）
     * 4. 使用weapp-qrcode生成二维码（H级纠错，30%容错）
     * 5. 转换为图片并缓存（24小时有效）
     *
     * 💡 用途：供商家扫描，识别用户身份并记录消费
     *
     * @returns {Promise<void>}
     */
    async generateQRCode() {
      console.log('🔲 开始生成二维码...')

      this.setData({
        loading: true,
        errorMessage: ''
      })

      try {
        // 步骤1：检查缓存
        const cached = this.getCachedQRCode()
        if (cached && cached.image) {
          console.log('✅ 使用缓存的二维码')
          this.setData({
            qrCodeImage: cached.image,
            userInfo: cached.userInfo,
            loading: false
          })
          return
        }

        // 步骤2：获取用户身份信息
        console.log('📡 调用API获取用户身份信息...')
        // 🔴 V4.0规范：使用统一的API模块
        const response = await API.getUserIdentity()

        if (!response.success || !response.data) {
          // 🚨 后端API未实现时的明确提示
          const errorMsg = response.message || '获取用户信息失败'
          console.error('❌ getUserIdentity API未实现')
          console.error('📋 需要后端提供接口: GET /api/v4/unified-engine/auth/user-identity')
          console.error('📋 需要返回字段: user_id, user_signature, nickname, phone, points')

          wx.showModal({
            title: '功能开发中',
            content: `二维码生成功能需要后端API支持\n\n${errorMsg}\n\nAPI路径：GET /api/v4/unified-engine/auth/user-identity\n\n请联系后端开发人员实现此接口`,
            showCancel: false,
            confirmText: '知道了'
          })

          throw new Error(errorMsg)
        }

        const identityData = response.data
        console.log('✅ 用户身份信息获取成功:', {
          user_id: identityData.user_id,
          nickname: identityData.nickname
        })

        // 步骤3：构造二维码内容
        const qrContent = JSON.stringify({
          user_id: identityData.user_id,
          signature: identityData.user_signature,
          timestamp: identityData.timestamp || Date.now(),
          type: 'USER_IDENTITY'
        })

        console.log('📋 二维码内容:', qrContent)
        console.log('📏 内容长度:', qrContent.length, '字符')

        // 步骤4：使用weapp-qrcode生成二维码
        await this.drawQRCode(qrContent)

        // 步骤5：转换Canvas为图片
        await this.canvasToImage()

        // 步骤6：缓存结果
        this.cacheQRCode(identityData)

        // 保存用户信息到组件数据
        this.setData({
          userInfo: {
            nickname: identityData.nickname,
            phone: identityData.phone,
            points: identityData.points
          },
          qrContent,
          loading: false
        })

        console.log('✅ 二维码生成成功')

        // 触发成功事件
        this.triggerEvent('success', {
          image: this.data.qrCodeImage,
          userInfo: identityData
        })
      } catch (error) {
        console.error('❌ 二维码生成失败:', error)

        this.setData({
          loading: false,
          errorMessage: error.message || '二维码生成失败，请重试'
        })

        // 触发失败事件
        this.triggerEvent('error', {
          message: error.message
        })

        wx.showToast({
          title: '生成失败',
          icon: 'none'
        })
      }
    },

    /**
     * 绘制二维码到Canvas（Canvas 2D API）
     *
     * @param {string} content - 二维码内容
     * @returns {Promise<void>}
     *
     * @description
     * 使用微信小程序Canvas 2D API绘制二维码。
     *
     * **V4.0特性**：
     * - 仅支持Canvas 2D API（微信基础库2.9.0+）
     * - H级纠错，30%容错能力
     * - 高清显示（支持高分辨率屏幕）
     *
     * **技术细节**：
     * - 根据设备像素比(dpr)调整Canvas尺寸
     * - 使用weapp-qrcode库生成二维码
     * - 异步绘制，确保Canvas准备就绪
     *
     * @throws {Error} Canvas获取失败或绘制失败
     */
    drawQRCode(content) {
      return new Promise((resolve, reject) => {
        try {
          console.log('🎨 开始绘制二维码到Canvas（Canvas 2D API）...')

          // 获取Canvas上下文（Canvas 2D API）
          const query = this.createSelectorQuery()
          query
            .select('#qrCanvas')
            .fields({ node: true, size: true })
            .exec(res => {
              if (!res || !res[0]) {
                const error = new Error('Canvas 2D节点获取失败，请确保微信基础库版本≥2.9.0')
                console.error('❌', error.message)
                reject(error)
                return
              }

              const canvas = res[0].node
              const ctx = canvas.getContext('2d')

              // 设置Canvas尺寸（支持高分辨率屏幕）
              const dpr = wx.getSystemInfoSync().pixelRatio
              canvas.width = this.properties.size * dpr
              canvas.height = this.properties.size * dpr
              ctx.scale(dpr, dpr)

              // 使用weapp-qrcode生成二维码
              // 🔴 H级纠错配置（30%容错能力）
              QRCode.toCanvas(
                {
                  canvas,
                  canvasId: 'qrCanvas',
                  width: this.properties.size,
                  height: this.properties.size,
                  text: content,
                  correctLevel: QRCode.CorrectLevel.H, // ⭐ H级纠错（30%容错）
                  background: '#ffffff',
                  foreground: '#000000'
                },
                error => {
                  if (error) {
                    console.error('❌ 二维码绘制失败:', error)
                    reject(error)
                  } else {
                    console.log('✅ 二维码绘制成功（Canvas 2D API）')
                    resolve()
                  }
                }
              )
            })
        } catch (error) {
          console.error('❌ 绘制二维码异常:', error)
          reject(error)
        }
      })
    },

    /**
     * 将Canvas转换为图片
     *
     * @returns {Promise<string>} 临时图片路径
     */
    canvasToImage() {
      return new Promise((resolve, reject) => {
        console.log('🖼️ 开始转换Canvas为图片...')

        // 延迟执行以确保Canvas绘制完成
        setTimeout(() => {
          wx.canvasToTempFilePath(
            {
              canvasId: 'qrCanvas',
              success: res => {
                console.log('✅ Canvas转换为图片成功:', res.tempFilePath)

                this.setData({
                  qrCodeImage: res.tempFilePath
                })

                resolve(res.tempFilePath)
              },
              fail: error => {
                console.error('❌ Canvas转换失败:', error)
                reject(error)
              }
            },
            this
          )
        }, 500)
      })
    },

    /**
     * 获取缓存的二维码
     *
     * @returns {Object | null} 缓存的二维码数据
     */
    getCachedQRCode() {
      try {
        const cached = wx.getStorageSync('user_qr_code')

        if (!cached || !cached.image || !cached.createdAt) {
          return null
        }

        // 检查缓存是否过期（24小时）
        const now = Date.now()
        const age = now - cached.createdAt
        const maxAge = 24 * 60 * 60 * 1000 // 24小时

        if (age > maxAge) {
          console.log('⚠️ 缓存已过期，需要重新生成')
          wx.removeStorageSync('user_qr_code')
          return null
        }

        console.log('✅ 找到有效缓存，剩余时间:', Math.floor((maxAge - age) / 1000 / 60), '分钟')
        return cached
      } catch (error) {
        console.error('❌ 读取缓存失败:', error)
        return null
      }
    },

    /**
     * 缓存二维码数据
     *
     * @param {Object} userInfo - 用户信息
     */
    cacheQRCode(userInfo) {
      try {
        const cacheData = {
          userId: userInfo.user_id,
          image: this.data.qrCodeImage,
          userInfo: {
            nickname: userInfo.nickname,
            phone: userInfo.phone,
            points: userInfo.points
          },
          createdAt: Date.now()
        }

        wx.setStorageSync('user_qr_code', cacheData)
        console.log('✅ 二维码已缓存（24小时有效）')
      } catch (error) {
        console.error('❌ 缓存失败:', error)
      }
    },

    /**
     * 刷新二维码
     *
     * @description
     * 清除缓存并重新生成二维码
     */
    handleRefresh() {
      console.log('🔄 刷新二维码')

      // 清除缓存
      wx.removeStorageSync('user_qr_code')

      // 重新生成
      this.generateQRCode()
    },

    /**
     * 保存二维码到相册
     *
     * @description
     * 请求用户授权后保存二维码到手机相册
     */
    async handleSave() {
      console.log('💾 保存二维码到相册')

      if (!this.data.qrCodeImage) {
        wx.showToast({
          title: '二维码尚未生成',
          icon: 'none'
        })
        return
      }

      try {
        // 保存图片到相册
        await wx.saveImageToPhotosAlbum({
          filePath: this.data.qrCodeImage
        })

        wx.showToast({
          title: '保存成功',
          icon: 'success'
        })

        // 触发保存成功事件
        this.triggerEvent('saved', {
          filePath: this.data.qrCodeImage
        })
      } catch (error) {
        console.error('❌ 保存失败:', error)

        // 如果是权限问题，引导用户授权
        if (error.errMsg && error.errMsg.includes('auth')) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许访问相册',
            confirmText: '去设置',
            success: res => {
              if (res.confirm) {
                wx.openSetting()
              }
            }
          })
        } else {
          wx.showToast({
            title: '保存失败',
            icon: 'none'
          })
        }
      }
    }
  }
})
