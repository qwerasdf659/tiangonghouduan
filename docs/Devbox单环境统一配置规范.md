# Devbox 单环境统一配置规范

**文档版本**: v2.0.0  
**最后更新**: 2025年12月30日  
**适用环境**: Sealos Devbox（单环境运行）  
**文档性质**: 纯规则/标准定义

---

## 📋 核心原则（2025年12月30日拍板确认）

1. **单一真相源（Devbox 专用）**：所有运行配置只来自 `.env` 文件（生产环境另有规范）
2. **PM2 只负进程管理**：`ecosystem.config.js` 不承载真实业务配置
3. **统一重启方式**：强制使用 `--update-env` 确保配置变更生效
4. **dotenv 优先级策略**：全仓库禁止 `override`（统一"系统/PM2 env > .env 补齐"）
5. **Redis 配置规范**：只用 `REDIS_URL`（不兼容旧写法，必须要有 Redis）
6. **进程管理入口**：唯一入口为 `npm run pm:*`
7. **测试环境策略**：允许连真实库（共用 `restaurant_points_dev`，⚠️ 高风险需约束）
8. **历史敏感信息**：不做密钥轮换（接受现状，⚠️ 生产必须用不同密钥）
9. **配置校验策略**：全环境统一 fail-fast（缺配置一律退出，无容错）
10. **自动生成配置**：禁止 `cp config.example .env`（缺 `.env` 就失败）

---

## 🔴 问题诊断分析（10类核心问题）

### 问题 1：配置源重复 / 多重真相

**问题表现**：

- **`ecosystem.config.js` 同时存在 `env_file` 与 `env:{...}`**：硬编码了 `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_PASSWORD`、`JWT_SECRET`、`REDIS_URL` 等业务配置
- **`.env` 与 PM2 `env` / shell env 同名变量并存**：导致改一处不生效（优先级不明确）
- **仓库内存在"第二真相源"**：
  - 测试/脚本里写死 DB/JWT/Redis 配置
  - 代码里写默认兜底值（如 `process.env.PORT || 3000`）
  - `config.example` 包含真实配置可被直接使用

**问题影响**：

- 改 `.env` 后可能不生效（因为 ecosystem env 或代码默认值优先级更高）
- 需要同时修改多处配置才能确保一致
- 无法确认"当前运行环境实际读取的是哪个配置源"
- 配置漂移风险：不同环境/脚本/测试用的配置不一致

**证据点**：

- `ecosystem.config.js` 包含明文/硬编码的 DB/JWT/Redis 配置（应视为"真实配置源"）
- `.env` 缺少 `REDIS_URL`，但 `ecosystem.config.js` 提供了 `REDIS_URL`
- 配置来源出现分裂（部分依赖读 `.env`，部分读 ecosystem env）
- 项目存在 `deploy.sh`（缺少 `.env` 时 `cp config.example .env`）

---

### 问题 2：环境变量优先级不一致（跨环境行为不同）

**问题表现**：

- **使用 `dotenv.config({ override: true })`**：造成 `.env` 覆盖系统/PM2 注入（与通常的"系统 > .env"相反）
- **development 与 production 对同一变量的优先级规则不同**：
  - development：`.env` 覆盖系统环境变量（override: true）
  - production：系统环境变量优先级高于 `.env`（无 override）
- **启动日志/文案误导配置来源**：输出"配置源：.env 文件"，让人以为一定来自 .env

**问题影响**：

- 同一个配置项在不同 NODE_ENV 下的优先级逻辑不一致
- 开发环境行为与生产环境不一致，增加调试难度
- 配置来源追溯困难：需要检查 5+ 个地方才能定位实际生效值

**证据点**：

- PM2 场景下，"系统环境变量"来自 shell、`ecosystem.config.js env` 与 `env_file` 注入
- `app.js` 的 `override: true` 会在 development 环境进一步覆盖它们
- `config/environment.js` 与 `config/database.js` 再次执行 `dotenv.config()`，加深排查复杂度

---

### 问题 3：dotenv 多点加载（排查复杂、来源不可追溯）

**问题通俗解释**：
同一套 `.env` 配置被很多地方反复读取，当某个变量不对时，很难判断"到底是谁最后把配置变成这样的"。

**问题表现**：

- **应用主链路多点 `dotenv.config()`**：
  - `app.js:27` 执行 `require('dotenv').config()`
  - `config/environment.js` 可能再次执行
  - `config/database.js` 可能再次执行
  - 同一进程中 dotenv 被调用多次

- **脚本链路随处 `dotenv.config()`**：
  - 入口/函数内重复加载
  - 路径不统一（相对路径 vs 绝对路径）
  - 部分脚本使用 `override: true`
  - 如 `scripts/check-environment.js` 自己加载 dotenv

- **全仓库出现 `override: true`**（文档明确禁止）：
  - 导致配置覆盖行为不可预测
  - 不同脚本/环境的优先级规则不一致

**问题影响**：

- 配置变量不对，不知道是哪里来的（需要检查多个加载点）
- import 一个模块就触发副作用（校验/打印/抛错）
- 测试/脚本用的配置和服务不一致

