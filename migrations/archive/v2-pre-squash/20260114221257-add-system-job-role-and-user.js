'use strict'

/**
 * 迁移：创建 system_job 角色和系统用户
 *
 * 业务背景：
 * 孤儿冻结检测等定时任务需要一个专用的系统用户来执行
 * 该用户用于审计日志中记录 operator_id，确保操作可追溯
 *
 * 创建内容：
 * 1. system_job 角色 - 系统定时任务专用角色，role_level=-1（低于普通用户）
 * 2. 系统用户 - mobile: 00000000001，nickname: 系统定时任务
 * 3. 用户角色关联 - 将系统用户关联到 system_job 角色
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 生成 UUID
      const roleUuid = require('uuid').v4()
      const userUuid = require('uuid').v4()
      const now = new Date()

      // 1. 创建 system_job 角色
      // role_level = -1 表示系统内部角色，低于所有业务用户
      await queryInterface.sequelize.query(
        `
        INSERT INTO roles (role_id, role_uuid, role_name, role_level, permissions, description, is_active, created_at, updated_at)
        VALUES (
          100,
          :role_uuid,
          'system_job',
          -1,
          '{"system":["execute_scheduled_tasks","manage_frozen_assets","audit_log_write"]}',
          '系统定时任务专用角色（用于孤儿冻结检测、自动清理等后台任务）',
          1,
          :now,
          :now
        )
      `,
        {
          replacements: { role_uuid: roleUuid, now },
          transaction
        }
      )

      console.log('✅ 创建 system_job 角色成功 (role_id=100)')

      // 2. 创建系统用户
      // mobile = 00000000001 是保留的系统号码，不会与真实用户冲突
      await queryInterface.sequelize.query(
        `
        INSERT INTO users (mobile, user_uuid, nickname, status, created_at, updated_at, login_count, consecutive_fail_count, history_total_points)
        VALUES (
          '00000000001',
          :user_uuid,
          '系统定时任务',
          'active',
          :now,
          :now,
          0,
          0,
          0
        )
      `,
        {
          replacements: { user_uuid: userUuid, now },
          transaction
        }
      )

      // 获取刚插入的用户ID
      const [userResult] = await queryInterface.sequelize.query(
        `SELECT user_id FROM users WHERE mobile = '00000000001'`,
        { transaction }
      )
      const systemUserId = userResult[0].user_id

      console.log(`✅ 创建系统用户成功 (user_id=${systemUserId})`)

      // 3. 关联用户与角色
      await queryInterface.sequelize.query(
        `
        INSERT INTO user_roles (user_id, role_id, assigned_at, assigned_by, is_active, created_at, updated_at)
        VALUES (
          :user_id,
          100,
          :now,
          :user_id,
          1,
          :now,
          :now
        )
      `,
        {
          replacements: { user_id: systemUserId, now },
          transaction
        }
      )

      console.log('✅ 创建用户角色关联成功')

      await transaction.commit()

      console.log('\n📋 迁移完成摘要:')
      console.log(`   - system_job 角色: role_id=100, role_level=-1`)
      console.log(`   - 系统用户: user_id=${systemUserId}, mobile=00000000001`)
      console.log('\n⚠️ 请在 .env 中配置: SYSTEM_DAILY_JOB_USER_ID=' + systemUserId)
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 获取系统用户ID
      const [userResult] = await queryInterface.sequelize.query(
        `SELECT user_id FROM users WHERE mobile = '00000000001'`,
        { transaction }
      )

      if (userResult.length > 0) {
        const systemUserId = userResult[0].user_id

        // 2. 删除用户角色关联
        await queryInterface.sequelize.query(
          `DELETE FROM user_roles WHERE user_id = :user_id AND role_id = 100`,
          { replacements: { user_id: systemUserId }, transaction }
        )
        console.log('✅ 删除用户角色关联')

        // 3. 删除系统用户
        await queryInterface.sequelize.query(`DELETE FROM users WHERE user_id = :user_id`, {
          replacements: { user_id: systemUserId },
          transaction
        })
        console.log('✅ 删除系统用户')
      }

      // 4. 删除 system_job 角色
      await queryInterface.sequelize.query(`DELETE FROM roles WHERE role_id = 100`, { transaction })
      console.log('✅ 删除 system_job 角色')

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
