'use strict'

/**
 * 迁移：虚拟资产命名重构 — 星石与源晶
 *
 * 背景：
 *   项目未上线，趁无历史数据包袱一次性将 asset_code 改到位。
 *   - DIAMOND → star_stone（星石）
 *   - {color}_shard → {color}_core_shard（源晶碎片）
 *   - {color}_crystal → {color}_core_gem（源晶）
 *   - form ENUM: crystal → gem
 *   - 大写 code 统一为 lower_snake_case
 *
 * 影响范围：
 *   - material_asset_types: 16 条 asset_code + display_name + form
 *   - asset_group_defs: 6 条 description
 *   - 11 张业务表的 asset_code 字段批量 UPDATE
 *   - system_settings: 18 条 key/value
 *   - lottery_prizes: 14 条 material_asset_code
 *   - material_conversion_rules: from/to/fee_asset_code + 文案
 *   - exchange_rates: from/to_asset_code + description 文案
 *   - 清理 MATERIAL_001 脏数据（7 条）
 *
 * 关联文档：docs/虚拟资产命名重构方案-星石与源晶.md
 */

// 旧 code → 新 code 映射（16 组）
const CODE_MAP = {
  DIAMOND: 'star_stone',
  DIAMOND_QUOTA: 'star_stone_quota',
  POINTS: 'points',
  BUDGET_POINTS: 'budget_points',
  red_shard: 'red_core_shard',
  red_crystal: 'red_core_gem',
  orange_shard: 'orange_core_shard',
  orange_crystal: 'orange_core_gem',
  yellow_shard: 'yellow_core_shard',
  yellow_crystal: 'yellow_core_gem',
  green_shard: 'green_core_shard',
  green_crystal: 'green_core_gem',
  blue_shard: 'blue_core_shard',
  blue_crystal: 'blue_core_gem',
  purple_shard: 'purple_core_shard',
  purple_crystal: 'purple_core_gem'
}

// 新 display_name 映射
const DISPLAY_MAP = {
  star_stone: '星石',
  star_stone_quota: '星石配额',
  points: '积分',
  budget_points: '预算积分',
  red_core_shard: '红源晶碎片',
  red_core_gem: '红源晶',
  orange_core_shard: '橙源晶碎片',
  orange_core_gem: '橙源晶',
  yellow_core_shard: '黄源晶碎片',
  yellow_core_gem: '黄源晶',
  green_core_shard: '绿源晶碎片',
  green_core_gem: '绿源晶',
  blue_core_shard: '蓝源晶碎片',
  blue_core_gem: '蓝源晶',
  purple_core_shard: '紫源晶碎片',
  purple_core_gem: '紫源晶'
}

// 反向映射（回滚用）
const REVERSE_CODE_MAP = Object.fromEntries(
  Object.entries(CODE_MAP).map(([k, v]) => [v, k])
)

// 旧 display_name 映射（回滚用）
const OLD_DISPLAY_MAP = {
  DIAMOND: '钻石',
  DIAMOND_QUOTA: '钻石配额',
  POINTS: '积分',
  BUDGET_POINTS: '预算积分',
  red_shard: '红水晶碎片',
  red_crystal: '红水晶',
  orange_shard: '橙水晶碎片',
  orange_crystal: '橙水晶',
  yellow_shard: '黄水晶碎片',
  yellow_crystal: '黄水晶',
  green_shard: '绿水晶碎片',
  green_crystal: '绿水晶',
  blue_shard: '蓝水晶碎片',
  blue_crystal: '蓝水晶',
  purple_shard: '紫水晶碎片',
  purple_crystal: '紫水晶'
}

