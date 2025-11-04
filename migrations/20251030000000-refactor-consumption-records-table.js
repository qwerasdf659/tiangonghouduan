/**
 * 餐厅积分抽奖系统 V4.0 - 数据库迁移
 *
 * 迁移名称：重构consumption_records表以符合方案A（商家扫码录入方案）
 * 迁移类型：alter-table（修改表结构）
 * 版本号：v4.1.0
 * 创建时间：2025-10-30
 *
 * 变更说明：
 * 1. 重命名主键：consumption_id → record_id
 * 2. 重命名字段：points_to_earn → points_to_award
 * 3. 重命名字段：qr_code_data → qr_code
 * 4. 重命名字段：merchant_remarks → merchant_notes
 * 5. 添加字段：admin_notes（平台审核备注）
 * 6. 添加字段：reviewed_by（审核员ID）
 * 7. 添加字段：reviewed_at（审核时间）
 * 8. 删除不必要的字段：consumption_code, consumption_description, receipt_images, scan_time等
 * 9. 调整status枚举值：保留pending/approved/rejected，添加expired
 * 10. 调整索引结构以符合文档要求
 *
 * 依赖关系：
 * - 依赖consumption_records表已存在
 * - 依赖users表（外键关联）
 *
 * 影响范围：
 * - 修改consumption_records表结构
 * - 需要同步修改ConsumptionRecord模型
 * - 需要同步修改相关API和服务代码
 */

'use strict'

