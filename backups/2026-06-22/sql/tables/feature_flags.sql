/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19  Distrib 10.11.14-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: dbconn.sealosbja.site    Database: restaurant_points_dev
-- ------------------------------------------------------
-- Server version	8.0.30

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `feature_flags`
--

DROP TABLE IF EXISTS `feature_flags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `feature_flags` (
  `feature_flag_id` int NOT NULL AUTO_INCREMENT,
  `flag_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '功能键名（唯一标识，如 lottery_pity_system）',
  `flag_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '功能名称（显示用）',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT '功能描述（业务含义说明）',
  `is_enabled` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否启用（总开关）',
  `rollout_strategy` enum('all','percentage','user_list','user_segment','schedule') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'all' COMMENT '发布策略（all-全量/percentage-百分比/user_list-名单/user_segment-分群/schedule-定时）',
  `rollout_percentage` decimal(5,2) NOT NULL DEFAULT '100.00' COMMENT '开放百分比（0.00-100.00，仅百分比策略生效）',
  `whitelist_user_ids` json DEFAULT NULL COMMENT '白名单用户ID列表（JSON数组，优先开放）',
  `blacklist_user_ids` json DEFAULT NULL COMMENT '黑名单用户ID列表（JSON数组，强制关闭）',
  `target_segments` json DEFAULT NULL COMMENT '目标用户分群（JSON数组，如 ["vip", "new_user"]）',
  `effective_start` datetime DEFAULT NULL COMMENT '生效开始时间（为空表示立即生效）',
  `effective_end` datetime DEFAULT NULL COMMENT '生效结束时间（为空表示永久生效）',
  `related_config_group` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '关联的配置分组（关联 lottery_strategy_config.config_group）',
  `fallback_behavior` enum('disabled','default_value','old_logic') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'disabled' COMMENT '降级行为（disabled-禁用/default_value-默认值/old_logic-旧逻辑）',
  `created_by` int DEFAULT NULL COMMENT '创建人ID（关联 users.user_id）',
  `updated_by` int DEFAULT NULL COMMENT '更新人ID（关联 users.user_id）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`feature_flag_id`),
  UNIQUE KEY `flag_key` (`flag_key`),
  KEY `idx_feature_flags_is_enabled` (`is_enabled`),
  KEY `idx_feature_flags_effective_time` (`effective_start`,`effective_end`)
) ENGINE=InnoDB AUTO_INCREMENT=3605 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='功能开关表（Feature Flag）- 全系统通用灰度发布控制';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `feature_flags`
--

LOCK TABLES `feature_flags` WRITE;
/*!40000 ALTER TABLE `feature_flags` DISABLE KEYS */;
INSERT INTO `feature_flags` VALUES
(1,'lottery_pity_system','Pity 软保底机制','连续空奖时逐步提升非空奖概率（类似游戏保底），提升用户体验',1,'all',100.00,NULL,NULL,NULL,NULL,NULL,'pity','disabled',NULL,NULL,'2026-01-21 07:20:01','2026-01-21 07:34:44'),
(2,'lottery_luck_debt','运气债务机制','基于用户历史空奖率的长期平衡调整，确保长期公平性',1,'all',100.00,NULL,NULL,NULL,NULL,NULL,'luck_debt','disabled',NULL,NULL,'2026-01-21 07:20:01','2026-01-21 07:20:01'),
(3,'lottery_anti_empty_streak','防连续空奖机制','连续K次空奖后强制发放非空奖，避免用户连续失望',1,'all',100.00,NULL,NULL,NULL,NULL,NULL,'anti_empty','disabled',NULL,NULL,'2026-01-21 07:20:01','2026-01-21 07:20:01'),
(4,'lottery_anti_high_streak','防连续高价值机制','防止短时间内连续获得高价值奖品，控制成本风险',1,'all',100.00,NULL,NULL,NULL,NULL,NULL,'anti_high','disabled',NULL,NULL,'2026-01-21 07:20:01','2026-01-21 07:20:01'),
(5,'lottery_bxpx_matrix','BxPx 矩阵调权','根据预算分层和活动压力动态调整权重，智能控制出奖节奏',1,'all',100.00,NULL,NULL,NULL,NULL,NULL,NULL,'disabled',NULL,NULL,'2026-01-21 07:20:01','2026-01-21 07:20:01'),
(6,'lottery_budget_tier','预算分层控制','B0-B3 四层预算分层机制，根据活动剩余预算调整策略',1,'all',100.00,NULL,NULL,NULL,NULL,NULL,'budget_tier','disabled',NULL,NULL,'2026-01-21 07:20:01','2026-01-21 07:20:01'),
(7,'lottery_pressure_tier','活动压力分层','P0-P2 三层活动压力控制，根据抽奖频率调整出奖概率',1,'all',100.00,NULL,NULL,NULL,NULL,NULL,'pressure_tier','disabled',NULL,NULL,'2026-01-21 07:20:01','2026-01-21 07:20:01'),
(2315,'data_pre_launch_wipe','上线前清档模式','启用后允许执行上线前全量清档操作（NODE_ENV !== production 时生效）',0,'all',100.00,NULL,NULL,NULL,NULL,NULL,NULL,'disabled',0,NULL,'2026-03-10 08:15:30','2026-03-10 08:15:30'),
(3535,'c2c_marketplace_enabled','C2C用户间交易市场总开关','控制 /api/v4/marketplace（C2C 用户间交易）是否挂载。合规整改后默认关闭：关闭即整域返回 410 Gone，前端据此隐藏入口。道具商城走 exchange 域（B2C 单向）。',0,'all',100.00,NULL,NULL,NULL,NULL,NULL,NULL,'disabled',NULL,NULL,'2026-06-04 23:24:17','2026-06-04 23:24:17');
/*!40000 ALTER TABLE `feature_flags` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-21 19:08:12
