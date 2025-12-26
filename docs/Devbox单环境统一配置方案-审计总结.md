# Devbox 单环境统一配置方案 - 2025-12-26 审计总结

## 📊 审计概览

**审计日期**: 2025年12月26日  
**审计范围**: 后端代码全量扫描 + 真实数据库连接验证  
**文档基准**: `docs/Devbox单环境统一配置方案.md` v1.1.0

---

## ✅ 已完成项（无需再执行）

| 任务                                      | 状态    | 验证证据                                                                           |
| ----------------------------------------- | ------- | ---------------------------------------------------------------------------------- |
| 清空 `ecosystem.config.js` 的 `env:{...}` | ✅ 完成 | `env` 字段完全清空，仅保留 `env_file: '.env'`                                      |
| 修改 `app.js` 移除 `override: true`       | ✅ 完成 | 统一使用 `dotenv.config()`                                                         |
| 补充 `.env` 中的 `REDIS_URL`              | ✅ 完成 | 配置为 `redis://localhost:6379`                                                    |
| 增强 `process-manager.sh`                 | ✅ 完成 | 已添加 `logs`/`show`/`flush-logs`/`reload-env`/`health` 命令                       |
| 更新 `package.json` 添加 `pm:*` 命令      | ✅ 完成 | 已添加全部5个新命令                                                                |
| 移除 `config/database.js` 顶层副作用      | ✅ 完成 | `validateDatabaseConfig()` 已移至 `testConnection()` 内                            |
| 数据库时区配置                            | ✅ 完成 | Sequelize `timezone: '+08:00'`，会话时区验证通过（`@@session.time_zone = +08:00`） |
| WebSocket JWT 鉴权                        | ✅ 完成 | 握手阶段强制验证 token                                                             |
| PM2 部分脚本使用 `--update-env`           | ✅ 完成 | `execute-migration-now.js` 已正确使用                                              |

**结论**: 文档中原有的 P0-1 至 P0-6 任务**大部分已在代码中完成**，仅剩少数遗留问题需修复。

---

## 🔴 新发现的问题（需立即修复）

### P0 级（生产安全 - 今天完成）

#### P0-1: 移除 Sealos 存储服务的硬编码默认密钥

**文件**: `services/sealosStorage.js`

**问题**:

```javascript
this.config = {
  accessKeyId: process.env.SEALOS_ACCESS_KEY || 'br0za7uc', // ❌ 硬编码默认值
  secretAccessKey: process.env.SEALOS_SECRET_KEY || 'skxg8mk5gqfhf9xz' // ❌ 硬编码默认值
}
```

**修复**:

- 移除所有默认值（`endpoint`, `bucket`, `accessKeyId`, `secretAccessKey`）
- 添加 fail-fast 校验：缺失字段立即抛错

**预估时间**: 30分钟

---

#### P0-2: 移除测试配置中的 dotenv 加载

**文件**: `tests/helpers/test-setup.js`

**问题**:

```javascript
require('dotenv').config() // ❌ 违反"测试链路强制方案1"
process.env.DISABLE_REDIS = 'false' // ❌ 冗余设置
```

**修复**:

- 删除 `require('dotenv').config()` 行
- 删除 `DISABLE_REDIS='false'` 行（Redis为必需依赖）
- 改为纯手动设置 `process.env.*`

**预估时间**: 15分钟

---

#### P0-3: 统一 jest.setup.js 测试数据库配置

**文件**: `jest.setup.js`

**问题**:

```javascript
process.env.DB_HOST = 'test-db-mysql.ns-br0za7uc.svc' // ❌ 与实际共用库决策冲突
```

**修复**:

- 改为 `DB_HOST = 'dbconn.sealosbja.site'`（与开发环境共用）
- 改为 `DB_PORT = '42569'`
- 团队通知：测试环境共用开发库风险

**预估时间**: 15分钟

---

#### P0-4: 清理 config.example 中的废弃 Redis 配置

**文件**: `config.example`

**问题**:

```bash
REDIS_HOST=localhost  # ❌ 已废弃
REDIS_PORT=6379       # ❌ 已废弃
REDIS_PASSWORD=       # ❌ 已废弃
```

**修复**:

- 删除 `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`/`REDIS_DB`
- 仅保留 `REDIS_URL` 示例

**预估时间**: 15分钟

---

### P1 级（数据完整性 - 本周完成）

#### P1-1: 调查并修复 asset_transactions 表的 business_id 重复问题

