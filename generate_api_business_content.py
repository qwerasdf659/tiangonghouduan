#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
API业务内容智能生成脚本
根据API的功能路径和描述，自动生成业务场景说明和业务规则
"""

import re

# API分类和对应的业务场景模板
API_SCENARIOS = {
    'auth': {
        'login': [
            '**用户首次注册场景**: 新用户输入手机号和验证码完成注册，系统自动创建账号、积分账户并分配默认角色',
            '**老用户快速登录场景**: 已注册用户使用手机号验证码快速登录，无需记忆复杂密码',
            '**多设备登录场景**: 用户可在多台设备同时登录，系统通过Token管理各设备会话',
            '**安全验证场景**: 系统验证手机号格式和验证码有效性，防止非法登录',
            '**自动初始化场景**: 新用户注册后自动创建积分账户和分配基础权限'
        ],
        'profile': [
            '**个人信息查看场景**: 用户查看自己的基本信息、角色、积分余额等',
            '**信息完整性验证场景**: 检查用户资料是否完整，提示用户补充必要信息',
            '**权限确认场景**: 用户查看自己拥有的角色和权限范围',
            '**账户状态检查场景**: 确认账户是否正常、是否被禁用',
            '**数据同步场景**: 获取最新的用户数据，确保前端显示准确'
        ],
        'verify': [
            '**Token有效性验证场景**: 前端路由守卫验证Token是否过期',
            '**自动刷新Token场景**: Token即将过期时自动使用refreshToken刷新',
            '**安全防护场景**: 防止使用过期或伪造的Token访问系统',
            '**会话保持场景**: 用户操作过程中持续验证登录状态',
            '**异常登出场景**: Token无效时自动跳转登录页面'
        ],
        'refresh': [
            '**Token自动刷新场景**: accessToken过期前使用refreshToken获取新Token',
            '**无感刷新场景**: 后台自动刷新Token，用户无感知',
            '**长时间登录场景**: 用户长时间使用系统，通过刷新机制保持登录',
            '**安全控制场景**: refreshToken过期后强制用户重新登录',
            '**设备管理场景**: 每个设备独立的Token刷新机制'
        ],
        'logout': [
            '**主动退出场景**: 用户点击退出按钮主动退出登录',
            '**清理会话场景': 退出时清理Token和缓存数据',
            '**多设备管理场景**: 用户可选择退出当前设备或所有设备',
            '**安全防护场景**: 退出后立即使Token失效，防止被盗用',
            '**日志记录场景**: 记录用户退出时间和设备信息'
        ]
    },
    'lottery': {
        'draw': [
            '**用户参与抽奖场景**: 用户消耗积分参与指定活动的抽奖',
            '**中奖结果生成场景**: 系统根据概率和保底机制计算抽奖结果',
            '**奖品发放场景**: 中奖后自动将奖品添加到用户库存',
            '**积分扣除场景**: 抽奖成功后扣除相应积分并记录交易',
            '**防重复抽奖场景': 使用幂等性机制防止重复扣费'
        ],
        'history': [
            '**历史记录查询场景**: 用户查看自己的抽奖历史记录',
            '**中奖统计场景**: 展示用户总抽奖次数、中奖次数、中奖率',
            '**奖品分类展示场景**: 按奖品类型、时间等维度展示历史',
            '**管理员审计场景**: 管理员查看用户抽奖记录进行审计',
            '**数据分析场景**: 导出数据进行用户行为分析'
        ],
        'config': [
            '**活动配置查询场景**: 获取抽奖活动的详细配置信息',
            '**前端展示场景**: 前端根据配置展示抽奖界面和规则',
            '**积分消耗提示场景**: 告知用户参与抽奖需要的积分数量',
            '**活动时间判断场景**: 检查活动是否在有效期内',
            '**参与条件验证场景': 检查用户是否满足参与条件'
        ],
        'prizes': [
            '**奖品池展示场景**: 前端显示当前活动的所有奖品',
            '**概率透明场景**: 向用户展示各奖品的中奖概率',
            '**库存提示场景**: 显示各奖品的剩余数量',
            '**吸引参与场景**: 通过奖品展示吸引用户参与',
            '**公平公正场景**: 透明展示奖品配置增加用户信任'
        ]
    },
    'points': {
        'balance': [
            '**积分余额查询场景**: 用户查看当前可用积分数量',
            '**消费前确认场景**: 抽奖或兑换前确认积分是否充足',
            '**积分变动提醒场景**: 积分发生变化后用户查看最新余额',
            '**冻结积分展示场景**: 显示冻结积分和可用积分的区别',
            '**历史累计展示场景': 展示用户历史累计获得的积分总数'
        ],
        'transactions': [
            '**交易记录查询场景**: 用户查看积分收入和支出明细',
            '**对账核验场景**: 用户核对积分变动是否正确',
            '**消费分析场景**: 分析用户积分主要用途和消费习惯',
            '**异常检测场景**: 发现异常交易及时处理',
            '**数据导出场景': 导出交易记录用于个人财务管理'
        ],
        'adjust': [
            '**积分补发场景**: 管理员为用户补发误扣或漏发的积分',
            '**积分扣除场景**: 因违规行为扣除用户积分',
            '**活动奖励场景**: 管理员为参与活动的用户发放奖励积分',
            '**测试调整场景**: 开发测试时调整用户积分',
            '**异常处理场景**: 处理系统错误导致的积分异常'
        ]
    },
    'inventory': {
        'list': [
            '**库存查看场景**: 用户查看自己拥有的所有虚拟物品',
            '**物品分类场景**: 按物品类型、获得时间等分类展示',
            '**物品状态场景**: 显示已使用、未使用、已过期等状态',
            '**快速查找场景**: 通过搜索快速找到特定物品',
            '**管理库存场景**: 用户整理和管理自己的虚拟资产'
        ],
        'use': [
            '**物品使用场景**: 用户消耗库存中的物品',
            '**核销验证场景': 实体商品核销时验证使用权限',
            '**状态更新场景**: 使用后更新物品状态为已使用',
            '**记录留存场景': 保留使用记录便于追溯',
            '**防重复使用场景**: 确保每个物品只能使用一次'
        ],
        'exchange': [
            '**商品兑换场景**: 用户使用积分兑换实体或虚拟商品',
            '**库存检查场景**: 兑换前检查商品库存是否充足',
            '**积分扣除场景**: 兑换成功后扣除相应积分',
            '**订单生成场景**: 创建兑换订单等待管理员审核',
            '**物流信息场景**: 实体商品兑换后填写物流信息'
        ],
        'transfer': [
            '**物品转让场景': 用户将库存物品转让给其他用户',
            '**权限验证场景**: 验证物品是否允许转让',
            '**接收确认场景': 接收方确认接收转让的物品',
            '**记录追溯场景': 记录完整的转让链路',
            '**防作弊场景': 防止通过转让进行积分套利'
        ]
    },
    'consumption': {
        'submit': [
            '**消费记录提交场景**: 商户扫码录入用户消费金额',
            '**QR码验证场景**: 验证用户消费QR码的有效性',
            '**消费凭证场景': 拍照上传消费小票作为凭证',
            '**待审核状态场景**: 提交后进入待审核队列',
            '**通知用户场景**: 提交成功后通知用户等待审核'
        ],
        'approve': [
            '**审核通过场景**: 管理员审核通过消费记录',
            '**积分发放场景**: 审核通过后按比例发放积分',
            '**状态更新场景': 更新记录状态为已通过',
            '**通知用户场景': 通知用户积分已到账',
            '**记录审核日志场景': 记录审核人和审核时间'
        ],
        'reject': [
            '**审核拒绝场景**: 管理员拒绝不符合要求的消费记录',
            '**拒绝原因场景': 填写拒绝原因告知用户',
            '**状态更新场景': 更新记录状态为已拒绝',
            '**用户申诉场景': 用户可针对拒绝结果申诉',
            '**防作弊场景': 拒绝虚假消费记录维护系统公平'
        ]
    },
    'admin': {
        'dashboard': [
            '**数据总览场景**: 管理员查看系统核心数据概况',
            '**实时监控场景**: 监控系统运行状态和关键指标',
            '**趋势分析场景**: 查看用户增长、活跃度等趋势',
            '**异常告警场景': 发现异常数据及时告警',
            '**决策支持场景': 为运营决策提供数据支持'
        ],
        'users': [
            '**用户管理场景**: 管理员查看和管理所有用户',
            '**角色分配场景**: 为用户分配或修改角色权限',
            '**账户状态场景': 启用或禁用用户账户',
            '**用户搜索场景**: 通过手机号、昵称等搜索用户',
            '**批量操作场景': 批量修改用户状态或权限'
        ],
        'config': [
            '**系统配置场景**: 管理员修改系统业务配置',
            '**参数调整场景': 调整抽奖概率、积分比例等参数',
            '**动态生效场景': 配置修改后无需重启即生效',
            '**配置备份场景': 修改前备份配置便于回滚',
            '**权限控制场景': 仅超级管理员可修改核心配置'
        ]
    }
}

# 业务规则模板
BUSINESS_RULES = {
    'auth': {
        'login': [
            '**手机号格式验证规则**: 必须是11位中国大陆手机号，符合13x/14x/15x/16x/17x/18x/19x开头的格式要求',
            '**验证码验证规则**: 生产环境验证6位数字验证码，开发环境支持万能验证码123456，有效期5分钟',
            '**新用户自动注册规则**: 系统检测到手机号未注册时，自动创建用户账号、积分账户并分配默认角色',
            '**Token生成规则**: 登录成功后生成双Token（accessToken有效期15分钟+refreshToken有效期7天）',
            '**并发登录控制规则**: 同一账号允许多设备同时登录，每个设备使用独立Token',
            '**登录日志记录规则**: 记录每次登录的时间、设备信息、IP地址，便于安全审计'
        ],
        'common': [
            '**权限验证规则**: 验证用户是否拥有访问该API的权限',
            '**Token验证规则**: 验证accessToken的有效性和完整性',
            '**参数校验规则**: 验证所有必需参数的存在性、格式和有效性',
            '**数据一致性规则**: 确保数据库操作的原子性和一致性',
            '**错误处理规则**: 提供清晰的错误信息和错误码',
            '**日志记录规则': 记录关键操作便于审计和问题追溯'
        ]
    },
    'lottery': {
        'draw': [
            '**积分充足验证规则**: 抽奖前验证用户积分是否足够支付抽奖费用',
            '**活动有效性规则**: 验证活动是否在有效期内且状态为进行中',
            '**幂等性控制规则**: 使用唯一请求ID防止重复扣费和重复抽奖',
            '**概率计算规则**: 根据奖品配置的概率和保底机制计算中奖结果',
            '**库存扣减规则': 中奖后立即扣减奖品库存，库存不足时降级到其他奖品',
            '**事务一致性规则**: 积分扣除、奖品发放、记录创建在同一事务中完成'
        ],
        'common': [
            '**活动权限规则**: 验证用户是否有参与该活动的权限',
            '**数据完整性规则**: 查询结果包含所有必要的业务字段',
            '**分页查询规则**: 支持分页查询避免数据量过大',
            '**时间范围规则**: 支持按时间范围筛选数据',
            '**软删除规则**: 删除操作使用软删除保留数据可追溯性',
            '**缓存策略规则**: 高频查询数据使用缓存提升性能'
        ]
    },
    'points': {
        'common': [
            '**权限验证规则**: 用户只能查看自己的数据，管理员可查看所有用户数据',
            '**积分计算规则': 确保积分余额计算准确（可用积分+冻结积分=总积分）',
            '**事务安全规则**: 所有积分变动操作使用数据库事务保证原子性',
            '**幂等性规则': 使用唯一交易ID防止重复扣减或发放积分',
            '**历史记录规则**: 所有积分变动必须记录交易历史便于追溯',
            '**软删除规则**: 交易记录删除使用软删除机制保留数据'
        ]
    },
    'inventory': {
        'common': [
            '**权限验证规则**: 用户只能操作自己的库存物品',
            '**物品状态规则**: 验证物品状态是否允许当前操作（未使用/已使用/已过期）',
            '**库存扣减规则**: 兑换商品时先验证库存充足再扣减库存',
            '**事务一致性规则**: 积分扣除、库存扣减、订单创建在同一事务中完成',
            '**核销码唯一性规则**: 生成的核销码必须全局唯一且难以伪造',
            '**时效性规则': 某些物品有使用期限，过期后自动失效'
        ]
    },
    'consumption': {
        'common': [
            '**角色权限规则**: 商户可提交记录，管理员可审核记录',
            '**QR码验证规则': 验证消费QR码的有效性和时效性（通常5分钟有效）',
            '**金额验证规则**: 验证消费金额的合理性（不能为0或负数）',
            '**审核时效规则**: 记录提交后24小时内完成审核',
            '**积分发放规则': 审核通过后按消费金额*积分比例发放积分',
            '**防重复提交规则': 同一消费凭证不能重复提交'
        ]
    },
    'admin': {
        'common': [
            '**管理员权限规则**: 仅管理员角色（role_level≥100）可访问',
            '**操作日志规则**: 所有管理操作必须记录详细日志',
            '**敏感操作确认规则': 删除、禁用等敏感操作需要二次确认',
            '**批量操作限制规则**: 批量操作限制单次处理数量避免系统过载',
            '**数据导出规则': 支持导出查询结果为Excel便于分析',
            '**权限分级规则**: 不同级别管理员拥有不同的操作权限范围'
        ]
    }
}

def get_api_category(path, description=''):
    """根据API路径和描述判断分类"""
    path_lower = path.lower()
    desc_lower = description.lower()
    
    if '/auth/' in path_lower or 'login' in desc_lower or 'token' in desc_lower:
        return 'auth'
    elif '/lottery/' in path_lower or '抽奖' in desc_lower:
        return 'lottery'
    elif '/points/' in path_lower or '积分' in desc_lower:
        return 'points'
    elif '/inventory/' in path_lower or '库存' in desc_lower or '兑换' in desc_lower:
        return 'inventory'
    elif '/consumption/' in path_lower or '消费' in desc_lower:
        return 'consumption'
    elif '/admin/' in path_lower or '管理' in desc_lower:
        return 'admin'
    else:
        return 'common'

def get_scenarios(category, api_type='common'):
    """获取业务场景说明"""
    if category in API_SCENARIOS and api_type in API_SCENARIOS[category]:
        return API_SCENARIOS[category][api_type]
    elif category in API_SCENARIOS and 'common' in API_SCENARIOS[category]:
        return API_SCENARIOS[category]['common']
    else:
        # 默认通用场景
        return [
            '**功能使用场景**: 用户或管理员使用该功能完成具体业务操作',
            '**数据查询场景**: 查询和获取相关业务数据信息',
            '**权限验证场景**: 系统验证用户权限确保操作合法',
            '**数据处理场景**: 系统处理请求并返回相应结果',
            '**日志记录场景**: 记录操作日志便于审计追踪'
        ]

def get_rules(category, api_type='common'):
    """获取业务规则"""
    if category in BUSINESS_RULES and api_type in BUSINESS_RULES[category]:
        return BUSINESS_RULES[category][api_type]
    elif category in BUSINESS_RULES and 'common' in BUSINESS_RULES[category]:
        return BUSINESS_RULES[category]['common']
    else:
        # 默认通用规则
        return [
            '**权限验证规则**: 验证用户是否拥有访问该API的权限',
            '**参数校验规则**: 验证所有必需参数的存在性、格式和有效性',
            '**数据一致性规则**: 确保数据库操作的原子性和一致性',
            '**错误处理规则**: 提供清晰的错误信息和错误码便于问题定位',
            '**日志记录规则**: 记录关键操作便于审计和问题追溯',
            '**性能优化规则**: 优化查询性能避免数据库过载'
        ]

def generate_api_content(path, description=''):
    """生成API的业务场景和业务规则"""
    category = get_api_category(path, description)
    
    # 确定具体API类型
    api_type = 'common'
    if 'login' in path or '登录' in description:
        api_type = 'login'
    elif 'profile' in path or '用户信息' in description:
        api_type = 'profile'
    elif 'verify' in path or '验证' in description:
        api_type = 'verify'
    elif 'refresh' in path or '刷新' in description:
        api_type = 'refresh'
    elif 'logout' in path or '退出' in description:
        api_type = 'logout'
    elif 'draw' in path or '执行抽奖' in description:
        api_type = 'draw'
    elif 'history' in path or '历史' in description:
        api_type = 'history'
    elif 'config' in path or '配置' in description:
        api_type = 'config'
    elif 'prizes' in path or '奖品' in description:
        api_type = 'prizes'
    elif 'balance' in path or '余额' in description:
        api_type = 'balance'
    elif 'transactions' in path or '交易' in description:
        api_type = 'transactions'
    elif 'adjust' in path or '调整' in description:
        api_type = 'adjust'
    elif 'use' in path or '使用' in description:
        api_type = 'use'
    elif 'exchange' in path or '兑换' in description:
        api_type = 'exchange'
    elif 'transfer' in path or '转让' in description:
        api_type = 'transfer'
    elif 'submit' in path or '提交' in description:
        api_type = 'submit'
    elif 'approve' in path or '通过' in description:
        api_type = 'approve'
    elif 'reject' in path or '拒绝' in description:
        api_type = 'reject'
    elif 'dashboard' in path or '仪表盘' in description:
        api_type = 'dashboard'
    elif 'users' in path or '用户管理' in description:
        api_type = 'users'
    
    scenarios = get_scenarios(category, api_type)
    rules = get_rules(category, api_type)
    
    return scenarios, rules

# 测试示例
if __name__ == '__main__':
    # 测试几个API
    test_apis = [
        ('POST /api/v4/auth/login', '用户登录'),
        ('GET /api/v4/lottery/draw', '执行抽奖'),
        ('GET /api/v4/points/balance', '查询积分余额'),
    ]
    
    for path, desc in test_apis:
        print(f"\n{'='*60}")
        print(f"API: {path}")
        print(f"描述: {desc}")
        scenarios, rules = generate_api_content(path, desc)
        print("\n业务场景说明(5个):")
        for i, s in enumerate(scenarios, 1):
            print(f"{i}. {s}")
        print("\n业务规则(6个):")
        for i, r in enumerate(rules, 1):
            print(f"{i}. {r}")

