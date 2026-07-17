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
-- Table structure for table `product_bundle_items`
--

DROP TABLE IF EXISTS `product_bundle_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `product_bundle_items` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '组合明细主键',
  `bundle_id` bigint NOT NULL COMMENT '所属组合',
  `child_item_id` bigint DEFAULT NULL COMMENT '子项SPU',
  `child_sku_id` bigint DEFAULT NULL COMMENT '子项SKU',
  `quantity` int NOT NULL DEFAULT '1' COMMENT '数量',
  `is_gift` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否赠品',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  PRIMARY KEY (`id`),
  KEY `child_item_id` (`child_item_id`),
  KEY `child_sku_id` (`child_sku_id`),
  KEY `idx_pbi_bundle` (`bundle_id`),
  CONSTRAINT `product_bundle_items_ibfk_1` FOREIGN KEY (`bundle_id`) REFERENCES `product_bundles` (`bundle_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `product_bundle_items_ibfk_2` FOREIGN KEY (`child_item_id`) REFERENCES `exchange_items` (`exchange_item_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `product_bundle_items_ibfk_3` FOREIGN KEY (`child_sku_id`) REFERENCES `exchange_item_skus` (`sku_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=40 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='组合明细BOM(S4)';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_bundle_items`
--

LOCK TABLES `product_bundle_items` WRITE;
/*!40000 ALTER TABLE `product_bundle_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `product_bundle_items` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:51
