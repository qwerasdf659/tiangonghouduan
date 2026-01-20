# 📊 数据库表API覆盖率分析报告

## 🎯 本文档解决的问题

**核心问题**：数据库表在服务层有内部使用（被抽奖引擎、市场服务、资产服务等内部调用），但没有对外暴露管理API，导致Web管理平台无法对这些数据进行查看和管理。

**具体表现**：
1. 后端数据库有64张表，但Web管理平台只能操作其中15张（23.4%）
2. 49张表（76.6%）的数据无法通过管理后台查看、编辑或配置
3. 管理员无法通过前端界面管理抽奖策略配置、用户状态、系统设置等核心业务数据

**本文档目的**：
- 全面排查所有数据库表的API暴露情况
- 识别哪些表需要补齐对外管理API
- 按优先级给出API补齐的行动建议

> ⚠️ **范围说明**：本文档仅涉及**后端API补齐**，不包含微信小程序前端和Web管理后台前端的实现内容。

---

> **生成时间**：2026/1/21 02:11:14（业务分析更新：2026/1/21 02:45:00）
> 
> **用户决策拍板**：2026/1/21（方案A一次性补齐 + 字典表完整CRUD + 敏感接口仅admin）
> 
> **数据来源**：真实数据库连接 + 项目代码静态扫描 + 业务逻辑深度分析
> 
> **分析范围**：64 张数据库表（排除 sequelizemeta）

---

## 🏢 项目商业模式与业务逻辑

### 商业模式概述

**餐厅积分抽奖系统 V4.6** - 一个面向餐饮行业的用户激励平台：

1. **用户获取积分**：用户在合作餐厅消费 → 商家扫码录入消费记录 → 管理员审核通过 → 系统自动奖励积分
2. **积分抽奖**：用户消耗积分参与抽奖 → 100%中奖（只是奖品价值不同）→ 获得虚拟/实物奖品
3. **奖品兑换**：用户可选择核销实物奖品（到店兑换）或在市场挂牌出售
4. **市场交易**：用户可以挂牌出售物品/资产 → 其他用户购买 → 平台抽取手续费

### 技术架构特点

1. **统一抽奖引擎（UnifiedLotteryEngine）**：管线架构，支持三种决策来源
   - `preset`：管理员预设的中奖记录（最高优先级）
   - `override`：管理员临时干预（次高优先级）
   - `normal`：正常概率抽奖

2. **事务边界治理**：所有写操作强制要求外部事务传入，服务层禁止自建事务

3. **审计日志体系**：所有敏感操作都记录到 `admin_operation_logs`

### 核心业务流程

```
用户消费 → 商家扫码录入 → 管理员审核 → 积分奖励 → 积分抽奖 → 获得奖品 → 核销/交易
```

---

## 📈 总体统计

| 分类 | 数量 | 占比 | 说明 |
|------|------|------|------|
| ✅ 完整覆盖 | 15 | 23.4% | 有模型 + 服务层使用 + 对外API |
| ⚠️ **仅内部使用** | 49 | 76.6% | **有服务层使用但无对外管理API** |
| 📡 仅路由层 | 0 | 0.0% | 有API但服务层使用少 |
| 🔸 未使用 | 0 | 0.0% | 有模型但代码中未使用 |
| ❌ 无模型 | 0 | 0.0% | 数据库有表但无模型定义 |

---

## 🔴 重点关注：仅内部使用的表（需补齐对外管理API）

以下 **49** 张表在服务层有内部使用，但**没有对外暴露管理API**：

| 序号 | 表名 | 模型名 | 数据量 | 服务层使用文件 | 说明 |
|------|------|--------|--------|----------------|------|
| 1 | accounts | Account | 22 | `ActivityConditionValidator.js`, `AssetService.js`, `BackpackService.js` | 账户表（统一用户账户与系统账户） |
| 2 | admin_operation_logs | AdminOperationLog | 3377 | `AdminLotteryService.js`, `AuditLogService.js`, `HierarchyManagementService.js` | 操作审计日志表（记录所有敏感操作） |
| 3 | administrative_regions | AdministrativeRegion | 44569 | `RegionService.js`, `StoreService.js` | 行政区划字典表（省市区街道数据，支持级联选择） |
| 4 | api_idempotency_requests | ApiIdempotencyRequest | 917 | `IdempotencyService.js` | API入口幂等表 - 实现重试返回首次结果 |
| 5 | asset_group_defs | AssetGroupDef | 8 | `MarketListingService.js` | 资产分组字典表（Asset Group Definitions - 可交易资产分组定义） |
| 6 | authentication_sessions | AuthenticationSession | 0 | `ReportingService.js` | 用户会话管理表 |
| 7 | category_defs | CategoryDef | 6 | `MarketListingService.js` | 物品类目字典表（Category Definitions - 商品/物品分类定义） |
| 8 | chat_messages | ChatMessage | 5 | `AdminCustomerServiceService.js`, `AdminSystemService.js`, `CustomerServiceSessionService.js` | 聊天消息表 |
| 9 | consumption_records | ConsumptionRecord | 11 | `AuditLogService.js`, `ConsumptionService.js`, `MerchantOperationLogService.js` | 用户消费记录表 - 记录用户通过商家扫码提交的消费信息 |
| 10 | content_review_records | ContentReviewRecord | 208 | `ConsumptionService.js`, `ContentAuditEngine.js`, `MerchantPointsService.js` | - |
| 11 | customer_service_sessions | CustomerServiceSession | 1 | `AdminCustomerServiceService.js`, `AdminSystemService.js`, `CustomerServiceSessionService.js` | 客户聊天会话表 |
| 12 | exchange_records | ExchangeRecord | 7 | `AuditLogService.js`, `ExchangeService.js` | 兑换市场记录表 |
| 13 | image_resources | ImageResources | 1 | `DataSanitizer.js`, `ExchangeService.js`, `ImageService.js` | 统一图片资源管理表 |
| 14 | item_instance_events | ItemInstanceEvent | 912 | `AssetService.js` | 物品实例事件表（记录所有物品变更事件） |
| 15 | item_templates | ItemTemplate | 16 | `MarketListingService.js` | 物品模板表（Item Templates - 不可叠加物品模板定义） |
| 16 | lottery_campaign_quota_grants | LotteryCampaignQuotaGrant | 0 | `PoolQuotaBudgetProvider.js` | 配额发放记录表 - 记录配额的发放来源和金额 |
| 17 | lottery_campaign_user_quota | LotteryCampaignUserQuota | 0 | `PoolQuotaBudgetProvider.js`, `EligibilityStage.js`, `SettleStage.js` | 用户活动配额表 - pool+quota模式下追踪用户预算配额 |
| 18 | lottery_campaigns | LotteryCampaign | 1 | `ActivityService.js`, `AdminLotteryService.js`, `DebtManagementService.js` | 抽奖活动配置表 |
| 19 | lottery_clear_setting_records | LotteryClearSettingRecord | 402 | `AdminLotteryService.js` | 抽奖清除设置记录表（为审计日志提供业务主键） |
| 20 | lottery_draw_decisions | LotteryDrawDecision | 0 | `SettleStage.js` | 抽奖决策快照表 - 记录每次抽奖的完整决策路径用于审计 |
| 21 | lottery_draw_quota_rules | LotteryDrawQuotaRule | 4 | `LotteryQuotaService.js` | - |
| 22 | lottery_management_settings | LotteryManagementSetting | 2023 | `AdminLotteryService.js`, `LoadDecisionSourceStage.js`, `ManagementStrategy.js` | 抽奖管理设置表：存储管理员的抽奖干预设置（强制中奖、强制不中奖、概率调整、用户专属队列） |
| 23 | lottery_presets | LotteryPreset | 2 | `DebtManagementService.js`, `LotteryPresetService.js`, `LoadDecisionSourceStage.js` | 抽奖结果预设表（简化版） |
| 24 | lottery_strategy_config | LotteryStrategyConfig | 17 | `StrategyConfig.js` | 抽奖策略全局配置表（Budget Tier阈值/Pity配置/功能开关等） |
| 25 | lottery_tier_matrix_config | LotteryTierMatrixConfig | 12 | `StrategyConfig.js` | BxPx矩阵配置表（Budget Tier × Pressure Tier 组合的乘数配置） |
| 26 | lottery_tier_rules | LotteryTierRule | 9 | `ActivityService.js`, `LoadCampaignStage.js` | 抽奖档位规则表 - 定义各分层用户的档位概率（整数权重制） |
| 27 | lottery_user_daily_draw_quota | LotteryUserDailyDrawQuota | 7 | `LotteryQuotaService.js` | - |
| 28 | lottery_user_experience_state | LotteryUserExperienceState | 0 | `ExperienceStateManager.js`, `GlobalStateManager.js`, `TierPickStage.js` | 用户活动级抽奖体验状态表（Pity/AntiEmpty/AntiHigh） |
| 29 | lottery_user_global_state | LotteryUserGlobalState | 0 | `LuckDebtCalculator.js`, `GlobalStateManager.js` | 用户全局抽奖统计表（LuckDebt运气债务机制） |
| 30 | market_listings | MarketListing | 33 | `ExchangeService.js`, `FeeCalculator.js`, `MarketListingService.js` | - |
| 31 | material_asset_types | MaterialAssetType | 4 | `AssetConversionService.js`, `AssetService.js`, `BackpackService.js` | - |
| 32 | material_conversion_rules | MaterialConversionRule | 1 | `AssetConversionService.js`, `MaterialManagementService.js` | - |
| 33 | popup_banners | PopupBanner | 2 | `PopupBannerService.js` | - |
| 34 | preset_budget_debt | PresetBudgetDebt | 0 | `DebtManagementService.js` | 预设预算欠账表 - 记录预设强发时的预算垫付 |
| 35 | preset_debt_limits | PresetDebtLimit | 0 | `DebtManagementService.js` | 欠账上限配置表 - 配置各级别的欠账风险上限 |
| 36 | preset_inventory_debt | PresetInventoryDebt | 0 | `DebtManagementService.js` | 预设库存欠账表 - 记录预设强发时的库存垫付 |
| 37 | rarity_defs | RarityDef | 5 | `MarketListingService.js` | 稀有度字典表（Rarity Definitions - 物品稀有度等级定义） |
| 38 | redemption_orders | RedemptionOrder | 804 | `BackpackService.js`, `RedemptionService.js` | 兑换订单表（Redemption Orders）：管理核销码生成和核销流程，替代 UserInventory.verification_code |
| 39 | risk_alerts | RiskAlert | 0 | `MerchantRiskControlService.js` | - |
| 40 | store_staff | StoreStaff | 2 | `ConsumptionService.js`, `StaffManagementService.js`, `StoreService.js` | 门店员工关系表（员工-门店多对多，支持历史记录） |
| 41 | system_settings | SystemSettings | 38 | `AdminSystemService.js` | 系统设置表：存储系统各模块的配置设置 |
| 42 | trade_orders | TradeOrder | 0 | `AssetService.js`, `FeeCalculator.js`, `TradeOrderService.js` | - |
| 43 | user_hierarchy | UserHierarchy | 8 | `HierarchyManagementService.js` | 用户层级关系表（简化版：仅保留核心字段和必要索引） |
| 44 | user_premium_status | UserPremiumStatus | 0 | `PremiumService.js` | 用户高级空间状态表（极简版，无自动续费字段，降低维护成本60%，适合数据量<1000的小项目） |
| 45 | user_risk_profiles | UserRiskProfile | 2 | `MarketListingService.js` | 用户风控配置表：存储用户等级默认配置和个人自定义配置 |
| 46 | user_role_change_records | UserRoleChangeRecord | 145 | `UserRoleService.js` | 用户角色变更记录表（为审计日志提供业务主键） |
| 47 | user_roles | UserRole | 20 | `HierarchyManagementService.js`, `UserRoleService.js`, `UserService.js` | - |
| 48 | user_status_change_records | UserStatusChangeRecord | 144 | `UserRoleService.js` | 用户状态变更记录表（为审计日志提供业务主键） |
| 49 | websocket_startup_logs | WebSocketStartupLog | 860 | `ChatWebSocketService.js` | WebSocket服务启动日志表（记录所有启动/停止事件） |

