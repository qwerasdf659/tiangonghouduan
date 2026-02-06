/**
 * 迁移文件：更新商家域角色权限（添加 scan_user 权限）
 *
 * 决策背景（2026-01-12 商家员工域权限体系升级方案）：
 * - 路由 /api/v4/shop/consumption/user-info 需要 consumption:scan_user 权限
 * - 需要为 merchant_staff 和 merchant_manager 角色添加此权限
 *
 * 变更内容：
 * 1. merchant_staff 权限更新：
 *    - 原有：consumption:create、consumption:read
 *    - 新增：consumption:scan_user（扫码获取用户信息）
 *
 * 2. merchant_manager 权限更新：
 *    - 原有：consumption:create、consumption:read、staff:manage、staff:read、store:read
 *    - 新增：consumption:scan_user（扫码获取用户信息）
 *
 * @since 2026-01-12
 * @see docs/商家员工域权限体系升级方案.md - AC1.3 权限能力化
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('📝 开始迁移：更新商家域角色权限（添加 scan_user）')

    // =================================================================
    // 步骤1：更新 merchant_staff 角色权限
    // =================================================================
    const [existingMerchantStaff] = await queryInterface.sequelize.query(`
      SELECT role_id, role_name, permissions
      FROM roles
      WHERE role_name = 'merchant_staff'
    `)

    if (existingMerchantStaff.length === 0) {
      console.log('⚠️ merchant_staff 角色不存在，跳过更新')
    } else {
      console.log('正在更新 merchant_staff 角色权限...')
      console.log('   原权限:', existingMerchantStaff[0].permissions)

      /**
       * merchant_staff 新权限配置
       * - consumption:create - 允许商家员工提交消费记录
       * - consumption:read - 允许查看本人录入的消费记录
       * - consumption:scan_user - 允许扫码获取用户信息（新增）
       */
      const merchantStaffPermissions = {
        consumption: ['create', 'read', 'scan_user']
      }

      await queryInterface.sequelize.query(
        `
        UPDATE roles
        SET permissions = :permissions,
            updated_at = NOW()
        WHERE role_name = 'merchant_staff'
      `,
        {
          replacements: {
            permissions: JSON.stringify(merchantStaffPermissions)
          }
        }
      )

      console.log('✅ 成功更新 merchant_staff 角色权限')
      console.log('   新权限:', JSON.stringify(merchantStaffPermissions))
    }

    // =================================================================
    // 步骤2：更新 merchant_manager 角色权限
    // =================================================================
    const [existingMerchantManager] = await queryInterface.sequelize.query(`
      SELECT role_id, role_name, permissions
      FROM roles
      WHERE role_name = 'merchant_manager'
    `)

    if (existingMerchantManager.length === 0) {
      console.log('⚠️ merchant_manager 角色不存在，跳过更新')
    } else {
      console.log('正在更新 merchant_manager 角色权限...')
      console.log('   原权限:', existingMerchantManager[0].permissions)

      /**
       * merchant_manager 新权限配置
       * - consumption:create, consumption:read - 继承 merchant_staff 的消费权限
       * - consumption:scan_user - 扫码获取用户信息（新增）
       * - staff:manage, staff:read - 可以管理本店员工
       * - store:read - 可以查看本店信息
       */
      const merchantManagerPermissions = {
        consumption: ['create', 'read', 'scan_user'],
        staff: ['manage', 'read'],
        store: ['read']
      }

      await queryInterface.sequelize.query(
        `
        UPDATE roles
        SET permissions = :permissions,
            updated_at = NOW()
        WHERE role_name = 'merchant_manager'
      `,
        {
          replacements: {
            permissions: JSON.stringify(merchantManagerPermissions)
          }
        }
      )

      console.log('✅ 成功更新 merchant_manager 角色权限')
      console.log('   新权限:', JSON.stringify(merchantManagerPermissions))
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
        r.permissions
      FROM roles r
      WHERE r.role_name IN ('merchant_staff', 'merchant_manager')
      ORDER BY r.role_level ASC
    `)

    let hasError = false
    verifyResult.forEach(role => {
      const permissions =
        typeof role.permissions === 'string' ? JSON.parse(role.permissions) : role.permissions
      const hasScanUser = permissions.consumption && permissions.consumption.includes('scan_user')

      console.log(`   - ${role.role_name}: consumption:scan_user = ${hasScanUser ? '✅' : '❌'}`)

      if (!hasScanUser) {
        hasError = true
      }
    })

    if (hasError) {
      throw new Error('迁移验证失败：部分角色缺少 scan_user 权限')
    }

    console.log('\n✅ 商家域角色权限更新迁移完成')
  },

  down: async (queryInterface, Sequelize) => {
    console.log('📝 开始回滚：移除商家域角色 scan_user 权限')

    // 步骤1：回滚 merchant_staff 权限
    const merchantStaffPermissions = {
      consumption: ['create', 'read']
    }

    await queryInterface.sequelize.query(
      `
      UPDATE roles
      SET permissions = :permissions,
          updated_at = NOW()
      WHERE role_name = 'merchant_staff'
    `,
      {
        replacements: {
          permissions: JSON.stringify(merchantStaffPermissions)
        }
      }
    )
    console.log('✅ 已回滚 merchant_staff 权限')

    // 步骤2：回滚 merchant_manager 权限
    const merchantManagerPermissions = {
      consumption: ['create', 'read'],
      staff: ['manage', 'read'],
      store: ['read']
    }

    await queryInterface.sequelize.query(
      `
      UPDATE roles
      SET permissions = :permissions,
          updated_at = NOW()
      WHERE role_name = 'merchant_manager'
    `,
      {
        replacements: {
          permissions: JSON.stringify(merchantManagerPermissions)
        }
      }
    )
    console.log('✅ 已回滚 merchant_manager 权限')

    console.log('\n✅ 商家域角色权限回滚完成')
  }
}
