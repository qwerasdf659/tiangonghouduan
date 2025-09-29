#!/usr/bin/env node

/**
 * 外键约束检查脚本（扩展版）
 * 🎯 数据驱动验证：先验证，后假设
 * 🔗 分析数据库外键完整性和模型引用关系
 * 📊 业务逻辑一致性验证
 * 🛠️ 自动修复建议和索引优化
 *
 * 扩展功能：
 * - 数据完整性验证（孤儿记录检查）
 * - 业务逻辑外键关系验证
 * - 性能索引分析
 * - 自动修复SQL生成
 *
 * 更新时间：2025年09月29日 UTC时间 - 使用统一数据库连接
 */

require('dotenv').config()
const { getDatabaseHelper } = require('../utils/database')
const BeijingTimeHelper = require('../utils/timeHelper')

// 使用统一数据库助手
const dbHelper = getDatabaseHelper()
const sequelize = dbHelper.getSequelize()

/**
 * 🎯 业务关键外键关系定义（基于真实业务需求）
 * 数据驱动：基于实际表结构和业务逻辑
 */
const CRITICAL_FOREIGN_KEYS = [
  {
    table: 'lottery_draws',
    column: 'user_id',
    references: 'users(user_id)',
    business_rule: '抽奖记录必须关联有效用户',
    cascade: 'CASCADE', // 用户删除时级联删除抽奖记录
    priority: 'HIGH'
  },
  {
    table: 'lottery_draws',
    column: 'campaign_id',
    references: 'lottery_campaigns(campaign_id)', // 🔧 修正：实际表名是lottery_campaigns
    business_rule: '抽奖记录必须关联有效活动',
    cascade: 'RESTRICT', // 活动不能删除如果有抽奖记录
    priority: 'HIGH'
  },
  {
    table: 'trade_records',
    column: 'from_user_id', // 🔧 修正：实际字段是from_user_id而非user_id
    references: 'users(user_id)',
    business_rule: '交易发起方必须关联有效用户',
    cascade: 'CASCADE',
    priority: 'HIGH'
  },
  {
    table: 'trade_records',
    column: 'to_user_id', // 🔧 新增：交易接收方外键
    references: 'users(user_id)',
    business_rule: '交易接收方必须关联有效用户',
    cascade: 'CASCADE',
    priority: 'HIGH'
  },
  {
    table: 'exchange_records',
    column: 'user_id',
    references: 'users(user_id)',
    business_rule: '兑换记录必须关联有效用户',
    cascade: 'CASCADE',
    priority: 'HIGH'
  },
  {
    table: 'points_transactions', // 🔧 修正：实际表名是points_transactions
    column: 'user_id',
    references: 'users(user_id)',
    business_rule: '积分交易必须关联有效用户',
    cascade: 'CASCADE',
    priority: 'MEDIUM'
  },
  {
    table: 'points_transactions',
    column: 'account_id', // 🔧 新增：积分账户外键验证
    references: 'user_points_accounts(account_id)',
    business_rule: '积分交易必须关联有效积分账户',
    cascade: 'RESTRICT',
    priority: 'MEDIUM'
  }
]

/**
 * 📊 数据完整性验证 - 检查孤儿记录
 * 数据驱动：基于真实数据验证外键完整性
 */
async function validateDataIntegrity () {
  console.log('\n📊 数据完整性验证（孤儿记录检查）')
  console.log('='.repeat(50))

  const orphanRecords = []

  for (const fk of CRITICAL_FOREIGN_KEYS) {
    try {
      console.log(`\n🔍 检查 ${fk.table}.${fk.column} → ${fk.references}`)

      // 检查孤儿记录（子表有记录但父表没有对应记录）
      const [orphans] = await sequelize.query(`
        SELECT COUNT(*) as orphan_count
        FROM ${fk.table} c
        LEFT JOIN ${fk.references.split('(')[0]} p 
          ON c.${fk.column} = p.${fk.references.split('(')[1].replace(')', '')}
        WHERE p.${fk.references.split('(')[1].replace(')', '')} IS NULL
          AND c.${fk.column} IS NOT NULL
      `)

      const orphanCount = orphans[0].orphan_count

      if (orphanCount > 0) {
        console.log(`   ❌ 发现 ${orphanCount} 条孤儿记录`)
        orphanRecords.push({
          table: fk.table,
          column: fk.column,
          count: orphanCount,
          business_rule: fk.business_rule,
          priority: fk.priority
        })

        // 显示前5条孤儿记录的详细信息
        const [details] = await sequelize.query(`
          SELECT c.${fk.column} as invalid_id, COUNT(*) as count
          FROM ${fk.table} c
          LEFT JOIN ${fk.references.split('(')[0]} p 
            ON c.${fk.column} = p.${fk.references.split('(')[1].replace(')', '')}
          WHERE p.${fk.references.split('(')[1].replace(')', '')} IS NULL
            AND c.${fk.column} IS NOT NULL
          GROUP BY c.${fk.column}
          LIMIT 5
        `)

        console.log('   🔍 问题记录示例:')
        details.forEach(record => {
          console.log(`      无效${fk.column}: ${record.invalid_id} (${record.count}条记录)`)
        })
      } else {
        console.log('   ✅ 数据完整性良好')
      }
    } catch (error) {
      console.log(`   ⚠️ 检查失败: ${error.message}`)
    }
  }

  return orphanRecords
}

