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
-- Table structure for table `lottery_hourly_metrics`
--

DROP TABLE IF EXISTS `lottery_hourly_metrics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `lottery_hourly_metrics` (
  `lottery_hourly_metric_id` bigint NOT NULL AUTO_INCREMENT,
  `lottery_campaign_id` int NOT NULL,
  `hour_bucket` datetime NOT NULL COMMENT '统计小时（格式: YYYY-MM-DD HH:00:00，北京时间）',
  `total_draws` int NOT NULL DEFAULT '0' COMMENT '该小时总抽奖次数',
  `unique_users` int NOT NULL DEFAULT '0' COMMENT '该小时参与抽奖的唯一用户数',
  `high_tier_count` int NOT NULL DEFAULT '0' COMMENT '高价值奖品次数（high档位）',
  `mid_tier_count` int NOT NULL DEFAULT '0' COMMENT '中价值奖品次数（mid档位）',
  `low_tier_count` int NOT NULL DEFAULT '0' COMMENT '低价值奖品次数（low档位）',
  `fallback_tier_count` int NOT NULL DEFAULT '0' COMMENT '空奖次数（fallback档位）',
  `total_budget_consumed` bigint NOT NULL DEFAULT '0' COMMENT '该小时总预算消耗（积分）',
  `total_prize_value` bigint NOT NULL DEFAULT '0' COMMENT '该小时发放的总奖品价值（积分）',
  `b0_tier_count` int NOT NULL DEFAULT '0' COMMENT 'B0档位（无预算）用户抽奖次数',
  `b1_tier_count` int NOT NULL DEFAULT '0' COMMENT 'B1档位（低预算≤100）用户抽奖次数',
  `b2_tier_count` int NOT NULL DEFAULT '0' COMMENT 'B2档位（中预算101-500）用户抽奖次数',
  `b3_tier_count` int NOT NULL DEFAULT '0' COMMENT 'B3档位（高预算>500）用户抽奖次数',
  `pity_triggered_count` int NOT NULL DEFAULT '0' COMMENT 'Pity系统（软保底）触发次数',
  `anti_empty_triggered_count` int NOT NULL DEFAULT '0' COMMENT 'AntiEmpty（反连空）强制非空触发次数',
  `anti_high_triggered_count` int NOT NULL DEFAULT '0' COMMENT 'AntiHigh（反连高）档位限制触发次数',
  `luck_debt_triggered_count` int NOT NULL DEFAULT '0' COMMENT '运气债务补偿触发次数（debt_level > none）',
  `guarantee_triggered_count` int NOT NULL DEFAULT '0' COMMENT '保底机制触发次数',
  `tier_downgrade_count` int NOT NULL DEFAULT '0' COMMENT '档位降级触发次数（如high无库存降级到mid）',
  `empty_rate` decimal(5,4) NOT NULL DEFAULT '0.0000' COMMENT '空奖率（0.0000-1.0000）',
  `high_value_rate` decimal(5,4) NOT NULL DEFAULT '0.0000' COMMENT '高价值率（0.0000-1.0000）',
  `avg_prize_value` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT '平均奖品价值（积分）',
  `aggregated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '聚合计算时间（北京时间）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  `empty_count` int NOT NULL DEFAULT '0' COMMENT '真正空奖次数（系统异常导致的空奖，与正常fallback保底分开统计）',
  `avg_budget_per_draw` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT '该小时内平均每次抽奖预算消耗',
  PRIMARY KEY (`lottery_hourly_metric_id`),
  UNIQUE KEY `uk_campaign_hour` (`lottery_campaign_id`,`hour_bucket`),
  KEY `idx_hourly_metrics_hour` (`hour_bucket`),
  KEY `idx_hourly_metrics_campaign` (`lottery_campaign_id`),
  KEY `idx_hourly_metrics_empty_rate` (`empty_rate`),
  CONSTRAINT `fk_hourly_metrics_campaign_id` FOREIGN KEY (`lottery_campaign_id`) REFERENCES `lottery_campaigns` (`lottery_campaign_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=247 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖监控指标表（按小时聚合，用于监控和分析）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lottery_hourly_metrics`
--

LOCK TABLES `lottery_hourly_metrics` WRITE;
/*!40000 ALTER TABLE `lottery_hourly_metrics` DISABLE KEYS */;
INSERT INTO `lottery_hourly_metrics` VALUES
(224,1,'2026-06-22 13:00:00',13,1,0,1,12,0,0,100,0,0,0,13,0,0,0,13,0,0,0.0000,0.0000,7.69,'2026-06-22 14:00:00','2026-06-22 13:14:39','2026-06-22 14:00:00',0,0.00),
(225,1,'2026-06-22 23:00:00',1,1,0,0,1,0,0,0,0,0,0,1,0,0,0,1,0,0,0.0000,0.0000,0.00,'2026-06-23 00:00:00','2026-06-22 23:24:11','2026-06-23 00:00:00',0,0.00),
(226,1,'2026-06-24 02:00:00',21,1,3,8,10,0,0,105,0,0,0,21,0,0,0,21,0,0,0.0000,0.1429,5.00,'2026-06-24 03:00:00','2026-06-24 02:52:45','2026-06-24 03:00:00',0,0.00),
(227,1,'2026-06-25 03:00:00',149,1,5,34,110,0,0,879,13,8,23,105,0,0,0,149,0,0,0.0000,0.0336,5.90,'2026-06-25 04:00:00','2026-06-25 03:18:12','2026-06-25 04:00:00',0,0.00),
(228,1,'2026-06-26 07:00:00',14,1,1,1,12,0,0,74,3,7,4,0,0,0,0,14,0,0,0.0000,0.0714,5.29,'2026-06-26 08:00:00','2026-06-26 07:07:07','2026-06-26 08:00:00',0,0.00),
(229,1,'2026-06-27 06:00:00',40,1,2,6,32,0,0,226,1,9,24,6,0,0,0,40,0,0,0.0000,0.0500,5.65,'2026-06-27 07:00:00','2026-06-27 06:33:56','2026-06-27 07:00:00',0,0.00),
(230,1,'2026-06-27 07:00:00',75,1,3,21,51,0,0,219,0,0,37,38,0,0,0,75,0,0,0.0000,0.0400,2.92,'2026-06-27 08:00:00','2026-06-27 07:31:09','2026-06-27 08:00:00',0,0.00),
(231,1,'2026-06-27 08:00:00',38,2,2,6,30,0,0,33,0,0,13,25,0,0,0,38,0,0,0.0000,0.0526,0.87,'2026-06-27 09:00:01','2026-06-27 08:03:22','2026-06-27 09:00:01',0,0.00),
(232,1,'2026-06-28 01:00:00',106,1,0,30,76,0,0,264,0,0,0,106,0,0,0,106,0,0,0.0000,0.0000,2.49,'2026-06-28 02:00:00','2026-06-28 01:56:34','2026-06-28 02:00:00',0,0.00),
(234,1,'2026-06-28 02:00:00',91,1,5,19,67,0,0,403,30,3,58,0,0,0,0,91,0,0,0.0000,0.0549,4.43,'2026-06-28 03:00:01','2026-06-28 02:39:56','2026-06-28 03:00:01',0,0.00),
(235,1,'2026-06-28 03:00:00',121,0,1,17,103,0,0,9223372036854775807,61,16,44,0,0,0,0,121,0,0,0.0000,0.0000,99999999.99,'2026-06-28 03:01:06','2026-06-28 03:01:06','2026-06-28 03:11:33',0,0.00),
(236,1,'2026-06-28 21:00:00',12,3,2,2,8,0,0,102,0,0,0,12,0,0,0,12,0,0,0.0000,0.1667,8.50,'2026-06-28 22:00:00','2026-06-28 21:05:54','2026-06-28 22:00:00',0,0.00),
(237,1,'2026-07-03 19:00:00',4,1,0,0,4,0,0,12,0,0,0,4,0,0,0,4,0,0,0.0000,0.0000,3.00,'2026-07-03 20:00:00','2026-07-03 19:55:49','2026-07-03 20:00:00',0,0.00),
(238,1,'2026-07-06 03:00:00',83,1,4,17,62,0,0,305,0,0,0,83,0,0,0,83,0,0,0.0000,0.0482,3.67,'2026-07-06 04:00:00','2026-07-06 03:27:16','2026-07-06 04:00:00',0,0.00),
(239,1,'2026-07-06 06:00:00',19,1,1,6,12,0,0,102,0,0,0,19,0,0,0,19,0,0,0.0000,0.0526,5.37,'2026-07-06 07:00:00','2026-07-06 06:46:54','2026-07-06 07:00:00',0,0.00),
(240,1,'2026-07-11 08:00:00',73,1,4,20,49,0,0,304,0,0,0,73,0,0,0,73,0,0,0.0000,0.0548,4.16,'2026-07-11 09:00:01','2026-07-11 08:28:26','2026-07-11 09:00:01',0,0.00),
(241,1,'2026-07-11 09:00:00',225,1,2,55,168,0,0,739,0,0,0,225,0,0,0,225,0,0,0.0000,0.0089,3.28,'2026-07-11 10:02:57','2026-07-11 09:00:00','2026-07-11 10:02:57',0,0.00),
(242,1,'2026-07-11 10:00:00',4,0,0,1,3,0,0,0,0,0,0,4,0,0,0,4,0,0,0.0000,0.0000,0.00,'2026-07-11 10:00:03','2026-07-11 10:00:03','2026-07-11 10:01:40',0,0.00),
(243,1,'2026-07-12 03:00:00',30,1,1,5,24,0,0,199,0,0,0,30,0,0,0,30,0,0,0.0000,0.0333,6.63,'2026-07-12 04:00:00','2026-07-12 03:17:39','2026-07-12 04:00:00',0,0.00),
(244,1,'2026-07-15 04:00:00',1,1,0,0,1,0,0,0,0,0,0,1,0,0,0,1,0,0,0.0000,0.0000,0.00,'2026-07-15 05:00:00','2026-07-15 04:33:40','2026-07-15 05:00:00',0,0.00),
(245,1,'2026-07-15 21:00:00',77,1,5,17,55,0,0,377,0,0,0,77,0,0,0,77,0,0,0.0000,0.0649,4.90,'2026-07-15 22:00:00','2026-07-15 21:19:53','2026-07-15 22:00:00',0,0.00),
(246,1,'2026-07-16 02:00:00',31,1,1,4,26,0,0,81,0,0,0,31,0,0,0,31,0,0,0.0000,0.0323,2.61,'2026-07-16 03:00:01','2026-07-16 02:37:08','2026-07-16 03:00:01',0,0.00);
/*!40000 ALTER TABLE `lottery_hourly_metrics` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:50
