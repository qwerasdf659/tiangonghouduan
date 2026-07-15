'use strict'

/**
 * 为 diy_materials.image_media_id 补齐 RESTRICT 外键约束（治本 A 补漏 - 2026-06-24）
 *
 * 创建时间: 2026-06-24（文档《商品图片删除不一致与媒体级联删除设计》§13-A 复核补漏）
 * 创建原因:
 * - 上一支迁移 20260624080000 统一了 9 处「实体引用图」外键为 RESTRICT，
 *   但连真实库 information_schema 复核发现：引用 media_files.media_id 的列实为 10 处 / 8 表，
 *   遗漏了 diy_materials.image_media_id（DIY 珠子/宝石素材图，模型 DiyMaterial 已有 belongsTo 关联，
 *   且真实库该列有数据）。该列此前【完全没有数据库层外键约束】，是白名单漏列误删的残留高危点。
 * - 治本：为 diy_materials.image_media_id 补加 ON DELETE RESTRICT 外键，与其余 9 处规则统一，
 *   使「实体引用图」全部 10 处由 DB 强约束兜底（应用层 MediaService.getReferences 已同步纳入第 10 处）。
 *
 * 前置数据修复（必须，否则 addConstraint 因悬空引用失败）:
 * - 连真实库实测：diy_materials 有 2 行 image_media_id 指向【已不存在】的 media_files 记录
 *   （diy_material_id=17→media 84、diy_material_id=27→media 43，均 NoSuchKey/无 DB 记录）。
 * - diy_materials 属独立配置数据（非「材料资产/物品三表」互锁表），素材本身有效、仅图片指针悬空。
 *   按「存量受损由运营重传」原则，本迁移先把悬空指针置 NULL（保留素材本体），再加外键。
 *   运营后续可在后台为这些素材重新上传图片。
 *
 * 影响数据: 仅 diy_materials 中指向不存在 media 的 image_media_id 被置 NULL（实测 2 行）。
 * 回滚: 删除该外键约束（不恢复被置 NULL 的悬空指针——那本就是脏数据）。
 *
 * @note 真相库 = .env 的 restaurant_points_dev；本项目无 mysql 客户端，迁移经 Sequelize 执行。
 */

const TABLE = 'diy_materials'
const COLUMN = 'image_media_id'
const CONSTRAINT = 'diy_materials_image_media_id_foreign_idx'

module.exports = {
  /**
   * 先清理悬空 image_media_id，再为其补加 ON DELETE RESTRICT 外键
   * @param {import('sequelize').QueryInterface} queryInterface - 查询接口
   * @param {import('sequelize').Sequelize} _Sequelize - Sequelize 构造器（本迁移未直接使用）
   * @returns {Promise<void>}
   */
  async up(queryInterface, _Sequelize) {
    const t = await queryInterface.sequelize.transaction()
    try {
      // 1. 前置修复：把指向不存在 media_files 记录的悬空 image_media_id 置 NULL
      //    （否则 RESTRICT 外键会因「子表存在父表没有的值」而创建失败）
      await queryInterface.sequelize.query(
        `UPDATE ${TABLE} dm
         LEFT JOIN media_files mf ON dm.${COLUMN} = mf.media_id
         SET dm.${COLUMN} = NULL
         WHERE dm.${COLUMN} IS NOT NULL AND mf.media_id IS NULL`,
        { transaction: t }
      )

      // 2. 补加 ON DELETE RESTRICT 外键（与其余 9 处「实体引用图」列规则统一）
      await queryInterface.addConstraint(TABLE, {
        fields: [COLUMN],
        type: 'foreign key',
        name: CONSTRAINT,
        references: { table: 'media_files', field: 'media_id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction: t
      })

      await t.commit()
    } catch (err) {
      await t.rollback()
      throw err
    }
  },

  /**
   * 回滚：删除该外键约束（被置 NULL 的悬空脏数据不恢复）
   * @param {import('sequelize').QueryInterface} queryInterface - 查询接口
   * @param {import('sequelize').Sequelize} _Sequelize - Sequelize 构造器（本迁移未直接使用）
   * @returns {Promise<void>}
   */
  async down(queryInterface, _Sequelize) {
    await queryInterface.removeConstraint(TABLE, CONSTRAINT)
  }
}
