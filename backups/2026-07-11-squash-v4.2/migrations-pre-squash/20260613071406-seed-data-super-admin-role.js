'use strict'

/**
 * 新增「超级管理员」角色 super_admin(lv110) 并指定 13612227910(user_id=32) 为超管
 *
 * 创建时间: 2026-06-13 北京时间
 * 创建原因（管理员分层 / 解决"平级 admin 互锁，无人可降级管理员"问题）:
 * - 现状：5 个 admin 均为 role_level=100（平级）；后端 UserManagementService.updateUserRole
 *   规则要求"操作者级别 > 目标级别"才能改角色，平级 admin 互相改不了，且 admin=100 已是最高，
 *   导致"降级某个管理员"在界面上谁都做不了（死锁）。
 * - 方案：参照大厂 RBAC「顶层唯一超管 + 平级互锁」，新增 super_admin(lv110) 顶层角色，
 *   指定 13612227910(user_id=32) 为超管。之后该账号(有效级别 110>100)可在界面正常降级任何 admin，
 *   普通 admin 之间仍平级互锁（防夺权/误降）。
 * - 后端鉴权完全基于 role_level 数值（requireRoleLevel / role_level>=100，取多角色最高 level，
 *   middleware/auth.js 实测无硬编码 role_name==='admin'），故 super_admin(110) 天然拥有所有
 *   admin 可访问的接口，无需改任何鉴权代码——本迁移为纯数据，零代码逻辑改动。
 *
 * 数据归属: user_roles 属可配置数据（非 余额/物品持有/锁定状态 互锁表），可经迁移直接写入。
 * 幂等: 角色按 role_name 去重、用户绑定按 (user_id, role_id) 去重，重复执行不产生脏数据。
 * 叠加而非替换: 给 user_id=32 新增 super_admin 绑定，保留其原有 admin 角色不动（有效级别=110）。
 * 字符集: 随表 utf8mb4_unicode_ci。
 * 回滚: 解除 user_id=32 的 super_admin 绑定 + 删除 super_admin 角色（完整还原）。
 */

const { v4: uuidv4 } = require('uuid')

/** 超管目标用户：13612227910，经 PiiCrypto.blindHash 反查真实 user_id（实测 = 32） */
const SUPER_ADMIN_USER_ID = 32
const SUPER_ADMIN_ROLE_NAME = 'super_admin'
const SUPER_ADMIN_ROLE_LEVEL = 110

module.exports = {
  async up(queryInterface) {
    const now = new Date()
    const transaction = await queryInterface.sequelize.transaction()
    try {
      // 1. 幂等创建 super_admin 角色
      const [existingRole] = await queryInterface.sequelize.query(
        'SELECT role_id FROM roles WHERE role_name = :rn LIMIT 1',
        { replacements: { rn: SUPER_ADMIN_ROLE_NAME }, transaction }
      )

      let roleId
      if (existingRole.length) {
        roleId = existingRole[0].role_id
      } else {
        await queryInterface.bulkInsert(
          'roles',
          [
            {
              role_uuid: uuidv4(),
              role_name: SUPER_ADMIN_ROLE_NAME,
              role_level: SUPER_ADMIN_ROLE_LEVEL,
              permissions: JSON.stringify({ '*': ['*'] }),
              description: '超级管理员（顶层，可管理其他管理员的角色/级别；平级互锁之上的唯一上层）',
              is_active: 1,
              created_at: now,
              updated_at: now
            }
          ],
          { transaction }
        )
        const [created] = await queryInterface.sequelize.query(
          'SELECT role_id FROM roles WHERE role_name = :rn LIMIT 1',
          { replacements: { rn: SUPER_ADMIN_ROLE_NAME }, transaction }
        )
        roleId = created[0].role_id
      }

      // 2. 校验目标用户存在
      const [targetUser] = await queryInterface.sequelize.query(
        'SELECT user_id FROM users WHERE user_id = :uid LIMIT 1',
        { replacements: { uid: SUPER_ADMIN_USER_ID }, transaction }
      )
      if (!targetUser.length) {
        throw new Error(`目标超管用户 user_id=${SUPER_ADMIN_USER_ID}(13612227910) 不存在，迁移中止`)
      }

      // 3. 幂等绑定 user_id=32 ↔ super_admin（叠加，保留原 admin）
      const [existingBind] = await queryInterface.sequelize.query(
        'SELECT user_role_id FROM user_roles WHERE user_id = :uid AND role_id = :rid LIMIT 1',
        { replacements: { uid: SUPER_ADMIN_USER_ID, rid: roleId }, transaction }
      )
      if (!existingBind.length) {
        await queryInterface.bulkInsert(
          'user_roles',
          [
            {
              user_id: SUPER_ADMIN_USER_ID,
              role_id: roleId,
              assigned_at: now,
              assigned_by: null,
              is_active: 1,
              created_at: now,
              updated_at: now
            }
          ],
          { transaction }
        )
      } else {
        // 已存在绑定则确保启用
        await queryInterface.sequelize.query(
          'UPDATE user_roles SET is_active = 1, updated_at = :now WHERE user_role_id = :id',
          { replacements: { now, id: existingBind[0].user_role_id }, transaction }
        )
      }

      await transaction.commit()
    } catch (e) {
      await transaction.rollback()
      throw e
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      const [role] = await queryInterface.sequelize.query(
        'SELECT role_id FROM roles WHERE role_name = :rn LIMIT 1',
        { replacements: { rn: SUPER_ADMIN_ROLE_NAME }, transaction }
      )
      if (role.length) {
        const roleId = role[0].role_id
        await queryInterface.sequelize.query(
          'DELETE FROM user_roles WHERE role_id = :rid',
          { replacements: { rid: roleId }, transaction }
        )
        await queryInterface.sequelize.query('DELETE FROM roles WHERE role_id = :rid', {
          replacements: { rid: roleId },
          transaction
        })
      }
      await transaction.commit()
    } catch (e) {
      await transaction.rollback()
      throw e
    }
  }
}
