'use strict'

/**
 * 添加列: users.privacy_consent_at（隐私政策/用户协议首次同意时间戳）
 *
 * 创建时间: 2026-06-08（路线B 合规改造 模块B·第6步）
 * 创建原因（第九节·流程合规）:
 * - PII 收集需"首次登录授权同意"（用户协议 + 隐私政策勾选），并记录同意时间戳。
 * - 采用"首次注册即记录同意时间"模型：用户首次登录自动注册时写入 privacy_consent_at。
 * - 存量用户该列为 NULL，表示同意时间未知（上线前可由前端引导补充勾选，再回填）。
 *
 * 回滚: 删除该列
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'privacy_consent_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: '隐私政策/用户协议首次同意时间（北京时间，NULL=未记录）'
    })
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'privacy_consent_at')
  }
}
