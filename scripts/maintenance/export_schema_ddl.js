#!/usr/bin/env node
/**
 * 数据库 Schema DDL 导出脚本
 *
 * 用途：导出当前数据库所有表的 CREATE TABLE 语句到 /tmp/schema_dump.sql
 * 场景：用于生成新的 baseline 迁移文件
 *
 * 使用方式：node scripts/maintenance/export_schema_ddl.js
 */

'use strict'

require('dotenv').config()
const { Sequelize } = require('sequelize')

const seq = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql',
    logging: false
  }
)

async function main() {
  await seq.authenticate()
  console.log(`✅ 已连接数据库: ${process.env.DB_NAME}`)

  // 获取所有表名（排除 SequelizeMeta）
  const [tables] = await seq.query('SHOW TABLES')
  const tableNames = tables
    .map(t => Object.values(t)[0])
    .filter(t => t !== 'SequelizeMeta' && t !== 'sequelizemeta')
    .sort()

  console.log(`📋 发现 ${tableNames.length} 张业务表`)

  // 导出每张表的 CREATE TABLE
  const allDDL = []
  for (const tbl of tableNames) {
    const [[row]] = await seq.query(`SHOW CREATE TABLE \`${tbl}\``)
    allDDL.push(row['Create Table'] + ';')
  }

  const outputPath = '/tmp/schema_dump.sql'
  require('fs').writeFileSync(outputPath, allDDL.join('\n\n'), 'utf8')
  console.log(`✅ DDL 已导出到 ${outputPath}（${tableNames.length} 张表）`)

  // 同时导出 SequelizeMeta 中已执行的迁移列表
  const [metaRows] = await seq.query('SELECT name FROM `SequelizeMeta` ORDER BY name')
  const metaNames = metaRows.map(r => r.name)
  require('fs').writeFileSync('/tmp/sequelize_meta_list.txt', metaNames.join('\n'), 'utf8')
  console.log(`📋 SequelizeMeta 已导出（${metaNames.length} 条记录）`)

  await seq.close()
}

main().catch(err => {
  console.error('❌ 导出失败:', err.message)
  process.exit(1)
})

