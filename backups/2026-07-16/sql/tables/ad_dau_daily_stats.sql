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
-- Table structure for table `ad_dau_daily_stats`
--

DROP TABLE IF EXISTS `ad_dau_daily_stats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ad_dau_daily_stats` (
  `ad_dau_daily_stat_id` bigint NOT NULL AUTO_INCREMENT COMMENT 'DAU 每日统计主键',
  `stat_date` date NOT NULL COMMENT '统计日期（唯一，每天一条记录）',
  `dau_count` int NOT NULL DEFAULT '0' COMMENT '当日活跃用户数',
  `dau_coefficient` decimal(10,4) DEFAULT NULL COMMENT '当日 DAU 系数（匹配档位后计算得出）',
  `source` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'last_active_at' COMMENT 'DAU 数据来源字段',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ad_dau_daily_stat_id`),
  UNIQUE KEY `stat_date` (`stat_date`)
) ENGINE=InnoDB AUTO_INCREMENT=138 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='DAU 每日统计表（广告定价的 DAU 系数数据源）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ad_dau_daily_stats`
--

LOCK TABLES `ad_dau_daily_stats` WRITE;
/*!40000 ALTER TABLE `ad_dau_daily_stats` DISABLE KEYS */;
INSERT INTO `ad_dau_daily_stats` VALUES
(114,'2026-06-21',0,0.3750,'last_active_at','2026-06-23 00:30:00'),
(115,'2026-06-22',3,0.3750,'last_active_at','2026-06-24 00:30:00'),
(116,'2026-06-23',0,0.3750,'last_active_at','2026-06-25 00:30:00'),
(117,'2026-06-24',0,0.3750,'last_active_at','2026-06-26 00:30:00'),
(118,'2026-06-25',1,0.3750,'last_active_at','2026-06-27 00:30:00'),
(119,'2026-06-26',2,0.3750,'last_active_at','2026-06-28 00:30:00'),
(120,'2026-06-27',4,0.3750,'last_active_at','2026-06-29 00:30:00'),
(121,'2026-06-28',3,0.3750,'last_active_at','2026-06-30 00:30:00'),
(122,'2026-06-29',2,0.3750,'last_active_at','2026-07-01 00:30:00'),
(123,'2026-06-30',0,0.3750,'last_active_at','2026-07-02 00:30:00'),
(124,'2026-07-01',0,0.3750,'last_active_at','2026-07-03 00:30:00'),
(125,'2026-07-02',0,0.3750,'last_active_at','2026-07-04 00:30:00'),
(126,'2026-07-03',1,0.3750,'last_active_at','2026-07-05 00:30:00'),
(127,'2026-07-04',0,0.3750,'last_active_at','2026-07-06 00:30:01'),
(128,'2026-07-05',0,0.3750,'last_active_at','2026-07-07 00:30:00'),
(129,'2026-07-06',1,0.3750,'last_active_at','2026-07-08 00:30:00'),
(130,'2026-07-07',0,0.3750,'last_active_at','2026-07-09 00:30:00'),
(131,'2026-07-08',0,0.3750,'last_active_at','2026-07-10 00:30:00'),
(132,'2026-07-09',0,0.3750,'last_active_at','2026-07-11 00:30:00'),
(133,'2026-07-10',0,0.3750,'last_active_at','2026-07-12 00:30:00'),
(134,'2026-07-11',5,0.3750,'last_active_at','2026-07-13 00:30:00'),
(135,'2026-07-12',2,0.3750,'last_active_at','2026-07-14 00:30:00'),
(136,'2026-07-13',0,0.3750,'last_active_at','2026-07-15 00:30:00'),
(137,'2026-07-14',0,0.3750,'last_active_at','2026-07-16 00:30:00');
/*!40000 ALTER TABLE `ad_dau_daily_stats` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:47
