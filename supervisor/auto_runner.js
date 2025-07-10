#!/usr/bin/env node

/**
 * Claude Supervisor Auto Runner
 * 自动运行监督程序，提供定期检查和实时监控功能
 */

const fs = require('fs');
const path = require('path');
const ClaudeSupervisor = require('./claude_supervisor');

class SupervisorAutoRunner {
    constructor() {
        this.supervisor = new ClaudeSupervisor();
        this.config = this.supervisor.config.supervisor_config;
        this.isRunning = false;
        this.intervalId = null;
        this.lastReport = null;
        this.sessionTracker = new SessionTracker();
    }

    /**
     * 启动自动监督
     */
    start() {
        if (this.isRunning) {
            console.log('⚠️ 监督程序已在运行中');
            return;
        }

        console.log('🚀 启动Claude规则监督自动检查系统...');
        console.log(`📋 配置信息:`);
        console.log(`   - 监控间隔: ${this.config.monitoring_interval}秒`);
        console.log(`   - 违规阈值: ${this.config.max_violations_threshold}`);
        console.log(`   - 日志级别: ${this.config.log_level}`);

        this.isRunning = true;
        
        // 立即执行一次检查
        this.runCheck();
        
        // 设置定期检查
        this.intervalId = setInterval(() => {
            this.runCheck();
        }, this.config.monitoring_interval * 1000);

        // 启动实时监控
        this.startRealTimeMonitoring();
        
        console.log('✅ 监督系统启动成功');
    }

    /**
     * 停止自动监督
     */
    stop() {
        if (!this.isRunning) {
            console.log('⚠️ 监督程序未在运行');
            return;
        }

        console.log('🛑 停止Claude规则监督系统...');
        
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.stopRealTimeMonitoring();
        
        console.log('✅ 监督系统已停止');
    }

    /**
     * 执行检查
     */
    async runCheck() {
        try {
            console.log(`\n🔍 [${new Date().toLocaleString()}] 执行定期监督检查...`);
            
            // 收集会话数据
            const sessionData = await this.sessionTracker.collectSessionData();
            
            // 运行监督检查
            const report = await this.supervisor.runSupervision(sessionData);
            this.lastReport = report;
            
            // 检查是否超过阈值
            if (report.violations_summary.total > this.config.max_violations_threshold) {
                this.handleExcessiveViolations(report);
            }
            
            // 发送通知
            await this.sendNotification(report);
            
        } catch (error) {
            console.error(`❌ 监督检查执行失败: ${error.message}`);
        }
    }

    /**
     * 处理过多违规
     */
    handleExcessiveViolations(report) {
        console.log('🚨 警报: 违规次数超过阈值!');
        console.log(`   违规总数: ${report.violations_summary.total}`);
        console.log(`   阈值: ${this.config.max_violations_threshold}`);
        
        // 创建警报文件
        const alertPath = path.join(__dirname, 'alerts', `alert_${Date.now()}.json`);
        const alertsDir = path.dirname(alertPath);
        
        if (!fs.existsSync(alertsDir)) {
            fs.mkdirSync(alertsDir, { recursive: true });
        }
        
        fs.writeFileSync(alertPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'CRITICAL',
            message: '违规次数超过阈值',
            violations_count: report.violations_summary.total,
            threshold: this.config.max_violations_threshold,
            report_summary: report.violations_summary
        }, null, 2));
        
        console.log(`📢 警报已保存: ${alertPath}`);
    }

    /**
     * 发送通知
     */
    async sendNotification(report) {
        // 这里可以扩展为发送邮件、Slack通知等
        if (report.compliance_score < 70) {
            console.log('📢 通知: 合规分数过低，需要立即关注!');
        }
    }

    /**
     * 启动实时监控
     */
    startRealTimeMonitoring() {
        console.log('👀 启动实时监控...');
        
        // 监控日志文件变化
        this.watchLogFiles();
        
        // 监控配置文件变化
        this.watchConfigFiles();
    }

    /**
     * 停止实时监控
     */
    stopRealTimeMonitoring() {
        console.log('🔇 停止实时监控...');
        // 清理文件监听器
        if (this.logWatcher) {
            this.logWatcher.close();
        }
        if (this.configWatcher) {
            this.configWatcher.close();
        }
    }

    /**
     * 监控日志文件
     */
    watchLogFiles() {
        const logFiles = ['app.log', 'server.log'];
        
        logFiles.forEach(logFile => {
            if (fs.existsSync(logFile)) {
                this.logWatcher = fs.watch(logFile, (eventType, filename) => {
                    if (eventType === 'change') {
                        this.analyzeLogChanges(logFile);
                    }
                });
            }
        });
    }

    /**
     * 监控配置文件
     */
    watchConfigFiles() {
        const configPath = path.join(__dirname, 'config.json');
        
        if (fs.existsSync(configPath)) {
            this.configWatcher = fs.watch(configPath, (eventType, filename) => {
                if (eventType === 'change') {
                    console.log('📝 配置文件已更新，重新加载配置...');
                    this.supervisor.config = this.supervisor.loadConfig();
                    this.config = this.supervisor.config.supervisor_config;
                }
            });
        }
    }

    /**
     * 分析日志变化
     */
    analyzeLogChanges(logFile) {
        try {
            const content = fs.readFileSync(logFile, 'utf8');
            const lines = content.split('\n').slice(-10); // 只分析最后10行
            
            // 检查错误模式
            const errorPatterns = [
                /ERROR/i,
                /CRITICAL/i,
                /FAIL/i,
                /Exception/i,
                /Error:/i
            ];
            
            for (const line of lines) {
                for (const pattern of errorPatterns) {
                    if (pattern.test(line)) {
                        console.log(`⚠️ 检测到错误日志: ${line.trim()}`);
                        break;
                    }
                }
            }
            
        } catch (error) {
            // 忽略读取错误
        }
    }

    /**
     * 获取状态
     */
    getStatus() {
        return {
            is_running: this.isRunning,
            last_check: this.lastReport?.timestamp,
            compliance_score: this.lastReport?.compliance_score,
            violations_count: this.lastReport?.violations_summary?.total || 0,
            uptime: this.isRunning ? Date.now() - this.startTime : 0
        };
    }

    /**
     * 生成仪表板数据
     */
    generateDashboardData() {
        const reportsDir = path.join(__dirname, 'reports');
        const reports = [];
        
        if (fs.existsSync(reportsDir)) {
            const files = fs.readdirSync(reportsDir)
                .filter(file => file.endsWith('.json'))
                .sort()
                .slice(-7); // 最近7天
            
            for (const file of files) {
                try {
                    const content = fs.readFileSync(path.join(reportsDir, file), 'utf8');
                    const report = JSON.parse(content);
                    reports.push({
                        date: file.replace('compliance_report_', '').replace('.json', ''),
                        score: report.compliance_score,
                        violations: report.violations_summary.total
                    });
                } catch (error) {
                    // 忽略解析错误
                }
            }
        }
        
        return {
            current_status: this.getStatus(),
            recent_reports: reports,
            trends: this.calculateTrends(reports),
            alerts: this.getRecentAlerts()
        };
    }

    /**
     * 计算趋势
     */
    calculateTrends(reports) {
        if (reports.length < 2) {
            return { trend: 'insufficient_data' };
        }
        
        const latest = reports[reports.length - 1];
        const previous = reports[reports.length - 2];
        
        const scoreTrend = latest.score - previous.score;
        const violationsTrend = latest.violations - previous.violations;
        
        return {
            score_trend: scoreTrend > 0 ? 'improving' : scoreTrend < 0 ? 'declining' : 'stable',
            violations_trend: violationsTrend < 0 ? 'improving' : violationsTrend > 0 ? 'worsening' : 'stable',
            score_change: scoreTrend,
            violations_change: violationsTrend
        };
    }

    /**
     * 获取最近警报
     */
    getRecentAlerts() {
        const alertsDir = path.join(__dirname, 'alerts');
        const alerts = [];
        
        if (fs.existsSync(alertsDir)) {
            const files = fs.readdirSync(alertsDir)
                .filter(file => file.endsWith('.json'))
                .sort()
                .slice(-5); // 最近5个警报
            
            for (const file of files) {
                try {
                    const content = fs.readFileSync(path.join(alertsDir, file), 'utf8');
                    alerts.push(JSON.parse(content));
                } catch (error) {
                    // 忽略解析错误
                }
            }
        }
        
        return alerts;
    }
}

