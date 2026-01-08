# P1-9 服务获取方式统一（ServiceManager）- 独立迭代计划

> **创建日期**：2026年01月09日  
> **最后更新**：2026年01月09日（最终版 v3.1 - 新增决策点 G/H/I/J 已拍板）  
> **状态**：✅ **全部决策已拍板**，待排期实施  
> **优先级**：P1（重要但非紧急）  
> **预估工期**：5-6天（含停更窗口 + 全量回归 + D2-Max 路由层读操作收口 + **全仓统一**）  
> **影响范围**：**全仓**（routes/ + scripts/ + tests/）+ **局部**服务实例化改造 + **service key 全量强制替换** + **路由层读写全部走 Service**  
> **实施模式**：🚨 **专项重构迭代（停更窗口模式）**

---

## 0. 已拍板决策摘要（最终版 v3.1）

| 决策点 | 选择                  | 说明                                                                           |
| ------ | --------------------- | ------------------------------------------------------------------------------ |
| **A**  | A1                    | `DataSanitizer`、`LotteryQuotaService` 都注册进 ServiceManager                 |
| **B**  | **B1-Injected**       | 通过 `req.app.locals.services.getService(...)` 获取（对齐当前注入方式）        |
| **C**  | **C2-Lite**           | 局部实例化（5 类有状态服务 ± 2 个微调），静态服务保持原样                      |
| **D**  | **D2-Max**            | 路由层完全不碰 Model/Sequelize（读写都不碰），全部走 Service                   |
| **E**  | **E2-Strict**         | 新 key (snake_case)，不兼容旧 key，**全仓强制替换**                            |
| **F**  | F1                    | 先不做测试替换能力（后续迭代）                                                 |
| **G**  | **G1-Unified**        | 只要放在 `services/`，就统一从 `req.app.locals.services` 拿（含工具类/静态类） |
| **H**  | **H1-InitFirst**      | ServiceManager 初始化完成才启动 HTTP 监听（确定性更强）                        |
| **I**  | **I1-ImmediateBlock** | 迁移完 16+1 个路由后**立刻阻断**，防止回退                                     |
| **J**  | **J2-RepoWide**       | **全仓统一**（routes/ + scripts/ + tests/），更彻底                            |

### ✅ 最终拍板说明（v3.1）

| 决策点                | 拍板结果                                  | 核心理由                                                                                                       |
| --------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **B1-Injected**       | `req.app.locals.services.getService(...)` | 对齐现有注入方式、避免初始化时序问题、便于测试和 request 上下文传递                                            |
| **D2-Max**            | 路由层读写都不碰 Model                    | 边界最清晰、长期维护最省；短期需要给"只读接口"补 Service 方法                                                  |
| **C2-Lite ±2**        | 5 类为主 + 允许微调                       | 按"是否持有进程生命周期资源"判定，实施时可小范围增删                                                           |
| **G1-Unified**        | 工具类/静态类也走 ServiceManager          | 只要文件在 `services/` 目录下，不管是静态类还是实例，一律从 `req.app.locals.services` 获取（规则简单、可门禁） |
| **H1-InitFirst**      | 初始化完成才启动监听                      | 未来 ServiceManager 可能接入 Redis/WS/定时器等资源，先初始化再监听确保确定性                                   |
| **I1-ImmediateBlock** | 迁移完立刻阻断                            | 16+1 个路由迁移完成后，门禁立即切到 blocking 模式，防止回退                                                    |
| **J2-RepoWide**       | 全仓统一                                  | 不仅 `routes/v4`，还包括 `scripts/`、`tests/` 等目录，一次性彻底统一                                           |

### 🔴 D2-Max + J2-RepoWide 工期影响

由于选择了 D2-Max（路由层读也不碰 Model）+ J2-RepoWide（全仓统一），相比 D2-Standard 需要额外：

- 给现有"只读接口"补充 Service 层方法（预估 10-15 个 Service 方法）
- **全仓替换**：不仅 `routes/v4`，还需处理 `scripts/`、`tests/` 等目录
- 工期增加约 1-2 天
- 总工期调整为 **5-6 天**

### 🟢 H1-InitFirst 启动时序调整

当前 `app.js` 启动流程将调整为：

```javascript
// 调整前（当前状态）
app.listen(PORT) // 先监听
initializeServices() // 后初始化

// 调整后（H1-InitFirst）
async function bootstrap() {
  await initializeServices() // 先初始化
  app.listen(PORT) // 后监听
}
bootstrap()
```

**核心理由**：未来 ServiceManager 可能接入 Redis 连接池、WebSocket 服务、定时任务等资源，确保"初始化完成才对外服务"可避免请求打到未就绪的服务上。

### ✅ 风险优化说明

相比原版 C2+D2+E2 全量高风险方案，本版本做了以下**风险调整**：

| 原方案             | 优化后              | 风险变化    | 理由                                                              |
| ------------------ | ------------------- | ----------- | ----------------------------------------------------------------- |
| C2 全实例化        | C2-Lite 局部实例化  | 🟢 大幅降低 | 你当前 80%+ 服务是静态类（纯函数），强行实例化 ROI 低、回归风险高 |
| E2 全改 snake_case | E2-Strict 强制迁移  | 🟡 中等     | 不兼容旧 key，必须全量替换，扫描脚本强制校验兜底                  |
| D2 标准写禁止      | **D2-Max 读写全禁** | 🟡 工期增加 | 边界最清晰、长期维护最省，但短期需要补 Service 方法               |

### 🟢 G1-Unified 工具类/静态类统一规则

**拍板决策**：只要文件在 `services/` 目录下，不管是静态类（如 `DataSanitizer`）还是实例类，都统一从 `req.app.locals.services.getService()` 获取。

**规则简化**：

- ✅ 判断标准简单：文件路径在 `services/` → 走 ServiceManager
- ✅ 可门禁：扫描脚本只需检测 `require('...services/...')` 即可阻断
- ❌ 禁止：`const DataSanitizer = require('../../../services/DataSanitizer')`
- ✅ 允许：`const DataSanitizer = req.app.locals.services.getService('data_sanitizer')`

### 🟡 I1-ImmediateBlock 门禁阻断时机

**拍板决策**：16+1 个路由迁移完成后，门禁**立即切到 blocking 模式**。

**执行策略**：

1. Phase 3 完成（25 个路由文件全部迁移）
2. 验证脚本 100% 通过
3. **立即**在 `.husky/pre-commit` 中启用 `--strict` 模式
4. 任何新提交违反规则将被阻断，防止回退

### 🔴 J2-RepoWide 全仓统一范围

**拍板决策**：不仅 `routes/v4`，还包括以下目录的全量替换：

| 目录                | 预估文件数 | 说明                         |
| ------------------- | ---------- | ---------------------------- |
| `routes/v4/**/*.js` | 25+        | 主要迁移目标                 |
| `scripts/**/*.js`   | 10+        | 脚本中的 service 调用        |
| `tests/**/*.js`     | 20+        | 测试中的 service 调用        |
| `services/**/*.js`  | 5+         | service 内部互相调用（如有） |

**工期影响**：相比仅 `routes/v4`，全仓统一增加约 1 天工期，总工期 **5-6 天**。

### ⚠️ 风险确认

用户已确认接受：

