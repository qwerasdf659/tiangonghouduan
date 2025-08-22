/**
 * 智能推荐模型
 * 用于存储和管理个性化推荐结果，支持推荐效果追踪
 * 深度集成v3.0分离式架构，支持多种推荐算法和效果分析
 * 创建时间：2025年08月19日
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const AnalyticsRecommendation = sequelize.define(
    'AnalyticsRecommendation',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '推荐ID'
      },

      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID',
        validate: {
          notEmpty: true,
          isInt: true
        }
      },

      // 🔥 推荐内容
      rec_type: {
        type: DataTypes.ENUM('lottery_campaign', 'points_task', 'product', 'activity'),
        allowNull: false,
        comment: '推荐类型',
        validate: {
          isIn: {
            args: [['lottery_campaign', 'points_task', 'product', 'activity']],
            msg: '推荐类型必须是lottery_campaign、points_task、product或activity'
          }
        }
      },

      rec_items: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '推荐项目列表',
        validate: {
          isValidRecItems (value) {
            if (!Array.isArray(value) || value.length === 0) {
              throw new Error('rec_items必须是非空数组')
            }

            value.forEach(item => {
              if (!item.id || !item.type || typeof item.score !== 'number') {
                throw new Error('推荐项目必须包含id、type和score字段')
              }
            })
          }
        }
      },

      rec_scores: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '推荐分数详情',
        validate: {
          isValidRecScores (value) {
            if (typeof value !== 'object' || value === null) {
              throw new Error('rec_scores必须是有效的JSON对象')
            }
          }
        }
      },

      rec_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '推荐理由',
        validate: {
          len: [0, 1000]
        }
      },

      // 🔥 算法信息
      algorithm_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'collaborative_filtering',
        comment: '算法类型',
        validate: {
          isIn: {
            args: [
              [
                'collaborative_filtering',
                'content_based',
                'hybrid',
                'popularity_based',
                'matrix_factorization'
              ]
            ],
            msg: '无效的算法类型'
          }
        }
      },

      algorithm_version: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'v1.0',
        comment: '算法版本',
        validate: {
          len: [1, 20]
        }
      },

      // 🔥 时效性控制
      generated_at: {
        type: DataTypes.DATE(3),
        allowNull: false,
        comment: '生成时间',
        validate: {
          isDate: true
        }
      },

      expires_at: {
        type: DataTypes.DATE(3),
        allowNull: false,
        comment: '过期时间',
        validate: {
          isDate: true,
          isAfterGenerated (value) {
            if (this.generated_at && new Date(value) <= new Date(this.generated_at)) {
              throw new Error('过期时间必须晚于生成时间')
            }
          }
        }
      },

      // 🔥 效果跟踪
      is_shown: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否已展示'
      },

      show_time: {
        type: DataTypes.DATE(3),
        allowNull: true,
        comment: '展示时间',
        validate: {
          isDate: true
        }
      },

      is_clicked: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否已点击'
      },

      click_time: {
        type: DataTypes.DATE(3),
        allowNull: true,
        comment: '点击时间',
        validate: {
          isDate: true
        }
      },

      conversion_value: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        comment: '转化价值',
        validate: {
          min: 0,
          isDecimal: true
        }
      }
    },
    {
      tableName: 'analytics_recommendations',
      timestamps: false,
      underscored: true,
      indexes: [
        {
          name: 'idx_analytics_rec_user_type',
          fields: ['user_id', 'rec_type']
        },
        {
          name: 'idx_analytics_rec_expires',
          fields: ['expires_at']
        },
        {
          name: 'idx_analytics_rec_generated_time',
          fields: ['generated_at']
        },
        {
          name: 'idx_analytics_rec_effectiveness',
          fields: ['is_shown', 'is_clicked']
        }
      ],
      comment: '智能推荐结果表'
    }
  )

  // 🔥 定义模型关联关系
  AnalyticsRecommendation.associate = models => {
    // 🔥 关联现有用户模型
    AnalyticsRecommendation.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE'
    })

    // 🔥 关联用户画像
    if (models.AnalyticsUserProfile) {
      AnalyticsRecommendation.belongsTo(models.AnalyticsUserProfile, {
        foreignKey: 'user_id',
        as: 'userProfile'
      })
    }
  }

  /**
   * 🔥 获取用户的有效推荐
   * @param {number} userId - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 推荐列表
   */
  AnalyticsRecommendation.getActiveRecommendations = async function (userId, options = {}) {
    const { recType = null, limit = 10, include = [] } = options
    const now = new Date()

    const whereClause = {
      user_id: userId,
      expires_at: {
        [sequelize.Sequelize.Op.gt]: now
      }
    }

    if (recType) {
      whereClause.rec_type = recType
    }

    return await this.findAll({
      where: whereClause,
      order: [['generated_at', 'DESC']],
      limit,
      include
    })
  }

  /**
   * 🔥 记录推荐展示
   * @param {Array} recommendationIds - 推荐ID数组
   * @returns {Promise<number>} 更新的记录数
   */
  AnalyticsRecommendation.recordShown = async function (recommendationIds) {
    const now = new Date()

    const [affectedRows] = await this.update(
      {
        is_shown: true,
        show_time: now
      },
      {
        where: {
          id: {
            [sequelize.Sequelize.Op.in]: recommendationIds
          },
          is_shown: false
        }
      }
    )

    return affectedRows
  }

  /**
   * 🔥 记录推荐点击
   * @param {number} recommendationId - 推荐ID
   * @param {number} conversionValue - 转化价值
   * @returns {Promise<Array>} 更新结果
   */
  AnalyticsRecommendation.recordClick = async function (recommendationId, conversionValue = 0) {
    const now = new Date()

    const [affectedRows, updatedRecs] = await this.update(
      {
        is_clicked: true,
        click_time: now,
        conversion_value: conversionValue
      },
      {
        where: {
          id: recommendationId,
          is_clicked: false
        },
        returning: true
      }
    )

    return { affectedRows, updatedRecs }
  }

  /**
   * 🔥 获取推荐效果统计
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>} 效果统计
   */
  AnalyticsRecommendation.getEffectivenessStats = async function (options = {}) {
    const { recType = null, algorithmType = null, days = 7 } = options
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const whereClause = {
      generated_at: {
        [sequelize.Sequelize.Op.gte]: startDate
      }
    }

    if (recType) {
      whereClause.rec_type = recType
    }

    if (algorithmType) {
      whereClause.algorithm_type = algorithmType
    }

    const stats = await this.findAll({
      attributes: [
        'rec_type',
        'algorithm_type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'total_recommendations'],
        [sequelize.fn('SUM', sequelize.col('is_shown')), 'shown_count'],
        [sequelize.fn('SUM', sequelize.col('is_clicked')), 'clicked_count'],
        [sequelize.fn('AVG', sequelize.col('conversion_value')), 'avg_conversion_value'],
        [sequelize.fn('SUM', sequelize.col('conversion_value')), 'total_conversion_value']
      ],
      where: whereClause,
      group: ['rec_type', 'algorithm_type'],
      raw: true
    })

    // 计算转化率
    return stats.map(stat => ({
      ...stat,
      show_rate:
        stat.total_recommendations > 0
          ? ((stat.shown_count / stat.total_recommendations) * 100).toFixed(2) + '%'
          : '0%',
      click_rate:
        stat.shown_count > 0
          ? ((stat.clicked_count / stat.shown_count) * 100).toFixed(2) + '%'
          : '0%',
      conversion_rate:
        stat.total_recommendations > 0
          ? ((stat.clicked_count / stat.total_recommendations) * 100).toFixed(2) + '%'
          : '0%'
    }))
  }

  /**
   * 🔥 清理过期推荐
   * @param {Object} options - 清理选项
   * @returns {Promise<number>} 删除的记录数
   */
  AnalyticsRecommendation.cleanupExpired = async function (options = {}) {
    const { batchSize = 1000, daysAgo = 30 } = options
    const cutoffDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)

    const deletedCount = await this.destroy({
      where: {
        expires_at: {
          [sequelize.Sequelize.Op.lt]: cutoffDate
        }
      },
      limit: batchSize
    })

    return deletedCount
  }

  /**
   * 🔥 批量创建推荐记录
   * @param {Array} recommendationsData - 推荐数据数组
   * @param {Object} transaction - 数据库事务
   * @returns {Promise<Array>} 创建的推荐记录
   */
  AnalyticsRecommendation.bulkCreateRecommendations = async function (
    recommendationsData,
    transaction = null
  ) {
    const options = {
      validate: true,
      returning: true
    }

    if (transaction) {
      options.transaction = transaction
    }

    // 数据预处理
    const processedData = recommendationsData.map(data => ({
      user_id: data.user_id,
      rec_type: data.rec_type,
      rec_items: data.rec_items,
      rec_scores: data.rec_scores,
      rec_reason: data.rec_reason || null,
      algorithm_type: data.algorithm_type || 'collaborative_filtering',
      algorithm_version: data.algorithm_version || 'v1.0',
      generated_at: data.generated_at || new Date(),
      expires_at: data.expires_at || new Date(Date.now() + 24 * 60 * 60 * 1000), // 默认24小时后过期
      is_shown: false,
      is_clicked: false,
      conversion_value: 0
    }))

    return await this.bulkCreate(processedData, options)
  }

  /**
   * 🔥 获取热门推荐项目
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 热门推荐项目
   */
  AnalyticsRecommendation.getPopularItems = async function (options = {}) {
    const { recType = null, limit = 20, days = 7 } = options
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const whereClause = {
      generated_at: {
        [sequelize.Sequelize.Op.gte]: startDate
      },
      is_clicked: true
    }

    if (recType) {
      whereClause.rec_type = recType
    }

    const recommendations = await this.findAll({
      where: whereClause,
      attributes: ['rec_items', 'conversion_value'],
      raw: true
    })

    // 统计每个推荐项目的点击次数和转化价值
    const itemStats = {}

    recommendations.forEach(rec => {
      if (rec.rec_items && Array.isArray(rec.rec_items)) {
        rec.rec_items.forEach(item => {
          const key = `${item.type}_${item.id}`
          if (!itemStats[key]) {
            itemStats[key] = {
              id: item.id,
              type: item.type,
              click_count: 0,
              total_conversion: 0
            }
          }
          itemStats[key].click_count++
          itemStats[key].total_conversion += parseFloat(rec.conversion_value) || 0
        })
      }
    })

    // 按点击次数排序
    return Object.values(itemStats)
      .sort((a, b) => b.click_count - a.click_count)
      .slice(0, limit)
  }

  return AnalyticsRecommendation
}
