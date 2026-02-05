#!/usr/bin/env node
/**
 * 临时脚本：修复数据库表字符集校对规则不一致问题
 * 
 * 将所有使用 utf8mb4_0900_ai_ci 的表转换为 utf8mb4_unicode_ci
 * 以解决 JOIN 查询时的 "Illegal mix of collations" 错误
 * 
 * 完成后请删除此脚本
 * @date 2026-02-06
 */

'use strict'

require('dotenv').config()

const { Sequelize } = require('sequelize')

async function fixCollations() {
  console.log('='.repeat(60))
  console.log('🔧 修复数据库表字符集校对规则')
  console.log('='.repeat(60))
  
  const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      dialect: 'mysql',
      logging: false
    }
  )

  // 需要修复的表（使用 utf8mb4_0900_ai_ci，需要转换为 utf8mb4_unicode_ci）
  const tablesToFix = [
    'lottery_campaign_quota_grants',
    'lottery_campaign_user_quota',
    'lottery_draw_decisions',
    'lottery_presets',
    'lottery_tier_rules',
    'preset_budget_debt',
    'preset_debt_limits',
    'preset_inventory_debt'
  ]

  const targetCollation = 'utf8mb4_unicode_ci'

  try {
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    let successCount = 0
    let failCount = 0

    for (const tableName of tablesToFix) {
      try {
        console.log(`🔄 正在修复: ${tableName}...`)
        
        // 检查表是否存在
        const [checkResult] = await sequelize.query(`
          SELECT TABLE_NAME, TABLE_COLLATION
          FROM information_schema.TABLES 
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        `, {
          replacements: [process.env.DB_NAME, tableName]
        })

        if (checkResult.length === 0) {
          console.log(`   ⏭️ 表不存在，跳过`)
          continue
        }

        const currentCollation = checkResult[0].TABLE_COLLATION
        
        if (currentCollation === targetCollation) {
          console.log(`   ⏭️ 已是正确的校对规则，跳过`)
          continue
        }

        // 执行修复
        await sequelize.query(`
          ALTER TABLE \`${tableName}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE ${targetCollation}
        `)
        
        console.log(`   ✅ 成功: ${currentCollation} → ${targetCollation}`)
        successCount++
      } catch (error) {
        console.log(`   ❌ 失败: ${error.message}`)
        failCount++
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('📊 修复结果汇总')
    console.log('='.repeat(60))
    console.log(`✅ 成功修复: ${successCount} 个表`)
    console.log(`❌ 修复失败: ${failCount} 个表`)
    console.log(`⏭️ 跳过: ${tablesToFix.length - successCount - failCount} 个表`)

    // 验证修复结果
    console.log('\n' + '='.repeat(60))
    console.log('🔍 验证修复结果')
    console.log('='.repeat(60))

    const [verification] = await sequelize.query(`
      SELECT TABLE_NAME, TABLE_COLLATION
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?)
      ORDER BY TABLE_NAME
    `, {
      replacements: [process.env.DB_NAME, tablesToFix]
    })

    let allFixed = true
    for (const { TABLE_NAME, TABLE_COLLATION } of verification) {
      const status = TABLE_COLLATION === targetCollation ? '✅' : '❌'
      console.log(`${status} ${TABLE_NAME}: ${TABLE_COLLATION}`)
      if (TABLE_COLLATION !== targetCollation) {
        allFixed = false
      }
    }

    if (allFixed) {
      console.log('\n🎉 所有表已修复，校对规则统一为 utf8mb4_unicode_ci')
    } else {
      console.log('\n⚠️ 部分表修复失败，请手动检查')
    }

  } catch (error) {
    console.error('❌ 修复失败:', error.message)
    console.error(error.stack)
  } finally {
    await sequelize.close()
  }

  console.log('\n' + '='.repeat(60))
  console.log('修复完成')
  console.log('='.repeat(60))
}

fixCollations()

