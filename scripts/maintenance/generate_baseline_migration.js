#!/usr/bin/env node
/**
 * 从 DDL 导出生成新的 baseline 迁移文件
 *
 * 用途：读取 /tmp/schema_dump.sql 的 CREATE TABLE 语句，
 *       生成一个可在空库上执行的 Sequelize baseline 迁移
 *
 * 原则：
 * - 使用 CREATE TABLE IF NOT EXISTS（幂等，在已有库上安全）
 * - 严格保留数据库真实结构（索引、外键、字符集、生成列等）
 * - down() 按依赖顺序 DROP 所有表
 *
 * 使用方式：node scripts/maintenance/generate_baseline_migration.js
 */

'use strict'

const fs = require('fs')
const path = require('path')

// 读取 DDL 导出文件
const ddlPath = '/tmp/schema_dump.sql'
if (!fs.existsSync(ddlPath)) {
  console.error('❌ 请先运行 export_schema_ddl.js 导出 DDL')
  process.exit(1)
}

const rawDDL = fs.readFileSync(ddlPath, 'utf8')

// 解析每张表的 CREATE TABLE 语句
const createStatements = rawDDL
  .split(/;\s*\n\n/)
  .map(s => s.trim())
  .filter(s => s.startsWith('CREATE TABLE'))

console.log(`📋 解析到 ${createStatements.length} 条 CREATE TABLE 语句`)

// 提取表名及其外键依赖关系，用于确定创建/删除顺序
const tableInfo = createStatements.map(stmt => {
  const nameMatch = stmt.match(/CREATE TABLE `(\w+)`/)
  const name = nameMatch ? nameMatch[1] : 'unknown'

  // 提取外键依赖
  const fkMatches = [...stmt.matchAll(/REFERENCES `(\w+)`/g)]
  const deps = [...new Set(fkMatches.map(m => m[1]).filter(d => d !== name))]

  return { name, deps, stmt }
})

// 拓扑排序：确保被依赖的表先创建
function topologicalSort(tables) {
  const sorted = []
  const visited = new Set()
  const visiting = new Set()
  const tableMap = new Map(tables.map(t => [t.name, t]))

  function visit(name) {
    if (visited.has(name)) return
    if (visiting.has(name)) return // 循环依赖跳过
    visiting.add(name)

    const table = tableMap.get(name)
    if (table) {
      for (const dep of table.deps) {
        if (tableMap.has(dep)) visit(dep)
      }
      sorted.push(table)
    }
    visiting.delete(name)
    visited.add(name)
  }

  for (const t of tables) visit(t.name)
  return sorted
}

const sortedTables = topologicalSort(tableInfo)
console.log(`📋 拓扑排序完成，创建顺序前5张表: ${sortedTables.slice(0, 5).map(t => t.name).join(', ')}`)

// 将 CREATE TABLE 转为 CREATE TABLE IF NOT EXISTS
function makeIdempotent(stmt) {
  return stmt.replace(/^CREATE TABLE `/, 'CREATE TABLE IF NOT EXISTS `')
}

// 生成迁移文件内容
const migrationTimestamp = '20260206000000'
const migrationName = `${migrationTimestamp}-baseline-v3.0.0-squashed`
const migrationFileName = `${migrationName}.js`

// 按拓扑顺序生成 up 中的 CREATE TABLE
const upStatements = sortedTables.map((t, i) => {
  const escapedSql = makeIdempotent(t.stmt)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')

  return `    // ${i + 1}/${sortedTables.length} ${t.name}
    await queryInterface.sequelize.query(\`${makeIdempotent(t.stmt).replace(/`/g, '\\`')}\`, { transaction });`
}).join('\n\n')

// 反向删除顺序（先删有外键的表）
const dropOrder = [...sortedTables].reverse()
const downStatements = dropOrder.map((t, i) => {
  return `    // ${i + 1}/${dropOrder.length} 删除 ${t.name}
    await queryInterface.dropTable('${t.name}', { transaction });`
}).join('\n\n')

const migrationContent = `/**
 * Baseline V3.0.0 - 从生产数据库 squash 生成
 *
 * 此迁移文件由 generate_baseline_migration.js 自动生成
 * 基于 restaurant_points_dev 数据库的真实 schema
 *
 * 包含 ${sortedTables.length} 张业务表的完整定义
 * 使用 CREATE TABLE IF NOT EXISTS（幂等安全）
 *
 * 生成时间：${new Date().toISOString().replace('Z', '+08:00')}
 * 替代：旧 baseline-v2.0.0（6258行）+ 114个增量迁移
 */

'use strict'

module.exports = {
  /**
   * 创建所有业务表（幂等 - 已存在的表不会被影响）
   */
  up: async (queryInterface, Sequelize) => {
    console.log('🚀 Baseline V3.0.0: 开始创建 ${sortedTables.length} 张业务表...')
    const transaction = await queryInterface.sequelize.transaction()

    try {
${upStatements}

      await transaction.commit()
      console.log('✅ Baseline V3.0.0: ${sortedTables.length} 张表创建完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ Baseline V3.0.0 执行失败:', error.message)
      throw error
    }
  },

  /**
   * 按依赖顺序删除所有业务表
   */
  down: async (queryInterface, Sequelize) => {
    console.log('🔄 Baseline V3.0.0: 开始回滚（删除所有业务表）...')
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 先禁用外键检查以避免依赖顺序问题
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });

${downStatements}

      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
      await transaction.commit()
      console.log('✅ Baseline V3.0.0: 所有表已删除')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ Baseline V3.0.0 回滚失败:', error.message)
      throw error
    }
  }
}
`

// 写入迁移文件
const outputPath = path.join(__dirname, '../../migrations', migrationFileName)
fs.writeFileSync(outputPath, migrationContent, 'utf8')

const lines = migrationContent.split('\n').length
console.log(`✅ 已生成 ${migrationFileName}`)
console.log(`   📏 ${lines} 行（旧 baseline 6258 行，压缩 ${Math.round((1 - lines / 6258) * 100)}%）`)
console.log(`   📋 ${sortedTables.length} 张表`)
console.log(`   📂 ${outputPath}`)

