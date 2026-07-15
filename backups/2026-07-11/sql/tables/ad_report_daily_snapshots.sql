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
-- Table structure for table `ad_report_daily_snapshots`
--

DROP TABLE IF EXISTS `ad_report_daily_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ad_report_daily_snapshots` (
  `snapshot_id` bigint NOT NULL AUTO_INCREMENT COMMENT '快照主键',
  `snapshot_date` date NOT NULL COMMENT '快照日期',
  `ad_campaign_id` int NOT NULL COMMENT '广告计划 ID',
  `ad_slot_id` int NOT NULL COMMENT '广告位 ID',
  `impressions_total` int NOT NULL DEFAULT '0' COMMENT '总曝光数',
  `impressions_valid` int NOT NULL DEFAULT '0' COMMENT '有效曝光数（去除作弊）',
  `clicks_total` int NOT NULL DEFAULT '0' COMMENT '总点击数',
  `clicks_valid` int NOT NULL DEFAULT '0' COMMENT '有效点击数（去除作弊）',
  `conversions` int NOT NULL DEFAULT '0' COMMENT '转化数',
  `spend_star_stone` int NOT NULL DEFAULT '0' COMMENT '消耗星石数',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`snapshot_id`),
  UNIQUE KEY `uk_ards_date_campaign_slot` (`snapshot_date`,`ad_campaign_id`,`ad_slot_id`),
  KEY `ad_campaign_id` (`ad_campaign_id`),
  KEY `ad_slot_id` (`ad_slot_id`),
  CONSTRAINT `ad_report_daily_snapshots_ibfk_1` FOREIGN KEY (`ad_campaign_id`) REFERENCES `ad_campaigns` (`ad_campaign_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ad_report_daily_snapshots_ibfk_2` FOREIGN KEY (`ad_slot_id`) REFERENCES `ad_slots` (`ad_slot_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=32 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每日报表快照表 — Phase 6 凌晨4点聚合';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ad_report_daily_snapshots`
--

LOCK TABLES `ad_report_daily_snapshots` WRITE;
/*!40000 ALTER TABLE `ad_report_daily_snapshots` DISABLE KEYS */;
INSERT INTO `ad_report_daily_snapshots` VALUES
(14,'2026-06-22',358,16,0,0,0,0,0,0,'2026-06-23 04:00:01'),
(15,'2026-06-23',358,16,0,0,0,0,0,0,'2026-06-24 04:00:00'),
(16,'2026-06-24',358,16,0,0,0,0,0,0,'2026-06-25 04:00:00'),
(17,'2026-06-25',359,16,0,0,0,0,0,0,'2026-06-26 04:00:00'),
(18,'2026-06-25',358,16,0,0,0,0,0,0,'2026-06-26 04:00:00'),
(19,'2026-06-26',359,16,0,0,0,0,0,0,'2026-06-27 04:00:00'),
(20,'2026-06-26',358,16,0,0,0,0,0,0,'2026-06-27 04:00:00'),
(21,'2026-06-28',359,16,0,0,0,0,0,0,'2026-06-29 04:00:00'),
(22,'2026-06-28',358,16,0,0,0,0,0,0,'2026-06-29 04:00:00'),
(23,'2026-06-29',359,16,0,0,0,0,0,0,'2026-06-30 04:00:00'),
(24,'2026-06-29',358,16,0,0,0,0,0,0,'2026-06-30 04:00:00'),
(25,'2026-06-30',359,16,0,0,0,0,0,0,'2026-07-01 04:00:00'),
(26,'2026-07-01',359,16,0,0,0,0,0,0,'2026-07-02 04:00:00'),
(27,'2026-07-02',359,16,0,0,0,0,0,0,'2026-07-03 04:00:00'),
(28,'2026-07-06',366,16,0,0,0,0,0,0,'2026-07-07 04:00:00'),
(29,'2026-07-07',366,16,0,0,0,0,0,0,'2026-07-08 04:00:00'),
(30,'2026-07-08',366,16,0,0,0,0,0,0,'2026-07-09 04:00:00'),
(31,'2026-07-09',366,16,0,0,0,0,0,0,'2026-07-10 04:00:00');
/*!40000 ALTER TABLE `ad_report_daily_snapshots` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-10 18:10:55
