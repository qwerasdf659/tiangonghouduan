const logger = require('../utils/logger').logger

/**
 * Sealos对象存储服务
 * 基于AWS S3 SDK实现，适配Sealos对象存储API
 */

const AWS = require('aws-sdk')
const crypto = require('crypto')
const path = require('path')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * Sealos对象存储服务类
 * 职责：管理文件上传、下载、删除等对象存储操作
 * 特点：基于AWS S3 SDK实现，适配Sealos对象存储API
 * @class SealosStorageService
 */
class SealosStorageService {
  /**
   * 构造函数 - 初始化Sealos对象存储配置和S3客户端
   * @constructor
   */
  constructor () {
    /*
     * 🔴 Sealos对象存储配置 - 禁止硬编码默认值，必须从环境变量读取
     * 遵循 fail-fast 原则：缺失必需配置时立即抛错，防止使用不安全的默认值
     */
    this._validateRequiredConfig()

    this.config = {
      endpoint: process.env.SEALOS_ENDPOINT,
      bucket: process.env.SEALOS_BUCKET,
      accessKeyId: process.env.SEALOS_ACCESS_KEY,
      secretAccessKey: process.env.SEALOS_SECRET_KEY,
      region: process.env.SEALOS_REGION
    }

    // 初始化S3客户端
    this.s3 = new AWS.S3({
      endpoint: this.config.endpoint,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      region: this.config.region,
      s3ForcePathStyle: true, // Sealos需要path-style访问
      signatureVersion: 'v4'
    })

    logger.info('🔗 Sealos存储初始化完成:', {
      endpoint: this.config.endpoint,
      bucket: this.config.bucket,
      region: this.config.region
    })
  }

  /**
   * 验证必需的环境变量配置
   * @throws {Error} 缺失必需配置时抛出错误
   * @returns {void} 无返回值，验证失败时抛出异常
   * @private
   */
  _validateRequiredConfig () {
    const requiredEnvVars = [
      { key: 'SEALOS_ENDPOINT', description: 'Sealos对象存储端点地址' },
      { key: 'SEALOS_BUCKET', description: 'Sealos存储桶名称' },
      { key: 'SEALOS_ACCESS_KEY', description: 'Sealos访问密钥ID' },
      { key: 'SEALOS_SECRET_KEY', description: 'Sealos密钥访问密钥' },
      { key: 'SEALOS_REGION', description: 'Sealos存储区域' }
    ]

    const missingVars = requiredEnvVars.filter(v => !process.env[v.key])

    if (missingVars.length > 0) {
      const errorMessage = [
        '❌ Sealos对象存储配置缺失（fail-fast安全策略）',
        '缺失的环境变量:',
        ...missingVars.map(v => `  - ${v.key}: ${v.description}`),
        '',
        '请在 .env 文件中配置以下环境变量:',
        ...missingVars.map(v => `  ${v.key}=your_${v.key.toLowerCase()}_here`)
      ].join('\n')

      logger.error(errorMessage)
      throw new Error(`Sealos配置缺失: ${missingVars.map(v => v.key).join(', ')}`)
    }
  }

  /**
   * 🔴 上传图片文件
   * @param {Buffer} fileBuffer - 文件缓冲区
   * @param {string} originalName - 原始文件名
   * @param {string} folder - 存储文件夹 (默认: photos)
   * @returns {Promise<string>} 文件访问URL
   */
  async uploadImage (fileBuffer, originalName, folder = 'photos') {
    try {
      // 生成唯一文件名
      const timestamp = BeijingTimeHelper.timestamp()
      const hash = crypto.randomBytes(8).toString('hex')
      const ext = path.extname(originalName) || '.jpg'
      const fileName = `${folder}/${timestamp}_${hash}${ext}`

      // 检测文件类型
      const contentType = this.getContentType(ext)

      // 上传参数
      const uploadParams = {
        Bucket: this.config.bucket,
        Key: fileName,
        Body: fileBuffer,
        ContentType: contentType,
        ACL: 'public-read', // 设置为公共可读
        CacheControl: 'max-age=31536000' // 缓存1年
      }

      logger.info(`📤 开始上传文件: ${fileName}`)

      // 执行上传
      const result = await this.s3.upload(uploadParams).promise()

      logger.info(`✅ 文件上传成功: ${result.Location}`)

      return result.Location
    } catch (error) {
      logger.error('❌ Sealos文件上传失败:', error)
      throw new Error(`文件上传失败: ${error.message}`)
    }
  }

  /**
   * 🔴 批量上传文件
   * @param {Array} files - 文件数组 [{buffer, name}, ...]
   * @param {string} folder - 存储文件夹
   * @returns {Promise<Array>} 上传结果数组
   */
  async uploadMultipleImages (files, folder = 'photos') {
    try {
      const uploadPromises = files.map(file => this.uploadImage(file.buffer, file.name, folder))

      const results = await Promise.all(uploadPromises)
      logger.info(`✅ 批量上传完成，共${results.length}个文件`)

      return results
    } catch (error) {
      logger.error('❌ 批量上传失败:', error)
      throw error
    }
  }

