/**
 * 数据库迁移：创建system_settings系统设置表
 *
 * 业务背景：
 * 为了统一管理系统的各类配置（基础设置、抽奖设置、积分设置、通知设置、安全设置），
 * 需要创建system_settings表来存储和管理这些配置项
 *
 * 具体变更：
 * 1. 创建system_settings表（支持多种配置分类）
 * 2. 插入初始默认配置（系统名称、版本号、基础参数等）
 * 3. 创建相关索引（category、setting_key、updated_by）
 *
 * 业务影响：
 * - 正向影响：管理员可以通过后台统一管理系统配置，无需修改代码
 * - 风险控制：使用is_readonly字段保护关键配置，防止误修改
 * - 性能优化：创建category和setting_key索引，提高查询效率
 *
 * 技术实施：
 * - 使用createTable创建新表
 * - 插入必需的初始配置数据
 * - 支持完整的up/down回滚
 *
 * 创建时间：2025年11月23日 北京时间
 * 数据库版本：V4.0
 * 风险等级：低（新建表，不影响现有数据）
 * 预计执行时间：<1秒
 */

'use strict'

module.exports = {
  /**
   * 正向迁移：创建system_settings表并插入初始数据
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize库
   * @returns {Promise<void>}
   */
  async up (queryInterface, Sequelize) {
    const { DataTypes } = Sequelize

    // 步骤1：创建system_settings表
    await queryInterface.createTable('system_settings', {
      // 主键：设置项唯一标识
      setting_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '设置项唯一标识（自增主键）'
      },

      // 配置分类
      category: {
        type: DataTypes.ENUM('basic', 'lottery', 'points', 'notification', 'security'),
        allowNull: false,
        comment: '配置分类：basic-基础设置，lottery-抽奖设置，points-积分设置，notification-通知设置，security-安全设置'
      },

      // 配置键名
      setting_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '配置键名（唯一，如system_name、base_win_rate等）'
      },

      // 配置值
      setting_value: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: '',
        comment: '配置值（根据value_type解析）'
      },

      // 值类型
      value_type: {
        type: DataTypes.ENUM('string', 'number', 'boolean', 'json'),
        allowNull: false,
        defaultValue: 'string',
        comment: '值类型：string-字符串，number-数字，boolean-布尔值，json-JSON对象'
      },

      // 配置描述
      description: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '配置描述（说明此配置项的用途）'
      },

      // 是否可见
      is_visible: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否在管理后台显示'
      },

      // 是否只读
      is_readonly: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否只读（不可通过管理后台修改）'
      },

      // 更新管理员ID
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '最后更新管理员ID'
      },

      // 创建时间
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '创建时间'
      },

      // 更新时间
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
        comment: '更新时间'
      }
    }, {
      comment: '系统设置表：存储系统各模块的配置设置',
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    })

    console.log('✅ 已创建system_settings表')

    // 步骤2：创建索引
    await queryInterface.addIndex('system_settings', ['category'], {
      name: 'idx_category',
      using: 'BTREE'
    })

    await queryInterface.addIndex('system_settings', ['setting_key'], {
      name: 'idx_setting_key',
      unique: true,
      using: 'BTREE'
    })

    await queryInterface.addIndex('system_settings', ['category', 'is_visible'], {
      name: 'idx_category_visible',
      using: 'BTREE'
    })

    await queryInterface.addIndex('system_settings', ['updated_by', 'updated_at'], {
      name: 'idx_updated_by',
      using: 'BTREE'
    })

    console.log('✅ 已创建索引')

    // 步骤3：插入初始配置数据
    await queryInterface.bulkInsert('system_settings', [
      // ========== 基础设置 ==========
      {
        category: 'basic',
        setting_key: 'system_name',
        setting_value: '餐厅抽奖系统',
        value_type: 'string',
        description: '系统名称（显示在前端页面标题等位置）',
        is_visible: true,
        is_readonly: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        category: 'basic',
        setting_key: 'system_version',
        setting_value: 'v1.0.0',
        value_type: 'string',
        description: '系统版本号',
        is_visible: true,
        is_readonly: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        category: 'basic',
        setting_key: 'customer_phone',
        setting_value: '400-xxx-xxxx',
        value_type: 'string',
        description: '客服电话（显示在联系我们页面）',
        is_visible: true,
        is_readonly: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        category: 'basic',
        setting_key: 'customer_email',
        setting_value: 'support@example.com',
        value_type: 'string',
        description: '客服邮箱（用于接收用户反馈）',
        is_visible: true,
        is_readonly: false,
        created_at: new Date(),
        updated_at: new Date()
      },

      // ========== 抽奖设置 ==========
      {
        category: 'lottery',
        setting_key: 'base_win_rate',
        setting_value: '0.3',
        value_type: 'number',
        description: '基础中奖率（0-1之间的小数，如0.3表示30%）',
        is_visible: true,
        is_readonly: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        category: 'lottery',
        setting_key: 'max_consecutive_loses',
        setting_value: '10',
        value_type: 'number',
        description: '最大连续不中奖次数（触发保底机制）',
        is_visible: true,
        is_readonly: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        category: 'lottery',
        setting_key: 'adjustment_factor',
        setting_value: '0.05',
        value_type: 'number',
        description: '概率调整因子（每次不中奖增加的概率值）',
        is_visible: true,
        is_readonly: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        category: 'lottery',
        setting_key: 'daily_draw_limit',
        setting_value: '10',
        value_type: 'number',
        description: '每日抽奖次数限制（0表示不限制）',
        is_visible: true,
        is_readonly: false,
        created_at: new Date(),
        updated_at: new Date()
      },

      // ========== 积分设置 ==========
      {
        category: 'points',
        setting_key: 'sign_in_points',
        setting_value: '10',
        value_type: 'number',
        description: '每日签到奖励积分',
        is_visible: true,
        is_readonly: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        category: 'points',
        setting_key: 'lottery_cost_points',
        setting_value: '10',
        value_type: 'number',
        description: '每次抽奖消耗积分',
        is_visible: true,
        is_readonly: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        category: 'points',
        setting_key: 'points_expire_days',
        setting_value: '365',
        value_type: 'number',
        description: '积分有效期（天数，0表示永久有效）',
        is_visible: true,
        is_readonly: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        category: 'points',
        setting_key: 'initial_points',
        setting_value: '100',
        value_type: 'number',
        description: '新用户初始积分',
        is_visible: true,
        is_readonly: false,
        created_at: new Date(),
        updated_at: new Date()
      },

      // ========== 通知设置 ==========
      {
        category: 'notification',
        setting_key: 'sms_enabled',
        setting_value: 'false',
        value_type: 'boolean',
        description: '是否启用短信通知',
        is_visible: true,
        is_readonly: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        category: 'notification',
        setting_key: 'email_enabled',
        setting_value: 'false',
        value_type: 'boolean',
        description: '是否启用邮件通知',
        is_visible: true,
        is_readonly: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        category: 'notification',
        setting_key: 'app_notification_enabled',
        setting_value: 'true',
        value_type: 'boolean',
        description: '是否启用APP内通知',
        is_visible: true,
        is_readonly: false,
        created_at: new Date(),
        updated_at: new Date()
      },

      // ========== 安全设置 ==========
      {
        category: 'security',
        setting_key: 'max_login_attempts',
        setting_value: '5',
        value_type: 'number',
        description: '最大登录失败次数（超过后锁定账户）',
        is_visible: true,
        is_readonly: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        category: 'security',
        setting_key: 'lockout_duration',
        setting_value: '30',
        value_type: 'number',
        description: '账户锁定时长（分钟）',
        is_visible: true,
        is_readonly: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        category: 'security',
        setting_key: 'password_min_length',
        setting_value: '6',
        value_type: 'number',
        description: '密码最小长度',
        is_visible: true,
        is_readonly: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        category: 'security',
        setting_key: 'api_rate_limit',
        setting_value: '100',
        value_type: 'number',
        description: 'API请求频率限制（每分钟最大请求数）',
        is_visible: true,
        is_readonly: false,
        created_at: new Date(),
        updated_at: new Date()
      }
    ])

    console.log('✅ 已插入初始配置数据')
    console.log('🎉 迁移完成：system_settings表创建成功')
  },

  /**
   * 回滚迁移：删除system_settings表
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize库
   * @returns {Promise<void>}
   */
  async down (queryInterface, Sequelize) {
    // 删除表（会自动删除所有索引和数据）
    await queryInterface.dropTable('system_settings')
    console.log('🔄 回滚完成：system_settings表已删除')
  }
}

