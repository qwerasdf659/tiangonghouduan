'use strict'

/**
 * 迁移：重新启用 POINTS 资产类型
 *
 * 修复原因：
 *   迁移 20260314204916-disable-points-asset-type.js 错误地禁用了 POINTS，
 *   导致前端调用 GET /api/v4/assets/balance?asset_code=POINTS 返回 400。
 *
 * 业务事实：
 *   POINTS（积分）是用户核心资产类型，微信小程序前端依赖此接口显示积分余额。
 *   form='currency' 表示货币形态，符合积分的业务语义。
 *
 * 变更内容：
 *   1. 将 POINTS 的 is_enabled 恢复为 1（启用）
 *   2. 确保 form='currency'（货币形态，非 quota/shard/crystal）
 *   3. 恢复 display_name 为 '积分'（简洁准确的业务名称）
 */
module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      "SELECT asset_code, is_enabled, form, display_name FROM material_asset_types WHERE asset_code = 'POINTS'"
    )

    if (rows.length === 0) {
      console.log('⚠️ POINTS 记录不存在，跳过迁移')
      return
    }

    const current = rows[0]
    console.log(`修复前状态: is_enabled=${current.is_enabled}, form=${current.form}, display_name=${current.display_name}`)

    await queryInterface.sequelize.query(
      "UPDATE material_asset_types SET is_enabled = 1, form = 'currency', display_name = '积分' WHERE asset_code = 'POINTS'"
    )

    const [verify] = await queryInterface.sequelize.query(
      "SELECT asset_code, is_enabled, form, display_name FROM material_asset_types WHERE asset_code = 'POINTS'"
    )
    console.log(`修复后状态: is_enabled=${verify[0].is_enabled}, form=${verify[0].form}, display_name=${verify[0].display_name}`)
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "UPDATE material_asset_types SET is_enabled = 0 WHERE asset_code = 'POINTS'"
    )
  }
}
