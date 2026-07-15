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
-- Table structure for table `external_channel_mappings`
--

DROP TABLE IF EXISTS `external_channel_mappings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `external_channel_mappings` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '映射主键',
  `channel` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '外部渠道:taobao/douyin/...',
  `external_item_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '外部平台商品ID',
  `exchange_item_id` bigint NOT NULL COMMENT '我方SPU',
  `sync_status` enum('pending','synced','failed','disabled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '同步状态',
  `last_synced_at` datetime DEFAULT NULL COMMENT '最近同步时间（北京时间）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  `channel_price` decimal(10,2) DEFAULT NULL COMMENT '渠道独立售价(人民币元,NULL=默认取我方价,拍板#26)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_channel_external` (`channel`,`external_item_id`),
  KEY `idx_ecm_item` (`exchange_item_id`),
  CONSTRAINT `external_channel_mappings_ibfk_1` FOREIGN KEY (`exchange_item_id`) REFERENCES `exchange_items` (`exchange_item_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='外部平台商品ID↔我方item_code映射(S5)';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `external_channel_mappings`
--

LOCK TABLES `external_channel_mappings` WRITE;
/*!40000 ALTER TABLE `external_channel_mappings` DISABLE KEYS */;
/*!40000 ALTER TABLE `external_channel_mappings` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-10 18:10:57
