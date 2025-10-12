#!/usr/bin/env node
/**
 * 模型关联验证脚本
 * 验证Sequelize模型定义与数据库实际结构的一致性
 * 创建时间：2025年10月1日
 */

require('dotenv').config()
const { sequelize } = require('../models')

/**
 * 验证模型主键配置
 */
async function verifyModelPrimaryKeys () {
  console.log('\n=== 验证模型主键配置 ===')

  const modelsToCheck = {
    Product: 'products',
    Role: 'roles',
    UserRole: 'user_roles',
    ImageResources: 'image_resources',
    ChatMessage: 'chat_messages',
    CustomerSession: 'customer_sessions',
    ExchangeRecords: 'exchange_records'
  }

  const issues = []

  for (const [modelName, tableName] of Object.entries(modelsToCheck)) {
    const model = sequelize.models[modelName]
    if (!model) {
      issues.push(`模型 ${modelName} 不存在`)
      continue
    }

    const modelPrimaryKey = model.primaryKeyAttribute

    // 查询数据库实际主键
    const [results] = await sequelize.query(`SHOW COLUMNS FROM ${tableName} WHERE \`Key\` = 'PRI'`)
    const dbPrimaryKey = results[0]?.Field

    if (modelPrimaryKey !== dbPrimaryKey) {
      issues.push(`❌ ${modelName}: 模型主键=${modelPrimaryKey}, 数据库主键=${dbPrimaryKey}`)
    } else {
      console.log(`✅ ${modelName}: 主键 ${modelPrimaryKey} 一致`)
    }
  }

  return issues
}

/**
 * 验证模型外键配置
 */
async function verifyModelForeignKeys () {
  console.log('\n=== 验证模型外键配置 ===')

  const foreignKeysToCheck = [
    {
      model: 'UserRole',
      field: 'role_id',
      references: { table: 'roles', key: 'role_id' }
    },
    {
      model: 'Product',
      field: 'primary_image_id',
      references: { table: 'image_resources', key: 'image_id' }
    },
    {
      model: 'ExchangeRecords',
      field: 'product_id',
      references: { table: 'products', key: 'product_id' }
    },
    {
      model: 'ChatMessage',
      field: 'session_id',
      references: { table: 'customer_sessions', key: 'session_id' }
    }
  ]

  const issues = []

  for (const fkConfig of foreignKeysToCheck) {
    const model = sequelize.models[fkConfig.model]
    if (!model) {
      issues.push(`模型 ${fkConfig.model} 不存在`)
      continue
    }

    // 检查引用的表的主键是否正确
    const [results] = await sequelize.query(
      `SHOW COLUMNS FROM ${fkConfig.references.table} WHERE \`Key\` = 'PRI'`
    )
    const referencedPrimaryKey = results[0]?.Field

    if (referencedPrimaryKey !== fkConfig.references.key) {
      issues.push(
        `❌ ${fkConfig.model}.${fkConfig.field}: 引用 ${fkConfig.references.table}.${fkConfig.references.key}, 但实际主键是 ${referencedPrimaryKey}`
      )
    } else {
      console.log(
        `✅ ${fkConfig.model}.${fkConfig.field} → ${fkConfig.references.table}.${fkConfig.references.key} 配置正确`
      )
    }
  }

  return issues
}

/**
 * 验证模型关联关系
 */
async function verifyModelAssociations () {
  console.log('\n=== 验证模型关联关系 ===')

  const associationsToCheck = [
    {
      model: 'Product',
      association: 'primaryImage',
      type: 'BelongsTo',
      target: 'ImageResources'
    },
    {
      model: 'ExchangeRecords',
      association: 'product',
      type: 'BelongsTo',
      target: 'Product'
    },
    {
      model: 'ChatMessage',
      association: 'session',
      type: 'BelongsTo',
      target: 'CustomerSession'
    },
    {
      model: 'UserRole',
      association: 'role',
      type: 'BelongsTo',
      target: 'Role'
    }
  ]

  const issues = []

  for (const assocConfig of associationsToCheck) {
    const model = sequelize.models[assocConfig.model]
    if (!model) {
      issues.push(`模型 ${assocConfig.model} 不存在`)
      continue
    }

    const association = model.associations[assocConfig.association]
    if (!association) {
      issues.push(`❌ ${assocConfig.model} 缺少关联: ${assocConfig.association}`)
      continue
    }

    if (association.associationType !== assocConfig.type) {
      issues.push(
        `❌ ${assocConfig.model}.${assocConfig.association}: 类型应该是 ${assocConfig.type}, 实际是 ${association.associationType}`
      )
    } else if (association.target.name !== assocConfig.target) {
      issues.push(
        `❌ ${assocConfig.model}.${assocConfig.association}: 目标应该是 ${assocConfig.target}, 实际是 ${association.target.name}`
      )
    } else {
      console.log(
        `✅ ${assocConfig.model}.${assocConfig.association} → ${assocConfig.target} 配置正确`
      )
    }
  }

  return issues
}

/**
 * 主函数
 */
async function main () {
  console.log('🔍 开始验证模型关联配置...\n')

  try {
    // 测试数据库连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 验证主键
    const primaryKeyIssues = await verifyModelPrimaryKeys()

    // 验证外键
    const foreignKeyIssues = await verifyModelForeignKeys()

    // 验证关联关系
    const associationIssues = await verifyModelAssociations()

    // 汇总结果
    const allIssues = [...primaryKeyIssues, ...foreignKeyIssues, ...associationIssues]

    console.log('\n=== 验证结果汇总 ===')
    if (allIssues.length === 0) {
      console.log('✅ 所有模型关联配置验证通过！')
      process.exit(0)
    } else {
      console.log(`❌ 发现 ${allIssues.length} 个问题：\n`)
      allIssues.forEach(issue => console.log(`  ${issue}`))
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ 验证过程中发生错误:', error.message)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 运行验证
if (require.main === module) {
  main()
}

module.exports = { verifyModelPrimaryKeys, verifyModelForeignKeys, verifyModelAssociations }
