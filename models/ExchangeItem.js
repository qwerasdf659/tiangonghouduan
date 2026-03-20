/**
 * @deprecated 此模型将被 Product 模型替代（2026-03-20 EAV改造）
 * 数据已迁移到 products 表，此模型仅保留供兑换服务过渡期使用
 * 新功能请使用 Product + ProductSku + ExchangeChannelPrice
 *
 * 兑换市场商品模型 - ExchangeItem
 * 材料资产支付兑换市场核心表（V4.5.0统一版）
 *
 * 业务场景：
 * - 用户通过抽奖、转换等途径获得材料资产（红水晶碎片、红水晶等）
 * - 材料资产存入统一账本（Account + AccountAssetBalance）
 * - 用户使用材料资产兑换商品（通过 BalanceService.changeBalance() 扣减）
 *
 * 支付方式说明（V4.5.0唯一方式）：
 * - cost_asset_code：兑换商品需要的材料资产类型（如 red_shard）
 * - cost_amount：兑换单件商品需要的材料数量
 * - 所有兑换操作通过 BalanceService.changeBalance() 扣减材料资产
 *
 * 业务规则（强制）：
 * - ✅ 兑换只能使用材料资产支付
 * - ✅ cost_asset_code + cost_amount 为新商品必填字段
 * - ❌ 禁止积分支付和虚拟奖品价值支付（已彻底移除）
 *
 * 最后修改：2025年12月18日 - 暴力移除旧方案，统一为材料资产支付
 */

