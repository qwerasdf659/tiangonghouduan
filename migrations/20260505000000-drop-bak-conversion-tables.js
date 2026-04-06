'use strict'

/**
 * 定时清理迁移：DROP 资产转换规则统一后的备份表
 *
 * 背景：2026-04-05 执行 asset_conversion_rules 统一迁移时，
 *       将旧表重命名为 _bak_* 保留 30 天作为保险。
 *       本迁移在 2026-05-05 之后执行，正式 DROP 备份表。
 *
 * 涉及表：
 * - _bak_exchange_rates（原 exchange_rates）
 * - _bak_material_conversion_rules（原 material_conversion_rules）
 *
 * 安全说明：
 * - 这两张表是配置表，不在"互锁"体系内（不涉及余额/流水/持有状态）
 * - 数据已完整迁移到 asset_conversion_rules，DROP 不影响业务
 */

module.exports = {
  async up(queryInterface) {
    // 安全检查：确认新表存在且有数据
    const [newRules] = await queryInterface.sequelize.query(
      'SELECT COUNT(*) as cnt FROM asset_conversion_rules'
    )
    if (newRules[0].cnt === 0) {
      throw new Error('安全检查失败：asset_conversion_rules 表为空，拒绝 DROP 备份表')
    }

    // DROP 备份表（IF EXISTS 防止重复执行报错）
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS `_bak_exchange_rates`')
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS `_bak_material_conversion_rules`')
  },

  async down(queryInterface) {
    // 不可逆操作，down 仅记录日志
    console.warn('[WARNING] _bak_exchange_rates 和 _bak_material_conversion_rules 已被 DROP，无法恢复')
  }
}
