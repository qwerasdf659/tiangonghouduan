/**
 * 数据库一致性修复迁移
 * 解决表和模型定义不一致及主键字段不匹配问题
 * 创建时间：2025年01月28日
 */

module.exports = {
  up: async (queryInterface, _Sequelize) => {
    console.log('🔧 开始修复数据库一致性问题...')

    try {
      // 1. 修复 lottery_records 表主键问题
      console.log('🔧 修复 lottery_records 表主键定义...')

      // 检查表是否存在主键约束
      const [primaryKeyInfo] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME 
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
         WHERE TABLE_SCHEMA = '${queryInterface.sequelize.config.database}' 
         AND TABLE_NAME = 'lottery_records' 
         AND CONSTRAINT_NAME = 'PRIMARY'`
      )

      if (primaryKeyInfo.length === 0) {
        // 如果没有主键，添加主键约束
        await queryInterface.addConstraint('lottery_records', {
          fields: ['draw_id'],
          type: 'primary key',
          name: 'pk_lottery_records_draw_id'
        })
        console.log('✅ lottery_records 主键约束已添加')
      } else {
        console.log('✅ lottery_records 主键约束已存在')
      }

      // 2. 修复 exchange_records 与 products 的外键约束
      console.log('🔧 检查 exchange_records 外键约束...')

      const [foreignKeyInfo] = await queryInterface.sequelize.query(
        `SELECT CONSTRAINT_NAME 
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
         WHERE TABLE_SCHEMA = '${queryInterface.sequelize.config.database}' 
         AND TABLE_NAME = 'exchange_records' 
         AND COLUMN_NAME = 'product_id' 
         AND REFERENCED_TABLE_NAME = 'products'`
      )

      if (foreignKeyInfo.length === 0) {
        // 添加外键约束
        await queryInterface.addConstraint('exchange_records', {
          fields: ['product_id'],
          type: 'foreign key',
          name: 'fk_exchange_records_product_id',
          references: {
            table: 'products',
            field: 'commodity_id'
          },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        })
        console.log('✅ exchange_records 外键约束已添加')
      } else {
        console.log('✅ exchange_records 外键约束已存在')
      }

      // 3. 修复 lottery_records 与 prizes 的外键约束（如果prizes表存在）
      console.log('🔧 检查 lottery_records 与 prizes 的外键约束...')

      // 检查prizes表是否存在
      const [prizesTableExists] = await queryInterface.sequelize.query(
        `SELECT TABLE_NAME 
         FROM INFORMATION_SCHEMA.TABLES 
         WHERE TABLE_SCHEMA = '${queryInterface.sequelize.config.database}' 
         AND TABLE_NAME = 'prizes'`
      )

      if (prizesTableExists.length > 0) {
        const [lotteryForeignKeyInfo] = await queryInterface.sequelize.query(
          `SELECT CONSTRAINT_NAME 
           FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
           WHERE TABLE_SCHEMA = '${queryInterface.sequelize.config.database}' 
           AND TABLE_NAME = 'lottery_records' 
           AND COLUMN_NAME = 'prize_id' 
           AND REFERENCED_TABLE_NAME = 'prizes'`
        )

        if (lotteryForeignKeyInfo.length === 0) {
          // 添加外键约束
          await queryInterface.addConstraint('lottery_records', {
            fields: ['prize_id'],
            type: 'foreign key',
            name: 'fk_lottery_records_prize_id',
            references: {
              table: 'prizes',
              field: 'prize_id'
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE'
          })
          console.log('✅ lottery_records 与 prizes 外键约束已添加')
        } else {
          console.log('✅ lottery_records 与 prizes 外键约束已存在')
        }
      }

      // 4. 确保关键表的索引优化
      console.log('🔧 优化数据库索引...')

      // 为 lottery_records 添加复合索引（如果不存在）
      try {
        await queryInterface.addIndex('lottery_records', ['user_id', 'created_at'], {
          name: 'idx_lottery_records_user_time',
          unique: false
        })
        console.log('✅ lottery_records 用户时间复合索引已添加')
      } catch (error) {
        if (error.name === 'SequelizeDatabaseError' && error.message.includes('Duplicate key name')) {
          console.log('✅ lottery_records 用户时间复合索引已存在')
        } else {
          console.log('⚠️ lottery_records 索引添加失败:', error.message)
        }
      }

      // 为 exchange_records 添加状态索引（如果不存在）
      try {
        await queryInterface.addIndex('exchange_records', ['status', 'exchange_time'], {
          name: 'idx_exchange_records_status_time',
          unique: false
        })
        console.log('✅ exchange_records 状态时间索引已添加')
      } catch (error) {
        if (error.name === 'SequelizeDatabaseError' && error.message.includes('Duplicate key name')) {
          console.log('✅ exchange_records 状态时间索引已存在')
        } else {
          console.log('⚠️ exchange_records 索引添加失败:', error.message)
        }
      }

      console.log('🎉 数据库一致性修复完成！')
    } catch (error) {
      console.error('❌ 数据库一致性修复失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface, _Sequelize) => {
    console.log('🔄 回滚数据库一致性修复...')

    try {
      // 删除添加的索引
      await queryInterface.removeIndex('lottery_records', 'idx_lottery_records_user_time').catch(() => {})
      await queryInterface.removeIndex('exchange_records', 'idx_exchange_records_status_time').catch(() => {})

      // 删除添加的外键约束
      await queryInterface.removeConstraint('exchange_records', 'fk_exchange_records_product_id').catch(() => {})
      await queryInterface.removeConstraint('lottery_records', 'fk_lottery_records_prize_id').catch(() => {})

      // 注意：不删除主键约束，因为这可能会破坏数据完整性
      console.log('✅ 数据库一致性修复回滚完成')
    } catch (error) {
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
