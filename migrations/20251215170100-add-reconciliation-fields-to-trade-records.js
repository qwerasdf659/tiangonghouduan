/**
 * 迁移文件：为trade_records表添加对账字段（交易市场DIAMOND结算专用）
 *
 * 业务背景：
 * - 交易市场从积分结算迁移到DIAMOND资产结算，需要记录交易对账信息
 * - 支持手续费计算和平台收入对账
 * - 支持强幂等性控制，防止重复扣款
 *
 * 变更内容：
 * - 添加asset_code字段：结算资产代码（固定为DIAMOND）
 * - 添加gross_amount字段：买家支付总金额（BIGINT）
 * - 添加fee_amount字段：平台手续费金额（BIGINT）
 * - 添加net_amount字段：卖家实收金额（BIGINT）
 * - 添加business_id字段：幂等键（VARCHAR(100)）
 * - 添加UNIQUE索引：business_id（只对新数据生效，历史数据允许NULL）
 *
 * 业务规则：
 * - gross_amount = fee_amount + net_amount（对账公式）
 * - business_id用于幂等性控制，防止重复扣款
 * - 只对新记录（trade_type=market_purchase）强制business_id非空
 *
 * 影响范围：
 * - trade_records表结构
 * - 交易市场购买接口
 * - 手续费计算和对账逻辑
 *
 * 创建时间：2025-12-15
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：添加对账字段和business_id幂等键
   *
   * 业务规则：
   * - asset_code：交易市场固定使用DIAMOND结算
   * - gross/fee/net：使用BIGINT避免浮点精度问题
   * - business_id：唯一索引兜底防止重复交易
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize对象
   * @returns {Promise<void>}
   */
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 添加asset_code字段（结算资产代码，固定为DIAMOND）
      await queryInterface.addColumn(
        'trade_records',
        'asset_code',
        {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: '结算资产代码（Asset Code - 交易结算使用的资产类型）：DIAMOND-钻石资产（交易市场唯一结算币种）；业务规则：仅trade_type=market_purchase时使用，固定为DIAMOND；用途：资产结算类型、多资产扩展预留、对账验证'
        },
        { transaction }
      )

      // 2. 添加gross_amount字段（买家支付总金额）
      await queryInterface.addColumn(
        'trade_records',
        'gross_amount',
        {
          type: Sequelize.BIGINT,
          allowNull: true,
          comment: '买家支付总金额（Gross Amount - 买家支付的总金额，包含手续费）：使用BIGINT避免浮点精度问题；业务规则：gross_amount = fee_amount + net_amount（对账公式）；用途：买家扣款金额、对账验证、交易金额统计'
        },
        { transaction }
      )

      // 3. 添加fee_amount字段（平台手续费）
      await queryInterface.addColumn(
        'trade_records',
        'fee_amount',
        {
          type: Sequelize.BIGINT,
          allowNull: true,
          defaultValue: 0,
          comment: '平台手续费金额（Fee Amount - 平台收取的手续费金额）：使用BIGINT避免浮点精度问题；业务规则：按fee_rules配置计算，向上取整；用途：平台收入对账、手续费统计、商家成本分析'
        },
        { transaction }
      )

      // 4. 添加net_amount字段（卖家实收金额）
      await queryInterface.addColumn(
        'trade_records',
        'net_amount',
        {
          type: Sequelize.BIGINT,
          allowNull: true,
          comment: '卖家实收金额（Net Amount - 卖家实际收到的金额，扣除手续费后）：使用BIGINT避免浮点精度问题；业务规则：net_amount = gross_amount - fee_amount；用途：卖家入账金额、收益统计、对账验证'
        },
        { transaction }
      )

      // 5. 添加business_id字段（幂等键）
      await queryInterface.addColumn(
        'trade_records',
        'business_id',
        {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: '业务唯一标识（Business ID - 幂等键，用于防止重复扣款）：客户端必传，格式如mp_20251215_xxx；业务规则：同一business_id只能创建一条记录，重复请求返回原结果；用途：幂等性控制、重复交易防护、对账追溯'
        },
        { transaction }
      )

      // 6. 添加business_id唯一索引（只对非NULL值生效，历史数据允许NULL）
      await queryInterface.addIndex('trade_records', ['business_id'], {
        unique: true,
        name: 'uk_trade_records_business_id',
        where: {
          business_id: {
            [Sequelize.Op.not]: null
          }
        },
        transaction
      })

      await transaction.commit()
      console.log('✅ 成功为trade_records表添加对账字段')
      console.log('   - asset_code: VARCHAR(50)，结算资产代码（固定DIAMOND）')
      console.log('   - gross_amount: BIGINT，买家支付总金额')
      console.log('   - fee_amount: BIGINT，平台手续费金额')
      console.log('   - net_amount: BIGINT，卖家实收金额')
      console.log('   - business_id: VARCHAR(100)，幂等键（唯一索引）')
      console.log('   - 对账公式：gross_amount = fee_amount + net_amount')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：删除对账字段和business_id索引
   *
   * 注意：
   * - 回滚前会检查是否有使用新字段的记录
   * - 如果存在数据，拒绝回滚，需要先处理数据
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize对象
   * @returns {Promise<void>}
   */
  async down (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 检查是否有使用新字段的记录
      const [results] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM trade_records WHERE business_id IS NOT NULL',
        { transaction }
      )

      const count = results[0].count

      if (count > 0) {
        throw new Error(
          `无法回滚：数据库中存在${count}条使用business_id的记录。` +
          '请先手动清理数据或将数据迁移到其他表，然后再执行回滚。'
        )
      }

      // 删除business_id唯一索引
      await queryInterface.removeIndex(
        'trade_records',
        'uk_trade_records_business_id',
        { transaction }
      )

      // 删除字段（按添加的逆序删除）
      await queryInterface.removeColumn('trade_records', 'business_id', {
        transaction
      })
      await queryInterface.removeColumn('trade_records', 'net_amount', {
        transaction
      })
      await queryInterface.removeColumn('trade_records', 'fee_amount', {
        transaction
      })
      await queryInterface.removeColumn('trade_records', 'gross_amount', {
        transaction
      })
      await queryInterface.removeColumn('trade_records', 'asset_code', {
        transaction
      })

      await transaction.commit()
      console.log('✅ 成功从trade_records表删除对账字段')
      console.log('   - 系统已回滚到使用积分结算的模式')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
