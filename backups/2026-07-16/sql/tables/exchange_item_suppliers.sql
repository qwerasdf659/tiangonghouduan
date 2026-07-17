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
-- Table structure for table `exchange_item_suppliers`
--

DROP TABLE IF EXISTS `exchange_item_suppliers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `exchange_item_suppliers` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '关联主键',
  `exchange_item_id` bigint NOT NULL COMMENT '商品SPU(exchange_items.exchange_item_id)',
  `supplier_id` bigint NOT NULL COMMENT '供应商(suppliers.supplier_id)',
  `supplier_item_code` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '该供应商对此SPU的原始货号(可空可重复,仅采购对账参考)',
  `is_primary` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否主供货商(展示/默认对账)',
  `purchase_price` decimal(10,2) DEFAULT NULL COMMENT '最近进货价(预留,S1采购单启用时维护)',
  `quality_score` decimal(3,1) DEFAULT NULL COMMENT '供货质量评分(预留,0.0~10.0,S1采购评估用)',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_item_supplier` (`exchange_item_id`,`supplier_id`),
  KEY `idx_eis_supplier` (`supplier_id`),
  KEY `idx_eis_supplier_code` (`supplier_item_code`),
  CONSTRAINT `exchange_item_suppliers_ibfk_1` FOREIGN KEY (`exchange_item_id`) REFERENCES `exchange_items` (`exchange_item_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `exchange_item_suppliers_ibfk_2` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`supplier_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商品-供应商多对多关联(货号挂关联行)';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `exchange_item_suppliers`
--

LOCK TABLES `exchange_item_suppliers` WRITE;
/*!40000 ALTER TABLE `exchange_item_suppliers` DISABLE KEYS */;
/*!40000 ALTER TABLE `exchange_item_suppliers` ENABLE KEYS */;
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
