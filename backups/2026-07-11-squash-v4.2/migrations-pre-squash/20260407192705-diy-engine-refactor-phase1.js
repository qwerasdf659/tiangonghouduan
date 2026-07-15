/**
 * DIY 饰品设计引擎 — 后端重构 Phase 1 迁移
 *
 * 修复内容：
 * 1. B6: diy_materials.price_asset_code 默认值从 'DIAMOND' 改为 'star_stone'
 * 2. DB1: 新建 user_addresses 表（收货地址管理）
 * 3. DB2: exchange_records 新增 address_snapshot JSON 列
 * 4. 清理 diy_works 脏测试数据（total_cost 含旧 DIAMOND 编码）
 *
 * @module migrations/20260407192705-diy-engine-refactor-phase1
 */

'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========== 1. 修复 diy_materials.price_asset_code 默认值 ==========
      await queryInterface.changeColumn(
        'diy_materials',
        'price_asset_code',
        {
          type: Sequelize.STRING(50),
          allowNull: false,
          defaultValue: 'star_stone',
          comment: '定价货币资产编码（默认 star_stone 星石）'
        },
        { transaction }
      )

      // 将已有数据中的 DIAMOND 更新为 star_stone（历史遗留）
      await queryInterface.sequelize.query(
        `UPDATE diy_materials SET price_asset_code = 'star_stone' WHERE price_asset_code = 'DIAMOND'`,
        { transaction }
      )

      // ========== 2. 新建 user_addresses 表 ==========
      // 先检查表是否已存在
      const [tables] = await queryInterface.sequelize.query(
        "SHOW TABLES LIKE 'user_addresses'",
        { transaction }
      )

      if (tables.length === 0) {
        await queryInterface.createTable(
          'user_addresses',
          {
            address_id: {
              type: Sequelize.BIGINT.UNSIGNED,
              primaryKey: true,
              autoIncrement: true,
              comment: '收货地址主键'
            },
            user_id: {
              type: Sequelize.INTEGER,
              allowNull: false,
              comment: '用户 ID（关联 users.user_id）',
              references: { model: 'users', key: 'user_id' },
              onDelete: 'CASCADE',
              onUpdate: 'CASCADE'
            },
            receiver_name: {
              type: Sequelize.STRING(50),
              allowNull: false,
              comment: '收件人姓名'
            },
            receiver_phone: {
              type: Sequelize.STRING(20),
              allowNull: false,
              comment: '收件人手机号'
            },
            province: {
              type: Sequelize.STRING(50),
              allowNull: false,
              comment: '省份'
            },
            city: {
              type: Sequelize.STRING(50),
              allowNull: false,
              comment: '城市'
            },
            district: {
              type: Sequelize.STRING(50),
              allowNull: false,
              defaultValue: '',
              comment: '区/县'
            },
            detail_address: {
              type: Sequelize.STRING(500),
              allowNull: false,
              comment: '详细地址'
            },
            postal_code: {
              type: Sequelize.STRING(10),
              allowNull: true,
              comment: '邮政编码'
            },
            is_default: {
              type: Sequelize.BOOLEAN,
              allowNull: false,
              defaultValue: false,
              comment: '是否默认地址'
            },
            created_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
              comment: '创建时间'
            },
            updated_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
              comment: '更新时间'
            }
          },
          {
            charset: 'utf8mb4',
            collate: 'utf8mb4_unicode_ci',
            comment: '用户收货地址表',
            transaction
          }
        )

        // 添加索引
        await queryInterface.addIndex('user_addresses', ['user_id'], {
          name: 'idx_user_addresses_user_id',
          transaction
        })
        await queryInterface.addIndex('user_addresses', ['user_id', 'is_default'], {
          name: 'idx_user_addresses_user_default',
          transaction
        })
      }

      // ========== 3. exchange_records 新增 address_snapshot 列 ==========
      const [addrCols] = await queryInterface.sequelize.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exchange_records' AND COLUMN_NAME = 'address_snapshot'",
        { transaction }
      )

      if (addrCols.length === 0) {
        await queryInterface.addColumn(
          'exchange_records',
          'address_snapshot',
          {
            type: Sequelize.JSON,
            allowNull: true,
            defaultValue: null,
            comment: '下单时收货地址快照（JSON：receiver_name, receiver_phone, province, city, district, detail_address）',
            after: 'status'
          },
          { transaction }
        )
      }

      // ========== 4. 清理 diy_works 脏测试数据 ==========
      // 将 total_cost 中含 DIAMOND 编码的旧数据清空（这些是无效的测试数据）
      await queryInterface.sequelize.query(
        `UPDATE diy_works SET total_cost = '[]' WHERE total_cost LIKE '%DIAMOND%'`,
        { transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 回滚 address_snapshot 列
      const [addrCols] = await queryInterface.sequelize.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exchange_records' AND COLUMN_NAME = 'address_snapshot'",
        { transaction }
      )
      if (addrCols.length > 0) {
        await queryInterface.removeColumn('exchange_records', 'address_snapshot', { transaction })
      }

      // 回滚 user_addresses 表
      const [tables] = await queryInterface.sequelize.query(
        "SHOW TABLES LIKE 'user_addresses'",
        { transaction }
      )
      if (tables.length > 0) {
        await queryInterface.dropTable('user_addresses', { transaction })
      }

      // 回滚 price_asset_code 默认值
      await queryInterface.changeColumn(
        'diy_materials',
        'price_asset_code',
        {
          type: Sequelize.STRING(50),
          allowNull: false,
          defaultValue: 'DIAMOND',
          comment: '定价货币资产编码'
        },
        { transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