**排查困扰示例**：

1. **"配置变量不对，不知道是哪里来的"**
   - 发现 `DB_HOST` 不对，打开 `.env` 明明写的对，但程序用的是错的
   - 需要依次检查：`app.js` dotenv → `config/database.js` dotenv → `config/environment.js` dotenv → PM2 `env_file` → PM2 `env:{...}` → 脚本是否覆盖

2. **"我只是 import 了一个模块，它就炸了/打印了一堆日志"**
   - 写个工具脚本 `require('./config/database')` 读配置，结果直接报错退出：`❌ 缺少环境变量`
   - 或者疯狂打印：`🔗 统一数据库配置: localhost:3306/...`

3. **"测试/脚本用的配置和服务不一致"**
   - 服务连的是 `dbconn.sealosbja.site`，测试连的是 `localhost`（因为测试 setup 手动覆盖了）
   - 某个脚本又连的是 `.env` 里的旧配置

**问题严重度**：P2（不致命，但显著增加排查复杂度和维护成本）

---

### 问题 4：PM2 重启/重载不刷新环境变量

**问题表现**：

- **使用 `pm2 restart` / `pm2 restart all` 未带 `--update-env`**
- **缺少统一的"reload-env"操作入口**，导致团队操作不一致
- **项目内存在多个进程管理脚本入口**（行为不一致）：
  - `npm run pm:*` → `scripts/system/process-manager.sh`
  - `start-service.sh`
  - `快速管理脚本.sh`

**问题影响**：

- 修改 `.env` 或 `ecosystem.config.js` 后，`pm2 restart` 不一定会刷新环境变量
- 需要显式使用 `pm2 restart <app> --update-env` 才能确保配置更新生效
- 不同脚本的重启行为不一致（有的带 `--update-env`，有的不带）
- 团队成员使用不同的重启方式，导致配置生效不可预测

**证据点**：

- 多个脚本/说明要求执行 `pm2 restart all`（未加 `--update-env`）
- `start-service.sh` 使用 `pm2 restart restaurant-lottery-backend`（未加 `--update-env`）
- `快速管理脚本.sh` 已使用 `pm2 reload ecosystem.config.js --update-env`（正确做法）
- 项目内部"正确做法"与"实际被调用的做法"并存，容易形成回归

---

### 问题 5：Redis 配置规范不统一（方案A范围）

**问题表现**：

- **仍在使用/残留 `REDIS_HOST/REDIS_PORT/REDIS_PASSWORD/REDIS_DB`**：旧写法与新写法 `REDIS_URL` 并存
- **Redis 允许降级/禁用**（如 `DISABLE_REDIS`）而不是 fail-fast
- **`config.example` 仍包含旧 Redis 写法**，误导新环境部署
- **代码中存在 Redis 配置兜底逻辑**：如 `process.env.REDIS_HOST || 'localhost'`

**问题影响**：

- Redis 配置来源不明确（URL 格式 vs 分散字段）
- 不同环境的 Redis 行为不一致（有的 fail-fast，有的降级运行）
- 新环境部署时参考 `config.example` 可能配置错误格式
- 降级运行掩盖配置缺失，导致线上功能异常（如限流失效、缓存失效）

**证据点**：

- `.env` 可能缺少 `REDIS_URL`，但代码有兜底逻辑
- `config.example` 包含 `REDIS_HOST/REDIS_PORT/REDIS_PASSWORD/REDIS_DB`（已废弃格式）
- 部分代码允许 `DISABLE_REDIS=1` 跳过 Redis 连接

---

### 问题 6：测试链路配置来源扩散（文档测试策略范围）

**问题表现**：

- **测试中加载 dotenv**（违反"测试不加载 dotenv，纯手动设置"）：
  - `jest.setup.js` 可能加载 dotenv
  - `tests/helpers/test-setup.js` 加载 dotenv
- **测试创建 `.env.test` 或依赖本机 `.env`**（配置源扩散）
- **测试/开发/生产连接目标不透明**：
  - 容易误连真实库或误用密钥
  - 测试配置与实际运行配置不一致

**问题影响**：

- 测试行为受本机 `.env` 影响（不可复现）
- 测试配置来源不明确（看代码不知道用的什么配置）
- 配置源扩散：`.env` + `.env.test` + 测试代码手动设置
- 测试可能误操作线上数据（连接目标不透明）

**证据点**：

- `tests/helpers/test-setup.js` 包含 `require('dotenv').config()`
- 测试代码同时加载 dotenv 又手动覆盖变量（双真相源）
- 测试数据库配置与实际运行配置不一致

---

### 问题 7：数据库配置模块的"顶层副作用"

**问题表现**：

- **`config/database.js` 在 require 时就校验/打印/抛错/退出**
- **`config/database.js` 顶层打印连接信息**（敏感元数据扩散到日志）
- **dotenv 在 `config/database.js` 顶层加载**（破坏"入口单点加载"）

**问题影响**：

