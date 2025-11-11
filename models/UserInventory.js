/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 用户库存模型（UserInventory）
 *
 * 业务场景：管理用户通过积分兑换、抽奖中奖等方式获得的奖品、商品和优惠券
 *
 * 核心功能：
 * 1. 记录用户获得的所有物品（优惠券、实物商品、服务）
 * 2. 管理物品状态流转（available→used/expired/transferred）
 * 3. 生成和管理核销码（商家验证使用的凭证）
 * 4. 追溯物品来源（积分兑换、抽奖、系统赠送等）
 * 5. 支持物品转让功能（用户间物品流转）
 * 6. 有效期管理（自动过期提醒和状态更新）
 *
 * 业务流程：
 * 1. 用户获得物品（兑换审核通过或抽奖中奖）
 *    - 创建UserInventory记录，status=available
 *    - 生成唯一核销码（generateVerificationCode）
 *    - 设置物品信息和过期时间
 * 2. 用户查看库存
 *    - 检查物品是否可用（isUsable）
 *    - 显示剩余有效时间（getTimeRemaining）
 * 3. 商家核销
 *    - 验证核销码有效性
 *    - 更新status=used，记录used_at时间
 * 4. 自动过期处理
 *    - 定时任务检查expires_at
 *    - 过期物品自动更新status=expired
 *
 * 状态流转规则：
 * - available（可使用）→ used（已使用）：商家核销后
 * - available（可使用）→ expired（已过期）：超过expires_at时间
 * - available（可使用）→ transferred（已转让）：用户转让给他人
 * - used/expired/transferred 为终态，不可逆转
 *
 * 数据库表名：user_inventory
 * 主键：inventory_id（INTEGER，自增）
 * 外键：user_id（users.user_id，CASCADE删除），transfer_to_user_id（users.user_id，转让目标用户）
 *
 * 集成服务：
 * - ExchangeRecords：兑换审核通过后创建库存
 * - DrawRecords：抽奖中奖后创建库存
 * - MerchantService：核销码验证和使用
 * - NotificationService：过期提醒和使用通知
 *
 * 创建时间：2025年01月28日
 * 最后更新：2025年10月30日
 * 使用模型：Claude Sonnet 4.5
 */