- **停更窗口**：实施期间暂停其他功能开发，专注重构
- **全量回归验证**：必须通过全量测试（479+ tests）才能合并
- **失败可回滚预案**：准备 Git 分支策略 + 数据库无破坏性变更
- **全仓统一**：一次性彻底，工期增加 1 天

---

## 1. 问题背景

### 1.1 当前状态分析

#### ServiceManager 已完善（`services/index.js`）

项目已具备完整的 ServiceManager 实现：

- ✅ 单例模式，全局唯一入口
- ✅ 注册了全量 30+ 个 Service
- ✅ 支持 `getService(name)` 统一获取
- ✅ 支持服务健康检查 `getHealthStatus()`
- ✅ 支持优雅关闭 `shutdown()`

#### 路由层直接 require Service 的现状

通过代码扫描发现：

| 指标                        | 数量  | 说明                             |
| --------------------------- | ----- | -------------------------------- |
| 直接 require Service 的文件 | 25 个 | 位于 `routes/v4/**/*.js`         |
| 直接 require 的语句总数     | 33 处 | 包括顶层和函数内 require         |
| 使用 ServiceManager 的文件  | 1 个  | 仅 `routes/v4/console/images.js` |

### 1.2 问题影响

| 风险等级 | 问题描述             | 影响                                                |
| -------- | -------------------- | --------------------------------------------------- |
| **中**   | 依赖关系不透明       | 难以追踪路由对服务的依赖，增加维护成本              |
| **中**   | 服务实例化时机不一致 | 部分 Service 是静态类，部分需要实例化，调用方式混乱 |
| **低**   | 测试 Mock 困难       | 直接 require 导致难以在测试中替换服务               |
| **低**   | 服务替换困难         | 未来需要替换某个 Service 实现时，需要修改多处代码   |

---

### 1.3 推荐落地方案（适配本项目现状）

结合当前项目“**静态服务为主 + ServiceManager 统一入口**”的既有架构，建议采用：

- **方案**：保持 `ServiceManager（services/index.js）` 作为“服务定位器（service locator）”，逐步把 `routes/v4/**` 的服务获取改为 `serviceManager.getService('xxx')`。
- **核心原因**：
  - 现有 `ServiceManager` 已可用且已注册大部分服务，**增量改造成本最低**。
  - 不引入新依赖（避免 Awilix/typedi 等 IoC 框架带来的维护成本）。
  - 更容易与已存在的“路由层治理（D4）”形成闭环：路由只负责参数校验与编排，写操作全部收口到 Service。

> 注意：本计划已选择 **E2-Strict**，服务名 key 将**全量改为 snake_case 且不兼容旧 key**；必须在停更窗口内完成全量替换与验证（见 1.4）。

### 1.4 决策点（已拍板）

#### 决策点 A：是否把 `DataSanitizer`、`LotteryQuotaService` 注册进 ServiceManager？

✅ **已选择：A1（都注册）**

#### 决策点 B：服务获取方式——通过哪种方式拿 Service？

✅ **已选择：B1-Injected（通过 req.app.locals.services 注入获取）**

> 🟢 风险最低决策：对齐你当前已有的注入方式，避免初始化时序问题。

**落地口径**：

```javascript
// ✅ 标准获取方式（所有路由统一使用）
router.post('/create', authenticateToken, async (req, res) => {
  const services = req.app.locals.services
  const MarketListingService = services.getService('market_listing')
  const IdempotencyService = services.getService('idempotency')

  // 业务逻辑...
})

// ✅ 可选：通过中间件简化（在 app.js 中配置）
app.use((req, res, next) => {
  req.services = req.app.locals.services
  next()
})

// 然后路由里可以更简洁
router.post('/create', authenticateToken, async (req, res) => {
  const MarketListingService = req.services.getService('market_listing')
  // ...
})
```

**为什么选 B1-Injected 而不是顶层 require**：

| 对比项         | B1-Injected (req.app.locals)    | 顶层 require        |
| -------------- | ------------------------------- | ------------------- |
| 初始化时序     | ✅ 无风险（请求时已初始化完成） | ⚠️ 可能踩坑         |
| 测试替换       | ✅ 容易（替换 app.locals）      | ❌ 困难（全局单例） |
| request 上下文 | ✅ 天然可传递                   | ❌ 需要额外传参     |
| 多 app 实例    | ✅ 支持                         | ❌ 全局耦合         |
| 代码量         | 🟡 略多（可用中间件简化）       | ✅ 略少             |

#### 决策点 C：服务形态统一到"实例"还是允许"静态类/单例混用"？

✅ **已选择：C2-Lite（局部实例化，5 类为主 ± 2 个微调）**

> 🟢 风险可控决策：仅对**有状态/有生命周期**的服务做实例化改造，静态服务保持原样。

**判定标准**：是否持有"进程生命周期资源"（连接池/长连接、定时器、内存缓存、后台循环、事件订阅）

**基准实例化名单（5 类）**：

| 服务类型  | 服务名                          | 实例化原因                   | 状态    |
| --------- | ------------------------------- | ---------------------------- | ------- |
| WebSocket | `ChatWebSocketService`          | 持有连接状态、需要优雅关闭   | ✅ 确定 |
| 定时任务  | `OrphanFrozenCleanupService`    | 持有定时器句柄、需要优雅停止 | ✅ 确定 |
| 外部连接  | `UnifiedRedisClient`            | 持有 Redis 连接池            | ✅ 确定 |
| 缓存管理  | `ChatRateLimitService`          | 持有内存缓存状态             | ✅ 确定 |
| 会话管理  | `CustomerServiceSessionService` | 持有会话状态                 | ✅ 确定 |

**微调规则（±2 个）**：

| 规则         | 说明                                                                   |
| ------------ | ---------------------------------------------------------------------- |
| **允许增加** | 实施时发现其他服务内部有 Map 缓存/定时器/连接等资源，可增加（最多 +2） |
| **允许删除** | 实施时发现某服务实际无状态（代码审查后确认），可删除（最多 -2）        |
| **必须满足** | 增删必须满足"持有进程生命周期资源"标准，否则保持静态                   |
| **记录变更** | 任何增删必须在实施文档中记录原因                                       |

**保持静态类的服务（其余 25+ 个）**：

- `IdempotencyService`（纯事务协调，无状态）
- `MarketListingService`（纯业务逻辑，无状态）
- `AssetService`（纯业务逻辑，无状态）
- `DataSanitizer`（纯函数工具，无状态）
- `LotteryQuotaService`（纯业务逻辑，无状态）
- `AdminLotteryService`（纯业务逻辑，无状态）
- `TradeOrderService`（纯业务逻辑，无状态）
- ... 等

#### 决策点 D：门禁策略——路由层对 Model/Sequelize 的访问边界？

✅ **已选择：D2-Max（路由层完全不碰 Model/Sequelize，读写都走 Service）**

> 🔴 最强边界决策：路由层不直接操作任何 Model，所有数据访问（包括只读查询）都必须通过 Service。

**D2-Max 的边界定义**：