- 任意 `require('./config/database')` 都可能直接抛错或退出流程
- 工具脚本/测试因间接引用而被强制校验打断
- 顶层打印 DB 连接信息会把敏感元数据扩散到 PM2/CI/共享日志里
- 增加工具脚本/测试的脆弱性（不需要 DB 的脚本也被强制校验）

**典型场景**：

- 写个配置分析脚本 `require('./config/database')` → 直接报错：`❌ 缺少环境变量`
- 运行测试 → 控制台疯狂打印：`🔗 统一数据库配置: localhost:3306/...`
- 工具脚本只想读个配置 → 被强制连接数据库或校验失败退出

---

### 问题 8：`config.example` 的安全与模板规范

**问题表现**：

- **模板包含真实敏感信息或可被当成真实配置使用**：
  - 包含 DB 密码、对象存储 access/secret 等
  - 占位符不明确（如 `your_password_here` 可能被误认为真实值）
- **缺少 `CHANGE_ME_*` 占位符与密钥生成提示**
- **字段示例与现行规范不一致**（尤其 Redis）：
  - 仍包含 `REDIS_HOST/REDIS_PORT`（已废弃）
  - 短信配置字段名与代码实际读取的不一致

**问题影响**：

- 新环境部署时参考 `config.example` 可能配置错误格式
- 敏感信息进入仓库历史后，需要按"已泄露"处理
- 配置模板与实际代码不同步，导致部署失败或功能异常

**证据点**：

- `config.example` 包含 `REDIS_HOST/REDIS_PORT/REDIS_PASSWORD/REDIS_DB`（已废弃格式）
- 占位符格式不统一（`your_*` vs `CHANGE_ME_*`）
- 缺少密钥生成提示命令

---

### 问题 9：Sealos 存储配置 fail-fast（文档明确点名）

**问题表现**：

- **`services/sealosStorage.js` 存在默认密钥/默认桶/默认 endpoint 兜底**：
  ```javascript
  accessKeyId: process.env.SEALOS_ACCESS_KEY || 'br0za7uc' // ❌ 硬编码默认值
  secretAccessKey: process.env.SEALOS_SECRET_KEY || 'skxg8mk5gqfhf9xz' // ❌ 硬编码默认值
  ```
- **缺失关键 Sealos 配置时不 fail-fast**，导致"未配也能跑但跑错账号/环境"风险

**问题影响**：

- 配置缺失时不报错，而是使用默认值（可能连到错误的存储账号）
- 敏感默认密钥进入代码仓库（安全风险）
- 配置源扩散：`.env` 不再是唯一真相源（代码里有兜底）
- 生产环境可能误用开发环境的默认配置

**证据点**：

- `services/sealosStorage.js` 包含硬编码的 `accessKeyId` 和 `secretAccessKey` 默认值
- 缺失 Sealos 配置时应用仍能启动（但可能连错存储）

---

### 问题 10：时区配置的单环境一致性

**问题表现**：

- **数据库连接未显式设置会话时区 `+08:00`**
- **依赖 DB global time_zone 而非应用层强制**：
  - 导致直连脚本/不同客户端产生时区漂移
  - 不同环境的时区行为不一致

**问题影响**：

- 直连 MySQL（未设置会话时区）时会使用 UTC，可能导致时间查询/计算不一致
- 依赖 DB global 时区不可控（需要 DBA 权限且影响面大）
- 不同客户端（应用/脚本/BI工具）的时区行为不一致

**证据点**：

- 需要确认 `config/database.js` 的 Sequelize 配置是否包含 `timezone: '+08:00'`
- 需要确认 `dialectOptions` 是否包含时区设置

---

### 问题 A-D（原文档编号，保留兼容性）

**问题 A** = 问题 1（配置源重复）  
**问题 B** = 问题 2（优先级不一致）  
**问题 C** = 问题 1 的子集（PM2 继承 shell env）  
**问题 D** = 问题 4（PM2 重启不刷新）  
**问题 E** = 问题 1 + 问题 8（明文配置/默认密钥）  
**问题 F** = 问题 7（数据库配置模块副作用）  
**问题 G** = 问题 3（dotenv 多点加载）

---

## 🎯 统一配置规范

### ecosystem.config.js 的职责定位

**保留的职责**：

- ✅ **进程启动入口**：告诉 PM2 用什么脚本启动（`script`、`cwd`、`instances`、`exec_mode`）
- ✅ **运行行为控制**：`watch`、`autorestart`、`max_memory_restart`、日志路径/格式等
- ✅ **从文件加载环境变量**：通过 `env_file: '.env'` 把 `.env` 注入给进程

**不再承载的职责**：

- ❌ **业务配置**：`DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD/JWT_SECRET/REDIS_URL` 等必须全部删除
- ❌ **默认值兜底**：`NODE_ENV`、`PORT` 的默认值也不保留
- ❌ **`env:{...}` 完全清空**：不保留任何业务配置或默认值

