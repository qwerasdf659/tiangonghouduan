const { ImageResources } = require('../models')
const { sequelize } = require('../models')
const MultiBusinessPhotoStorage = require('./MultiBusinessPhotoStorage')
const sharp = require('sharp')
const { Op } = require('sequelize')

class ImageResourceService {
  constructor () {
    this.storage = new MultiBusinessPhotoStorage()
    this.thumbnailSizes = {
      small: { width: 150, height: 150 },
      medium: { width: 300, height: 300 },
      large: { width: 600, height: 600 }
    }
  }

  /**
   * 创建图片资源
   * @param {object} resourceData - 资源数据
   * @param {Buffer} fileBuffer - 文件缓冲区
   * @param {object} uploadOptions - 上传选项
   * @returns {Promise<object>} 创建的资源对象
   */
  async createResource (resourceData, fileBuffer, uploadOptions = {}) {
    try {
      const {
        businessType,
        category,
        contextId,
        userId,
        originalFilename,
        mimeType,
        metadata = {}
      } = resourceData

      const startTime = Date.now()
      console.log(`🔄 开始创建资源: ${businessType}/${category}, 用户: ${userId}`)

      // 1. 文件验证
      const validation = await this.storage.validateFile(fileBuffer, originalFilename, businessType)
      if (!validation.isValid) {
        throw new Error('文件验证失败')
      }

      // 2. 生成存储路径
      const filePath = await this.storage.generateStoragePath(businessType, category, contextId, {
        uploadTime: Date.now(),
        isActive: uploadOptions.isActive || true,
        priority: uploadOptions.priority || 'normal',
        originalName: originalFilename
      })

      // 3. 上传文件到存储服务
      const cdnUrl = await this.storage.uploadFile(fileBuffer, filePath, originalFilename)

      // 4. 生成缩略图
      const thumbnailPaths = await this.generateThumbnails(fileBuffer, filePath)

      // 5. 获取文件信息
      const dimensions = await this.getImageDimensions(fileBuffer)

      // 6. 创建数据库记录
      const resource = await ImageResources.create({
        business_type: businessType,
        category,
        context_id: contextId,
        user_id: userId,
        storage_layer: 'hot', // 新资源默认热存储
        file_path: filePath,
        cdn_url: cdnUrl,
        thumbnail_paths: thumbnailPaths,
        original_filename: originalFilename,
        file_size: fileBuffer.length,
        mime_type: mimeType,
        dimensions,
        status: 'active',
        metadata: {
          ...metadata,
          uploadTimestamp: Date.now(),
          uploadMethod: 'api_v2'
        },
        // 审核相关字段（仅用户上传需要）
        review_status: businessType === 'uploads' ? 'pending' : null
      })

      const duration = Date.now() - startTime
      console.log(`✅ 资源创建成功: ${resource.resource_id}, 耗时: ${duration}ms`)

      return resource.toSafeJSON()
    } catch (error) {
      console.error('❌ 创建资源失败:', error.message)
      throw new Error(`创建资源失败: ${error.message}`)
    }
  }

