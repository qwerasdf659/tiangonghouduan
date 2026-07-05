/**
 * 产品系列模型（ProductSeries）— 连号系列号主数据
 *
 * 业务定位（docs/商品编码体系设计方案.md §3.6）：
 * - 双轨制中「可读系列号」轨道的主数据：系列码 series_code（运营手填，如 SLNB）+ 系列内连续序号发号（next_seq）。
 * - 与随机主码 item_code 各司其职：主码防枚举保密；系列号可读连续，用于成套印刷/系列归类。
 *
 * 表名：product_series；主键：series_id（BIGINT）；唯一键：series_code
 *
 * @module models/ProductSeries
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * @class ProductSeries
 * @extends Model
 */
class ProductSeries extends Model {
  /**
   * 定义模型关联
   * @param {Object} models - Sequelize 已注册模型集合
   * @returns {void}
   */
  static associate(models) {
    if (models.ExchangeItem) {
      ProductSeries.hasMany(models.ExchangeItem, {
        foreignKey: 'series_id',
        as: 'items'
      })
    }
  }
}

/**
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Model} 初始化后的模型类
 */
module.exports = sequelize => {
  ProductSeries.init(
    {
      series_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '系列主键'
      },
      series_code: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
        comment: '可读系列码(全大写,如 SLNB;运营手填+后端唯一校验)'
      },
      series_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '系列名称'
      },
      next_seq: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: '系列内下一个序号(发号用,事务内行锁自增)'
      },
      seq_pad: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 3,
        comment: '序号展示补零位数(默认 3 → 001)'
      },
      status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
        comment: '状态：active 启用 / inactive 停用'
      }
    },
    {
      sequelize,
      modelName: 'ProductSeries',
      tableName: 'product_series',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '产品系列(连号系列号)'
    }
  )

  return ProductSeries
}
