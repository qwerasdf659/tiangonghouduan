const logger = require('../utils/logger').logger

/**
 * Sealos对象存储服务
 * 基于AWS S3 SDK实现，适配Sealos对象存储API
 *
 * 🎯 架构决策（2026-01-08 拍板）：
 * - 存储对象 key（非完整 URL）
 * - 优先使用内网 endpoint 上传（Sealos 集群内）
 * - 通过 getPublicUrl() 方法生成 CDN/公网 URL
 * - 全部 public-read ACL（无敏感图片）
 */

const AWS = require('aws-sdk')
const crypto = require('crypto')
const path = require('path')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * Sealos对象存储服务类
 * 职责：管理文件上传、下载、删除等对象存储操作
 * 特点：基于AWS S3 SDK实现，适配Sealos对象存储API
 *
 * 上传策略：
 * - 优先使用内网 endpoint（SEALOS_INTERNAL_ENDPOINT），节省流量费用与延迟
 * - 本地开发环境自动回退到公网 endpoint（SEALOS_ENDPOINT）
 *
 * 返回策略：
 * - uploadImage() 返回对象 key（如 prizes/xxx.jpg），非完整 URL
 * - 通过 getPublicUrl(key) 生成完整访问 URL（支持 CDN 切换）
 *
 * @class SealosStorageService
 */
