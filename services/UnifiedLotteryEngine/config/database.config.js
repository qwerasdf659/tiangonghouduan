/**
 * V4统一决策引擎数据库配置
 * 餐厅积分抽奖系统 - 数据库架构配置
 *
 * @description V4架构的数据库连接和模型配置，支持统一决策记录
 * @version 4.0.0
 * @date 2025-09-10
 * @timezone Asia/Shanghai (北京时间)
 */

module.exports = {
  // 数据库连接配置
  connection: {
    // 使用现有的数据库连接
    useExisting: true,
    // 如果需要独立连接（高性能场景）
    independent: {
      enabled: false,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      dialect: 'mysql',
      timezone: '+08:00', // 北京时间
      pool: {
        max: 20,
        min: 5,
        acquire: 30000,
        idle: 10000
      }
    }
  },

  // V4统一决策记录表配置
  tables: {
    // 决策记录主表
    unified_decision_records: {
      tableName: 'unified_decision_records',
      comment: 'V4统一决策引擎决策记录表',
      fields: {
        decision_id: {
          type: 'UUID',
          primaryKey: true,
          defaultValue: 'UUIDV4',
          comment: '决策唯一标识'
        },
        user_id: {
          type: 'INTEGER',
          allowNull: false,
          references: {
            model: 'users',
            key: 'user_id'
          },
          comment: '用户ID'
        },
        activity_id: {
          type: 'INTEGER',
          allowNull: false,
          comment: '活动ID'
        },
        campaign_id: {
          type: 'INTEGER',
          allowNull: true,
          comment: '营销活动ID'
        },
        lottery_type: {
          type: 'ENUM',
          values: ['single', 'bulk_5', 'bulk_10', 'special'],
          defaultValue: 'single',
          comment: '抽奖类型'
        },
        decision_context: {
          type: 'JSON',
          allowNull: false,
          comment: '决策上下文数据（用户信息、池状态等）'
        },
        probability_factors: {
          type: 'JSON',
          allowNull: false,
          comment: '概率影响因素详情'
        },
        base_probability: {
          type: 'DECIMAL(8,6)',
          allowNull: false,
          comment: '基础概率'
        },
        final_probability: {
          type: 'DECIMAL(8,6)',
          allowNull: false,
          comment: '最终使用的概率'
        },
        adjustment_factors: {
          type: 'JSON',
          allowNull: true,
          comment: '概率调整因子详情'
        },
        guarantee_info: {
          type: 'JSON',
          allowNull: true,
          comment: '保底机制信息'
        },
        guarantee_triggered: {
          type: 'BOOLEAN',
          defaultValue: false,
          comment: '是否触发保底机制'
        },
        pool_selected: {
          type: 'STRING(50)',
          allowNull: false,
          comment: '选择的奖品池'
        },
        pool_status: {
          type: 'JSON',
          allowNull: true,
          comment: '奖品池状态信息'
        },
        decision_result: {
          type: 'ENUM',
          values: ['win', 'lose'],
          allowNull: false,
          comment: '决策结果：中奖或未中奖'
        },
        prize_info: {
          type: 'JSON',
          allowNull: true,
          comment: '中奖奖品信息（如果中奖）'
        },
        points_consumed: {
          type: 'INTEGER',
          defaultValue: 0,
          comment: '消耗的积分数量'
        },
        execution_time_ms: {
          type: 'INTEGER',
          allowNull: false,
          comment: '决策执行时间（毫秒）'
        },
        strategy_versions: {
          type: 'JSON',
          allowNull: true,
          comment: '使用的策略版本信息'
        },
        ab_experiment: {
          type: 'STRING(100)',
          allowNull: true,
          comment: 'A/B测试实验标识'
        },
        created_at: {
          type: 'DATE',
          defaultValue: 'NOW',
          comment: '创建时间（北京时间）'
        },
        updated_at: {
          type: 'DATE',
          defaultValue: 'NOW',
          onUpdate: 'NOW',
          comment: '更新时间（北京时间）'
        }
      },
      indexes: [
        {
          name: 'idx_user_created',
          fields: ['user_id', 'created_at'],
          comment: '用户决策记录查询索引'
        },
        {
          name: 'idx_activity_result',
          fields: ['activity_id', 'decision_result'],
          comment: '活动结果统计索引'
        },
        {
          name: 'idx_pool_created',
          fields: ['pool_selected', 'created_at'],
          comment: '奖品池使用分析索引'
        },
        {
          name: 'idx_guarantee_triggered',
          fields: ['guarantee_triggered', 'user_id'],
          comment: '保底机制分析索引'
        },
        {
          name: 'idx_ab_experiment',
          fields: ['ab_experiment', 'created_at'],
          comment: 'A/B测试分析索引'
        }
      ]
    },

    // 概率日志表
    unified_probability_logs: {
      tableName: 'unified_probability_logs',
      comment: 'V4统一决策引擎概率计算日志',
      fields: {
        log_id: {
          type: 'UUID',
          primaryKey: true,
          defaultValue: 'UUIDV4',
          comment: '日志唯一标识'
        },
        decision_id: {
          type: 'UUID',
          allowNull: false,
          references: {
            model: 'unified_decision_records',
            key: 'decision_id'
          },
          comment: '关联的决策记录ID'
        },
        calculation_step: {
          type: 'STRING(50)',
          allowNull: false,
          comment: '计算步骤名称'
        },
        step_order: {
          type: 'INTEGER',
          allowNull: false,
          comment: '步骤顺序'
        },
        input_data: {
          type: 'JSON',
          allowNull: false,
          comment: '步骤输入数据'
        },
        output_data: {
          type: 'JSON',
          allowNull: false,
          comment: '步骤输出数据'
        },
        execution_time_ms: {
          type: 'INTEGER',
          allowNull: false,
          comment: '步骤执行时间（毫秒）'
        },
        algorithm_version: {
          type: 'STRING(20)',
          allowNull: false,
          comment: '使用的算法版本'
        },
        created_at: {
          type: 'DATE',
          defaultValue: 'NOW',
          comment: '创建时间（北京时间）'
        }
      },
      indexes: [
        {
          name: 'idx_decision_step',
          fields: ['decision_id', 'step_order'],
          comment: '决策步骤查询索引'
        },
        {
          name: 'idx_algorithm_version',
          fields: ['algorithm_version', 'created_at'],
          comment: '算法版本分析索引'
        }
      ]
    },

    // 系统指标表
    unified_system_metrics: {
      tableName: 'unified_system_metrics',
      comment: 'V4统一决策引擎系统指标表',
      fields: {
        metric_id: {
          type: 'UUID',
          primaryKey: true,
          defaultValue: 'UUIDV4',
          comment: '指标唯一标识'
        },
        metric_type: {
          type: 'ENUM',
          values: ['performance', 'business', 'error', 'usage'],
          allowNull: false,
          comment: '指标类型'
        },
        metric_name: {
          type: 'STRING(100)',
          allowNull: false,
          comment: '指标名称'
        },
        metric_value: {
          type: 'DECIMAL(15,6)',
          allowNull: false,
          comment: '指标值'
        },
        metric_unit: {
          type: 'STRING(20)',
          allowNull: true,
          comment: '指标单位'
        },
        dimensions: {
          type: 'JSON',
          allowNull: true,
          comment: '指标维度信息'
        },
        aggregation_period: {
          type: 'ENUM',
          values: ['minute', 'hour', 'day', 'week', 'month'],
          defaultValue: 'hour',
          comment: '聚合周期'
        },
        measurement_time: {
          type: 'DATE',
          allowNull: false,
          comment: '测量时间（北京时间）'
        },
        created_at: {
          type: 'DATE',
          defaultValue: 'NOW',
          comment: '创建时间（北京时间）'
        }
      },
      indexes: [
        {
          name: 'idx_metric_time',
          fields: ['metric_name', 'measurement_time'],
          comment: '指标时间查询索引'
        },
        {
          name: 'idx_type_period',
          fields: ['metric_type', 'aggregation_period', 'measurement_time'],
          comment: '指标类型周期索引'
        }
      ]
    },

    // 策略配置历史表
    unified_strategy_configs: {
      tableName: 'unified_strategy_configs',
      comment: 'V4统一决策引擎策略配置历史表',
      fields: {
        config_id: {
          type: 'UUID',
          primaryKey: true,
          defaultValue: 'UUIDV4',
          comment: '配置唯一标识'
        },
        config_type: {
          type: 'ENUM',
          values: ['engine', 'probability', 'guarantee', 'pool', 'strategy'],
          allowNull: false,
          comment: '配置类型'
        },
        config_name: {
          type: 'STRING(100)',
          allowNull: false,
          comment: '配置名称'
        },
        config_version: {
          type: 'STRING(20)',
          allowNull: false,
          comment: '配置版本'
        },
        config_data: {
          type: 'JSON',
          allowNull: false,
          comment: '配置数据内容'
        },
        is_active: {
          type: 'BOOLEAN',
          defaultValue: true,
          comment: '是否为活跃配置'
        },
        effective_from: {
          type: 'DATE',
          allowNull: false,
          comment: '生效开始时间（北京时间）'
        },
        effective_to: {
          type: 'DATE',
          allowNull: true,
          comment: '生效结束时间（北京时间）'
        },
        created_by: {
          type: 'STRING(100)',
          allowNull: false,
          comment: '创建者'
        },
        change_reason: {
          type: 'TEXT',
          allowNull: true,
          comment: '变更原因'
        },
        created_at: {
          type: 'DATE',
          defaultValue: 'NOW',
          comment: '创建时间（北京时间）'
        }
      },
      indexes: [
        {
          name: 'idx_config_active',
          fields: ['config_type', 'config_name', 'is_active'],
          comment: '活跃配置查询索引'
        },
        {
          name: 'idx_effective_time',
          fields: ['effective_from', 'effective_to'],
          comment: '生效时间查询索引'
        }
      ]
    }
  },

  // 数据库迁移配置
  migrations: {
    enabled: true,
    migrationsPath: './migrations/unified-engine',
    seedersPath: './seeders/unified-engine',

    // 迁移脚本
    scripts: [
      {
        version: '001',
        name: 'create_unified_decision_records',
        description: '创建统一决策记录表',
        up: 'CREATE TABLE unified_decision_records...',
        down: 'DROP TABLE unified_decision_records'
      },
      {
        version: '002',
        name: 'create_unified_probability_logs',
        description: '创建概率计算日志表',
        up: 'CREATE TABLE unified_probability_logs...',
        down: 'DROP TABLE unified_probability_logs'
      },
      {
        version: '003',
        name: 'create_unified_system_metrics',
        description: '创建系统指标表',
        up: 'CREATE TABLE unified_system_metrics...',
        down: 'DROP TABLE unified_system_metrics'
      },
      {
        version: '004',
        name: 'create_unified_strategy_configs',
        description: '创建策略配置历史表',
        up: 'CREATE TABLE unified_strategy_configs...',
        down: 'DROP TABLE unified_strategy_configs'
      }
    ]
  },

  // 数据保留策略
  retention: {
    // 决策记录保留策略
    decision_records: {
      enabled: true,
      retentionDays: 90, // 保留90天
      archiveAfterDays: 30, // 30天后归档
      archiveTable: 'unified_decision_records_archive',
      cleanupSchedule: '0 2 * * *' // 每日2点清理
    },

    // 概率日志保留策略
    probability_logs: {
      enabled: true,
      retentionDays: 30, // 保留30天
      archiveAfterDays: 7, // 7天后归档
      archiveTable: 'unified_probability_logs_archive',
      cleanupSchedule: '0 3 * * *' // 每日3点清理
    },

    // 系统指标保留策略
    system_metrics: {
      enabled: true,
      retentionDays: 365, // 保留365天
      aggregateAfterDays: 30, // 30天后聚合
      aggregateTable: 'unified_system_metrics_summary',
      cleanupSchedule: '0 4 * * *' // 每日4点清理
    },

    // 策略配置保留策略
    strategy_configs: {
      enabled: true,
      retentionDays: 1095, // 保留3年
      cleanupInactive: true, // 清理非活跃配置
      cleanupSchedule: '0 5 * * 0' // 每周日5点清理
    }
  },

  // 性能优化配置
  performance: {
    // 连接池优化
    connectionPool: {
      maxConnections: 20,
      minConnections: 5,
      acquireTimeout: 60000,
      idleTimeout: 300000,
      evictionRunIntervalMillis: 60000
    },

    // 查询优化
    queryOptimization: {
      enableQueryCache: true,
      queryCacheTTL: 300, // 查询缓存5分钟
      slowQueryThreshold: 1000, // 慢查询阈值1秒
      enableExplainPlan: false // 生产环境关闭执行计划
    },

    // 批量操作优化
    batchOperations: {
      enabled: true,
      batchSize: 1000, // 批量大小
      batchTimeout: 5000, // 批量超时5秒
      maxConcurrentBatches: 5 // 最大并发批量数
    }
  },

  // 监控和告警配置
  monitoring: {
    // 连接监控
    connectionMonitoring: {
      enabled: true,
      alertThresholds: {
        activeConnections: 15, // 活跃连接告警阈值
        connectionLatency: 100, // 连接延迟告警阈值（毫秒）
        connectionErrors: 10 // 连接错误告警阈值
      }
    },

    // 查询监控
    queryMonitoring: {
      enabled: true,
      trackSlowQueries: true,
      alertThresholds: {
        slowQueryCount: 100, // 慢查询数量告警阈值
        avgQueryTime: 500, // 平均查询时间告警阈值（毫秒）
        queryErrorRate: 0.05 // 查询错误率告警阈值5%
      }
    },

    // 存储监控
    storageMonitoring: {
      enabled: true,
      alertThresholds: {
        diskUsage: 0.8, // 磁盘使用率告警阈值80%
        tableSize: 10000, // 表大小告警阈值（MB）
        indexEfficiency: 0.7 // 索引效率告警阈值70%
      }
    }
  },

  // 安全配置
  security: {
    // 连接安全
    connectionSecurity: {
      ssl: {
        enabled: process.env.DB_SSL_ENABLED === 'true',
        rejectUnauthorized: true,
        ca: process.env.DB_SSL_CA,
        cert: process.env.DB_SSL_CERT,
        key: process.env.DB_SSL_KEY
      },

      // 连接加密
      encryption: {
        enabled: true,
        algorithm: 'AES-256-GCM',
        keyRotationDays: 90 // 90天轮换密钥
      }
    },

    // 数据安全
    dataSecurity: {
      // 敏感数据加密
      fieldEncryption: {
        enabled: false, // 根据需要启用
        encryptedFields: ['decision_context.userInfo.phone', 'decision_context.userInfo.email']
      },

      // 审计日志
      auditLog: {
        enabled: true,
        logLevel: 'info',
        retentionDays: 180
      }
    }
  },

  // 备份配置
  backup: {
    enabled: true,

    // 自动备份
    automatic: {
      enabled: true,
      schedule: '0 1 * * *', // 每日1点备份
      retentionDays: 7, // 保留7天
      compression: true, // 启用压缩
      encryption: true // 启用加密
    },

    // 备份存储
    storage: {
      type: 'sealos', // 使用Sealos存储
      path: 'database-backups/unified-engine',
      accessKey: process.env.SEALOS_ACCESS_KEY,
      secretKey: process.env.SEALOS_SECRET_KEY
    },

    // 备份验证
    validation: {
      enabled: true,
      testRestore: true, // 测试还原
      checksumValidation: true // 校验和验证
    }
  }
}
