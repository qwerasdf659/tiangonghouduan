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
-- Table structure for table `lottery_campaign_prizes`
--

DROP TABLE IF EXISTS `lottery_campaign_prizes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `lottery_campaign_prizes` (
  `lottery_campaign_prize_id` bigint NOT NULL AUTO_INCREMENT COMMENT '活动奖品关联ID（主键）',
  `lottery_campaign_id` int NOT NULL COMMENT '活动ID（FK→lottery_campaigns.lottery_campaign_id）',
  `prize_definition_id` bigint NOT NULL COMMENT '奖品定义ID（FK→prize_definitions.prize_definition_id）',
  `win_weight` int unsigned NOT NULL DEFAULT '0' COMMENT '本活动中的权重（越大越容易中）',
  `stock_quantity` int NOT NULL DEFAULT '999999' COMMENT '本活动中的库存',
  `reward_tier` enum('high','mid','low') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'low' COMMENT '本活动中的档位（可覆盖奖品定义的默认档位）',
  `is_fallback` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否兜底奖品',
  `sort_order` int NOT NULL DEFAULT '100' COMMENT '排序序号',
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态',
  `max_daily_wins` int DEFAULT NULL COMMENT '每日最大中奖次数限制',
  `max_user_wins` int DEFAULT NULL COMMENT '每用户最大中奖次数限制',
  `total_win_count` int NOT NULL DEFAULT '0' COMMENT '累计中奖次数',
  `daily_win_count` int NOT NULL DEFAULT '0' COMMENT '当日中奖次数',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`lottery_campaign_prize_id`),
  UNIQUE KEY `uk_campaign_prize` (`lottery_campaign_id`,`prize_definition_id`),
  KEY `idx_campaign_prizes_status` (`lottery_campaign_id`,`status`),
  KEY `idx_campaign_prizes_definition` (`prize_definition_id`),
  KEY `idx_campaign_prizes_tier` (`lottery_campaign_id`,`reward_tier`),
  CONSTRAINT `fk_campaign_prizes_campaign` FOREIGN KEY (`lottery_campaign_id`) REFERENCES `lottery_campaigns` (`lottery_campaign_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_campaign_prizes_definition` FOREIGN KEY (`prize_definition_id`) REFERENCES `prize_definitions` (`prize_definition_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='活动-奖品关联表 — 活动引用奖品目录 + 配置权重/库存/档位';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lottery_campaign_prizes`
--

LOCK TABLES `lottery_campaign_prizes` WRITE;
/*!40000 ALTER TABLE `lottery_campaign_prizes` DISABLE KEYS */;
INSERT INTO `lottery_campaign_prizes` VALUES
(1,1,1,200000,164,'high',0,1,'active',NULL,NULL,7,0,'2026-05-25 19:53:58','2026-07-11 00:00:00'),
(2,1,2,150000,1780,'mid',0,2,'active',NULL,NULL,28,0,'2026-05-25 19:53:58','2026-07-11 00:00:00'),
(3,1,3,300000,985,'high',0,3,'active',5,NULL,10,0,'2026-05-25 19:53:58','2026-07-11 00:00:00'),
(4,1,4,550000,999248,'mid',0,4,'active',NULL,NULL,81,0,'2026-05-25 19:53:58','2026-07-11 00:00:00'),
(5,1,5,300000,999559,'low',0,5,'active',NULL,NULL,84,0,'2026-05-25 19:53:58','2026-07-11 00:00:00'),
(6,1,6,300000,999958,'mid',0,6,'active',NULL,NULL,28,0,'2026-05-25 19:53:58','2026-07-11 00:00:00'),
(7,1,7,120000,999955,'low',0,7,'active',NULL,NULL,32,0,'2026-05-25 19:53:58','2026-07-11 00:00:00'),
(8,1,8,300000,999456,'low',0,8,'active',NULL,NULL,124,0,'2026-05-25 19:53:58','2026-07-11 00:00:00'),
(9,1,9,200000,999429,'low',0,9,'active',NULL,NULL,64,0,'2026-05-25 19:53:58','2026-07-11 00:00:00'),
(10,1,10,120000,999935,'low',0,10,'active',NULL,NULL,54,0,'2026-05-25 19:53:58','2026-07-11 00:00:00'),
(11,1,11,60000,999956,'low',0,11,'active',NULL,NULL,36,0,'2026-05-25 19:53:58','2026-07-11 00:00:00'),
(12,1,12,60000,996985,'low',1,12,'active',NULL,NULL,238,0,'2026-05-25 19:53:58','2026-07-11 00:00:00');
/*!40000 ALTER TABLE `lottery_campaign_prizes` ENABLE KEYS */;
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
