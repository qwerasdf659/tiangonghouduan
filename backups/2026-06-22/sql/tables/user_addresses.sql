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
-- Table structure for table `user_addresses`
--

DROP TABLE IF EXISTS `user_addresses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_addresses` (
  `address_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '收货地址主键',
  `user_id` int NOT NULL COMMENT '用户 ID（关联 users.user_id）',
  `receiver_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '收件人姓名（已弃用明文列，保留待删）',
  `receiver_phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '收件人手机号（已弃用明文列，保留待删）',
  `province` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '省份',
  `city` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '城市',
  `district` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT '区/县',
  `detail_address` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '详细地址（已弃用明文列，保留待删）',
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
) ENGINE=InnoDB AUTO_INCREMENT=30 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户收货地址表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_addresses`
--

LOCK TABLES `user_addresses` WRITE;
/*!40000 ALTER TABLE `user_addresses` DISABLE KEYS */;
INSERT INTO `user_addresses` VALUES
(26,32,NULL,NULL,'北京市','北京市','东城区',NULL,NULL,1,'2026-06-14 09:27:30','2026-06-14 09:27:30','v1:80e978961faacbf1f195f0c8:67602abbbdf7950e314f2d432a5115ba:416116825bf88ed0588d','v1:6ffb02238ed0615622af4b8b:6e8e02b9019d5a1598d040339c8f9b90:c3ac0c5da0f7bbaa386a90','v1:d071a2dcc05c2ff3d1857827:510b31d0b9bf986469f3e59d7da22ca8:4f415b0b79'),
(27,32,NULL,NULL,'北京市','北京市','东城区',NULL,NULL,0,'2026-06-15 01:03:33','2026-06-15 01:03:33','v1:d5e496e623474afc7b473680:54df3a9c828efc0e5e8621249a25f2de:925314e422db25fded','v1:3c655894be1e252cfcf7d63f:da1d24c79170e38b153bd3a6d293530c:05950850d736a0333acd45','v1:d839b9a13649eb48fb8b3d33:bde61ea9d51504c75dec620ce7ffcc92:c3053bc875eaf4e84b4e8df9afba71c9f52b8f000c'),
(28,32,NULL,NULL,'北京市','北京市','东城区',NULL,NULL,0,'2026-06-15 01:06:37','2026-06-15 01:06:37','v1:a853fa90ca27221690bc597b:1d5a517ce3db9bd8503e0dd61cfe0b5d:372e80f0511abc1687','v1:50ea4b194edba87498bcbb34:d71b9e33e11c9ac1fe3c2f1d5b93d606:22047811617ca51dca3ebe','v1:409d7ee6dbcd659f96062b2a:03349e6f2ca371f800ad352c0b2d6ed1:99f0df09be71580ce9760bc5d2c993020ad4852fb4'),
(29,32,NULL,NULL,'北京市','北京市','东城区',NULL,NULL,0,'2026-06-15 01:07:14','2026-06-15 01:07:14','v1:3161ab19eee34e490ca253c6:4a6b0c90d2edbeb659294ace2a62ba5b:999c9a0e7490378fd7','v1:7b9d8affe42fa4b8520c85c7:1ccf785b80409187e4d5a720ede16032:fa454c8c0ad0694fb985ac','v1:9386c5278ac8bf026cab0eca:9224a7d6855c44b8e4604a763f35070d:49ab0df43f94a24077e52cc13d9301');
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

-- Dump completed on 2026-06-21 19:08:15
