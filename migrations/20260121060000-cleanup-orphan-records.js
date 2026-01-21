'use strict'

/**
 * 清理孤儿数据记录（硬删除）
 *
 * 背景：
 * - 数据库完整性检查发现存在孤儿数据
 * - consumption_records 表有 1 条引用不存在的 store_id
 * - item_instance_events 表有 21 条引用不存在的 item_instance_id
 *
 * 清理原因：
 * - 这些孤儿数据破坏了数据引用完整性
 * - 可能导致业务查询错误或报表统计不准确
 * - 需要清理以保证数据库健康状态
 *
 * 清理策略（硬删除）：
 * - 孤儿数据的父记录已不存在，即使恢复也无法正常使用
 * - 硬删除可以彻底消除隐患（避免误恢复、查询遗漏等问题）
 * - 删除前记录详细日志作为审计痕迹
 *
 * @migration 20260121060000-cleanup-orphan-records
 * @date 2026-01-21 北京时间
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('📋 开始清理孤儿数据记录（硬删除模式）...')

      // ==================================================
      // 1. 清理 consumption_records 表的孤儿数据
      // ==================================================
      console.log('\n🔍 检查 consumption_records 孤儿数据...')

      const [orphanConsumption] = await queryInterface.sequelize.query(
        `
        SELECT cr.record_id, cr.store_id, cr.user_id, cr.consumption_amount, cr.status, cr.created_at
        FROM consumption_records cr
        WHERE cr.store_id NOT IN (SELECT store_id FROM stores)
          AND cr.store_id IS NOT NULL
      `,
        { transaction }
      )

      if (orphanConsumption.length > 0) {
        console.log(`   发现 ${orphanConsumption.length} 条孤儿记录:`)
        orphanConsumption.forEach(r => {
          console.log(
            `   - record_id=${r.record_id}, store_id=${r.store_id}, user_id=${r.user_id}, amount=${r.consumption_amount}, status=${r.status}`
          )
        })

        // 硬删除孤儿记录（孤儿数据的父记录已不存在，恢复也无法使用）
        const orphanIds = orphanConsumption.map(r => r.record_id)
        await queryInterface.sequelize.query(
          `DELETE FROM consumption_records WHERE record_id IN (${orphanIds.join(',')})`,
          { transaction }
        )

        console.log(`   ✅ 已硬删除 ${orphanConsumption.length} 条 consumption_records 孤儿记录`)
      } else {
        console.log('   ✅ 无 consumption_records 孤儿数据需要清理')
      }

      // ==================================================
      // 2. 清理 item_instance_events 表的孤儿数据
      // ==================================================
      console.log('\n🔍 检查 item_instance_events 孤儿数据...')

      const [orphanEvents] = await queryInterface.sequelize.query(
        `
        SELECT ie.event_id, ie.item_instance_id, ie.event_type
        FROM item_instance_events ie
        WHERE ie.item_instance_id NOT IN (SELECT item_instance_id FROM item_instances)
          AND ie.item_instance_id IS NOT NULL
      `,
        { transaction }
      )

      if (orphanEvents.length > 0) {
        console.log(`   发现 ${orphanEvents.length} 条孤儿事件记录:`)
        // 只显示前5条
        orphanEvents.slice(0, 5).forEach(r => {
          console.log(`   - event_id=${r.event_id}, item_instance_id=${r.item_instance_id}, type=${r.event_type}`)
        })
        if (orphanEvents.length > 5) {
          console.log(`   ... 还有 ${orphanEvents.length - 5} 条`)
        }

        // 硬删除孤儿事件记录
        const orphanEventIds = orphanEvents.map(r => r.event_id)
        await queryInterface.sequelize.query(
          `DELETE FROM item_instance_events WHERE event_id IN (${orphanEventIds.join(',')})`,
          { transaction }
        )

        console.log(`   ✅ 已硬删除 ${orphanEvents.length} 条 item_instance_events 孤儿记录`)
      } else {
        console.log('   ✅ 无 item_instance_events 孤儿数据需要清理')
      }

      // ==================================================
      // 3. 验证清理结果
      // ==================================================
      console.log('\n🔍 验证清理结果...')

      const [remainingConsumption] = await queryInterface.sequelize.query(
        `
        SELECT COUNT(*) as count FROM consumption_records cr
        WHERE cr.store_id NOT IN (SELECT store_id FROM stores)
          AND cr.store_id IS NOT NULL
      `,
        { transaction }
      )

      const [remainingEvents] = await queryInterface.sequelize.query(
        `
        SELECT COUNT(*) as count FROM item_instance_events ie
        WHERE ie.item_instance_id NOT IN (SELECT item_instance_id FROM item_instances)
          AND ie.item_instance_id IS NOT NULL
      `,
        { transaction }
      )

      if (remainingConsumption[0].count > 0 || remainingEvents[0].count > 0) {
        throw new Error(
          `清理未完成: consumption_records剩余${remainingConsumption[0].count}条, item_instance_events剩余${remainingEvents[0].count}条`
        )
      }

      console.log('✅ 孤儿数据硬删除完成，数据库引用完整性已修复')

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    /*
     * 回滚说明：
     * 此迁移采用硬删除策略，已删除的孤儿数据无法恢复。
     *
     * 硬删除原因：
     * - 孤儿数据的父记录已不存在，即使恢复也无法正常使用
     * - 避免软删除带来的隐患（误恢复、查询遗漏等）
     *
     * 已删除数据：
     * - consumption_records: 引用不存在的 store_id 的记录
     * - item_instance_events: 引用不存在的 item_instance_id 的记录
     *
     * 如需恢复，请使用数据库备份。
     */
    console.warn('⚠️ 此迁移采用硬删除策略，已删除的孤儿数据无法通过回滚恢复')
    console.warn('⚠️ 如需恢复数据，请使用数据库备份')
  }
}
