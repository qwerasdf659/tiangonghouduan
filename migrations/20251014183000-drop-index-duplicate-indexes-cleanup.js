/**
 * 数据库迁移：清理历史遗留的重复索引
 *
 * 创建原因：优化数据库性能，清理重复索引降低存储和维护成本
 * 迁移类型：drop-index（删除索引）
 * 创建时间：2025-10-14 18:30:00 北京时间
 *
 * 问题说明：
 * 1. authentication_sessions表有6个重复索引（session_token相关）
 * 2. customer_service_sessions表有1个重复索引（new_session_id与PRIMARY KEY重复）
 *
 * 清理计划：
 * authentication_sessions表 - 保留6个索引，删除6个重复索引：
 *   ✅ 保留：PRIMARY, session_token(唯一), idx_user_sessions_user_active,
 *           idx_user_sessions_expires, idx_user_sessions_user_created, user_sessions_last_activity
 *   ❌ 删除：session_token_2, session_token_3, user_sessions_session_token,
 *           idx_user_sessions_token, user_sessions_user_type_user_id_is_active,
 *           user_sessions_expires_at_is_active
 *
 * customer_service_sessions表 - 保留5个索引，删除1个重复索引：
 *   ✅ 保留：PRIMARY, idx_customer_sessions_user_id, idx_customer_sessions_admin_id,
 *           idx_customer_sessions_status, idx_customer_sessions_created_at
 *   ❌ 删除：new_session_id（与PRIMARY KEY重复）
 *
 * 影响范围：7个重复索引清理，不影响数据和业务功能
 * 预期效果：降低存储占用，提升写入性能
 */

'use strict'

module.exports = {
  up: async (queryInterface, _Sequelize) => {
    console.log('🧹 开始清理历史遗留的重复索引...\n')

    try {
      // ========== authentication_sessions 表索引清理 ==========
      console.log('📋 [1/2] 清理 authentication_sessions 表的重复索引')
      console.log('----------------------------------------')

      const authIndexesToDrop = [
        'session_token_2',
        'session_token_3',
        'user_sessions_session_token',
        'idx_user_sessions_token',
        'user_sessions_user_type_user_id_is_active',
        'user_sessions_expires_at_is_active'
      ]

      for (const indexName of authIndexesToDrop) {
        try {
          await queryInterface.removeIndex('authentication_sessions', indexName)
          console.log(`  ✅ 已删除索引: ${indexName}`)
        } catch (error) {
          if (error.message.includes('check that column/key exists')) {
            console.log(`  ⚠️ 索引不存在（已跳过）: ${indexName}`)
          } else {
            throw error
          }
        }
      }

      console.log('✅ authentication_sessions 表索引清理完成\n')

      // ========== customer_service_sessions 表索引清理 ==========
      console.log('📋 [2/2] 清理 customer_service_sessions 表的重复索引')
      console.log('----------------------------------------')

      try {
        await queryInterface.removeIndex('customer_service_sessions', 'new_session_id')
        console.log('  ✅ 已删除索引: new_session_id')
      } catch (error) {
        if (error.message.includes('check that column/key exists')) {
          console.log('  ⚠️ 索引不存在（已跳过）: new_session_id')
        } else {
          throw error
        }
      }

      console.log('✅ customer_service_sessions 表索引清理完成\n')

      console.log('🎉 重复索引清理完成')
      console.log('📊 清理统计: 7个重复索引已删除')
      console.log('✅ 迁移成功完成\n')
    } catch (error) {
      console.error('❌ 索引清理失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface, _Sequelize) => {
    console.log('🔄 开始回滚索引清理（恢复重复索引）...\n')

    try {
      // ========== 恢复 authentication_sessions 表的索引 ==========
      console.log('📋 [1/2] 恢复 authentication_sessions 表的索引')
      console.log('----------------------------------------')

      // 恢复 session_token_2
      await queryInterface.addIndex('authentication_sessions', ['session_token'], {
        name: 'session_token_2',
        unique: true
      })
      console.log('  ✅ 已恢复索引: session_token_2')

      // 恢复 session_token_3
      await queryInterface.addIndex('authentication_sessions', ['session_token'], {
        name: 'session_token_3',
        unique: true
      })
      console.log('  ✅ 已恢复索引: session_token_3')

      // 恢复 user_sessions_session_token
      await queryInterface.addIndex('authentication_sessions', ['session_token'], {
        name: 'user_sessions_session_token',
        unique: true
      })
      console.log('  ✅ 已恢复索引: user_sessions_session_token')

      // 恢复 idx_user_sessions_token
      await queryInterface.addIndex('authentication_sessions', ['session_token'], {
        name: 'idx_user_sessions_token'
      })
      console.log('  ✅ 已恢复索引: idx_user_sessions_token')

      // 恢复 user_sessions_user_type_user_id_is_active
      await queryInterface.addIndex('authentication_sessions', ['user_type', 'user_id', 'is_active'], {
        name: 'user_sessions_user_type_user_id_is_active'
      })
      console.log('  ✅ 已恢复索引: user_sessions_user_type_user_id_is_active')

      // 恢复 user_sessions_expires_at_is_active
      await queryInterface.addIndex('authentication_sessions', ['expires_at', 'is_active'], {
        name: 'user_sessions_expires_at_is_active'
      })
      console.log('  ✅ 已恢复索引: user_sessions_expires_at_is_active')

      console.log('✅ authentication_sessions 表索引恢复完成\n')

      // ========== 恢复 customer_service_sessions 表的索引 ==========
      console.log('📋 [2/2] 恢复 customer_service_sessions 表的索引')
      console.log('----------------------------------------')

      await queryInterface.addIndex('customer_service_sessions', ['session_id'], {
        name: 'new_session_id',
        unique: true
      })
      console.log('  ✅ 已恢复索引: new_session_id')

      console.log('✅ customer_service_sessions 表索引恢复完成\n')

      console.log('🔄 索引回滚完成')
      console.log('📊 恢复统计: 7个索引已恢复')
      console.log('✅ 回滚成功完成\n')
    } catch (error) {
      console.error('❌ 索引回滚失败:', error.message)
      throw error
    }
  }
}
