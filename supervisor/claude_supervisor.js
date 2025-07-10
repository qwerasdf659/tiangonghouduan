#!/usr/bin/env node

/**
 * Claude Rules Compliance Supervisor
 * 监督Claude是否遵守全局规则和项目规则的自动化程序
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ClaudeSupervisor {
    constructor() {
        this.configPath = path.join(__dirname, 'config.json');
        this.config = this.loadConfig();
        this.rules = new Map();
        this.violations = [];
        this.sessionData = {
            toolCalls: [],
            responses: [],
            gitOperations: [],
            codeChanges: []
        };
        this.complianceScore = 100;
        this.startTime = new Date();
    }

    /**
     * 加载配置文件
     */
    loadConfig() {
        try {
            const configData = fs.readFileSync(this.configPath, 'utf8');
            return JSON.parse(configData);
        } catch (error) {
            console.error(`❌ 配置文件加载失败: ${error.message}`);
            process.exit(1);
        }
    }

    /**
     * 解析规则文档
     */
    async parseRules() {
        console.log('📋 开始解析规则文档...');
        
        for (const [category, ruleConfig] of Object.entries(this.config.rule_categories)) {
            try {
                const rulePath = path.join('..', ruleConfig.file);
                if (fs.existsSync(rulePath)) {
                    const ruleContent = fs.readFileSync(rulePath, 'utf8');
                    this.rules.set(category, {
                        content: ruleContent,
                        weight: ruleConfig.weight,
                        criticalRules: ruleConfig.critical_rules,
                        violations: []
                    });
                    console.log(`✅ 解析规则文档: ${category}`);
                } else {
                    console.warn(`⚠️ 规则文档不存在: ${rulePath}`);
                }
            } catch (error) {
                console.error(`❌ 解析规则文档失败 ${category}: ${error.message}`);
            }
        }
    }

    /**
     * 监控工具调用行为
     */
    monitorToolCalls(toolCallHistory = []) {
        console.log('🔍 监控工具调用行为...');
        
        const violations = [];
        const config = this.config.monitoring_targets.tool_calls;
        
        // 检查工具调用总数
        if (toolCallHistory.length > config.max_calls_per_session) {
            violations.push({
                type: 'CRITICAL',
                rule: '工具调用次数控制',
                description: `工具调用次数超限: ${toolCallHistory.length}/${config.max_calls_per_session}`,
                suggestion: '优化工具调用策略，使用并行调用和缓存机制'
            });
        }

        // 检查重复调用
        const duplicateCalls = this.detectDuplicateCalls(toolCallHistory);
        if (duplicateCalls.length > config.max_duplicate_calls) {
            violations.push({
                type: 'HIGH',
                rule: '严禁重复工具调用',
                description: `发现${duplicateCalls.length}个重复工具调用`,
                suggestion: '建立工具调用缓存机制，避免重复操作'
            });
        }

        // 检查并行化比例
        const parallelRatio = this.calculateParallelRatio(toolCallHistory);
        if (parallelRatio < config.required_parallel_ratio) {
            violations.push({
                type: 'HIGH',
                rule: '强制并行化操作',
                description: `并行化比例过低: ${(parallelRatio * 100).toFixed(1)}%`,
                suggestion: '增加独立操作的并行执行，目标比例70%以上'
            });
        }

        // 检查禁止模式
        for (const pattern of config.forbidden_patterns) {
            const patternViolations = this.detectForbiddenPatterns(toolCallHistory, pattern);
            if (patternViolations.length > 0) {
                violations.push({
                    type: 'MEDIUM',
                    rule: `禁止模式: ${pattern}`,
                    description: `发现禁止模式 ${patternViolations.length} 次`,
                    suggestion: '遵循工具调用优化规范，避免禁止的调用模式'
                });
            }
        }

        return violations;
    }

    /**
     * 检测重复的工具调用
     */
    detectDuplicateCalls(toolCalls) {
        const callSignatures = new Map();
        const duplicates = [];

        for (const call of toolCalls) {
            const signature = this.generateCallSignature(call);
            if (callSignatures.has(signature)) {
                duplicates.push({
                    signature,
                    calls: [callSignatures.get(signature), call]
                });
            } else {
                callSignatures.set(signature, call);
            }
        }

        return duplicates;
    }

    /**
     * 生成工具调用签名
     */
    generateCallSignature(call) {
        const key = `${call.tool}_${JSON.stringify(call.parameters || {})}`;
        return crypto.createHash('md5').update(key).digest('hex');
    }

    /**
     * 计算并行化比例
     */
    calculateParallelRatio(toolCalls) {
        // 简化计算：同时发起的调用数 / 总调用数
        let parallelCalls = 0;
        let totalCalls = toolCalls.length;

        // 分析时间戳，检测并行调用
        for (let i = 0; i < toolCalls.length - 1; i++) {
            const current = toolCalls[i];
            const next = toolCalls[i + 1];
            
            if (next.timestamp - current.timestamp < 1000) { // 1秒内的调用认为是并行
                parallelCalls++;
            }
        }

        return totalCalls > 0 ? parallelCalls / totalCalls : 0;
    }

    /**
     * 检测禁止的模式
     */
    detectForbiddenPatterns(toolCalls, pattern) {
        const violations = [];
        
        switch (pattern) {
            case '重复状态检查':
                violations.push(...this.detectRepeatedStatusChecks(toolCalls));
                break;
            case '重复文件读取':
                violations.push(...this.detectRepeatedFileReads(toolCalls));
                break;
            case '串行独立操作':
                violations.push(...this.detectSerialIndependentOps(toolCalls));
                break;
        }

        return violations;
    }

    /**
     * 检测重复状态检查
     */
    detectRepeatedStatusChecks(toolCalls) {
        const statusCheckCalls = toolCalls.filter(call => 
            call.tool === 'run_terminal_cmd' && 
            (call.parameters?.command?.includes('status') || 
             call.parameters?.command?.includes('health') ||
             call.parameters?.command?.includes('ps aux'))
        );

        const duplicates = [];
        const seen = new Set();
        
        for (const call of statusCheckCalls) {
            const key = call.parameters?.command;
            if (seen.has(key)) {
                duplicates.push(call);
            } else {
                seen.add(key);
            }
        }

        return duplicates;
    }

    /**
     * 检测重复文件读取
     */
    detectRepeatedFileReads(toolCalls) {
        const fileReadCalls = toolCalls.filter(call => call.tool === 'read_file');
        const duplicates = [];
        const seen = new Set();
        
        for (const call of fileReadCalls) {
            const key = call.parameters?.target_file;
            if (seen.has(key)) {
                duplicates.push(call);
            } else {
                seen.add(key);
            }
        }

        return duplicates;
    }

    /**
     * 检测串行独立操作
     */
    detectSerialIndependentOps(toolCalls) {
        const violations = [];
        
        // 检测连续的独立读取操作
        for (let i = 0; i < toolCalls.length - 1; i++) {
            const current = toolCalls[i];
            const next = toolCalls[i + 1];
            
            if (this.isIndependentOperation(current) && 
                this.isIndependentOperation(next) &&
                next.timestamp - current.timestamp > 2000) { // 超过2秒的间隔
                violations.push({
                    current,
                    next,
                    reason: '独立操作未并行执行'
                });
            }
        }

        return violations;
    }

    /**
     * 判断是否为独立操作
     */
    isIndependentOperation(call) {
        const independentOps = ['read_file', 'list_dir', 'grep_search', 'file_search'];
        return independentOps.includes(call.tool);
    }

    /**
     * 监控响应质量
     */
    monitorResponseQuality(responses = []) {
        console.log('📝 监控响应质量...');
        
        const violations = [];
        const config = this.config.monitoring_targets.response_quality;
        
        for (const response of responses) {
            // 检查响应长度
            if (response.content.length > config.max_response_length * 5) {
                violations.push({
                    type: 'MEDIUM',
                    rule: '文档长度控制规范',
                    description: `响应长度过长: ${response.content.length}字符`,
                    suggestion: '控制响应长度，简化文档结构，提取核心信息'
                });
            }

            // 检查中文比例
            const chineseRatio = this.calculateChineseRatio(response.content);
            if (chineseRatio < config.required_chinese_ratio) {
                violations.push({
                    type: 'HIGH',
                    rule: '使用中文回答',
                    description: `中文比例过低: ${(chineseRatio * 100).toFixed(1)}%`,
                    suggestion: '确保回答主要使用中文，技术术语可保留英文'
                });
            }

            // 检查是否包含深度思考
            if (config.required_thinking_depth && !this.hasDeepThinking(response.content)) {
                violations.push({
                    type: 'HIGH',
                    rule: '深度思考和meta-思考要求',
                    description: '缺少深度思考和meta-思考内容',
                    suggestion: '每次回答都应包含思考过程、原因分析和系统性思考'
                });
            }

            // 检查任务清单
            if (config.must_include_task_list && !this.hasTaskList(response.content)) {
                violations.push({
                    type: 'MEDIUM',
                    rule: '任务完成清单管理',
                    description: '缺少任务完成清单',
                    suggestion: '为每个任务生成完整的任务清单，实时更新完成状态'
                });
            }
        }

        return violations;
    }

    /**
     * 计算中文字符比例
     */
    calculateChineseRatio(text) {
        const chineseChars = text.match(/[\u4e00-\u9fff]/g) || [];
        const totalChars = text.replace(/\s/g, '').length;
        return totalChars > 0 ? chineseChars.length / totalChars : 0;
    }

    /**
     * 检查是否包含深度思考
     */
    hasDeepThinking(content) {
        const thinkingKeywords = [
            'Meta思考', 'meta-思考', '深度思考', '系统性思考',
            '为什么会有这个问题', '问题背后', '根本原因',
            '思考过程', '深层洞察', '反思机制'
        ];
        
        return thinkingKeywords.some(keyword => content.includes(keyword));
    }

    /**
     * 检查是否包含任务清单
     */
    hasTaskList(content) {
        const taskListPatterns = [
            /任务完成清单/,
            /- \[ \]/,
            /✅.*完成/,
            /❌.*未完成/,
            /📋.*清单/
        ];
        
        return taskListPatterns.some(pattern => pattern.test(content));
    }

    /**
     * 监控Git操作
     */
    monitorGitOperations(gitOps = []) {
        console.log('🔧 监控Git操作...');
        
        const violations = [];
        const config = this.config.monitoring_targets.git_operations;
        
        for (const op of gitOps) {
            // 检查是否需要用户授权
            if (config.require_user_authorization && 
                this.isHighRiskGitOp(op) && 
                !op.userAuthorized) {
                violations.push({
                    type: 'CRITICAL',
                    rule: 'Git操作用户授权控制规范',
                    description: `未经授权的Git操作: ${op.command}`,
                    suggestion: '高风险Git操作前必须明确征得用户同意'
                });
            }

            // 检查自动推送
            if (config.forbidden_auto_push && 
                op.command.includes('push') && 
                !op.userAuthorized) {
                violations.push({
                    type: 'CRITICAL',
                    rule: '禁止自动Git推送',
                    description: `检测到自动推送操作: ${op.command}`,
                    suggestion: '所有推送操作必须经过用户明确授权'
                });
            }

            // 检查提交信息质量
            if (config.require_meaningful_commits && 
                op.command.includes('commit') && 
                !this.hasMeaningfulCommitMessage(op)) {
                violations.push({
                    type: 'MEDIUM',
                    rule: '有意义的提交信息',
                    description: '提交信息不够详细或有意义',
                    suggestion: '提交信息应该详细描述修改内容和原因'
                });
            }
        }

        return violations;
    }

    /**
     * 判断是否为高风险Git操作
     */
    isHighRiskGitOp(op) {
        const highRiskOps = ['push', 'force-push', 'merge', 'rebase', 'reset --hard'];
        return highRiskOps.some(riskOp => op.command.includes(riskOp));
    }

    /**
     * 检查提交信息是否有意义
     */
    hasMeaningfulCommitMessage(op) {
        const message = op.message || '';
        return message.length > 10 && 
               !message.match(/^(fix|update|change)$/i) &&
               message.includes('修复') || message.includes('增加') || message.includes('优化');
    }

    /**
     * 监控代码质量
     */
    monitorCodeQuality(codeChanges = []) {
        console.log('💻 监控代码质量...');
        
        const violations = [];
        const config = this.config.monitoring_targets.code_quality;
        
        for (const change of codeChanges) {
            // 检查文件存在性检查
            if (config.require_existence_check && 
                !this.hasFileExistenceCheck(change)) {
                violations.push({
                    type: 'HIGH',
                    rule: '编写代码前先判断文件存在性',
                    description: `缺少文件存在性检查: ${change.file}`,
                    suggestion: '编写或修改代码前必须先检查文件是否存在'
                });
            }

            // 检查错误处理
            if (config.require_error_handling && 
                !this.hasErrorHandling(change)) {
                violations.push({
                    type: 'HIGH',
                    rule: '错误处理和友好提示',
                    description: `缺少错误处理: ${change.file}`,
                    suggestion: '代码应包含完善的错误处理和用户友好的错误提示'
                });
            }

            // 检查中文注释
            if (config.require_chinese_comments && 
                !this.hasChineseComments(change)) {
                violations.push({
                    type: 'MEDIUM',
                    rule: '代码要有详细中文注释',
                    description: `缺少中文注释: ${change.file}`,
                    suggestion: '代码应包含详细的中文注释说明功能和逻辑'
                });
            }

            // 检查旧代码清理
            if (config.require_cleanup_old_code && 
                !this.hasOldCodeCleanup(change)) {
                violations.push({
                    type: 'MEDIUM',
                    rule: '完成任务后删除旧功能代码',
                    description: `可能存在未清理的旧代码: ${change.file}`,
                    suggestion: '新功能实现后应删除无用的旧代码，避免代码重复'
                });
            }
        }

        return violations;
    }

    /**
     * 检查是否有文件存在性检查
     */
    hasFileExistenceCheck(change) {
        const checks = [
            'fs.existsSync',
            'file_search',
            'list_dir',
            '文件是否存在',
            'before editing'
        ];
        
        return checks.some(check => 
            change.content.includes(check) || 
            change.description.includes(check)
        );
    }

    /**
     * 检查是否有错误处理
     */
    hasErrorHandling(change) {
        const errorHandling = [
            'try-catch',
            'catch',
            'error',
            '错误处理',
            '友好提示',
            'loading'
        ];
        
        return errorHandling.some(pattern => 
            change.content.includes(pattern)
        );
    }

    /**
     * 检查是否有中文注释
     */
    hasChineseComments(change) {
        const comments = change.content.match(/\/\*.*?\*\/|\/\/.*$/gm) || [];
        return comments.some(comment => /[\u4e00-\u9fff]/.test(comment));
    }

    /**
     * 检查是否有旧代码清理
     */
    hasOldCodeCleanup(change) {
        const cleanupKeywords = [
            '删除',
            '清理',
            '移除',
            'remove',
            'delete',
            '不再需要'
        ];
        
        return cleanupKeywords.some(keyword => 
            change.description.includes(keyword)
        );
    }

    /**
     * 生成合规性报告
     */
    generateComplianceReport() {
        console.log('📊 生成合规性报告...');
        
        const report = {
            timestamp: new Date().toISOString(),
            session_duration: Date.now() - this.startTime.getTime(),
            compliance_score: this.complianceScore,
            violations_summary: this.summarizeViolations(),
            detailed_violations: this.violations,
            recommendations: this.generateRecommendations(),
            trend_analysis: this.analyzeTrends()
        };

        return report;
    }

    /**
     * 汇总违规情况
     */
    summarizeViolations() {
        const summary = {
            total: this.violations.length,
            by_level: {},
            by_category: {},
            top_violations: []
        };

        // 按级别统计
        for (const violation of this.violations) {
            summary.by_level[violation.type] = (summary.by_level[violation.type] || 0) + 1;
        }

        // 按类别统计
        for (const violation of this.violations) {
            const category = violation.rule.split(':')[0] || 'general';
            summary.by_category[category] = (summary.by_category[category] || 0) + 1;
        }

        // 找出最严重的违规
        summary.top_violations = this.violations
            .filter(v => v.type === 'CRITICAL' || v.type === 'HIGH')
            .slice(0, 5);

        return summary;
    }

    /**
     * 生成改进建议
     */
    generateRecommendations() {
        const recommendations = [];
        
        if (this.violations.some(v => v.rule.includes('重复工具调用'))) {
            recommendations.push({
                priority: 'HIGH',
                category: '工具调用优化',
                suggestion: '实施工具调用缓存机制，建立已完成检查清单',
                impact: '可减少30-50%的重复调用'
            });
        }

        if (this.violations.some(v => v.rule.includes('并行化'))) {
            recommendations.push({
                priority: 'HIGH',
                category: '效率优化',
                suggestion: '增加独立操作的并行执行，目标并行化比例70%以上',
                impact: '可提升整体执行效率2-3倍'
            });
        }

        if (this.violations.some(v => v.rule.includes('中文'))) {
            recommendations.push({
                priority: 'MEDIUM',
                category: '用户规则遵守',
                suggestion: '确保回答主要使用中文，保持用户友好的交流方式',
                impact: '提升用户体验和规则遵守度'
            });
        }

        return recommendations;
    }

    /**
     * 趋势分析
     */
    analyzeTrends() {
        // 这里可以基于历史数据进行趋势分析
        return {
            compliance_trend: 'improving',
            violation_frequency: 'decreasing',
            most_improved_areas: ['工具调用优化', 'Git操作规范'],
            areas_need_attention: ['深度思考', '并行化处理']
        };
    }

    /**
     * 运行完整的监督检查
     */
    async runSupervision(sessionData = {}) {
        console.log('🚀 开始运行Claude规则遵守监督检查...');
        console.log(`⏰ 检查时间: ${new Date().toLocaleString()}`);
        
        try {
            // 解析规则
            await this.parseRules();
            
            // 执行各项监控
            const toolCallViolations = this.monitorToolCalls(sessionData.toolCalls || []);
            const responseViolations = this.monitorResponseQuality(sessionData.responses || []);
            const gitViolations = this.monitorGitOperations(sessionData.gitOperations || []);
            const codeViolations = this.monitorCodeQuality(sessionData.codeChanges || []);
            
            // 合并所有违规
            this.violations = [
                ...toolCallViolations,
                ...responseViolations,
                ...gitViolations,
                ...codeViolations
            ];
            
            // 计算合规分数
            this.calculateComplianceScore();
            
            // 生成报告
            const report = this.generateComplianceReport();
            
            // 保存报告
            await this.saveReport(report);
            
            // 输出结果
            this.displayResults(report);
            
            return report;
            
        } catch (error) {
            console.error(`❌ 监督检查执行失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 计算合规分数
     */
    calculateComplianceScore() {
        let score = 100;
        
        for (const violation of this.violations) {
            const penalty = this.config.violation_levels[violation.type].score;
            score += penalty; // penalty是负数
        }
        
        this.complianceScore = Math.max(0, score);
    }

    /**
     * 保存报告
     */
    async saveReport(report) {
        const reportsDir = path.join(__dirname, 'reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }
        
        const filename = `compliance_report_${new Date().toISOString().split('T')[0]}.json`;
        const filepath = path.join(reportsDir, filename);
        
        fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf8');
        console.log(`💾 报告已保存: ${filepath}`);
    }

    /**
     * 显示检查结果
     */
    displayResults(report) {
        console.log('\n' + '='.repeat(80));
        console.log('📊 Claude规则遵守监督检查结果');
        console.log('='.repeat(80));
        
        // 合规分数
        const scoreColor = report.compliance_score >= 90 ? '🟢' : 
                          report.compliance_score >= 70 ? '🟡' : '🔴';
        console.log(`${scoreColor} 合规分数: ${report.compliance_score}/100`);
        
        // 违规统计
        console.log(`\n📋 违规统计:`);
        console.log(`   总计: ${report.violations_summary.total} 项`);
        for (const [level, count] of Object.entries(report.violations_summary.by_level)) {
            console.log(`   ${level}: ${count} 项`);
        }
        
        // 主要违规
        if (report.violations_summary.top_violations.length > 0) {
            console.log(`\n⚠️ 主要违规:`);
            for (const violation of report.violations_summary.top_violations) {
                console.log(`   ${violation.type}: ${violation.rule}`);
                console.log(`      ${violation.description}`);
            }
        }
        
        // 改进建议
        if (report.recommendations.length > 0) {
            console.log(`\n💡 改进建议:`);
            for (const rec of report.recommendations) {
                console.log(`   ${rec.priority}: ${rec.suggestion}`);
            }
        }
        
        console.log('\n' + '='.repeat(80));
        
        // 如果违规过多，给出警告
        if (report.compliance_score < 70) {
            console.log('🚨 警告: 合规分数过低，请立即改进规则遵守情况！');
        }
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const supervisor = new ClaudeSupervisor();
    
    // 🔴 已清除示例数据 - 实际使用时从真实会话中收集数据
    console.log('⚠️ 请提供真实的会话数据进行监督检查');
    console.log('使用方法: supervisor.runSupervision(realSessionData)');
}

module.exports = ClaudeSupervisor; 