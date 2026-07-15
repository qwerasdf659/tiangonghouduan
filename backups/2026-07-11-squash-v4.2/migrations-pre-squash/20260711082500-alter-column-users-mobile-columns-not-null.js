'use strict'

/**
 * users 表手机号相关列收紧为 NOT NULL（2026-07-11）
 *
 * 业务背景:
 * - 手机号是用户唯一登录标识（业务必填：验证码登录是唯一注册/登录方式），
 *   但 PII 加密改造时 mobile_encrypted / mobile_hash / mobile_prefix_hash / mobile_suffix_hash
 *   四列均为 NULL 允许，数据库层面可创建"无手机号用户"（完整性测试实证暴露）；
 * - User.mobile 虚拟字段 setter 写入时四列同步落值，正常业务流不存在置空手机号的场景，
 *   全库排查无 NULL 存量（唯一一行为测试脏数据，已按孤儿数据硬删除策略清除）。
 *
 * 变更内容:
 * 1. users.mobile_encrypted   VARCHAR(255) NULL → NOT NULL
 * 2. users.mobile_hash        VARCHAR(64)  NULL → NOT NULL（唯一约束保持不变）
 * 3. users.mobile_prefix_hash VARCHAR(64)  NULL → NOT NULL
 * 4. users.mobile_suffix_hash VARCHAR(64)  NULL → NOT NULL
 *
 * 回滚: 四列恢复为 NULL 允许。
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // 前置校验：存在 NULL 存量则拒绝执行（须先人工清理，避免迁移中途失败）
    const [rows] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) AS null_count FROM users
       WHERE mobile_encrypted IS NULL OR mobile_hash IS NULL
          OR mobile_prefix_hash IS NULL OR mobile_suffix_hash IS NULL`
    )
    if (Number(rows[0].null_count) > 0) {
      throw new Error(
        `users 表存在 ${rows[0].null_count} 行手机号列为 NULL 的数据，请先清理后再执行本迁移`
      )
    }

    await queryInterface.changeColumn('users', 'mobile_encrypted', {
      type: Sequelize.STRING(255),
      allowNull: false,
      comment: '手机号密文（AES-256-GCM，格式 v1:iv:tag:cipher）'
    })
    await queryInterface.changeColumn('users', 'mobile_hash', {
      type: Sequelize.STRING(64),
      allowNull: false,
      comment: '手机号盲索引（HMAC-SHA256），不可逆，用于唯一性与等值查询'
    })
    await queryInterface.changeColumn('users', 'mobile_prefix_hash', {
      type: Sequelize.STRING(64),
      allowNull: false,
      comment: '手机号号段盲索引（前3位 HMAC），管理端按号段搜索'
    })
    await queryInterface.changeColumn('users', 'mobile_suffix_hash', {
      type: Sequelize.STRING(64),
      allowNull: false,
      comment: '手机号尾号盲索引（后4位 HMAC），管理端按尾号搜索'
    })
    console.log('✅ users 手机号四列已收紧为 NOT NULL（登录标识业务必填约束落库）')
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('users', 'mobile_encrypted', {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: '手机号密文（AES-256-GCM，格式 v1:iv:tag:cipher）'
    })
    await queryInterface.changeColumn('users', 'mobile_hash', {
      type: Sequelize.STRING(64),
      allowNull: true,
      comment: '手机号盲索引（HMAC-SHA256），不可逆，用于唯一性与等值查询'
    })
    await queryInterface.changeColumn('users', 'mobile_prefix_hash', {
      type: Sequelize.STRING(64),
      allowNull: true,
      comment: '手机号号段盲索引（前3位 HMAC），管理端按号段搜索'
    })
    await queryInterface.changeColumn('users', 'mobile_suffix_hash', {
      type: Sequelize.STRING(64),
      allowNull: true,
      comment: '手机号尾号盲索引（后4位 HMAC），管理端按尾号搜索'
    })
    console.log('⏪ users 手机号四列已恢复为 NULL 允许')
  }
}
