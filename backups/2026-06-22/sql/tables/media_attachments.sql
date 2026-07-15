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
-- Table structure for table `media_attachments`
--

DROP TABLE IF EXISTS `media_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `media_attachments` (
  `attachment_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '关联记录ID（主键）',
  `media_id` bigint unsigned NOT NULL COMMENT '关联的媒体文件ID',
  `attachable_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '业务实体类型(lottery_prize/exchange_item/ad_creative/...)',
  `attachable_id` bigint unsigned NOT NULL COMMENT '业务实体 ID',
  `role` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'primary' COMMENT '用途(primary/icon/banner/background/gallery)',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序顺序',
  `meta` json DEFAULT NULL COMMENT '关联元数据(alt_text/crop_rect等)',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`attachment_id`),
  KEY `idx_attachable` (`attachable_type`,`attachable_id`,`role`),
  KEY `idx_media` (`media_id`),
  CONSTRAINT `media_attachments_ibfk_1` FOREIGN KEY (`media_id`) REFERENCES `media_files` (`media_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=34 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='媒体关联表（多态关联 - 独立媒体服务方案 D+ 增强版）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `media_attachments`
--

LOCK TABLES `media_attachments` WRITE;
/*!40000 ALTER TABLE `media_attachments` DISABLE KEYS */;
INSERT INTO `media_attachments` VALUES
(1,1,'exchange_item',234,'primary',0,NULL,'2026-03-17 06:49:44'),
(2,2,'exchange_item',235,'primary',0,NULL,'2026-03-17 06:49:44'),
(3,3,'category',1,'icon',0,NULL,'2026-03-17 06:49:44'),
(4,4,'category',2,'icon',0,NULL,'2026-03-17 06:49:44'),
(5,5,'category',3,'icon',0,NULL,'2026-03-17 06:49:44'),
(6,6,'category',4,'icon',0,NULL,'2026-03-17 06:49:44'),
(7,7,'category',5,'icon',0,NULL,'2026-03-17 06:49:45'),
(8,8,'category',6,'icon',0,NULL,'2026-03-17 06:49:45'),
(9,9,'category',7,'icon',0,NULL,'2026-03-17 06:49:45'),
(10,10,'category',8,'icon',0,NULL,'2026-03-17 06:49:45'),
(11,11,'category',9,'icon',0,NULL,'2026-03-17 06:49:45'),
(12,12,'material_asset_type',1,'icon',0,NULL,'2026-03-17 06:49:45'),
(13,13,'material_asset_type',32,'icon',0,NULL,'2026-03-17 06:49:45'),
(14,14,'material_asset_type',33,'icon',0,NULL,'2026-03-17 06:49:45'),
(16,16,'material_asset_type',1094,'icon',0,NULL,'2026-03-17 06:49:45'),
(17,17,'material_asset_type',1095,'icon',0,NULL,'2026-03-17 06:49:45'),
(18,18,'material_asset_type',1096,'icon',0,NULL,'2026-03-17 06:49:45'),
(19,19,'material_asset_type',1097,'icon',0,NULL,'2026-03-17 06:49:45'),
(20,20,'material_asset_type',1098,'icon',0,NULL,'2026-03-17 06:49:45'),
(21,21,'material_asset_type',1099,'icon',0,NULL,'2026-03-17 06:49:45'),
(22,22,'material_asset_type',1100,'icon',0,NULL,'2026-03-17 06:49:45'),
(23,23,'material_asset_type',1101,'icon',0,NULL,'2026-03-17 06:49:45'),
(24,24,'material_asset_type',1102,'icon',0,NULL,'2026-03-17 06:49:45'),
(25,25,'material_asset_type',1103,'icon',0,NULL,'2026-03-17 06:49:45'),
(26,26,'material_asset_type',1104,'icon',0,NULL,'2026-03-17 06:49:45'),
(28,28,'exchange_item',402,'primary',0,NULL,'2026-03-20 15:56:38'),
(29,28,'exchange_item',403,'primary',0,NULL,'2026-03-20 15:56:45'),
(32,111,'material_asset_type',631,'icon',0,NULL,'2026-06-13 02:05:30'),
(33,111,'material_asset_type',1126,'icon',0,NULL,'2026-06-13 02:17:45');
/*!40000 ALTER TABLE `media_attachments` ENABLE KEYS */;
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
