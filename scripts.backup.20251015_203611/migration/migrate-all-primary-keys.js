#!/usr/bin/env node
/**
 * 主键命名统一 - 完整迁移脚本
 * 一次性改造所有11个表的主键命名
 *
 * 改造内容：
 * 阶段1（核心业务表）：
 * 1. exchange_records: id → exchange_id, exchange_id → exchange_code
 * 2. trade_records: id → trade_id, trade_id → trade_code
 * 3. user_inventory: id(VARCHAR) → inventory_id(INT)
 *
 * 阶段2（会话消息表）：
 * 4. customer_sessions: id → session_id
 * 5. chat_messages: id → message_id
 * 6. user_sessions: id → user_session_id
 *
 * 阶段3（辅助功能表）：
 * 7. roles: id → role_id
 * 8. user_roles: id → user_role_id
 * 9. system_announcements: id → announcement_id
 * 10. feedbacks: id(VARCHAR) → feedback_id
 *
 * 特殊处理：
 * 11. image_resources: resource_id → image_id
 */

require('dotenv').config()
const { Sequelize } = require('sequelize')

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: 'mysql',
  timezone: process.env.DB_TIMEZONE || '+08:00',
  logging: false // 简化输出
})

// 迁移配置
const MIGRATIONS = [
  // 阶段1：核心业务表（有业务ID字段冲突）
  {
    stage: 1,
    table: 'exchange_records',
    oldPK: 'id',
    newPK: 'exchange_id',
    pkType: 'INT',
    businessIdField: { old: 'exchange_id', new: 'exchange_code' }
  },
  {
    stage: 1,
    table: 'trade_records',
    oldPK: 'id',
    newPK: 'trade_id',
    pkType: 'INT',
    businessIdField: { old: 'trade_id', new: 'trade_code' }
  },
  {
    stage: 1,
    table: 'user_inventory',
    oldPK: 'id',
    oldPKType: 'VARCHAR(32)',
    newPK: 'inventory_id',
    pkType: 'INT',
    typeChange: true // 主键类型改变
  },

  // 阶段2：会话消息表（简单改名）
  {
    stage: 2,
    table: 'customer_sessions',
    oldPK: 'id',
    newPK: 'session_id',
    pkType: 'BIGINT'
  },
  {
    stage: 2,
    table: 'chat_messages',
    oldPK: 'id',
    newPK: 'message_id',
    pkType: 'BIGINT'
  },
  {
    stage: 2,
    table: 'user_sessions',
    oldPK: 'id',
    newPK: 'user_session_id',
    pkType: 'BIGINT'
  },

  // 阶段3：辅助功能表（简单改名）
  {
    stage: 3,
    table: 'roles',
    oldPK: 'id',
    newPK: 'role_id',
    pkType: 'INT'
  },
  {
    stage: 3,
    table: 'user_roles',
    oldPK: 'id',
    newPK: 'user_role_id',
    pkType: 'INT'
  },
  {
    stage: 3,
    table: 'system_announcements',
    oldPK: 'id',
    newPK: 'announcement_id',
    pkType: 'INT'
  },
  {
    stage: 3,
    table: 'feedbacks',
    oldPK: 'id',
    oldPKType: 'VARCHAR(50)',
    newPK: 'feedback_id',
    pkType: 'INT',
    typeChange: true
  },

  // 特殊处理
  {
    stage: 4,
    table: 'image_resources',
    oldPK: 'resource_id',
    oldPKType: 'CHAR(36)',
    newPK: 'image_id',
    pkType: 'INT',
    typeChange: true
  }
]

/**
 * 检查外键约束
 */
async function checkForeignKeys (tableName) {
  const [foreignKeys] = await sequelize.query(`
    SELECT
      TABLE_NAME,
      CONSTRAINT_NAME,
      COLUMN_NAME,
      REFERENCED_TABLE_NAME,
      REFERENCED_COLUMN_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = '${process.env.DB_NAME}'
      AND (REFERENCED_TABLE_NAME = '${tableName}' OR TABLE_NAME = '${tableName}')
      AND REFERENCED_TABLE_NAME IS NOT NULL
  `)
  return foreignKeys
}