### 详细分析

#### 1. `accounts` (Account)

- **数据量**：22 条
- **表说明**：账户表（统一用户账户与系统账户）
- **服务层使用位置**：
  - `services/ActivityConditionValidator.js`
  - `services/AssetService.js`
  - `services/BackpackService.js`
  - `services/ConsumptionService.js`
  - `services/ExchangeService.js`
  - `services/OrphanFrozenCleanupService.js`
  - `services/ReportingService.js`
  - `services/UserService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 2. `admin_operation_logs` (AdminOperationLog)

- **数据量**：3377 条
- **表说明**：操作审计日志表（记录所有敏感操作）
- **服务层使用位置**：
  - `services/AdminLotteryService.js`
  - `services/AuditLogService.js`
  - `services/HierarchyManagementService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 3. `administrative_regions` (AdministrativeRegion)

- **数据量**：44569 条
- **表说明**：行政区划字典表（省市区街道数据，支持级联选择）
- **服务层使用位置**：
  - `services/RegionService.js`
  - `services/StoreService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 4. `api_idempotency_requests` (ApiIdempotencyRequest)

- **数据量**：917 条
- **表说明**：API入口幂等表 - 实现重试返回首次结果
- **服务层使用位置**：
  - `services/IdempotencyService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 5. `asset_group_defs` (AssetGroupDef)

- **数据量**：8 条
- **表说明**：资产分组字典表（Asset Group Definitions - 可交易资产分组定义）
- **服务层使用位置**：
  - `services/MarketListingService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 6. `authentication_sessions` (AuthenticationSession)

- **数据量**：0 条
- **表说明**：用户会话管理表
- **服务层使用位置**：
  - `services/ReportingService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 7. `category_defs` (CategoryDef)

- **数据量**：6 条
- **表说明**：物品类目字典表（Category Definitions - 商品/物品分类定义）
- **服务层使用位置**：
  - `services/MarketListingService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 8. `chat_messages` (ChatMessage)

- **数据量**：5 条
- **表说明**：聊天消息表
- **服务层使用位置**：
  - `services/AdminCustomerServiceService.js`
  - `services/AdminSystemService.js`
  - `services/CustomerServiceSessionService.js`
  - `services/NotificationService.js`
  - `services/ReportingService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 9. `consumption_records` (ConsumptionRecord)

- **数据量**：11 条
- **表说明**：用户消费记录表 - 记录用户通过商家扫码提交的消费信息
- **服务层使用位置**：
  - `services/AuditLogService.js`
  - `services/ConsumptionService.js`
  - `services/MerchantOperationLogService.js`
  - `services/MerchantRiskControlService.js`
  - `services/ReportingService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 10. `content_review_records` (ContentReviewRecord)

- **数据量**：208 条
- **表说明**：无
- **服务层使用位置**：
  - `services/ConsumptionService.js`
  - `services/ContentAuditEngine.js`
  - `services/MerchantPointsService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 11. `customer_service_sessions` (CustomerServiceSession)

- **数据量**：1 条
- **表说明**：客户聊天会话表
- **服务层使用位置**：
  - `services/AdminCustomerServiceService.js`
  - `services/AdminSystemService.js`
  - `services/CustomerServiceSessionService.js`
  - `services/NotificationService.js`
  - `services/ReportingService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 12. `exchange_records` (ExchangeRecord)

- **数据量**：7 条
- **表说明**：兑换市场记录表
- **服务层使用位置**：
  - `services/AuditLogService.js`
  - `services/ExchangeService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 13. `image_resources` (ImageResources)

