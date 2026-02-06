'use strict'

/**
 * 迁移文件：Phase 3 - 将活动 draw_pricing 迁移到定价配置表
 *
 * 基于《抽奖模块Strategy到Pipeline迁移方案》文档中 Phase 3 的要求
 * 将 lottery_campaigns.prize_distribution_config.draw_pricing 迁移到
 * lottery_campaign_pricing_config 表
 *
 * 业务场景：
 * - 迁移现有活动的定价配置到独立表
 * - 支持版本化管理（可回滚/可定时生效/多版本）
 * - 保持定价规则不变，仅改变存储位置
 *
 * 迁移策略（方案 A2 已拍板 2026-01-18）：
 * - 自动迁移：将活动表 draw_pricing 写入新表
 * - 严格模式：之后活动 JSON 仅作创建活动的默认模板
 *
 * 创建时间：2026-01-19
 * 作者：统一抽奖架构重构 - Phase 3
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🚀 开始执行 Phase 3 数据迁移：draw_pricing → lottery_campaign_pricing_config')
    console.log('='.repeat(70))

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ============================================================
      // 步骤1：查询所有活动的 draw_pricing 配置
      // ============================================================
      console.log('\n📋 步骤1：查询活动的 draw_pricing 配置...')

      const [campaigns] = await queryInterface.sequelize.query(
        `SELECT campaign_id, campaign_code, prize_distribution_config, status
         FROM lottery_campaigns
         WHERE prize_distribution_config IS NOT NULL`,
        { transaction }
      )

      console.log(`    ✅ 发现 ${campaigns.length} 个活动需要迁移`)

      // ============================================================
      // 步骤2：检查新表是否有数据（避免重复迁移）
      // ============================================================
      console.log('\n📋 步骤2：检查目标表数据...')

      const [existingConfigs] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM lottery_campaign_pricing_config',
        { transaction }
      )

      if (existingConfigs[0].count > 0) {
        console.log(`    ⚠️ 目标表已有 ${existingConfigs[0].count} 条数据，跳过迁移`)
        await transaction.commit()
        return
      }

      console.log('    ✅ 目标表为空，开始迁移')

      // ============================================================
      // 步骤2.5：获取有效的用户ID（满足外键约束）
      // ============================================================
      console.log('\n📋 步骤2.5：获取默认创建者用户ID...')

      const [users] = await queryInterface.sequelize.query(
        'SELECT user_id FROM users ORDER BY user_id LIMIT 1',
        { transaction }
      )

      if (!users || users.length === 0) {
        throw new Error('无法找到有效用户，created_by 外键约束无法满足')
      }

      const defaultCreatedBy = users[0].user_id
      console.log(`    ✅ 默认创建者 user_id: ${defaultCreatedBy}`)

      // ============================================================
      // 步骤3：遍历活动，迁移 draw_pricing 到新表
      // ============================================================
      console.log('\n📋 步骤3：迁移定价配置到新表...')

      let migratedCount = 0
      let skippedCount = 0

      for (const campaign of campaigns) {
        const { campaign_id, campaign_code, prize_distribution_config } = campaign

        // 解析 JSON 配置
        let config = prize_distribution_config
        if (typeof config === 'string') {
          try {
            config = JSON.parse(config)
          } catch (error) {
            console.log(`    ⚠️ 活动 ${campaign_id} 配置解析失败，跳过`)
            skippedCount++
            continue
          }
        }

        // 获取 draw_pricing
        const draw_pricing = config?.draw_pricing

        if (!draw_pricing || Object.keys(draw_pricing).length === 0) {
          console.log(`    ⏭️ 活动 ${campaign_id} 无 draw_pricing 配置，跳过`)
          skippedCount++
          continue
        }

        // 转换 draw_pricing 格式为 draw_buttons 数组
        const draw_buttons = normalizeDrawPricing(draw_pricing)

        // 生成配置ID
        const timestamp = Date.now()
        const randomCode = Math.random().toString(36).substring(2, 8)
        const config_id = `pricing_${timestamp}_${randomCode}`

        // 插入新表
        await queryInterface.sequelize.query(
          `INSERT INTO lottery_campaign_pricing_config 
           (config_id, campaign_id, version, pricing_config, status, created_by, created_at, updated_at)
           VALUES (?, ?, 1, ?, 'active', ?, NOW(), NOW())`,
          {
            replacements: [
              config_id,
              campaign_id,
              JSON.stringify({ draw_buttons }),
              defaultCreatedBy // 使用查询到的有效用户ID
            ],
            transaction
          }
        )

        console.log(`    ✅ 活动 ${campaign_id} (${campaign_code}) 迁移成功，配置ID: ${config_id}`)
        migratedCount++
      }

      console.log('\n📊 迁移统计：')
      console.log(`    ✅ 成功迁移: ${migratedCount} 个活动`)
      console.log(`    ⏭️ 跳过: ${skippedCount} 个活动`)

      // ============================================================
      // 步骤4：验证迁移结果
      // ============================================================
      console.log('\n📋 步骤4：验证迁移结果...')

      const [finalCount] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM lottery_campaign_pricing_config WHERE status = "active"',
        { transaction }
      )

      console.log(`    ✅ 验证完成，活跃配置数: ${finalCount[0].count}`)

      await transaction.commit()
      console.log('\n✅ Phase 3 数据迁移完成！')
      console.log('='.repeat(70))
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, _Sequelize) {
    console.log('🔄 开始回滚 Phase 3 数据迁移...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 删除所有迁移生成的配置（version = 1 且 status = 'active'）
      await queryInterface.sequelize.query(
        `DELETE FROM lottery_campaign_pricing_config WHERE version = 1`,
        { transaction }
      )

      await transaction.commit()
      console.log('✅ 回滚成功：迁移数据已删除')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}

/**
 * 将旧格式 draw_pricing 转换为 draw_buttons 数组
 *
 * 旧格式：{ single: {...}, triple: {...}, five: {...}, ten: {...} }
 * 新格式：[{ count: 1, discount: 1.0, label: '单抽', enabled: true, sort_order: 1 }, ...]
 *
 * @param {Object} draw_pricing - 旧格式定价配置
 * @returns {Array} draw_buttons 数组
 */
function normalizeDrawPricing(draw_pricing) {
  // 如果已经是新格式
  if (Array.isArray(draw_pricing.draw_buttons)) {
    return draw_pricing.draw_buttons
  }

  // 旧格式映射
  const keyToCount = {
    single: 1,
    triple: 3,
    five: 5,
    ten: 10
  }

  const buttons = []

  for (const [key, config] of Object.entries(draw_pricing)) {
    // 从 key 获取 count
    let count = keyToCount[key]

    // 如果 key 不在映射中，尝试从 config.count 获取
    if (!count && config && typeof config.count === 'number') {
      count = config.count
    }

    // 如果 key 是数字字符串，直接使用
    if (!count && !isNaN(parseInt(key))) {
      count = parseInt(key)
    }

    if (!count) {
      console.log(`    ⚠️ 无法识别的定价配置 key: ${key}，跳过`)
      continue
    }

    buttons.push({
      count,
      discount: config.discount || 1.0,
      label: config.label || `${count}连抽`,
      enabled: true,
      sort_order: count
    })
  }

  // 按 count 排序
  buttons.sort((a, b) => a.sort_order - b.sort_order)

  return buttons
}
