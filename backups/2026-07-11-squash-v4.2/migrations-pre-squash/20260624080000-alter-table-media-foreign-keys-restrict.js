'use strict'

/**
 * 统一 media_files 全部「实体引用图」外键的 ON DELETE 规则为 RESTRICT（治本 A）
 *
 * 创建时间: 2026-06-24（文档《商品图片删除不一致与媒体级联删除设计》§13-A / §14.A 定稿）
 * 创建原因:
 * - 连真实库 information_schema 核实：引用 media_files.media_id 的外键共 9 处 / 7 表，
 *   但 ON DELETE 规则不统一（实测）：
 *     · exchange_items.primary_media_id / exchange_item_skus.image_id = NO ACTION
 *     · ad_creatives / item_templates / prize_definitions.primary_media_id
 *       categories.icon_media_id / diy_templates.{base_image,preview}_media_id
 *       diy_works.preview_media_id = SET NULL
 *     · media_attachments.media_id = CASCADE（保持不变，删图连带删专属挂载）
 * - SET NULL 会让「在用主图」在图被删时悄悄变 NULL（商品/奖品悄悄变无图占位），
 *   是本次「删一张图后引用悬空、一边有图一边没图」事故的制度性根源之一。
 * - 治本方案：把 8 处「实体引用图」外键统一改为 ON DELETE RESTRICT —— 图被任一业务引用时，
 *   数据库层直接拒绝物理删（应用层 MediaService.moveToTrash 已先做 RESTRICT 校验，DB 为最后防线）。
 *   media_attachments 维持 CASCADE（专属挂载随图清，符合「关联全消失」诉求）。
 *
 * 强约束 > ORM 控制：外键约束在数据库层面定义，应用层校验 + DB 约束双保险。
 *
 * 影响数据: 改约束不动数据；实测当前这些列引用的 media 均为在用图，无悬空。
 * 回滚: 恢复各列原 ON DELETE 规则（NO ACTION / SET NULL）。
 *
 * @note 真相库 = .env 的 restaurant_points_dev；本项目无 mysql 客户端，迁移经 Sequelize 执行。
 */

/**
 * 需统一为 RESTRICT 的外键清单（连真实库核实的约束名 + 原规则，用于精确 drop/re-add 与回滚）
 * 每项：{ table, column, constraint, onDeleteOld }
 */
const FOREIGN_KEYS = [
  { table: 'exchange_items', column: 'primary_media_id', constraint: 'exchange_items_ibfk_2', onDeleteOld: 'NO ACTION' },
  { table: 'exchange_item_skus', column: 'image_id', constraint: 'exchange_item_skus_ibfk_2', onDeleteOld: 'NO ACTION' },
  { table: 'ad_creatives', column: 'primary_media_id', constraint: 'ad_creatives_primary_media_id_foreign_idx', onDeleteOld: 'SET NULL' },
  { table: 'item_templates', column: 'primary_media_id', constraint: 'item_templates_primary_media_id_foreign_idx', onDeleteOld: 'SET NULL' },
  { table: 'prize_definitions', column: 'primary_media_id', constraint: 'fk_prize_definitions_media', onDeleteOld: 'SET NULL' },
  { table: 'categories', column: 'icon_media_id', constraint: 'categories_ibfk_2', onDeleteOld: 'SET NULL' },
  { table: 'diy_templates', column: 'base_image_media_id', constraint: 'diy_templates_base_image_media_id_foreign_idx', onDeleteOld: 'SET NULL' },
  { table: 'diy_templates', column: 'preview_media_id', constraint: 'diy_templates_preview_media_id_foreign_idx', onDeleteOld: 'SET NULL' },
  { table: 'diy_works', column: 'preview_media_id', constraint: 'diy_works_preview_media_id_foreign_idx', onDeleteOld: 'SET NULL' }
]

module.exports = {
  /**
   * 把 9 处「实体引用图」外键 ON DELETE 统一改为 RESTRICT
   * @param {import('sequelize').QueryInterface} queryInterface - 查询接口
   * @param {import('sequelize').Sequelize} _Sequelize - Sequelize 构造器（本迁移未直接使用）
   * @returns {Promise<void>}
   */
  async up(queryInterface, _Sequelize) {
    const t = await queryInterface.sequelize.transaction()
    try {
      for (const fk of FOREIGN_KEYS) {
        // 先删旧外键（按真实约束名），再以 RESTRICT 重建
        // eslint-disable-next-line no-await-in-loop
        await queryInterface.removeConstraint(fk.table, fk.constraint, { transaction: t })
        // eslint-disable-next-line no-await-in-loop
        await queryInterface.addConstraint(fk.table, {
          fields: [fk.column],
          type: 'foreign key',
          name: fk.constraint,
          references: { table: 'media_files', field: 'media_id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
          transaction: t
        })
      }
      await t.commit()
    } catch (err) {
      await t.rollback()
      throw err
    }
  },

  /**
   * 回滚：恢复各外键原 ON DELETE 规则（NO ACTION / SET NULL）
   * @param {import('sequelize').QueryInterface} queryInterface - 查询接口
   * @param {import('sequelize').Sequelize} _Sequelize - Sequelize 构造器（本迁移未直接使用）
   * @returns {Promise<void>}
   */
  async down(queryInterface, _Sequelize) {
    const t = await queryInterface.sequelize.transaction()
    try {
      for (const fk of FOREIGN_KEYS) {
        // eslint-disable-next-line no-await-in-loop
        await queryInterface.removeConstraint(fk.table, fk.constraint, { transaction: t })
        // eslint-disable-next-line no-await-in-loop
        await queryInterface.addConstraint(fk.table, {
          fields: [fk.column],
          type: 'foreign key',
          name: fk.constraint,
          references: { table: 'media_files', field: 'media_id' },
          onDelete: fk.onDeleteOld === 'NO ACTION' ? 'NO ACTION' : 'SET NULL',
          onUpdate: 'CASCADE',
          transaction: t
        })
      }
      await t.commit()
    } catch (err) {
      await t.rollback()
      throw err
    }
  }
}
