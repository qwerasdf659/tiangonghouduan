/**
 * 主键统一迁移 - exchange_records表
 * 修改内容：id → exchange_id
 *
 * 执行命令：
 * - 执行迁移：npm run db:migrate
 * - 回滚迁移：npm run db:migrate:undo
 *
 * 注意事项：
 * 1. 此脚本会在事务中执行，失败会自动回滚
 * 2. 迁移期间会保留id字段作为兼容
 * 3. 完成后会验证数据一致性
 */

'use strict'
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = {
  async up (queryInterface, Sequelize) {
    console.log('\n🚀 ========== 开始迁移 exchange_records 表主键 ==========')
    console.log('📝 迁移内容：id → exchange_id')
    console.log('⏰ 开始时间：', BeijingTimeHelper.nowLocale())

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========== 步骤1：添加新主键字段 ==========
      console.log('\n📌 步骤1/6：添加 exchange_id 字段...')

      await queryInterface.addColumn('exchange_records', 'exchange_id', {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        unique: true,
        comment: '兑换记录唯一ID（新主键）'
      }, { transaction })

      console.log('✅ exchange_id 字段添加成功')

      // ========== 步骤2：同步数据 ==========
      console.log('\n📌 步骤2/6：同步数据 (exchange_id = id)...')

      await queryInterface.sequelize.query(
        'UPDATE exchange_records SET exchange_id = id',
        { transaction }
      )

      console.log('✅ 数据同步完成')

      // ========== 步骤3：验证数据一致性 ==========
      console.log('\n📌 步骤3/6：验证数据一致性...')

      const [results] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM exchange_records WHERE exchange_id != id',
        { transaction }
      )

      if (results[0].count > 0) {
        throw new Error(`❌ 数据不一致：${results[0].count}条记录的 exchange_id != id`)
      }

      console.log('✅ 数据一致性验证通过（0条不一致记录）')

      // ========== 步骤4：移除旧主键约束 ==========
      console.log('\n📌 步骤4/6：移除旧主键约束...')

      await queryInterface.removeConstraint('exchange_records', 'PRIMARY', { transaction })

      console.log('✅ 旧主键约束已移除')

      // ========== 步骤5：设置新主键 ==========
      console.log('\n📌 步骤5/6：设置 exchange_id 为新主键...')

      await queryInterface.addConstraint('exchange_records', {
        fields: ['exchange_id'],
        type: 'primary key',
        name: 'PRIMARY'
      }, { transaction })

      console.log('✅ 新主键设置成功')

      // ========== 步骤6：将id字段改为普通字段 ==========
      console.log('\n📌 步骤6/6：将 id 字段转为普通字段（保留兼容）...')

      await queryInterface.changeColumn('exchange_records', 'id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '旧主键字段，保留兼容性（未来可删除）'
      }, { transaction })

      console.log('✅ id 字段已转为普通字段')

      // ========== 提交事务 ==========
      await transaction.commit()

      console.log('\n🎉 ========== exchange_records 表迁移成功！ ==========')
      console.log('⏰ 完成时间：', BeijingTimeHelper.nowLocale())
      console.log('📊 迁移结果：')
      console.log('   - 新主键：exchange_id')
      console.log('   - 旧字段：id（保留）')
      console.log('   - 数据一致性：100%')
    } catch (error) {
      // 回滚事务
      await transaction.rollback()

      console.error('\n❌ ========== 迁移失败，已自动回滚 ==========')
      console.error('错误信息：', error.message)
      console.error('错误堆栈：', error.stack)

      throw error
    }
  },

  async down (queryInterface, Sequelize) {
    console.log('\n🔄 ========== 开始回滚 exchange_records 表迁移 ==========')
    console.log('⏰ 开始时间：', BeijingTimeHelper.nowLocale())

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 步骤1：移除新主键约束
      console.log('\n📌 步骤1/3：移除新主键约束...')
      await queryInterface.removeConstraint('exchange_records', 'PRIMARY', { transaction })
      console.log('✅ 新主键约束已移除')

      // 步骤2：恢复id为主键
      console.log('\n📌 步骤2/3：恢复 id 为主键...')
      await queryInterface.changeColumn('exchange_records', 'id', {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '兑换记录唯一ID'
      }, { transaction })
      console.log('✅ id 字段已恢复为主键')

      // 步骤3：删除exchange_id字段
      console.log('\n📌 步骤3/3：删除 exchange_id 字段...')
      await queryInterface.removeColumn('exchange_records', 'exchange_id', { transaction })
      console.log('✅ exchange_id 字段已删除')

      await transaction.commit()

      console.log('\n✅ ========== 回滚成功 ==========')
      console.log('⏰ 完成时间：', BeijingTimeHelper.nowLocale())
    } catch (error) {
      await transaction.rollback()

      console.error('\n❌ ========== 回滚失败 ==========')
      console.error('错误信息：', error.message)

      throw error
    }
  }
}
