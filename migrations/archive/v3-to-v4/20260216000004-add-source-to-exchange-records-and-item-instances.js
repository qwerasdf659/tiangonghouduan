'use strict'

/**
 * 数据库迁移：exchange_records 和 item_instances 新增 source 字段
 *
 * 业务背景（臻选空间/幸运空间/竞价功能 — 后端实施方案，决策10）：
 * - 新增 source 字段用于区分记录来源（普通兑换 / 竞价中标 / 抽奖等）
 * - exchange_records.source：NOT NULL DEFAULT 'exchange'（0条记录，无需回填）
 * - item_instances.source：DEFAULT NULL（存量记录保持 NULL，历史数据无法确定来源）
 * - 新增 idx_source 索引便于按来源统计查询
 *
 * @see docs/臻选空间-幸运空间-竞价功能-后端实施方案.md §3.4
 * @date 2026-02-16
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('📦 [迁移] 开始：exchange_records 和 item_instances 新增 source 字段...')

    // ====== 1. exchange_records 新增 source 字段 ======
    console.log('  📋 Step 1/3: exchange_records 新增 source 字段...')
    await queryInterface.addColumn('exchange_records', 'source', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'exchange',
      comment: '来源：exchange=普通兑换, bid=竞价中标'
    })

    // ====== 2. exchange_records 新增 idx_source 索引 ======
    console.log('  📋 Step 2/3: exchange_records 新增 idx_source 索引...')
    await queryInterface.addIndex('exchange_records', ['source'], {
      name: 'idx_exchange_records_source'
    })

    // ====== 3. item_instances 新增 source 字段 ======
    console.log('  📋 Step 3/3: item_instances 新增 source 字段...')
    await queryInterface.addColumn('item_instances', 'source', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: null,
      comment: '来源：exchange=兑换, bid_settlement=竞价结算, lottery=抽奖（存量为 NULL）'
    })

    console.log('  📋 存量数据说明：')
    console.log('    - exchange_records：当前 0 条记录，无需回填')
    console.log('    - item_instances：存量记录 source 保持 NULL（历史数据无法确定来源）')

    console.log('✅ [迁移] 完成：exchange_records 和 item_instances 新增 source 字段')
  },

  async down(queryInterface) {
    console.log('📦 [回滚] 开始：移除 source 字段...')

    await queryInterface.removeIndex('exchange_records', 'idx_exchange_records_source')
    await queryInterface.removeColumn('exchange_records', 'source')
    await queryInterface.removeColumn('item_instances', 'source')

    console.log('✅ [回滚] 完成：source 字段已移除')
  }
}


