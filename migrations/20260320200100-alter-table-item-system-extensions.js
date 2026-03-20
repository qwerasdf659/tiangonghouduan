'use strict'

/**
 * 物品系统字段扩展 — 打通兑换商城与物品系统
 *
 * 修改 4 张表：
 *   items          — 新增 item_template_id / instance_attributes / serial_number / edition_total
 *   item_templates — 新增 max_edition
 *   exchange_records — 新增 item_id / product_id / sku_id（FK 扩展）
 *   item_holds     — hold_type ENUM 新增 trade_cooldown
 *
 * 依据文档：第十八章 Phase 1 迁移文件 3/3
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ═══════════════════════════════════════
      // items 表扩展
      // ═══════════════════════════════════════

      await queryInterface.addColumn('items', 'item_template_id', {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'item_templates', key: 'item_template_id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: '关联物品模板（所有来源统一用此字段标识"这个物品是什么"）'
      }, { transaction })

      await queryInterface.addColumn('items', 'instance_attributes', {
        type: Sequelize.JSON,
        allowNull: true,
        comment: '实例独有属性 {"quality_score":87.42,"quality_grade":"精良","pattern_id":337,"颜色":"冰蓝"}'
      }, { transaction })

      await queryInterface.addColumn('items', 'serial_number', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '限量编号（按ItemTemplate计数，如42表示第42件）'
      }, { transaction })

      await queryInterface.addColumn('items', 'edition_total', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '限量总数快照（铸造时从模板复制，如100）'
      }, { transaction })

      await queryInterface.addIndex('items', ['item_template_id'], {
        name: 'idx_items_item_template',
        transaction
      })

      await queryInterface.addIndex('items', ['item_template_id', 'serial_number'], {
        name: 'idx_items_template_serial',
        transaction
      })

      // ═══════════════════════════════════════
      // item_templates 表扩展
      // ═══════════════════════════════════════

      await queryInterface.addColumn('item_templates', 'max_edition', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '限量总数上限（运营设置，超过后拒绝铸造）'
      }, { transaction })

      // ═══════════════════════════════════════
      // exchange_records 表扩展
      // ═══════════════════════════════════════

      await queryInterface.addColumn('exchange_records', 'item_id', {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'items', key: 'item_id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: '本次兑换产出的物品实例（NULL=纯实物兑换无实例）'
      }, { transaction })

      await queryInterface.addColumn('exchange_records', 'product_id', {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'products', key: 'product_id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: '关联统一商品SPU（新商品中心）'
      }, { transaction })

      await queryInterface.addColumn('exchange_records', 'sku_id', {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'product_skus', key: 'sku_id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: '关联统一SKU（新商品中心）'
      }, { transaction })

      await queryInterface.addIndex('exchange_records', ['item_id'], {
        name: 'idx_exchange_records_item',
        transaction
      })

      await queryInterface.addIndex('exchange_records', ['product_id', 'sku_id'], {
        name: 'idx_exchange_records_product_sku',
        transaction
      })

      // ═══════════════════════════════════════
      // item_holds 表 — hold_type ENUM 扩展
      // MySQL ALTER ENUM 需要重新定义完整值列表
      // ═══════════════════════════════════════

      await queryInterface.changeColumn('item_holds', 'hold_type', {
        type: Sequelize.ENUM('trade', 'redemption', 'security', 'trade_cooldown'),
        allowNull: false,
        comment: '锁定类型：trade=交易锁 redemption=核销锁 security=安全锁 trade_cooldown=交易冷却期'
      }, { transaction })

      await transaction.commit()
      console.log('✅ 物品系统字段扩展完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.changeColumn('item_holds', 'hold_type', {
        type: Sequelize.ENUM('trade', 'redemption', 'security'),
        allowNull: false
      }, { transaction })

      await queryInterface.removeColumn('exchange_records', 'sku_id', { transaction })
      await queryInterface.removeColumn('exchange_records', 'product_id', { transaction })
      await queryInterface.removeColumn('exchange_records', 'item_id', { transaction })
      await queryInterface.removeColumn('item_templates', 'max_edition', { transaction })
      await queryInterface.removeColumn('items', 'edition_total', { transaction })
      await queryInterface.removeColumn('items', 'serial_number', { transaction })
      await queryInterface.removeColumn('items', 'instance_attributes', { transaction })
      await queryInterface.removeColumn('items', 'item_template_id', { transaction })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
