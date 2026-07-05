/**
 * 外部平台商品映射模型（ExternalChannelMapping）— S5 第三方分销
 *
 * 业务定位（docs/商品编码体系设计方案.md §13.6/§14.4）：
 * - 把商品铺到外部平台（淘宝/抖音），映射外部平台商品 ID ↔ 我方 item_code / exchange_item_id。
 * - item_code 作为对外稳定唯一键天然适合当对接锚点；外部 ID 只存映射表，不污染主数据。
 * - 施工边界：本次仅建表结构 + 模型，不接入业务流。
 *
 * 表名：external_channel_mappings；主键：id（BIGINT）；唯一键：(channel, external_item_id)
 *
 * @module models/ExternalChannelMapping
 */

'use strict'

const { Model, DataTypes } = require('sequelize')

/**
 * @class ExternalChannelMapping
 * @extends Model
 */
class ExternalChannelMapping extends Model {
  /**
   * 定义模型关联
   * @param {Object} models - Sequelize 已注册模型集合
   * @returns {void}
   */
  static associate(models) {
    if (models.ExchangeItem) {
      ExternalChannelMapping.belongsTo(models.ExchangeItem, {
        foreignKey: 'exchange_item_id',
        as: 'exchangeItem'
      })
    }
  }
}

/**
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Model} 初始化后的模型类
 */
module.exports = sequelize => {
  ExternalChannelMapping.init(
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '映射主键'
      },
      channel: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: '外部渠道:taobao/douyin/...'
      },
      external_item_id: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '外部平台商品ID'
      },
      exchange_item_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: 'exchange_items', key: 'exchange_item_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: '我方SPU'
      },
      sync_status: {
        type: DataTypes.ENUM('pending', 'synced', 'failed', 'disabled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '同步状态'
      },
      last_synced_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '最近同步时间（UTC 存储，北京时间展示）'
      }
    },
    {
      sequelize,
      modelName: 'ExternalChannelMapping',
      tableName: 'external_channel_mappings',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '外部平台商品ID↔我方item_code映射(S5)'
    }
  )

  return ExternalChannelMapping
}
