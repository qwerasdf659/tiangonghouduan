#!/usr/bin/env node
/**
 * 检查users表结构脚本
 * 用于排查定时任务中的字段错误
 */

const { sequelize } = require('../models')

async function checkUsersTable () {
  try {
    console.log('🔍 检查users表结构...\n')

    // 查询users表结构
    const [results] = await sequelize.query(`
      SHOW COLUMNS FROM users
    `)

    console.log('📋 users表字段列表:')
    console.log('='.repeat(80))
    results.forEach(column => {
      console.log(`字段: ${column.Field.padEnd(30)} | 类型: ${column.Type.padEnd(20)} | 允许NULL: ${column.Null}`)
    })
    console.log('='.repeat(80))
    console.log(`\n总共 ${results.length} 个字段\n`)

    // 检查username字段是否存在
    const hasUsername = results.some(col => col.Field === 'username')
    const hasPhone = results.some(col => col.Field === 'phone')
    const hasNickname = results.some(col => col.Field === 'nickname')

    console.log('🔍 关键字段检查:')
    console.log(`  ${hasUsername ? '✅' : '❌'} username字段`)
    console.log(`  ${hasPhone ? '✅' : '❌'} phone字段`)
    console.log(`  ${hasNickname ? '✅' : '❌'} nickname字段\n`)

    if (!hasUsername) {
      console.log('⚠️ 问题诊断:')
      console.log('  users表中不存在username字段')
      console.log('  定时任务中的ExchangeOperationService可能在使用不存在的字段\n')
      console.log('💡 建议:')
      console.log('  1. 检查services/ExchangeOperationService.js中的checkTimeoutAndAlert方法')
      console.log('  2. 将username字段改为phone或nickname字段')
      console.log('  3. 或添加username字段到users表\n')
    }

    await sequelize.close()
    process.exit(0)
  } catch (error) {
    console.error('❌ 错误:', error.message)
    process.exit(1)
  }
}

checkUsersTable()
