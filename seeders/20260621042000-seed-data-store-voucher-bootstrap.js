'use strict'

/**
 * 门店专属兑换券业务线 - 上线前置数据种子（seed-data）
 *
 * 创建时间: 2026-06-21（docs/门店专属兑换券业务线设计与核销概况对接.md §10.13 拍板）
 * 创建原因:
 *   连真实库 restaurant_points_dev 核查发现：光改代码看板仍为 0，必须补三类前置数据：
 *   ① 店长账号 13612227910（user_id=32）当前无任何 store_staff 绑定 → 核销不回填门店；
 *   ② 5 个门店 stores.merchant_id 全为 NULL → merchant_all 校验无门店商家可比；
 *   ③ 0 条 voucher 门店专属券商品 → 小程序看板与运营看板恒为 0。
 *
 * 本 seeder 幂等补齐（全部先查后插/改，重复执行安全）：
 *   1. store_staff：user_id=32 → store_id=7，role_in_store=manager，status=active（激活店长）
 *   2. stores：store_id=7 的 merchant_id 置为 6（老良记），作为 merchant_all 的前提
 *   3. 首批门店专属券（fulfillment_type=voucher）各一，配齐默认 SKU + 渠道价（red_core_shard 计价）：
 *      - specified_stores（scoped_store_ids=[7]）
 *      - merchant_all（merchant_id=6）
 *   关联 voucher 物品模板 item_template_id=2（50元优惠券），兑换时按 voucher 即时完成 + 生成核销码。
 *
 * 真实库依据（执行前实测）：user_id=32 存在且 active；store 7 active；merchant 6 老良记 active；
 *   voucher 模板 id=2/3/4 存在；在用 cost_asset_code=red_core_shard。
 *
 * 执行: npx sequelize-cli db:seed --seed 20260621042000-seed-data-store-voucher-bootstrap.js
 * 回滚: npx sequelize-cli db:seed:undo --seed 20260621042000-seed-data-store-voucher-bootstrap.js
 */

