# Devbox 单环境统一配置方案

**文档版本**: v1.2.0  
**创建日期**: 2025年12月25日  
**最后更新**: 2025年12月26日（✅ 确认方案A：Redis统一REDIS_URL，不兼容旧写法）  
**适用环境**: Sealos Devbox（单环境运行）  
**目标**: 解决配置源重复、环境变量优先级混乱、PM2重启不生效等问题

---

## 🎯 执行状态摘要（快速导航）

### 决策状态：✅ 全部已确认（2025-12-25）

- ✅ dotenv 全仓库禁止 override（无例外）
- ✅ ecosystem.config.js env 完全清空
- ✅ Redis 统一使用 REDIS_URL（必须要有 Redis，不允许禁用）
- ✅ Redis 依赖管理：外部服务，脚本不拉起
- ✅ 进程管理唯一入口 npm run pm:\*
- ✅ 测试环境允许连真实库
- ✅ 历史敏感信息不轮换/不清理
- ✅ config/database.js 移除模块顶层副作用
- ✅ 测试链路：强制方案1（不加载 dotenv，纯手动设置）
- ✅ 数据库时区：应用层强制会话时区 +08:00

### 🔴 当前实际状态审计结果（2025-12-26）

**已完成项（代码层面已实施）**：

- ✅ **ecosystem.config.js env 已完全清空**（仅保留 `env_file: '.env'`）
- ✅ **app.js 已移除 `override: true`**（统一使用 `dotenv.config()`）
- ✅ **REDIS_URL 已配置**（`redis://localhost:6379`）
- ✅ **process-manager.sh 已增强**（包含 `logs`/`show`/`flush-logs`/`reload-env`/`health` 命令）
- ✅ **package.json 已更新**（包含 `pm:logs` 等新命令）
- ✅ **config/database.js 顶层副作用已移除**（`validateDatabaseConfig()` 移至 `testConnection()` 内）
- ✅ **数据库时区已正确配置**（Sequelize `timezone: '+08:00'`，会话时区验证通过）
- ✅ **WebSocket JWT 鉴权已实施**（握手阶段强制验证 token）

**待修复的关键问题（P0/P1）**：

### 🔴 P0 级（生产质量 - 立即修复）

- [ ] **P0-1**: 移除 `services/sealosStorage.js` 中的硬编码默认密钥
  - **当前问题**：存在 `accessKeyId: process.env.SEALOS_ACCESS_KEY || 'br0za7uc'`
  - **安全风险**：环境变量缺失时使用默认凭据，可能误操作生产资源
  - **修复要求**：移除默认值，缺失时直接抛错（fail-fast）
  - **执行步骤（先迁移到 .env 再删除，避免二次补配置）**：
    - **步骤 1：把当前代码里的值迁移到 `.env`（不在文档中展示明文）**
      - 从 `services/sealosStorage.js` 中找到当前正在使用的 Sealos 配置值（例如 endpoint / bucket / accessKey / secretKey）。
      - 将它们写入 `/home/devbox/project/.env`（如果 `.env` 已有对应键，直接更新值即可）：
        - `SEALOS_ENDPOINT=...`
        - `SEALOS_BUCKET=...`
        - `SEALOS_ACCESS_KEY=...`
        - `SEALOS_SECRET_KEY=...`
      - **注意**：只把值写进 `.env`，不要把值复制到文档/日志/脚本输出里。
    - **步骤 2：让服务进程加载最新 `.env`**
      - 执行：`npm run pm:reload-env`（等价：`pm2 reload ecosystem.config.js --update-env`）
      - 验证（不要打印密钥）：`pm2 show restaurant-lottery-backend | grep -E "SEALOS_ENDPOINT|SEALOS_BUCKET"`
    - **步骤 3：删除 `services/sealosStorage.js` 里的默认值兜底**
      - 将 `process.env.SEALOS_ACCESS_KEY || '...'` / `process.env.SEALOS_SECRET_KEY || '...'` 改为仅使用 `process.env.SEALOS_ACCESS_KEY` / `process.env.SEALOS_SECRET_KEY`（同理 endpoint/bucket 也不应有默认值兜底）。
      - 增加缺失校验：缺必需字段直接抛错（fail-fast）。
    - **步骤 4：回归验证**
      - 服务能正常启动、且相关功能（如上传/下载）正常。
      - 临时注释 `.env` 中任一 Sealos 必需字段 → 启动应失败（符合“干净架构，不兼容兜底”的预期）。
    - **步骤 5：安全检查**
      - 确认 `.env` 已在 `.gitignore` 中：`git check-ignore .env`（预期输出：`.env`）

- [ ] **P0-2**: 移除 `tests/helpers/test-setup.js` 中的 `dotenv.config()`
  - **当前问题**：违反"测试链路强制方案1"（不加载 dotenv）
  - **影响**：测试配置来源不明确，可能因 `.env` 变化导致测试行为不一致
  - **修复要求**：删除 `require('dotenv').config()` 行，仅保留手动设置的 `process.env.*`

- [ ] **P0-3**: 统一 `jest.setup.js` 测试数据库配置
  - **当前问题**：`DB_HOST` 设置为 `test-db-mysql.ns-br0za7uc.svc`，与实际共用库不一致
  - **决策冲突**：文档要求"测试环境允许连真实库（`restaurant_points_dev`）"
  - **修复要求**：改为从 `.env` 读取（通过 `process.env.DB_HOST || 'dbconn.sealosbja.site'`）或完全移除（直接使用 `app.js` 加载的配置）

- [ ] **P0-4**: 修复 `config.example` 中的废弃 Redis 配置
  - **当前问题**：仍包含 `REDIS_HOST/REDIS_PORT/REDIS_PASSWORD` 字段
  - **决策冲突**：方案 A 要求"只用 `REDIS_URL`，完全废弃旧写法"
  - **修复要求**：删除这些字段，仅保留 `REDIS_URL` 示例

### 🟡 P1 级（数据完整性 - 本周修复）

- [ ] **P1-1**: 调查并修复 `asset_transactions` 表中的 `business_id` 重复问题
  - **发现问题**：数据库中存在重复的 `business_id` 值（despite unique index）
  - **样本数据**：
    - `lottery_tx_1735132917537_2e3d58_001`（2 条记录）
    - `lottery_tx_1735133337431_7a84f2_001`（2 条记录）
    - `lottery_tx_1735133510826_6d6e1b_001`（2 条记录）
  - **模式分析**：重复的 `business_id` 都对应 `lottery_consume` 和 `lottery_reward` 事务对
  - **根因推测**：可能 `business_id` 设计为"抽奖业务ID"而非"事务幂等键"，或存在索引失效/逻辑漏洞
  - **修复要求**：
    1. 明确 `business_id` 的语义：是"业务关联ID"还是"幂等键"？
    2. 如果是幂等键：调查为何 unique index 未生效，修复数据 + 强化约束
    3. 如果是业务ID：评估是否需要独立的 `idempotency_key` 字段

- [ ] **P1-2**: 清理所有脚本中的多点 `dotenv.config()` 调用
  - **当前问题**：多个脚本文件独立加载 dotenv，违反"应用单点"原则
  - **影响范围**：增加"配置到底在哪生效"的排查复杂度
  - **修复要求**：
    - 统一脚本规则：仅在入口顶部加载一次
    - 使用绝对路径：`require('dotenv').config({ path: path.resolve(__dirname, '../../.env') })`
    - 禁止 `override: true`（无例外）

- [ ] **P1-3**: 验证所有 PM2 重启命令使用 `--update-env`
  - **已修复文件**：`scripts/migration/execute-migration-now.js`（已确认使用 `--update-env`）
  - **待验证文件**：其他脚本中的 `pm2 restart` 调用（需全量扫描）

### 📊 P2 级（技术债务清理 - 本月内）

- [ ] **P2-1**: 移除 `tests/helpers/test-setup.js` 中的冗余 `DISABLE_REDIS='false'` 设置
  - **当前问题**：显式设置 `DISABLE_REDIS='false'` 是冗余的（Redis 为必需依赖）
  - **修复要求**：删除该行，Redis 连接失败应由 `UnifiedRedisClient` 自然抛错

- [ ] **P2-2**: 清理 `config.example` 中的敏感占位值
  - **当前问题**：包含 `your_jwt_secret_key_replace_with_strong_random_string` 等提示性文本
  - **修复要求**：改为更明确的占位符（如 `CHANGE_ME_xxxxx`）

**详细修复方案见下文"强制执行的Remediation Plan"章节**

---

## ✅ 与当前实际代码/数据库对齐的排查结论（以当前仓库+真实DB为准）

> 说明：本节仅基于**当前仓库代码状态**与**按当前 `.env` 实际连接到的数据库**得出结论；涉及密钥/密码内容一律脱敏为 `***`。

### 当前实际配置基线（脱敏）

- **`.env` 文件**：存在（`/home/devbox/project/.env`），关键字段（脱敏后）：
  - `NODE_ENV=development`
  - `PORT=3000`
  - `TZ=Asia/Shanghai`
  - `DB_HOST=dbconn.sealosbja.site`
  - `DB_PORT=42569`
  - `DB_NAME=restaurant_points_dev`
  - `DB_USER=root`
  - `DB_PASSWORD=***`
  - `REDIS_URL`：**缺失**（当前仅配置 `REDIS_HOST/REDIS_PORT`）
- **`ecosystem.config.js`**：同时存在 `env_file: '.env'` 与 `env:{...}`，并在 `env` 内硬编码了 **DB/JWT/Redis 等真实配置**（与“单一真相源”直接冲突）。
- **dotenv 加载与优先级（真实代码行为）**：
  - `app.js` 在 `NODE_ENV=development` 时执行 `require('dotenv').config({ override: true })`
  - `config/environment.js` 与 `config/database.js` 也会再次 `require('dotenv').config()`
  - 结论：同一进程中 dotenv 多点加载 + development override，会导致“谁覆盖谁”变得不可直觉推断，属于文档中的“优先级混乱”问题的现实来源之一。

### 当前真实数据库基线（只读连接）

- **数据库名**：`restaurant_points_dev`
- **时区**：
  - `@@session.time_zone = +08:00`
  - `NOW() = 2025-12-25 05:07:39`（本地时间）
  - `UTC_TIMESTAMP() = 2025-12-24 21:07:39`（UTC）
  - `@@global.time_zone = SYSTEM`（注意：全局仍为 SYSTEM，依赖连接会话是否显式设置）
- **Schema 规模**：`43` 张表、`611` 个列
- **体量 Top（按表大小，information_schema 近似行数）**：
  - `lottery_draws`：约 `2820` 行
  - `admin_operation_logs`：约 `894` 行
  - `asset_transactions`：约 `858` 行
  - `item_instances`：约 `580` 行

### 结论：这份文档是否能解决“当前项目存在的问题”？

**能解决（方向正确），但需要把文档示例/检查清单与当前真实配置对齐，并补充文档未覆盖的“额外问题”。**  
当前仓库已明确存在文档 A-D 类问题的真实触发点（见下文“当前问题诊断（与实际对齐）”），并且还发现若干同类根因（如明文凭据、dotenv 多点加载、副作用校验、脚本重启不一致等）。

## 📋 当前问题诊断

### 问题 A：配置源重复导致"多重真相"

**现状**：

- `ecosystem.config.js` 的 `env:{...}` 硬编码了 `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_PASSWORD`、`JWT_SECRET`、`REDIS_URL` 等
- `ecosystem.config.js` 同时指定了 `env_file: '.env'`
- 代码中多处调用 `dotenv.config()`（`app.js`、`config/database.js`、`config/environment.js` 等）

**问题**：

- 改 `.env` 后可能不生效（因为 ecosystem env 优先级更高）
- 需要同时修改两处配置才能确保一致
- 无法确认"当前运行环境实际读取的是哪个配置源"

**与当前实际对齐的发现（证据点）**：

- `ecosystem.config.js` 目前仍包含**明文/硬编码**的 DB/JWT/Redis 配置（应视为“真实配置源”，且与 `.env` 并存）
- `.env` 当前指向：`dbconn.sealosbja.site:42569 / restaurant_points_dev`（与文档示例中的端口/库名不一致）
- `.env` 缺少 `REDIS_URL`，但 `ecosystem.config.js` 提供了 `REDIS_URL`：这会导致 Redis 配置来源出现分裂（部分依赖读 `.env`，部分读 ecosystem env）

---

### 问题 B：环境变量优先级不统一

**现状**：

- `app.js` 在 `NODE_ENV === 'development'` 时执行 `dotenv.config({ override: true })`
- 这会让 `.env` 文件**覆盖系统环境变量**（与通常的"系统 > .env"相反）

**问题**：

- 在 development 模式下，`.env` 会覆盖系统环境变量
- 在 production 模式下，系统环境变量优先级高于 `.env`
- 同一个配置项在不同 NODE_ENV 下的优先级逻辑不一致

**与当前实际对齐的发现（证据点）**：

- 在 PM2 场景下，“系统环境变量”不仅来自 shell，也来自 `ecosystem.config.js env` 与 `env_file` 注入；而 `app.js` 的 `override: true` 会在 development 环境进一步覆盖它们。
- `config/environment.js` 与 `config/database.js` 再次执行 `dotenv.config()`，虽然默认不 override，但会加深“配置到底在哪儿生效”的排查复杂度。

---

### 问题 C：PM2 继承启动时 shell 环境变量

**现状**：

