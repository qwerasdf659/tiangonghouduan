#!/usr/bin/env node

/**
 * 🔧 修复 ExchangeRecords 时间戳字段配置
 *
 * 问题：ExchangeRecords 模型使用 snake_case 时间戳字段 (created_at/updated_at)
 * 但检查器期望 camelCase 字段 (createdAt/updatedAt)
 *
 * 解决方案：配置模型使用正确的时间戳字段映射
 *
 * 创建时间：2025年01月21日
 * 使用 Claude Sonnet 4 模型
 */

'use strict'

require('dotenv').config()
const { sequelize } = require('../models')
const models = require('../models')

async function fixExchangeRecordsTimestamps () {
  console.log('🔧 修复 ExchangeRecords 时间戳字段配置...')

  try {
    // 检查数据库连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接正常')

    // 检查 ExchangeRecords 模型
    const ExchangeRecords = models.ExchangeRecords
    if (!ExchangeRecords) {
      throw new Error('ExchangeRecords 模型不存在')
    }

    // 检查当前字段配置
    console.log('\n📊 当前 ExchangeRecords 字段配置:')
    console.log(`   has created_at: ${!!ExchangeRecords.rawAttributes.created_at}`)
    console.log(`   has createdAt: ${!!ExchangeRecords.rawAttributes.createdAt}`)
    console.log(`   has updated_at: ${!!ExchangeRecords.rawAttributes.updated_at}`)
    console.log(`   has updatedAt: ${!!ExchangeRecords.rawAttributes.updatedAt}`)

    // 检查模型配置
    const options = ExchangeRecords.options
    console.log('\n📊 时间戳配置:')
    console.log(`   timestamps: ${options.timestamps}`)
    console.log(`   createdAt: ${options.createdAt}`)
    console.log(`   updatedAt: ${options.updatedAt}`)

    // 检查数据库表结构
    console.log('\n📊 检查数据库表结构...')
    const tableFields = await sequelize.query('DESCRIBE exchange_records', {
      type: sequelize.QueryTypes.SELECT
    })

    const fieldNames = tableFields.map(field => field.Field)
    console.log(`数据库字段: ${fieldNames.join(', ')}`)

    const hasCreatedAtInDB = fieldNames.includes('created_at')
    const hasUpdatedAtInDB = fieldNames.includes('updated_at')
    const hasCreatedAtCamelInDB = fieldNames.includes('createdAt')
    const hasUpdatedAtCamelInDB = fieldNames.includes('updatedAt')

    console.log('\n📊 数据库时间戳字段:')
    console.log(`   has created_at: ${hasCreatedAtInDB}`)
    console.log(`   has createdAt: ${hasCreatedAtCamelInDB}`)
    console.log(`   has updated_at: ${hasUpdatedAtInDB}`)
    console.log(`   has updatedAt: ${hasUpdatedAtCamelInDB}`)

    // 分析问题
    if (hasCreatedAtInDB && hasUpdatedAtInDB) {
      console.log('\n✅ 数据库使用 snake_case 时间戳字段 (created_at/updated_at)')
      console.log('📝 这符合项目的统一命名规范')

      if (ExchangeRecords.rawAttributes.createdAt || ExchangeRecords.rawAttributes.updatedAt) {
        console.log('⚠️ 但模型中同时定义了 camelCase 字段，这会导致检查器混淆')
        console.log('💡 建议：在模型中明确配置时间戳字段映射')
      }

      // 解决方案说明
      console.log('\n💡 解决方案:')
      console.log('1. ExchangeRecords 模型应该配置 createdAt: "created_at", updatedAt: "updated_at"')
      console.log('2. 这样 Sequelize 会正确映射 camelCase 属性到 snake_case 数据库字段')
      console.log('3. 检查器会看到正确的 createdAt/updatedAt 字段')

      console.log('\n📝 需要在 ExchangeRecords 模型配置中添加:')
      console.log(`   {
     sequelize,
     modelName: 'ExchangeRecords',
     tableName: 'exchange_records',
     timestamps: true,
     createdAt: 'created_at',
     updatedAt: 'updated_at',
     underscored: true
   }`)
    } else if (hasCreatedAtCamelInDB && hasUpdatedAtCamelInDB) {
      console.log('\n📝 数据库使用 camelCase 时间戳字段')
      console.log('💡 建议：保持模型默认配置')
    } else {
      console.log('\n❌ 数据库缺少时间戳字段')
      console.log('💡 需要添加时间戳字段到数据库')
    }

    return {
      success: true,
      hasSnakeCaseInDB: hasCreatedAtInDB && hasUpdatedAtInDB,
      hasCamelCaseInDB: hasCreatedAtCamelInDB && hasUpdatedAtCamelInDB,
      modelConfig: {
        timestamps: options.timestamps,
        createdAt: options.createdAt,
        updatedAt: options.updatedAt
      }
    }
  } catch (error) {
    console.error('❌ 检查失败:', error.message)
    throw error
  } finally {
    if (sequelize) {
      await sequelize.close()
    }
  }
}

// 主执行
if (require.main === module) {
  fixExchangeRecordsTimestamps()
    .then(result => {
      console.log('\n✅ ExchangeRecords 时间戳字段检查完成')
      if (result.hasSnakeCaseInDB) {
        console.log('📝 建议更新模型配置以使用正确的时间戳字段映射')
      }
      process.exit(0)
    })
    .catch(error => {
      console.error('❌ 检查失败:', error.message)
      process.exit(1)
    })
}

module.exports = fixExchangeRecordsTimestamps
