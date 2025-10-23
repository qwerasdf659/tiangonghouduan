/**
 * 优化的微信小程序图片上传代码
 * 解决503错误和提升用户体验
 * 
 * 使用方法：
 * 1. 将此代码复制到你的 camera.js 或相关文件中
 * 2. 替换现有的上传逻辑
 * 3. 确保userId已正确存储
 */

// ============================================
// 方案1：基础优化版本（推荐）
// ============================================

/**
 * 优化的图片上传函数
 * @param {string} filePath - 图片文件路径
 * @param {object} options - 可选配置
 */
function uploadImageOptimized(filePath, options = {}) {
  const {
    onProgress = () => {},
    onSuccess = () => {},
    onError = () => {}
  } = options

  // 1. 获取用户ID（必需参数）
  const userId = wx.getStorageSync('userId') || wx.getStorageSync('user_id')
  
  if (!userId) {
    wx.showToast({
      title: '请先登录',
      icon: 'none'
    })
    onError({ code: 'NO_USER_ID', message: '用户未登录' })
    return
  }

  // 2. 检查网络状态
  wx.getNetworkType({
    success: (res) => {
      console.log('📡 网络类型:', res.networkType)
      
      if (res.networkType === 'none') {
        wx.showToast({
          title: '网络未连接',
          icon: 'none'
        })
        onError({ code: 'NO_NETWORK', message: '网络未连接' })
        return
      }
    }
  })

  // 3. 显示加载提示
  wx.showLoading({
    title: '上传中...',
    mask: true
  })

  console.log('========== 开始上传图片 ==========')
  console.log('📤 文件路径:', filePath)
  console.log('👤 用户ID:', userId)
  console.log('⏰ 时间:', new Date().toISOString())

  // 4. 执行上传
  const uploadTask = wx.uploadFile({
    url: 'https://omqktqrtntnn.sealosbja.site/api/v4/photo/upload',
    filePath: filePath,
    name: 'photo',  // ⚠️ 必须是'photo'，不是'file'或'image'
    timeout: 60000, // ✅ 60秒超时
    header: {
      'Content-Type': 'multipart/form-data'
    },
    formData: {
      user_id: userId,  // ✅ 必需参数
      business_type: 'user_upload_review'  // 业务类型
    },
    success: (res) => {
      wx.hideLoading()
      
      console.log('📥 上传响应:', res)
      console.log('状态码:', res.statusCode)
      console.log('响应数据:', res.data)

      try {
        const data = JSON.parse(res.data)
        
        if (data.success) {
          console.log('✅ 上传成功')
          wx.showToast({
            title: '上传成功',
            icon: 'success',
            duration: 2000
          })
          onSuccess(data)
        } else {
          console.error('❌ 上传失败:', data.message)
          
          // 根据错误代码显示不同提示
          let errorMsg = data.message || '上传失败'
          
          if (data.code === 'USER_NOT_FOUND') {
            errorMsg = '用户信息已过期，请重新登录'
          } else if (data.code === 'MISSING_FILE') {
            errorMsg = '请选择要上传的图片'
          } else if (data.code === 'FILE_TOO_LARGE') {
            errorMsg = '图片文件过大（最大10MB）'
          }
          
          wx.showToast({
            title: errorMsg,
            icon: 'none',
            duration: 3000
          })
          onError(data)
        }
      } catch (e) {
        console.error('❌ 解析响应失败:', e)
        wx.showToast({
          title: '响应解析失败',
          icon: 'none'
        })
        onError({ code: 'PARSE_ERROR', message: '响应解析失败', error: e })
      }
    },
    fail: (err) => {
      wx.hideLoading()
      
      console.error('❌ 上传失败:', err)
      console.error('错误码:', err.errMsg)
      console.error('状态码:', err.statusCode)
      
      // 详细的错误处理
      let errorMsg = '上传失败'
      
      if (err.statusCode === 503) {
        errorMsg = '服务器繁忙，请稍后重试'
        console.error('🔴 503错误 - 可能原因:')
        console.error('   1. 域名白名单未配置')
        console.error('   2. 配置未生效（需重启开发者工具）')
        console.error('   3. 服务器临时不可用')
      } else if (err.statusCode === 400) {
        errorMsg = '上传参数错误'
      } else if (err.statusCode === 404) {
        errorMsg = '用户不存在，请重新登录'
      } else if (err.statusCode === 413) {
        errorMsg = '图片文件过大'
      } else if (err.errMsg?.includes('timeout')) {
        errorMsg = '上传超时，请检查网络'
      } else if (err.errMsg?.includes('fail')) {
        errorMsg = '网络连接失败'
      }
      
      wx.showToast({
        title: errorMsg,
        icon: 'none',
        duration: 3000
      })
      
      onError(err)
    }
  })

  // 5. 监听上传进度
  uploadTask.onProgressUpdate((res) => {
    console.log('📊 上传进度:', res.progress + '%')
    console.log('   已上传:', res.totalBytesSent)
    console.log('   总大小:', res.totalBytesExpectedToSend)
    
    onProgress(res)
  })

  return uploadTask
}