module.exports = {
  /**
   * 执行迁移（up方向）
   * @param {import('sequelize').QueryInterface} queryInterface - Sequelize查询接口
   * @param {import('sequelize')} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始重构consumption_records表...')

      /*
       * ========================================
       * 第1步：删除外键约束（必须先删除，否则无法删除索引）
       * ========================================
       */
      console.log('步骤1：删除外键约束')

      // 检查并删除外键约束（有些约束可能已被删除）
      const removeConstraintSafely = async (constraintName) => {
        try {
          await queryInterface.removeConstraint('consumption_records', constraintName, { transaction })
          console.log(`  已删除外键约束: ${constraintName}`)
        } catch (error) {
          if (error.message.includes('does not exist')) {
            console.log(`  外键约束不存在，跳过: ${constraintName}`)
          } else {
            throw error
          }
        }
      }

      await removeConstraintSafely('consumption_records_ibfk_1')
      await removeConstraintSafely('consumption_records_ibfk_2')

      /*
       * ========================================
       * 第2步：删除所有现有索引（除了主键）
       * ========================================
       */
      console.log('步骤2：删除现有索引')

      // 检查并删除索引（有些索引可能已被删除）
      const removeIndexSafely = async (indexName) => {
        try {
          await queryInterface.removeIndex('consumption_records', indexName, { transaction })
          console.log(`  已删除索引: ${indexName}`)
        } catch (error) {
          if (error.message.includes('Can\'t DROP')) {
            console.log(`  索引不存在，跳过: ${indexName}`)
          } else {
            throw error
          }
        }
      }

      await removeIndexSafely('consumption_code')
      await removeIndexSafely('idx_cr_consumption_code')
      await removeIndexSafely('idx_cr_user_id')
      await removeIndexSafely('idx_cr_merchant_id')
      await removeIndexSafely('idx_cr_status')
      await removeIndexSafely('idx_cr_submitted_at')
      await removeIndexSafely('idx_cr_expires_at')

      /*
       * ========================================
       * 第3步：删除不需要的字段
       * ========================================
       */
      console.log('步骤3：删除不需要的字段')

      // 检查并删除字段（有些字段可能已被删除）
      const removeColumnSafely = async (columnName) => {
        try {
          await queryInterface.removeColumn('consumption_records', columnName, { transaction })
          console.log(`  已删除字段: ${columnName}`)
        } catch (error) {
          if (error.message.includes('check that') || error.message.includes('doesn\'t exist') || error.message.includes('Can\'t DROP')) {
            console.log(`  字段不存在，跳过: ${columnName}`)
          } else {
            throw error
          }
        }
      }

      await removeColumnSafely('consumption_code')
      await removeColumnSafely('consumption_description')
      await removeColumnSafely('receipt_images')
      await removeColumnSafely('scan_time')
      await removeColumnSafely('submitted_at')
      await removeColumnSafely('expires_at')
      await removeColumnSafely('audited_at')
      await removeColumnSafely('client_ip')
      await removeColumnSafely('device_info')

      /*
       * ========================================
       * 第4步：处理audit_records表的外键约束（如果存在）
       * ========================================
       */
      console.log('步骤4：处理audit_records表的外键约束')

      // 检查audit_records表是否存在
      const [auditTableExists] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = \'restaurant_points_dev\' AND TABLE_NAME = \'audit_records\'',
        { transaction }
      )

      if (auditTableExists[0].count > 0) {
        console.log('  audit_records表存在，需要处理外键')

        // 检查audit_records中的字段名
        const [auditColumns] = await queryInterface.sequelize.query(
          'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = \'restaurant_points_dev\' AND TABLE_NAME = \'audit_records\' AND COLUMN_NAME IN (\'consumption_id\', \'record_id\')',
          { transaction }
        )

        const hasConsumptionId = auditColumns.some(col => col.COLUMN_NAME === 'consumption_id')
        const hasRecordId = auditColumns.some(col => col.COLUMN_NAME === 'record_id')

        console.log(`  audit_records字段检查: consumption_id=${hasConsumptionId}, record_id=${hasRecordId}`)

        if (hasConsumptionId) {
          // 删除audit_records对consumption_records的外键
          try {
            await queryInterface.removeConstraint('audit_records', 'audit_records_ibfk_1', { transaction })
            console.log('  已删除audit_records表的外键约束: audit_records_ibfk_1')
          } catch (error) {
            if (error.message.includes('does not exist')) {
              console.log('  audit_records表的外键约束不存在，跳过: audit_records_ibfk_1')
            } else {
              throw error
            }
          }

          // 重命名audit_records中的consumption_id字段为record_id
          try {
            await queryInterface.renameColumn('audit_records', 'consumption_id', 'record_id', { transaction })
            console.log('  已重命名audit_records.consumption_id为record_id')
          } catch (error) {
            console.warn('  重命名audit_records.consumption_id失败:', error.message)
          }
        } else if (hasRecordId) {
          console.log('  audit_records.record_id已存在，无需重命名')
        }
      } else {
        console.log('  audit_records表不存在，无需处理')
      }

      /*
       * ========================================
       * 第5步：重命名consumption_records的主键字段
       * ========================================
       */
      console.log('步骤5：重命名主键字段')

      await queryInterface.renameColumn('consumption_records', 'consumption_id', 'record_id', { transaction })
      await queryInterface.renameColumn('consumption_records', 'points_to_earn', 'points_to_award', { transaction })
      await queryInterface.renameColumn('consumption_records', 'qr_code_data', 'qr_code', { transaction })
      await queryInterface.renameColumn('consumption_records', 'merchant_remarks', 'merchant_notes', { transaction })

      /*
       * ========================================
       * 第6步：修改字段类型和约束
       * ========================================
       */
      console.log('步骤6：修改字段类型')

      // 修改qr_code字段：从TEXT改为VARCHAR(100)
      await queryInterface.changeColumn('consumption_records', 'qr_code', {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: '用户固定身份码（格式：QR_{user_id}_{signature}）'
      }, { transaction })

      // 修改points_to_award字段：从DECIMAL改为INT
      await queryInterface.changeColumn('consumption_records', 'points_to_award', {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '预计奖励积分数（单位：分），计算规则：Math.round(consumption_amount)，即1元=1分，四舍五入'
      }, { transaction })

      // 修改status枚举值
      await queryInterface.changeColumn('consumption_records', 'status', {
        type: Sequelize.ENUM('pending', 'approved', 'rejected', 'expired'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '状态：pending-待审核，approved-已通过，rejected-已拒绝，expired-已过期'
      }, { transaction })

      /*
       * ========================================
       * 第7步：添加新字段
       * ========================================
       */
      console.log('步骤7：添加新字段')

      // 添加admin_notes字段（平台审核备注）
      await queryInterface.addColumn('consumption_records', 'admin_notes', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: '平台审核备注（审核员填写）'
      }, { transaction })

      // 添加reviewed_by字段（审核员ID）
      await queryInterface.addColumn('consumption_records', 'reviewed_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '审核员ID（谁审核的？）'
      }, { transaction })

      // 添加reviewed_at字段（审核时间）
      await queryInterface.addColumn('consumption_records', 'reviewed_at', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '审核时间（什么时候审核的？），时区：北京时间（GMT+8）'
      }, { transaction })

      /*
       * ========================================
       * 第8步：创建新索引（符合文档方案A的索引设计）
       * ========================================
       */
      console.log('步骤8：创建新索引')

      // 索引1：用户查询自己的消费记录（最常用查询）
      await queryInterface.addIndex('consumption_records', ['user_id', 'status', 'created_at'], {
        name: 'idx_user_status',
        transaction
      })

      // 索引2：商家查询自己录入的记录
      await queryInterface.addIndex('consumption_records', ['merchant_id', 'created_at'], {
        name: 'idx_merchant_time',
        transaction
      })

      // 索引3：平台审核查询待审核记录（核心审核功能）
      await queryInterface.addIndex('consumption_records', ['status', 'created_at'], {
        name: 'idx_status_created',
        transaction
      })

      // 索引4：二维码追溯查询（防重复、安全审计）
      await queryInterface.addIndex('consumption_records', ['qr_code'], {
        name: 'idx_qr_code',
        transaction
      })

      // 索引5：审核员工作量统计
      await queryInterface.addIndex('consumption_records', ['reviewed_by', 'reviewed_at'], {
        name: 'idx_reviewed',
        transaction
      })

      /*
       * ========================================
       * 第9步：修改merchant_id为允许NULL（外键SET NULL需要）
       * ========================================
       */
      console.log('步骤9：修改merchant_id为允许NULL')

      await queryInterface.changeColumn('consumption_records', 'merchant_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '商家ID（录入人，可为空）'
      }, { transaction })

      /*
       * ========================================
       * 第10步：重新创建外键约束
       * ========================================
       */
      console.log('步骤10：重新创建外键约束')

      // 添加user_id外键约束
      await queryInterface.addConstraint('consumption_records', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'consumption_records_ibfk_1',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction
      })

      // 添加merchant_id外键约束
      await queryInterface.addConstraint('consumption_records', {
        fields: ['merchant_id'],
        type: 'foreign key',
        name: 'consumption_records_ibfk_2',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction
      })

      // 添加reviewed_by外键约束（新增字段的外键）
      await queryInterface.addConstraint('consumption_records', {
        fields: ['reviewed_by'],
        type: 'foreign key',
        name: 'consumption_records_ibfk_3',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction
      })

      /*
       * ========================================
       * 第11步：恢复audit_records的外键（如果存在）
       * ========================================
       */
      if (auditTableExists[0].count > 0) {
        console.log('步骤11：恢复audit_records的外键')
        try {
          await queryInterface.addConstraint('audit_records', {
            fields: ['record_id'],
            type: 'foreign key',
            name: 'audit_records_ibfk_1',
            references: {
              table: 'consumption_records',
              field: 'record_id'
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
            transaction
          })
          console.log('  已恢复audit_records的外键约束')
        } catch (error) {
          console.warn('  恢复audit_records外键失败:', error.message)
        }
      }

      /*
       * ========================================
       * 第12步：提交事务
       * ========================================
       */
      await transaction.commit()
      console.log('✅ consumption_records表重构完成')
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移（down方向）
   * @param {import('sequelize').QueryInterface} queryInterface - Sequelize查询接口
   * @param {import('sequelize')} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  async down (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始回滚consumption_records表重构...')

      // 删除新索引
      await queryInterface.removeIndex('consumption_records', 'idx_user_status', { transaction })
      await queryInterface.removeIndex('consumption_records', 'idx_merchant_time', { transaction })
      await queryInterface.removeIndex('consumption_records', 'idx_status_created', { transaction })
      await queryInterface.removeIndex('consumption_records', 'idx_qr_code', { transaction })
      await queryInterface.removeIndex('consumption_records', 'idx_reviewed', { transaction })

      // 删除新添加的字段
      await queryInterface.removeColumn('consumption_records', 'admin_notes', { transaction })
      await queryInterface.removeColumn('consumption_records', 'reviewed_by', { transaction })
      await queryInterface.removeColumn('consumption_records', 'reviewed_at', { transaction })

      // 重命名字段（恢复原名）
      await queryInterface.renameColumn('consumption_records', 'record_id', 'consumption_id', { transaction })
      await queryInterface.renameColumn('consumption_records', 'points_to_award', 'points_to_earn', { transaction })
      await queryInterface.renameColumn('consumption_records', 'qr_code', 'qr_code_data', { transaction })
      await queryInterface.renameColumn('consumption_records', 'merchant_notes', 'merchant_remarks', { transaction })

      // 恢复原字段
      await queryInterface.addColumn('consumption_records', 'consumption_code', {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      }, { transaction })

      await queryInterface.addColumn('consumption_records', 'consumption_description', {
        type: Sequelize.STRING(500),
        allowNull: true
      }, { transaction })

      await queryInterface.addColumn('consumption_records', 'receipt_images', {
        type: Sequelize.JSON,
        allowNull: true
      }, { transaction })

      await queryInterface.addColumn('consumption_records', 'scan_time', {
        type: Sequelize.DATE,
        allowNull: false
      }, { transaction })

      await queryInterface.addColumn('consumption_records', 'submitted_at', {
        type: Sequelize.DATE,
        allowNull: false
      }, { transaction })

      await queryInterface.addColumn('consumption_records', 'expires_at', {
        type: Sequelize.DATE,
        allowNull: false
      }, { transaction })

      await queryInterface.addColumn('consumption_records', 'audited_at', {
        type: Sequelize.DATE,
        allowNull: true
      }, { transaction })

      await queryInterface.addColumn('consumption_records', 'client_ip', {
        type: Sequelize.STRING(45),
        allowNull: true
      }, { transaction })

      await queryInterface.addColumn('consumption_records', 'device_info', {
        type: Sequelize.JSON,
        allowNull: true
      }, { transaction })

      // 恢复原索引
      await queryInterface.addIndex('consumption_records', ['consumption_code'], {
        name: 'consumption_code',
        unique: true,
        transaction
      })

      await queryInterface.addIndex('consumption_records', ['user_id'], {
        name: 'idx_cr_user_id',
        transaction
      })

      await queryInterface.addIndex('consumption_records', ['merchant_id'], {
        name: 'idx_cr_merchant_id',
        transaction
      })

      await queryInterface.addIndex('consumption_records', ['status'], {
        name: 'idx_cr_status',
        transaction
      })

      await queryInterface.addIndex('consumption_records', ['submitted_at'], {
        name: 'idx_cr_submitted_at',
        transaction
      })

      await queryInterface.addIndex('consumption_records', ['expires_at'], {
        name: 'idx_cr_expires_at',
        transaction
      })

      await transaction.commit()
      console.log('✅ consumption_records表回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