| 操作类型                                      | 路由层是否允许 | 说明                          |
| --------------------------------------------- | -------------- | ----------------------------- |
| `Model.create/update/destroy/bulkCreate`      | ❌ **禁止**    | 写操作必须走 Service          |
| `Model.findOne/findAll/findByPk`              | ❌ **禁止**    | 读操作也必须走 Service        |
| `sequelize.query()`                           | ❌ **禁止**    | 原生 SQL 也禁止               |
| `Model.count/sum/max/min`                     | ❌ **禁止**    | 聚合查询也禁止                |
| `require('...models/XXX')`                    | ❌ **禁止**    | 路由层不应 require 任何 Model |
| `Service.getXXX()` / `Service.listXXX()`      | ✅ **允许**    | 所有数据访问走 Service        |
| `Service.createXXX()` / `Service.updateXXX()` | ✅ **允许**    | 所有写操作走 Service          |

**D2-Max 是你商业风险点的核心防线**：

- 你的核心链路是"强一致 + 强审计"（账本/冻结模型、核销码/库存状态机）
- 最怕的是"路由绕过 Service、绕过事务/幂等/缓存失效/审计"
- D2-Max 直接阻断**所有**绕过路径，边界最清晰、长期维护最省

**D2-Max 的实施影响**：

| 影响项   | 说明                                                   |
| -------- | ------------------------------------------------------ |
| 工期增加 | 需要给现有"只读接口"补充 Service 方法（预估 10-15 个） |
| 门禁规则 | 扫描 `require('...models/')` 和所有 Model 方法调用     |
| 长期收益 | 路由层只做参数校验+鉴权+编排，数据层完全解耦           |

**门禁脚本检测模式**：

```javascript
// scripts/validation/verify-route-layer-compliance.js

const FORBIDDEN_PATTERNS = [
  // 禁止 require 任何 Model
  /require\(['"]\.\.\/.*models\/[^'"]+['"]\)/,

  // 禁止所有 Model 写操作
  /\.(create|update|destroy|bulkCreate|upsert|save|increment|decrement|restore)\s*\(/,

  // 禁止所有 Model 读操作（D2-Max 特有）
  /\.(findOne|findAll|findByPk|findOrCreate|count|sum|max|min|aggregate)\s*\(/,

  // 禁止原生 SQL
  /sequelize\.(query|literal)\s*\(/
]
```

#### 决策点 E：服务 key 命名是否改为 snake_case？

✅ **已选择：E2-Strict（强制迁移，不兼容旧 key）**

> 🟡 中等风险决策：ServiceManager **只注册 snake_case key**，全量代码必须同步替换，扫描校验强制兜底。

**强制迁移策略**：

```javascript
// services/index.js 中只注册新 key
this._services.set('market_listing', MarketListingService) // ✅ 只有新 key
// this._services.set('marketListing', ...)                  // ❌ 不兼容旧 key

// 如果调用旧 key 会直接报错
serviceManager.getService('marketListing') // ❌ 运行时 Error: Service 'marketListing' not found
```

**全量替换保障机制**：

| 保障层级            | 机制                        | 说明                                      |
| ------------------- | --------------------------- | ----------------------------------------- |
| **1. 编译前校验**   | ESLint 插件（可选）         | 静态分析检测旧 key 使用                   |
| **2. 提交前校验**   | pre-commit hook             | 扫描 `getService('camelCase')` 并阻断提交 |
| **3. 运行时保护**   | ServiceManager.getService() | 旧 key 抛出明确错误（含迁移提示）         |
| **4. 全量扫描脚本** | 重构前/后对比               | 确保所有 `getService('xxx')` 调用都已迁移 |

**命名映射表（camelCase → snake_case 强制替换）**：

| 旧 key (camelCase) ❌    | 新 key (snake_case) ✅     | 使用频次（估算） |
| ------------------------ | -------------------------- | ---------------- |
| `unifiedLotteryEngine`   | `unified_lottery_engine`   | 高 (10+ 处)      |
| `exchangeMarket`         | `exchange_market`          | 中 (5+ 处)       |
| `contentAudit`           | `content_audit`            | 中 (5+ 处)       |
| `customerServiceSession` | `customer_service_session` | 低 (2-3 处)      |
| `hierarchyManagement`    | `hierarchy_management`     | 低 (2-3 处)      |
| `userRole`               | `user_role`                | 低 (2-3 处)      |
| `chatWebSocket`          | `chat_web_socket`          | 中 (5+ 处)       |
| `chatRateLimit`          | `chat_rate_limit`          | 低 (2-3 处)      |
| `prizePool`              | `prize_pool`               | 低 (2-3 处)      |
| `adminSystem`            | `admin_system`             | 中 (5+ 处)       |
| `adminLottery`           | `admin_lottery`            | 高 (10+ 处)      |
| `adminCustomerService`   | `admin_customer_service`   | 低 (2-3 处)      |
| `materialManagement`     | `material_management`      | 低 (2-3 处)      |
| `popupBanner`            | `popup_banner`             | 低 (2-3 处)      |
| `lotteryPreset`          | `lottery_preset`           | 低 (2-3 处)      |
| `auditLog`               | `audit_log`                | 中 (5+ 处)       |
| `lotteryManagement`      | `lottery_management`       | 高 (10+ 处)      |
| `assetConversion`        | `asset_conversion`         | 中 (5+ 处)       |
| `redemptionOrder`        | `redemption_order`         | 高 (10+ 处)      |
| `tradeOrder`             | `trade_order`              | 高 (10+ 处)      |
| `marketListing`          | `market_listing`           | 高 (10+ 处)      |
| `orphanFrozenCleanup`    | `orphan_frozen_cleanup`    | 低 (2-3 处)      |
| `merchantPoints`         | `merchant_points`          | 中 (5+ 处)       |
| `lotteryContainer`       | `lottery_container`        | 中 (5+ 处)       |
| `dataSanitizer`          | `data_sanitizer`           | 中 (5+ 处)       |
| `lotteryQuota`           | `lottery_quota`            | 低 (2-3 处)      |

**全量替换脚本示例**：

```bash
#!/bin/bash
# 一键全量替换所有 service key

# 1. 全量替换（按映射表逐个替换）
sed -i "s/getService('marketListing')/getService('market_listing')/g" routes/v4/**/*.js
sed -i "s/getService('tradeOrder')/getService('trade_order')/g" routes/v4/**/*.js
sed -i "s/getService('adminLottery')/getService('admin_lottery')/g" routes/v4/**/*.js
# ... 全量映射表替换

# 2. 验证遗漏
node scripts/validation/verify-all-keys-migrated.js

# 3. 运行测试
npm test
```

#### 决策点 F：测试替换策略——是否需要"可注入/可替换服务"能力？

✅ **已选择：F1（先不做）**

## 2. 涉及文件清单

### 2.1 需要重构的路由文件（按优先级排序）

#### 高优先级（写操作 + 幂等服务调用）

这些文件涉及关键业务写操作，统一后可确保事务一致性和服务生命周期管理：

| 文件路径                               | 直接 require 的 Service                      | 重构优先级 |
| -------------------------------------- | -------------------------------------------- | ---------- |
| `routes/v4/market/sell.js`             | `IdempotencyService`, `MarketListingService` | P0         |
| `routes/v4/market/buy.js`              | `IdempotencyService`                         | P0         |
| `routes/v4/lottery/draw.js`            | `DataSanitizer`, `IdempotencyService`        | P0         |
| `routes/v4/shop/exchange/exchange.js`  | `IdempotencyService`                         | P0         |
| `routes/v4/shop/consumption/submit.js` | `IdempotencyService`                         | P0         |
| `routes/v4/shop/assets/convert.js`     | `IdempotencyService`                         | P0         |