**标准配置示例**：

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

      // PM2 进程管理参数
      watch: false,
      max_memory_restart: '512M',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 1000
    }
  ]
}
```

---

### .env 文件必需配置清单

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
SEALOS_BUCKET=your_bucket_name
SEALOS_ACCESS_KEY=your_access_key
SEALOS_SECRET_KEY=your_secret_key

# === 日志配置 ===
LOG_LEVEL=debug

# === API 版本 ===
API_VERSION=v4
```

---

### dotenv 加载规范

#### 应用链路（强收敛）

**规则**：dotenv 只允许在 `app.js` 单点加载，其他模块不得再次加载。

**执行标准**：

- ✅ **保留**：`app.js` 的 `require('dotenv').config()`（作为唯一加载点）
- ❌ **移除**：`config/environment.js` 的 `require('dotenv').config()`
- ❌ **移除**：`config/database.js` 的 `require('dotenv').config()`
- ✅ **副作用收敛**：
  - `config/database.js` 移除顶层 `validateDatabaseConfig()` 调用和 `console.log` 打印
  - 改为由 `app.js` 启动阶段显式调用 `testConnection()`

**配置校验策略（拍板决策）**：

- ✅ **全环境统一 fail-fast**：删除 `app.js` 中 dev 的 try/catch 容错逻辑
- ✅ **`config/environment.js` 的 `validateConfig()` 改为 throw**：不再 `process.exit(1)`
- ✅ **`app.js` 启动阶段直接调用**：让错误在启动入口统一处理
- ❌ **禁止环境差异化容错**：dev/staging/production 行为完全一致

**标准实现**：

```javascript
// app.js（修改后）
require('dotenv').config() // ✅ 唯一加载点
console.log(`✅ [${process.env.NODE_ENV || 'unknown'}] 环境变量已加载`)

const { validateConfig } = require('./config/environment')

// ✅ 全环境统一 fail-fast（删除 dev 的 try/catch）
validateConfig() // 缺配置直接抛错退出，无容错
```

```javascript
// config/environment.js（修改后）
function validateConfig() {
  const required = [
    'NODE_ENV',
    'PORT',
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'JWT_SECRET',
    'REDIS_URL'
  ]
  const missing = required.filter(key => !process.env[key])

  if (missing.length > 0) {
    console.error('❌ 缺少必需的环境变量:')
    missing.forEach(key => console.error(`   - ${key}`))
    // ✅ 改为 throw（而非 process.exit(1)）
    throw new Error(`配置校验失败：缺少 ${missing.length} 个必需变量`)
  }

  console.log(`✅ 环境配置验证通过: ${getCurrentConfig().displayName}`)
}
```

**好处**：

- 整条服务链路只有一个"读 `.env` 的入口"
- `config/*` / `models/*` 变成"纯读取 `process.env`"的基础模块
- 排查配置问题时只需看：`app.js` dotenv + PM2 注入（两处）
- 全环境行为一致，降低认知负担和排查成本

---

#### 脚本链路（允许显式，但统一规则）

**规则**：脚本作为独立进程可以加载 dotenv，但要统一"在哪加载、怎么加载"。

**统一规则（强制执行）**：

- ✅ **只在脚本入口最顶部加载一次**（不得在函数内部二次加载）
- ✅ **统一使用绝对路径**：`require('dotenv').config({ path: path.resolve(__dirname, '../../.env') })`
- ❌ **全仓库禁止 `override: true`**（无例外）
- ✅ **脚本间不重复加载**：如果脚本 A 调用脚本 B，只在顶层脚本加载一次

**好处**：

- 脚本的配置来源清晰：看脚本顶部那一行 dotenv + 它用的 path
- 不会出现"脚本 A 加载了 `.env`，调用脚本 B 又 override 覆盖了"的混乱

---

#### 测试链路（强制方案1：不加载 dotenv，纯手动设置）

**规则**：测试配置完全可控，不受 `.env`/PM2/系统环境影响。

**强制执行规则**：

- ❌ **禁止**在测试中加载 dotenv（移除 `jest.setup.js` / `tests/helpers/test-setup.js` 的 `require('dotenv').config()`）
- ❌ **禁止**创建 `.env.test` 文件（避免配置源扩散）
- ✅ **强制**测试需要的所有环境变量只能在 `jest.setup.js` 等测试 setup 文件中显式设置
- ✅ **允许**测试使用与真实库不同的配置（如连测试库、使用测试密钥等）

**核心好处**：

- 测试配置是"代码即文档"，看 `jest.setup.js` 就知道测试用的所有配置
- 不会因为本机 `.env` 改动、PM2 注入、CI 环境变量而导致测试行为变化
- 结合"允许连真实库"决策，测试配置必须显式且可审计

**标准示例**：

```javascript
// jest.setup.js
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret-key-for-development-only'

// ✅ 测试环境连接真实库（与开发环境共用 restaurant_points_dev）
process.env.DB_HOST = 'dbconn.sealosbja.site'
process.env.DB_PORT = '42569'
process.env.DB_USER = 'root'
process.env.DB_PASSWORD = 'mc6r9cgb'
process.env.DB_NAME = 'restaurant_points_dev'

// Redis配置：统一使用REDIS_URL（必须配置，不允许禁用）
process.env.REDIS_URL = 'redis://localhost:6379'
```

