'use strict'

/**
 * 迁移：为 authentication_sessions 表添加 login_platform 字段
 *
 * 业务背景：
 *   当前系统采用「全局单会话」策略（user_type + user_id），
 *   导致 Web 管理后台登录时踢掉微信小程序会话。
 *   改为「按平台隔离会话」策略（user_type + user_id + login_platform），
 *   同平台互踢、跨平台共存。
 *
 * 改动内容：
 *   1. 新增 login_platform ENUM 字段（6个平台值）
 *   2. 回填已有记录为 'unknown'（DEFAULT 已保证）
 *   3. 替换旧索引 idx_user_sessions_user_active → 新索引 idx_user_sessions_platform
 *
 * @see docs/multi-platform-session-design.md
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. 新增 login_platform 字段
    await queryInterface.addColumn('authentication_sessions', 'login_platform', {
      type: Sequelize.ENUM('web', 'wechat_mp', 'douyin_mp', 'alipay_mp', 'app', 'unknown'),
      allowNull: false,
      defaultValue: 'unknown',
      comment: '登录平台：web=浏览器, wechat_mp=微信小程序, douyin_mp=抖音小程序, alipay_mp=支付宝小程序, app=原生App(预留), unknown=旧数据兜底',
      after: 'login_ip'
    })

    // 2. 删除旧索引（user_type + user_id + is_active）
    await queryInterface.removeIndex(
      'authentication_sessions',
      'idx_user_sessions_user_active'
    )

    // 3. 创建新索引（user_type + user_id + login_platform + is_active）
    await queryInterface.addIndex(
      'authentication_sessions',
      ['user_type', 'user_id', 'login_platform', 'is_active'],
      { name: 'idx_user_sessions_platform' }
    )
  },

  async down(queryInterface) {
    // 1. 删除新索引
    await queryInterface.removeIndex(
      'authentication_sessions',
      'idx_user_sessions_platform'
    )

    // 2. 恢复旧索引
    await queryInterface.addIndex(
      'authentication_sessions',
      ['user_type', 'user_id', 'is_active'],
      { name: 'idx_user_sessions_user_active' }
    )

    // 3. 删除字段（ENUM 类型会自动清理）
    await queryInterface.removeColumn('authentication_sessions', 'login_platform')
  }
}