// 包含 asset_code 字段的业务表（字段名 → 表名列表）
const ASSET_CODE_TABLES = [
  { table: 'account_asset_balances', column: 'asset_code' },
  { table: 'asset_transactions', column: 'asset_code' },
  { table: 'market_listings', column: 'price_asset_code' },
  { table: 'market_listings', column: 'offer_asset_code' },
  { table: 'trade_orders', column: 'asset_code' },
  { table: 'exchange_rates', column: 'from_asset_code' },
  { table: 'exchange_rates', column: 'to_asset_code' },
  { table: 'exchange_records', column: 'pay_asset_code' },
  { table: 'exchange_channel_prices', column: 'cost_asset_code' },
  { table: 'material_conversion_rules', column: 'from_asset_code' },
  { table: 'material_conversion_rules', column: 'to_asset_code' },
  { table: 'material_conversion_rules', column: 'fee_asset_code' },
  { table: 'market_price_snapshots', column: 'asset_code' },
  { table: 'market_price_snapshots', column: 'price_asset_code' },
  { table: 'lottery_prizes', column: 'material_asset_code' },
  { table: 'auction_listings', column: 'price_asset_code' },
  { table: 'bid_products', column: 'price_asset_code' },
  { table: 'diy_materials', column: 'price_asset_code' }
]

// system_settings key 映射（旧 key → 新 key）
const SETTINGS_KEY_MAP = {
  fee_rate_DIAMOND: 'fee_rate_star_stone',
  fee_rate_red_shard: 'fee_rate_red_core_shard',
  fee_min_DIAMOND: 'fee_min_star_stone',
  fee_min_red_shard: 'fee_min_red_core_shard',
  min_price_red_shard: 'min_price_red_core_shard',
  max_price_red_shard: 'max_price_red_core_shard',
  daily_max_listings_DIAMOND: 'daily_max_listings_star_stone',
  daily_max_listings_red_shard: 'daily_max_listings_red_core_shard',
  daily_max_trades_DIAMOND: 'daily_max_trades_star_stone',
  daily_max_trades_red_shard: 'daily_max_trades_red_core_shard',
  daily_max_amount_DIAMOND: 'daily_max_amount_star_stone',
  daily_max_amount_red_shard: 'daily_max_amount_red_core_shard',
  diamond_quota_ratio: 'star_stone_quota_ratio',
  diamond_quota_enabled: 'star_stone_quota_enabled',
  diamond_quota_exhausted_action: 'star_stone_quota_exhausted_action'
}

