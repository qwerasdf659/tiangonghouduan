'use strict'

/**
 * DROP 死锁测试遗留临时表 deadlock_test_1781393835778（上线前清理 2026-06-22）
 *
 * 业务背景（详见 docs/上线前测试数据清理盘点与执行方案.md §19.4.1 ⑧、§23.1 拍板项5）：
 * - 该表是测试期死锁压测脚本动态建的临时表（表名含时间戳），非业务表、无任何外键引用；
 * - 真实库实测仅 5 行测试数据，无任何模型/服务/路由引用；
 * - 上线前按"垃圾表直接 DROP"处理，DDL 走 sequelize-cli 迁移（不走清档 DML 逻辑）。
 *
 * 数据现状（连真实库 restaurant_points_dev 核实）：
 * - 5 行测试数据，AUTO_INCREMENT=6，无外键引用本表（KEY_COLUMN_USAGE 确认）；
 * - 对线上零影响（无任何代码引用该表名）。
 *
 * down 提供完整回滚（按真实库 SHOW CREATE TABLE 原样重建结构，但不恢复历史测试数据）。
 */

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()

    try {
      // 防御性校验：确认这是预期的垃圾表（含时间戳后缀、结构为 deadlock 压测表）
      const [tables] = await sequelize.query(
        "SELECT table_name FROM information_schema.tables " +
          "WHERE table_schema = DATABASE() AND table_name = 'deadlock_test_1781393835778'",
        { transaction }
      )

      if (tables.length === 0) {
        // 表已不存在（幂等：可能已手动删除），直接放行
        await transaction.commit()
        return
      }

      await queryInterface.dropTable('deadlock_test_1781393835778', { transaction })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()

    try {
      // 完整回滚：按真实库原结构重建表（不恢复历史测试数据）
      await queryInterface.createTable(
        'deadlock_test_1781393835778',
        {
          id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false
          },
          account_id: {
            type: Sequelize.STRING(50),
            allowNull: false,
            unique: true
          },
          balance: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0
          },
          version: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 1
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '死锁压测遗留临时表（回滚重建结构，已于 2026-06-22 上线前 DROP）'
        }
      )

      await queryInterface.addIndex('deadlock_test_1781393835778', ['account_id'], {
        name: 'idx_account',
        transaction
      })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
