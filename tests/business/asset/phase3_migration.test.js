/**
 * Phase 3 迁移测试：兑换市场和材料转换统一账本迁移
 *
 * 测试目标：
 * 1. 兑换市场材料扣减改为统一账本（business_type: exchange_debit）
 * 2. 材料→DIAMOND转换改为统一账本双分录（material_convert_debit + material_convert_credit）
 * 3. 统一409幂等冲突语义（参数不同返回409）
 *
 * 创建时间：2025-12-15
 * Phase 3实施
 */

const { User, AssetTransaction, sequelize: _sequelize } = require('../../../models')
const { Op } = require('sequelize')
const AssetService = require('../../../services/AssetService')
const AssetConversionService = require('../../../services/AssetConversionService')
const TransactionManager = require('../../../utils/TransactionManager')

describe('Phase 3迁移测试：统一账本域', () => {
  let testUser

  beforeAll(async () => {
    // 查找或创建测试用户
    const [user, created] = await User.findOrCreate({
      where: { mobile: '13600000003' },
      defaults: {
        mobile: '13600000003',
        name: 'Phase3测试用户',
        role: 'user',
        status: 'active'
      }
    })

    testUser = user

    if (created) {
      console.log('✅ 创建新测试用户:', testUser.user_id)
    } else {
      console.log('✅ 使用已存在测试用户:', testUser.user_id)
    }
  })

  afterAll(async () => {
    // 清理测试数据（保留测试用户，只清理测试业务数据）
    if (testUser) {
      // 只清理测试相关的业务数据
      await AssetTransaction.destroy({
        where: {
          idempotency_key: { [Op.like]: 'test_phase3_%' }
        }
      })

      console.log('✅ 清理测试数据完成（保留测试用户）')
    }
  })

  describe('1. 材料转换迁移测试', () => {
    beforeEach(async () => {
      // 清理之前的测试数据
      await AssetTransaction.destroy({
        where: {
          idempotency_key: { [Op.like]: 'test_phase3_convert_%' }
        }
      })

      // 给测试用户添加red_shard余额（使用事务包裹）
      await TransactionManager.execute(async transaction => {
        await AssetService.changeBalance(
          {
            user_id: testUser.user_id,
            asset_code: 'red_shard',
            delta_amount: 100, // 添加100个red_shard
            idempotency_key: `test_phase3_init_${Date.now()}`,
            business_type: 'admin_adjustment',
            meta: { reason: 'Phase 3测试初始化' }
          },
          { transaction }
        )
      })
    })

    test('材料转换应使用统一账本双分录', async () => {
      const idempotency_key = `test_phase3_convert_${Date.now()}`

      // 记录转换前的余额
      const before_red_shard = await AssetService.getBalance(
        { user_id: testUser.user_id, asset_code: 'red_shard' },
        {}
      )
      const before_diamond = await AssetService.getBalance(
        { user_id: testUser.user_id, asset_code: 'DIAMOND' },
        {}
      )

      // 执行转换：10个red_shard → 200个DIAMOND（使用事务包裹）
      const result = await TransactionManager.execute(async transaction => {
        return await AssetConversionService.convertMaterial(
          testUser.user_id,
          'red_shard',
          'DIAMOND',
          10,
          { idempotency_key, transaction }
        )
      })

      expect(result.success).toBe(true)
      expect(result.from_asset_code).toBe('red_shard')
      expect(result.to_asset_code).toBe('DIAMOND')
      expect(result.from_amount).toBe(10)
      expect(result.to_amount).toBe(200) // 1:20比例
      expect(result.is_duplicate).toBe(false)

      /*
       * 验证双分录都写入了asset_transactions表
       * 注意：AssetConversionService 使用派生键格式 ${idempotency_key}:debit 和 ${idempotency_key}:credit
       */
      const debit_tx = await AssetTransaction.findOne({
        where: {
          idempotency_key: `${idempotency_key}:debit`,
          business_type: 'material_convert_debit',
          asset_code: 'red_shard'
        }
      })

      const credit_tx = await AssetTransaction.findOne({
        where: {
          idempotency_key: `${idempotency_key}:credit`,
          business_type: 'material_convert_credit',
          asset_code: 'DIAMOND'
        }
      })

      expect(debit_tx).not.toBeNull()
      expect(credit_tx).not.toBeNull()
      expect(Number(debit_tx.delta_amount)).toBe(-10) // 扣减10个red_shard
      expect(Number(credit_tx.delta_amount)).toBe(200) // 增加200个DIAMOND

      // 验证余额变化（基于转换前余额）
      const after_red_shard = await AssetService.getBalance(
        { user_id: testUser.user_id, asset_code: 'red_shard' },
        {}
      )
      const after_diamond = await AssetService.getBalance(
        { user_id: testUser.user_id, asset_code: 'DIAMOND' },
        {}
      )

      expect(after_red_shard.available_amount).toBe(before_red_shard.available_amount - 10)
      expect(after_diamond.available_amount).toBe(before_diamond.available_amount + 200)

      console.log('✅ 材料转换统一账本双分录测试通过')
    })

    test('材料转换幂等性测试（参数相同）', async () => {
      const idempotency_key = `test_phase3_convert_idempotent_${Date.now()}`

      // 记录转换前的余额
      const before_balance = await AssetService.getBalance(
        { user_id: testUser.user_id, asset_code: 'red_shard' },
        {}
      )

      // 第一次转换（使用事务包裹）
      const result1 = await TransactionManager.execute(async transaction => {
        return await AssetConversionService.convertMaterial(
          testUser.user_id,
          'red_shard',
          'DIAMOND',
          5,
          { idempotency_key, transaction }
        )
      })

      expect(result1.success).toBe(true)
      expect(result1.is_duplicate).toBe(false)

      // 第二次转换（相同参数，使用事务包裹）
      const result2 = await TransactionManager.execute(async transaction => {
        return await AssetConversionService.convertMaterial(
          testUser.user_id,
          'red_shard',
          'DIAMOND',
          5,
          { idempotency_key, transaction }
        )
      })

      expect(result2.success).toBe(true)
      expect(result2.is_duplicate).toBe(true) // 幂等返回
      expect(Number(result2.from_tx_id)).toBe(Number(result1.from_tx_id))
      expect(Number(result2.to_tx_id)).toBe(Number(result1.to_tx_id))

      // 验证余额只扣减一次（基于转换前余额）
      const after_balance = await AssetService.getBalance(
        { user_id: testUser.user_id, asset_code: 'red_shard' },
        {}
      )

      expect(after_balance.available_amount).toBe(before_balance.available_amount - 5)

      console.log('✅ 材料转换幂等性测试通过')
    })

    test('材料转换409冲突检查（参数不同）', async () => {
      const idempotency_key = `test_phase3_convert_conflict_${Date.now()}`

      // 第一次转换：5个red_shard（使用事务包裹）
      await TransactionManager.execute(async transaction => {
        return await AssetConversionService.convertMaterial(
          testUser.user_id,
          'red_shard',
          'DIAMOND',
          5,
          {
            idempotency_key,
            transaction
          }
        )
      })

      // 第二次转换：相同idempotency_key，但不同数量（10个）
      await expect(
        TransactionManager.execute(async transaction => {
          return await AssetConversionService.convertMaterial(
            testUser.user_id,
            'red_shard',
            'DIAMOND',
            10, // 不同数量
            { idempotency_key, transaction }
          )
        })
      ).rejects.toThrow(/幂等键冲突/)

      try {
        await TransactionManager.execute(async transaction => {
          return await AssetConversionService.convertMaterial(
            testUser.user_id,
            'red_shard',
            'DIAMOND',
            10,
            {
              idempotency_key,
              transaction
            }
          )
        })
      } catch (error) {
        expect(error.statusCode).toBe(409)
        expect(error.errorCode).toBe('IDEMPOTENCY_KEY_CONFLICT')
        console.log('✅ 409冲突错误码正确:', error.errorCode)
      }

      console.log('✅ 材料转换409冲突检查通过')
    })
  })

  describe('2. 业务类型（business_type）验证', () => {
    test('验证材料转换的business_type', async () => {
      const idempotency_key = `test_phase3_business_type_${Date.now()}`

      // 添加red_shard余额（使用事务包裹）
      await TransactionManager.execute(async transaction => {
        await AssetService.changeBalance(
          {
            user_id: testUser.user_id,
            asset_code: 'red_shard',
            delta_amount: 20,
            idempotency_key: `test_init_${Date.now()}`,
            business_type: 'admin_adjustment',
            meta: {}
          },
          { transaction }
        )
      })

      // 执行转换（使用事务包裹）
      await TransactionManager.execute(async transaction => {
        return await AssetConversionService.convertMaterial(
          testUser.user_id,
          'red_shard',
          'DIAMOND',
          10,
          {
            idempotency_key,
            transaction
          }
        )
      })

      // 验证扣减分录的business_type（使用派生键格式）
      const debit_tx = await AssetTransaction.findOne({
        where: {
          idempotency_key: `${idempotency_key}:debit`,
          asset_code: 'red_shard'
        }
      })

      // 验证入账分录的business_type（使用派生键格式）
      const credit_tx = await AssetTransaction.findOne({
        where: {
          idempotency_key: `${idempotency_key}:credit`,
          asset_code: 'DIAMOND'
        }
      })

      expect(debit_tx.business_type).toBe('material_convert_debit')
      expect(credit_tx.business_type).toBe('material_convert_credit')

      console.log('✅ business_type验证通过')
      console.log('   - 扣减分录:', debit_tx.business_type)
      console.log('   - 入账分录:', credit_tx.business_type)
    })
  })

  describe('3. 账本域统一验证', () => {
    test('验证所有资产变动都记录在asset_transactions表', async () => {
      const idempotency_key = `test_phase3_unified_ledger_${Date.now()}`

      // 添加red_shard余额（使用事务包裹）
      await TransactionManager.execute(async transaction => {
        await AssetService.changeBalance(
          {
            user_id: testUser.user_id,
            asset_code: 'red_shard',
            delta_amount: 30,
            idempotency_key: `test_init_${Date.now()}`,
            business_type: 'admin_adjustment',
            meta: {}
          },
          { transaction }
        )
      })

      // 执行转换（使用事务包裹）
      await TransactionManager.execute(async transaction => {
        return await AssetConversionService.convertMaterial(
          testUser.user_id,
          'red_shard',
          'DIAMOND',
          15,
          {
            idempotency_key,
            transaction
          }
        )
      })

      // 查询asset_transactions表（使用 LIKE 匹配派生键）
      const transactions = await AssetTransaction.findAll({
        where: {
          idempotency_key: { [Op.like]: `${idempotency_key}:%` }
        },
        order: [['created_at', 'ASC']]
      })

      expect(transactions.length).toBe(2) // 双分录

      // 找到扣减和入账分录
      const debitTx = transactions.find(t => t.business_type === 'material_convert_debit')
      const creditTx = transactions.find(t => t.business_type === 'material_convert_credit')

      expect(debitTx).toBeTruthy()
      expect(debitTx.asset_code).toBe('red_shard')
      expect(Number(debitTx.delta_amount)).toBe(-15)
      expect(debitTx.business_type).toBe('material_convert_debit')

      expect(creditTx).toBeTruthy()
      expect(creditTx.asset_code).toBe('DIAMOND')
      expect(Number(creditTx.delta_amount)).toBe(300) // 15 * 20 = 300
      expect(creditTx.business_type).toBe('material_convert_credit')

      // 验证account_id字段存在
      expect(debitTx.account_id).toBeTruthy()
      expect(creditTx.account_id).toBeTruthy()

      console.log('✅ 统一账本域验证通过')
      console.log('   - 双分录数量正确')
      console.log('   - account_id字段存在')
      console.log('   - business_type正确')
    })
  })
})
