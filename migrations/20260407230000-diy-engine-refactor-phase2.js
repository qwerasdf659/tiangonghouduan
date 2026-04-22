'use strict'

/**
 * DIY 引擎重构 Phase 2：
 * 1. exchange_records.exchange_item_id 改为 NULL 允许（DIY 兑换不关联 exchange_item）
 * 2. 外键约束改为 ON DELETE SET NULL
 */
module.exports = {
  async up(queryInterface) {
    // 删除旧外键约束
    await queryInterface.sequelize.query(
      'ALTER TABLE exchange_records DROP FOREIGN KEY exchange_records_exchange_item_id_fk'
    ).catch(() => {
      // 约束可能不存在（已手动删除），忽略
    })

    // 修改列为 NULL 允许
    await queryInterface.sequelize.query(
      'ALTER TABLE exchange_records MODIFY COLUMN exchange_item_id BIGINT NULL COMMENT "关联兑换商品 SPU（DIY 兑换为 NULL）"'
    )

    // 重新添加外键约束（ON DELETE SET NULL）
    await queryInterface.sequelize.query(
      'ALTER TABLE exchange_records ADD CONSTRAINT exchange_records_exchange_item_id_fk FOREIGN KEY (exchange_item_id) REFERENCES exchange_items(exchange_item_id) ON DELETE SET NULL ON UPDATE CASCADE'
    )
  },

  async down(queryInterface) {
    // 回滚：恢复 NOT NULL 约束
    await queryInterface.sequelize.query(
      'ALTER TABLE exchange_records DROP FOREIGN KEY exchange_records_exchange_item_id_fk'
    ).catch(() => {})

    await queryInterface.sequelize.query(
      'ALTER TABLE exchange_records MODIFY COLUMN exchange_item_id BIGINT NOT NULL COMMENT "关联兑换商品 SPU"'
    )

    await queryInterface.sequelize.query(
      'ALTER TABLE exchange_records ADD CONSTRAINT exchange_records_exchange_item_id_fk FOREIGN KEY (exchange_item_id) REFERENCES exchange_items(exchange_item_id) ON DELETE NO ACTION ON UPDATE CASCADE'
    )
  }
}
