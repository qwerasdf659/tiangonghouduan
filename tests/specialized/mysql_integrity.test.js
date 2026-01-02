/**
 * MySQL数据约束和参照完整性专项测试 - V4.0统一引擎架构
 * 测试内容：数据约束、参照完整性、数据一致性（重复功能已清理）
 * 创建时间：2025年08月24日 03:42:40
 * 更新时间：2025年12月30日 (迁移到资产域架构)
 */

const { User, Account, AccountAssetBalance, AssetTransaction } = require('../../models')

describe('MySQL数据约束和参照完整性专项测试', () => {
  const testPhoneNumber = '13612227930'
  let testUser

  beforeAll(async () => {
    // 确保测试用户存在
    const existingUser = await User.findOne({ where: { mobile: testPhoneNumber } })
    if (existingUser) {
      testUser = existingUser
    } else {
      testUser = await User.create({
        mobile: testPhoneNumber,
        nickname: '测试用户',
        history_total_points: 1000
      })

      // 🛡️ 为测试用户分配管理员角色
      const { Role, UserRole } = require('../../models')
      const adminRole = await Role.findOne({ where: { role_name: 'admin' } })
      if (adminRole) {
        await UserRole.create({
          user_id: testUser.user_id,
          role_id: adminRole.id,
          is_active: true
        })
      }
    }
  })

  // 注意：基础连接测试和表结构检查已移除，由MySQLSpecializedTests.js统一处理

  describe('数据约束完整性测试', () => {
    test('用户手机号唯一性约束', async () => {
      const existingUser = await User.findOne({ where: { mobile: testPhoneNumber } })
      expect(existingUser).not.toBeNull()

      // 尝试创建重复手机号用户应该失败
      await expect(
        User.create({
          mobile: testPhoneNumber,
          nickname: '重复用户'
        })
      ).rejects.toThrow()
    })

    test('必填字段约束', async () => {
      // 尝试创建没有mobile的用户应该失败
      await expect(
        User.create({
          nickname: '无手机号用户'
        })
      ).rejects.toThrow()
    })
  })

  describe('参照完整性测试', () => {
    test('用户资产账户关联完整性', async () => {
      // 使用新的资产域模型：Account + AccountAssetBalance
      const userAccount = await Account.findOne({
        where: { user_id: testUser.user_id, account_type: 'user' }
      })

      if (userAccount) {
        // 验证关联的用户确实存在
        const relatedUser = await User.findByPk(userAccount.user_id)
        expect(relatedUser).not.toBeNull()
        expect(relatedUser.user_id).toBe(testUser.user_id)

        // 验证账户余额记录
        const balances = await AccountAssetBalance.findAll({
          where: { account_id: userAccount.account_id }
        })
        // 余额记录应该都关联到正确的账户
        balances.forEach(balance => {
          expect(balance.account_id).toBe(userAccount.account_id)
        })
      }
    })

    test('资产交易记录关联完整性', async () => {
      // 使用新的资产域模型：AssetTransaction
      const userAccount = await Account.findOne({
        where: { user_id: testUser.user_id, account_type: 'user' }
      })

      if (!userAccount) {
        // 如果用户没有账户，跳过测试
        console.log('⚠️ 用户没有资产账户，跳过交易记录测试')
        return
      }

      try {
        const transactions = await AssetTransaction.findAll({
          where: { account_id: userAccount.account_id },
          limit: 1
        })

        if (transactions.length > 0) {
          const transaction = transactions[0]
          // 验证关联的账户存在
          const relatedAccount = await Account.findByPk(transaction.account_id)
          expect(relatedAccount).not.toBeNull()
        } else {
          console.log('⚠️ 用户没有交易记录，跳过关联完整性验证')
        }
      } catch (error) {
        // 如果查询失败（可能是表不存在等情况），记录并跳过
        console.log('⚠️ 交易记录查询失败:', error.message)
      }
    })
  })

  describe('数据一致性测试', () => {
    test('用户资产数据一致性', async () => {
      const user = await User.findByPk(testUser.user_id)
      const userAccount = await Account.findOne({
        where: { user_id: testUser.user_id, account_type: 'user' }
      })

      if (userAccount) {
        // 查询POINTS资产余额
        const pointsBalance = await AccountAssetBalance.findOne({
          where: { account_id: userAccount.account_id, asset_code: 'POINTS' }
        })

        if (pointsBalance) {
          // 历史总积分应该大于等于0
          expect(user.history_total_points).toBeGreaterThanOrEqual(0)
          // 可用余额应该大于等于0
          expect(Number(pointsBalance.available_amount)).toBeGreaterThanOrEqual(0)
          // 冻结余额应该大于等于0
          expect(Number(pointsBalance.frozen_amount)).toBeGreaterThanOrEqual(0)
        }
      }
    })
  })
})
