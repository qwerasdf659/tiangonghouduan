/**
 * DAU 每日统计模型
 *
 * 存储每日活跃用户数和对应的 DAU 系数，
 * 是广告定价 DAU 系数机制的数据源。
 *
 * 数据由 daily-dau-stats.js 定时任务每日凌晨写入。
 *
 * @module models/AdDauDailyStat
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * DAU 每日统计模型类
 *
 * @class AdDauDailyStat
 * @extends Model
 */
class AdDauDailyStat extends Model {
  /**
   * 定义模型关联
   *
   * @param {Object} _models - 模型集合
   * @returns {void}
   */
  static associate(_models) {}
}

/**
 * 初始化 AdDauDailyStat 模型
 *
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Object} 初始化后的模型
 */
module.exports = sequelize => {
  AdDauDailyStat.init(
    {
      ad_dau_daily_stat_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: 'DAU 每日统计主键'
      },
      /** 统计日期（每天唯一一条记录） */
      stat_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        unique: true,
        comment: '统计日期'
      },
      /** 当日活跃用户数 */
      dau_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '当日活跃用户数'
      },
      /** 当日 DAU 系数（匹配档位后计算得出） */
      dau_coefficient: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: true,
        /**
         * DECIMAL 类型转换为数字
         *
         * @returns {number|null} DAU 系数数值
         */
        get() {
          const val = this.getDataValue('dau_coefficient')
          return val !== null ? parseFloat(val) : null
        },
        comment: '当日 DAU 系数'
      },
      /** DAU 数据来源字段 */
      source: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'last_active_at',
        comment: '数据来源'
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false
      }
    },
    {
      sequelize,
      modelName: 'AdDauDailyStat',
      tableName: 'ad_dau_daily_stats',
      underscored: true,
      timestamps: false,
      comment: 'DAU 每日统计表'
    }
  )

  return AdDauDailyStat
}
