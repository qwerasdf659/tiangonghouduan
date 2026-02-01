/**
 * 智能提醒规则模型
 *
 * 业务场景：
 * - 支持自定义提醒规则，如"待审核超24小时提醒"、"预算消耗告警"
 * - 定时检测规则条件，触发提醒推送
 * - 支持多种通知渠道（管理员广播、WebSocket、微信等）
 *
 * 表名：reminder_rules
 * 创建时间：2026年01月31日
 */

'use strict'

const { DataTypes } = require('sequelize')

/**
 * 提醒规则类型枚举
 * @readonly
 * @enum {string}
 */
const RULE_TYPES = {
  PENDING_TIMEOUT: 'pending_timeout', // 待处理超时
  STOCK_LOW: 'stock_low', // 库存不足
  BUDGET_ALERT: 'budget_alert', // 预算告警
  ACTIVITY_STATUS: 'activity_status', // 活动状态变更
  ANOMALY_DETECT: 'anomaly_detect', // 异常检测
  SCHEDULED: 'scheduled', // 定时提醒
  CUSTOM: 'custom' // 自定义规则
}

/**
 * 通知优先级枚举
 * @readonly
 * @enum {string}
 */
const NOTIFICATION_PRIORITIES = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent'
}

module.exports = sequelize => {
  const ReminderRule = sequelize.define(
    'ReminderRule',
    {
      /**
       * 提醒规则ID（主键）
       * @type {number}
       */
      reminder_rule_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '提醒规则ID（主键，符合{table_name}_id规范）'
      },

      /**
       * 规则编码（唯一标识）
       * @type {string}
       * @example 'pending_audit_24h'
       */
      rule_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '规则编码（唯一标识，如 pending_audit_24h）'
      },

      /**
       * 规则名称（中文）
       * @type {string}
       * @example '待审核超24小时提醒'
       */
      rule_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '规则名称（中文）'
      },

      /**
       * 规则描述
       * @type {string|null}
       */
      rule_description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '规则描述'
      },

      /**
       * 规则类型
       * @type {string}
       * @see RULE_TYPES
       */
      rule_type: {
        type: DataTypes.ENUM(...Object.values(RULE_TYPES)),
        allowNull: false,
        comment: '规则类型'
      },

      /**
       * 触发条件配置（JSON）
       * @type {Object}
       * @example { threshold: 24, unit: 'hours', target_status: 'pending' }
       */
      trigger_condition: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '触发条件配置'
      },

      /**
       * 目标实体类型
       * @type {string}
       * @example 'consumption_record', 'lottery_campaign', 'exchange_record'
       */
      target_entity: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '目标实体类型'
      },

      /**
       * 通知渠道配置（JSON数组）
       * @type {string[]}
       * @example ['admin_broadcast', 'websocket', 'wechat']
       */
      notification_channels: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: ['admin_broadcast'],
        comment: '通知渠道配置'
      },

      /**
       * 通知模板（支持变量占位符）
       * @type {string|null}
       * @example '有{count}条{entity}待处理超过{threshold}{unit}'
       */
      notification_template: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '通知模板'
      },

      /**
       * 通知优先级
       * @type {string}
       * @see NOTIFICATION_PRIORITIES
       */
      notification_priority: {
        type: DataTypes.ENUM(...Object.values(NOTIFICATION_PRIORITIES)),
        allowNull: false,
        defaultValue: NOTIFICATION_PRIORITIES.MEDIUM,
        comment: '通知优先级'
      },

      /**
       * 检测间隔（分钟）
       * @type {number}
       */
      check_interval_minutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 60,
        comment: '检测间隔（分钟）'
      },

      /**
       * 上次检测时间
       * @type {Date|null}
       */
      last_check_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '上次检测时间'
      },

      /**
       * 下次检测时间
       * @type {Date|null}
       */
      next_check_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '下次检测时间'
      },

      /**
       * 是否启用
       * @type {boolean}
       */
      is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用'
      },

      /**
       * 是否系统内置规则
       * @type {boolean}
       */
      is_system: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否系统内置规则（系统规则不可删除）'
      },

      /**
       * 创建者ID
       * @type {number|null}
       */
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '创建者ID'
      },

      /**
       * 最后更新者ID
       * @type {number|null}
       */
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '最后更新者ID'
      }
    },
    {
      sequelize,
      modelName: 'ReminderRule',
      tableName: 'reminder_rules',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      comment: '智能提醒规则表',

      indexes: [
        { unique: true, fields: ['rule_code'], name: 'idx_reminder_rules_code' },
        { fields: ['rule_type'], name: 'idx_reminder_rules_type' },
        { fields: ['is_enabled'], name: 'idx_reminder_rules_enabled' },
        { fields: ['next_check_at'], name: 'idx_reminder_rules_next_check' }
      ],

      scopes: {
        /**
         * 仅启用的规则
         */
        enabled: {
          where: { is_enabled: true }
        },

        /**
         * 需要检测的规则（下次检测时间已到或未设置）
         */
        needsCheck: {
          where: {
            is_enabled: true,
            [sequelize.Sequelize.Op.or]: [
              { next_check_at: { [sequelize.Sequelize.Op.lte]: new Date() } },
              { next_check_at: null }
            ]
          }
        }
      }
    }
  )

  /**
   * 定义模型关联关系
   * @param {Object} models - 所有模型对象
   * @returns {void} 无返回值
   */
  ReminderRule.associate = function (models) {
    // 创建者关联
    ReminderRule.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'creator'
    })

    // 更新者关联
    ReminderRule.belongsTo(models.User, {
      foreignKey: 'updated_by',
      as: 'updater'
    })

    // 提醒历史关联
    ReminderRule.hasMany(models.ReminderHistory, {
      foreignKey: 'reminder_rule_id',
      as: 'histories'
    })
  }

  /**
   * 获取下次检测时间
   * @returns {Date} 基于当前时间和检测间隔计算的下次检测时间
   */
  ReminderRule.prototype.getNextCheckTime = function () {
    const now = new Date()
    return new Date(now.getTime() + this.check_interval_minutes * 60 * 1000)
  }

  /**
   * 更新检测时间
   * @param {Object} [options] - Sequelize 选项
   * @returns {Promise<ReminderRule>} 更新后的规则实例
   */
  ReminderRule.prototype.updateCheckTimes = async function (options = {}) {
    const now = new Date()
    this.last_check_at = now
    this.next_check_at = this.getNextCheckTime()
    return this.save(options)
  }

  /**
   * 解析通知模板，替换变量
   * @param {Object} data - 变量数据
   * @returns {string} 解析后的消息
   */
  ReminderRule.prototype.parseTemplate = function (data) {
    if (!this.notification_template) {
      return `规则【${this.rule_name}】触发`
    }

    let message = this.notification_template
    Object.entries(data).forEach(([key, value]) => {
      message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
    })
    return message
  }

  // 导出常量
  ReminderRule.RULE_TYPES = RULE_TYPES
  ReminderRule.NOTIFICATION_PRIORITIES = NOTIFICATION_PRIORITIES

  return ReminderRule
}
