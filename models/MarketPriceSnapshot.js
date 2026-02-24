'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * 市场价格快照模型（MarketPriceSnapshot）
 *
 * 职责：
 * - 存储市场挂牌的每日价格聚合统计
 * - 按 asset_code + listing_kind + price_asset_code 维度聚合
 * - 供市场概览、价格趋势分析、汇率参考使用
 *
 * 数据来源：定时任务每日扫描 market_listings + trade_orders
 *
 * @version 1.0.0
 * @date 2026-02-23
 */
class MarketPriceSnapshot extends Model {
  /**
   * 定义模型关联（无外键关联，独立预聚合表）
   *
   * @param {Object} _models - Sequelize模型集合
   * @returns {void}
   */
  static associate(_models) {
    // 无外键关联，独立预聚合表
  }
}

/**
 * 初始化模型字段定义
 * @param {Object} sequelize - Sequelize 实例
 * @returns {MarketPriceSnapshot} 初始化后的模型类
 */
MarketPriceSnapshot.initModel = function (sequelize) {
  MarketPriceSnapshot.init(
    {
      snapshot_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '快照主键ID'
      },
      snapshot_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: '快照日期（YYYY-MM-DD）'
      },
      asset_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '资产代码'
      },
      listing_kind: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'item',
        comment: '挂牌类型（item/fungible_asset）'
      },
      price_asset_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'DIAMOND',
        comment: '定价币种代码'
      },
      active_listings: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '当日在售挂牌数量'
      },
      min_price: {
        type: DataTypes.DECIMAL(20, 4),
        allowNull: true,
        get() {
          // eslint-disable-line require-jsdoc
          const val = this.getDataValue('min_price')
          return val !== null ? Number(val) : null
        },
        comment: '最低挂牌价格'
      },
      max_price: {
        type: DataTypes.DECIMAL(20, 4),
        allowNull: true,
        get() {
          // eslint-disable-line require-jsdoc
          const val = this.getDataValue('max_price')
          return val !== null ? Number(val) : null
        },
        comment: '最高挂牌价格'
      },
      avg_price: {
        type: DataTypes.DECIMAL(20, 4),
        allowNull: true,
        get() {
          // eslint-disable-line require-jsdoc
          const val = this.getDataValue('avg_price')
          return val !== null ? Number(val) : null
        },
        comment: '平均挂牌价格'
      },
      total_volume: {
        type: DataTypes.DECIMAL(20, 4),
        allowNull: false,
        defaultValue: 0,
        get() {
          // eslint-disable-line require-jsdoc
          return Number(this.getDataValue('total_volume') || 0)
        },
        comment: '当日成交总额'
      },
      completed_trades: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '当日成交笔数'
      }
    },
    {
      sequelize,
      modelName: 'MarketPriceSnapshot',
      tableName: 'market_price_snapshots',
      timestamps: true,
      underscored: true,
      comment: '市场价格快照预聚合表'
    }
  )

  return MarketPriceSnapshot
}

module.exports = MarketPriceSnapshot
