/**
 * 迁移：全局氛围主题配置 + 兑换商品稀有度扩展
 *
 * 变更清单：
 * 1. system_configs 插入 app_theme 配置行（全局氛围主题）
 * 2. exchange_items 新增 rarity_code 列（VARCHAR(50), DEFAULT 'common', FK→rarity_defs）
 * 3. exchange_items 新增 rarity_code 索引
 *
 * 业务背景：
 * - 前端已将抽奖6套 + 兑换5套主题合并为统一全局主题，需要后端提供 app_theme 配置
 * - 兑换商品需要稀有度体系以支持卡片增强特效（holo全息光效等）
 *
 * @date 2026-03-06
 */

'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // ============================================================
    // 1. 插入 app_theme 全局氛围主题配置
    // ============================================================
    const [existingConfig] = await queryInterface.sequelize.query(
      "SELECT config_key FROM system_configs WHERE config_key = 'app_theme' LIMIT 1"
    )

    if (existingConfig.length === 0) {
      await queryInterface.sequelize.query(`
        INSERT INTO system_configs (config_key, config_value, description, config_category, is_active, created_at, updated_at)
        VALUES (
          'app_theme',
          '{"theme": "default"}',
          '全局氛围主题配置，控制小程序所有页面的视觉主题。可选值：default / gold_luxury / purple_mystery / spring_festival / christmas / summer',
          'feature',
          1,
          NOW(),
          NOW()
        )
      `)
      console.log('✅ 已插入 app_theme 配置行')
    } else {
      console.log('⏭️ app_theme 配置行已存在，跳过插入')
    }

    // ============================================================
    // 2. exchange_items 新增 rarity_code 列
    // ============================================================
    const tableDescription = await queryInterface.describeTable('exchange_items')

    if (!tableDescription.rarity_code) {
      await queryInterface.addColumn('exchange_items', 'rarity_code', {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'common',
        comment: '稀有度代码，关联 rarity_defs.rarity_code（common/uncommon/rare/epic/legendary）',
        after: 'sell_point'
      })
      console.log('✅ 已添加 exchange_items.rarity_code 列')

      // 3. 添加外键约束
      await queryInterface.addConstraint('exchange_items', {
        fields: ['rarity_code'],
        type: 'foreign key',
        name: 'fk_exchange_items_rarity_code',
        references: {
          table: 'rarity_defs',
          field: 'rarity_code'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      })
      console.log('✅ 已添加 exchange_items.rarity_code 外键约束')

      // 4. 添加索引（先检查是否已存在）
      const [existingIndexes] = await queryInterface.sequelize.query(
        "SHOW INDEX FROM exchange_items WHERE Key_name = 'idx_exchange_items_rarity_code'"
      )

      if (existingIndexes.length === 0) {
        await queryInterface.addIndex('exchange_items', ['rarity_code'], {
          name: 'idx_exchange_items_rarity_code'
        })
        console.log('✅ 已添加 exchange_items.rarity_code 索引')
      } else {
        console.log('⏭️ idx_exchange_items_rarity_code 索引已存在，跳过')
      }
    } else {
      console.log('⏭️ exchange_items.rarity_code 列已存在，跳过')
    }
  },

  async down(queryInterface) {
    // 回滚：移除索引 → 移除外键 → 移除列 → 删除配置行
    const tableDescription = await queryInterface.describeTable('exchange_items')

    if (tableDescription.rarity_code) {
      const [existingIndexes] = await queryInterface.sequelize.query(
        "SHOW INDEX FROM exchange_items WHERE Key_name = 'idx_exchange_items_rarity_code'"
      )
      if (existingIndexes.length > 0) {
        await queryInterface.removeIndex('exchange_items', 'idx_exchange_items_rarity_code')
      }

      try {
        await queryInterface.removeConstraint('exchange_items', 'fk_exchange_items_rarity_code')
      } catch {
        console.log('⚠️ 外键约束 fk_exchange_items_rarity_code 不存在或已移除')
      }

      await queryInterface.removeColumn('exchange_items', 'rarity_code')
    }

    await queryInterface.sequelize.query(
      "DELETE FROM system_configs WHERE config_key = 'app_theme'"
    )
  }
}

