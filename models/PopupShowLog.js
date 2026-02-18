/**
 * 弹窗展示日志模型（PopupShowLog）
 *
 * 业务场景：
 * - 记录用户每次看到弹窗的详细信息
 * - 用于统计弹窗展示效果、用户行为分析
 * - 支持频率控制算法的数据基础
 *
 * 设计决策：
 * - 日志表，只记录创建时间，不记录更新时间
 * - 记录展示时长、关闭方式、队列位置等关键信息
 *
 * 数据库表名：popup_show_logs
 * 主键：popup_show_log_id（BIGINT，自增）
 *
 * @see docs/广告系统升级方案.md
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 关闭方式有效值
 * @constant {string[]}
 */
const VALID_CLOSE_METHODS = ['auto', 'manual', 'timeout', 'system']

/**
 * 定义 PopupShowLog 模型
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} PopupShowLog 模型
 */
module.exports = sequelize => {
  const PopupShowLog = sequelize.define(
    'PopupShowLog',
    {
      popup_show_log_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '弹窗展示日志主键ID'
      },

      popup_banner_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'popup_banners', key: 'popup_banner_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: '弹窗ID（外键→popup_banners）'
      },

      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'user_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: '用户ID（外键→users）'
      },

      show_duration_ms: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        comment: '展示时长（毫秒），NULL表示未记录'
      },

      close_method: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
          notEmpty: { msg: '关闭方式不能为空' },
          isIn: {
            args: [VALID_CLOSE_METHODS],
            msg: '关闭方式必须是：auto, manual, timeout, system 之一'
          }
        },
        comment: '关闭方式：auto=自动关闭 / manual=手动关闭 / timeout=超时关闭 / system=系统关闭'
      },

      queue_position: {
        type: DataTypes.TINYINT.UNSIGNED,
        allowNull: false,
        validate: {
          min: { args: [0], msg: '队列位置不能为负数' }
        },
        comment: '队列位置（0表示第一个，1表示第二个，以此类推）'
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
      tableName: 'popup_show_logs',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      comment: '弹窗展示日志表 - 记录用户每次看到弹窗的详细信息',

      hooks: {
        beforeCreate: log => {
          log.created_at = BeijingTimeHelper.createBeijingTime()
        }
      },

      indexes: [
        { name: 'idx_psl_banner', fields: ['popup_banner_id'] },
        { name: 'idx_psl_user', fields: ['user_id'] },
        { name: 'idx_psl_created', fields: ['created_at'] }
      ]
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - 所有模型对象
   * @returns {void}
   */
  PopupShowLog.associate = models => {
    PopupShowLog.belongsTo(models.PopupBanner, {
      foreignKey: 'popup_banner_id',
      as: 'popupBanner',
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    })

    PopupShowLog.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    })
  }

  return PopupShowLog
}

module.exports.VALID_CLOSE_METHODS = VALID_CLOSE_METHODS
