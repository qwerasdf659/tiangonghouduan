/**
 * 创建商家表 + 商家类型字典数据
 *
 * 业务场景：
 *   - 多商家接入平台：餐厅、商铺、小游戏、服务商
 *   - 门店(stores)归属商家、奖品(lottery_prizes)归属商家
 *   - 物品(items)标记来源商家
 *
 * 依赖：
 *   - accounts 表（settlement_account_id 外键预留）
 *   - system_dictionaries 表（merchant_type 字典）
 *
 * @module migrations/20260223174556-create-merchants-table
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🏪 开始创建商家表和字典数据...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ============================================================
      // 第一步：创建 merchants 表
      // ============================================================
      console.log('\n📌 第一步：创建 merchants 表...')

      await queryInterface.createTable(
        'merchants',
        {
          merchant_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            comment: '商家ID（主键）'
          },
          merchant_name: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '商家名称（如：某某餐厅、XX珠宝、YY小游戏）'
          },
          merchant_type: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment:
              '商家类型（字典表 system_dictionaries dict_type=merchant_type 校验：restaurant/shop/game/service）'
          },
          contact_name: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '联系人姓名'
          },
          contact_mobile: {
            type: Sequelize.STRING(20),
            allowNull: true,
            comment: '联系电话'
          },
          logo_url: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: 'LOGO图片URL（Sealos对象存储）'
          },
          status: {
            type: Sequelize.ENUM('active', 'inactive', 'suspended'),
            allowNull: false,
            defaultValue: 'active',
            comment: '商家状态：active-正常/inactive-停用/suspended-暂停'
          },
          settlement_account_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            references: {
              model: 'accounts',
              key: 'account_id'
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
            comment: '结算账户ID（预留，关联 accounts 表，MVP阶段为NULL）'
          },
          commission_rate: {
            type: Sequelize.DECIMAL(4, 2),
            allowNull: false,
            defaultValue: 0.0,
            comment: '平台抽佣比例（0.00~99.99%，0表示不抽佣）'
          },
          notes: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '备注信息'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW'),
            comment: '创建时间'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW'),
            comment: '更新时间'
          }
        },
        {
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '商家信息表（多商家接入：餐厅/商铺/小游戏/服务商）',
          transaction
        }
      )

      console.log('  ✅ merchants 表创建成功')

      // 添加索引
      await queryInterface.addIndex('merchants', ['merchant_type'], {
        name: 'idx_merchants_type',
        transaction
      })
      await queryInterface.addIndex('merchants', ['status'], {
        name: 'idx_merchants_status',
        transaction
      })
      console.log('  ✅ 索引创建成功')

      // ============================================================
      // 第二步：插入 merchant_type 字典数据
      // ============================================================
      console.log('\n📌 第二步：插入商家类型字典数据...')

      const [existingDict] = await queryInterface.sequelize.query(
        "SELECT COUNT(*) as cnt FROM system_dictionaries WHERE dict_type = 'merchant_type'",
        { transaction }
      )

      if (existingDict[0].cnt === 0) {
        await queryInterface.bulkInsert(
          'system_dictionaries',
          [
            {
              dict_type: 'merchant_type',
              dict_code: 'restaurant',
              dict_name: '餐厅',
              dict_color: '#ef4444',
              sort_order: 1,
              is_enabled: true,
              remark: '提供餐饮类奖品，用户到店核销',
              version: 1,
              created_at: new Date(),
              updated_at: new Date()
            },
            {
              dict_type: 'merchant_type',
              dict_code: 'shop',
              dict_name: '商铺',
              dict_color: '#3b82f6',
              sort_order: 2,
              is_enabled: true,
              remark: '提供实物商品，到店核销或邮寄',
              version: 1,
              created_at: new Date(),
              updated_at: new Date()
            },
            {
              dict_type: 'merchant_type',
              dict_code: 'game',
              dict_name: '小游戏',
              dict_color: '#8b5cf6',
              sort_order: 3,
              is_enabled: true,
              remark: '产出虚拟道具和游戏货币',
              version: 1,
              created_at: new Date(),
              updated_at: new Date()
            },
            {
              dict_type: 'merchant_type',
              dict_code: 'service',
              dict_name: '服务商',
              dict_color: '#10b981',
              sort_order: 4,
              is_enabled: true,
              remark: '提供服务类奖品',
              version: 1,
              created_at: new Date(),
              updated_at: new Date()
            }
          ],
          { transaction }
        )
        console.log('  ✅ 插入 4 条 merchant_type 字典记录')
      } else {
        console.log(`  ⏭️ merchant_type 字典已存在 ${existingDict[0].cnt} 条，跳过`)
      }

      await transaction.commit()
      console.log('\n✅ 商家表和字典数据创建完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface, _Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      await queryInterface.sequelize.query(
        "DELETE FROM system_dictionaries WHERE dict_type = 'merchant_type'",
        { transaction }
      )

      await queryInterface.dropTable('merchants', { transaction })

      await transaction.commit()
      console.log('✅ 回滚：删除 merchants 表和字典数据')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
