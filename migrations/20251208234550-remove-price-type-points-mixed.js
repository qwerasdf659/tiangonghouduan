/**
 * 数据库迁移：删除 exchange_items 表 price_type 字段中的 points 和 mixed 类型
 *
 * 业务背景：
 * - 兑换市场统一为只支持虚拟奖品价值支付
 * - 废弃 points（积分支付）和 mixed（混合支付）方式
 * - 简化业务逻辑，保持一致性
 *
 * 迁移内容：
 * 1. 将所有 price_type='points' 和 'mixed' 的商品改为 'virtual'
 * 2. 修改 price_type 字段 ENUM 定义，只保留 'virtual'
 * 3. 删除 mixed_virtual_value 和 mixed_points 字段（已废弃）
 * 4. 更新字段注释说明
 *
 * 注意事项：
 * - 此迁移不可逆（回滚会恢复ENUM但数据已转换）
 * - 执行前请备份数据库
 * - 确保ExchangeMarketService.js已更新
 *
 * 创建时间：2025年12月08日
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
    console.log('\n[迁移] 开始执行：删除 price_type 中的 points 和 mixed 类型')

    // 第1步：检查当前数据库中的 price_type 分布
    console.log('\n[步骤1/5] 检查现有数据...')
    const [results] = await queryInterface.sequelize.query(`
      SELECT price_type, COUNT(*) as count
      FROM exchange_items
      GROUP BY price_type;
    `)
    console.log('当前 price_type 分布:', results)

    // 第2步：将所有 points 和 mixed 类型改为 virtual
    console.log('\n[步骤2/5] 更新现有数据: points/mixed -> virtual')
    const [updateResult] = await queryInterface.sequelize.query(`
      UPDATE exchange_items
      SET price_type = 'virtual'
      WHERE price_type IN ('points', 'mixed');
    `)
    console.log(`✅ 已更新 ${updateResult.affectedRows || 0} 条记录`)

    // 第3步：删除废弃的 mixed 支付相关字段
    console.log('\n[步骤3/5] 删除废弃字段: mixed_virtual_value, mixed_points')
    try {
      // 检查字段是否存在
      const [columns] = await queryInterface.sequelize.query(`
        SHOW COLUMNS FROM exchange_items
        WHERE Field IN ('mixed_virtual_value', 'mixed_points');
      `)

      if (columns.length > 0) {
        // 删除 mixed_virtual_value 字段
        if (columns.some(col => col.Field === 'mixed_virtual_value')) {
          await queryInterface.removeColumn('exchange_items', 'mixed_virtual_value')
          console.log('✅ 已删除字段: mixed_virtual_value')
        }

        // 删除 mixed_points 字段
        if (columns.some(col => col.Field === 'mixed_points')) {
          await queryInterface.removeColumn('exchange_items', 'mixed_points')
          console.log('✅ 已删除字段: mixed_points')
        }
      } else {
        console.log('⚠️  废弃字段不存在，跳过删除')
      }
    } catch (error) {
      console.warn('⚠️  删除废弃字段失败（可能已被删除）:', error.message)
    }

    // 第4步：修改 price_type ENUM 定义，只保留 'virtual'
    console.log('\n[步骤4/5] 修改 ENUM 定义: 只保留 virtual')
    await queryInterface.sequelize.query(`
      ALTER TABLE exchange_items
      MODIFY COLUMN price_type ENUM('virtual')
      NOT NULL
      DEFAULT 'virtual'
      COMMENT '支付方式（仅支持虚拟奖品价值支付）';
    `)
    console.log('✅ ENUM 定义已更新')

    // 第5步：更新字段注释
    console.log('\n[步骤5/5] 更新字段注释')
    await queryInterface.sequelize.query(`
      ALTER TABLE exchange_items
      MODIFY COLUMN virtual_value_price INT
      NOT NULL
      COMMENT '虚拟奖品价格（实际扣除的虚拟价值，必须字段）';
    `)
    await queryInterface.sequelize.query(`
      ALTER TABLE exchange_items
      MODIFY COLUMN points_price INT
      NULL
      COMMENT '积分价格（仅用于前端展示，不扣除用户显示积分）';
    `)
    console.log('✅ 字段注释已更新')

    // 验证修改结果
    console.log('\n[验证] 检查修改后的数据...')
    const [finalResults] = await queryInterface.sequelize.query(`
      SELECT price_type, COUNT(*) as count
      FROM exchange_items
      GROUP BY price_type;
    `)
    console.log('修改后 price_type 分布:', finalResults)

    const [columnInfo] = await queryInterface.sequelize.query(`
      SHOW COLUMNS FROM exchange_items LIKE 'price_type';
    `)
    console.log('price_type 字段定义:', columnInfo[0])

    console.log('\n✅ 迁移执行成功：已删除 price_type 中的 points 和 mixed 类型\n')
  },

  /**
   * 回滚迁移：恢复 points 和 mixed 支付类型
   *
   * 注意：回滚只恢复ENUM定义和字段，不恢复数据原始值
   *
   * @param {QueryInterface} queryInterface - Sequelize查询接口
   * @param {Sequelize} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  down: async (queryInterface, Sequelize) => {
    console.log('\n[回滚] 开始执行：恢复 price_type ENUM 定义')

    // 恢复 ENUM 定义（包含 points 和 mixed）
    console.log('\n[步骤1/3] 恢复 ENUM 定义')
    await queryInterface.sequelize.query(`
      ALTER TABLE exchange_items
      MODIFY COLUMN price_type ENUM('virtual', 'points', 'mixed')
      NOT NULL
      DEFAULT 'virtual'
      COMMENT '支付方式：虚拟奖品/积分/混合';
    `)
    console.log('✅ ENUM 定义已恢复')

    // 恢复 mixed 支付相关字段
    console.log('\n[步骤2/3] 恢复废弃字段')
    try {
      await queryInterface.addColumn('exchange_items', 'mixed_virtual_value', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '混合支付-虚拟奖品价值'
      })
      console.log('✅ 已恢复字段: mixed_virtual_value')

      await queryInterface.addColumn('exchange_items', 'mixed_points', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '混合支付-积分数量'
      })
      console.log('✅ 已恢复字段: mixed_points')
    } catch (error) {
      console.warn('⚠️  恢复字段失败（可能已存在）:', error.message)
    }

    // 恢复字段注释
    console.log('\n[步骤3/3] 恢复字段注释')
    await queryInterface.sequelize.query(`
      ALTER TABLE exchange_items
      MODIFY COLUMN virtual_value_price INT
      NULL
      COMMENT '虚拟奖品价格（价值积分）';
    `)
    await queryInterface.sequelize.query(`
      ALTER TABLE exchange_items
      MODIFY COLUMN points_price INT
      NULL
      COMMENT '积分价格';
    `)
    console.log('✅ 字段注释已恢复')

    console.log('\n⚠️  回滚完成')
    console.log('⚠️  注意：已转换为 virtual 的数据不会恢复为原始的 points 或 mixed 类型')
    console.log('⚠️  如需恢复原始数据，请从备份中恢复\n')
  }
}
