/**
 * 餐厅积分抽奖系统 V4.0 - 数据库迁移
 *
 * 迁移名称：为 exchange_market_records 表添加缺失字段
 * 迁移类型：alter-table（修改表结构）
 * 版本号：v4.4.0
 * 创建时间：2025-12-12
 *
 * 变更说明：
 * 1. 添加 business_id 字段（用于幂等性控制，防止重复提交）
 * 2. 添加 item_snapshot 字段（商品快照，记录兑换时的商品信息）
 * 3. 添加 quantity 字段（兑换数量）
 * 4. 添加 total_cost 字段（总成本，管理员可见）
 * 5. 添加 admin_remark 字段（管理员备注）
 * 6. 添加 exchange_time 字段（兑换时间，记录实际兑换时刻）
 * 7. 创建 business_id 唯一索引以优化幂等性查询性能
 *
 * 业务场景：
 * - 幂等性保护：通过 business_id 防止用户重复点击导致的重复扣款/扣奖品
 * - 审计追溯：通过 item_snapshot 记录兑换时的商品信息（价格、库存等）
 * - 数据完整性：记录完整的兑换信息（数量、成本、备注等）
 *
 * 依赖关系：
 * - 依赖 exchange_market_records 表已存在
 *
 * 影响范围：
 * - 修改表 exchange_market_records，添加6个字段
 * - 创建 business_id 唯一索引
 * - 不影响现有数据
 */

'use strict'

