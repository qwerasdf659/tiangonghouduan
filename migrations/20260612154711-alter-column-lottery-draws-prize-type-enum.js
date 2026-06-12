'use strict'

/**
 * 统一 lottery_draws.prize_type 词表为 material 体系（议题一·P8）
 *
 * 创建时间: 2026-06-12（docs/legal/微信小程序前端项目求证文档.md 议题一·P8 已采纳）
 * 创建原因:
 * - 实测：lottery_draws.prize_type 列为 ENUM('points','coupon','physical','virtual','service','product','special')，
 *   不含 'material'；而 prize_definitions.prize_type 为 ENUM('material','item','coupon','points')。两表词表不一致。
 * - 后果：SettleStage 写入 prize_type='material' 时，MySQL 非严格模式把不在 ENUM 内的值静默存成 ''（空串），
 *   导致 26 条 material 中奖记录 prize_type='' 且静默漏发（议题一根因之一）。
 * - 本迁移把 lottery_draws.prize_type 统一为与 prize_definitions 同词表 ENUM('material','item','coupon','points')，
 *   并把历史存量按"暴力重构、不留双轨"映射：virtual(2160)→material、''(26)→material、points(2756) 保持。
 *
 * ⚠️ ENUM 迁移顺序安全说明：
 * - 不能"先 UPDATE 成 material 再 ALTER"——UPDATE 时旧 ENUM 不含 material，会被 MySQL 再次静默置空。
 * - 也不能"先 ALTER 成新 ENUM 再 UPDATE"——ALTER 时旧值 virtual 不在新 ENUM，存量 virtual 会被置空丢数据。
 * - 正确做法：① 先把列改成 VARCHAR(无 ENUM 约束，保留所有现有值含空串)；
 *            ② UPDATE 存量（virtual→material、''→material）；
 *            ③ 再 ALTER 成最终 ENUM。全程零数据丢失。
 *
 * 回滚(down): 反向把 material→virtual、ENUM 恢复为原 7 值（仅为可逆性；不建议长期保留旧词表）。
 */

const FINAL_ENUM = ['material', 'item', 'coupon', 'points']
const OLD_ENUM = ['points', 'coupon', 'physical', 'virtual', 'service', 'product', 'special']

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize

    // ① 先降级为 VARCHAR，解除 ENUM 约束（保留 points/virtual/'' 等所有现值，避免 ALTER 直接置空）
    await queryInterface.changeColumn('lottery_draws', 'prize_type', {
      type: Sequelize.STRING(20),
      allowNull: true,
      comment: '奖品类型（迁移中间态：VARCHAR）'
    })

    // ② 存量映射（暴力重构、不留双轨）：virtual→material、空串→material；points 保持不变
    await sequelize.query(
      "UPDATE lottery_draws SET prize_type = 'material' WHERE prize_type = 'virtual' OR prize_type = '' OR prize_type IS NULL"
    )

    // ③ 收紧为最终 ENUM（与 prize_definitions.prize_type 同词表）
    await queryInterface.changeColumn('lottery_draws', 'prize_type', {
      type: Sequelize.ENUM(...FINAL_ENUM),
      allowNull: true,
      comment: '奖品类型（统一词表，与 prize_definitions 一致：material/item/coupon/points）'
    })
  },

  async down(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize

    // ① 先降级为 VARCHAR
    await queryInterface.changeColumn('lottery_draws', 'prize_type', {
      type: Sequelize.STRING(20),
      allowNull: true,
      comment: '奖品类型（回滚中间态：VARCHAR）'
    })

    // ② material→virtual（回到旧词表的对应值；item 在旧词表无对应，回退为 virtual 以保证可入旧 ENUM）
    await sequelize.query(
      "UPDATE lottery_draws SET prize_type = 'virtual' WHERE prize_type = 'material' OR prize_type = 'item'"
    )

    // ③ 恢复为原 7 值 ENUM
    await queryInterface.changeColumn('lottery_draws', 'prize_type', {
      type: Sequelize.ENUM(...OLD_ENUM),
      allowNull: true,
      comment: '奖品类型'
    })
  }
}