#### 中优先级（管理后台路由）

| 文件路径                                 | 直接 require 的 Service                       | 重构优先级 |
| ---------------------------------------- | --------------------------------------------- | ---------- |
| `routes/v4/console/marketplace.js`       | `TradeOrderService`, `MarketListingService`   | P1         |
| `routes/v4/console/merchant-points.js`   | `ContentAuditEngine`, `MerchantPointsService` | P1         |
| `routes/v4/console/campaign-budget.js`   | `AdminLotteryService`                         | P1         |
| `routes/v4/console/lottery-quota.js`     | `LotteryQuotaService`                         | P1         |
| `routes/v4/console/system/audit-logs.js` | `AuditLogService`                             | P1         |
| `routes/v4/console/user_management.js`   | `ChatWebSocketService`（函数内require）       | P1         |
| `routes/v4/console/assets/portfolio.js`  | `AssetService`                                | P1         |

#### 低优先级（读操作 / 工具服务）

| 文件路径                                 | 直接 require 的 Service               | 重构优先级 |
| ---------------------------------------- | ------------------------------------- | ---------- |
| `routes/v4/market/manage.js`             | `MarketListingService`                | P2         |
| `routes/v4/market/listings.js`           | `MarketListingService`                | P2         |
| `routes/v4/merchant-points.js`           | `MerchantPointsService`               | P2         |
| `routes/v4/activities.js`                | `ActivityService`                     | P2         |
| `routes/v4/shop/exchange/items.js`       | `DataSanitizer`                       | P2         |
| `routes/v4/shop/exchange/orders.js`      | `DataSanitizer`                       | P2         |
| `routes/v4/system/chat.js`               | `ChatRateLimitService`                | P2         |
| `routes/v4/system/feedback.js`           | `DataSanitizer`                       | P2         |
| `routes/v4/system/status.js`             | `AdminSystemService`（函数内require） | P2         |
| `routes/v4/lottery/prizes.js`            | `DataSanitizer`, `AdminSystemService` | P2         |
| `routes/v4/console/shared/middleware.js` | `UnifiedLotteryEngine` 相关           | P2         |

### 2.2 已正确使用 ServiceManager 的文件（参考示例）

```javascript
// routes/v4/console/images.js - 正确示例
const serviceManager = require('../../../services')

router.post('/upload', async (req, res) => {
  const imageService = serviceManager.getService('image')
  // ...
})
```

---

## 3. 重构方案

### 3.1 重构目标

1. **统一入口**：所有路由通过 `ServiceManager.getService(name)` 获取服务
2. **消除直接 require**：移除路由文件中对 `services/*.js` 的直接 require
3. **类型安全**：添加 JSDoc 注释标注服务类型
4. **可测试性**：支持在测试中替换服务实现

### 3.2 重构模式

#### 模式 A：顶层获取（推荐，适用于大多数场景）

```javascript
// 重构前
const IdempotencyService = require('../../../services/IdempotencyService')
const MarketListingService = require('../../../services/MarketListingService')

router.post('/create', async (req, res) => {
  const result = await IdempotencyService.execute(...)
})

// 重构后
const serviceManager = require('../../../services')

/**
 * @type {import('../../../services/IdempotencyService')}
 */
const IdempotencyService = serviceManager.getService('idempotency')

/**
 * @type {import('../../../services/MarketListingService')}
 */
const MarketListingService = serviceManager.getService('marketListing')

router.post('/create', async (req, res) => {
  const result = await IdempotencyService.execute(...)
})
```

#### 模式 B：函数内获取（适用于条件依赖）

```javascript
// 重构前（函数内 require）
router.put('/status/:user_id', async (req, res) => {
  const ChatWebSocketService = require('../../../services/ChatWebSocketService')
  ChatWebSocketService.disconnectUser(user_id, 'user')
})

// 重构后
const serviceManager = require('../../../services')

router.put('/status/:user_id', async (req, res) => {
  const ChatWebSocketService = serviceManager.getService('chatWebSocket')
  ChatWebSocketService.disconnectUser(user_id, 'user')
})
```

### 3.3 ServiceManager 服务名称映射表

当前 `services/index.js` 中已注册的服务名称映射：

| 服务类名                | ServiceManager 注册名  | require 路径                           |
| ----------------------- | ---------------------- | -------------------------------------- |
| `IdempotencyService`    | `idempotency`          | `services/IdempotencyService`          |
| `MarketListingService`  | `marketListing`        | `services/MarketListingService`        |
| `TradeOrderService`     | `tradeOrder`           | `services/TradeOrderService`           |
| `AssetService`          | `asset`                | `services/AssetService`                |
| `DataSanitizer`         | ❌ **未注册**          | `services/DataSanitizer`               |
| `ContentAuditEngine`    | `contentAudit`         | `services/ContentAuditEngine`          |
| `MerchantPointsService` | `merchantPoints`       | `services/MerchantPointsService`       |
| `AdminLotteryService`   | `adminLottery`         | `services/AdminLotteryService`         |
| `LotteryQuotaService`   | ❌ **未注册**          | `services/lottery/LotteryQuotaService` |
| `AuditLogService`       | `auditLog`             | `services/AuditLogService`             |
| `ChatWebSocketService`  | `chatWebSocket`        | `services/ChatWebSocketService`        |
| `ChatRateLimitService`  | `chatRateLimit`        | `services/ChatRateLimitService`        |
| `AdminSystemService`    | `adminSystem`          | `services/AdminSystemService`          |
| `ActivityService`       | `activity`             | `services/ActivityService`             |
| `UnifiedLotteryEngine`  | `unifiedLotteryEngine` | `services/UnifiedLotteryEngine/...`    |

### 3.4 需要新增注册的服务

以下服务在路由中被使用，但尚未在 ServiceManager 中注册：

| 服务类名              | 建议注册名      | 说明                                |
| --------------------- | --------------- | ----------------------------------- |
| `DataSanitizer`       | `dataSanitizer` | 数据脱敏服务，多处路由使用          |
| `LotteryQuotaService` | `lotteryQuota`  | 抽奖配额服务，管理后台使用          |
| `ManagementStrategy`  | -               | 策略类，不建议注册到 ServiceManager |
| `PerformanceMonitor`  | -               | 工具类，不建议注册到 ServiceManager |

---

## 4. 实施步骤（停更窗口模式）

### 前置条件（进入停更窗口前）

1. **确认当前代码稳定**
   - 全量测试通过（479+ tests）
   - ESLint 0 errors
   - 健康检查正常

2. **通知相关人员暂停提交**（停更窗口开始）

---

### Phase 1：准备阶段（0.5天）

1. **补充 ServiceManager 注册**
   - 在 `services/index.js` 中添加 `DataSanitizer` 和 `LotteryQuotaService` 注册
   - 所有服务**只注册 snake_case key**（不兼容旧 key）
2. **创建验证脚本**
   - 创建 `scripts/validation/verify-service-manager-usage.js`
   - 扫描所有路由文件，检测直接 require 服务的情况
   - 创建 `scripts/validation/verify-all-keys-migrated.js`
   - 扫描所有 `getService('xxx')` 调用，检测是否有旧 key 未迁移

