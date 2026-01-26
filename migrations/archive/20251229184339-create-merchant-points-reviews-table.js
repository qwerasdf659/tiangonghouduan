/**
 * 迁移文件：创建商家积分审核表（merchant_points_reviews）
 *
 * 业务场景：商家扫码审核冻结积分
 * - pending：审核中（积分冻结）
 * - approved：审核通过（从冻结结算）
 * - rejected：审核拒绝（积分仍冻结，需客服处理）
 * - expired：审核超时（积分仍冻结，需客服处理）
 * - cancelled：已取消/已处理
 *
 * 版本：v1.0.0
 * 创建时间：2025-12-29
 */

'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 检查表是否已存在
    const [tables] = await queryInterface.sequelize.query(
      `SHOW TABLES LIKE 'merchant_points_reviews'`
    )

    if (tables.length === 0) {
      // 1. 创建商家积分审核表
      await queryInterface.createTable(
        'merchant_points_reviews',
        {
          // 主键：审核单ID（UUID格式）
          review_id: {
            type: Sequelize.STRING(100),
            primaryKey: true,
            allowNull: false,
            comment: '审核单ID（UUID格式）'
          },

          // 用户ID：申请审核的用户
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'users',
              key: 'user_id'
            },
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
            comment: '用户ID（申请审核的用户）'
          },

          // 商家ID：扫码审核的商家（也是users表的用户）
          merchant_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'users',
              key: 'user_id'
            },
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
            comment: '商家ID（扫码审核的商家）'
          },

          // 审核积分金额
          points_amount: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '审核积分金额（冻结金额）'
          },

          // 审核状态
          status: {
            type: Sequelize.ENUM('pending', 'approved', 'rejected', 'expired', 'cancelled'),
            allowNull: false,
            defaultValue: 'pending',
            comment:
              '审核状态：pending=审核中/approved=审核通过/rejected=审核拒绝/expired=审核超时/cancelled=已取消'
          },

          // 审核超时时间
          expires_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '审核超时时间（超时后需客服处理）'
          },

          // 幂等键（防止重复提交）
          idempotency_key: {
            type: Sequelize.STRING(100),
            allowNull: false,
            unique: true,
            comment: '幂等键（防止重复提交审核）'
          },

          // 二维码数据
          qr_code_data: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '二维码数据（扫码时的原始数据）'
          },

          // 审核元数据（JSON格式）
          metadata: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '审核元数据（商家信息、扫码时间、处理信息等）'
          },

          // 创建时间
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间'
          },

          // 更新时间
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
          comment: '商家积分审核表（扫码审核冻结积分）'
        }
      )
      console.log('✅ merchant_points_reviews 表创建成功')
    } else {
      console.log('⏭️ merchant_points_reviews 表已存在，跳过创建')
    }

    // 2. 创建索引（检查是否已存在）
    const indexesToAdd = [
      { name: 'idx_mpr_user_status', fields: ['user_id', 'status'] },
      { name: 'idx_mpr_merchant_status', fields: ['merchant_id', 'status'] },
      { name: 'idx_mpr_expires_at', fields: ['expires_at'] },
      { name: 'idx_mpr_status', fields: ['status'] }
    ]

    for (const idx of indexesToAdd) {
      const [existing] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM merchant_points_reviews WHERE Key_name = '${idx.name}'`
      )
      if (existing.length === 0) {
        await queryInterface.addIndex('merchant_points_reviews', idx.fields, { name: idx.name })
        console.log(`✅ 索引 ${idx.name} 添加成功`)
      } else {
        console.log(`⏭️ 索引 ${idx.name} 已存在，跳过`)
      }
    }

    console.log('✅ 成功创建 merchant_points_reviews 表及索引')
  },

  async down(queryInterface) {
    // 删除表（会自动删除索引和外键）
    await queryInterface.dropTable('merchant_points_reviews')
    console.log('✅ 成功删除 merchant_points_reviews 表')
  }
}
