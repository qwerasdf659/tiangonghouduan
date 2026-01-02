/**
 * 数据库迁移：删除废弃的积分表
 *
 * 创建原因：PointsService 已迁移到 AssetService 统一资产架构
 * 迁移类型：drop-table（删除表）
 * 创建时间：2025-12-30 20:00:00 北京时间
 *
 * 背景说明：
 * 1. 旧架构：UserPointsAccount + PointsTransaction + PointsService
 * 2. 新架构：Account + AccountAssetBalance + AssetTransaction + AssetService
 * 3. 迁移状态：代码层面已完成，需要清理数据库旧表
 *
 * 删除的表：
 * - user_points_accounts：旧积分账户表（已被 account_asset_balances 替代）
 * - points_transactions：旧积分流水表（已被 asset_transactions 替代）
 *
 * 前置检查（执行迁移前已验证）：
 * 1. models/UserPointsAccount.js 已删除
 * 2. models/PointsTransaction.js 已删除
 * 3. services/PointsService.js 已删除
 * 4. routes/v4/shop/points/ 目录已删除
 * 5. 所有代码已切换到 AssetService
 *
 * 数据备份：迁移执行前，旧表数据记录如下：
 * - user_points_accounts: 3条记录
 * - points_transactions: 105条记录
 *
 * 回滚方法：down 函数会重建表结构（不恢复数据）
 *
 * 风险等级：中（破坏性操作，需确认新系统稳定运行）
 */

'use strict'

