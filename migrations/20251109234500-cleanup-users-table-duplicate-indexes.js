/**
 * 数据库迁移：清理users表的严重重复索引问题
 *
 * 创建原因：修复登录API慢查询问题（UPDATE users耗时42秒）
 * 迁移类型：drop-index（删除重复索引）
 * 创建时间：2025-11-09 23:45:00 北京时间
 *
 * 🔴 问题严重性：CRITICAL
 * 根因分析：users表存在大量重复索引，导致UPDATE操作需要更新所有冗余索引
 * 实际影响：登录时UPDATE users SET last_login=?, login_count=? 耗时42秒
 *
 * 问题详情：
 * 1. mobile字段有5个重复的唯一索引
 * 2. status字段有4个重复的普通索引
 * 3. 索引空间占用196KB（数据空间仅16KB）
 *
 * 清理计划：
 * users表 - 保留4个必要索引，删除8个重复索引：
 *
 * ✅ 保留索引（必要）：
 *   - PRIMARY (user_id) - 主键索引
 *   - mobile - mobile字段唯一索引（业务必需）
 *   - idx_status - status字段查询索引（业务必需）
 *   - users_last_login - 登录时间查询索引（性能优化）
 *
 * ❌ 删除索引（冗余）：
 *   - idx_users_mobile（与mobile重复）
 *   - mobile_2（与mobile重复）
 *   - users_mobile（与mobile重复）
 *   - mobile_3（与mobile重复）
 *   - users_is_admin_status（与idx_status重复）
 *   - users_status_is_admin（与idx_status重复）
 *   - idx_users_mobile_status（复合索引，mobile已有单独索引）
 *   - idx_users_status（与idx_status重复）
 *
 * 影响范围：8个重复索引清理，不影响数据和业务功能
 * 预期效果：
 *   - UPDATE users性能提升：42秒 → <100ms（预期提升420倍）
 *   - 索引空间减少：196KB → 约50KB（节约75%）
 *   - 登录响应时间：显著降低到正常范围
 */

'use strict'

module.exports = {
  up: async (queryInterface, _Sequelize) => {
    console.log('🧹 开始清理users表的重复索引（修复登录慢查询问题）...\n')

    try {
      // ========== users 表重复索引清理 ==========
      console.log('📋 清理 users 表的重复索引')
      console.log('🎯 目标：修复UPDATE users耗时42秒的严重性能问题')
      console.log('----------------------------------------')

      const indexesToDrop = [
        // mobile字段重复索引（保留primary mobile，删除4个重复）
        'idx_users_mobile',
        'mobile_2',
        'users_mobile',
        'mobile_3',
        // status字段重复索引（保留idx_status，删除3个重复）
        'users_is_admin_status',
        'users_status_is_admin',
        'idx_users_status',
        // 复合索引（mobile已有单独索引）
        'idx_users_mobile_status'
      ]

      let successCount = 0
      let skipCount = 0

      for (const indexName of indexesToDrop) {
        try {
          await queryInterface.removeIndex('users', indexName)
          console.log(`  ✅ 已删除冗余索引: ${indexName}`)
          successCount++
        } catch (error) {
          if (
            error.message.includes('check that column/key exists') ||
            error.message.includes("doesn't exist")
          ) {
            console.log(`  ⚠️ 索引不存在（已跳过）: ${indexName}`)
            skipCount++
          } else {
            throw error
          }
        }
      }

      console.log('\n✅ users 表索引清理完成')
      console.log(`📊 清理统计: 成功删除${successCount}个索引，跳过${skipCount}个不存在的索引`)

      // 验证剩余索引
      console.log('\n🔍 验证剩余索引...')
      const [remainingIndexes] = await queryInterface.sequelize.query('SHOW INDEX FROM users')
      const indexNames = [...new Set(remainingIndexes.map(idx => idx.Key_name))]
      console.log('📋 保留的索引列表:')
      indexNames.forEach(name => {
        console.log(`  - ${name}`)
      })

      console.log('\n🎉 重复索引清理完成')
      console.log('⚡ 预期效果：')
      console.log('  - UPDATE users 性能：42秒 → <100ms（提升420倍）')
      console.log('  - 索引空间占用：196KB → 约50KB（节约75%）')
      console.log('  - 登录响应时间：显著降低')
      console.log('✅ 迁移成功完成\n')
    } catch (error) {
      console.error('❌ 索引清理失败:', error.message)
      console.error('详细错误:', error.stack)
      throw error
    }
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🔄 开始回滚索引清理（恢复重复索引）...\n')
    console.log('⚠️ 警告：回滚将恢复重复索引，可能导致UPDATE性能问题')

    try {
      console.log('📋 恢复 users 表的重复索引')
      console.log('----------------------------------------')

      // 恢复 mobile 字段的重复索引
      await queryInterface.addIndex('users', ['mobile'], {
        name: 'idx_users_mobile',
        unique: true
      })
      console.log('  ✅ 已恢复索引: idx_users_mobile')

      await queryInterface.addIndex('users', ['mobile'], {
        name: 'mobile_2',
        unique: true
      })
      console.log('  ✅ 已恢复索引: mobile_2')

      await queryInterface.addIndex('users', ['mobile'], {
        name: 'users_mobile',
        unique: true
      })
      console.log('  ✅ 已恢复索引: users_mobile')

      await queryInterface.addIndex('users', ['mobile'], {
        name: 'mobile_3',
        unique: true
      })
      console.log('  ✅ 已恢复索引: mobile_3')

      // 恢复 status 字段的重复索引
      await queryInterface.addIndex('users', ['status'], {
        name: 'users_is_admin_status'
      })
      console.log('  ✅ 已恢复索引: users_is_admin_status')

      await queryInterface.addIndex('users', ['status'], {
        name: 'users_status_is_admin'
      })
      console.log('  ✅ 已恢复索引: users_status_is_admin')

      await queryInterface.addIndex('users', ['status'], {
        name: 'idx_users_status'
      })
      console.log('  ✅ 已恢复索引: idx_users_status')

      // 恢复复合索引
      await queryInterface.addIndex('users', ['mobile', 'status'], {
        name: 'idx_users_mobile_status'
      })
      console.log('  ✅ 已恢复索引: idx_users_mobile_status')

      console.log('\n✅ users 表索引恢复完成')
      console.log('📊 恢复统计: 8个索引已恢复')
      console.log('⚠️ 警告：UPDATE users性能可能再次下降')
      console.log('✅ 回滚成功完成\n')
    } catch (error) {
      console.error('❌ 索引回滚失败:', error.message)
      console.error('详细错误:', error.stack)
      throw error
    }
  }
}
