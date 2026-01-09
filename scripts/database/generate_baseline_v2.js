#!/usr/bin/env node

/**
 * 权威Baseline迁移生成器
 *
 * 功能说明：
 * - 从当前数据库schema自动生成完整的baseline迁移文件
 * - 包含所有表、字段、索引、外键的完整定义
 * - 作为新环境部署的权威起点
 *
 * 使用方式：
 * node scripts/database/generate-baseline-v2.js
 *
 * 创建时间：2026年01月04日
 * 基于：数据库迁移管理现状核对报告拍板决策
 */

'use strict'

require('dotenv').config()

const fs = require('fs')
const path = require('path')
const { Sequelize } = require('sequelize')

// 创建数据库连接
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  dialect: 'mysql',
  timezone: '+08:00',
  logging: false,
  pool: { max: 5, min: 1, acquire: 10000, idle: 10000 }
})

// Sequelize类型映射
const MYSQL_TO_SEQUELIZE_TYPE = {
  bigint: 'BIGINT',
  int: 'INTEGER',
  mediumint: 'MEDIUMINT',
  smallint: 'SMALLINT',
  tinyint: 'TINYINT',
  decimal: 'DECIMAL',
  float: 'FLOAT',
  double: 'DOUBLE',
  varchar: 'STRING',
  char: 'CHAR',
  text: 'TEXT',
  mediumtext: 'TEXT',
  longtext: 'TEXT',
  tinytext: 'TEXT',
  blob: 'BLOB',
  mediumblob: 'BLOB',
  longblob: 'BLOB',
  datetime: 'DATE',
  timestamp: 'DATE',
  date: 'DATEONLY',
  time: 'TIME',
  json: 'JSON',
  enum: 'ENUM',
  boolean: 'BOOLEAN'
}

/**
 * 解析MySQL字段类型为Sequelize类型
 * @param {string} columnType - MySQL字段类型（如 varchar(255), int(11), decimal(10,2)）
 * @returns {string} Sequelize类型表达式
 */
function parseColumnType(columnType, dataType) {
  let sequelizeType = MYSQL_TO_SEQUELIZE_TYPE[dataType.toLowerCase()] || 'STRING'

  // 处理特殊类型
  if (dataType === 'varchar' || dataType === 'char') {
    const match = columnType.match(/\((\d+)\)/)
    if (match) {
      sequelizeType = `STRING(${match[1]})`
    }
  } else if (dataType === 'decimal') {
    const match = columnType.match(/\((\d+),(\d+)\)/)
    if (match) {
      sequelizeType = `DECIMAL(${match[1]}, ${match[2]})`
    }
  } else if (dataType === 'enum') {
    const match = columnType.match(/enum\(([^)]+)\)/i)
    if (match) {
      sequelizeType = `ENUM(${match[1]})`
    }
  } else if (dataType === 'tinyint') {
    if (columnType === 'tinyint(1)') {
      sequelizeType = 'BOOLEAN'
    }
  }

  return sequelizeType
}

/**
 * 获取所有表的结构信息
 */
async function getAllTableStructures() {
  const tables = {}

  // 获取所有表名
  const [tableList] = await sequelize.query(`
    SELECT TABLE_NAME as table_name, TABLE_COMMENT as table_comment
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME != 'sequelizemeta'
    ORDER BY TABLE_NAME
  `)

  for (const table of tableList) {
    const tableName = table.table_name

    // 获取字段信息
    const [columns] = await sequelize.query(
      `
      SELECT
        COLUMN_NAME as column_name,
        DATA_TYPE as data_type,
        COLUMN_TYPE as column_type,
        IS_NULLABLE as is_nullable,
        COLUMN_DEFAULT as column_default,
        COLUMN_KEY as column_key,
        EXTRA as extra,
        COLUMN_COMMENT as column_comment,
        CHARACTER_MAXIMUM_LENGTH as char_length,
        NUMERIC_PRECISION as num_precision,
        NUMERIC_SCALE as num_scale
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `,
      { replacements: [tableName] }
    )

    // 获取索引信息
    const [indexes] = await sequelize.query(
      `
      SELECT
        INDEX_NAME as index_name,
        NON_UNIQUE as non_unique,
        COLUMN_NAME as column_name,
        SEQ_IN_INDEX as seq_in_index
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      ORDER BY INDEX_NAME, SEQ_IN_INDEX
    `,
      { replacements: [tableName] }
    )

    // 获取外键信息
    const [foreignKeys] = await sequelize.query(
      `
      SELECT
        CONSTRAINT_NAME as constraint_name,
        COLUMN_NAME as column_name,
        REFERENCED_TABLE_NAME as referenced_table,
        REFERENCED_COLUMN_NAME as referenced_column
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `,
      { replacements: [tableName] }
    )

    tables[tableName] = {
      comment: table.table_comment,
      columns,
      indexes: groupIndexes(indexes),
      foreignKeys
    }
  }

  return tables
}

