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
-- Table structure for table `bid_records`
--

DROP TABLE IF EXISTS `bid_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `bid_records` (
  `bid_record_id` bigint NOT NULL AUTO_INCREMENT COMMENT '出价记录ID（自增主键）',
  `bid_product_id` bigint NOT NULL COMMENT '关联竞价商品ID（bid_products.bid_product_id）',
  `user_id` int NOT NULL COMMENT '出价用户ID（users.user_id）',
  `bid_amount` bigint NOT NULL COMMENT '出价金额（材料资产数量）',
  `previous_highest` bigint NOT NULL DEFAULT '0' COMMENT '出价时的前最高价（审计用）',
  `is_winning` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否当前最高价（出价时标记，后续出价会将前一条改为 false）',
  `is_final_winner` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否最终中标（结算时由定时任务标记）',
  `freeze_transaction_id` bigint DEFAULT NULL COMMENT '冻结流水ID（asset_transactions.asset_transaction_id，对账用）',
  `idempotency_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '幂等键（防止重复出价，UNIQUE 约束）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '出价时间',
  PRIMARY KEY (`bid_record_id`),
  UNIQUE KEY `idempotency_key` (`idempotency_key`),
  KEY `idx_bid_records_product_amount` (`bid_product_id`,`bid_amount`),
  KEY `idx_bid_records_user_bid` (`user_id`,`bid_product_id`),
  CONSTRAINT `bid_records_ibfk_1` FOREIGN KEY (`bid_product_id`) REFERENCES `bid_products` (`bid_product_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `bid_records_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='竞价出价记录表（含冻结流水对账、幂等性控制）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bid_records`
--

LOCK TABLES `bid_records` WRITE;
/*!40000 ALTER TABLE `bid_records` DISABLE KEYS */;
/*!40000 ALTER TABLE `bid_records` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-21 19:08:11
