'use strict'

/**
 * 迁移①（编码核心）：商品编码体系落地——SPU/SKU 无意义随机码
 *
 * 依据：docs/商品编码体系设计方案.md §4.1/§4.2/§4.3/§10.6/§15.7（拍3 拆 3 文件之文件①）
 * 创建时间：2026-07-06（北京时间）
 *
 * 变更内容（exchange_items / exchange_item_skus）：
 * 1. exchange_items 新增 item_code VARCHAR(14)（SPU 平台展示码，SP+12 位随机规范形）+ 唯一索引 uk_item_code
 * 2. exchange_items 新增 series_id BIGINT NULL（所属系列，FK 在文件②建 product_series 后补）+ series_seq INT NULL
 *    + 唯一索引 uk_series_seq(series_id, series_seq)（系列内不重号；NULL 系列不受唯一约束影响）
 * 3. exchange_item_skus.sku_code 收窄 VARCHAR(100)→VARCHAR(14)：
 *    先重写现网 2 条存量 SKU 为 SK+12 位随机（旧码 P{pid}_{ts}_{rand} 把 pid 编进码、耦合、约 30 长），
 *    再 changeColumn 收窄列宽（拍板：未上线、仅 2 条、旧码无对外引用，直接重写零兼容包袱）
 * 4. exchange_item_skus 新增 barcode VARCHAR(20) NULL（国际标准条码 UPC/EAN/GTIN 预留）
 * 5. 回填现网存量 exchange_items 的 item_code（调 ProductCodeGenerator 生成 SP 码，保证无 NULL）
 * 6. item_code 收紧为 NOT NULL（拍2：本次一步到位，不留可空历史包袱）
 *
 * 回滚(down)：还原列宽、删索引/新列（存量 sku_code/item_code 旧值不可逆还原，仅还原结构）
 */

const ProductCodeGenerator = require('../utils/ProductCodeGenerator')

/**
 * 在事务内为指定表列生成一个全库唯一的编码（撞码重试，唯一索引兜底）
 * @param {string} prefix - 层级前缀（SP/SK）
 * @param {string} table - 目标表名
 * @param {string} column - 唯一列名
 * @param {Object} queryInterface - Sequelize queryInterface
 * @param {Object} transaction - 事务实例
 * @returns {Promise<string>} 唯一规范形编码
 */
async function generateUniqueCode(prefix, table, column, queryInterface, transaction) {
  return ProductCodeGenerator.generateUnique(prefix, async code => {
    const [rows] = await queryInterface.sequelize.query(
      `SELECT 1 FROM \`${table}\` WHERE \`${column}\` = :code LIMIT 1`,
      { replacements: { code }, transaction }
    )
    return rows.length === 0
  })
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      // 1. exchange_items 新增 item_code（先建可空，回填后再收紧 NOT NULL）
      await queryInterface.addColumn(
        'exchange_items',
        'item_code',
        {
          type: Sequelize.STRING(14),
          allowNull: true,
          comment: '平台商品展示码(SPU,无意义随机码 SP+12位规范形,对外标识/手册查找/防枚举)'
        },
        { transaction, after: 'exchange_item_id' }
      )
      await queryInterface.addIndex('exchange_items', ['item_code'], {
        name: 'uk_item_code',
        unique: true,
        transaction
      })

      // 2. exchange_items 新增系列字段（series_id 的 FK 在文件②建 product_series 后补）
      await queryInterface.addColumn(
        'exchange_items',
        'series_id',
        {
          type: Sequelize.BIGINT,
          allowNull: true,
          comment: '所属系列(product_series.series_id,可空;FK 在供应商+系列迁移中补)'
        },
        { transaction, after: 'item_code' }
      )
      await queryInterface.addColumn(
        'exchange_items',
        'series_seq',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '系列内连续序号(展示形=series_code+补零,如 SLNB-001)'
        },
        { transaction, after: 'series_id' }
      )
      await queryInterface.addIndex('exchange_items', ['series_id', 'series_seq'], {
        name: 'uk_series_seq',
        unique: true,
        transaction
      })

      // 3. 重写存量 SKU 的 sku_code 为 SK+12 位随机（必须先重写再收窄列宽，避免旧 30 长数据截断）
      const [skuRows] = await queryInterface.sequelize.query(
        'SELECT sku_id FROM exchange_item_skus',
        { transaction }
      )
      for (const row of skuRows) {
        // eslint-disable-next-line no-await-in-loop
        const newSkuCode = await generateUniqueCode(
          'SK',
          'exchange_item_skus',
          'sku_code',
          queryInterface,
          transaction
        )
        // eslint-disable-next-line no-await-in-loop
        await queryInterface.sequelize.query(
          'UPDATE exchange_item_skus SET sku_code = :code WHERE sku_id = :id',
          { replacements: { code: newSkuCode, id: row.sku_id }, transaction }
        )
      }

      // 收窄 sku_code 列宽（唯一索引不受 MODIFY COLUMN 影响，保持不变）
      await queryInterface.changeColumn(
        'exchange_item_skus',
        'sku_code',
        {
          type: Sequelize.STRING(14),
          allowNull: false,
          comment: 'SKU 平台展示码(无意义随机码 SK+12位规范形,系统生成)'
        },
        { transaction }
      )

      // 4. exchange_item_skus 新增国际条码预留列
      await queryInterface.addColumn(
        'exchange_item_skus',
        'barcode',
        {
          type: Sequelize.STRING(20),
          allowNull: true,
          comment: '国际标准条码(UPC/EAN/GTIN,预留,可空;区别于供应商货号)'
        },
        { transaction, after: 'sku_code' }
      )

      // 5. 回填存量 exchange_items 的 item_code（生成 SP 码）
      const [spuRows] = await queryInterface.sequelize.query(
        'SELECT exchange_item_id FROM exchange_items WHERE item_code IS NULL',
        { transaction }
      )
      for (const row of spuRows) {
        // eslint-disable-next-line no-await-in-loop
        const newItemCode = await generateUniqueCode(
          'SP',
          'exchange_items',
          'item_code',
          queryInterface,
          transaction
        )
        // eslint-disable-next-line no-await-in-loop
        await queryInterface.sequelize.query(
          'UPDATE exchange_items SET item_code = :code WHERE exchange_item_id = :id',
          { replacements: { code: newItemCode, id: row.exchange_item_id }, transaction }
        )
      }

      // 6. 收紧 item_code 为 NOT NULL（一步到位，不留可空历史包袱）
      await queryInterface.changeColumn(
        'exchange_items',
        'item_code',
        {
          type: Sequelize.STRING(14),
          allowNull: false,
          comment: '平台商品展示码(SPU,无意义随机码 SP+12位规范形,对外标识/手册查找/防枚举)'
        },
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
      // 反序还原结构（存量码旧值不可逆，仅还原表结构）
      await queryInterface.removeColumn('exchange_item_skus', 'barcode', { transaction })
      await queryInterface.changeColumn(
        'exchange_item_skus',
        'sku_code',
        {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: 'SKU 唯一编码'
        },
        { transaction }
      )
      await queryInterface.removeIndex('exchange_items', 'uk_series_seq', { transaction })
      await queryInterface.removeColumn('exchange_items', 'series_seq', { transaction })
      await queryInterface.removeColumn('exchange_items', 'series_id', { transaction })
      await queryInterface.removeIndex('exchange_items', 'uk_item_code', { transaction })
      await queryInterface.removeColumn('exchange_items', 'item_code', { transaction })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
