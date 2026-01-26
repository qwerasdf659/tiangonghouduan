/**
 * 迁移：创建 account_asset_balances 表（账户资产余额：可用 + 冻结）
 *
 * 业务场景：
 * - 替换 user_asset_accounts，升级为支持冻结余额的账本真相表
 * - 每个账户的每种资产有独立的余额记录（available_amount + frozen_amount）
 * - 交易市场必须采用"冻结 → 结算"链路（冻结为强制要求）
 *
 * 表名：account_asset_balances
 * 主键：balance_id（BIGINT，自增）
 * 唯一约束：(account_id, asset_code)
 * 外键：account_id → accounts.account_id（CASCADE更新，RESTRICT删除）
 *
 * 业务规则：
 * - available_amount：可用余额（可直接支付、转让、挂牌）
 * - frozen_amount：冻结余额（下单冻结、挂牌冻结，成交后转为扣减或入账）
 * - 总余额 = available_amount + frozen_amount
 * - 所有变动必须通过 AssetService 统一操作，禁止直接UPDATE
 *
 * 创建时间：2025-12-15
 * 迁移版本：v4.2.0
 * 对应文档：生产级资产与物品交易统一方案 - Phase 1
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：创建 account_asset_balances 表
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始创建 account_asset_balances 表...')

      // 创建 account_asset_balances 表
      await queryInterface.createTable(
        'account_asset_balances',
        {
          // ==================== 主键 ====================
          balance_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '余额记录ID（主键，自增）'
          },

          // ==================== 账户关联 ====================
          account_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment:
              '账户ID（Account ID）：关联 accounts.account_id，外键约束CASCADE更新/RESTRICT删除',
            references: {
              model: 'accounts',
              key: 'account_id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT'
          },

          // ==================== 资产代码 ====================
          asset_code: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment:
              '资产代码（Asset Code）：如 DIAMOND、red_shard、red_crystal 等；唯一约束：(account_id, asset_code)'
          },

          // ==================== 可用余额 ====================
          available_amount: {
            type: Sequelize.BIGINT,
            allowNull: false,
            defaultValue: 0,
            comment:
              '可用余额（Available Amount）：可直接支付、转让、挂牌的余额；业务规则：不可为负数，所有扣减操作必须验证余额充足；单位：整数（BIGINT避免浮点精度问题）'
          },

          // ==================== 冻结余额 ====================
          frozen_amount: {
            type: Sequelize.BIGINT,
            allowNull: false,
            defaultValue: 0,
            comment:
              '冻结余额（Frozen Amount）：下单冻结、挂牌冻结的余额；业务规则：交易市场购买时冻结买家DIAMOND，挂牌时冻结卖家标的资产；成交后从冻结转为扣减或入账；取消/超时时解冻回到 available_amount；不可为负数'
          },

          // ==================== 时间戳 ====================
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（北京时间）'
          },

          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间（北京时间）'
          }
        },
        {
          transaction,
          comment: '账户资产余额表（可用余额 + 冻结余额）'
        }
      )

      console.log('✅ account_asset_balances 表创建成功')

      // ==================== 创建索引 ====================
      console.log('🔄 创建索引...')

      // 唯一索引：(account_id, asset_code) - 每个账户每种资产只有一条余额记录
      await queryInterface.addIndex('account_asset_balances', {
        name: 'uk_account_asset',
        fields: ['account_id', 'asset_code'],
        unique: true,
        transaction
      })
      console.log('✅ 创建唯一索引：uk_account_asset (account_id, asset_code)')

      // 普通索引：asset_code - 按资产类型查询优化
      await queryInterface.addIndex('account_asset_balances', {
        name: 'idx_account_asset_balances_asset_code',
        fields: ['asset_code'],
        transaction
      })
      console.log('✅ 创建索引：idx_account_asset_balances_asset_code')

      // 普通索引：account_id - 查询账户所有资产优化
      await queryInterface.addIndex('account_asset_balances', {
        name: 'idx_account_asset_balances_account_id',
        fields: ['account_id'],
        transaction
      })
      console.log('✅ 创建索引：idx_account_asset_balances_account_id')

      await transaction.commit()
      console.log('✅ account_asset_balances 表创建完成（支持可用余额 + 冻结余额）')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 创建 account_asset_balances 表失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：删除 account_asset_balances 表
   */
  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚：删除 account_asset_balances 表...')

      // 删除表
      await queryInterface.dropTable('account_asset_balances', {
        transaction
      })

      await transaction.commit()
      console.log('✅ account_asset_balances 表已删除')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 删除 account_asset_balances 表失败:', error.message)
      throw error
    }
  }
}
