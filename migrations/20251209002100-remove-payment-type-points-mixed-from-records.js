/**
 * 数据库迁移：删除 exchange_market_records 表 payment_type 字段中的 points 和 mixed 类型
 *
 * 业务背景：
 * - 兑换市场订单统一为只支持虚拟奖品价值支付
 * - 废弃 points（积分支付）和 mixed（混合支付）方式
 * - 与 exchange_items 表保持一致
 *
 * 迁移内容：
 * 1. 将所有 payment_type='points' 和 'mixed' 的订单改为 'virtual'
 * 2. 修改 payment_type 字段 ENUM 定义，只保留 'virtual'
 * 3. 更新字段注释说明
 *
 * 注意事项：
 * - 此迁移不可逆（回滚会恢复ENUM但数据已转换）
 * - 执行前请备份数据库
 * - 确保ExchangeMarketService.js已更新
 *
 * 创建时间：2025年12月09日
 */

'use strict'

module.exports = {
  /**
   * 升级迁移：删除 points 和 mixed 支付类型
   *
   * @param {QueryInterface} queryInterface - Sequelize查询接口
   * @param {Sequelize} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  up: async (queryInterface, Sequelize) => {
    console.log('\n[迁移] 开始执行：删除 exchange_market_records.payment_type 中的 points 和 mixed 类型')

    // 第1步：检查当前数据库中的 payment_type 分布
    console.log('\n[步骤1/4] 检查现有订单数据...')
    const [results] = await queryInterface.sequelize.query(`
      SELECT payment_type, COUNT(*) as count
      FROM exchange_market_records
      GROUP BY payment_type;
    `)
    console.log('当前 payment_type 分布:', results)

    // 第2步：将所有 points 和 mixed 类型改为 virtual
    console.log('\n[步骤2/4] 更新现有订单数据: points/mixed -> virtual')
    const [updateResult] = await queryInterface.sequelize.query(`
      UPDATE exchange_market_records
      SET payment_type = 'virtual'
      WHERE payment_type IN ('points', 'mixed');
    `)
    console.log(`✅ 已更新 ${updateResult.affectedRows || 0} 条订单记录`)

    // 第3步：修改 payment_type ENUM 定义，只保留 'virtual'
    console.log('\n[步骤3/4] 修改 ENUM 定义: 只保留 virtual')
    await queryInterface.sequelize.query(`
      ALTER TABLE exchange_market_records
      MODIFY COLUMN payment_type ENUM('virtual')
      NOT NULL
      DEFAULT 'virtual'
      COMMENT '支付方式（仅支持虚拟奖品价值支付）';
    `)
    console.log('✅ ENUM 定义已更新')

    // 第4步：更新字段注释
    console.log('\n[步骤4/4] 更新字段注释')
    await queryInterface.sequelize.query(`
      ALTER TABLE exchange_market_records
      MODIFY COLUMN virtual_value_paid INT
      NOT NULL
      DEFAULT 0
      COMMENT '消耗虚拟奖品价值（实际支付金额）';
    `)
    await queryInterface.sequelize.query(`
      ALTER TABLE exchange_market_records
      MODIFY COLUMN points_paid INT
      NOT NULL
      DEFAULT 0
      COMMENT '消耗积分（应始终为0，仅用于展示）';
    `)
    console.log('✅ 字段注释已更新')

    // 验证修改结果
    console.log('\n[验证] 检查修改后的数据...')
    const [finalResults] = await queryInterface.sequelize.query(`
      SELECT payment_type, COUNT(*) as count
      FROM exchange_market_records
      GROUP BY payment_type;
    `)
    console.log('修改后 payment_type 分布:', finalResults)

    const [columnInfo] = await queryInterface.sequelize.query(`
      SHOW COLUMNS FROM exchange_market_records LIKE 'payment_type';
    `)
    console.log('payment_type 字段定义:', columnInfo[0])

    console.log('\n✅ 迁移执行成功：已删除 exchange_market_records.payment_type 中的 points 和 mixed 类型\n')
  },

  /**
   * 回滚迁移：恢复 points 和 mixed 支付类型
   *
   * 注意：回滚只恢复ENUM定义，不恢复数据原始值
   *
   * @param {QueryInterface} queryInterface - Sequelize查询接口
   * @param {Sequelize} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  down: async (queryInterface, Sequelize) => {
    console.log('\n[回滚] 开始执行：恢复 payment_type ENUM 定义')

    // 恢复 ENUM 定义（包含 points 和 mixed）
    console.log('\n[步骤1/2] 恢复 ENUM 定义')
    await queryInterface.sequelize.query(`
      ALTER TABLE exchange_market_records
      MODIFY COLUMN payment_type ENUM('virtual', 'points', 'mixed')
      NOT NULL
      DEFAULT 'virtual'
      COMMENT '支付方式：虚拟奖品/积分/混合';
    `)
    console.log('✅ ENUM 定义已恢复')

    // 恢复字段注释
    console.log('\n[步骤2/2] 恢复字段注释')
    await queryInterface.sequelize.query(`
      ALTER TABLE exchange_market_records
      MODIFY COLUMN virtual_value_paid INT
      NOT NULL
      DEFAULT 0
      COMMENT '消耗虚拟奖品价值';
    `)
    await queryInterface.sequelize.query(`
      ALTER TABLE exchange_market_records
      MODIFY COLUMN points_paid INT
      NOT NULL
      DEFAULT 0
      COMMENT '消耗积分';
    `)
    console.log('✅ 字段注释已恢复')

    console.log('\n⚠️  回滚完成')
    console.log('⚠️  注意：已转换为 virtual 的订单数据不会恢复为原始的 points 或 mixed 类型')
    console.log('⚠️  如需恢复原始数据，请从备份中恢复\n')
  }
}
