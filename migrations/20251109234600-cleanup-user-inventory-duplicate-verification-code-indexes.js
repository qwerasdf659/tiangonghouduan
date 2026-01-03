/**
 * 数据库迁移：清理user_inventory表的verification_code重复索引问题
 *
 * 创建原因：优化生成核销码API性能，清理冗余索引
 * 迁移类型：drop-index（删除重复索引）
 * 创建时间：2025-11-09 23:46:00 北京时间
 *
 * 🟡 问题严重性：MEDIUM（性能优化，非阻塞性问题）
 * 根因分析：user_inventory表verification_code字段存在3个索引（2个唯一索引+1个普通索引）
 * 实际影响：UPDATE操作需要维护多个冗余索引，影响性能
 *
 * 问题详情：
 * 1. verification_code字段有3个索引：
 *    - verification_code（唯一索引）
 *    - user_inventory_verification_code（唯一索引，重复）
 *    - idx_verification_code（普通索引，重复）
 * 2. 每次UPDATE verification_code都需要更新3个索引
 * 3. 造成不必要的性能损耗和空间浪费
 *
 * 清理计划：
 * user_inventory表 - 保留1个必要索引，删除2个重复索引：
 *
 * ✅ 保留索引（必要）：
 *   - verification_code - verification_code字段唯一索引（业务必需，防止重复核销码）
 *
 * ❌ 删除索引（冗余）：
 *   - user_inventory_verification_code（与verification_code重复的唯一索引）
 *   - idx_verification_code（与verification_code重复的普通索引）
 *
 * 影响范围：2个重复索引清理，不影响数据和业务功能
 * 预期效果：
 *   - UPDATE user_inventory SET verification_code性能提升约10-20%
 *   - 索引空间减少约66%（3个索引→1个索引）
 *   - 生成核销码API响应时间略微降低
 */

'use strict'

module.exports = {
  up: async (queryInterface, _Sequelize) => {
    console.log('🧹 开始清理user_inventory表的verification_code重复索引...\n')

    try {
      // ========== user_inventory 表verification_code重复索引清理 ==========
      console.log('📋 清理 user_inventory 表的 verification_code 重复索引')
      console.log('🎯 目标：优化生成核销码API性能')
      console.log('----------------------------------------')

      const indexesToDrop = [
        // verification_code字段重复索引（保留primary verification_code，删除2个重复）
        'user_inventory_verification_code', // 重复的唯一索引
        'idx_verification_code' // 重复的普通索引
      ]

      let successCount = 0
      let skipCount = 0

      for (const indexName of indexesToDrop) {
        try {
          await queryInterface.removeIndex('user_inventory', indexName)
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

      console.log('\n✅ user_inventory 表索引清理完成')
      console.log(`📊 清理统计: 成功删除${successCount}个索引，跳过${skipCount}个不存在的索引`)

      // 验证剩余索引
      console.log('\n🔍 验证剩余的verification_code相关索引...')
      const [remainingIndexes] = await queryInterface.sequelize.query(
        "SHOW INDEX FROM user_inventory WHERE Column_name = 'verification_code'"
      )
      console.log('📋 保留的verification_code索引列表:')
      remainingIndexes.forEach(idx => {
        console.log(`  - ${idx.Key_name} (${idx.Non_unique === 0 ? '唯一索引' : '普通索引'})`)
      })

      console.log('\n🎉 重复索引清理完成')
      console.log('⚡ 预期效果：')
      console.log('  - UPDATE verification_code 性能提升：约10-20%')
      console.log('  - 索引空间占用：减少约66%（3个索引→1个索引）')
      console.log('  - 生成核销码API响应时间：略微降低')
      console.log('✅ 迁移成功完成\n')
    } catch (error) {
      console.error('❌ 索引清理失败:', error.message)
      console.error('详细错误:', error.stack)
      throw error
    }
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🔄 开始回滚索引清理（恢复重复索引）...\n')
    console.log('⚠️ 警告：回滚将恢复重复索引，可能影响UPDATE性能')

    try {
      console.log('📋 恢复 user_inventory 表的 verification_code 重复索引')
      console.log('----------------------------------------')

      // 恢复 verification_code 字段的重复唯一索引
      await queryInterface.addIndex('user_inventory', ['verification_code'], {
        name: 'user_inventory_verification_code',
        unique: true
      })
      console.log('  ✅ 已恢复唯一索引: user_inventory_verification_code')

      // 恢复 verification_code 字段的重复普通索引
      await queryInterface.addIndex('user_inventory', ['verification_code'], {
        name: 'idx_verification_code'
      })
      console.log('  ✅ 已恢复普通索引: idx_verification_code')

      console.log('\n✅ user_inventory 表索引恢复完成')
      console.log('📊 恢复统计: 2个索引已恢复')
      console.log('⚠️ 警告：UPDATE verification_code性能可能略微下降')
      console.log('✅ 回滚成功完成\n')
    } catch (error) {
      console.error('❌ 索引回滚失败:', error.message)
      console.error('详细错误:', error.stack)
      throw error
    }
  }
}
