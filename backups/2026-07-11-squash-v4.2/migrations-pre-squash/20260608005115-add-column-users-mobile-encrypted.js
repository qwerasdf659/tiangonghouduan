'use strict'

/**
 * 添加列: users.mobile_encrypted + mobile_hash（PII 手机号加密双列，非破坏式回填）
 *
 * 创建时间: 2026-06-08（路线B 合规改造 模块B·第2步）
 * 创建原因（第九节 / 决策 17.2 调整）:
 * - 手机号明文存储构成 PII 合规风险。改为 AES-256-GCM 密文列 + HMAC 盲索引列。
 * - ⚠️ 与文档"清库重建"不同：本项目库内有 139 个真实用户（含测试账号 13612227930/user_id=31），
 *   清库会丢真实数据，违反"不删真实数据/保留测试账号"硬规则。
 *   故采用【非破坏式回填】：加双列 → 回填现有明文 → 切查询验证 → 后续迁移再删明文列。
 *   合规终态一致（库内无可读明文），但不丢数据。
 *
 * 本迁移只做"加列 + 回填 + 加盲索引唯一约束"，暂保留 mobile 明文列（待切查询验证后由下一迁移删除）。
 *
 * 回滚: 删除两列及其索引（mobile 明文列本迁移未动，无需恢复）
 */

const PiiCrypto = require('../utils/PiiCrypto')

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      // 1. 加密列（可空，回填后由模型透明写入）
      await queryInterface.addColumn(
        'users',
        'mobile_encrypted',
        {
          type: Sequelize.STRING(255),
          allowNull: true,
          comment: '手机号密文（AES-256-GCM，格式 v1:iv:tag:cipher），展示/发短信时解密'
        },
        { transaction }
      )
      // 2. 盲索引列（HMAC-SHA256，用于唯一约束/登录/判重）
      await queryInterface.addColumn(
        'users',
        'mobile_hash',
        {
          type: Sequelize.STRING(64),
          allowNull: true,
          comment: '手机号盲索引（HMAC-SHA256），用于唯一性约束与等值查询，不可逆'
        },
        { transaction }
      )

      // 3. 回填现有明文 → 密文 + 盲索引
      const [rows] = await sequelize.query(
        'SELECT user_id, mobile FROM users WHERE mobile IS NOT NULL',
        { transaction }
      )
      for (const row of rows) {
        const encrypted = PiiCrypto.encrypt(row.mobile)
        const hash = PiiCrypto.blindHash(row.mobile)
        // eslint-disable-next-line no-await-in-loop
        await sequelize.query(
          'UPDATE users SET mobile_encrypted = :enc, mobile_hash = :hash WHERE user_id = :id',
          { replacements: { enc: encrypted, hash, id: row.user_id }, transaction }
        )
      }

      // 4. 盲索引唯一约束（替代原 mobile 唯一约束的查询能力）
      await queryInterface.addIndex('users', ['mobile_hash'], {
        unique: true,
        name: 'uk_users_mobile_hash',
        transaction
      })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.removeIndex('users', 'uk_users_mobile_hash', { transaction })
      await queryInterface.removeColumn('users', 'mobile_hash', { transaction })
      await queryInterface.removeColumn('users', 'mobile_encrypted', { transaction })
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
