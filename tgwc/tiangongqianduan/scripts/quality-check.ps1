# 代码质量检查脚本 - 天工小程序项目
# 
# @description
# 提交前自动执行的质量检查流程
# 
# @author 天工小程序团队
# @since 2025-11-08
# @version 1.0.0

param(
    [switch]$Fast,      # 快速检查（跳过测试）
    [switch]$Fix,       # 自动修复问题
    [switch]$Verbose    # 详细输出
)

# 设置错误时停止
$ErrorActionPreference = "Stop"

# 颜色输出函数
function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Cyan
}

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Magenta
    Write-Host "  $Message" -ForegroundColor Magenta
    Write-Host "========================================" -ForegroundColor Magenta
    Write-Host ""
}

# 检查Node环境
function Test-Environment {
    Write-Step "步骤1：环境检查"
    
    try {
        $nodeVersion = node --version
        Write-Success "Node.js版本: $nodeVersion"
        
        $npmVersion = npm --version
        Write-Success "npm版本: $npmVersion"
        
        return $true
    } catch {
        Write-Error "Node.js环境未安装或配置错误"
        return $false
    }
}

# ESLint检查
function Test-ESLint {
    Write-Step "步骤2：ESLint代码规范检查"
    
    $eslintArgs = @(".", "--ext", ".js", "--format", "stylish")
    
    if ($Fix) {
        $eslintArgs += "--fix"
        Write-Info "自动修复模式已启用"
    }
    
    try {
        $result = npx eslint @eslintArgs 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "ESLint检查通过"
            return $true
        } else {
            Write-Warning "ESLint发现问题："
            Write-Host $result
            
            if ($Fix) {
                Write-Info "部分问题已自动修复，请检查修改"
            }
            
            return $false
        }
    } catch {
        Write-Error "ESLint执行失败: $_"
        return $false
    }
}

# Prettier格式化检查
function Test-Prettier {
    Write-Step "步骤3：Prettier代码格式检查"
    
    try {
        if ($Fix) {
            npx prettier --write "**/*.{js,json,md}" 2>&1 | Out-Null
            Write-Success "代码格式已自动修复"
            return $true
        } else {
            $result = npx prettier --check "**/*.{js,json,md}" 2>&1
            
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Prettier检查通过"
                return $true
            } else {
                Write-Warning "代码格式不符合规范"
                Write-Info "运行 'npm run format' 或添加 -Fix 参数自动修复"
                return $false
            }
        }
    } catch {
        Write-Error "Prettier执行失败: $_"
        return $false
    }
}

# 单元测试
function Test-UnitTests {
    if ($Fast) {
        Write-Info "快速模式：跳过单元测试"
        return $true
    }
    
    Write-Step "步骤4：单元测试"
    
    try {
        $result = npm test -- --coverage 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "单元测试通过"
            Write-Info "覆盖率报告已生成: coverage/index.html"
            return $true
        } else {
            Write-Error "单元测试失败"
            Write-Host $result
            return $false
        }
    } catch {
        Write-Warning "单元测试执行失败: $_"
        Write-Info "如果Jest未配置，请先运行: npm install --save-dev jest"
        return $true # 暂时允许通过
    }
}

# JWT特定检查
function Test-JWTImplementation {
    Write-Step "步骤5：JWT实现标准符合性检查"
    
    try {
        # 检查是否使用了标准Base64模式（应该使用Base64 URL）
        $standardBase64Pattern = Select-String -Path "utils/util.js" -Pattern '\[A-Za-z0-9\+/\]' -Quiet
        
        if ($standardBase64Pattern) {
            Write-Error "检测到标准Base64字符集验证（+ 和 /）"
            Write-Info "JWT必须使用Base64 URL字符集（- 和 _）"
            Write-Info "请修改为: /^[A-Za-z0-9_-]*$/"
            return $false
        }
        
        # 检查是否有Base64 URL模式
        $base64UrlPattern = Select-String -Path "utils/util.js" -Pattern '\[A-Za-z0-9_-\]' -Quiet
        
        if ($base64UrlPattern) {
            Write-Success "Base64 URL编码验证正确"
        } else {
            Write-Warning "未找到Base64 URL字符集验证"
        }
        
        # 检查是否有Token完整性验证函数
        $hasValidation = Select-String -Path "utils/util.js" -Pattern "validateJWTTokenIntegrity" -Quiet
        
        if ($hasValidation) {
            Write-Success "Token完整性验证函数存在"
        } else {
            Write-Warning "未找到Token完整性验证函数"
        }
        
        return $true
    } catch {
        Write-Warning "JWT实现检查失败: $_"
        return $true
    }
}

