'use strict'

/**
 * 删除 trade_records 表（交易流水收敛决策）
 *
 * 业务背景：
 * - TradeRecord 职责混乱，与 AssetTransaction、TradeOrder 功能重叠
 * - 2026-01-08 交易流水收敛决策：采用三事实模型
 *   - AssetTransaction：资产事实（余额变动的单一数据源）
 *   - TradeOrder：订单事实（C2C交易的单一数据源）
 *   - ItemInstanceEvent：物品事实（所有权变更的单一数据源）
 * - TradeRecord 数据极少（<10条），已无业务调用
 *
 * 删除内容：
 * 1. 备份现有 trade_records 数据到 JSON 日志（down 恢复用）
 * 2. 删除 trade_records 表
 *
 * 决策文档：docs/交易流水收敛方案-AssetTransaction-TradeOrder-TradeRecord-2026-01-08.md
 * 决策时间：2026-01-08
 * 风险等级：🔴 高风险（不可回滚 - 删除表结构）
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 开始执行：删除 trade_records 表（交易流水收敛决策）')

      // 1. 检查表是否存在
      console.log('📊 步骤1：检查 trade_records 表是否存在...')
      const [tables] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.tables 
         WHERE table_schema = DATABASE() AND table_name = 'trade_records'`,
        { transaction }
      )

      if (tables[0].count === 0) {
        console.log('   ⏭️ trade_records 表不存在，跳过删除')
        await transaction.commit()
        return
      }

      // 2. 备份现有数据到控制台日志（便于审计和恢复）
      console.log('📊 步骤2：备份现有数据...')
      const [existingData] = await queryInterface.sequelize.query(`SELECT * FROM trade_records`, {
        transaction
      })

      if (existingData.length > 0) {
        console.log(`   📋 找到 ${existingData.length} 条现有记录，备份到迁移日志：`)
        console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log('   📦 TRADE_RECORDS_BACKUP_START')
        console.log(JSON.stringify(existingData, null, 2))
        console.log('   📦 TRADE_RECORDS_BACKUP_END')
        console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      } else {
        console.log('   ✅ trade_records 表为空，无数据需要备份')
      }

      // 3. 删除相关外键约束（如果有）
      console.log('📊 步骤3：检查并删除外键约束...')
      const [foreignKeys] = await queryInterface.sequelize.query(
        `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'trade_records' 
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
        { transaction }
      )

      for (const fk of foreignKeys) {
        try {
          await queryInterface.sequelize.query(
            `ALTER TABLE trade_records DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`,
            { transaction }
          )
          console.log(`   ✅ 删除外键约束: ${fk.CONSTRAINT_NAME}`)
        } catch (e) {
          console.log(`   ⚠️ 删除外键约束失败（忽略）: ${fk.CONSTRAINT_NAME} - ${e.message}`)
        }
      }

      // 4. 删除表
      console.log('📊 步骤4：删除 trade_records 表...')
      await queryInterface.dropTable('trade_records', { transaction })
      console.log('   ✅ trade_records 表已删除')

      // 5. 提交事务
      await transaction.commit()
      console.log('✅ 迁移完成：trade_records 表已成功删除')
      console.log('   📋 替代方案：')
      console.log('      - 资产变动 → asset_transactions')
      console.log('      - C2C交易 → trade_orders')
      console.log('      - 物品事件 → item_instance_events')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('🔧 回滚：重新创建 trade_records 表')
    console.log('⚠️ 警告：此回滚将创建空表，原始数据需要从迁移日志中手动恢复')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 重新创建 trade_records 表结构
      await queryInterface.createTable(
        'trade_records',
        {
          trade_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '交易记录ID（主键）'
          },
          trade_code: {
            type: Sequelize.STRING(50),
            allowNull: false,
            unique: true,
            comment: '交易编码（唯一，格式：tf_{timestamp}_{random}）'
          },
          trade_type: {
            type: Sequelize.ENUM(
              'inventory_transfer', // 物品转让
              'points_transfer', // 积分转账
              'purchase', // 购买
              'refund' // 退款
            ),
            allowNull: false,
            comment: '交易类型'
          },
          from_user_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '发送方用户ID（系统操作时为NULL）'
          },
          to_user_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '接收方用户ID'
          },
          points_amount: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '交易积分金额'
          },
          fee_points_amount: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '手续费积分金额'
          },
          net_points_amount: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '净积分金额（扣除手续费后）'
          },
          status: {
            type: Sequelize.ENUM(
              'pending', // 待处理
              'processing', // 处理中
              'completed', // 已完成
              'failed', // 失败
              'cancelled' // 已取消
            ),
            allowNull: false,
            defaultValue: 'pending',
            comment: '交易状态'
          },
          item_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '关联物品ID'
          },
          name: {
            type: Sequelize.STRING(255),
            allowNull: true,
            comment: '交易名称/物品名称'
          },
          transfer_note: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '转让备注'
          },
          trade_reason: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '交易原因'
          },
          trade_time: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '交易发起时间'
          },
          processed_time: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '交易处理完成时间'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间'
          }
        },
        {
          transaction,
          comment: '交易记录表（已废弃 - 2026-01-08 交易流水收敛决策，仅用于回滚恢复）'
        }
      )

      // 创建索引
      await queryInterface.addIndex('trade_records', ['trade_code'], {
        name: 'uk_trade_code',
        unique: true,
        transaction
      })

      await queryInterface.addIndex('trade_records', ['from_user_id', 'trade_type'], {
        name: 'idx_from_user_type',
        transaction
      })

      await queryInterface.addIndex('trade_records', ['to_user_id', 'trade_type'], {
        name: 'idx_to_user_type',
        transaction
      })

      await transaction.commit()
      console.log('✅ 回滚完成：trade_records 表已重新创建（空表）')
      console.log('⚠️ 提示：如需恢复数据，请查找迁移日志中的 TRADE_RECORDS_BACKUP_START/END 块')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