- **数据量**：1 条
- **表说明**：统一图片资源管理表
- **服务层使用位置**：
  - `services/DataSanitizer.js`
  - `services/ExchangeService.js`
  - `services/ImageService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 14. `item_instance_events` (ItemInstanceEvent)

- **数据量**：912 条
- **表说明**：物品实例事件表（记录所有物品变更事件）
- **服务层使用位置**：
  - `services/AssetService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 15. `item_templates` (ItemTemplate)

- **数据量**：16 条
- **表说明**：物品模板表（Item Templates - 不可叠加物品模板定义）
- **服务层使用位置**：
  - `services/MarketListingService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 16. `lottery_campaign_quota_grants` (LotteryCampaignQuotaGrant)

- **数据量**：0 条
- **表说明**：配额发放记录表 - 记录配额的发放来源和金额
- **服务层使用位置**：
  - `services/UnifiedLotteryEngine/pipeline/budget/PoolQuotaBudgetProvider.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 17. `lottery_campaign_user_quota` (LotteryCampaignUserQuota)

- **数据量**：0 条
- **表说明**：用户活动配额表 - pool+quota模式下追踪用户预算配额
- **服务层使用位置**：
  - `services/UnifiedLotteryEngine/pipeline/budget/PoolQuotaBudgetProvider.js`
  - `services/UnifiedLotteryEngine/pipeline/stages/EligibilityStage.js`
  - `services/UnifiedLotteryEngine/pipeline/stages/SettleStage.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 18. `lottery_campaigns` (LotteryCampaign)

- **数据量**：1 条
- **表说明**：抽奖活动配置表
- **服务层使用位置**：
  - `services/ActivityService.js`
  - `services/AdminLotteryService.js`
  - `services/DebtManagementService.js`
  - `services/LotteryCampaignPricingConfigService.js`
  - `services/PrizePoolService.js`
  - `services/UnifiedLotteryEngine/UnifiedLotteryEngine.js`
  - `services/UnifiedLotteryEngine/compute/calculators/BudgetTierCalculator.js`
  - `services/UnifiedLotteryEngine/compute/calculators/PressureTierCalculator.js`
  - `services/UnifiedLotteryEngine/pipeline/budget/PoolBudgetProvider.js`
  - `services/UnifiedLotteryEngine/pipeline/budget/PoolQuotaBudgetProvider.js`
  - `services/UnifiedLotteryEngine/pipeline/stages/LoadCampaignStage.js`
  - `services/lottery/LotteryHistoryService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 19. `lottery_clear_setting_records` (LotteryClearSettingRecord)

- **数据量**：402 条
- **表说明**：抽奖清除设置记录表（为审计日志提供业务主键）
- **服务层使用位置**：
  - `services/AdminLotteryService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 20. `lottery_draw_decisions` (LotteryDrawDecision)

- **数据量**：0 条
- **表说明**：抽奖决策快照表 - 记录每次抽奖的完整决策路径用于审计
- **服务层使用位置**：
  - `services/UnifiedLotteryEngine/pipeline/stages/SettleStage.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 21. `lottery_draw_quota_rules` (LotteryDrawQuotaRule)

- **数据量**：4 条
- **表说明**：无
- **服务层使用位置**：
  - `services/lottery/LotteryQuotaService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 22. `lottery_management_settings` (LotteryManagementSetting)

- **数据量**：2023 条
- **表说明**：抽奖管理设置表：存储管理员的抽奖干预设置（强制中奖、强制不中奖、概率调整、用户专属队列）
- **服务层使用位置**：
  - `services/AdminLotteryService.js`
  - `services/UnifiedLotteryEngine/pipeline/stages/LoadDecisionSourceStage.js`
  - `services/UnifiedLotteryEngine/strategies/ManagementStrategy.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 23. `lottery_presets` (LotteryPreset)

- **数据量**：2 条
- **表说明**：抽奖结果预设表（简化版）
- **服务层使用位置**：
  - `services/DebtManagementService.js`
  - `services/LotteryPresetService.js`
  - `services/UnifiedLotteryEngine/pipeline/stages/LoadDecisionSourceStage.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 24. `lottery_strategy_config` (LotteryStrategyConfig)

- **数据量**：17 条
- **表说明**：抽奖策略全局配置表（Budget Tier阈值/Pity配置/功能开关等）
- **服务层使用位置**：
  - `services/UnifiedLotteryEngine/compute/config/StrategyConfig.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 25. `lottery_tier_matrix_config` (LotteryTierMatrixConfig)

- **数据量**：12 条
- **表说明**：BxPx矩阵配置表（Budget Tier × Pressure Tier 组合的乘数配置）
- **服务层使用位置**：
  - `services/UnifiedLotteryEngine/compute/config/StrategyConfig.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 26. `lottery_tier_rules` (LotteryTierRule)

- **数据量**：9 条
- **表说明**：抽奖档位规则表 - 定义各分层用户的档位概率（整数权重制）
- **服务层使用位置**：
  - `services/ActivityService.js`
  - `services/UnifiedLotteryEngine/pipeline/stages/LoadCampaignStage.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 27. `lottery_user_daily_draw_quota` (LotteryUserDailyDrawQuota)

- **数据量**：7 条
- **表说明**：无
- **服务层使用位置**：
  - `services/lottery/LotteryQuotaService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 28. `lottery_user_experience_state` (LotteryUserExperienceState)

- **数据量**：0 条
- **表说明**：用户活动级抽奖体验状态表（Pity/AntiEmpty/AntiHigh）
- **服务层使用位置**：
  - `services/UnifiedLotteryEngine/compute/state/ExperienceStateManager.js`
  - `services/UnifiedLotteryEngine/compute/state/GlobalStateManager.js`
  - `services/UnifiedLotteryEngine/pipeline/stages/TierPickStage.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 29. `lottery_user_global_state` (LotteryUserGlobalState)

- **数据量**：0 条
- **表说明**：用户全局抽奖统计表（LuckDebt运气债务机制）
- **服务层使用位置**：
  - `services/UnifiedLotteryEngine/compute/calculators/LuckDebtCalculator.js`
  - `services/UnifiedLotteryEngine/compute/state/GlobalStateManager.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 30. `market_listings` (MarketListing)

- **数据量**：33 条
- **表说明**：无
- **服务层使用位置**：
  - `services/ExchangeService.js`
  - `services/FeeCalculator.js`
  - `services/MarketListingService.js`
  - `services/OrphanFrozenCleanupService.js`
  - `services/TradeOrderService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 31. `material_asset_types` (MaterialAssetType)

- **数据量**：4 条
- **表说明**：无
- **服务层使用位置**：
  - `services/AssetConversionService.js`
  - `services/AssetService.js`
  - `services/BackpackService.js`
  - `services/MarketListingService.js`
  - `services/MaterialManagementService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 32. `material_conversion_rules` (MaterialConversionRule)

- **数据量**：1 条
- **表说明**：无
- **服务层使用位置**：
  - `services/AssetConversionService.js`
  - `services/MaterialManagementService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 33. `popup_banners` (PopupBanner)

- **数据量**：2 条
- **表说明**：无
- **服务层使用位置**：
  - `services/PopupBannerService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 34. `preset_budget_debt` (PresetBudgetDebt)

- **数据量**：0 条
- **表说明**：预设预算欠账表 - 记录预设强发时的预算垫付
- **服务层使用位置**：
  - `services/DebtManagementService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 35. `preset_debt_limits` (PresetDebtLimit)

- **数据量**：0 条
- **表说明**：欠账上限配置表 - 配置各级别的欠账风险上限
- **服务层使用位置**：
  - `services/DebtManagementService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 36. `preset_inventory_debt` (PresetInventoryDebt)

- **数据量**：0 条
- **表说明**：预设库存欠账表 - 记录预设强发时的库存垫付
- **服务层使用位置**：
  - `services/DebtManagementService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 37. `rarity_defs` (RarityDef)

- **数据量**：5 条
- **表说明**：稀有度字典表（Rarity Definitions - 物品稀有度等级定义）
- **服务层使用位置**：
  - `services/MarketListingService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 38. `redemption_orders` (RedemptionOrder)

- **数据量**：804 条
- **表说明**：兑换订单表（Redemption Orders）：管理核销码生成和核销流程，替代 UserInventory.verification_code
- **服务层使用位置**：
  - `services/BackpackService.js`
  - `services/RedemptionService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 39. `risk_alerts` (RiskAlert)