class SealosStorageService {
  /**
   * 构造函数 - 初始化Sealos对象存储配置和S3客户端
   * @constructor
   */
  constructor() {
    /*
     * 🔴 Sealos对象存储配置 - 禁止硬编码默认值，必须从环境变量读取
     * 遵循 fail-fast 原则：缺失必需配置时立即抛错，防止使用不安全的默认值
     */
    this._validateRequiredConfig()

    /*
     * 上传端点：优先使用内网 endpoint（Sealos 集群内上传，节省流量）
     * 本地开发环境无法访问内网 DNS，自动回退到公网 endpoint
     */
    const uploadEndpoint = process.env.SEALOS_INTERNAL_ENDPOINT || process.env.SEALOS_ENDPOINT

    // 公网端点：用于生成公开访问 URL
    const publicEndpoint = process.env.SEALOS_ENDPOINT

    // CDN 域名：优先使用 CDN 域名（Cloudflare），回退到公网 endpoint
    const cdnDomain = process.env.CDN_DOMAIN || publicEndpoint

    this.config = {
      uploadEndpoint, // 上传使用的端点（内网优先）
      publicEndpoint, // 公网端点（生成 URL 用）
      cdnDomain, // CDN 域名（访问 URL 用）
      bucket: process.env.SEALOS_BUCKET,
      accessKeyId: process.env.SEALOS_ACCESS_KEY,
      secretAccessKey: process.env.SEALOS_SECRET_KEY,
      region: process.env.SEALOS_REGION
    }

    // 初始化S3客户端（使用上传端点）
    this.s3 = new AWS.S3({
      endpoint: this.config.uploadEndpoint,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      region: this.config.region,
      s3ForcePathStyle: true, // Sealos需要path-style访问
      signatureVersion: 'v4'
    })

    // 是否使用内网端点
    const isInternalEndpoint = !!process.env.SEALOS_INTERNAL_ENDPOINT

    logger.info('🔗 Sealos存储初始化完成:', {
      uploadEndpoint: this.config.uploadEndpoint,
      isInternalEndpoint,
      publicEndpoint: this.config.publicEndpoint,
      cdnDomain: this.config.cdnDomain,
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
  _validateRequiredConfig() {
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
   * 🔴 上传图片文件（返回对象 key，非完整 URL）
   *
   * 🎯 架构决策（2026-01-08 拍板）：
   * - 返回对象 key（如 prizes/20260108_abc123.jpg）
   * - 非完整 URL（不存 https://...）
   * - 支持 CDN 域名切换、公有/私有策略演进
   *
   * @param {Buffer} fileBuffer - 文件缓冲区
   * @param {string} originalName - 原始文件名
   * @param {string} folder - 存储文件夹 (默认: photos)
   * @returns {Promise<string>} 对象 key（如 prizes/20260108_abc123.jpg）
   */
  async uploadImage(fileBuffer, originalName, folder = 'photos') {
    try {
      // 生成唯一文件名（对象 key）
      const timestamp = BeijingTimeHelper.timestamp()
      const hash = crypto.randomBytes(8).toString('hex')
      const ext = path.extname(originalName) || '.jpg'
      const objectKey = `${folder}/${timestamp}_${hash}${ext}`

      // 检测文件类型
      const contentType = this.getContentType(ext)

      // 上传参数
      const uploadParams = {
        Bucket: this.config.bucket,
        Key: objectKey,
        Body: fileBuffer,
        ContentType: contentType,
        ACL: 'public-read', // 设置为公共可读（全部展示型素材）
        CacheControl: 'max-age=31536000' // 缓存1年
      }

      logger.info(`📤 开始上传文件: ${objectKey}`, {
        folder,
        contentType,
        size: fileBuffer.length,
        endpoint: this.config.uploadEndpoint
      })

      // 执行上传
      await this.s3.upload(uploadParams).promise()

      // 生成公网访问 URL（仅用于日志和调试）
      const publicUrl = this.getPublicUrl(objectKey)

      logger.info('✅ 文件上传成功', {
        objectKey,
        publicUrl
      })

      // 🔴 返回对象 key（非完整 URL）- 已拍板确认
      return objectKey
    } catch (error) {
      logger.error('❌ Sealos文件上传失败:', error)
      throw new Error(`文件上传失败: ${error.message}`)
    }
  }

  /**
   * 🔴 根据对象 key 生成公网访问 URL
   *
   * 🎯 URL 生成策略：
   * - 优先使用 CDN 域名（CDN_DOMAIN 环境变量）
   * - 回退到 Sealos 公网端点（SEALOS_ENDPOINT）
   * - 支持 URL 参数化缩略图（?width=300 等）
   *
   * @param {string} objectKey - 对象 key（如 prizes/xxx.jpg）
   * @param {Object} options - URL 选项
   * @param {number} options.width - 缩略图宽度（依赖 CDN 支持）
   * @param {number} options.height - 缩略图高度（依赖 CDN 支持）
   * @param {string} options.fit - 缩放模式 cover/contain/fill
   * @returns {string} 完整公网访问 URL
   */
  getPublicUrl(objectKey, options = {}) {
    if (!objectKey) {
      return null
    }

    // 基础 URL：CDN 域名 + bucket + 对象 key
    const baseUrl = `${this.config.cdnDomain}/${this.config.bucket}/${objectKey}`

    // URL 参数化缩略图（如果提供了尺寸参数）
    if (options.width || options.height) {
      const params = new URLSearchParams()
      if (options.width) params.append('width', options.width)
      if (options.height) params.append('height', options.height)
      if (options.fit) params.append('fit', options.fit)
      return `${baseUrl}?${params.toString()}`
    }

    return baseUrl
  }

  /**
   * 🔴 批量生成公网访问 URL
   * @param {string[]} objectKeys - 对象 key 数组
   * @param {Object} options - URL 选项（同 getPublicUrl）
   * @returns {Object} key 到 URL 的映射
   */
  getPublicUrls(objectKeys, options = {}) {
    const result = {}
    objectKeys.forEach(key => {
      result[key] = this.getPublicUrl(key, options)
    })
    return result
  }

  /**
   * 🔴 批量上传文件
   * @param {Array} files - 文件数组 [{buffer, name}, ...]
   * @param {string} folder - 存储文件夹
   * @returns {Promise<Array>} 上传结果数组
   */
  async uploadMultipleImages(files, folder = 'photos') {
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
  async deleteFile(fileKey) {
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
  async getSignedUrl(fileKey, expiresIn = 3600) {
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
  async fileExists(fileKey) {
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
  async getFileMetadata(fileKey) {
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
  async listFiles(prefix = '', maxKeys = 1000) {
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
  async compressImage(imageBuffer, _options = {}) {
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
  getContentType(ext) {
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
   *
   * 使用 headBucket 替代 listObjectsV2，避免因 ListObjects 权限不足导致 403
   * headBucket 仅需要 s3:GetBucketLocation 权限
   *
   * @returns {Promise<Object>} 连接测试结果 { success: boolean, error?: string }
   */
  async testConnection() {
    try {
      // 优先使用 headBucket（权限要求最低）
      await this.s3
        .headBucket({
          Bucket: this.config.bucket
        })
        .promise()

      logger.info('✅ Sealos存储连接测试成功（headBucket）')
      return { success: true }
    } catch (headError) {
      // 如果 headBucket 也失败，记录详细错误
      logger.warn('⚠️ headBucket 失败，尝试 listObjects:', headError.code)

      try {
        // 回退到 listObjectsV2（某些 S3 兼容存储可能不支持 headBucket）
        await this.s3
          .listObjectsV2({
            Bucket: this.config.bucket,
            MaxKeys: 1
          })
          .promise()

        logger.info('✅ Sealos存储连接测试成功（listObjects）')
        return { success: true }
      } catch (listError) {
        const errorCode = listError.code || listError.statusCode || 'UNKNOWN'
        const errorMessage = listError.message || '未知错误'

        logger.error('❌ Sealos存储连接测试失败:', {
          code: errorCode,
          message: errorMessage,
          bucket: this.config.bucket,
          endpoint: this.config.uploadEndpoint
        })

        // 提供具体的错误诊断建议
        let suggestion = ''
        if (errorCode === 'AccessDenied' || listError.statusCode === 403) {
          suggestion =
            '请检查 SEALOS_ACCESS_KEY/SEALOS_SECRET_KEY 是否正确，以及 bucket policy 是否允许访问'
        } else if (errorCode === 'NoSuchBucket' || listError.statusCode === 404) {
          suggestion = '请检查 SEALOS_BUCKET 名称是否正确'
        } else if (errorCode === 'NetworkingError') {
          suggestion = '请检查 SEALOS_ENDPOINT 是否可达'
        }

        return {
          success: false,
          error: `${errorCode}: ${errorMessage}`,
          suggestion
        }
      }
    }
  }

  /**
   * 🔴 获取存储统计信息
   * @returns {Promise<Object>} 存储统计
   */
  async getStorageStats() {
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