---

### Redis 配置规范（方案 A - 唯一方案）

**核心规则**：

- ✅ **必须配置 `REDIS_URL`**（所有环境）
- ❌ **不再允许 `REDIS_HOST/REDIS_PORT`**（发现即报错）
- ❌ **不允许 `DISABLE_REDIS=1`**（Redis 为必需依赖）
- ❌ **不允许代码中有默认值兜底**（必须从 `.env` 读取）

**配置格式**：

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

**环境行为标准**：

- **所有环境（生产/预发/开发/单测）**：缺 `REDIS_URL` 直接启动失败（fail-fast）
- **不允许 `DISABLE_REDIS=1`**（Redis 为系统必需依赖）
- **不允许代码默认值兜底**（必须从 `.env` 读取）

**破坏性变更清单**：

- **配置源变更**：删除 `.env` 中的 `REDIS_HOST` 和 `REDIS_PORT`（只保留 `REDIS_URL`）
- **代码层变更**：修改 `utils/UnifiedRedisClient.js` 从解析 URL 初始化
- **校验逻辑变更**：`config/environment.js` 校验标准改为"只接受 `REDIS_URL`"
- **测试/脚本变更**：必须提供 `REDIS_URL=redis://localhost:6379`

**Redis 依赖管理规范**：

- ❌ **不支持**应用脚本拉起 Redis
- ✅ **强制** Redis 作为外部依赖，由平台/基础设施管理
- ✅ **应用启动时**只验证 `REDIS_URL` 连通性，连不上直接 fail-fast

---

### PM2 重启规范

**强制规则**：

- ✅ 所有 PM2 重启命令必须使用 `--update-env` 参数
- ✅ 修改 `.env` 后必须重启才能生效

**标准命令**：

```bash
# ✅ 正确做法
pm2 restart restaurant-lottery-backend --update-env
pm2 reload restaurant-lottery-backend --update-env  # reload比restart更平滑

# ❌ 错误做法
pm2 restart restaurant-lottery-backend
pm2 restart all
```

---

### 进程管理入口规范

**强制规则**：

- ✅ 唯一入口为 `npm run pm:*`
- ❌ 删除其他进程管理脚本：`start-service.sh`、`快速管理脚本.sh`

**统一命令清单**：

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

---

### 数据库配置规范

**模块职责规范**：

- ❌ **禁止模块顶层副作用**：
  - 移除 `validateDatabaseConfig()` 的顶层执行
  - 移除顶层 `console.log` 打印连接信息
  - 移除顶层 `dotenv.config()`

- ✅ **保留 fail-fast 机制**：
  - 在 `app.js` 启动阶段显式调用 `testConnection()`
  - 工具脚本按需调用 `testConnection()`

**时区配置规范**：

- ✅ **应用层强制会话时区 `+08:00`**（当前 Sequelize 已做到）
- ✅ **不强制修改 DB global time_zone**（保持"应用层强制会话时区"的做法）

**标准配置**：

```javascript
// config/database.js
const sequelize = new Sequelize({
  // ...
  timezone: '+08:00', // ✅ 强制会话时区
  dialectOptions: {
    timezone: '+08:00' // ✅ 连接时区设置
  }
})
```

---

### Sealos 存储配置规范

**安全规范**：

- ❌ **禁止硬编码默认密钥**
- ✅ **所有配置必须从环境变量读取**
- ✅ **缺失时直接抛错（fail-fast）**

**标准实现**：

```javascript
// services/sealosStorage.js
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

---

### 测试环境配置规范

**核心规则**：

- ✅ **允许连真实库**（继续共用 `restaurant_points_dev`）
- ✅ **测试配置完全显式**（不加载 dotenv）
- ❌ **禁止创建 `.env.test`**（避免配置源扩散）

**标准配置示例**：

```javascript
// jest.setup.js
// ✅ 测试环境：纯手动设置（不加载 dotenv）

// 数据库配置：使用实际库（与文档决策对齐）
process.env.DB_HOST = 'dbconn.sealosbja.site'
process.env.DB_PORT = '42569'
process.env.DB_USER = 'root'
process.env.DB_PASSWORD = 'mc6r9cgb'
process.env.DB_NAME = 'restaurant_points_dev'

// Redis配置：必须连接（不允许禁用）
process.env.REDIS_URL = 'redis://localhost:6379'

// JWT配置
process.env.JWT_SECRET = 'test-jwt-secret-key-for-development-only'
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key'

// Node环境
process.env.NODE_ENV = 'test'
process.env.TZ = 'Asia/Shanghai'
```

---

## 🚨 常见问题与规范说明

### Q1: 什么是"环境变量"与"同名变量"？

**环境变量（Environment Variables）**：运行后端时 `process.env` 里的键值对。

**环境变量的 3 个来源**：

1. **`.env` 文件**：`KEY=VALUE` 格式
2. **PM2 注入**：`ecosystem.config.js` 的 `env_file` / `env`
3. **系统/启动 shell 注入**：容器平台、`export` 出来的变量

**同名变量**：同一个键（例如 `DB_HOST`）同时存在于多个来源，导致"改了一处但另一处优先级更高"的问题。

---

### Q2: 修改 `.env` 后重启没生效？

**原因**：未使用 `--update-env` 参数

**解决**：

```bash
# ❌ 错误做法
pm2 restart restaurant-lottery-backend