/**
 * 将索引按名称分组
 */
function groupIndexes(indexes) {
  const grouped = {}
  for (const idx of indexes) {
    if (!grouped[idx.index_name]) {
      grouped[idx.index_name] = {
        name: idx.index_name,
        unique: idx.non_unique === 0,
        columns: []
      }
    }
    grouped[idx.index_name].columns.push(idx.column_name)
  }
  return Object.values(grouped)
}

/**
 * 生成字段定义代码
 */
function generateColumnDefinition(col) {
  const parts = []
  const sequelizeType = parseColumnType(col.column_type, col.data_type)

  parts.push(`type: Sequelize.${sequelizeType}`)

  // 处理NULL约束
  if (col.is_nullable === 'NO') {
    parts.push('allowNull: false')
  } else {
    parts.push('allowNull: true')
  }

  // 处理默认值
  if (col.column_default !== null) {
    let defaultValue = col.column_default
    if (defaultValue === 'CURRENT_TIMESTAMP') {
      parts.push("defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')")
    } else if (defaultValue === 'NULL') {
      parts.push('defaultValue: null')
    } else if (!isNaN(parseFloat(defaultValue))) {
      parts.push(`defaultValue: ${defaultValue}`)
    } else {
      parts.push(`defaultValue: '${defaultValue.replace(/'/g, "\\'")}'`)
    }
  }

  // 处理主键
  if (col.column_key === 'PRI') {
    parts.push('primaryKey: true')
  }

  // 处理自增
  if (col.extra && col.extra.includes('auto_increment')) {
    parts.push('autoIncrement: true')
  }

  // 处理注释
  if (col.column_comment) {
    parts.push(`comment: '${col.column_comment.replace(/'/g, "\\'")}'`)
  }

  return `        ${col.column_name}: {\n          ${parts.join(',\n          ')}\n        }`
}

/**
 * 生成完整的baseline迁移文件
 */
async function generateBaselineMigration() {
  console.log('🔧 权威Baseline迁移生成器')
  console.log('='.repeat(60))
  console.log(`数据库: ${process.env.DB_NAME}`)
  console.log(`主机: ${process.env.DB_HOST}:${process.env.DB_PORT}`)
  console.log('')

  try {
    // 测试连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 获取所有表结构
    console.log('📊 获取表结构...')
    const tables = await getAllTableStructures()
    const tableNames = Object.keys(tables).sort()
    console.log(`   找到 ${tableNames.length} 张表`)

    // 生成迁移文件内容
    const timestamp = '20260104000000'
    const migrationName = `${timestamp}-baseline-v2.0.0-from-production.js`
    const outputPath = path.join(__dirname, '../../migrations', migrationName)

    let migrationContent = `/**
 * 权威Baseline迁移 V2.0.0
 *
 * 生成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
 * 生成方式: 从生产数据库 ${process.env.DB_NAME} schema 自动生成
 *
 * 说明：
 * - 基于 2026-01-04 真实数据库 schema 生成
 * - 包含所有 ${tableNames.length} 张表的完整定义
 * - 包含所有索引、外键约束
 * - 新环境部署：只需执行此 baseline + 之后的增量迁移
 * - 历史迁移（196条）仅作存档，不再用于重放
 *
 * 使用方式：
 * - 新环境：执行 baseline + 增量迁移
 * - 现有环境：跳过 baseline（已包含在历史迁移中）
 *
 * 表清单（${tableNames.length}张）：
${tableNames.map((t, i) => ` * ${i + 1}. ${t}`).join('\n')}
 */

'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🚀 开始执行Baseline V2.0.0迁移...')
      console.log('   共需创建 ${tableNames.length} 张表')

`

    // 生成每张表的创建语句
    for (let i = 0; i < tableNames.length; i++) {
      const tableName = tableNames[i]
      const tableInfo = tables[tableName]

      migrationContent += `      // ==================== 表 ${i + 1}/${tableNames.length}: ${tableName} ====================
      console.log('📦 [${i + 1}/${tableNames.length}] 创建表: ${tableName}')
      await queryInterface.createTable('${tableName}', {
${tableInfo.columns.map(col => generateColumnDefinition(col)).join(',\n')}
      }, {
        transaction,
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci'${tableInfo.comment ? `,\n        comment: '${tableInfo.comment.replace(/'/g, "\\'")}'` : ''}
      })

