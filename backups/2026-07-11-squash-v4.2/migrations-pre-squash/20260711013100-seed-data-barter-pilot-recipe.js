'use strict'

/**
 * 种子数据: 以物易物试点配方（拍板④）+ 换物产出标的商品
 * （以物易物与会员成长等级功能启用方案 §1.3-2/3，2026-07-11 执行）
 *
 * 背景:
 * - 换物开关 = 配方是否存在（设计如此，无 feature_flag）：system_settings 无 barter_recipes
 *   即功能关闭。本迁移写入首条试点配方，正式启用以物易物；
 * - 拍板④：先配 1 条试点配方走通全流程（毛巾礼盒×2 → 新毛巾礼盒），验证后再扩充；
 * - 产出标的必须关联 item_template_id（方向守卫价值锚 + 履约分流依据，
 *   BarterService 已加 BARTER_OUTPUT_TEMPLATE_MISSING 硬校验）——在售 2 个测试商品
 *   （1号/2号商品）无模板且真实归属待运营决策，故新建专用产出标的而非复用测试商品。
 *
 * 变更内容:
 * 1. 新建换物专供产出商品「毛巾礼盒（换物）」：
 *    - item_template_id=16（home_towel_set 毛巾礼盒，reference_price_points=100）；
 *    - fulfillment_type='physical'（实物快递履约，换物订单走 pending→shipped→received 发货链）；
 *    - mint_instance=0（实物产出不 mint 进背包，与发货链二选一防双重履约）；
 *    - status='inactive'（不在兑换商城售卖，仅作换物产出标的——C 端商城列表只下发 active）；
 *    - stock=0（库存口径拍板 2026-07-11：exchange_items.stock 是 SKU 聚合物化列、属商城
 *      购买链路，换物发放总量的唯一权威 = 配方 total_limit；本商品无 SKU，物化列按聚合口径
 *      恒为 0，与每日 SPU 对账任务保持账实一致）。
 * 2. 写入 system_settings(exchange/barter_recipes) 试点配方：
 *    毛巾礼盒×2（投入价值 200）→ 毛巾礼盒（产出价值 100），方向等价向下 ✓；
 *    per_user_limit=1、total_limit=100（拍板⑬-(c) 限量防薅 + 实物产出总量口径）。
 *
 * 回滚: 删除配方配置；产出商品无订单引用时删除，有引用则保留并告警。
 */

const ProductCodeGenerator = require('../utils/ProductCodeGenerator')

/** 产出标的关联的物品模板（home_towel_set 毛巾礼盒，价值锚 100 积分=元） */
const TOWEL_TEMPLATE_ID = 16