// ============================================
// 方案2：带自动重试版本（高级）
// ============================================

/**
 * 带自动重试的图片上传函数
 * @param {string} filePath - 图片文件路径
 * @param {object} options - 配置选项
 * @param {number} maxRetries - 最大重试次数
 */
function uploadImageWithRetry(filePath, options = {}, maxRetries = 3) {
  return new Promise((resolve, reject) => {
    let retryCount = 0
    
    function attemptUpload() {
      console.log(`📤 上传尝试 ${retryCount + 1}/${maxRetries + 1}`)
      
      // 使用基础上传函数
      uploadImageOptimized(filePath, {
        onSuccess: (data) => {
          console.log('✅ 上传成功')
          resolve(data)
        },
        onError: (err) => {
          console.error(`❌ 上传失败 (尝试 ${retryCount + 1})`, err)
          
          // 判断是否需要重试
          const shouldRetry = (
            (err.statusCode === 503 || 
             err.statusCode === 502 || 
             err.errMsg?.includes('timeout') ||
             err.errMsg?.includes('fail')) &&
            retryCount < maxRetries
          )
          
          if (shouldRetry) {
            retryCount++
            // 指数退避：1秒、2秒、4秒
            const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 5000)
            
            console.log(`⏰ ${delay}ms后重试...`)
            
            wx.showToast({
              title: `上传失败，${delay/1000}秒后重试...`,
              icon: 'none',
              duration: delay
            })
            
            setTimeout(attemptUpload, delay)
          } else {
            // 达到最大重试次数或其他错误
            console.error('❌ 上传最终失败')
            reject(err)
          }
        },
        onProgress: options.onProgress
      })
    }
    
    attemptUpload()
  })
}

// ============================================
// 使用示例
// ============================================

// 示例1：基础使用（推荐）
function exampleBasicUpload() {
  wx.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      const tempFilePath = res.tempFilePaths[0]
      
      uploadImageOptimized(tempFilePath, {
        onProgress: (progress) => {
          console.log('上传进度:', progress.progress + '%')
          // 可以更新页面上的进度条
        },
        onSuccess: (data) => {
          console.log('上传成功:', data)
          // 处理成功逻辑，例如跳转到其他页面
          wx.navigateTo({
            url: '/pages/my-uploads/my-uploads'
          })
        },
        onError: (err) => {
          console.error('上传失败:', err)
          // 处理失败逻辑
        }
      })
    }
  })
}

// 示例2：带重试使用（推荐用于不稳定网络环境）
function exampleRetryUpload() {
  wx.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      const tempFilePath = res.tempFilePaths[0]
      
      uploadImageWithRetry(tempFilePath, {
        onProgress: (progress) => {
          console.log('上传进度:', progress.progress + '%')
        }
      }, 3).then(data => {
        console.log('✅ 上传成功:', data)
        wx.showToast({
          title: '上传成功',
          icon: 'success'
        })
      }).catch(err => {
        console.error('❌ 上传最终失败:', err)
        wx.showToast({
          title: '上传失败，请稍后重试',
          icon: 'none'
        })
      })
    }
  })
}

// 示例3：在Page中使用
Page({
  data: {
    uploading: false,
    uploadProgress: 0
  },

  // 选择并上传图片
  onChooseImage() {
    const that = this
    
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        
        that.setData({ uploading: true, uploadProgress: 0 })
        
        uploadImageOptimized(tempFilePath, {
          onProgress: (progress) => {
            that.setData({
              uploadProgress: progress.progress
            })
          },
          onSuccess: (data) => {
            that.setData({ uploading: false })
            console.log('上传成功:', data)
            
            // 可以将上传结果保存到页面数据中
            that.setData({
              uploadedImage: data.data.file_path
            })
          },
          onError: (err) => {
            that.setData({ uploading: false })
            console.error('上传失败:', err)
          }
        })
      }
    })
  }
})

// ============================================
// 导出函数（如果使用模块化）
// ============================================

module.exports = {
  uploadImageOptimized,
  uploadImageWithRetry
}

