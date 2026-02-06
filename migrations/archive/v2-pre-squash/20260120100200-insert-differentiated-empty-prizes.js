'use strict'

/**
 * 迁移文件：插入差异化空奖数据
 *
 * 基于《抽奖模块POINTS与BUDGET_POINTS平衡方案》文档 6.6 决策点 5：空奖差异化设计
 *
 * 空奖设计方案（5-10个差异化空奖）：
 * 1. 幸运签 - "今日宜加餐，遇好事" - 趣味互动
 * 2. 神秘彩蛋 - "彩蛋已收集，集满10个换惊喜" - 收集成就
 * 3. 好运加持 - "下次抽奖运气+10%" - 心理暗示
 * 4. 美食推荐 - "今日推荐：招牌菜" - 引流点餐
 * 5. 厨师祝福 - "主厨祝您用餐愉快" - 品牌温度
 * 6. 下次好运 - "运气正在积攒中..." - 保底暗示
 * 7. 参与有礼 - "感谢参与，欢迎再来" - 通用兜底
 *
 * 设计原则：
 * - 空奖也有"层次感"，不是都一样的"谢谢参与"
 * - 一次做好，体验完整
 * - 可扩展（如彩蛋收集系统）
 *
 * 创建时间：2026-01-20
 * 作者：抽奖模块策略重构
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, _Sequelize) {
    console.log('🚀 开始插入差异化空奖数据...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 查询所有激活状态的活动
      console.log('\n📋 [1/4] 查询激活状态的活动...')
      const [campaigns] = await queryInterface.sequelize.query(
        "SELECT campaign_id, campaign_name FROM lottery_campaigns WHERE status IN ('active', 'draft') ORDER BY campaign_id",
        { transaction }
      )

      if (campaigns.length === 0) {
        console.log('    ⚠️ 未找到任何活动，跳过空奖插入')
        await transaction.commit()
        return
      }

      console.log(`    ✅ 找到 ${campaigns.length} 个活动`)
      campaigns.forEach(c => console.log(`       - ID ${c.campaign_id}: ${c.campaign_name}`))

      // 2. 定义差异化空奖数据模板
      console.log('\n📋 [2/4] 准备差异化空奖数据模板...')
      const emptyPrizeTemplates = [
        {
          prize_name: '幸运签',
          prize_type: 'virtual',
          prize_description: '今日宜加餐，遇好事',
          win_weight: 200000, // 20%
          color: '#FFD700'
        },
        {
          prize_name: '神秘彩蛋',
          prize_type: 'virtual',
          prize_description: '彩蛋已收集，集满10个换惊喜',
          win_weight: 150000, // 15%
          color: '#FF69B4'
        },
        {
          prize_name: '好运加持',
          prize_type: 'virtual',
          prize_description: '下次抽奖运气+10%',
          win_weight: 150000, // 15%
          color: '#00CED1'
        },
        {
          prize_name: '美食推荐',
          prize_type: 'virtual',
          prize_description: '今日推荐：招牌菜',
          win_weight: 150000, // 15%
          color: '#FF6347'
        },
        {
          prize_name: '厨师祝福',
          prize_type: 'virtual',
          prize_description: '主厨祝您用餐愉快',
          win_weight: 100000, // 10%
          color: '#20B2AA'
        },
        {
          prize_name: '下次好运',
          prize_type: 'virtual',
          prize_description: '运气正在积攒中...',
          win_weight: 150000, // 15%
          color: '#9370DB'
        },
        {
          prize_name: '参与有礼',
          prize_type: 'virtual',
          prize_description: '感谢参与，欢迎再来',
          win_weight: 100000, // 10% - 兜底空奖
          color: '#808080'
        }
      ]

      console.log(`    ✅ 准备了 ${emptyPrizeTemplates.length} 种差异化空奖模板`)
      // 权重总和应为 1,000,000
      const totalWeight = emptyPrizeTemplates.reduce((sum, t) => sum + t.win_weight, 0)
      console.log(`    📊 权重总和: ${totalWeight}（预期: 1,000,000）`)

      // 3. 为每个活动插入差异化空奖
      console.log('\n📋 [3/4] 为每个活动插入差异化空奖...')

      let totalInserted = 0
      let totalSkipped = 0

      for (const campaign of campaigns) {
        const campaign_id = campaign.campaign_id
        console.log(`\n    🎯 处理活动 ${campaign_id}: ${campaign.campaign_name}`)

        // 检查该活动是否已有空奖
        const [existingEmptyPrizes] = await queryInterface.sequelize.query(
          `SELECT COUNT(*) as count FROM lottery_prizes 
           WHERE campaign_id = ${campaign_id} AND prize_value_points = 0 AND status = 'active'`,
          { transaction }
        )

        const existingCount = existingEmptyPrizes[0]?.count || 0
        if (existingCount >= emptyPrizeTemplates.length) {
          console.log(`       ⏭️ 已有 ${existingCount} 个空奖，跳过`)
          totalSkipped++
          continue
        }

        // 获取该活动当前最大的 sort_order
        const [maxSortResult] = await queryInterface.sequelize.query(
          `SELECT COALESCE(MAX(sort_order), 100) as max_sort FROM lottery_prizes WHERE campaign_id = ${campaign_id}`,
          { transaction }
        )
        // 确保转换为整数，防止字符串拼接
        let sortOrder = parseInt(maxSortResult[0]?.max_sort, 10) || 100
        sortOrder += 100

        // 获取该活动当前最大的 angle
        const [maxAngleResult] = await queryInterface.sequelize.query(
          `SELECT COALESCE(MAX(angle), 0) as max_angle FROM lottery_prizes WHERE campaign_id = ${campaign_id}`,
          { transaction }
        )
        // 确保转换为整数
        let angle = parseInt(maxAngleResult[0]?.max_angle, 10) || 0
        angle = (angle + 45) % 360

        // 插入差异化空奖
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ')

        for (const template of emptyPrizeTemplates) {
          // 检查该空奖是否已存在
          const [existing] = await queryInterface.sequelize.query(
            `SELECT prize_id FROM lottery_prizes 
             WHERE campaign_id = ${campaign_id} AND prize_name = '${template.prize_name}' AND prize_value_points = 0`,
            { transaction }
          )

          if (existing.length > 0) {
            console.log(`       ⏭️ 空奖 "${template.prize_name}" 已存在，跳过`)
            continue
          }

          await queryInterface.sequelize.query(
            `INSERT INTO lottery_prizes 
             (campaign_id, prize_name, prize_type, prize_description, prize_value, prize_value_points, 
              reward_tier, win_weight, win_probability, is_fallback, status, 
              angle, color, sort_order, stock_quantity, total_win_count, daily_win_count,
              created_at, updated_at)
             VALUES 
             (${campaign_id}, '${template.prize_name}', '${template.prize_type}', '${template.prize_description}', 
              0, 0, 'low', ${template.win_weight}, 0.0, 1, 'active',
              ${angle}, '${template.color}', ${sortOrder}, 0, 0, 0,
              '${now}', '${now}')`,
            { transaction }
          )

          sortOrder += 100
          angle = (angle + 45) % 360

          totalInserted++
        }

        console.log(`       ✅ 活动 ${campaign_id} 空奖插入完成`)
      }

      // 4. 汇总统计
      console.log('\n📋 [4/4] 汇总统计...')

      // 验证插入结果
      const [verifyResult] = await queryInterface.sequelize.query(
        `SELECT campaign_id, COUNT(*) as empty_count, SUM(win_weight) as total_weight
         FROM lottery_prizes 
         WHERE prize_value_points = 0 AND status = 'active' AND is_fallback = 1
         GROUP BY campaign_id`,
        { transaction }
      )

      console.log('\n    📊 各活动空奖配置:')
      verifyResult.forEach(r => {
        const weightStatus = r.total_weight === 1000000 ? '✅' : '⚠️'
        console.log(`       活动 ${r.campaign_id}: ${r.empty_count} 个空奖, 权重总和: ${r.total_weight} ${weightStatus}`)
      })

      // 提交事务
      await transaction.commit()

      console.log('\n' + '='.repeat(60))
      console.log('✅ 差异化空奖数据插入完成！')
      console.log('='.repeat(60))
      console.log(`\n📊 统计摘要:`)
      console.log(`   - 处理活动数: ${campaigns.length}`)
      console.log(`   - 新增空奖数: ${totalInserted}`)
      console.log(`   - 跳过活动数: ${totalSkipped}`)
      console.log(`   - 空奖模板数: ${emptyPrizeTemplates.length}`)
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, _Sequelize) {
    console.log('🔄 开始回滚：删除差异化空奖数据...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 定义要删除的空奖名称
      const emptyPrizeNames = [
        '幸运签',
        '神秘彩蛋',
        '好运加持',
        '美食推荐',
        '厨师祝福',
        '下次好运',
        '参与有礼'
      ]

      const nameList = emptyPrizeNames.map(n => `'${n}'`).join(', ')

      // 查询要删除的记录数
      const [countResult] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM lottery_prizes 
         WHERE prize_name IN (${nameList}) AND prize_value_points = 0 AND is_fallback = 1`,
        { transaction }
      )

      const deleteCount = countResult[0]?.count || 0
      console.log(`\n📋 准备删除 ${deleteCount} 条差异化空奖记录...`)

      // 删除差异化空奖
      await queryInterface.sequelize.query(
        `DELETE FROM lottery_prizes 
         WHERE prize_name IN (${nameList}) AND prize_value_points = 0 AND is_fallback = 1`,
        { transaction }
      )

      await transaction.commit()

      console.log('\n' + '='.repeat(60))
      console.log('✅ 回滚完成！')
      console.log(`   已删除 ${deleteCount} 条差异化空奖记录`)
      console.log('='.repeat(60))
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 回滚失败:', error.message)
      throw error
    }
  }
}

