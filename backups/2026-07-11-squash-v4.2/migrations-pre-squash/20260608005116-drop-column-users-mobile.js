'use strict'

/**
 * 删除列: users.mobile（明文手机号列，PII 加密改造收尾）
 *
 * 创建时间: 2026-06-08（路线B 合规改造 模块B·第2步收尾）
 * 创建原因:
 * - 前序迁移 20260608005115 已加 mobile_encrypted（密文）+ mobile_hash（盲索引）并回填全部 139 用户，
 *   User 模型已将 mobile 改为虚拟字段（读解密密文、写同步密文+盲索引），查询走 mobile_hash。
 * - 登录/注册/判重/auth 测试全部验证通过后，删除明文 mobile 列，达成"库内无可读手机号明文"合规终态。
 *
 * ⚠️ 执行前提：必须确认前序迁移已成功回填（mobile_encrypted/mobile_hash 全覆盖），否则不可删。
 *
 * 回滚: 重建 mobile 列并从密文回填（解密 mobile_encrypted 写回明文）
 */

const PiiCrypto = require('../utils/PiiCrypto')

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      // 安全校验：确认密文/盲索引已全覆盖，避免误删导致数据不可恢复
      const [[stat]] = await sequelize.query(
        'SELECT COUNT(*) AS total, COUNT(mobile_encrypted) AS enc, COUNT(mobile_hash) AS hash FROM users',
        { transaction }
      )
      if (Number(stat.total) !== Number(stat.enc) || Number(stat.total) !== Number(stat.hash)) {
        throw new Error(
          `拒绝删除 mobile 明文列：密文/盲索引未全覆盖（total=${stat.total}, enc=${stat.enc}, hash=${stat.hash}）`
        )
      }

      // 删除明文列前先移除其唯一索引（如仍存在）
      const [indexes] = await sequelize.query('SHOW INDEX FROM users WHERE Column_name = \'mobile\'', {
        transaction
      })
      for (const idx of indexes) {
        // eslint-disable-next-line no-await-in-loop
        await sequelize.query(`ALTER TABLE users DROP INDEX \`${idx.Key_name}\``, { transaction })
      }

      await queryInterface.removeColumn('users', 'mobile', { transaction })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      // 重建明文列（回滚用）
      await queryInterface.addColumn(
        'users',
        'mobile',
        {
          type: Sequelize.STRING(20),
          allowNull: true,
          comment: '手机号（回滚重建，由密文解密回填）'
        },
        { transaction }
      )
      // 从密文解密回填
      const [rows] = await sequelize.query(
        'SELECT user_id, mobile_encrypted FROM users WHERE mobile_encrypted IS NOT NULL',
        { transaction }
      )
      for (const row of rows) {
        const plain = PiiCrypto.decrypt(row.mobile_encrypted)
        // eslint-disable-next-line no-await-in-loop
        await sequelize.query('UPDATE users SET mobile = :m WHERE user_id = :id', {
          replacements: { m: plain, id: row.user_id },
          transaction
        })
      }
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
