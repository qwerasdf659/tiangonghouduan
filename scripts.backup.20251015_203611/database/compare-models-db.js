/**
 * 数据库表与模型对比分析脚本
 * 作用：检查数据库表结构与模型定义的差异
 * 时间：2025年10月13日
 */

const { sequelize } = require('../../config/database.js')
const models = require('../../models')

async function compareModelsAndDatabase () {
  try {
    console.log('📊 开始数据库表与模型对比分析...\n')

    // 1. 获取所有模型定义的表名
    const modelTables = Object.keys(models)
      .filter(k => k !== 'sequelize' && k !== 'Sequelize')
      .map(k => ({
        modelName: k,
        tableName: models[k].tableName || models[k].name
      }))
      .sort((a, b) => a.tableName.localeCompare(b.tableName))

    console.log('📦 模型定义的表 (' + modelTables.length + '个):')
    modelTables.forEach((m, i) => {
      console.log(`   ${i + 1}. ${m.tableName} (模型: ${m.modelName})`)
    })
    console.log('')

    // 2. 获取数据库实际表
    const dbTables = await sequelize.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name',
      { type: require('sequelize').QueryTypes.SELECT }
    )

    const dbTableNames = dbTables
      .map(t => t.TABLE_NAME)
      .filter(t => t !== 'sequelizemeta')

    console.log('🗄️ 数据库实际表 (' + dbTableNames.length + '个，不含sequelizemeta):')
    dbTableNames.forEach((t, i) => {
      console.log(`   ${i + 1}. ${t}`)
    })
    console.log('')

    // 3. 差异分析
    console.log('🔍 差异分析:')
    console.log('='.repeat(60))

    const modelTableNames = modelTables.map(m => m.tableName)
    const missingInDB = modelTableNames.filter(t => !dbTableNames.includes(t))
    const extraInDB = dbTableNames.filter(t => !modelTableNames.includes(t))

    // 缺失的表
    if (missingInDB.length > 0) {
      console.log(`\n❌ 模型中有但数据库中缺失的表 (${missingInDB.length}个):`)
      missingInDB.forEach((t, i) => {
        const model = modelTables.find(m => m.tableName === t)
        console.log(`   ${i + 1}. ${t} (模型: ${model.modelName})`)
        console.log('      ⚠️ 需要创建此表')
      })
    } else {
      console.log('\n✅ 模型定义的表在数据库中都存在')
    }

    // 多余的表
    if (extraInDB.length > 0) {
      console.log(`\n⚠️ 数据库中有但模型中缺失的表 (${extraInDB.length}个):`)
      extraInDB.forEach((t, i) => {
        console.log(`   ${i + 1}. ${t}`)
        console.log('      💡 可能是：1) 旧表未清理 2) 缺少对应模型 3) 第三方工具表')
      })
    } else {
      console.log('\n✅ 数据库中没有多余的表')
    }

    // 4. 字段级别对比（仅对存在的表）
    console.log('\n\n📋 详细字段对比分析:')
    console.log('='.repeat(60))

    for (const model of modelTables) {
      if (!dbTableNames.includes(model.tableName)) {
        continue // 跳过数据库中不存在的表
      }

      console.log(`\n🔍 检查表: ${model.tableName} (模型: ${model.modelName})`)

      // 获取模型定义的字段
      const modelFields = Object.keys(models[model.modelName].rawAttributes)
      console.log(`   模型字段 (${modelFields.length}个): ${modelFields.join(', ')}`)

      // 获取数据库实际字段
      const dbFields = await sequelize.query(
        `DESCRIBE ${model.tableName}`,
        { type: require('sequelize').QueryTypes.SELECT }
      )
      const dbFieldNames = dbFields.map(f => f.Field)
      console.log(`   数据库字段 (${dbFieldNames.length}个): ${dbFieldNames.join(', ')}`)

      // 字段差异
      const missingFields = modelFields.filter(f => !dbFieldNames.includes(f))
      const extraFields = dbFieldNames.filter(f => !modelFields.includes(f))

      if (missingFields.length > 0) {
        console.log(`   ❌ 数据库缺失字段 (${missingFields.length}个): ${missingFields.join(', ')}`)
      }

      if (extraFields.length > 0) {
        console.log(`   ⚠️ 数据库多余字段 (${extraFields.length}个): ${extraFields.join(', ')}`)
      }

      if (missingFields.length === 0 && extraFields.length === 0) {
        console.log('   ✅ 字段完全匹配')
      }
    }

    // 5. 生成修复建议
    console.log('\n\n💡 修复建议:')
    console.log('='.repeat(60))

    if (missingInDB.length > 0) {
      console.log('\n📝 需要创建缺失的表:')
      console.log('   npx sequelize-cli migration:generate --name create-missing-tables')
      console.log('   然后手写迁移脚本创建以下表:')
      missingInDB.forEach(t => console.log(`   - ${t}`))
    }

    if (extraInDB.length > 0) {
      console.log('\n🗑️ 需要处理多余的表:')
      console.log('   选项1: 如果是废弃表，创建迁移删除')
      console.log('   选项2: 如果需要保留，为其创建模型文件')
      extraInDB.forEach(t => console.log(`   - ${t}`))
    }

    console.log('\n✅ 分析完成')
    process.exit(0)
  } catch (error) {
    console.error('❌ 分析失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// 执行分析
compareModelsAndDatabase()