/**
 * 删除外键约束
 */
async function dropForeignKeys (foreignKeys, tableName) {
  const dropped = []
  for (const fk of foreignKeys) {
    if (fk.TABLE_NAME !== tableName) {
      console.log(`     删除外键: ${fk.TABLE_NAME}.${fk.CONSTRAINT_NAME}`)
      await sequelize.query(`ALTER TABLE ${fk.TABLE_NAME} DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`)
      dropped.push(fk)
    }
  }
  return dropped
}

/**
 * 重建外键约束
 */
async function rebuildForeignKeys (foreignKeys, tableName, newPK) {
  for (const fk of foreignKeys) {
    if (fk.TABLE_NAME !== tableName) {
      console.log(`     重建外键: ${fk.TABLE_NAME}.${fk.COLUMN_NAME} → ${tableName}.${newPK}`)
      await sequelize.query(`
        ALTER TABLE ${fk.TABLE_NAME}
        ADD CONSTRAINT ${fk.CONSTRAINT_NAME}
        FOREIGN KEY (${fk.COLUMN_NAME}) REFERENCES ${tableName}(${newPK})
      `)
    }
  }
}

/**
 * 执行迁移（简单改名，主键类型不变）
 */
async function migrateSimpleRename (config) {
  const { table, oldPK, newPK, pkType, businessIdField } = config
  const transaction = await sequelize.transaction()

  try {
    // Step 1: 如果有业务ID字段冲突，先改业务ID字段名
    if (businessIdField) {
      console.log(`     Step 1: 修改业务ID字段 ${businessIdField.old} → ${businessIdField.new}`)
      await sequelize.query(
        `ALTER TABLE ${table} 
         CHANGE COLUMN ${businessIdField.old} ${businessIdField.new} VARCHAR(50) UNIQUE`,
        { transaction }
      )
    }

    // Step 2: 修改主键名称
    console.log(`     Step ${businessIdField ? 2 : 1}: 修改主键 ${oldPK} → ${newPK}`)
    await sequelize.query(
      `ALTER TABLE ${table} 
       CHANGE COLUMN ${oldPK} ${newPK} ${pkType} PRIMARY KEY AUTO_INCREMENT`,
      { transaction }
    )

    await transaction.commit()
    return true
  } catch (error) {
    await transaction.rollback()
    throw error
  }
}

/**
 * 执行迁移（主键类型改变）
 */
async function migrateTypeChange (config) {
  const { table, oldPK, newPK, pkType } = config
  const transaction = await sequelize.transaction()

  try {
    // Step 1: 删除主键约束
    console.log('     Step 1: 删除旧主键约束')
    await sequelize.query(`ALTER TABLE ${table} MODIFY COLUMN ${oldPK} ${config.oldPKType}`, {
      transaction
    })
    await sequelize.query(`ALTER TABLE ${table} DROP PRIMARY KEY`, {
      transaction
    })

    // Step 2: 删除旧主键列
    console.log(`     Step 2: 删除旧主键列 ${oldPK}`)
    await sequelize.query(`ALTER TABLE ${table} DROP COLUMN ${oldPK}`, {
      transaction
    })

    // Step 3: 添加新主键
    console.log(`     Step 3: 添加新主键 ${newPK}`)
    await sequelize.query(
      `ALTER TABLE ${table} 
       ADD COLUMN ${newPK} ${pkType} PRIMARY KEY AUTO_INCREMENT FIRST`,
      { transaction }
    )

    await transaction.commit()
    return true
  } catch (error) {
    await transaction.rollback()
    throw error
  }
}

/**
 * 执行单个表的迁移
 */