/**
 * 🏗️ 缺失外键约束检查和修复建议
 */
async function generateForeignKeyFixSuggestions (existingConstraints) {
  console.log('\n🏗️ 外键约束修复建议')
  console.log('='.repeat(50))

  const fixSuggestions = []

  for (const fk of CRITICAL_FOREIGN_KEYS) {
    const exists = existingConstraints.some(
      c =>
        c.TABLE_NAME === fk.table &&
        c.COLUMN_NAME === fk.column &&
        c.REFERENCED_TABLE_NAME === fk.references.split('(')[0]
    )

    if (!exists) {
      console.log(`\n❌ 缺失外键: ${fk.table}.${fk.column} → ${fk.references}`)
      console.log(`   业务规则: ${fk.business_rule}`)
      console.log(`   优先级: ${fk.priority}`)

      const constraintName = `fk_${fk.table}_${fk.column}`
      const alterSQL = `
ALTER TABLE ${fk.table} 
ADD CONSTRAINT ${constraintName}
FOREIGN KEY (${fk.column}) 
REFERENCES ${fk.references}
ON DELETE ${fk.cascade}
ON UPDATE CASCADE;`

      console.log('   🛠️ 修复SQL:')
      console.log(alterSQL)

      fixSuggestions.push({
        table: fk.table,
        column: fk.column,
        references: fk.references,
        sql: alterSQL.trim(),
        priority: fk.priority,
        business_rule: fk.business_rule
      })
    } else {
      console.log(`✅ ${fk.table}.${fk.column} 外键约束已存在`)
    }
  }

  return fixSuggestions
}

/**
 * 📈 索引性能分析和优化建议
 */
async function analyzeIndexPerformance () {
  console.log('\n📈 索引性能分析')
  console.log('='.repeat(50))

  const indexSuggestions = []

  try {
    // 检查每个关键外键字段的索引情况
    for (const fk of CRITICAL_FOREIGN_KEYS) {
      const [indexes] = await sequelize.query(`
        SHOW INDEX FROM ${fk.table} WHERE Column_name = '${fk.column}'
      `)

      console.log(`\n🔍 ${fk.table}.${fk.column} 索引状态:`)

      if (indexes.length === 0) {
        console.log('   ❌ 缺失索引！')
        console.log('   📉 性能影响: 外键查询可能很慢')

        const createIndexSQL = `CREATE INDEX idx_${fk.table}_${fk.column} ON ${fk.table}(${fk.column});`
        console.log(`   🛠️ 建议创建索引: ${createIndexSQL}`)

        indexSuggestions.push({
          table: fk.table,
          column: fk.column,
          sql: createIndexSQL,
          reason: '外键字段需要索引以提升查询性能'
        })
      } else {
        console.log('   ✅ 索引已存在')
        indexes.forEach(idx => {
          console.log(`      ${idx.Key_name}: ${idx.Index_type}`)
        })
      }
    }
  } catch (error) {
    console.log(`⚠️ 索引分析失败: ${error.message}`)
  }

  return indexSuggestions
}

/**
 * 📋 生成完整的修复脚本
 */
