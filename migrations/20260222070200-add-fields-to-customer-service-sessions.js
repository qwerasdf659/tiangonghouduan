'use strict'

/**
 * customer_service_sessions 表新增工单关联和会话摘要字段
 *
 * 业务背景：
 * - issue_id：关联工单（一个工单可关联多个会话，用户多次咨询同一问题）
 * - tags：会话标签JSON（如 ["交易纠纷","已补偿"]），用于A区问题分类展示
 * - resolution_summary：处理摘要（关闭时填写，在C区历史会话Tab展示）
 *
 * 变更内容：
 * 1. 新增 issue_id BIGINT NULL（外键关联 customer_service_issues）
 * 2. 新增 tags JSON NULL
 * 3. 新增 resolution_summary VARCHAR(500) NULL
 *
 * @version 4.1.0
 * @date 2026-02-22
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 逐个检查并添加字段（幂等保护）
      const columnsToAdd = [
        {
          name: 'issue_id',
          definition: {
            type: Sequelize.BIGINT,
            allowNull: true,
            comment: '关联工单ID（一个工单可关联多个会话）',
            references: {
              model: 'customer_service_issues',
              key: 'issue_id'
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE'
          }
        },
        {
          name: 'tags',
          definition: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '会话标签JSON数组（如 ["交易纠纷","已补偿"]）'
          }
        },
        {
          name: 'resolution_summary',
          definition: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '处理摘要（关闭时填写，历史会话Tab展示）'
          }
        }
      ]

      for (const col of columnsToAdd) {
        const [existing] = await queryInterface.sequelize.query(
          `SHOW COLUMNS FROM customer_service_sessions LIKE '${col.name}'`,
          { transaction }
        )

        if (existing.length === 0) {
          await queryInterface.addColumn(
            'customer_service_sessions',
            col.name,
            col.definition,
            { transaction }
          )
          console.log(`  ✅ customer_service_sessions.${col.name} 列已添加`)
        } else {
          console.log(
            `  ⏭️ customer_service_sessions.${col.name} 列已存在，跳过`
          )
        }
      }

      // 添加 issue_id 索引（幂等检查）
      const [indexes] = await queryInterface.sequelize.query(
        "SHOW INDEX FROM customer_service_sessions WHERE Key_name = 'idx_cs_sessions_issue_id'",
        { transaction }
      )
      if (indexes.length === 0) {
        await queryInterface.addIndex(
          'customer_service_sessions',
          ['issue_id'],
          { name: 'idx_cs_sessions_issue_id', transaction }
        )
        console.log('  ✅ idx_cs_sessions_issue_id 索引已添加')
      }

      await transaction.commit()
      console.log('✅ 迁移完成：customer_service_sessions 新增3个字段')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败：', error.message)
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 先移除索引
      try {
        await queryInterface.removeIndex(
          'customer_service_sessions',
          'idx_cs_sessions_issue_id',
          { transaction }
        )
      } catch {
        /* 索引可能不存在 */
      }

      // 移除外键约束再删列
      await queryInterface.removeColumn(
        'customer_service_sessions',
        'resolution_summary',
        { transaction }
      )
      await queryInterface.removeColumn(
        'customer_service_sessions',
        'tags',
        { transaction }
      )
      await queryInterface.removeColumn(
        'customer_service_sessions',
        'issue_id',
        { transaction }
      )

      await transaction.commit()
      console.log('✅ 回滚完成：移除 customer_service_sessions 3个字段')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
