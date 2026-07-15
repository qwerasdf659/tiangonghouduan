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
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `user_id` int NOT NULL AUTO_INCREMENT COMMENT '用户唯一标识',
  `nickname` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '用户昵称',
  `status` enum('active','inactive','banned') COLLATE utf8mb4_unicode_ci DEFAULT 'active' COMMENT '用户状态',
  `last_login` datetime DEFAULT NULL COMMENT '最后登录时间',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `login_count` int DEFAULT '0' COMMENT '登录次数统计',
  `consecutive_fail_count` int DEFAULT '0' COMMENT '连续未中奖次数（保底机制核心）',
  `history_total_points` int DEFAULT '0' COMMENT '历史累计总积分（臻选空间解锁条件）',
  `user_uuid` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '用户UUID（用于外部标识和QR码，UUIDv4格式）',
  `user_level` enum('normal','vip','merchant') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal' COMMENT '用户等级（normal-普通用户，vip-VIP用户，merchant-商户）',
  `last_active_at` datetime DEFAULT NULL COMMENT '用户最后活跃时间（登录、抽奖等操作时更新，用于用户分群）',
  `avatar_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '用户头像URL（微信头像或自定义头像）',
  `wx_openid` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '微信小程序 openid，用于静默登录（wx.login → jscode2session）',
  `mobile_encrypted` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '手机号密文（AES-256-GCM，格式 v1:iv:tag:cipher），展示/发短信时解密',
  `mobile_hash` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '手机号盲索引（HMAC-SHA256），用于唯一性约束与等值查询，不可逆',
  `privacy_consent_at` datetime DEFAULT NULL COMMENT '隐私政策/用户协议首次同意时间（北京时间，NULL=未记录）',
  `mobile_prefix_hash` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '手机号前3位号段盲索引（HMAC-SHA256），用于管理端按号段搜，非唯一',
  `mobile_suffix_hash` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '手机号后4位尾号盲索引（HMAC-SHA256），用于管理端按尾号搜，非唯一',
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `idx_users_user_uuid_unique` (`user_uuid`),
  UNIQUE KEY `idx_users_wx_openid` (`wx_openid`),
  UNIQUE KEY `uk_users_mobile_hash` (`mobile_hash`),
  KEY `idx_status` (`status`),
  KEY `users_last_login` (`last_login`),
  KEY `users_history_total_points` (`history_total_points`),
  KEY `idx_users_user_level` (`user_level`),
  KEY `idx_users_last_active_at` (`last_active_at`),
  KEY `idx_users_mobile_prefix_hash` (`mobile_prefix_hash`),
  KEY `idx_users_mobile_suffix_hash` (`mobile_suffix_hash`)
) ENGINE=InnoDB AUTO_INCREMENT=12815 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES
(32,'用户7910','active','2026-07-11 01:54:29','2025-10-10 02:52:02','2026-07-11 01:54:29',899,0,3153691,'cdfe43b0-d67b-4185-886e-185876cf3164','normal','2026-07-11 01:54:29',NULL,'oXaKt7T0UqxwBbHg6pGqw2PqXo64','v1:61411212e12d6f7a82a6e188:3dc2f017c3bc32f09312e20d304cfcde:795fece30959bcd024f11b','2496925a7a6ab34378dd6e23b0bf456bea48c410427ebec0083d977bc10a4c3b',NULL,'b0c1876b9bad56a6300246aa3fe6404232a0067b7acf66ea87fba59ec97d934c','76a2832b82453263b6af4f196aa049205217e11350875fd8e159ebd02c5d9db6'),
(11021,'系统定时任务','active',NULL,'2026-01-15 06:14:22','2026-01-15 06:14:22',0,0,0,'7cd432c5-b50b-4221-83f8-64b8565baa8e','normal','2026-01-15 06:14:22',NULL,NULL,'v1:b5040a39099ea188b5530274:cf64bf771238964b93164eddb9882db1:9ce457ccdcd9f71f808170','5c2b32b423b03823c44ac7db86149c8c3054f6303b4484450af138f7cfa5c312',NULL,'5290fcb9c653553aca0ea9afaa5b99a661e669127f291b13d1832118b267b76c','641d459418c8053cc61c1038c47ef7f6b3b35e81c02786f1195e987dd0ee4ca4'),
(12796,'权限边界测试用户','active','2026-06-27 07:30:00','2026-06-22 07:51:03','2026-06-27 07:30:00',21,0,5168,'7d20130a-687c-4431-a601-eda363b5cc85','normal','2026-06-27 07:30:40',NULL,NULL,'v1:5e63595edc74d8ae86a85ae8:2a32ddd4bb57351c289a9d3f0c0f60e1:3568a7ed2723ce146e505e','5408b0e2c406d328d2d6e4ca3fdd5e77a66f0714f505dea0be5fec50a2839364','2026-06-22 07:51:03','1aa87fccf5f9e02b6d00a70b18cc0d21f903107e5173fa3cb465d7c1618a9f15','76a2832b82453263b6af4f196aa049205217e11350875fd8e159ebd02c5d9db6'),
(12797,'用户5772','active','2026-06-22 22:30:35','2026-06-22 22:30:35','2026-06-25 04:32:19',1,0,365,'fa9eb4c6-4777-4935-b029-1342f8524dd8','normal','2026-06-26 00:05:12',NULL,'oXaKt7ZoZxvW6ubayUXD7fSWEZLg','v1:b8e6f38eb5b14446008281ab:8715b6f2eef726fc1c09020f76a6b77a:ca358a9442ee0ca87b39dc','6d6b16134a9d185fb0fc5a8e8b7e11530ce2d91634ca46a39affb01503c686d2','2026-06-22 22:30:35','eed8f28e99c42069788acdf6044afb3c9a295ea809ade00cdd95936a0ea6261d','71bc9c38c78f12b61d1e672ab3d991dbf9a25258b11cbbc808f72d34bd1a0d89'),
(12798,'用户7930','active','2026-06-27 06:29:33','2026-06-25 00:36:39','2026-06-27 06:29:33',10,0,0,'24fb0093-ab21-4edd-adb3-eae21c007bb0','normal','2026-06-27 06:31:23',NULL,NULL,'v1:3f053499786b6e3d539f2a77:9264edac348d26a3e05f4b409cf9e9fd:1176edd90a732180afff0e','e3c9cb5336e1adb70a543f2fafcdbd67d68d5208a7936c2338af65a50199a928','2026-06-25 00:36:39','b0c1876b9bad56a6300246aa3fe6404232a0067b7acf66ea87fba59ec97d934c','6d7b3e40a935806875b299d757d48e0ff89bf37922e8bdf82db74e9e682ce353'),
(12799,'用户8218','active','2026-06-25 09:49:15','2026-06-25 00:56:43','2026-06-25 09:49:15',3,0,7835,'2967c75f-dee7-4c81-b2c3-198801d36e49','normal','2026-06-25 09:49:30',NULL,NULL,'v1:736dfbaf22dd86d99758179a:160dc621023a2a75c22b6d55f0fbb5f1:d13e846f809de482fe50a8','23cf79e35420c6808864ea7379900d34e0792565a05dd48aa54e4040da808548','2026-06-25 00:56:43','70c6edd852b4b8e128d69646eb96afb86c7ac0e0613344d67a4781864be7f19d','c5103b893606a90f8a7b9fd673c5468f76d223f86c3a4930a87cec3d24a4cea3'),
(12800,'用户7911','active','2026-06-26 00:18:41','2026-06-26 00:18:41','2026-06-26 00:20:30',1,0,1000,'e7144c94-851e-4d16-8676-d5abc5c3a2a3','normal','2026-06-26 00:21:13',NULL,NULL,'v1:63f8bafbb6c197b859573803:8b4a1b2a826befb05c3fc5710b51309f:7b84185fa0e2b339ae3eeb','a2dbb96ada86e9b3ac0a3b0bff9c51ce0f827bc55836ff99b3e097484d203d19','2026-06-26 00:18:41','b0c1876b9bad56a6300246aa3fe6404232a0067b7acf66ea87fba59ec97d934c','d0532b65dc28d0319ebfe62f7fc2200fd02bef0322deb7f0ea3dc16b32a0f082'),
(12801,'用户7931','active','2026-06-27 06:28:25','2026-06-26 06:59:18','2026-06-27 06:28:25',3,0,0,'30a8473d-c7a3-4a94-9d0d-07d70441f54a','normal','2026-06-27 06:29:06',NULL,NULL,'v1:c60e2577310626f48f1d5ee9:4294315e2e3a3231c4087e73bb505df7:38ba2428447cc4afe070aa','c55137c01844ca525737cfcae1e38b4881ed9eb6d2654215f69d5b95db809976','2026-06-26 06:59:18','b0c1876b9bad56a6300246aa3fe6404232a0067b7acf66ea87fba59ec97d934c','b3911a6ec0fd72f2d0dd842d76808102dba67aded3f0bc8e12aec58dbedc02a6'),
(12802,'用户7932','active','2026-06-26 07:01:13','2026-06-26 07:01:13','2026-06-27 07:54:20',1,0,3899,'e8c661ef-35c0-4cc0-be72-1a729d142abc','normal','2026-06-27 08:02:06',NULL,NULL,'v1:50bcf812167095dda09e32ab:e72a8d640436e0b7ac01ca8862b99101:01c0f99f3ff0f752a0ba9d','ec59e4653ae28e52af77c08dfc541cdd5c032d4608fa6d7d37e07595df83b26e','2026-06-26 07:01:13','b0c1876b9bad56a6300246aa3fe6404232a0067b7acf66ea87fba59ec97d934c','d685167f38224fc1fd680c8f4ec41b75106174e4cc72a5fcc223517aad736c18'),
(12803,'用户7933','active','2026-06-28 23:58:27','2026-06-27 08:02:17','2026-06-28 23:58:27',6,0,7570,'2986aeb8-7095-4bc6-80a8-4ea7f378cec6','normal','2026-06-29 00:16:23',NULL,NULL,'v1:2aba18928b3331ac42ac150a:8612261924704baf918dd57c9ea43827:0f4d1f245ebe6a8b15a50b','98d80de34eacb5127be627523817bbc91b719e62e5d4ee0aa1f5fbf4359b4f82','2026-06-27 08:02:17','b0c1876b9bad56a6300246aa3fe6404232a0067b7acf66ea87fba59ec97d934c','403f1e41b8f7f8ad9a9703bd2eac19eb7e18cb71b712e77b57a5b42f65ee2dcc'),
(12804,'用户7634','active','2026-06-28 03:05:45','2026-06-28 03:05:45','2026-06-28 03:11:32',1,0,3530,'d01a492a-c263-4d86-8c92-20433bdedcd6','normal','2026-06-28 03:14:27',NULL,NULL,'v1:f5e0fb3fcf21baf86b57e5d1:39071e61f8e50c42de4911bd805e4f7a:3dd1594f4e200535cf997b','33ae49d496578597de2fd607525c24417b56a916f9bf84818911ac6bc3991331','2026-06-28 03:05:45','b0c1876b9bad56a6300246aa3fe6404232a0067b7acf66ea87fba59ec97d934c','c1f7bf38c2c14e9bec6844d87b37a3b02fcef3d132766872692f5d5db721de97'),
(12805,'用户7935','active','2026-06-28 23:54:48','2026-06-28 07:59:35','2026-06-28 23:54:48',12,0,0,'2da75ac4-6534-403c-a2b5-a8c7b0303752','normal','2026-06-28 23:58:03',NULL,NULL,'v1:1742bdb211f8aa1b9b6ab825:da6762effc47ec247e4cf5c0f890ff65:fa35d5bf941885fd4c1d58','c5044101f6d48903e2030ae11bfa4dcf6ae7b1fc2454873d9c002780d7572dc6','2026-06-28 07:59:35','b0c1876b9bad56a6300246aa3fe6404232a0067b7acf66ea87fba59ec97d934c','5a76ce21115b56db48aff8f59050ad0431ca7c124611f64779103bebc5a30b65'),
(12806,'用户7934','active','2026-06-28 23:58:10','2026-06-28 23:58:10','2026-06-28 23:58:10',1,0,0,'a4ca273c-2dd7-4a65-a4c5-b1ab32266728','normal','2026-06-28 23:58:20',NULL,NULL,'v1:d2a89215f0705f45322dcde0:ae6bc4db4535f3e22295d35a4cce758d:0682b47f21c0e927930207','8ee60bed92d26a92025d2fb07d31eeb3b790deb849579a5017b467d869e5cf0a','2026-06-28 23:58:10','b0c1876b9bad56a6300246aa3fe6404232a0067b7acf66ea87fba59ec97d934c','8b3356faf098735f41f32c3c3698e3e8d18497952880f9714b892eeb215be379'),
(12807,'用户0749','active','2026-07-06 03:35:01','2026-07-06 03:35:00','2026-07-06 03:35:01',2,0,0,'f37d7022-d92f-4d48-ae0d-1cb5f5ff09ce','normal','2026-07-06 03:35:01',NULL,NULL,'v1:fb540d2ebd323ea260085c63:e628efa501067d0ce6c39805c8c04e03:74349e60abbc984c57a99b','bf3c0725d5e8ca5c2fb30fbabc69fc2e7e5ff3256e6c41dec7efb2d2f7aa9b18','2026-07-06 03:35:00','b0c1876b9bad56a6300246aa3fe6404232a0067b7acf66ea87fba59ec97d934c','2a3dd58c3ab3c413df9688eeb0a9b332d66f087c3f4f5c59d0c423d626efebc6');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-10 18:11:01