function generateFixScript (fixSuggestions, indexSuggestions, orphanRecords) {
  console.log('\n📋 生成自动修复脚本')
  console.log('='.repeat(50))

  const timestamp = BeijingTimeHelper.nowLocale().replace(/[^0-9]/g, '')
  const scriptName = `fix-database-constraints-${timestamp}.sql`

  let script = `-- 数据库外键约束和索引修复脚本
-- 生成时间: ${BeijingTimeHelper.nowLocale()}
-- 数据库: ${process.env.DB_NAME}

-- ⚠️ 执行前请备份数据库！
-- ⚠️ 建议在测试环境先执行验证！

USE ${process.env.DB_NAME};

-- 1. 清理孤儿记录（可选，根据业务需求决定）
`

  // 添加孤儿记录清理建议
  if (orphanRecords.length > 0) {
    script += '\n-- 孤儿记录清理建议（请根据业务需求调整）:\n'
    orphanRecords.forEach(orphan => {
      script += `-- DELETE FROM ${orphan.table} WHERE ${orphan.column} NOT IN (SELECT user_id FROM users); -- ${orphan.business_rule}\n`
    })
  }

  // 添加索引创建
  if (indexSuggestions.length > 0) {
    script += '\n-- 2. 创建缺失的索引\n'
    indexSuggestions.forEach(suggestion => {
      script += `${suggestion.sql} -- ${suggestion.reason}\n`
    })
  }

  // 添加外键约束
  if (fixSuggestions.length > 0) {
    script += '\n-- 3. 添加外键约束\n'
    fixSuggestions.forEach(suggestion => {
      script += `${suggestion.sql} -- ${suggestion.business_rule}\n\n`
    })
  }

  script += `
-- 4. 验证修复结果
SELECT 
  TABLE_NAME,
  COLUMN_NAME,
  CONSTRAINT_NAME,
  REFERENCED_TABLE_NAME,
  REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
WHERE TABLE_SCHEMA = '${process.env.DB_NAME}' 
AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY TABLE_NAME, COLUMN_NAME;`

  console.log(`📄 修复脚本已生成: ${scriptName}`)
  console.log('📁 保存位置: scripts/generated/')

  // 确保目录存在
  const fs = require('fs')
  const path = require('path')
  const outputDir = path.join(__dirname, 'generated')
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // 保存脚本
  const scriptPath = path.join(outputDir, scriptName)
  fs.writeFileSync(scriptPath, script)

  return scriptPath
}

async function checkForeignKeyConstraints () {
  try {
    console.log('🔗 外键约束完整性检查报告')
    console.log('='.repeat(60))
    console.log(`📅 检查时间: ${BeijingTimeHelper.nowLocale()}`)
    console.log(`🗄️ 数据库: ${process.env.DB_NAME}`)

    // 1. 查询现有外键约束
    const [constraints] = await sequelize.query(`
      SELECT 
        TABLE_NAME,
        COLUMN_NAME,
        CONSTRAINT_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
      WHERE TABLE_SCHEMA = '${process.env.DB_NAME}' 
      AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY TABLE_NAME, COLUMN_NAME
    `)

    console.log('\n📊 现有外键约束统计:')
    console.log(`总数量: ${constraints.length}`)

    if (constraints.length > 0) {
      console.log('\n📋 详细外键列表:')
      constraints.forEach(constraint => {
        console.log(
          `   ${constraint.TABLE_NAME}.${constraint.COLUMN_NAME} → ${constraint.REFERENCED_TABLE_NAME}.${constraint.REFERENCED_COLUMN_NAME}`
        )
      })
    } else {
      console.log('\n⚠️ 未发现任何外键约束！')
      console.log('   这可能导致数据一致性问题')
    }

    // 2. 数据完整性验证（数据驱动）
    const orphanRecords = await validateDataIntegrity()

    // 3. 生成外键修复建议
    const fixSuggestions = await generateForeignKeyFixSuggestions(constraints)

    // 4. 索引性能分析
    const indexSuggestions = await analyzeIndexPerformance()

    // 5. 生成修复脚本
    const scriptPath = generateFixScript(fixSuggestions, indexSuggestions, orphanRecords)

    // 6. 总结报告
    console.log('\n🎯 检查总结')
    console.log('='.repeat(50))
    console.log(`✅ 现有外键约束: ${constraints.length} 个`)
    console.log(`❌ 缺失外键约束: ${fixSuggestions.length} 个`)
    console.log(`🔍 数据完整性问题: ${orphanRecords.length} 个表有孤儿记录`)
    console.log(`📈 索引优化建议: ${indexSuggestions.length} 个`)

    if (fixSuggestions.length > 0 || indexSuggestions.length > 0 || orphanRecords.length > 0) {
      console.log('\n🚨 需要修复的问题:')
      if (orphanRecords.length > 0) {
        console.log(`   1. 清理 ${orphanRecords.length} 个表的孤儿记录`)
      }
      if (indexSuggestions.length > 0) {
        console.log(`   2. 创建 ${indexSuggestions.length} 个缺失索引`)
      }
      if (fixSuggestions.length > 0) {
        console.log(`   3. 添加 ${fixSuggestions.length} 个外键约束`)
      }
      console.log(`\n📄 自动修复脚本: ${scriptPath}`)
      console.log('⚠️ 执行前请务必备份数据库！')
    } else {
      console.log('\n🎉 数据库外键约束配置良好！')
    }
  } catch (error) {
    console.error('❌ 外键检查失败:', error.message)
    console.error('🔍 详细错误:', error.stack)
  } finally {
    // 关闭数据库连接由dbHelper管理
  }
}

if (require.main === module) {
  checkForeignKeyConstraints()
}

module.exports = {
  checkForeignKeyConstraints,
  validateDataIntegrity,
  generateForeignKeyFixSuggestions,
  analyzeIndexPerformance,
  CRITICAL_FOREIGN_KEYS
}
