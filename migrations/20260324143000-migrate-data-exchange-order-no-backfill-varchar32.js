'use strict'

/**
 * 兑换订单号数据面统一（编码规则统一方案跟进）
 *
 * 1) 将 exchange_records 中长度 ≠16 的历史 order_no 回填为 OrderNoGenerator 定长格式（EM/BD，由 source 区分）
 * 2) 同步更新 exchange_order_events.order_no（外键已临时删除，按旧值逐条对齐）
 * 3) 将 exchange_records.order_no、exchange_order_events.order_no 列宽由 VARCHAR(50) 收敛为 VARCHAR(32)（与其它业务单号列一致）
 *
 * 回滚 down：仅恢复列宽与外键，不恢复历史单号明文（数据不可逆）。
 */

const OrderNoGenerator = require('../utils/OrderNoGenerator')

/**
 * @param {import('sequelize').QueryInterface} queryInterface
 * @param {import('sequelize').Sequelize} Sequelize
 */
module.exports = {
  async up(queryInterface, _Sequelize) {
    const sequelize = queryInterface.sequelize
    const t = await sequelize.transaction()

    try {
      const [[fkRow]] = await sequelize.query(
        `SELECT CONSTRAINT_NAME AS name FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'exchange_order_events'
           AND REFERENCED_TABLE_NAME = 'exchange_records'
           AND COLUMN_NAME = 'order_no'
         LIMIT 1`,
        { transaction: t }
      )

      if (fkRow?.name) {
        await sequelize.query(
          `ALTER TABLE \`exchange_order_events\` DROP FOREIGN KEY \`${fkRow.name}\``,
          { transaction: t }
        )
      }

      const [allRows] = await sequelize.query(
        `SELECT order_no FROM \`exchange_records\``,
        { transaction: t }
      )
      const usedNos = new Set(allRows.map(r => r.order_no))

      const [toFix] = await sequelize.query(
        `SELECT exchange_record_id, order_no, source, created_at
         FROM \`exchange_records\`
         WHERE CHAR_LENGTH(order_no) <> 16`,
        { transaction: t }
      )

      for (const row of toFix) {
        const biz = row.source === 'bid' ? 'BD' : 'EM'
        const previousNo = row.order_no
        usedNos.delete(previousNo)

        let newNo
        let guard = 0
        do {
          newNo = OrderNoGenerator.generate(biz, row.exchange_record_id, row.created_at)
          guard++
          if (guard > 64) {
            throw new Error(
              `exchange_record_id=${row.exchange_record_id}: 无法生成唯一 order_no，请检查数据`
            )
          }
        } while (usedNos.has(newNo))

        usedNos.add(newNo)

        await sequelize.query(
          `UPDATE \`exchange_records\` SET \`order_no\` = ? WHERE \`exchange_record_id\` = ?`,
          { replacements: [newNo, row.exchange_record_id], transaction: t }
        )

        await sequelize.query(
          `UPDATE \`exchange_order_events\` SET \`order_no\` = ? WHERE \`order_no\` = ?`,
          { replacements: [newNo, previousNo], transaction: t }
        )
      }

      await sequelize.query(
        `ALTER TABLE \`exchange_records\`
         MODIFY COLUMN \`order_no\` VARCHAR(32) NOT NULL COMMENT '订单号（16位统一：EM/BD+北京YYMMDD+6位序列+2位hex）'`,
        { transaction: t }
      )

      await sequelize.query(
        `ALTER TABLE \`exchange_order_events\`
         MODIFY COLUMN \`order_no\` VARCHAR(32) NOT NULL COMMENT '订单号（关联 exchange_records.order_no）'`,
        { transaction: t }
      )

      await sequelize.query(
        `ALTER TABLE \`exchange_order_events\`
         ADD CONSTRAINT \`exchange_order_events_order_no_fk\`
         FOREIGN KEY (\`order_no\`) REFERENCES \`exchange_records\` (\`order_no\`)
         ON DELETE RESTRICT ON UPDATE CASCADE`,
        { transaction: t }
      )

      await t.commit()
    } catch (e) {
      await t.rollback()
      throw e
    }
  },

  async down(queryInterface, _Sequelize) {
    const sequelize = queryInterface.sequelize
    const t = await sequelize.transaction()

    try {
      const [[fkRow]] = await sequelize.query(
        `SELECT CONSTRAINT_NAME AS name FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'exchange_order_events'
           AND REFERENCED_TABLE_NAME = 'exchange_records'
           AND COLUMN_NAME = 'order_no'
         LIMIT 1`,
        { transaction: t }
      )

      if (fkRow?.name) {
        await sequelize.query(
          `ALTER TABLE \`exchange_order_events\` DROP FOREIGN KEY \`${fkRow.name}\``,
          { transaction: t }
        )
      }

      await sequelize.query(
        `ALTER TABLE \`exchange_records\`
         MODIFY COLUMN \`order_no\` VARCHAR(50) NOT NULL COMMENT '订单号'`,
        { transaction: t }
      )

      await sequelize.query(
        `ALTER TABLE \`exchange_order_events\`
         MODIFY COLUMN \`order_no\` VARCHAR(50) NOT NULL COMMENT '订单号（关联 exchange_records.order_no）'`,
        { transaction: t }
      )

      await sequelize.query(
        `ALTER TABLE \`exchange_order_events\`
         ADD CONSTRAINT \`exchange_order_events_order_no_fk\`
         FOREIGN KEY (\`order_no\`) REFERENCES \`exchange_records\` (\`order_no\`)
         ON DELETE RESTRICT ON UPDATE CASCADE`,
        { transaction: t }
      )

      await t.commit()
    } catch (e) {
      await t.rollback()
      throw e
    }
  }
}
