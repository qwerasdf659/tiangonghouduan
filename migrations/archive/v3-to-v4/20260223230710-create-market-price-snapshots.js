'use strict'

/**
 * 创建 market_price_snapshots 表（市场价格快照预聚合）
 *
 * 业务场景：
 * - 定时汇总市场挂牌的价格统计（最低/最高/平均价格、挂牌数量）
 * - 按资产代码 + 日期维度聚合，供市场概览和汇率参考使用
 * - P2 级别架构规范需求
 *
 * 数据来源：定时任务扫描 market_listings 表的 on_sale 状态挂牌
 * 快照频率：每日一次（可配置）
 *
 * @version 1.0.0
 * @date 2026-02-23
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 检查表是否已存在
    const tables = await queryInterface.showAllTables()
    if (tables.includes('market_price_snapshots')) {
      console.log('market_price_snapshots 表已存在，跳过创建')
      return
    }

    await queryInterface.createTable('market_price_snapshots', {
      snapshot_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '快照主键ID'
      },
      snapshot_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
        comment: '快照日期（YYYY-MM-DD）'
      },
      asset_code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: '资产代码（offer_asset_code 或通过 item 关联的类目）'
      },
      listing_kind: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'item',
        comment: '挂牌类型（item/fungible_asset）'
      },
      price_asset_code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'DIAMOND',
        comment: '定价币种代码'
      },
      active_listings: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '当日在售挂牌数量'
      },
      min_price: {
        type: Sequelize.DECIMAL(20, 4),
        allowNull: true,
        comment: '最低挂牌价格'
      },
      max_price: {
        type: Sequelize.DECIMAL(20, 4),
        allowNull: true,
        comment: '最高挂牌价格'
      },
      avg_price: {
        type: Sequelize.DECIMAL(20, 4),
        allowNull: true,
        comment: '平均挂牌价格'
      },
      total_volume: {
        type: Sequelize.DECIMAL(20, 4),
        allowNull: false,
        defaultValue: 0,
        comment: '当日成交总额（已完成订单的 gross_amount 之和）'
      },
      completed_trades: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '当日成交笔数'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: '市场价格快照预聚合表（每日一次，按资产+类型+币种维度）'
    })

    // 唯一约束：每天每种资产+类型+币种只有一条快照
    await queryInterface.addIndex('market_price_snapshots',
      ['snapshot_date', 'asset_code', 'listing_kind', 'price_asset_code'],
      {
        unique: true,
        name: 'uk_snapshot_date_asset_kind_currency'
      }
    )

    // 日期索引：按日期查询价格趋势
    await queryInterface.addIndex('market_price_snapshots',
      ['snapshot_date'],
      { name: 'idx_mps_snapshot_date' }
    )

    // 资产代码索引
    await queryInterface.addIndex('market_price_snapshots',
      ['asset_code'],
      { name: 'idx_mps_asset_code' }
    )

    console.log('✅ market_price_snapshots 表创建成功')
  },

  async down(queryInterface) {
    await queryInterface.dropTable('market_price_snapshots')
    console.log('✅ market_price_snapshots 表已删除')
  }
}