module.exports = {
  up: async (queryInterface, _Sequelize) => {
    console.log('🗑️ 开始删除废弃的积分表...\n')

    try {
      // ========== 删除 points_transactions 表（先删子表） ==========
      console.log('📋 [1/2] 删除 points_transactions 表')
      console.log('----------------------------------------')

      try {
        // 记录删除前的数据量
        const [countResult] = await queryInterface.sequelize.query(
          'SELECT COUNT(*) as count FROM points_transactions'
        )
        const recordCount = countResult[0]?.count || 0
        console.log(`  📊 表中现有记录数: ${recordCount}`)

        await queryInterface.dropTable('points_transactions')
        console.log('  ✅ 已删除表: points_transactions')
      } catch (error) {
        if (error.message.includes("doesn't exist") || error.message.includes('Unknown table')) {
          console.log('  ⚠️ 表不存在（已跳过）: points_transactions')
        } else {
          throw error
        }
      }

      console.log('')

      // ========== 删除 user_points_accounts 表（主表） ==========
      console.log('📋 [2/2] 删除 user_points_accounts 表')
      console.log('----------------------------------------')

      try {
        // 记录删除前的数据量
        const [countResult] = await queryInterface.sequelize.query(
          'SELECT COUNT(*) as count FROM user_points_accounts'
        )
        const recordCount = countResult[0]?.count || 0
        console.log(`  📊 表中现有记录数: ${recordCount}`)

        await queryInterface.dropTable('user_points_accounts')
        console.log('  ✅ 已删除表: user_points_accounts')
      } catch (error) {
        if (error.message.includes("doesn't exist") || error.message.includes('Unknown table')) {
          console.log('  ⚠️ 表不存在（已跳过）: user_points_accounts')
        } else {
          throw error
        }
      }

      console.log('')
      console.log('🎉 废弃积分表删除完成')
      console.log('📊 清理统计: 2个旧表已删除')
      console.log('✅ 新架构: AssetService + AccountAssetBalance + AssetTransaction')
      console.log('✅ 迁移成功完成\n')
    } catch (error) {
      console.error('❌ 表删除失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🔄 开始回滚（重建废弃的积分表）...\n')
    console.log('⚠️ 注意：回滚只恢复表结构，不恢复数据\n')

    try {
      // ========== 重建 user_points_accounts 表（先建主表） ==========
      console.log('📋 [1/2] 重建 user_points_accounts 表')
      console.log('----------------------------------------')

      await queryInterface.createTable('user_points_accounts', {
        account_id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: '账户ID（主键）'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          unique: true,
          comment: '用户ID（唯一约束）'
        },
        available_points: {
          type: Sequelize.DECIMAL(10, 2),
          defaultValue: 0.0,
          comment: '可用积分'
        },
        total_earned: {
          type: Sequelize.DECIMAL(10, 2),
          defaultValue: 0.0,
          comment: '累计获得积分'
        },
        total_consumed: {
          type: Sequelize.DECIMAL(10, 2),
          defaultValue: 0.0,
          comment: '累计消费积分'
        },
        frozen_points: {
          type: Sequelize.DECIMAL(10, 2),
          defaultValue: 0.0,
          comment: '冻结积分'
        },
        budget_points: {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: '预算积分总额'
        },
        remaining_budget_points: {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: '剩余预算积分'
        },
        used_budget_points: {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: '已用预算积分'
        },
        total_draw_count: {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: '累计抽奖次数'
        },
        total_redeem_count: {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: '累计兑换次数'
        },
        won_count: {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: '中奖次数'
        },
        last_earn_time: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '最后获得积分时间'
        },
        last_consume_time: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '最后消费积分时间'
        },
        last_draw_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '最后抽奖时间'
        },
        last_redeem_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '最后兑换时间'
        },
        is_active: {
          type: Sequelize.TINYINT(1),
          defaultValue: 1,
          comment: '是否激活'
        },
        freeze_reason: {
          type: Sequelize.STRING(255),
          allowNull: true,
          comment: '冻结原因'
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
      })
      console.log('  ✅ 已重建表: user_points_accounts')

      // 添加索引
      await queryInterface.addIndex('user_points_accounts', ['user_id'], {
        name: 'idx_upa_user_id',
        unique: true
      })
      console.log('  ✅ 已添加索引: idx_upa_user_id')

      console.log('')

      // ========== 重建 points_transactions 表 ==========
      console.log('📋 [2/2] 重建 points_transactions 表')
      console.log('----------------------------------------')

      await queryInterface.createTable('points_transactions', {
        transaction_id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: '交易ID（主键）'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '用户ID'
        },
        account_id: {
          type: Sequelize.BIGINT,
          allowNull: true,
          comment: '账户ID'
        },
        transaction_type: {
          type: Sequelize.ENUM('earn', 'consume', 'expire', 'refund'),
          allowNull: false,
          comment: '交易类型'
        },
        points_amount: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          comment: '积分数量'
        },
        points_balance_before: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: true,
          comment: '交易前余额'
        },
        points_balance_after: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: true,
          comment: '交易后余额'
        },
        business_type: {
          type: Sequelize.ENUM(
            'task_complete',
            'lottery_consume',
            'admin_adjust',
            'refund',
            'expire',
            'behavior_reward',
            'recommendation_bonus',
            'activity_bonus',
            'consumption_reward',
            'premium_unlock'
          ),
          allowNull: false,
          comment: '业务类型'
        },
        source_type: {
          type: Sequelize.ENUM('system', 'user', 'admin', 'api', 'batch'),
          defaultValue: 'system',
          comment: '来源类型'
        },
        business_id: {
          type: Sequelize.STRING(64),
          allowNull: true,
          comment: '业务ID'
        },
        reference_type: {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: '关联类型'
        },
        reference_id: {
          type: Sequelize.BIGINT,
          allowNull: true,
          comment: '关联ID'
        },
        reference_data: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '关联数据'
        },
        behavior_context: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '行为上下文'
        },
        trigger_event: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: '触发事件'
        },
        recommendation_source: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: '推荐来源'
        },
        transaction_title: {
          type: Sequelize.STRING(255),
          allowNull: true,
          comment: '交易标题'
        },
        transaction_description: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '交易描述'
        },
        operator_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '操作员ID'
        },
        transaction_time: {
          type: Sequelize.DATE(3),
          allowNull: true,
          comment: '交易时间'
        },
        effective_time: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '生效时间'
        },
        expire_time: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '过期时间'
        },
        status: {
          type: Sequelize.ENUM('pending', 'completed', 'failed', 'cancelled'),
          defaultValue: 'completed',
          comment: '状态'
        },
        failure_reason: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '失败原因'
        },
        is_deleted: {
          type: Sequelize.TINYINT(1),
          defaultValue: 0,
          comment: '是否删除'
        },
        deleted_at: {
          type: Sequelize.DATE(3),
          allowNull: true,
          comment: '删除时间'
        },
        deletion_reason: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '删除原因'
        },
        deleted_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '删除操作员'
        },
        restored_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '恢复操作员'
        },
        restored_at: {
          type: Sequelize.DATE(3),
          allowNull: true,
          comment: '恢复时间'
        },
        restore_reason: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '恢复原因'
        },
        restore_count: {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: '恢复次数'
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
      })
      console.log('  ✅ 已重建表: points_transactions')

      // 添加索引
      await queryInterface.addIndex('points_transactions', ['user_id'], {
        name: 'idx_pt_user_id'
      })
      await queryInterface.addIndex('points_transactions', ['business_id'], {
        name: 'idx_pt_business_id'
      })
      await queryInterface.addIndex('points_transactions', ['status'], {
        name: 'idx_pt_status'
      })
      console.log('  ✅ 已添加索引: idx_pt_user_id, idx_pt_business_id, idx_pt_status')

      console.log('')
      console.log('🔄 表结构回滚完成')
      console.log('⚠️ 注意：数据未恢复，如需恢复数据请从备份导入')
      console.log('✅ 回滚成功完成\n')
    } catch (error) {
      console.error('❌ 表重建失败:', error.message)
      throw error
    }
  }
}
