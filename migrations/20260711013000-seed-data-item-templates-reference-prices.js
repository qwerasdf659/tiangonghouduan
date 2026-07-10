'use strict'

/**
 * 种子数据: legacy 物品模板参考价落地 + 测试脏数据模板停用
 * （以物易物与会员成长等级功能启用方案 拍板⑤ / §10.5 定价清单，2026-07-11 执行）
 *
 * 背景:
 * - item_templates.reference_price_points 是换物方向守卫的价值锚（0 值会使守卫按 0 比较形同虚设），
 *   21/34 条模板参考价为 0，是以物易物上线的硬前置；
 * - §10.5 定价清单已起草（AI 按名称与市场价推测），本迁移将有明确价值锚的 6 条写入；
 * - 测试类/无实际业务价值的模板按清单建议直接停用（is_enabled=0），不参与定价；
 * - ⚠️ 4 条折扣券类模板（八八折/九八折券/优惠券1/优惠券2）无固定价值锚，保持 0 待运营
 *   提供真实定价后另行写入（0 价模板作为换物【投入】时价值记 0，方向守卫会拒绝任何有价产出，
 *   属安全失败方向，不产生套利面）。
 *
 * 变更内容:
 * 1. 写入 6 条模板参考价（积分=元口径）:
 *    165 legacy_points_100「100积分」→ 100 / 166 legacy_food_dessert「甜品1份」→ 20 /
 *    167 legacy_food_vegetables「青菜1份」→ 15 / 168 legacy_jewelry_premium「精品首饰一个」→ 300 /
 *    169 legacy_food_sashimi_platter「生腌拼盘158」→ 158 / 192 collectible_gem「收藏宝石」→ 500
 * 2. 停用 11 条测试脏数据模板（171/172/173/176/177/178/179/252/253/254/255）——
 *    其中 172/173 名下存在测试期铸造的物品实例，停用仅影响模板的新用途（新铸造/换物配方标的），
 *    存量物品实例的模板引用与展示不受影响。
 *
 * 回滚: 6 条参考价还原为 0.00，11 条模板恢复启用。
 */

/** 参考价写入清单（拍板⑤/§10.5，AI 建议价经用户 2026-07-11 指令执行） */
const PRICE_SEEDS = [
  { item_template_id: 165, reference_price_points: 100 }, // 100积分（面值即价值锚）
  { item_template_id: 166, reference_price_points: 20 }, // 甜品1份
  { item_template_id: 167, reference_price_points: 15 }, // 青菜1份
  { item_template_id: 168, reference_price_points: 300 }, // 精品首饰一个
  { item_template_id: 169, reference_price_points: 158 }, // 生腌拼盘158（名称含真实标价）
  { item_template_id: 192, reference_price_points: 500 } // 收藏宝石
]

/** 停用清单（测试/压测/交易测试/纯数字脏数据模板，§10.5 建议停用） */
const DISABLE_TEMPLATE_IDS = [171, 172, 173, 176, 177, 178, 179, 252, 253, 254, 255]

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      // 1. 写入参考价（仅覆盖当前仍为 0/NULL 的行，防止覆盖运营已手工修订的真实价）
      for (const seed of PRICE_SEEDS) {
        // eslint-disable-next-line no-await-in-loop
        await sequelize.query(
          `UPDATE item_templates
           SET reference_price_points = :price, updated_at = NOW()
           WHERE item_template_id = :id
             AND (reference_price_points IS NULL OR reference_price_points = 0)`,
          {
            replacements: { price: seed.reference_price_points, id: seed.item_template_id },
            transaction
          }
        )
      }

      // 2. 停用测试脏数据模板
      await sequelize.query(
        'UPDATE item_templates SET is_enabled = 0, updated_at = NOW() WHERE item_template_id IN (:ids)',
        { replacements: { ids: DISABLE_TEMPLATE_IDS }, transaction }
      )

      // 3. 回读验证
      const [[{ zero_enabled }]] = await sequelize.query(
        `SELECT COUNT(*) AS zero_enabled FROM item_templates
         WHERE is_enabled = 1 AND (reference_price_points IS NULL OR reference_price_points = 0)`,
        { transaction }
      )

      await transaction.commit()
      console.log(
        `✅ 模板定价已落地：6 条参考价写入、${DISABLE_TEMPLATE_IDS.length} 条测试模板停用；` +
          `启用中仍待真实定价的模板剩余 ${zero_enabled} 条（折扣券类，待运营提供价值锚）`
      )
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      await sequelize.query(
        `UPDATE item_templates SET reference_price_points = 0, updated_at = NOW()
         WHERE item_template_id IN (:ids)`,
        { replacements: { ids: PRICE_SEEDS.map(s => s.item_template_id) }, transaction }
      )
      await sequelize.query(
        'UPDATE item_templates SET is_enabled = 1, updated_at = NOW() WHERE item_template_id IN (:ids)',
        { replacements: { ids: DISABLE_TEMPLATE_IDS }, transaction }
      )
      await transaction.commit()
      console.log('⏪ 模板参考价与停用状态已回滚')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
