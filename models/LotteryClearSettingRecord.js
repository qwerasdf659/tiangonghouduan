/**
 * 抽奖清除设置记录模型（LotteryClearSettingRecord Model）
 *
 * 业务场景：为审计日志提供业务主键（决策9实现）
 * - 记录管理员清除用户抽奖设置的操作
 * - 主键 record_id 作为审计日志的 target_id
 * - 解决 lottery_clear_settings 审计时 target_id: null 导致关键操作被阻断的问题
 *
 * 表名（snake_case）：lottery_clear_setting_records
 * 主键命名：record_id（BIGINT自增）
 *
 * 创建时间：2026-01-09
 * 关联文档：审计统一入口整合方案-2026-01-08.md（决策9）
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * LotteryClearSettingRecord 类定义（抽奖清除设置记录模型）
 *
 * @class LotteryClearSettingRecord
 * @extends {Model}
 */
class LotteryClearSettingRecord extends Model {
  /**
   * 模型关联定义
   *
   * @static
   * @param {Object} models - 所有模型的映射对象
   * @returns {void} 无返回值
   */
  static associate(models) {
    // 多对一：被清除设置的用户
    LotteryClearSettingRecord.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    })

    // 多对一：执行清除的管理员
    LotteryClearSettingRecord.belongsTo(models.User, {
      foreignKey: 'admin_id',
      as: 'admin',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    })
  }

  /**
   * 生成幂等键（业务主键派生，禁止兜底）
   *
   * 幂等键格式：lottery_clear_{user_id}_{setting_type}_{admin_id}_{timestamp}
   *
   * @static
   * @param {number} user_id - 被清除设置的用户ID
   * @param {string} setting_type - 清除的设置类型（all/force_win/force_lose/probability/queue）
   * @param {number} admin_id - 管理员ID
   * @returns {string} 幂等键
   */
  static generateIdempotencyKey(user_id, setting_type, admin_id) {
    // 使用秒级时间戳（同一秒内对同一用户的相同类型清除视为重复操作）
    const timestamp = Math.floor(Date.now() / 1000)
    return `lottery_clear_${user_id}_${setting_type || 'all'}_${admin_id}_${timestamp}`
  }

  /**
   * 获取清除操作描述
   *
   * @returns {string} 人类可读的清除操作描述
   */
  getClearDescription() {
    const typeMap = {
      all: '所有设置',
      force_win: '强制中奖',
      force_lose: '强制不中奖',
      probability: '概率调整',
      queue: '用户队列'
    }
    const typeText = typeMap[this.setting_type] || this.setting_type || '所有设置'
    return `清除【${typeText}】，共${this.cleared_count}条`
  }
}

/**
 * 模型初始化函数
 *
 * @param {Sequelize} sequelize - Sequelize实例
 * @param {DataTypes} _DataTypes - Sequelize数据类型（未使用）
 * @returns {Model} LotteryClearSettingRecord模型
 */
module.exports = (sequelize, _DataTypes) => {
  LotteryClearSettingRecord.init(
    {
      // 清除记录ID（主键，作为审计日志的 target_id）
      lottery_clear_setting_record_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '清除记录ID（作为审计日志 target_id）'
      },

      // 被清除设置的用户ID
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '被清除设置的用户ID'
      },

      // 执行清除的管理员ID
      admin_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '执行清除的管理员ID'
      },

      // 清除的设置类型
      setting_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
        defaultValue: 'all',
        comment:
          '清除的设置类型：all=全部/force_win=强制中奖/force_lose=强制不中奖/probability=概率调整/queue=用户队列，为空或all表示清除全部'
      },

      // 清除的记录数量
      cleared_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '本次清除的设置记录数量'
      },

      // 清除原因
      reason: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '清除原因（管理员备注）'
      },

      // 幂等键（防止重复操作）
      idempotency_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '幂等键（格式：lottery_clear_{user_id}_{setting_type}_{admin_id}_{timestamp}）'
      },

      // 元数据（JSON格式）
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '额外元数据（IP地址、用户代理、清除前的设置快照等）'
      },

      // 创建时间
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间'
      }
    },
    {
      sequelize,
      modelName: 'LotteryClearSettingRecord',
      tableName: 'lottery_clear_setting_records',
      timestamps: false, // 只有 created_at，不需要 updated_at
      comment: '抽奖清除设置记录表（为审计日志提供业务主键）',

      // 索引定义
      indexes: [
        {
          name: 'idx_clear_records_user_id',
          fields: ['user_id'],
          comment: '按用户查询清除历史'
        },
        {
          name: 'idx_clear_records_admin_id',
          fields: ['admin_id'],
          comment: '按管理员查询操作记录'
        },
        {
          name: 'idx_clear_records_created_at',
          fields: ['created_at'],
          comment: '按时间查询清除记录'
        }
      ],

      // 查询作用域
      scopes: {
        // 查询某用户的清除历史
        byUser: user_id => ({
          where: { user_id }
        }),

        // 查询某管理员的操作记录
        byAdmin: admin_id => ({
          where: { admin_id }
        }),

        // 按设置类型查询
        bySettingType: setting_type => ({
          where: { setting_type }
        })
      }
    }
  )

  return LotteryClearSettingRecord
}
