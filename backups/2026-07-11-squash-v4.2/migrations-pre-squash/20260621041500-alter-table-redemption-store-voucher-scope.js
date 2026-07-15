'use strict'

/**
 * 门店专属兑换券业务线 - 字段迁移（alter-table）
 *
 * 创建时间: 2026-06-21（docs/门店专属兑换券业务线设计与核销概况对接.md §10.3 定稿）
 * 创建原因:
 *   新增「门店专属兑换券」业务线，让小程序「本店核销概况」从根上成立。连真实库
 *   restaurant_points_dev 核查后确认：核销单 redemption_orders.item_id → items 实例，
 *   不直接认识兑换商品 SPU exchange_items，故核销范围必须在「生成核销码时」固化进
 *   redemption_orders 自身（与 expires_at 固化同模式），不回查 SPU。
 *
 * 变更说明（按 up 执行顺序，全部 describeTable 幂等判存在）：
 *   ① exchange_items（兑换商品 SPU，运营建券时配置范围）
 *      - applicable_scope ENUM('all','specified_stores','merchant_all') NOT NULL DEFAULT 'all'
 *        核销范围总开关；默认 all=通用券，存量 64 条商品零影响。
 *      - scoped_store_ids JSON NULL：specified_stores 时允许核销门店集合（如 [7,8,9]）。
 *      - merchant_id INT NULL：merchant_all（方案 M1）时商品归属商家，FK→merchants.merchant_id。
 *   ② redemption_orders（核销单，生成时固化范围 — 取数权威）
 *      - scoped_store_id_list JSON NULL：生成核销码时固化的允许门店集合；
 *        NULL=通用券任意门店可核。已有 fulfilled_store_id（核销落地门店）复用不变。
 *   ③ store_staff（店员查看授权）
 *      - can_view_redemption_stats TINYINT(1) NOT NULL DEFAULT 0：
 *        店员是否被授权查看本店核销概况；manager 恒可看不依赖此列。
 *
 * 存量兼容：所有新列均有默认值（all / NULL / 0），现有商品、1662 条核销单、
 *   5 条 store_staff 行为完全不变，业务线1（通用券）零影响。
 *
 * 索引：本次仅加字段不加索引（已核对三表现有索引，applicable_scope/scoped_* 暂无高频
 *   独立过滤需求，聚合查询走已有 idx_status_expires / idx_fulfilled_store；如后续看板出现
 *   慢查询再单独迁移加索引，避免预先优化）。
 *
 * 回滚(down): 逆序删除三表新增列（含 merchant_id 外键）。
 *
 * 全字段 snake_case；外键 DB 层强约束（ON DELETE SET NULL：商家删除不连带删商品）。
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      const exchangeItemsCols = await queryInterface.describeTable('exchange_items')
      const redemptionOrdersCols = await queryInterface.describeTable('redemption_orders')
      const storeStaffCols = await queryInterface.describeTable('store_staff')

      // ========== ① exchange_items ==========
      if (!exchangeItemsCols.applicable_scope) {
        await queryInterface.addColumn(
          'exchange_items',
          'applicable_scope',
          {
            type: Sequelize.ENUM('all', 'specified_stores', 'merchant_all'),
            allowNull: false,
            defaultValue: 'all',
            comment:
              '核销范围：all=通用任意门店核销 / specified_stores=限指定门店核销 / merchant_all=限商家全门店核销'
          },
          { transaction }
        )
      }

      if (!exchangeItemsCols.scoped_store_ids) {
        await queryInterface.addColumn(
          'exchange_items',
          'scoped_store_ids',
          {
            type: Sequelize.JSON,
            allowNull: true,
            comment: 'specified_stores 时允许核销的门店ID集合（如 [7,8,9]）；其它类型为 NULL'
          },
          { transaction }
        )
      }

      if (!exchangeItemsCols.merchant_id) {
        await queryInterface.addColumn(
          'exchange_items',
          'merchant_id',
          {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'merchants', key: 'merchant_id' },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
            comment: 'merchant_all 时商品归属商家（运营建券选），关联 merchants.merchant_id；其它类型可为 NULL'
          },
          { transaction }
        )
      }

      // ========== ② redemption_orders ==========
      if (!redemptionOrdersCols.scoped_store_id_list) {
        await queryInterface.addColumn(
          'redemption_orders',
          'scoped_store_id_list',
          {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '核销允许门店集合，生成核销码时从商品固化；NULL=通用券任意门店可核'
          },
          { transaction }
        )
      }

      // ========== ③ store_staff ==========
      if (!storeStaffCols.can_view_redemption_stats) {
        await queryInterface.addColumn(
          'store_staff',
          'can_view_redemption_stats',
          {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: '店员是否被授权查看本店核销概况（manager 恒可看不依赖此列）'
          },
          { transaction }
        )
      }

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      const exchangeItemsCols = await queryInterface.describeTable('exchange_items')
      const redemptionOrdersCols = await queryInterface.describeTable('redemption_orders')
      const storeStaffCols = await queryInterface.describeTable('store_staff')

      if (storeStaffCols.can_view_redemption_stats) {
        await queryInterface.removeColumn('store_staff', 'can_view_redemption_stats', { transaction })
      }
      if (redemptionOrdersCols.scoped_store_id_list) {
        await queryInterface.removeColumn('redemption_orders', 'scoped_store_id_list', { transaction })
      }
      if (exchangeItemsCols.merchant_id) {
        await queryInterface.removeColumn('exchange_items', 'merchant_id', { transaction })
      }
      if (exchangeItemsCols.scoped_store_ids) {
        await queryInterface.removeColumn('exchange_items', 'scoped_store_ids', { transaction })
      }
      if (exchangeItemsCols.applicable_scope) {
        await queryInterface.removeColumn('exchange_items', 'applicable_scope', { transaction })
      }

      await transaction.commit()

      // MySQL 下 ENUM 类型随列删除而移除；postgres 需显式 DROP TYPE 保持回滚完整性
      if (queryInterface.sequelize.getDialect() === 'postgres') {
        await queryInterface.sequelize.query(
          'DROP TYPE IF EXISTS "enum_exchange_items_applicable_scope"'
        )
      }
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
