/**
 * 餐厅积分抽奖系统 - 数据库迁移
 *
 * 迁移内容：修复 item_instance_events.idempotency_key 约束（文档4.2要求）
 *
 * 业界标准形态（2026-01-02）：
 * - idempotency_key 改为 NOT NULL（强制）
 * - 添加联合唯一索引 (item_instance_id, idempotency_key)
 *
 * 文档依据：业界标准形态-统一幂等与账本交易架构-破坏性重构方案.md 第4.2节
 *
 * 创建时间：2026年01月02日
 */

'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('开始迁移：item_instance_events.idempotency_key NOT NULL 约束...')

    // 1. 检查是否有 NULL 值（安全检查）
    const [nullRecords] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count FROM item_instance_events WHERE idempotency_key IS NULL
    `)

    if (nullRecords[0].count > 0) {
      throw new Error(
        `发现 ${nullRecords[0].count} 条 idempotency_key 为 NULL 的记录，无法添加 NOT NULL 约束。` +
          '请先清理或填充这些记录。'
      )
    }
    console.log('  ✅ 安全检查通过：无 NULL 记录')

    // 2. 修改列为 NOT NULL
    await queryInterface.changeColumn('item_instance_events', 'idempotency_key', {
      type: Sequelize.STRING(100),
      allowNull: false,
      comment: '幂等键（业界标准命名）：派生自父级幂等键，用于事件去重'
    })
    console.log('  ✅ 已将 idempotency_key 改为 NOT NULL')

    // 3. 检查是否已存在联合唯一索引 (item_instance_id, idempotency_key)
    const [existingIndex] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM item_instance_events
      WHERE Key_name = 'uk_item_instance_events_instance_idempotency'
    `)

    if (existingIndex.length === 0) {
      // 添加联合唯一索引（文档4.2建议）
      await queryInterface.addIndex('item_instance_events', {
        fields: ['item_instance_id', 'idempotency_key'],
        unique: true,
        name: 'uk_item_instance_events_instance_idempotency'
      })
      console.log('  ✅ 已创建联合唯一索引: uk_item_instance_events_instance_idempotency')
    } else {
      console.log('  ⚠️ 联合唯一索引已存在，跳过创建')
    }

    console.log('✅ item_instance_events NOT NULL 约束迁移完成')
  },

  async down(queryInterface, Sequelize) {
    console.log('回滚迁移：item_instance_events.idempotency_key NOT NULL 约束...')

    // 1. 删除联合唯一索引
    const [existingIndex] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM item_instance_events
      WHERE Key_name = 'uk_item_instance_events_instance_idempotency'
    `)

    if (existingIndex.length > 0) {
      await queryInterface.removeIndex(
        'item_instance_events',
        'uk_item_instance_events_instance_idempotency'
      )
      console.log('  ✅ 已删除联合唯一索引: uk_item_instance_events_instance_idempotency')
    }

    // 2. 将列改回允许 NULL
    await queryInterface.changeColumn('item_instance_events', 'idempotency_key', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: '幂等键（业界标准命名）：派生自父级幂等键，用于事件去重'
    })
    console.log('  ✅ 已将 idempotency_key 改回允许 NULL')

    console.log('✅ 回滚完成')
  }
}
