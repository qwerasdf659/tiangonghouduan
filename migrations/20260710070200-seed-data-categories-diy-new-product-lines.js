'use strict'

/**
 * 初始化数据: DIY 新品类分类（DIY 拍板决议 11.5-F / 11.8-④）
 *
 * 创建时间: 2026-07-10（北京时间）
 * 背景（docs/自由定制饰品diy-lite与S1-S5商品体系-对接方案与拍板决议.md 第 11.5-F 节）:
 * - 拍板 ④：耳饰 / 手机链包挂 / 108佛珠 三个分类直接建（淘宝式「后台类目建全、
 *   前台按有货动态显示」模式）。
 * - getUserTemplates 只返回 published 模板，空分类小程序端不显示，提前建零风险。
 * - ⚠️ 分类 ID 由数据库自增分配，以实际落库为准；前端演示用的 195/196/197 不作数。
 *
 * 分类清单（parent_category_id=190 DIY_JEWELRY，沿用现有编码风格）:
 * - DIY_EARRING  耳饰（镶嵌 2 槽位款式）
 * - DIY_CHARM    手机链包挂（镶嵌 3 珠位 / 串珠 line 形状款式）
 * - DIY_MALA     108佛珠（串珠大围长档位款式，54/108 颗颗数制）
 *
 * 回滚: 按 category_code 删除三个分类（仅当分类下无模板/素材引用时安全）。
 */

/** DIY 父分类 ID（DIY_JEWELRY，真实库实测固定值） */
const DIY_PARENT_CATEGORY_ID = 190

/** 三个新品类定义（sort_order 接续现有 1~4） */
const NEW_CATEGORIES = [
  {
    category_code: 'DIY_EARRING',
    category_name: '耳饰',
    description: 'DIY耳饰设计（镶嵌双槽位款式）',
    sort_order: 5
  },
  {
    category_code: 'DIY_CHARM',
    category_name: '手机链包挂',
    description: 'DIY手机链/包挂设计（镶嵌多珠位或串珠line形状款式）',
    sort_order: 6
  },
  {
    category_code: 'DIY_MALA',
    category_name: '108佛珠',
    description: 'DIY 108佛珠/念珠设计（串珠大围长颗数制款式）',
    sort_order: 7
  }
]

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      // 前置校验：父分类必须存在
      const [parent] = await sequelize.query(
        'SELECT category_id FROM categories WHERE category_id = ?',
        { replacements: [DIY_PARENT_CATEGORY_ID], transaction }
      )
      if (parent.length === 0) {
        throw new Error(`DIY 父分类 ${DIY_PARENT_CATEGORY_ID} 不存在，无法创建子分类`)
      }

      for (const cat of NEW_CATEGORIES) {
        // 幂等：按 category_code 检查，已存在则跳过
        // eslint-disable-next-line no-await-in-loop
        const [existing] = await sequelize.query(
          'SELECT category_id FROM categories WHERE category_code = ?',
          { replacements: [cat.category_code], transaction }
        )
        if (existing.length > 0) {
          console.log(`⏭️  分类 ${cat.category_code} 已存在（#${existing[0].category_id}），跳过`)
          continue
        }

        // eslint-disable-next-line no-await-in-loop
        await sequelize.query(
          `INSERT INTO categories
             (parent_category_id, category_name, category_code, level, sort_order, is_enabled, description, created_at, updated_at)
           VALUES (?, ?, ?, 2, ?, 1, ?, NOW(), NOW())`,
          {
            replacements: [
              DIY_PARENT_CATEGORY_ID,
              cat.category_name,
              cat.category_code,
              cat.sort_order,
              cat.description
            ],
            transaction
          }
        )
        console.log(`✅ 分类 ${cat.category_code}（${cat.category_name}）已创建`)
      }

      // 回读验证：三个分类全部就绪，输出实际落库 ID（前端对接以此为准）
      const [rows] = await sequelize.query(
        "SELECT category_id, category_code, category_name FROM categories WHERE category_code IN ('DIY_EARRING','DIY_CHARM','DIY_MALA') ORDER BY sort_order",
        { transaction }
      )
      if (rows.length !== NEW_CATEGORIES.length) {
        throw new Error(`分类创建不完整，期望 ${NEW_CATEGORIES.length} 个，实际 ${rows.length} 个`)
      }
      console.log('✅ DIY 新品类分类实际落库 ID:', JSON.stringify(rows))

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      const codes = NEW_CATEGORIES.map(c => c.category_code)

      // 安全校验：分类下有模板/素材引用时拒绝回滚（RESTRICT 语义）
      const [refs] = await sequelize.query(
        `SELECT c.category_code,
                (SELECT COUNT(*) FROM diy_templates t WHERE t.category_id = c.category_id) AS template_count,
                (SELECT COUNT(*) FROM diy_materials m WHERE m.category_id = c.category_id) AS material_count
           FROM categories c WHERE c.category_code IN (?)`,
        { replacements: [codes], transaction }
      )
      const blocked = refs.filter(r => Number(r.template_count) > 0 || Number(r.material_count) > 0)
      if (blocked.length > 0) {
        throw new Error(
          `分类下存在模板/素材引用，拒绝回滚: ${blocked.map(b => b.category_code).join(', ')}`
        )
      }

      await sequelize.query('DELETE FROM categories WHERE category_code IN (?)', {
        replacements: [codes],
        transaction
      })
      await transaction.commit()
      console.log('⏪ DIY 新品类分类已回滚删除')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