const TARGET_USER_ID = 32 // 13612227910（店长测试账号）
const TARGET_STORE_ID = 7 // API验证测试门店（active）
const TARGET_MERCHANT_ID = 6 // 老良记（active）
const VOUCHER_TEMPLATE_ID = 2 // 50元优惠券（voucher 模板）
const COST_ASSET_CODE = 'red_core_shard' // 在用计价资产
const COST_AMOUNT = 100 // 兑换所需材料数量
const SEED_STOCK = 100 // 初始库存

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date()
    const transaction = await queryInterface.sequelize.transaction()
    try {
      // ===== 1. 激活店长绑定：user_id=32 → store_id=7（manager/active）=====
      const existingStaff = await queryInterface.rawSelect(
        'store_staff',
        {
          where: { user_id: TARGET_USER_ID, store_id: TARGET_STORE_ID },
          transaction
        },
        ['store_staff_id']
      )
      if (existingStaff) {
        await queryInterface.bulkUpdate(
          'store_staff',
          { role_in_store: 'manager', status: 'active', joined_at: now, updated_at: now },
          { store_staff_id: existingStaff },
          { transaction }
        )
      } else {
        await queryInterface.bulkInsert(
          'store_staff',
          [
            {
              user_id: TARGET_USER_ID,
              store_id: TARGET_STORE_ID,
              sequence_no: 1,
              role_in_store: 'manager',
              status: 'active',
              can_view_redemption_stats: false, // 店长恒可看，不依赖此标志
              joined_at: now,
              created_at: now,
              updated_at: now
            }
          ],
          { transaction }
        )
      }

      // ===== 2. 门店 7 绑商家 6（merchant_all 前提）=====
      await queryInterface.bulkUpdate(
        'stores',
        { merchant_id: TARGET_MERCHANT_ID, updated_at: now },
        { store_id: TARGET_STORE_ID },
        { transaction }
      )

      // ===== 3. 首批门店专属券（specified_stores + merchant_all 各一）=====
      const voucherDefs = [
        {
          item_name: '门店专属券-指定门店(店7)',
          applicable_scope: 'specified_stores',
          scoped_store_ids: JSON.stringify([TARGET_STORE_ID]),
          merchant_id: null
        },
        {
          item_name: '门店专属券-商家全门店(老良记)',
          applicable_scope: 'merchant_all',
          scoped_store_ids: null,
          merchant_id: TARGET_MERCHANT_ID
        }
      ]

      for (const def of voucherDefs) {
        // 幂等：按 item_name 判存在
        const existId = await queryInterface.rawSelect(
          'exchange_items',
          { where: { item_name: def.item_name }, transaction },
          ['exchange_item_id']
        )
        if (existId) continue

        await queryInterface.bulkInsert(
          'exchange_items',
          [
            {
              item_name: def.item_name,
              description: '门店专属兑换券业务线首批种子券（到限定门店核销）',
              item_template_id: VOUCHER_TEMPLATE_ID,
              mint_instance: true,
              fulfillment_type: 'voucher',
              rarity_code: 'common',
              status: 'active',
              sort_order: 100,
              space: 'lucky',
              applicable_scope: def.applicable_scope,
              scoped_store_ids: def.scoped_store_ids,
              merchant_id: def.merchant_id,
              stock: SEED_STOCK,
              sold_count: 0,
              max_quantity_per_order: 10,
              stock_alert_threshold: 0,
              created_at: now,
              updated_at: now
            }
          ],
          { transaction }
        )

        const newItemId = await queryInterface.rawSelect(
          'exchange_items',
          { where: { item_name: def.item_name }, transaction },
          ['exchange_item_id']
        )

        // 默认 SKU
        const skuCode = `default_${newItemId}`
        await queryInterface.bulkInsert(
          'exchange_item_skus',
          [
            {
              exchange_item_id: newItemId,
              sku_code: skuCode,
              stock: SEED_STOCK,
              sold_count: 0,
              cost_price: 0,
              status: 'active',
              sort_order: 0,
              created_at: now,
              updated_at: now
            }
          ],
          { transaction }
        )

        const newSkuId = await queryInterface.rawSelect(
          'exchange_item_skus',
          { where: { sku_code: skuCode }, transaction },
          ['sku_id']
        )

        // 渠道价（red_core_shard 计价）
        await queryInterface.bulkInsert(
          'exchange_channel_prices',
          [
            {
              sku_id: newSkuId,
              cost_asset_code: COST_ASSET_CODE,
              cost_amount: COST_AMOUNT,
              is_enabled: true,
              created_at: now,
              updated_at: now
            }
          ],
          { transaction }
        )
      }

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      const names = ['门店专属券-指定门店(店7)', '门店专属券-商家全门店(老良记)']
      for (const name of names) {
        const itemId = await queryInterface.rawSelect(
          'exchange_items',
          { where: { item_name: name }, transaction },
          ['exchange_item_id']
        )
        if (itemId) {
          const skuId = await queryInterface.rawSelect(
            'exchange_item_skus',
            { where: { sku_code: `default_${itemId}` }, transaction },
            ['sku_id']
          )
          if (skuId) {
            await queryInterface.bulkDelete(
              'exchange_channel_prices',
              { sku_id: skuId },
              { transaction }
            )
            await queryInterface.bulkDelete(
              'exchange_item_skus',
              { sku_id: skuId },
              { transaction }
            )
          }
          await queryInterface.bulkDelete(
            'exchange_items',
            { exchange_item_id: itemId },
            { transaction }
          )
        }
      }

      // 回滚门店商家绑定与店长激活（仅撤销本 seeder 的改动）
      await queryInterface.bulkUpdate(
        'stores',
        { merchant_id: null },
        { store_id: TARGET_STORE_ID },
        { transaction }
      )
      await queryInterface.bulkDelete(
        'store_staff',
        { user_id: TARGET_USER_ID, store_id: TARGET_STORE_ID },
        { transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
