'use strict'

/**
 * 合并双状态字段: 删除 consumption_records.final_status（技术债务方案 五.6，2026-07-11 定案）
 *
 * 背景:
 * - status（pending/approved/rejected/expired）与 final_status（pending_review/approved/rejected）双字段并存，
 *   直连库核对 15 条存量仅两种组合：approved/approved 14 条、pending/pending_review 1 条——
 *   status 即唯一真相，final_status 无独立信息量；
 * - 定案：保留 status 单字段作为消费小票状态机，final_status 字段删除；
 *   final_status 的 pending_review 语义 = status 的 pending，approved/rejected 完全同名，无需数据映射；
 * - 展示层同步：system_dictionaries 的 consumption_final_status 字典（3 条）一并删除，
 *   显示名统一走 consumption_status 字典（pending/approved/rejected/expired 已齐备）。
 *
 * 变更内容:
 * 1. 删除索引 idx_consumption_final_status
 * 2. 删除 consumption_records.final_status 列（存量数据无信息损失，status 已承载全部状态）
 * 3. 删除 system_dictionaries 中 dict_type='consumption_final_status' 的 3 条字典
 *
 * 回滚: 重建列（按 status 反向回填：pending→pending_review，其余同名）与字典。
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDefinition = await queryInterface.describeTable('consumption_records')
    if (tableDefinition.final_status) {
      const [indexes] = await queryInterface.sequelize.query(
        'SHOW INDEX FROM consumption_records'
      )
      if (indexes.some(i => i.Key_name === 'idx_consumption_final_status')) {
        await queryInterface.removeIndex('consumption_records', 'idx_consumption_final_status')
        console.log('✅ 索引 idx_consumption_final_status 已删除')
      }
      await queryInterface.removeColumn('consumption_records', 'final_status')
      console.log('✅ consumption_records.final_status 双状态列已删除（status 为唯一状态机）')
    } else {
      console.log('⏭️ consumption_records.final_status 列不存在，跳过')
    }

    const [deleted] = await queryInterface.sequelize.query(
      "DELETE FROM system_dictionaries WHERE dict_type = 'consumption_final_status'"
    )
    console.log(`✅ consumption_final_status 字典已删除（${deleted.affectedRows} 条），显示统一走 consumption_status`)
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('consumption_records', 'final_status', {
      type: Sequelize.ENUM('pending_review', 'approved', 'rejected'),
      allowNull: false,
      defaultValue: 'pending_review',
      comment: '业务最终状态（已废弃：与 status 合并）'
    })
    // 按 status 反向回填（pending→pending_review，approved/rejected 同名，expired 无对应留默认）
    await queryInterface.sequelize.query(`
      UPDATE consumption_records
      SET final_status = CASE status
        WHEN 'approved' THEN 'approved'
        WHEN 'rejected' THEN 'rejected'
        ELSE 'pending_review'
      END
    `)
    await queryInterface.addIndex('consumption_records', ['final_status'], {
      name: 'idx_consumption_final_status'
    })
    await queryInterface.sequelize.query(`
      INSERT INTO system_dictionaries (dict_type, dict_code, dict_name, dict_color, sort_order, is_enabled, version, created_at, updated_at) VALUES
      ('consumption_final_status', 'pending_review', '待复核', 'bg-warning', 1, 1, 1, NOW(), NOW()),
      ('consumption_final_status', 'approved', '已通过', 'bg-success', 2, 1, 1, NOW(), NOW()),
      ('consumption_final_status', 'rejected', '已拒绝', 'bg-danger', 3, 1, 1, NOW(), NOW())
    `)
    console.log('⏪ consumption_records.final_status 列与字典已重建')
  }
}
