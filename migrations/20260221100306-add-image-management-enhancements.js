'use strict'

/**
 * 图片管理体系增强迁移
 *
 * 业务背景：
 * - 图片管理体系设计方案（2026-02-21 拍板）的数据库层变更
 * - 支持多图排序、物品模板统一图片管理、上线前数据清洗
 *
 * 变更内容：
 * 1. image_resources 新增 sort_order 字段（多图排序支持）
 * 2. item_templates 新增 image_resource_id 外键（统一图片管理）
 * 3. 清理 category_defs 脏数据（chen112/auto/beauty）
 * 4. 清理 item_templates 垃圾数据（id=18,19,20）
 * 5. 清理 exchange_items + exchange_records 全量测试数据
 *
 * @version 4.7.0
 * @date 2026-02-21
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ─── 1. image_resources 新增 sort_order 字段 ───
      const [imgCols] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM image_resources LIKE 'sort_order'",
        { transaction }
      )
      if (imgCols.length === 0) {
        await queryInterface.addColumn(
          'image_resources',
          'sort_order',
          {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '排序序号（同一 context_id 内排序，数字越小越靠前）'
          },
          { transaction }
        )
        console.log('  ✅ image_resources.sort_order 字段已添加')
      } else {
        console.log('  ⏭️ image_resources.sort_order 已存在，跳过')
      }

      // ─── 2. item_templates 新增 image_resource_id 外键 ───
      const [tplCols] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM item_templates LIKE 'image_resource_id'",
        { transaction }
      )
      if (tplCols.length === 0) {
        await queryInterface.addColumn(
          'item_templates',
          'image_resource_id',
          {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: null,
            comment: '主图片ID（外键 → image_resources.image_resource_id，替代遗留 image_url 字段）',
            references: {
              model: 'image_resources',
              key: 'image_resource_id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          { transaction }
        )
        console.log('  ✅ item_templates.image_resource_id 外键已添加')
      } else {
        console.log('  ⏭️ item_templates.image_resource_id 已存在，跳过')
      }

      // ─── 3. 清理 category_defs 脏数据 ───
      const [deletedCats] = await queryInterface.sequelize.query(
        "DELETE FROM category_defs WHERE category_code IN ('chen112', 'auto', 'beauty')",
        { transaction }
      )
      console.log(`  ✅ category_defs 脏数据已清理（删除 ${deletedCats.affectedRows || 0} 条：chen112/auto/beauty）`)

      // ─── 4. 清理 item_templates 垃圾数据 ───
      // 先检查 item_instances 中是否有引用
      const [tplRefs] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as cnt FROM item_instances WHERE item_template_id IN (18, 19, 20)',
        { transaction }
      )
      const tplRefCount = parseInt(tplRefs[0].cnt)
      if (tplRefCount === 0) {
        const [deletedTpls] = await queryInterface.sequelize.query(
          'DELETE FROM item_templates WHERE item_template_id IN (18, 19, 20)',
          { transaction }
        )
        console.log(`  ✅ item_templates 垃圾数据已清理（删除 ${deletedTpls.affectedRows || 0} 条：id=18/19/20）`)
      } else {
        console.log(`  ⚠️ item_templates id=18/19/20 有 ${tplRefCount} 条 item_instances 引用，跳过删除`)
      }

      // ─── 5. 清理 exchange_items + exchange_records 全量测试数据 ───
      // 先删除 exchange_records（子表），再删除 exchange_items（父表）
      const [deletedRecords] = await queryInterface.sequelize.query(
        'DELETE FROM exchange_records',
        { transaction }
      )
      console.log(`  ✅ exchange_records 测试数据已清理（删除 ${deletedRecords.affectedRows || 0} 条）`)

      const [deletedItems] = await queryInterface.sequelize.query(
        'DELETE FROM exchange_items',
        { transaction }
      )
      console.log(`  ✅ exchange_items 测试数据已清理（删除 ${deletedItems.affectedRows || 0} 条）`)

      // 重置自增 ID（清空后重新从 1 开始）
      await queryInterface.sequelize.query(
        'ALTER TABLE exchange_items AUTO_INCREMENT = 1',
        { transaction }
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE exchange_records AUTO_INCREMENT = 1',
        { transaction }
      )
      console.log('  ✅ exchange_items/exchange_records 自增ID已重置')

      // ─── 6. 清理 item_templates 遗留测试数据字段 ───
      // 清空 image_url = 'test/image.png' 的无效值
      await queryInterface.sequelize.query(
        "UPDATE item_templates SET image_url = NULL WHERE image_url = 'test/image.png'",
        { transaction }
      )
      console.log('  ✅ item_templates.image_url 无效测试值已清理')

      await transaction.commit()
      console.log('\n🎉 图片管理体系增强迁移完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 回滚：移除 image_resources.sort_order
      const [imgCols] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM image_resources LIKE 'sort_order'",
        { transaction }
      )
      if (imgCols.length > 0) {
        await queryInterface.removeColumn('image_resources', 'sort_order', { transaction })
        console.log('  ✅ image_resources.sort_order 已移除')
      }

      // 回滚：移除 item_templates.image_resource_id
      const [tplCols] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM item_templates LIKE 'image_resource_id'",
        { transaction }
      )
      if (tplCols.length > 0) {
        await queryInterface.removeColumn('item_templates', 'image_resource_id', { transaction })
        console.log('  ✅ item_templates.image_resource_id 已移除')
      }

      // 注意：数据清理不可逆（脏数据/测试数据删除后无法自动恢复）
      console.log('  ⚠️ 数据清理操作不可逆（category_defs/item_templates/exchange_items 的删除数据需手动恢复）')

      await transaction.commit()
      console.log('\n🔄 迁移回滚完成（结构变更已撤销，数据清理不可逆）')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