3. **准备 service key 全量替换脚本**
   - 按照 1.4 决策点 E 的映射表，准备一键替换脚本
   - 验证脚本能够检测所有 camelCase key 使用情况

---

### Phase 2：服务层局部实例化 + key 强制迁移 + 启动时序调整（1天）

> 🟡 中等风险阶段：仅对 5 类有状态服务做实例化改造，其余保持静态 + service key 全量替换 + **H1-InitFirst 启动时序调整**

1. **改造 `app.js` 启动时序（H1-InitFirst）**

   ```javascript
   // 调整前（当前状态）
   app.listen(PORT)
   initializeServices()

   // 调整后（H1-InitFirst）
   async function bootstrap() {
     await initializeServices() // 先初始化
     app.listen(PORT) // 后监听
   }
   bootstrap()
   ```

2. **改造 `services/index.js`**
   - 仅对以下 5 类服务做实例化：
     - `ChatWebSocketService`（WebSocket 连接管理）
     - `OrphanFrozenCleanupService`（定时任务）
     - `ChatRateLimitService`（内存缓存状态）
     - `CustomerServiceSessionService`（会话状态）
     - 外部连接类（如有）
   - 其余静态服务保持原样（直接注册类引用）
   - **只注册 snake_case key**（不兼容旧 key）

3. **ServiceManager 强制迁移注册示例**

   ```javascript
   // 静态服务：直接注册类引用（仅 snake_case key）
   this._services.set('market_listing', MarketListingService) // ✅ 只有新 key
   // this._services.set('marketListing', ...)                  // ❌ 不注册旧 key

   // 有状态服务：实例化注册（仅 snake_case key）
   const chatWs = new ChatWebSocketService(this.io)
   this._services.set('chat_web_socket', chatWs) // ✅ 只有新 key
   // this._services.set('chatWebSocket', ...)                  // ❌ 不注册旧 key
   ```

4. **全量路由/脚本中的 service key 替换**
   - 运行一键替换脚本（见 Phase 1 准备的脚本）
   - 替换所有 `getService('camelCase')` → `getService('snake_case')`
   - 验证脚本检测遗漏

5. **验证实例化服务的生命周期**
   - 确保 `shutdown()` 方法能正确关闭 WebSocket/定时任务
   - 运行相关测试确认无回归

---

### Phase 3：路由层全量重构（1天）

1. **高优先级路由（6个文件）**
   - `routes/v4/market/sell.js`
   - `routes/v4/market/buy.js`
   - `routes/v4/lottery/draw.js`
   - `routes/v4/shop/exchange/exchange.js`
   - `routes/v4/shop/consumption/submit.js`
   - `routes/v4/shop/assets/convert.js`

2. **中优先级路由（7个文件）**
   - 管理后台相关路由

3. **低优先级路由（12个文件）**
   - 剩余所有路由文件

4. **每个文件改造模式**

   ```javascript
   // 改造前
   const SomeService = require('../../../services/SomeService')

   // 改造后（强制使用 snake_case，旧 key 会运行时报错）
   const serviceManager = require('../../../services')
   const SomeService = serviceManager.getService('some_service') // ✅ 只能用 snake_case
   ```

5. **全量验证**
   - 每改造完一批文件，立即运行验证脚本
   - 确保没有遗漏的旧 key 调用
   ```bash
   node scripts/validation/verify-all-keys-migrated.js --strict
   ```

---

### Phase 3.5：全仓统一（scripts/ + tests/）（0.5天）- J2-RepoWide

> 🔴 **新增阶段**：由于选择了 J2-RepoWide，需要额外处理非路由目录

1. **scripts/ 目录迁移**
   - 扫描 `scripts/**/*.js` 中的 `require('...services/...')`
   - 对于需要在脚本中使用 Service 的场景，改为初始化 ServiceManager 后获取
   - 注意：部分脚本可能是一次性运行，需评估是否值得改造

2. **tests/ 目录迁移**
   - 扫描 `tests/**/*.js` 中的 `require('...services/...')`
   - 测试文件通常需要 mock ServiceManager，改造后更容易替换

3. **验证全仓替换**
   ```bash
   # 全仓扫描，确保无遗漏
   grep -r "require.*services/" routes/ scripts/ tests/ --include="*.js" | grep -v node_modules
   ```

---

### Phase 4：门禁升级为 blocking（立即阻断）- I1-ImmediateBlock

> 🔴 **拍板决策**：迁移完 16+1 个路由后**立刻阻断**，防止回退

1. **启用验证脚本严格模式**

   ```bash
   # 路由层 Service 获取方式检查（严格模式）
   node scripts/validation/verify-service-manager-usage.js --strict

   # 全仓 service key 校验（E2-Strict）
   node scripts/validation/verify-all-keys-migrated.js --strict
   ```

2. **更新 `scripts/validation/check-route-layer-compliance.js`**
   - 将 `--strict false` 改为 `--strict true`
   - 扫描范围扩展到全仓（J2-RepoWide）

3. **验证门禁生效**
   - 尝试提交违规代码，确认被拦截
   - 尝试使用旧 key（camelCase），确认被拦截

---

### Phase 5：全量回归验证（1天）

1. **运行全量测试**

   ```bash
   npm test
   ```

   - 必须 479+ tests 全部通过
   - 失败则修复后重新验证

2. **运行 ESLint**

   ```bash
   npm run lint
   ```

   - 必须 0 errors, 0 warnings

3. **健康检查**

   ```bash
   curl http://localhost:3000/health
   ```

4. **手动冒烟测试**
   - 核心业务流程：抽奖、资产交易、积分操作
   - 管理后台：用户管理、订单查看、系统设置

5. **验证脚本 100% 通过**
   ```bash
   node scripts/validation/verify-service-manager-usage.js --strict
   node scripts/validation/check-route-layer-compliance.js --strict
   ```

---

### Phase 6：合并与发布（0.5天）

1. **合并到主分支**

   ```bash
   git checkout main
   git merge refactor/p1-9-service-manager-unification
   ```

2. **通知停更窗口结束**

3. **监控生产环境**
   - 观察 24 小时，确认无异常

---

## 4.1 回滚预案

### 触发条件

- 全量测试通过率 < 95%
- 健康检查失败
- 核心业务流程冒烟测试失败

### 回滚步骤

1. 恢复到重构前的代码状态
2. 重新启动服务：`npm run pm:restart`
3. 验证回滚成功：`curl http://localhost:3000/health`

### 事后分析

- 记录失败原因
- 拆分为更小的迭代
- 本方案已是风险可控版本（C2-Lite），若仍失败可考虑：
  - 仅保留 D2（门禁严格），暂缓 C2-Lite 和 E2-Strict
  - 或拆分为多个更小的迭代（每次仅迁移 5-10 个路由文件）
  - 或将 E2-Strict 降级为 E2-Compat（短期兼容旧 key），待业务稳定后再二次强制迁移

---

## 5. 验证脚本设计

### 5.1 扫描脚本示例

