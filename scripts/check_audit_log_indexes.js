/**
 * 检查 admin_operation_logs 表的索引是否完整
 */

const { sequelize } = require('../models')

async function checkIndexes() {
  try {
    console.log('🔍 开始检查 admin_operation_logs 表的索引\n')

    // 查询所有索引
    const [indexes] = await sequelize.query(`
      SELECT
        INDEX_NAME,
        COLUMN_NAME,
        SEQ_IN_INDEX,
        INDEX_COMMENT
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'admin_operation_logs'
      ORDER BY INDEX_NAME, SEQ_IN_INDEX
    `)

    console.log('📋 当前索引列表：')
    const indexMap = {}
    indexes.forEach(idx => {
      if (!indexMap[idx.INDEX_NAME]) {
        indexMap[idx.INDEX_NAME] = []
      }
      indexMap[idx.INDEX_NAME].push(idx.COLUMN_NAME)
    })

    for (const [indexName, columns] of Object.entries(indexMap)) {
      console.log(`   - ${indexName}: [${columns.join(', ')}]`)
    }

    // 检查必需的索引
    const requiredIndexes = {
      idx_audit_logs_operator: ['operator_id'],
      idx_audit_logs_operation_type: ['operation_type'],
      idx_audit_logs_target: ['target_type', 'target_id'],
      idx_audit_logs_created: ['created_at'],
      idx_audit_logs_business_id: ['business_id'],
      idx_audit_logs_ip: ['ip_address']
    }

    console.log('\n✅ 索引完整性检查：')
    let allIndexesExist = true

    for (const [indexName, expectedColumns] of Object.entries(requiredIndexes)) {
      const actualColumns = indexMap[indexName]
      const exists =
        actualColumns && JSON.stringify(actualColumns) === JSON.stringify(expectedColumns)
      console.log(`   - ${indexName}: ${exists ? '✅' : '❌'}`)
      if (!exists && actualColumns) {
        console.log(`     预期: [${expectedColumns.join(', ')}]`)
        console.log(`     实际: [${actualColumns.join(', ')}]`)
      }
      allIndexesExist = allIndexesExist && exists
    }

    if (allIndexesExist) {
      console.log('\n✅ 所有必需索引都已正确创建')
    } else {
      console.log('\n⚠️ 部分索引缺失或不正确')
    }

    await sequelize.close()
    process.exit(allIndexesExist ? 0 : 1)
  } catch (error) {
    console.error('❌ 检查失败:', error.message)
    await sequelize.close()
    process.exit(1)
  }
}

checkIndexes()