- **数据量**：0 条
- **表说明**：无
- **服务层使用位置**：
  - `services/MerchantRiskControlService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 40. `store_staff` (StoreStaff)

- **数据量**：2 条
- **表说明**：门店员工关系表（员工-门店多对多，支持历史记录）
- **服务层使用位置**：
  - `services/ConsumptionService.js`
  - `services/StaffManagementService.js`
  - `services/StoreService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 41. `system_settings` (SystemSettings)

- **数据量**：38 条
- **表说明**：系统设置表：存储系统各模块的配置设置
- **服务层使用位置**：
  - `services/AdminSystemService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 42. `trade_orders` (TradeOrder)

- **数据量**：0 条
- **表说明**：无
- **服务层使用位置**：
  - `services/AssetService.js`
  - `services/FeeCalculator.js`
  - `services/TradeOrderService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 43. `user_hierarchy` (UserHierarchy)

- **数据量**：8 条
- **表说明**：用户层级关系表（简化版：仅保留核心字段和必要索引）
- **服务层使用位置**：
  - `services/HierarchyManagementService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 44. `user_premium_status` (UserPremiumStatus)

- **数据量**：0 条
- **表说明**：用户高级空间状态表（极简版，无自动续费字段，降低维护成本60%，适合数据量<1000的小项目）
- **服务层使用位置**：
  - `services/PremiumService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 45. `user_risk_profiles` (UserRiskProfile)

- **数据量**：2 条
- **表说明**：用户风控配置表：存储用户等级默认配置和个人自定义配置
- **服务层使用位置**：
  - `services/MarketListingService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 46. `user_role_change_records` (UserRoleChangeRecord)

- **数据量**：145 条
- **表说明**：用户角色变更记录表（为审计日志提供业务主键）
- **服务层使用位置**：
  - `services/UserRoleService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 47. `user_roles` (UserRole)

- **数据量**：20 条
- **表说明**：无
- **服务层使用位置**：
  - `services/HierarchyManagementService.js`
  - `services/UserRoleService.js`
  - `services/UserService.js`
  - `services/lottery/LotteryQuotaService.js`
  - `services/lottery/LotteryUserService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 48. `user_status_change_records` (UserStatusChangeRecord)

- **数据量**：144 条
- **表说明**：用户状态变更记录表（为审计日志提供业务主键）
- **服务层使用位置**：
  - `services/UserRoleService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

#### 49. `websocket_startup_logs` (WebSocketStartupLog)

- **数据量**：860 条
- **表说明**：WebSocket服务启动日志表（记录所有启动/停止事件）
- **服务层使用位置**：
  - `services/ChatWebSocketService.js`
- **路由层引用**：无
- **需要补充的API**：CRUD/查询管理接口

---

## ✅ 完整覆盖的表（无需处理）

以下 **15** 张表已有完整的服务层支持和对外API：

| 表名 | 模型名 | 数据量 | 路由文件 |
|------|--------|--------|----------|
| account_asset_balances | AccountAssetBalance | 18 | `orphan-frozen.js` |
| asset_transactions | AssetTransaction | 4363 | `asset-adjustment.js` |
| exchange_items | ExchangeItem | 26 | `exchange.js` |
| feedbacks | Feedback | 25 | `feedbacks.js`, `feedback.js` |
| item_instances | ItemInstance | 1772 | `fulfill.js` |
| lottery_campaign_pricing_config | LotteryCampaignPricingConfig | 4 | `pricing-config.js` |
| lottery_draws | LotteryDraw | 2 | `draw.js` |
| lottery_hourly_metrics | LotteryHourlyMetrics | 0 | `history.js` |
| lottery_prizes | LotteryPrize | 16 | `prize_pool.js` |
| merchant_operation_logs | MerchantOperationLog | 27 | `audit-logs.js` |
| products | Product | 52 | `portfolio.js` |
| roles | Role | 9 | `index.js`, `lottery-quota.js` |
| stores | Store | 4 | `audit-logs.js`, `index.js` |
| system_announcements | SystemAnnouncement | 8 | `notifications.js` |
| users | User | 28 | `activities.js`, `balance.js` |

---

## 🔬 基于业务逻辑的深度分析（用户决策参考）

### ❌ 不需要暴露给Web管理平台的表（5张 - 纯技术表）

以下表是**纯技术实现表**，由系统自动管理，管理员不需要也不应该直接操作：

| 表名 | 数据量 | 不暴露理由 | 说明 |
|------|--------|-----------|------|
| `api_idempotency_requests` | 917 | **纯技术表** | API幂等性实现，防止重复请求。系统自动管理，7天TTL自动清理 |
| `websocket_startup_logs` | 860 | **系统运维表** | WebSocket服务启动/停止日志，仅用于运维监控，无业务意义 |
| `lottery_draw_decisions` | 0 | **审计快照表** | 抽奖决策完整路径快照，仅用于问题追溯，不可修改 |
| `item_instance_events` | 912 | **事件溯源表** | 物品变更事件流水，事件溯源设计，只追加不修改 |
| `authentication_sessions` | 0 | **系统会话表** | 用户登录会话，系统自动管理生命周期 |

**决策建议**：这5张表**不需要补齐API**，从49张减少到44张需要处理。

---

### ✏️ 需要完整CRUD的表（15张 - 配置/字典类）

管理员需要**增删改查**的配置表和字典表（**用户已拍板：字典表需完整CRUD**）：

| 表名 | 数据量 | 业务说明 | 权限 | CRUD 必要性说明 |
|------|--------|----------|------|----------------|
| `lottery_strategy_config` | 17 | 抽奖策略全局配置 | 🔴 仅admin | 管理员需调整 Budget Tier 阈值、Pity 配置、功能开关 |
| `lottery_tier_matrix_config` | 12 | BxPx 矩阵配置 | 🔴 仅admin | 管理员需配置不同预算档×压力档的概率乘数 |
| `lottery_tier_rules` | 9 | 抽奖档位规则 | 🔴 仅admin | 管理员需定义各用户分层的档位概率权重 |
| `system_settings` | 38 | 系统各模块配置 | 🟢 admin/ops | 核心配置入口，管理员需调整各业务模块参数 |
| `category_defs` | 6 | 物品类目字典 | 🟢 admin/ops | **字典表完整CRUD** - 运营需动态维护商品分类体系 |
| `rarity_defs` | 5 | 稀有度字典 | 🟢 admin/ops | **字典表完整CRUD** - 运营需定义物品稀有度等级 |
| `asset_group_defs` | 8 | 资产分组字典 | 🟢 admin/ops | **字典表完整CRUD** - 运营需维护可交易资产的分组定义 |
| `item_templates` | 16 | 物品模板 | 🟢 admin/ops | 管理员需维护不可叠加物品的模板定义 |
| `popup_banners` | 2 | 弹窗广告/公告 | 🟢 admin/ops | 管理员需配置前端弹窗广告和公告 |
| `material_conversion_rules` | 1 | 材料转换规则 | 🟢 admin/ops | 管理员需配置资产间的转换比例 |
| `material_asset_types` | 4 | 材料资产类型 | 🟢 admin/ops | 管理员需维护可叠加资产类型定义 |
| `preset_debt_limits` | 0 | 欠账上限配置 | 🔴 仅admin | 风控敏感配置，管理员需配置各级别的欠账风险上限 |
| `lottery_draw_quota_rules` | 4 | 抽奖配额规则 | 🔴 仅admin | 风控敏感配置，管理员需配置每日抽奖次数限制规则 |
| `user_risk_profiles` | 2 | 用户风控配置 | 🔴 仅admin | 风控敏感配置，管理员需配置用户等级默认风控参数 |
| `lottery_presets` | 2 | 抽奖预设 | 🔴 仅admin | 抽奖敏感配置，管理员需预设特定用户的中奖结果 |

