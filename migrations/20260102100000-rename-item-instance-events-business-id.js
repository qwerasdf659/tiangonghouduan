/**
 * 餐厅积分抽奖系统 - 数据库迁移
 *
 * 迁移内容：将 item_instance_events 表的 business_id 字段重命名为 idempotency_key
 *
 * 业界标准形态（2026-01-02）：
 * - 统一使用 idempotency_key 字段名
 * - 保持 business_type + idempotency_key 联合索引
 *
 * 创建时间：2026年01月02日
 */

'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('开始迁移：item_instance_events.business_id → idempotency_key...')

    // 1. 检查 business_id 字段是否存在
    const [columns] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'item_instance_events'
        AND COLUMN_NAME = 'business_id'
    `)

    if (columns.length === 0) {
      console.log('  ⚠️ 表 item_instance_events 没有 business_id 字段，可能已迁移')
      return
    }

    // 2. 删除旧的联合唯一索引
    const [ukIndex] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM item_instance_events
      WHERE Key_name = 'uk_item_instance_events_business'
    `)
    if (ukIndex.length > 0) {
      await queryInterface.removeIndex('item_instance_events', 'uk_item_instance_events_business')
      console.log('  ✅ 已删除旧唯一索引: uk_item_instance_events_business')
    }

    // 3. 删除旧的普通索引
    const [idxIndex] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM item_instance_events
      WHERE Key_name = 'idx_item_instance_events_business'
    `)
    if (idxIndex.length > 0) {
      await queryInterface.removeIndex('item_instance_events', 'idx_item_instance_events_business')
      console.log('  ✅ 已删除旧普通索引: idx_item_instance_events_business')
    }

    // 4. 重命名字段
    await queryInterface.renameColumn('item_instance_events', 'business_id', 'idempotency_key')
    console.log('  ✅ 已重命名字段: business_id -> idempotency_key')

    // 5. 添加新的联合索引
    await queryInterface.addIndex('item_instance_events', {
      fields: ['business_type', 'idempotency_key'],
      unique: true,
      name: 'uk_item_instance_events_business_idempotency'
    })
    console.log('  ✅ 已创建新唯一索引: uk_item_instance_events_business_idempotency')

    console.log('✅ item_instance_events 字段迁移完成')
  },

  async down(queryInterface, Sequelize) {
    console.log('回滚迁移：item_instance_events.idempotency_key → business_id...')

    // 检查 idempotency_key 字段是否存在
    const [columns] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'item_instance_events'
        AND COLUMN_NAME = 'idempotency_key'
    `)

    if (columns.length === 0) {
      console.log('  ⚠️ 表 item_instance_events 没有 idempotency_key 字段，跳过')
      return
    }

    // 删除新索引
    const [newIndex] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM item_instance_events
      WHERE Key_name = 'uk_item_instance_events_business_idempotency'
    `)
    if (newIndex.length > 0) {
      await queryInterface.removeIndex(
        'item_instance_events',
        'uk_item_instance_events_business_idempotency'
      )
      console.log('  ✅ 已删除索引: uk_item_instance_events_business_idempotency')
    }

    // 重命名字段回 business_id
    await queryInterface.renameColumn('item_instance_events', 'idempotency_key', 'business_id')
    console.log('  ✅ 已重命名字段: idempotency_key -> business_id')

    // 恢复旧索引
    await queryInterface.addIndex('item_instance_events', {
      fields: ['business_type', 'business_id'],
      unique: true,
      name: 'uk_item_instance_events_business'
    })
    console.log('  ✅ 已恢复唯一索引: uk_item_instance_events_business')

    console.log('✅ 回滚完成')
  }
}
