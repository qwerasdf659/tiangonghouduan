'use strict'

/**
 * 添加列: users.mobile_prefix_hash + mobile_suffix_hash（手机号号段/尾号盲索引）
 *
 * 创建时间: 2026-06-08（路线B 合规改造 模块B 补充 / 决策17.2修订 / 第二十二节方案二完整版）
 * 创建原因:
 * - 手机号加密后无法对明文做模糊搜（密文随机、全量盲索引仅支持完整号等值）。
 * - 用户拍板"方案二完整版"：在全量 mobile_hash 之外，加号段(前3位)+尾号(后4位)两个盲索引，
 *   支持管理端「完整号 / 号段 / 尾号」三种搜索。
 * - prefix/suffix 盲索引为非唯一（号段、尾号会重复），仅用于等值定位。
 *
 * 非破坏式回填：对现有 139 用户从密文解密后重算两列盲索引。
 *
 * 回滚: 删除两列及其索引
 */

const PiiCrypto = require('../utils/PiiCrypto')

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      await queryInterface.addColumn(
        'users',
        'mobile_prefix_hash',
        {
          type: Sequelize.STRING(64),
          allowNull: true,
          comment: '手机号前3位号段盲索引（HMAC-SHA256），用于管理端按号段搜，非唯一'
        },
        { transaction }
      )
      await queryInterface.addColumn(
        'users',
        'mobile_suffix_hash',
        {
          type: Sequelize.STRING(64),
          allowNull: true,
          comment: '手机号后4位尾号盲索引（HMAC-SHA256），用于管理端按尾号搜，非唯一'
        },
        { transaction }
      )

      // 回填现有用户（从密文解密 → 重算号段/尾号盲索引）
      const [rows] = await sequelize.query(
        'SELECT user_id, mobile_encrypted FROM users WHERE mobile_encrypted IS NOT NULL',
        { transaction }
      )
      for (const row of rows) {
        const plain = PiiCrypto.decrypt(row.mobile_encrypted)
        const prefix = PiiCrypto.prefixHash(plain, 3)
        const suffix = PiiCrypto.suffixHash(plain, 4)
        // eslint-disable-next-line no-await-in-loop
        await sequelize.query(
          'UPDATE users SET mobile_prefix_hash = :p, mobile_suffix_hash = :s WHERE user_id = :id',
          { replacements: { p: prefix, s: suffix, id: row.user_id }, transaction }
        )
      }

      // 普通索引（非唯一，号段/尾号会重复）
      await queryInterface.addIndex('users', ['mobile_prefix_hash'], {
        name: 'idx_users_mobile_prefix_hash',
        transaction
      })
      await queryInterface.addIndex('users', ['mobile_suffix_hash'], {
        name: 'idx_users_mobile_suffix_hash',
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
      await queryInterface.removeIndex('users', 'idx_users_mobile_prefix_hash', { transaction })
      await queryInterface.removeIndex('users', 'idx_users_mobile_suffix_hash', { transaction })
      await queryInterface.removeColumn('users', 'mobile_prefix_hash', { transaction })
      await queryInterface.removeColumn('users', 'mobile_suffix_hash', { transaction })
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
