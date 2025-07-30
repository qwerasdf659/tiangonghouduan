const { DataTypes } = require('sequelize')

module.exports = sequelize => {
  const BusinessConfigs = sequelize.define(
    'BusinessConfigs',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '配置ID'
      },

      business_type: {
        type: DataTypes.ENUM('lottery', 'exchange', 'trade', 'uploads'),
        allowNull: false,
        unique: true,
        comment: '业务类型'
      },

      // 存储策略配置
      storage_policy: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '存储策略：{hotDays: 30, standardDays: 365, archiveDays: 1095}',
        defaultValue: {
          hotDays: 30,
          standardDays: 365,
          archiveDays: 1095
        }
      },

      // 文件规则配置
      file_rules: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '文件规则：{maxFileSize: 10MB, allowedTypes: ["jpg"], categories: []}',
        defaultValue: {
          maxFileSize: 10485760, // 10MB
          allowedTypes: ['jpg', 'jpeg', 'png', 'webp'],
          categories: []
        }
      },

      // 缓存配置
      cache_config: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '缓存配置：{ttl: 300000, maxSize: 1000}'
      },

      // 扩展配置
      extended_config: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '扩展配置：业务特定的其他配置'
      },

      status: {
        type: DataTypes.ENUM('active', 'inactive'),
        defaultValue: 'active',
        allowNull: false,
        comment: '配置状态'
      },

      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
        comment: '创建时间'
      },

      updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
        comment: '更新时间'
      }
    },
    {
      tableName: 'business_configs',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '业务配置管理表',

      indexes: [
        {
          name: 'idx_business_type',
          fields: ['business_type'],
          unique: true
        },
        {
          name: 'idx_status',
          fields: ['status']
        }
      ]
    }
  )

  // 类方法 - 获取业务配置
  BusinessConfigs.getBusinessConfig = async function (businessType) {
    const config = await this.findOne({
      where: {
        business_type: businessType,
        status: 'active'
      }
    })

    if (!config) {
      // 返回默认配置
      return this.getDefaultConfig(businessType)
    }

    return config.get({ plain: true })
  }

  // 默认配置
  BusinessConfigs.getDefaultConfig = function (businessType) {
    const defaultConfigs = {
      lottery: {
        business_type: 'lottery',
        storage_policy: {
          hotDays: 30,
          standardDays: 365,
          archiveDays: 1095
        },
        file_rules: {
          maxFileSize: 10485760, // 10MB
          allowedTypes: ['jpg', 'jpeg', 'png', 'webp'],
          categories: ['prizes', 'wheels', 'results', 'banners']
        }
      },
      exchange: {
        business_type: 'exchange',
        storage_policy: {
          hotDays: 60,
          standardDays: 730,
          archiveDays: 2190
        },
        file_rules: {
          maxFileSize: 15728640, // 15MB
          allowedTypes: ['jpg', 'jpeg', 'png', 'webp'],
          categories: ['products', 'categories', 'promotions']
        }
      },
      trade: {
        business_type: 'trade',
        storage_policy: {
          hotDays: 45,
          standardDays: 545,
          archiveDays: 1825
        },
        file_rules: {
          maxFileSize: 12582912, // 12MB
          allowedTypes: ['jpg', 'jpeg', 'png', 'webp'],
          categories: ['items', 'banners', 'transactions']
        }
      },
      uploads: {
        business_type: 'uploads',
        storage_policy: {
          hotDays: 7,
          standardDays: 1095,
          archiveDays: 2190
        },
        file_rules: {
          maxFileSize: 20971520, // 20MB
          allowedTypes: ['jpg', 'jpeg', 'png', 'webp'],
          categories: ['pending_review', 'approved', 'rejected', 'processing']
        }
      }
    }

    return defaultConfigs[businessType] || defaultConfigs.uploads
  }

  // 批量初始化配置
  BusinessConfigs.initializeDefaultConfigs = async function () {
    const businessTypes = ['lottery', 'exchange', 'trade', 'uploads']
    const results = []

    for (const businessType of businessTypes) {
      const existing = await this.findOne({
        where: { business_type: businessType }
      })

      if (!existing) {
        const defaultConfig = this.getDefaultConfig(businessType)
        const created = await this.create(defaultConfig)
        results.push(created)
      }
    }

    return results
  }

  return BusinessConfigs
}
