/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19  Distrib 10.11.14-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: test-db-12-mysql.ns-br0za7uc.svc    Database: restaurant_points_dev
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
-- Table structure for table `lottery_daily_metrics`
--

DROP TABLE IF EXISTS `lottery_daily_metrics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `lottery_daily_metrics` (
  `lottery_daily_metric_id` bigint NOT NULL AUTO_INCREMENT,
  `lottery_campaign_id` int NOT NULL,
  `metric_date` date NOT NULL COMMENT '统计日期（格式: YYYY-MM-DD，北京时间）',
  `total_draws` int NOT NULL DEFAULT '0' COMMENT '当日总抽奖次数（从小时级汇总）',
  `unique_users` int NOT NULL DEFAULT '0' COMMENT '当日参与抽奖的唯一用户数',
  `high_tier_count` int NOT NULL DEFAULT '0' COMMENT '高价值奖品次数（high档位）',
  `mid_tier_count` int NOT NULL DEFAULT '0' COMMENT '中价值奖品次数（mid档位）',
  `low_tier_count` int NOT NULL DEFAULT '0' COMMENT '低价值奖品次数（low档位）',
  `fallback_tier_count` int NOT NULL DEFAULT '0' COMMENT '空奖次数（fallback档位）',
  `total_budget_consumed` decimal(20,2) NOT NULL DEFAULT '0.00' COMMENT '当日总预算消耗（积分）',
  `avg_budget_per_draw` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT '当日平均单次消耗（积分）',
  `total_prize_value` decimal(20,2) NOT NULL DEFAULT '0.00' COMMENT '当日发放的总奖品价值（积分）',
  `b0_count` int NOT NULL DEFAULT '0' COMMENT 'B0档位（无预算）用户抽奖次数',
  `b1_count` int NOT NULL DEFAULT '0' COMMENT 'B1档位（低预算≤100）用户抽奖次数',
  `b2_count` int NOT NULL DEFAULT '0' COMMENT 'B2档位（中预算101-500）用户抽奖次数',
  `b3_count` int NOT NULL DEFAULT '0' COMMENT 'B3档位（高预算>500）用户抽奖次数',
  `pity_trigger_count` int NOT NULL DEFAULT '0' COMMENT 'Pity系统（保底）触发总次数',
  `anti_empty_trigger_count` int NOT NULL DEFAULT '0' COMMENT 'AntiEmpty（反连空）触发次数',
  `anti_high_trigger_count` int NOT NULL DEFAULT '0' COMMENT 'AntiHigh（反连高）触发次数',
  `luck_debt_trigger_count` int NOT NULL DEFAULT '0' COMMENT '运气债务补偿触发次数',
  `empty_rate` decimal(5,4) NOT NULL DEFAULT '0.0000' COMMENT '当日空奖率（0.0000-1.0000）',
  `high_value_rate` decimal(5,4) NOT NULL DEFAULT '0.0000' COMMENT '当日高价值率（0.0000-1.0000）',
  `avg_prize_value` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT '当日平均奖品价值（积分）',
  `aggregated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '聚合计算时间（北京时间）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  `empty_count` int NOT NULL DEFAULT '0' COMMENT '真正空奖次数（系统异常导致的空奖，与正常fallback保底分开统计）',
  PRIMARY KEY (`lottery_daily_metric_id`),
  UNIQUE KEY `uk_daily_campaign_date` (`lottery_campaign_id`,`metric_date`),
  KEY `idx_daily_metrics_date` (`metric_date`),
  KEY `idx_daily_metrics_campaign` (`lottery_campaign_id`),
  KEY `idx_daily_metrics_empty_rate` (`empty_rate`),
  CONSTRAINT `fk_daily_metrics_campaign_id` FOREIGN KEY (`lottery_campaign_id`) REFERENCES `lottery_campaigns` (`lottery_campaign_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=74 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖日报统计表（按日聚合，永久保留，用于长期历史分析）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lottery_daily_metrics`
--

LOCK TABLES `lottery_daily_metrics` WRITE;
/*!40000 ALTER TABLE `lottery_daily_metrics` DISABLE KEYS */;
INSERT INTO `lottery_daily_metrics` VALUES
(66,1,'2026-06-22',14,1,0,1,13,0,0.00,0.00,100.00,0,0,0,14,0,0,0,14,0.0000,0.0000,7.14,'2026-06-23 01:00:00','2026-06-23 01:00:00','2026-06-23 01:00:00',0),
(67,1,'2026-06-24',21,1,3,8,10,0,0.00,0.00,105.00,0,0,0,21,0,0,0,21,0.0000,0.1429,5.00,'2026-06-25 01:00:00','2026-06-25 01:00:00','2026-06-25 01:00:00',0),
(68,1,'2026-06-25',149,1,5,34,110,0,0.00,0.00,879.00,13,8,23,105,0,0,0,149,0.0000,0.0336,5.90,'2026-06-26 01:00:00','2026-06-26 01:00:00','2026-06-26 01:00:00',0),
(69,1,'2026-06-26',14,1,1,1,12,0,0.00,0.00,74.00,3,7,4,0,0,0,0,14,0.0000,0.0714,5.29,'2026-06-27 01:00:00','2026-06-27 01:00:00','2026-06-27 01:00:00',0),
(70,1,'2026-06-27',153,2,7,33,113,0,0.00,0.00,478.00,1,9,74,69,0,0,0,153,0.0000,0.0458,3.12,'2026-06-28 01:00:00','2026-06-28 01:00:00','2026-06-28 01:00:00',0),
(71,1,'2026-06-28',330,3,8,68,254,0,0.00,0.00,999999999999999999.99,91,19,102,118,0,0,0,330,0.0000,0.0242,99999999.99,'2026-06-29 01:00:00','2026-06-29 01:00:00','2026-06-29 01:00:00',0),
(72,1,'2026-07-03',4,1,0,0,4,0,0.00,0.00,12.00,0,0,0,4,0,0,0,4,0.0000,0.0000,3.00,'2026-07-04 01:00:00','2026-07-04 01:00:00','2026-07-04 01:00:00',0),
(73,1,'2026-07-06',102,1,5,23,74,0,0.00,0.00,407.00,0,0,0,102,0,0,0,102,0.0000,0.0490,3.99,'2026-07-07 01:00:00','2026-07-07 01:00:00','2026-07-07 01:00:00',0);
/*!40000 ALTER TABLE `lottery_daily_metrics` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-10 18:10:58
