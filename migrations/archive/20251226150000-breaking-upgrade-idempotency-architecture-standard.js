/**
 * 餐厅积分抽奖系统 V4.3 - 数据库迁移（破坏性升级）
 *
 * 迁移内容：asset_transactions 表幂等性架构升级到业界标准（方案B）
 *
 * 破坏性变更：
 * 1. 删除 business_id 字段 - 不再需要，幂等性由 idempotency_key 独立承担
 * 2. 删除 uk_business_idempotency 索引 - 旧幂等机制
 * 3. 修改 lottery_session_id 为可 NULL - 非抽奖业务可为 NULL
 * 4. 创建 api_idempotency_requests 表 - 入口幂等表
 *
 * 业务背景：
 * - 采用"入口幂等 + 内部派生"业界标准两层架构
 * - lottery_session_id: 只负责"关联同一业务事件的多条记录"
 * - idempotency_key: 独立承担"防止重复入账"的责任
 * - api_idempotency_requests: 实现"重试返回首次结果"
 *
 * 注意：此迁移为破坏性升级，会归档现有数据
 *
 * 创建时间：2025年12月26日
 * 方案类型：方案B - 破坏性升级版
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：破坏性升级到业界标准幂等架构
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  async up(queryInterface, Sequelize) {
    console.log('开始迁移：asset_transactions 业界标准幂等架构升级（方案B - 破坏性升级）...')
    console.log('⚠️ 警告：此迁移为破坏性升级，将删除 business_id 字段')

    // ========================================
    // 步骤1：创建入口幂等表 api_idempotency_requests
    // ========================================
    console.log('\n=== 步骤1：创建入口幂等表 api_idempotency_requests ===')

    const [existingTables] = await queryInterface.sequelize.query(`
      SHOW TABLES LIKE 'api_idempotency_requests'
    `)

    if (existingTables.length === 0) {
      await queryInterface.createTable(
        'api_idempotency_requests',
        {
          // 主键 - 请求记录ID
          request_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '请求记录ID（主键）'
          },

          // 幂等键 - 全局唯一
          idempotency_key: {
            type: Sequelize.STRING(100),
            allowNull: false,
            unique: true,
            comment: '幂等键（客户端生成或服务端生成，全局唯一）'
          },

          // API路径
          api_path: {
            type: Sequelize.STRING(200),
            allowNull: false,
            comment: 'API路径（如 /api/v4/lottery/draw）'
          },

          // HTTP方法
          http_method: {
            type: Sequelize.STRING(10),
            allowNull: false,
            defaultValue: 'POST',
            comment: 'HTTP方法（POST/PUT/DELETE）'
          },

          // 请求参数哈希 - 用于检测参数冲突
          request_hash: {
            type: Sequelize.STRING(64),
            allowNull: false,
            comment: '请求参数哈希（用于检测参数冲突）'
          },

          // 请求参数快照 - 用于审计和冲突检测
          request_params: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '请求参数快照（用于审计和冲突检测）'
          },

          // 用户ID
          user_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '用户ID（关联 users.user_id）'
          },

          // 处理状态
          status: {
            type: Sequelize.ENUM('processing', 'completed', 'failed'),
            allowNull: false,
            defaultValue: 'processing',
            comment: '处理状态：processing-处理中，completed-已完成，failed-失败'
          },

          // 业务事件ID - 如 lottery_session_id
          business_event_id: {
            type: Sequelize.STRING(100),
            allowNull: true,
            comment: '业务事件ID（如 lottery_session_id，用于关联业务记录）'
          },

          // 响应结果快照 - 重试时直接返回
          response_snapshot: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '响应结果快照（重试时直接返回）'
          },

          // 响应业务代码
          response_code: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '响应业务代码（如 DRAW_SUCCESS）'
          },

          // 请求创建时间
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '请求创建时间'
          },

          // 请求完成时间
          completed_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '请求完成时间'
          },

          // 过期时间 - 超过此时间可清理
          expires_at: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '过期时间（24小时后可清理）'
          }
        },
        {
          engine: 'InnoDB',
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: 'API入口幂等表 - 记录每次请求的处理状态和结果快照，实现重试返回首次结果'
        }
      )

      console.log('  ✅ api_idempotency_requests 表已创建')

      // 添加索引
      await queryInterface.addIndex('api_idempotency_requests', {
        fields: ['user_id', 'created_at'],
        name: 'idx_user_created',
        comment: '索引：用户ID + 创建时间（用于用户请求历史查询）'
      })
      console.log('  ✅ 索引 idx_user_created 已创建')

      await queryInterface.addIndex('api_idempotency_requests', {
        fields: ['status', 'expires_at'],
        name: 'idx_status_expires',
        comment: '索引：状态 + 过期时间（用于清理过期记录）'
      })
      console.log('  ✅ 索引 idx_status_expires 已创建')

      await queryInterface.addIndex('api_idempotency_requests', {
        fields: ['business_event_id'],
        name: 'idx_business_event',
        comment: '索引：业务事件ID（用于关联业务记录查询）'
      })
      console.log('  ✅ 索引 idx_business_event 已创建')
    } else {
      console.log('  ✅ api_idempotency_requests 表已存在，跳过')
    }

    // ========================================
    // 步骤2：归档现有 asset_transactions 数据
    // ========================================
    console.log('\n=== 步骤2：归档现有 asset_transactions 数据 ===')

    const [countResult] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as cnt FROM asset_transactions
    `)
    const recordCount = countResult[0].cnt
    console.log(`  当前记录数: ${recordCount}`)

    if (recordCount > 0) {
      // 检查归档表是否存在
      const [archiveTables] = await queryInterface.sequelize.query(`
        SHOW TABLES LIKE 'asset_transactions_archive_20251226'
      `)

      if (archiveTables.length === 0) {
        console.log('  创建归档表并复制数据...')
        await queryInterface.sequelize.query(`
          CREATE TABLE asset_transactions_archive_20251226 AS
          SELECT * FROM asset_transactions
        `)
        console.log(`  ✅ 已归档 ${recordCount} 条记录到 asset_transactions_archive_20251226`)
      } else {
        console.log('  ✅ 归档表已存在，跳过归档')
      }

      // 清空原表
      console.log('  清空 asset_transactions 表...')
      await queryInterface.sequelize.query(`
        TRUNCATE TABLE asset_transactions
      `)
      console.log('  ✅ asset_transactions 表已清空')
    } else {
      console.log('  ✅ 无数据需要归档')
    }

    // ========================================
    // 步骤3：删除旧幂等索引 uk_business_idempotency
    // ========================================
    console.log('\n=== 步骤3：删除旧幂等索引 uk_business_idempotency ===')

    const [existingIndex] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM asset_transactions
      WHERE Key_name = 'uk_business_idempotency'
    `)

    if (existingIndex.length > 0) {
      await queryInterface.removeIndex('asset_transactions', 'uk_business_idempotency')
      console.log('  ✅ 已删除索引 uk_business_idempotency')
    } else {
      console.log('  ✅ 索引 uk_business_idempotency 不存在，跳过')
    }

    // ========================================
    // 步骤4：删除 business_id 字段
    // ========================================
    console.log('\n=== 步骤4：删除 business_id 字段 ===')

    const [columns] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'asset_transactions'
        AND COLUMN_NAME = 'business_id'
    `)

    if (columns.length > 0) {
      await queryInterface.removeColumn('asset_transactions', 'business_id')
      console.log('  ✅ 已删除字段 business_id')
    } else {
      console.log('  ✅ 字段 business_id 不存在，跳过')
    }

    // ========================================
    // 步骤5：修改 lottery_session_id 为可 NULL
    // ========================================
    console.log('\n=== 步骤5：修改 lottery_session_id 为可 NULL ===')

    await queryInterface.changeColumn('asset_transactions', 'lottery_session_id', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: '抽奖会话ID（仅抽奖业务使用，非抽奖业务可为NULL，用于关联 consume+reward）'
    })
    console.log('  ✅ lottery_session_id 已修改为允许 NULL')

    // ========================================
    // 步骤6：修改 idempotency_key 注释
    // ========================================
    console.log('\n=== 步骤6：更新 idempotency_key 字段注释 ===')

    await queryInterface.changeColumn('asset_transactions', 'idempotency_key', {
      type: Sequelize.STRING(100),
      allowNull: false,
      unique: true,
      comment:
        '幂等键（每条流水唯一）：抽奖格式 {request_key}:consume/{request_key}:reward，其他格式 {type}_{account}_{ts}_{random}'
    })
    console.log('  ✅ idempotency_key 注释已更新')

    // ========================================
    // 步骤7：验证最终结果
    // ========================================
    console.log('\n=== 步骤7：验证最终结果 ===')

    // 验证 asset_transactions 表结构
    const [finalColumns] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'asset_transactions'
      ORDER BY ORDINAL_POSITION
    `)

    console.log('asset_transactions 表最终字段:')
    finalColumns.forEach(col => {
      console.log(`  - ${col.COLUMN_NAME}: ${col.COLUMN_TYPE}, NULL=${col.IS_NULLABLE}`)
    })

    // 验证 business_id 已删除
    const hasBusinessId = finalColumns.some(col => col.COLUMN_NAME === 'business_id')
    if (hasBusinessId) {
      throw new Error('business_id 字段仍然存在，迁移失败')
    }
    console.log('  ✅ business_id 字段已确认删除')

    // 验证 lottery_session_id 允许 NULL
    const lotterySessionCol = finalColumns.find(col => col.COLUMN_NAME === 'lottery_session_id')
    if (lotterySessionCol && lotterySessionCol.IS_NULLABLE !== 'YES') {
      throw new Error('lottery_session_id 字段未设置为允许 NULL')
    }
    console.log('  ✅ lottery_session_id 已确认允许 NULL')

    // 验证索引
    const [finalIndexes] = await queryInterface.sequelize.query(`
      SELECT INDEX_NAME, NON_UNIQUE
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'asset_transactions'
      GROUP BY INDEX_NAME, NON_UNIQUE
    `)

    console.log('asset_transactions 表最终索引:')
    finalIndexes.forEach(idx => {
      console.log(`  - ${idx.INDEX_NAME}: ${idx.NON_UNIQUE === 0 ? 'UNIQUE' : 'INDEX'}`)
    })

    // 验证 uk_business_idempotency 已删除
    const hasOldIndex = finalIndexes.some(idx => idx.INDEX_NAME === 'uk_business_idempotency')
    if (hasOldIndex) {
      throw new Error('uk_business_idempotency 索引仍然存在，迁移失败')
    }
    console.log('  ✅ uk_business_idempotency 索引已确认删除')

    // 验证 api_idempotency_requests 表
    const [idempotencyTables] = await queryInterface.sequelize.query(`
      SHOW TABLES LIKE 'api_idempotency_requests'
    `)

    if (idempotencyTables.length === 0) {
      throw new Error('api_idempotency_requests 表不存在，迁移失败')
    }
    console.log('  ✅ api_idempotency_requests 表已确认存在')

    console.log('\n✅ 业界标准幂等架构升级完成（方案B - 破坏性升级）')
    console.log('📋 验收清单：')
    console.log('  [✓] asset_transactions 表无 business_id 字段')
    console.log('  [✓] asset_transactions 表无 uk_business_idempotency 索引')
    console.log('  [✓] asset_transactions.lottery_session_id 允许 NULL')
    console.log('  [✓] api_idempotency_requests 表已创建')
  },

  /**
   * 回滚迁移：恢复到方案A状态
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  async down(queryInterface, Sequelize) {
    console.log('回滚迁移：恢复到方案A状态...')
    console.log('⚠️ 警告：回滚将删除 api_idempotency_requests 表，并恢复 business_id 字段')

    // 1. 删除 api_idempotency_requests 表
    console.log('\n=== 步骤1：删除 api_idempotency_requests 表 ===')

    const [existingTables] = await queryInterface.sequelize.query(`
      SHOW TABLES LIKE 'api_idempotency_requests'
    `)

    if (existingTables.length > 0) {
      await queryInterface.dropTable('api_idempotency_requests')
      console.log('  ✅ 已删除 api_idempotency_requests 表')
    } else {
      console.log('  ✅ api_idempotency_requests 表不存在，跳过')
    }

    // 2. 添加 business_id 字段
    console.log('\n=== 步骤2：添加 business_id 字段 ===')

    const [columns] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'asset_transactions'
        AND COLUMN_NAME = 'business_id'
    `)

    if (columns.length === 0) {
      await queryInterface.addColumn('asset_transactions', 'business_id', {
        type: Sequelize.STRING(100),
        allowNull: false,
        defaultValue: '',
        comment: '业务唯一标识（Business ID）：与business_type组合确保幂等性，兼容旧逻辑'
      })
      console.log('  ✅ 已添加字段 business_id')
    } else {
      console.log('  ✅ 字段 business_id 已存在，跳过')
    }

    // 3. 添加 uk_business_idempotency 索引
    console.log('\n=== 步骤3：添加 uk_business_idempotency 索引 ===')

    const [existingIndex] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM asset_transactions
      WHERE Key_name = 'uk_business_idempotency'
    `)

    if (existingIndex.length === 0) {
      await queryInterface.addIndex('asset_transactions', {
        fields: ['business_id', 'business_type'],
        unique: true,
        name: 'uk_business_idempotency',
        type: 'UNIQUE'
      })
      console.log('  ✅ 已添加索引 uk_business_idempotency')
    } else {
      console.log('  ✅ 索引 uk_business_idempotency 已存在，跳过')
    }

    // 4. 修改 lottery_session_id 为 NOT NULL
    console.log('\n=== 步骤4：修改 lottery_session_id 为 NOT NULL ===')

    await queryInterface.changeColumn('asset_transactions', 'lottery_session_id', {
      type: Sequelize.STRING(100),
      allowNull: false,
      comment: '抽奖会话ID（一次抽奖对应多条事务记录，如 consume + reward）'
    })
    console.log('  ✅ lottery_session_id 已修改为 NOT NULL')

    // 5. 从归档表恢复数据（如果存在）
    console.log('\n=== 步骤5：从归档表恢复数据 ===')

    const [archiveTables] = await queryInterface.sequelize.query(`
      SHOW TABLES LIKE 'asset_transactions_archive_20251226'
    `)

    if (archiveTables.length > 0) {
      // 检查归档表中的数据量
      const [archiveCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as cnt FROM asset_transactions_archive_20251226
      `)

      if (archiveCount[0].cnt > 0) {
        console.log(`  从归档表恢复 ${archiveCount[0].cnt} 条记录...`)
        await queryInterface.sequelize.query(`
          INSERT INTO asset_transactions
          SELECT * FROM asset_transactions_archive_20251226
        `)
        console.log(`  ✅ 已恢复 ${archiveCount[0].cnt} 条记录`)
      } else {
        console.log('  ✅ 归档表无数据，跳过恢复')
      }
    } else {
      console.log('  ⚠️ 归档表不存在，无法恢复数据')
    }

    console.log('\n✅ 回滚完成（已恢复到方案A状态）')
  }
}