const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const ExchangeItem = sequelize.define(
    'ExchangeItem',
    {
      // 主键
      exchange_item_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '商品唯一标识'
      },

      // 基础信息
      item_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '商品名称（兑换商品的显示名称）'
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '商品描述'
      },
      // 主媒体文件ID（media_files.media_id，2026-03-16 媒体体系替代 image_resources）
      primary_media_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        comment: '主媒体文件ID，FK→media_files.media_id（2026-03-16 媒体体系）',
        references: {
          model: 'media_files',
          key: 'media_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },

      // V4.5.0 材料资产支付字段（唯一支付方式）
      cost_asset_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment:
          '成本资产代码（Cost Asset Code - 兑换商品消耗的材料资产类型）：red_shard-红水晶碎片、red_crystal-红水晶等；业务规则：必填字段；支持多种材料资产扩展；用途：兑换支付资产类型、库存扣减依据、成本核算基础'
      },
      cost_amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment:
          '成本数量（Cost Amount - 兑换单件商品需要的材料数量）：单位根据cost_asset_code确定（如10个红水晶碎片）；业务规则：必填字段；使用BIGINT避免浮点精度问题；数据范围：1-1000000；用途：兑换扣减材料数量、成本核算、商品定价参考'
      },

      // 成本和库存
      cost_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '实际成本（人民币）',
        /**
         * 获取成本价格，将DECIMAL转换为浮点数
         * @returns {number} 成本价格（元）
         */
        get() {
          const value = this.getDataValue('cost_price')
          return value ? parseFloat(value) : 0
        }
      },
      stock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '库存数量'
      },
      sold_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '已售数量'
      },

      // 分类和状态
      category_def_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '商品分类ID，FK→category_defs.category_def_id（2026-03-16 整数主键迁移）',
        references: {
          model: 'category_defs',
          key: 'category_def_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
        comment: '商品状态'
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序序号'
      },

      // === 以下为新增字段（臻选空间/幸运空间/竞价功能需求，共 9 个 — 决策12） ===

      /**
       * 空间归属（核心业务字段）
       * - lucky: 幸运空间（存量77条商品默认归入）
       * - premium: 臻选空间（运营手动配置）
       * - both: 两个空间都展示
       */
      space: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'lucky',
        comment: '所属空间：lucky=幸运空间, premium=臻选空间, both=两者都展示'
      },

      /** 原价（材料数量），用于展示划线价对比，前端可计算折扣 */
      original_price: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '原价（材料数量），用于展示划线价对比'
      },

      /** 商品标签数组，如 ["限量","新品"] */
      tags: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '商品标签数组，如 ["限量","新品"]'
      },

      /** 是否新品（角标展示） */
      is_new: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否新品'
      },

      /** 是否热门（角标展示） */
      is_hot: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否热门'
      },

      /** 是否幸运商品（特殊标识） */
      is_lucky: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否幸运商品（特殊标识）'
      },

      /** 是否有质保 */
      has_warranty: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否有质保'
      },

      /** 是否包邮 */
      free_shipping: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否包邮'
      },

      /** 是否限量商品（管理员手动控制，触发小程序旋转彩虹边框） */
      is_limited: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否限量商品（管理员手动控制，触发小程序旋转彩虹边框）'
      },

      /** 营销卖点文案 */
      sell_point: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '营销卖点文案'
      },

      /**
       * 使用说明条目数组（兑换详情页展示）
       * 如 ["兑换后物品自动进入背包", "虚拟物品一经兑换不可退还"]
       * @see docs/兑换详情页B+C混合方案设计文档.md 任务 B1
       */
      usage_rules: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
        comment: '使用说明条目数组，如 ["兑换后物品自动进入背包","虚拟物品一经兑换不可退还"]'
      },

      /**
       * 稀有度代码 — 关联 rarity_defs 字典表
       * 用于小程序卡片增强特效（holo 全息光效仅 legendary 触发）
       * @see docs/项目特效主题体系分析报告.md 八.13 决策4
       */
      rarity_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'common',
        comment: '稀有度代码（common/uncommon/rare/epic/legendary），FK→rarity_defs',
        references: {
          model: 'rarity_defs',
          key: 'rarity_code'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      // === Phase 0 新增字段：SPU/SKU 全量模式 + 排序增强（2026-03-16） ===

      /** 规格维度名称，如 ["颜色","尺码"]；单品商品为 NULL */
      spec_names: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
        comment: '规格维度名称，如 ["颜色","尺码"]；单品商品为 NULL'
      },

      /** SKU 最低价（自动计算汇总字段，单品时等于 cost_amount） */
      min_cost_amount: {
        type: DataTypes.BIGINT,
        allowNull: true,
        defaultValue: null,
        comment: 'SKU 最低价（自动计算，单品时等于 cost_amount）'
      },

      /** SKU 最高价（自动计算汇总字段，单品时等于 cost_amount） */
      max_cost_amount: {
        type: DataTypes.BIGINT,
        allowNull: true,
        defaultValue: null,
        comment: 'SKU 最高价（自动计算，单品时等于 cost_amount）'
      },

      /** 是否置顶（置顶的始终排在最前） */
      is_pinned: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否置顶（置顶的始终排在最前）'
      },

      /** 置顶时间（多个置顶时按此排序） */
      pinned_at: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
        comment: '置顶时间（多个置顶时按此排序）'
      },

      /** 是否推荐（前端可高亮展示、「推荐」标签） */
      is_recommended: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否推荐（前端可高亮展示）'
      },

      // === 定时上下架 + 商品参数表 + 库存预警（2026-03-17） ===

      /** 定时上架时间（到达后自动将 status 设为 active） */
      publish_at: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
        comment: '定时上架时间（到达后自动上架）'
      },

      /** 定时下架时间（到达后自动将 status 设为 inactive） */
      unpublish_at: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
        comment: '定时下架时间（到达后自动下架）'
      },

      /** 商品参数表（结构化 JSON，如 {"材质":"纯棉","产地":"中国"}） */
      attributes: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
        comment: '商品参数表（结构化JSON）'
      },

      /** 库存预警阈值（低于此值触发告警，0=不告警） */
      stock_alert_threshold: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '库存预警阈值（低于此值触发告警，0=不告警）'
      },

      /** 商品视频 URL（支持视频展示） */
      video_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        defaultValue: null,
        comment: '商品视频 URL（支持视频展示）'
      }
    },
    {
      tableName: 'exchange_items',
      timestamps: true,
      created_at: 'created_at',
      updated_at: 'updated_at',
      underscored: true,
      indexes: [
        { fields: ['status'] },
        { fields: ['category_def_id'] },
        { fields: ['cost_asset_code'] },
        { fields: ['space'], name: 'idx_space' },
        { fields: ['space', 'status'], name: 'idx_space_status' },
        { fields: ['rarity_code'], name: 'idx_exchange_items_rarity_code' }
      ],
      comment: '兑换市场商品表（V4.5.0材料资产支付 + 臻选空间/幸运空间扩展）'
    }
  )

  /**
   * 关联定义
   *
   * @param {Object} models - Sequelize所有模型集合
   * @returns {void} 无返回值，仅定义模型关联关系
   */
  ExchangeItem.associate = function (models) {
    // 一对多：商品有多个兑换记录
    ExchangeItem.hasMany(models.ExchangeRecord, {
      foreignKey: 'exchange_item_id',
      as: 'exchangeRecords'
    })

    // 多对一：商品关联主媒体文件（2026-03-16 媒体体系，替代 image_resources）
    if (models.MediaFile) {
      ExchangeItem.belongsTo(models.MediaFile, {
        foreignKey: 'primary_media_id',
        as: 'primary_media'
      })
    }

    // 多对一：商品关联稀有度定义（2026-03-06 全局主题体系统一）
    ExchangeItem.belongsTo(models.RarityDef, {
      foreignKey: 'rarity_code',
      targetKey: 'rarity_code',
      as: 'rarityDef'
    })

    // 多对一：商品关联分类定义（2026-03-16 整数主键迁移）
    ExchangeItem.belongsTo(models.CategoryDef, {
      foreignKey: 'category_def_id',
      as: 'categoryDef'
    })

    // 一对多：商品有多个 SKU（全量 SKU 模式，每个商品至少一个默认 SKU）
    if (models.ExchangeItemSku) {
      ExchangeItem.hasMany(models.ExchangeItemSku, {
        foreignKey: 'exchange_item_id',
        as: 'skus'
      })
    }

    // 一对多：商品有多个竞价记录（臻选空间/幸运空间竞价功能）
    if (models.BidProduct) {
      ExchangeItem.hasMany(models.BidProduct, {
        foreignKey: 'exchange_item_id',
        as: 'bidProducts'
      })
    }
  }

  /**
   * 检查库存是否充足
   *
   * @returns {boolean} 是否有库存（true-有库存，false-无库存）
   */
  ExchangeItem.prototype.hasStock = function () {
    return this.stock > 0
  }

  /**
   * 获取材料资产支付要求（V4.5.0统一版）
   *
   * @returns {Object} 支付要求
   * @returns {string} returns.asset_code - 需要的材料资产代码
   * @returns {number} returns.amount - 需要的材料数量
   */
  ExchangeItem.prototype.getPaymentRequired = function () {
    return {
      asset_code: this.cost_asset_code,
      amount: this.cost_amount || 0
    }
  }

  return ExchangeItem
}