  /**
   * 🔴 删除文件
   * @param {string} fileKey - 文件Key或完整URL
   * @returns {Promise<boolean>} 删除结果
   */
  async deleteFile (fileKey) {
    try {
      // 如果是完整URL，提取Key
      if (fileKey.startsWith('http')) {
        const url = new URL(fileKey)
        fileKey = url.pathname.substring(1) // 移除开头的/
      }

      const deleteParams = {
        Bucket: this.config.bucket,
        Key: fileKey
      }

      await this.s3.deleteObject(deleteParams).promise()
      logger.info(`🗑️ 文件删除成功: ${fileKey}`)

      return true
    } catch (error) {
      logger.error('❌ 文件删除失败:', error)
      return false
    }
  }

  /**
   * 🔴 获取文件临时访问URL
   * @param {string} fileKey - 文件Key
   * @param {number} expiresIn - 过期时间（秒，默认1小时）
   * @returns {Promise<string>} 临时访问URL
   */
  async getSignedUrl (fileKey, expiresIn = 3600) {
    try {
      const params = {
        Bucket: this.config.bucket,
        Key: fileKey,
        Expires: expiresIn
      }

      const url = await this.s3.getSignedUrlPromise('getObject', params)
      return url
    } catch (error) {
      logger.error('❌ 获取临时URL失败:', error)
      throw error
    }
  }

  /**
   * 🔴 检查文件是否存在
   * @param {string} fileKey - 文件Key
   * @returns {Promise<boolean>} 文件是否存在
   */
  async fileExists (fileKey) {
    try {
      await this.s3
        .headObject({
          Bucket: this.config.bucket,
          Key: fileKey
        })
        .promise()

      return true
    } catch (error) {
      if (error.code === 'NotFound') {
        return false
      }
      throw error
    }
  }

  /**
   * 🔴 获取文件元数据
   * @param {string} fileKey - 文件Key
   * @returns {Promise<Object>} 文件元数据
   */
  async getFileMetadata (fileKey) {
    try {
      const result = await this.s3
        .headObject({
          Bucket: this.config.bucket,
          Key: fileKey
        })
        .promise()

      return {
        size: result.ContentLength,
        type: result.ContentType,
        lastModified: result.LastModified,
        etag: result.ETag
      }
    } catch (error) {
      logger.error('❌ 获取文件元数据失败:', error)
      throw error
    }
  }

  /**
   * 🔴 列出文件夹中的文件
   * @param {string} prefix - 文件夹前缀
   * @param {number} maxKeys - 最大返回数量
   * @returns {Promise<Array>} 文件列表
   */
  async listFiles (prefix = '', maxKeys = 1000) {
    try {
      const params = {
        Bucket: this.config.bucket,
        Prefix: prefix,
        MaxKeys: maxKeys
      }

      const result = await this.s3.listObjectsV2(params).promise()

      return result.Contents.map(item => ({
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified,
        etag: item.ETag
      }))
    } catch (error) {
      logger.error('❌ 列出文件失败:', error)
      throw error
    }
  }

  /**
   * 压缩图片（可选实现）
   * @param {Buffer} imageBuffer - 图片缓冲区
   * @param {Object} _options - 压缩选项（当前未使用）
   * @returns {Promise<Buffer>} 压缩后的图片缓冲区
   */
  async compressImage (imageBuffer, _options = {}) {
    /*
     * 这里可以集成图片压缩库如sharp
     * 暂时返回原图
     */
    return imageBuffer
  }

  /**
   * 根据文件扩展名获取Content-Type
   * @param {string} ext - 文件扩展名
   * @returns {string} Content-Type
   */
  getContentType (ext) {
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.json': 'application/json'
    }

    return contentTypes[ext.toLowerCase()] || 'application/octet-stream'
  }

  /**
   * 🔴 测试连接
   * @returns {Promise<boolean>} 连接测试结果
   */
  async testConnection () {
    try {
      // 尝试列出存储桶内容
      await this.s3
        .listObjectsV2({
          Bucket: this.config.bucket,
          MaxKeys: 1
        })
        .promise()

      logger.info('✅ Sealos存储连接测试成功')
      return true
    } catch (error) {
      logger.error('❌ Sealos存储连接测试失败:', error)
      return false
    }
  }

  /**
   * 🔴 获取存储统计信息
   * @returns {Promise<Object>} 存储统计
   */
  async getStorageStats () {
    try {
      const files = await this.listFiles()
      const totalSize = files.reduce((sum, file) => sum + file.size, 0)

      return {
        fileCount: files.length,
        totalSize,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
      }
    } catch (error) {
      logger.error('❌ 获取存储统计失败:', error)
      throw error
    }
  }
}

// 导出类本身，而不是实例，以便继承
module.exports = SealosStorageService
