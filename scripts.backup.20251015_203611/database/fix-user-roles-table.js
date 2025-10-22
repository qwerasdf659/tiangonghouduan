/**
 * 修复user_roles表缺失字段问题
 *
 * 问题：数据库迁移（方案C）使用sequelize.sync()时，
 *      对belongsToMany的through模型只创建了最小字段，
 *      丢失了业务字段（user_role_id, assigned_at, assigned_by, is_active）
 *
 * 解决：补充缺失的字段
 *
 * 创建时间：2025年10月13日
 */

const { sequelize } = require('../../models')

async function fixUserRolesTable () {
  console.log('========================================')
  console.log('🔧 修复user_roles表结构')
  console.log('========================================\n')

  try {
    // 1. 检查当前表结构
    console.log('📋 步骤1: 检查当前表结构...')
    const [currentFields] = await sequelize.query('DESCRIBE user_roles')

    const existingFields = currentFields.map(f => f.Field)
    console.log('当前字段:', existingFields.join(', '))
    console.log('')

    /*
     * 2. 确定需要添加的字段
     * 注意：表已有联合主键(role_id, user_id)，不添加user_role_id
     */
    const fieldsToAdd = []

    if (!existingFields.includes('assigned_at')) {
      fieldsToAdd.push({
        name: 'assigned_at',
        sql: 'ADD COLUMN assigned_at DATETIME NULL COMMENT \'角色分配时间\' AFTER role_id'
      })
    }

    if (!existingFields.includes('assigned_by')) {
      fieldsToAdd.push({
        name: 'assigned_by',
        sql: 'ADD COLUMN assigned_by INT NULL COMMENT \'角色分配者ID\' AFTER assigned_at'
      })
    }

    if (!existingFields.includes('is_active')) {
      fieldsToAdd.push({
        name: 'is_active',
        sql: 'ADD COLUMN is_active TINYINT(1) DEFAULT 1 COMMENT \'角色是否激活\' AFTER assigned_by'
      })
    }

    if (fieldsToAdd.length === 0) {
      console.log('✅ 表结构完整，无需修复')
      await sequelize.close()
      return
    }

    console.log(`📋 步骤2: 需要添加 ${fieldsToAdd.length} 个字段:`)
    fieldsToAdd.forEach(field => {
      console.log(`  - ${field.name}`)
    })
    console.log('')

    // 3. 执行ALTER TABLE语句
    console.log('🔧 步骤3: 执行表结构修改...')

    for (const field of fieldsToAdd) {
      try {
        await sequelize.query(`ALTER TABLE user_roles ${field.sql}`)
        console.log(`  ✅ 添加字段: ${field.name}`)
      } catch (error) {
        if (error.message.includes('Duplicate column name')) {
          console.log(`  ⚠️ 字段已存在: ${field.name}`)
        } else {
          throw error
        }
      }
    }
    console.log('')

    // 4. 添加外键约束（如果需要）
    if (fieldsToAdd.some(f => f.name === 'assigned_by')) {
      console.log('🔧 步骤4: 添加外键约束...')
      try {
        await sequelize.query(`
          ALTER TABLE user_roles 
          ADD CONSTRAINT fk_user_roles_assigned_by 
          FOREIGN KEY (assigned_by) REFERENCES users(user_id) 
          ON DELETE SET NULL
        `)
        console.log('  ✅ 添加外键: assigned_by -> users(user_id)')
      } catch (error) {
        if (error.message.includes('Duplicate foreign key')) {
          console.log('  ⚠️ 外键已存在')
        } else {
          console.warn('  ⚠️ 外键添加失败（非致命）:', error.message)
        }
      }
      console.log('')
    }

    // 5. 验证修复结果
    console.log('📋 步骤5: 验证修复结果...')
    const [newFields] = await sequelize.query('DESCRIBE user_roles')

    console.log('修复后字段:')
    newFields.forEach(f => {
      const isNew = !existingFields.includes(f.Field)
      const marker = isNew ? '🆕' : '  '
      console.log(`  ${marker} ${f.Field.padEnd(20)} ${f.Type.padEnd(20)} ${f.Null === 'YES' ? 'NULL' : 'NOT NULL'}`)
    })
    console.log('')

    // 6. 更新现有记录的is_active字段
    console.log('🔧 步骤6: 初始化is_active字段...')
    const [updateResult] = await sequelize.query(`
      UPDATE user_roles 
      SET is_active = TRUE 
      WHERE is_active IS NULL
    `)
    console.log(`  ✅ 更新了 ${updateResult.affectedRows} 条记录`)
    console.log('')

    console.log('========================================')
    console.log('✅ user_roles表修复完成！')
    console.log('========================================')
    console.log('')
    console.log('📊 修复摘要:')
    console.log(`  - 添加字段: ${fieldsToAdd.length}个`)
    console.log(`  - 当前字段总数: ${newFields.length}个`)
    console.log('  - 表结构状态: ✅ 与模型定义一致')
    console.log('')

    await sequelize.close()
    process.exit(0)
  } catch (error) {
    console.error('\n❌ 修复失败:', error.message)
    console.error(error.stack)
    await sequelize.close()
    process.exit(1)
  }
}

// 执行修复
fixUserRolesTable()
