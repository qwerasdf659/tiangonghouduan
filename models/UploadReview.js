/**
 * 餐厅积分抽奖系统 v2.0 - 图片上传审核模型
 * 管理用户上传图片的审核流程和状态
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const UploadReview = sequelize.define(
    'UploadReview',
    {
      // 基础信息
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '审核记录唯一ID'
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '上传用户ID'
      },
      image_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '图片资源ID'
      },

      // 审核信息
      review_status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected', 'reviewing'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '审核状态'
      },
      reviewer_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '审核员用户ID'
      },
      review_time: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '审核时间'
      },
      review_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '审核备注'
      },

      // 图片信息
      image_url: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: '图片URL'
      },
      image_type: {
        type: DataTypes.ENUM('avatar', 'photo', 'document', 'other'),
        allowNull: false,
        defaultValue: 'photo',
        comment: '图片类型'
      },
      file_size: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '文件大小（字节）'
      },
      file_hash: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: '文件哈希值（防重复）'
      },

      // 审核结果
      points_awarded: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '奖励积分'
      },
      reject_reason: {
        type: DataTypes.ENUM('inappropriate', 'duplicate', 'quality', 'spam', 'other'),
        allowNull: true,
        comment: '拒绝原因'
      },
      auto_review: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否自动审核'
      },

      // 元数据
      client_info: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '客户端信息'
      },
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: 'IP地址'
      }
    },
    {
      tableName: 'upload_reviews',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [
        {
          name: 'idx_upload_reviews_user_id',
          fields: ['user_id']
        },
        {
          name: 'idx_upload_reviews_image_id',
          fields: ['image_id']
        },
        {
          name: 'idx_upload_reviews_status',
          fields: ['review_status']
        },
        {
          name: 'idx_upload_reviews_reviewer',
          fields: ['reviewer_id']
        },
        {
          name: 'idx_upload_reviews_created_at',
          fields: ['created_at']
        },
        {
          name: 'idx_upload_reviews_file_hash',
          fields: ['file_hash']
        }
      ],
      comment: '图片上传审核表'
    }
  )

  // 实例方法
  UploadReview.prototype.approve = function (reviewerId, pointsAwarded = 0, notes = null) {
    this.review_status = 'approved'
    this.reviewer_id = reviewerId
    this.review_time = new Date()
    this.points_awarded = pointsAwarded
    this.review_notes = notes
    return this.save()
  }

  UploadReview.prototype.reject = function (reviewerId, reason, notes = null) {
    this.review_status = 'rejected'
    this.reviewer_id = reviewerId
    this.review_time = new Date()
    this.reject_reason = reason
    this.review_notes = notes
    return this.save()
  }

  UploadReview.prototype.isPending = function () {
    return this.review_status === 'pending'
  }

  // 类方法
  UploadReview.getPendingReviews = async function (options = {}) {
    const { limit = 20, offset = 0, imageType = null } = options

    const whereClause = {
      review_status: 'pending'
    }

    if (imageType) {
      whereClause.image_type = imageType
    }

    return await UploadReview.findAll({
      where: whereClause,
      order: [['created_at', 'ASC']],
      limit,
      offset,
      include: [
        {
          model: sequelize.models.User,
          as: 'user',
          attributes: ['user_id', 'mobile', 'nickname']
        },
        {
          model: sequelize.models.ImageResources,
          as: 'image',
          attributes: ['image_id', 'image_url', 'file_size']
        }
      ]
    })
  }

  UploadReview.getReviewStats = async function (options = {}) {
    const { startDate = null, endDate = null, reviewerId = null } = options

    const whereClause = {}

    if (startDate && endDate) {
      whereClause.created_at = {
        [sequelize.Sequelize.Op.between]: [startDate, endDate]
      }
    }

    if (reviewerId) {
      whereClause.reviewer_id = reviewerId
    }

    const [totalReviews, statusStats, avgPoints] = await Promise.all([
      UploadReview.count({ where: whereClause }),
      UploadReview.findAll({
        where: whereClause,
        attributes: ['review_status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['review_status'],
        raw: true
      }),
      UploadReview.findOne({
        where: { ...whereClause, review_status: 'approved' },
        attributes: [[sequelize.fn('AVG', sequelize.col('points_awarded')), 'avgPoints']],
        raw: true
      })
    ])

    return {
      totalReviews,
      avgPointsAwarded: parseFloat(avgPoints?.avgPoints || 0),
      statusStats: statusStats.reduce((acc, stat) => {
        acc[stat.review_status] = parseInt(stat.count)
        return acc
      }, {})
    }
  }

  return UploadReview
}