# ✅ 正确做法
pm2 restart restaurant-lottery-backend --update-env
```

---

### Q3: `.env` 和 `ecosystem.config.js env` 同时存在同名变量，哪个优先？

**当前优先级混乱的根源**：

1. **应用层（development）**：`app.js` 使用 `dotenv.config({ override: true })` → `.env` 会覆盖已有 `process.env`
2. **应用层（非 development）**：dotenv 不 override → `.env` 只补齐缺失项
3. **PM2 注入层**：`ecosystem.config.js env` > `env_file: '.env'` > 启动时 shell env

**统一方案（强制执行）**：

1. **删除 `ecosystem.config.js` 中的 `env:{...}` 所有内容**
2. **修改 `app.js`**：移除 `dotenv.config({ override: true })`，统一使用 `dotenv.config()`
3. **统一优先级模型**：系统/PM2 env > `.env` 补齐（跨环境一致、可预测）
4. **`.env` 必须包含所有必需配置**（包括 `NODE_ENV`、`PORT`、`TZ`）

---

### Q4: 如何修改某个环境变量（例如 `DB_HOST` / `JWT_SECRET`）？

**标准流程**：

1. **只修改 `.env` 里对应的键**（这就是唯一真相源）
2. **用统一入口重启并强制刷新环境变量**：
   ```bash
   npm run pm:restart
   # 或
   pm2 restart restaurant-lottery-backend --update-env
   ```

**如果发现"改了 `.env` 但没生效"**，只有两类原因：

- **原因 A**：还有其它地方残留了同名变量（如 `ecosystem.config.js env:{...}`）
- **原因 B**：重启没带 `--update-env`

---

### Q5: 以后新增一个环境变量，如何避免"同名冲突"？

**预防措施（强制执行）**：

1. **只在 `.env` 新增**这个键
2. **不要**在以下地方再写一份同名兜底/硬编码：
   - ❌ `ecosystem.config.js env:{...}`
   - ❌ 脚本里 `process.env.NEW_CONFIG_KEY = ...`
   - ❌ 测试代码里 `process.env.NEW_CONFIG_KEY = ...`（测试环境例外：允许手动设置）
   - ❌ `config.example` 里写真实值（只允许占位符）
   - ❌ 代码里写默认值兜底（如 `process.env.NEW_KEY || 'default'`）

3. **验证新变量是否生效**：
   ```bash
   npm run pm:restart
   pm2 show restaurant-lottery-backend | grep "NEW_CONFIG_KEY"
   ```

---

### Q6: 首次部署 Devbox 环境时如何创建 `.env`？

**标准流程（拍板决策：禁止自动 cp）**：

1. **手工创建 `.env` 文件**：

   ```bash
   touch .env
   chmod 600 .env  # 设置仅当前用户可读写
   ```

2. **参考 `config.example` 填写必需配置**：

   ```bash
   # 查看必需字段清单
   cat config.example

   # 手工编辑 .env
   vim .env
   ```

3. **必需配置清单**（缺一不可）：
   - `NODE_ENV`、`PORT`、`TZ`
   - `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASSWORD`
   - `JWT_SECRET`、`JWT_REFRESH_SECRET`
   - `REDIS_URL`
   - `SEALOS_ENDPOINT`、`SEALOS_BUCKET`、`SEALOS_ACCESS_KEY`、`SEALOS_SECRET_KEY`

4. **验证配置完整性**：

   ```bash
   npm run check:env
   ```

5. **启动服务**：
   ```bash
   npm run pm:start:pm2
   ```

**❌ 禁止的做法**：

- ❌ `cp config.example .env`（会把占位符当真实配置）
- ❌ 脚本自动生成 `.env`（违反"人工显式创建"原则）
- ❌ 使用 `config.example` 直接启动（必须手工填写真实值）

**需要删除的自动 cp 逻辑**：

- `deploy.sh` 第 47 行
- `scripts/sealos/setup-sealos.sh` 第 16 行

---

## 🔒 安全注意事项

### .env 文件保护规范

1. **文件权限**：

   ```bash
   # 设置 .env 为仅当前用户可读写
   chmod 600 .env
   ```

2. **备份机制**：

   ```bash
   # 在修改前备份
   cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
   ```

3. **敏感信息处理**：
   - 所有密码、密钥使用 `CHANGE_ME_*` 格式占位符
   - `config.example` 不包含真实值
   - 代码中不允许硬编码默认密钥

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

## 🔧 P0 级强制修复规范（影响生产安全）

### P0-1: 移除 Sealos 存储服务的硬编码默认密钥

**文件**: `services/sealosStorage.js`

**问题代码**:

```javascript
this.config = {
  accessKeyId: process.env.SEALOS_ACCESS_KEY || 'br0za7uc', // ❌ 硬编码默认值
  secretAccessKey: process.env.SEALOS_SECRET_KEY || 'skxg8mk5gqfhf9xz' // ❌ 硬编码默认值
}
```

**修复规范**:

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

---

### P0-2: 移除测试配置中的 dotenv 加载

**文件**: `tests/helpers/test-setup.js`

**问题代码**:

```javascript
require('dotenv').config() // ❌ 违反"测试链路强制方案1"
process.env.DISABLE_REDIS = 'false' // ❌ 冗余设置
```

**修复规范**:

```javascript
// ✅ 测试环境：纯手动设置（不加载 dotenv）