module.exports = {
  /**
   * 执行迁移（up方向）
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize实例
   * @returns {Promise<void>} Promise对象
   */
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始为 exchange_market_records 表添加缺失字段...')

      /*
       * ========================================
       * 第1步：检查表是否存在
       * ========================================
       */
      const tableExists = await queryInterface.tableExists('exchange_market_records', { transaction })
      if (!tableExists) {
        throw new Error('表 exchange_market_records 不存在，请先创建该表')
      }

      /*
       * ========================================
       * 第2步：检查字段是否已存在（避免重复添加）
       * ========================================
       */
      const [existingColumns] = await queryInterface.sequelize.query(
        'SHOW COLUMNS FROM exchange_market_records',
        { transaction }
      )

      const existingColumnNames = existingColumns.map(col => col.Field)
      console.log('现有字段:', existingColumnNames.join(', '))

      /*
       * ========================================
       * 第3步：添加 business_id 字段（幂等性控制核心字段）
       * ========================================
       */
      if (!existingColumnNames.includes('business_id')) {
        console.log('1. 添加 business_id 字段...')
        await queryInterface.addColumn(
          'exchange_market_records',
          'business_id',
          {
            type: Sequelize.STRING(100),
            allowNull: true, // 允许为空，兼容历史数据
            comment: '业务唯一标识（用于幂等性控制，防止重复提交）',
            after: 'order_no' // 在 order_no 字段后面
          },
          { transaction }
        )
        console.log('   ✓ business_id 字段添加成功')
      } else {
        console.log('1. business_id 字段已存在，跳过')
      }

      /*
       * ========================================
       * 第4步：添加 item_snapshot 字段（商品快照）
       * ========================================
       */
      if (!existingColumnNames.includes('item_snapshot')) {
        console.log('2. 添加 item_snapshot 字段...')
        await queryInterface.addColumn(
          'exchange_market_records',
          'item_snapshot',
          {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '商品快照（记录兑换时的商品信息：名称、价格、描述等）',
            after: 'item_id'
          },
          { transaction }
        )
        console.log('   ✓ item_snapshot 字段添加成功')
      } else {
        console.log('2. item_snapshot 字段已存在，跳过')
      }

      /*
       * ========================================
       * 第5步：添加 quantity 字段（兑换数量）
       * ========================================
       */
      if (!existingColumnNames.includes('quantity')) {
        console.log('3. 添加 quantity 字段...')
        await queryInterface.addColumn(
          'exchange_market_records',
          'quantity',
          {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 1,
            comment: '兑换数量（默认为1）',
            after: 'item_snapshot'
          },
          { transaction }
        )
        console.log('   ✓ quantity 字段添加成功')
      } else {
        console.log('3. quantity 字段已存在，跳过')
      }

      /*
       * ========================================
       * 第6步：添加 total_cost 字段（总成本）
       * ========================================
       */
      if (!existingColumnNames.includes('total_cost')) {
        console.log('4. 添加 total_cost 字段...')
        await queryInterface.addColumn(
          'exchange_market_records',
          'total_cost',
          {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true,
            comment: '总成本（管理员可见，= cost_price * quantity）',
            after: 'points_paid'
          },
          { transaction }
        )
        console.log('   ✓ total_cost 字段添加成功')
      } else {
        console.log('4. total_cost 字段已存在，跳过')
      }

      /*
       * ========================================
       * 第7步：添加 admin_remark 字段（管理员备注）
       * ========================================
       */
      if (!existingColumnNames.includes('admin_remark')) {
        console.log('5. 添加 admin_remark 字段...')
        await queryInterface.addColumn(
          'exchange_market_records',
          'admin_remark',
          {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '管理员备注（管理员操作订单时的备注信息）',
            after: 'status'
          },
          { transaction }
        )
        console.log('   ✓ admin_remark 字段添加成功')
      } else {
        console.log('5. admin_remark 字段已存在，跳过')
      }

      /*
       * ========================================
       * 第8步：添加 exchange_time 字段（兑换时间）
       * ========================================
       */
      if (!existingColumnNames.includes('exchange_time')) {
        console.log('6. 添加 exchange_time 字段...')
        await queryInterface.addColumn(
          'exchange_market_records',
          'exchange_time',
          {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '兑换时间（记录实际兑换时刻，北京时间）',
            after: 'admin_remark'
          },
          { transaction }
        )
        console.log('   ✓ exchange_time 字段添加成功')
      } else {
        console.log('6. exchange_time 字段已存在，跳过')
      }

      /*
       * ========================================
       * 第9步：检查并创建 business_id 唯一索引
       * ========================================
       */
      console.log('7. 创建 business_id 唯一索引...')

      // 检查索引是否已存在
      const [existingIndexes] = await queryInterface.sequelize.query(
        'SHOW INDEX FROM exchange_market_records WHERE Key_name = \'idx_business_id_unique\'',
        { transaction }
      )

      if (existingIndexes.length === 0 && !existingColumnNames.includes('business_id')) {
        // 只有当 business_id 字段存在且索引不存在时才创建索引
        await queryInterface.addIndex(
          'exchange_market_records',
          ['business_id'],
          {
            name: 'idx_business_id_unique',
            unique: true,
            transaction
          }
        )
        console.log('   ✓ business_id 唯一索引创建成功')
      } else if (existingIndexes.length > 0) {
        console.log('   ✓ business_id 唯一索引已存在，跳过')
      } else {
        console.log('   ✓ business_id 字段不存在，跳过索引创建')
      }

      // 提交事务
      await transaction.commit()
      console.log('✅ 迁移执行成功：exchange_market_records 表字段添加完成')
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      console.error('❌ 迁移执行失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移（down方向）
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize实例
   * @returns {Promise<void>} Promise对象
   */
  async down (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始回滚 exchange_market_records 表字段添加...')

      /*
       * ========================================
       * 第1步：删除 business_id 唯一索引
       * ========================================
       */
      console.log('1. 删除 business_id 唯一索引...')
      try {
        await queryInterface.removeIndex(
          'exchange_market_records',
          'idx_business_id_unique',
          { transaction }
        )
        console.log('   ✓ business_id 唯一索引删除成功')
      } catch (error) {
        console.log('   ✓ business_id 唯一索引不存在，跳过')
      }

      /*
       * ========================================
       * 第2步：删除字段（按添加顺序的逆序删除）
       * ========================================
       */
      const fieldsToRemove = [
        'exchange_time',
        'admin_remark',
        'total_cost',
        'quantity',
        'item_snapshot',
        'business_id'
      ]

      for (const field of fieldsToRemove) {
        try {
          console.log(`2. 删除 ${field} 字段...`)
          await queryInterface.removeColumn('exchange_market_records', field, { transaction })
          console.log(`   ✓ ${field} 字段删除成功`)
        } catch (error) {
          console.log(`   ✓ ${field} 字段不存在，跳过`)
        }
      }

      // 提交事务
      await transaction.commit()
      console.log('✅ 回滚执行成功：exchange_market_records 表字段已删除')
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      console.error('❌ 回滚执行失败:', error.message)
      throw error
    }
  }
}
