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
-- Table structure for table `user_addresses`
--

DROP TABLE IF EXISTS `user_addresses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_addresses` (
  `address_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '收货地址主键',
  `user_id` int NOT NULL COMMENT '用户 ID（关联 users.user_id）',
  `province` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '省份',
  `city` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '城市',
  `district` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT '区/县',
  `postal_code` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '邮政编码',
  `is_default` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否默认地址',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `receiver_name_encrypted` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '收件人姓名密文（AES-256-GCM）',
  `receiver_phone_encrypted` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '收件人手机号密文（AES-256-GCM）',
  `detail_address_encrypted` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '详细地址密文（AES-256-GCM）',
  PRIMARY KEY (`address_id`),
  KEY `idx_user_addresses_user_id` (`user_id`),
  KEY `idx_user_addresses_user_default` (`user_id`,`is_default`),
  CONSTRAINT `user_addresses_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=65 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户收货地址表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_addresses`
--

LOCK TABLES `user_addresses` WRITE;
/*!40000 ALTER TABLE `user_addresses` DISABLE KEYS */;
INSERT INTO `user_addresses` VALUES
(31,32,'北京市','北京市','东城区',NULL,1,'2026-06-28 23:39:40','2026-06-28 23:39:40','v1:1d5419d79ab55cbeea37af1a:9e5ce02bc4161754217d868f75e22350:276ce3315fdcdd983c','v1:507efca7f50b8894987d88a4:13308a91ca7ba4a5137e00e7a53d7f24:de4549f246f57ca32811d6','v1:f9b761376a027b8274975844:92228db96c0db74e5928f93c6f4ffb8e:37fd2e'),
(32,12803,'北京市','北京市','海淀区',NULL,1,'2026-06-29 00:12:22','2026-06-29 00:12:22','v1:04c80cf8871f6c688f216afc:9c3727654323ff95ec3df348f82349c8:4f948067acdbd1f575','v1:28500bade8babd192010e930:de730b4b5fc94be51db0929388fe3005:3f714aed30c76a7b6848ee','v1:ea318a07ebc671bed35e23e4:1680d815cbe7c180db394971e761874e:2c451c');
/*!40000 ALTER TABLE `user_addresses` ENABLE KEYS */;
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
