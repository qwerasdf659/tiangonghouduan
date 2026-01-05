# 历史时间戳冲突记录（已知悉，仅存档不修复）

## 决策说明（2026-01-04拍板）
- 这些迁移已在生产环境执行
- **不改动 sequelizemeta 记录**（避免风险）
- **不重命名迁移文件**（保持原样）
- 仅作审计存档（baseline 之后严格避免此类问题）

## 冲突组1：20251215180000（4个文件）

1. 20251215180000-add-cost-asset-fields-to-exchange-items.js
2. 20251215180000-add-material-fields-to-lottery-prizes.js
3. 20251215180000-create-market-listings-table.js
4. 20251215180000-phase4-drop-old-material-diamond-tables.js

执行顺序：按字母序（add-cost -> add-material -> create-market -> phase4-drop）

## 冲突组2：20251215180100（2个文件）

1. 20251215180100-add-pay-asset-fields-to-exchange-market-records.js
2. 20251215180100-create-trade-orders-table.js

执行顺序：按字母序（add-pay -> create-trade）

## 冲突组3：20251215230000（2个文件）

1. 20251215230000-alter-column-asset-transactions-user-id-nullable.js
2. 20251215230000-fix-asset-transactions-user-id-nullable.js

执行顺序：按字母序（alter-column -> fix-asset）

## 冲突组4：20251030180000（2个文件）

1. 20251030180000-alter-column-consumption-records-record-id.js
2. 20251030180000-fix-consumption-records-record-id-auto-increment.js

执行顺序：按字母序

## 冲突组5：20251215170000（2个文件）

1. 20251215170000-add-selling-asset-fields-to-user-inventory.js
2. 20251215170000-phase4-set-old-material-tables-readonly.js

执行顺序：按字母序

## 冲突组6：20251220190200（2个文件）

1. 20251220190200-drop-legacy-tables.js
2. 20251220190200-phase6-drop-legacy-tables.js

执行顺序：按字母序

## 冲突组7：20251220190500（2个文件）

1. 20251220190500-delete-legacy-tables.js
2. 20251220190500-drop-table-legacy-tables.js

执行顺序：按字母序

## 冲突组8：20251220190510（2个文件）

1. 20251220190510-delete-legacy-fields.js
2. 20251220190510-drop-column-legacy-fields.js

执行顺序：按字母序

## 风险说明

- sequelize-cli 按文件名字典序执行
- 同时间戳时执行顺序依赖文件名排序
- 如果存在依赖关系（如先建表再加字段），可能导致执行失败
- 后期难以审计"哪个先执行"

## 预防措施（baseline 之后）

1. 迁移创建工具已添加时间戳唯一性校验
2. 创建迁移时会自动检查是否与现有迁移冲突
3. 冲突时拒绝创建，要求等待1秒后重试
