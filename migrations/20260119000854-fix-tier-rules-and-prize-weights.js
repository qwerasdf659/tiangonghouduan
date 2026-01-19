'use strict'

/**
 * 迁移脚本：修复档位规则和奖品权重数据
 *
 * 修复问题：
 * 1. lottery_tier_rules 表中存在空 tier_name 的记录（错误的 fallback 档位）
 *    - 原因：迁移脚本 20260118233537 尝试插入 fallback 档位，
 *      但数据库 tier_name 是 enum('high','mid','low')，MySQL 将无效值转为空字符串
 *    - 修复：删除空 tier_name 记录，更新 low 档位权重使三档之和 = 1,000,000
 *
 * 2. lottery_prizes 表中存在 win_weight=0 且 win_probability=0 的奖品
 *    - 需要检查：这些奖品可能是特殊奖品（需要管理干预）或需要修复
 *
 * @author Claude
 * @date 2026-01-19
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 开始修复档位规则和奖品权重数据...')

      // ========== 步骤 1: 修复 lottery_tier_rules 表 ==========
      console.log('\n📋 步骤 1: 修复 lottery_tier_rules 表...')

      // 1.1 删除空 tier_name 的记录（错误的 fallback 档位）
      const [deletedRows] = await queryInterface.sequelize.query(
        `DELETE FROM lottery_tier_rules WHERE tier_name = '' OR tier_name IS NULL`,
        { transaction }
      )
      console.log(`   ✅ 删除了空 tier_name 的记录`)

      // 1.2 检查当前各分群的权重和
      const [currentWeights] = await queryInterface.sequelize.query(
        `SELECT campaign_id, segment_key, 
                SUM(tier_weight) as current_sum,
                MAX(CASE WHEN tier_name = 'high' THEN tier_weight END) as high_weight,
                MAX(CASE WHEN tier_name = 'mid' THEN tier_weight END) as mid_weight,
                MAX(CASE WHEN tier_name = 'low' THEN tier_weight END) as low_weight
         FROM lottery_tier_rules 
         WHERE tier_name IN ('high', 'mid', 'low')
         GROUP BY campaign_id, segment_key`,
        { transaction }
      )

      console.log('   当前权重分布:')
      currentWeights.forEach((row) => {
        console.log(
          `   - 活动${row.campaign_id}/${row.segment_key}: high=${row.high_weight}, mid=${row.mid_weight}, low=${row.low_weight}, 总和=${row.current_sum}`
        )
      })

      // 1.3 更新 low 档位权重，使三档之和 = 1,000,000（100%）
      // 正确的权重分配（根据迁移方案文档）：
      // - default: high=50000(5%), mid=150000(15%), low=800000(80%) → 总和=1,000,000
      // - new_user: high=100000(10%), mid=200000(20%), low=700000(70%) → 总和=1,000,000
      // - vip_user: high=80000(8%), mid=220000(22%), low=700000(70%) → 总和=1,000,000

      const weightFixes = [
        {
          segment_key: 'default',
          new_low_weight: 800000,
          expected_sum: 1000000
        },
        {
          segment_key: 'new_user',
          new_low_weight: 700000,
          expected_sum: 1000000
        },
        {
          segment_key: 'vip_user',
          new_low_weight: 700000,
          expected_sum: 1000000
        }
      ]

      for (const fix of weightFixes) {
        await queryInterface.sequelize.query(
          `UPDATE lottery_tier_rules 
           SET tier_weight = ?, updated_at = NOW(), updated_by = 1
           WHERE segment_key = ? AND tier_name = 'low'`,
          {
            replacements: [fix.new_low_weight, fix.segment_key],
            transaction
          }
        )
        console.log(
          `   ✅ 更新 ${fix.segment_key}/low 权重为 ${fix.new_low_weight}`
        )
      }

      // 1.4 验证修复结果
      const [verifyWeights] = await queryInterface.sequelize.query(
        `SELECT campaign_id, segment_key, SUM(tier_weight) as total_weight
         FROM lottery_tier_rules 
         WHERE tier_name IN ('high', 'mid', 'low') AND status = 'active'
         GROUP BY campaign_id, segment_key`,
        { transaction }
      )

      console.log('   验证修复后的权重和:')
      let allCorrect = true
      verifyWeights.forEach((row) => {
        // 注意：MySQL 返回的可能是字符串或 BigInt，需要转换为数字比较
        const totalWeight = Number(row.total_weight)
        const isCorrect = totalWeight === 1000000
        const status = isCorrect ? '✅ 正确' : '❌ 错误'
        console.log(
          `   - 活动${row.campaign_id}/${row.segment_key}: ${totalWeight} ${status}`
        )
        if (!isCorrect) allCorrect = false
      })

      if (!allCorrect) {
        throw new Error('档位权重修复后验证失败，总权重不等于 1,000,000')
      }

      // ========== 步骤 2: 检查 win_weight=0 的奖品 ==========
      console.log('\n📋 步骤 2: 检查 win_weight=0 的奖品...')

      const [zeroWeightPrizes] = await queryInterface.sequelize.query(
        `SELECT prize_id, prize_name, prize_type, win_probability, win_weight, 
                stock_quantity, status, reward_tier, prize_value_points
         FROM lottery_prizes 
         WHERE (win_weight = 0 OR win_weight IS NULL) AND status = 'active'`,
        { transaction }
      )

      if (zeroWeightPrizes.length > 0) {
        console.log(`   ⚠️ 发现 ${zeroWeightPrizes.length} 个 win_weight=0 的活跃奖品:`)
        zeroWeightPrizes.forEach((p) => {
          console.log(
            `   - ${p.prize_name}: prob=${p.win_probability}, value=${p.prize_value_points}, tier=${p.reward_tier}`
          )
        })

        // 根据 win_probability 计算并更新 win_weight（如果 probability > 0）
        // win_weight = win_probability * 1,000,000（整数化）
        const [updated] = await queryInterface.sequelize.query(
          `UPDATE lottery_prizes 
           SET win_weight = ROUND(win_probability * 1000000),
               updated_at = NOW()
           WHERE (win_weight = 0 OR win_weight IS NULL) 
             AND win_probability > 0 
             AND status = 'active'`,
          { transaction }
        )
        console.log(`   ✅ 根据 win_probability 更新了奖品的 win_weight`)

        // 对于 win_probability 也是 0 的奖品，设置最低权重 1000（0.1%）
        // 这些可能是特殊奖品，需要运营后续手动调整
        const [setMinWeight] = await queryInterface.sequelize.query(
          `UPDATE lottery_prizes 
           SET win_weight = 1000,
               updated_at = NOW()
           WHERE (win_weight = 0 OR win_weight IS NULL) 
             AND (win_probability = 0 OR win_probability IS NULL)
             AND status = 'active'`,
          { transaction }
        )
        console.log(
          `   ✅ 为 probability=0 的奖品设置最低权重 1000（0.1%），需运营后续调整`
        )
      } else {
        console.log('   ✅ 没有需要修复的 win_weight=0 奖品')
      }

      // ========== 步骤 3: 验证最终结果 ==========
      console.log('\n🔍 步骤 3: 验证最终结果...')

      // 验证档位规则
      const [finalTierCheck] = await queryInterface.sequelize.query(
        `SELECT segment_key, COUNT(*) as count, SUM(tier_weight) as total_weight
         FROM lottery_tier_rules
         WHERE tier_name IN ('high', 'mid', 'low') AND status = 'active'
         GROUP BY segment_key`,
        { transaction }
      )

      console.log('   档位规则验证:')
      finalTierCheck.forEach((row) => {
        const status =
          row.count === 3 && row.total_weight === 1000000
            ? '✅ 正确'
            : '⚠️ 需检查'
        console.log(
          `   - ${row.segment_key}: ${row.count} 条规则, 总权重 ${row.total_weight} ${status}`
        )
      })

      // 验证奖品权重
      const [finalPrizeCheck] = await queryInterface.sequelize.query(
        `SELECT 
           COUNT(*) as total_active,
           SUM(CASE WHEN win_weight > 0 THEN 1 ELSE 0 END) as has_weight,
           SUM(CASE WHEN win_weight = 0 OR win_weight IS NULL THEN 1 ELSE 0 END) as no_weight
         FROM lottery_prizes
         WHERE status = 'active'`,
        { transaction }
      )

      console.log('   奖品权重验证:')
      console.log(`   - 活跃奖品总数: ${finalPrizeCheck[0].total_active}`)
      console.log(`   - 已设置权重: ${finalPrizeCheck[0].has_weight}`)
      console.log(`   - 未设置权重: ${finalPrizeCheck[0].no_weight}`)

      await transaction.commit()
      console.log('\n✅ 修复迁移完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 修复迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    // 此迁移为数据修复，回滚需要谨慎
    // 这里只回滚 low 档位权重到原值，不恢复被删除的空 tier_name 记录
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 回滚档位权重修复...')

      // 恢复原来的 low 权重值
      const originalWeights = [
        { segment_key: 'default', old_low_weight: 300000 },
        { segment_key: 'new_user', old_low_weight: 300000 },
        { segment_key: 'vip_user', old_low_weight: 300000 }
      ]

      for (const fix of originalWeights) {
        await queryInterface.sequelize.query(
          `UPDATE lottery_tier_rules 
           SET tier_weight = ?, updated_at = NOW()
           WHERE segment_key = ? AND tier_name = 'low'`,
          {
            replacements: [fix.old_low_weight, fix.segment_key],
            transaction
          }
        )
      }

      console.log('⚠️ 注意: 被删除的空 tier_name 记录未恢复（它们是错误数据）')
      console.log('⚠️ 注意: 奖品权重修复未回滚（需要人工处理）')

      await transaction.commit()
      console.log('✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
