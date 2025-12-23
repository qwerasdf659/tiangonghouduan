/**
 * 创建缺失的积分系统表
 *
 * 创建时间: 2025年12月23日
 * 说明: 创建 user_points_accounts 和 points_transactions 表
 *       这些表之前通过 sync() 创建，现在需要通过显式迁移管理
 *
 * 表结构:
 * 1. user_points_accounts - 用户积分账户表
 * 2. points_transactions - 积分交易记录表
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🚀 开始创建积分系统表...')
    console.log('='.repeat(70))

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 检查表是否已存在
      const tables = await queryInterface.showAllTables()

      // ==================== 1. 创建 user_points_accounts 表 ====================
      if (!tables.includes('user_points_accounts')) {
        console.log('📦 创建表: user_points_accounts')

        await queryInterface.createTable(
          'user_points_accounts',
          {
            account_id: {
              type: Sequelize.BIGINT,
              primaryKey: true,
              autoIncrement: true,
              comment: '账户唯一标识'
            },
            user_id: {
              type: Sequelize.INTEGER,
              allowNull: false,
              unique: true,
              comment: '关联用户ID',
              references: {
                model: 'users',
                key: 'user_id'
              },
              onDelete: 'CASCADE',
              onUpdate: 'CASCADE'
            },
            available_points: {
              type: Sequelize.DECIMAL(10, 2),
              allowNull: false,
              defaultValue: 0.0,
              comment: '可用积分余额'
            },
            total_earned: {
              type: Sequelize.DECIMAL(10, 2),
              allowNull: false,
              defaultValue: 0.0,
              comment: '累计获得积分'
            },
            total_consumed: {
              type: Sequelize.DECIMAL(10, 2),
              allowNull: false,
              defaultValue: 0.0,
              comment: '累计消耗积分'
            },
            frozen_points: {
              type: Sequelize.DECIMAL(10, 2),
              allowNull: false,
              defaultValue: 0.0,
              comment: '冻结积分（审核中）'
            },
            budget_points: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '预算积分总额（系统内部）'
            },
            remaining_budget_points: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '剩余预算积分（系统内部）'
            },
            used_budget_points: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '已用预算积分（系统内部）'
            },
            total_draw_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '总抽奖次数'
            },
            total_redeem_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '总兑换次数'
            },
            won_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
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
              comment: '最后消耗积分时间'
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
              type: Sequelize.BOOLEAN,
              allowNull: false,
              defaultValue: true,
              comment: '账户是否激活'
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
          },
          {
            transaction,
            comment: '用户积分账户表'
          }
        )

        // 添加索引
        await queryInterface.addIndex('user_points_accounts', ['user_id'], {
          unique: true,
          name: 'unique_user_points_account',
          transaction
        })

        await queryInterface.addIndex('user_points_accounts', ['available_points'], {
          name: 'idx_upa_available_points',
          transaction
        })

        await queryInterface.addIndex('user_points_accounts', ['is_active'], {
          name: 'idx_upa_is_active',
          transaction
        })

        console.log('   ✅ user_points_accounts 表创建成功')
      } else {
        console.log('   ⏭️ user_points_accounts 表已存在，跳过创建')
      }

      // ==================== 2. 创建 points_transactions 表 ====================
      if (!tables.includes('points_transactions')) {
        console.log('📦 创建表: points_transactions')

        await queryInterface.createTable(
          'points_transactions',
          {
            transaction_id: {
              type: Sequelize.BIGINT,
              primaryKey: true,
              autoIncrement: true,
              comment: '交易唯一标识'
            },
            user_id: {
              type: Sequelize.INTEGER,
              allowNull: false,
              comment: '用户ID',
              references: {
                model: 'users',
                key: 'user_id'
              },
              onDelete: 'CASCADE',
              onUpdate: 'CASCADE'
            },
            account_id: {
              type: Sequelize.BIGINT,
              allowNull: false,
              comment: '积分账户ID',
              references: {
                model: 'user_points_accounts',
                key: 'account_id'
              },
              onDelete: 'CASCADE',
              onUpdate: 'CASCADE'
            },
            transaction_type: {
              type: Sequelize.ENUM('earn', 'consume', 'expire', 'refund'),
              allowNull: false,
              comment: '交易类型'
            },
            points_amount: {
              type: Sequelize.DECIMAL(10, 2),
              allowNull: false,
              comment: '积分数量(正数)'
            },
            points_balance_before: {
              type: Sequelize.DECIMAL(10, 2),
              allowNull: false,
              comment: '交易前余额'
            },
            points_balance_after: {
              type: Sequelize.DECIMAL(10, 2),
              allowNull: false,
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
              allowNull: true,
              defaultValue: 'system',
              comment: '积分来源类型'
            },
            business_id: {
              type: Sequelize.STRING(64),
              allowNull: true,
              comment: '关联业务ID'
            },
            reference_type: {
              type: Sequelize.STRING(50),
              allowNull: true,
              comment: '关联业务类型'
            },
            reference_id: {
              type: Sequelize.BIGINT,
              allowNull: true,
              comment: '关联业务ID'
            },
            reference_data: {
              type: Sequelize.JSON,
              allowNull: true,
              comment: '业务参考数据'
            },
            behavior_context: {
              type: Sequelize.JSON,
              allowNull: true,
              comment: '行为上下文数据'
            },
            trigger_event: {
              type: Sequelize.STRING(100),
              allowNull: true,
              comment: '触发事件类型'
            },
            recommendation_source: {
              type: Sequelize.STRING(100),
              allowNull: true,
              comment: '推荐来源'
            },
            transaction_title: {
              type: Sequelize.STRING(255),
              allowNull: false,
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
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP(3)'),
              comment: '交易时间(毫秒精度)'
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
              allowNull: false,
              defaultValue: 'pending',
              comment: '交易状态'
            },
            failure_reason: {
              type: Sequelize.TEXT,
              allowNull: true,
              comment: '失败原因'
            },
            is_deleted: {
              type: Sequelize.TINYINT(1),
              allowNull: false,
              defaultValue: 0,
              comment: '软删除标记：0=未删除，1=已删除'
            },
            deleted_at: {
              type: Sequelize.DATE(3),
              allowNull: true,
              defaultValue: null,
              comment: '删除时间'
            },
            deletion_reason: {
              type: Sequelize.TEXT,
              allowNull: true,
              defaultValue: null,
              comment: '删除原因'
            },
            deleted_by: {
              type: Sequelize.INTEGER,
              allowNull: true,
              defaultValue: null,
              comment: '删除操作者user_id'
            },
            restored_by: {
              type: Sequelize.INTEGER,
              allowNull: true,
              defaultValue: null,
              comment: '恢复操作员ID'
            },
            restored_at: {
              type: Sequelize.DATE(3),
              allowNull: true,
              defaultValue: null,
              comment: '恢复时间'
            },
            restore_reason: {
              type: Sequelize.TEXT,
              allowNull: true,
              defaultValue: null,
              comment: '恢复原因'
            },
            restore_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
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
          },
          {
            transaction,
            comment: '积分交易记录表'
          }
        )

        // 添加索引
        await queryInterface.addIndex('points_transactions', ['user_id', 'transaction_time'], {
          name: 'idx_pt_user_time',
          transaction
        })

        await queryInterface.addIndex('points_transactions', ['transaction_type'], {
          name: 'idx_pt_transaction_type',
          transaction
        })

        await queryInterface.addIndex('points_transactions', ['business_type'], {
          name: 'idx_pt_business_type',
          transaction
        })

        await queryInterface.addIndex('points_transactions', ['status'], {
          name: 'idx_pt_status',
          transaction
        })

        await queryInterface.addIndex('points_transactions', ['transaction_time'], {
          name: 'idx_pt_transaction_time',
          transaction
        })

        await queryInterface.addIndex('points_transactions', ['account_id'], {
          name: 'idx_pt_account_id',
          transaction
        })

        console.log('   ✅ points_transactions 表创建成功')
      } else {
        console.log('   ⏭️ points_transactions 表已存在，跳过创建')
      }

      await transaction.commit()

      console.log('')
      console.log('='.repeat(70))
      console.log('✅ 积分系统表创建完成')
      console.log('='.repeat(70))
    } catch (error) {
      await transaction.rollback()
      console.error('')
      console.error('='.repeat(70))
      console.error('❌ 迁移执行失败')
      console.error('='.repeat(70))
      console.error('错误信息:', error.message)
      console.error('错误堆栈:', error.stack)
      throw error
    }
  },

  down: async (queryInterface, _Sequelize) => {
    console.log('🔄 开始回滚积分系统表...')
    console.log('='.repeat(70))

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 按依赖关系反向删除表
      const tablesToDrop = ['points_transactions', 'user_points_accounts']

      for (const tableName of tablesToDrop) {
        const tables = await queryInterface.showAllTables()
        if (tables.includes(tableName)) {
          console.log(`   删除表: ${tableName}`)
          await queryInterface.dropTable(tableName, { transaction })
        }
      }

      await transaction.commit()

      console.log('')
      console.log('='.repeat(70))
      console.log('✅ 回滚完成')
      console.log('='.repeat(70))
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
