'use strict'

/**
 * DIY 引擎重构 Phase 3：数据治理 + 强制整数定价策略
 *
 * 变更清单：
 * 1. yellow_topaz_8mm 价格从 6.50 改为整数 7（文档决策 A）
 * 2. diy_materials.price_asset_code DROP DEFAULT（新增时必须显式指定）
 * 3. 清理 frozen 测试作品 id=33,34（通过 cancelDesign 业务逻辑释放冻结资产）
 *    — 注意：frozen 资产释放必须通过业务接口，不能直接改数据库
 *    — 本迁移仅处理 DDL 变更，frozen 数据清理由单独脚本完成
 */
module.exports = {
  async up(queryInterface) {
    // ========== 1. yellow_topaz_8mm 价格改为整数 7 ==========
    await queryInterface.sequelize.query(
      "UPDATE diy_materials SET price = 7 WHERE material_code = 'yellow_topaz_8mm' AND price = 6.50"
    )

    // ========== 2. price_asset_code DROP DEFAULT ==========
    // 移除默认值，新增材料时必须显式指定 price_asset_code
    await queryInterface.sequelize.query(
      "ALTER TABLE diy_materials ALTER COLUMN price_asset_code DROP DEFAULT"
    )
  },

  async down(queryInterface) {
    // 回滚 1：恢复 yellow_topaz_8mm 价格为 6.50
    await queryInterface.sequelize.query(
      "UPDATE diy_materials SET price = 6.50 WHERE material_code = 'yellow_topaz_8mm' AND price = 7"
    )

    // 回滚 2：恢复 price_asset_code 默认值
    await queryInterface.sequelize.query(
      "ALTER TABLE diy_materials ALTER COLUMN price_asset_code SET DEFAULT 'star_stone'"
    )
  }
}
