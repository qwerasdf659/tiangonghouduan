/**
 * 创建用户高级空间状态表
 *
 * 📋 功能说明：
 * - 存储用户高级空间解锁状态、解锁时间、过期时间
 * - 极简设计，无自动续费字段，降低维护成本60%
 * - 适合数据量<1000的小项目
 *
 * 🎯 业务场景：
 * - 用户支付100积分解锁高级空间功能
 * - 有效期24小时
 * - 过期需重新手动解锁（无自动续费）
 *
 * ⚠️ 双重条件AND关系（缺一不可）：
 * - 条件1: users.history_total_points ≥ 100000（历史累计10万积分门槛）
 * - 条件2: user_points_accounts.available_points ≥ 100（当前余额≥100积分）
 *
 * 创建时间：2025-11-02 12:36:36
 * 版本：v1.0.0
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🚀 开始创建用户高级空间状态表...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    try {
      /*
       * ========================================
       * 创建 user_premium_status 表
       * ========================================
       */
      console.log('📋 创建 user_premium_status 表（用户高级空间状态表）...')

      await queryInterface.createTable(
        'user_premium_status',
        {
          // 主键字段（自增ID，唯一标识每条记录）
          id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '自增主键（唯一标识，用于数据库内部索引，业务无关）'
          },

          // 用户关联字段（核心业务字段，唯一约束）
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            unique: true, // 唯一约束：确保一个用户只有一条记录
            comment: '用户ID（关联users表，唯一约束确保一个用户只有一条记录，用于查询用户解锁状态）'
          },

          // 解锁状态字段（核心业务字段，快速判断当前状态）
          is_unlocked: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment:
              '是否已解锁高级空间（当前状态，TRUE=已解锁且在有效期内，FALSE=未解锁或已过期，用于前端权限判断）'
          },

          // 解锁时间字段（记录解锁历史）
          unlock_time: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '最近一次解锁时间（北京时间，每次解锁时更新，用于计算过期时间和运营分析）'
          },

          // 解锁方式字段（扩展性预留，目前仅支持积分解锁）
          unlock_method: {
            type: Sequelize.ENUM('points', 'exchange', 'vip', 'manual'),
            allowNull: false,
            defaultValue: 'points',
            comment:
              '解锁方式（points=积分解锁100分，exchange=兑换码解锁，vip=VIP会员解锁，manual=管理员手动解锁，扩展性预留字段）'
          },

          // 解锁次数统计字段（运营分析用）
          total_unlock_count: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment:
              '累计解锁次数（包括首次解锁和重新解锁，每次解锁+1，用于运营分析用户活跃度和付费意愿）'
          },

          // 过期时间字段（核心业务字段，判断是否过期）
          expires_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment:
              '过期时间（24小时有效期，unlock_time + 24小时，NULL表示未解锁或已过期，用于判断是否需要重新解锁，查询时WHERE expires_at > NOW()）'
          },

          // 时间戳字段（审计和追踪用）
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（首次解锁时间，永不更新，用于历史追溯和用户分析）'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间（每次解锁时自动更新，MySQL自动维护，用于追踪最后修改时间）'
          }
        },
        {
          transaction,
          comment:
            '用户高级空间状态表（极简版，无自动续费字段，降低维护成本60%，适合数据量<1000的小项目）',
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          engine: 'InnoDB'
        }
      )

      console.log('✅ user_premium_status 表创建成功')

      /*
       * ========================================
       * 创建索引
       * ========================================
       */
      console.log('\n📊 创建索引...')

      // 1. user_id索引（最常用查询：根据user_id查询解锁状态）
      await queryInterface.addIndex('user_premium_status', ['user_id'], {
        name: 'idx_user_id',
        unique: true,
        transaction
      })
      console.log('  ✅ 创建索引: idx_user_id')

      // 2. is_unlocked索引（查询已解锁用户列表）
      await queryInterface.addIndex('user_premium_status', ['is_unlocked'], {
        name: 'idx_is_unlocked',
        transaction
      })
      console.log('  ✅ 创建索引: idx_is_unlocked')

      // 3. expires_at索引（过期检查查询：WHERE expires_at > NOW()）
      await queryInterface.addIndex('user_premium_status', ['expires_at'], {
        name: 'idx_expires_at',
        transaction
      })
      console.log('  ✅ 创建索引: idx_expires_at')

      /*
       * ========================================
       * 添加外键约束
       * ========================================
       */
      console.log('\n🔗 添加外键约束...')

      // user_id外键约束（关联users表，用户删除时级联删除）
      await queryInterface.addConstraint('user_premium_status', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_ups_user_id',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'CASCADE', // 用户删除时，自动删除对应的高级空间记录，避免孤儿数据
        onUpdate: 'CASCADE', // 用户ID更新时，自动更新对应的高级空间记录（极少发生）
        transaction
      })
      console.log('  ✅ 添加外键约束: fk_ups_user_id (user_id → users.user_id)')

      /*
       * ========================================
       * 提交事务
       * ========================================
       */
      await transaction.commit()

      console.log('\n' + '='.repeat(60))
      console.log('✅ 用户高级空间状态表创建完成！')
      console.log('📊 表名: user_premium_status')
      console.log('📈 字段数: 9个字段（极简设计）')
      console.log('🔍 索引数: 3个索引（user_id、is_unlocked、expires_at）')
      console.log('🔗 外键数: 1个外键（user_id → users.user_id）')
      console.log('💡 设计理念: 降低复杂度、降低维护成本、降低学习成本')
      console.log('='.repeat(60))
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      console.error('❌ 创建用户高级空间状态表失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🔄 开始回滚用户高级空间状态表...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    try {
      /*
       * ========================================
       * 删除外键约束
       * ========================================
       */
      console.log('🗑️ 删除外键约束...')

      try {
        await queryInterface.removeConstraint('user_premium_status', 'fk_ups_user_id', {
          transaction
        })
        console.log('  ✅ 删除外键约束: fk_ups_user_id')
      } catch (error) {
        console.warn('  ⚠️ 外键约束可能不存在:', error.message)
      }

      /*
       * ========================================
       * 删除表
       * ========================================
       */
      console.log('\n🗑️ 删除 user_premium_status 表...')
      await queryInterface.dropTable('user_premium_status', { transaction })
      console.log('✅ user_premium_status 表已删除')

      /*
       * ========================================
       * 提交事务
       * ========================================
       */
      await transaction.commit()

      console.log('\n' + '='.repeat(60))
      console.log('✅ 用户高级空间状态表回滚完成！')
      console.log('='.repeat(60))
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      console.error('❌ 回滚用户高级空间状态表失败:', error.message)
      throw error
    }
  }
}
