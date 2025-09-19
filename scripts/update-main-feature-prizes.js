/**
 * 重构为使用V4统一工具类
 * 重构时间：2025-09-15T22:33:05.564+08:00
 */

const { getDatabaseHelper } = require('../utils/UnifiedDatabaseHelper')
const { Sequelize } = require('sequelize')

// 获取统一数据库助手
const db = getDatabaseHelper()

/**
 * 主体功能奖品配置更新脚本
 *
 * 功能：将奖品配置调整为符合主体功能需求：
 * - 八八折：中奖率0%
 * - 100积分：中奖率30%
 * - 甜品1份：中奖率20%
 * - 青菜1份：中奖率30%
 * - 2000积分券：中奖率1%
 * - 500积分券：中奖率18%
 * - 精品首饰一个：中奖率1%
 * - 生腌拼盘158：中奖率0%
 *
 * @version 4.0.0
 * @date 2025-09-13
 */

// 数据库连接

// 主体功能需求的奖品配置（1-10号奖品）
const MAIN_FEATURE_PRIZES = [
  {
    prize_id: 1,
    prize_name: '八八折',
    prize_type: 'coupon',
    prize_value: 88.0,
    win_probability: 0.0, // 0%中奖率
    angle: 0,
    color: '#FF6B35',
    sort_order: 1,
    stock_quantity: 1000,
    cost_points: 100,
    status: 'active'
  },
  {
    prize_id: 2,
    prize_name: '100积分',
    prize_type: 'points',
    prize_value: 100.0,
    win_probability: 0.3, // 30%中奖率
    angle: 36,
    color: '#FFD700',
    sort_order: 2,
    stock_quantity: 1000,
    cost_points: 100,
    status: 'active'
  },
  {
    prize_id: 3,
    prize_name: '甜品1份',
    prize_type: 'physical',
    prize_value: 15.0,
    win_probability: 0.2, // 20%中奖率
    angle: 72,
    color: '#F39C12',
    sort_order: 3,
    stock_quantity: 1000,
    cost_points: 100,
    status: 'active',
    prize_description: '绿茶饼或者馒头'
  },
  {
    prize_id: 4,
    prize_name: '青菜1份',
    prize_type: 'physical',
    prize_value: 10.0,
    win_probability: 0.3, // 30%中奖率
    angle: 108,
    color: '#2ECC71',
    sort_order: 4,
    stock_quantity: 1000,
    cost_points: 100,
    status: 'active'
  },
  {
    prize_id: 5,
    prize_name: '2000积分券',
    prize_type: 'points',
    prize_value: 2000.0,
    win_probability: 0.01, // 1%中奖率
    angle: 144,
    color: '#9B59B6',
    sort_order: 5,
    stock_quantity: 100,
    cost_points: 100,
    status: 'active'
  },
  {
    prize_id: 6,
    prize_name: '500积分券',
    prize_type: 'points',
    prize_value: 500.0,
    win_probability: 0.18, // 18%中奖率
    angle: 180,
    color: '#3498DB',
    sort_order: 6,
    stock_quantity: 1000,
    cost_points: 100,
    status: 'active'
  },
  {
    prize_id: 7,
    prize_name: '精品首饰一个',
    prize_type: 'physical',
    prize_value: 200.0,
    win_probability: 0.01, // 1%中奖率
    angle: 216,
    color: '#E74C3C',
    sort_order: 7,
    stock_quantity: 50,
    cost_points: 100,
    status: 'active'
  },
  {
    prize_id: 8,
    prize_name: '生腌拼盘158',
    prize_type: 'physical',
    prize_value: 158.0,
    win_probability: 0.0, // 0%中奖率
    angle: 252,
    color: '#1ABC9C',
    sort_order: 8,
    stock_quantity: 100,
    cost_points: 100,
    status: 'active'
  },
  {
    prize_id: 9,
    prize_name: '九八折券',
    prize_type: 'coupon',
    prize_value: 98.0,
    win_probability: 0.0, // 保底专用，基础抽奖不中奖
    angle: 288,
    color: '#27AE60',
    sort_order: 9,
    stock_quantity: 1000,
    cost_points: 100,
    status: 'active',
    prize_description: '保底抽奖专用券'
  },
  {
    prize_id: 10,
    prize_name: '谢谢参与',
    prize_type: 'empty',
    prize_value: 0.0,
    win_probability: 0.0, // 自动计算（剩余概率）
    angle: 324,
    color: '#95A5A6',
    sort_order: 10,
    stock_quantity: 999999,
    cost_points: 100,
    status: 'active'
  }
]

/**
 * 更新奖品配置为主体功能需求
 */
