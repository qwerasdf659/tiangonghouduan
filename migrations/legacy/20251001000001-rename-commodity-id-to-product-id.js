/**
 * 数据库迁移：统一主键命名
 * 将 products.commodity_id 重命名为 products.product_id
 * 修复 exchange_records 表的外键依赖问题
 *
 * 创建时间：2025-10-01
 * 影响表：products, exchange_records
 * 影响数据：products表3条记录，exchange_records表0条记录
 */

module.exports = {
  /**
   * 执行迁移
   */
  async up (queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 开始数据库迁移：commodity_id → product_id')

      // ========== 第一步：删除exchange_records表的外键约束 ==========
      console.log('1️⃣ 删除exchange_records表的外键约束...')

      // 检查外键约束是否存在
      const [fkConstraints] = await queryInterface.sequelize.query(
        `
        SELECT CONSTRAINT_NAME 
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'exchange_records'
          AND COLUMN_NAME = 'product_id'
          AND REFERENCED_TABLE_NAME IS NOT NULL
      `,
        { transaction }
      )

      // 删除所有相关的外键约束
      for (const fk of fkConstraints) {
        await queryInterface.removeConstraint('exchange_records', fk.CONSTRAINT_NAME, {
          transaction
        })
        console.log(`   ✅ 已删除外键约束: ${fk.CONSTRAINT_NAME}`)
      }

      // ========== 第二步：删除product_id相关的索引 ==========
      console.log('2️⃣ 删除exchange_records.product_id相关索引...')

      const [indexes] = await queryInterface.sequelize.query(
        `
        SHOW INDEX FROM exchange_records WHERE Column_name = 'product_id'
      `,
        { transaction }
      )

      for (const idx of indexes) {
        if (idx.Key_name !== 'PRIMARY') {
          try {
            await queryInterface.removeIndex('exchange_records', idx.Key_name, { transaction })
            console.log(`   ✅ 已删除索引: ${idx.Key_name}`)
          } catch (err) {
            console.log(`   ⚠️ 索引${idx.Key_name}不存在或已删除`)
          }
        }
      }

      // ========== 第三步：重命名products表主键 ==========
      console.log('3️⃣ 重命名products表主键：commodity_id → product_id')

      await queryInterface.renameColumn('products', 'commodity_id', 'product_id', {
        transaction
      })
      console.log('   ✅ products.commodity_id 已重命名为 product_id')

      // ========== 第四步：重新创建exchange_records的外键约束 ==========
      console.log('4️⃣ 重新创建exchange_records的外键约束...')

      await queryInterface.addConstraint('exchange_records', {
        fields: ['product_id'],
        type: 'foreign key',
        name: 'fk_exchange_records_product_id',
        references: {
          table: 'products',
          field: 'product_id' // 现在引用正确的主键
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction
      })
      console.log('   ✅ 已创建新的外键约束: fk_exchange_records_product_id')

      // ========== 第五步：重新创建索引 ==========
      console.log('5️⃣ 重新创建exchange_records.product_id索引...')

      await queryInterface.addIndex('exchange_records', ['product_id'], {
        name: 'idx_exchange_records_product_id',
        transaction
      })
      console.log('   ✅ 已创建索引: idx_exchange_records_product_id')

      // ========== 第六步：验证迁移结果 ==========
      console.log('6️⃣ 验证迁移结果...')

      const [productsCols] = await queryInterface.sequelize.query(
        `
        SHOW COLUMNS FROM products WHERE Field = 'product_id'
      `,
        { transaction }
      )

      const [fkCheck] = await queryInterface.sequelize.query(
        `
        SELECT CONSTRAINT_NAME, REFERENCED_COLUMN_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'exchange_records'
          AND COLUMN_NAME = 'product_id'
          AND REFERENCED_TABLE_NAME = 'products'
      `,
        { transaction }
      )

      if (productsCols.length > 0 && fkCheck.length > 0) {
        console.log('   ✅ 验证通过：products.product_id存在')
        console.log(`   ✅ 验证通过：外键引用${fkCheck[0].REFERENCED_COLUMN_NAME}`)
      } else {
        throw new Error('迁移验证失败')
      }

      await transaction.commit()
      console.log('✅ 数据库迁移成功完成！')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 数据库迁移失败，已回滚:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移
   */
  async down (queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚迁移：product_id → commodity_id')

      // 1. 删除外键约束
      await queryInterface.removeConstraint('exchange_records', 'fk_exchange_records_product_id', {
        transaction
      })

      // 2. 删除索引
      await queryInterface.removeIndex('exchange_records', 'idx_exchange_records_product_id', {
        transaction
      })

      // 3. 重命名回commodity_id
      await queryInterface.renameColumn('products', 'product_id', 'commodity_id', {
        transaction
      })

      // 4. 重新创建原来的外键约束
      await queryInterface.addConstraint('exchange_records', {
        fields: ['product_id'],
        type: 'foreign key',
        name: 'fk_exchange_records_product_id',
        references: {
          table: 'products',
          field: 'commodity_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction
      })

      // 5. 重新创建索引
      await queryInterface.addIndex('exchange_records', ['product_id'], {
        name: 'idx_exchange_records_product_id',
        transaction
      })

      await transaction.commit()
      console.log('✅ 回滚成功')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
