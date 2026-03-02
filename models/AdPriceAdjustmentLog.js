/**
 * 调价日志模型（AdPriceAdjustmentLog）
 *
 * 记录系统自动或人工触发的广告定价调整建议。
 * 状态流转：pending → confirmed/rejected → applied
 *
 * 数据来源：
 * - 自动：daily-price-adjustment-check.js 定时任务检测 DAU 变化后写入 pending 记录
 * - 手动：运营在管理后台手动发起调价
 *
 * 消费场景：运营在管理后台查看调价建议列表，确认或拒绝后执行
 *
 * @module models/AdPriceAdjustmentLog
 */

'use strict'

const { Model, DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/** 允许的触发类型枚举 */
const VALID_TRIGGER_TYPES = ['dau_shift', 'manual']

/** 允许的调价状态枚举 */
const VALID_ADJUSTMENT_STATUSES = ['pending', 'confirmed', 'rejected', 'applied']

/**
 * 广告价格调整日志模型（对应数据库表 ad_price_adjustment_logs）
 * @class AdPriceAdjustmentLog
 * @extends Model
 */
class AdPriceAdjustmentLog extends Model {
  /**
   * 定义模型关联
   *
   * @param {Object} models - 模型集合
   * @returns {void}
   */
  static associate(models) {
    /* 确认操作人（管理员） */
    AdPriceAdjustmentLog.belongsTo(models.User, {
      foreignKey: 'confirmed_by',
      as: 'confirmer'
    })
  }
}

/**
 * 初始化 AdPriceAdjustmentLog 模型
 *
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} Sequelize 模型类
 */
module.exports = sequelize => {
  AdPriceAdjustmentLog.init(
    {
      ad_price_adjustment_log_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '调价日志主键'
      },
      /** 触发类型：dau_shift=DAU变化自动触发, manual=运营手动触发 */
      trigger_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
          isIn: {
            args: [VALID_TRIGGER_TYPES],
            msg: `trigger_type 必须是以下之一：${VALID_TRIGGER_TYPES.join(', ')}`
          }
        },
        comment: '触发类型：dau_shift=DAU变化自动, manual=手动'
      },
      /** 调价前 DAU 系数 */
      old_coefficient: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: true,
        /** @returns {number|null} 转换后的数值 */
        get() {
          const val = this.getDataValue('old_coefficient')
          return val !== null ? parseFloat(val) : null
        },
        comment: '调价前 DAU 系数'
      },
      /** 调价后 DAU 系数 */
      new_coefficient: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: true,
        /** @returns {number|null} 转换后的数值 */
        get() {
          const val = this.getDataValue('new_coefficient')
          return val !== null ? parseFloat(val) : null
        },
        comment: '调价后 DAU 系数'
      },
      /** 受影响广告位列表（JSON数组） */
      affected_slots: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '受影响广告位（JSON）'
      },
      /** 调价状态：pending=待确认, confirmed=已确认, rejected=已拒绝, applied=已执行 */
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
        validate: {
          isIn: {
            args: [VALID_ADJUSTMENT_STATUSES],
            msg: `status 必须是以下之一：${VALID_ADJUSTMENT_STATUSES.join(', ')}`
          }
        },
        comment: '状态：pending/confirmed/rejected/applied'
      },
      /** 确认操作人ID（外键 → users.user_id） */
      confirmed_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'user_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: '确认操作人ID'
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        /** @returns {string|null} 北京时间格式化字符串 */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('created_at'))
        },
        comment: '创建时间'
      },
      /** 实际执行时间（confirmed → applied 时回写） */
      applied_at: {
        type: DataTypes.DATE,
        allowNull: true,
        /** @returns {string|null} 北京时间格式化字符串 */
        get() {
          return BeijingTimeHelper.formatChinese(this.getDataValue('applied_at'))
        },
        comment: '实际执行时间'
      }
    },
    {
      sequelize,
      modelName: 'AdPriceAdjustmentLog',
      tableName: 'ad_price_adjustment_logs',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      comment: '广告调价日志表（DAU系数调整审批与执行记录）',
      indexes: [
        { fields: ['status'], name: 'idx_adjustment_status' },
        { fields: ['trigger_type'], name: 'idx_adjustment_trigger_type' },
        { fields: ['created_at'], name: 'idx_adjustment_created_at' },
        { fields: ['confirmed_by'], name: 'idx_adjustment_confirmed_by' }
      ],
      scopes: {
        pending: { where: { status: 'pending' } },
        confirmed: { where: { status: 'confirmed' } },
        applied: { where: { status: 'applied' } }
      }
    }
  )

  /** 触发类型枚举常量 */
  AdPriceAdjustmentLog.VALID_TRIGGER_TYPES = VALID_TRIGGER_TYPES
  /** 调价状态枚举常量 */
  AdPriceAdjustmentLog.VALID_ADJUSTMENT_STATUSES = VALID_ADJUSTMENT_STATUSES

  return AdPriceAdjustmentLog
}
