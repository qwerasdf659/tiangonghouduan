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
-- Table structure for table `stores`
--

DROP TABLE IF EXISTS `stores`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `stores` (
  `store_id` int NOT NULL AUTO_INCREMENT COMMENT '门店ID（主键）',
  `store_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '门店名称（如：某某餐厅XX店）',
  `store_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '门店编号（唯一标识，如：ST20250101001）',
  `store_address` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '门店地址（详细地址）',
  `contact_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '门店联系人姓名',
  `contact_mobile` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '门店联系电话',
  `status` enum('active','inactive','pending') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '门店状态：active-正常营业，inactive-已关闭，pending-待审核',
  `assigned_to` int DEFAULT NULL COMMENT '分配给哪个业务员（外键关联users.user_id）',
  `merchant_id` int DEFAULT NULL COMMENT '商户ID（关联商家用户，外键关联users.user_id）',
  `notes` text COLLATE utf8mb4_unicode_ci COMMENT '备注信息',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（门店信息录入时间），时区：北京时间（GMT+8）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（最后修改时间），时区：北京时间（GMT+8）',
  `province_code` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '省级行政区划代码（必填，用于关联查询）',
  `province_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '省级名称（冗余字段，必填，修改区域时刷新）',
  `city_code` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '市级行政区划代码（必填，用于关联查询）',
  `city_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '市级名称（冗余字段，必填，修改区域时刷新）',
  `district_code` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '区县级行政区划代码（必填，用于关联查询）',
  `district_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '区县级名称（冗余字段，必填，修改区域时刷新）',
  `street_code` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '街道级行政区划代码（必填，门店必须精确到街道）',
  `street_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '街道级名称（冗余字段，必填，修改区域时刷新）',
  PRIMARY KEY (`store_id`),
  UNIQUE KEY `store_code` (`store_code`),
  UNIQUE KEY `uk_store_code` (`store_code`),
  KEY `idx_stores_status` (`status`),
  KEY `idx_stores_assigned_to` (`assigned_to`),
  KEY `idx_stores_merchant_id` (`merchant_id`),
  KEY `idx_stores_province_code` (`province_code`),
  KEY `idx_stores_city_code` (`city_code`),
  KEY `idx_stores_district_code` (`district_code`),
  KEY `idx_stores_street_code` (`street_code`),
  CONSTRAINT `fk_store_assigned_to` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `stores_ibfk_1` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`merchant_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=846 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='门店信息表（用于记录合作商家门店，业务员分派依据）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `stores`
--

LOCK TABLES `stores` WRITE;
/*!40000 ALTER TABLE `stores` DISABLE KEYS */;
INSERT INTO `stores` VALUES
(7,'老良记','ST20260113001','海淀区万寿路街道测试地址','验证人','13900000001','active',NULL,6,NULL,'2026-01-13 01:20:19','2026-06-22 13:30:47','110000','北京市','110100','市辖区','110108','海淀区','110108001','万寿路街道'),
(838,'东风1号','ST20260625001','1111','陈先生','13612227930','active',NULL,NULL,NULL,'2026-06-25 03:36:27','2026-06-25 03:36:27','310000','上海市','310100','市辖区','310104','徐汇区','310104003','天平路街道');
/*!40000 ALTER TABLE `stores` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:53
