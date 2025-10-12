/**
 * 修复抽奖记录中cost_points为null的异常数据
 *
 * 问题：621条single类型抽奖记录的cost_points为null
 * 原因：代码中使用了错误的字段名points_cost而非cost_points
 * 解决：将cost_points=null的记录更新为100（标准抽奖消耗积分）
 */

const models = require('../models')
const _BeijingTimeHelper = require('../utils/timeHelper') // 保留用于未来功能

async function fixLotteryCostPoints () {
  console.log('=== 修复抽奖记录cost_points字段 ===\n')

  try {
    // 1. 统计需要修复的记录
    const nullCostRecords = await models.LotteryDraw.count({
      where: {
        cost_points: null
      }
    })

    console.log(`📊 需要修复的记录数: ${nullCostRecords}条`)

    if (nullCostRecords === 0) {
      console.log('✅ 没有需要修复的记录')
      return
    }

    // 2. 查看样本数据
    const sampleRecords = await models.LotteryDraw.findAll({
      where: { cost_points: null },
      limit: 5,
      attributes: ['draw_id', 'user_id', 'draw_type', 'cost_points', 'is_winner', 'created_at']
    })

    console.log('\n📋 样本数据（前5条）:')
    sampleRecords.forEach((record, index) => {
      console.log(`${index + 1}. draw_id: ${record.draw_id}`)
      console.log(`   用户ID: ${record.user_id}, 类型: ${record.draw_type}, cost_points: ${record.cost_points}`)
      console.log(`   中奖: ${record.is_winner}, 时间: ${record.created_at}`)
    })

    // 3. 询问确认（自动化执行，跳过交互）
    console.log('\n🔧 开始修复...')

    // 4. 执行更新 - 将null值更新为100（标准抽奖消耗积分）
    const [updatedCount] = await models.LotteryDraw.update(
      { cost_points: 100 },
      {
        where: {
          cost_points: null,
          draw_type: 'single' // 只修复single类型的抽奖
        }
      }
    )

    console.log(`✅ 成功修复${updatedCount}条记录`)

    // 5. 验证修复结果
    const remainingNull = await models.LotteryDraw.count({
      where: { cost_points: null }
    })

    console.log(`\n📊 修复后剩余null记录: ${remainingNull}条`)

    // 6. 统计修复后的覆盖率
    const totalDraws = await models.LotteryDraw.count()
    const withCostPoints = await models.LotteryDraw.count({
      where: {
        cost_points: { [models.Sequelize.Op.ne]: null }
      }
    })

    const coverageRate = ((withCostPoints / totalDraws) * 100).toFixed(2)
    console.log(`📈 cost_points覆盖率: ${withCostPoints}/${totalDraws} (${coverageRate}%)`)

    console.log('\n✅ 修复完成！')
  } catch (error) {
    console.error('❌ 修复失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// 执行修复
if (require.main === module) {
  fixLotteryCostPoints()
    .then(() => {
      console.log('\n✅ 脚本执行完成')
      process.exit(0)
    })
    .catch(error => {
      console.error('\n❌ 脚本执行失败:', error)
      process.exit(1)
    })
}

module.exports = { fixLotteryCostPoints }
