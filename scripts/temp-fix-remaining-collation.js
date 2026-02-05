#!/usr/bin/env node
/**
 * 临时脚本：修复剩余表的字符集校对规则（带外键约束的表）
 * 
 * 完成后请删除此脚本
 * @date 2026-02-06
 */

'use strict'

require('dotenv').config()

const { Sequelize } = require('sequelize')

async function fixRemainingCollations() {
  console.log('='.repeat(60))
  console.log('🔧 修复剩余表的字符集校对规则（有外键约束）')
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

  const tablesToFix = [
    'lottery_presets',
    'preset_budget_debt',
    'preset_inventory_debt'
  ]

  const targetCollation = 'utf8mb4_unicode_ci'

  try {
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 临时禁用外键检查
    console.log('⏸️ 临时禁用外键检查...')
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0')

    let successCount = 0
    let failCount = 0

    for (const tableName of tablesToFix) {
      try {
        console.log(`🔄 正在修复: ${tableName}...`)
        
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

    // 重新启用外键检查
    console.log('\n▶️ 重新启用外键检查...')
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1')

    console.log('\n' + '='.repeat(60))
    console.log('📊 修复结果汇总')
    console.log('='.repeat(60))
    console.log(`✅ 成功修复: ${successCount} 个表`)
    console.log(`❌ 修复失败: ${failCount} 个表`)

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
      console.log('\n🎉 所有表已修复！')
    }

  } catch (error) {
    console.error('❌ 修复失败:', error.message)
    
    // 确保外键检查被重新启用
    try {
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1')
    } catch (e) {}
  } finally {
    await sequelize.close()
  }

  console.log('\n' + '='.repeat(60))
  console.log('修复完成')
  console.log('='.repeat(60))
}

fixRemainingCollations()

