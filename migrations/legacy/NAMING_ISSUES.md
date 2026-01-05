# 历史命名不规范记录（已知悉，仅存档不修复）

## 决策说明（2026-01-04拍板）
- 这些迁移已在生产环境执行
- **不改动 sequelizemeta 记录**（避免风险）
- **不重命名迁移文件**（保持原样）
- 仅作审计存档（baseline 之后严格遵守命名规范）

## 标准命名格式
```
{YYYYMMDD}{HHMMSS}-{action}-{target}.js
```
- 使用连字符（-）分隔
- action 和 target 使用连字符连接多个单词
- 示例：`20260105120530-create-table-promotions.js`

## 不符合规范的文件

### 1. 使用下划线（_）而非连字符（-）

文件名：`20251226203441-remove_probability_column.js`
- 问题：使用下划线（_）而非连字符（-）
- 正确格式应为：`20251226203441-remove-probability-column.js`
- 影响：工具兼容性、代码规范一致性
- 处理：**保持原样，不重命名**

### 2. 旧格式命名（使用下划线分隔日期）

文件名：`20250110_add_idempotency_index.js`
- 问题：使用旧格式 `YYYYMMDD_action_target`
- 正确格式应为：`20250110000000-add-idempotency-index.js`
- 影响：与新格式不一致
- 处理：**保持原样，不重命名**

### 3. 简化格式命名（缺少时间部分）

文件名：`20250123-simplify-image-resources.js`
- 问题：缺少HHMMSS时间部分
- 正确格式应为：`20250123000000-simplify-image-resources.js`
- 影响：时间戳不完整
- 处理：**保持原样，不重命名**

## 命名规范校验规则（baseline 之后强制执行）

```javascript
const NAMING_PATTERN = /^\d{14}-[a-z0-9]+-[a-z0-9-]+\.js$/

function validateMigrationName(filename) {
  if (!NAMING_PATTERN.test(filename)) {
    throw new Error(
      `❌ 命名不规范：${filename}\n` +
      `标准格式：{YYYYMMDD}{HHMMSS}-{action}-{target}.js\n` +
      `要求：使用连字符（-）分隔，禁止下划线（_）`
    )
  }
}
```

## 预防措施

1. 使用 `npm run migration:create` 创建迁移（自动生成规范文件名）
2. 迁移创建工具已添加命名规范校验
3. 不符合规范的文件名会被拒绝创建
