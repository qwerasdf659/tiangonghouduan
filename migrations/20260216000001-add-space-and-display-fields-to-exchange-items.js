'use strict'

/**
 * 数据库迁移：exchange_items 新增空间归属和展示增强字段
 *
 * 业务背景（臻选空间/幸运空间/竞价功能 — 后端实施方案）：
 * - 兑换商品需要区分所属空间：幸运空间(lucky) / 臻选空间(premium) / 两者(both)
 * - 新增展示增强字段：原价划线价、标签、新品/热门/幸运标记、质保/包邮、卖点文案
 * - 存量77条商品全部默认归入幸运空间（决策4）
 * - 已砍掉4个冗余字段：discount/rating/sales/seller_info（决策12）
 *
 * 变更内容（共 9 个新字段 + 2 个索引）：
 * 1. space VARCHAR(20) — 核心业务字段，所属空间
 * 2. original_price BIGINT — 原价（划线价对比）
 * 3. tags JSON — 商品标签数组
 * 4. is_new TINYINT(1) — 新品标记
 * 5. is_hot TINYINT(1) — 热门标记
 * 6. is_lucky TINYINT(1) — 幸运商品标记
 * 7. has_warranty TINYINT(1) — 质保标记
 * 8. free_shipping TINYINT(1) — 包邮标记
 * 9. sell_point VARCHAR(200) — 营销卖点文案
 * 10. idx_space 索引
 * 11. idx_space_status 联合索引
 *
 * 回滚方案：down() 逐项删除所有新增字段和索引
 *
 * @see docs/臻选空间-幸运空间-竞价功能-后端实施方案.md §3.1
 * @date 2026-02-16
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('📦 [迁移] 开始：exchange_items 新增空间归属和展示增强字段...')

    // ====== 1. 新增 space 字段（核心业务字段）======
    console.log('  📋 Step 1/11: 新增 space 字段...')
    await queryInterface.addColumn('exchange_items', 'space', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'lucky',
      comment: '所属空间：lucky=幸运空间, premium=臻选空间, both=两者都展示'
    })

    // ====== 2. 新增 original_price 字段 ======
    console.log('  📋 Step 2/11: 新增 original_price 字段...')
    await queryInterface.addColumn('exchange_items', 'original_price', {
      type: Sequelize.BIGINT,
      allowNull: true,
      defaultValue: null,
      comment: '原价（材料数量），用于展示划线价对比'
    })

    // ====== 3. 新增 tags 字段 ======
    console.log('  📋 Step 3/11: 新增 tags 字段...')
    await queryInterface.addColumn('exchange_items', 'tags', {
      type: Sequelize.JSON,
      allowNull: true,
      defaultValue: null,
      comment: '商品标签数组，如 ["限量","新品"]'
    })

    // ====== 4. 新增 is_new 字段 ======
    console.log('  📋 Step 4/11: 新增 is_new 字段...')
    await queryInterface.addColumn('exchange_items', 'is_new', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '是否新品'
    })

    // ====== 5. 新增 is_hot 字段 ======
    console.log('  📋 Step 5/11: 新增 is_hot 字段...')
    await queryInterface.addColumn('exchange_items', 'is_hot', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '是否热门'
    })

    // ====== 6. 新增 is_lucky 字段 ======
    console.log('  📋 Step 6/11: 新增 is_lucky 字段...')
    await queryInterface.addColumn('exchange_items', 'is_lucky', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '是否幸运商品（特殊标识）'
    })

    // ====== 7. 新增 has_warranty 字段 ======
    console.log('  📋 Step 7/11: 新增 has_warranty 字段...')
    await queryInterface.addColumn('exchange_items', 'has_warranty', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '是否有质保'
    })

    // ====== 8. 新增 free_shipping 字段 ======
    console.log('  📋 Step 8/11: 新增 free_shipping 字段...')
    await queryInterface.addColumn('exchange_items', 'free_shipping', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '是否包邮'
    })

    // ====== 9. 新增 sell_point 字段 ======
    console.log('  📋 Step 9/11: 新增 sell_point 字段...')
    await queryInterface.addColumn('exchange_items', 'sell_point', {
      type: Sequelize.STRING(200),
      allowNull: true,
      defaultValue: null,
      comment: '营销卖点文案'
    })

    // ====== 10. 新增 idx_space 索引 ======
    console.log('  📋 Step 10/11: 新增 idx_space 索引...')
    await queryInterface.addIndex('exchange_items', ['space'], {
      name: 'idx_space'
    })

    // ====== 11. 新增 idx_space_status 联合索引 ======
    console.log('  📋 Step 11/11: 新增 idx_space_status 联合索引...')
    await queryInterface.addIndex('exchange_items', ['space', 'status'], {
      name: 'idx_space_status'
    })

    // ====== 存量数据处理：77条商品默认归入 lucky 空间（DEFAULT 已处理）======
    console.log('  📋 存量数据确认：77条商品已通过 DEFAULT "lucky" 自动归入幸运空间')

    console.log('✅ [迁移] 完成：exchange_items 新增 9 个字段 + 2 个索引')
  },

  async down(queryInterface) {
    console.log('📦 [回滚] 开始：exchange_items 移除空间归属和展示增强字段...')

    // 按相反顺序回滚
    await queryInterface.removeIndex('exchange_items', 'idx_space_status')
    await queryInterface.removeIndex('exchange_items', 'idx_space')
    await queryInterface.removeColumn('exchange_items', 'sell_point')
    await queryInterface.removeColumn('exchange_items', 'free_shipping')
    await queryInterface.removeColumn('exchange_items', 'has_warranty')
    await queryInterface.removeColumn('exchange_items', 'is_lucky')
    await queryInterface.removeColumn('exchange_items', 'is_hot')
    await queryInterface.removeColumn('exchange_items', 'is_new')
    await queryInterface.removeColumn('exchange_items', 'tags')
    await queryInterface.removeColumn('exchange_items', 'original_price')
    await queryInterface.removeColumn('exchange_items', 'space')

    console.log('✅ [回滚] 完成：exchange_items 已移除 9 个字段 + 2 个索引')
  }
}