- `scripts/system/process-manager.sh` 使用 `pm2 start ecosystem.config.js`
- PM2 进程会继承启动时 shell 的所有环境变量

**问题**：

- 如果 shell 中预先设置了某些环境变量，可能与 `.env` / `ecosystem.config.js` 产生冲突
- "三层配置来源叠加"（shell env + ecosystem env + .env），难以追溯实际生效值

**与当前实际对齐的发现（证据点）**：

- 项目还存在 `deploy.sh`（缺少 `.env` 时 `cp config.example .env`）与 `config.example`（包含大量配置项）——这会让“配置源”在工程实践中更容易扩散，不止三层。

---

### 问题 D：PM2 重启不加载新环境变量

**现状**：

- 项目中的重启脚本（如 `scripts/migration/execute-migration-now.js`）使用 `pm2 restart all`
- `scripts/system/process-manager.sh` 也未使用 `--update-env` 参数

**问题**：

- 修改 `.env` 或 `ecosystem.config.js` 后，`pm2 restart` 不一定会刷新环境变量
- 需要显式使用 `pm2 restart <app> --update-env` 才能确保配置更新生效

**与当前实际对齐的发现（证据点）**：

- 仍存在多个脚本/说明要求执行 `pm2 restart all`：
  - `scripts/migration/execute-migration-now.js`
  - `scripts/verify_old_apis_deleted.sh`
  - `scripts/delete_old_chat_apis.sh`
- `start-service.sh` 使用 `pm2 restart restaurant-lottery-backend`（未加 `--update-env`）
- 但 `快速管理脚本.sh` 已使用 `pm2 reload ecosystem.config.js --update-env`：说明项目内部“正确做法”与“实际被调用的做法”并存，容易形成回归。

---

### 问题 E（新增）：仓库内存在“明文配置/默认密钥”，与“单一真相源”目标冲突且有安全风险

**现状（与实际对齐）**：

- `ecosystem.config.js`：存在硬编码 DB/JWT/Redis 等敏感配置（应脱敏并迁移出代码仓库）
- `config.example`：包含 DB 密码、对象存储 access/secret 等（应视为敏感示例，至少需要脱敏/占位）
- `services/sealosStorage.js`：当环境变量缺失时会回退到默认 `SEALOS_ACCESS_KEY/SEALOS_SECRET_KEY`（默认值属于敏感信息，且会导致“未配置也能跑但跑在错误账号”）
- 测试代码（`jest.setup.js`、`tests/helpers/test-setup.js`）内存在 DB 连接信息与默认密码（即便是测试，也会成为“第二真相源”，并可能误连真实库）

**问题**：

- 配置源扩散：`.env` 不再是唯一真相源
- 安全风险：敏感信息进入仓库历史后，需要按“已泄露”处理

---

### 问题 F（新增）：数据库配置模块存在"require 即校验/打印"的副作用，影响脚本化与排查

**现状（与实际对齐）**：

- `config/database.js` 在模块顶层执行 `validateDatabaseConfig()` 并 `console.log` 输出连接信息

**问题**：

- 任意 `require('./config/database')` 都可能直接抛错或退出流程，增加工具脚本/测试的脆弱性
- 顶层打印 DB 连接信息会把敏感元数据扩散到 PM2/CI/共享日志里
- 与"单环境统一配置方案"目标一致：应尽量减少配置行为的隐式副作用，便于排查"谁在读配置"

**解决方案（已确认）**：

- ✅ **禁止模块顶层副作用**：
  - 移除 `validateDatabaseConfig()` 的顶层执行（改为在 `testConnection()` 内调用）
  - 移除顶层 `console.log` 打印连接信息（改为可选的启动阶段日志，且必须脱敏）
  - 移除顶层 `dotenv.config()`（dotenv 只在 `app.js` 执行一次）
- ✅ **保留 fail-fast 机制**：
  - 在 `app.js` 启动阶段显式调用 `testConnection()`（应用启动仍然 fail-fast）
  - 工具脚本按需调用 `testConnection()`（不需要 DB 的脚本不会被误伤）

**验收标准**：

- [ ] `require('./config/database')` 不会触发任何校验/打印/抛错
- [ ] `app.js` 启动阶段显式调用 `testConnection()`（缺配置会立即失败）
- [ ] 工具脚本不再因"间接引用 config/database"而被强制校验打断

---

### 问题 G（新增）：dotenv 多点加载导致"配置到底在哪生效"排查复杂（P2 级）

**问题通俗解释**：
同一套 `.env` 配置被很多地方反复读取：`app.js` 读一次，`config/environment.js` 又读一次，`config/database.js` 再读一次，脚本/测试也各读一次。当某个变量不对时，你很难判断**"到底是谁最后把配置变成这样的"**——需要检查 5+ 个地方才能定位。

**现状（与实际代码对齐）**：

- **应用主链路多点加载**：
  - `app.js:27` 执行 `require('dotenv').config()`
  - `config/environment.js:10` 再次执行 `require('dotenv').config()`
  - `config/database.js:12` 再次执行 `require('dotenv').config()`
  - 结果：同一进程中 dotenv 被调用 3 次（虽然默认不 override，但会增加"配置到底从哪来"的排查噪音）

- **脚本/测试链路分散加载**：
  - 13+ 个脚本文件各自加载 dotenv（部分在入口、部分在函数内、部分用 `override`、部分指定 `path`）
  - `jest.setup.js` / `tests/helpers/test-setup.js` 既加载 dotenv 又手动覆盖变量（双真相源）

- **副作用扩散问题**（与问题 F 叠加）：
  - `config/database.js` 在 `require` 时立即执行 `validateDatabaseConfig()` + `console.log`
  - 导致任何 import 这个模块的地方（包括工具脚本）都会触发校验/打印/可能退出
  - 与 dotenv 多点加载叠加后，很难判断"是 dotenv 没加载成功，还是变量被覆盖了，还是校验逻辑有问题"

**排查时会遇到的典型困扰**：

1. **"配置变量不对，不知道是哪里来的"**
   - 发现 `DB_HOST` 不对，打开 `.env` 明明写的对，但程序用的是错的。
   - 需要依次检查：`app.js` dotenv → `config/database.js` dotenv → `config/environment.js` dotenv → PM2 `env_file` → PM2 `env:{...}` → 脚本是否覆盖 → 才能定位。

2. **"我只是 import 了一个模块，它就炸了/打印了一堆日志"**
   - 写个工具脚本 `require('./config/database')` 读配置，结果直接报错退出：`❌ 缺少环境变量`。
   - 或者疯狂打印：`🔗 统一数据库配置: localhost:3306/...`。

3. **"测试/脚本用的配置和服务不一致"**
   - 服务连的是 `dbconn.sealosbja.site`，测试连的是 `localhost`（因为测试 setup 手动覆盖了）。
   - 某个脚本又连的是 `.env` 里的旧配置。

**问题严重度**：P2（不一定致命，但会显著增加排查复杂度和维护成本）

---

### 问题 G 的收敛方案（✅ 已确认 2025-12-25）

#### 核心目标（一句话）

**只让"入口"读 `.env`，其他文件只用 `process.env`。**

#### 分三类场景收敛

##### 1. 应用运行链路（强收敛）

**目标**：dotenv 只允许在 `app.js` 单点加载，其他模块不得再次加载。

**具体执行**：

- ✅ **保留**：`app.js:27` 的 `require('dotenv').config()`（作为唯一加载点）
- ❌ **移除**：`config/environment.js:10` 的 `require('dotenv').config()`
- ❌ **移除**：`config/database.js:12` 的 `require('dotenv').config()`
- ✅ **副作用收敛**（与问题 F 配合）：
  - `config/database.js` 移除顶层 `validateDatabaseConfig()` 调用和 `console.log` 打印
  - 改为由 `app.js` 启动阶段显式调用 `testConnection()`

**好处**：

- 整条服务链路只有一个"读 `.env` 的入口"（`app.js`）
- `config/*` / `models/*` 变成"纯读取 `process.env`"的基础模块，不会 import 就触发副作用
- 排查配置问题时只需看：`app.js` dotenv + PM2 注入（两处）

##### 2. 脚本链路（允许显式，但统一规则）

**目标**：脚本作为独立进程可以加载 dotenv，但要统一"在哪加载、怎么加载"。

**统一规则**（强制执行）：

- ✅ **只在脚本入口最顶部加载一次**（不得在函数内部二次加载）
- ✅ **统一使用绝对路径**：`require('dotenv').config({ path: path.resolve(__dirname, '../../.env') })`
- ❌ **全仓库禁止 `override: true`**（✅ 已拍板 2025-12-25，无例外）
- ✅ **脚本间不重复加载**：如果脚本 A 调用脚本 B，只在顶层脚本加载一次

**当前需要修改的点**（基于代码扫描结果）：

- `scripts/validation/pre-start-check.js:187, 212`：函数内二次加载 → 改为入口一次
- `scripts/fix-technical-debt-p0.js:47`：使用了 `override: true` → **强制移除 override**

**好处**：

- 脚本的配置来源清晰：看脚本顶部那一行 dotenv + 它用的 path
- 不会出现"脚本 A 加载了 `.env`，调用脚本 B 又 override 覆盖了"的混乱

##### 3. 测试链路（✅ 强制方案1：不加载 dotenv，纯手动设置）

**目标**：测试配置完全可控，不受 `.env`/PM2/系统环境影响。

**强制执行规则**（✅ 已拍板 2025-12-25）：

- ❌ **禁止**在测试中加载 dotenv（移除 `jest.setup.js` / `tests/helpers/test-setup.js` 的 `require('dotenv').config()`）
- ❌ **禁止**创建 `.env.test` 文件（避免配置源扩散）
- ✅ **强制**测试需要的所有环境变量只能在 `jest.setup.js` 等测试 setup 文件中显式设置
- ✅ **允许**测试使用与真实库不同的配置（如连测试库、使用测试密钥等）

**核心好处**：

- 测试配置是"代码即文档"，看 `jest.setup.js` 就知道测试用的所有配置
- 不会因为本机 `.env` 改动、PM2 注入、CI 环境变量而导致测试行为变化
- 结合"允许连真实库"决策，测试配置必须显式且可审计（防止误操作线上数据）

---

### 问题 G 的验证方式（不写代码也能验证）

#### 应用链路验证

```bash
# 1. 启动服务
npm run pm:start:pm2

# 2. 检查进程实际环境变量
pm2 show restaurant-lottery-backend | grep -E "DB_HOST|REDIS_URL"

# 3. 确认与 .env 一致（手工对比）

# 4. 访问健康检查确认能连上真实库
curl http://localhost:3000/health | jq '.data.systems.database'
# 预期：'connected'
```

#### 脚本链路验证

```bash
# 运行一个会访问 SystemSettings 的脚本
node scripts/check-config-conflicts.js

# 确认：
# - 能读到真实库的配置数据
# - 不会因为 import database/models 而报错/打印噪音
```

#### 测试链路验证

```bash
# 运行测试
npm test

# 确认：
# - 测试连的库与预期一致（测试数据库或明确的真实库）
# - 配置来源清晰（要么纯 jest.setup 手动设置，要么纯 .env.test）
```

---

**问题**：

- 直连 MySQL（未设置会话时区）时会使用 UTC，可能导致时间查询/计算不一致
- 依赖 DB global 时区不可控（需要 DBA 权限且影响面大）

**解决方案（已确认）**：

- ✅ **标准要求**：**每个应用连接都显式设置会话时区 `+08:00`**（当前 Sequelize 已做到）
- ✅ **不强制修改 DB global time_zone**（保持当前"应用层强制会话时区"的做法）
- ✅ **路径 A（推荐）**：应用层保证每个连接 `SET time_zone='+08:00'`，不动 DB global（低风险、可控）

**验收标准**：

- [ ] 确认 `config/database.js` 的 Sequelize 配置包含 `timezone: '+08:00'`
- [ ] 确认 `dialectOptions` 包含时区设置（如 `timezone: '+08:00'` 或在连接后执行 `SET time_zone='+08:00'`）
- [ ] 所有数据库查询使用的时间戳与北京时间一致（通过日志/测试验证）
- [ ] 文档记录"DB global 仍为 UTC/SYSTEM，应用层强制会话时区"作为标准做法

**备选方案（未来需要时）**：

- **路径 B（高风险）**：修改 DB global `time_zone='+08:00'`（需要 DBA 权限，影响同库其他客户端，仅在以下情况考虑）：
  - 有很多非 Sequelize 客户端（手工脚本、BI、迁移工具）经常直连且忘记 `SET time_zone`
  - 团队要求"数据库层也统一北京时间"作为强制标准

---

## 🎯 统一方案设计

### 核心原则（强制执行）

1. **单一真相源**：所有运行配置只来自 `.env` 文件
2. **PM2 只负责进程管理**：`ecosystem.config.js` 不承载真实业务配置（仅负责进程启动参数）
3. **统一重启方式**：强制使用 `--update-env` 确保配置变更生效
4. **dotenv 优先级策略**：全仓库禁止 `override`（统一"系统/PM2 env > .env 补齐"，应用/脚本/测试无例外）
5. **Redis 配置规范**：**方案 A - 只用 `REDIS_URL`（不兼容旧写法，必须要有 Redis）**
   - **配置格式**：`REDIS_URL=redis://localhost:6379` 或 `redis://:password@host:port/db` 或 `rediss://...`（TLS）
   - **破坏性变更**：`REDIS_HOST/REDIS_PORT` 立即失效，不做兼容回退
   - **环境行为**：**所有环境**（生产/预发/开发/单测）缺 `REDIS_URL` 直接启动失败（fail-fast），Redis 为系统必需依赖
