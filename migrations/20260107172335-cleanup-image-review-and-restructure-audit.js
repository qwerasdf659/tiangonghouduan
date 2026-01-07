'use strict'

/**
 * 清理用户上传凭证审核业务 + 审核架构重构
 *
 * 业务背景：
 * - 明确宣布不支持用户自上传凭证获得积分
 * - 主流程A：管理员扫码提交积分审核（merchant_points_reviews 表）
 * - 主流程B：管理员手动调整积分（兜底通道）
 *
 * 清理内容（不可回滚变更）：
 * 1. 删除 image_resources 表的 5 个审核字段
 *    - review_status (审核状态)
 *    - reviewer_id (审核人)
 *    - review_reason (审核原因)
 *    - reviewed_at (审核时间)
 *    - points_awarded (奖励积分)
 * 2. 从 business_type ENUM 移除 'user_upload_review'
 * 3. 删除测试数据（如有）
 *
 * 决策时间：2026-01-08
 * 风险等级：🔴 高风险（不可回滚）
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 开始执行：用户上传凭证审核业务清理')

      // 1. 删除测试数据（如有）
      console.log('📊 步骤1：清理 user_upload_review 测试数据...')
      const [deleteResult] = await queryInterface.sequelize.query(
        `DELETE FROM image_resources WHERE business_type = 'user_upload_review'`,
        { transaction }
      )
      console.log(`   ✅ 删除 user_upload_review 数据: ${deleteResult.affectedRows || 0} 条`)

      // 2. 删除审核字段（5个）
      console.log('🗑️ 步骤2：删除 image_resources 审核字段...')

      // 检查字段是否存在再删除
      const [columns] = await queryInterface.sequelize.query(`SHOW COLUMNS FROM image_resources`, {
        transaction
      })
      const columnNames = columns.map(c => c.Field)

      const fieldsToRemove = [
        'review_status',
        'reviewer_id',
        'review_reason',
        'reviewed_at',
        'points_awarded'
      ]

      for (const field of fieldsToRemove) {
        if (columnNames.includes(field)) {
          await queryInterface.removeColumn('image_resources', field, { transaction })
          console.log(`   ✅ 删除字段: ${field}`)
        } else {
          console.log(`   ⏭️ 字段不存在（跳过）: ${field}`)
        }
      }

      // 3. 删除相关索引（如存在）
      console.log('🗑️ 步骤3：清理相关索引...')
      const [indexes] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM image_resources WHERE Key_name LIKE '%review%'`,
        { transaction }
      )

      const indexNames = [...new Set(indexes.map(i => i.Key_name))]
      for (const indexName of indexNames) {
        if (indexName !== 'PRIMARY') {
          try {
            await queryInterface.removeIndex('image_resources', indexName, { transaction })
            console.log(`   ✅ 删除索引: ${indexName}`)
          } catch (e) {
            console.log(`   ⏭️ 删除索引失败（可能已不存在）: ${indexName}`)
          }
        }
      }

      // 4. 重建 business_type ENUM（移除 user_upload_review）
      console.log('🔧 步骤4：重建 business_type ENUM...')

      // 检查当前枚举值
      const [enumResult] = await queryInterface.sequelize.query(
        `SHOW COLUMNS FROM image_resources LIKE 'business_type'`,
        { transaction }
      )

      if (enumResult.length > 0 && enumResult[0].Type.includes('user_upload_review')) {
        // 修改列，移除 user_upload_review
        await queryInterface.changeColumn(
          'image_resources',
          'business_type',
          {
            type: Sequelize.ENUM('lottery', 'exchange', 'trade', 'uploads'),
            allowNull: false,
            comment: '业务类型：抽奖/兑换/交易/上传（user_upload_review 已删除 - 2026-01-08）'
          },
          { transaction }
        )
        console.log(`   ✅ business_type ENUM 已更新（移除 user_upload_review）`)
      } else {
        console.log(`   ⏭️ business_type 已是目标状态，无需修改`)
      }

      await transaction.commit()

      console.log('')
      console.log('✅ ========================================')
      console.log('✅ 用户上传凭证审核业务清理完成！')
      console.log('✅ ========================================')
      console.log('')
      console.log('📋 清理内容：')
      console.log(
        '   - 删除 5 个审核字段（review_status/reviewer_id/review_reason/reviewed_at/points_awarded）'
      )
      console.log('   - 移除 user_upload_review 枚举值')
      console.log('   - 清理相关测试数据和索引')
      console.log('')
      console.log('⚠️ 注意：此迁移不可回滚（设计决策）')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    // ⚠️ 此迁移不支持回滚（2026-01-08 拍板决策）
    // 原因：这是业务清理变更，不是结构调整
    // 如需恢复，请使用备份数据或创建新的迁移
    throw new Error(
      '⛔ 此迁移不支持回滚（审核架构已重构，不可逆）\n' +
        '📋 清理内容：\n' +
        '   - 删除 image_resources 审核字段\n' +
        '   - 移除 user_upload_review 业务类型\n' +
        '📌 决策时间：2026-01-08'
    )
  }
}
