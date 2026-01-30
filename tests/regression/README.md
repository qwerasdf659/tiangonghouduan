# 回归测试目录 (tests/regression/)

## 目录结构

```
regression/
├── p0/                 # P0级（核心业务路径）回归测试
│   └── p0-critical-paths.test.js   # 核心业务路径一键回归
│
├── p1/                 # P1级（重要功能）回归测试
│   ├── p1-validation.test.js       # P1修复验证（完整版）
│   └── p1-validation-simple.test.js # P1修复验证（简化版）
│
└── bug-fixes/          # 特定bug修复的回归测试
    └── 2026-01-30-orphan-frozen.test.js  # 孤儿冻结问题修复
```

## 优先级分级说明

### P0级 - 核心业务路径（必须通过）

影响系统可用性的核心功能，发布前必须全部通过：

- 用户认证流程（登录/Token验证）
- 抽奖核心流程（NormalDrawPipeline）
- 资产服务核心操作（冻结/解冻/转账）
- 交易市场核心流程（挂牌/购买/撤回）

**运行时机**：

- 每次代码提交后
- 发布前必须通过
- CI/CD流水线中强制执行

### P1级 - 重要功能（建议通过）

重要但不影响系统核心可用性的功能：

- 材料转换风控校验
- 交易幂等性控制
- 数据库字段完整性

**运行时机**：

- 每日构建
- 相关模块修改后
- 发布前建议通过

### bug-fixes/ - 特定bug修复

针对历史bug的回归测试，命名规则：`YYYY-MM-DD-{bug描述}.test.js`

用于：

- 验证bug已被修复
- 防止bug再次出现
- 记录bug修复历史

## 运行指南

```bash
# 运行所有回归测试（发布前）
npm test -- tests/regression/ --runInBand

# 只运行P0级测试（快速验证）
npm test -- tests/regression/p0/

# 只运行P1级测试
npm test -- tests/regression/p1/

# 运行特定bug修复测试
npm test -- tests/regression/bug-fixes/2026-01-30-orphan-frozen.test.js
```

## 测试用例设计原则

### 1. 基于业务需求

- 测试用例来源于用户故事
- 覆盖核心业务流程
- 验证用户关心的功能

### 2. 数据驱动

- 使用真实数据库数据
- 不依赖硬编码的Mock数据
- 测试数据可追溯

### 3. 独立性

- 每个测试可独立运行
- 测试间不相互依赖
- 测试数据自动清理

## 新增回归测试流程

### 1. 确定优先级

- 核心业务路径 → P0
- 重要功能修复 → P1
- 特定bug修复 → bug-fixes

### 2. 创建测试文件

```bash
# P0级测试
touch tests/regression/p0/xxx-feature.test.js

# P1级测试
touch tests/regression/p1/xxx-validation.test.js

# bug修复测试
touch tests/regression/bug-fixes/YYYY-MM-DD-xxx-bug.test.js
```

### 3. 遵循测试规范

- 使用 global.getTestService() 获取服务
- 使用 snake_case 服务名
- 添加清晰的 JSDoc 注释
- 包含业务场景说明

## 与CI/CD集成

```yaml
# CI流水线配置示例
regression-test:
  stage: test
  script:
    # P0测试 - 必须通过
    - npm test -- tests/regression/p0/ --ci --passWithNoTests

    # P1测试 - 建议通过
    - npm test -- tests/regression/p1/ --ci --passWithNoTests || echo "P1 tests failed, continuing..."
```

## 更新日志

- 2026-01-30: 建立P0/P1分级管理目录结构（P2-4.3）
