/**
 * 餐厅积分抽奖系统 - 图片资源管理模型
 * 核心业务：商品图片、用户头像、活动素材存储与管理
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
  }

  /**
   * 安全输出方法（支持对象 key 转 URL）
   *
   * 🎯 架构决策（2026-01-08 拍板）：
   * - file_path 存储原图对象 key
   * - thumbnail_paths 存储预生成缩略图对象 key（JSON）
   * - 优先使用 thumbnail_paths 中的预生成缩略图 key
   *
   * 🎯 架构决策（2026-01-19 缩略图降级兼容清理）：
   * - 已移除 ENABLE_THUMBNAIL_FALLBACK 环境变量控制
   * - 缺失 thumbnail_paths 时：记录 ERROR 日志 + 返回占位图 URL（生产安全兜底）
   *
   * @returns {Object} 安全的图片资源对象（包含公网 URL，不含敏感路径）
   */
  ImageResources.prototype.toSafeJSON = function () {
    const values = this.get({ plain: true })
    const { getImageUrl, getPlaceholderImageUrl } = require('../utils/ImageUrlHelper')

    // 生成缩略图 URL：优先使用预生成的 thumbnail_paths
    let thumbnails = null
    const storedThumbnails = values.thumbnail_paths

    if (storedThumbnails && Object.keys(storedThumbnails).length > 0) {
      // 使用预生成的缩略图 key（正常路径）
      thumbnails = {
        small: storedThumbnails.small ? getImageUrl(storedThumbnails.small) : null,
        medium: storedThumbnails.medium ? getImageUrl(storedThumbnails.medium) : null,
        large: storedThumbnails.large ? getImageUrl(storedThumbnails.large) : null
      }
    } else {
      // 缩略图缺失时：记录 ERROR 日志 + 返回占位图（生产安全兜底）
      console.error(
        `❌ ImageResources.toSafeJSON: 图片 ${values.image_id} 缺少预生成缩略图。` +
          `file_path: ${values.file_path}, business_type: ${values.business_type}, ` +
          `category: ${values.category}, context_id: ${values.context_id}`
      )

      // 使用占位图作为降级方案（生产安全兜底）
      const placeholderUrl = getPlaceholderImageUrl(values.business_type, values.category)
      thumbnails = {
        small: placeholderUrl,
        medium: placeholderUrl,
        large: placeholderUrl
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

  // 检查是否有缩略图
  ImageResources.prototype.hasThumbnails = function () {
    return (
      this.thumbnail_paths &&
      (this.thumbnail_paths.small || this.thumbnail_paths.medium || this.thumbnail_paths.large)
    )
  }

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
