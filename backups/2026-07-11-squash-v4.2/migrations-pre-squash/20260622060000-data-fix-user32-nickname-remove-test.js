'use strict'

/**
 * 数据订正：user_id=32（超管 13612227910）昵称去掉"测试"字样
 *
 * 业务背景（2026-06-22 用户确认）：
 * - user_id=32 是上线后唯一的真实超级管理员账号（super_admin:110 + admin:100），
 *   但其 nickname 仍是早期注册遗留的"测试用户7910"，名实不符。
 * - nickname 是明文字段、会随用户数据下发给微信小程序前端展示。
 * - 决策：去掉"测试"，改为项目默认惯例的"用户7910"（仅手机号后4位，不暴露完整手机号，
 *   与 UserService.registerUser 默认 `用户${mobile.slice(-4)}` 一致，避免明文泄露完整号）。
 *
 * 幂等：仅当当前昵称为旧值"测试用户7910"时才更新；已是新值或被改过则跳过，重复执行安全。
 *
 * 执行: npx sequelize-cli db:migrate
 * 回滚: npx sequelize-cli db:migrate:undo（仅当当前为新值时还原回旧值）
 */

const TARGET_USER_ID = 32
const OLD_NICKNAME = '测试用户7910'
const NEW_NICKNAME = '用户7910'

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      // 幂等：仅当昵称为旧值时更新（避免覆盖人工改过的值）
      await sequelize.query(
        'UPDATE users SET nickname = :newName, updated_at = NOW() ' +
          'WHERE user_id = :userId AND nickname = :oldName',
        {
          replacements: { newName: NEW_NICKNAME, oldName: OLD_NICKNAME, userId: TARGET_USER_ID },
          transaction
        }
      )
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      // 回滚：仅当当前为新值时还原回旧值
      await sequelize.query(
        'UPDATE users SET nickname = :oldName, updated_at = NOW() ' +
          'WHERE user_id = :userId AND nickname = :newName',
        {
          replacements: { newName: NEW_NICKNAME, oldName: OLD_NICKNAME, userId: TARGET_USER_ID },
          transaction
        }
      )
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
