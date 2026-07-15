'use strict'

/**
 * 兑换商品增列：fulfillment_type（履约类型枚举）——实物兑换发货链路 P1（拍板②）
 *
 * 创建时间: 2026-06-14（docs/实物兑换发货链路-审查与方案.md 拍板②已采纳）
 * 创建原因:
 * - 实测：exchange_items 无显式履约类型列；下单分流（services/exchange/CoreService.js）
 *   只靠「关联模板 item_templates.item_type==='prop'」推断是否虚拟，
 *   而真实库 64 个兑换商品中 59 个未关联模板 → 92% 推断落空，全部按实物 pending 走，
 *   且 voucher/virtual 模板类型根本未参与下单分流，存在「虚拟漏判卡单 / 实物误判直接 completed 不发货」资损风险。
 * - 按「业务规则后端权威、显式枚举、消灭推断、单一真相源」原则，新增商品级显式履约类型：
 *   exchange_items.fulfillment_type ENUM('physical','virtual','voucher') NOT NULL DEFAULT 'physical'。
 *   physical=实物邮寄(需收货地址+走发货链)；virtual=虚拟即时(建单即完成)；voucher=卡券核销。
 *
 * 存量数据回填策略（基于关联模板 item_templates.item_type 的真实语义，仅作一次性初始化）：
 * - 关联模板 item_type='prop' 或 'virtual' → fulfillment_type='virtual'
 * - 关联模板 item_type='voucher'           → fulfillment_type='voucher'
 * - 其余（含未关联模板 item_type='product' 或无模板）→ 保持默认 'physical'
 * - 回填后由运营在后台逐项核对（无模板商品默认实物，运营按真实形态调整）。
 *
 * 回滚(down): 删除该列及其 ENUM 类型。
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. 新增列（显式全字段定义 + 默认值 physical，存量行先全部落为默认）
    await queryInterface.addColumn('exchange_items', 'fulfillment_type', {
      type: Sequelize.ENUM('physical', 'virtual', 'voucher'),
      allowNull: false,
      defaultValue: 'physical',
      comment:
        '履约类型：physical=实物邮寄(需收货地址+走发货链)/virtual=虚拟即时(建单即完成)/voucher=卡券核销。下单据此判定履约链，替代靠模板 item_type 推断'
    })

    // 2. 存量回填：依据关联模板 item_templates.item_type 的真实语义初始化
    //    prop / virtual → virtual；voucher → voucher；其余保持默认 physical
    await queryInterface.sequelize.query(`
      UPDATE exchange_items ei
      JOIN item_templates it ON ei.item_template_id = it.item_template_id
      SET ei.fulfillment_type = CASE
        WHEN it.item_type IN ('prop', 'virtual') THEN 'virtual'
        WHEN it.item_type = 'voucher' THEN 'voucher'
        ELSE 'physical'
      END
      WHERE ei.item_template_id IS NOT NULL
    `)
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('exchange_items', 'fulfillment_type')
    // MySQL 下 ENUM 随列删除而移除；显式声明保持回滚完整性
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_exchange_items_fulfillment_type"')
    }
  }
}
