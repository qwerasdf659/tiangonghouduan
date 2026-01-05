'use strict'

/**
 * Phase 4: 删除旧材料和钻石相关表
 *
 * 删除的表：
 * 1. user_material_balances - 旧材料余额表（已迁移到account_asset_balances）
 * 2. material_transactions - 旧材料流水表（已迁移到asset_transactions）
 * 3. user_diamond_accounts - 旧钻石账户表（已迁移到account_asset_balances）
 * 4. diamond_transactions - 旧钻石流水表（已迁移到asset_transactions）
 * 5. material_asset_types - 材料资产类型配置表（规则已硬编码）
 * 6. material_conversion_rules - 材料转换规则表（规则已硬编码）
 *
 * 注意：执行前请确保：
 * 1. 历史数据已归档备份
 * 2. 所有业务已迁移到统一账本（account_asset_balances + asset_transactions）
 * 3. MaterialService和DiamondService的写方法已全部禁用
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🗑️ Phase 4: 开始删除旧材料和钻石相关表...')

    // 1. 删除视图（如果存在）
    try {
      await queryInterface.sequelize.query('DROP VIEW IF EXISTS v_legacy_material_balances')
      console.log('✅ 删除视图 v_legacy_material_balances')
    } catch (error) {
      console.log('⚠️ 删除视图 v_legacy_material_balances 失败（可能不存在）:', error.message)
    }

    try {
      await queryInterface.sequelize.query('DROP VIEW IF EXISTS v_legacy_diamond_accounts')
      console.log('✅ 删除视图 v_legacy_diamond_accounts')
    } catch (error) {
      console.log('⚠️ 删除视图 v_legacy_diamond_accounts 失败（可能不存在）:', error.message)
    }

    // 2. 删除旧流水表（历史数据，先删流水再删余额）
    await queryInterface.dropTable('material_transactions')
    console.log('✅ 删除表 material_transactions')

    await queryInterface.dropTable('diamond_transactions')
    console.log('✅ 删除表 diamond_transactions')

    // 3. 删除旧余额表
    await queryInterface.dropTable('user_material_balances')
    console.log('✅ 删除表 user_material_balances')

    await queryInterface.dropTable('user_diamond_accounts')
    console.log('✅ 删除表 user_diamond_accounts')

    // 4. 删除配置表（规则已硬编码到AssetConversionService）
    await queryInterface.dropTable('material_conversion_rules')
    console.log('✅ 删除表 material_conversion_rules')

    // 5. 删除外键约束（如果存在）
    try {
      await queryInterface.sequelize.query(`
        ALTER TABLE lottery_prizes 
        DROP FOREIGN KEY fk_lp_material_asset_code
      `)
      console.log('✅ 删除外键约束 fk_lp_material_asset_code')
    } catch (error) {
      console.log('⚠️ 删除外键约束失败（可能不存在）:', error.message)
    }

    await queryInterface.dropTable('material_asset_types')
    console.log('✅ 删除表 material_asset_types')

    console.log('🎉 Phase 4: 旧表删除完成！所有材料和钻石数据已迁移到统一账本。')
  },

  down: async (queryInterface, Sequelize) => {
    console.log('⚠️ Phase 4回滚：重建旧材料和钻石相关表...')
    console.log('❌ 注意：此回滚仅重建表结构，不会恢复历史数据！')
    console.log('❌ 如需恢复数据，请从备份文件中导入。')

    // 1. 重建 material_asset_types 表
    await queryInterface.createTable('material_asset_types', {
      asset_type_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        comment: '资产类型ID'
      },
      asset_code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
        comment: '资产代码（如：red_shard、red_crystal）'
      },
      display_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: '展示名称（如：碎红水晶、完整红水晶）'
      },
      category: {
        type: Sequelize.ENUM('shard', 'crystal', 'other'),
        defaultValue: 'shard',
        comment: '分类：shard=碎片, crystal=水晶, other=其他'
      },
      visible_value_points: {
        type: Sequelize.INTEGER.UNSIGNED,
        defaultValue: 0,
        comment: '可见价值（积分口径，用于前端展示）'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: '资产描述'
      },
      is_enabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: '是否启用'
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '创建时间'
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
        comment: '更新时间'
      }
    })

    // 2. 重建 material_conversion_rules 表
    await queryInterface.createTable('material_conversion_rules', {
      rule_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        comment: '规则ID'
      },
      from_asset_code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: '源资产代码'
      },
      to_asset_code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: '目标资产代码'
      },
      from_amount: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        comment: '源资产数量'
      },
      to_amount: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        comment: '目标资产数量'
      },
      effective_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '生效时间'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: '规则描述'
      },
      is_enabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: '是否启用'
      },
      created_by: {
        type: Sequelize.STRING(36),
        allowNull: true,
        comment: '创建人user_id'
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    })

    // 3. 重建 user_material_balances 表
    await queryInterface.createTable('user_material_balances', {
      balance_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
      },
      user_id: {
        type: Sequelize.STRING(36),
        allowNull: false
      },
      asset_code: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      balance: {
        type: Sequelize.INTEGER.UNSIGNED,
        defaultValue: 0
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    })

    // 4. 重建 material_transactions 表
    await queryInterface.createTable('material_transactions', {
      tx_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
      },
      user_id: {
        type: Sequelize.STRING(36),
        allowNull: false
      },
      asset_code: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      amount: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      balance_before: {
        type: Sequelize.INTEGER.UNSIGNED,
        defaultValue: 0
      },
      balance_after: {
        type: Sequelize.INTEGER.UNSIGNED,
        defaultValue: 0
      },
      tx_type: {
        type: Sequelize.ENUM('earn', 'consume', 'convert', 'admin_adjust'),
        allowNull: false
      },
      business_type: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      business_id: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      title: {
        type: Sequelize.STRING(200),
        allowNull: false
      },
      meta: {
        type: Sequelize.JSON,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    })

    // 5. 重建 user_diamond_accounts 表
    await queryInterface.createTable('user_diamond_accounts', {
      account_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
      },
      user_id: {
        type: Sequelize.STRING(36),
        allowNull: false,
        unique: true
      },
      balance: {
        type: Sequelize.INTEGER.UNSIGNED,
        defaultValue: 0
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    })

    // 6. 重建 diamond_transactions 表
    await queryInterface.createTable('diamond_transactions', {
      tx_id: {
        type: Sequelize.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
      },
      user_id: {
        type: Sequelize.STRING(36),
        allowNull: false
      },
      amount: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      balance_before: {
        type: Sequelize.INTEGER.UNSIGNED,
        defaultValue: 0
      },
      balance_after: {
        type: Sequelize.INTEGER.UNSIGNED,
        defaultValue: 0
      },
      tx_type: {
        type: Sequelize.ENUM('earn', 'consume', 'admin_adjust'),
        allowNull: false
      },
      business_type: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      business_id: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      title: {
        type: Sequelize.STRING(200),
        allowNull: false
      },
      meta: {
        type: Sequelize.JSON,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    })

    console.log('✅ 旧表结构已重建（数据需要从备份文件恢复）')
  }
}
