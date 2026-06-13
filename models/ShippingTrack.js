'use strict'

/**
 * 物流轨迹模型（ShippingTrack）——实物兑换发货链路 P2 物流方案一（拍板③）
 *
 * 业务场景：存储第三方（快递100/快递鸟）webhook 推送的全量快递轨迹，一节点一行。
 * 支撑：签收回推自动改单（shipped→received）、超时未揽收/未签收预警、批量对账、客服秒查。
 *
 * 表名（snake_case）：shipping_tracks
 * 主键命名：shipping_track_id（BIGINT 自增）
 *
 * @module models/ShippingTrack
 * @created 2026-06-14（实物兑换发货链路 P2）
 */

const { Model, DataTypes } = require('sequelize')

/** 统一轨迹状态 ENUM 值（与第三方状态码经 Provider 映射后归一） */
const TRACK_STATUS_ENUM = [
  'picked_up', // 已揽收
  'in_transit', // 运输中
  'delivering', // 派送中
  'delivered', // 已签收
  'returned', // 退回
  'exception' // 异常
]

/** 轨迹来源通道 ENUM 值 */
const PROVIDER_ENUM = ['kuaidi100', 'kdniao', 'manual']

/**
 * ShippingTrack 模型类
 *
 * @class ShippingTrack
 * @extends {Model}
 */
class ShippingTrack extends Model {
  /**
   * 模型关联定义
   *
   * @static
   * @param {Object} models - 所有模型的映射对象
   * @returns {void}
   */
  static associate(models) {
    ShippingTrack.belongsTo(models.ExchangeRecord, {
      foreignKey: 'exchange_record_id',
      as: 'order',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    })
  }

  /**
   * 生成幂等去重键（防 webhook 重复推送写入重复轨迹）
   *
   * @static
   * @param {string} shipping_no - 快递单号
   * @param {string|Date} track_time - 轨迹节点时间
   * @param {string} track_status - 统一轨迹状态
   * @returns {string} 去重键（<=120 字符）
   */
  static buildDedupKey(shipping_no, track_time, track_status) {
    const t = track_time instanceof Date ? track_time.toISOString() : String(track_time)
    return `${shipping_no}_${t}_${track_status}`.slice(0, 120)
  }
}

/**
 * 模型初始化函数
 *
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Model} ShippingTrack 模型
 */
module.exports = sequelize => {
  ShippingTrack.init(
    {
      shipping_track_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '物流轨迹主键'
      },
      exchange_record_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '关联兑换订单ID（FK→exchange_records.exchange_record_id）'
      },
      order_no: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: '订单号（冗余，便于直查）'
      },
      shipping_no: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '快递单号'
      },
      shipping_company: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '内部快递公司代码（sf/yt/zt…）'
      },
      track_status: {
        type: DataTypes.ENUM(...TRACK_STATUS_ENUM),
        allowNull: false,
        comment:
          '统一轨迹状态：picked_up揽收/in_transit运输中/delivering派送中/delivered已签收/returned退回/exception异常'
      },
      track_detail: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '轨迹文字描述（第三方 context 原文）'
      },
      track_time: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '该轨迹节点发生时间（北京时间）'
      },
      provider: {
        type: DataTypes.ENUM(...PROVIDER_ENUM),
        allowNull: false,
        defaultValue: 'kuaidi100',
        comment: '轨迹来源通道：kuaidi100/kdniao/manual'
      },
      raw_data: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '第三方推送原始报文（便于排查与对账）'
      },
      dedup_key: {
        type: DataTypes.STRING(120),
        allowNull: false,
        unique: true,
        comment: '幂等去重键（shipping_no+track_time+status，防 webhook 重复推送）'
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '入库时间（北京时间）'
      }
    },
    {
      sequelize,
      modelName: 'ShippingTrack',
      tableName: 'shipping_tracks',
      timestamps: false,
      comment: '物流轨迹表（一节点一行，webhook 落库）',
      scopes: {
        byOrder: exchange_record_id => ({
          where: { exchange_record_id },
          order: [['track_time', 'ASC']]
        }),
        byShippingNo: shipping_no => ({
          where: { shipping_no },
          order: [['track_time', 'ASC']]
        })
      }
    }
  )

  return ShippingTrack
}
