'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    console.log('🚀 开始创建用户行为分析系统数据表...')

    // 🔥 1. 创建用户行为数据表 (analytics_behaviors)
    await queryInterface.createTable(
      'analytics_behaviors',
      {
        id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: '行为记录ID'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '用户ID',
          references: {
            model: 'users',
            key: 'user_id'
          },
          onDelete: 'CASCADE'
        },
        session_id: {
          type: Sequelize.STRING(64),
          allowNull: false,
          comment: '会话ID'
        },
        event_type: {
          type: Sequelize.STRING(50),
          allowNull: false,
          comment: '事件类型(page_view/click/draw/earn_points等)'
        },
        event_data: {
          type: Sequelize.JSON,
          allowNull: false,
          comment: '事件详细数据'
        },

        // 页面信息
        page_path: {
          type: Sequelize.STRING(255),
          comment: '页面路径'
        },
        referrer_path: {
          type: Sequelize.STRING(255),
          comment: '来源页面'
        },

        // 设备和环境信息
        device_info: {
          type: Sequelize.JSON,
          comment: '设备信息(浏览器/OS/屏幕等)'
        },
        ip_address: {
          type: Sequelize.STRING(45),
          comment: 'IP地址'
        },
        user_agent: {
          type: Sequelize.TEXT,
          comment: 'User Agent字符串'
        },

        // 时间戳
        created_at: {
          type: Sequelize.DATE,
          defaultValue: Sequelize.NOW,
          comment: '行为发生时间'
        }
      },
      {
        engine: 'InnoDB',
        comment: '用户行为数据表'
      }
    )

    // 🔥 创建行为表索引
    await queryInterface.addIndex('analytics_behaviors', ['user_id', 'created_at'], {
      name: 'idx_analytics_behaviors_user_time'
    })
    await queryInterface.addIndex('analytics_behaviors', ['event_type'], {
      name: 'idx_analytics_behaviors_event_type'
    })
    await queryInterface.addIndex('analytics_behaviors', ['session_id'], {
      name: 'idx_analytics_behaviors_session'
    })
    await queryInterface.addIndex('analytics_behaviors', ['created_at'], {
      name: 'idx_analytics_behaviors_created_time'
    })

    // 🔥 2. 创建用户画像分析表 (analytics_user_profiles)
    await queryInterface.createTable(
      'analytics_user_profiles',
      {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '画像ID'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          unique: true,
          comment: '用户ID',
          references: {
            model: 'users',
            key: 'user_id'
          },
          onDelete: 'CASCADE'
        },

        // 🔥 行为统计分析结果
        behavior_summary: {
          type: Sequelize.JSON,
          allowNull: false,
          comment: '行为汇总统计'
        },

        preferences: {
          type: Sequelize.JSON,
          comment: '用户偏好分析'
        },

        activity_pattern: {
          type: Sequelize.JSON,
          comment: '活跃模式分析'
        },

        // 🔥 用户评分和分群
        engagement_score: {
          type: Sequelize.DECIMAL(5, 2),
          defaultValue: 0,
          comment: '参与度评分(0-100)'
        },
        user_segments: {
          type: Sequelize.JSON,
          comment: '用户分群标签'
        },
        risk_level: {
          type: Sequelize.ENUM('low', 'medium', 'high'),
          defaultValue: 'low',
          comment: '风险等级'
        },

        // 🔥 分析元数据
        last_analysis_at: {
          type: Sequelize.DATE,
          allowNull: false,
          comment: '最后分析时间'
        },
        analysis_version: {
          type: Sequelize.STRING(20),
          defaultValue: 'v1.0',
          comment: '分析算法版本'
        },

        created_at: {
          type: Sequelize.DATE,
          defaultValue: Sequelize.NOW
        },
        updated_at: {
          type: Sequelize.DATE,
          defaultValue: Sequelize.NOW
        }
      },
      {
        engine: 'InnoDB',
        comment: '用户行为分析画像表'
      }
    )

    // 🔥 创建用户画像表索引
    await queryInterface.addIndex('analytics_user_profiles', ['user_id'], {
      name: 'idx_analytics_profiles_user_id'
    })
    await queryInterface.addIndex('analytics_user_profiles', ['engagement_score'], {
      name: 'idx_analytics_profiles_engagement'
    })
    await queryInterface.addIndex('analytics_user_profiles', ['last_analysis_at'], {
      name: 'idx_analytics_profiles_last_analysis'
    })

    // 🔥 3. 创建智能推荐结果表 (analytics_recommendations)
    await queryInterface.createTable(
      'analytics_recommendations',
      {
        id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: '推荐ID'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '用户ID',
          references: {
            model: 'users',
            key: 'user_id'
          },
          onDelete: 'CASCADE'
        },

        // 🔥 推荐内容
        rec_type: {
          type: Sequelize.ENUM('lottery_campaign', 'points_task', 'product', 'activity'),
          allowNull: false,
          comment: '推荐类型'
        },
        rec_items: {
          type: Sequelize.JSON,
          allowNull: false,
          comment: '推荐项目列表'
        },
        rec_scores: {
          type: Sequelize.JSON,
          allowNull: false,
          comment: '推荐分数详情'
        },
        rec_reason: {
          type: Sequelize.TEXT,
          comment: '推荐理由'
        },

        // 🔥 算法信息
        algorithm_type: {
          type: Sequelize.STRING(50),
          defaultValue: 'collaborative_filtering',
          comment: '算法类型'
        },
        algorithm_version: {
          type: Sequelize.STRING(20),
          defaultValue: 'v1.0',
          comment: '算法版本'
        },

        // 🔥 时效性控制
        generated_at: {
          type: Sequelize.DATE(3),
          allowNull: false,
          comment: '生成时间'
        },
        expires_at: {
          type: Sequelize.DATE(3),
          allowNull: false,
          comment: '过期时间'
        },

        // 🔥 效果跟踪
        is_shown: {
          type: Sequelize.BOOLEAN,
          defaultValue: false,
          comment: '是否已展示'
        },
        show_time: {
          type: Sequelize.DATE(3),
          comment: '展示时间'
        },
        is_clicked: {
          type: Sequelize.BOOLEAN,
          defaultValue: false,
          comment: '是否已点击'
        },
        click_time: {
          type: Sequelize.DATE(3),
          comment: '点击时间'
        },
        conversion_value: {
          type: Sequelize.DECIMAL(10, 2),
          defaultValue: 0,
          comment: '转化价值'
        }
      },
      {
        engine: 'InnoDB',
        comment: '智能推荐结果表'
      }
    )

    // 🔥 创建推荐表索引
    await queryInterface.addIndex('analytics_recommendations', ['user_id', 'rec_type'], {
      name: 'idx_analytics_rec_user_type'
    })
    await queryInterface.addIndex('analytics_recommendations', ['expires_at'], {
      name: 'idx_analytics_rec_expires'
    })
    await queryInterface.addIndex('analytics_recommendations', ['generated_at'], {
      name: 'idx_analytics_rec_generated_time'
    })
    await queryInterface.addIndex('analytics_recommendations', ['is_shown', 'is_clicked'], {
      name: 'idx_analytics_rec_effectiveness'
    })

    // 🔥 4. 创建实时统计数据表 (analytics_realtime_stats)
    await queryInterface.createTable(
      'analytics_realtime_stats',
      {
        id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: '统计ID'
        },
        stat_key: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: '统计键(user_active_count/page_views_count等)'
        },
        stat_type: {
          type: Sequelize.ENUM('counter', 'gauge', 'histogram'),
          allowNull: false,
          comment: '统计类型'
        },

        stat_data: {
          type: Sequelize.JSON,
          allowNull: false,
          comment: '统计数据'
        },

        time_bucket: {
          type: Sequelize.STRING(20),
          allowNull: false,
          comment: '时间桶(hour/day/week)'
        },
        bucket_time: {
          type: Sequelize.DATE,
          allowNull: false,
          comment: '桶时间'
        },

        created_at: {
          type: Sequelize.DATE,
          defaultValue: Sequelize.NOW
        },
        updated_at: {
          type: Sequelize.DATE,
          defaultValue: Sequelize.NOW
        }
      },
      {
        engine: 'InnoDB',
        comment: '实时统计数据表'
      }
    )

    // 🔥 创建实时统计表索引和唯一约束
    await queryInterface.addIndex(
      'analytics_realtime_stats',
      ['stat_key', 'time_bucket', 'bucket_time'],
      {
        name: 'uk_analytics_stats_stat_bucket',
        unique: true
      }
    )
    await queryInterface.addIndex('analytics_realtime_stats', ['time_bucket', 'bucket_time'], {
      name: 'idx_analytics_stats_bucket_time'
    })
    await queryInterface.addIndex('analytics_realtime_stats', ['stat_type'], {
      name: 'idx_analytics_stats_stat_type'
    })

    console.log('✅ 用户行为分析系统数据表创建完成')
  },

  async down (queryInterface, _Sequelize) {
    console.log('🔄 开始删除用户行为分析系统数据表...')

    // 🔥 删除表（回滚操作）
    await queryInterface.dropTable('analytics_realtime_stats')
    await queryInterface.dropTable('analytics_recommendations')
    await queryInterface.dropTable('analytics_user_profiles')
    await queryInterface.dropTable('analytics_behaviors')

    console.log('✅ 用户行为分析系统数据表删除完成')
  }
}
