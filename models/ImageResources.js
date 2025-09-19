const { DataTypes } = require('sequelize')
const { v4: uuidv4 } = require('uuid')

module.exports = sequelize => {
  const ImageResources = sequelize.define(
    'ImageResources',
    {
      // 主键使用UUID确保全局唯一性
      resource_id: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true,
        comment: '资源唯一标识符'
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
        type: DataTypes.INTEGER, // 修复：匹配users表的user_id类型
        allowNull: true,
        comment: '关联用户ID（上传用户）',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },

      // 存储架构字段
      storage_layer: {
        type: DataTypes.ENUM('hot', 'standard', 'archive'),
        defaultValue: 'hot',
        allowNull: false,
        comment: '存储层级：热存储/标准存储/归档存储'
      },

      file_path: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: '文件存储路径'
      },

      cdn_url: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: 'CDN访问URL'
      },

      // 缩略图支持
      thumbnail_paths: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '缩略图路径集合：{small: "", medium: "", large: ""}'
      },

      // 文件信息
      original_filename: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '原始文件名'
      },

      file_size: {
        type: DataTypes.INTEGER, // 修复：使用INTEGER类型
        allowNull: false,
        comment: '文件大小（字节）'
      },

      mime_type: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'MIME类型'
      },

      dimensions: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '图片尺寸：{width: 1920, height: 1080}'
      },

      // 状态管理
      status: {
        type: DataTypes.ENUM('active', 'archived', 'deleted'),
        defaultValue: 'active',
        allowNull: false,
        comment: '资源状态'
      },

      // 访问统计
      access_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false,
        comment: '访问次数'
      },

      last_accessed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '最后访问时间'
      },

      // 扩展元数据
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '扩展元数据：颜色、标签、GPS等'
      },

      // 审核相关（针对用户上传）
      review_status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        allowNull: true,
        comment: '审核状态（仅用户上传需要）'
      },

      reviewer_id: {
        type: DataTypes.INTEGER, // 修复：匹配users表的user_id类型
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

      // 业务相关字段
      consumption_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '消费金额（用于上传审核）'
      },

      points_awarded: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '奖励积分数量'
      },

      // 时间戳
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
        comment: '创建时间'
      },

      updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
        comment: '更新时间'
      },

      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '软删除时间'
      }
    },
    {
      tableName: 'image_resources',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      paranoid: true,
      deletedAt: 'deleted_at',
      comment: '统一图片资源管理表',

      indexes: [
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
        // 审核工作台索引
        {
          name: 'idx_review_status',
          fields: ['review_status', 'business_type', 'created_at']
        },
        // 存储层级索引
        {
          name: 'idx_storage_layer',
          fields: ['storage_layer', 'created_at']
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
        },
        // 访问统计索引
        {
          name: 'idx_access_count',
          fields: ['access_count', 'last_accessed_at']
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

  // 实例方法
  ImageResources.prototype.toSafeJSON = function () {
    const values = this.get({ plain: true })

    // 移除敏感信息
    delete values.file_path
    delete values.metadata

    return {
      ...values,
      // 提供安全的访问URL
      imageUrl: values.cdn_url,
      thumbnails: values.thumbnail_paths || {}
    }
  }

  // 类方法
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
      order: [[orderBy, order]],
      attributes: {
        exclude: ['file_path', 'metadata']
      }
    })
  }

  ImageResources.findPendingReviews = function (limit = 50) {
    return this.findAll({
      where: {
        business_type: 'uploads',
        review_status: 'pending',
        status: 'active'
      },
      include: [
        {
          model: sequelize.models.User,
          as: 'uploader',
          attributes: ['id', 'phone', 'nickname']
        }
      ],
      order: [['created_at', 'ASC']],
      limit: parseInt(limit)
    })
  }

  return ImageResources
}
