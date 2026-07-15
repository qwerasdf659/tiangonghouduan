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
-- Table structure for table `consignment_orders`
--

DROP TABLE IF EXISTS `consignment_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `consignment_orders` (
  `consignment_id` bigint NOT NULL AUTO_INCREMENT COMMENT '寄卖单主键',
  `order_no` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '寄卖单号',
  `item_id` bigint NOT NULL COMMENT '寄卖的实物实例(items.item_id,一物一码)',
  `consignor_account_id` bigint NOT NULL COMMENT '寄卖人账户(accounts.account_id)',
  `list_price` bigint DEFAULT NULL COMMENT '寄卖定价(计价资产数量)',
  `list_asset_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '计价资产码',
  `relist_item_id` bigint DEFAULT NULL COMMENT '回流后再上架的目标SPU',
  `status` enum('pending','listed','sold','withdrawn','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '状态',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  PRIMARY KEY (`consignment_id`),
  UNIQUE KEY `uk_consign_order_no` (`order_no`),
  KEY `relist_item_id` (`relist_item_id`),
  KEY `idx_consign_item` (`item_id`),
  KEY `idx_consign_consignor` (`consignor_account_id`),
  CONSTRAINT `consignment_orders_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `items` (`item_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `consignment_orders_ibfk_2` FOREIGN KEY (`consignor_account_id`) REFERENCES `accounts` (`account_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `consignment_orders_ibfk_3` FOREIGN KEY (`relist_item_id`) REFERENCES `exchange_items` (`exchange_item_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='二手寄卖单(S3;所有权流转复用item_ledger,转赠不单独建表)';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `consignment_orders`
--

LOCK TABLES `consignment_orders` WRITE;
/*!40000 ALTER TABLE `consignment_orders` DISABLE KEYS */;
/*!40000 ALTER TABLE `consignment_orders` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-10 18:10:56
