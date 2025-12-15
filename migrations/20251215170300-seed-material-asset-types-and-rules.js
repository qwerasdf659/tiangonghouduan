/**
 * 材料系统初始化数据迁移（Seed Material Asset Types and Conversion Rules）
 *
 * 用途：预置基础数据，使材料系统"开箱可用"
 * 内容：
 *   1. 资产类型（4个）：红系（碎红水晶、完整红水晶）、橙系（橙碎片、完整橙水晶）
 *   2. 转换规则（5个）：合成规则、分解规则、逐级分解规则
 *
 * 创建时间：2025-12-15（北京时间）
 * 参考文档：/docs/材料系统（碎片-水晶）方案.md 第13节
 */

'use strict'

module.exports = {
  /**
   * 迁移UP：插入初始化数据
   * @param {import('sequelize').QueryInterface} queryInterface - Sequelize查询接口
   * @param {import('sequelize').Sequelize} Sequelize - Sequelize实例
   */
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始插入材料系统初始化数据...')

      // ==================== 1. 插入资产类型（4个）====================
      console.log('\n【步骤1】插入material_asset_types（材料资产类型）...')

      // 检查表是否存在
      const [tables] = await queryInterface.sequelize.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME = 'material_asset_types'
         AND TABLE_SCHEMA = '${queryInterface.sequelize.config.database}'`,
        { transaction }
      )

      if (tables.length === 0) {
        throw new Error('❌ material_asset_types表不存在，请先执行表创建迁移')
      }

      // 检查是否已存在数据（幂等性）
      const [existingAssetTypes] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM material_asset_types',
        { transaction }
      )

      if (existingAssetTypes[0].count > 0) {
        console.log(`⚠️ material_asset_types表已有数据（${existingAssetTypes[0].count}条），跳过插入`)
      } else {
        // 插入4个资产类型
        await queryInterface.bulkInsert('material_asset_types', [
          {
            asset_code: 'red_shard',
            display_name: '碎红水晶',
            group_code: 'red',
            form: 'shard',
            tier: 1,
            visible_value_points: 10,
            budget_value_points: 10,
            sort_order: 10,
            is_enabled: 1,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            asset_code: 'red_crystal',
            display_name: '完整红水晶',
            group_code: 'red',
            form: 'crystal',
            tier: 1,
            visible_value_points: 100,
            budget_value_points: 100,
            sort_order: 20,
            is_enabled: 1,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            asset_code: 'orange_shard',
            display_name: '橙碎片',
            group_code: 'orange',
            form: 'shard',
            tier: 2,
            visible_value_points: 1000,
            budget_value_points: 1000,
            sort_order: 30,
            is_enabled: 1,
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            asset_code: 'orange_crystal',
            display_name: '完整橙水晶',
            group_code: 'orange',
            form: 'crystal',
            tier: 2,
            visible_value_points: 10000,
            budget_value_points: 10000,
            sort_order: 40,
            is_enabled: 1,
            created_at: new Date(),
            updated_at: new Date()
          }
        ], { transaction })

        console.log('✅ 成功插入4个资产类型：')
        console.log('   - red_shard（碎红水晶）：可见价值10、预算价值10')
        console.log('   - red_crystal（完整红水晶）：可见价值100、预算价值100')
        console.log('   - orange_shard（橙碎片）：可见价值1000、预算价值1000')
        console.log('   - orange_crystal（完整橙水晶）：可见价值10000、预算价值10000')
      }

      // ==================== 2. 插入转换规则（5个）====================
      console.log('\n【步骤2】插入material_conversion_rules（材料转换规则）...')

      // 检查表是否存在
      const [rulesTables] = await queryInterface.sequelize.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME = 'material_conversion_rules'
         AND TABLE_SCHEMA = '${queryInterface.sequelize.config.database}'`,
        { transaction }
      )

      if (rulesTables.length === 0) {
        throw new Error('❌ material_conversion_rules表不存在，请先执行表创建迁移')
      }

      // 检查是否已存在数据（幂等性）
      const [existingRules] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM material_conversion_rules',
        { transaction }
      )

      if (existingRules[0].count > 0) {
        console.log(`⚠️ material_conversion_rules表已有数据（${existingRules[0].count}条），跳过插入`)
      } else {
        // 当前时间作为生效时间
        const effectiveAt = new Date()

        // 插入5个转换规则
        await queryInterface.bulkInsert('material_conversion_rules', [
          {
            from_asset_code: 'red_shard',
            to_asset_code: 'red_crystal',
            from_amount: 10,
            to_amount: 1,
            effective_at: effectiveAt,
            is_enabled: 1,
            description: '合成规则：10碎红水晶→1完整红水晶',
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            from_asset_code: 'red_crystal',
            to_asset_code: 'red_shard',
            from_amount: 1,
            to_amount: 9,
            effective_at: effectiveAt,
            is_enabled: 1,
            description: '分解规则：1完整红水晶→9碎红水晶（9折下行，抑制套利）',
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            from_asset_code: 'orange_shard',
            to_asset_code: 'red_crystal',
            from_amount: 1,
            to_amount: 9,
            effective_at: effectiveAt,
            is_enabled: 1,
            description: '逐级分解：1橙碎片→9完整红水晶（橙降级到红）',
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            from_asset_code: 'orange_shard',
            to_asset_code: 'orange_crystal',
            from_amount: 10,
            to_amount: 1,
            effective_at: effectiveAt,
            is_enabled: 1,
            description: '合成规则：10橙碎片→1完整橙水晶',
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            from_asset_code: 'orange_crystal',
            to_asset_code: 'orange_shard',
            from_amount: 1,
            to_amount: 9,
            effective_at: effectiveAt,
            is_enabled: 1,
            description: '分解规则：1完整橙水晶→9橙碎片（9折下行，抑制套利）',
            created_at: new Date(),
            updated_at: new Date()
          }
        ], { transaction })

        console.log('✅ 成功插入5个转换规则：')
        console.log('   1. red_shard (10) → red_crystal (1)：合成规则')
        console.log('   2. red_crystal (1) → red_shard (9)：分解规则（9折）')
        console.log('   3. orange_shard (1) → red_crystal (9)：逐级分解')
        console.log('   4. orange_shard (10) → orange_crystal (1)：合成规则')
        console.log('   5. orange_crystal (1) → orange_shard (9)：分解规则（9折）')
      }

      // 提交事务
      await transaction.commit()
      console.log('\n✅ 材料系统初始化数据插入完成')
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      console.error('❌ 初始化数据插入失败，已回滚事务')
      throw error
    }
  },

  /**
   * 迁移DOWN：删除初始化数据
   * @param {import('sequelize').QueryInterface} queryInterface - Sequelize查询接口
   * @param {import('sequelize').Sequelize} Sequelize - Sequelize实例
   */
  async down (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始删除材料系统初始化数据...')

      // ==================== 1. 删除转换规则 ====================
      console.log('\n【步骤1】删除material_conversion_rules中的初始化数据...')

      const [rulesTables] = await queryInterface.sequelize.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME = 'material_conversion_rules'
         AND TABLE_SCHEMA = '${queryInterface.sequelize.config.database}'`,
        { transaction }
      )

      if (rulesTables.length > 0) {
        // 删除初始化的5个规则
        await queryInterface.bulkDelete('material_conversion_rules', {
          from_asset_code: {
            [Sequelize.Op.in]: ['red_shard', 'red_crystal', 'orange_shard', 'orange_crystal']
          }
        }, { transaction })

        console.log('✅ 已删除material_conversion_rules中的初始化规则')
      } else {
        console.log('⚠️ material_conversion_rules表不存在，跳过删除')
      }

      // ==================== 2. 删除资产类型 ====================
      console.log('\n【步骤2】删除material_asset_types中的初始化数据...')

      const [assetTables] = await queryInterface.sequelize.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME = 'material_asset_types'
         AND TABLE_SCHEMA = '${queryInterface.sequelize.config.database}'`,
        { transaction }
      )

      if (assetTables.length > 0) {
        // 删除初始化的4个资产类型
        await queryInterface.bulkDelete('material_asset_types', {
          asset_code: {
            [Sequelize.Op.in]: ['red_shard', 'red_crystal', 'orange_shard', 'orange_crystal']
          }
        }, { transaction })

        console.log('✅ 已删除material_asset_types中的初始化资产类型')
      } else {
        console.log('⚠️ material_asset_types表不存在，跳过删除')
      }

      // 提交事务
      await transaction.commit()
      console.log('\n✅ 材料系统初始化数据删除完成')
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      console.error('❌ 初始化数据删除失败，已回滚事务')
      throw error
    }
  }
}
