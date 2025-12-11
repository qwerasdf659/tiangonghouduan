# V4 路由目录说明

## 目录结构

```
routes/v4/
├── _archived/              # 归档目录（已被 .gitignore 忽略）
│   ├── refactored-drafts/  # 重构草稿文件
│   └── backups/             # 备份文件
├── unified-engine/         # 统一引擎路由
├── hierarchy/              # 层级相关路由
├── debug-control.js        # 调试控制路由
├── notifications.js        # 通知路由
├── permissions.js          # 权限路由
├── statistics.js           # 统计路由
└── system.js               # 系统路由
```

## 归档策略（TR-010 规范）

为保持路由目录整洁，避免混淆和误挂，已将历史文件移至归档目录：

### 1. `_archived/refactored-drafts/` - 重构草稿目录
存放重构过程中产生的草稿文件，这些文件不再使用但保留作为参考：
- `admin_announcements_refactored.js`
- `notifications_refactored.js`
- `system_announcements_refactored.js`

### 2. `_archived/backups/` - 备份文件目录
存放开发过程中生成的备份文件：
- `system.js.backup.2025-12-07T15-52-52-157Z`
- `system.js.backup.20251207_155110`

## 注意事项

1. **归档目录已被忽略**：`_archived/` 目录已添加到 `.gitignore`，不会提交到版本控制系统
2. **命名规范**：所有路由文件和数据库相关文件使用 `snake_case` 命名格式
3. **文件归档原则**：
   - 重构草稿文件 → `_archived/refactored-drafts/`
   - 备份文件（*.backup.*） → `_archived/backups/`
4. **保持目录整洁**：主目录仅保留活跃使用的路由文件

## 路由说明

- **unified-engine/**：统一引擎相关路由（积分、库存、抽奖等核心业务）
- **hierarchy/**：层级管理相关路由
- **debug-control.js**：调试控制接口
- **notifications.js**：通知系统路由
- **permissions.js**：权限管理路由
- **statistics.js**：统计分析路由
- **system.js**：系统管理路由

## 开发规范

遵循项目整体规范：
- 路由层不直接操作模型，通过 Service 层处理业务逻辑
- 所有服务通过 ServiceManager 统一获取
- 路由禁止跨表事务，写操作通过 Service + transaction 统一处理
- API 接口符合 RESTful 标准和团队约定的 API 标准