  /**
   * 批量查询资源
   * @param {object} queryParams - 查询参数
   * @returns {Promise<object>} 查询结果
   */
  async queryResources (queryParams) {
    try {
      const {
        businessType,
        category,
        contextId,
        userId,
        status = 'active',
        reviewStatus,
        storageLayer,
        page = 1,
        limit = 20,
        orderBy = 'created_at',
        order = 'DESC',
        dateFrom,
        dateTo
      } = queryParams

      const startTime = Date.now()

      // 构建查询条件
      const whereClause = { status }

      if (businessType) whereClause.business_type = businessType
      if (category) whereClause.category = category
      if (contextId) whereClause.context_id = contextId
      if (userId) whereClause.user_id = userId
      if (reviewStatus) whereClause.review_status = reviewStatus
      if (storageLayer) whereClause.storage_layer = storageLayer

      // 时间范围查询
      if (dateFrom || dateTo) {
        whereClause.created_at = {}
        if (dateFrom) whereClause.created_at[Op.gte] = new Date(dateFrom)
        if (dateTo) whereClause.created_at[Op.lte] = new Date(dateTo)
      }

      // 执行查询
      const result = await ImageResources.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit),
        order: [[orderBy, order]],
        attributes: {
          exclude: ['file_path', 'metadata'] // 排除敏感信息
        }
        // 移除include - 新架构中不需要User模型关联
      })

      const duration = Date.now() - startTime
      console.log(`✅ 资源查询完成: ${result.count}条记录, 耗时: ${duration}ms`)

      return {
        resources: result.rows.map(row =>
          row.toSafeJSON ? row.toSafeJSON() : row.get({ plain: true })
        ),
        pagination: {
          total: result.count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(result.count / parseInt(limit)),
          hasNext: parseInt(page) * parseInt(limit) < result.count,
          hasPrev: parseInt(page) > 1
        }
      }
    } catch (error) {
      console.error('❌ 查询资源失败:', error.message)
      throw new Error(`查询资源失败: ${error.message}`)
    }
  }

  /**
   * 获取单个资源详情
   * @param {string} resourceId - 资源ID
   * @param {object} options - 选项
   * @returns {Promise<object>} 资源详情
   */
  async getResourceById (resourceId, options = {}) {
    try {
      const { includeMetadata = false, trackAccess = false } = options

      const attributes = includeMetadata ? undefined : { exclude: ['file_path', 'metadata'] }

      const resource = await ImageResources.findByPk(resourceId, {
        attributes
        // 移除include - 新架构中不需要User模型关联
      })

      if (!resource) {
        throw new Error(`资源不存在: ${resourceId}`)
      }

      // 更新访问统计
      if (trackAccess) {
        await this.updateAccessStats(resourceId)
      }

      return resource.toSafeJSON ? resource.toSafeJSON() : resource.get({ plain: true })
    } catch (error) {
      console.error('❌ 获取资源详情失败:', error.message)
      throw new Error(`获取资源详情失败: ${error.message}`)
    }
  }

  /**
   * 更新资源
   * @param {string} resourceId - 资源ID
   * @param {object} updateData - 更新数据
   * @param {number} operatorId - 操作员ID
   * @returns {Promise<object>} 更新后的资源
   */
  async updateResource (resourceId, updateData, operatorId) {
    try {
      const resource = await ImageResources.findByPk(resourceId)
      if (!resource) {
        throw new Error(`资源不存在: ${resourceId}`)
      }

      // 审核操作
      if (updateData.reviewStatus) {
        updateData.review_status = updateData.reviewStatus
        updateData.reviewer_id = operatorId
        updateData.reviewed_at = new Date()

        if (updateData.reviewReason) {
          updateData.review_reason = updateData.reviewReason
        }

        // 审核通过时奖励积分
        if (updateData.reviewStatus === 'approved' && updateData.consumptionAmount) {
          updateData.consumption_amount = parseFloat(updateData.consumptionAmount)
          updateData.points_awarded = Math.floor(updateData.consumption_amount * 10) // 1元=10积分
        }
      }

      // 状态更新
      if (updateData.status) {
        if (updateData.status === 'deleted') {
          updateData.deleted_at = new Date()
        }
      }

      // 存储层级迁移
      if (updateData.storageLayer && updateData.storageLayer !== resource.storage_layer) {
        // TODO: 实现存储层级迁移逻辑
        updateData.storage_layer = updateData.storageLayer
      }

      await resource.update(updateData)

      console.log(`✅ 资源更新成功: ${resourceId}`)
      return resource.toSafeJSON ? resource.toSafeJSON() : resource.get({ plain: true })
    } catch (error) {
      console.error('❌ 更新资源失败:', error.message)
      throw new Error(`更新资源失败: ${error.message}`)
    }
  }

  /**
   * 软删除资源
   * @param {string} resourceId - 资源ID
   * @param {number} operatorId - 操作员ID
   * @returns {Promise<boolean>} 删除结果
   */
  async deleteResource (resourceId, operatorId) {
    try {
      const resource = await ImageResources.findByPk(resourceId)
      if (!resource) {
        throw new Error(`资源不存在: ${resourceId}`)
      }

      await resource.update({
        status: 'deleted',
        deleted_at: new Date(),
        metadata: {
          ...resource.metadata,
          deletedBy: operatorId,
          deletedAt: new Date().toISOString()
        }
      })

      console.log(`✅ 资源删除成功: ${resourceId}`)
      return true
    } catch (error) {
      console.error('❌ 删除资源失败:', error.message)
      throw new Error(`删除资源失败: ${error.message}`)
    }
  }

  /**
   * 获取待审核资源列表
   * @param {object} options - 选项
   * @returns {Promise<Array>} 待审核资源列表
   */
  async getPendingReviews (options = {}) {
    try {
      const { limit = 50, page = 1, businessType = 'uploads' } = options

      const reviewResources = await ImageResources.findAll({
        where: {
          review_status: 'pending',
          ...(businessType && { business_type: businessType })
        },
        order: [['created_at', 'ASC']],
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit),
        attributes: {
          exclude: ['file_path', 'metadata']
        }
        // 移除include - 新架构中不需要User模型关联
      })

      console.log(`✅ 获取待审核资源: ${reviewResources.length}条`)
      return reviewResources.map(resource =>
        resource.toSafeJSON ? resource.toSafeJSON() : resource.get({ plain: true })
      )
    } catch (error) {
      console.error('❌ 获取待审核资源失败:', error.message)
      throw new Error(`获取待审核资源失败: ${error.message}`)
    }
  }

  /**
   * 批量审核资源
   * @param {Array} reviews - 审核数据数组
   * @param {number} reviewerId - 审核员ID
   * @returns {Promise<object>} 批量审核结果
   */
  async batchReview (reviews, reviewerId) {
    try {
      const results = {
        success: [],
        failed: [],
        totalApproved: 0,
        totalRejected: 0
      }

      for (const review of reviews) {
        try {
          const { resourceId, action, consumptionAmount, reason } = review

          const updateData = {
            reviewStatus: action, // 'approved' or 'rejected'
            reviewReason: reason
          }

          if (action === 'approved' && consumptionAmount) {
            updateData.consumptionAmount = consumptionAmount
          }

          const updatedResource = await this.updateResource(resourceId, updateData, reviewerId)

          results.success.push({
            resourceId,
            action,
            pointsAwarded: updatedResource.points_awarded || 0
          })

          if (action === 'approved') results.totalApproved++
          if (action === 'rejected') results.totalRejected++
        } catch (error) {
          results.failed.push({
            resourceId: review.resourceId,
            error: error.message
          })
        }
      }

      console.log(
        `✅ 批量审核完成: 成功${results.success.length}条, 失败${results.failed.length}条`
      )
      return results
    } catch (error) {
      console.error('❌ 批量审核失败:', error.message)
      throw new Error(`批量审核失败: ${error.message}`)
    }
  }

  /**
   * 生成缩略图
   * @param {Buffer} fileBuffer - 文件缓冲区
   * @param {string} originalPath - 原始路径
   * @returns {Promise<object>} 缩略图路径集合
   */
  async generateThumbnails (fileBuffer, originalPath) {
    try {
      const thumbnails = {}

      for (const [size, dimensions] of Object.entries(this.thumbnailSizes)) {
        const thumbnailBuffer = await sharp(fileBuffer)
          .resize(dimensions.width, dimensions.height, {
            fit: 'cover',
            position: 'center'
          })
          .jpeg({ quality: 80 })
          .toBuffer()

        const thumbnailPath = this.storage.generateThumbnailPath(originalPath, size)

        // 上传缩略图
        const thumbnailUrl = await this.storage.uploadFile(
          thumbnailBuffer,
          thumbnailPath,
          `thumbnail_${size}.jpg`
        )

        thumbnails[size] = thumbnailUrl
      }

      console.log(`✅ 缩略图生成完成: ${Object.keys(thumbnails).length}个尺寸`)
      return thumbnails
    } catch (error) {
      console.error('❌ 生成缩略图失败:', error.message)
      // 缩略图生成失败不应阻止主流程
      return {}
    }
  }

  /**
   * 获取图片尺寸
   * @param {Buffer} fileBuffer - 文件缓冲区
   * @returns {Promise<object>} 图片尺寸
   */
  async getImageDimensions (fileBuffer) {
    try {
      const metadata = await sharp(fileBuffer).metadata()
      return {
        width: metadata.width || 0,
        height: metadata.height || 0,
        format: metadata.format || 'unknown',
        channels: metadata.channels || 0,
        density: metadata.density || 0
      }
    } catch (error) {
      console.error('❌ 获取图片尺寸失败:', error.message)
      return {
        width: 0,
        height: 0,
        format: 'unknown'
      }
    }
  }

  /**
   * 更新访问统计
   * @param {string} resourceId - 资源ID
   */
  async updateAccessStats (resourceId) {
    try {
      await ImageResources.increment('access_count', {
        where: { resource_id: resourceId }
      })

      await ImageResources.update(
        { last_accessed_at: new Date() },
        { where: { resource_id: resourceId } }
      )
    } catch (error) {
      console.error('❌ 更新访问统计失败:', error.message)
      // 统计更新失败不应影响主流程
    }
  }

  /**
   * 获取存储统计
   * @param {object} options - 选项
   * @returns {Promise<object>} 存储统计
   */
  async getStorageStats (options = {}) {
    try {
      const { businessType, dateFrom, dateTo } = options

      const whereClause = { status: 'active' }
      if (businessType) whereClause.business_type = businessType
      if (dateFrom || dateTo) {
        whereClause.created_at = {}
        if (dateFrom) whereClause.created_at[Op.gte] = new Date(dateFrom)
        if (dateTo) whereClause.created_at[Op.lte] = new Date(dateTo)
      }

      const stats = await ImageResources.findAll({
        where: whereClause,
        attributes: [
          'business_type',
          'storage_layer',
          [sequelize.fn('COUNT', sequelize.col('resource_id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('file_size')), 'total_size'],
          [sequelize.fn('AVG', sequelize.col('file_size')), 'avg_size']
        ],
        group: ['business_type', 'storage_layer'],
        raw: true
      })

      return stats
    } catch (error) {
      console.error('❌ 获取存储统计失败:', error.message)
      throw new Error(`获取存储统计失败: ${error.message}`)
    }
  }

  /**
   * 清理过期缓存
   */
  cleanCache () {
    if (this.storage && this.storage.cleanExpiredCache) {
      this.storage.cleanExpiredCache()
    }
  }

  /**
   * 获取服务状态
   */
  getServiceStats () {
    return {
      serviceName: 'ImageResourceService',
      status: 'running',
      storage: this.storage ? this.storage.getCacheStats() : null,
      thumbnailSizes: this.thumbnailSizes,
      timestamp: new Date().toISOString()
    }
  }
}

module.exports = ImageResourceService
