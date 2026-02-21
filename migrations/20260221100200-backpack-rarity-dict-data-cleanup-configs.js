'use strict'

/**
 * 迁移：背包功能基础数据修复与配置初始化
 *
 * 合并以下变更（按依赖顺序执行）：
 *
 * P0 - 修复 rarity 字典缺失（现有 BUG）
 *   system_dictionaries 缺少 dict_type='rarity' 的 5 条记录，
 *   导致 BackpackService 中 attachDisplayNames 无法获取稀有度中文名/颜色。
 *   数据来源对齐 rarity_defs 表的 display_name + color_hex。
 *
 * P1 - 数据清洗：级联删除 197 条 item_type=NULL 的测试数据
 *   全部属于用户 31/135 的生命周期测试物品，关联 69 条 events + 6 条 market_listings。
 *   删除后对 item_type 加 NOT NULL 约束（无 DEFAULT，严格模式）。
 *
 * P1 - source 字段回填 + NOT NULL 约束
 *   通过 item_instance_events 的 mint 事件 business_type 回填历史 source，
 *   兜底标记为 'unknown'，然后加 NOT NULL DEFAULT 'unknown' 约束。
 *
 * P2 - 新增 system_configs 背包配置
 *   backpack_use_instructions: 按 item_type 区分的使用操作指引文案
 *   item_type_action_rules: 按 item_type 定义的允许操作列表
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========================================
      // P0: 补录 rarity 字典（5 条）
      // ========================================
      const [existingRarity] = await queryInterface.sequelize.query(
        "SELECT COUNT(*) as cnt FROM system_dictionaries WHERE dict_type = 'rarity'",
        { transaction }
      )

      if (existingRarity[0].cnt === 0) {
        await queryInterface.bulkInsert(
          'system_dictionaries',
          [
            {
              dict_type: 'rarity',
              dict_code: 'common',
              dict_name: '普通',
              dict_color: '#9E9E9E',
              sort_order: 1,
              is_enabled: 1,
              version: 1,
              created_at: new Date(),
              updated_at: new Date()
            },
            {
              dict_type: 'rarity',
              dict_code: 'uncommon',
              dict_name: '稀有',
              dict_color: '#4CAF50',
              sort_order: 2,
              is_enabled: 1,
              version: 1,
              created_at: new Date(),
              updated_at: new Date()
            },
            {
              dict_type: 'rarity',
              dict_code: 'rare',
              dict_name: '精良',
              dict_color: '#2196F3',
              sort_order: 3,
              is_enabled: 1,
              version: 1,
              created_at: new Date(),
              updated_at: new Date()
            },
            {
              dict_type: 'rarity',
              dict_code: 'epic',
              dict_name: '史诗',
              dict_color: '#9C27B0',
              sort_order: 4,
              is_enabled: 1,
              version: 1,
              created_at: new Date(),
              updated_at: new Date()
            },
            {
              dict_type: 'rarity',
              dict_code: 'legendary',
              dict_name: '传说',
              dict_color: '#FF9800',
              sort_order: 5,
              is_enabled: 1,
              version: 1,
              created_at: new Date(),
              updated_at: new Date()
            }
          ],
          { transaction }
        )
        console.log('✅ P0: 补录 rarity 字典 5 条')
      } else {
        console.log('⏭️ P0: rarity 字典已存在，跳过')
      }

      // ========================================
      // P1: 级联删除 item_type=NULL 的测试数据
      // FK RESTRICT 要求先删子表记录
      // ========================================

      // 统计待删除数据
      const [nullCount] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as cnt FROM item_instances WHERE item_type IS NULL',
        { transaction }
      )

      if (nullCount[0].cnt > 0) {
        // 1a. 删除 item_instance_events 中关联的测试事件
        const [deletedEvents] = await queryInterface.sequelize.query(
          `DELETE e FROM item_instance_events e
           JOIN item_instances i ON e.item_instance_id = i.item_instance_id
           WHERE i.item_type IS NULL`,
          { transaction }
        )
        console.log(`✅ P1: 删除关联 events ${deletedEvents.affectedRows || 0} 条`)

        // 1b. 先删除 trade_orders（FK → market_listings，RESTRICT 约束）
        const [deletedOrders] = await queryInterface.sequelize.query(
          `DELETE t FROM trade_orders t
           JOIN market_listings m ON t.market_listing_id = m.market_listing_id
           JOIN item_instances i ON m.offer_item_instance_id = i.item_instance_id
           WHERE i.item_type IS NULL`,
          { transaction }
        )
        console.log(`✅ P1: 删除关联 trade_orders ${deletedOrders.affectedRows || 0} 条`)

        // 1c. 删除 market_listings 中关联的测试挂牌
        const [deletedListings] = await queryInterface.sequelize.query(
          `DELETE m FROM market_listings m
           JOIN item_instances i ON m.offer_item_instance_id = i.item_instance_id
           WHERE i.item_type IS NULL`,
          { transaction }
        )
        console.log(`✅ P1: 删除关联 market_listings ${deletedListings.affectedRows || 0} 条`)

        // 1c. 删除 197 条测试数据主表记录
        const [deletedInstances] = await queryInterface.sequelize.query(
          'DELETE FROM item_instances WHERE item_type IS NULL',
          { transaction }
        )
        console.log(`✅ P1: 删除 item_instances ${deletedInstances.affectedRows || 0} 条`)
      } else {
        console.log('⏭️ P1: 无 item_type=NULL 数据，跳过删除')
      }

      // 加 NOT NULL 约束（无 DEFAULT，严格模式）
      await queryInterface.changeColumn(
        'item_instances',
        'item_type',
        {
          type: Sequelize.STRING(50),
          allowNull: false,
          comment: '物品类型（product/voucher/prize/tradable_item/service）'
        },
        { transaction }
      )
      console.log('✅ P1: item_type 加 NOT NULL 约束')

      // ========================================
      // P1.5: source 字段回填 + NOT NULL 约束
      // ========================================

      // 通过 mint 事件回填 source
      await queryInterface.sequelize.query(
        `UPDATE item_instances i
         JOIN item_instance_events e
           ON i.item_instance_id = e.item_instance_id AND e.event_type = 'mint'
         SET i.source = CASE
           WHEN e.business_type = 'lottery' THEN 'lottery'
           WHEN e.business_type LIKE 'test%' THEN 'test'
           WHEN e.business_type = 'stress_test' THEN 'test'
           ELSE 'unknown'
         END
         WHERE i.source IS NULL`,
        { transaction }
      )
      console.log('✅ P1.5: 通过 mint 事件回填 source')

      // 兜底：没有 mint 事件的记录标记为 unknown
      await queryInterface.sequelize.query(
        "UPDATE item_instances SET source = 'unknown' WHERE source IS NULL",
        { transaction }
      )
      console.log('✅ P1.5: 兜底回填 source=unknown')

      // 加 NOT NULL 约束
      await queryInterface.changeColumn(
        'item_instances',
        'source',
        {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'unknown',
          comment: '物品来源（lottery/exchange/bid_settlement/test/unknown）'
        },
        { transaction }
      )
      console.log('✅ P1.5: source 加 NOT NULL 约束')

      // ========================================
      // P2: 新增 system_configs 背包配置（2 条）
      // ========================================
      const [existingConfigs] = await queryInterface.sequelize.query(
        "SELECT config_key FROM system_configs WHERE config_key IN ('backpack_use_instructions', 'item_type_action_rules')",
        { transaction }
      )
      const existingKeys = new Set(existingConfigs.map(r => r.config_key))

      const configsToInsert = []

      if (!existingKeys.has('backpack_use_instructions')) {
        configsToInsert.push({
          config_key: 'backpack_use_instructions',
          config_value: JSON.stringify({
            service: '服务已激活，有效期内可享受对应权益。',
            tradable_item: '道具已使用，效果已生效。',
            product: '请到服务台出示核销码，领取您的商品。',
            voucher: '请到服务台出示核销码使用。',
            prize: '恭喜中奖！请到服务台出示核销码领取奖品。'
          }),
          description: '背包物品使用后的操作指引文案（按item_type区分）',
          config_category: 'backpack',
          is_active: 1,
          created_at: new Date(),
          updated_at: new Date()
        })
      }

      if (!existingKeys.has('item_type_action_rules')) {
        configsToInsert.push({
          config_key: 'item_type_action_rules',
          config_value: JSON.stringify({
            product: ['redeem', 'sell'],
            voucher: ['redeem', 'sell'],
            prize: ['redeem'],
            service: ['use'],
            tradable_item: ['use', 'sell']
          }),
          description: '按物品类型定义的允许操作列表（use=直接使用/redeem=生成核销码/sell=上架交易市场）',
          config_category: 'backpack',
          is_active: 1,
          created_at: new Date(),
          updated_at: new Date()
        })
      }

      if (configsToInsert.length > 0) {
        await queryInterface.bulkInsert('system_configs', configsToInsert, { transaction })
        console.log(`✅ P2: 插入 ${configsToInsert.length} 条 backpack 配置`)
      } else {
        console.log('⏭️ P2: backpack 配置已存在，跳过')
      }

      await transaction.commit()
      console.log('✅ 迁移完成：rarity 字典 + 数据清洗 + source 回填 + 背包配置')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 回滚 system_configs
      await queryInterface.sequelize.query(
        "DELETE FROM system_configs WHERE config_key IN ('backpack_use_instructions', 'item_type_action_rules')",
        { transaction }
      )

      // 回滚 source 约束（恢复为允许 NULL）
      await queryInterface.changeColumn(
        'item_instances',
        'source',
        {
          type: Sequelize.STRING(20),
          allowNull: true,
          defaultValue: null,
          comment: '物品来源'
        },
        { transaction }
      )

      // 回滚 item_type 约束（恢复为允许 NULL）
      await queryInterface.changeColumn(
        'item_instances',
        'item_type',
        {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: '物品类型'
        },
        { transaction }
      )

      // 回滚 rarity 字典
      await queryInterface.sequelize.query(
        "DELETE FROM system_dictionaries WHERE dict_type = 'rarity'",
        { transaction }
      )

      await transaction.commit()
      console.log('✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
