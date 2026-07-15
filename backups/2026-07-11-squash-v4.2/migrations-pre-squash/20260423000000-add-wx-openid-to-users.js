'use strict'

/**
 * 迁移：给 users 表添加 wx_openid 字段
 *
 * 对应文档决策：7.20（微信静默登录）
 * - 添加 wx_openid VARCHAR(64) UNIQUE NULL 字段
 * - 添加唯一索引 idx_users_wx_openid
 * - 支持微信小程序 wx.login → code → openid 静默登录
 *
 * @version 4.2.0
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 添加 wx_openid 字段
    await queryInterface.addColumn('users', 'wx_openid', {
      type: Sequelize.STRING(64),
      allowNull: true,
      defaultValue: null,
      comment: '微信小程序 openid，用于静默登录（wx.login → jscode2session）'
    })

    // 添加唯一索引（允许 NULL，多个 NULL 不冲突）
    await queryInterface.addIndex('users', ['wx_openid'], {
      name: 'idx_users_wx_openid',
      unique: true,
      where: { wx_openid: { [Sequelize.Op.ne]: null } }
    })
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('users', 'idx_users_wx_openid')
    await queryInterface.removeColumn('users', 'wx_openid')
  }
}
