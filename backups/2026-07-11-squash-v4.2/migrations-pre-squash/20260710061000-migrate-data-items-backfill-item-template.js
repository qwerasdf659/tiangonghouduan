'use strict'

/**
 * 数据修复: 存量 items 按名称补挂 item_template_id（拍板⑤一次性全修复）
 *
 * 创建时间: 2026-07-10（北京时间）
 * 背景（以物易物与会员成长等级功能启用方案 §1.3-1）:
 * - 历史抽奖发奖链路（SettleStage.mintItem）漏写 item_template_id，
 *   导致存量 12 件物品模板为 NULL，无法匹配任何以物易物配方（硬阻断）。
 * - 发放链路已同步修复（SettleStage 补传 prize.item_template_id），本迁移只回填存量。
 *
 * 回填规则（按物品名称精确匹配 item_templates.display_name）:
 * - 「测试优惠券2」 → template_code='legacy_voucher_test_2'
 * - 「测试优惠券3」 → template_code='legacy_voucher_test_3'
 * - 仅回填 item_template_id IS NULL 的行，不改动持有者/状态/账本（不触碰物品三表互锁）。
 *
 * 回滚: 将本次回填的行 item_template_id 置回 NULL（按名称+模板码定位）。
 */

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      const [result] = await sequelize.query(
        `UPDATE items i
         JOIN item_templates t ON t.display_name = i.item_name
         SET i.item_template_id = t.item_template_id
         WHERE i.item_template_id IS NULL`,
        { transaction }
      )
      console.log(`✅ 存量物品模板回填完成，影响行数: ${result.affectedRows}`)

      // 回读验证：不允许仍存在无模板物品
      const [[{ null_count }]] = await sequelize.query(
        'SELECT COUNT(*) AS null_count FROM items WHERE item_template_id IS NULL',
        { transaction }
      )
      if (Number(null_count) > 0) {
        throw new Error(
          `仍有 ${null_count} 件物品未匹配到模板（item_templates.display_name 与 items.item_name 不一致），请人工核对后重试`
        )
      }

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize
    // 回滚：按名称匹配置回 NULL（仅还原本迁移的回填范围）
    await sequelize.query(
      `UPDATE items i
       JOIN item_templates t ON t.item_template_id = i.item_template_id AND t.display_name = i.item_name
       SET i.item_template_id = NULL`
    )
    console.log('⏪ 存量物品模板回填已回滚')
  }
}
