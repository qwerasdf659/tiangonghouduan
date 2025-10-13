/**
 * 数据库迁移：修复 user_roles 表的外键约束
 *
 * 问题背景：
 * 1. user_roles 表完全缺失外键约束
 * 2. 存在 7 条孤儿记录（用户已删除但角色记录仍存在）
 * 3. 可能导致数据一致性问题和统计错误
 *
 * 解决方案：
 * 1. 备份现有数据
 * 2. 清理孤儿记录
 * 3. 添加 user_id 和 role_id 的外键约束
 * 4. 设置 ON DELETE CASCADE（自动删除关联记录）
 *
 * 创建时间：2025-10-09
 * 影响表：user_roles
 * 影响数据：清理 7 条孤儿记录
 *
 * @see docs/数据一致性问题报告和解决方案.md
 */

module.exports = {
  /**
   * 执行迁移（向上迁移）
   */
  async up (queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 开始数据库迁移：修复 user_roles 表外键约束\n')

      // ========== 第一步：备份 user_roles 表数据 ==========
      console.log('1️⃣ 备份 user_roles 表数据...')

      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS user_roles_backup_20251009 
        AS SELECT * FROM user_roles
      `,
        { transaction }
      )

      const [backupCount] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM user_roles_backup_20251009',
        { transaction }
      )

      console.log(`   ✅ 已备份 ${backupCount[0].count} 条记录到 user_roles_backup_20251009\n`)

      // ========== 第二步：分析孤儿记录 ==========
      console.log('2️⃣ 分析孤儿记录...')

      // 检查 user_id 孤儿记录
      const [userOrphans] = await queryInterface.sequelize.query(
        `
        SELECT user_id, COUNT(*) as count
        FROM user_roles
        WHERE user_id NOT IN (SELECT user_id FROM users)
        GROUP BY user_id
      `,
        { transaction }
      )

      // 检查 role_id 孤儿记录
      const [roleOrphans] = await queryInterface.sequelize.query(
        `
        SELECT role_id, COUNT(*) as count
        FROM user_roles
        WHERE role_id NOT IN (SELECT role_id FROM roles)
        GROUP BY role_id
      `,
        { transaction }
      )

      const totalUserOrphans = userOrphans.reduce((sum, item) => sum + parseInt(item.count), 0)
      const totalRoleOrphans = roleOrphans.reduce((sum, item) => sum + parseInt(item.count), 0)

      console.log(`   📊 user_id 孤儿记录: ${totalUserOrphans} 条`)
      if (userOrphans.length > 0) {
        console.log(`      孤儿 user_id: ${userOrphans.map(o => o.user_id).join(', ')}`)
      }

      console.log(`   📊 role_id 孤儿记录: ${totalRoleOrphans} 条`)
      if (roleOrphans.length > 0) {
        console.log(`      孤儿 role_id: ${roleOrphans.map(o => o.role_id).join(', ')}`)
      }

      console.log()

      // ========== 第三步：清理孤儿记录 ==========
      if (totalUserOrphans > 0 || totalRoleOrphans > 0) {
        console.log('3️⃣ 清理孤儿记录...')

        // 清理 user_id 孤儿记录
        if (totalUserOrphans > 0) {
          const [result] = await queryInterface.sequelize.query(
            `
            DELETE FROM user_roles
            WHERE user_id NOT IN (SELECT user_id FROM users)
          `,
            { transaction }
          )

          const cleanedCount = result.affectedRows || totalUserOrphans
          console.log(`   ✅ 已清理 ${cleanedCount} 条 user_id 孤儿记录`)
        }

        // 清理 role_id 孤儿记录
        if (totalRoleOrphans > 0) {
          const [result] = await queryInterface.sequelize.query(
            `
            DELETE FROM user_roles
            WHERE role_id NOT IN (SELECT role_id FROM roles)
          `,
            { transaction }
          )

          const cleanedCount = result.affectedRows || totalRoleOrphans
          console.log(`   ✅ 已清理 ${cleanedCount} 条 role_id 孤儿记录`)
        }

        console.log()
      } else {
        console.log('3️⃣ 无孤儿记录需要清理\n')
      }

      // ========== 第四步：验证数据一致性 ==========
      console.log('4️⃣ 验证数据一致性...')

      const [remainingUserOrphans] = await queryInterface.sequelize.query(
        `
        SELECT COUNT(*) as count
        FROM user_roles
        WHERE user_id NOT IN (SELECT user_id FROM users)
      `,
        { transaction }
      )

      const [remainingRoleOrphans] = await queryInterface.sequelize.query(
        `
        SELECT COUNT(*) as count
        FROM user_roles
        WHERE role_id NOT IN (SELECT role_id FROM roles)
      `,
        { transaction }
      )

      if (remainingUserOrphans[0].count > 0 || remainingRoleOrphans[0].count > 0) {
        throw new Error(
          `数据一致性验证失败：仍存在 ${remainingUserOrphans[0].count} 条 user_id 孤儿记录和 ${remainingRoleOrphans[0].count} 条 role_id 孤儿记录`
        )
      }

      console.log('   ✅ 数据一致性验证通过\n')

      // ========== 第五步：检查并删除现有外键约束（如果存在）==========
      console.log('5️⃣ 检查现有外键约束...')

      const [existingConstraints] = await queryInterface.sequelize.query(
        `
        SELECT CONSTRAINT_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'user_roles'
          AND REFERENCED_TABLE_NAME IS NOT NULL
      `,
        { transaction }
      )

      if (existingConstraints.length > 0) {
        console.log(`   📋 发现 ${existingConstraints.length} 个现有外键约束`)
        for (const constraint of existingConstraints) {
          await queryInterface.removeConstraint('user_roles', constraint.CONSTRAINT_NAME, {
            transaction
          })
          console.log(`   ✅ 已删除外键约束: ${constraint.CONSTRAINT_NAME}`)
        }
      } else {
        console.log('   📋 未发现现有外键约束')
      }

      console.log()

      // ========== 第六步：添加外键约束 ==========
      console.log('6️⃣ 添加外键约束...')

      // 添加 user_id 外键约束
      await queryInterface.addConstraint('user_roles', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_user_roles_user_id',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'CASCADE', // 删除用户时自动删除角色记录
        onUpdate: 'CASCADE',
        transaction
      })

      console.log('   ✅ 已添加外键约束: user_roles.user_id → users.user_id (ON DELETE CASCADE)')

      // 添加 role_id 外键约束
      await queryInterface.addConstraint('user_roles', {
        fields: ['role_id'],
        type: 'foreign key',
        name: 'fk_user_roles_role_id',
        references: {
          table: 'roles',
          field: 'role_id'
        },
        onDelete: 'CASCADE', // 删除角色时自动删除关联记录
        onUpdate: 'CASCADE',
        transaction
      })

      console.log('   ✅ 已添加外键约束: user_roles.role_id → roles.role_id (ON DELETE CASCADE)\n')

      // ========== 第七步：验证外键约束 ==========
      console.log('7️⃣ 验证外键约束...')

      const [finalConstraints] = await queryInterface.sequelize.query(
        `
        SELECT 
          kcu.CONSTRAINT_NAME,
          kcu.COLUMN_NAME,
          kcu.REFERENCED_TABLE_NAME,
          kcu.REFERENCED_COLUMN_NAME,
          rc.UPDATE_RULE,
          rc.DELETE_RULE
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
          ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
          AND kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
        WHERE kcu.TABLE_SCHEMA = DATABASE()
          AND kcu.TABLE_NAME = 'user_roles'
          AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
      `,
        { transaction }
      )

      console.log('   📊 外键约束验证结果：')
      finalConstraints.forEach((constraint, index) => {
        console.log(
          `   ${index + 1}. ${constraint.COLUMN_NAME} → ${constraint.REFERENCED_TABLE_NAME}(${constraint.REFERENCED_COLUMN_NAME})`
        )
        console.log(`      更新规则: ${constraint.UPDATE_RULE}, 删除规则: ${constraint.DELETE_RULE}`)
      })

      if (finalConstraints.length !== 2) {
        throw new Error(`外键约束验证失败：期望 2 个外键，实际 ${finalConstraints.length} 个`)
      }

      console.log('\n   ✅ 外键约束验证通过\n')

      // ========== 提交事务 ==========
      await transaction.commit()

      console.log('✅ 迁移完成！\n')
      console.log('📊 迁移总结：')
      console.log(`   - 备份记录数：${backupCount[0].count}`)
      console.log(`   - 清理孤儿记录：${totalUserOrphans + totalRoleOrphans} 条`)
      console.log('   - 添加外键约束：2 个')
      console.log('   - 备份表名：user_roles_backup_20251009')
      console.log('\n💡 如需回滚，请运行：npx sequelize-cli db:migrate:undo\n')
    } catch (error) {
      // 回滚事务
      await transaction.rollback()

      console.error('\n❌ 迁移失败：', error.message)
      console.error('\n📋 错误详情：')
      console.error(error.stack)
      console.error('\n🔄 事务已回滚，数据未发生变化\n')

      throw error
    }
  },

  /**
   * 回滚迁移（向下迁移）
   */
  async down (queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔙 开始回滚迁移：删除 user_roles 表外键约束\n')

      // ========== 第一步：删除外键约束 ==========
      console.log('1️⃣ 删除外键约束...')

      const [existingConstraints] = await queryInterface.sequelize.query(
        `
        SELECT CONSTRAINT_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'user_roles'
          AND REFERENCED_TABLE_NAME IS NOT NULL
      `,
        { transaction }
      )

      for (const constraint of existingConstraints) {
        await queryInterface.removeConstraint('user_roles', constraint.CONSTRAINT_NAME, {
          transaction
        })
        console.log(`   ✅ 已删除外键约束: ${constraint.CONSTRAINT_NAME}`)
      }

      console.log()

      // ========== 第二步：恢复备份数据（如果需要）==========
      console.log('2️⃣ 检查备份表...')

      const [tableExists] = await queryInterface.sequelize.query(
        `
        SELECT COUNT(*) as count
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'user_roles_backup_20251009'
      `,
        { transaction }
      )

      if (tableExists[0].count > 0) {
        console.log('   📋 发现备份表 user_roles_backup_20251009')
        console.log('   💡 提示：如需恢复数据，请手动执行：')
        console.log('      DELETE FROM user_roles;')
        console.log('      INSERT INTO user_roles SELECT * FROM user_roles_backup_20251009;')
      } else {
        console.log('   ⚠️ 未发现备份表')
      }

      console.log()

      // ========== 提交事务 ==========
      await transaction.commit()

      console.log('✅ 回滚完成！\n')
      console.log('⚠️ 注意：外键约束已删除，但孤儿记录未恢复\n')
    } catch (error) {
      // 回滚事务
      await transaction.rollback()

      console.error('\n❌ 回滚失败：', error.message)
      console.error('\n📋 错误详情：')
      console.error(error.stack)
      console.error('\n🔄 事务已回滚\n')

      throw error
    }
  }
}
