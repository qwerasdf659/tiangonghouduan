/**
 * 恢复餐厅主题奖品配置脚本
 * 基于产品功能结构描述.md中的原方案，恢复正确的餐厅菜品奖品配置
 */

const { sequelize } = require('../config/database')
const { Prize, BusinessConfigs } = require('../models')

/**
 * 恢复餐厅主题8个奖品配置
 * 符合餐厅业务场景：海鲜、菜品、优惠券
 */
async function restoreRestaurantPrizes () {
  try {
    console.log('🍽️ 开始恢复餐厅主题奖品配置...')

    // 检查数据库连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 清除现有错误的通用配置
    const existingCount = await Prize.count()
    if (existingCount > 0) {
      await Prize.destroy({ where: {}, truncate: true })
      console.log(`🧹 清除现有通用配置 (${existingCount}个奖品)`)
    }

    // 🍽️ 餐厅主题奖品配置（基于产品功能结构描述.md原方案）
    const restaurantPrizesData = [
      {
        prize_name: '八八折券',
        prize_type: 'coupon',
        prize_value: 0, // 暂时停用，概率为0%
        win_rate: 0.00, // 0%
        display_order: 1,
        description: '全场八八折优惠券（暂时停用）',
        is_active: false, // 概率为0的奖品设为不活跃
        image_url: null
      },
      {
        prize_name: '九八折券',
        prize_type: 'coupon',
        prize_value: 10,
        win_rate: 0.10, // 10%
        display_order: 2,
        description: '全场九八折优惠券，满100可用',
        is_active: true,
        image_url: null
      },
      {
        prize_name: '甜品1份',
        prize_type: 'physical',
        prize_value: 25,
        win_rate: 0.30, // 30%
        display_order: 3,
        description: '免费获得精选甜品一份',
        is_active: true,
        image_url: null
      },
      {
        prize_name: '青菜1份',
        prize_type: 'physical',
        prize_value: 15,
        win_rate: 0.30, // 30%
        display_order: 4,
        description: '免费获得新鲜青菜一份',
        is_active: true,
        image_url: null
      },
      {
        prize_name: '虾1份',
        prize_type: 'physical',
        prize_value: 35,
        win_rate: 0.05, // 5%
        display_order: 5,
        description: '免费获得鲜虾一份',
        is_active: true,
        image_url: null
      },
      {
        prize_name: '花甲1份',
        prize_type: 'physical',
        prize_value: 28,
        win_rate: 0.20, // 20%
        display_order: 6,
        description: '免费获得花甲一份',
        is_active: true,
        image_url: null
      },
      {
        prize_name: '鱿鱼1份',
        prize_type: 'physical',
        prize_value: 32,
        win_rate: 0.05, // 5%
        display_order: 7,
        description: '免费获得鱿鱼一份',
        is_active: true,
        image_url: null
      },
      {
        prize_name: '生腌拼盘',
        prize_type: 'physical',
        prize_value: 0, // 暂时停用，概率为0%
        win_rate: 0.00, // 0%
        display_order: 8,
        description: '精品生腌拼盘（暂时停用）',
        is_active: false, // 概率为0的奖品设为不活跃
        image_url: null
      }
    ]

    // 验证概率总和（只计算活跃奖品）
    const activePrizes = restaurantPrizesData.filter(p => p.is_active)
    const totalProbability = activePrizes.reduce((sum, prize) => sum + prize.win_rate, 0)
    console.log(`📊 活跃奖品概率验证: ${(totalProbability * 100).toFixed(1)}%`)

    if (Math.abs(totalProbability - 1.0) > 0.001) {
      throw new Error(`活跃奖品概率总和错误: ${(totalProbability * 100).toFixed(2)}%，应该为100%`)
    }

    // 批量创建餐厅主题奖品数据
    await Prize.bulkCreate(restaurantPrizesData)
    console.log('✅ 成功创建餐厅主题奖品配置')

    // 验证创建结果
    const allPrizes = await Prize.findAll({
      order: [['display_order', 'ASC']]
    })

    console.log('\n🎉 餐厅主题奖品配置恢复完成！')
    console.log('📝 完整奖品配置详情:')
    allPrizes.forEach(prize => {
      const status = prize.is_active ? '✅' : '❌'
      console.log(`  ${status} ${prize.display_order}. ${prize.prize_name} (${(prize.win_rate * 100).toFixed(1)}%)`)
    })

    const activeCount = allPrizes.filter(p => p.is_active).length
    console.log(`\n📊 统计: 总共8个奖品，其中${activeCount}个活跃，${8 - activeCount}个暂停`)

    return true
  } catch (error) {
    console.error('❌ 餐厅奖品配置恢复失败:', error.message)
    throw error
  }
}

/**
 * 更新抽奖系统配置为餐厅主题
 */
async function updateRestaurantLotteryConfig () {
  try {
    const existingConfig = await BusinessConfigs.findOne({
      where: { business_type: 'lottery' }
    })

    if (existingConfig) {
      // 更新现有配置为餐厅主题
      await existingConfig.update({
        extended_config: {
          is_active: true,
          cost_points: 100, // 每次抽奖消耗100积分
          daily_limit: 50, // 每日限制50次
          maintenance_mode: false,
          theme: 'restaurant', // 标记为餐厅主题
          description: '餐厅菜品和海鲜奖品抽奖系统'
        },
        updated_by: 'restore_script'
      })
      console.log('✅ 抽奖系统配置已更新为餐厅主题')
    } else {
      // 创建餐厅主题配置
      await BusinessConfigs.create({
        business_type: 'lottery',
        extended_config: {
          is_active: true,
          cost_points: 100,
          daily_limit: 50,
          maintenance_mode: false,
          theme: 'restaurant',
          description: '餐厅菜品和海鲜奖品抽奖系统'
        },
        created_by: 'restore_script',
        updated_by: 'restore_script'
      })
      console.log('✅ 餐厅主题抽奖系统配置创建完成')
    }
  } catch (error) {
    console.error('⚠️ 抽奖系统配置更新失败:', error.message)
    // 不抛出错误，因为奖品数据已经成功创建
  }
}

// 执行恢复
if (require.main === module) {
  restoreRestaurantPrizes()
    .then(async () => {
      await updateRestaurantLotteryConfig()
      console.log('\n🎯 餐厅主题奖品配置恢复完成！')
      console.log('🍽️ 现在抽奖系统使用正确的餐厅菜品和海鲜奖品')
      process.exit(0)
    })
    .catch(error => {
      console.error('\n💥 恢复失败:', error.message)
      process.exit(1)
    })
}

module.exports = { restoreRestaurantPrizes }
