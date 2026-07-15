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
-- Table structure for table `ad_price_adjustment_logs`
--

DROP TABLE IF EXISTS `ad_price_adjustment_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ad_price_adjustment_logs` (
  `ad_price_adjustment_log_id` int NOT NULL AUTO_INCREMENT,
  `trigger_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '触发类型：dau_shift=DAU区间变化, manual=运营手动调整',
  `old_coefficient` decimal(10,4) DEFAULT NULL COMMENT '调价前的 DAU 系数',
  `new_coefficient` decimal(10,4) DEFAULT NULL COMMENT '调价后的 DAU 系数',
  `affected_slots` json DEFAULT NULL COMMENT '受影响的广告位列表（JSON 数组）',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '状态：pending=待确认, confirmed=已确认, rejected=已拒绝, applied=已执行',
  `confirmed_by` int DEFAULT NULL COMMENT '确认操作人ID',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `applied_at` datetime DEFAULT NULL COMMENT '实际执行时间',
  PRIMARY KEY (`ad_price_adjustment_log_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='广告调价历史记录表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ad_price_adjustment_logs`
--

LOCK TABLES `ad_price_adjustment_logs` WRITE;
/*!40000 ALTER TABLE `ad_price_adjustment_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `ad_price_adjustment_logs` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-21 19:08:07
