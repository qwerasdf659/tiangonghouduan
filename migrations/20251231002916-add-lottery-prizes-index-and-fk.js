/**
 * 数据库迁移：为 lottery_prizes 表添加复合索引和外键约束
 *
 * 问题背景：
 * - P1-3: 模型定义了 idx_lp_campaign_status 复合索引，但数据库实际未同步
 * - P1-4: lottery_prizes.campaign_id 无外键约束到 lottery_campaigns 表
 *
 * 变更内容：
 * 1. 添加复合索引 idx_lp_campaign_status (campaign_id, status)
 * 2. 添加外键约束 fk_lottery_prizes_campaign
 *
 * 创建时间：2025-12-31 北京时间
 * 问题来源：数据库视图规范对齐诊断报告-2025-12-30.md
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🔧 开始添加 lottery_prizes 索引和外键约束...\n')

    // ========== 1. 检查并添加复合索引 ==========
    console.log('📋 [1/2] 检查并添加复合索引 idx_lp_campaign_status')
    console.log('----------------------------------------')

    try {
      // 检查索引是否已存在
      const [existingIndexes] = await queryInterface.sequelize.query(`
        SELECT INDEX_NAME
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'lottery_prizes'
          AND INDEX_NAME = 'idx_lp_campaign_status'
      `)

      if (existingIndexes.length > 0) {
        console.log('  ⚠️ 索引 idx_lp_campaign_status 已存在，跳过创建')
      } else {
        await queryInterface.addIndex('lottery_prizes', ['campaign_id', 'status'], {
          name: 'idx_lp_campaign_status',
          comment: '活动状态复合索引（管理端按活动+状态筛选奖品）'
        })
        console.log('  ✅ 已添加复合索引: idx_lp_campaign_status (campaign_id, status)')
      }
    } catch (error) {
      console.error('  ❌ 添加索引失败:', error.message)
      throw error
    }

    console.log('')

    // ========== 2. 检查并添加外键约束 ==========
    console.log('📋 [2/2] 检查并添加外键约束 fk_lottery_prizes_campaign')
    console.log('----------------------------------------')

    try {
      // 检查外键是否已存在
      const [existingFks] = await queryInterface.sequelize.query(`
        SELECT CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'lottery_prizes'
          AND CONSTRAINT_NAME = 'fk_lottery_prizes_campaign'
      `)

      if (existingFks.length > 0) {
        console.log('  ⚠️ 外键 fk_lottery_prizes_campaign 已存在，跳过创建')
      } else {
        // 先检查是否有孤立数据（campaign_id 指向不存在的活动）
        const [orphanedData] = await queryInterface.sequelize.query(`
          SELECT lp.prize_id, lp.campaign_id
          FROM lottery_prizes lp
          LEFT JOIN lottery_campaigns lc ON lp.campaign_id = lc.campaign_id
          WHERE lp.campaign_id IS NOT NULL
            AND lc.campaign_id IS NULL
        `)

        if (orphanedData.length > 0) {
          console.log('  ⚠️ 发现孤立数据，需要先清理:')
          orphanedData.forEach(row => {
            console.log(`    - prize_id=${row.prize_id}, campaign_id=${row.campaign_id}`)
          })
          throw new Error('存在孤立奖品数据，请先清理后再添加外键约束')
        }

        await queryInterface.addConstraint('lottery_prizes', {
          fields: ['campaign_id'],
          type: 'foreign key',
          name: 'fk_lottery_prizes_campaign',
          references: {
            table: 'lottery_campaigns',
            field: 'campaign_id'
          },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE'
        })
        console.log('  ✅ 已添加外键约束: fk_lottery_prizes_campaign')
        console.log('     - 引用表: lottery_campaigns.campaign_id')
        console.log('     - 删除策略: RESTRICT（保护关联数据）')
        console.log('     - 更新策略: CASCADE（级联更新）')
      }
    } catch (error) {
      console.error('  ❌ 添加外键失败:', error.message)
      throw error
    }

    console.log('')
    console.log('🎉 lottery_prizes 索引和外键约束添加完成')
    console.log('✅ 迁移成功完成\n')
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🔄 开始回滚 lottery_prizes 索引和外键约束...\n')

    // 删除外键约束
    try {
      await queryInterface.removeConstraint('lottery_prizes', 'fk_lottery_prizes_campaign')
      console.log('✅ 已删除外键约束: fk_lottery_prizes_campaign')
    } catch (error) {
      if (error.message.includes("doesn't exist") || error.message.includes('Unknown')) {
        console.log('⚠️ 外键约束不存在，跳过删除')
      } else {
        throw error
      }
    }

    // 删除复合索引
    try {
      await queryInterface.removeIndex('lottery_prizes', 'idx_lp_campaign_status')
      console.log('✅ 已删除复合索引: idx_lp_campaign_status')
    } catch (error) {
      if (error.message.includes("doesn't exist") || error.message.includes('Unknown')) {
        console.log('⚠️ 索引不存在，跳过删除')
      } else {
        throw error
      }
    }

    console.log('\n🔄 回滚完成\n')
  }
}
