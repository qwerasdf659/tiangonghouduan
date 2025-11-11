'use strict'

/**
 * 核销验证码API修复 - 添加operator_id字段
 *
 * 业务背景（Business Context）:
 * - 核销操作需要追溯是哪个商户或管理员执行的
 * - 用于商户绩效统计、财务结算追溯、异常核销追责
 * - P0严重问题修复：无operator_id导致财务纠纷无法举证
 *
 * 技术实现（Technical Implementation）:
 * - 添加operator_id字段：INT类型，允许NULL（历史数据兼容）
 * - 添加索引：支持按操作人查询核销记录（商户统计需求）
 * - 添加外键：关联users表，保证数据完整性
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up (queryInterface, Sequelize) {
    // 1. 添加operator_id字段到user_inventory表
    await queryInterface.addColumn('user_inventory', 'operator_id', {
      type: Sequelize.INTEGER,
      allowNull: true, // 允许NULL：历史核销记录无操作人ID
      comment: '核销操作人ID（Operator ID - 商户或管理员用户ID）\n' +
               '业务规则（Business Rules）：\n' +
               '- 核销时记录req.user.user_id（执行核销的用户ID）\n' +
               '- 未核销时为NULL（status=available/pending）\n' +
               '- 历史核销记录为NULL（迁移前已核销的数据）\n' +
               '用途（Usage）：\n' +
               '- 商户绩效统计：按operator_id统计各商户核销量\n' +
               '- 财务结算追溯：查询某商户的核销记录进行对账\n' +
               '- 异常核销追责：追踪异常核销行为的操作人\n' +
               '- 用户行为分析：分析不同商户的核销模式',
      after: 'used_at' // 放在used_at字段后面（逻辑相关字段聚集）
    })

    // 2. 添加索引：支持按操作人查询核销记录
    await queryInterface.addIndex('user_inventory', ['operator_id'], {
      name: 'idx_operator_id',
      comment: '核销操作人索引（Operator Index）\n' +
               '查询场景（Query Scenarios）：\n' +
               '- 商户绩效：SELECT COUNT(*) WHERE operator_id=? AND status=used\n' +
               '- 商户排行：GROUP BY operator_id ORDER BY COUNT(*) DESC\n' +
               '- 追溯核销：WHERE operator_id=? AND used_at BETWEEN ? AND ?\n' +
               '性能（Performance）：\n' +
               '- B-Tree索引，O(log n)查询复杂度\n' +
               '- 预期数据量<5000条，查询时间<50ms'
    })

    // 3. 添加外键约束：关联users表
    await queryInterface.addConstraint('user_inventory', {
      fields: ['operator_id'],
      type: 'foreign key',
      name: 'fk_user_inventory_operator',
      references: {
        table: 'users', // 引用users表
        field: 'user_id' // 引用user_id字段
      },
      onDelete: 'SET NULL', // 操作人账号被删除时，设置operator_id为NULL（保留核销记录）
      onUpdate: 'CASCADE' // 操作人user_id更新时，级联更新operator_id
    })

    console.log('✅ operator_id字段、索引、外键添加成功')
  },

  async down (queryInterface, Sequelize) {
    // 回滚操作：按照添加的逆序删除

    // 1. 删除外键约束
    await queryInterface.removeConstraint('user_inventory', 'fk_user_inventory_operator')

    // 2. 删除索引
    await queryInterface.removeIndex('user_inventory', 'idx_operator_id')

    // 3. 删除operator_id字段
    await queryInterface.removeColumn('user_inventory', 'operator_id')

    console.log('✅ operator_id字段、索引、外键已回滚删除')
  }
}