> **权限说明**：🔴 仅admin = 敏感配置，仅管理员可操作；🟢 admin/ops = 普通配置，ops仅只读（CRUD中POST/PUT/DELETE返回403）

---

### 👁️ 只需只读查询的表（24张 - 记录/状态类）

管理员只需要**查看**，不应直接修改（通过专用业务API操作）：

| 表名 | 数据量 | 业务说明 | 只读理由 |
|------|--------|----------|---------|
| `admin_operation_logs` | 3377 | 操作审计日志 | **审计记录只读**，不可篡改，用于安全合规 |
| `user_role_change_records` | 145 | 角色变更记录 | **变更记录只读**，通过 UserRoleService 操作 |
| `user_status_change_records` | 144 | 状态变更记录 | **变更记录只读**，通过 UserRoleService 操作 |
| `lottery_clear_setting_records` | 402 | 抽奖清除记录 | **操作记录只读**，通过 AdminLotteryService 操作 |
| `lottery_management_settings` | 2023 | 抽奖管理设置 | **通过专用API操作**（forceWin/forceLose），不暴露CRUD |
| `lottery_user_experience_state` | 0 | 用户抽奖体验状态 | **引擎内部状态**，管理员只需查看，由引擎自动维护 |
| `lottery_user_global_state` | 0 | 用户全局抽奖统计 | **引擎内部状态**，运气债务(LuckDebt)机制自动计算 |
| `lottery_user_daily_draw_quota` | 7 | 用户每日抽奖配额 | **系统自动管理**，管理员查看用户剩余次数 |
| `lottery_hourly_metrics` | 0 | 抽奖小时统计 | **统计报表只读**，由 SettleStage 自动写入 |
| `lottery_campaign_quota_grants` | 0 | 配额发放记录 | **发放记录只读**，通过配额授予接口操作 |
| `lottery_campaign_user_quota` | 0 | 用户活动配额 | **配额状态只读**，通过配额授予接口操作 |
| `lottery_campaigns` | 1 | 抽奖活动配置 | **通过专用API操作**，不暴露直接CRUD |
| `accounts` | 22 | 账户表 | **余额敏感数据**，通过 AssetService 操作 |
| `consumption_records` | 11 | 消费记录 | **用户消费数据只读**，审核通过专用API |
| `content_review_records` | 208 | 内容审核记录 | **审核记录只读** |
| `exchange_records` | 7 | 兑换记录 | **交易记录只读** |
| `redemption_orders` | 804 | 兑换订单 | **核销订单只读**，状态变更通过专用API |
| `market_listings` | 33 | 市场挂牌 | **通过 MarketListingService 操作** |
| `trade_orders` | 0 | 交易订单 | **交易记录只读** |
| `chat_messages` | 5 | 聊天消息 | **通讯记录只读** |
| `customer_service_sessions` | 1 | 客服会话 | **会话记录只读** |
| `store_staff` | 2 | 门店员工关系 | **通过 StaffManagementService 操作** |
| `user_hierarchy` | 8 | 用户层级关系 | **通过 HierarchyManagementService 操作** |
| `user_roles` | 20 | 用户角色 | **通过 UserRoleService 操作** |

---

### 📊 特殊处理的表（5张 - 大数据/基础字典）

| 表名 | 数据量 | 处理建议 |
|------|--------|---------|
| `administrative_regions` | 44569 | **只读查询 + 级联接口** - 省市区街道数据，只需提供级联查询API |
| `image_resources` | 1 | **只读查询** - 图片资源表，通过 ImageService 管理 |
| `preset_budget_debt` | 0 | **只读查询** - 预算欠账记录，通过欠账管理看板查看 |
| `preset_inventory_debt` | 0 | **只读查询** - 库存欠账记录，通过欠账管理看板查看 |
| `risk_alerts` | 0 | **只读查询** - 风控告警，通过风控服务触发 |
| `user_premium_status` | 0 | **只读查询** - 高级用户状态，通过 PremiumService 管理 |

---

## 🎯 API补齐实施方案（用户选择：方案A 一次性补齐）

### 实施总览

| 分类 | 数量 | API类型 | 说明 |
|------|------|---------|------|
| ❌ 不需要暴露 | 5张 | 无 | 纯技术表，跳过 |
| ✏️ 完整CRUD | 15张 | GET/POST/PUT/DELETE | 配置/字典类 |
| 👁️ 只读查询 | 24张 | GET (list/detail) | 记录/状态类 |
| 📊 特殊处理 | 5张 | GET + 专用接口 | 大数据/基础字典 |
| **总计需处理** | **44张** | - | 排除5张纯技术表 |

### P0 优先级（15张 - 核心配置表，需CRUD）

| 序号 | 表名 | 模型名 | 数据量 | API类型 | 权限 | 优先理由 |
|------|------|--------|--------|---------|------|----------|
| 1 | `lottery_strategy_config` | LotteryStrategyConfig | 17 | **CRUD** | 🔴 仅admin | 抽奖核心配置，直接影响概率计算 |
| 2 | `lottery_tier_matrix_config` | LotteryTierMatrixConfig | 12 | **CRUD** | 🔴 仅admin | BxPx矩阵，核心概率调控 |
| 3 | `lottery_tier_rules` | LotteryTierRule | 9 | **CRUD** | 🔴 仅admin | 档位权重，影响中奖分布 |
| 4 | `system_settings` | SystemSettings | 38 | **CRUD** | 🟢 admin/ops | 系统配置入口 |
| 5 | `category_defs` | CategoryDef | 6 | **CRUD** | 🟢 admin/ops | 商品分类基础字典 |
| 6 | `rarity_defs` | RarityDef | 5 | **CRUD** | 🟢 admin/ops | 稀有度基础字典 |
| 7 | `asset_group_defs` | AssetGroupDef | 8 | **CRUD** | 🟢 admin/ops | 资产分组字典 |
| 8 | `item_templates` | ItemTemplate | 16 | **CRUD** | 🟢 admin/ops | 物品模板管理 |
| 9 | `popup_banners` | PopupBanner | 2 | **CRUD** | 🟢 admin/ops | 弹窗广告配置 |
| 10 | `material_conversion_rules` | MaterialConversionRule | 1 | **CRUD** | 🟢 admin/ops | 资产转换规则 |
| 11 | `material_asset_types` | MaterialAssetType | 4 | **CRUD** | 🟢 admin/ops | 资产类型定义 |
| 12 | `preset_debt_limits` | PresetDebtLimit | 0 | **CRUD** | 🔴 仅admin | 欠账上限配置 |
| 13 | `lottery_draw_quota_rules` | LotteryDrawQuotaRule | 4 | **CRUD** | 🔴 仅admin | 抽奖配额规则 |
| 14 | `user_risk_profiles` | UserRiskProfile | 2 | **CRUD** | 🔴 仅admin | 用户风控配置 |
| 15 | `lottery_presets` | LotteryPreset | 2 | **CRUD** | 🔴 仅admin | 抽奖预设管理 |

> **权限说明**：🔴 仅admin = `requireAdmin`（role_level >= 100）；🟢 admin/ops = `requireRole(['admin', 'ops'])`（ops仅只读）

### P1 优先级（18张 - 业务数据表，只读查询）

