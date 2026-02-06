/**
 * 迁移文件：RBAC ops角色初始化
 *
 * 决策背景（2026-01-07 拍板）：
 * - 启用 RBAC 权限模型：补齐 ops 角色，实现"ops 只读、admin 可写"
 * - ops 角色（role_level=30）：仅可读（GET 请求）；POST/PUT/DELETE 返回 403
 * - 绑定用户：user_id=31 (手机号 13612227930)
 *
 * 变更内容：
 * 1. 创建 ops 角色（role_level=30，低于业务阈值 50）
 * 2. 配置 ops 权限（JSON：console 域所有模块的 read 权限，kebab-case keys）
 * 3. 绑定 ops 用户：user_id=31，assigned_by=31
 *
 * 风险提示：
 * - user_id=31 同时拥有 admin 和 ops 角色，无法区分只读/可写操作
 * - 后续拆分计划：创建 ops 专用账号（独立手机号）
 *
 * @since 2026-01-07
 * @see docs/接口重复问题诊断报告-资产域API.md
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('📝 开始迁移：RBAC ops角色初始化')

    // 步骤1：检查 ops 角色是否已存在
    const [existingRoles] = await queryInterface.sequelize.query(`
      SELECT role_id, role_name, role_level
      FROM roles
      WHERE role_name = 'ops'
    `)

    if (existingRoles.length > 0) {
      console.log('✅ ops角色已存在，跳过创建')
      console.log('   已有角色信息:', existingRoles[0])
    } else {
      // 步骤2：创建 ops 角色
      console.log('正在创建ops角色...')

      const permissions = {
        // 使用 kebab-case resource keys（对齐路由挂载 segment）
        auth: ['read'],
        system: ['read'],
        config: ['read'],
        settings: ['read'],
        'prize-pool': ['read'],
        'user-management': ['read'],
        'lottery-management': ['read'],
        analytics: ['read'],
        'customer-service': ['read'],
        marketplace: ['read'],
        material: ['read'],
        'popup-banners': ['read'],
        'lottery-quota': ['read'],
        'asset-adjustment': ['read'],
        'campaign-budget': ['read'],
        assets: ['read'] // 新增：console/assets 子模块
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
          'ops',
          30,
          :permissions,
          '运营只读角色（可查询所有后台数据，不可修改）',
          1,
          NOW(),
          NOW()
        )
      `,
        {
          replacements: {
            permissions: JSON.stringify(permissions)
          }
        }
      )

      console.log('✅ 成功创建ops角色（role_level=30）')
    }

    // 步骤3：检查绑定关系是否已存在
    const [existingBindings] = await queryInterface.sequelize.query(`
      SELECT ur.user_id, ur.role_id, r.role_name
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE r.role_name = 'ops' AND ur.user_id = 31
    `)

    if (existingBindings.length > 0) {
      console.log('✅ user_id=31已绑定ops角色，跳过绑定')
    } else {
      // 步骤4：绑定 ops 用户
      console.log('正在绑定ops用户（user_id=31）...')

      // 获取 ops role_id
      const [opsRole] = await queryInterface.sequelize.query(`
        SELECT role_id FROM roles WHERE role_name = 'ops'
      `)

      if (opsRole.length === 0) {
        throw new Error('ops角色创建失败，无法获取role_id')
      }

      const opsRoleId = opsRole[0].role_id

      // 检查 user_roles 表结构（是否有 assigned_by 字段）
      const [columns] = await queryInterface.sequelize.query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'user_roles'
          AND COLUMN_NAME = 'assigned_by'
      `)

      if (columns.length > 0) {
        // 有 assigned_by 字段
        await queryInterface.sequelize.query(
          `
          INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by, created_at, updated_at)
          VALUES (31, :role_id, 31, NOW(), NOW())
        `,
          {
            replacements: { role_id: opsRoleId }
          }
        )
      } else {
        // 没有 assigned_by 字段
        await queryInterface.sequelize.query(
          `
          INSERT IGNORE INTO user_roles (user_id, role_id, created_at, updated_at)
          VALUES (31, :role_id, NOW(), NOW())
        `,
          {
            replacements: { role_id: opsRoleId }
          }
        )
      }

      console.log('✅ 成功绑定ops用户（user_id=31, assigned_by=31）')
    }

    // 步骤5：验证迁移结果
    console.log('\n📊 验证迁移结果...')

    const [verifyResult] = await queryInterface.sequelize.query(`
      SELECT
        r.role_id,
        r.role_name,
        r.role_level,
        r.is_active,
        COUNT(ur.user_id) AS assigned_users
      FROM roles r
      LEFT JOIN user_roles ur ON r.role_id = ur.role_id
      WHERE r.role_name = 'ops'
      GROUP BY r.role_id, r.role_name, r.role_level, r.is_active
    `)

    if (verifyResult.length > 0) {
      console.log('✅ 迁移验证成功:')
      console.log('   - role_name:', verifyResult[0].role_name)
      console.log('   - role_level:', verifyResult[0].role_level)
      console.log('   - is_active:', verifyResult[0].is_active)
      console.log('   - assigned_users:', verifyResult[0].assigned_users)
    } else {
      throw new Error('迁移验证失败：ops角色不存在')
    }

    console.log('\n✅ RBAC ops角色初始化迁移完成')
  },

  down: async (queryInterface, Sequelize) => {
    console.log('📝 开始回滚：RBAC ops角色初始化')

    // 步骤1：删除 ops 用户绑定
    console.log('正在删除ops用户绑定...')
    await queryInterface.sequelize.query(`
      DELETE FROM user_roles
      WHERE role_id = (SELECT role_id FROM roles WHERE role_name = 'ops')
    `)
    console.log('✅ 成功删除ops用户绑定')

    // 步骤2：删除 ops 角色
    console.log('正在删除ops角色...')
    await queryInterface.sequelize.query(`
      DELETE FROM roles WHERE role_name = 'ops'
    `)
    console.log('✅ 成功删除ops角色')

    // 步骤3：验证回滚结果
    const [verifyResult] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) AS ops_exists FROM roles WHERE role_name = 'ops'
    `)

    if (verifyResult[0].ops_exists === 0) {
      console.log('✅ 回滚验证成功：ops角色已删除')
    } else {
      throw new Error('回滚验证失败：ops角色仍然存在')
    }

    console.log('\n✅ RBAC ops角色初始化回滚完成')
  }
}
