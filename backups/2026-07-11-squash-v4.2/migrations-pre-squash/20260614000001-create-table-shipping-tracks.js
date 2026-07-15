'use strict'

/**
 * 创建表: shipping_tracks（物流轨迹表）——实物兑换发货链路 P2 物流方案一（拍板③）
 *
 * 创建时间: 2026-06-14（docs/实物兑换发货链路-审查与方案.md 拍板③：轨迹落库 + webhook 推送）
 * 创建原因:
 * - 现状：发货后仅实时查第三方（快递100/快递鸟）+ Redis 缓存 + 7 天自动确认兜底，
 *   轨迹不落库、签收不回推，无法做超时预警/批量对账/客服秒查。
 * - 拍板③方案一：第三方 webhook 主动推送 → 落库全量轨迹 → 签收驱动状态机自动 shipped→received。
 *
 * 存储粒度（拍板③已定）：一节点一行——每条快递动态（揽收/到站/派送/签收等）存一行，
 * 便于用 SQL 扫描做超时预警/批量对账。
 *
 * 字段语义:
 * - exchange_record_id : 关联兑换订单（FK→exchange_records.exchange_record_id，订单删除受限保护）
 * - order_no           : 冗余订单号（便于按订单号直查，与 exchange_records.order_no 列宽一致 32）
 * - shipping_no        : 快递单号（与 exchange_records.shipping_no 一致）
 * - shipping_company   : 内部快递公司代码（sf/yt/zt…，与 services/shipping/constants.js 字典一致）
 * - track_status       : 统一轨迹状态（picked_up/in_transit/delivering/delivered/returned/exception）
 * - track_detail       : 轨迹文字描述（第三方 context 原文）
 * - track_time         : 该轨迹节点发生时间（北京时间）
 * - provider           : 来源通道（kuaidi100/kdniao/manual）
 * - raw_data           : 第三方推送原始报文（JSON，便于排查与对账）
 * - dedup_key          : 幂等去重键（shipping_no + track_time + status 的哈希，防 webhook 重复推送）
 *
 * 回滚: 删除整表
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.createTable(
        'shipping_tracks',
        {
          shipping_track_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '物流轨迹主键'
          },
          exchange_record_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '关联兑换订单ID，FK→exchange_records.exchange_record_id',
            references: { model: 'exchange_records', key: 'exchange_record_id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT'
          },
          order_no: {
            type: Sequelize.STRING(32),
            allowNull: false,
            comment: '订单号（冗余，便于直查，与 exchange_records.order_no 一致）'
          },
          shipping_no: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '快递单号（与 exchange_records.shipping_no 一致）'
          },
          shipping_company: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '内部快递公司代码（sf/yt/zt…，对齐 services/shipping/constants.js 字典）'
          },
          track_status: {
            type: Sequelize.ENUM(
              'picked_up',
              'in_transit',
              'delivering',
              'delivered',
              'returned',
              'exception'
            ),
            allowNull: false,
            comment:
              '统一轨迹状态：picked_up揽收/in_transit运输中/delivering派送中/delivered已签收/returned退回/exception异常'
          },
          track_detail: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '轨迹文字描述（第三方 context 原文）'
          },
          track_time: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '该轨迹节点发生时间（北京时间）'
          },
          provider: {
            type: Sequelize.ENUM('kuaidi100', 'kdniao', 'manual'),
            allowNull: false,
            defaultValue: 'kuaidi100',
            comment: '轨迹来源通道：kuaidi100快递100/kdniao快递鸟/manual人工补录'
          },
          raw_data: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '第三方推送原始报文（便于排查与对账）'
          },
          dedup_key: {
            type: Sequelize.STRING(120),
            allowNull: false,
            comment: '幂等去重键（shipping_no+track_time+status 哈希，防 webhook 重复推送）'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '入库时间（北京时间）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '物流轨迹表（一节点一行，webhook 推送落库，支撑签收回推/超时预警/对账）'
        }
      )

      // 幂等去重唯一约束（防 webhook 重复推送写入重复轨迹）
      await queryInterface.addIndex('shipping_tracks', ['dedup_key'], {
        name: 'uk_shipping_tracks_dedup',
        unique: true,
        transaction
      })
      // 按订单查轨迹（订单详情/客服秒查）
      await queryInterface.addIndex('shipping_tracks', ['exchange_record_id', 'track_time'], {
        name: 'idx_shipping_tracks_record_time',
        transaction
      })
      // 按快递单号查轨迹（webhook 回调按单号定位）
      await queryInterface.addIndex('shipping_tracks', ['shipping_no'], {
        name: 'idx_shipping_tracks_no',
        transaction
      })
      // 按状态+时间扫描（超时未揽收/未签收预警、批量对账）
      await queryInterface.addIndex('shipping_tracks', ['track_status', 'track_time'], {
        name: 'idx_shipping_tracks_status_time',
        transaction
      })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('shipping_tracks')
  }
}
