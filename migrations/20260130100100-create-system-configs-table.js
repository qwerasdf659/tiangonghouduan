/**
 * 📋 系统配置表迁移
 * 创建时间：2026年01月30日 北京时间
 *
 * 业务职责：
 * - 存储可动态调整的系统配置参数
 * - 支持批量操作的限流配置
 * - 便于运营人员在不修改代码的情况下调整系统行为
 *
 * 技术决策来源（文档 6.5 节）：
 * - 批量操作限流参数可动态配置
 * - 通过 SystemConfigService 提供 Redis 缓存 + 数据库回落
 * - config_value 采用 JSON 格式，支持复杂配置结构
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：创建 system_configs 表并插入初始数据
   * @param {QueryInterface} queryInterface - Sequelize 查询接口
   * @param {Sequelize} Sequelize - Sequelize 类型定义
   */
  async up(queryInterface, Sequelize) {
    console.log('🆕 开始创建 system_configs 表...')

    // 检查表是否已存在（幂等迁移）
    const tableExists = await queryInterface.sequelize.query(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'system_configs'",
      { type: Sequelize.QueryTypes.SELECT }
    )

    if (tableExists[0].count > 0) {
      console.log('⚠️ system_configs 表已存在，跳过创建')
      return
    }

    // 创建表结构
    await queryInterface.createTable(
      'system_configs',
      {
        // ==================== 主键 ====================
        config_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '配置ID（主键，自增）'
        },

        // ==================== 配置键值 ====================
        config_key: {
          type: Sequelize.STRING(100),
          allowNull: false,
          unique: true,
          comment: '配置键（唯一，如 batch_rate_limit_quota_grant）'
        },

        config_value: {
          type: Sequelize.JSON,
          allowNull: false,
          comment: '配置值JSON（支持复杂配置结构）'
        },

        // ==================== 描述与状态 ====================
        description: {
          type: Sequelize.STRING(500),
          allowNull: true,
          comment: '配置说明（便于运营人员理解配置用途）'
        },

        config_category: {
          type: Sequelize.STRING(50),
          allowNull: false,
          defaultValue: 'general',
          comment: '配置分类：batch_operation=批量操作 | rate_limit=限流 | feature=功能开关 | general=通用'
        },

        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: '是否启用：true=启用 | false=禁用'
        },

        // ==================== 时间戳 ====================
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
        comment: '系统配置表 - 可动态调整的系统参数（阶段C核心基础设施）',
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci'
      }
    )

    console.log('✅ system_configs 表创建完成')

    // ==================== 创建索引 ====================
    console.log('📇 开始创建索引...')

    // 索引1: 配置键唯一索引（已在字段定义中通过 unique: true 创建）
    await queryInterface.addIndex('system_configs', ['config_key'], {
      name: 'idx_system_configs_key',
      unique: true,
      comment: '配置键唯一索引 - 支持快速按键查询'
    })

    // 索引2: 分类+启用状态联合索引
    await queryInterface.addIndex('system_configs', ['config_category', 'is_active'], {
      name: 'idx_system_configs_category_active',
      comment: '分类+状态索引 - 支持按分类查询启用的配置'
    })

    console.log('✅ system_configs 索引创建完成')

    // ==================== 插入初始配置数据 ====================
    console.log('📝 开始插入批量操作限流配置初始数据...')

    const initialConfigs = [
      {
        config_key: 'batch_rate_limit_quota_grant',
        config_value: JSON.stringify({
          max_items_per_request: 100, // 单次最多处理100个用户
          cooldown_seconds: 60, // 冷却时间60秒
          description: '批量赠送抽奖次数限流配置'
        }),
        description: 'B6批量赠送抽奖次数 - 限流配置：每次最多100个用户，冷却60秒',
        config_category: 'batch_operation',
        is_active: true
      },
      {
        config_key: 'batch_rate_limit_preset',
        config_value: JSON.stringify({
          max_items_per_request: 50, // 单次最多处理50条规则
          cooldown_seconds: 60, // 冷却时间60秒
          description: '批量设置干预规则限流配置'
        }),
        description: 'B7批量设置干预规则 - 限流配置：每次最多50条规则，冷却60秒',
        config_category: 'batch_operation',
        is_active: true
      },
      {
        config_key: 'batch_rate_limit_redemption',
        config_value: JSON.stringify({
          max_items_per_request: 200, // 单次最多处理200个核销
          cooldown_seconds: 30, // 冷却时间30秒
          description: '批量核销确认限流配置'
        }),
        description: 'B8批量核销确认 - 限流配置：每次最多200个订单，冷却30秒',
        config_category: 'batch_operation',
        is_active: true
      },
      {
        config_key: 'batch_rate_limit_campaign_status',
        config_value: JSON.stringify({
          max_items_per_request: 20, // 单次最多处理20个活动
          cooldown_seconds: 120, // 冷却时间120秒（活动状态切换是高风险操作）
          description: '批量活动状态切换限流配置'
        }),
        description: 'B9批量活动状态切换 - 限流配置：每次最多20个活动，冷却120秒',
        config_category: 'batch_operation',
        is_active: true
      },
      {
        config_key: 'batch_rate_limit_budget',
        config_value: JSON.stringify({
          max_items_per_request: 20, // 单次最多处理20个活动
          cooldown_seconds: 120, // 冷却时间120秒（预算调整是高风险操作）
          description: '批量预算调整限流配置'
        }),
        description: 'B10批量预算调整 - 限流配置：每次最多20个活动，冷却120秒',
        config_category: 'batch_operation',
        is_active: true
      },
      {
        config_key: 'batch_operation_global',
        config_value: JSON.stringify({
          max_concurrent_batches: 3, // 同一操作人最大并发批量操作数
          default_retry_count: 3, // 失败重试次数
          retry_delay_seconds: 5, // 重试间隔秒数
          idempotency_key_ttl_hours: 24, // 幂等键有效期（小时）
          description: '批量操作全局配置'
        }),
        description: '批量操作全局配置 - 并发限制、重试策略、幂等键有效期',
        config_category: 'batch_operation',
        is_active: true
      }
    ]

    await queryInterface.bulkInsert('system_configs', initialConfigs.map(config => ({
      ...config,
      created_at: new Date(),
      updated_at: new Date()
    })))

    console.log(`✅ 插入 ${initialConfigs.length} 条初始配置数据完成`)
  },

  /**
   * 回滚迁移：删除 system_configs 表
   * @param {QueryInterface} queryInterface - Sequelize 查询接口
   * @param {Sequelize} Sequelize - Sequelize 类型定义
   */
  async down(queryInterface, Sequelize) {
    console.log('🗑️ 开始删除 system_configs 表...')

    // 检查表是否存在
    const tableExists = await queryInterface.sequelize.query(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'system_configs'",
      { type: Sequelize.QueryTypes.SELECT }
    )

    if (tableExists[0].count === 0) {
      console.log('⚠️ system_configs 表不存在，跳过删除')
      return
    }

    // 删除表（索引会随表一起删除）
    await queryInterface.dropTable('system_configs')

    console.log('✅ system_configs 表删除完成')
  }
}

