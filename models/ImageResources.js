/**
 * 餐厅积分抽奖系统 - 简化图片资源管理模型
 * 移除过度设计的功能，保留核心业务需求
 *
 * 变更记录：
 * - 2026-01-08: 移除审核相关字段和方法（用户上传凭证审核业务已废弃）
 *   - 删除字段: review_status, reviewer_id, review_reason, reviewed_at, points_awarded
 *   - 删除方法: approve(), reject(), isPending()
 *   - 移除 user_upload_review 业务类型
 */

const BeijingTimeHelper = require('../utils/timeHelper')
const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const ImageResources = sequelize.define(
    'ImageResources',
    {
      // 基础标识
      image_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键ID'
      },

      // 业务分类字段
      business_type: {
        type: DataTypes.ENUM('lottery', 'exchange', 'trade', 'uploads'),
        allowNull: false,
        comment: '业务类型：抽奖/兑换/交易/上传'
      },

      category: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '资源分类：prizes/products/items/pending_review等'
      },

      context_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '上下文ID：用户ID/奖品ID/商品ID等'
      },

      user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '关联用户ID（上传用户）',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },

      // 核心存储字段（包含缩略图支持）
      file_path: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: '文件存储路径'
      },

      // 缩略图支持（恢复并完善）
      thumbnail_paths: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '缩略图路径集合：{small: "path", medium: "path", large: "path"}',
        defaultValue: null
      },

      // 文件基础信息
      original_filename: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '原始文件名'
      },

      upload_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '上传批次ID（用于追踪和管理上传任务、支持垃圾清理）'
      },

      file_size: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '文件大小（字节）'
      },

      mime_type: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'MIME类型'
      },

      // 状态管理
      status: {
        type: DataTypes.ENUM('active', 'archived', 'deleted'),
        defaultValue: 'active',
        allowNull: false,
        comment: '资源状态'
      },

      /*
       * 注意: 审核字段已于 2026-01-08 删除（用户上传凭证审核业务已废弃）
       * 积分审核现在由 merchant_points_reviews 表单独管理
       */

      // 来源模块标识
      source_module: {
        type: DataTypes.ENUM('system', 'lottery', 'exchange', 'admin'),
        defaultValue: 'system',
        allowNull: false,
        comment: '来源模块：系统/抽奖/兑换/管理员'
      },

      // IP地址（安全审核需要）
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: 'IP地址'
      },

      // 时间戳
      created_at: {
        type: DataTypes.DATE,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        allowNull: false,
        comment: '创建时间'
      }
    },
    {
      tableName: 'image_resources',
      timestamps: false,
      comment: '简化图片资源管理表',

      indexes: [
        // 核心业务索引（简化版）
        {
          name: 'idx_business_type_user',
          fields: ['business_type', 'user_id', 'created_at']
        },
        /* 注意: idx_review_status_business 索引已于 2026-01-08 删除（审核字段已移除） */
        // 业务查询索引
        {
          name: 'idx_business_category',
          fields: ['business_type', 'category']
        },
        // 用户上传查询索引
        {
          name: 'idx_user_business',
          fields: ['user_id', 'business_type', 'status']
        },
        // 上下文查询索引
        {
          name: 'idx_context_category',
          fields: ['context_id', 'category', 'status']
        },
        // 时间范围查询索引
        {
          name: 'idx_created_status',
          fields: ['created_at', 'status']
        }
      ]
    }
  )

  // 模型关联关系
  ImageResources.associate = function (models) {
    // 关联用户表（上传者）
    ImageResources.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'uploader',
      constraints: false
    })
    /* 注意: reviewer 关联已于 2026-01-08 删除（审核字段已移除） */
  }

  /**
   * 安全输出方法（支持对象 key 转 URL）
   *
   * 🎯 架构决策（2026-01-08 拍板）：
   * - file_path 存储原图对象 key
   * - thumbnail_paths 存储预生成缩略图对象 key（JSON）
   * - 优先使用 thumbnail_paths 中的预生成缩略图 key
   * - 如无预生成缩略图，则根据原图 key 推断缩略图路径
   *
   * @returns {Object} 安全的图片资源对象（包含公网 URL，不含敏感路径）
   */
  ImageResources.prototype.toSafeJSON = function () {
    const values = this.get({ plain: true })
    const { getImageUrl, getThumbnailUrl } = require('../utils/ImageUrlHelper')

    // 生成缩略图 URL：优先使用预生成的 thumbnail_paths
    let thumbnails
    const storedThumbnails = values.thumbnail_paths
    if (storedThumbnails && Object.keys(storedThumbnails).length > 0) {
      // 使用预生成的缩略图 key（数据库存储的真实 key）
      thumbnails = {
        small: storedThumbnails.small ? getImageUrl(storedThumbnails.small) : null,
        medium: storedThumbnails.medium ? getImageUrl(storedThumbnails.medium) : null,
        large: storedThumbnails.large ? getImageUrl(storedThumbnails.large) : null
      }
    } else {
      // 兼容旧数据：根据原图 key 推断缩略图路径
      thumbnails = {
        small: getThumbnailUrl(values.file_path, 'small'),
        medium: getThumbnailUrl(values.file_path, 'medium'),
        large: getThumbnailUrl(values.file_path, 'large')
      }
    }

    return {
      ...values,
      // 提供安全的访问URL（使用 ImageUrlHelper 生成）
      imageUrl: getImageUrl(values.file_path),
      // 提供缩略图URLs（优先使用预生成缩略图）
      thumbnails,
      // 移除服务器文件路径敏感信息
      file_path: undefined,
      thumbnail_paths: undefined
    }
  }

  /**
   * 获取缩略图 URL（兼容方法）
   *
   * 🎯 架构决策（2026-01-08 拍板）：
   * - 缩略图在上传时由 ImageService + SealosStorageService 预生成
   * - 预生成 3 档缩略图（150/300/600px，cover-center）
   * - 缩略图 key 存储在 thumbnail_paths 字段（JSON）
   *
   * @deprecated 请使用 toSafeJSON().thumbnails 获取缩略图 URL
   * @returns {Object} 缩略图 URL 对象 { small, medium, large }
   */
  ImageResources.prototype.generateThumbnails = function () {
    const { getImageUrl, getThumbnailUrl } = require('../utils/ImageUrlHelper')

    if (!this.file_path) {
      console.warn('⚠️ generateThumbnails 已废弃：请使用 toSafeJSON().thumbnails')
      return null
    }

    console.warn('⚠️ generateThumbnails 已废弃：请使用 toSafeJSON().thumbnails')

    // 优先使用预生成的缩略图 key
    if (this.thumbnail_paths && Object.keys(this.thumbnail_paths).length > 0) {
      return {
        small: this.thumbnail_paths.small ? getImageUrl(this.thumbnail_paths.small) : null,
        medium: this.thumbnail_paths.medium ? getImageUrl(this.thumbnail_paths.medium) : null,
        large: this.thumbnail_paths.large ? getImageUrl(this.thumbnail_paths.large) : null
      }
    }

    // 兼容旧数据：根据原图 key 推断缩略图路径
    return {
      small: getThumbnailUrl(this.file_path, 'small'),
      medium: getThumbnailUrl(this.file_path, 'medium'),
      large: getThumbnailUrl(this.file_path, 'large')
    }
  }

  // 检查是否有缩略图
  ImageResources.prototype.hasThumbnails = function () {
    return (
      this.thumbnail_paths &&
      (this.thumbnail_paths.small || this.thumbnail_paths.medium || this.thumbnail_paths.large)
    )
  }

  /*
   * 注意: 审核实例方法（approve, reject, isPending）已于 2026-01-08 删除
   * 积分审核功能现在由 MerchantReviewService 提供
   */

  /**
   * 按业务类型查询图片资源
   * @param {string} businessType - 业务类型：lottery|exchange|trade|uploads
   * @param {string} category - 资源分类
   * @param {Object} options - 查询选项
   * @returns {Promise<{count: number, rows: Array}>} 分页查询结果
   */
  ImageResources.findByBusiness = function (businessType, category, options = {}) {
    const {
      _limit = 20,
      _offset = 0,
      status = 'active',
      orderBy = 'created_at',
      order = 'DESC'
    } = options

    return this.findAndCountAll({
      where: {
        business_type: businessType,
        category,
        status
      },
      limit: parseInt(_limit),
      offset: parseInt(_offset),
      order: [[orderBy, order]]
    })
  }

  return ImageResources
}