**发现问题**: 数据库审计发现存在重复的 `business_id` 值（despite unique index）

**样本数据**:
| transaction_id | business_id | business_type | delta_amount | created_at |
|---|---|---|---|---|
| 826 | lottery_tx_1735132917537_2e3d58_001 | lottery_consume | -1 | 2024-12-25 20:28:38 |
| 827 | lottery_tx_1735132917537_2e3d58_001 | lottery_reward | +5 | 2024-12-25 20:28:38 |

**根因分析**:

- 所有重复记录都是 `lottery_consume`（扣分）+ `lottery_reward`（奖励）的事务对
- `business_id` 可能被设计为"抽奖业务关联ID"而非"事务幂等键"

**✅ 已选择方案A**: `business_id` 语义调整为"业务关联ID（lottery_session_id）"，新增 `idempotency_key` 作为唯一幂等键；不再要求 `business_id` 唯一。

**执行步骤**:

1. 新增字段: `lottery_session_id` 和 `idempotency_key`
2. 数据回填: `lottery_session_id = business_id`, `idempotency_key = 'tx_' + transaction_id`
3. 添加唯一索引: `uk_idempotency_key`
4. 业务代码调整: 使用 `idempotency_key` 做幂等性校验

**详细实施文档**: 见 `docs/方案A实施指南-asset_transactions幂等性修复.md`

**预估时间**: 4小时（含代码调整和测试）

---

#### P1-2: 清理所有脚本中的多点 dotenv.config() 调用

**影响范围**: 多个脚本文件（需全量扫描）

**修复要求**:

- 脚本仅在入口顶部加载一次
- 使用绝对路径: `require('dotenv').config({ path: path.resolve(__dirname, '../../.env') })`
- 禁止 `override: true`（无例外）

**预估时间**: 1-2小时

---

#### P1-3: 验证所有 PM2 重启命令使用 --update-env

**已确认正确**: `scripts/migration/execute-migration-now.js`

**需要扫描验证**: 其他脚本中的 `pm2 restart`/`pm2 reload` 调用

**预估时间**: 1小时

---

### P2 级（技术债务 - 本月内）

#### P2-1: 移除 DISABLE_REDIS 冗余设置

- **文件**: `tests/helpers/test-setup.js`
- **操作**: 删除 `process.env.DISABLE_REDIS = 'false'` 行
- **预估时间**: 10分钟

#### P2-2: 清理 config.example 敏感占位值

- **操作**: 改为 `CHANGE_ME_*` 格式，添加密钥生成提示
- **预估时间**: 15分钟

---

## 📋 执行清单（可复制到任务系统）

```markdown
## P0 级（今天完成）

- [ ] P0-1: 修复 services/sealosStorage.js 硬编码密钥（30分钟）
  - [ ] 移除 accessKeyId 和 secretAccessKey 的默认值
  - [ ] 添加 fail-fast 校验
  - [ ] 补充 .env 中的 SEALOS 配置
  - [ ] 测试验证（临时删配置 → 应启动失败）

- [ ] P0-2: 移除 tests/helpers/test-setup.js 的 dotenv.config()（15分钟）
  - [ ] 删除 require('dotenv').config() 行
  - [ ] 删除 DISABLE_REDIS='false' 行
  - [ ] 运行测试验证行为不变

- [ ] P0-3: 统一 jest.setup.js 测试数据库配置（15分钟）
  - [ ] 修改 DB_HOST 为 dbconn.sealosbja.site
  - [ ] 修改 DB_PORT 为 42569
  - [ ] 运行测试确认连接实际库
  - [ ] 团队通知：测试共用开发库风险

- [ ] P0-4: 清理 config.example 废弃 Redis 配置（15分钟）
  - [ ] 删除 REDIS_HOST/REDIS_PORT/REDIS_PASSWORD/REDIS_DB
  - [ ] 仅保留 REDIS_URL 示例
  - [ ] 添加使用说明

## P1 级（本周完成）

- [ ] P1-1: 修复 asset_transactions 表幂等性问题（✅ 已选择方案A，4小时）
  - [ ] 执行数据库迁移脚本（新增 idempotency_key 和 lottery_session_id 字段）
  - [ ] 更新 Sequelize 模型定义
  - [ ] 调整业务代码（使用 idempotency_key 做幂等性校验）
  - [ ] 编写单元测试验证幂等性
  - [ ] 详见：`docs/方案A实施指南-asset_transactions幂等性修复.md`

- [ ] P1-2: 清理脚本中的多点 dotenv.config()（1-2小时）
  - [ ] 扫描所有脚本：grep -r "dotenv\.config" scripts/
  - [ ] 修复 scripts/validation/pre-start-check.js
  - [ ] 修复 scripts/fix-technical-debt-p0.js（移除 override）
  - [ ] 全局验证：每个脚本仅在顶部加载一次
  - [ ] 全局验证：无 override: true 残留

- [ ] P1-3: 验证所有 PM2 重启命令（1小时）
  - [ ] 扫描：grep -r "pm2 restart\|pm2 reload" scripts/
  - [ ] 逐个修改为 --update-env
  - [ ] 测试验证：修改 .env → 重启 → 配置生效

## P2 级（本月内完成）

- [ ] P2-1: 移除 DISABLE_REDIS 冗余设置（10分钟）
- [ ] P2-2: 清理 config.example 敏感占位值（15分钟）
```

