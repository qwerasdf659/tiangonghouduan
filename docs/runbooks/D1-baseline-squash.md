# D1：迁移 Baseline Squash 操作手册

> 与 `docs/技术债务.md` **D1 方案 B** 一致。本仓库**未在 CI 中自动执行**本流程；需在维护窗口由具备数据库权限的人员手工执行。

## 何时做

- 未上线、可接受**丢弃 SequelizeMeta 历史**、全员从同一 baseline 重建 schema 时成本最低。
- 已上线或有多个长期分支环境时，需先对齐所有环境再 squash，否则迁移版本会分叉。

## 推荐步骤（概要）

1. **冻结写入**：停应用、备份全库（`mysqldump` 或平台快照）。
2. **导出当前 DDL**（权威以**真实库**为准）：
   ```bash
   mysqldump -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" \
     --no-data --routines=false "$DB_NAME" > /tmp/schema-$(date +%Y%m%d).sql
   ```
3. **新建单条 baseline 迁移**（示例名）：`migrations/YYYYMMDDHHMMSS-baseline-v4.x-squashed.js`  
   - 内容可为：对 `schema.sql` 中语句用 `queryInterface.sequelize.query` 分批执行，或手工改写为 `createTable`（115 表工作量大，通常优先 raw SQL + 版本注释）。
4. **归档旧迁移**：将现有 `migrations/*.js`（除 `sequelize-meta` 工具与 README 外）移入 `migrations/archived/YYYY-MM-DD/`（**不要删**，保留审计）。
5. **重置元数据**（仅新环境或已确认无分叉时）：
   ```sql
   TRUNCATE TABLE SequelizeMeta;
   INSERT INTO SequelizeMeta (name) VALUES ('YYYYMMDDHHMMSS-baseline-v4.x-squashed.js');
   ```
6. **验证**：空库执行 `npx sequelize-cli db:migrate` 应只跑一条 baseline 且与应用 `models` 一致；再跑 `npm run health:check`。

## 本仓库当前状态

- 仍存在多条历史迁移与 `20260302200000-baseline-v4.0.0-squashed.js` 等文件；**未完成**「仅保留一条 + 全量归档」的机械执行，以避免在未备份情况下误操作生产/共享库。
- 执行 D1 前请务必更新本文档中的**迁移文件名**与 `SequelizeMeta` 插入值，与团队确认。

## 微信小程序

- 小程序为**独立仓库**；本后端仓不存放小程序源码，字段适配在小程序侧完成。
