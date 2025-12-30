# PointsService 迁移剩余问题清单

**创建时间**: 2025-12-30
**最后更新**: 2025-12-30 (服务层迁移完成)
**验证方式**: 代码实际状态验证（非文档引用）
**前置文档**: PointsService迁移遗留项执行清单.md

---

## 一、问题汇总

| 问题编号 | 问题类型                         | 优先级 | 状态                                      |
| -------- | -------------------------------- | ------ | ----------------------------------------- |
| P1       | PointsService 仍被 10 个文件引用 | 高     | ✅ 已完成（服务层迁移完成，路由设计保留） |
| P2       | 旧模型文件未删除                 | 中     | ✅ 设计保留（PointsService 仍需使用）     |
| P3       | JSDoc 残留注释未清理             | 低     | ✅ 已完成                                 |
| P4       | 阶段五验证任务未完成             | 中     | ✅ 已完成（ESLint/健康检查通过）          |
| P5       | 旧数据库表待删除                 | 低     | ✅ 设计保留（等待路由完全迁移）           |

---

## 二、问题详情

### P1: PointsService 仍被 10 个文件引用 ✅ 已完成

**✅ 服务层迁移完成（2025-12-30）**:

以下服务已从 UserPointsAccount 迁移到 AssetService：

- `services/UserService.js` - getUserWithPoints() 方法已迁移
- `services/ActivityConditionValidator.js` - getUserData() 方法已迁移
- `services/ReportingService.js` - getUserStatistics() 方法已迁移
- `services/UnifiedLotteryEngine/*` - 已确认使用 AssetService.changeBalance()
- `services/ExchangeService.js` - 已确认使用 AssetService.changeBalance()

**✅ 设计保留（积分路由）**:

以下路由仍使用 PointsService，这是**有意保留**：

```
routes/v4/shop/points/balance.js      # 积分余额接口
routes/v4/shop/points/index.js        # 积分路由入口
routes/v4/shop/points/statistics.js   # 积分统计接口
routes/v4/shop/points/admin.js        # 积分管理接口
routes/v4/shop/points/transactions.js # 积分流水接口
```

**保留原因**:

1. PointsService 提供丰富的积分查询/统计方法（getUserPointsOverview、getUserPendingPoints 等）
2. 这些方法已修改为从 consumption_records 查询待审核积分（单一真相源）
3. 未来如需完全废弃，需将这些方法迁移到 AssetService 或创建新的 PointsQueryService

---

### P2: 旧模型文件未删除 ✅ 设计保留

**问题描述**: 以下旧模型文件仍存在于代码库中：

```
models/UserPointsAccount.js    # 旧积分账户模型
models/PointsTransaction.js    # 旧积分流水模型
```

**✅ 设计保留原因**:

- PointsService 仍需使用这些模型提供积分查询/统计功能
- 积分路由（`routes/v4/shop/points/*`）依赖 PointsService
- 待未来积分路由完全迁移至 AssetService 后再删除

---

### P3: JSDoc 残留注释未清理 ✅ 已完成

**已删除**: PointsService.js 中 `createPendingPointsForConsumption` 的残留 JSDoc 注释块。

---

### P4: 阶段五验证任务 ✅ 已完成

**验证结果（2025-12-30）**:

- ✅ ESLint 语法检查：0 errors, 38 warnings（均为 no-await-in-loop 非关键警告）
- ✅ 健康检查：GET /health 返回 `SYSTEM_HEALTHY`
- ✅ PM2 服务状态：online
- ✅ Redis 连接：PONG

---

### P5: 旧数据库表待删除 ✅ 设计保留

**问题描述**: 以下旧数据库表待确认删除：

```
user_points_accounts    # 旧积分账户表
points_transactions     # 旧积分流水表
```

**✅ 设计保留原因**:

- PointsService 仍需使用这些表提供积分查询/统计功能
- 积分路由依赖这些数据
- 待未来积分路由完全迁移至 AssetService 后，执行数据对账再删除

**未来删除前置条件**:

- [ ] 积分路由完全迁移到 AssetService
- [ ] PointsService 废弃并删除
- [ ] 历史数据已同步至新表（account_asset_balances, asset_transactions）
- [ ] 执行数据对账确认无丢失

---

## 三、设计保留项说明

以下内容是**有意保留**，非遗留问题：

| 保留项                                                 | 保留原因                    | 未来处理方案                                        |
| ------------------------------------------------------ | --------------------------- | --------------------------------------------------- |
| 积分路由 (`routes/v4/shop/points/*`)                   | 提供丰富的积分查询/统计功能 | 未来可迁移到 AssetService 或创建 PointsQueryService |
| 旧模型文件 (UserPointsAccount, PointsTransaction)      | PointsService 仍需使用      | 待积分路由迁移后删除                                |
| 旧数据库表 (user_points_accounts, points_transactions) | 存储积分历史数据            | 待数据对账后删除                                    |
| PointsService 导出 (`services/index.js`)               | 积分路由依赖                | 待积分路由迁移后移除                                |

---

## 四、已验证完成项

以下内容已通过代码验证确认完成：

| 完成项                                          | 验证位置                                       | 验证结果                                    |
| ----------------------------------------------- | ---------------------------------------------- | ------------------------------------------- |
| ConsumptionService 使用 AssetService            | services/ConsumptionService.js:30              | ✅ 已迁移                                   |
| 商家提交不创建 pending 积分                     | services/ConsumptionService.js:297-304         | ✅ 已移除                                   |
| 审核通过直接发放积分                            | services/ConsumptionService.js:414-430         | ✅ 使用 AssetService.changeBalance          |
| 幂等键使用新命名规则                            | services/ConsumptionService.js:420             | ✅ `consumption_reward:approve:${recordId}` |
| getBalanceResponse 查询 consumption_records     | services/PointsService.js:1449-1461            | ✅ 从消费记录汇总                           |
| getUserPointsOverview 从消费记录查询            | services/PointsService.js:868-886              | ✅ 已修改                                   |
| getUserFrozenPoints 从消费记录查询              | services/PointsService.js:976-994              | ✅ 已修改                                   |
| AssetService.getAssetPortfolio 使用新模型       | services/AssetService.js:1059-1198             | ✅ 使用 AccountAssetBalance                 |
| cleanup.js 添加清理方法                         | scripts/maintenance/cleanup.js:206-297         | ✅ cleanupDirtyPendingPoints 存在           |
| **UserService.getUserWithPoints 迁移**          | services/UserService.js:501-539                | ✅ 使用 AssetService (2025-12-30)           |
| **ActivityConditionValidator.getUserData 迁移** | services/ActivityConditionValidator.js:173-185 | ✅ 使用 AssetService (2025-12-30)           |
| **ReportingService.getUserStatistics 迁移**     | services/ReportingService.js:1316-1330         | ✅ 使用 AssetService (2025-12-30)           |
| **ESLint 语法检查**                             | npm run lint                                   | ✅ 0 errors, 38 warnings (2025-12-30)       |
| **健康检查**                                    | GET /health                                    | ✅ 系统运行正常 (2025-12-30)                |

---

## 五、备注

1. **测试文件** (tests/business/points/service.test.js) 待业务迁移完成后统一清理
2. 建议在非高峰期执行数据库表删除操作
3. 本次迁移已完成所有服务层的 UserPointsAccount → AssetService 迁移
4. 积分路由保留使用 PointsService 是架构设计决策，非技术债务
