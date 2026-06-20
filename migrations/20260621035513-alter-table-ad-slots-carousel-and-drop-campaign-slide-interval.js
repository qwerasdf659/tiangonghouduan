'use strict'

/**
 * 修改表: ad_slots 新增轮播配置字段 + ad_campaigns 删除冗余轮播间隔字段
 *
 * 创建时间: 2026-06-21（北京时间）
 * 创建原因（微信小程序顶部 Banner 运营可配化 - 拍板方案乙：轮播节奏归槽位级）:
 * - 顶部 Banner（top_banner）作为 ad 投放系统第 5 种 slot_type 接入，需要"是否轮播"开关。
 * - 轮播节奏（slide_interval_ms）在业务语义上属于"图片位（槽位）"的展示形态属性，
 *   而非"单条投放素材"的属性（大厂通行做法：轮播节奏由位统一控制，避免一个 swiper 内忽快忽慢）。
 * - 原 ad_campaigns.slide_interval_ms 是从历史 CarouselItem 合并而来的字段，归属错误，
 *   本次提升为槽位级 ad_slots.slide_interval_ms，并删除 ad_campaigns 上的冗余字段。
 *
 * 字段变更:
 * - ad_slots.is_carousel       TINYINT(1) NOT NULL DEFAULT 0  是否轮播（0=单张取priority最高1条，1=多张轮播）
 * - ad_slots.slide_interval_ms INT        NOT NULL DEFAULT 3000 轮播间隔毫秒（仅 is_carousel=1 生效，min 500/max 15000 由模型校验）
 * - 删除 ad_campaigns.slide_interval_ms（轮播间隔归属迁移到槽位级，真实库该表 0 行，删除零数据风险）
 *
 * 存量兼容:
 * - 现有 7 个 ad_slots 迁移后 is_carousel=0（单张）/ slide_interval_ms=3000，与现状等价、不影响线上。
 * - ad_campaigns 真实库 0 行，删列不丢任何数据。
 *
 * 索引: 本次仅加列，不新增索引（已确认 ad_slots 现有索引 idx_slot_key/idx_slot_type/
 *       idx_slot_position/idx_slot_active 无需变更，无重复）。
 *
 * 回滚: ad_slots 删除两列；ad_campaigns 恢复 slide_interval_ms 列（DEFAULT 3000）。
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      await queryInterface.addColumn(
        'ad_slots',
        'is_carousel',
        {
          type: Sequelize.TINYINT,
          allowNull: false,
          defaultValue: 0,
          comment: '是否轮播：0=单张(取priority最高1条)，1=多张轮播'
        },
        { transaction }
      )
      await queryInterface.addColumn(
        'ad_slots',
        'slide_interval_ms',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 3000,
          comment: '轮播间隔毫秒（仅 is_carousel=1 生效，运营可配 2000-8000，硬边界 500-15000）'
        },
        { transaction }
      )
      await queryInterface.removeColumn('ad_campaigns', 'slide_interval_ms', { transaction })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      await queryInterface.addColumn(
        'ad_campaigns',
        'slide_interval_ms',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          defaultValue: 3000,
          comment: '轮播间隔毫秒（仅 slot_type=carousel 时使用，原 CarouselItem 属性）'
        },
        { transaction }
      )
      await queryInterface.removeColumn('ad_slots', 'slide_interval_ms', { transaction })
      await queryInterface.removeColumn('ad_slots', 'is_carousel', { transaction })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
