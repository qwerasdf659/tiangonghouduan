/*
 * .eslintrc.js - 餐厅积分抽奖系统专用ESLint配置
 * 创建时间: 2025年07月29日 20:43:18 UTC
 * 目标: 解决3030个代码质量问题，防止let const等明显语法错误
 */

module.exports = {
  // 环境配置
  env: {
    node: true,
    es2021: true,
    jest: true
  },

  // ignorePatterns 统一在文件底部维护，避免重复定义

  // 继承标准配置
  extends: ['standard'],

  /*
   * 插件配置（本地规则通过npm scripts运行）
   * plugins: ['local-rules'], // 暂时禁用，通过质量检查脚本运行
   */

  // 解析器选项
  parserOptions: {
    ecmaVersion: 2022, // 更新为ES2022以支持类静态字段语法
    sourceType: 'module'
  },

  // 针对餐厅积分抽奖系统的特定规则
  rules: {
    /*
     * 📝 注释规范 - 强制要求中文注释（2025年10月20日新增）
     * 规则：提供任何技术信息时必须添加详细的中文注释
     */
    // JSDoc 告警已治理完毕；对业务代码强制 error，保证文档与签名一致
    'require-jsdoc': [
      'error',
      {
        require: {
          FunctionDeclaration: true,
          MethodDefinition: true,
          ClassDeclaration: true,
          ArrowFunctionExpression: false,
          FunctionExpression: true
        }
      }
    ],
    'valid-jsdoc': [
      'error',
      {
        requireReturn: true,
        requireReturnType: true,
        requireParamType: true,
        requireParamDescription: true,
        requireReturnDescription: true,
        prefer: {
          return: 'returns',
          arg: 'param',
          argument: 'param'
        },
        preferType: {
          object: 'Object',
          string: 'string',
          number: 'number',
          boolean: 'boolean'
        }
      }
    ],
    'multiline-comment-style': ['error', 'starred-block'], // 强制使用/** */格式的多行注释
    'spaced-comment': [
      'error',
      'always',
      {
        line: {
          markers: ['/', '🔴', '✅', '⚠️', '🔧', '📝'], // 允许特殊标记
          exceptions: ['-', '+', '*', '=']
        },
        block: {
          markers: ['*'], // 允许JSDoc注释
          balanced: true
        }
      }
    ],

    // 🔴 基础语法检查 - 防止let const这类严重错误
    'no-unexpected-multiline': 'error',
    'valid-typeof': 'error',
    'no-unreachable': 'error',
    'no-undef': 'error',
    'no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }
    ],

    // 🟡 Node.js/Express特定规则
    'no-console': 'off', // 允许console.log用于后端日志
    camelcase: 'off', // 允许下划线命名（数据库字段user_id等）

    // 🔵 Sequelize ORM特定规则
    'no-await-in-loop': 'warn', // 警告循环中的await（性能问题）
    'prefer-const': 'error', // 强制使用const（防止let const错误）

    // 🟢 Promise/异步处理规则
    'no-async-promise-executor': 'error',
    'require-atomic-updates': 'error',
    'no-promise-executor-return': 'error',

    /*
     * 🔷 代码风格规则
     * 以下规则由 Prettier 统一控制，ESLint 不再检查，避免两者冲突
     * 参考：https://prettier.io/docs/en/integrating-with-linters.html
     */
    'space-before-function-paren': 'off', // 由 Prettier 控制
    quotes: 'off', // 由 Prettier 控制（.prettierrc: singleQuote: true）
    semi: 'off', // 由 Prettier 控制（.prettierrc: semi: false）
    indent: 'off', // 由 Prettier 控制（.prettierrc: tabWidth: 2）
    'no-trailing-spaces': 'off', // 由 Prettier 控制
    'eol-last': 'off', // 由 Prettier 控制

    // 🔒 安全相关规则
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',

    // 🚨 测试与实现一致性规则 - 防止"测试适配错误实现"
    'no-business-semantic-mismatch': 'off', // 自定义规则，检测业务语义不匹配
    'no-test-lowering-standards': 'off' // 自定义规则，检测测试标准降低
  },

  // 🎯 自定义规则配置
  overrides: [
    {
      // 测试文件特殊规则
      files: ['tests/**/*.js', '**/*.test.js', '**/*.spec.js'],
      rules: {
        // 测试文件中禁止的模式
        'no-console': 'off', // 测试中允许console用于调试
        'max-len': 'off', // 测试描述可以较长
        'no-magic-numbers': 'off', // 测试中允许魔术数字
        'no-await-in-loop': 'off', // 测试中允许循环中的await
        'no-promise-executor-return': 'off', // 测试中允许Promise executor返回值
        // 🔴 测试代码不强制每个 helper/回调都写 JSDoc（避免阻塞业务开发）
        'require-jsdoc': 'off',
        'valid-jsdoc': 'off',
        // 🔴 测试文件允许局部 unused（不影响业务语义验证）
        'no-unused-vars': 'warn',
        // 🔴 测试文件允许在 beforeAll/afterAll 等场景赋值
        'require-atomic-updates': 'off'
      }
    },
    {
      /** 配置/工具/批量导入文件：批量处理中的 await-in-loop 是顺序生成/校验的正常模式 */
      files: [
        'config/segment_rules.js',
        'utils/CampaignCodeGenerator.js',
        'routes/v4/console/merchant/merchant-points.js',
        'routes/v4/console/ad/ad-pricing.js',
        'routes/v4/console/exchange/items.js'
      ],
      rules: {
        'no-await-in-loop': 'off'
      }
    },
    {
      // 模型文件特殊规则
      files: ['models/**/*.js'],
      rules: {
        camelcase: 'off', // 模型字段允许下划线
        'quote-props': ['error', 'consistent'] // 属性引号一致性
      }
    },
    {
      // 路由文件特殊规则
      files: ['routes/**/*.js'],
      rules: {
        'no-console': 'off', // 路由中允许console用于日志
        'consistent-return': 'error', // 强制一致的返回格式
        // 🔴 V4统一API响应格式规则 - 禁止直接使用res.json()和ApiResponse.send()
        'no-restricted-syntax': [
          'error',
          {
            selector:
              "CallExpression[callee.type='MemberExpression'][callee.object.name='res'][callee.property.name='json']",
            message:
              '❌ 禁止在路由中直接使用res.json()！请使用统一的res.apiSuccess()或res.apiError()方法以确保响应格式一致性。'
          },
          {
            selector:
              "CallExpression[callee.type='MemberExpression'][callee.object.type='CallExpression'][callee.object.callee.property.name='status'][callee.property.name='json']",
            message:
              '❌ 禁止使用res.status().json()！请使用res.apiError(message, code, details, statusCode)方法。'
          },
          {
            selector:
              "CallExpression[callee.object.name='ApiResponse'][callee.property.name='send']",
            message:
              '❌ 禁止使用ApiResponse.send()！请使用res.apiSuccess()等中间件方法以保持代码简洁和一致性。'
          }
        ]
      }
    },
    {
      /**
       * 批量顺序处理服务：await-in-loop 是设计选择（顺序计费/模拟/告警）
       * 这些服务需要按顺序处理每条记录以保证数据一致性
       */
      files: [
        'services/AdBillingService.js',
        'services/lottery-analytics/StrategySimulationService.js',
        'services/lottery/LotteryAlertService.js',
        'services/ReminderEngineService.js',
        'services/CustomerServiceCompensateService.js',
        'services/exchange/AdminService.js',
        'services/monitoring/APIPerformanceService.js',
        'services/market-listing/CoreService.js',
        'services/AdTagAggregationService.js',
        'services/AdPricingService.js',
        'services/consumption/ConsumptionBatchService.js',
        'services/consumption/AnomalyService.js',
        'services/PrizePoolService.js',
        'services/CustomerServiceAgentManagementService.js',
        'services/AdReportService.js',
        'services/AdCampaignService.js',
        'services/AdBiddingService.js',
        'services/ActivityService.js'
      ],
      rules: {
        'no-await-in-loop': 'off'
      }
    },
    {
      /**
       * 🔒 服务文件事务边界规则（2026-01-05 事务边界治理）
       * V4.7.0 更新：AssetService 已拆分为 BalanceService/ItemService（2026-01-31）
       *
       * 目的：防止"忘传 transaction"导致脱离事务边界
       * 检查方式：警告直接调用 BalanceService/ItemService 写操作，提醒传递 transaction
       */
      files: ['services/**/*.js'],
      excludedFiles: [
        'services/asset/BalanceService.js',
        'services/asset/ItemService.js',
        'services/IdempotencyService.js'
      ],
      rules: {
        'no-restricted-syntax': [
          'warn',
          {
            selector:
              "CallExpression[callee.object.name='BalanceService'][callee.property.name='changeBalance']",
            message:
              '⚠️ [事务边界] BalanceService.changeBalance() 必须传递 { transaction }！' +
              '请确保调用时传入事务对象，避免脱离事务边界。'
          },
          {
            selector:
              "CallExpression[callee.object.name='BalanceService'][callee.property.name='freeze']",
            message:
              '⚠️ [事务边界] BalanceService.freeze() 必须传递 { transaction }！' +
              '请确保调用时传入事务对象，避免脱离事务边界。'
          },
          {
            selector:
              "CallExpression[callee.object.name='BalanceService'][callee.property.name='unfreeze']",
            message:
              '⚠️ [事务边界] BalanceService.unfreeze() 必须传递 { transaction }！' +
              '请确保调用时传入事务对象，避免脱离事务边界。'
          },
          {
            selector:
              "CallExpression[callee.object.name='BalanceService'][callee.property.name='settleFromFrozen']",
            message:
              '⚠️ [事务边界] BalanceService.settleFromFrozen() 必须传递 { transaction }！' +
              '请确保调用时传入事务对象，避免脱离事务边界。'
          },
          {
            selector:
              "CallExpression[callee.object.name='ItemService'][callee.property.name='transferItem']",
            message:
              '⚠️ [事务边界] ItemService.transferItem() 必须传递 { transaction }！' +
              '请确保调用时传入事务对象，避免脱离事务边界。'
          }
        ]
      }
    }
  ],

  // 忽略特定文件
  /**
   * 忽略目录（ESLint Ignore Patterns）
   *
   * 说明：
   * - `migrations/**` 为 Sequelize 迁移脚本，生成/变更频繁；迁移质量由 `npm run migration:verify` + DB迁移执行保障
   * - 避免迁移脚本的注释/风格差异阻塞核心业务代码的质量检查
   */
  ignorePatterns: [
    'node_modules/',
    'logs/',
    '*.config.js',
    'supervisor/',
    '.cursor/',
    'migrations/**',
    /** 种子数据脚本：顺序批量INSERT属于正常模式，与migrations同级不纳入主工程检查 */
    'seeders/**',
    /** 定时任务/批处理作业：顺序遍历处理属于正常模式，由执行结果保障质量 */
    'jobs/**',
    /*
     * 🔴 项目脚本工具（运维/诊断/迁移工具脚本）：不纳入主工程 ESLint 阻塞检查
     * 说明：脚本质量由其独立执行路径（npm scripts）与运行结果保障，避免注释规范导致主链路阻塞
     */
    'scripts/**',
    // 🔴 前端静态资源（不属于后端数据库项目代码质量范围）
    'public/**',
    // 🔴 根目录下的临时手工测试脚本（不纳入主工程 ESLint 阻塞检查）
    'test-*.js',
    'test_*.js'
  ]
}
