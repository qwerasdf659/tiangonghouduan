/**
 * 用户画像分析模型
 * 用于存储和管理用户行为分析结果和用户画像数据
 * 深度集成v3.0分离式架构，支持智能用户分群和个性化推荐
 * 创建时间：2025年08月19日
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const AnalyticsUserProfile = sequelize.define(
    'AnalyticsUserProfile',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '画像ID'
      },

      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        comment: '用户ID',
        validate: {
          notEmpty: true,
          isInt: true
        }
      },

      // 🔥 行为统计分析结果
      behavior_summary: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '行为汇总统计',
        defaultValue: {},
        validate: {
          isValidBehaviorSummary (value) {
            if (typeof value !== 'object' || value === null) {
              throw new Error('behavior_summary必须是有效的JSON对象')
            }
          }
        }
      },

      preferences: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '用户偏好分析',
        defaultValue: {}
      },

      activity_pattern: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '活跃模式分析',
        defaultValue: {}
      },

      // 🔥 用户评分和分群
      engagement_score: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: '参与度评分(0-100)',
        validate: {
          min: 0,
          max: 100,
          isDecimal: true
        }
      },

      user_segments: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '用户分群标签',
        defaultValue: []
      },

      risk_level: {
        type: DataTypes.ENUM('low', 'medium', 'high'),
        allowNull: false,
        defaultValue: 'low',
        comment: '风险等级',
        validate: {
          isIn: {
            args: [['low', 'medium', 'high']],
            msg: '风险等级必须是low、medium或high'
          }
        }
      },

      // 🔥 分析元数据
      last_analysis_at: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '最后分析时间',
        validate: {
          isDate: true
        }
      },

      analysis_version: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'v1.0',
        comment: '分析算法版本',
        validate: {
          len: [1, 20]
        }
      },

      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间'
      },

      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '更新时间'
      }
    },
    {
      tableName: 'analytics_user_profiles',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: 'idx_analytics_profiles_user_id',
          fields: ['user_id'],
          unique: true
        },
        {
          name: 'idx_analytics_profiles_engagement',
          fields: ['engagement_score']
        },
        {
          name: 'idx_analytics_profiles_last_analysis',
          fields: ['last_analysis_at']
        }
      ],
      comment: '用户行为分析画像表'
    }
  )

  // 🔥 定义模型关联关系
  AnalyticsUserProfile.associate = models => {
    // 🔥 关联现有用户模型
    AnalyticsUserProfile.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE'
    })

    // 🔥 关联用户行为数据
    if (models.AnalyticsBehavior) {
      AnalyticsUserProfile.hasMany(models.AnalyticsBehavior, {
        foreignKey: 'user_id',
        as: 'behaviors'
      })
    }

    // 🔥 关联推荐记录
    if (models.AnalyticsRecommendation) {
      AnalyticsUserProfile.hasMany(models.AnalyticsRecommendation, {
        foreignKey: 'user_id',
        as: 'recommendations'
      })
    }
  }

  /**
   * 🔥 获取高价值用户列表
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 高价值用户列表
   */
  AnalyticsUserProfile.getHighValueUsers = async function (options = {}) {
    const { limit = 100, minEngagementScore = 70, include = [] } = options

    return await this.findAll({
      where: {
        engagement_score: {
          [sequelize.Sequelize.Op.gte]: minEngagementScore
        }
      },
      order: [['engagement_score', 'DESC']],
      limit,
      include
    })
  }

  /**
   * 🔥 按用户分群统计
   * @param {Array} segments - 分群标签数组
   * @returns {Promise<Object>} 分群统计结果
   */
  AnalyticsUserProfile.getSegmentStats = async function (segments = []) {
    const whereClause = {}
    if (segments.length > 0) {
      whereClause.user_segments = {
        [sequelize.Sequelize.Op.overlap]: segments
      }
    }

    const stats = await this.findAll({
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'user_count'],
        [sequelize.fn('AVG', sequelize.col('engagement_score')), 'avg_engagement'],
        'risk_level'
      ],
      where: whereClause,
      group: ['risk_level'],
      raw: true
    })

    return stats
  }

  /**
   * 🔥 更新用户画像
   * @param {number} userId - 用户ID
   * @param {Object} profileData - 画像数据
   * @param {Object} transaction - 数据库事务
   * @returns {Promise<Object>} 更新后的画像
   */
  AnalyticsUserProfile.updateUserProfile = async function (
    userId,
    profileData,
    transaction = null
  ) {
    const options = {
      where: { user_id: userId },
      returning: true
    }

    if (transaction) {
      options.transaction = transaction
    }

    // 准备更新数据
    const updateData = {
      behavior_summary: profileData.behavior_summary || {},
      preferences: profileData.preferences || {},
      activity_pattern: profileData.activity_pattern || {},
      engagement_score: profileData.engagement_score || 0,
      user_segments: profileData.user_segments || [],
      risk_level: profileData.risk_level || 'low',
      last_analysis_at: new Date(),
      analysis_version: profileData.analysis_version || 'v1.0',
      updated_at: new Date()
    }

    const [affectedRows, updatedProfiles] = await this.update(updateData, options)

    if (affectedRows === 0) {
      // 如果用户画像不存在，创建新的
      const createData = {
        user_id: userId,
        ...updateData,
        created_at: new Date()
      }

      return await this.create(createData, transaction ? { transaction } : {})
    }

    return updatedProfiles[0] || updatedProfiles
  }

  /**
   * 🔥 获取需要更新分析的用户
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 需要更新的用户列表
   */
  AnalyticsUserProfile.getUsersNeedingAnalysis = async function (options = {}) {
    const { hours = 24, limit = 100 } = options
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000)

    return await this.findAll({
      where: {
        [sequelize.Sequelize.Op.or]: [
          {
            last_analysis_at: {
              [sequelize.Sequelize.Op.lt]: cutoffTime
            }
          },
          {
            last_analysis_at: null
          }
        ]
      },
      order: [['last_analysis_at', 'ASC']],
      limit,
      include: [
        {
          model: sequelize.models.User,
          as: 'user',
          attributes: ['user_id', 'mobile', 'nickname']
        }
      ]
    })
  }

  /**
   * 🔥 批量创建用户画像
   * @param {Array} profilesData - 画像数据数组
   * @param {Object} transaction - 数据库事务
   * @returns {Promise<Array>} 创建的画像记录
   */
  AnalyticsUserProfile.bulkCreateProfiles = async function (profilesData, transaction = null) {
    const options = {
      validate: true,
      returning: true,
      updateOnDuplicate: [
        'behavior_summary',
        'preferences',
        'activity_pattern',
        'engagement_score',
        'user_segments',
        'risk_level',
        'last_analysis_at',
        'analysis_version',
        'updated_at'
      ]
    }

    if (transaction) {
      options.transaction = transaction
    }

    // 数据预处理
    const processedData = profilesData.map(data => ({
      user_id: data.user_id,
      behavior_summary: data.behavior_summary || {},
      preferences: data.preferences || {},
      activity_pattern: data.activity_pattern || {},
      engagement_score: data.engagement_score || 0,
      user_segments: data.user_segments || [],
      risk_level: data.risk_level || 'low',
      last_analysis_at: new Date(),
      analysis_version: data.analysis_version || 'v1.0',
      created_at: new Date(),
      updated_at: new Date()
    }))

    return await this.bulkCreate(processedData, options)
  }

  return AnalyticsUserProfile
}