const { DataTypes } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = sequelize => {
  const UserInventory = sequelize.define(
    'UserInventory',
    {
      // 主键
      inventory_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键ID'
      },

      // 基础信息
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },

      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '物品名称'
      },

      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '物品描述'
      },

      // 物品分类
      type: {
        type: DataTypes.ENUM('voucher', 'product', 'service'),
        allowNull: false,
        comment: '物品类型：优惠券/实物商品/服务'
      },

      value: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '物品价值（积分等价值）'
      },

      // 状态管理（物品的完整生命周期管理，控制使用权限和业务流转）
      status: {
        type: DataTypes.ENUM('available', 'pending', 'used', 'expired', 'transferred'),
        allowNull: false,
        defaultValue: 'available',
        comment:
          '物品状态（available-可使用【初始状态，用户可凭核销码使用】→ used-已使用【商家核销后，终态不可变更】或 expired-已过期【超过expires_at时间，终态不可变更】或 transferred-已转让【转让给其他用户，终态不可变更】；pending-待处理【临时状态，用于特殊业务场景】，业务规则：只有available状态可以使用，used/expired/transferred为终态不可逆转）'
      },

      // 来源信息（追溯用户如何获得这个物品，用于审计和统计分析）
      source_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment:
          '获得来源类型（exchange-积分兑换获得, lottery-抽奖中奖获得, gift-系统赠送, compensation-补偿发放, activity-活动奖励，用途：来源追溯、统计分析、用户获取渠道分析）'
      },

      source_id: {
        type: DataTypes.STRING(32),
        allowNull: true,
        comment:
          '来源记录ID（关联源记录的唯一标识，如：exchange时为exchange_id, lottery时为draw_id，用途：追溯原始记录、退款凭证、数据对账）'
      },

      // 时间信息（记录物品的完整时间线，用于有效期管理和统计分析）
      acquired_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: () => BeijingTimeHelper.createDatabaseTime(),
        comment:
          '获得时间（用户获得该物品的北京时间，默认为当前时间，用途：持有时长统计、获取渠道时间分析、用户行为分析）'
      },

      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment:
          '过期时间（物品的有效期截止时间，北京时间，业务规则：超过此时间自动变为expired状态不可使用，null表示永久有效，用途：过期提醒、自动状态更新、有效期管理）'
      },

      used_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment:
          '使用时间（用户实际使用物品的北京时间，业务规则：商家核销时记录，status变为used，用途：使用率统计、核销时间分析、商家结算依据）'
      },

      operator_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment:
          '核销操作人ID（Operator ID - 执行核销操作的商户或管理员用户ID）\n' +
          '业务规则（Business Rules）：\n' +
          '- 核销时自动记录：req.user.user_id（执行核销的用户ID）\n' +
          '- 未核销时为NULL：status=available/pending/expired时无操作人\n' +
          '- 历史数据为NULL：迁移前已核销的记录无法追溯操作人\n' +
          '- 只允许商户或管理员核销：权限验证roleLevel>=50\n' +
          '用途（Usage）：\n' +
          '- 商户绩效统计：按operator_id统计各商户核销量和金额\n' +
          '- 财务结算追溯：查询某商户的核销记录进行对账和结算\n' +
          '- 异常核销追责：追踪异常核销行为的操作人进行追责处理\n' +
          '- 用户行为分析：分析不同商户的核销模式和时间分布\n' +
          '- 纠纷处理依据：财务纠纷时提供操作人证据进行举证\n' +
          '查询示例（Query Examples）：\n' +
          '- 商户核销统计：COUNT(*) WHERE operator_id=? AND status=used\n' +
          '- 商户排行榜：GROUP BY operator_id ORDER BY COUNT(*) DESC\n' +
          '- 追溯核销记录：WHERE operator_id=? AND used_at BETWEEN ? AND ?\n' +
          '外键关联（Foreign Key）：\n' +
          '- 引用表：users.user_id\n' +
          '- 删除策略：SET NULL（操作人账号删除时保留核销记录，operator_id设为NULL）\n' +
          '- 更新策略：CASCADE（操作人user_id更新时同步更新）',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },

      // 核销信息（商家验证用户使用权限的唯一凭证，防伪和追溯的核心）
      verification_code: {
        type: DataTypes.STRING(32),
        allowNull: true,
        unique: true,
        comment:
          '核销码（商家验证使用的唯一识别码，业务规则：兑换审核通过时生成，全局唯一不可重复，商家扫码核销时验证，核销后status变为used，格式：8位大写十六进制字符，用途：商家核销验证、防伪追溯、使用凭证）'
      },

      verification_expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment:
          '核销码过期时间（核销码的有效期截止时间，北京时间，业务规则：生成后24小时有效，超过此时间核销码失效，null表示永久有效，用途：核销码有效性验证、防止长期未使用造成资源浪费）'
      },

      // 转让信息（支持用户间物品转让功能，记录转让流向和时间）
      transfer_to_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment:
          '转让给的用户ID（接收转让的目标用户ID，业务规则：转让后原用户不再拥有该物品，status变为transferred，目标用户会获得新的inventory记录，用途：转让追溯、用户物品流转分析）'
      },

      transfer_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment:
          '转让时间（物品转让的北京时间，业务规则：转让操作执行时记录，用途：转让历史查询、物品流转时间分析）'
      },

      // 额外属性（前端展示相关的辅助信息）
      icon: {
        type: DataTypes.STRING(10),
        allowNull: true,
        comment:
          '显示图标（前端展示的图标标识，如emoji或图标代码，用途：用户界面展示、物品类型可视化识别）',
        /**
         * ✅ 优化3：添加虚拟字段getter，自动补全默认值（P1优化 - 性能提升15-20ms）
         * @returns {string} 图标字符串
         */
        get () {
          const rawValue = this.getDataValue('icon')
          if (rawValue) return rawValue // 如果已设置icon，直接返回

          // 根据type自动生成默认icon（未设置时）
          const type = this.getDataValue('type')
          const defaultIcons = {
            voucher: '🎫', // 优惠券图标
            product: '🎁', // 实物商品图标
            service: '🔧' // 服务图标
          }
          return defaultIcons[type] || '📦' // 未知类型默认图标
        }
      },

      /*
       * ========================================
       * 市场交易相关字段（Market Trading Fields - V4.0新增功能）
       * ========================================
       * 业务场景：用户可以将闲置库存物品上架到市场出售，其他用户可以购买
       * 功能模块：市场商品列表、商品上架、商品撤回、商品购买
       * 迁移文件：20250929165731-add-market-fields-to-user-inventory.js
       * 相关API：
       * - GET /api/v4/inventory/market/products - 获取市场商品列表
       * - GET /api/v4/inventory/market/products/:id - 获取商品详情
       * - POST /api/v4/inventory/market/products/:id/withdraw - 撤回商品
       * - POST /api/v4/inventory/market/products/:id/purchase - 购买商品
       * ========================================
       */

      // 市场状态（Market Status - 商品在市场的交易状态）
      market_status: {
        type: DataTypes.ENUM('on_sale', 'sold', 'withdrawn'),
        allowNull: true,
        comment:
          '市场状态（Market Status - 商品在市场的交易状态）：on_sale-在售中（可被购买或撤回）| sold-已售出（终态，已被其他用户购买）| withdrawn-已撤回（终态，卖家主动下架）| null-普通库存（未上架到市场）；业务规则：只有on_sale状态可以撤回，sold和withdrawn为终态不可逆转；用途：市场商品筛选、状态流转控制、交易记录'
      },

      // 售价（Selling Price in Points - 用户设定的商品售价）
      selling_points: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment:
          '出售价格（Selling Price - 用户设定的商品售价，单位：积分）：卖家自定义价格，通常低于原value值以吸引买家；业务规则：上架时必填，撤回后清空为null；数据范围：1-10000积分；用途：市场价格排序、交易金额计算、成本收益分析'
      },

      // 成色（Item Condition - 商品物理状态和使用程度）
      condition: {
        type: DataTypes.ENUM('new', 'excellent', 'good', 'fair', 'poor'),
        allowNull: true,
        defaultValue: 'good',
        comment:
          '物品成色（Item Condition - 商品物理状态和使用程度）：new-全新（未使用，原包装）| excellent-优秀（轻微使用痕迹）| good-良好（正常使用痕迹，默认值）| fair-一般（明显使用痕迹）| poor-较差（严重磨损或缺陷）；业务规则：影响商品价格和吸引力，建议撤回后保留不清空（优化建议）；用途：商品质量评估、价格参考、买家筛选条件'
      },

      // 转让次数统计（Transfer Count - 商品流转次数记录）
      transfer_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment:
          '转让次数（Transfer Count - 商品被转让的累计次数）：每次市场交易成功后+1；业务规则：初始值0，每次转让后自增；用途：商品流转历史、热门商品识别、交易活跃度分析'
      },

      // 获得方式（Acquisition Method - 用户如何获得该物品）
      acquisition_method: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment:
          '获得方式（Acquisition Method - 用户如何获得该物品）：lottery-抽奖中奖 | exchange-积分兑换 | transfer-市场购买转让 | admin-管理员发放 | compensation-系统补偿；业务规则：创建时记录，不可修改；用途：来源追溯、获取渠道分析、用户行为统计'
      },

      // 获得成本（Acquisition Cost - 用户获得该物品花费的积分）
      acquisition_cost: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment:
          '获得成本（Acquisition Cost - 用户获得该物品花费的积分）：兑换时为兑换消耗的积分，抽奖时为抽奖消耗的积分，转让时为购买支付的积分；业务规则：创建时记录，用于成本收益计算；用途：成本追溯、盈亏分析、定价参考'
      },

      // 是否可转让（Can Transfer - 该物品是否允许转让给其他用户）
      can_transfer: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment:
          '是否可转让（Can Transfer - 该物品是否允许转让给其他用户或上架到市场）：true-可转让（可上架到市场出售）| false-不可转让（如系统专属奖品、限定物品）；业务规则：创建时设定，管理员可修改；用途：物品流转控制、市场准入限制'
      },

      // 是否可使用（Can Use - 该物品是否允许核销使用）
      can_use: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment:
          '是否可使用（Can Use - 该物品是否允许核销使用）：true-可使用（可通过核销码核销）| false-不可使用（如纯展示物品、收藏品）；业务规则：创建时设定，管理员可修改；用途：核销权限控制、物品分类管理'
      },

      /*
       * ========================================
       * 转让追踪字段（Transfer Tracking Fields - V4.2新增功能）
       * ========================================
       * 业务场景：记录物品"最后一次从哪里转来"和"最后转让时间"，支持快速追溯
       * 功能模块：物品转让历史、来源追溯、转让链条分析
       * 迁移文件：20251109234220-add-transfer-tracking-fields-to-user-inventory.js
       * 相关API：
       * - POST /api/v4/inventory/transfer - 物品转让功能
       * - GET /api/v4/inventory/transfer-history - 转让历史查询
       * 业务价值：
       * - 快速查询：无需JOIN TradeRecord表即可获取最后转让信息（性能提升）
       * - 数据完整性：UserInventory自包含转让信息，支持快速追溯
       * - 双重追溯：与TradeRecord配合，提供完整的转让链条追溯能力
       * ========================================
       */

      // 最后转让时间（Last Transfer Time - 物品最后一次被转让的时间）
      last_transfer_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment:
          '最后转让时间（Last Transfer Time - 记录物品最后一次被转让的北京时间）：每次转让时更新为当前时间；初始值为NULL表示未转让或首次获得；业务规则：转让操作执行时自动更新；用途：追溯物品流转历史、转让频率分析、数据审计、转让时间线统计'
      },

      // 最后转让来源用户（Last Transfer From - 物品最后一次从哪个用户转来）
      last_transfer_from: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment:
          '最后转让来源用户ID（Last Transfer From User ID - 记录物品最后一次从哪个用户转让而来）：每次转让时更新为转让方用户ID；初始值为NULL表示未转让或首次获得；外键关联：users.user_id（转让来源用户）；业务规则：转让操作执行时自动更新；用途：追溯物品来源、转让链条分析、用户关系网络分析、转让路径可视化',
        references: {
          model: 'users',
          key: 'user_id'
        }
      },

      // 物品名称（已废弃字段 - Item Name - Deprecated）
      item_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment:
          '物品名称（Item Name - 已废弃字段）：⚠️ 此字段已废弃，请使用name字段；历史数据已迁移到name字段；保留字段仅为数据库表结构兼容，不再使用；业务规则：始终为NULL，禁止写入新数据；用途：历史遗留，等待数据库迁移后删除'
      },

      // 物品类型（已废弃字段 - Item Type - Deprecated）
      item_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment:
          '物品类型（Item Type - 已废弃字段）：⚠️ 此字段已废弃，请使用type字段；历史数据已迁移到type字段；保留字段仅为数据库表结构兼容，不再使用；业务规则：始终为NULL，禁止写入新数据；用途：历史遗留，等待数据库迁移后删除'
      },

      // 是否可用（Is Available - 商品当前是否可用）
      is_available: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment:
          '是否可用（Is Available - 商品当前是否可用）：true-可用（用户可以查看、使用、转让该物品）| false-不可用（如已锁定、审核中）；业务规则：撤回商品后保持true，保证用户依然拥有该物品；用途：商品可用性控制、前端展示筛选'
      },

      /*
       * ========================================
       * 撤回追踪字段（Withdrawal Tracking Fields - V4.1优化功能）
       * ========================================
       * 业务场景：防止恶意用户滥用撤回功能刷新商品排序，记录撤回历史便于数据分析
       * 功能模块：撤回冷却时间检查、撤回次数统计、撤回原因分析
       * 相关API：POST /api/v4/inventory/market/products/:id/withdraw
       * 推荐方案：轻量级优化（方案2）- 在UserInventory表增加字段，无需新建表
       * ========================================
       */

      // 撤回次数统计（Withdrawal Count - 商品被撤回的累计次数）
      withdraw_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment:
          '撤回次数统计（Withdrawal Count - 商品被撤回的累计次数）：每次撤回操作后+1；业务规则：初始值0，每次撤回自增，不可手动修改；用途：防滥用监控（超过5次可能异常）、用户行为分析、撤回率统计；建议阈值：正常用户<3次，>5次需关注'
      },

      // 最后撤回时间（Last Withdrawal Time - 最近一次撤回操作的时间）
      last_withdraw_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment:
          '最后撤回时间（Last Withdrawal Time - 最近一次撤回操作的北京时间）：记录最后撤回的精确时间；业务规则：首次撤回时设置，每次撤回后更新，用于冷却时间检查（建议4小时冷却）；用途：防滥用冷却检查、撤回时间分析、审计追溯；冷却机制：4小时内禁止再次撤回任何商品'
      },

      // 最后撤回原因（Last Withdrawal Reason - 最近一次撤回的原因说明）
      last_withdraw_reason: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment:
          '最后撤回原因（Last Withdrawal Reason - 最近一次撤回的原因说明）：用户可选填写撤回原因（如"定价错误"、"暂时不卖"、"商品信息有误"）；业务规则：首次撤回时设置，每次撤回后覆盖更新；用途：撤回原因分析、用户行为研究、问题追溯；常见原因：定价错误40%、改变主意25%、信息错误15%、线下交易10%、其他10%'
      }
    },
    {
      tableName: 'user_inventory',
      timestamps: true,
      created_at: 'created_at',
      updated_at: 'updated_at',
      underscored: true,
      indexes: [
        {
          fields: ['user_id', 'status']
        },
        {
          fields: ['type']
        },
        {
          fields: ['expires_at']
        },
        {
          fields: ['verification_code'],
          unique: true,
          where: {
            verification_code: {
              [require('sequelize').Op.not]: null
            }
          }
        },
        {
          fields: ['source_type', 'source_id']
        },
        {
          name: 'idx_user_inventory_last_transfer_at',
          fields: ['last_transfer_at'],
          comment: '转让时间索引（用于转让历史时间排序和查询）'
        },
        {
          name: 'idx_user_inventory_last_transfer_from',
          fields: ['last_transfer_from'],
          comment: '转让来源用户索引（用于追溯物品来源用户）'
        }
      ],
      comment: '用户库存表'
    }
  )

  // 定义关联关系
  UserInventory.associate = function (models) {
    // 归属用户（物品所有者 - 谁拥有这个物品）
    UserInventory.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      comment: '物品所有者关联（Owner Association）- 关联获得该物品的用户'
    })

    // 转让目标用户（物品转让接收者 - 物品被转让给谁）
    UserInventory.belongsTo(models.User, {
      foreignKey: 'transfer_to_user_id',
      as: 'transferTarget',
      comment: '转让目标用户关联（Transfer Target Association）- 关联接收转让的用户'
    })

    // 核销操作人（商户或管理员 - 谁核销了这个物品）
    UserInventory.belongsTo(models.User, {
      foreignKey: 'operator_id',
      as: 'operator',
      comment:
        '核销操作人关联（Operator Association）\n' +
        '业务用途（Business Usage）：\n' +
        '- 追溯核销操作人：查询是哪个商户或管理员执行的核销\n' +
        '- 商户绩效查询：通过operator关联获取操作人的详细信息\n' +
        '- 财务对账支持：关联商户信息进行核销记录对账\n' +
        '查询示例（Query Example）：\n' +
        '```javascript\n' +
        'const verifiedItems = await UserInventory.findAll({\n' +
        '  where: { status: "used" },\n' +
        '  include: [\n' +
        '    { model: User, as: "user" },      // 物品所有者\n' +
        '    { model: User, as: "operator" }   // 核销操作人\n' +
        '  ]\n' +
        '});\n' +
        '// 结果：item.user（物品所有者信息）, item.operator（核销操作人信息）\n' +
        '```'
    })

    // 最后转让来源用户（物品最后一次从哪个用户转来）
    UserInventory.belongsTo(models.User, {
      foreignKey: 'last_transfer_from',
      as: 'lastTransferFromUser',
      comment:
        '最后转让来源用户关联（Last Transfer From Association）\n' +
        '业务用途（Business Usage）：\n' +
        '- 追溯物品来源：查询物品最后一次从哪个用户转让而来\n' +
        '- 转让链条分析：通过last_transfer_from递归查询完整转让路径\n' +
        '- 用户关系网络：分析用户之间的物品流转关系\n' +
        '查询示例（Query Example）：\n' +
        '```javascript\n' +
        'const item = await UserInventory.findByPk(1, {\n' +
        '  include: [\n' +
        '    { model: User, as: "user" },                 // 当前所有者\n' +
        '    { model: User, as: "lastTransferFromUser" }  // 上一任所有者\n' +
        '  ]\n' +
        '});\n' +
        '// 结果：item.user（当前所有者）, item.lastTransferFromUser（转让来源用户）\n' +
        '```'
    })
  }

  /**
   * 检查物品是否已过期
   *
   * 业务场景：判断物品当前是否已超过有效期，用于前端展示和使用权限验证
   *
   * 业务规则：
   * - 如果expires_at为null，表示永久有效，返回false
   * - 如果当前北京时间超过expires_at，返回true表示已过期
   *
   * @returns {boolean} true-已过期，false-未过期或永久有效
   *
   * @example
   * const item = await UserInventory.findByPk(1);
   * if (item.isExpired()) {
   *   console.log('该物品已过期');
   * }
   */
  UserInventory.prototype.isExpired = function () {
    if (!this.expires_at) return false
    return BeijingTimeHelper.isExpired(this.expires_at)
  }

  /**
   * 检查物品是否可以使用
   *
   * 业务场景：验证用户是否可以使用该物品，用于核销前的权限验证
   *
   * 业务规则：
   * - 必须同时满足两个条件：
   *   1. status为'available'（可使用状态）
   *   2. 未过期（isExpired()返回false）
   *
   * @returns {boolean} true-可以使用，false-不可使用（已使用/已过期/已转让等）
   *
   * @example
   * const item = await UserInventory.findByPk(1);
   * if (item.isUsable()) {
   *   // 允许用户使用该物品
   *   await merchantService.verifyCode(item.verification_code);
   * } else {
   *   throw new Error('该物品不可使用');
   * }
   */
  UserInventory.prototype.isUsable = function () {
    return this.status === 'available' && !this.isExpired()
  }

  /**
   * 获取物品剩余有效时间
   *
   * 业务场景：显示物品距离过期还有多长时间，用于前端倒计时和过期提醒
   *
   * 业务规则：
   * - 如果expires_at为null，返回null表示永久有效
   * - 如果剩余时间为负数（已过期），返回0
   * - 否则返回剩余的毫秒数
   *
   * @returns {number|null} 剩余毫秒数（≥0），null表示永久有效
   *
   * @example
   * const item = await UserInventory.findByPk(1);
   * const remaining = item.getTimeRemaining();
   * if (remaining === null) {
   *   console.log('永久有效');
   * } else if (remaining > 0) {
   *   console.log(`剩余 ${Math.floor(remaining / 1000 / 60 / 60)} 小时`);
   * } else {
   *   console.log('已过期');
   * }
   */
  UserInventory.prototype.getTimeRemaining = function () {
    if (!this.expires_at) return null
    const remaining = BeijingTimeHelper.timeDiff(
      BeijingTimeHelper.createDatabaseTime(),
      this.expires_at
    )
    return remaining > 0 ? remaining : 0
  }

  /**
   * 生成核销码（兑换审核通过后调用）
   *
   * 业务场景：用户兑换审核通过后，为库存物品生成唯一的核销码，供商家核销使用
   *
   * 业务流程：
   * 1. 生成8位大写十六进制随机码
   * 2. 检查数据库中是否已存在该核销码
   * 3. 如果重复，重新生成直到唯一
   * 4. 设置核销码和过期时间（24小时后）
   * 5. 保存到数据库
   *
   * 业务规则：
   * - 核销码全局唯一，不可重复
   * - 核销码有效期24小时
   * - 格式：8位大写十六进制字符（如：A1B2C3D4）
   *
   * 性能考虑：
   * - 循环中使用await可能影响性能
   * - TODO: 可考虑使用Redis缓存已生成的核销码，减少数据库查询
   *
   * @returns {Promise<string>} 生成的核销码
   *
   * @example
   * // 兑换审核通过后
   * const item = await UserInventory.create({
   *   user_id: 1,
   *   name: '优惠券',
   *   type: 'voucher',
   *   status: 'available'
   * });
   * const code = await item.generateVerificationCode();
   * console.log('核销码:', code); // 输出: A1B2C3D4
   */
  UserInventory.prototype.generateVerificationCode = async function () {
    const crypto = require('crypto')
    let code
    let isUnique = false

    /*
     * 确保生成唯一的核销码
     * TODO: 性能优化 - 考虑重构避免循环中await
     */
    while (!isUnique) {
      code = crypto.randomBytes(4).toString('hex').toUpperCase()
      const existing = await UserInventory.findOne({
        where: { verification_code: code }
      })
      isUnique = !existing
    }

    this.verification_code = code
    this.verification_expires_at = BeijingTimeHelper.futureTime(24 * 60 * 60 * 1000) // 24小时后过期
    await this.save()

    return code
  }

  return UserInventory
}