// 数据库配置：使用实际库
process.env.DB_HOST = 'dbconn.sealosbja.site'
process.env.DB_PORT = '42569'
process.env.DB_USER = 'root'
process.env.DB_PASSWORD = 'mc6r9cgb'
process.env.DB_NAME = 'restaurant_points_dev'

// Redis配置：必须连接（不允许禁用）
process.env.REDIS_URL = 'redis://localhost:6379'
// ❌ 移除 DISABLE_REDIS 设置

// JWT配置
process.env.JWT_SECRET = 'test-jwt-secret-key-for-development-only'
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key'

// Node环境
process.env.NODE_ENV = 'test'
process.env.TZ = 'Asia/Shanghai'
```

---

### P0-3: 统一 jest.setup.js 测试数据库配置

**文件**: `jest.setup.js`

**问题代码**:

```javascript
process.env.DB_HOST = 'test-db-mysql.ns-br0za7uc.svc' // ❌ 与实际共用库决策冲突
process.env.DB_PORT = '3306'
```

**修复规范**:

```javascript
// ✅ 测试环境连接真实库（与开发环境共用 restaurant_points_dev）
process.env.DB_HOST = 'dbconn.sealosbja.site'
process.env.DB_PORT = '42569'
process.env.DB_USER = 'root'
process.env.DB_PASSWORD = 'mc6r9cgb'
process.env.DB_NAME = 'restaurant_points_dev'

