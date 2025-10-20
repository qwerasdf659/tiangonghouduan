#!/usr/bin/env node
/**
 * 主键命名统一 - 阶段1迁移脚本
 * 改造核心业务表：exchange_records, trade_records, user_inventory
 *
 * 改造内容：
 * 1. exchange_records: id → exchange_id, exchange_id → exchange_code
 * 2. trade_records: id → trade_id, trade_id → trade_code
 * 3. user_inventory: id(STRING) → inventory_id(INT)
 */

require('dotenv').config()
const { Sequelize } = require('sequelize')

// 创建数据库连接
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: 'mysql',
  timezone: process.env.DB_TIMEZONE || '+08:00',
  logging: console.log
})

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
 * 迁移 exchange_records 表
 * id → exchange_id
 * exchange_id → exchange_code
 */
async function migrateExchangeRecords () {
  console.log('\n📋 迁移 exchange_records 表...')

  try {
    // 检查外键
    const foreignKeys = await checkForeignKeys('exchange_records')
    console.log(`   发现 ${foreignKeys.length} 个外键约束`)

    if (foreignKeys.length > 0) {
      console.log('   外键列表:')
      foreignKeys.forEach(fk => {
        console.log(
          `     - ${fk.TABLE_NAME}.${fk.COLUMN_NAME} → ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}`
        )
      })

      // 删除外键（改造后重建）
      for (const fk of foreignKeys) {
        if (fk.TABLE_NAME !== 'exchange_records') {
          console.log(`   删除外键: ${fk.CONSTRAINT_NAME}`)
          await sequelize.query(
            `ALTER TABLE ${fk.TABLE_NAME} DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`
          )
        }
      }
    }

    // 开始事务
    const transaction = await sequelize.transaction()

    try {
      // Step 1: 修改主键名称（id → exchange_id）
      console.log('   Step 1: 修改主键 id → exchange_id')
      await sequelize.query(
        `ALTER TABLE exchange_records 
         CHANGE COLUMN id exchange_id INT PRIMARY KEY AUTO_INCREMENT 
         COMMENT '兑换记录主键ID'`,
        { transaction }
      )

      // Step 2: 修改业务ID字段名称（exchange_id → exchange_code）
      console.log('   Step 2: 修改业务ID字段 exchange_id → exchange_code')
      await sequelize.query(
        `ALTER TABLE exchange_records 
         CHANGE COLUMN exchange_id exchange_code VARCHAR(50) UNIQUE 
         COMMENT '兑换业务编号（用户凭证）'`,
        { transaction }
      )

      // 提交事务
      await transaction.commit()
      console.log('   ✅ exchange_records 迁移成功')

      // 重建外键
      if (foreignKeys.length > 0) {
        for (const fk of foreignKeys) {
          if (fk.TABLE_NAME !== 'exchange_records') {
            console.log(
              `   重建外键: ${fk.TABLE_NAME}.${fk.COLUMN_NAME} → exchange_records.exchange_id`
            )
            await sequelize.query(`
              ALTER TABLE ${fk.TABLE_NAME}
              ADD CONSTRAINT ${fk.CONSTRAINT_NAME}
              FOREIGN KEY (${fk.COLUMN_NAME}) REFERENCES exchange_records(exchange_id)
            `)
          }
        }
      }
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  } catch (error) {
    console.error('   ❌ exchange_records 迁移失败:', error.message)
    throw error
  }
}

/**
 * 迁移 trade_records 表
 * id → trade_id
 * trade_id → trade_code
 */
async function migrateTradeRecords () {
  console.log('\n📋 迁移 trade_records 表...')

  try {
    // 检查外键
    const foreignKeys = await checkForeignKeys('trade_records')
    console.log(`   发现 ${foreignKeys.length} 个外键约束`)

    if (foreignKeys.length > 0) {
      for (const fk of foreignKeys) {
        if (fk.TABLE_NAME !== 'trade_records') {
          console.log(`   删除外键: ${fk.CONSTRAINT_NAME}`)
          await sequelize.query(
            `ALTER TABLE ${fk.TABLE_NAME} DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`
          )
        }
      }
    }

    // 开始事务
    const transaction = await sequelize.transaction()

    try {
      // Step 1: 修改主键名称（id → trade_id）
      console.log('   Step 1: 修改主键 id → trade_id')
      await sequelize.query(
        `ALTER TABLE trade_records 
         CHANGE COLUMN id trade_id INT PRIMARY KEY AUTO_INCREMENT 
         COMMENT '交易记录主键ID'`,
        { transaction }
      )

      // Step 2: 修改业务ID字段名称（trade_id → trade_code）
      console.log('   Step 2: 修改业务ID字段 trade_id → trade_code')
      await sequelize.query(
        `ALTER TABLE trade_records 
         CHANGE COLUMN trade_id trade_code VARCHAR(50) UNIQUE 
         COMMENT '交易业务编号'`,
        { transaction }
      )

      // 提交事务
      await transaction.commit()
      console.log('   ✅ trade_records 迁移成功')

      // 重建外键
      if (foreignKeys.length > 0) {
        for (const fk of foreignKeys) {
          if (fk.TABLE_NAME !== 'trade_records') {
            console.log(`   重建外键: ${fk.TABLE_NAME}.${fk.COLUMN_NAME} → trade_records.trade_id`)
            await sequelize.query(`
              ALTER TABLE ${fk.TABLE_NAME}
              ADD CONSTRAINT ${fk.CONSTRAINT_NAME}
              FOREIGN KEY (${fk.COLUMN_NAME}) REFERENCES trade_records(trade_id)
            `)
          }
        }
      }
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  } catch (error) {
    console.error('   ❌ trade_records 迁移失败:', error.message)
    throw error
  }
}

/**
 * 迁移 user_inventory 表
 * id(VARCHAR) → inventory_id(INT)
 * 特别注意：这个表的主键类型需要改变
 */
async function migrateUserInventory () {
  console.log('\n📋 迁移 user_inventory 表...')

  try {
    // 检查是否有数据
    const [countResult] = await sequelize.query('SELECT COUNT(*) as total FROM user_inventory')
    const recordCount = countResult[0].total

    if (recordCount > 0) {
      console.warn(`   ⚠️  警告：user_inventory表有 ${recordCount} 条记录`)
      console.warn('   此改造会改变主键类型，可能影响现有数据')
      throw new Error('user_inventory表有数据，需要手动处理数据迁移')
    }

    // 检查外键
    const foreignKeys = await checkForeignKeys('user_inventory')
    console.log(`   发现 ${foreignKeys.length} 个外键约束`)

    if (foreignKeys.length > 0) {
      for (const fk of foreignKeys) {
        if (fk.TABLE_NAME !== 'user_inventory') {
          console.log(`   删除外键: ${fk.CONSTRAINT_NAME}`)
          await sequelize.query(
            `ALTER TABLE ${fk.TABLE_NAME} DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`
          )
        }
      }
    }

    // 开始事务
    const transaction = await sequelize.transaction()

    try {
      // 由于主键类型要改变，需要先删除主键约束
      console.log('   Step 1: 删除旧主键')
      await sequelize.query('ALTER TABLE user_inventory MODIFY COLUMN id VARCHAR(32)', {
        transaction
      })
      await sequelize.query('ALTER TABLE user_inventory DROP PRIMARY KEY', {
        transaction
      })

      // 删除旧的id列
      console.log('   Step 2: 删除旧id列')
      await sequelize.query('ALTER TABLE user_inventory DROP COLUMN id', {
        transaction
      })

      // 添加新的inventory_id主键
      console.log('   Step 3: 添加新主键 inventory_id')
      await sequelize.query(
        `ALTER TABLE user_inventory 
         ADD COLUMN inventory_id INT PRIMARY KEY AUTO_INCREMENT FIRST 
         COMMENT '库存记录主键ID'`,
        { transaction }
      )

      // 提交事务
      await transaction.commit()
      console.log('   ✅ user_inventory 迁移成功')

      // 重建外键
      if (foreignKeys.length > 0) {
        for (const fk of foreignKeys) {
          if (fk.TABLE_NAME !== 'user_inventory') {
            console.log(
              `   重建外键: ${fk.TABLE_NAME}.${fk.COLUMN_NAME} → user_inventory.inventory_id`
            )
            await sequelize.query(`
              ALTER TABLE ${fk.TABLE_NAME}
              ADD CONSTRAINT ${fk.CONSTRAINT_NAME}
              FOREIGN KEY (${fk.COLUMN_NAME}) REFERENCES user_inventory(inventory_id)
            `)
          }
        }
      }
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  } catch (error) {
    console.error('   ❌ user_inventory 迁移失败:', error.message)
    throw error
  }
}

/**
 * 验证迁移结果
 */
async function verifyMigration () {
  console.log('\n🔍 验证迁移结果...')

  const tables = [
    {
      name: 'exchange_records',
      expectedPK: 'exchange_id',
      expectedBusinessId: 'exchange_code'
    },
    {
      name: 'trade_records',
      expectedPK: 'trade_id',
      expectedBusinessId: 'trade_code'
    },
    { name: 'user_inventory', expectedPK: 'inventory_id' }
  ]

  for (const table of tables) {
    const [columns] = await sequelize.query(`
      SELECT COLUMN_NAME, COLUMN_KEY, COLUMN_TYPE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = '${process.env.DB_NAME}'
        AND TABLE_NAME = '${table.name}'
        AND COLUMN_KEY = 'PRI'
    `)

    if (columns.length > 0 && columns[0].COLUMN_NAME === table.expectedPK) {
      console.log(
        `   ✅ ${table.name}: 主键 = ${columns[0].COLUMN_NAME} (${columns[0].COLUMN_TYPE})`
      )
    } else {
      console.error(
        `   ❌ ${table.name}: 主键不正确，期望 ${table.expectedPK}，实际 ${columns[0]?.COLUMN_NAME || '无'}`
      )
    }
  }
}

/**
 * 主函数
 */
async function main () {
  console.log('🚀 主键命名统一 - 阶段1迁移')
  console.log('='.repeat(80))
  console.log('改造表：exchange_records, trade_records, user_inventory')
  console.log('='.repeat(80))

  try {
    // 测试数据库连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 执行迁移
    await migrateExchangeRecords()
    await migrateTradeRecords()
    await migrateUserInventory()

    // 验证结果
    await verifyMigration()

    console.log('\n✅ 阶段1迁移完成！')
  } catch (error) {
    console.error('\n❌ 迁移失败:', error.message)
    console.error('\n⚠️  请检查备份文件，如需回滚请使用备份恢复')
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 执行迁移
main().catch(error => {
  console.error('❌ 脚本执行失败:', error)
  process.exit(1)
})
