'use strict'

/**
 * 迁移③（S1–S5 前瞻场景）：一次性建空表结构 + 完整外键 + items 防伪预留列
 *
 * 依据：docs/商品编码体系设计方案.md §4.4/§13/§14/§15.7（文件③）
 * 创建时间：2026-07-06（北京时间）
 *
 * 拍板：S1–S5 所有新表本次一次性建出（结构 + 完整外键），仅建表不写业务逻辑；
 *       业务 Service/接口/前端按 §13.7 顺序后续独立迭代。外键一次建全，免将来补 FK 迁移。
 *
 * 建表顺序（严格按 §14.6 依赖序，避免引用未建表）：
 * 1. product_batches（S2 批次）→ 供 items.batch_id 外键引用
 * 2. ALTER items 加防伪 5 列（nfc_uid/anti_fake_code/verify_count/first_verified_at）+ batch_id + FK + 索引
 * 3. purchase_orders → purchase_order_items（S1 采购）
 * 4. product_bundles → product_bundle_items（S4 组合）
 * 5. external_channel_mappings（S5 第三方分销）
 * 6. consignment_orders（S3 二手寄卖；转赠复用 item_ledger，不单独建表）
 *
 * 所有 FK 列类型对齐目标 BIGINT 主键；统一 utf8mb4_unicode_ci、北京时间时间戳。
 *
 * 回滚(down)：反序删表 + 删 items 防伪列。
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      // ============ 1. S2 批次 product_batches（先建，供 items.batch_id 外键引用） ============
      await queryInterface.createTable(
        'product_batches',
        {
          batch_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '批次主键'
          },
          batch_code: {
            type: Sequelize.STRING(32),
            allowNull: false,
            comment: '批次码(可读,前缀+日期+序号风格,运营可读)'
          },
          exchange_item_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '关联SPU(可空,批次可跨SKU)',
            references: { model: 'exchange_items', key: 'exchange_item_id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          sku_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '关联SKU(可空)',
            references: { model: 'exchange_item_skus', key: 'sku_id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          supplier_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '进货来源供应商',
            references: { model: 'suppliers', key: 'supplier_id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          batch_cost: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true,
            comment: '批次成本(进货价)'
          },
          quantity: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '批次数量'
          },
          produced_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '生产/入库日期（北京时间）'
          },
          status: {
            type: Sequelize.ENUM('active', 'inactive'),
            allowNull: false,
            defaultValue: 'active',
            comment: '状态'
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
          comment: '产品批次(一批一码;批次与系列号正交)'
        }
      )
      await queryInterface.addIndex('product_batches', ['batch_code'], {
        name: 'uk_product_batches_code',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('product_batches', ['exchange_item_id'], {
        name: 'idx_pb_item',
        transaction
      })
      await queryInterface.addIndex('product_batches', ['supplier_id'], {
        name: 'idx_pb_supplier',
        transaction
      })

      // ============ 2. items 防伪预留 5 列 + batch_id（直接建 FK，因 product_batches 已建） ============
      await queryInterface.addColumn(
        'items',
        'nfc_uid',
        { type: Sequelize.STRING(64), allowNull: true, comment: 'NFC芯片UID(防伪,预留)' },
        { transaction }
      )
      await queryInterface.addColumn(
        'items',
        'anti_fake_code',
        { type: Sequelize.STRING(32), allowNull: true, comment: '防伪码(扫码验真,预留)' },
        { transaction }
      )
      await queryInterface.addColumn(
        'items',
        'verify_count',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '被验真次数(判断盗刷)'
        },
        { transaction }
      )
      await queryInterface.addColumn(
        'items',
        'first_verified_at',
        { type: Sequelize.DATE, allowNull: true, comment: '首次验真时间（北京时间）' },
        { transaction }
      )
      await queryInterface.addColumn(
        'items',
        'batch_id',
        {
          type: Sequelize.BIGINT,
          allowNull: true,
          comment: '所属批次(product_batches.batch_id,预留)',
          references: { model: 'product_batches', key: 'batch_id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        { transaction }
      )
      await queryInterface.addIndex('items', ['batch_id'], {
        name: 'idx_items_batch',
        transaction
      })

      // ============ 3. S1 采购单 purchase_orders + purchase_order_items ============
      await queryInterface.createTable(
        'purchase_orders',
        {
          purchase_order_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '采购单主键'
          },
          order_no: { type: Sequelize.STRING(32), allowNull: false, comment: '采购单号' },
          supplier_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '供应商',
            references: { model: 'suppliers', key: 'supplier_id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT'
          },
          total_amount: {
            type: Sequelize.DECIMAL(12, 2),
            allowNull: true,
            comment: '采购总额'
          },
          status: {
            type: Sequelize.ENUM('draft', 'ordered', 'received', 'cancelled'),
            allowNull: false,
            defaultValue: 'draft',
            comment: '状态：draft草稿/ordered已下单/received已到货/cancelled已取消'
          },
          ordered_at: { type: Sequelize.DATE, allowNull: true, comment: '下单时间（北京时间）' },
          received_at: { type: Sequelize.DATE, allowNull: true, comment: '到货时间（北京时间）' },
          remark: { type: Sequelize.STRING(500), allowNull: true, comment: '备注' },
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
          comment: '采购单头(S1进货管理)'
        }
      )
      await queryInterface.addIndex('purchase_orders', ['order_no'], {
        name: 'uk_po_order_no',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('purchase_orders', ['supplier_id'], {
        name: 'idx_po_supplier',
        transaction
      })

      await queryInterface.createTable(
        'purchase_order_items',
        {
          id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '采购单行主键'
          },
          purchase_order_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '所属采购单',
            references: { model: 'purchase_orders', key: 'purchase_order_id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },
          exchange_item_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '采购的SPU',
            references: { model: 'exchange_items', key: 'exchange_item_id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          sku_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '采购的SKU',
            references: { model: 'exchange_item_skus', key: 'sku_id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          batch_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '入库批次(关联product_batches)',
            references: { model: 'product_batches', key: 'batch_id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          quantity: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '采购数量'
          },
          purchase_price: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true,
            comment: '进货单价'
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
          comment: '采购单明细行(S1)'
        }
      )
      await queryInterface.addIndex('purchase_order_items', ['purchase_order_id'], {
        name: 'idx_poi_order',
        transaction
      })
      await queryInterface.addIndex('purchase_order_items', ['exchange_item_id'], {
        name: 'idx_poi_item',
        transaction
      })

      // ============ 4. S4 组合/套装 product_bundles + product_bundle_items ============
      await queryInterface.createTable(
        'product_bundles',
        {
          bundle_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '组合主键'
          },
          exchange_item_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '组合自身对应的SPU(有自己的item_code)',
            references: { model: 'exchange_items', key: 'exchange_item_id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },
          bundle_type: {
            type: Sequelize.ENUM('suit', 'gift'),
            allowNull: false,
            defaultValue: 'suit',
            comment: 'suit=套装/gift=赠品搭售'
          },
          status: {
            type: Sequelize.ENUM('active', 'inactive'),
            allowNull: false,
            defaultValue: 'active',
            comment: '状态'
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
          comment: '组合商品主体(S4,组合本身也是SPU)'
        }
      )
      await queryInterface.addIndex('product_bundles', ['exchange_item_id'], {
        name: 'uk_bundle_spu',
        unique: true,
        transaction
      })

      await queryInterface.createTable(
        'product_bundle_items',
        {
          id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '组合明细主键'
          },
          bundle_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '所属组合',
            references: { model: 'product_bundles', key: 'bundle_id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },
          child_item_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '子项SPU',
            references: { model: 'exchange_items', key: 'exchange_item_id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          child_sku_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '子项SKU',
            references: { model: 'exchange_item_skus', key: 'sku_id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          quantity: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 1,
            comment: '数量'
          },
          is_gift: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: '是否赠品'
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
          comment: '组合明细BOM(S4)'
        }
      )
      await queryInterface.addIndex('product_bundle_items', ['bundle_id'], {
        name: 'idx_pbi_bundle',
        transaction
      })

      // ============ 5. S5 第三方分销 external_channel_mappings ============
      await queryInterface.createTable(
        'external_channel_mappings',
        {
          id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '映射主键'
          },
          channel: {
            type: Sequelize.STRING(20),
            allowNull: false,
            comment: '外部渠道:taobao/douyin/...'
          },
          external_item_id: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '外部平台商品ID'
          },
          exchange_item_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '我方SPU',
            references: { model: 'exchange_items', key: 'exchange_item_id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },
          sync_status: {
            type: Sequelize.ENUM('pending', 'synced', 'failed', 'disabled'),
            allowNull: false,
            defaultValue: 'pending',
            comment: '同步状态'
          },
          last_synced_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '最近同步时间（北京时间）'
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
          comment: '外部平台商品ID↔我方item_code映射(S5)'
        }
      )
      await queryInterface.addIndex('external_channel_mappings', ['channel', 'external_item_id'], {
        name: 'uk_channel_external',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('external_channel_mappings', ['exchange_item_id'], {
        name: 'idx_ecm_item',
        transaction
      })

      // ============ 6. S3 二手寄卖 consignment_orders ============
      await queryInterface.createTable(
        'consignment_orders',
        {
          consignment_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '寄卖单主键'
          },
          order_no: { type: Sequelize.STRING(32), allowNull: false, comment: '寄卖单号' },
          item_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '寄卖的实物实例(items.item_id,一物一码)',
            references: { model: 'items', key: 'item_id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT'
          },
          consignor_account_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '寄卖人账户(accounts.account_id)',
            references: { model: 'accounts', key: 'account_id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT'
          },
          list_price: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '寄卖定价(计价资产数量)'
          },
          list_asset_code: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '计价资产码'
          },
          relist_item_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '回流后再上架的目标SPU',
            references: { model: 'exchange_items', key: 'exchange_item_id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          status: {
            type: Sequelize.ENUM('pending', 'listed', 'sold', 'withdrawn', 'rejected'),
            allowNull: false,
            defaultValue: 'pending',
            comment: '状态'
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
          comment: '二手寄卖单(S3;所有权流转复用item_ledger,转赠不单独建表)'
        }
      )
      await queryInterface.addIndex('consignment_orders', ['order_no'], {
        name: 'uk_consign_order_no',
        unique: true,
        transaction
      })
      await queryInterface.addIndex('consignment_orders', ['item_id'], {
        name: 'idx_consign_item',
        transaction
      })
      await queryInterface.addIndex('consignment_orders', ['consignor_account_id'], {
        name: 'idx_consign_consignor',
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
      await queryInterface.dropTable('consignment_orders', { transaction })
      await queryInterface.dropTable('external_channel_mappings', { transaction })
      await queryInterface.dropTable('product_bundle_items', { transaction })
      await queryInterface.dropTable('product_bundles', { transaction })
      await queryInterface.dropTable('purchase_order_items', { transaction })
      await queryInterface.dropTable('purchase_orders', { transaction })

      // 先删 items.batch_id 外键与列（product_batches 被其引用，须先解除）
      await queryInterface.removeIndex('items', 'idx_items_batch', { transaction })
      await queryInterface.removeColumn('items', 'batch_id', { transaction })
      await queryInterface.removeColumn('items', 'first_verified_at', { transaction })
      await queryInterface.removeColumn('items', 'verify_count', { transaction })
      await queryInterface.removeColumn('items', 'anti_fake_code', { transaction })
      await queryInterface.removeColumn('items', 'nfc_uid', { transaction })

      await queryInterface.dropTable('product_batches', { transaction })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