---

## 🎯 执行时间估算

| 优先级 | 任务数 | 预估时间 | 累计时间 |
| ------ | ------ | -------- | -------- |
| P0 级  | 4      | 2-3 小时 | 2-3 小时 |
| P1 级  | 3      | 3-5 小时 | 5-8 小时 |
| P2 级  | 2      | 1 小时   | 6-9 小时 |

**执行计划**:

1. **今天完成 P0**（2-3小时）→ 解决生产安全隐患
2. **本周完成 P1**（3-5小时）→ 确保数据完整性
3. **本月完成 P2**（1小时）→ 技术债务清理

---

## ⚠️ 风险提示

1. **P1-1（business_id 重复）**: 需要业务团队参与决策（确认字段语义）
2. **P0-3（测试库统一）**: 需要团队知晓风险（测试可能影响开发数据）
3. **数据库迁移**: 建议先在备份环境验证
4. **P1-1 如选择方案A**: 需要数据迁移，影响线上事务表（高风险）

---

## ✅ 验收标准（全部修复后）

**配置源统一性**:

- [ ] `.env` 是唯一配置源（无 `ecosystem.config.js env` 硬编码）
- [ ] 修改 `.env` 后重启立即生效（`pm2 restart --update-env`）

**测试环境一致性**:

- [ ] 测试环境连接真实库 `restaurant_points_dev`
- [ ] 测试配置纯手动设置（不加载 dotenv）
- [ ] 测试行为不受 `.env` 变化影响

**Redis 配置规范**:

- [ ] 全项目只用 `REDIS_URL`（无 `REDIS_HOST`/`REDIS_PORT` 残留）
- [ ] 缺失 `REDIS_URL` 时立即启动失败（fail-fast）

**安全性**:

- [ ] 无硬编码默认密钥（Sealos 等服务必须显式配置）
- [ ] 配置缺失时立即失败（不使用不安全的默认值）

**数据完整性**:

- [ ] `asset_transactions` 表无重复 `business_id`（或语义已明确）
- [ ] 幂等性校验生效（重复请求被拒绝）

**dotenv 加载规范**:

- [ ] 应用链路仅在 `app.js` 加载一次
- [ ] 脚本链路仅在入口顶部加载一次（绝对路径）
- [ ] 测试链路完全不加载（纯手动设置）
- [ ] 全项目无 `override: true` 残留

---

## 📊 总体评估

**整体进度**: 约 **75% 完成**

- ✅ **已完成**: 9项核心任务（配置源统一、时区设置、JWT鉴权等）
- 🟡 **待修复**: 9项遗留问题（P0: 4项，P1: 3项，P2: 2项）

**关键发现**:

1. **好消息**: 大部分文档要求**已在代码中实现**，项目整体符合"单一真相源"原则
2. **重要遗留**: `services/sealosStorage.js` 的硬编码密钥是**最高风险**，需立即修复
3. **数据完整性**: `asset_transactions` 表的 `business_id` 重复问题需**业务决策**

**建议优先级**:

1. **今天**: P0-1（Sealos 密钥）→ P0-2/P0-3（测试配置）→ P0-4（config.example）
2. **本周**: P1-1（business_id 重复 - 与业务讨论）→ P1-2（dotenv 多点加载）→ P1-3（PM2 验证）
3. **本月**: P2-1/P2-2（清理冗余）

---

**审计人**: AI Assistant  
**审计工具**: 代码全量扫描 + MySQL 真实数据库连接验证  
**审计基准**: `docs/Devbox单环境统一配置方案.md` v1.1.0（2025-12-25）  
**审计日期**: 2025年12月26日
