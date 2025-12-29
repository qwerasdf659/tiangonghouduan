'use strict'

/**
 * 统一资产域 Phase1 迁移 - 清理 CREDITS + campaign_id + item_instance_events
 *
 * 业务场景：
 * 1. 清理 CREDITS 资产码（总额为 0，无风险）- DIAMOND 成为唯一虚拟货币
 * 2. 增加 campaign_id 字段支持 BUDGET_POINTS 多活动并行预算隔离
 * 3. 创建 item_instance_events 表记录物品实例事件（事件溯源）
 * 4. 修复 136 条超时锁（超过 3 分钟的 locked 物品释放）
 *
 * 执行时间：2025-12-28
 * 基于文档：统一资产域架构设计方案.md
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🚀 开始执行统一资产域 Phase1 迁移...')

      // ========================================
      // 1. 清理 CREDITS 资产码（✅ 已拍板：立即删除）
      // ========================================
      console.log('\n📌 步骤1: 清理 CREDITS 资产码')

      // 1.1 删除 account_asset_balances 中的 CREDITS 记录
      const [creditsBalanceResult] = await queryInterface.sequelize.query(
        `DELETE FROM account_asset_balances WHERE asset_code = 'CREDITS'`,
        { transaction }
      )
      console.log(
        `  - 删除 account_asset_balances 中的 CREDITS 记录: ${creditsBalanceResult.affectedRows || 0} 条`
      )

      // 1.2 删除 asset_transactions 中的 CREDITS 记录
      const [creditsTransResult] = await queryInterface.sequelize.query(
        `DELETE FROM asset_transactions WHERE asset_code = 'CREDITS'`,
        { transaction }
      )
      console.log(
        `  - 删除 asset_transactions 中的 CREDITS 记录: ${creditsTransResult.affectedRows || 0} 条`
      )

      // 1.3 删除 material_asset_types 中的 CREDITS 定义（如果存在）
      const [creditsTypeResult] = await queryInterface.sequelize.query(
        `DELETE FROM material_asset_types WHERE asset_code = 'CREDITS'`,
        { transaction }
      )
      console.log(
        `  - 删除 material_asset_types 中的 CREDITS 定义: ${creditsTypeResult.affectedRows || 0} 条`
      )

      console.log('  ✅ CREDITS 清理完成，DIAMOND 成为唯一虚拟货币')

      // ========================================
      // 2. BUDGET_POINTS 迁移到统一账本（增加 campaign_id 字段）
      // ========================================
      console.log('\n📌 步骤2: 增加 campaign_id 字段支持多活动预算隔离')

      // 2.1 检查 campaign_id 字段是否已存在
      const [columns] = await queryInterface.sequelize.query(
        `SHOW COLUMNS FROM account_asset_balances LIKE 'campaign_id'`,
        { transaction }
      )

      if (columns.length === 0) {
        // 2.2 增加 campaign_id 字段
        await queryInterface.addColumn(
          'account_asset_balances',
          'campaign_id',
          {
            type: Sequelize.STRING(50),
            allowNull: true,
            defaultValue: null,
            comment: '活动ID（仅 BUDGET_POINTS 需要，其他资产为 NULL）'
          },
          { transaction }
        )
        console.log('  - 添加 campaign_id 字段完成')

        // 2.3 删除旧唯一索引
        try {
          await queryInterface.removeIndex('account_asset_balances', 'uk_account_asset', {
            transaction
          })
          console.log('  - 删除旧唯一索引 uk_account_asset 完成')
        } catch (e) {
          console.log('  - 旧唯一索引 uk_account_asset 不存在，跳过删除')
        }

        // 2.4 创建新唯一索引（三字段联合）
        await queryInterface.addIndex('account_asset_balances', {
          fields: ['account_id', 'asset_code', 'campaign_id'],
          unique: true,
          name: 'uk_account_asset_campaign',
          transaction
        })
        console.log('  - 创建新唯一索引 uk_account_asset_campaign 完成')

        // 2.5 添加业务约束检查（MySQL 8.0.16+ 支持 CHECK 约束）
        try {
          await queryInterface.sequelize.query(
            `ALTER TABLE account_asset_balances
             ADD CONSTRAINT chk_budget_points_campaign
             CHECK (
               (asset_code != 'BUDGET_POINTS') OR
               (asset_code = 'BUDGET_POINTS' AND campaign_id IS NOT NULL)
             )`,
            { transaction }
          )
          console.log('  - 添加业务约束 chk_budget_points_campaign 完成')
        } catch (e) {
          console.log(
            '  - 业务约束 chk_budget_points_campaign 添加失败（可能 MySQL 版本不支持），跳过'
          )
        }

        console.log('  ✅ campaign_id 字段添加完成')
      } else {
        console.log('  - campaign_id 字段已存在，跳过')
      }

      // ========================================
      // 3. 创建 item_instance_events 表（物品事件审计）
      // ========================================
      console.log('\n📌 步骤3: 创建 item_instance_events 表')

      // 3.1 检查表是否已存在
      const [tables] = await queryInterface.sequelize.query(
        `SHOW TABLES LIKE 'item_instance_events'`,
        { transaction }
      )

      if (tables.length === 0) {
        await queryInterface.createTable(
          'item_instance_events',
          {
            // 主键
            event_id: {
              type: Sequelize.BIGINT,
              primaryKey: true,
              autoIncrement: true,
              comment: '事件ID（主键）'
            },

            // 关联实例
            item_instance_id: {
              type: Sequelize.BIGINT,
              allowNull: false,
              comment: '物品实例ID（关联 item_instances.item_instance_id）',
              references: {
                model: 'item_instances',
                key: 'item_instance_id'
              },
              onDelete: 'RESTRICT',
              onUpdate: 'CASCADE'
            },

            // 事件类型
            event_type: {
              type: Sequelize.STRING(50),
              allowNull: false,
              comment: '事件类型（mint/lock/unlock/transfer/use/expire/destroy）'
            },

            // 操作者
            operator_user_id: {
              type: Sequelize.INTEGER,
              allowNull: true,
              comment: '操作者用户ID（可为 NULL，系统操作时）'
            },
            operator_type: {
              type: Sequelize.ENUM('user', 'admin', 'system'),
              allowNull: false,
              defaultValue: 'user',
              comment: '操作者类型（user/admin/system）'
            },

            // 变更前后状态
            status_before: {
              type: Sequelize.ENUM('available', 'locked', 'transferred', 'used', 'expired'),
              allowNull: true,
              comment: '变更前状态'
            },
            status_after: {
              type: Sequelize.ENUM('available', 'locked', 'transferred', 'used', 'expired'),
              allowNull: true,
              comment: '变更后状态'
            },
            owner_before: {
              type: Sequelize.INTEGER,
              allowNull: true,
              comment: '变更前所有者'
            },
            owner_after: {
              type: Sequelize.INTEGER,
              allowNull: true,
              comment: '变更后所有者'
            },

            // 业务关联（幂等）
            business_type: {
              type: Sequelize.STRING(50),
              allowNull: true,
              comment: '业务类型（lottery_reward/market_transfer/redemption_use）'
            },
            business_id: {
              type: Sequelize.STRING(100),
              allowNull: true,
              comment: '业务ID（幂等键/订单ID）'
            },

            // 扩展信息
            meta: {
              type: Sequelize.JSON,
              allowNull: true,
              comment: '事件元数据（订单信息/转让原因/核销信息等）'
            },

            // 时间戳
            created_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
              comment: '事件时间（北京时间）'
            }
          },
          {
            transaction,
            charset: 'utf8mb4',
            collate: 'utf8mb4_unicode_ci',
            comment: '物品实例事件表（记录所有物品变更事件）'
          }
        )

        // 3.2 创建索引
        await queryInterface.addIndex('item_instance_events', {
          fields: ['item_instance_id', 'created_at'],
          name: 'idx_item_instance_events_instance_time',
          transaction
        })

        await queryInterface.addIndex('item_instance_events', {
          fields: ['event_type', 'created_at'],
          name: 'idx_item_instance_events_type_time',
          transaction
        })

        await queryInterface.addIndex('item_instance_events', {
          fields: ['operator_user_id', 'created_at'],
          name: 'idx_item_instance_events_operator_time',
          transaction
        })

        await queryInterface.addIndex('item_instance_events', {
          fields: ['business_type', 'business_id'],
          name: 'idx_item_instance_events_business',
          transaction
        })

        // 3.3 创建业务幂等唯一约束
        await queryInterface.addIndex('item_instance_events', {
          fields: ['business_type', 'business_id'],
          unique: true,
          name: 'uk_item_instance_events_business',
          where: {
            business_type: { [Sequelize.Op.ne]: null },
            business_id: { [Sequelize.Op.ne]: null }
          },
          transaction
        })

        console.log('  ✅ item_instance_events 表创建完成')
      } else {
        console.log('  - item_instance_events 表已存在，跳过创建')
      }

      // ========================================
      // 4. 修复超时锁（超过 3 分钟的 locked 物品释放）
      // ========================================
      console.log('\n📌 步骤4: 修复超时锁（释放超过 3 分钟的 locked 物品）')

      const [lockFixResult] = await queryInterface.sequelize.query(
        `UPDATE item_instances
         SET
           status = 'available',
           locked_by_order_id = NULL,
           locked_at = NULL
         WHERE
           status = 'locked'
           AND locked_at < DATE_SUB(NOW(), INTERVAL 3 MINUTE)`,
        { transaction }
      )
      console.log(`  - 释放超时锁定物品: ${lockFixResult.affectedRows || 0} 条`)
      console.log('  ✅ 超时锁修复完成')

      // ========================================
      // 5. 验证迁移效果
      // ========================================
      console.log('\n📌 步骤5: 验证迁移效果')

      // 5.1 验证 CREDITS 清理
      const [creditsCheck] = await queryInterface.sequelize.query(
        `SELECT asset_code, COUNT(*) as cnt FROM account_asset_balances WHERE asset_code = 'CREDITS' GROUP BY asset_code`,
        { transaction }
      )
      if (creditsCheck.length === 0) {
        console.log('  ✅ CREDITS 清理验证通过（无残留记录）')
      } else {
        console.log('  ⚠️ CREDITS 清理验证失败（仍有残留记录）')
      }

      // 5.2 验证 campaign_id 字段
      const [campaignCheck] = await queryInterface.sequelize.query(
        `SHOW COLUMNS FROM account_asset_balances LIKE 'campaign_id'`,
        { transaction }
      )
      if (campaignCheck.length > 0) {
        console.log('  ✅ campaign_id 字段验证通过')
      }

      // 5.3 验证 item_instance_events 表
      const [eventsCheck] = await queryInterface.sequelize.query(
        `SHOW TABLES LIKE 'item_instance_events'`,
        { transaction }
      )
      if (eventsCheck.length > 0) {
        console.log('  ✅ item_instance_events 表验证通过')
      }

      // 5.4 验证锁状态
      const [lockCheck] = await queryInterface.sequelize.query(
        `SELECT status, COUNT(*) as cnt FROM item_instances GROUP BY status`,
        { transaction }
      )
      console.log('  ✅ 物品状态分布:')
      lockCheck.forEach(row => {
        console.log(`     - ${row.status}: ${row.cnt} 条`)
      })

      await transaction.commit()
      console.log('\n🎉 统一资产域 Phase1 迁移执行成功！')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔙 回滚统一资产域 Phase1 迁移...')

      // 1. 删除 item_instance_events 表
      await queryInterface.dropTable('item_instance_events', { transaction })
      console.log('  - 删除 item_instance_events 表完成')

      // 2. 删除 campaign_id 相关索引和字段
      try {
        await queryInterface.removeIndex('account_asset_balances', 'uk_account_asset_campaign', {
          transaction
        })
      } catch (e) {
        console.log('  - 索引 uk_account_asset_campaign 不存在，跳过删除')
      }

      try {
        await queryInterface.sequelize.query(
          `ALTER TABLE account_asset_balances DROP CONSTRAINT chk_budget_points_campaign`,
          { transaction }
        )
      } catch (e) {
        console.log('  - 约束 chk_budget_points_campaign 不存在，跳过删除')
      }

      try {
        await queryInterface.removeColumn('account_asset_balances', 'campaign_id', { transaction })
        console.log('  - 删除 campaign_id 字段完成')
      } catch (e) {
        console.log('  - campaign_id 字段不存在，跳过删除')
      }

      // 3. 恢复旧唯一索引
      try {
        await queryInterface.addIndex('account_asset_balances', {
          fields: ['account_id', 'asset_code'],
          unique: true,
          name: 'uk_account_asset',
          transaction
        })
        console.log('  - 恢复旧唯一索引 uk_account_asset 完成')
      } catch (e) {
        console.log('  - 旧唯一索引 uk_account_asset 恢复失败，跳过')
      }

      // 注意：CREDITS 数据无法恢复（已删除且总额为0，不影响业务）
      console.log('  ⚠️ 注意：CREDITS 数据无法恢复（已删除且总额为0）')

      await transaction.commit()
      console.log('🔙 回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
