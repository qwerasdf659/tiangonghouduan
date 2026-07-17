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
-- Table structure for table `ad_target_zones`
--

DROP TABLE IF EXISTS `ad_target_zones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ad_target_zones` (
  `zone_id` int NOT NULL AUTO_INCREMENT COMMENT '地域定向ID',
  `zone_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '地域类型：district=商圈, region=区域',
  `zone_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '地域名称（如"望京商圈"、"朝阳区"）',
  `priority` int NOT NULL DEFAULT '10' COMMENT '匹配优先级（越小越优先，运营可调）',
  `parent_zone_id` int DEFAULT NULL COMMENT '上级区域ID（商圈→区域的父子关系）',
  `geo_scope` json DEFAULT NULL COMMENT '覆盖范围（关联门店列表、行政区划ID 等）',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态：active=启用, inactive=停用',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`zone_id`),
  KEY `parent_zone_id` (`parent_zone_id`),
  CONSTRAINT `ad_target_zones_ibfk_1` FOREIGN KEY (`parent_zone_id`) REFERENCES `ad_target_zones` (`zone_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='广告地域定向表（商圈 + 区域两级分类）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ad_target_zones`
--

LOCK TABLES `ad_target_zones` WRITE;
/*!40000 ALTER TABLE `ad_target_zones` DISABLE KEYS */;
/*!40000 ALTER TABLE `ad_target_zones` ENABLE KEYS */;
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