const REVERSE_SETTINGS_KEY_MAP = Object.fromEntries(
  Object.entries(SETTINGS_KEY_MAP).map(([k, v]) => [v, k])
)

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🚀 开始虚拟资产命名重构迁移...')
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========== 1. material_asset_types: 改 asset_code + display_name ==========
      console.log('📦 [1/9] 更新 material_asset_types...')
      for (const [oldCode, newCode] of Object.entries(CODE_MAP)) {
        const displayName = DISPLAY_MAP[newCode]
        // BUDGET_POINTS 的 form 从 crystal 改为 quota
        const extraSet = oldCode === 'BUDGET_POINTS' ? ", form = 'quota'" : ''
        await queryInterface.sequelize.query(
          `UPDATE material_asset_types SET asset_code = '${newCode}', display_name = '${displayName}'${extraSet} WHERE asset_code = '${oldCode}'`,
          { transaction }
        )
      }

      // ========== 2. form ENUM: crystal → gem ==========
      console.log('📦 [2/9] 修改 form ENUM（crystal → gem）...')
      // 先把所有 crystal 值改为 gem
      await queryInterface.sequelize.query(
        "UPDATE material_asset_types SET form = 'gem' WHERE form = 'crystal'",
        { transaction }
      )
      // 修改 ENUM 定义
      await queryInterface.sequelize.query(
        "ALTER TABLE material_asset_types MODIFY COLUMN form ENUM('shard','gem','currency','quota') NOT NULL COMMENT '资产形态：shard=碎片, gem=完整宝石, currency=自由货币, quota=受限配额'",
        { transaction }
      )

      // ========== 3. asset_group_defs: 改 description ==========
      console.log('📦 [3/9] 更新 asset_group_defs description...')
      const groupDescriptions = {
        red: '红色系列源晶资产',
        orange: '橙色系列源晶资产',
        yellow: '黄色系列源晶资产',
        green: '绿色系列源晶资产',
        blue: '蓝色系列源晶资产',
        purple: '紫色系列源晶资产'
      }
      for (const [groupCode, desc] of Object.entries(groupDescriptions)) {
        await queryInterface.sequelize.query(
          `UPDATE asset_group_defs SET description = '${desc}' WHERE group_code = '${groupCode}'`,
          { transaction }
        )
      }

      // ========== 4. 批量 UPDATE 所有业务表的 asset_code ==========
      console.log('📦 [4/9] 批量更新业务表 asset_code...')
      for (const { table, column } of ASSET_CODE_TABLES) {
        for (const [oldCode, newCode] of Object.entries(CODE_MAP)) {
          await queryInterface.sequelize.query(
            `UPDATE \`${table}\` SET \`${column}\` = '${newCode}' WHERE \`${column}\` = '${oldCode}'`,
            { transaction }
          )
        }
      }

      // ========== 5. system_settings: key 和 value 迁移 ==========
      console.log('📦 [5/9] 更新 system_settings...')
      // 5a. key 中含旧 code 的配置
      for (const [oldKey, newKey] of Object.entries(SETTINGS_KEY_MAP)) {
        await queryInterface.sequelize.query(
          `UPDATE system_settings SET setting_key = '${newKey}' WHERE setting_key = '${oldKey}'`,
          { transaction }
        )
      }
      // 5b. value 中含旧 code 的配置（JSON 数组）
      await queryInterface.sequelize.query(
        `UPDATE system_settings SET setting_value = '["star_stone","red_core_shard"]' WHERE setting_key = 'allowed_settlement_assets'`,
        { transaction }
      )
      await queryInterface.sequelize.query(
        `UPDATE system_settings SET setting_value = '["star_stone","red_core_shard"]' WHERE setting_key = 'allowed_listing_assets'`,
        { transaction }
      )

      // ========== 6. material_conversion_rules 文案更新 ==========
      console.log('📦 [6/9] 更新 material_conversion_rules 文案...')
      await queryInterface.sequelize.query(
        "UPDATE material_conversion_rules SET title = '红源晶碎片分解', description = '将红源晶碎片分解为星石，比例 1:20' WHERE material_conversion_rule_id = 1",
        { transaction }
      )

      // ========== 7. exchange_rates description 文案更新 ==========
      console.log('📦 [7/9] 更新 exchange_rates description...')
      const rateDescriptions = [
        [1, '10红源晶碎片=1星石（budget比1:10精确匹配）'],
        [2, '10橙源晶碎片=1星石（budget比1:10精确匹配）'],
        [3, '5黄源晶碎片=1星石（budget比1:5精确匹配）'],
        [4, '3绿源晶碎片=1星石（budget比1:2.5→保守取3）'],
        [5, '2蓝源晶碎片=1星石（budget比1:1.25→保守取2）'],
        [6, '1紫源晶碎片=1星石（budget比160:100→保守压到1:1）'],
        [7, '1红源晶=2星石（budget比50:100=1:2保守匹配）']
      ]
      for (const [id, desc] of rateDescriptions) {
        await queryInterface.sequelize.query(
          `UPDATE exchange_rates SET description = '${desc}' WHERE exchange_rate_id = ${id}`,
          { transaction }
        )
      }

      // ========== 8. 清理脏数据 ==========
      console.log('📦 [8/9] 清理 MATERIAL_001 脏数据...')
      const [deleted] = await queryInterface.sequelize.query(
        "DELETE FROM asset_transactions WHERE asset_code = 'MATERIAL_001'",
        { transaction }
      )
      console.log(`   🗑️ 已删除 MATERIAL_001 脏数据`)

      // ========== 9. 验证 ==========
      console.log('📦 [9/9] 验证迁移结果...')
      // 检查是否还有旧 code 残留（使用 BINARY 精确匹配，避免 MySQL 大小写不敏感导致误判）
      const oldCodes = Object.keys(CODE_MAP).map(c => `BINARY '${c}'`).join(',')
      const [residual] = await queryInterface.sequelize.query(
        `SELECT asset_code, COUNT(*) as cnt FROM material_asset_types WHERE BINARY asset_code IN (${oldCodes}) GROUP BY asset_code`,
        { transaction }
      )
      if (residual.length > 0) {
        throw new Error(`❌ 迁移验证失败：material_asset_types 仍有旧 code: ${JSON.stringify(residual)}`)
      }

      // 检查新 code 是否全部到位
      const [newCodes] = await queryInterface.sequelize.query(
        'SELECT asset_code FROM material_asset_types ORDER BY material_asset_type_id',
        { transaction }
      )
      console.log(`   ✅ material_asset_types 当前 ${newCodes.length} 条记录:`)
      newCodes.forEach(r => console.log(`      - ${r.asset_code}`))

      await transaction.commit()
      console.log('✅ 虚拟资产命名重构迁移完成！')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🔄 回滚虚拟资产命名重构...')
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 业务表回滚
      for (const { table, column } of ASSET_CODE_TABLES) {
        for (const [newCode, oldCode] of Object.entries(REVERSE_CODE_MAP)) {
          await queryInterface.sequelize.query(
            `UPDATE \`${table}\` SET \`${column}\` = '${oldCode}' WHERE \`${column}\` = '${newCode}'`,
            { transaction }
          )
        }
      }

      // 2. material_asset_types 回滚
      // 先把 gem 改回 crystal
      await queryInterface.sequelize.query(
        "UPDATE material_asset_types SET form = 'crystal' WHERE form = 'gem'",
        { transaction }
      )
      // 恢复 ENUM 定义
      await queryInterface.sequelize.query(
        "ALTER TABLE material_asset_types MODIFY COLUMN form ENUM('shard','crystal','currency','quota') NOT NULL",
        { transaction }
      )
      // 恢复 asset_code + display_name
      for (const [newCode, oldCode] of Object.entries(REVERSE_CODE_MAP)) {
        const displayName = OLD_DISPLAY_MAP[oldCode]
        const extraSet = oldCode === 'BUDGET_POINTS' ? ", form = 'crystal'" : ''
        await queryInterface.sequelize.query(
          `UPDATE material_asset_types SET asset_code = '${oldCode}', display_name = '${displayName}'${extraSet} WHERE asset_code = '${newCode}'`,
          { transaction }
        )
      }

      // 3. asset_group_defs 回滚
      const oldGroupDescriptions = {
        red: '红色系列材料资产',
        orange: '橙色系列材料资产',
        yellow: '黄色系列材料资产',
        green: '绿色系列材料资产',
        blue: '蓝色系列材料资产',
        purple: '紫色系列材料资产'
      }
      for (const [groupCode, desc] of Object.entries(oldGroupDescriptions)) {
        await queryInterface.sequelize.query(
          `UPDATE asset_group_defs SET description = '${desc}' WHERE group_code = '${groupCode}'`,
          { transaction }
        )
      }

      // 4. system_settings 回滚
      for (const [newKey, oldKey] of Object.entries(REVERSE_SETTINGS_KEY_MAP)) {
        await queryInterface.sequelize.query(
          `UPDATE system_settings SET setting_key = '${oldKey}' WHERE setting_key = '${newKey}'`,
          { transaction }
        )
      }
      await queryInterface.sequelize.query(
        `UPDATE system_settings SET setting_value = '["DIAMOND","red_shard"]' WHERE setting_key = 'allowed_settlement_assets'`,
        { transaction }
      )
      await queryInterface.sequelize.query(
        `UPDATE system_settings SET setting_value = '["DIAMOND","red_shard"]' WHERE setting_key = 'allowed_listing_assets'`,
        { transaction }
      )

      // 5. material_conversion_rules 文案回滚
      await queryInterface.sequelize.query(
        "UPDATE material_conversion_rules SET title = '红水晶碎片分解', description = '将红水晶碎片分解为钻石，比例 1:20' WHERE material_conversion_rule_id = 1",
        { transaction }
      )

      // 6. exchange_rates description 回滚
      const oldRateDescriptions = [
        [1, '10红水晶碎片=1钻石（budget比1:10精确匹配）'],
        [2, '10橙水晶碎片=1钻石（budget比1:10精确匹配）'],
        [3, '5黄水晶碎片=1钻石（budget比1:5精确匹配）'],
        [4, '3绿水晶碎片=1钻石（budget比1:2.5→保守取3）'],
        [5, '2蓝水晶碎片=1钻石（budget比1:1.25→保守取2）'],
        [6, '1紫水晶碎片=1钻石（budget比160:100→保守压到1:1）'],
        [7, '1红水晶=2钻石（budget比50:100=1:2保守匹配）']
      ]
      for (const [id, desc] of oldRateDescriptions) {
        await queryInterface.sequelize.query(
          `UPDATE exchange_rates SET description = '${desc}' WHERE exchange_rate_id = ${id}`,
          { transaction }
        )
      }

      await transaction.commit()
      console.log('✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