`

      // 生成索引（排除主键，因为主键已在字段定义中处理）
      const nonPrimaryIndexes = tableInfo.indexes.filter(idx => idx.name !== 'PRIMARY')
      if (nonPrimaryIndexes.length > 0) {
        migrationContent += `      // ${tableName} 索引\n`
        for (const idx of nonPrimaryIndexes) {
          if (idx.name.startsWith('fk_') || idx.name.endsWith('_fk')) {
            // 跳过外键索引，外键会自动创建索引
            continue
          }
          const indexFields = idx.columns.map(c => `'${c}'`).join(', ')
          migrationContent += `      await queryInterface.addIndex('${tableName}', [${indexFields}], {
        name: '${idx.name}',
        unique: ${idx.unique},
        transaction
      })
`
        }
        migrationContent += '\n'
      }
    }

    // 生成外键约束
    migrationContent += `      // ==================== 外键约束 ====================
      console.log('🔗 创建外键约束...')

`

    for (const tableName of tableNames) {
      const tableInfo = tables[tableName]
      if (tableInfo.foreignKeys.length > 0) {
        migrationContent += `      // ${tableName} 外键\n`
        for (const fk of tableInfo.foreignKeys) {
          migrationContent += `      await queryInterface.addConstraint('${tableName}', {
        fields: ['${fk.column_name}'],
        type: 'foreign key',
        name: '${fk.constraint_name}',
        references: {
          table: '${fk.referenced_table}',
          field: '${fk.referenced_column}'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        transaction
      })
`
        }
        migrationContent += '\n'
      }
    }

    migrationContent += `      await transaction.commit()
      console.log('✅ Baseline V2.0.0迁移执行成功！')
      console.log('   共创建 ${tableNames.length} 张表')

    } catch (error) {
      await transaction.rollback()
      console.error('❌ Baseline迁移执行失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 回滚Baseline V2.0.0迁移...')

      // 按照反向顺序删除表（先删除有外键依赖的表）
      const tables = [
${tableNames
  .reverse()
  .map(t => `        '${t}'`)
  .join(',\n')}
      ]

      for (const table of tables) {
        try {
          await queryInterface.dropTable(table, { transaction, cascade: true })
          console.log(\`🗑️ 删除表: \${table}\`)
        } catch (error) {
          console.warn(\`⚠️ 删除表失败: \${table} - \${error.message}\`)
        }
      }

      await transaction.commit()
      console.log('✅ Baseline回滚完成')

    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
`

    // 写入文件
    fs.writeFileSync(outputPath, migrationContent)
    console.log(`\n✅ Baseline迁移文件已生成: ${migrationName}`)
    console.log(`   路径: ${outputPath}`)
    console.log(`   包含 ${tableNames.length} 张表的完整定义`)

    // 关闭连接
    await sequelize.close()

    return {
      success: true,
      migrationFile: migrationName,
      tableCount: tableNames.length
    }
  } catch (error) {
    console.error(`\n❌ 生成失败: ${error.message}`)
    await sequelize.close().catch(() => {})
    process.exit(1)
  }
}

// 执行
generateBaselineMigration()
