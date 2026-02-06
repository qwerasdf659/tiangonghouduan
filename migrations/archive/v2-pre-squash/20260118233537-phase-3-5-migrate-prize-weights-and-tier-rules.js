'use strict'

/**
 * Phase 3.5: 迁移奖品权重和初始化档位规则
 *
 * 迁移内容（已拍板 2026-01-18）：
 * 1. 迁移 win_probability → win_weight（缩放因子 = 1,000,000）
 * 2. 自动推导 reward_tier（按 prize_value_points：≥100→high，10-99→mid，<10→low）
 * 3. 初始化 lottery_tier_rules 表数据（默认分群 + 预留多分群）
 *
 * 权重缩放规则：
 * - win_weight = Math.round(win_probability * 1,000,000)
 * - 示例：win_probability = 0.30 → win_weight = 300,000
 *
 * 档位划分规则（自动推导）：
 * - prize_value_points >= 100 → 'high'（高价值奖品）
 * - prize_value_points >= 10  → 'mid'（中等价值奖品）
 * - prize_value_points < 10   → 'low'（低价值/空奖）
 *
 * @module migrations/phase-3-5-migrate-prize-weights-and-tier-rules
 * @since 2026-01-19
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('📦 Phase 3.5: 开始迁移奖品权重和初始化档位规则...')

      // ========== 步骤 1: 迁移 win_probability → win_weight ==========
      console.log('📊 步骤 1: 迁移 win_probability → win_weight...')

      // 查询所有活动的奖品数据
      const [prizes] = await queryInterface.sequelize.query(
        `SELECT prize_id, campaign_id, prize_name, win_probability, win_weight, prize_value_points
         FROM lottery_prizes
         WHERE status = 'active'`,
        { transaction }
      )

      console.log(`   找到 ${prizes.length} 个活跃奖品`)

      // 更新 win_weight（缩放因子 = 1,000,000）
      const WEIGHT_SCALE = 1000000
      let updated_weight_count = 0

      for (const prize of prizes) {
        const new_weight = Math.round((prize.win_probability || 0) * WEIGHT_SCALE)

        // 只有当 win_weight 为 0 或 null 且 win_probability > 0 时才更新
        if ((prize.win_weight === 0 || prize.win_weight === null) && prize.win_probability > 0) {
          await queryInterface.sequelize.query(
            `UPDATE lottery_prizes SET win_weight = ? WHERE prize_id = ?`,
            {
              replacements: [new_weight, prize.prize_id],
              transaction
            }
          )
          updated_weight_count++
          console.log(
            `   ✅ 奖品 [${prize.prize_name}] win_probability=${prize.win_probability} → win_weight=${new_weight}`
          )
        }
      }

      console.log(`   总计更新 ${updated_weight_count} 个奖品的 win_weight`)

      // ========== 步骤 2: 自动推导 reward_tier ==========
      console.log('🎯 步骤 2: 自动推导 reward_tier（按 prize_value_points）...')

      // 按 prize_value_points 自动推导 reward_tier
      // 规则：≥100→high，10-99→mid，<10→low
      await queryInterface.sequelize.query(
        `UPDATE lottery_prizes
         SET reward_tier = CASE
           WHEN prize_value_points >= 100 THEN 'high'
           WHEN prize_value_points >= 10 THEN 'mid'
           ELSE 'low'
         END
         WHERE status = 'active' AND reward_tier = 'low'`,
        { transaction }
      )

      // 查询更新后的分布
      const [tier_distribution] = await queryInterface.sequelize.query(
        `SELECT reward_tier, COUNT(*) as count, SUM(win_weight) as total_weight
         FROM lottery_prizes
         WHERE status = 'active'
         GROUP BY reward_tier`,
        { transaction }
      )

      console.log('   reward_tier 分布:')
      tier_distribution.forEach((row) => {
        console.log(`   - ${row.reward_tier}: ${row.count} 个奖品, 总权重 ${row.total_weight}`)
      })

      // ========== 步骤 3: 初始化 lottery_tier_rules 表数据 ==========
      console.log('📋 步骤 3: 初始化 lottery_tier_rules 表数据...')

      // 检查是否已有数据
      const [existing_rules] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM lottery_tier_rules`,
        { transaction }
      )

      if (existing_rules[0].count > 0) {
        console.log(`   ⚠️ lottery_tier_rules 已有 ${existing_rules[0].count} 条记录，跳过初始化`)
      } else {
        // 查询所有活动
        const [campaigns] = await queryInterface.sequelize.query(
          `SELECT campaign_id FROM lottery_campaigns WHERE status = 'active'`,
          { transaction }
        )

        console.log(`   找到 ${campaigns.length} 个活跃活动`)

        // 为每个活动初始化默认分群的三档位
        // 权重之和 = 1,000,000（100%）
        const tier_configs = [
          // 默认分群（所有用户）
          { segment_key: 'default', tier_name: 'high', tier_weight: 50000 }, // 5%
          { segment_key: 'default', tier_name: 'mid', tier_weight: 150000 }, // 15%
          { segment_key: 'default', tier_name: 'low', tier_weight: 300000 }, // 30%
          { segment_key: 'default', tier_name: 'fallback', tier_weight: 500000 }, // 50%

          // 新用户分群（高档概率翻倍）
          { segment_key: 'new_user', tier_name: 'high', tier_weight: 100000 }, // 10%
          { segment_key: 'new_user', tier_name: 'mid', tier_weight: 200000 }, // 20%
          { segment_key: 'new_user', tier_name: 'low', tier_weight: 300000 }, // 30%
          { segment_key: 'new_user', tier_name: 'fallback', tier_weight: 400000 }, // 40%

          // VIP用户分群（中高档概率提升）
          { segment_key: 'vip_user', tier_name: 'high', tier_weight: 80000 }, // 8%
          { segment_key: 'vip_user', tier_name: 'mid', tier_weight: 220000 }, // 22%
          { segment_key: 'vip_user', tier_name: 'low', tier_weight: 300000 }, // 30%
          { segment_key: 'vip_user', tier_name: 'fallback', tier_weight: 400000 } // 40%
        ]

        let inserted_count = 0
        for (const campaign of campaigns) {
          for (const config of tier_configs) {
            await queryInterface.sequelize.query(
              `INSERT INTO lottery_tier_rules 
               (campaign_id, segment_key, tier_name, tier_weight, status, created_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, 'active', 1, NOW(), NOW())`,
              {
                replacements: [
                  campaign.campaign_id,
                  config.segment_key,
                  config.tier_name,
                  config.tier_weight
                ],
                transaction
              }
            )
            inserted_count++
          }
        }

        console.log(
          `   ✅ 为 ${campaigns.length} 个活动初始化了 ${inserted_count} 条档位规则`
        )
      }

      // ========== 步骤 4: 验证迁移结果 ==========
      console.log('🔍 步骤 4: 验证迁移结果...')

      // 验证 win_weight 迁移
      const [weight_check] = await queryInterface.sequelize.query(
        `SELECT 
           SUM(CASE WHEN win_weight > 0 THEN 1 ELSE 0 END) as has_weight,
           SUM(CASE WHEN win_weight = 0 AND win_probability > 0 THEN 1 ELSE 0 END) as missing_weight,
           SUM(win_weight) as total_weight
         FROM lottery_prizes
         WHERE status = 'active'`,
        { transaction }
      )

      console.log(`   win_weight 检查:`)
      console.log(`   - 已设置权重: ${weight_check[0].has_weight} 个奖品`)
      console.log(`   - 缺失权重: ${weight_check[0].missing_weight} 个奖品`)
      console.log(`   - 总权重: ${weight_check[0].total_weight}`)

      // 验证 tier_rules 初始化
      const [tier_check] = await queryInterface.sequelize.query(
        `SELECT segment_key, COUNT(*) as count, SUM(tier_weight) as total_weight
         FROM lottery_tier_rules
         GROUP BY segment_key`,
        { transaction }
      )

      console.log(`   tier_rules 检查:`)
      tier_check.forEach((row) => {
        console.log(
          `   - ${row.segment_key}: ${row.count} 条规则, 总权重 ${row.total_weight} (${(row.total_weight / 10000).toFixed(2)}%)`
        )
      })

      // 提交事务
      await transaction.commit()

      console.log('✅ Phase 3.5 迁移完成！')
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      console.error('❌ Phase 3.5 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('📦 Phase 3.5: 开始回滚...')

      // 步骤 1: 重置 win_weight 为 0
      console.log('📊 步骤 1: 重置 win_weight 为 0...')
      await queryInterface.sequelize.query(
        `UPDATE lottery_prizes SET win_weight = 0 WHERE status = 'active'`,
        { transaction }
      )

      // 步骤 2: 重置 reward_tier 为 'low'
      console.log('🎯 步骤 2: 重置 reward_tier 为 low...')
      await queryInterface.sequelize.query(
        `UPDATE lottery_prizes SET reward_tier = 'low' WHERE status = 'active'`,
        { transaction }
      )

      // 步骤 3: 删除 tier_rules 数据
      console.log('📋 步骤 3: 删除 tier_rules 数据...')
      await queryInterface.sequelize.query(`DELETE FROM lottery_tier_rules`, { transaction })

      await transaction.commit()
      console.log('✅ Phase 3.5 回滚完成！')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ Phase 3.5 回滚失败:', error.message)
      throw error
    }
  }
}
