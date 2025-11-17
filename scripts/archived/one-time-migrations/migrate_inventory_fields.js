/**
 * 数据迁移脚本：统一UserInventory字段命名
 * 目标：消除兼容性代码，统一使用name和type字段
 *
 * 迁移策略：
 * 1. 将item_name的数据迁移到name字段
 * 2. 将item_type的数据迁移到type字段
 * 3. 清空item_name和item_type字段
 * 4. 后续代码只使用name和type字段
 */

const path = require('path')
const sequelize = require(path.join(__dirname, '../models')).sequelize

async function migrateInventoryFields () {
  console.log('🔄 开始数据迁移：统一UserInventory字段命名\n')

  const transaction = await sequelize.transaction()

  try {
    // 1. 检查当前数据状态
    console.log('📊 步骤1：检查当前数据状态')
    const [[beforeStats]] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN name IS NOT NULL AND name != '' THEN 1 ELSE 0 END) as name_count,
        SUM(CASE WHEN item_name IS NOT NULL AND item_name != '' THEN 1 ELSE 0 END) as item_name_count,
        SUM(CASE WHEN type IS NOT NULL THEN 1 ELSE 0 END) as type_count,
        SUM(CASE WHEN item_type IS NOT NULL AND item_type != '' THEN 1 ELSE 0 END) as item_type_count
      FROM user_inventory
    `, { transaction })

    console.log('  - 总记录数:', beforeStats.total)
    console.log('  - name字段有数据:', beforeStats.name_count)
    console.log('  - item_name字段有数据:', beforeStats.item_name_count)
    console.log('  - type字段有数据:', beforeStats.type_count)
    console.log('  - item_type字段有数据:', beforeStats.item_type_count)

    // 2. 迁移item_name到name（如果item_name有数据但name没有）
    console.log('\n📝 步骤2：迁移item_name数据到name字段')
    const [updateNameResult] = await sequelize.query(`
      UPDATE user_inventory 
      SET name = item_name 
      WHERE item_name IS NOT NULL 
        AND item_name != '' 
        AND (name IS NULL OR name = '')
    `, { transaction })
    console.log('  - 更新了', updateNameResult.affectedRows || 0, '条记录')

    // 3. 迁移item_type到type（如果item_type有数据）
    console.log('\n📝 步骤3：迁移item_type数据到type字段')

    // 先检查item_type的值
    const [itemTypeValues] = await sequelize.query(`
      SELECT DISTINCT item_type 
      FROM user_inventory 
      WHERE item_type IS NOT NULL AND item_type != ''
    `, { transaction })

    if (itemTypeValues.length > 0) {
      console.log('  - item_type的值:', itemTypeValues.map(r => r.item_type).join(', '))

      // 只迁移符合ENUM的值
      const validTypes = ['voucher', 'product', 'service']
      for (const validType of validTypes) {
        const [updateTypeResult] = await sequelize.query(`
          UPDATE user_inventory 
          SET type = '${validType}' 
          WHERE item_type = '${validType}'
        `, { transaction })
        if (updateTypeResult.affectedRows > 0) {
          console.log(`  - 迁移item_type='${validType}'到type: ${updateTypeResult.affectedRows}条`)
        }
      }
    } else {
      console.log('  - 无需迁移item_type（字段为空）')
    }

    // 4. 清空item_name和item_type字段（已完成迁移）
    console.log('\n🗑️ 步骤4：清空item_name和item_type字段')
    await sequelize.query(`
      UPDATE user_inventory 
      SET item_name = NULL, item_type = NULL
    `, { transaction })
    console.log('  - 已清空item_name和item_type字段')

    // 5. 验证迁移结果
    console.log('\n✅ 步骤5：验证迁移结果')
    const [[afterStats]] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN name IS NOT NULL AND name != '' THEN 1 ELSE 0 END) as name_count,
        SUM(CASE WHEN item_name IS NOT NULL AND item_name != '' THEN 1 ELSE 0 END) as item_name_count,
        SUM(CASE WHEN type IS NOT NULL THEN 1 ELSE 0 END) as type_count,
        SUM(CASE WHEN item_type IS NOT NULL AND item_type != '' THEN 1 ELSE 0 END) as item_type_count
      FROM user_inventory
    `, { transaction })

    console.log('  - name字段有数据:', afterStats.name_count)
    console.log('  - item_name字段有数据:', afterStats.item_name_count)
    console.log('  - type字段有数据:', afterStats.type_count)
    console.log('  - item_type字段有数据:', afterStats.item_type_count)

    // 提交事务
    await transaction.commit()
    console.log('\n✅ 数据迁移成功！')

    return true
  } catch (error) {
    await transaction.rollback()
    console.error('\n❌ 数据迁移失败:', error.message)
    throw error
  } finally {
    await sequelize.close()
  }
}

// 执行迁移
migrateInventoryFields()
  .then(() => {
    console.log('\n🎉 迁移脚本执行完成')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n💥 迁移脚本执行失败:', error)
    process.exit(1)
  })
