/**
 * 餐厅积分抽奖系统 - 简化图片资源管理模型
 * 移除过度设计的功能，保留核心业务需求
 */

const { DataTypes } = require('sequelize')
const { v4: uuidv4 } = require('uuid')

module.exports = sequelize => {
  const ImageResources = sequelize.define(
    'ImageResources',
    {
      // 基础标识
      resource_id: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true,
        comment: '资源唯一标识符'
      },

      // 业务分类字段
      business_type: {
        type: DataTypes.ENUM('lottery', 'exchange', 'trade', 'uploads', 'user_upload_review'),
        allowNull: false,
        comment: '业务类型：抽奖/兑换/交易/上传/用户上传审核'
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

      // 审核字段（保留，这是核心业务功能）
      review_status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected', 'reviewing'),
        allowNull: true,
        comment: '审核状态'
      },

      reviewer_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '审核员ID',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },

      review_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '审核说明'
      },

      reviewed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '审核时间'
      },

      points_awarded: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment: '奖励积分数量'
      },

      // 业务标识字段（保留）
      is_upload_review: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
        comment: '是否为上传审核资源'
      },

      source_module: {
        type: DataTypes.ENUM('system', 'lottery', 'exchange', 'user_upload', 'admin'),
        defaultValue: 'system',
        allowNull: false,
        comment: '来源模块'
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
        defaultValue: DataTypes.NOW,
        allowNull: false,
        comment: '创建时间'
      }
    },
    {
      tableName: 'image_resources',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      comment: '简化图片资源管理表',

      indexes: [
        // 核心业务索引（简化版）
        {
          name: 'idx_business_type_user',
          fields: ['business_type', 'user_id', 'created_at']
        },
        // 审核查询优化
        {
          name: 'idx_review_status_business',
          fields: ['review_status', 'business_type', 'created_at']
        },
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
    // 关联用户表
    ImageResources.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'uploader',
      constraints: false
    })

    // 关联审核员
    ImageResources.belongsTo(models.User, {
      foreignKey: 'reviewer_id',
      as: 'reviewer',
      constraints: false
    })
  }

  // 安全输出方法（支持缩略图）
  ImageResources.prototype.toSafeJSON = function () {
    const values = this.get({ plain: true })

    return {
      ...values,
      // 提供安全的访问URL（使用file_path生成）
      imageUrl: `/uploads/${values.file_path}`,
      // 提供缩略图URLs
      thumbnails: values.thumbnail_paths
        ? {
          small: values.thumbnail_paths.small ? `/uploads/${values.thumbnail_paths.small}` : null,
          medium: values.thumbnail_paths.medium ? `/uploads/${values.thumbnail_paths.medium}` : null,
          large: values.thumbnail_paths.large ? `/uploads/${values.thumbnail_paths.large}` : null
        }
        : {},
      // 移除服务器文件路径敏感信息
      file_path: undefined,
      thumbnail_paths: undefined
    }
  }

  // 缩略图生成方法
  ImageResources.prototype.generateThumbnails = async function () {
    const ThumbnailService = require('../services/ThumbnailService')

    if (!this.file_path) {
      throw new Error('文件路径不存在，无法生成缩略图')
    }

    try {
      const thumbnails = await ThumbnailService.generateThumbnails(this.file_path, {
        sizes: {
          small: { width: 150, height: 150 },
          medium: { width: 300, height: 300 },
          large: { width: 600, height: 600 }
        },
        quality: 80,
        format: 'jpg'
      })

      this.thumbnail_paths = thumbnails
      await this.save()

      return thumbnails
    } catch (error) {
      console.error('缩略图生成失败:', error)
      throw new Error('缩略图生成失败: ' + error.message)
    }
  }

  // 检查是否有缩略图
  ImageResources.prototype.hasThumbnails = function () {
    return this.thumbnail_paths &&
           (this.thumbnail_paths.small || this.thumbnail_paths.medium || this.thumbnail_paths.large)
  }

  // 审核实例方法（保留，核心业务功能）
  ImageResources.prototype.approve = function (reviewerId, pointsAwarded = 0, notes = null) {
    this.review_status = 'approved'
    this.reviewer_id = reviewerId
    this.reviewed_at = new Date()
    this.points_awarded = pointsAwarded
    this.review_reason = notes
    return this.save()
  }

  ImageResources.prototype.reject = function (reviewerId, reason, notes = null) {
    this.review_status = 'rejected'
    this.reviewer_id = reviewerId
    this.reviewed_at = new Date()
    this.review_reason = notes || reason
    return this.save()
  }

  ImageResources.prototype.isPending = function () {
    return this.review_status === 'pending'
  }

  ImageResources.prototype.isUploadReview = function () {
    return this.is_upload_review === true || this.business_type === 'user_upload_review'
  }

  // 简化的类方法
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

  // 待审核资源查询（保留，核心功能）
  ImageResources.findPendingReviews = function (limit = 50) {
    return this.findAll({
      where: {
        [sequelize.Sequelize.Op.or]: [
          { business_type: 'uploads', review_status: 'pending' },
          { business_type: 'user_upload_review', review_status: 'pending' },
          { is_upload_review: true, review_status: 'pending' }
        ],
        status: 'active'
      },
      include: [
        {
          model: sequelize.models.User,
          as: 'uploader',
          attributes: ['user_id', 'mobile', 'nickname']
        }
      ],
      order: [['created_at', 'ASC']],
      limit: parseInt(limit)
    })
  }

  return ImageResources
}