async function updateMainFeaturePrizes () {
  try {
    await db.authenticate()
    console.log('✅ 数据库连接成功')

    // 开始事务
    const transaction = await db.transaction()

    try {
      console.log('🎯 开始更新奖品配置为主体功能需求...')

      for (const prize of MAIN_FEATURE_PRIZES) {
        await db.query(
          `
          UPDATE lottery_prizes 
          SET 
            prize_name = :prize_name,
            prize_type = :prize_type,
            prize_value = :prize_value,
            win_probability = :win_probability,
            angle = :angle,
            color = :color,
            sort_order = :sort_order,
            stock_quantity = :stock_quantity,
            cost_points = :cost_points,
            status = :status,
            prize_description = :prize_description,
            updated_at = NOW()
          WHERE prize_id = :prize_id
        `,
          {
            replacements: {
              ...prize,
              prize_description: prize.prize_description || null
            },
            type: Sequelize.QueryTypes.UPDATE,
            transaction
          }
        )

        console.log(
          `✅ 更新奖品${prize.prize_id}号：${prize.prize_name} (中奖率${(prize.win_probability * 100).toFixed(1)}%)`
        )
      }

      // 验证概率总和
      const totalProbability = MAIN_FEATURE_PRIZES.filter(p => p.prize_id !== 10) // 排除谢谢参与
        .reduce((sum, prize) => sum + prize.win_probability, 0)

      console.log('\n📊 概率分析:')
      console.log(`   中奖总概率: ${(totalProbability * 100).toFixed(1)}%`)
      console.log(`   不中奖概率: ${((1 - totalProbability) * 100).toFixed(1)}%`)

      if (totalProbability > 1) {
        throw new Error('⚠️ 中奖总概率超过100%：' + (totalProbability * 100).toFixed(1) + '%')
      }

      // 更新谢谢参与的概率为剩余概率
      const remainingProbability = 1 - totalProbability
      await db.query(
        `
        UPDATE lottery_prizes 
        SET win_probability = :win_probability
        WHERE prize_id = 10
      `,
        {
          replacements: { win_probability: remainingProbability },
          type: Sequelize.QueryTypes.UPDATE,
          transaction
        }
      )

      console.log(`✅ 更新谢谢参与概率: ${(remainingProbability * 100).toFixed(1)}%`)

      // 提交事务
      await transaction.commit()

      // 验证更新结果
      console.log('\n🔍 验证更新结果:')
      const [updatedPrizes] = await db.query(`
        SELECT prize_id, prize_name, win_probability, status 
        FROM lottery_prizes 
        WHERE prize_id BETWEEN 1 AND 10
        ORDER BY prize_id ASC
      `)

      console.table(
        updatedPrizes.map(p => ({
          ID: p.prize_id,
          名称: p.prize_name,
          中奖率: (p.win_probability * 100).toFixed(1) + '%',
          状态: p.status
        }))
      )

      console.log('\n✅ 主体功能奖品配置更新完成！')
      console.log('🎯 功能特点:')
      console.log('   1. 八八折和生腌拼盘158：0%中奖率（前端转盘显示但不中奖）')
      console.log('   2. 100积分和青菜1份：各30%中奖率（高频中奖）')
      console.log('   3. 甜品1份：20%中奖率，500积分券：18%中奖率')
      console.log('   4. 2000积分券和精品首饰：各1%中奖率（稀有奖品）')
      console.log('   5. 九八折券：保底专用（累计抽奖10次保底）')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  } catch (error) {
    console.error('❌ 更新奖品配置失败:', error.message)
    process.exit(1)
  } finally {
    await db.close()
  }
}

/**
 * 验证概率设置是否合理
 */
function validateProbabilities () {
  console.log('📊 奖品概率验证:')

  let totalProb = 0
  MAIN_FEATURE_PRIZES.forEach(prize => {
    if (prize.prize_id !== 10) {
      // 排除谢谢参与
      totalProb += prize.win_probability
      console.log(
        `   ${prize.prize_id}号 ${prize.prize_name}: ${(prize.win_probability * 100).toFixed(1)}%`
      )
    }
  })

  const emptyProb = 1 - totalProb
  console.log(`   10号 谢谢参与: ${(emptyProb * 100).toFixed(1)}%`)
  console.log(`   总计: ${((totalProb + emptyProb) * 100).toFixed(1)}%`)

  return totalProb <= 1
}

// 主程序执行
if (require.main === module) {
  console.log('🎯 主体功能奖品配置更新脚本')
  console.log('功能：调整1-10号奖品为符合主体功能需求的概率配置\n')

  // 验证概率设置
  if (!validateProbabilities()) {
    console.error('❌ 概率配置错误，请检查设置')
    process.exit(1)
  }

  updateMainFeaturePrizes()
}

module.exports = { updateMainFeaturePrizes, MAIN_FEATURE_PRIZES }