/** 试点配方码（业务码，全局唯一） */
const PILOT_RECIPE_CODE = 'towel_set_x2_to_new_towel_set'

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      // 0. 前置校验：模板 16 必须存在且有参考价（方向守卫价值锚）
      const [[template]] = await sequelize.query(
        `SELECT item_template_id, display_name, reference_price_points, item_type
         FROM item_templates WHERE item_template_id = :id`,
        { replacements: { id: TOWEL_TEMPLATE_ID }, transaction }
      )
      if (!template || Number(template.reference_price_points) <= 0) {
        throw new Error(
          `试点配方前置失败：模板 ${TOWEL_TEMPLATE_ID}（毛巾礼盒）不存在或参考价为 0，方向守卫无价值锚`
        )
      }

      // 1. 幂等创建换物专供产出商品（按名称+模板判存，重复执行不重复建）
      const [[existingOutput]] = await sequelize.query(
        `SELECT exchange_item_id FROM exchange_items
         WHERE item_name = '毛巾礼盒（换物）' AND item_template_id = :tpl`,
        { replacements: { tpl: TOWEL_TEMPLATE_ID }, transaction }
      )
      let outputExchangeItemId = existingOutput ? Number(existingOutput.exchange_item_id) : null

      if (!outputExchangeItemId) {
        // 生成 SP 前缀无意义随机码（与 ExchangeItemService 同规范，唯一索引兜底撞码重试）
        let itemCode = null
        for (let attempt = 0; attempt < 5; attempt++) {
          const candidate = ProductCodeGenerator.generate('SP')
          // eslint-disable-next-line no-await-in-loop
          const [[clash]] = await sequelize.query(
            'SELECT exchange_item_id FROM exchange_items WHERE item_code = :code',
            { replacements: { code: candidate }, transaction }
          )
          if (!clash) {
            itemCode = candidate
            break
          }
        }
        if (!itemCode) throw new Error('item_code 生成撞码重试超限')

        const [insertResult] = await sequelize.query(
          `INSERT INTO exchange_items
             (item_code, item_name, description, item_template_id, mint_instance, fulfillment_type,
              rarity_code, status, sort_order, space, stock, sold_count, max_quantity_per_order,
              applicable_scope, created_at, updated_at)
           VALUES
             (:item_code, '毛巾礼盒（换物）',
              '以物易物试点产出标的（拍板④）：旧毛巾礼盒×2 换新毛巾礼盒，实物快递履约。不在兑换商城售卖（status=inactive），仅作换物配方产出；发放总量由配方 total_limit 控制（stock 物化列与换物无关）。',
              :tpl, 0, 'physical', 'common', 'inactive', 100, 'lucky', 0, 0, 1,
              'all', NOW(), NOW())`,
          { replacements: { item_code: itemCode, tpl: TOWEL_TEMPLATE_ID }, transaction }
        )
        outputExchangeItemId = insertResult
        console.log(
          `✅ 换物产出标的已创建：exchange_item_id=${outputExchangeItemId}，item_code=${itemCode}`
        )
      }

      // 2. 写入试点配方（barter_recipes 不存在则创建；已存在则并入且按 recipe_code 幂等）
      const [[settingRow]] = await sequelize.query(
        `SELECT system_setting_id, setting_value FROM system_settings
         WHERE category = 'exchange' AND setting_key = 'barter_recipes'`,
        { transaction }
      )
      const pilotRecipe = {
        recipe_code: PILOT_RECIPE_CODE,
        name: '毛巾礼盒×2 换 新毛巾礼盒',
        required_item_template_id: TOWEL_TEMPLATE_ID,
        required_quantity: 2,
        output_exchange_item_id: outputExchangeItemId,
        is_enabled: true,
        per_user_limit: 1,
        total_limit: 100
      }

      if (!settingRow) {
        await sequelize.query(
          `INSERT INTO system_settings
             (category, setting_key, setting_value, value_type, description, created_at, updated_at)
           VALUES
             ('exchange', 'barter_recipes', :value, 'json',
              '以物易物配方配置（旧物组合→官方产出物，B2C 官方合成）', NOW(), NOW())`,
          { replacements: { value: JSON.stringify([pilotRecipe]) }, transaction }
        )
      } else {
        const existing = JSON.parse(settingRow.setting_value || '[]')
        const merged = Array.isArray(existing)
          ? existing.filter(r => r.recipe_code !== PILOT_RECIPE_CODE).concat([pilotRecipe])
          : [pilotRecipe]
        await sequelize.query(
          `UPDATE system_settings SET setting_value = :value, updated_at = NOW()
           WHERE system_setting_id = :id`,
          { replacements: { value: JSON.stringify(merged), id: settingRow.system_setting_id }, transaction }
        )
      }

      await transaction.commit()
      console.log(
        `✅ 以物易物试点配方已启用：${PILOT_RECIPE_CODE}（毛巾礼盒×2 → 新毛巾礼盒，` +
          'per_user_limit=1，total_limit=100）——换物开关=配方存在，功能自本迁移起正式开启'
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
      // 1. 从配方 JSON 移除试点配方（其它配方保留）
      const [[settingRow]] = await sequelize.query(
        `SELECT system_setting_id, setting_value FROM system_settings
         WHERE category = 'exchange' AND setting_key = 'barter_recipes'`,
        { transaction }
      )
      if (settingRow) {
        const recipes = JSON.parse(settingRow.setting_value || '[]')
        const remaining = Array.isArray(recipes)
          ? recipes.filter(r => r.recipe_code !== PILOT_RECIPE_CODE)
          : []
        if (remaining.length === 0) {
          await sequelize.query('DELETE FROM system_settings WHERE system_setting_id = :id', {
            replacements: { id: settingRow.system_setting_id },
            transaction
          })
        } else {
          await sequelize.query(
            'UPDATE system_settings SET setting_value = :value, updated_at = NOW() WHERE system_setting_id = :id',
            {
              replacements: { value: JSON.stringify(remaining), id: settingRow.system_setting_id },
              transaction
            }
          )
        }
      }

      // 2. 产出商品：无订单引用时删除，有引用（已发生换物）则保留防止破坏订单快照关联
      const [[output]] = await sequelize.query(
        `SELECT exchange_item_id FROM exchange_items
         WHERE item_name = '毛巾礼盒（换物）' AND item_template_id = :tpl`,
        { replacements: { tpl: TOWEL_TEMPLATE_ID }, transaction }
      )
      if (output) {
        const [[{ ref_count }]] = await sequelize.query(
          'SELECT COUNT(*) AS ref_count FROM exchange_records WHERE exchange_item_id = :id',
          { replacements: { id: output.exchange_item_id }, transaction }
        )
        if (Number(ref_count) === 0) {
          await sequelize.query('DELETE FROM exchange_items WHERE exchange_item_id = :id', {
            replacements: { id: output.exchange_item_id },
            transaction
          })
        } else {
          console.log(
            `⚠️ 产出商品 exchange_item_id=${output.exchange_item_id} 已有 ${ref_count} 条订单引用，保留不删`
          )
        }
      }

      await transaction.commit()
      console.log('⏪ 以物易物试点配方已回滚')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