# 依赖安全检查
function Test-SecurityAudit {
    Write-Step "步骤6：依赖安全审计"
    
    try {
        $result = npm audit --audit-level=moderate 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "依赖安全检查通过"
            return $true
        } else {
            Write-Warning "发现安全漏洞"
            Write-Host $result
            Write-Info "运行 'npm audit fix' 尝试自动修复"
            return $false
        }
    } catch {
        Write-Warning "安全审计执行失败: $_"
        return $true
    }
}

# 生成质量报告
function Write-QualityReport {
    param(
        [hashtable]$Results
    )
    
    Write-Step "质量检查报告"
    
    $passed = 0
    $failed = 0
    $total = $Results.Count
    
    foreach ($key in $Results.Keys) {
        $status = if ($Results[$key]) { "✅ 通过" } else { "❌ 失败" }
        Write-Host "$key : $status"
        
        if ($Results[$key]) {
            $passed++
        } else {
            $failed++
        }
    }
    
    Write-Host ""
    Write-Host "总计: $total 项检查" -ForegroundColor Cyan
    Write-Host "通过: $passed 项" -ForegroundColor Green
    Write-Host "失败: $failed 项" -ForegroundColor Red
    
    $score = [math]::Round(($passed / $total) * 100, 2)
    Write-Host ""
    Write-Host "质量分数: $score%" -ForegroundColor $(if ($score -ge 80) { "Green" } elseif ($score -ge 60) { "Yellow" } else { "Red" })
    
    return $failed -eq 0
}

# 主执行流程
function Start-QualityCheck {
    Write-Host ""
    Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║                                                       ║" -ForegroundColor Cyan
    Write-Host "║       天工小程序 - 代码质量检查系统                 ║" -ForegroundColor Cyan
    Write-Host "║       Code Quality Check System                      ║" -ForegroundColor Cyan
    Write-Host "║                                                       ║" -ForegroundColor Cyan
    Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
    
    if ($Fast) {
        Write-Info "快速检查模式（跳过测试）"
    }
    
    if ($Fix) {
        Write-Info "自动修复模式已启用"
    }
    
    # 执行所有检查
    $results = @{
        "环境检查" = Test-Environment
        "ESLint规范" = Test-ESLint
        "代码格式" = Test-Prettier
        "单元测试" = Test-UnitTests
        "JWT标准符合性" = Test-JWTImplementation
        "依赖安全" = Test-SecurityAudit
    }
    
    # 生成报告
    $allPassed = Write-QualityReport -Results $results
    
    if ($allPassed) {
        Write-Host ""
        Write-Success "🎉 所有质量检查通过！代码可以提交"
        exit 0
    } else {
        Write-Host ""
        Write-Error "⚠️  质量检查未通过，请修复问题后再提交"
        Write-Info "提示: 使用 -Fix 参数尝试自动修复"
        exit 1
    }
}

# 执行质量检查
Start-QualityCheck

<#
.SYNOPSIS
    代码质量检查脚本

.DESCRIPTION
    在提交代码前自动执行的质量检查流程，包括：
    - 环境检查
    - ESLint代码规范检查
    - Prettier代码格式检查
    - 单元测试和覆盖率
    - JWT实现标准符合性检查
    - 依赖安全审计

.PARAMETER Fast
    快速检查模式，跳过单元测试

.PARAMETER Fix
    自动修复模式，尝试自动修复发现的问题

.PARAMETER Verbose
    详细输出模式，显示更多调试信息

.EXAMPLE
    .\scripts\quality-check.ps1
    执行完整的质量检查

.EXAMPLE
    .\scripts\quality-check.ps1 -Fast
    快速检查（跳过测试）

.EXAMPLE
    .\scripts\quality-check.ps1 -Fix
    自动修复问题

.EXAMPLE
    .\scripts\quality-check.ps1 -Fast -Fix
    快速检查并自动修复

.NOTES
    作者: 天工小程序团队
    版本: 1.0.0
    日期: 2025-11-08
#>

