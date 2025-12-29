/**
 * 餐厅积分抽奖系统 V4.2 - 数据库迁移
 *
 * 迁移内容：P1级幂等性约束修复
 *
 * 修复内容：
 * 1. consumption_records.business_id 添加唯一约束
 * 2. market_listings.business_id 修改为 NOT NULL
 *
 * 业务背景：
 * - 规范文档要求所有关键业务表的 business_id 必须有唯一约束
 * - 防止网络重试/超时导致的重复记录
 * - 实现幂等性保证（同一 business_id 重复请求返回同结果）
 *
 * 前置条件检查：
 * - consumption_records 表中不能有重复的 business_id
 * - consumption_records 表中不能有 NULL 的 business_id
 * - market_listings 表中不能有 NULL 的 business_id
 *
 * 创建时间：2025年12月23日
 * 技术债务修复：P1级 - 幂等性约束完善
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：添加/修复幂等性约束
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  async up(queryInterface, Sequelize) {
    console.log('开始迁移：P1级幂等性约束修复...')

    // ========================================
    // 1. 处理 consumption_records.business_id
    // ========================================
    console.log('\n=== 步骤1：处理 consumption_records.business_id ===')

    // 1.1 检查是否有 NULL 值
    const [consumptionNulls] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as null_count
      FROM consumption_records
      WHERE business_id IS NULL
    `)

    if (consumptionNulls[0].null_count > 0) {
      // 数据库已清理完毕，不应该存在 NULL 记录
      throw new Error(`发现 ${consumptionNulls[0].null_count} 条 NULL 记录，请先手动处理历史数据`)
    } else {
      console.log('✅ 无 NULL 记录')
    }

    // 1.2 检查唯一索引是否已存在
    const [consumptionUniqueIndex] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM consumption_records
      WHERE Key_name = 'uk_consumption_records_business_id'
    `)

    if (consumptionUniqueIndex.length === 0) {
      console.log('创建唯一索引: uk_consumption_records_business_id')
      await queryInterface.addIndex('consumption_records', {
        fields: ['business_id'],
        unique: true,
        name: 'uk_consumption_records_business_id',
        type: 'UNIQUE'
      })
      console.log('✅ 唯一索引已创建')
    } else {
      console.log('✅ 唯一索引已存在，跳过创建')
    }

    // 1.3 修改字段为 NOT NULL（如果当前允许 NULL）
    const [consumptionColumns] = await queryInterface.sequelize.query(`
      SELECT IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'consumption_records'
        AND COLUMN_NAME = 'business_id'
    `)

    if (consumptionColumns.length > 0 && consumptionColumns[0].IS_NULLABLE === 'YES') {
      console.log('修改 business_id 为 NOT NULL...')
      await queryInterface.changeColumn('consumption_records', 'business_id', {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: '业务关联ID，用于幂等控制 - 唯一约束（P1修复）'
      })
      console.log('✅ 字段已修改为 NOT NULL')
    } else {
      console.log('✅ 字段已是 NOT NULL，跳过修改')
    }

    // ========================================
    // 2. 处理 market_listings.business_id
    // ========================================
    console.log('\n=== 步骤2：处理 market_listings.business_id ===')

    // 2.1 检查是否有 NULL 值
    const [marketNulls] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as null_count
      FROM market_listings
      WHERE business_id IS NULL
    `)

    if (marketNulls[0].null_count > 0) {
      // 数据库已清理完毕，不应该存在 NULL 记录
      throw new Error(`发现 ${marketNulls[0].null_count} 条 NULL 记录，请先手动处理历史数据`)
    } else {
      console.log('✅ 无 NULL 记录')
    }

    // 2.2 检查唯一索引是否已存在
    const [marketUniqueIndex] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM market_listings
      WHERE Key_name = 'uk_market_listings_business_id'
    `)

    if (marketUniqueIndex.length === 0) {
      console.log('创建唯一索引: uk_market_listings_business_id')
      await queryInterface.addIndex('market_listings', {
        fields: ['business_id'],
        unique: true,
        name: 'uk_market_listings_business_id',
        type: 'UNIQUE'
      })
      console.log('✅ 唯一索引已创建')
    } else {
      console.log('✅ 唯一索引已存在，跳过创建')
    }

    // 2.3 修改字段为 NOT NULL（如果当前允许 NULL）
    const [marketColumns] = await queryInterface.sequelize.query(`
      SELECT IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'market_listings'
        AND COLUMN_NAME = 'business_id'
    `)

    if (marketColumns.length > 0 && marketColumns[0].IS_NULLABLE === 'YES') {
      console.log('修改 business_id 为 NOT NULL...')
      await queryInterface.changeColumn('market_listings', 'business_id', {
        type: Sequelize.STRING(128),
        allowNull: false,
        comment: '业务ID（Business ID - 幂等键）- 必填字段（P1修复）'
      })
      console.log('✅ 字段已修改为 NOT NULL')
    } else {
      console.log('✅ 字段已是 NOT NULL，跳过修改')
    }

    // ========================================
    // 3. 验证修改结果
    // ========================================
    console.log('\n=== 步骤3：验证修改结果 ===')

    // 验证 consumption_records
    const [verifyConsumption] = await queryInterface.sequelize.query(`
      SELECT
        c.IS_NULLABLE,
        COALESCE(i.Non_unique, 1) as has_unique_index
      FROM INFORMATION_SCHEMA.COLUMNS c
      LEFT JOIN INFORMATION_SCHEMA.STATISTICS i
        ON i.TABLE_SCHEMA = c.TABLE_SCHEMA
        AND i.TABLE_NAME = c.TABLE_NAME
        AND i.COLUMN_NAME = c.COLUMN_NAME
        AND i.INDEX_NAME = 'uk_consumption_records_business_id'
      WHERE c.TABLE_SCHEMA = DATABASE()
        AND c.TABLE_NAME = 'consumption_records'
        AND c.COLUMN_NAME = 'business_id'
    `)

    console.log('consumption_records.business_id:')
    console.log('  - IS_NULLABLE:', verifyConsumption[0]?.IS_NULLABLE || 'N/A')
    console.log('  - 唯一索引存在:', verifyConsumption[0]?.has_unique_index === 0 ? '是' : '否')

    // 验证 market_listings
    const [verifyMarket] = await queryInterface.sequelize.query(`
      SELECT
        c.IS_NULLABLE,
        COALESCE(i.Non_unique, 1) as has_unique_index
      FROM INFORMATION_SCHEMA.COLUMNS c
      LEFT JOIN INFORMATION_SCHEMA.STATISTICS i
        ON i.TABLE_SCHEMA = c.TABLE_SCHEMA
        AND i.TABLE_NAME = c.TABLE_NAME
        AND i.COLUMN_NAME = c.COLUMN_NAME
        AND i.INDEX_NAME = 'uk_market_listings_business_id'
      WHERE c.TABLE_SCHEMA = DATABASE()
        AND c.TABLE_NAME = 'market_listings'
        AND c.COLUMN_NAME = 'business_id'
    `)

    console.log('market_listings.business_id:')
    console.log('  - IS_NULLABLE:', verifyMarket[0]?.IS_NULLABLE || 'N/A')
    console.log('  - 唯一索引存在:', verifyMarket[0]?.has_unique_index === 0 ? '是' : '否')

    console.log('\n✅ P1级幂等性约束修复完成')
  },

  /**
   * 回滚迁移：恢复原始约束状态
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  async down(queryInterface, Sequelize) {
    console.log('回滚迁移：P1级幂等性约束...')

    // 注意：回滚会导致幂等性保护失效，生产环境慎用
    console.log('⚠️ 警告：回滚将移除幂等性约束，可能导致数据重复')

    // 1. 回滚 consumption_records
    console.log('\n=== 回滚 consumption_records ===')

    // 检查并删除唯一索引
    const [consumptionIndex] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM consumption_records
      WHERE Key_name = 'uk_consumption_records_business_id'
    `)

    if (consumptionIndex.length > 0) {
      await queryInterface.removeIndex('consumption_records', 'uk_consumption_records_business_id')
      console.log('✅ 已删除唯一索引')
    }

    // 恢复为允许 NULL
    await queryInterface.changeColumn('consumption_records', 'business_id', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: '业务关联ID，用于幂等控制'
    })
    console.log('✅ 已恢复为允许 NULL')

    // 2. 回滚 market_listings
    console.log('\n=== 回滚 market_listings ===')

    // 检查并删除唯一索引
    const [marketIndex] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM market_listings
      WHERE Key_name = 'uk_market_listings_business_id'
    `)

    if (marketIndex.length > 0) {
      await queryInterface.removeIndex('market_listings', 'uk_market_listings_business_id')
      console.log('✅ 已删除唯一索引')
    }

    // 恢复为允许 NULL
    await queryInterface.changeColumn('market_listings', 'business_id', {
      type: Sequelize.STRING(128),
      allowNull: true,
      comment: '业务ID（Business ID - 幂等键）'
    })
    console.log('✅ 已恢复为允许 NULL')

    console.log('\n✅ 回滚完成')
  }
}