```javascript
// scripts/validation/verify-service-manager-usage.js

const fs = require('fs')
const path = require('path')

const ROUTES_DIR = path.join(__dirname, '../../routes/v4')

// 禁止直接 require 的服务模式
const FORBIDDEN_PATTERNS = [
  /require\(['"]\.\.\/.*services\/.*Service['"]\)/,
  /require\(['"]\.\.\/.*services\/DataSanitizer['"]\)/,
  /require\(['"]\.\.\/.*services\/ContentAuditEngine['"]\)/
]

// 允许的模式（工具类、策略类）
const ALLOWED_PATTERNS = [
  /ManagementStrategy/,
  /PerformanceMonitor/,
  /UnifiedLotteryEngine\/utils\//
]

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const violations = []

  FORBIDDEN_PATTERNS.forEach(pattern => {
    const matches = content.match(pattern)
    if (matches && !ALLOWED_PATTERNS.some(allowed => allowed.test(matches[0]))) {
      violations.push({
        file: filePath,
        pattern: matches[0],
        line: findLineNumber(content, matches[0])
      })
    }
  })

  return violations
}

// ... 完整实现
```

### 5.2 验证脚本集成

重构完成后，确保在代码提交前执行验证脚本：

```bash
# 检查路由层 Service 获取方式
node scripts/validation/verify-service-manager-usage.js --strict
```

---

## 6. 风险与应对（C2-Lite + D2 + E2-Strict 风险适配模式）

| 风险                             | 可能性 | 影响  | 应对措施                                                     |
| -------------------------------- | ------ | ----- | ------------------------------------------------------------ |
| **有状态服务实例化顺序错误**     | 中     | 中    | 仅 5 个服务需要关注顺序；在 `services/index.js` 中显式声明   |
| **静态服务调用方式变化**         | 🟢 低  | 🟢 低 | 静态服务保持原样，调用方式不变                               |
| **service key 全量替换遗漏**     | 🟡 中  | 🔴 高 | 扫描脚本强制校验；pre-commit hook 阻断；运行时报错含迁移提示 |
| **门禁立即 blocking 阻断开发**   | 确定   | 中    | 停更窗口模式；确保全量重构完成后才开放提交                   |
| **全量测试覆盖不足导致隐藏回归** | 中     | 高    | 增加手动冒烟测试；核心业务流程必须人工验证                   |
| **重构分支合并冲突**             | 低     | 中    | 停更窗口期间禁止其他提交；合并前 rebase 最新 main            |

### 风险对比：原方案 vs 当前方案

| 风险项           | 原方案 (C2+E2) | 当前方案 (C2-Lite+E2-Strict)  | 变化        |
| ---------------- | -------------- | ----------------------------- | ----------- |
| 服务实例化改造量 | 30+ 个服务     | 5 个服务                      | 🟢 83% ↓    |
| 调用方式变更点   | 200+ 处        | 20 处（仅有状态服务）         | 🟢 90% ↓    |
| key 遗漏风险     | 高（线上故障） | 🟡 中（扫描+运行时兜底）      | 🟢 50% ↓    |
| key 迁移工作量   | 全量手工替换   | 脚本一键替换+校验             | 🟢 效率提升 |
| 回归测试范围     | 全量服务       | 5 个有状态服务 + key 替换验证 | 🟢 70% ↓    |

### E2-Strict 强制迁移的安全保障

| 保障机制            | 说明                                                            | 防护层级    |
| ------------------- | --------------------------------------------------------------- | ----------- |
| **一键替换脚本**    | 按映射表全量替换所有 `getService('xxx')` 调用                   | 🟢 主动     |
| **全量扫描验证**    | `verify-all-keys-migrated.js` 检测遗漏的 camelCase key          | 🟢 主动     |
| **pre-commit hook** | Git 提交前强制检测，发现旧 key 使用立即阻断                     | 🟡 被动防护 |
| **运行时报错**      | ServiceManager.getService() 对旧 key 抛出明确错误（含迁移提示） | 🔴 最后防线 |
| **全量测试**        | 479+ 测试用例覆盖主要 service 调用路径                          | 🟡 被动验证 |

**运行时错误示例**：

```javascript
// 用户调用旧 key
serviceManager.getService('marketListing')

// 抛出错误（含迁移提示）
Error: Service 'marketListing' not found.
Did you mean 'market_listing'? (snake_case key migration)
Available services: [...snake_case keys only...]
```

---

## 7. 成功标准（v3.1 完整版）

### 必须达成（否则回滚）

**B1-Injected + G1-Unified 相关**：

- [ ] 所有路由文件不再直接 `require('...services/XXXService')`
- [ ] 所有服务通过 `req.app.locals.services.getService()` 获取
- [ ] 中间件 `req.services = req.app.locals.services` 已配置（可选简化）
- [ ] **工具类/静态类（如 DataSanitizer）也走 ServiceManager**（G1-Unified）

**D2-Max 相关**：

- [ ] 所有路由文件不再直接 `require('...models/XXX')`
- [ ] 路由层不再有任何 Model 读操作（findOne/findAll/count 等）
- [ ] 路由层不再有任何 Model 写操作（create/update/destroy 等）
- [ ] 需要的"只读 Service 方法"已补充完成

**E2-Strict + J2-RepoWide 相关**：

- [ ] **全仓 service key 已全量替换为 snake_case**（routes/ + scripts/ + tests/）
- [ ] **ServiceManager 只注册 snake_case key**（旧 key 运行时报错）
- [ ] 验证脚本覆盖全仓（不仅是 routes/v4）

**H1-InitFirst 相关**：

- [ ] **app.js 启动时序已调整为"初始化完成才监听"**
- [ ] ServiceManager.initialize() 在 app.listen() 之前完成

**I1-ImmediateBlock 相关**：

- [ ] 门禁已切到 blocking 模式（pre-commit hook --strict）
- [ ] 尝试提交违规代码被成功拦截

**C2-Lite 相关**：

- [ ] **5 个有状态服务已改为实例化方式**（±2 微调已记录）
- [ ] 静态服务保持静态类形态

**综合验证**：

- [ ] 全量测试通过（Jest 479+ tests，通过率 100%）
- [ ] ESLint 检查通过（0 errors, 0 warnings）
- [ ] Git Hooks 已集成 blocking 模式检查（D2-Max + E2-Strict + G1-Unified）
- [ ] 健康检查正常（`/health` 返回 healthy）
- [ ] 核心业务冒烟测试通过（抽奖、资产交易、积分操作）

### 建议达成（不阻塞合并）

- [ ] `DataSanitizer` 和 `LotteryQuotaService` 已注册到 ServiceManager
- [ ] 验证脚本 `verify-service-manager-usage.js` 100% 通过（全仓）
- [ ] 验证脚本 `verify-all-keys-migrated.js` 100% 通过（无旧 key 遗漏）
- [ ] 验证脚本 `verify-route-layer-compliance.js` 100% 通过（D2-Max）
- [ ] C2-Lite 微调记录文档已完成（如有增删）
- [ ] 重构分支无冲突合并到 main
- [ ] 生产环境观察 24 小时无异常

---

## 8. 附录

### 8.1 ServiceManager 完整服务列表