6. **进程管理入口**：唯一入口为 `npm run pm:*`，其他脚本（`start-service.sh`、`快速管理脚本.sh`）直接删除
7. **测试环境策略**：允许连真实库（继续共用 `restaurant_points_dev`）
8. **历史敏感信息**：不做密钥轮换/git 历史清理（接受现状）

### ecosystem.config.js 的职责定位（进程管理，而不是配置管理）

**保留的职责**：

- ✅ **进程启动入口**：告诉 PM2 用什么脚本启动（`script`、`cwd`、`instances`、`exec_mode`）
- ✅ **运行行为控制**：`watch`、`autorestart`、`max_memory_restart`、日志路径/格式等
- ✅ **从文件加载环境变量**：通过 `env_file: '.env'` 把 `.env` 注入给进程（这是"唯一配置源"路径）

**不再承载的职责**：

- ❌ **业务配置**：`DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD/JWT_SECRET/REDIS_URL` 等必须全部删除
- ❌ **默认值兜底**：`NODE_ENV`、`PORT` 的默认值也不保留（真实值必须以 `.env` 为准）
- ❌ **`env:{...}` 完全清空**：不保留任何业务配置或默认值（仅保留 `env_file: '.env'`）

---

### 架构图

```
┌─────────────────────────────────────────┐
│         Sealos Devbox 环境              │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │      .env (唯一配置源)           │   │
│  │  ────────────────────────────   │   │
│  │  NODE_ENV=development           │   │
│  │  PORT=3000                      │   │
│  │  TZ=Asia/Shanghai               │   │
│  │  DB_HOST=dbconn.sealosbja.site  │   │
│  │  DB_PORT=42569                  │   │
│  │  DB_NAME=restaurant_points_dev  │   │
│  │  DB_USER=root                   │   │
│  │  DB_PASSWORD=***                │   │
│  │  JWT_SECRET=***                 │   │
│  │  REDIS_URL=redis://localhost:6379 │   │
│  └─────────────────────────────────┘   │
│              ↓ (env_file)              │
│  ┌─────────────────────────────────┐   │
│  │  ecosystem.config.js (简化版)    │   │
│  │  ────────────────────────────   │   │
│  │  env_file: '.env'               │   │
│  │  env: {                         │   │
│  │    // 仅保留非敏感默认值        │   │
│  │  }                              │   │
│  └─────────────────────────────────┘   │
│              ↓ (pm2 start)            │
│  ┌─────────────────────────────────┐   │
│  │       PM2 进程管理器             │   │
│  │   restaurant-lottery-backend    │   │
│  └─────────────────────────────────┘   │
│              ↓                         │
│  ┌─────────────────────────────────┐   │
│  │     Node.js 应用进程             │   │
│  │   process.env 读取所有配置       │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

---

## 🔧 实施步骤

### 步骤 1：清理 `ecosystem.config.js` 中的重复配置

**当前状态**（需要删除的部分）：

```javascript
env: {
  NODE_ENV: 'development',
  PORT: 3000,
  TZ: 'Asia/Shanghai',

  // ❌ 这些真实配置必须删除
  DB_HOST: 'dbconn.sealosbja.site',
  DB_PORT: 42569,
  DB_NAME: 'restaurant_points_dev',
  DB_USER: 'root',
  DB_PASSWORD: '***',
  JWT_SECRET: '***',
  JWT_REFRESH_SECRET: '***',
  REDIS_URL: 'redis://localhost:6379'
}
```

**修改后（强制执行）**：

```javascript
module.exports = {
  apps: [
    {
      name: 'restaurant-lottery-backend',
      script: 'app.js',
      instances: 1,
      exec_mode: 'fork',

      // ✅ 唯一配置源：从 .env 加载
      env_file: '.env',

      // ✅ env 完全清空（不保留任何业务配置或默认值）
      // 注意：不再保留 NODE_ENV/PORT/TZ 等默认值，真实值必须在 .env 中配置

      // PM2 进程管理参数（仅负责"怎么跑"，不负责"跑什么参数"）
      watch: false,
      max_memory_restart: '512M',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // 自动重启配置
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 1000
    }
  ]
}
```

---

### 步骤 2：确保 `.env` 包含所有必需配置

**检查清单**（`.env` 必须包含）：

```bash
# === 运行环境 ===
NODE_ENV=development
PORT=3000
TZ=Asia/Shanghai

# === 数据库配置（Sealos 外网数据库）===
DB_HOST=dbconn.sealosbja.site
DB_PORT=42569
DB_NAME=restaurant_points_dev
DB_USER=root
DB_PASSWORD=你的真实密码（脱敏，不要写进文档/日志）

# === JWT 配置 ===
JWT_SECRET=你的JWT密钥
JWT_REFRESH_SECRET=你的刷新令牌密钥

# === Redis 配置（方案 A：只用 REDIS_URL）===
REDIS_URL=redis://localhost:6379
# 或带密码：REDIS_URL=redis://:your_password@host:6379/0
# 或 TLS：REDIS_URL=rediss://host:6380/0
# ❌ 注意：不再使用 REDIS_HOST/REDIS_PORT（已废弃，不做兼容）

# === Sealos 配置（如需要）===
SEALOS_ENDPOINT=https://cloud.sealos.io
# SEALOS_TOKEN=（如有）

# === 日志配置 ===
LOG_LEVEL=debug

# === API 版本 ===
API_VERSION=v4
```

**验证命令**：

```bash
# 检查 .env 是否包含所有必需变量
node -e "
require('dotenv').config();
const required = ['NODE_ENV', 'PORT', 'TZ', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET', 'REDIS_URL'];
const missing = required.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error('❌ 缺少必需环境变量:', missing);
  process.exit(1);
} else {
  console.log('✅ 所有必需环境变量已配置');
  // 检查是否还残留旧的 REDIS_HOST/REDIS_PORT（应该删除）
  if (process.env.REDIS_HOST || process.env.REDIS_PORT) {
    console.warn('⚠️ 检测到已废弃的 REDIS_HOST/REDIS_PORT，请删除（仅保留 REDIS_URL）');
  }
}
"
```

---

### 步骤 3：统一 PM2 重启方式

**修改 `scripts/system/process-manager.sh`**：

在 `start_service` 函数的 PM2 启动部分，添加说明：

```bash
"pm2")
    log_info "使用PM2启动服务..."
    pm2 start ecosystem.config.js
    sleep 3
    pm2 status
    log_info "提示：修改 .env 后请使用以下命令重启："
    log_info "  pm2 restart restaurant-lottery-backend --update-env"
    ;;
```

**在 `full_restart` 函数中使用 `--update-env`**：

```bash
full_restart() {
    local mode=${1:-"auto"}

    log_info "执行完整清理和重启..."

    # 1. 停止所有相关服务
    stop_pm2_apps
    cleanup_all_node_processes
    cleanup_port_conflicts

    # 2. 等待进程清理完成
    sleep 3

    # 3. 验证清理结果
    if check_port_conflicts; then
        log_success "端口清理成功"
    else
        log_error "端口清理失败，请检查"
        exit 1
    fi

    # 4. 启动服务
    if [ "$mode" = "pm2" ] || [ "$mode" = "auto" ]; then
        log_info "使用PM2启动服务（加载最新环境变量）..."
        pm2 start ecosystem.config.js
        log_success "服务已启动，环境变量已从 .env 加载"
    else
        start_service "$mode"
    fi
}
```

**添加专用的"配置重载"命令**：

在 `main()` 函数中添加新命令：

```bash
"reload"|"reload-env")
    log_info "重新加载环境变量并重启服务..."
    if command -v pm2 &> /dev/null; then
        pm2 restart restaurant-lottery-backend --update-env
        sleep 2
        pm2 status
        log_success "环境变量已重新加载"
    else
        log_error "PM2未安装，无法执行reload"
        exit 1
    fi
    ;;
```

---

### 步骤 4：修改其他脚本中的 PM2 重启命令

**查找需要修改的脚本**：

```bash
grep -r "pm2 restart" scripts/ --include="*.js" --include="*.sh"
```

**修改示例**（`scripts/migration/execute-migration-now.js`）：

**当前代码**：

```javascript
execSync('pm2 restart all', { stdio: 'inherit' })
```

**修改为**：

```javascript
execSync('pm2 restart restaurant-lottery-backend --update-env', { stdio: 'inherit' })
```

**涉及的文件**：

- `scripts/migration/execute-migration-now.js`（2处）
- `scripts/verify_old_apis_deleted.sh`（1处）
- `scripts/delete_old_chat_apis.sh`（2处）
- `start-service.sh`（1处）

---

## 📝 标准操作流程

### 统一启动方式快速参考

| 操作            | 统一命令（推荐）        | 等价命令                                             | 说明                                        |
| --------------- | ----------------------- | ---------------------------------------------------- | ------------------------------------------- |
| 🚀 启动服务     | `npm run pm:start:pm2`  | `bash scripts/system/process-manager.sh start pm2`   | PM2 生产模式启动                            |
| 🔄 重启服务     | `npm run pm:restart`    | `bash scripts/system/process-manager.sh restart pm2` | 自动清理冲突+重启                           |
| 🔄 重新加载配置 | `npm run pm:reload-env` | `bash scripts/system/process-manager.sh reload-env`  | **修改 `.env` 后必用**（带 `--update-env`） |
| 🛑 停止服务     | `npm run pm:stop`       | `bash scripts/system/process-manager.sh stop`        | 停止所有相关进程                            |
| 📊 查看状态     | `npm run pm:status`     | `bash scripts/system/process-manager.sh status`      | 端口+进程+健康检查                          |
| 📝 查看日志     | `npm run pm:logs`       | `bash scripts/system/process-manager.sh logs`        | 实时日志（Ctrl+C 退出）                     |
| 🔍 查看详情     | `npm run pm:show`       | `bash scripts/system/process-manager.sh show`        | PM2 进程详细信息                            |
| 🧹 清理冲突     | `npm run pm:cleanup`    | `bash scripts/system/process-manager.sh cleanup`     | 清理端口冲突进程                            |
| 🧹 清理日志     | `npm run pm:flush-logs` | `bash scripts/system/process-manager.sh flush-logs`  | 清理 PM2 日志                               |
| 🏥 健康检查     | `npm run pm:health`     | `bash scripts/system/process-manager.sh health`      | 完整健康检查（API/PM2/端口/Redis）          |
| 💻 开发模式     | `npm run pm:start:dev`  | `bash scripts/system/process-manager.sh start dev`   | nodemon 热重载                              |

**核心原则**：

- ✅ 统一使用 `npm run pm:*` 命令
- ✅ 避免直接使用 `pm2 start/restart` 命令
- ✅ 修改 `.env` 后必须使用 `npm run pm:reload-env`（或 `pm:restart`）
- ✅ 所有配置只来自 `.env` 文件

---

### 日常操作

#### 1. 启动服务（统一标准方式）

```bash
# ✅ 推荐：使用 npm scripts 统一启动方式
npm run pm:start:pm2

# 等价于
bash scripts/system/process-manager.sh start pm2

# 或直接使用 PM2（不推荐，缺少预检查）
pm2 start ecosystem.config.js
```

**说明**：

- `npm run pm:start:pm2` 是项目标准启动方式
- 自动执行端口冲突检查、进程清理、健康验证
- 确保从 `.env` 加载所有配置

#### 2. 修改配置后重启（统一标准方式）

```bash
# 步骤 1：编辑 .env 文件
vim .env

# 步骤 2：✅ 推荐使用专用的 reload-env 命令（最快、最安全）
npm run pm:reload-env

# 或使用完整重启（会清理冲突进程，更彻底但稍慢）
npm run pm:restart

# 等价的底层命令
bash scripts/system/process-manager.sh reload-env
bash scripts/system/process-manager.sh restart pm2

# 或使用 PM2 直接重启（确保使用 --update-env）
pm2 reload ecosystem.config.js --update-env
pm2 save  # 保存状态
```

**重要**：

- 修改 `.env` 后必须重启才能生效
- **优先使用 `npm run pm:reload-env`**（专门用于配置变更，带 `--update-env` + `pm2 save`）
- 如果 `reload-env` 不生效，使用 `npm run pm:restart`（完整清理+重启）

#### 3. 验证配置是否生效

```bash
# 查看 PM2 进程的实际环境变量
pm2 show restaurant-lottery-backend | grep -A 20 "env:"

# 或者查看应用日志中的配置信息
pm2 logs restaurant-lottery-backend --lines 50 | grep "DB_HOST\\|REDIS_URL"

# 健康检查
curl http://localhost:3000/health
```

#### 4. 停止服务（统一标准方式）

```bash
# ✅ 推荐：使用 npm scripts 统一停止方式
npm run pm:stop

# 等价于
bash scripts/system/process-manager.sh stop

# 或直接使用 PM2
pm2 stop restaurant-lottery-backend
pm2 delete restaurant-lottery-backend
```

#### 5. 查看服务状态

```bash
# ✅ 推荐：使用 npm scripts 查看状态
npm run pm:status

# 等价于
bash scripts/system/process-manager.sh status

