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
-- Table structure for table `bid_products`
--

DROP TABLE IF EXISTS `bid_products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `bid_products` (
  `bid_product_id` bigint NOT NULL AUTO_INCREMENT COMMENT '竞价商品ID（自增主键）',
  `exchange_item_id` bigint NOT NULL COMMENT '关联兑换商品ID（exchange_items.exchange_item_id）',
  `start_price` bigint NOT NULL COMMENT '起拍价（材料资产数量）',
  `price_asset_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'star_stone' COMMENT '竞价使用的资产类型（禁止 points/budget_points；默认 star_stone）',
  `current_price` bigint NOT NULL DEFAULT '0' COMMENT '当前最高出价（冗余字段，提升查询性能）',
  `min_bid_increment` bigint NOT NULL DEFAULT '10' COMMENT '最小加价幅度',
  `start_time` datetime NOT NULL COMMENT '竞价开始时间',
  `end_time` datetime NOT NULL COMMENT '竞价结束时间',
  `winner_user_id` int DEFAULT NULL COMMENT '中标用户ID',
  `winner_bid_id` bigint DEFAULT NULL COMMENT '中标出价记录ID（bid_records.bid_record_id）',
  `status` enum('pending','active','ended','cancelled','settled','settlement_failed','no_bid') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '竞价状态：pending=待开始, active=进行中, ended=已结束待结算, cancelled=已取消, settled=已结算, settlement_failed=结算失败, no_bid=流拍',
  `bid_count` int NOT NULL DEFAULT '0' COMMENT '总出价次数',
  `batch_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '批次号（预留字段，未来多批次竞价扩展用）',
  `created_by` int NOT NULL COMMENT '创建人（管理员用户ID）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`bid_product_id`),
  KEY `winner_user_id` (`winner_user_id`),
  KEY `created_by` (`created_by`),
  KEY `idx_bid_products_status_end` (`status`,`end_time`),
  KEY `idx_bid_products_exchange_item` (`exchange_item_id`),
  KEY `idx_bid_products_item_status` (`exchange_item_id`,`status`),
  KEY `idx_bid_products_item_batch` (`exchange_item_id`,`batch_no`),
  KEY `idx_bid_products_status_start` (`status`,`start_time`),
  CONSTRAINT `bid_products_ibfk_2` FOREIGN KEY (`winner_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `bid_products_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_bid_products_exchange_item` FOREIGN KEY (`exchange_item_id`) REFERENCES `exchange_items` (`exchange_item_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='竞价商品表（臻选空间/幸运空间竞价功能，7态状态机）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bid_products`
--

LOCK TABLES `bid_products` WRITE;
/*!40000 ALTER TABLE `bid_products` DISABLE KEYS */;
/*!40000 ALTER TABLE `bid_products` ENABLE KEYS */;
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
