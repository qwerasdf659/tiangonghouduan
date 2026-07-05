'use strict'

/**
 * 迁移②（供应商 + 系列）：供货维度主数据 + 产品系列连号
 *
 * 依据：docs/商品编码体系设计方案.md §3.8/§4.3/§4.5/§12/§15.7（文件②）
 * 创建时间：2026-07-06（北京时间）
 *
 * 新建表（严格按依赖序）：
 * 1. suppliers                 供货商主数据（区别于核销 merchants；supplier_name 唯一防重复建档，BIGINT 主键）
 * 2. product_series            产品系列（连号系列号，含 seq_pad 补零位数、next_seq 发号）
 * 3. exchange_item_suppliers   商品-供应商多对多关联（货号挂关联行，普通索引；(item,supplier) 唯一）
 * 补充：exchange_items.series_id 外键 → product_series（文件①已建列，此处 product_series 就绪后补 FK）
 *
 * 设计要点：
 * - suppliers 与 merchants 语义不同（供货 vs 核销结算），彻底分表，不复用。
 * - 货号 supplier_item_code 非唯一、允许重复、可空（供应商货号是"脏数据参考字段"），加普通索引加速辅助查询。
 * - purchase_price/quality_score 本次一并加列（S1 采购单启用时再维护，当前留空不参与逻辑）。
 *
 * 回滚(down)：删外键 → 删关联表 → 删 product_series → 删 suppliers。
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      // 1. suppliers 供货商主数据
      await queryInterface.createTable(
        'suppliers',
        {
          supplier_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '供应商主键'
          },
          supplier_name: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '供应商名称（唯一，防运营重复建档）'
          },
          contact_name: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '联系人'
          },
          contact_phone: {
            type: Sequelize.STRING(20),
            allowNull: true,
            comment: '联系电话'
          },
          status: {
            type: Sequelize.ENUM('active', 'inactive'),
            allowNull: false,
            defaultValue: 'active',
            comment: '状态：active 启用 / inactive 停用'
          },
          notes: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '备注'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（北京时间）'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间（北京时间）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '供货商主数据(区别于核销 merchants)'
        }
      )
      await queryInterface.addIndex('suppliers', ['supplier_name'], {
        name: 'uk_suppliers_name',
        unique: true,
        transaction
      })

      // 2. product_series 产品系列（连号系列号）
      await queryInterface.createTable(
        'product_series',
        {
          series_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '系列主键'
          },
          series_code: {
            type: Sequelize.STRING(20),
            allowNull: false,
            comment: '可读系列码(全大写,如 SLNB;运营手填+后端唯一校验)'
          },
          series_name: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '系列名称'
          },
          next_seq: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 1,
            comment: '系列内下一个序号(发号用,事务内行锁自增)'
          },
          seq_pad: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 3,
            comment: '序号展示补零位数(默认 3 → 001;超 999 的系列可单独调大)'
          },
          status: {
            type: Sequelize.ENUM('active', 'inactive'),
            allowNull: false,
            defaultValue: 'active',
            comment: '状态：active 启用 / inactive 停用'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（北京时间）'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间（北京时间）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '产品系列(连号系列号,与随机主码双轨制)'
        }
      )
      await queryInterface.addIndex('product_series', ['series_code'], {
        name: 'uk_series_code',
        unique: true,
        transaction
      })

      // 3. exchange_item_suppliers 商品-供应商多对多关联（货号挂关联行）
      await queryInterface.createTable(
        'exchange_item_suppliers',
        {
          id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '关联主键'
          },
          exchange_item_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '商品SPU(exchange_items.exchange_item_id)',
            references: { model: 'exchange_items', key: 'exchange_item_id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },
          supplier_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '供应商(suppliers.supplier_id)',
            references: { model: 'suppliers', key: 'supplier_id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },
          supplier_item_code: {
            type: Sequelize.STRING(100),
            allowNull: true,
            comment: '该供应商对此SPU的原始货号(可空可重复,仅采购对账参考)'
          },
          is_primary: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: '是否主供货商(展示/默认对账)'
          },
          purchase_price: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true,
            comment: '最近进货价(预留,S1采购单启用时维护)'
          },
          quality_score: {
            type: Sequelize.DECIMAL(3, 1),
            allowNull: true,
            comment: '供货质量评分(预留,0.0~10.0,S1采购评估用)'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（北京时间）'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '更新时间（北京时间）'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '商品-供应商多对多关联(货号挂关联行)'
        }
      )
      await queryInterface.addIndex('exchange_item_suppliers', ['exchange_item_id', 'supplier_id'], {
        name: 'uk_item_supplier',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('exchange_item_suppliers', ['supplier_id'], {
        name: 'idx_eis_supplier',
        transaction
      })
      await queryInterface.addIndex('exchange_item_suppliers', ['supplier_item_code'], {
        name: 'idx_eis_supplier_code',
        transaction
      })

      // 4. 补 exchange_items.series_id 外键（product_series 已就绪）
      await queryInterface.addConstraint('exchange_items', {
        fields: ['series_id'],
        type: 'foreign key',
        name: 'fk_exchange_items_series',
        references: { table: 'product_series', field: 'series_id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction
      })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.removeConstraint('exchange_items', 'fk_exchange_items_series', {
        transaction
      })
      await queryInterface.dropTable('exchange_item_suppliers', { transaction })
      await queryInterface.dropTable('product_series', { transaction })
      await queryInterface.dropTable('suppliers', { transaction })
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
