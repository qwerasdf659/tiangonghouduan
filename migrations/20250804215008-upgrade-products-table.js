'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    console.log('🔄 开始升级Products表结构...')

    try {
      // 1. 添加缺失的字段
      console.log('📋 添加缺失字段...')

      // 添加view_count字段
      await queryInterface.addColumn('products', 'view_count', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '浏览次数统计'
      })

      // 添加warranty字段
      await queryInterface.addColumn('products', 'warranty', {
        type: Sequelize.STRING(200),
        allowNull: true,
        comment: '售后说明信息'
      })

      // 添加delivery_info字段
      await queryInterface.addColumn('products', 'delivery_info', {
        type: Sequelize.STRING(200),
        allowNull: true,
        comment: '配送信息'
      })

      // 添加expires_at字段
      await queryInterface.addColumn('products', 'expires_at', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '商品过期时间'
      })

      // 添加created_by字段
      await queryInterface.addColumn('products', 'created_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '创建者用户ID'
      })

      // 添加updated_by字段
      await queryInterface.addColumn('products', 'updated_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '最后更新者用户ID'
      })

      console.log('✅ 新字段添加完成')

      // 2. 修改字段类型
      console.log('🔄 修改字段类型...')

      // 修改name字段长度：varchar(100) -> varchar(200)
      await queryInterface.changeColumn('products', 'name', {
        type: Sequelize.STRING(200),
        allowNull: false,
        comment: '商品名称'
      })

      console.log('✅ 字段类型修改完成')

      // 3. 处理状态枚举更新（需要特殊处理）
      console.log('🔄 更新状态枚举...')

      // 首先将现有的sold_out状态改为offline
      await queryInterface.sequelize.query(
        'UPDATE products SET status = \'offline\' WHERE status = \'sold_out\''
      )

      // 将inactive状态改为offline
      await queryInterface.sequelize.query(
        'UPDATE products SET status = \'offline\' WHERE status = \'inactive\''
      )

      // 修改枚举类型
      await queryInterface.changeColumn('products', 'status', {
        type: Sequelize.ENUM('active', 'offline', 'deleted'),
        allowNull: false,
        defaultValue: 'active',
        comment: '商品状态'
      })

      console.log('✅ 状态枚举更新完成')

      // 4. 添加新的索引
      console.log('🔄 添加新索引...')

      await queryInterface.addIndex('products', ['space', 'status'], {
        name: 'idx_products_space_status'
      })

      await queryInterface.addIndex('products', ['is_new', 'is_hot'], {
        name: 'idx_products_is_new_hot'
      })

      await queryInterface.addIndex('products', ['created_at'], {
        name: 'idx_products_created_at'
      })

      console.log('✅ Products表升级完成！')
    } catch (error) {
      console.error('❌ Products表升级失败:', error.message)
      throw error
    }
  },

  async down (queryInterface, Sequelize) {
    console.log('🔄 回滚Products表结构...')

    try {
      // 移除添加的索引
      await queryInterface.removeIndex('products', 'idx_products_space_status')
      await queryInterface.removeIndex('products', 'idx_products_is_new_hot')
      await queryInterface.removeIndex('products', 'idx_products_created_at')

      // 恢复状态枚举
      await queryInterface.changeColumn('products', 'status', {
        type: Sequelize.ENUM('active', 'inactive', 'sold_out'),
        allowNull: false,
        defaultValue: 'active',
        comment: '商品状态'
      })

      // 恢复name字段长度
      await queryInterface.changeColumn('products', 'name', {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: '商品名称'
      })

      // 移除添加的字段
      await queryInterface.removeColumn('products', 'view_count')
      await queryInterface.removeColumn('products', 'warranty')
      await queryInterface.removeColumn('products', 'delivery_info')
      await queryInterface.removeColumn('products', 'expires_at')
      await queryInterface.removeColumn('products', 'created_by')
      await queryInterface.removeColumn('products', 'updated_by')

      console.log('✅ Products表回滚完成')
    } catch (error) {
      console.error('❌ Products表回滚失败:', error.message)
      throw error
    }
  }
}
