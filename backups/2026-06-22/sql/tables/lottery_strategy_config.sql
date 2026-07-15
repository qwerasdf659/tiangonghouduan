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
-- Table structure for table `lottery_strategy_config`
--

DROP TABLE IF EXISTS `lottery_strategy_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `lottery_strategy_config` (
  `lottery_strategy_config_id` int NOT NULL AUTO_INCREMENT,
  `lottery_campaign_id` int NOT NULL COMMENT '关联的抽奖活动ID（支持多活动策略隔离）',
  `config_group` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '配置分组（budget_tier/pressure_tier/pity/luck_debt/anti_empty/anti_high/experience_state）',
  `config_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '配置键名',
  `config_value` json NOT NULL COMMENT '配置值（JSON格式）',
  `value_type` enum('number','boolean','string','array','object') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'number' COMMENT '配置值类型',
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '配置描述',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `priority` int NOT NULL DEFAULT '0' COMMENT '配置优先级（数值越大优先级越高）',
  `effective_start` datetime DEFAULT NULL COMMENT '生效开始时间',
  `effective_end` datetime DEFAULT NULL COMMENT '生效结束时间',
  `created_by` int DEFAULT NULL COMMENT '创建人ID',
  `updated_by` int DEFAULT NULL COMMENT '更新人ID',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`lottery_strategy_config_id`),
  UNIQUE KEY `uk_strategy_campaign_group_key_priority` (`lottery_campaign_id`,`config_group`,`config_key`,`priority`),
  KEY `idx_strategy_config_group_active` (`config_group`,`is_active`),
  KEY `idx_strategy_config_campaign` (`lottery_campaign_id`),
  CONSTRAINT `fk_strategy_config_campaign` FOREIGN KEY (`lottery_campaign_id`) REFERENCES `lottery_campaigns` (`lottery_campaign_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=165 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖策略全局配置表（Budget Tier阈值/Pity配置/功能开关等）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lottery_strategy_config`
--

LOCK TABLES `lottery_strategy_config` WRITE;
/*!40000 ALTER TABLE `lottery_strategy_config` DISABLE KEYS */;
INSERT INTO `lottery_strategy_config` VALUES
(4,1,'pressure_tier','threshold_high','0.8','number','P2阈值：压力指数>=此值为高压',1,0,NULL,NULL,NULL,NULL,'2026-01-20 17:13:04','2026-02-21 00:42:35'),
(5,1,'pressure_tier','threshold_low','0.5','number','P1阈值：压力指数>=此值为中压',1,0,NULL,NULL,NULL,NULL,'2026-01-20 17:13:04','2026-02-21 00:42:35'),
(6,1,'pity','enabled','true','boolean','是否启用Pity系统',1,0,NULL,NULL,NULL,31,'2026-01-20 17:13:04','2026-03-03 02:48:10'),
(7,1,'pity','hard_guarantee_threshold','10','number','硬保底触发阈值（连续空奖次数）',1,0,NULL,NULL,NULL,NULL,'2026-01-20 17:13:04','2026-02-21 00:42:35'),
(8,1,'pity','min_non_empty_cost','10','number','最低非空奖成本',1,0,NULL,NULL,NULL,NULL,'2026-01-20 17:13:04','2026-02-21 00:42:35'),
(9,1,'pity','multiplier_table','{\"0\": 1, \"1\": 1, \"2\": 1.2, \"3\": 1.5, \"4\": 1.8, \"5\": 2.2, \"6\": 2.8, \"7\": 3.5, \"8\": 5, \"9\": 10}','object','Pity累积倍数表（连续空奖次数 -> 非空奖权重乘数）',1,0,NULL,NULL,NULL,NULL,'2026-01-20 17:13:04','2026-02-21 00:42:35'),
(10,1,'luck_debt','enabled','true','boolean','是否启用运气债务机制',1,0,NULL,NULL,NULL,31,'2026-01-20 17:13:04','2026-02-21 00:42:35'),
(11,1,'luck_debt','expected_empty_rate','0.0','number','期望空奖率（基准线）',1,0,NULL,NULL,NULL,31,'2026-01-20 17:13:04','2026-03-17 07:22:02'),
(12,1,'luck_debt','min_draw_count','10','number','最小抽奖样本量',1,0,NULL,NULL,NULL,31,'2026-01-20 17:13:04','2026-02-21 00:42:35'),
(13,1,'anti_empty','enabled','true','boolean','是否启用防连续空奖机制',1,0,NULL,NULL,NULL,31,'2026-01-20 17:13:04','2026-03-03 02:48:10'),
(14,1,'anti_empty','empty_streak_threshold','5','number','连续空奖触发阈值',1,0,NULL,NULL,NULL,31,'2026-01-20 17:13:04','2026-03-05 02:52:26'),
(15,1,'anti_high','enabled','true','boolean','是否启用防连续高价值机制',1,0,NULL,NULL,NULL,31,'2026-01-20 17:13:04','2026-02-21 00:42:35'),
(16,1,'anti_high','recent_draw_window','5','number','近期高价值奖品统计窗口',1,0,NULL,NULL,NULL,31,'2026-01-20 17:13:04','2026-02-21 00:42:35'),
(17,1,'anti_high','high_streak_threshold','2','number','高价值奖品触发阈值',1,0,NULL,NULL,NULL,31,'2026-01-20 17:13:04','2026-02-21 00:42:35'),
(19,1,'pressure_tier','enabled','true','boolean',NULL,1,0,NULL,NULL,NULL,NULL,'2026-02-23 06:51:01','2026-02-23 06:51:01'),
(20,1,'matrix','enabled','true','boolean',NULL,1,0,NULL,NULL,NULL,NULL,'2026-02-23 06:51:01','2026-02-23 06:51:01'),
(24,1,'management','enabled','true','boolean','管理干预总开关（关闭后该活动的所有干预不生效）',1,0,NULL,NULL,NULL,NULL,'2026-02-24 01:52:44','2026-02-24 01:52:44'),
(25,1,'grayscale','pity_percentage','100','number','Pity 灰度放量百分比（0-100）',1,0,NULL,NULL,NULL,31,'2026-02-24 01:52:44','2026-03-06 17:08:45'),
(26,1,'grayscale','luck_debt_percentage','100','number','运气债务灰度放量百分比（0-100）',1,0,NULL,NULL,NULL,NULL,'2026-02-24 01:52:44','2026-02-24 01:52:44'),
(27,1,'grayscale','anti_empty_percentage','100','number','防连空灰度放量百分比（0-100）',1,0,NULL,NULL,NULL,NULL,'2026-02-24 01:52:44','2026-02-24 01:52:44'),
(28,1,'grayscale','anti_high_percentage','100','number','防连高灰度放量百分比（0-100）',1,0,NULL,NULL,NULL,NULL,'2026-02-24 01:52:44','2026-02-24 01:52:44'),
(102,1,'segment','resolver_version','\"v1\"','string','用户分群版本',1,0,NULL,NULL,NULL,NULL,'2026-02-25 05:56:40','2026-02-25 05:56:40'),
(103,1,'guarantee','enabled','false','boolean','固定间隔保底开关',1,0,NULL,NULL,NULL,31,'2026-02-25 05:56:40','2026-03-03 02:48:10'),
(104,1,'guarantee','threshold','10','number','保底触发间隔（每N次）',1,0,NULL,NULL,NULL,NULL,'2026-02-25 05:56:40','2026-02-25 05:56:40'),
(105,1,'guarantee','prize_id','null','number','保底指定奖品ID（null=自动选最高档）',1,0,NULL,NULL,NULL,NULL,'2026-02-25 05:56:40','2026-02-25 05:56:40'),
(106,1,'tier_fallback','prize_id','209','number','档位降级兜底奖品ID',1,0,NULL,NULL,NULL,NULL,'2026-02-25 05:56:40','2026-03-06 17:08:45'),
(107,1,'preset','debt_enabled','false','boolean','预设队列透支开关',1,0,NULL,NULL,NULL,NULL,'2026-02-25 05:56:40','2026-02-25 05:56:40'),
(138,1,'tier_fallback','enabled','true','boolean','档位兜底策略开关',1,0,NULL,NULL,NULL,NULL,'2026-03-03 02:48:10','2026-03-03 02:48:10'),
(154,1,'first_win','enabled','true','boolean','首抽必中总开关',1,100,NULL,NULL,NULL,NULL,'2026-03-06 09:10:31','2026-03-06 09:10:31'),
(155,1,'first_win','inject_position','2','number','注入位置（多抽第2抽）',1,100,NULL,NULL,NULL,NULL,'2026-03-06 09:10:31','2026-03-06 09:10:31'),
(156,1,'first_win','debt_coefficient','0.15','number','运气债务系数',1,100,NULL,NULL,NULL,NULL,'2026-03-06 09:10:31','2026-03-06 09:10:31'),
(157,1,'first_win','max_bp_consumption_ratio','0.4','number','最大BP消耗比例',1,100,NULL,NULL,NULL,NULL,'2026-03-06 09:10:31','2026-03-06 09:10:31'),
(158,1,'first_win','pools','{\"tier_1\": {\"max_spend\": 50, \"candidates\": [{\"asset\": \"red_shard\", \"amount\": 3, \"weight\": 35}, {\"asset\": \"DIAMOND\", \"amount\": 30, \"weight\": 65}]}, \"tier_2\": {\"max_spend\": 150, \"candidates\": [{\"asset\": \"red_shard\", \"amount\": 8, \"weight\": 35}, {\"asset\": \"DIAMOND\", \"amount\": 50, \"weight\": 65}]}, \"tier_3\": {\"max_spend\": 400, \"candidates\": [{\"asset\": \"red_shard\", \"amount\": 12, \"weight\": 25}, {\"asset\": \"DIAMOND\", \"amount\": 80, \"weight\": 50}, {\"asset\": \"red_shard\", \"amount\": 25, \"weight\": 25}]}, \"tier_4\": {\"max_spend\": 1500, \"candidates\": [{\"asset\": \"red_shard\", \"amount\": 25, \"weight\": 20}, {\"asset\": \"DIAMOND\", \"amount\": 200, \"weight\": 50}, {\"asset\": \"red_shard\", \"amount\": 50, \"weight\": 30}]}, \"tier_5\": {\"min_spend\": 1501, \"candidates\": [{\"asset\": \"red_shard\", \"amount\": 50, \"weight\": 25}, {\"asset\": \"DIAMOND\", \"amount\": 200, \"weight\": 40}, {\"asset\": \"DIAMOND\", \"amount\": 500, \"weight\": 35}]}}','object','五档动态首抽奖品池',1,100,NULL,NULL,NULL,NULL,'2026-03-06 09:10:31','2026-03-17 06:38:39'),
(159,1,'grayscale','pity_user_whitelist','[]','object','Pity（软保底）灰度白名单用户ID列表，JSON数组格式，白名单内用户强制启用 Pity 保底，不受百分比限制',1,100,NULL,NULL,NULL,NULL,'2026-03-06 10:31:26','2026-03-06 10:31:26'),
(160,1,'grayscale','luck_debt_user_whitelist','[]','object','运气债务灰度白名单用户ID列表，JSON数组格式，白名单内用户强制启用运气债务机制',1,100,NULL,NULL,NULL,NULL,'2026-03-06 10:31:26','2026-03-06 10:31:26'),
(161,1,'grayscale','anti_empty_user_whitelist','[]','object','防连空灰度白名单用户ID列表，JSON数组格式，白名单内用户强制启用防连空保护',1,100,NULL,NULL,NULL,NULL,'2026-03-06 10:31:26','2026-03-06 10:31:26'),
(162,1,'grayscale','anti_high_user_whitelist','[]','object','防连高灰度白名单用户ID列表，JSON数组格式，白名单内用户强制启用防连高限制',1,100,NULL,NULL,NULL,NULL,'2026-03-06 10:31:26','2026-03-06 10:31:26');
/*!40000 ALTER TABLE `lottery_strategy_config` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-21 19:08:14
