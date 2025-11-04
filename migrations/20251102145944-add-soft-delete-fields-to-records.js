/**
 * 迁移脚本: 为记录表添加软删除字段
 *
 * 创建时间: 2025-11-02
 * 迁移版本: V4.0.0
 * 关联文档: API7-删除记录实施方案.md
 *
 * 功能说明:
 * - 为3个表添加统一的软删除字段（is_deleted, deleted_at）
 * - 实现统一软删除机制，所有删除操作都是软删除
 * - 前端查询时自动过滤已删除记录（WHERE is_deleted=0）
 * - 管理员可恢复已删除记录（将is_deleted改回0）
 *
 * 影响表:
 * 1. consumption_records - 消费记录表
 * 2. exchange_records - 兑换记录表
 * 3. points_transactions - 积分交易记录表
 *
 * 业务价值:
 * - 数据永久保留：所有记录物理保留，确保审计追踪
 * - 用户体验优化：用户可以隐藏不想看到的记录
 * - 管理员可恢复：后台可以恢复所有已删除记录
 * - 技术统一性：3个表使用相同的软删除机制
 */

'use strict'

module.exports = {
  /**
   * 迁移执行（向上迁移 - UP）
   * 为3个表添加软删除字段和索引
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize数据类型定义
   * @returns {Promise<void>} 返回Promise
   */
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始执行软删除字段迁移...')

      /*
       * ========================================
       * 1. 为 consumption_records 表添加软删除字段
       * ========================================
       */
      console.log('1️⃣ 检查 consumption_records 表软删除字段...')

      try {
        // 添加 is_deleted 字段
        await queryInterface.addColumn(
          'consumption_records',
          'is_deleted',
          {
            type: Sequelize.TINYINT(1),
            allowNull: false,
            defaultValue: 0,
            comment: '软删除标记：0=未删除（默认），1=已删除（用户端隐藏）',
            after: 'updated_at' // 在updated_at字段后添加
          },
          { transaction }
        )
        console.log('   ✅ 添加 is_deleted 字段成功')
      } catch (error) {
        if (error.message.includes('Duplicate column')) {
          console.log('   ✅ is_deleted 字段已存在，跳过')
        } else {
          throw error
        }
      }

      try {
        // 添加 deleted_at 字段
        await queryInterface.addColumn(
          'consumption_records',
          'deleted_at',
          {
            type: Sequelize.DATE(3), // 毫秒精度
            allowNull: true,
            defaultValue: null,
            comment: '删除时间（软删除时记录，管理员恢复时清空）',
            after: 'is_deleted'
          },
          { transaction }
        )
        console.log('   ✅ 添加 deleted_at 字段成功')
      } catch (error) {
        if (error.message.includes('Duplicate column')) {
          console.log('   ✅ deleted_at 字段已存在，跳过')
        } else {
          throw error
        }
      }

      try {
        // 添加索引（加速查询已删除记录）
        await queryInterface.addIndex(
          'consumption_records',
          ['is_deleted'],
          {
            name: 'idx_consumption_is_deleted',
            comment: '软删除标记索引（用于过滤已删除记录和管理员查询）',
            transaction
          }
        )
        console.log('   ✅ 添加 is_deleted 索引成功')
      } catch (error) {
        if (error.message.includes('Duplicate key')) {
          console.log('   ✅ is_deleted 索引已存在，跳过')
        } else {
          throw error
        }
      }

      /*
       * ========================================
       * 2. 为 exchange_records 表添加软删除字段
       * ========================================
       */
      console.log('\n2️⃣ 检查 exchange_records 表软删除字段...')

      try {
        await queryInterface.addColumn(
          'exchange_records',
          'is_deleted',
          {
            type: Sequelize.TINYINT(1),
            allowNull: false,
            defaultValue: 0,
            comment: '软删除标记：0=未删除（默认），1=已删除（用户端隐藏）',
            after: 'updated_at'
          },
          { transaction }
        )
        console.log('   ✅ 添加 is_deleted 字段成功')
      } catch (error) {
        if (error.message.includes('Duplicate column')) {
          console.log('   ✅ is_deleted 字段已存在，跳过')
        } else {
          throw error
        }
      }

      try {
        await queryInterface.addColumn(
          'exchange_records',
          'deleted_at',
          {
            type: Sequelize.DATE(3),
            allowNull: true,
            defaultValue: null,
            comment: '删除时间（软删除时记录，管理员恢复时清空）',
            after: 'is_deleted'
          },
          { transaction }
        )
        console.log('   ✅ 添加 deleted_at 字段成功')
      } catch (error) {
        if (error.message.includes('Duplicate column')) {
          console.log('   ✅ deleted_at 字段已存在，跳过')
        } else {
          throw error
        }
      }

      try {
        await queryInterface.addIndex(
          'exchange_records',
          ['is_deleted'],
          {
            name: 'idx_exchange_is_deleted',
            comment: '软删除标记索引',
            transaction
          }
        )
        console.log('   ✅ 添加 is_deleted 索引成功')
      } catch (error) {
        if (error.message.includes('Duplicate key')) {
          console.log('   ✅ is_deleted 索引已存在，跳过')
        } else {
          throw error
        }
      }

      /*
       * ========================================
       * 3. 为 points_transactions 表添加软删除字段
       * ========================================
       */
      console.log('\n3️⃣ 检查 points_transactions 表软删除字段...')

      try {
        await queryInterface.addColumn(
          'points_transactions',
          'is_deleted',
          {
            type: Sequelize.TINYINT(1),
            allowNull: false,
            defaultValue: 0,
            comment: '软删除标记：0=未删除（默认），1=已删除（用户端隐藏）',
            after: 'updated_at'
          },
          { transaction }
        )
        console.log('   ✅ 添加 is_deleted 字段成功')
      } catch (error) {
        if (error.message.includes('Duplicate column')) {
          console.log('   ✅ is_deleted 字段已存在，跳过')
        } else {
          throw error
        }
      }

      try {
        await queryInterface.addColumn(
          'points_transactions',
          'deleted_at',
          {
            type: Sequelize.DATE(3),
            allowNull: true,
            defaultValue: null,
            comment: '删除时间（软删除时记录，管理员恢复时清空）',
            after: 'is_deleted'
          },
          { transaction }
        )
        console.log('   ✅ 添加 deleted_at 字段成功')
      } catch (error) {
        if (error.message.includes('Duplicate column')) {
          console.log('   ✅ deleted_at 字段已存在，跳过')
        } else {
          throw error
        }
      }

      try {
        await queryInterface.addIndex(
          'points_transactions',
          ['is_deleted'],
          {
            name: 'idx_points_transactions_is_deleted',
            comment: '软删除标记索引',
            transaction
          }
        )
        console.log('   ✅ 添加 is_deleted 索引成功')
      } catch (error) {
        if (error.message.includes('Duplicate key')) {
          console.log('   ✅ is_deleted 索引已存在，跳过')
        } else {
          throw error
        }
      }

      // 提交事务
      await transaction.commit()
      console.log('\n✅ 软删除字段迁移完成')
      console.log('📊 影响表数: 3个（consumption_records, exchange_records, points_transactions）')
      console.log('📊 添加字段数: 6个（每个表2个字段）')
      console.log('📊 添加索引数: 3个（每个表1个索引）')
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      console.error('❌ 软删除字段迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 迁移回滚（向下迁移 - DOWN）
   * 删除软删除字段和索引
   *
   * ⚠️ 警告：回滚会永久删除软删除标记和删除时间数据
   * 建议：生产环境不要执行回滚操作
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} _Sequelize - Sequelize数据类型定义（未使用）
   * @returns {Promise<void>} 返回Promise
   */
  down: async (queryInterface, _Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚软删除字段迁移...')
      console.log('⚠️  警告：此操作会删除所有软删除标记和删除时间数据')

      // 1. 回滚 consumption_records 表
      console.log('1️⃣ 回滚 consumption_records 表...')
      try {
        await queryInterface.removeIndex('consumption_records', 'idx_consumption_is_deleted', { transaction })
        console.log('   ✅ 删除索引成功')
      } catch (error) {
        console.log('   ⚠️  索引可能不存在，跳过')
      }

      try {
        await queryInterface.removeColumn('consumption_records', 'deleted_at', { transaction })
        console.log('   ✅ 删除 deleted_at 字段成功')
      } catch (error) {
        console.log('   ⚠️  deleted_at 字段可能不存在，跳过')
      }

      try {
        await queryInterface.removeColumn('consumption_records', 'is_deleted', { transaction })
        console.log('   ✅ 删除 is_deleted 字段成功')
      } catch (error) {
        console.log('   ⚠️  is_deleted 字段可能不存在，跳过')
      }

      // 2. 回滚 exchange_records 表
      console.log('\n2️⃣ 回滚 exchange_records 表...')
      try {
        await queryInterface.removeIndex('exchange_records', 'idx_exchange_is_deleted', { transaction })
        console.log('   ✅ 删除索引成功')
      } catch (error) {
        console.log('   ⚠️  索引可能不存在，跳过')
      }

      try {
        await queryInterface.removeColumn('exchange_records', 'deleted_at', { transaction })
        console.log('   ✅ 删除 deleted_at 字段成功')
      } catch (error) {
        console.log('   ⚠️  deleted_at 字段可能不存在，跳过')
      }

      try {
        await queryInterface.removeColumn('exchange_records', 'is_deleted', { transaction })
        console.log('   ✅ 删除 is_deleted 字段成功')
      } catch (error) {
        console.log('   ⚠️  is_deleted 字段可能不存在，跳过')
      }

      // 3. 回滚 points_transactions 表
      console.log('\n3️⃣ 回滚 points_transactions 表...')
      try {
        await queryInterface.removeIndex('points_transactions', 'idx_points_transactions_is_deleted', { transaction })
        console.log('   ✅ 删除索引成功')
      } catch (error) {
        console.log('   ⚠️  索引可能不存在，跳过')
      }

      try {
        await queryInterface.removeColumn('points_transactions', 'deleted_at', { transaction })
        console.log('   ✅ 删除 deleted_at 字段成功')
      } catch (error) {
        console.log('   ⚠️  deleted_at 字段可能不存在，跳过')
      }

      try {
        await queryInterface.removeColumn('points_transactions', 'is_deleted', { transaction })
        console.log('   ✅ 删除 is_deleted 字段成功')
      } catch (error) {
        console.log('   ⚠️  is_deleted 字段可能不存在，跳过')
      }

      // 提交事务
      await transaction.commit()
      console.log('\n✅ 软删除字段回滚完成')
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      console.error('❌ 软删除字段回滚失败:', error.message)
      throw error
    }
  }
}