```javascript
// 当前 services/index.js 中注册的服务（共30+个）
const REGISTERED_SERVICES = [
  'unifiedLotteryEngine', // V4统一抽奖引擎
  'exchangeMarket', // 兑换市场服务
  'contentAudit', // 内容审核引擎
  'announcement', // 公告服务
  'notification', // 通知服务
  'consumption', // 消费服务
  'customerServiceSession', // 客服会话服务
  'hierarchyManagement', // 层级管理服务
  'userRole', // 用户角色服务
  'chatWebSocket', // 聊天 WebSocket 服务
  'user', // 用户服务
  'chatRateLimit', // 聊天频率限制服务
  'prizePool', // 奖品池服务
  'premium', // 高级空间服务
  'feedback', // 反馈服务
  'adminSystem', // 管理后台系统服务
  'adminLottery', // 管理后台抽奖服务
  'adminCustomerService', // 管理后台客服服务
  'materialManagement', // 材料系统运营管理服务
  'popupBanner', // 弹窗Banner服务
  'image', // 图片上传服务
  'lotteryPreset', // 抽奖预设服务
  'activity', // 活动服务
  'auditLog', // 审计日志服务
  'lotteryManagement', // 抽奖管理服务（别名）
  'reporting', // 统一报表服务
  'asset', // 统一资产服务
  'assetConversion', // 资产转换服务
  'idempotency', // 幂等服务
  'redemptionOrder', // 兑换订单服务
  'backpack', // 背包服务
  'tradeOrder', // 交易订单服务
  'marketListing', // 市场挂牌服务
  'orphanFrozenCleanup', // 孤儿冻结清理服务
  'merchantPoints', // 商家积分服务
  'lotteryContainer' // 抽奖服务容器
]
```

### 8.2 重构后的代码示例（B1-Injected + C2-Lite + D2-Max + E2-Strict 模式）

```javascript
/**
 * 市场挂牌路由 - 重构示例（最终版 v3.0）
 *
 * @file routes/v4/market/sell.js
 * @description 用户发起资产出售的API入口
 *
 * 改造要点：
 * 1. B1-Injected：通过 req.app.locals.services 获取服务
 * 2. D2-Max：路由层不碰任何 Model（读写都走 Service）
 * 3. C2-Lite：静态服务保持静态调用
 * 4. E2-Strict：service key 使用 snake_case
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger

// ❌ 禁止：不再顶层 require ServiceManager
// const serviceManager = require('../../../services')

// ❌ 禁止：不再 require 任何 Model（D2-Max）
// const { MarketListing } = require('../../../models')

/**
 * POST /api/v4/market/sell
 * 发起资产出售
 */
router.post('/', authenticateToken, async (req, res) => {
  // ✅ B1-Injected：通过 req.app.locals.services 获取服务
  const services = req.app.locals.services

  // ✅ E2-Strict：使用 snake_case key
  const IdempotencyService = services.getService('idempotency')
  const MarketListingService = services.getService('market_listing')

  // ✅ C2-Lite：静态服务保持静态方法调用
  const result = await IdempotencyService.execute(req.body.idempotency_key, async () => {
    // ✅ D2-Max：所有数据操作走 Service，不直接碰 Model
    return await MarketListingService.createListing({
      seller_id: req.user.user_id,
      item_instance_id: req.body.item_instance_id,
      price: req.body.price
      // ...
    })
  })

  return res.apiSuccess(result, '挂牌成功')
})

/**
 * GET /api/v4/market/sell/my
 * 获取我的挂牌列表（只读接口）
 */
router.get('/my', authenticateToken, async (req, res) => {
  const services = req.app.locals.services
  const MarketListingService = services.getService('market_listing')

  // ✅ D2-Max：即使是只读也走 Service（需要补充 Service 方法）
  const listings = await MarketListingService.getMyListings(req.user.user_id)

  // ❌ 禁止：不允许直接调用 Model
  // const listings = await MarketListing.findAll({ where: { seller_id: req.user.user_id } })

  return res.apiSuccess(listings)
})

module.exports = router
```

### 8.3 ServiceManager 改造示例（C2-Lite + E2-Strict 模式）

```javascript
/**
 * services/index.js 改造示例（部分）
 *
 * 改造要点：
 * 1. 只注册 snake_case key（不兼容旧 key）
 * 2. 仅有状态服务实例化，静态服务保持原样
 * 3. 有状态服务通过构造函数接收依赖
 */

class ServiceManager {
  async initialize() {
    // ========== 静态服务（保持原样，只注册 snake_case key） ==========

    // 幂等服务（静态类）
    this._services.set('idempotency', IdempotencyService)
    // 无需旧 key（本身就是简短形式）

    // 市场挂牌服务（静态类）
    this._services.set('market_listing', MarketListingService) // ✅ 只有新 key
    // this._services.set('marketListing', ...)                  // ❌ 不注册旧 key

    // 交易订单服务（静态类）
    this._services.set('trade_order', TradeOrderService) // ✅ 只有新 key

    // 数据脱敏服务（静态工具类）
    this._services.set('data_sanitizer', DataSanitizer) // ✅ 只有新 key

    // ========== 有状态服务（实例化，只注册 snake_case key） ==========

    // WebSocket 服务（持有连接状态）
    const chatWs = new ChatWebSocketService(this.io)
    this._services.set('chat_web_socket', chatWs) // ✅ 只有新 key

    // 定时任务服务（持有定时器句柄）
    const orphanCleanup = new OrphanFrozenCleanupService(this.models)
    this._services.set('orphan_frozen_cleanup', orphanCleanup) // ✅ 只有新 key

    // 频率限制服务（持有内存缓存）
    const chatRateLimit = new ChatRateLimitService()
    this._services.set('chat_rate_limit', chatRateLimit) // ✅ 只有新 key

    // ...
  }

  /**
   * 获取服务（强制 snake_case，旧 key 报错）
   */
  getService(name) {
    if (!this._services.has(name)) {
      // 尝试提供迁移提示
      const suggestion = this._suggestMigration(name)
      throw new Error(
        `Service '${name}' not found.${suggestion ? ` Did you mean '${suggestion}'?` : ''} ` +
          `(snake_case key migration required)\n` +
          `Available services: ${Array.from(this._services.keys()).join(', ')}`
      )
    }
    return this._services.get(name)
  }

  /**
   * 旧 key → 新 key 迁移提示
   */
  _suggestMigration(oldKey) {
    const migrations = {
      marketListing: 'market_listing',
      tradeOrder: 'trade_order',
      chatWebSocket: 'chat_web_socket'
      // ... 完整映射表
    }
    return migrations[oldKey]
  }

  /**
   * 优雅关闭（仅需关闭有状态服务）
   */
  async shutdown() {
    // 关闭 WebSocket 连接
    const chatWs = this._services.get('chat_web_socket')
    if (chatWs?.shutdown) await chatWs.shutdown()

    // 停止定时任务
    const orphanCleanup = this._services.get('orphan_frozen_cleanup')
    if (orphanCleanup?.stop) orphanCleanup.stop()

    // 静态服务无需关闭
  }
}
```

### 8.4 门禁脚本示例（D2 严格模式 + E2-Strict key 校验）

