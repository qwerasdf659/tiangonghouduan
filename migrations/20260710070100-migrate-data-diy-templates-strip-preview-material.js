'use strict'

/**
 * 数据迁移: 清洗 diy_templates.layout 中的 _previewMaterial 脏数据（DIY 拍板决议 11.6-2 配套清洗）
 *
 * 创建时间: 2026-07-10（北京时间）
 * 背景（docs/自由定制饰品diy-lite与S1-S5商品体系-对接方案与拍板决议.md 第 11.6-2 节）:
 * - web 管理后台槽位编辑器（diy-slot-editor）的珠子预览功能，曾把 _previewMaterial
 *  （含素材价格、图片 URL 等编辑器内部预览态）写进 layout.slot_definitions 并随保存入库，
 *   经公开模板接口整条下发（实测 #65「项链12」已中招）。
 * - 编辑器代码侧的修复（saveSlots 剥离 _previewMaterial）与本迁移同批执行；
 *   本迁移负责把已入库的存量脏数据一次性洗净。
 *
 * 清洗逻辑: 遍历所有 layout 含 "_previewMaterial" 的模板，
 *           剥离 slot_definitions[*]._previewMaterial 后写回。
 *
 * 回滚: 脏数据本就不该存在，无需也无法恢复（down 为空操作）。
 */

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      const [rows] = await sequelize.query(
        "SELECT diy_template_id, layout FROM diy_templates WHERE layout LIKE '%_previewMaterial%'",
        { transaction }
      )

      if (rows.length === 0) {
        console.log('✅ 无 _previewMaterial 脏数据，跳过清洗')
        await transaction.commit()
        return
      }

      for (const row of rows) {
        const layout = typeof row.layout === 'string' ? JSON.parse(row.layout) : row.layout
        if (Array.isArray(layout.slot_definitions)) {
          layout.slot_definitions = layout.slot_definitions.map(slot => {
            const { _previewMaterial, ...clean } = slot
            void _previewMaterial
            return clean
          })
        }
        // eslint-disable-next-line no-await-in-loop
        await sequelize.query('UPDATE diy_templates SET layout = ? WHERE diy_template_id = ?', {
          replacements: [JSON.stringify(layout), row.diy_template_id],
          transaction
        })
        console.log(`✅ 模板 #${row.diy_template_id} layout 已剥离 _previewMaterial`)
      }

      // 回读验证：确认全库无残留
      const [remaining] = await sequelize.query(
        "SELECT COUNT(*) AS c FROM diy_templates WHERE layout LIKE '%_previewMaterial%'",
        { transaction }
      )
      if (Number(remaining[0].c) !== 0) {
        throw new Error(`清洗不完整，仍有 ${remaining[0].c} 个模板残留 _previewMaterial`)
      }
      console.log(`✅ 清洗完成，共处理 ${rows.length} 个模板，全库无残留`)

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down() {
    // 脏数据清洗不可逆也无需恢复（编辑器预览态本就不该入库）
    console.log('⏪ _previewMaterial 清洗为单向数据修复，无回滚动作')
  }
}