async function migrateTable (config) {
  const { table, stage } = config

  console.log(`\n📋 [阶段${stage}] 迁移 ${table}`)

  try {
    // 检查记录数
    const [countResult] = await sequelize.query(`SELECT COUNT(*) as total FROM ${table}`)
    const recordCount = countResult[0].total
    console.log(`   记录数: ${recordCount}`)

    // 如果是类型改变的迁移且有数据，需要特殊处理
    if (config.typeChange && recordCount > 0) {
      console.warn(`   ⚠️  警告：${table}表有${recordCount}条记录，主键类型将改变`)
      // 对于有少量数据的表，我们仍然继续（数据会在新主键中重新编号）
    }

    // 检查外键
    const foreignKeys = await checkForeignKeys(table)
    console.log(`   外键约束数: ${foreignKeys.length}`)

    // 删除外键约束
    const droppedFKs = await dropForeignKeys(foreignKeys, table)

    // 执行迁移
    if (config.typeChange) {
      await migrateTypeChange(config)
    } else {
      await migrateSimpleRename(config)
    }

    // 重建外键约束
    if (droppedFKs.length > 0) {
      await rebuildForeignKeys(droppedFKs, table, config.newPK)
    }

    console.log(`   ✅ ${table} 迁移成功`)
    return { table, success: true }
  } catch (error) {
    console.error(`   ❌ ${table} 迁移失败: ${error.message}`)
    return { table, success: false, error: error.message }
  }
}

/**
 * 验证迁移结果
 */
async function verifyMigration () {
  console.log('\n🔍 验证迁移结果...\n')

  let allSuccess = true

  for (const config of MIGRATIONS) {
    const [columns] = await sequelize.query(`
      SELECT COLUMN_NAME, COLUMN_KEY, COLUMN_TYPE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = '${process.env.DB_NAME}'
        AND TABLE_NAME = '${config.table}'
        AND COLUMN_KEY = 'PRI'
    `)

    if (columns.length > 0 && columns[0].COLUMN_NAME === config.newPK) {
      console.log(
        `   ✅ ${config.table.padEnd(25)} 主键 = ${columns[0].COLUMN_NAME.padEnd(20)} (${columns[0].COLUMN_TYPE})`
      )
    } else {
      console.error(
        `   ❌ ${config.table.padEnd(25)} 主键不正确，期望 ${config.newPK}，实际 ${columns[0]?.COLUMN_NAME || '无'}`
      )
      allSuccess = false
    }
  }

  return allSuccess
}

/**
 * 主函数
 */
async function main () {
  console.log('🚀 主键命名统一 - 完整迁移')
  console.log('='.repeat(80))
  console.log(`数据库: ${process.env.DB_NAME}`)
  console.log(`迁移表数: ${MIGRATIONS.length}`)
  console.log('='.repeat(80))

  try {
    // 测试数据库连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 按阶段执行迁移
    const results = []
    for (let stage = 1; stage <= 4; stage++) {
      const stageMigrations = MIGRATIONS.filter(m => m.stage === stage)
      if (stageMigrations.length === 0) continue

      console.log(`\n${'='.repeat(80)}`)
      console.log(`阶段${stage}：${stageMigrations.length}个表`)
      console.log('='.repeat(80))

      for (const config of stageMigrations) {
        const result = await migrateTable(config)
        results.push(result)
      }
    }

    // 验证结果
    const allSuccess = await verifyMigration()

    // 统计结果
    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    console.log('\n' + '='.repeat(80))
    console.log('📊 迁移结果统计')
    console.log('='.repeat(80))
    console.log(`成功: ${successCount}/${MIGRATIONS.length}`)
    console.log(`失败: ${failCount}/${MIGRATIONS.length}`)

    if (allSuccess && failCount === 0) {
      console.log('\n✅ 所有表迁移成功！')
      console.log('\n📌 下一步：')
      console.log('   1. 修改模型文件')
      console.log('   2. 修改业务代码')
      console.log('   3. 运行测试验证')
    } else {
      console.error('\n❌ 部分表迁移失败，请检查错误信息')
      process.exit(1)
    }
  } catch (error) {
    console.error('\n❌ 迁移过程失败:', error.message)
    console.error('\n⚠️  请检查备份文件，如需回滚请使用备份恢复')
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 执行迁移
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 脚本执行失败:', error)
    process.exit(1)
  })
}

module.exports = { main }