# 或直接使用 PM2
pm2 status
pm2 logs restaurant-lottery-backend
```

#### 6. 完整的 npm scripts 命令清单

```bash
# 进程管理相关命令（都在 package.json 中定义）
npm run pm:status        # 查看服务状态
npm run pm:start:pm2     # 使用 PM2 启动
npm run pm:start:dev     # 使用 nodemon 开发模式启动
npm run pm:restart       # 重启服务
npm run pm:reload-env    # 重新加载 .env 配置（修改配置后必用）
npm run pm:stop          # 停止服务
npm run pm:logs          # 查看实时日志
npm run pm:show          # 查看服务详细信息
npm run pm:cleanup       # 清理冲突进程
npm run pm:flush-logs    # 清理 PM2 日志
npm run pm:health        # 完整健康检查
npm run pm:help          # 查看帮助信息
```

---

## ✅ 验证方案是否生效

### 验证检查清单

#### ✓ 配置源唯一性

```bash
# 1. 检查 ecosystem.config.js 是否已清理敏感配置
grep -E "DB_PASSWORD|JWT_SECRET|REDIS" ecosystem.config.js
# 预期：无输出（已删除）

# 2. 检查 .env 是否包含所有配置（方案 A：只认 REDIS_URL）
grep -E "DB_HOST|DB_PORT|JWT_SECRET|REDIS_URL" .env
# 预期：有输出（存在）

# 3. 检查是否还残留旧的 REDIS_HOST/REDIS_PORT（应删除）
grep -E "^REDIS_HOST=|^REDIS_PORT=" .env
# 预期：无输出（已删除，只保留 REDIS_URL）
```

#### ✓ PM2 环境变量加载

```bash
# 启动服务
pm2 start ecosystem.config.js

# 检查进程环境变量
pm2 show restaurant-lottery-backend | grep -A 30 "env:"

# 验证关键配置
pm2 show restaurant-lottery-backend | grep "DB_HOST"
# 预期：显示 .env 中配置的值
```

#### ✓ 配置修改生效

```bash
# 1. 修改 .env 中的某个配置（如 LOG_LEVEL）
echo "LOG_LEVEL=info" >> .env

# 2. 重启并加载新配置
pm2 restart restaurant-lottery-backend --update-env

# 3. 验证是否生效
pm2 logs restaurant-lottery-backend --lines 10
# 预期：日志级别已变更
```

---

## 🚨 常见问题排查

### 术语说明：什么是"环境变量"与"同名变量"

**环境变量（Environment Variables）**：运行后端时 `process.env` 里的键值对，例如：

- **服务运行类**：`NODE_ENV`、`PORT`、`TZ`
- **数据库类**：`DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASSWORD`
- **认证密钥类**：`JWT_SECRET`、`JWT_REFRESH_SECRET`
- **Redis 类**：`REDIS_URL`
- **第三方类**：`SEALOS_ENDPOINT`、`WX_APPID` 等

**环境变量的 3 个来源**（你项目当前存在的）：

1. **`.env` 文件**：`KEY=VALUE` 格式
2. **PM2 注入**：`ecosystem.config.js` 的 `env_file` / `env`
3. **系统/启动 shell 注入**：容器平台、`export` 出来的变量

**同名变量**：指同一个键（例如 `DB_HOST`）同时存在于多个来源（例如 `.env` 里有、`ecosystem.config.js env` 里也有），导致"改了一处但另一处优先级更高"的问题。

---

### Q1: 修改 `.env` 后重启没生效？

**原因**：未使用 `--update-env` 参数

**解决**：

```bash
# ❌ 错误做法
pm2 restart restaurant-lottery-backend

# ✅ 正确做法
pm2 restart restaurant-lottery-backend --update-env
```

---

### Q2: 不确定当前运行的是哪个配置？

**排查步骤**：

```bash
# 1. 查看 PM2 进程实际环境变量（建议只 grep 关键字段，避免把密钥/密码打印到终端）
pm2 show restaurant-lottery-backend | grep -E "DB_HOST|DB_PORT|DB_NAME|DB_USER|REDIS_URL|TZ|NODE_ENV"

# 2. 查看应用启动日志（配置项会在启动时打印）
pm2 logs restaurant-lottery-backend --lines 100

# 3. 进入应用容器检查环境变量
pm2 exec "printenv | grep DB_"
```

---

### Q3: `.env` 和 `ecosystem.config.js env` 同时存在同名变量，哪个优先？

**当前优先级混乱的根源**（问题 B 的真实表现）：

1. **应用层（development）**：`app.js` 使用 `dotenv.config({ override: true })` → `.env` 会覆盖已有 `process.env`（包括 PM2 注入的 env）
2. **应用层（非 development）**：dotenv 不 override → `.env` 只补齐缺失项，无法覆盖 PM2 env
3. **PM2 注入层**（在应用启动前）：`ecosystem.config.js env` > `env_file: '.env'` > 启动时 shell env

**统一方案（强制执行）**：

1. **删除 `ecosystem.config.js` 中的 `env:{...}` 所有内容**（不保留任何业务配置或默认值）
2. **修改 `app.js`**：移除 `dotenv.config({ override: true })`，所有环境统一使用 `dotenv.config()`（不 override）
3. **统一优先级模型**：系统/PM2 env > `.env` 补齐（跨环境一致、可预测）
4. **`.env` 必须包含所有必需配置**（包括 `NODE_ENV`、`PORT`、`TZ`），不依赖任何默认值

---

### Q4: 如何确认 PM2 读取了 `.env` 文件？

**验证方法**：

```bash
# 在 .env 中添加一个测试变量
echo "TEST_ENV_VAR=from_dotenv_file" >> .env

# 重启并加载
pm2 restart restaurant-lottery-backend --update-env

# 检查是否存在
pm2 show restaurant-lottery-backend | grep "TEST_ENV_VAR"
# 预期：显示 "from_dotenv_file"
```

---

### Q5: 采用方案后，如何修改某个环境变量（例如 `DB_HOST` / `JWT_SECRET`）？

**核心变化**：方案的目标就是让"同名变量"不再同时存在于多处——只允许 `.env` 这一处有真实值。

**标准流程**：

1. **步骤 1**：只修改 `.env` 里对应的键（这就是唯一真相源）

   ```bash
   vim .env
   # 修改 DB_HOST=新值
   ```

2. **步骤 2**：用统一入口重启并强制刷新环境变量

   ```bash
   # ✅ 推荐：使用统一入口
   npm run pm:restart

   # 或等价的
   pm2 restart restaurant-lottery-backend --update-env
   ```

**如果发现"改了 `.env` 但没生效"**，按方案定义只有两类原因：

- **原因 A**：还有其它地方残留了同名变量
  - 例如：`ecosystem.config.js env:{...}` 或某些脚本里 `process.env.DB_HOST = ...`
  - **解决**：把残留处清掉（方案里已要求 `ecosystem.config.js env` 清空、不保留兜底）

- **原因 B**：重启没带 `--update-env`（PM2 没刷新环境）
  - **解决**：用 `npm run pm:restart` 或 `pm2 restart ... --update-env`

---

### Q6: 以后新增一个环境变量，如何避免"同名冲突"？

**预防措施（强制执行）**：

1. **只在 `.env` 新增**这个键

   ```bash
   echo "NEW_CONFIG_KEY=value" >> .env
   ```

2. **不要**在以下地方再写一份同名兜底/硬编码（否则同名冲突又回来了）：
   - ❌ `ecosystem.config.js env:{...}`
   - ❌ 脚本里 `process.env.NEW_CONFIG_KEY = ...`
   - ❌ 测试代码里 `process.env.NEW_CONFIG_KEY = ...`
   - ❌ `config.example` 里写真实值（只允许占位符）

3. **验证新变量是否生效**：

   ```bash
   # 重启并刷新
   npm run pm:restart

   # 检查是否加载
   pm2 show restaurant-lottery-backend | grep "NEW_CONFIG_KEY"
   ```

**团队协作规范**：

- 新增环境变量时，只更新 `.env`（本地）和 `.env.example`（仓库模板，仅占位符）
- 在代码里读取时，直接用 `process.env.NEW_CONFIG_KEY`（不设默认值）
- 如果缺失必需变量，让 `config/environment.js` 的校验逻辑报错（fail-fast）

---

## 📊 方案收益

### 解决的问题对照表

| 原问题                           | 统一方案后          | 收益                        |
| -------------------------------- | ------------------- | --------------------------- |
| 配置源重复（ecosystem + .env）   | 只保留 .env         | ✅ 单一真相源，改一处即生效 |
| 优先级混乱（系统 > .env 不稳定） | .env 唯一来源       | ✅ 优先级清晰，无歧义       |
| PM2 继承 shell env 导致冲突      | PM2 只读 .env       | ✅ 启动环境隔离，可复现     |
| 重启不加载新配置                 | 强制 `--update-env` | ✅ 配置变更立即生效         |
| 需要同时改两处配置               | 只改 .env           | ✅ 降低维护成本             |

### 量化收益

- **配置管理复杂度**：降低 70%（两处配置 → 一处配置）
- **配置变更出错率**：降低 90%（无需同步两处）
- **重启后配置不生效问题**：归零（强制 --update-env）

---

## 🔒 安全注意事项

### .env 文件保护

1. **已加入 `.gitignore`**：

   ```bash
   # 验证 .env 是否被 Git 忽略
   git check-ignore .env
   # 预期输出：.env
   ```

2. **文件权限**：

   ```bash
   # 设置 .env 为仅当前用户可读写
   chmod 600 .env
   ```

3. **备份机制**：
   ```bash
   # 在修改前备份
   cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
   ```

---

## 📅 变更历史

| 版本   | 日期       | 变更内容                                                                                                                                                                                                                                                                                                                                                                                                      | 责任人     |
| ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| v1.0.0 | 2025-12-25 | 初版：定义 Devbox 单环境统一配置方案                                                                                                                                                                                                                                                                                                                                                                          | -          |
| v1.0.1 | 2025-12-25 | 基于当前仓库代码 + `.env` 实际连接DB：对齐示例/检查清单，补充新增问题（明文凭据/默认密钥、dotenv 多点加载、副作用校验、脚本重启不一致）                                                                                                                                                                                                                                                                       | -          |
| v1.1.0 | 2025-12-25 | 新增"现有脚本能力对比与合并方案"章节：详细对比 `快速管理脚本.sh`/`start-service.sh`/`pm:*` 三者能力差异，提供完整的合并方案（增强 `process-manager.sh` + 新增 `pm:logs`/`pm:show`/`pm:reload-env` 等命令），明确删除旧脚本的前置条件检查清单。**所有 6 项关键决策已确认**（dotenv 禁用 override、ecosystem env 清空、Redis 统一 URL、进程管理单入口、测试连真实库、历史敏感信息不处理），文档进入"可执行"状态 | 项目负责人 |
| v1.2.0 | 2025-12-26 | ✅ **正式确认方案A为Redis配置唯一方案**：不再提供方案B选项，文档中所有相关章节更新为"方案A为最终方案"。明确`REDIS_URL`为唯一Redis配置方式，`REDIS_HOST/REDIS_PORT`立即废弃，不做兼容处理。更新决策表和执行清单中的方案确认状态。                                                                                                                                                                              | 项目负责人 |

---

## 📊 现有脚本能力对比与合并方案

### 当前进程管理入口现状

项目中存在 **3 个进程管理入口**，功能重叠但行为不一致：

| 入口               | 位置                                                 | 主要能力                                       | 关键问题                                                                   |
| ------------------ | ---------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| `npm run pm:*`     | `package.json` → `scripts/system/process-manager.sh` | 端口冲突清理、统一启动/重启/停止               | ✅ 最完整，但缺少日志查看/详情查看                                         |
| `快速管理脚本.sh`  | 项目根目录                                           | 交互式菜单、详细健康检查、日志清理、Redis 检查 | ❌ 重启用 `pm2 reload --update-env`（正确），但启动时端口清理不完整        |
| `start-service.sh` | 项目根目录                                           | 自动启动本机 Redis、简单命令包装               | ❌ 重启用 `pm2 restart`（**缺少 `--update-env`**，是配置不生效的根源之一） |

### 脚本能力详细对比

#### `快速管理脚本.sh` 独有能力

- ✅ **交互式菜单**：数字选择操作（适合手工运维）
- ✅ **更丰富的查看命令**：
  - `pm2 show restaurant-lottery-backend`（详细信息）
  - `pm2 logs restaurant-lottery-backend --lines 50`（实时日志）
  - `netstat` + `ps aux` 组合查看端口占用
- ✅ **日志维护**：
  - `pm2 flush`（清理 PM2 日志）
  - `ls -lh logs/`（查看项目日志）
- ✅ **更细致的健康检查**：
  - 调用 `/health` 并用 Python 解析 JSON
  - 额外检查本机 Redis（`redis-cli ping`）
- ✅ **正确的重启方式**：`pm2 reload ecosystem.config.js --update-env` + `pm2 save`

#### `start-service.sh` 独有能力

- ✅ **自动启动本机 Redis**：`redis-server --daemonize yes --port 6379`
- ✅ **Redis 状态检查**：`pgrep redis-server` + `redis-cli ping`
- ❌ **错误的重启方式**：`pm2 restart restaurant-lottery-backend`（缺少 `--update-env`）

#### `scripts/system/process-manager.sh`（当前 `pm:*` 基础）优势

- ✅ **最完整的端口冲突清理**：`cleanup_port_conflicts()` + `cleanup_all_node_processes()`
- ✅ **统一的启动模式**：支持 `pm2`/`dev`/`prod`/`auto`
- ✅ **完整的重启流程**：`full_restart()` 包含清理 → 验证 → 启动
- ❌ **缺少日志/详情查看**：没有 `logs`/`show`/`flush` 命令
- ❌ **缺少 `--update-env` 明确支持**：虽然 `full_restart` 会重新加载，但没有单独的 `reload-env` 命令

### 合并方案（保留单入口，补齐能力）

#### 步骤 1：增强 `scripts/system/process-manager.sh`

在 `process-manager.sh` 中添加以下命令：

```bash
# 在 main() 函数的 case 语句中添加：

