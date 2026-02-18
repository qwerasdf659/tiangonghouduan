/**
 * 轮播图展示日志模型（CarouselShowLog）
 *
 * 业务场景：
 * - 记录用户每次看到轮播图的详细信息
 * - 用于统计轮播图展示效果、点击率、曝光时长
 * - 支持轮播图效果分析和优化
 *
 * 设计决策：
 * - 日志表，只记录创建时间，不记录更新时间
 * - 记录曝光时长、是否手动滑动、是否点击等关键信息
 *
 * 数据库表名：carousel_show_logs
 * 主键：carousel_show_log_id（BIGINT，自增）
 *
 * @see docs/广告系统升级方案.md
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 定义 CarouselShowLog 模型
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} CarouselShowLog 模型
 */
module.exports = sequelize => {
  const CarouselShowLog = sequelize.define(
    'CarouselShowLog',
    {
      carousel_show_log_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '轮播图展示日志主键ID'
      },

      carousel_item_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'carousel_items', key: 'carousel_item_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: '轮播图ID（外键→carousel_items）'
      },

      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'user_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: '用户ID（外键→users）'
      },

      exposure_duration_ms: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        comment: '曝光时长（毫秒），NULL表示未记录'
      },

      is_manual_swipe: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否手动滑动（true=用户手动滑动 / false=自动轮播）'
      },

      is_clicked: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否点击（true=用户点击了轮播图 / false=仅展示未点击）'
      },

      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        /** @returns {string} 北京时间格式的日期字符串 */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('created_at'))
        },
        comment: '创建时间（展示时间）'
      }
    },
    {
      tableName: 'carousel_show_logs',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      comment: '轮播图展示日志表 - 记录用户每次看到轮播图的详细信息',

      hooks: {
        beforeCreate: log => {
          log.created_at = BeijingTimeHelper.createBeijingTime()
        }
      },

      indexes: [
        { name: 'idx_csl_item', fields: ['carousel_item_id'] },
        { name: 'idx_csl_user', fields: ['user_id'] },
        { name: 'idx_csl_created', fields: ['created_at'] }
      ]
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - 所有模型对象
   * @returns {void}
   */
  CarouselShowLog.associate = models => {
    CarouselShowLog.belongsTo(models.CarouselItem, {
      foreignKey: 'carousel_item_id',
      as: 'carouselItem',
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    })

    CarouselShowLog.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    })
  }

  return CarouselShowLog
}
