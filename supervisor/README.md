# Claude Rules Compliance Supervisor

## 系统概述

Claude规则遵守监督系统是一个自动化工具，用于监督Claude是否严格遵守全局规则和项目规则。

## 功能特性

- ✅ **自动监督**: 定期检查Claude的行为是否符合规则
- 📊 **合规评分**: 实时计算合规分数，满分100分
- 🚨 **违规检测**: 自动检测各类违规行为并分级处理
- 📈 **趋势分析**: 分析合规性趋势和改进空间
- 💡 **智能建议**: 提供具体的改进建议和优化方案
- 📱 **可视化仪表板**: 美观的Web界面展示监督结果

## 监督范围

### 全局规则监督
- 核心开发规范
- 工具调用优化规范
- 编码处理和Git管理规范
- 会话工作流程标准
- 问题诊断和状态管理规范
- 文档生成和缓存管理规范

### 用户规则监督
- 代码质量要求
- 错误处理规范
- 中文回答要求
- 深度思考要求
- Git操作规范

## 快速开始

### 1. 启动监督系统
```bash
cd supervisor
./start.sh
```

### 2. 查看状态
```bash
./status.sh
```

### 3. 打开仪表板
在浏览器中打开 `dashboard.html` 文件

### 4. 停止系统
```bash
./stop.sh
```

## 高级用法

### 命令行操作
```bash
# 单次检查
node claude_supervisor.js

# 自动运行
node auto_runner.js start

# 查看仪表板数据
node auto_runner.js dashboard

# 检查状态
node auto_runner.js status
```

### 配置修改
编辑 `config.json` 文件可以调整：
- 监控间隔
- 违规阈值
- 规则权重
- 检查项目

### 报告分析
- 报告保存在 `reports/` 目录
- 警报保存在 `alerts/` 目录
- 日志保存在 `logs/` 目录

## 故障排除

### 常见问题

1. **监督程序无法启动**
   - 检查Node.js版本（需要14+）
   - 验证配置文件格式
   - 确保规则文档存在

2. **权限错误**
   - 运行 `chmod +x *.sh` 设置权限
   - 检查文件夹写入权限

3. **配置文件错误**
   - 验证JSON格式
   - 检查规则文件路径

### 日志查看
```bash
# 查看实时日志
tail -f logs/supervisor.log

# 查看错误日志
grep -i error logs/supervisor.log
```

## 系统架构

```
supervisor/
├── claude_supervisor.js    # 核心监督程序
├── auto_runner.js          # 自动运行器
├── config.json            # 配置文件
├── dashboard.html         # 可视化仪表板
├── start.sh              # 启动脚本
├── stop.sh               # 停止脚本
├── status.sh             # 状态检查脚本
├── reports/              # 报告目录
├── alerts/               # 警报目录
└── logs/                 # 日志目录
```

## 性能监控

系统会监控以下性能指标：
- 工具调用次数和效率
- 并行化执行比例
- 重复操作检测
- 响应质量评估
- Git操作合规性
- 代码质量检查

## 定制开发

系统采用模块化设计，支持：
- 自定义规则添加
- 检查逻辑扩展
- 通知方式定制
- 报告格式调整

## 技术支持

如有问题请检查：
1. 系统日志
2. 配置文件
3. 环境变量
4. 权限设置

## 更新日志

- v1.0.0: 初始版本发布
- 支持全面的规则监督
- 提供可视化仪表板
- 实现自动化运行

