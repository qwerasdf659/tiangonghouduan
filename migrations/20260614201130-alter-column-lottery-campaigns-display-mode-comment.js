'use strict'

/**
 * 修正列注释: lottery_campaigns.display_mode （14种玩法 → 16种玩法，补 grid_4x3）
 *
 * 创建时间: 2026-06-14（北京时间）
 * 创建原因:
 * - 实测真实库 lottery_campaigns.display_mode 列注释为「前端展示方式（14种玩法）」，
 *   且枚举清单漏列了 grid_4x3，与实际不符。
 * - web 管理端 displayModeOptions 实际提供 16 种玩法，运营可选 16 种；
 *   后端模型 models/LotteryCampaign.js 已同步更新为「16种玩法」并补齐 grid_4x3。
 * - 三处曾不一致（模型注释/DB 列注释/web 枚举），本迁移把 DB 列注释对齐为权威的 16 种，
 *   消除「代码即文档」下的元数据漂移（注释技术债）。
 * - 仅修改列 COMMENT 元数据，不改列类型/默认值/约束，不涉及任何数据变更，零业务风险。
 *
 * 列定义保持不变: varchar(30) NOT NULL DEFAULT 'grid_3x3'
 *
 * 回滚: 注释改回历史的「14种玩法」文案（仅为可逆性，不建议长期保留过期注释）
 */

const COMMENT_16 =
  '前端展示方式（16种玩法）: grid_3x3/grid_4x3/grid_4x4/wheel/card_flip/golden_egg/scratch_card/blind_box/gashapon/lucky_bag/red_packet/slot_machine/whack_mole/pinball/card_collect/flash_sale'

const COMMENT_14_LEGACY =
  '前端展示方式（14种玩法）: grid_3x3/grid_4x4/wheel/card_flip/golden_egg/scratch_card/blind_box/gashapon/lucky_bag/red_packet/slot_machine/whack_mole/pinball/card_collect/flash_sale'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('lottery_campaigns', 'display_mode', {
      type: Sequelize.STRING(30),
      allowNull: false,
      defaultValue: 'grid_3x3',
      comment: COMMENT_16
    })
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('lottery_campaigns', 'display_mode', {
      type: Sequelize.STRING(30),
      allowNull: false,
      defaultValue: 'grid_3x3',
      comment: COMMENT_14_LEGACY
    })
  }
}
