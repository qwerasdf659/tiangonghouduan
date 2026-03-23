'use strict'

/**
 * 修复 POINTS 资产类型配置
 *
 * 问题：
 *   material_asset_types 表中 POINTS 记录 is_enabled=0（被禁用），
 *   导致 GET /api/v4/assets/balance?asset_code=POINTS 返回 400 "无效的资产类型"。
 *   同时 form='crystal' 语义不正确，POINTS 是货币类资产应为 'currency'。
 *
 * 修复：
 *   1. is_enabled: 0 → 1（启用 POINTS，允许前端查询余额）
 *   2. form: 'crystal' → 'currency'（修正资产形态语义）
 *
 * 影响范围：
 *   - GET /api/v4/assets/balance?asset_code=POINTS 恢复正常
 *   - GET /api/v4/assets/balances 返回结果中包含 POINTS
 *   - GET /api/v4/assets/today-summary?asset_code=POINTS 恢复正常
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    /* 修复前先验证当前状态，确保操作安全 */
    const [rows] = await queryInterface.sequelize.query(
      "SELECT asset_code, is_enabled, form FROM material_asset_types WHERE asset_code = 'POINTS'"
    )

    if (rows.length === 0) {
      console.log('⚠️ POINTS 记录不存在，跳过迁移')
      return
    }

    const current = rows[0]
    console.log(`当前状态: is_enabled=${current.is_enabled}, form=${current.form}`)

    /* 启用 POINTS 并修正 form 为 currency */
    await queryInterface.sequelize.query(
      "UPDATE material_asset_types SET is_enabled = 1, form = 'currency' WHERE asset_code = 'POINTS'"
    )

    /* 验证修复结果 */
    const [verify] = await queryInterface.sequelize.query(
      "SELECT asset_code, is_enabled, form FROM material_asset_types WHERE asset_code = 'POINTS'"
    )
    console.log(`修复后状态: is_enabled=${verify[0].is_enabled}, form=${verify[0].form}`)
  },

  async down(queryInterface, Sequelize) {
    /* 回滚：恢复 POINTS 到迁移前的状态 */
    await queryInterface.sequelize.query(
      "UPDATE material_asset_types SET is_enabled = 0, form = 'crystal' WHERE asset_code = 'POINTS'"
    )
  }
}