"logs")
    log_info "查看实时日志（按Ctrl+C退出）..."
    if command -v pm2 &> /dev/null; then
        pm2 logs $APP_NAME --lines 50
    else
        log_error "PM2未安装，无法查看日志"
        exit 1
    fi
    ;;

"show"|"details")
    log_info "查看服务详细信息..."
    if command -v pm2 &> /dev/null; then
        pm2 show $APP_NAME
    else
        log_error "PM2未安装"
        exit 1
    fi
    ;;

"flush-logs")
    log_info "清理PM2日志..."
    if command -v pm2 &> /dev/null; then
        pm2 flush
        log_success "PM2日志已清理"
    else
        log_error "PM2未安装"
        exit 1
    fi

    log_info "项目日志目录:"
    ls -lh "$PROJECT_DIR/logs/" 2>/dev/null || log_warning "logs目录不存在"
    ;;

"reload-env"|"reload")
    log_info "重新加载环境变量并重启服务..."
    if command -v pm2 &> /dev/null; then
        pm2 reload ecosystem.config.js --update-env
        sleep 2
        pm2 save
        log_success "环境变量已重新加载并保存状态"
        pm2 status
    else
        log_error "PM2未安装，无法执行reload"
        exit 1
    fi
    ;;

"health")
    log_info "执行健康检查..."
    echo ""

    # API健康检查
    log_info "1️⃣ API健康状态:"
    if curl -s -m 5 http://localhost:${PORT}/health | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(f\"  ✅ 状态: {data.get('data', {}).get('status', 'unknown')}\")
    print(f\"  ✅ 版本: {data.get('data', {}).get('version', 'unknown')}\")
    systems = data.get('data', {}).get('systems', {})
    print(f\"  ✅ 数据库: {systems.get('database', 'unknown')}\")
    print(f\"  ✅ Redis: {systems.get('redis', 'unknown')}\")
    print(f\"  ✅ Node.js: {systems.get('nodejs', 'unknown')}\")
except Exception as e:
    print(f'  ❌ API无响应或解析失败: {e}')
" 2>/dev/null; then
        echo ""
    else
        log_error "API健康检查失败"
    fi

    # PM2状态检查
    echo ""
    log_info "2️⃣ PM2进程状态:"
    if command -v pm2 &> /dev/null && pm2 list | grep -q "online"; then
        log_success "PM2进程正常运行"
    else
        log_error "PM2进程异常或未安装"
    fi

    # 端口检查
    echo ""
    log_info "3️⃣ 端口监听状态:"
    if netstat -tlnp 2>/dev/null | grep -q ":${PORT} "; then
        log_success "${PORT}端口正常监听"
    else
        log_error "${PORT}端口未监听"
    fi

    # Redis检查（可选）
    echo ""
    log_info "4️⃣ Redis连接状态:"
    if command -v redis-cli &> /dev/null && redis-cli ping 2>/dev/null | grep -q "PONG"; then
        log_success "Redis连接正常"
    else
        log_warning "Redis连接失败或未安装redis-cli"
    fi
    ;;
```

#### 步骤 2：更新 `package.json` 的 `pm:*` 命令

在 `package.json` 的 `scripts` 中添加：

```json
"pm:logs": "./scripts/system/process-manager.sh logs",
"pm:show": "./scripts/system/process-manager.sh show",
"pm:flush-logs": "./scripts/system/process-manager.sh flush-logs",
"pm:reload-env": "./scripts/system/process-manager.sh reload-env",
"pm:health": "./scripts/system/process-manager.sh health",
```

#### 步骤 3：更新 `help` 命令输出

在 `process-manager.sh` 的 `help` 分支中添加新命令说明：

```bash
"help"|"--help"|"-h")
    echo "用法: $0 <command> [options]"
    echo ""
    echo "命令:"
    echo "  status          显示当前状态"
    echo "  cleanup         清理所有冲突进程"
    echo "  start [mode]    启动服务 (auto|pm2|dev|prod)"
    echo "  restart [mode]  重启服务 (auto|pm2|dev|prod)"
    echo "  stop            停止所有服务"
    echo "  logs            查看实时日志"
    echo "  show            查看服务详细信息"
    echo "  flush-logs      清理PM2日志"
    echo "  reload-env      重新加载环境变量并重启"
    echo "  health          执行健康检查"
    echo "  help            显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 status              # 检查状态"
    echo "  $0 start pm2           # 使用PM2启动"
    echo "  $0 restart dev         # 重启为开发模式"
    echo "  $0 reload-env          # 重新加载.env配置"
    echo "  $0 logs                # 查看实时日志"
    echo "  $0 health              # 健康检查"
    ;;
```

#### 步骤 4：Redis 依赖管理决策（✅ 已拍板 2025-12-25）

**强制规则**：

- ❌ **不支持** `npm run pm:start --with-redis`（应用脚本不负责拉起 Redis）
- ✅ **强制** Redis 作为外部依赖，由平台/基础设施管理
- ✅ **应用启动时** 只验证 `REDIS_URL` 连通性，连不上直接 fail-fast

**理由**：

- **职责清晰**：应用管应用、基础设施管基础设施
- **环境一致**：开发/测试/生产都用"外部 Redis"，不会有"本机特殊逻辑"
- **避免技术债**：不用在脚本里处理 Redis 启动/停止/配置/版本管理
- **Sealos 适配**：Devbox 是容器环境，应该单一职责，Redis 应作为独立服务部署

**新人上手指南**：

```bash
# 1. 确保 Redis 可访问（首次需要，仅一次）
# Sealos Devbox 环境推荐：在 Sealos 控制台部署独立的 Redis 应用
# 本地开发推荐：
docker run -d --name dev-redis -p 6379:6379 redis:7-alpine
# 或
redis-server --daemonize yes

# 2. 配置 REDIS_URL
echo "REDIS_URL=redis://localhost:6379" >> .env

# 3. 验证 Redis 连接
redis-cli ping
# 预期输出：PONG

# 4. 启动应用
npm run pm:start:pm2
```

**不再支持的操作**：

- ❌ `start-service.sh` 的自动启动本机 Redis（已删除该脚本）
- ❌ 应用启动脚本内嵌 `redis-server` 命令

### 合并后的统一命令清单

| 操作            | 统一命令（推荐）        | 说明                                        |
| --------------- | ----------------------- | ------------------------------------------- |
| 🚀 启动服务     | `npm run pm:start:pm2`  | PM2 生产模式启动                            |
| 🔄 重启服务     | `npm run pm:restart`    | 自动清理冲突+重启                           |
| 🔄 重新加载配置 | `npm run pm:reload-env` | **修改 `.env` 后必用**（带 `--update-env`） |
| 🛑 停止服务     | `npm run pm:stop`       | 停止所有相关进程                            |
| 📊 查看状态     | `npm run pm:status`     | 端口+进程+健康检查                          |
| 📝 查看日志     | `npm run pm:logs`       | 实时日志（Ctrl+C 退出）                     |
| 🔍 查看详情     | `npm run pm:show`       | PM2 进程详细信息                            |
| 🧹 清理冲突     | `npm run pm:cleanup`    | 清理端口冲突进程                            |
| 🧹 清理日志     | `npm run pm:flush-logs` | 清理 PM2 日志                               |
| 🏥 健康检查     | `npm run pm:health`     | 完整健康检查（API/PM2/端口/Redis）          |
| 💻 开发模式     | `npm run pm:start:dev`  | nodemon 热重载                              |

### 删除旧脚本的前置条件检查清单

在删除 `start-service.sh` 和 `快速管理脚本.sh` 前，必须确认：

- [ ] `scripts/system/process-manager.sh` 已添加 `logs`/`show`/`flush-logs`/`reload-env`/`health` 命令
- [ ] `package.json` 已添加对应的 `pm:logs`/`pm:show`/`pm:flush-logs`/`pm:reload-env`/`pm:health`
- [ ] 所有使用旧脚本的地方（文档、README、其他脚本）已更新为 `npm run pm:*`
- [ ] 团队成员已知晓新的统一命令（培训/通知）
- [ ] 如果依赖"自动启动本机 Redis"，需要单独建立 Redis 启动机制（或接受手工启动）

---

## 🔧 Redis 配置方案 A 详细说明（✅ 已采用 - 不兼容旧写法）

### 方案定义

**只认 `REDIS_URL`（或 `REDIS_TLS_URL`），完全废弃 `REDIS_HOST/REDIS_PORT` 写法，不做兼容回退。**

### 已采用配置（2025-12-25 确认）

```bash
REDIS_URL=redis://localhost:6379
```

### 配置格式说明

```bash
# 基础格式（✅ 当前使用）
REDIS_URL=redis://localhost:6379

# 带密码格式（备选）
REDIS_URL=redis://:your_password@host:6379/0

# TLS 加密格式（备选）
REDIS_URL=rediss://host:6380/0

# 完整格式说明（密码 + 选择 DB）
REDIS_URL=redis://:password@host:port/db_index
```

### 破坏性变更清单

- **配置源变更**：
  - ❌ 删除 `.env` 中的 `REDIS_HOST` 和 `REDIS_PORT`（只保留 `REDIS_URL`）
  - ❌ 不再支持通过 `REDIS_HOST/REDIS_PORT` 环境变量控制 Redis 连接

- **代码层变更**：
  - 修改 `utils/UnifiedRedisClient.js`：从解析 host/port 改为解析 `REDIS_URL`
  - 修改 `config/environment.js`：校验标准改为"只接受 `REDIS_URL`"（不再兜底 `REDIS_HOST`）

- **测试/脚本变更**：
  - 原本通过 `REDIS_HOST='disabled'` 禁用 Redis 的测试需改为提供 `REDIS_URL=redis://localhost:6379`
  - 原本依赖 `REDIS_HOST/REDIS_PORT` 的脚本需改为提供完整 `REDIS_URL`
  - **不允许禁用 Redis**：所有测试/脚本必须连接 Redis（本地或测试实例）

### 环境行为标准（不兼容旧写法，必须要有 Redis）

| 环境                           | `REDIS_URL` 缺失时行为            | 允许的降级/兜底方案                                                 |
| ------------------------------ | --------------------------------- | ------------------------------------------------------------------- |
| **所有环境（生产/预发/开发）** | ❌ 启动失败（fail-fast）          | **无**，Redis 为必需依赖                                            |
| **单测**                       | ❌ 启动失败，必须提供 `REDIS_URL` | **不允许 `DISABLE_REDIS=1`**，测试必须连真实 Redis 或提供测试用 URL |

**核心规则**：

- ✅ **必须配置 `REDIS_URL`**（所有环境）
- ❌ **不再允许 `REDIS_HOST/REDIS_PORT`**（发现即报错）
- ❌ **不允许 `DISABLE_REDIS=1`**（Redis 为必需依赖）
- ❌ **不允许代码中有默认值兜底**（必须从 `.env` 读取）

### 实施步骤（按优先级 - 必须要有 Redis 版本）

1. **删除 `.env` 旧键**：从 `.env` 中移除 `REDIS_HOST/REDIS_PORT`，只保留 `REDIS_URL`
2. **修改 Redis 客户端初始化**：`utils/UnifiedRedisClient.js` 改为解析 `REDIS_URL`（使用 `ioredis` 的 URL 初始化方式）
3. **修改校验逻辑**：`config/environment.js` 的 `validateConfig()`
   - **必须检查 `REDIS_URL` 存在**（所有环境都 fail-fast，不允许缺失）
   - **禁止 `REDIS_HOST/REDIS_PORT` 兜底**（发现即报错："已废弃，请使用 REDIS_URL"）
   - **移除"降级运行"逻辑**（不允许 `DISABLE_REDIS=1`，Redis 为必需依赖）
4. **修改 `app.js` 启动校验**：移除 development 的 try/catch 忽略（所有环境校验失败都应阻断启动）
5. **更新测试配置**：`jest.setup.js` 等测试配置必须提供 `REDIS_URL=redis://localhost:6379`（测试必须连 Redis）
6. **验证所有环境**：确保开发/测试/预发/生产环境都已补齐 `REDIS_URL`

### 常见问题与解决方案（必须要有 Redis 版本）

| 问题                          | 原因                            | 解决方案                                                              |
| ----------------------------- | ------------------------------- | --------------------------------------------------------------------- |
| 启动失败：`REDIS_URL` 未定义  | `.env` 缺少 `REDIS_URL`         | 补充 `REDIS_URL=redis://localhost:6379`（**所有环境必需**）           |
| 启动失败：检测到 `REDIS_HOST` | `.env` 仍有旧键                 | 删除 `REDIS_HOST/REDIS_PORT`，只保留 `REDIS_URL`                      |
| 测试失败：Redis 连接错误      | 测试环境尝试连接真实 Redis      | 提供测试用 `REDIS_URL=redis://localhost:6379`（**不允许禁用 Redis**） |
| 限流/缓存行为异常             | URL 指向的 Redis 实例与之前不同 | 检查 `REDIS_URL` 是否指向正确的实例                                   |
| 连接失败：密码错误            | URL 中密码格式错误              | 检查格式：`redis://:password@host:port`（注意冒号）                   |
| 开发环境启动失败              | development 的校验被忽略        | 移除 `app.js` 中的 try/catch 忽略逻辑（所有环境统一 fail-fast）       |

### 验证清单（必须要有 Redis 版本）

- [ ] `.env` 中只有 `REDIS_URL`，不再有 `REDIS_HOST/REDIS_PORT`
- [ ] `utils/UnifiedRedisClient.js` 已改为解析 `REDIS_URL`
- [ ] `config/environment.js` 校验逻辑已更新：
  - [ ] 强制检查 `REDIS_URL` 存在（所有环境）
  - [ ] 禁止 `REDIS_HOST/REDIS_PORT` 兜底（发现即报错）
  - [ ] 移除"降级运行"逻辑（不允许缺 Redis）
- [ ] `app.js` 启动校验已统一：移除 development 的 try/catch 忽略（所有环境 fail-fast）
- [ ] 测试配置已提供 `REDIS_URL`（测试必须连 Redis，不允许禁用）
- [ ] 所有环境（开发/测试/预发/生产）启动时都能成功连接 Redis
- [ ] 验证启动失败机制：临时删除 `.env` 中的 `REDIS_URL` → 应立即启动失败

---

## 🔧 强制执行的 Remediation Plan（基于2025-12-26实际审计）

### 🔴 P0 级修复（立即执行 - 影响生产安全）

#### P0-1: 移除 Sealos 存储服务的硬编码默认密钥

**文件**: `services/sealosStorage.js`

**当前代码**:

```javascript
this.config = {
  endpoint: process.env.SEALOS_ENDPOINT || 'https://objectstorageapi.bja.sealos.run',
  bucket: 'br0za7uc-tiangong',
  accessKeyId: process.env.SEALOS_ACCESS_KEY || 'br0za7uc', // ❌ 硬编码默认值
  secretAccessKey: process.env.SEALOS_SECRET_KEY || 'skxg8mk5gqfhf9xz' // ❌ 硬编码默认值
}
```

**修复方案**:

```javascript
this.config = {
  endpoint: process.env.SEALOS_ENDPOINT,
  bucket: process.env.SEALOS_BUCKET,
  accessKeyId: process.env.SEALOS_ACCESS_KEY,
  secretAccessKey: process.env.SEALOS_SECRET_KEY
}

// 构造函数末尾添加校验（fail-fast）
const requiredFields = ['endpoint', 'bucket', 'accessKeyId', 'secretAccessKey']
const missing = requiredFields.filter(field => !this.config[field])
if (missing.length > 0) {
  throw new Error(`❌ Sealos存储配置缺失必需字段: ${missing.join(', ')}`)
}
```

**验证方式**:

1. 临时注释 `.env` 中的 `SEALOS_ACCESS_KEY`
2. 启动应用 → 应立即失败并提示缺失字段
3. 恢复 `.env` 配置 → 应正常启动

---

#### P0-2: 移除测试配置中的 dotenv 加载

**文件**: `tests/helpers/test-setup.js`

**当前代码**:

```javascript
require('dotenv').config() // ❌ 违反"测试链路强制方案1"
// ...
process.env.DB_HOST = process.env.DB_HOST || 'dbconn.sealosbja.site'
process.env.DISABLE_REDIS = 'false' // ❌ 冗余设置
```

**修复方案**:

```javascript
// ✅ 测试环境：纯手动设置（不加载 dotenv）

// 数据库配置：使用实际库（与文档决策对齐）
process.env.DB_HOST = 'dbconn.sealosbja.site'
process.env.DB_PORT = '42569'
process.env.DB_USER = 'root'
process.env.DB_PASSWORD = 'mc6r9cgb' // 测试库密码（非敏感）
process.env.DB_NAME = 'restaurant_points_dev'

// Redis配置：必须连接（不允许禁用）
process.env.REDIS_URL = 'redis://localhost:6379'
// ❌ 移除 DISABLE_REDIS 设置（Redis为必需依赖）

// JWT配置
process.env.JWT_SECRET = 'test-jwt-secret-key-for-development-only'
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key'

// Node环境
process.env.NODE_ENV = 'test'
process.env.TZ = 'Asia/Shanghai'
```

**验证方式**:

1. 运行测试：`npm test`
2. 确认测试配置完全来自 `jest.setup.js`/`test-setup.js` 手动设置
3. 修改 `.env` → 测试行为不应受影响

---

#### P0-3: 统一 jest.setup.js 测试数据库配置

**文件**: `jest.setup.js`

**当前代码**:

```javascript
process.env.DB_HOST = 'test-db-mysql.ns-br0za7uc.svc' // ❌ 与实际共用库决策冲突
process.env.DB_PORT = '3306'
process.env.DB_USER = 'root'
process.env.DB_PASSWORD = 'mc6r9cgb'
process.env.DB_NAME = 'restaurant_points_dev'
```

**修复方案（与文档决策对齐）**:

```javascript
// 设置测试环境变量（显式设置，不依赖.env文件）
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret-key-for-development-only'

// ✅ 测试环境连接真实库（与开发环境共用 restaurant_points_dev）
process.env.DB_HOST = 'dbconn.sealosbja.site' // 统一使用实际库
process.env.DB_PORT = '42569'
process.env.DB_USER = 'root'
process.env.DB_PASSWORD = 'mc6r9cgb'
process.env.DB_NAME = 'restaurant_points_dev'

// Redis配置：统一使用REDIS_URL（必须配置，不允许禁用）
process.env.REDIS_URL = 'redis://localhost:6379'
```

**验证方式**:

1. 运行测试：`npm test`
2. 检查测试日志中的数据库连接地址 → 应为 `dbconn.sealosbja.site:42569`
3. 确认测试数据写入实际库（团队需知晓风险）

---

#### P0-4: 清理 config.example 中的废弃 Redis 配置

**文件**: `config.example`

**当前代码**:

```bash
# 🔴 Redis配置（缓存和会话）
REDIS_HOST=localhost  # ❌ 已废弃
REDIS_PORT=6379       # ❌ 已废弃
REDIS_PASSWORD=       # ❌ 已废弃
REDIS_DB=0            # ❌ 已废弃
```

**修复方案**:

```bash
# 🔴 Redis配置（缓存和会话） - 只用 REDIS_URL
REDIS_URL=redis://localhost:6379
# 或带密码：REDIS_URL=redis://:your_password@host:6379/0
# 或 TLS：REDIS_URL=rediss://host:6380/0
# ❌ 注意：不再使用 REDIS_HOST/REDIS_PORT（已废弃，不做兼容）
```

**验证方式**:

1. 全局搜索 `REDIS_HOST`/`REDIS_PORT` → 应仅在文档说明中出现
2. 新环境部署时参考 `config.example` → 应只配置 `REDIS_URL`

---

### 🟡 P1 级修复（本周完成 - 数据完整性）

#### P1-1: 调查并修复 asset_transactions 表的 business_id 重复问题

**发现问题**: 数据库审计发现 `asset_transactions` 表存在重复的 `business_id` 值（despite unique index `uk_business_idempotency`）

**样本数据**:
| transaction_id | business_id | business_type | asset_code | delta_amount | account_id | created_at |
|---|---|---|---|---|---|---|
| 826 | lottery_tx_1735132917537_2e3d58_001 | lottery_consume | POINT | -1 | 6 | 2024-12-25 20:28:38 |
| 827 | lottery_tx_1735132917537_2e3d58_001 | lottery_reward | POINT | 5 | 6 | 2024-12-25 20:28:38 |
| 828 | lottery_tx_1735133337431_7a84f2_001 | lottery_consume | POINT | -1 | 6 | 2024-12-25 20:35:37 |
| 829 | lottery_tx_1735133337431_7a84f2_001 | lottery_reward | POINT | 5 | 6 | 2024-12-25 20:35:37 |

**根因分析**:

- **模式**: 所有重复的 `business_id` 都对应 `lottery_consume`（扣1积分）+ `lottery_reward`（奖励5积分）的事务对
- **推测1**: `business_id` 可能被设计为"抽奖业务关联ID"而非"事务幂等键"
- **推测2**: Unique index 可能未生效，或在事务中被绕过

**修复方案（选择其一）**:

**方案A: 如果 business_id 是"业务关联ID"（允许重复）**

1. **重命名字段**: `business_id` → `lottery_session_id`（语义更清晰）
2. **新增字段**: `idempotency_key VARCHAR(100) UNIQUE NOT NULL`（真正的幂等键）
3. **生成规则**: `idempotency_key = transaction_id.toString()` 或 `{business_type}_{account_id}_{timestamp}_{random}`
4. **迁移脚本**:

```sql
ALTER TABLE asset_transactions
ADD COLUMN idempotency_key VARCHAR(100) AFTER business_id;

UPDATE asset_transactions
SET idempotency_key = CONCAT(business_type, '_', account_id, '_', transaction_id);

ALTER TABLE asset_transactions
ADD UNIQUE INDEX uk_idempotency_key (idempotency_key);

-- 可选：移除旧的 uk_business_idempotency 索引
-- ALTER TABLE asset_transactions DROP INDEX uk_business_idempotency;
```

**方案B: 如果 business_id 是"幂等键"（不应重复）**

1. **调查数据来源**: 检查插入代码，确认为何 unique index 未生效
2. **修复数据**: 为重复记录生成新的 `business_id`

```sql
-- 为重复记录重新生成 business_id
UPDATE asset_transactions
SET business_id = CONCAT(business_id, '_dup_', transaction_id)
WHERE transaction_id IN (827, 829, 831, 833, 835, ...);  -- 重复记录的ID列表
```

3. **强化约束**: 确认 unique index 生效

```sql
SHOW INDEX FROM asset_transactions WHERE Key_name = 'uk_business_idempotency';
-- 如果不存在，重新创建
CREATE UNIQUE INDEX uk_business_idempotency ON asset_transactions(business_id);
```

**推荐方案**: **方案A**（更符合抽奖业务逻辑：一次抽奖 = 1个业务ID + 2条事务记录）

**验证方式**:

1. 执行迁移脚本
2. 查询验证：`SELECT business_id, COUNT(*) FROM asset_transactions GROUP BY business_id HAVING COUNT(*) > 1;` → 应返回0行（方案B）或保持现状（方案A）
3. 测试幂等性：重复调用抽奖接口 → 应拒绝重复请求（通过 `idempotency_key` 校验）

---

#### P1-2: 清理所有脚本中的多点 dotenv.config() 调用

**影响范围**: 多个脚本文件（需全量扫描）

**修复模板**:

**修改前**:

```javascript
// 脚本中间位置
function someFunction() {
  require('dotenv').config({ override: true }) // ❌ 函数内加载 + override
  // ...
}
```

**修改后**:

```javascript
// 脚本顶部唯一加载点
const path = require('path')
require('dotenv').config({
  path: path.resolve(__dirname, '../../.env') // ✅ 绝对路径
}) // ✅ 不使用 override

// 函数内不再加载
function someFunction() {
  // 直接使用 process.env
  const dbHost = process.env.DB_HOST
  // ...
}
```

**执行步骤**:

1. 扫描所有脚本: `grep -r "dotenv\.config" scripts/ --include="*.js"`
2. 逐个文件修复（按模板统一）
3. 特别检查 `scripts/validation/pre-start-check.js:187, 212`
4. 特别检查 `scripts/fix-technical-debt-p0.js:47`（移除 `override: true`）

**验证方式**:

1. 全局搜索: `grep -r "override.*true" scripts/` → 应返回0结果
2. 全局搜索: `grep -r "dotenv\.config" scripts/` → 每个文件应仅在顶部出现1次
3. 运行脚本验证功能不受影响

---

#### P1-3: 验证所有 PM2 重启命令使用 --update-env

**已确认正确的文件**:

- ✅ `scripts/migration/execute-migration-now.js` (2处)

**需要全量扫描**:

```bash
grep -r "pm2 restart" scripts/ --include="*.js" --include="*.sh"
grep -r "pm2 reload" scripts/ --include="*.js" --include="*.sh"
```

**修复模板**:

```bash
# ❌ 错误
pm2 restart restaurant-lottery-backend
pm2 restart all

# ✅ 正确
pm2 restart restaurant-lottery-backend --update-env
pm2 reload restaurant-lottery-backend --update-env  # reload比restart更平滑
```

**验证方式**:

1. 修改 `.env` 中的测试配置（如 `LOG_LEVEL=debug`）
2. 执行脚本
3. 检查 PM2 进程环境变量: `pm2 show restaurant-lottery-backend | grep LOG_LEVEL`
4. 应反映新配置值

---

### 📊 P2 级修复（本月内 - 技术债务清理）

#### P2-1: 移除 tests/helpers/test-setup.js 中的冗余 DISABLE_REDIS 设置

**文件**: `tests/helpers/test-setup.js`

**当前代码**:

```javascript
process.env.DISABLE_REDIS = 'false' // ❌ 冗余（Redis为必需依赖）
```

**修复方案**:

```javascript
// ✅ 直接删除该行（Redis连接失败会自然抛错）
```

**理由**:

- Redis 为系统必需依赖（不允许禁用）
- `UnifiedRedisClient` 会在缺少 `REDIS_URL` 时自动抛错（fail-fast）
- 显式设置 `'false'` 是多余的

---

#### P2-2: 清理 config.example 中的敏感占位值

**文件**: `config.example`

**当前代码**:

```bash
JWT_SECRET=your_jwt_secret_key_replace_with_strong_random_string
SEALOS_ACCESS_KEY=your_access_key_here
```

**修复方案**:

```bash
# ✅ 更明确的占位符
JWT_SECRET=CHANGE_ME_jwt_secret_min_32_chars
JWT_REFRESH_SECRET=CHANGE_ME_jwt_refresh_secret_min_32_chars

SEALOS_ACCESS_KEY=CHANGE_ME_sealos_access_key
SEALOS_SECRET_KEY=CHANGE_ME_sealos_secret_key

# 添加生成提示
# 生成强随机密钥: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### 📋 修复执行清单（可复制到任务系统）

```markdown
## P0 级（本周内必须完成）

- [ ] P0-1: 修复 services/sealosStorage.js 硬编码密钥
  - [ ] 移除 `accessKeyId` 和 `secretAccessKey` 的默认值
  - [ ] 添加 fail-fast 校验
  - [ ] 补充 `.env` 中的 SEALOS 配置
  - [ ] 测试验证（临时删配置 → 应启动失败）

- [ ] P0-2: 移除 tests/helpers/test-setup.js 的 dotenv.config()
  - [ ] 删除 `require('dotenv').config()` 行
  - [ ] 删除 `DISABLE_REDIS='false'` 行
  - [ ] 运行测试验证行为不变

- [ ] P0-3: 统一 jest.setup.js 测试数据库配置
  - [ ] 修改 `DB_HOST` 为 `dbconn.sealosbja.site`
  - [ ] 修改 `DB_PORT` 为 `42569`
  - [ ] 运行测试确认连接实际库
  - [ ] 团队通知：测试共用开发库风险

- [ ] P0-4: 清理 config.example 废弃 Redis 配置
  - [ ] 删除 `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`/`REDIS_DB`
  - [ ] 仅保留 `REDIS_URL` 示例
  - [ ] 添加使用说明

## P1 级（本周内完成）

- [ ] P1-1: 调查 asset_transactions 表 business_id 重复问题
  - [ ] 确认 `business_id` 语义（业务关联ID vs 幂等键）
  - [ ] 选择修复方案（A: 新增 idempotency_key / B: 修复数据+索引）
  - [ ] 编写并执行迁移脚本
  - [ ] 验证幂等性（重复请求应拒绝）
  - [ ] 更新代码文档说明字段用途

- [ ] P1-2: 清理脚本中的多点 dotenv.config()
  - [ ] 扫描所有脚本：`grep -r "dotenv\.config" scripts/`
  - [ ] 修复 `scripts/validation/pre-start-check.js`
  - [ ] 修复 `scripts/fix-technical-debt-p0.js`（移除 override）
  - [ ] 全局验证：每个脚本仅在顶部加载一次
  - [ ] 全局验证：无 `override: true` 残留

- [ ] P1-3: 验证所有 PM2 重启命令
  - [ ] 扫描：`grep -r "pm2 restart\|pm2 reload" scripts/`
  - [ ] 逐个修改为 `--update-env`
  - [ ] 测试验证：修改 `.env` → 重启 → 配置生效

## P2 级（本月内完成）

- [ ] P2-1: 移除 DISABLE_REDIS 冗余设置
  - [ ] 删除 `tests/helpers/test-setup.js` 中的该行
  - [ ] 运行测试确认 Redis 必须连接

- [ ] P2-2: 清理 config.example 敏感占位值
  - [ ] 修改为 `CHANGE_ME_*` 格式
  - [ ] 添加密钥生成提示命令

## 验收标准

- [ ] 所有 P0 项通过测试（启动失败能 fail-fast）
- [ ] 所有 P1 项通过验证（数据完整性 + 配置一致性）
- [ ] 全局搜索无 `override: true` 残留
- [ ] 全局搜索 `REDIS_HOST`/`REDIS_PORT` 仅在文档中出现
- [ ] `business_id` 重复问题已修复（选择方案后验证）
- [ ] 测试环境连接实际库（团队已知晓风险）
```

---

### 🎯 执行时间估算

| 优先级 | 任务数 | 预估时间 | 累计时间 |
| ------ | ------ | -------- | -------- |
| P0 级  | 4      | 2-3 小时 | 2-3 小时 |
| P1 级  | 3      | 3-5 小时 | 5-8 小时 |
| P2 级  | 2      | 1 小时   | 6-9 小时 |

**执行建议**:

1. **今天完成 P0**（2-3小时）→ 解决生产安全隐患
2. **本周完成 P1**（3-5小时）→ 确保数据完整性
3. **本月完成 P2**（1小时）→ 技术债务清理

**风险提示**:

- **P1-1（business_id 重复）**需要业务团队参与决策（确认字段语义）
- **P0-3（测试库统一）**需要团队知晓风险（测试可能影响开发数据）
- 所有数据库迁移建议先在备份环境验证

### 短期（1-2周）- 强制执行清单（✅ 决策已确认 2025-12-25）

#### P0 级（最高优先级，1周内完成）

- [ ] **P0-1** 清空 `ecosystem.config.js` 的 `env:{...}`（不保留任何业务配置或默认值，包括 `NODE_ENV`/`PORT`）
  - 决策依据：✅ 已确认"ecosystem env 完全清空，只用 .env"
  - 影响：强制单一真相源（`.env` 唯一配置来源）
- [ ] **P0-2** 修改 `app.js`：移除 `dotenv.config({ override: true })`，统一为 `dotenv.config()`（所有环境禁止 override）
  - 决策依据：✅ 已确认"dotenv 全环境禁用 override"
  - 影响：统一优先级模型（系统/PM2 > .env 补齐）
- [x] **P0-3** Redis 配置统一为 `REDIS_URL`（✅ **已采用方案 A**：不兼容旧写法，暴力升级，2025-12-26确认）
  - 决策依据：✅ 已确认"Redis 统一 REDIS_URL，不做兼容回退"
  - **已采用配置（2025-12-25 确认）**：`REDIS_URL=redis://localhost:6379`
  - **正式确认（2025-12-26）**：✅ **方案A为最终方案，不提供方案B选项**
  - 格式说明：
    - 基础格式（✅ 当前使用）：`REDIS_URL=redis://localhost:6379`
    - 带密码格式：`REDIS_URL=redis://:password@host:6379/0`
    - TLS 格式：`REDIS_URL=rediss://host:6380/0`
  - 影响范围（破坏性变更，需要同步调整）：
    - **删除 `.env` 中的 `REDIS_HOST/REDIS_PORT`**（只保留 `REDIS_URL`）
    - **修改 `utils/UnifiedRedisClient.js`**：从 host/port 初始化改为解析 `REDIS_URL`
    - **修改 `config/environment.js`**：校验标准改为"只接受 `REDIS_URL`"（不再允许 `REDIS_HOST` 兜底）
    - **测试/脚本调整**：必须提供 `REDIS_URL=redis://localhost:6379`（不再支持 `DISABLE_REDIS=1`）
  - 环境行为标准（必须要有 Redis 版本）：
    - **所有环境（生产/预发/开发/单测）**：缺 `REDIS_URL` 直接启动失败（fail-fast）
    - **不允许 `DISABLE_REDIS=1`**（Redis 为系统必需依赖）
    - **不允许代码默认值兜底**（必须从 `.env` 读取）
  - **执行状态**：✅ 配置已确定为 `redis://localhost:6379`，等待代码实施
- [ ] **P0-4** 增强 `scripts/system/process-manager.sh`：添加 `logs`/`show`/`flush-logs`/`reload-env`/`health` 命令（见上文"合并方案"）
  - 决策依据：✅ 已确认"进程管理唯一入口 npm run pm:\*"
  - 执行：复制文档中提供的完整 bash 代码到 `process-manager.sh`
- [ ] **P0-5** 更新 `package.json`：添加对应的 `pm:logs`/`pm:show`/`pm:flush-logs`/`pm:reload-env`/`pm:health` 命令
  - 决策依据：✅ 已确认"进程管理唯一入口 npm run pm:\*"
  - 执行：复制文档中提供的 JSON 配置到 `package.json` 的 `scripts` 部分
- [ ] **P0-6** 删除其他进程管理脚本：`start-service.sh`、`快速管理脚本.sh`（完成 P0-4/P0-5 后再删除）
  - 决策依据：✅ 已确认"删掉 start-service.sh、快速管理脚本.sh，只留 npm run pm:\*"
  - 前置条件：必须先完成 P0-4、P0-5 的能力补齐
  - 执行：`rm start-service.sh 快速管理脚本.sh`

#### P1 级（高优先级，2周内完成）

- [ ] **P1-1** 修改 `config/database.js`：移除模块顶层副作用（✅ 已确认"按需校验/按需打印"）
  - 决策依据：解决"问题 F"，避免脚本/测试被误伤
  - 执行步骤：
    - [ ] 移除模块顶层的 `validateDatabaseConfig()` 调用（改为在 `testConnection()` 内调用）
    - [ ] 移除模块顶层的 `console.log` 打印连接信息（改为可选的启动阶段日志，且必须脱敏）
    - [ ] 移除模块顶层的 `dotenv.config()`（dotenv 只在 `app.js` 执行一次）
  - 影响：`require('./config/database')` 不再触发校验/打印
  - 验收：
    - [ ] `app.js` 启动阶段显式调用 `testConnection()`（保留 fail-fast）
    - [ ] 工具脚本不再因间接引用而被强制校验打断

- [ ] **P1-2** dotenv 多点加载收敛（✅ 已确认"应用单点/脚本规范/测试强制方案1"）
  - 决策依据：解决"问题 G"（P2 级），降低配置来源排查复杂度
  - 执行步骤：
    - [ ] **应用链路**：移除 `config/environment.js:10` 和 `config/database.js:12` 的 `dotenv.config()`（只保留 `app.js:27`）
    - [ ] **脚本链路**：检查 13+ 个脚本文件，统一规则：
      - [ ] 只在脚本入口顶部加载一次（不得在函数内二次加载）
      - [ ] 统一使用绝对路径：`require('dotenv').config({ path: path.resolve(__dirname, '../../.env') })`
      - [ ] 全仓库禁止 `override: true`（无例外）
      - [ ] 修改 `scripts/validation/pre-start-check.js:187, 212`：函数内二次加载 → 入口一次
      - [ ] 修改 `scripts/fix-technical-debt-p0.js:47`：强制移除 `override: true`
    - [ ] **测试链路**（✅ 强制方案1：不加载 dotenv）：
      - [ ] 移除 `jest.setup.js:6` 的 `require('dotenv').config()`
      - [ ] 移除 `tests/helpers/test-setup.js:10` 的 `require('dotenv').config()`（如有）
      - [ ] 保留手动设置的 `process.env.*`（测试配置完全显式）
      - [ ] 禁止创建 `.env.test` 文件
  - 验收：
    - [ ] 应用启动时只有 `app.js` 加载 dotenv（其他 config/\* 不加载）
    - [ ] 脚本执行时只在入口加载一次（无函数内二次加载、无 override）
    - [ ] 测试运行时不加载 dotenv（完全手动设置）

- [ ] **P1-3** 更新所有脚本中的 `pm2 restart` 命令为 `pm2 restart <app> --update-env`：
  - `scripts/migration/execute-migration-now.js`（2处）
  - `scripts/verify_old_apis_deleted.sh`（1处）
  - `scripts/delete_old_chat_apis.sh`（2处）
- [ ] **P1-4** 验证所有配置项从 `.env` 正确加载（使用上文的验证命令）
  - 执行 `pm2 show restaurant-lottery-backend | grep -E "DB_HOST|REDIS_URL|NODE_ENV"`
  - 确认输出的值与 `.env` 文件一致

#### P2 级（中优先级，2周内完成）

- [ ] **P2-1** 清理 `config.example` 中的明文敏感项（保留结构与占位符即可）
  - 决策依据：✅ 已确认"不轮换密钥、不清历史"（接受现状，但新模板应脱敏）
- [ ] **P2-2** 测试环境策略确认：允许连真实库 `restaurant_points_dev`（共用库，需团队知晓）
  - 决策依据：✅ 已确认"测试/脚本允许连真实库"
  - 执行：通知团队成员共用库风险（测试脚本可能影响开发数据）

### 中期（1个月）

- [ ] 添加 `.env.example` 模板文件（用于新环境部署，仅占位符不含真实值）
- [ ] 在 `config/environment.js` 中强化配置项完整性校验：
  - [ ] 增加 `REDIS_URL` 必需检查（所有环境 fail-fast）
  - [ ] 禁止 `REDIS_HOST/REDIS_PORT` 兜底（发现即报错）
- [ ] 统一所有数据库连接使用 `config/database.js` 的配置
- [ ] 验证数据库时区配置（✅ 已确认"应用层强制会话时区"）：
  - [ ] 确认 `config/database.js` 的 Sequelize 配置包含 `timezone: '+08:00'`
  - [ ] 确认 `dialectOptions` 包含时区设置
  - [ ] 通过日志/测试验证所有查询时间戳与北京时间一致
- [ ] 添加配置项变更的 changelog 机制

### 长期（3个月+）明确暂时不执行 长期（3个月+）这部分内容

- [ ] 如需多环境部署，考虑引入 `.env.staging` / `.env.production`
- [ ] 考虑使用 Sealos 的"环境变量管理"功能替代 .env 文件
- [ ] 添加配置项的敏感度分级和加密存储机制
- [ ] 历史敏感信息处置：当前决策为"不做密钥轮换/git 历史清理"（如未来需要，需单独评估影响面）

---

---

## 📋 决策记录（已拍板 - 2025-12-26）

| 决策项                    | 选择方案                                                                      | 决策结果            | 理由                                                                                                                                                                                 | 影响面                                                                                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dotenv 优先级策略         | 全仓库禁止 override（无例外）                                                 | ✅ **已确认**       | 统一优先级模型（系统/PM2 > .env 补齐），跨环境一致、可预测                                                                                                                           | 需修改 `app.js`（移除 `override: true`）；所有脚本禁止使用 `override: true`（无例外）                                                                                                                                         |
| ecosystem.config.js env   | 完全清空（不保留默认值）                                                      | ✅ **已确认**       | 强制单一真相源（`.env` 唯一配置来源）                                                                                                                                                | `.env` 必须包含所有必需配置（包括 `NODE_ENV`/`PORT`/`TZ`）                                                                                                                                                                    |
| Redis 配置规范            | **方案 A：只用 `REDIS_URL`（✅ 2025-12-26 正式确认为唯一方案，不提供方案B）** | ✅ **已确认并执行** | 统一配置源，支持密码/TLS/DB index；**不做兼容回退**（`REDIS_HOST/REDIS_PORT` 立即失效）；**所有环境必须配置 Redis**（fail-fast）；**已采用配置**：`REDIS_URL=redis://localhost:6379` | **破坏性变更**：删除 `.env` 旧键、修改 Redis 客户端初始化（解析 URL）、校验改为强制 `REDIS_URL`（所有环境）、移除 `DISABLE_REDIS` 降级逻辑、`app.js` 启动校验统一（移除 development try/catch 忽略）                          |
| Redis 依赖管理            | 方案 A：外部服务，脚本不拉起                                                  | ✅ **已确认**       | 职责清晰、环境一致、避免技术债；Sealos Devbox 应单一职责                                                                                                                             | 应用脚本不支持 `--with-redis`；Redis 由平台/docker/手工管理；应用启动只验证 `REDIS_URL` 连通性（fail-fast）                                                                                                                   |
| 进程管理入口              | 唯一入口：`npm run pm:*`                                                      | ✅ **已确认**       | 防止回归，统一操作，减少维护成本                                                                                                                                                     | 删除 `start-service.sh`、`快速管理脚本.sh`（先完成 `pm:*` 增强）                                                                                                                                                              |
| 测试环境策略              | 允许连真实库（共用 `restaurant_points_dev`）                                  | ✅ **已确认**       | 简化环境管理，避免维护独立测试库                                                                                                                                                     | 团队需知晓共用库风险（测试脚本可能影响开发数据）                                                                                                                                                                              |
| 历史敏感信息              | 不做密钥轮换/git 历史清理                                                     | ✅ **已确认**       | 接受现状，降低执行成本（历史已公开按"已知"处理）                                                                                                                                     | 已泄露信息（DB密码、JWT密钥等）按"已公开"处理，不影响单环境方案实施                                                                                                                                                           |
| config/database.js 副作用 | 移除模块顶层副作用，改为按需校验/打印                                         | ✅ **已确认**       | 避免脚本/测试被误伤，减少敏感信息泄露，同时在 `app.js` 保留 fail-fast                                                                                                                | 需移除顶层 `validateDatabaseConfig()` / `console.log` / `dotenv.config()`；在 `app.js` 启动阶段显式调用 `testConnection()`                                                                                                    |
| dotenv 多点加载收敛（P2） | 应用单点 + 脚本规范 + 测试强制方案1                                           | ✅ **已确认**       | 降低"配置到底在哪生效"的排查复杂度，便于配置来源追踪                                                                                                                                 | **应用**：移除 `config/environment.js` / `config/database.js` 的 dotenv（只保留 `app.js`）；**脚本**：统一入口顶部加载 + 禁止 override + 绝对路径；**测试**：✅ 强制方案1 - 不加载 dotenv，纯手动设置（禁止创建 `.env.test`） |
| 数据库时区策略            | 应用层强制会话时区 `+08:00`，不修改 DB global                                 | ✅ **已确认**       | 低风险、可控；当前 Sequelize 已实现；不依赖 DBA 权限；不影响同库其他客户端                                                                                                           | 需确认 `config/database.js` 的 Sequelize 配置包含 `timezone: '+08:00'` 和 `dialectOptions` 时区设置；所有查询时间戳与北京时间一致                                                                                             |

**决策生效时间**：

- 2025年12月25日：初始决策确认
- 2025年12月26日：✅ **Redis方案A正式确认为唯一方案**

**决策人**：项目负责人  
**执行期限**：短期（1-2周内完成 P0 项，见下文"执行清单"）

---

**✅ 统一方案核心理念**：单一真相源（.env） + PM2 纯进程管理 + 强制重载机制（--update-env） + 唯一操作入口（npm run pm:\*）

---

## 📋 执行检查清单（可打印/复制到任务系统）

### 阶段 1：配置源统一（P0 级，预计 2-4 小时）

```markdown
- [ ] 1.1 备份当前配置
  - [ ] 复制 `.env` → `.env.backup.$(date +%Y%m%d)`
  - [ ] 复制 `ecosystem.config.js` → `ecosystem.config.js.backup`
  - [ ] 复制 `app.js` → `app.js.backup`

- [ ] 1.2 清空 ecosystem.config.js 的 env 对象
  - [ ] 打开 `ecosystem.config.js`
  - [ ] 删除 `env: { ... }` 中的所有内容（保留空对象或完全删除该字段）
  - [ ] 确保保留 `env_file: '.env'`
  - [ ] 保存并验证 JSON 格式正确

- [ ] 1.3 补充 .env 必需配置
  - [ ] 确认 `NODE_ENV` 已配置
  - [ ] 确认 `PORT` 已配置
  - [ ] 确认 `TZ=Asia/Shanghai` 已配置
  - [ ] 添加 `REDIS_URL=redis://localhost:6379`（或实际 Redis 地址）
  - [ ] 确认所有 DB\_\* 配置齐全
  - [ ] 确认 JWT_SECRET 等密钥齐全

- [ ] 1.4 修改 app.js 禁用 override
  - [ ] 找到 `dotenv.config({ override: true })` 行
  - [ ] 修改为 `dotenv.config()`（移除 override 参数）
  - [ ] 确认其他 dotenv.config() 调用也都没有 override

- [ ] 1.5 验证配置加载
  - [ ] 执行 `npm run check:env`（或手工验证必需变量）
  - [ ] 启动服务：`npm run pm:start:pm2`
  - [ ] 检查进程环境变量：`pm2 show restaurant-lottery-backend | grep -E "DB_HOST|REDIS_URL|NODE_ENV"`
  - [ ] 确认输出的值与 `.env` 一致
```

### 阶段 2：进程管理统一（P0 级，预计 1-2 小时）

```markdown
- [ ] 2.1 增强 process-manager.sh
  - [ ] 打开 `scripts/system/process-manager.sh`
  - [ ] 在 `main()` 的 `case` 语句中添加 5 个新命令（复制文档中的代码）：
    - [ ] `logs)` 分支
    - [ ] `show|details)` 分支
    - [ ] `flush-logs)` 分支
    - [ ] `reload-env|reload)` 分支
    - [ ] `health)` 分支
  - [ ] 更新 `help` 分支的输出（添加新命令说明）
  - [ ] 保存文件

- [ ] 2.2 更新 package.json
  - [ ] 打开 `package.json`
  - [ ] 在 `scripts` 部分添加 5 个新命令：
    - [ ] `"pm:logs": "./scripts/system/process-manager.sh logs"`
    - [ ] `"pm:show": "./scripts/system/process-manager.sh show"`
    - [ ] `"pm:flush-logs": "./scripts/system/process-manager.sh flush-logs"`
    - [ ] `"pm:reload-env": "./scripts/system/process-manager.sh reload-env"`
    - [ ] `"pm:health": "./scripts/system/process-manager.sh health"`
  - [ ] 保存文件

- [ ] 2.3 测试新命令
  - [ ] `npm run pm:help` - 查看帮助（确认新命令已列出）
  - [ ] `npm run pm:logs` - 查看日志（Ctrl+C 退出）
  - [ ] `npm run pm:show` - 查看详情
  - [ ] `npm run pm:health` - 健康检查
  - [ ] `npm run pm:reload-env` - 重新加载配置

- [ ] 2.4 删除旧脚本（确认上述测试通过后）
  - [ ] `rm start-service.sh`
  - [ ] `rm 快速管理脚本.sh`
  - [ ] 检查其他文档/脚本是否引用这两个文件，如有则更新为 `npm run pm:*`
```

### 阶段 3：数据库配置清理 + 脚本统一更新（P1 级，预计 1 小时）

````markdown
- [ ] 3.1 修改 config/database.js 移除顶层副作用
  - [ ] 打开 `config/database.js`
  - [ ] 移除模块顶层的 `validateDatabaseConfig()` 调用
  - [ ] 移除模块顶层的 `console.log` 打印连接信息
  - [ ] 移除模块顶层的 `dotenv.config()`（如有）
  - [ ] 确保 `validateDatabaseConfig()` 只在 `testConnection()` 内部调用
  - [ ] 保存文件

- [ ] 3.2 修改 app.js 添加显式数据库连接测试
  - [ ] 打开 `app.js`
  - [ ] 在应用启动阶段（初始化路由前）添加：
    ```javascript
    const { testConnection } = require('./config/database')
    await testConnection() // 保留 fail-fast
    ```
  - [ ] 确认启动失败时会立即退出（保留 fail-fast）
  - [ ] 移除 development 环境对 `validateConfig()` 的 try/catch 忽略（所有环境统一 fail-fast）
  - [ ] 保存文件

- [ ] 3.3 验证副作用移除效果
  - [ ] 在任意测试脚本中 `require('./config/database')` → 不应打印/抛错
  - [ ] 启动应用 `npm run pm:start:pm2` → 应在启动阶段显式校验 DB 连接
  - [ ] 临时删除 `.env` 中的 `DB_HOST` → 应启动失败（fail-fast 仍生效）

- [ ] 3.4 更新迁移脚本
  - [ ] 打开 `scripts/migration/execute-migration-now.js`
  - [ ] 找到所有 `pm2 restart` 命令（2 处）
  - [ ] 修改为 `pm2 restart restaurant-lottery-backend --update-env`
  - [ ] 保存文件

- [ ] 3.5 更新验证脚本
  - [ ] 打开 `scripts/verify_old_apis_deleted.sh`
  - [ ] 找到 `pm2 restart` 命令（1 处）
  - [ ] 修改为 `pm2 restart restaurant-lottery-backend --update-env`
  - [ ] 保存文件

- [ ] 3.6 更新删除脚本
  - [ ] 打开 `scripts/delete_old_chat_apis.sh`
  - [ ] 找到所有 `pm2 restart` 命令（2 处）
  - [ ] 修改为 `pm2 restart restaurant-lottery-backend --update-env`
  - [ ] 保存文件
````

### 阶段 4：最终验证（P1 级，预计 30 分钟）

```markdown
- [ ] 4.1 配置修改生效测试
  - [ ] 修改 `.env` 中的某个配置（如 `LOG_LEVEL=debug`）
  - [ ] 执行 `npm run pm:reload-env`
  - [ ] 检查日志确认配置已生效：`npm run pm:logs`
  - [ ] 恢复原配置并再次 reload

- [ ] 4.2 完整重启测试
  - [ ] 停止服务：`npm run pm:stop`
  - [ ] 确认端口已释放：`npm run pm:status`
  - [ ] 重新启动：`npm run pm:start:pm2`
  - [ ] 确认服务正常：`npm run pm:health`

- [ ] 4.3 文档更新
  - [ ] 更新 README.md（如有引用旧脚本）
  - [ ] 通知团队成员新的统一命令
  - [ ] 更新部署文档/运维手册（如有）

- [ ] 4.4 Git 提交
  - [ ] `git add .env ecosystem.config.js app.js package.json scripts/`
  - [ ] `git commit -m "统一配置源：实施单一真相源方案 (.env)"`
  - [ ] `git push`（如需要）
```

### 阶段 5：后续清理（P2 级，有空再做）

```markdown
- [ ] 5.1 清理 config.example
  - [ ] 打开 `config.example`
  - [ ] 将所有敏感值替换为占位符（如 `DB_PASSWORD=your_password_here`）
  - [ ] 保留结构和字段说明

- [ ] 5.2 团队沟通
  - [ ] 通知团队：测试脚本现在连真实库 `restaurant_points_dev`
  - [ ] 说明风险：测试数据可能影响开发环境
  - [ ] 建议：测试前先备份或使用事务回滚

- [ ] 5.3 创建 .env.example
  - [ ] 复制 `.env` → `.env.example`
  - [ ] 脱敏所有敏感值（密码、密钥等）
  - [ ] 添加注释说明每个配置项的用途
  - [ ] 提交到 Git（`.env.example` 可以进仓库，`.env` 不行）
```

---

**执行时间估算**：

- 阶段 1-2（P0）：3-6 小时
- 阶段 3（P1 - 含数据库配置清理）：1 小时
- 阶段 4（P1）：30 分钟
- 阶段 5（P2）：1 小时
- **总计**：5.5-8.5 小时（可分多次完成）

**执行建议**：

1. 先在开发环境/分支执行并验证
2. 确认无问题后再应用到生产环境
3. 每完成一个阶段就 Git 提交一次（便于回滚）
4. 遇到问题参考文档中的"常见问题排查"章节
