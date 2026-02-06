/**
 * ESLint 配置文件（Flat Config 格式）
 *
 * @file admin/eslint.config.js
 * @description 前端代码规范检查配置
 * @version 1.0.0
 * @date 2026-02-05
 *
 * 核心规范：
 * 1. 禁止前端维护中文映射表 - 应直接使用后端返回的数据
 * 2. 使用 snake_case 命名（与后端保持一致）
 * 3. ES Module 规范
 */

import js from '@eslint/js'
import importPlugin from 'eslint-plugin-import'

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        Alpine: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        requestIdleCallback: 'readonly',
        performance: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        FormData: 'readonly',
        URLSearchParams: 'readonly',
        WebSocket: 'readonly',
        EventSource: 'readonly',
        FileReader: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        AbortController: 'readonly',
        MutationObserver: 'readonly',
        ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly',
        CustomEvent: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLFormElement: 'readonly',
        HTMLImageElement: 'readonly',
        HTMLVideoElement: 'readonly',
        HTMLAudioElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        Event: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        DragEvent: 'readonly',
        ClipboardEvent: 'readonly',
        FocusEvent: 'readonly',
        InputEvent: 'readonly',
        SubmitEvent: 'readonly',
        io: 'readonly',
        // 浏览器 API
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        Notification: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        Image: 'readonly',
        location: 'readonly',
        history: 'readonly',
        navigator: 'readonly',
        // 第三方库
        echarts: 'readonly',
        // Toast 全局函数
        showToast: 'readonly',
        // 项目中的全局函数（来自 composables）
        useRolesPermissionsMethods: 'readonly',
        useAdvancedStatusMethods: 'readonly',
        // Lottery composables
        useCampaignsState: 'readonly',
        usePrizesState: 'readonly',
        useStrategyState: 'readonly',
        useRiskControlState: 'readonly',
        useQuotaState: 'readonly',
        useReportState: 'readonly',
        usePricingState: 'readonly',
        useCampaignsMethods: 'readonly',
        usePrizesMethods: 'readonly',
        useStrategyMethods: 'readonly',
        useRiskControlMethods: 'readonly',
        useQuotaMethods: 'readonly',
        useReportMethods: 'readonly',
        usePricingMethods: 'readonly',
        // System composables
        useConfigState: 'readonly',
        useDictState: 'readonly',
        useFeatureFlagsState: 'readonly',
        useAuditLogsState: 'readonly',
        useConfigMethods: 'readonly',
        useDictMethods: 'readonly',
        useFeatureFlagsMethods: 'readonly',
        useAuditLogsMethods: 'readonly',
        // User composables
        useUsersState: 'readonly',
        useRolesPermissionsState: 'readonly',
        useAdvancedStatusState: 'readonly',
        useUsersMethods: 'readonly',
        useUserProfileState: 'readonly',
        useUserProfileMethods: 'readonly',
        // Analytics composables
        useAlertsState: 'readonly',
        useAlertsMethods: 'readonly',
        useBatchOperationsState: 'readonly',
        useBatchOperationsMethods: 'readonly',
        useBudgetState: 'readonly',
        useBudgetMethods: 'readonly',
        useDailyReportState: 'readonly',
        useDailyReportMethods: 'readonly',
        useMetricsState: 'readonly',
        useMetricsMethods: 'readonly',
        usePresetVisualizationState: 'readonly',
        usePresetVisualizationMethods: 'readonly',
        useRedemptionState: 'readonly',
        useRedemptionMethods: 'readonly',
        useSystemAdvanceState: 'readonly',
        useSystemAdvanceMethods: 'readonly',
        // 浏览器额外 API
        BroadcastChannel: 'readonly',
        File: 'readonly',
        Object: 'readonly',
        // 项目内部 API
        apiRequest: 'readonly'
      }
    },
    plugins: {
      import: importPlugin
    },
    rules: {
      // ==================== 基础规则 ====================
      // Alpine.js 项目中有些函数是动态注册的，使用 warn 而非 error
      'no-undef': 'warn',
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      'no-console': 'off', // 允许 console（Logger 会处理）
      'no-debugger': 'warn',
      'prefer-const': 'warn',
      'no-var': 'error',

      // ==================== 导入规则 ====================
      'import/no-duplicates': 'warn',
      'import/first': 'warn',
      'import/newline-after-import': 'warn',

      // ==================== 代码风格（与 Prettier 配合） ====================
      semi: ['error', 'never'],
      quotes: ['warn', 'single', { avoidEscape: true }],

      // ==================== 禁止模式 ====================
      // 禁止使用 var（使用 const/let）
      'no-var': 'error',

      // ==================== 宽松规则（允许逐步修复） ====================
      // Alpine.js 项目中常见的重新声明
      'no-redeclare': 'warn',
      // switch case 中的变量声明
      'no-case-declarations': 'warn',
      // Object.prototype 方法调用
      'no-prototype-builtins': 'warn',
      // 重复 key（需要修复但不阻塞）
      'no-dupe-keys': 'warn'
    }
  },
  {
    // 忽略的文件
    ignores: [
      'dist/**',
      'node_modules/**',
      '*.min.js',
      'vite.config.js',
      'tailwind.config.js',
      'postcss.config.js',
      'playwright.config.js'
    ]
  }
]

