/**
 * 提醒历史记录模型
 *
 * 业务场景：
 * - 存储每次提醒规则触发的详细信息
 * - 记录通知发送结果和确认状态
 * - 支持提醒历史查询和统计分析
 *
 * 表名：reminder_history
 * 创建时间：2026年01月31日
 */

'use strict'

const { DataTypes } = require('sequelize')

/**
 * 通知状态枚举
 * @readonly
 * @enum {string}
 */
const NOTIFICATION_STATUS = {
  PENDING: 'pending', // 待发送
  SENT: 'sent', // 已发送
  FAILED: 'failed', // 发送失败
  SKIPPED: 'skipped' // 已跳过（如规则禁用）
}

module.exports = sequelize => {
  const ReminderHistory = sequelize.define(
    'ReminderHistory',
    {
      /**
       * 提醒历史ID（主键）
       * @type {number}
       */
      reminder_history_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '提醒历史ID（主键，符合{table_name}_id规范）'
      },

      /**
       * 关联的提醒规则ID
       * @type {number}
       * 命名规范：与 reminder_rules 表的主键 reminder_rule_id 一致
       */
      reminder_rule_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'reminder_rules',
          key: 'reminder_rule_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        comment: '关联的提醒规则ID'
      },

      /**
       * 触发时间
       * @type {Date}
       */
      trigger_time: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '触发时间'
      },

      /**
       * 触发时的数据快照
       * @type {Object|null}
       * @example { matched_ids: [1, 2, 3], conditions: {...} }
       */
      trigger_data: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '触发时的数据快照'
      },

      /**
       * 匹配的记录数量
       * @type {number}
       */
      matched_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '匹配的记录数量'
      },

      /**
       * 通知状态
       * @type {string}
       * @see NOTIFICATION_STATUS
       */
      notification_status: {
        type: DataTypes.ENUM(...Object.values(NOTIFICATION_STATUS)),
        allowNull: false,
        defaultValue: NOTIFICATION_STATUS.PENDING,
        comment: '通知状态'
      },

      /**
       * 通知结果详情
       * @type {Object|null}
       * @example { channels: [{ type: 'admin_broadcast', success: true }] }
       */
      notification_result: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '通知结果详情'
      },

      /**
       * 通知发送时间
       * @type {Date|null}
       */
      sent_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '通知发送时间'
      },

      /**
       * 错误信息
       * @type {string|null}
       */
      error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '错误信息'
      },

      /**
       * 是否已确认
       * @type {boolean}
       */
      is_acknowledged: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否已确认'
      },

      /**
       * 确认者ID
       * @type {number|null}
       */
      acknowledged_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '确认者ID'
      },

      /**
       * 确认时间
       * @type {Date|null}
       */
      acknowledged_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '确认时间'
      }
    },
    {
      sequelize,
      modelName: 'ReminderHistory',
      tableName: 'reminder_history',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false, // 不需要更新时间
      underscored: true,
      comment: '提醒历史记录表',

      indexes: [
        { fields: ['reminder_rule_id'], name: 'idx_reminder_history_rule' },
        { fields: ['trigger_time'], name: 'idx_reminder_history_trigger_time' },
        { fields: ['notification_status'], name: 'idx_reminder_history_status' },
        { fields: ['created_at'], name: 'idx_reminder_history_created' }
      ],

      scopes: {
        /**
         * 待发送的提醒
         */
        pending: {
          where: { notification_status: NOTIFICATION_STATUS.PENDING }
        },

        /**
         * 未确认的提醒
         */
        unacknowledged: {
          where: { is_acknowledged: false }
        },

        /**
         * 已发送的提醒
         */
        sent: {
          where: { notification_status: NOTIFICATION_STATUS.SENT }
        }
      }
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - 所有模型对象
   * @returns {void} 无返回值
   */
  ReminderHistory.associate = function (models) {
    // 关联提醒规则
    ReminderHistory.belongsTo(models.ReminderRule, {
      foreignKey: 'reminder_rule_id',
      as: 'rule'
    })

    // 确认者关联
    ReminderHistory.belongsTo(models.User, {
      foreignKey: 'acknowledged_by',
      as: 'acknowledger'
    })
  }

  /**
   * 标记为已发送
   * @param {Object} result - 发送结果
   * @param {Object} [options] - Sequelize 选项
   * @returns {Promise<ReminderHistory>} 更新后的提醒历史实例
   */
  ReminderHistory.prototype.markAsSent = async function (result, options = {}) {
    this.notification_status = NOTIFICATION_STATUS.SENT
    this.notification_result = result
    this.sent_at = new Date()
    return this.save(options)
  }

  /**
   * 标记为发送失败
   * @param {string} errorMessage - 错误信息
   * @param {Object} [options] - Sequelize 选项
   * @returns {Promise<ReminderHistory>} 更新后的提醒历史实例
   */
  ReminderHistory.prototype.markAsFailed = async function (errorMessage, options = {}) {
    this.notification_status = NOTIFICATION_STATUS.FAILED
    this.error_message = errorMessage
    return this.save(options)
  }

  /**
   * 确认提醒
   * @param {number} userId - 确认者ID
   * @param {Object} [options] - Sequelize 选项
   * @returns {Promise<ReminderHistory>} 更新后的提醒历史实例
   */
  ReminderHistory.prototype.acknowledge = async function (userId, options = {}) {
    this.is_acknowledged = true
    this.acknowledged_by = userId
    this.acknowledged_at = new Date()
    return this.save(options)
  }

  // 导出常量
  ReminderHistory.NOTIFICATION_STATUS = NOTIFICATION_STATUS

  return ReminderHistory
}
