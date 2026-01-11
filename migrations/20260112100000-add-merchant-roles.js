/**
 * 迁移文件：商家域角色初始化
 *
 * 决策背景（2026-01-12 商家员工域权限体系升级方案）：
 * - 新增 merchant_staff 角色：商家员工，可执行消费录入
 * - 新增 merchant_manager 角色：商家店长，可管理本店员工
 *
 * 变更内容：
 * 1. 创建 merchant_staff 角色（role_level=20，低于 ops 30）
 *    - 权限：consumption:create、consumption:read
 * 2. 创建 merchant_manager 角色（role_level=40，高于 ops 30，低于 moderator 50）
 *    - 权限：merchant_staff 权限 + staff:manage
 *
 * 权限命名规范（snake_case，资源:动作）：
 * - consumption:create - 创建消费记录
 * - consumption:read - 查看消费记录
 * - staff:manage - 管理员工（邀请、移除）
 *
 * @since 2026-01-12
 * @see docs/商家员工域权限体系升级方案.md
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('📝 开始迁移：商家域角色初始化（merchant_staff + merchant_manager）')

    // =================================================================
    // 步骤1：创建 merchant_staff 角色
    // =================================================================
    const [existingMerchantStaff] = await queryInterface.sequelize.query(`
      SELECT role_id, role_name, role_level
      FROM roles
      WHERE role_name = 'merchant_staff'
    `)

    if (existingMerchantStaff.length > 0) {
      console.log('✅ merchant_staff 角色已存在，跳过创建')
      console.log('   已有角色信息:', existingMerchantStaff[0])
    } else {
      console.log('正在创建 merchant_staff 角色...')

      /**
       * merchant_staff 权限配置
       * - consumption:create - 允许商家员工提交消费记录
       * - consumption:read - 允许查看本人录入的消费记录
       */
      const merchantStaffPermissions = {
        consumption: ['create', 'read']
      }

      await queryInterface.sequelize.query(
        `
        INSERT INTO roles (
          role_uuid,
          role_name,
          role_level,
          permissions,
          description,
          is_active,
          created_at,
          updated_at
        ) VALUES (
          UUID(),
          'merchant_staff',
          20,
          :permissions,
          '商家员工角色（可执行消费录入，不可管理员工）',
          1,
          NOW(),
          NOW()
        )
      `,
        {
          replacements: {
            permissions: JSON.stringify(merchantStaffPermissions)
          }
        }
      )

      console.log('✅ 成功创建 merchant_staff 角色（role_level=20）')
    }

    // =================================================================
    // 步骤2：创建 merchant_manager 角色
    // =================================================================
    const [existingMerchantManager] = await queryInterface.sequelize.query(`
      SELECT role_id, role_name, role_level
      FROM roles
      WHERE role_name = 'merchant_manager'
    `)

    if (existingMerchantManager.length > 0) {
      console.log('✅ merchant_manager 角色已存在，跳过创建')
      console.log('   已有角色信息:', existingMerchantManager[0])
    } else {
      console.log('正在创建 merchant_manager 角色...')

      /**
       * merchant_manager 权限配置
       * - consumption:create, consumption:read - 继承 merchant_staff 的消费权限
       * - staff:manage - 可以管理本店员工（邀请、移除、查看列表）
       * - store:read - 可以查看本店信息
       */
      const merchantManagerPermissions = {
        consumption: ['create', 'read'],
        staff: ['manage', 'read'],
        store: ['read']
      }

      await queryInterface.sequelize.query(
        `
        INSERT INTO roles (
          role_uuid,
          role_name,
          role_level,
          permissions,
          description,
          is_active,
          created_at,
          updated_at
        ) VALUES (
          UUID(),
          'merchant_manager',
          40,
          :permissions,
          '商家店长角色（可执行消费录入，可管理本店员工）',
          1,
          NOW(),
          NOW()
        )
      `,
        {
          replacements: {
            permissions: JSON.stringify(merchantManagerPermissions)
          }
        }
      )

      console.log('✅ 成功创建 merchant_manager 角色（role_level=40）')
    }

    // =================================================================
    // 步骤3：验证迁移结果
    // =================================================================
    console.log('\n📊 验证迁移结果...')

    const [verifyResult] = await queryInterface.sequelize.query(`
      SELECT
        r.role_id,
        r.role_name,
        r.role_level,
        r.permissions,
        r.is_active
      FROM roles r
      WHERE r.role_name IN ('merchant_staff', 'merchant_manager')
      ORDER BY r.role_level ASC
    `)

    if (verifyResult.length === 2) {
      console.log('✅ 迁移验证成功，已创建2个商家域角色:')
      verifyResult.forEach((role, index) => {
        console.log(
          `   ${index + 1}. ${role.role_name} (level=${role.role_level}, active=${role.is_active})`
        )
      })
    } else {
      console.log(`⚠️ 迁移验证：预期2个角色，实际${verifyResult.length}个`)
      verifyResult.forEach(role => {
        console.log(`   - ${role.role_name} (level=${role.role_level})`)
      })
    }

    // 显示当前所有角色等级（便于理解权限层级）
    console.log('\n📊 当前角色权限等级总览:')
    const [allRoles] = await queryInterface.sequelize.query(`
      SELECT role_name, role_level, is_active
      FROM roles
      WHERE is_active = 1
      ORDER BY role_level DESC
    `)
    allRoles.forEach(role => {
      console.log(`   - ${role.role_name}: level=${role.role_level}`)
    })

    console.log('\n✅ 商家域角色初始化迁移完成')
  },

  down: async (queryInterface, Sequelize) => {
    console.log('📝 开始回滚：商家域角色初始化')

    // 步骤1：删除 merchant_manager 相关的用户绑定
    console.log('正在删除 merchant_manager 用户绑定...')
    await queryInterface.sequelize.query(`
      DELETE FROM user_roles
      WHERE role_id IN (SELECT role_id FROM roles WHERE role_name = 'merchant_manager')
    `)

    // 步骤2：删除 merchant_staff 相关的用户绑定
    console.log('正在删除 merchant_staff 用户绑定...')
    await queryInterface.sequelize.query(`
      DELETE FROM user_roles
      WHERE role_id IN (SELECT role_id FROM roles WHERE role_name = 'merchant_staff')
    `)

    // 步骤3：删除角色
    console.log('正在删除商家域角色...')
    await queryInterface.sequelize.query(`
      DELETE FROM roles WHERE role_name IN ('merchant_staff', 'merchant_manager')
    `)

    console.log('✅ 成功删除商家域角色')

    // 步骤4：验证回滚结果
    const [verifyResult] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) AS merchant_roles_exist
      FROM roles
      WHERE role_name IN ('merchant_staff', 'merchant_manager')
    `)

    if (Number(verifyResult[0].merchant_roles_exist) === 0) {
      console.log('✅ 回滚验证成功：商家域角色已删除')
    } else {
      throw new Error('回滚验证失败：商家域角色仍然存在')
    }

    console.log('\n✅ 商家域角色初始化回滚完成')
  }
}
