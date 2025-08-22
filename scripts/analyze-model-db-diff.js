/**
 * 模型定义与数据库字段详细对比分析脚本 v3.0
 * 分析模型定义与实际数据库表结构的详细差异
 */

const mysql = require('mysql2/promise')
const fs = require('fs')
const path = require('path')
require('dotenv').config()

const dbConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
}

console.log('🔍 开始模型定义与数据库字段详细对比分析...')

// V3核心模型表映射
const V3_MODELS = {
  UserPointsAccount: 'user_points_accounts',
  PointsTransaction: 'points_transactions',
  LotteryCampaign: 'lottery_campaigns',
  LotteryPrize: 'lottery_prizes',
  LotteryDraw: 'lottery_draws',
  BusinessEvent: 'business_events'
}

/**
 * 解析模型文件获取字段定义
 */
function parseModelFields (modelName) {
  try {
    const modelPath = path.join(__dirname, '../models', `${modelName}.js`)
    const modelContent = fs.readFileSync(modelPath, 'utf8')

    console.log(`\n📖 分析模型: ${modelName}`)

    // 提取字段定义（简化版解析）
    const fieldMatches = modelContent.match(
      /(\w+):\s*{[^}]+type:\s*DataTypes\.(\w+)(\([^)]*\))?[^}]*}/g
    )
    const fields = {}

    if (fieldMatches) {
      fieldMatches.forEach(match => {
        const fieldName = match.match(/(\w+):\s*{/)[1]
        const typeMatch = match.match(/type:\s*DataTypes\.(\w+)(\([^)]*\))?/)
        const allowNullMatch = match.match(/allowNull:\s*(true|false)/)
        const defaultValueMatch = match.match(/defaultValue:\s*([^,\n}]+)/)

        if (typeMatch) {
          fields[fieldName] = {
            type: typeMatch[1],
            typeParams: typeMatch[2] || '',
            allowNull: allowNullMatch ? allowNullMatch[1] === 'true' : true,
            defaultValue: defaultValueMatch ? defaultValueMatch[1].trim() : null
          }
        }
      })
    }

    console.log(`  📝 提取到 ${Object.keys(fields).length} 个字段定义`)
    return fields
  } catch (error) {
    console.error(`❌ 解析模型 ${modelName} 失败:`, error.message)
    return {}
  }
}

/**
 * 获取数据库表字段详情
 */
async function getDatabaseFields (connection, tableName) {
  try {
    const [columns] = await connection.execute(`DESCRIBE \`${tableName}\``)
    const fields = {}

    columns.forEach(col => {
      fields[col.Field] = {
        type: col.Type,
        nullable: col.Null === 'YES',
        key: col.Key,
        default: col.Default,
        extra: col.Extra
      }
    })

    return fields
  } catch (error) {
    console.error(`❌ 获取表 ${tableName} 字段失败:`, error.message)
    return {}
  }
}

/**
 * 对比字段类型映射
 */
function getSequelizeToMySQLTypeMapping () {
  return {
    BIGINT: ['bigint'],
    INTEGER: ['int'],
    DECIMAL: ['decimal'],
    STRING: ['varchar', 'text'],
    TEXT: ['text'],
    ENUM: ['enum'],
    DATE: ['datetime'],
    BOOLEAN: ['tinyint'],
    JSON: ['json'],
    CHAR: ['char'],
    UUID: ['char']
  }
}

/**
 * 分析字段差异
 */
function analyzeFieldDifferences (modelFields, dbFields, modelName, tableName) {
  console.log(`\n🔍 分析 ${modelName} (${tableName}) 字段差异:`)

  const differences = []
  const typeMapping = getSequelizeToMySQLTypeMapping()

  // 检查模型字段在数据库中是否存在
  Object.keys(modelFields).forEach(fieldName => {
    const modelField = modelFields[fieldName]
    const dbField = dbFields[fieldName]

    if (!dbField) {
      differences.push({
        type: 'missing_in_db',
        field: fieldName,
        issue: `模型字段 '${fieldName}' 在数据库中不存在`,
        modelDef: modelField
      })
      return
    }

    // 类型检查
    const sequelizeType = modelField.type.toUpperCase()
    const mysqlType = dbField.type.toLowerCase()
    const expectedTypes = typeMapping[sequelizeType] || []

    const typeMatches = expectedTypes.some(expectedType =>
      mysqlType.includes(expectedType.toLowerCase())
    )

    if (!typeMatches && expectedTypes.length > 0) {
      differences.push({
        type: 'type_mismatch',
        field: fieldName,
        issue: '字段类型不匹配',
        expected: `Sequelize: ${sequelizeType}`,
        actual: `MySQL: ${mysqlType}`,
        possibleTypes: expectedTypes
      })
    }

    // NULL检查
    if (modelField.allowNull !== dbField.nullable) {
      differences.push({
        type: 'nullable_mismatch',
        field: fieldName,
        issue: 'NULL约束不匹配',
        expected: `allowNull: ${modelField.allowNull}`,
        actual: `nullable: ${dbField.nullable}`
      })
    }
  })

  // 检查数据库字段在模型中是否存在
  Object.keys(dbFields).forEach(fieldName => {
    if (!modelFields[fieldName]) {
      // 跳过Sequelize自动添加的字段
      if (!['id', 'created_at', 'updated_at'].includes(fieldName)) {
        differences.push({
          type: 'missing_in_model',
          field: fieldName,
          issue: `数据库字段 '${fieldName}' 在模型中不存在`,
          dbDef: dbFields[fieldName]
        })
      }
    }
  })

  // 输出差异
  if (differences.length === 0) {
    console.log('  ✅ 字段定义完全一致')
  } else {
    console.log(`  ❌ 发现 ${differences.length} 个差异:`)
    differences.forEach((diff, index) => {
      console.log(`    ${index + 1}. [${diff.type.toUpperCase()}] ${diff.field}`)
      console.log(`       ${diff.issue}`)
      if (diff.expected) console.log(`       期望: ${diff.expected}`)
      if (diff.actual) console.log(`       实际: ${diff.actual}`)
      if (diff.possibleTypes) console.log(`       可能类型: ${diff.possibleTypes.join(', ')}`)
    })
  }

  return differences
}

