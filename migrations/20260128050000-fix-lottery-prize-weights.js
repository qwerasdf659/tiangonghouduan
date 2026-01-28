'use strict'

/**
 * 数据库迁移：修复活动1的奖品权重配置
 *
 * @description 修复 lottery_prizes 表中各档位奖品的 win_weight 值
 *              使每个档位（high/mid/low）的权重之和等于 1,000,000（WEIGHT_SCALE）
 *
 * @date 2026-01-28
 * @author 系统修复
 *
 * 问题背景：
 * - high 档位原权重和：192,000（应为 1,000,000）
 * - mid 档位原权重和：511,000（应为 1,000,000）
 * - low 档位原权重和：1,100,000（应为 1,000,000）
 *
 * 业务规则：
 * - 每个档位内所有奖品的 win_weight 之和必须等于 1,000,000
 * - 这确保了同档位内奖品选择的概率计算正确
 */

const WEIGHT_SCALE = 1000000

module.exports = {
  async up(queryInterface, _Sequelize) {
    console.log('🔧 开始修复活动1的奖品权重配置...')

    // high 档位奖品权重修复（4个奖品，总权重 = 1,000,000）
    const highTierFixes = [
      { prize_id: 1, prize_name: '八八折', new_weight: 10000, old_weight: 1000 },
      { prize_id: 5, prize_name: '2000积分券', new_weight: 90000, old_weight: 10000 },
      { prize_id: 6, prize_name: '500积分券', new_weight: 700000, old_weight: 180000 },
      { prize_id: 9, prize_name: '九八折券', new_weight: 200000, old_weight: 1000 }
    ]
    // 验证: 10000 + 90000 + 700000 + 200000 = 1,000,000 ✅

    // mid 档位奖品权重修复（4个奖品，总权重 = 1,000,000）
    const midTierFixes = [
      { prize_id: 2, prize_name: '100积分', new_weight: 400000, old_weight: 300000 },
      { prize_id: 3, prize_name: '甜品1份', new_weight: 350000, old_weight: 200000 },
      { prize_id: 7, prize_name: '精品首饰一个', new_weight: 150000, old_weight: 10000 },
      { prize_id: 8, prize_name: '生腌拼盘158', new_weight: 100000, old_weight: 1000 }
    ]
    // 验证: 400000 + 350000 + 150000 + 100000 = 1,000,000 ✅

    // low 档位奖品权重修复（7个奖品，总权重 = 1,000,000）
    const lowTierFixes = [
      { prize_id: 4, prize_name: '青菜1份', new_weight: 240000, old_weight: 300000 },
      { prize_id: 114, prize_name: '神秘彩蛋', new_weight: 130000, old_weight: 150000 },
      { prize_id: 115, prize_name: '好运加持', new_weight: 130000, old_weight: 150000 },
      { prize_id: 116, prize_name: '美食推荐', new_weight: 130000, old_weight: 150000 },
      { prize_id: 117, prize_name: '厨师祝福', new_weight: 120000, old_weight: 100000 },
      { prize_id: 118, prize_name: '下次好运', new_weight: 130000, old_weight: 150000 },
      { prize_id: 119, prize_name: '参与有礼', new_weight: 120000, old_weight: 100000 }
    ]
    // 验证: 240000 + 130000 + 130000 + 130000 + 120000 + 130000 + 120000 = 1,000,000 ✅

    const allFixes = [
      { tier: 'high', fixes: highTierFixes },
      { tier: 'mid', fixes: midTierFixes },
      { tier: 'low', fixes: lowTierFixes }
    ]

    for (const { tier, fixes } of allFixes) {
      console.log(`  📦 修复 ${tier} 档位奖品权重...`)

      const totalNew = fixes.reduce((sum, f) => sum + f.new_weight, 0)
      if (totalNew !== WEIGHT_SCALE) {
        throw new Error(`${tier} 档位新权重之和 ${totalNew} 不等于 ${WEIGHT_SCALE}`)
      }

      for (const fix of fixes) {
        await queryInterface.sequelize.query(
          `UPDATE lottery_prizes 
           SET win_weight = :new_weight, 
               updated_at = NOW() 
           WHERE prize_id = :prize_id AND campaign_id = 1`,
          {
            replacements: {
              new_weight: fix.new_weight,
              prize_id: fix.prize_id
            }
          }
        )
        console.log(`    ✅ ${fix.prize_name} (ID:${fix.prize_id}): ${fix.old_weight} → ${fix.new_weight}`)
      }
    }

    console.log('✅ 奖品权重修复完成！')
  },

  async down(queryInterface, _Sequelize) {
    console.log('🔙 回滚奖品权重修复...')

    // 回滚到原始权重值
    const rollbackData = [
      // high tier
      { prize_id: 1, old_weight: 1000 },
      { prize_id: 5, old_weight: 10000 },
      { prize_id: 6, old_weight: 180000 },
      { prize_id: 9, old_weight: 1000 },
      // mid tier
      { prize_id: 2, old_weight: 300000 },
      { prize_id: 3, old_weight: 200000 },
      { prize_id: 7, old_weight: 10000 },
      { prize_id: 8, old_weight: 1000 },
      // low tier
      { prize_id: 4, old_weight: 300000 },
      { prize_id: 114, old_weight: 150000 },
      { prize_id: 115, old_weight: 150000 },
      { prize_id: 116, old_weight: 150000 },
      { prize_id: 117, old_weight: 100000 },
      { prize_id: 118, old_weight: 150000 },
      { prize_id: 119, old_weight: 100000 }
    ]

    for (const item of rollbackData) {
      await queryInterface.sequelize.query(
        `UPDATE lottery_prizes 
         SET win_weight = :old_weight, 
             updated_at = NOW() 
         WHERE prize_id = :prize_id AND campaign_id = 1`,
        {
          replacements: {
            old_weight: item.old_weight,
            prize_id: item.prize_id
          }
        }
      )
    }

    console.log('✅ 回滚完成')
  }
}

