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
-- Table structure for table `exchange_item_skus`
--

DROP TABLE IF EXISTS `exchange_item_skus`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `exchange_item_skus` (
  `sku_id` bigint NOT NULL AUTO_INCREMENT COMMENT 'SKU ID',
  `exchange_item_id` bigint NOT NULL,
  `sku_code` varchar(14) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'SKU 平台展示码(无意义随机码 SK+12位规范形,系统生成)',
  `stock` int NOT NULL DEFAULT '0' COMMENT '统一库存（所有渠道共享）',
  `sold_count` int NOT NULL DEFAULT '0' COMMENT '已售数量',
  `cost_price` decimal(10,2) DEFAULT NULL COMMENT '成本价（人民币）',
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态',
  `image_id` bigint unsigned DEFAULT NULL COMMENT 'SKU专属图片',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `barcode` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国际标准条码(UPC/EAN/GTIN,预留,可空;区别于供应商货号)',
  PRIMARY KEY (`sku_id`),
  UNIQUE KEY `sku_code` (`sku_code`),
  KEY `idx_product_skus_product_status` (`exchange_item_id`,`status`),
  KEY `idx_product_skus_status_stock` (`status`,`stock`),
  KEY `exchange_item_skus_ibfk_2` (`image_id`),
  CONSTRAINT `exchange_item_skus_ibfk_1` FOREIGN KEY (`exchange_item_id`) REFERENCES `exchange_items` (`exchange_item_id`),
  CONSTRAINT `exchange_item_skus_ibfk_2` FOREIGN KEY (`image_id`) REFERENCES `media_files` (`media_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=573 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='统一SKU（EAV 商品中心 Layer 1，替代exchange_item_skus）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `exchange_item_skus`
--

LOCK TABLES `exchange_item_skus` WRITE;
/*!40000 ALTER TABLE `exchange_item_skus` DISABLE KEYS */;
INSERT INTO `exchange_item_skus` VALUES
(504,633,'SKX2M9VSFJ4FZJ',4,6,NULL,'active',NULL,0,'2026-06-22 06:29:05','2026-07-15 21:25:25',NULL),
(508,637,'SKYZFYCTBYZ6T3',77,23,NULL,'active',NULL,0,'2026-06-22 13:01:15','2026-07-06 08:30:03',NULL),
(533,637,'SKRUGJYHAHYSMH',1,0,NULL,'inactive',NULL,0,'2026-07-06 03:37:08','2026-07-06 03:37:08',NULL);
/*!40000 ALTER TABLE `exchange_item_skus` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:49