| 序号 | 表名 | 模型名 | 数据量 | API类型 | 权限 | 用途说明 |
|------|------|--------|--------|---------|------|----------|
| 1 | `admin_operation_logs` | AdminOperationLog | 3377 | **只读** | 🟢 admin/ops | 审计日志查询 |
| 2 | `lottery_management_settings` | LotteryManagementSetting | 2023 | **只读** | 🟢 admin/ops | 干预设置查看（操作走专用API） |
| 3 | `lottery_clear_setting_records` | LotteryClearSettingRecord | 402 | **只读** | 🟢 admin/ops | 清除记录查看 |
| 4 | `redemption_orders` | RedemptionOrder | 804 | **只读** | 🟢 admin/ops | 核销订单查询 |
| 5 | `content_review_records` | ContentReviewRecord | 208 | **只读** | 🟢 admin/ops | 审核记录查询 |
| 6 | `user_role_change_records` | UserRoleChangeRecord | 145 | **只读** | 🟢 admin/ops | 角色变更历史 |
| 7 | `user_status_change_records` | UserStatusChangeRecord | 144 | **只读** | 🟢 admin/ops | 状态变更历史 |
| 8 | `market_listings` | MarketListing | 33 | **只读** | 🟢 admin/ops | 挂牌列表查询 |
| 9 | `accounts` | Account | 22 | **只读** | 🟢 admin/ops | 账户余额查看 |
| 10 | `user_roles` | UserRole | 20 | **只读** | 🟢 admin/ops | 用户角色查看 |
| 11 | `consumption_records` | ConsumptionRecord | 11 | **只读** | 🟢 admin/ops | 消费记录查询 |
| 12 | `user_hierarchy` | UserHierarchy | 8 | **只读** | 🟢 admin/ops | 用户层级查看 |
| 13 | `lottery_user_daily_draw_quota` | LotteryUserDailyDrawQuota | 7 | **只读** | 🟢 admin/ops | 每日配额查看 |
| 14 | `exchange_records` | ExchangeRecord | 7 | **只读** | 🟢 admin/ops | 兑换记录查询 |
| 15 | `chat_messages` | ChatMessage | 5 | **只读** | 🟢 admin/ops | 聊天记录查看 |
| 16 | `store_staff` | StoreStaff | 2 | **只读** | 🟢 admin/ops | 员工关系查看 |
| 17 | `lottery_campaigns` | LotteryCampaign | 1 | **只读** | 🟢 admin/ops | 活动配置查看（操作走专用API） |
| 18 | `customer_service_sessions` | CustomerServiceSession | 1 | **只读** | 🟢 admin/ops | 客服会话查看 |

> **权限说明**：所有只读查询接口均使用 `requireRole(['admin', 'ops'])`，ops角色可查看但不可修改

### P2 优先级（12张 - 监控/统计表，只读查询）

| 序号 | 表名 | 模型名 | 数据量 | API类型 | 权限 | 用途说明 |
|------|------|--------|--------|---------|------|----------|
| 1 | `administrative_regions` | AdministrativeRegion | 44569 | **只读+级联** | 🟢 admin/ops | 行政区划级联选择（已有） |
| 2 | `image_resources` | ImageResources | 1 | **只读** | 🟢 admin/ops | 图片资源查看 |
| 3 | `lottery_hourly_metrics` | LotteryHourlyMetrics | 0 | **只读** | 🟢 admin/ops | 抽奖统计报表 |
| 4 | `lottery_user_experience_state` | LotteryUserExperienceState | 0 | **只读** | 🟢 admin/ops | 用户体验状态查看 |
| 5 | `lottery_user_global_state` | LotteryUserGlobalState | 0 | **只读** | 🟢 admin/ops | 用户全局状态查看 |
| 6 | `lottery_campaign_quota_grants` | LotteryCampaignQuotaGrant | 0 | **只读** | 🟢 admin/ops | 配额发放记录 |
| 7 | `lottery_campaign_user_quota` | LotteryCampaignUserQuota | 0 | **只读** | 🟢 admin/ops | 用户配额查看 |
| 8 | `preset_budget_debt` | PresetBudgetDebt | 0 | **只读** | 🟢 admin/ops | 预算欠账查看 |
| 9 | `preset_inventory_debt` | PresetInventoryDebt | 0 | **只读** | 🟢 admin/ops | 库存欠账查看 |
| 10 | `trade_orders` | TradeOrder | 0 | **只读** | 🟢 admin/ops | 交易订单查看 |
| 11 | `risk_alerts` | RiskAlert | 0 | **只读** | 🟢 admin/ops | 风控告警查看 |
| 12 | `user_premium_status` | UserPremiumStatus | 0 | **只读** | 🟢 admin/ops | 高级状态查看 |

> **权限说明**：所有监控/统计类接口均使用 `requireRole(['admin', 'ops'])`，便于运营人员查看数据

---

## 📋 完整表清单（按业务分类排序）

### ❌ 不需要暴露的表（5张 - 纯技术表）

| 序号 | 表名 | 模型名 | 数据量 | 分类 |
|------|------|--------|--------|------|
| 1 | api_idempotency_requests | ApiIdempotencyRequest | 917 | 纯技术表 |
| 2 | websocket_startup_logs | WebSocketStartupLog | 860 | 系统运维表 |
| 3 | item_instance_events | ItemInstanceEvent | 912 | 事件溯源表 |
| 4 | lottery_draw_decisions | LotteryDrawDecision | 0 | 审计快照表 |
| 5 | authentication_sessions | AuthenticationSession | 0 | 系统会话表 |

### ✏️ 需要CRUD的表（15张 - 配置/字典类）

| 序号 | 表名 | 模型名 | 数据量 | 分类 |
|------|------|--------|--------|------|
| 1 | lottery_strategy_config | LotteryStrategyConfig | 17 | 抽奖核心配置 |
| 2 | lottery_tier_matrix_config | LotteryTierMatrixConfig | 12 | 概率矩阵配置 |
| 3 | lottery_tier_rules | LotteryTierRule | 9 | 档位规则配置 |
| 4 | system_settings | SystemSettings | 38 | 系统配置 |
| 5 | category_defs | CategoryDef | 6 | 基础字典 |
| 6 | rarity_defs | RarityDef | 5 | 基础字典 |
| 7 | asset_group_defs | AssetGroupDef | 8 | 基础字典 |
| 8 | item_templates | ItemTemplate | 16 | 物品模板 |
| 9 | popup_banners | PopupBanner | 2 | 营销配置 |
| 10 | material_conversion_rules | MaterialConversionRule | 1 | 资产配置 |
| 11 | material_asset_types | MaterialAssetType | 4 | 资产配置 |
| 12 | preset_debt_limits | PresetDebtLimit | 0 | 风控配置 |
| 13 | lottery_draw_quota_rules | LotteryDrawQuotaRule | 4 | 配额规则 |
| 14 | user_risk_profiles | UserRiskProfile | 2 | 风控配置 |
| 15 | lottery_presets | LotteryPreset | 2 | 抽奖预设 |

### 👁️ 只读查询的表（29张 - 记录/状态类）

| 序号 | 表名 | 模型名 | 数据量 | 分类 |
|------|------|--------|--------|------|
| 1 | admin_operation_logs | AdminOperationLog | 3377 | 审计日志 |
| 2 | lottery_management_settings | LotteryManagementSetting | 2023 | 干预设置 |
| 3 | lottery_clear_setting_records | LotteryClearSettingRecord | 402 | 操作记录 |
| 4 | redemption_orders | RedemptionOrder | 804 | 订单记录 |
| 5 | content_review_records | ContentReviewRecord | 208 | 审核记录 |
| 6 | user_role_change_records | UserRoleChangeRecord | 145 | 变更记录 |
| 7 | user_status_change_records | UserStatusChangeRecord | 144 | 变更记录 |
| 8 | market_listings | MarketListing | 33 | 交易数据 |
| 9 | accounts | Account | 22 | 账户数据 |
| 10 | user_roles | UserRole | 20 | 用户角色 |
| 11 | consumption_records | ConsumptionRecord | 11 | 消费记录 |
| 12 | user_hierarchy | UserHierarchy | 8 | 用户层级 |
| 13 | lottery_user_daily_draw_quota | LotteryUserDailyDrawQuota | 7 | 配额状态 |
| 14 | exchange_records | ExchangeRecord | 7 | 兑换记录 |
| 15 | chat_messages | ChatMessage | 5 | 通讯记录 |
| 16 | store_staff | StoreStaff | 2 | 员工关系 |
| 17 | lottery_campaigns | LotteryCampaign | 1 | 活动配置 |
| 18 | customer_service_sessions | CustomerServiceSession | 1 | 客服会话 |
| 19 | administrative_regions | AdministrativeRegion | 44569 | 基础数据 |
| 20 | image_resources | ImageResources | 1 | 资源数据 |
| 21 | lottery_hourly_metrics | LotteryHourlyMetrics | 0 | 统计报表 |
| 22 | lottery_user_experience_state | LotteryUserExperienceState | 0 | 引擎状态 |
| 23 | lottery_user_global_state | LotteryUserGlobalState | 0 | 引擎状态 |
| 24 | lottery_campaign_quota_grants | LotteryCampaignQuotaGrant | 0 | 配额记录 |
| 25 | lottery_campaign_user_quota | LotteryCampaignUserQuota | 0 | 配额状态 |
| 26 | preset_budget_debt | PresetBudgetDebt | 0 | 欠账数据 |
| 27 | preset_inventory_debt | PresetInventoryDebt | 0 | 欠账数据 |
| 28 | trade_orders | TradeOrder | 0 | 交易订单 |
| 29 | risk_alerts | RiskAlert | 0 | 风控告警 |
| 30 | user_premium_status | UserPremiumStatus | 0 | 用户状态 |

