/**
 * 数据库综合检查脚本
 * 作用：全面检查数据库表结构、字段、索引、外键、命名规范
 * 时间：2025年10月14日
 */

const { sequelize } = require('../../config/database.js')
const models = require('../../models')
const { QueryTypes } = require('sequelize')

// 检查命名是否符合 snake_case 规范
function isSnakeCase (name) {
  return /^[a-z][a-z0-9_]*$/.test(name)
}

// 检查主键命名是否符合 {table_name}_id 格式
function checkPrimaryKeyNaming (tableName, pkField) {
  const expectedPkName = `${tableName.replace(/s$/, '')}_id`
  return pkField === expectedPkName || pkField === `${tableName}_id`
}

async function comprehensiveCheck () {
  try {
    console.log('🔍 开始数据库综合检查...\n')
    console.log('='.repeat(80))

    const issues = {
      namingViolations: [],
      fieldMismatches: [],
      missingIndexes: [],
      missingForeignKeys: [],
      typeMismatches: [],
      pkNamingIssues: []
    }

    // 获取所有模型
    const modelList = Object.keys(models)
      .filter(k => k !== 'sequelize' && k !== 'Sequelize')
      .map(k => ({
        modelName: k,
        tableName: models[k].tableName || models[k].name,
        model: models[k]
      }))
      .sort((a, b) => a.tableName.localeCompare(b.tableName))

    console.log(`\n📊 检查 ${modelList.length} 个模型表...\n`)

    for (const { modelName, tableName, model } of modelList) {
      console.log(`\n${'='.repeat(80)}`)
      console.log(`📋 表: ${tableName} (模型: ${modelName})`)
      console.log('='.repeat(80))

      // 1. 检查表命名规范
      if (!isSnakeCase(tableName)) {
        issues.namingViolations.push({
          table: tableName,
          field: '表名',
          issue: `表名不符合 snake_case 规范: ${tableName}`
        })
        console.log(`❌ 表名不符合 snake_case 规范: ${tableName}`)
      } else {
        console.log('✅ 表名符合 snake_case 规范')
      }

      // 检查表是否存在
      const tableExists = await sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.tables 
         WHERE table_schema = DATABASE() AND table_name = :tableName`,
        {
          replacements: { tableName },
          type: QueryTypes.SELECT
        }
      )

      if (tableExists[0].count === 0) {
        console.log(`❌ 数据库中不存在表: ${tableName}`)
        continue
      }

      // 2. 获取字段信息
      const dbFields = await sequelize.query(
        `SELECT 
          COLUMN_NAME as field,
          DATA_TYPE as type,
          CHARACTER_MAXIMUM_LENGTH as maxLength,
          IS_NULLABLE as nullable,
          COLUMN_DEFAULT as defaultValue,
          COLUMN_KEY as keyType,
          EXTRA as extra
         FROM information_schema.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = :tableName
         ORDER BY ORDINAL_POSITION`,
        {
          replacements: { tableName },
          type: QueryTypes.SELECT
        }
      )

      const modelAttributes = model.rawAttributes
      const modelFields = Object.keys(modelAttributes)
      const dbFieldNames = dbFields.map(f => f.field)

      console.log('\n🔍 字段检查:')
      console.log(`   模型定义: ${modelFields.length} 个字段`)
      console.log(`   数据库实际: ${dbFieldNames.length} 个字段`)

      // 检查字段命名规范
      let fieldNamingOk = true
      for (const field of dbFieldNames) {
        if (!isSnakeCase(field)) {
          issues.namingViolations.push({
            table: tableName,
            field,
            issue: '字段名不符合 snake_case 规范'
          })
          console.log(`   ❌ 字段命名违规: ${field} (应使用 snake_case)`)
          fieldNamingOk = false
        }
      }
      if (fieldNamingOk) {
        console.log('   ✅ 所有字段名符合 snake_case 规范')
      }

      // 检查字段差异
      const missingInDB = modelFields.filter(f => !dbFieldNames.includes(f))
      const extraInDB = dbFieldNames.filter(f => !modelFields.includes(f))

      if (missingInDB.length > 0) {
        console.log(`   ❌ 模型中有但数据库缺失: ${missingInDB.join(', ')}`)
        issues.fieldMismatches.push({
          table: tableName,
          type: 'missing_in_db',
          fields: missingInDB
        })
      }

      if (extraInDB.length > 0) {
        console.log(`   ⚠️  数据库中有但模型缺失: ${extraInDB.join(', ')}`)
        issues.fieldMismatches.push({
          table: tableName,
          type: 'extra_in_db',
          fields: extraInDB
        })
      }

      if (missingInDB.length === 0 && extraInDB.length === 0) {
        console.log('   ✅ 字段完全匹配')
      }

      // 3. 检查主键命名
      const pkFields = dbFields.filter(f => f.keyType === 'PRI')
      if (pkFields.length > 0) {
        const pkField = pkFields[0].field
        const pkNameOk = checkPrimaryKeyNaming(tableName, pkField)

        console.log('\n🔑 主键检查:')
        if (pkNameOk) {
          console.log(`   ✅ 主键命名符合规范: ${pkField}`)
        } else {
          const expectedName = `${tableName.replace(/s$/, '')}_id`
          console.log(`   ❌ 主键命名不规范: ${pkField}`)
          console.log(`   💡 建议改为: ${expectedName}`)
          issues.pkNamingIssues.push({
            table: tableName,
            current: pkField,
            expected: expectedName
          })
        }
      }

      // 4. 检查索引
      const indexes = await sequelize.query(
        `SHOW INDEX FROM ${tableName}`,
        { type: QueryTypes.SELECT }
      )

      // 按索引名分组
      const indexGroups = {}
      indexes.forEach(idx => {
        if (!indexGroups[idx.Key_name]) {
          indexGroups[idx.Key_name] = []
        }
        indexGroups[idx.Key_name].push(idx)
      })

      console.log('\n📊 索引检查:')
      console.log(`   数据库中存在 ${Object.keys(indexGroups).length} 个索引`)

      for (const [idxName, idxFields] of Object.entries(indexGroups)) {
        const fieldNames = idxFields.map(f => f.Column_name).join(', ')
        const unique = idxFields[0].Non_unique === 0 ? '唯一索引' : '普通索引'
        const type = idxFields[0].Key_name === 'PRIMARY' ? '主键' : unique
        console.log(`   - ${idxName}: [${fieldNames}] (${type})`)
      }

      // 检查模型中定义的索引
      if (model.options && model.options.indexes) {
        const modelIndexes = model.options.indexes
        console.log(`   模型定义了 ${modelIndexes.length} 个索引`)

        // 简单对比（这里不做详细对比，只提示）
        if (modelIndexes.length > Object.keys(indexGroups).length - 1) { // -1 排除主键
          console.log('   ⚠️  模型定义的索引数量多于数据库实际索引')
        }
      }

      // 5. 检查外键
      const foreignKeys = await sequelize.query(
        `SELECT 
          kcu.CONSTRAINT_NAME as constraint_name,
          kcu.COLUMN_NAME as column_name,
          kcu.REFERENCED_TABLE_NAME as referenced_table,
          kcu.REFERENCED_COLUMN_NAME as referenced_column,
          rc.DELETE_RULE as delete_rule,
          rc.UPDATE_RULE as update_rule
         FROM information_schema.KEY_COLUMN_USAGE kcu
         LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
           ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
           AND kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
         WHERE kcu.table_schema = DATABASE() 
         AND kcu.table_name = :tableName
         AND kcu.REFERENCED_TABLE_NAME IS NOT NULL`,
        {
          replacements: { tableName },
          type: QueryTypes.SELECT
        }
      )

      console.log('\n🔗 外键检查:')
      if (foreignKeys.length > 0) {
        console.log(`   数据库中存在 ${foreignKeys.length} 个外键约束`)
        foreignKeys.forEach(fk => {
          console.log(`   - ${fk.column_name} → ${fk.referenced_table}.${fk.referenced_column}`)
          console.log(`     删除规则: ${fk.delete_rule}, 更新规则: ${fk.update_rule}`)
        })
      } else {
        console.log('   ⚠️  数据库中没有定义外键约束')

        // 检查模型中是否定义了关联
        const associations = Object.keys(model.associations || {})
        if (associations.length > 0) {
          console.log(`   💡 模型定义了 ${associations.length} 个关联: ${associations.join(', ')}`)
          console.log('   ⚠️  但数据库层面没有外键约束（仅ORM层关联）')
          issues.missingForeignKeys.push({
            table: tableName,
            associations
          })
        }
      }

      // 6. 检查时间戳字段
      console.log('\n⏰ 时间戳字段检查:')
      const hasCreatedAt = dbFieldNames.includes('created_at')
      const hasUpdatedAt = dbFieldNames.includes('updated_at')
      const hasCreatedAtCamel = modelFields.includes('createdAt')
      const hasUpdatedAtCamel = modelFields.includes('updatedAt')

      if (hasCreatedAtCamel && !hasCreatedAt) {
        console.log('   ❌ 模型使用 createdAt 但数据库使用 created_at')
        issues.namingViolations.push({
          table: tableName,
          field: 'createdAt/created_at',
          issue: '时间戳字段命名不一致（驼峰 vs 蛇形）'
        })
      }

      if (hasUpdatedAtCamel && !hasUpdatedAt) {
        console.log('   ❌ 模型使用 updatedAt 但数据库使用 updated_at')
        issues.namingViolations.push({
          table: tableName,
          field: 'updatedAt/updated_at',
          issue: '时间戳字段命名不一致（驼峰 vs 蛇形）'
        })
      }

      if (hasCreatedAt && hasUpdatedAt) {
        console.log('   ✅ 时间戳字段使用 snake_case (created_at, updated_at)')
      }
    }

    // 汇总报告
    console.log('\n\n' + '='.repeat(80))
    console.log('📊 综合检查汇总报告')
    console.log('='.repeat(80))

    console.log('\n🔍 检查项目统计:')
    console.log(`   - 检查表数量: ${modelList.length}`)
    console.log(`   - 命名规范违规: ${issues.namingViolations.length} 处`)
    console.log(`   - 字段不匹配: ${issues.fieldMismatches.length} 处`)
    console.log(`   - 缺失外键约束: ${issues.missingForeignKeys.length} 个表`)
    console.log(`   - 主键命名问题: ${issues.pkNamingIssues.length} 处`)

    // 详细问题列表
    if (issues.namingViolations.length > 0) {
      console.log(`\n❌ 命名规范违规详情 (${issues.namingViolations.length}处):`)
      issues.namingViolations.forEach((issue, i) => {
        console.log(`   ${i + 1}. ${issue.table}.${issue.field}: ${issue.issue}`)
      })
    }

    if (issues.fieldMismatches.length > 0) {
      console.log('\n⚠️  字段不匹配详情:')
      issues.fieldMismatches.forEach((issue, i) => {
        console.log(`   ${i + 1}. ${issue.table} (${issue.type}): ${issue.fields.join(', ')}`)
      })
    }

    if (issues.missingForeignKeys.length > 0) {
      console.log(`\n⚠️  缺失外键约束的表 (${issues.missingForeignKeys.length}个):`)
      issues.missingForeignKeys.forEach((issue, i) => {
        console.log(`   ${i + 1}. ${issue.table}`)
        console.log(`      关联: ${issue.associations.join(', ')}`)
      })
    }

    if (issues.pkNamingIssues.length > 0) {
      console.log('\n⚠️  主键命名问题:')
      issues.pkNamingIssues.forEach((issue, i) => {
        console.log(`   ${i + 1}. ${issue.table}: ${issue.current} → 建议: ${issue.expected}`)
      })
    }

    // 修复建议
    console.log('\n\n💡 修复建议:')
    console.log('='.repeat(80))

    if (issues.namingViolations.length > 0) {
      console.log('\n1️⃣  修复命名规范问题:')
      console.log('   - 所有时间戳字段应使用 snake_case (created_at, updated_at)')
      console.log('   - 修改模型定义，统一使用 underscored: true 选项')
      console.log('   - 确保 Sequelize 配置中启用 underscored')
    }

    if (issues.fieldMismatches.length > 0) {
      console.log('\n2️⃣  修复字段不匹配:')
      console.log('   - 创建数据库迁移脚本添加/删除字段')
      console.log('   - 或修改模型定义使其与数据库一致')
    }

    if (issues.missingForeignKeys.length > 0) {
      console.log('\n3️⃣  添加外键约束:')
      console.log('   - 根据规范，所有外键必须在数据库层面定义')
      console.log('   - 创建迁移脚本添加外键约束')
      console.log('   - 参考格式: ALTER TABLE xxx ADD CONSTRAINT fk_xxx FOREIGN KEY (xxx_id) REFERENCES xxx(xxx_id)')
    }

    console.log('\n✅ 综合检查完成')
    console.log('='.repeat(80))

    process.exit(issues.namingViolations.length > 0 || issues.fieldMismatches.length > 0 ? 1 : 0)
  } catch (error) {
    console.error('❌ 检查失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// 执行检查
comprehensiveCheck()