```javascript
/**
 * scripts/validation/verify-service-manager-usage.js
 *
 * D2 门禁策略：阻断路由直连 Service/DB 写操作
 * E2-Strict 策略：阻断旧 key 使用
 */

const FORBIDDEN_PATTERNS = [
  // 禁止直接 require Service
  /require\(['"]\.\.\/.*services\/.*Service['"]\)/,
  /require\(['"]\.\.\/.*services\/DataSanitizer['"]\)/,

  // 禁止路由层直接操作数据库写入
  /\.create\s*\(/,
  /\.update\s*\(/,
  /\.destroy\s*\(/,
  /\.bulkCreate\s*\(/
]

// E2-Strict: 检测旧 key 使用（camelCase）
const LEGACY_KEY_PATTERN = /getService\s*\(\s*['"]([a-z][a-zA-Z]+)['"]\s*\)/g

function validateServiceKeys(content, filePath) {
  const violations = []

  // 检查所有 getService 调用
  const matches = [...content.matchAll(LEGACY_KEY_PATTERN)]
  for (const match of matches) {
    const key = match[1]

    // 检查是否为 camelCase（包含大写字母）
    if (/[A-Z]/.test(key)) {
      violations.push({
        file: filePath,
        line: getLineNumber(content, match.index),
        oldKey: key,
        newKey: camelToSnake(key),
        message: `旧 key '${key}' 必须替换为 '${camelToSnake(key)}'`
      })
    }
  }

  return violations
}

function camelToSnake(str) {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase()
}

// 主程序
const violations = validateServiceKeys(fileContent, filePath)
if (violations.length > 0) {
  console.error('🚫 检测到旧 service key 使用，必须迁移为 snake_case:')
  violations.forEach(v => {
    console.error(`  ${v.file}:${v.line} - ${v.message}`)
  })
  process.exit(1) // 阻断提交
}
```

### 8.5 一键替换脚本示例

```bash
#!/bin/bash
# scripts/migration/replace-all-service-keys.sh
# 一键全量替换所有 service key

set -e  # 遇到错误立即退出

echo "🔧 开始 service key 全量替换..."

# 1. 备份当前代码
git stash push -m "backup before service key migration $(date +%Y%m%d_%H%M%S)"

# 2. 定义替换映射
declare -A KEY_MAP=(
  ["'marketListing'"]="'market_listing'"
  ["'tradeOrder'"]="'trade_order'"
  ["'chatWebSocket'"]="'chat_web_socket'"
  ["'adminLottery'"]="'admin_lottery'"
  ["'lotteryManagement'"]="'lottery_management'"
  ["'redemptionOrder'"]="'redemption_order'"
  ["'dataSanitizer'"]="'data_sanitizer'"
  # ... 完整映射表
)

# 3. 全仓替换（J2-RepoWide：routes/ + scripts/ + tests/ + services/）
for old_key in "${!KEY_MAP[@]}"; do
  new_key="${KEY_MAP[$old_key]}"
  echo "替换 $old_key → $new_key"

  # J2-RepoWide: 全仓统一替换
  find routes -name "*.js" -exec sed -i "s/getService($old_key)/getService($new_key)/g" {} \;
  find scripts -name "*.js" -exec sed -i "s/getService($old_key)/getService($new_key)/g" {} \;
  find tests -name "*.js" -exec sed -i "s/getService($old_key)/getService($new_key)/g" {} \;
  find services -name "*.js" -exec sed -i "s/getService($old_key)/getService($new_key)/g" {} \;
done

# 4. 验证遗漏
echo "🔍 验证遗漏..."
node scripts/validation/verify-all-keys-migrated.js

if [ $? -eq 0 ]; then
  echo "✅ 所有 service key 已成功替换为 snake_case"
else
  echo "❌ 检测到遗漏，请手动检查"
  exit 1
fi

# 5. 运行测试
echo "🧪 运行测试验证..."
npm test

if [ $? -eq 0 ]; then
  echo "✅ 全量测试通过"
  echo "📦 可以提交代码: git add . && git commit -m 'refactor: migrate service keys to snake_case'"
else
  echo "❌ 测试失败，请检查"
  exit 1
fi
```

---

## 9. 最终方案总结（v3.1）

### 决策全景图

| 决策点 | 最终选择              | 一句话说明                                           |
| ------ | --------------------- | ---------------------------------------------------- |
| **A**  | A1                    | 补充注册 `DataSanitizer`、`LotteryQuotaService`      |
| **B**  | **B1-Injected**       | 通过 `req.app.locals.services.getService()` 获取     |
| **C**  | **C2-Lite ±2**        | 5 类有状态服务实例化，允许微调                       |
| **D**  | **D2-Max**            | 路由层完全不碰 Model（读写都走 Service）             |
| **E**  | **E2-Strict**         | 强制 snake_case，不兼容旧 key，**全仓替换**          |
| **F**  | F1                    | 先不做测试替换能力                                   |
| **G**  | **G1-Unified**        | 工具类/静态类也走 ServiceManager（规则简单、可门禁） |
| **H**  | **H1-InitFirst**      | 初始化完成才启动监听（确定性更强）                   |
| **I**  | **I1-ImmediateBlock** | 迁移完 16+1 个路由后立刻阻断（防止回退）             |
| **J**  | **J2-RepoWide**       | 全仓统一（routes/ + scripts/ + tests/）              |

### 方案对比

| 维度             | 原方案 (C2+D2+E2) | 最终方案 v3.1                           |
| ---------------- | ----------------- | --------------------------------------- |
| **服务获取方式** | 顶层 require      | ✅ 请求内注入（B1-Injected）            |
| **路由层边界**   | 仅禁止写操作      | ✅ D2-Max 读写都禁（最强边界）          |
| **实例化范围**   | 30+ 服务全实例化  | ✅ 5 个有状态服务（C2-Lite ±2 微调）    |
| **key 迁移**     | 一次性手工替换    | ✅ 脚本一键替换 + 多层校验（E2-Strict） |
| **工具类处理**   | 不明确            | ✅ 统一走 ServiceManager（G1-Unified）  |
| **启动时序**     | 先监听后初始化    | ✅ 初始化完成才监听（H1-InitFirst）     |
| **门禁时机**     | 迁移完再启用      | ✅ 迁移完立刻阻断（I1-ImmediateBlock）  |
| **统一范围**     | 仅 routes/v4      | ✅ 全仓统一（J2-RepoWide）              |
| **工期**         | 4-5 天            | **5-6 天**（全仓统一增加 1 天）         |
| **回归风险**     | 🔴 高             | 🟡 中（C2-Lite 降低）                   |
| **长期维护成本** | 中                | 🟢 低（边界最清晰、规则最简单）         |

### 核心价值

1. **B1-Injected**：对齐现有注入方式，避免初始化时序问题，便于测试和 request 上下文传递
2. **D2-Max**：路由层只做参数校验+鉴权+编排，数据层完全解耦，边界最清晰、长期维护最省
3. **C2-Lite ±2**：按"是否持有资源"判定，避免过度实例化带来的复杂度
4. **E2-Strict**：强制全量迁移，脚本化+校验兜底，一次到位
5. **G1-Unified**：规则简单（`services/` 目录下的都走 ServiceManager），可门禁
6. **H1-InitFirst**：确保确定性，未来接入 Redis/WS/定时器等资源不会踩坑
7. **I1-ImmediateBlock**：迁移完立刻阻断，防止回退
8. **J2-RepoWide**：一次性全仓统一，虽然工期多 1 天，但更彻底

---

**文档版本**：3.1.0（新增 G1-Unified + H1-InitFirst + I1-ImmediateBlock + J2-RepoWide）  
**最后更新**：2026年01月09日  
**负责人**：后端架构组  
**决策拍板**：✅ **全部决策已拍板**（用户已接受停更窗口 + 全量回归 + 回滚预案 + 全仓统一）
