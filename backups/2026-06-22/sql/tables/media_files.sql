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
-- Table structure for table `media_files`
--

DROP TABLE IF EXISTS `media_files`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `media_files` (
  `media_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '媒体文件ID（主键）',
  `object_key` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '原图 Sealos object key',
  `thumbnail_keys` json DEFAULT NULL COMMENT '缩略图 keys: {small, medium, large}',
  `original_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '原始文件名',
  `file_size` int unsigned NOT NULL DEFAULT '0' COMMENT '文件大小(bytes)',
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'MIME 类型',
  `width` int unsigned DEFAULT NULL COMMENT '图片宽度(px)',
  `height` int unsigned DEFAULT NULL COMMENT '图片高度(px)',
  `content_hash` char(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'SHA-256 内容哈希(建议去重)',
  `folder` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '存储文件夹(products/materials/categories/...)',
  `tags` json DEFAULT NULL COMMENT '标签: ["奖品","活动A","2026春季"]',
  `uploaded_by` int unsigned DEFAULT NULL COMMENT '上传用户 ID',
  `status` enum('active','archived','trashed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态: active=正常, archived=归档, trashed=回收站',
  `trashed_at` datetime DEFAULT NULL COMMENT '移入回收站时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`media_id`),
  UNIQUE KEY `uk_object_key` (`object_key`),
  KEY `idx_content_hash` (`content_hash`),
  KEY `idx_folder_status` (`folder`,`status`),
  KEY `idx_uploaded_by` (`uploaded_by`,`created_at`),
  KEY `idx_status_trashed` (`status`,`trashed_at`)
) ENGINE=InnoDB AUTO_INCREMENT=119 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='媒体文件表（纯存储层 - 独立媒体服务方案 D+ 增强版）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `media_files`
--

LOCK TABLES `media_files` WRITE;
/*!40000 ALTER TABLE `media_files` DISABLE KEYS */;
INSERT INTO `media_files` VALUES
(1,'products/1773263201653_a62dad80de936024.jpg','{\"large\": \"products/thumbnails/large/1773263201653_a62dad80de936024.jpg\", \"small\": \"products/thumbnails/small/1773263201653_a62dad80de936024.jpg\", \"medium\": \"products/thumbnails/medium/1773263201653_a62dad80de936024.jpg\"}','1773263201653_a62dad80de936024.jpg',26663,'image/jpeg',1013,769,'c7b014cc54ea7854923bd4f48609fe16668e9a90a2af1dca9bf0ce90bb8a7287','products',NULL,NULL,'active',NULL,'2026-03-17 06:49:44','2026-03-17 08:02:27'),
(2,'products/1773263533268_3a2ff0cfc6abd2c3.jpg','{\"large\": \"products/thumbnails/large/1773263533268_3a2ff0cfc6abd2c3.jpg\", \"small\": \"products/thumbnails/small/1773263533268_3a2ff0cfc6abd2c3.jpg\", \"medium\": \"products/thumbnails/medium/1773263533268_3a2ff0cfc6abd2c3.jpg\"}','1773263533268_3a2ff0cfc6abd2c3.jpg',276952,'image/jpeg',1280,2844,'0922bfe73f38ca54266889af7e6dcb0101502d47d0928c72f959ca948635b05c','products',NULL,NULL,'active',NULL,'2026-03-17 06:49:44','2026-03-17 08:02:27'),
(3,'categories/1771673715022_3002c7ee237c04b8.png','{\"large\": \"categories/thumbnails/large/1771673715022_3002c7ee237c04b8.jpg\", \"small\": \"categories/thumbnails/small/1771673715022_3002c7ee237c04b8.jpg\", \"medium\": \"categories/thumbnails/medium/1771673715022_3002c7ee237c04b8.jpg\"}','1771673715022_3002c7ee237c04b8.png',42865,'image/png',256,256,'51ef2abf0515f8900af8c2618f2bc2762474462b029334cbd8da94f69383b173','categories',NULL,NULL,'active',NULL,'2026-03-17 06:49:44','2026-03-20 08:07:06'),
(4,'categories/1771673715054_0a7d30eaa5676d8d.png','{\"large\": \"categories/thumbnails/large/1771673715054_0a7d30eaa5676d8d.jpg\", \"small\": \"categories/thumbnails/small/1771673715054_0a7d30eaa5676d8d.jpg\", \"medium\": \"categories/thumbnails/medium/1771673715054_0a7d30eaa5676d8d.jpg\"}','1771673715054_0a7d30eaa5676d8d.png',40832,'image/png',256,256,'dcb06049f33e21bf91971bc71168b6764a1529f369579511652af166d44f70a3','categories',NULL,NULL,'active',NULL,'2026-03-17 06:49:44','2026-03-20 08:07:06'),
(5,'categories/1771673715089_50209f871f62934b.png','{\"large\": \"categories/thumbnails/large/1771673715089_50209f871f62934b.jpg\", \"small\": \"categories/thumbnails/small/1771673715089_50209f871f62934b.jpg\", \"medium\": \"categories/thumbnails/medium/1771673715089_50209f871f62934b.jpg\"}','1771673715089_50209f871f62934b.png',45737,'image/png',256,256,'81a1e6ec86bc402a83acb4bb7e728ca8d92d14c5ade058be837ce25e0ff56a7a','categories',NULL,NULL,'active',NULL,'2026-03-17 06:49:44','2026-03-20 08:07:06'),
(6,'categories/1771673715103_e5578bc359d8c728.png','{\"large\": \"categories/thumbnails/large/1771673715103_e5578bc359d8c728.jpg\", \"small\": \"categories/thumbnails/small/1771673715103_e5578bc359d8c728.jpg\", \"medium\": \"categories/thumbnails/medium/1771673715103_e5578bc359d8c728.jpg\"}','1771673715103_e5578bc359d8c728.png',45576,'image/png',256,256,'013e0918d35a92629f4cf262cf81c5a9da40902f60fba0cf4bc81108c88f7bc2','categories',NULL,NULL,'active',NULL,'2026-03-17 06:49:44','2026-03-20 08:07:07'),
(7,'categories/1771673715118_3db35a85e60652af.png','{\"large\": \"categories/thumbnails/large/1771673715118_3db35a85e60652af.jpg\", \"small\": \"categories/thumbnails/small/1771673715118_3db35a85e60652af.jpg\", \"medium\": \"categories/thumbnails/medium/1771673715118_3db35a85e60652af.jpg\"}','1771673715118_3db35a85e60652af.png',29971,'image/png',256,256,'df80f198d06da9d6b71ae2587c1070e073adef1956e7211dd78b03ca0b614a92','categories',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-03-20 08:07:07'),
(8,'categories/1771673715133_9139252a8f644c38.png','{\"large\": \"categories/thumbnails/large/1771673715133_9139252a8f644c38.jpg\", \"small\": \"categories/thumbnails/small/1771673715133_9139252a8f644c38.jpg\", \"medium\": \"categories/thumbnails/medium/1771673715133_9139252a8f644c38.jpg\"}','1771673715133_9139252a8f644c38.png',45897,'image/png',256,256,'dec34eafc45428ded3952d1861be3ef25b761ad60659ec6bf5aedff4eb80e197','categories',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-03-20 08:07:07'),
(9,'categories/1771673715146_1d526e00aaf32492.png','{\"large\": \"categories/thumbnails/large/1771673715146_1d526e00aaf32492.jpg\", \"small\": \"categories/thumbnails/small/1771673715146_1d526e00aaf32492.jpg\", \"medium\": \"categories/thumbnails/medium/1771673715146_1d526e00aaf32492.jpg\"}','1771673715146_1d526e00aaf32492.png',45506,'image/png',256,256,'3c212d02052dcddce43981d8384c31763fdac1599be1ed808c933a5b7b0e0fb3','categories',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-03-20 08:07:07'),
(10,'categories/1771673715164_55b5a60d5499dd67.png','{\"large\": \"categories/thumbnails/large/1771673715164_55b5a60d5499dd67.jpg\", \"small\": \"categories/thumbnails/small/1771673715164_55b5a60d5499dd67.jpg\", \"medium\": \"categories/thumbnails/medium/1771673715164_55b5a60d5499dd67.jpg\"}','1771673715164_55b5a60d5499dd67.png',46268,'image/png',256,256,'975a71adf005bf41328c72f60f0e181be71817cb2d02141b10b9d71bfa170668','categories',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-03-20 08:07:07'),
(11,'categories/1771673715176_a54c30e5af76e00e.png','{\"large\": \"categories/thumbnails/large/1771673715176_a54c30e5af76e00e.jpg\", \"small\": \"categories/thumbnails/small/1771673715176_a54c30e5af76e00e.jpg\", \"medium\": \"categories/thumbnails/medium/1771673715176_a54c30e5af76e00e.jpg\"}','1771673715176_a54c30e5af76e00e.png',28994,'image/png',256,256,'ebda6c35dd1ccfd6fc551eb3ea4147852f97986d225a98c3f9063159ac960fce','categories',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-03-20 08:07:07'),
(12,'materials/1771668349848_7393439468341796.png','{\"large\": \"materials/thumbnails/large/1771668349848_7393439468341796.jpg\", \"small\": \"materials/thumbnails/small/1771668349848_7393439468341796.jpg\", \"medium\": \"materials/thumbnails/medium/1771668349848_7393439468341796.jpg\"}','1771668349848_7393439468341796.png',35380,'image/png',256,256,'a5e8d50c1b38c05707d9be2cac0e43dbf0729be049c87ac00dbb5baf7b0789e3','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-03-20 08:07:07'),
(13,'materials/1771668349743_a6329ab6af399193.png','{\"large\": \"materials/thumbnails/large/1771668349743_a6329ab6af399193.jpg\", \"small\": \"materials/thumbnails/small/1771668349743_a6329ab6af399193.jpg\", \"medium\": \"materials/thumbnails/medium/1771668349743_a6329ab6af399193.jpg\"}','1771668349743_a6329ab6af399193.png',45843,'image/png',256,256,'b238faf0be93487f53cb73ee1394029589918839a54a78a8606dd3a094dd8f32','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-03-20 08:07:07'),
(14,'materials/1771668349827_6d2ef9c351042cfc.png','{\"large\": \"materials/thumbnails/large/1771668349827_6d2ef9c351042cfc.jpg\", \"small\": \"materials/thumbnails/small/1771668349827_6d2ef9c351042cfc.jpg\", \"medium\": \"materials/thumbnails/medium/1771668349827_6d2ef9c351042cfc.jpg\"}','1771668349827_6d2ef9c351042cfc.png',45893,'image/png',256,256,'40142519e7b2ef87a0dab7ddc7d1ccbd70149220fd840646571330f9ef2b2b0a','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-03-20 08:07:08'),
(16,'materials/1771668349862_f939bb3817b881b8.png','{\"large\": \"materials/thumbnails/large/1771668349862_f939bb3817b881b8.jpg\", \"small\": \"materials/thumbnails/small/1771668349862_f939bb3817b881b8.jpg\", \"medium\": \"materials/thumbnails/medium/1771668349862_f939bb3817b881b8.jpg\"}','1771668349862_f939bb3817b881b8.png',38561,'image/png',256,256,'f83d70ea5b01c488be4dda204a9a29f4e0819fadc7e05c8dc53a53e66393de58','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-03-20 08:07:08'),
(17,'materials/1771668349877_4a5306128fb72568.png','{\"large\": \"materials/thumbnails/large/1771668349877_4a5306128fb72568.jpg\", \"small\": \"materials/thumbnails/small/1771668349877_4a5306128fb72568.jpg\", \"medium\": \"materials/thumbnails/medium/1771668349877_4a5306128fb72568.jpg\"}','1771668349877_4a5306128fb72568.png',40380,'image/png',256,256,'9baf33d133e33aefc1b4d9cf8716af266b1c1550b409778bfb286669c5e8efef','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-03-20 08:07:08'),
(18,'materials/1771668349890_2584caff191bf4d3.png','{\"large\": \"materials/thumbnails/large/1771668349890_2584caff191bf4d3.jpg\", \"small\": \"materials/thumbnails/small/1771668349890_2584caff191bf4d3.jpg\", \"medium\": \"materials/thumbnails/medium/1771668349890_2584caff191bf4d3.jpg\"}','1771668349890_2584caff191bf4d3.png',39881,'image/png',256,256,'5fd8c840f599c392c3909949d94c0cd77d04a7906aed69af91aa5c5b5dc177fd','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-03-20 08:07:08'),
(19,'materials/1771668349916_6b0d069a6dec80e4.png','{\"large\": \"materials/thumbnails/large/1771668349916_6b0d069a6dec80e4.jpg\", \"small\": \"materials/thumbnails/small/1771668349916_6b0d069a6dec80e4.jpg\", \"medium\": \"materials/thumbnails/medium/1771668349916_6b0d069a6dec80e4.jpg\"}','1771668349916_6b0d069a6dec80e4.png',28389,'image/png',256,256,'6abf5ace53cb5a0f0151e1a67ff48d77550c7d9c829f6a5dbbce1023900f7963','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-03-20 08:07:08'),
(20,'materials/1771668349939_df52ed3350defa9a.png','{\"large\": \"materials/thumbnails/large/1771668349939_df52ed3350defa9a.jpg\", \"small\": \"materials/thumbnails/small/1771668349939_df52ed3350defa9a.jpg\", \"medium\": \"materials/thumbnails/medium/1771668349939_df52ed3350defa9a.jpg\"}','1771668349939_df52ed3350defa9a.png',37849,'image/png',256,256,'1b4611bdee92b91636524d13bacdcbb224c3bb19b501060a2d6258a35cde959d','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-03-20 08:07:08'),
(21,'materials/1771668349964_0ff6a97a7be71bdd.png','{\"large\": \"materials/thumbnails/large/1771668349964_0ff6a97a7be71bdd.jpg\", \"small\": \"materials/thumbnails/small/1771668349964_0ff6a97a7be71bdd.jpg\", \"medium\": \"materials/thumbnails/medium/1771668349964_0ff6a97a7be71bdd.jpg\"}','1771668349964_0ff6a97a7be71bdd.png',32149,'image/png',256,256,'9672e5e447a22c2001965ebf90593070eb7553ca70de8f6baef9f150b2fb26bd','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-03-20 08:07:08'),
(22,'materials/1771668349978_e84eb8f6c7a5454e.png','{\"large\": \"materials/thumbnails/large/1771668349978_e84eb8f6c7a5454e.jpg\", \"small\": \"materials/thumbnails/small/1771668349978_e84eb8f6c7a5454e.jpg\", \"medium\": \"materials/thumbnails/medium/1771668349978_e84eb8f6c7a5454e.jpg\"}','1771668349978_e84eb8f6c7a5454e.png',43449,'image/png',256,256,'7a98fbcf91eec4bdfe2c9a29f76c0ff38bc48c483619e98a3c1541ceb783e1ef','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-03-20 08:07:08'),
(23,'materials/1771668350006_77dca65ac50dbbbb.png','{\"large\": \"materials/thumbnails/large/1771668350006_77dca65ac50dbbbb.jpg\", \"small\": \"materials/thumbnails/small/1771668350006_77dca65ac50dbbbb.jpg\", \"medium\": \"materials/thumbnails/medium/1771668350006_77dca65ac50dbbbb.jpg\"}','1771668350006_77dca65ac50dbbbb.png',32546,'image/png',256,256,'5d7bb9308a0ed4251c812c007749554c90bdef01fbc8c712871590b211e87f1b','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-03-20 08:07:08'),
(24,'materials/1771668350025_249f12166232da17.png','{\"large\": \"materials/thumbnails/large/1771668350025_249f12166232da17.jpg\", \"small\": \"materials/thumbnails/small/1771668350025_249f12166232da17.jpg\", \"medium\": \"materials/thumbnails/medium/1771668350025_249f12166232da17.jpg\"}','1771668350025_249f12166232da17.png',40566,'image/png',256,256,'e8b047d433828ac52893a90f8e71b80c223206f3fe57c37dcd715916b86395e4','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-03-20 08:07:08'),
(25,'materials/1771668350042_dea7a4f77e3bf5c3.png','{\"large\": \"materials/thumbnails/large/1771668350042_dea7a4f77e3bf5c3.jpg\", \"small\": \"materials/thumbnails/small/1771668350042_dea7a4f77e3bf5c3.jpg\", \"medium\": \"materials/thumbnails/medium/1771668350042_dea7a4f77e3bf5c3.jpg\"}','1771668350042_dea7a4f77e3bf5c3.png',33277,'image/png',256,256,'0be32db21519b5cf1bf37d7df022837f56583d4633a042a2cbbfd34c0e511c3a','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-03-20 08:07:08'),
(26,'materials/1771668350058_571132e2187d28b6.png','{\"large\": \"materials/thumbnails/large/1771668350058_571132e2187d28b6.jpg\", \"small\": \"materials/thumbnails/small/1771668350058_571132e2187d28b6.jpg\", \"medium\": \"materials/thumbnails/medium/1771668350058_571132e2187d28b6.jpg\"}','1771668350058_571132e2187d28b6.png',35713,'image/png',256,256,'9e7a3c3d6abf1dd3296644fc392bdf6d0a471034fb7c17185346f707b7c37f49','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-03-20 08:07:08'),
(28,'uploads/1773993395738_a272271fd6a06c6c.jpg','{\"large\": \"uploads/thumbnails/large/1773993395738_a272271fd6a06c6c.jpg\", \"small\": \"uploads/thumbnails/small/1773993395738_a272271fd6a06c6c.jpg\", \"medium\": \"uploads/thumbnails/medium/1773993395738_a272271fd6a06c6c.jpg\"}','a6374d61375fc4cc7d079056a961a2cb.jpg',1215785,'image/jpeg',1280,2844,'f6fe666529d6115f7096fef981473823713779c69f5730eeff8effe386162da1','uploads',NULL,31,'active',NULL,'2026-03-20 15:56:35','2026-03-20 15:56:35'),
(111,'uploads/1781286602633_ec1cdf67e1008539.jpg','{\"large\": \"uploads/thumbnails/large/1781286602633_ec1cdf67e1008539.jpg\", \"small\": \"uploads/thumbnails/small/1781286602633_ec1cdf67e1008539.jpg\", \"medium\": \"uploads/thumbnails/medium/1781286602633_ec1cdf67e1008539.jpg\"}','star-stone.png',50750,'image/png',256,256,'d4e9a926651af92d72f0702e1cfdfe66a7244fe3b161da7d86ee925062aec554','uploads',NULL,31,'active',NULL,'2026-06-13 01:50:03','2026-06-13 01:50:03'),
(118,'uploads/1781998734161_6733335505260f35.jpg','{\"large\": \"uploads/thumbnails/large/1781998734161_6733335505260f35.jpg\", \"small\": \"uploads/thumbnails/small/1781998734161_6733335505260f35.jpg\", \"medium\": \"uploads/thumbnails/medium/1781998734161_6733335505260f35.jpg\"}','32856772d756924417bcbb2c4cd104f2.jpg',1238021,'image/jpeg',1280,2844,'535f80b7ce359c8e8e17fa0350d8c5e48e878cda7af195ef887b9dd8a866f1f1','uploads',NULL,32,'active',NULL,'2026-06-21 07:38:54','2026-06-21 07:38:54');
/*!40000 ALTER TABLE `media_files` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-21 19:08:14