// Redis配置：统一使用REDIS_URL（必须配置，不允许禁用）
process.env.REDIS_URL = 'redis://localhost:6379'
```

---

### P0-4: 清理 config.example 中的废弃 Redis 配置

**文件**: `config.example`

**问题代码**:

```bash
REDIS_HOST=localhost  # ❌ 已废弃
REDIS_PORT=6379       # ❌ 已废弃
REDIS_PASSWORD=       # ❌ 已废弃
REDIS_DB=0            # ❌ 已废弃
```

**修复规范**:

```bash
# 🔴 Redis配置（缓存和会话） - 只用 REDIS_URL
REDIS_URL=redis://localhost:6379
# 或带密码：REDIS_URL=redis://:your_password@host:6379/0
# 或 TLS：REDIS_URL=rediss://host:6380/0
# ❌ 注意：不再使用 REDIS_HOST/REDIS_PORT（已废弃，不做兼容）
```

---

## 📋 决策记录（2025年12月30日更新）

| 决策项                    | 选择方案                                              | 决策结果            | 理由                                                                                                                             | 风险提示                                                                |
| ------------------------- | ----------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **配置校验策略**          | **全环境统一 fail-fast**                              | ✅ **已确认**       | 删除 dev 的 try/catch 容错，明确"缺配置一律退出"；统一行为，降低环境差异                                                         | 开发环境也会因配置缺失立即退出，需确保 `.env` 完整                      |
| **配置注入方式**          | **Devbox 专用：必须通过 `.env` 文件**                 | ✅ **已确认**       | 单环境 Devbox 使用 `.env` 作为唯一配置源；生产环境另有规范（平台注入）                                                           | 仅适用于 Devbox，生产环境不应依赖项目目录 `.env` 文件                   |
| **自动生成配置**          | **禁止自动 `cp config.example .env`**                 | ✅ **已确认**       | 缺 `.env` 就失败，要求人工显式创建/注入；避免把模板当真实配置跑起来                                                              | 需删除 `deploy.sh` / `scripts/sealos/setup-sealos.sh` 的自动 cp 逻辑    |
| **测试环境数据库**        | **保持共用真实库（`restaurant_points_dev`）**         | ✅ **已确认**       | 简化环境管理，避免维护独立测试库；测试会写入真实数据                                                                             | ⚠️ **高风险**：测试会写真实数据，需约束测试范围/事务回滚/固定前缀数据   |
| **进程管理方式**          | **PM2 + 手工重启 + `--update-env`**                   | ✅ **已确认**       | Devbox 环境使用 PM2 管理，配置变更后手工执行 `npm run pm:restart` 或 `pm2 restart --update-env`                                  | 配置变更不会自动生效，必须手工重启                                      |
| **历史敏感信息**          | **接受现状，不做密钥轮换**                            | ✅ **已确认**       | 降低执行成本，历史已公开的密钥按"已知风险"处理                                                                                   | ⚠️ **安全风险**：仓库历史中的密钥需视为已泄露，生产环境必须使用不同密钥 |
| dotenv 优先级策略         | 全仓库禁止 override（无例外）                         | ✅ **已确认**       | 统一优先级模型（系统/PM2 > .env 补齐），跨环境一致、可预测                                                                       | -                                                                       |
| ecosystem.config.js env   | 完全清空（不保留默认值）                              | ✅ **已确认**       | 强制单一真相源（`.env` 唯一配置来源）                                                                                            | -                                                                       |
| Redis 配置规范            | **方案 A：只用 `REDIS_URL`（唯一方案，不提供方案B）** | ✅ **已确认并执行** | 统一配置源，支持密码/TLS/DB index；**不做兼容回退**（`REDIS_HOST/REDIS_PORT` 立即失效）；**所有环境必须配置 Redis**（fail-fast） | -                                                                       |
| Redis 依赖管理            | 方案 A：外部服务，脚本不拉起                          | ✅ **已确认**       | 职责清晰、环境一致、避免技术债；Sealos Devbox 应单一职责                                                                         | -                                                                       |
| 进程管理入口              | 唯一入口：`npm run pm:*`                              | ✅ **已确认**       | 防止回归，统一操作，减少维护成本                                                                                                 | 需删除 `start-service.sh` / `快速管理脚本.sh` 等多余入口                |
| config/database.js 副作用 | 移除模块顶层副作用，改为按需校验/打印                 | ✅ **已确认**       | 避免脚本/测试被误伤，减少敏感信息泄露，同时在 `app.js` 保留 fail-fast                                                            | -                                                                       |
| dotenv 多点加载收敛（P2） | 应用单点 + 脚本规范 + 测试强制方案1                   | ✅ **已确认**       | 降低"配置到底在哪生效"的排查复杂度，便于配置来源追踪                                                                             | -                                                                       |
| 数据库时区策略            | 应用层强制会话时区 `+08:00`，不修改 DB global         | ✅ **已确认**       | 低风险、可控；当前 Sequelize 已实现；不依赖 DBA 权限；不影响同库其他客户端                                                       | -                                                                       |

**决策生效时间**：2025年12月30日  
**决策人**：项目负责人

---

### 🚨 关键风险提示（基于拍板决策）

#### 1. 测试环境共用真实库的风险管理

**决策**：保持共用 `restaurant_points_dev`（不创建独立测试库）

**必须执行的风险控制措施**：

- ✅ **测试数据前缀约束**：所有测试创建的数据必须使用固定前缀（如 `test_*`）
- ✅ **事务回滚机制**：写操作测试必须在事务内执行并回滚
- ✅ **只读测试优先**：优先编写只读测试，减少数据写入
- ✅ **测试数据清理**：测试结束后必须清理创建的数据
- ⚠️ **禁止测试删除/修改真实业务数据**：测试不得操作非测试前缀的数据

**风险等级**：🔴 高风险（测试可能误删/误改真实数据）

#### 2. 历史敏感信息不轮换的安全边界

**决策**：接受现状，不做密钥轮换

**必须遵守的安全边界**：

- ✅ **生产环境必须使用不同密钥**：仓库历史中的密钥仅限 Devbox/开发环境
- ✅ **新密钥不进仓库**：生产环境密钥通过平台 Secret 注入，不落盘
- ✅ **定期审计**：定期检查是否有新的敏感信息进入仓库
- ⚠️ **已知风险接受**：仓库历史中的密钥视为"已泄露"，不用于生产

**风险等级**：🟡 中风险（已知风险，但已隔离）

#### 3. 禁止自动生成配置的运维影响

**决策**：禁止 `cp config.example .env`，缺 `.env` 就失败

**运维注意事项**：

- ✅ **首次部署必须手工创建 `.env`**：不能依赖脚本自动生成
- ✅ **配置模板仅供参考**：`config.example` 仅作为字段清单，不可直接使用
- ✅ **删除自动 cp 逻辑**：需修改 `deploy.sh` / `scripts/sealos/setup-sealos.sh`
- ⚠️ **新环境部署流程变更**：需更新部署文档，明确手工创建 `.env` 的步骤

**影响范围**：运维流程变更（首次部署需额外步骤）

#### 4. 全环境 fail-fast 的开发体验影响

**决策**：全环境统一 fail-fast，删除 dev 的 try/catch 容错

**开发注意事项**：

- ✅ **开发环境也必须配置完整**：缺少任何必需配置都会启动失败
- ✅ **配置错误立即暴露**：不会"带病运行"，减少排查时间
- ✅ **统一行为降低认知负担**：dev/staging/production 行为一致
- ⚠️ **首次启动门槛提高**：新开发者必须先配置完整 `.env` 才能启动

**影响范围**：开发体验变化（更严格但更可预测）

---

## 🎯 核心理念总结

**✅ 统一方案核心理念**：

- 单一真相源（.env）
- PM2 纯进程管理
- 强制重载机制（--update-env）
- 唯一操作入口（npm run pm:\*）
- 配置源不扩散
- fail-fast 优于降级运行

---

**文档结束**
