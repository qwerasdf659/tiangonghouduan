'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // 添加交易市场相关字段到user_inventory表
    await queryInterface.addColumn('user_inventory', 'market_status', {
      type: Sequelize.ENUM('on_sale', 'sold', 'withdrawn'),
      allowNull: true,
      comment: '市场状态：在售/已售/已撤回'
    })

    await queryInterface.addColumn('user_inventory', 'selling_points', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: '出售价格（积分）'
    })

    await queryInterface.addColumn('user_inventory', 'condition', {
      type: Sequelize.ENUM('new', 'excellent', 'good', 'fair', 'poor'),
      allowNull: true,
      defaultValue: 'good',
      comment: '物品成色：全新/优秀/良好/一般/较差'
    })

    await queryInterface.addColumn('user_inventory', 'transfer_count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '转让次数'
    })

    await queryInterface.addColumn('user_inventory', 'acquisition_method', {
      type: Sequelize.STRING(50),
      allowNull: true,
      comment: '获得方式：lottery/exchange/transfer/admin等'
    })

    await queryInterface.addColumn('user_inventory', 'acquisition_cost', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: '获得成本（积分）'
    })

    await queryInterface.addColumn('user_inventory', 'can_transfer', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: '是否可转让'
    })

    await queryInterface.addColumn('user_inventory', 'can_use', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: '是否可使用'
    })

    // 添加新的字段到现有模式
    await queryInterface.addColumn('user_inventory', 'item_name', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: '物品名称（兼容新字段）'
    })

    await queryInterface.addColumn('user_inventory', 'item_type', {
      type: Sequelize.STRING(50),
      allowNull: true,
      comment: '物品类型（兼容新字段）'
    })

    await queryInterface.addColumn('user_inventory', 'is_available', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: '是否可用'
    })

    // 为查询性能添加索引
    await queryInterface.addIndex('user_inventory', ['market_status'], {
      name: 'idx_user_inventory_market_status'
    })

    await queryInterface.addIndex('user_inventory', ['user_id', 'market_status'], {
      name: 'idx_user_inventory_user_market'
    })

    await queryInterface.addIndex('user_inventory', ['selling_points'], {
      name: 'idx_user_inventory_selling_points'
    })
  },

  async down (queryInterface, _Sequelize) {
    // 删除索引
    await queryInterface.removeIndex('user_inventory', 'idx_user_inventory_market_status')
    await queryInterface.removeIndex('user_inventory', 'idx_user_inventory_user_market')
    await queryInterface.removeIndex('user_inventory', 'idx_user_inventory_selling_points')

    // 删除添加的字段
    await queryInterface.removeColumn('user_inventory', 'market_status')
    await queryInterface.removeColumn('user_inventory', 'selling_points')
    await queryInterface.removeColumn('user_inventory', 'condition')
    await queryInterface.removeColumn('user_inventory', 'transfer_count')
    await queryInterface.removeColumn('user_inventory', 'acquisition_method')
    await queryInterface.removeColumn('user_inventory', 'acquisition_cost')
    await queryInterface.removeColumn('user_inventory', 'can_transfer')
    await queryInterface.removeColumn('user_inventory', 'can_use')
    await queryInterface.removeColumn('user_inventory', 'item_name')
    await queryInterface.removeColumn('user_inventory', 'item_type')
    await queryInterface.removeColumn('user_inventory', 'is_available')
  }
}
