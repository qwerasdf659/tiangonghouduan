'use strict'

/**
 * 编码规则统一方案（文档 25.18.9）— 数据库层
 *
 * 1) lottery_draws.draw_seq、redemption_orders.redemption_seq：辅助 AUTO_INCREMENT，供统一 order_no 序列段
 * 2) 各业务表新增面向用户编号列并回填历史数据
 *
 * 注意：回填使用 utils/OrderNoGenerator，与运行时生成规则一致。
 */

const OrderNoGenerator = require('../utils/OrderNoGenerator')

module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction()
    const { QueryTypes } = Sequelize

    try {
      const ld = await queryInterface.describeTable('lottery_draws', { transaction: t })
      if (!ld.draw_seq) {
        const ldCountRows = await queryInterface.sequelize.query(
          'SELECT COUNT(*) AS ld_cnt FROM lottery_draws',
          { transaction: t, type: QueryTypes.SELECT }
        )
        const ld_cnt = ldCountRows[0]?.ld_cnt
        if (Number(ld_cnt) === 0) {
          await queryInterface.addColumn(
            'lottery_draws',
            'draw_seq',
            {
              type: Sequelize.INTEGER.UNSIGNED,
              allowNull: false,
              autoIncrement: true,
              unique: true,
              comment: '辅助序号（AUTO_INCREMENT），用于统一 LT 订单号序列段，非业务主键'
            },
            { transaction: t }
          )
        } else {
          await queryInterface.addColumn(
            'lottery_draws',
            'draw_seq',
            {
              type: Sequelize.INTEGER.UNSIGNED,
              allowNull: true,
              comment: '辅助序号（AUTO_INCREMENT），用于统一 LT 订单号序列段，非业务主键'
            },
            { transaction: t }
          )
          await queryInterface.sequelize.query(
            `UPDATE lottery_draws ld
             INNER JOIN (
               SELECT lottery_draw_id,
                      ROW_NUMBER() OVER (ORDER BY created_at ASC, lottery_draw_id ASC) AS rn
               FROM lottery_draws
             ) x ON ld.lottery_draw_id = x.lottery_draw_id
             SET ld.draw_seq = x.rn`,
            { transaction: t }
          )
          await queryInterface.sequelize.query(
            'ALTER TABLE lottery_draws MODIFY COLUMN draw_seq INT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE',
            { transaction: t }
          )
        }
      }

      const ro = await queryInterface.describeTable('redemption_orders', { transaction: t })
      if (!ro.redemption_seq) {
        const roCountRows = await queryInterface.sequelize.query(
          'SELECT COUNT(*) AS ro_cnt FROM redemption_orders',
          { transaction: t, type: QueryTypes.SELECT }
        )
        const ro_cnt = roCountRows[0]?.ro_cnt
        if (Number(ro_cnt) === 0) {
          await queryInterface.addColumn(
            'redemption_orders',
            'redemption_seq',
            {
              type: Sequelize.INTEGER.UNSIGNED,
              allowNull: false,
              autoIncrement: true,
              unique: true,
              comment: '辅助序号（AUTO_INCREMENT），用于统一 RD 订单号序列段，非业务主键'
            },
            { transaction: t }
          )
        } else {
          await queryInterface.addColumn(
            'redemption_orders',
            'redemption_seq',
            {
              type: Sequelize.INTEGER.UNSIGNED,
              allowNull: true,
              comment: '辅助序号（AUTO_INCREMENT），用于统一 RD 订单号序列段，非业务主键'
            },
            { transaction: t }
          )
          await queryInterface.sequelize.query(
            `UPDATE redemption_orders r
             INNER JOIN (
               SELECT redemption_order_id,
                      ROW_NUMBER() OVER (ORDER BY created_at ASC, redemption_order_id ASC) AS rn
               FROM redemption_orders
             ) x ON r.redemption_order_id = x.redemption_order_id
             SET r.redemption_seq = x.rn`,
            { transaction: t }
          )
          await queryInterface.sequelize.query(
            'ALTER TABLE redemption_orders MODIFY COLUMN redemption_seq INT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE',
            { transaction: t }
          )
        }
      }

      const addNoCol = async (table, col, comment) => {
        const d = await queryInterface.describeTable(table, { transaction: t })
        if (!d[col]) {
          await queryInterface.addColumn(
            table,
            col,
            {
              type: Sequelize.STRING(32),
              allowNull: true,
              comment
            },
            { transaction: t }
          )
        }
      }

      await addNoCol('trade_orders', 'order_no', '交易订单号（TO 前缀，统一生成器）')
      await addNoCol('redemption_orders', 'order_no', '核销订单号（RD 前缀）')
      await addNoCol('lottery_draws', 'order_no', '抽奖订单号（LT 前缀）')
      await addNoCol('consumption_records', 'order_no', '消费买单订单号（CS 前缀）')
      await addNoCol('asset_transactions', 'transaction_no', '资产流水号（TX 前缀）')
      await addNoCol('ad_billing_records', 'billing_no', '广告账单号（AB 前缀）')

      const idxTrade = await queryInterface.showIndex('trade_orders', { transaction: t })
      if (!idxTrade.some(i => i.name === 'uk_trade_orders_order_no')) {
        await queryInterface.addIndex('trade_orders', ['order_no'], {
          unique: true,
          name: 'uk_trade_orders_order_no',
          transaction: t
        })
      }
      const idxRed = await queryInterface.showIndex('redemption_orders', { transaction: t })
      if (!idxRed.some(i => i.name === 'uk_redemption_orders_order_no')) {
        await queryInterface.addIndex('redemption_orders', ['order_no'], {
          unique: true,
          name: 'uk_redemption_orders_order_no',
          transaction: t
        })
      }
      const idxLd = await queryInterface.showIndex('lottery_draws', { transaction: t })
      if (!idxLd.some(i => i.name === 'uk_lottery_draws_order_no')) {
        await queryInterface.addIndex('lottery_draws', ['order_no'], {
          unique: true,
          name: 'uk_lottery_draws_order_no',
          transaction: t
        })
      }
      const idxCr = await queryInterface.showIndex('consumption_records', { transaction: t })
      if (!idxCr.some(i => i.name === 'uk_consumption_records_order_no')) {
        await queryInterface.addIndex('consumption_records', ['order_no'], {
          unique: true,
          name: 'uk_consumption_records_order_no',
          transaction: t
        })
      }
      const idxAt = await queryInterface.showIndex('asset_transactions', { transaction: t })
      if (!idxAt.some(i => i.name === 'uk_asset_transactions_transaction_no')) {
        await queryInterface.addIndex('asset_transactions', ['transaction_no'], {
          unique: true,
          name: 'uk_asset_transactions_transaction_no',
          transaction: t
        })
      }
      const idxAb = await queryInterface.showIndex('ad_billing_records', { transaction: t })
      if (!idxAb.some(i => i.name === 'uk_ad_billing_records_billing_no')) {
        await queryInterface.addIndex('ad_billing_records', ['billing_no'], {
          unique: true,
          name: 'uk_ad_billing_records_billing_no',
          transaction: t
        })
      }

      const batchUpdate = async (sqlSelect, table, idCol, bizCode) => {
        const rows = await queryInterface.sequelize.query(sqlSelect, {
          type: QueryTypes.SELECT,
          transaction: t
        })
        const chunk = 800
        for (let i = 0; i < rows.length; i += chunk) {
          const part = rows.slice(i, i + chunk)
          for (const row of part) {
            const created = row.created_at
            const no = OrderNoGenerator.generate(bizCode, row.seq_src, created)
            await queryInterface.sequelize.query(
              `UPDATE \`${table}\` SET \`order_no\` = ? WHERE \`${idCol}\` = ?`,
              { replacements: [no, row.id], transaction: t }
            )
          }
        }
      }

      await batchUpdate(
        `SELECT trade_order_id AS id, trade_order_id AS seq_src, created_at FROM trade_orders WHERE order_no IS NULL`,
        'trade_orders',
        'trade_order_id',
        'TO'
      )

      await batchUpdate(
        `SELECT redemption_order_id AS id, redemption_seq AS seq_src, created_at FROM redemption_orders WHERE order_no IS NULL`,
        'redemption_orders',
        'redemption_order_id',
        'RD'
      )

      await batchUpdate(
        `SELECT lottery_draw_id AS id, draw_seq AS seq_src, created_at FROM lottery_draws WHERE order_no IS NULL`,
        'lottery_draws',
        'lottery_draw_id',
        'LT'
      )

      await batchUpdate(
        `SELECT consumption_record_id AS id, consumption_record_id AS seq_src, created_at FROM consumption_records WHERE order_no IS NULL`,
        'consumption_records',
        'consumption_record_id',
        'CS'
      )

      const txRows = await queryInterface.sequelize.query(
        `SELECT asset_transaction_id AS id, asset_transaction_id AS seq_src, created_at FROM asset_transactions WHERE transaction_no IS NULL`,
        { type: QueryTypes.SELECT, transaction: t }
      )
      const chunkTx = 800
      for (let i = 0; i < txRows.length; i += chunkTx) {
        for (const row of txRows.slice(i, i + chunkTx)) {
          const no = OrderNoGenerator.generate('TX', row.seq_src, row.created_at)
          await queryInterface.sequelize.query(
            'UPDATE `asset_transactions` SET `transaction_no` = ? WHERE `asset_transaction_id` = ?',
            { replacements: [no, row.id], transaction: t }
          )
        }
      }

      const abRows = await queryInterface.sequelize.query(
        `SELECT ad_billing_record_id AS id, ad_billing_record_id AS seq_src, created_at FROM ad_billing_records WHERE billing_no IS NULL`,
        { type: QueryTypes.SELECT, transaction: t }
      )
      for (const row of abRows) {
        const no = OrderNoGenerator.generate('AB', row.seq_src, row.created_at)
        await queryInterface.sequelize.query(
          'UPDATE `ad_billing_records` SET `billing_no` = ? WHERE `ad_billing_record_id` = ?',
          { replacements: [no, row.id], transaction: t }
        )
      }

      await queryInterface.changeColumn(
        'trade_orders',
        'order_no',
        {
          type: Sequelize.STRING(32),
          allowNull: false,
          comment: '交易订单号（TO 前缀，统一生成器）'
        },
        { transaction: t }
      )
      await queryInterface.changeColumn(
        'redemption_orders',
        'order_no',
        {
          type: Sequelize.STRING(32),
          allowNull: false,
          comment: '核销订单号（RD 前缀）'
        },
        { transaction: t }
      )
      await queryInterface.changeColumn(
        'lottery_draws',
        'order_no',
        {
          type: Sequelize.STRING(32),
          allowNull: false,
          comment: '抽奖订单号（LT 前缀）'
        },
        { transaction: t }
      )
      await queryInterface.changeColumn(
        'consumption_records',
        'order_no',
        {
          type: Sequelize.STRING(32),
          allowNull: false,
          comment: '消费买单订单号（CS 前缀）'
        },
        { transaction: t }
      )
      await queryInterface.changeColumn(
        'asset_transactions',
        'transaction_no',
        {
          type: Sequelize.STRING(32),
          allowNull: false,
          comment: '资产流水号（TX 前缀）'
        },
        { transaction: t }
      )
      await queryInterface.changeColumn(
        'ad_billing_records',
        'billing_no',
        {
          type: Sequelize.STRING(32),
          allowNull: false,
          comment: '广告账单号（AB 前缀）'
        },
        { transaction: t }
      )

      await t.commit()
    } catch (e) {
      await t.rollback()
      throw e
    }
  },

  async down(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.removeIndex('ad_billing_records', 'uk_ad_billing_records_billing_no', {
        transaction: t
      })
      await queryInterface.removeIndex('asset_transactions', 'uk_asset_transactions_transaction_no', {
        transaction: t
      })
      await queryInterface.removeIndex('consumption_records', 'uk_consumption_records_order_no', {
        transaction: t
      })
      await queryInterface.removeIndex('lottery_draws', 'uk_lottery_draws_order_no', { transaction: t })
      await queryInterface.removeIndex('redemption_orders', 'uk_redemption_orders_order_no', {
        transaction: t
      })
      await queryInterface.removeIndex('trade_orders', 'uk_trade_orders_order_no', { transaction: t })

      await queryInterface.removeColumn('ad_billing_records', 'billing_no', { transaction: t })
      await queryInterface.removeColumn('asset_transactions', 'transaction_no', { transaction: t })
      await queryInterface.removeColumn('consumption_records', 'order_no', { transaction: t })
      await queryInterface.removeColumn('lottery_draws', 'order_no', { transaction: t })
      await queryInterface.removeColumn('redemption_orders', 'order_no', { transaction: t })
      await queryInterface.removeColumn('trade_orders', 'order_no', { transaction: t })

      await queryInterface.sequelize.query(
        'ALTER TABLE redemption_orders DROP COLUMN redemption_seq',
        { transaction: t }
      )
      await queryInterface.sequelize.query('ALTER TABLE lottery_draws DROP COLUMN draw_seq', {
        transaction: t
      })

      await t.commit()
    } catch (e) {
      await t.rollback()
      throw e
    }
  }
}