### ✅ 已完整覆盖的表（15张 - 无需处理）

| 序号 | 表名 | 模型名 | 数据量 | 状态 |
|------|------|--------|--------|------|
| 1 | account_asset_balances | AccountAssetBalance | 18 | ✅ 完整覆盖 |
| 2 | asset_transactions | AssetTransaction | 4363 | ✅ 完整覆盖 |
| 3 | exchange_items | ExchangeItem | 26 | ✅ 完整覆盖 |
| 4 | feedbacks | Feedback | 25 | ✅ 完整覆盖 |
| 5 | item_instances | ItemInstance | 1772 | ✅ 完整覆盖 |
| 6 | lottery_campaign_pricing_config | LotteryCampaignPricingConfig | 4 | ✅ 完整覆盖 |
| 7 | lottery_draws | LotteryDraw | 2 | ✅ 完整覆盖 |
| 8 | lottery_prizes | LotteryPrize | 16 | ✅ 完整覆盖 |
| 9 | merchant_operation_logs | MerchantOperationLog | 27 | ✅ 完整覆盖 |
| 10 | products | Product | 52 | ✅ 完整覆盖 |
| 11 | roles | Role | 9 | ✅ 完整覆盖 |
| 12 | stores | Store | 4 | ✅ 完整覆盖 |
| 13 | system_announcements | SystemAnnouncement | 8 | ✅ 完整覆盖 |
| 14 | users | User | 28 | ✅ 完整覆盖 |

---

## 📊 技术说明

### 分析方法
1. **数据库连接**：通过 .env 配置连接真实MySQL数据库
2. **模型检测**：扫描 /models 目录中的 Sequelize 模型定义
3. **服务层扫描**：检测 /services 目录中对表名/模型名的引用
4. **路由层扫描**：检测 /routes/v4/console 目录中对表名/模型名的引用
5. **业务逻辑分析**：深入阅读服务层代码，理解表的业务用途和操作方式

### 判定标准
- **完整覆盖**：模型存在 + 服务层有引用 + 有对外管理API路由
- **需要CRUD**：配置表/字典表，管理员需要增删改查
- **只读查询**：记录表/状态表，管理员只需查看，操作通过专用Service API
- **不需要暴露**：纯技术表/事件溯源表，系统自动管理

### API实施技术指导（符合项目现有技术标准）

> ⚠️ **技术合规性说明**：以下代码模板严格遵循项目现有技术架构，避免引入技术债务。

#### 项目技术约束（必须遵守）

1. **路由层禁止直接访问 Model** → 必须通过 Service 层封装
2. **写操作必须使用 TransactionManager** → 统一事务管理
3. **必须使用认证中间件** → 根据敏感程度选择（见下方权限模式）
4. **使用统一响应格式** → `res.apiSuccess()` / `res.apiError()`
5. **使用统一错误处理函数** → `handleServiceError()`
6. **使用结构化日志** → `logger` 而非 `console.log`

#### 权限模式选择（已拍板决策）

```javascript
// 🔴 敏感配置接口（仅admin）- 抽奖策略、风控配置等
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
router.get('/', authenticateToken, requireAdmin, async (req, res) => { /* ... */ })

// 🟢 普通接口（admin/ops双角色）- 字典表、模板、只读查询等
const { authenticateToken, requireRole } = require('../../../middleware/auth')
router.get('/', authenticateToken, requireRole(['admin', 'ops']), async (req, res) => { /* ... */ })
// 注意：ops角色(role_level=30)对POST/PUT/DELETE自动返回403，仅允许GET
```

#### CRUD接口标准模式（完整示例）

```javascript
/**
 * {表名}管理路由 - Console 平台管理域
 *
 * @description 提供平台管理员{表描述}的 CRUD 操作 API
 * @path /api/v4/console/{module-name}
 * @access Admin only (role_level >= 100)
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const XxxService = require('../../../services/XxxService') // ⚠️ 通过Service层访问数据
const logger = require('../../../utils/logger').logger
const TransactionManager = require('../../../utils/TransactionManager')

/**
 * 统一错误处理函数（必须在每个路由文件中定义）
 */
function handleServiceError(error, res, operation) {
  logger.error(`❌ ${operation}失败`, { error: error.message, stack: error.stack })

  if (error.message.includes('不存在') || error.message.includes('not found')) {
    return res.apiError(error.message, 'NOT_FOUND', null, 404)
  }

  if (error.message.includes('已存在') || error.message.includes('重复')) {
    return res.apiError(error.message, 'CONFLICT', null, 409)
  }

  if (error.message.includes('不能为空') || error.message.includes('无效') || error.message.includes('必填')) {
    return res.apiError(error.message, 'VALIDATION_ERROR', null, 400)
  }

  return res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
}

/*
 * =================================================================
 * 查询接口（只读操作，无需事务）
 * =================================================================
 */

/**
 * GET / - 获取列表
 * @access Admin only (role_level >= 100)
 */
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, page_size = 20, ...filters } = req.query
    const validatedPageSize = Math.min(parseInt(page_size, 10) || 20, 100)

    // ⚠️ 通过 Service 层获取数据
    const result = await XxxService.getList({
      page: parseInt(page, 10),
      page_size: validatedPageSize,
      ...filters
    })

    return res.apiSuccess(result, '获取列表成功')
  } catch (error) {
    return handleServiceError(error, res, '获取列表')
  }
})

/**
 * GET /:id - 获取详情
 * @access Admin only (role_level >= 100)
 */
router.get('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params

    if (!id || isNaN(parseInt(id, 10))) {
      return res.apiError('无效的ID', 'INVALID_ID', null, 400)
    }

    const record = await XxxService.getById(parseInt(id, 10))

    if (!record) {
      return res.apiError(`记录 ID ${id} 不存在`, 'NOT_FOUND', null, 404)
    }

    return res.apiSuccess(record, '获取详情成功')
  } catch (error) {
    return handleServiceError(error, res, '获取详情')
  }
})

/*
 * =================================================================
 * 写入接口（必须使用 TransactionManager）
 * =================================================================
 */

/**
 * POST / - 创建记录
 * @access Admin only (role_level >= 100)
 */
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const data = req.body
    const operator_id = req.user.user_id

    // 参数校验（路由层负责）
    if (!data.xxx_field || data.xxx_field.trim() === '') {
      return res.apiError('xxx_field 不能为空', 'FIELD_REQUIRED', null, 400)
    }

    // ⚠️ 写操作必须使用 TransactionManager
    const result = await TransactionManager.execute(async transaction => {
      return await XxxService.create(data, {
        operator_id,
        transaction // ⚠️ 必须传入 transaction
      })
    })

    return res.apiSuccess(result, '创建成功')
  } catch (error) {
    return handleServiceError(error, res, '创建记录')
  }
})

/**
 * PUT /:id - 更新记录
 * @access Admin only (role_level >= 100)
 */
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const data = req.body
    const operator_id = req.user.user_id

    if (!id || isNaN(parseInt(id, 10))) {
      return res.apiError('无效的ID', 'INVALID_ID', null, 400)
    }

    // ⚠️ 写操作必须使用 TransactionManager
    const result = await TransactionManager.execute(async transaction => {
      return await XxxService.update(parseInt(id, 10), data, {
        operator_id,
        transaction
      })
    })

    return res.apiSuccess(result, '更新成功')
  } catch (error) {
    return handleServiceError(error, res, '更新记录')
  }
})

/**
 * DELETE /:id - 删除记录
 * @access Admin only (role_level >= 100)
 */
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const operator_id = req.user.user_id

    if (!id || isNaN(parseInt(id, 10))) {
      return res.apiError('无效的ID', 'INVALID_ID', null, 400)
    }

    // ⚠️ 写操作必须使用 TransactionManager
    await TransactionManager.execute(async transaction => {
      return await XxxService.delete(parseInt(id, 10), {
        operator_id,
        transaction
      })
    })

    return res.apiSuccess(null, '删除成功')
  } catch (error) {
    return handleServiceError(error, res, '删除记录')
  }
})

module.exports = router
```