/**
 * 会话数据追踪器
 */
class SessionTracker {
    constructor() {
        this.sessionData = {
            toolCalls: [],
            responses: [],
            gitOperations: [],
            codeChanges: []
        };
    }

    /**
     * 收集会话数据
     */
    async collectSessionData() {
        // 这里应该实现真实的会话数据收集
        // 目前返回模拟数据
        
        // 分析日志文件获取工具调用信息
        await this.analyzeLogFiles();
        
        // 分析Git历史
        await this.analyzeGitHistory();
        
        // 分析代码变更
        await this.analyzeCodeChanges();
        
        return this.sessionData;
    }

    /**
     * 分析日志文件
     */
    async analyzeLogFiles() {
        try {
            const logFiles = ['app.log', 'server.log'];
            
            for (const logFile of logFiles) {
                if (fs.existsSync(logFile)) {
                    const content = fs.readFileSync(logFile, 'utf8');
                    const lines = content.split('\n').slice(-100); // 分析最后100行
                    
                    // 提取API调用信息
                    for (const line of lines) {
                        if (line.includes('API请求') || line.includes('API响应')) {
                            this.sessionData.toolCalls.push({
                                tool: 'api_call',
                                parameters: { log_line: line },
                                timestamp: Date.now()
                            });
                        }
                    }
                }
            }
        } catch (error) {
            // 忽略错误
        }
    }

    /**
     * 分析Git历史
     */
    async analyzeGitHistory() {
        // 这里可以分析Git历史获取操作信息
        // 当前为简化实现
    }

    /**
     * 分析代码变更
     */
    async analyzeCodeChanges() {
        // 这里可以分析最近的代码变更
        // 当前为简化实现
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const runner = new SupervisorAutoRunner();
    
    // 处理命令行参数
    const args = process.argv.slice(2);
    const command = args[0] || 'start';
    
    switch (command) {
        case 'start':
            runner.start();
            break;
        case 'stop':
            runner.stop();
            process.exit(0);
            break;
        case 'status':
            console.log('📊 当前状态:', runner.getStatus());
            process.exit(0);
            break;
        case 'dashboard':
            console.log('📈 仪表板数据:', JSON.stringify(runner.generateDashboardData(), null, 2));
            process.exit(0);
            break;
        case 'check':
            runner.runCheck().then(() => process.exit(0));
            break;
        default:
            console.log('使用方法:');
            console.log('  node auto_runner.js start     - 启动自动监督');
            console.log('  node auto_runner.js stop      - 停止自动监督');
            console.log('  node auto_runner.js status    - 查看状态');
            console.log('  node auto_runner.js dashboard - 查看仪表板');
            console.log('  node auto_runner.js check     - 执行单次检查');
            process.exit(1);
    }
    
    // 优雅退出处理
    process.on('SIGINT', () => {
        console.log('\n📡 收到退出信号...');
        runner.stop();
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        console.log('\n📡 收到终止信号...');
        runner.stop();
        process.exit(0);
    });
}

module.exports = SupervisorAutoRunner; 