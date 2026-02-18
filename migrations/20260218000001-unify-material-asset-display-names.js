'use strict'

/**
 * 数据库迁移：统一材料资产中文显示名称
 *
 * 业务背景：
 * - 材料资产 red_shard 在数据库中存储为「红色碎片」，与业务正确命名「红水晶碎片」不一致
 * - material_conversion_rules 中 title/description 使用了「红晶片」这一非标准名称
 * - system_dictionaries 缺少 material_asset 类型的字典映射，DisplayNameService 无法管理材料名称
 * - 正确命名规范：{颜色}水晶碎片（shard）/ {颜色}水晶（crystal）
 *
 * 变更内容：
 * - material_asset_types 表：red_shard 的 display_name 从「红色碎片」改为「红水晶碎片」
 * - material_conversion_rules 表：title/description 从「红晶片」改为「红水晶碎片」
 * - system_dictionaries 表：新增 material_asset 类型的 red_shard、red_crystal 字典条目
 *
 * 回滚方案：
 * - down() 恢复原始 display_name，删除新增的字典条目
 *
 * @date 2026-02-18
 */
module.exports = {
  async up(queryInterface, _Sequelize) {
    console.log('📦 [迁移] 开始：统一材料资产中文显示名称...')

    // ========== 1. 修改 material_asset_types.display_name ==========
    await queryInterface.sequelize.query(
      `UPDATE material_asset_types
       SET display_name = '红水晶碎片', updated_at = NOW()
       WHERE asset_code = 'red_shard' AND display_name = '红色碎片'`
    )
    console.log('  ✅ material_asset_types: red_shard display_name → 红水晶碎片')

    // ========== 2. 修改 material_conversion_rules.title/description ==========
    await queryInterface.sequelize.query(
      `UPDATE material_conversion_rules
       SET title = '红水晶碎片分解',
           description = '将红水晶碎片分解为钻石，比例 1:20',
           updated_at = NOW()
       WHERE from_asset_code = 'red_shard'
         AND to_asset_code = 'DIAMOND'`
    )
    console.log('  ✅ material_conversion_rules: title/description → 红水晶碎片分解')

    // ========== 3. 新增 system_dictionaries 字典条目 ==========
    // 检查是否已存在（防御性编程）
    const [existing] = await queryInterface.sequelize.query(
      `SELECT dict_code FROM system_dictionaries
       WHERE dict_type = 'material_asset'
         AND dict_code IN ('red_shard', 'red_crystal')`
    )
    const existingCodes = existing.map(r => r.dict_code)

    if (!existingCodes.includes('red_shard')) {
      await queryInterface.sequelize.query(
        `INSERT INTO system_dictionaries
           (dict_type, dict_code, dict_name, dict_color, sort_order, is_enabled, remark, version, created_at, updated_at)
         VALUES
           ('material_asset', 'red_shard', '红水晶碎片', 'bg-danger', 1, 1, '红色系碎片形态材料', 1, NOW(), NOW())`
      )
      console.log('  ✅ system_dictionaries: 新增 material_asset/red_shard → 红水晶碎片')
    }

    if (!existingCodes.includes('red_crystal')) {
      await queryInterface.sequelize.query(
        `INSERT INTO system_dictionaries
           (dict_type, dict_code, dict_name, dict_color, sort_order, is_enabled, remark, version, created_at, updated_at)
         VALUES
           ('material_asset', 'red_crystal', '红水晶', 'bg-danger', 2, 1, '红色系完整形态材料', 1, NOW(), NOW())`
      )
      console.log('  ✅ system_dictionaries: 新增 material_asset/red_crystal → 红水晶')
    }

    console.log('📦 [迁移] 完成：材料资产中文显示名称已统一')
  },

  async down(queryInterface, _Sequelize) {
    console.log('📦 [回滚] 开始：恢复材料资产原始显示名称...')

    // 1. 恢复 material_asset_types
    await queryInterface.sequelize.query(
      `UPDATE material_asset_types
       SET display_name = '红色碎片', updated_at = NOW()
       WHERE asset_code = 'red_shard' AND display_name = '红水晶碎片'`
    )

    // 2. 恢复 material_conversion_rules
    await queryInterface.sequelize.query(
      `UPDATE material_conversion_rules
       SET title = '红晶片分解',
           description = '将红晶片分解为钻石，比例 1:20',
           updated_at = NOW()
       WHERE from_asset_code = 'red_shard'
         AND to_asset_code = 'DIAMOND'`
    )

    // 3. 删除新增的字典条目
    await queryInterface.sequelize.query(
      `DELETE FROM system_dictionaries
       WHERE dict_type = 'material_asset'
         AND dict_code IN ('red_shard', 'red_crystal')`
    )

    console.log('📦 [回滚] 完成：已恢复原始显示名称')
  }
}
