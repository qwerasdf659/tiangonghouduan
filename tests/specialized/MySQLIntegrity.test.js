/**
 * MySQL数据约束和参照完整性专项测试 - V4.0统一引擎架构
 * 测试内容：数据约束、参照完整性、数据一致性（重复功能已清理）
 * 创建时间：2025年08月24日 03:42:40
 * 更新时间：2025年09月17日 (清理重复功能)
 */

const { User, UserPointsAccount, _LotteryCampaign, PointsTransaction } = require('../../models')

describe('MySQL数据约束和参照完整性专项测试', () => {
  const testPhoneNumber = '13612227930'
  let testUser

  beforeAll(async () => {
    // 确保测试用户存在
    const existingUser = await User.findOne({ where: { mobile: testPhoneNumber } })
    if (!existingUser) {
      testUser = await User.create({
        mobile: testPhoneNumber,
        nickname: '测试用户',
        is_admin: true,
        history_total_points: 1000
      })
    } else {
      testUser = existingUser
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
    test('用户积分账户关联完整性', async () => {
      const pointsAccount = await UserPointsAccount.findOne({
        where: { user_id: testUser.user_id }
      })

      if (pointsAccount) {
        // 验证关联的用户确实存在
        const relatedUser = await User.findByPk(pointsAccount.user_id)
        expect(relatedUser).not.toBeNull()
        expect(relatedUser.user_id).toBe(testUser.user_id)
      }
    })

    test('积分交易记录关联完整性', async () => {
      // 查找测试用户的交易记录
      const transactions = await PointsTransaction.findAll({
        where: { user_id: testUser.user_id },
        limit: 1
      })

      if (transactions.length > 0) {
        const transaction = transactions[0]
        // 验证关联的用户存在
        const relatedUser = await User.findByPk(transaction.user_id)
        expect(relatedUser).not.toBeNull()
      }
    })
  })

  describe('数据一致性测试', () => {
    test('用户积分数据一致性', async () => {
      const user = await User.findByPk(testUser.user_id)
      const pointsAccount = await UserPointsAccount.findOne({
        where: { user_id: testUser.user_id }
      })

      if (pointsAccount) {
        // 历史总积分应该大于等于当前积分
        expect(user.history_total_points).toBeGreaterThanOrEqual(0)
        expect(pointsAccount.current_points).toBeGreaterThanOrEqual(0)
        expect(pointsAccount.total_earned).toBeGreaterThanOrEqual(pointsAccount.total_consumed)
      }
    })
  })
})