#### 只读查询接口模式

```javascript
/**
 * {表名}查询路由 - Console 平台管理域（只读）
 *
 * @description 仅提供 GET 接口，不提供 POST/PUT/DELETE
 * @path /api/v4/console/{module-name}
 * @access Admin only (role_level >= 100)
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const XxxService = require('../../../services/XxxService')
const logger = require('../../../utils/logger').logger

function handleServiceError(error, res, operation) {
  logger.error(`❌ ${operation}失败`, { error: error.message })
  // ... 同上
}

// 只提供 GET / 和 GET /:id，不提供写入接口
router.get('/', authenticateToken, requireAdmin, async (req, res) => { /* ... */ })
router.get('/:id', authenticateToken, requireAdmin, async (req, res) => { /* ... */ })

module.exports = router
```

#### Service 层标准模式（配套）

```javascript
/**
 * {表名}服务层 - XxxService
 *
 * @description 封装 Model 访问，提供业务逻辑
 * @design 服务层方法必须接受 { transaction } 参数
 */

'use strict'

const { XxxModel } = require('../models')
const logger = require('../utils/logger').logger

class XxxService {
  /**
   * 获取列表（分页）
   * @param {Object} params - 查询参数
   * @returns {Promise<Object>} { list, total, page, page_size }
   */
  static async getList(params) {
    const { page = 1, page_size = 20, ...filters } = params
    const offset = (page - 1) * page_size

    const { count, rows } = await XxxModel.findAndCountAll({
      where: this._buildWhereClause(filters),
      limit: page_size,
      offset,
      order: [['created_at', 'DESC']]
    })

    return {
      list: rows,
      total: count,
      page: parseInt(page, 10),
      page_size: parseInt(page_size, 10)
    }
  }

  /**
   * 创建记录
   * @param {Object} data - 数据
   * @param {Object} options - { operator_id, transaction }
   * @returns {Promise<Object>} 创建的记录
   */
  static async create(data, options = {}) {
    const { operator_id, transaction } = options

    // ⚠️ 必须接受 transaction 参数
    const record = await XxxModel.create(data, { transaction })

    logger.info(`✅ 记录创建成功`, { id: record.id, operator_id })
    return record
  }

  // ... 其他方法类似
}

module.exports = XxxService
```

### 路由注册示例（符合项目架构）

新增路由需要在 `/routes/v4/console/index.js` 中注册：

```javascript
// routes/v4/console/index.js

// 导入新路由
const lotteryConfigRoutes = require('./lottery-config')     // 抽奖配置
const dictionaryRoutes = require('./dictionary')           // 字典管理
const auditRoutes = require('./audit')                     // 审计查询

// 挂载路由
router.use('/lottery-config', lotteryConfigRoutes)
router.use('/dictionary', dictionaryRoutes)
router.use('/audit', auditRoutes)
```

---

## ✅ 用户决策汇总（已拍板 2026-01-21）

基于业务逻辑深度分析，**用户已拍板确认**最终决策如下：

| 决策项 | 决策结果 | 备注 |
|--------|---------|------|
| 实施策略 | ✅ **方案A：一次性补齐44张表** | 一劳永逸，技术债务清零 |
| 字典表处理 | ✅ **完整CRUD** | category_defs、rarity_defs、asset_group_defs 等字典表支持运营动态增删改 |
| 行政区划数据 | ✅ **已有** | 项目中已有导入脚本，无需额外处理 |
| 权限模式 | ✅ **部分敏感接口仅限admin** | 见下方详细说明 |

### 权限设计决策（已拍板）

| 接口类型 | 权限要求 | 说明 |
|---------|---------|------|
| **普通查询接口** | `requireRole(['admin', 'ops'])` | admin可读写，ops仅只读（POST/PUT/DELETE返回403） |
| **敏感配置接口** | `requireAdmin` (role_level >= 100) | 仅admin可访问，ops无权限 |

**敏感接口清单**（仅限admin）：
- `lottery_strategy_config` - 抽奖策略核心配置
- `lottery_tier_matrix_config` - BxPx矩阵配置
- `lottery_tier_rules` - 档位规则配置
- `lottery_presets` - 抽奖预设管理
- `preset_debt_limits` - 欠账上限配置
- `user_risk_profiles` - 用户风控配置
- `lottery_draw_quota_rules` - 抽奖配额规则

**普通接口清单**（admin/ops双角色）：
- 字典表（category_defs、rarity_defs、asset_group_defs）
- 模板表（item_templates、popup_banners）
- 资产配置（material_asset_types、material_conversion_rules）
- 系统设置（system_settings）
- 所有只读查询接口

### 最终工作量

| 分类 | 数量 | API类型 |
|------|------|---------|
| 不需要暴露 | 5张 | 无 |
| 完整CRUD | 15张 | GET/POST/PUT/DELETE |
| 只读查询 | 29张 | GET (list/detail) |
| **总计需处理** | **44张** | - |

---

## ⚠️ 技术债务防范清单

实施 API 补齐时，必须检查以下项目以避免引入技术债务：

### 路由层检查项

- [ ] **使用认证中间件**：`authenticateToken, requireAdmin` 或 `adminAuthMiddleware`
- [ ] **使用统一响应格式**：`res.apiSuccess()` / `res.apiError()`
- [ ] **通过 ServiceManager 获取服务**：`req.app.locals.services.getService('xxx')`，禁止直接 require Service
- [ ] **禁止直接访问 Model**：必须通过 Service 层
- [ ] **写操作使用 TransactionManager**：统一事务管理（单表简单CRUD可豁免）
- [ ] **使用 asyncHandler 包装异步处理器**：统一错误捕获
- [ ] **使用 sharedComponents.logger 而非 console.log**：结构化日志
- [ ] **在 index.js 中注册路由**：正确挂载到 `/api/v4/console/`

### Service 层检查项

- [ ] **方法接受 { transaction } 参数**：支持外部事务传入
- [ ] **禁止自建事务**：事务边界由路由层/编排层控制
- [ ] **返回标准化数据结构**：分页接口返回 `{ list, total, page, page_size }`
- [ ] **使用 logger 记录关键操作**：便于问题追踪
- [ ] **在 ServiceManager 中注册服务**：确保路由层可通过 `getService()` 获取

### 代码质量检查项

- [ ] **通过 ESLint 检查**：无语法错误
- [ ] **通过 Prettier 格式化**：代码风格统一
- [ ] **添加 JSDoc 注释**：接口文档完整
- [ ] **单元测试（可选）**：核心逻辑测试覆盖

---

**文档生成器**：api-coverage-analysis.js v2 + 人工业务分析  
**技术合规性审查**：2026/1/21 03:15:00  
**用户决策拍板**：2026/1/21（方案A + 字典表CRUD + 敏感接口仅admin）  
**技术规范对齐**：2026/1/21（ServiceManager 模式 + asyncHandler + sharedComponents.logger）  
**最后更新**：2026/1/21（技术规范对齐版）
