-+'use strict'

const { sequelize } = require('../models')

async function checkPrizeWeightField () {
  try {
    console.log('🔍 检查lottery_prizes表当前结构...')

    const schema = await sequelize.query('DESCRIBE lottery_prizes', {
      type: sequelize.QueryTypes.SELECT
    })

    console.log('📋 当前字段:')
    schema.forEach(field => {
      console.log(`   ${field.Field}: ${field.Type} ${field.Null === 'YES' ? '(可为空)' : '(不可为空)'} ${field.Default !== null ? 'DEFAULT ' + field.Default : ''}`)
    })

    const hasPrizeWeight = schema.some(field => field.Field === 'prize_weight')
    console.log('')
    console.log(`🎯 prize_weight字段存在: ${hasPrizeWeight ? '✅ 是' : '❌ 否'}`)

    if (!hasPrizeWeight) {
      console.log('')
      console.log('🔧 需要添加prize_weight字段来支持权重抽奖功能')
      console.log('📋 字段规格：')
      console.log('   - 字段名: prize_weight')
      console.log('   - 类型: INTEGER')
      console.log('   - 默认值: 100')
      console.log('   - 注释: 奖品权重，用于加权随机抽奖')
    }

    return { hasPrizeWeight, schema }
  } catch (error) {
    console.error('❌ 检查失败:', error.message)
    throw error
  } finally {
    await sequelize.close()
  }
}

if (require.main === module) {
  checkPrizeWeightField()
    .then(() => {
      console.log('✅ 检查完成')
      process.exit(0)
    })
    .catch(error => {
      console.error('❌ 检查失败:', error.message)
      process.exit(1)
    })
}

module.exports = { checkPrizeWeightField }
