/**
 * 数据库迁移：为lottery_prizes表添加sort_order唯一约束
 *
 * 创建原因：防止同一活动内奖品排序重复，避免前端转盘位置冲突
 * 迁移类型：create-index（创建唯一索引）
 * 创建时间：2025-11-10 20:30:00 北京时间
 * 文档依据：奖品列表API实施方案.md - 方案2
 *
 * 问题背景：
 * 1. 前端转盘使用sort_order计算位置（index = sort_order - 1）
 * 2. 如果sort_order重复，会导致两个奖品映射到同一转盘位置
 * 3. 当前数据库未强制约束，理论上可能出现数据不一致
 *
 * 解决方案：
 * ✅ 创建复合唯一索引：idx_unique_campaign_sort_order (campaign_id, sort_order)
 * ✅ 确保同一活动内的sort_order唯一
 * ✅ 数据库层面强制约束，比应用层验证更可靠
 *
 * 影响范围：lottery_prizes表的数据插入和更新操作
 * 预期效果：从根本上防止sort_order重复，保证前端转盘渲染正确
 *
 * 前置条件验证：
 * - 已验证当前数据库无sort_order重复数据 ✅
 * - 已在模型层添加beforeCreate和beforeUpdate钩子 ✅
 */

'use strict'

module.exports = {
  up: async (queryInterface, _Sequelize) => {
    console.log('🔒 开始为lottery_prizes表添加sort_order唯一约束...\n')

    try {
      // 步骤1：检查是否已存在该索引（避免重复创建）
      console.log('📋 [1/3] 检查索引是否已存在')
      console.log('----------------------------------------')

      const [existingIndexes] = await queryInterface.sequelize.query(
        "SHOW INDEX FROM lottery_prizes WHERE Key_name = 'idx_unique_campaign_sort_order'"
      )

      if (existingIndexes.length > 0) {
        console.log('  ⚠️ 索引已存在，跳过创建')
        console.log('✅ 迁移完成（索引已存在）\n')
        return
      }

      console.log('  ✅ 索引不存在，准备创建\n')

      // 步骤2：再次验证数据完整性（确保无重复数据）
      console.log('📋 [2/3] 验证数据完整性')
      console.log('----------------------------------------')

      const [duplicates] = await queryInterface.sequelize.query(`
        SELECT campaign_id, sort_order, GROUP_CONCAT(prize_id) as prize_ids, COUNT(*) as count 
        FROM lottery_prizes 
        GROUP BY campaign_id, sort_order 
        HAVING count > 1
      `)

      if (duplicates.length > 0) {
        console.error('  ❌ 发现重复数据，无法创建唯一索引:')
        duplicates.forEach(dup => {
          console.error(
            `     活动ID: ${dup.campaign_id}, sort_order: ${dup.sort_order}, 奖品ID: ${dup.prize_ids}`
          )
        })
        throw new Error('数据存在重复，请先修复数据后再执行迁移')
      }

      console.log('  ✅ 数据验证通过，无重复记录\n')

      // 步骤3：创建唯一索引（使用原生SQL避免语法问题）
      console.log('📋 [3/3] 创建唯一索引')
      console.log('----------------------------------------')

      await queryInterface.sequelize.query(`
        ALTER TABLE lottery_prizes 
        ADD UNIQUE INDEX idx_unique_campaign_sort_order (campaign_id, sort_order)
      `)

      console.log('  ✅ 成功创建唯一索引: idx_unique_campaign_sort_order')
      console.log('  📊 索引字段: (campaign_id, sort_order)')
      console.log('  🔒 索引类型: UNIQUE')
      console.log('')

      // 步骤4：验证索引创建成功
      const [createdIndexes] = await queryInterface.sequelize.query(
        "SHOW INDEX FROM lottery_prizes WHERE Key_name = 'idx_unique_campaign_sort_order'"
      )

      if (createdIndexes.length === 0) {
        throw new Error('索引创建失败，请检查数据库状态')
      }

      console.log('✅ 索引验证通过\n')
      console.log('🎉 sort_order唯一约束创建完成')
      console.log('📊 业务效果: 防止同一活动内奖品排序重复')
      console.log('✅ 迁移成功完成\n')
    } catch (error) {
      console.error('❌ 索引创建失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface, _Sequelize) => {
    console.log('🔄 开始回滚sort_order唯一约束...\n')

    try {
      console.log('📋 删除唯一索引: idx_unique_campaign_sort_order')
      console.log('----------------------------------------')

      // 检查索引是否存在
      const [existingIndexes] = await queryInterface.sequelize.query(
        "SHOW INDEX FROM lottery_prizes WHERE Key_name = 'idx_unique_campaign_sort_order'"
      )

      if (existingIndexes.length === 0) {
        console.log('  ⚠️ 索引不存在，无需删除')
        console.log('✅ 回滚完成（索引不存在）\n')
        return
      }

      // 删除索引
      await queryInterface.removeIndex('lottery_prizes', 'idx_unique_campaign_sort_order')
      console.log('  ✅ 已删除索引: idx_unique_campaign_sort_order\n')

      console.log('🔄 索引回滚完成')
      console.log('⚠️ 警告: 删除唯一约束后，sort_order可能重复')
      console.log('✅ 回滚成功完成\n')
    } catch (error) {
      console.error('❌ 索引回滚失败:', error.message)
      throw error
    }
  }
}
