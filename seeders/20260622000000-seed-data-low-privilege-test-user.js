'use strict'

/**
 * 低权限测试账号种子（seed-data）— 权限边界测试专用
 *
 * 创建时间: 2026-06-22
 * 创建原因（权限边界测试需要真实低权限账号）:
 *   上线前清测试数据后，真实库 users 仅剩 user_id=32(13612227910，super_admin:110)
 *   与 11021(system_job)。导致 TEST_ACCOUNTS 的 user/regional_manager 键只能指向超管，
 *   「低权限用户访问 requireRoleLevel(100) 管理端接口应被 403 拒绝」这类边界用例失去区分度。
 *   本 seeder 造一个真实普通用户（user:0），供权限边界测试验证「低权限被正确拒绝」。
 *
 * 账号: 15818387910（普通用户，role_level=0；开发/测试环境万能验证码 123456 登录）
 *   ⚠️ 必须 ≠ 13612227910(超管)，否则无法测「低权限被拒」。
 *
 * 复用现有机制（不手写加密/不绕模型）:
 *   调用 UserService.registerUser(mobile, {transaction})——该方法走 User 模型虚拟字段，
 *   自动完成手机号 AES 加密(mobile_encrypted)+ 盲索引(mobile_hash 等)+ 创建资产账户
 *   + 分配 user(role_level=0) 角色。绝不 bulkInsert 明文手机号（会绕过 PII 加密、破坏唯一约束）。
 *
 * 幂等: 先按盲索引查 mobile 是否已存在，存在则跳过；重复执行安全。
 *
 * 执行: npx sequelize-cli db:seed --seed 20260622000000-seed-data-low-privilege-test-user.js
 * 回滚: npx sequelize-cli db:seed:undo --seed 20260622000000-seed-data-low-privilege-test-user.js
 */

// .env 兜底加载（PiiCrypto 依赖 ENCRYPTION_KEY/PII_HASH_SECRET，仅读取不写回）
require('dotenv').config()

const LOW_PRIV_MOBILE = '15818387910' // 低权限普通用户（user:0），≠ 超管 13612227910
const LOW_PRIV_NICKNAME = '权限边界测试用户'

module.exports = {
  async up(queryInterface) {
    const UserService = require('../services/UserService')
    const { User } = require('../models')
    const PiiCrypto = require('../utils/PiiCrypto')

    // 幂等：按盲索引查是否已存在（明文不落查询条件）
    const existing = await User.findOne({
      where: { mobile_hash: PiiCrypto.blindHash(LOW_PRIV_MOBILE) }
    })
    if (existing) {
      // eslint-disable-next-line no-console
      console.log(`[seed] 低权限测试账号已存在(user_id=${existing.user_id})，跳过`)
      return
    }

    // 复用 registerUser：模型层加密 + 资产账户 + 分配 user(0) 角色；事务由本 seeder 提供
    const transaction = await queryInterface.sequelize.transaction()
    try {
      const user = await UserService.registerUser(LOW_PRIV_MOBILE, {
        nickname: LOW_PRIV_NICKNAME,
        status: 'active',
        transaction
      })
      await transaction.commit()
      // eslint-disable-next-line no-console
      console.log(
        `[seed] 低权限测试账号创建成功 user_id=${user.user_id}, mobile=${LOW_PRIV_MOBILE}`
      )
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const { User, UserRole, Account, AccountAssetBalance } = require('../models')
    const PiiCrypto = require('../utils/PiiCrypto')

    const user = await User.findOne({
      where: { mobile_hash: PiiCrypto.blindHash(LOW_PRIV_MOBILE) }
    })
    if (!user) return

    const transaction = await queryInterface.sequelize.transaction()
    try {
      // 按外键依赖顺序清理（子表先于父表）：角色 → 资产余额 → 资产账户 → 用户
      await UserRole.destroy({ where: { user_id: user.user_id }, transaction })
      const accounts = await Account.findAll({
        where: { user_id: user.user_id },
        attributes: ['account_id'],
        transaction
      })
      const accountIds = accounts.map(a => a.account_id)
      if (accountIds.length > 0) {
        await AccountAssetBalance.destroy({
          where: { account_id: accountIds },
          transaction
        })
        await Account.destroy({ where: { account_id: accountIds }, transaction })
      }
      await User.destroy({ where: { user_id: user.user_id }, transaction })
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