/**
 * 生成修复建议
 */
function generateFixSuggestions (allDifferences) {
  console.log('\n🔧 修复建议生成:')

  const suggestions = []

  // 分类处理不同类型的差异
  const groupedDiffs = {}
  allDifferences.forEach(diff => {
    if (!groupedDiffs[diff.type]) {
      groupedDiffs[diff.type] = []
    }
    groupedDiffs[diff.type].push(diff)
  })

  // 类型不匹配修复
  if (groupedDiffs.type_mismatch) {
    suggestions.push({
      category: '字段类型修复',
      action: 'update_model_types',
      description: '更新模型中的字段类型定义以匹配数据库',
      fields: groupedDiffs.type_mismatch.map(d => d.field),
      priority: 'high'
    })
  }

  // NULL约束不匹配修复
  if (groupedDiffs.nullable_mismatch) {
    suggestions.push({
      category: 'NULL约束修复',
      action: 'sync_null_constraints',
      description: '同步模型和数据库的NULL约束设置',
      fields: groupedDiffs.nullable_mismatch.map(d => d.field),
      priority: 'medium'
    })
  }

  // 缺失字段修复
  if (groupedDiffs.missing_in_db) {
    suggestions.push({
      category: '数据库字段缺失',
      action: 'add_missing_columns',
      description: '在数据库中添加模型定义的缺失字段',
      fields: groupedDiffs.missing_in_db.map(d => d.field),
      priority: 'high'
    })
  }

  if (groupedDiffs.missing_in_model) {
    suggestions.push({
      category: '模型字段缺失',
      action: 'add_model_fields',
      description: '在模型中添加数据库的缺失字段定义',
      fields: groupedDiffs.missing_in_model.map(d => d.field),
      priority: 'medium'
    })
  }

  // 输出建议
  if (suggestions.length === 0) {
    console.log('  ✅ 无需修复，模型与数据库完全一致')
  } else {
    console.log(`  📋 生成 ${suggestions.length} 个修复建议:`)
    suggestions.forEach((suggestion, index) => {
      console.log(`    ${index + 1}. ${suggestion.category} [${suggestion.priority.toUpperCase()}]`)
      console.log(`       动作: ${suggestion.action}`)
      console.log(`       描述: ${suggestion.description}`)
      console.log(`       影响字段: ${suggestion.fields.join(', ')}`)
    })
  }

  return suggestions
}

/**
 * 主分析函数
 */
async function analyzeModelDatabaseDifferences () {
  let connection

  try {
    // 连接数据库
    connection = await mysql.createConnection(dbConfig)
    console.log('✅ 数据库连接成功')

    const allDifferences = []
    const modelAnalysis = {}

    // 逐个分析V3核心模型
    for (const [modelName, tableName] of Object.entries(V3_MODELS)) {
      console.log(`\n🎯 分析 ${modelName} → ${tableName}`)

      // 解析模型字段
      const modelFields = parseModelFields(modelName)

      // 获取数据库字段
      const dbFields = await getDatabaseFields(connection, tableName)

      // 分析差异
      const differences = analyzeFieldDifferences(modelFields, dbFields, modelName, tableName)

      allDifferences.push(
        ...differences.map(diff => ({
          ...diff,
          modelName,
          tableName
        }))
      )

      modelAnalysis[modelName] = {
        tableName,
        modelFields,
        dbFields,
        differences,
        differenceCount: differences.length
      }
    }

    // 生成总体报告
    console.log('\n📊 总体分析报告:')
    console.log(`🔍 分析模型数量: ${Object.keys(V3_MODELS).length}`)
    console.log(`❌ 总差异数量: ${allDifferences.length}`)

    const modelsSummary = Object.keys(modelAnalysis)
      .map(modelName => {
        const analysis = modelAnalysis[modelName]
        return `${modelName}: ${analysis.differenceCount}个差异`
      })
      .join('\n  ')

    console.log(`📋 各模型差异概要:\n  ${modelsSummary}`)

    // 生成修复建议
    const suggestions = generateFixSuggestions(allDifferences)

    return {
      allDifferences,
      modelAnalysis,
      suggestions,
      summary: {
        totalModels: Object.keys(V3_MODELS).length,
        totalDifferences: allDifferences.length,
        modelsWithIssues: Object.values(modelAnalysis).filter(a => a.differenceCount > 0).length
      }
    }
  } catch (error) {
    console.error('💥 分析过程中发生错误:', error)
    throw error
  } finally {
    if (connection) {
      await connection.end()
      console.log('\n🔐 数据库连接已关闭')
    }
  }
}

if (require.main === module) {
  analyzeModelDatabaseDifferences()
    .then(_result => {
      console.log('\n🎉 分析完成!')
      process.exit(0)
    })
    .catch(error => {
      console.error('💥 分析失败:', error)
      process.exit(1)
    })
}

module.exports = { analyzeModelDatabaseDifferences }
