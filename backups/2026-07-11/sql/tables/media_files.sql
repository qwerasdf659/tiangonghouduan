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
) ENGINE=InnoDB AUTO_INCREMENT=143 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='媒体文件表（纯存储层 - 独立媒体服务方案 D+ 增强版）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `media_files`
--

LOCK TABLES `media_files` WRITE;
/*!40000 ALTER TABLE `media_files` DISABLE KEYS */;
INSERT INTO `media_files` VALUES
(3,'categories/1771673715022_3002c7ee237c04b8.png','{\"w375\": \"categories/thumbnails/w375/1771673715022_3002c7ee237c04b8.webp\", \"w750\": \"categories/thumbnails/w750/1771673715022_3002c7ee237c04b8.webp\", \"w1080\": \"categories/thumbnails/w1080/1771673715022_3002c7ee237c04b8.webp\"}','1771673715022_3002c7ee237c04b8.png',42865,'image/png',256,256,'51ef2abf0515f8900af8c2618f2bc2762474462b029334cbd8da94f69383b173','categories',NULL,NULL,'active',NULL,'2026-03-17 06:49:44','2026-06-24 07:58:49'),
(4,'categories/1771673715054_0a7d30eaa5676d8d.png','{\"w375\": \"categories/thumbnails/w375/1771673715054_0a7d30eaa5676d8d.webp\", \"w750\": \"categories/thumbnails/w750/1771673715054_0a7d30eaa5676d8d.webp\", \"w1080\": \"categories/thumbnails/w1080/1771673715054_0a7d30eaa5676d8d.webp\"}','1771673715054_0a7d30eaa5676d8d.png',40832,'image/png',256,256,'dcb06049f33e21bf91971bc71168b6764a1529f369579511652af166d44f70a3','categories',NULL,NULL,'active',NULL,'2026-03-17 06:49:44','2026-06-24 07:58:49'),
(5,'categories/1771673715089_50209f871f62934b.png','{\"w375\": \"categories/thumbnails/w375/1771673715089_50209f871f62934b.webp\", \"w750\": \"categories/thumbnails/w750/1771673715089_50209f871f62934b.webp\", \"w1080\": \"categories/thumbnails/w1080/1771673715089_50209f871f62934b.webp\"}','1771673715089_50209f871f62934b.png',45737,'image/png',256,256,'81a1e6ec86bc402a83acb4bb7e728ca8d92d14c5ade058be837ce25e0ff56a7a','categories',NULL,NULL,'active',NULL,'2026-03-17 06:49:44','2026-06-24 07:58:49'),
(6,'categories/1771673715103_e5578bc359d8c728.png','{\"w375\": \"categories/thumbnails/w375/1771673715103_e5578bc359d8c728.webp\", \"w750\": \"categories/thumbnails/w750/1771673715103_e5578bc359d8c728.webp\", \"w1080\": \"categories/thumbnails/w1080/1771673715103_e5578bc359d8c728.webp\"}','1771673715103_e5578bc359d8c728.png',45576,'image/png',256,256,'013e0918d35a92629f4cf262cf81c5a9da40902f60fba0cf4bc81108c88f7bc2','categories',NULL,NULL,'active',NULL,'2026-03-17 06:49:44','2026-06-24 07:58:49'),
(7,'categories/1771673715118_3db35a85e60652af.png','{\"w375\": \"categories/thumbnails/w375/1771673715118_3db35a85e60652af.webp\", \"w750\": \"categories/thumbnails/w750/1771673715118_3db35a85e60652af.webp\", \"w1080\": \"categories/thumbnails/w1080/1771673715118_3db35a85e60652af.webp\"}','1771673715118_3db35a85e60652af.png',29971,'image/png',256,256,'df80f198d06da9d6b71ae2587c1070e073adef1956e7211dd78b03ca0b614a92','categories',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-06-24 07:58:49'),
(8,'categories/1771673715133_9139252a8f644c38.png','{\"w375\": \"categories/thumbnails/w375/1771673715133_9139252a8f644c38.webp\", \"w750\": \"categories/thumbnails/w750/1771673715133_9139252a8f644c38.webp\", \"w1080\": \"categories/thumbnails/w1080/1771673715133_9139252a8f644c38.webp\"}','1771673715133_9139252a8f644c38.png',45897,'image/png',256,256,'dec34eafc45428ded3952d1861be3ef25b761ad60659ec6bf5aedff4eb80e197','categories',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-06-24 07:58:49'),
(9,'categories/1771673715146_1d526e00aaf32492.png','{\"w375\": \"categories/thumbnails/w375/1771673715146_1d526e00aaf32492.webp\", \"w750\": \"categories/thumbnails/w750/1771673715146_1d526e00aaf32492.webp\", \"w1080\": \"categories/thumbnails/w1080/1771673715146_1d526e00aaf32492.webp\"}','1771673715146_1d526e00aaf32492.png',45506,'image/png',256,256,'3c212d02052dcddce43981d8384c31763fdac1599be1ed808c933a5b7b0e0fb3','categories',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-06-24 07:58:49'),
(10,'categories/1771673715164_55b5a60d5499dd67.png','{\"w375\": \"categories/thumbnails/w375/1771673715164_55b5a60d5499dd67.webp\", \"w750\": \"categories/thumbnails/w750/1771673715164_55b5a60d5499dd67.webp\", \"w1080\": \"categories/thumbnails/w1080/1771673715164_55b5a60d5499dd67.webp\"}','1771673715164_55b5a60d5499dd67.png',46268,'image/png',256,256,'975a71adf005bf41328c72f60f0e181be71817cb2d02141b10b9d71bfa170668','categories',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-06-24 07:58:49'),
(11,'categories/1771673715176_a54c30e5af76e00e.png','{\"w375\": \"categories/thumbnails/w375/1771673715176_a54c30e5af76e00e.webp\", \"w750\": \"categories/thumbnails/w750/1771673715176_a54c30e5af76e00e.webp\", \"w1080\": \"categories/thumbnails/w1080/1771673715176_a54c30e5af76e00e.webp\"}','1771673715176_a54c30e5af76e00e.png',28994,'image/png',256,256,'ebda6c35dd1ccfd6fc551eb3ea4147852f97986d225a98c3f9063159ac960fce','categories',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-06-24 07:58:49'),
(12,'materials/1771668349848_7393439468341796.png','{\"w375\": \"materials/thumbnails/w375/1771668349848_7393439468341796.webp\", \"w750\": \"materials/thumbnails/w750/1771668349848_7393439468341796.webp\", \"w1080\": \"materials/thumbnails/w1080/1771668349848_7393439468341796.webp\"}','1771668349848_7393439468341796.png',35380,'image/png',256,256,'a5e8d50c1b38c05707d9be2cac0e43dbf0729be049c87ac00dbb5baf7b0789e3','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-06-24 07:58:49'),
(13,'materials/1771668349743_a6329ab6af399193.png','{\"w375\": \"materials/thumbnails/w375/1771668349743_a6329ab6af399193.webp\", \"w750\": \"materials/thumbnails/w750/1771668349743_a6329ab6af399193.webp\", \"w1080\": \"materials/thumbnails/w1080/1771668349743_a6329ab6af399193.webp\"}','1771668349743_a6329ab6af399193.png',45843,'image/png',256,256,'b238faf0be93487f53cb73ee1394029589918839a54a78a8606dd3a094dd8f32','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-06-24 07:58:50'),
(14,'materials/1771668349827_6d2ef9c351042cfc.png','{\"w375\": \"materials/thumbnails/w375/1771668349827_6d2ef9c351042cfc.webp\", \"w750\": \"materials/thumbnails/w750/1771668349827_6d2ef9c351042cfc.webp\", \"w1080\": \"materials/thumbnails/w1080/1771668349827_6d2ef9c351042cfc.webp\"}','1771668349827_6d2ef9c351042cfc.png',45893,'image/png',256,256,'40142519e7b2ef87a0dab7ddc7d1ccbd70149220fd840646571330f9ef2b2b0a','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-06-24 07:58:50'),
(16,'materials/1771668349862_f939bb3817b881b8.png','{\"w375\": \"materials/thumbnails/w375/1771668349862_f939bb3817b881b8.webp\", \"w750\": \"materials/thumbnails/w750/1771668349862_f939bb3817b881b8.webp\", \"w1080\": \"materials/thumbnails/w1080/1771668349862_f939bb3817b881b8.webp\"}','1771668349862_f939bb3817b881b8.png',38561,'image/png',256,256,'f83d70ea5b01c488be4dda204a9a29f4e0819fadc7e05c8dc53a53e66393de58','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-06-24 07:58:50'),
(17,'materials/1771668349877_4a5306128fb72568.png','{\"w375\": \"materials/thumbnails/w375/1771668349877_4a5306128fb72568.webp\", \"w750\": \"materials/thumbnails/w750/1771668349877_4a5306128fb72568.webp\", \"w1080\": \"materials/thumbnails/w1080/1771668349877_4a5306128fb72568.webp\"}','1771668349877_4a5306128fb72568.png',40380,'image/png',256,256,'9baf33d133e33aefc1b4d9cf8716af266b1c1550b409778bfb286669c5e8efef','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-06-24 07:58:50'),
(18,'materials/1771668349890_2584caff191bf4d3.png','{\"w375\": \"materials/thumbnails/w375/1771668349890_2584caff191bf4d3.webp\", \"w750\": \"materials/thumbnails/w750/1771668349890_2584caff191bf4d3.webp\", \"w1080\": \"materials/thumbnails/w1080/1771668349890_2584caff191bf4d3.webp\"}','1771668349890_2584caff191bf4d3.png',39881,'image/png',256,256,'5fd8c840f599c392c3909949d94c0cd77d04a7906aed69af91aa5c5b5dc177fd','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-06-24 07:58:50'),
(19,'materials/1771668349916_6b0d069a6dec80e4.png','{\"w375\": \"materials/thumbnails/w375/1771668349916_6b0d069a6dec80e4.webp\", \"w750\": \"materials/thumbnails/w750/1771668349916_6b0d069a6dec80e4.webp\", \"w1080\": \"materials/thumbnails/w1080/1771668349916_6b0d069a6dec80e4.webp\"}','1771668349916_6b0d069a6dec80e4.png',28389,'image/png',256,256,'6abf5ace53cb5a0f0151e1a67ff48d77550c7d9c829f6a5dbbce1023900f7963','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-06-24 07:58:50'),
(20,'materials/1771668349939_df52ed3350defa9a.png','{\"w375\": \"materials/thumbnails/w375/1771668349939_df52ed3350defa9a.webp\", \"w750\": \"materials/thumbnails/w750/1771668349939_df52ed3350defa9a.webp\", \"w1080\": \"materials/thumbnails/w1080/1771668349939_df52ed3350defa9a.webp\"}','1771668349939_df52ed3350defa9a.png',37849,'image/png',256,256,'1b4611bdee92b91636524d13bacdcbb224c3bb19b501060a2d6258a35cde959d','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-06-24 07:58:50'),
(21,'materials/1771668349964_0ff6a97a7be71bdd.png','{\"w375\": \"materials/thumbnails/w375/1771668349964_0ff6a97a7be71bdd.webp\", \"w750\": \"materials/thumbnails/w750/1771668349964_0ff6a97a7be71bdd.webp\", \"w1080\": \"materials/thumbnails/w1080/1771668349964_0ff6a97a7be71bdd.webp\"}','1771668349964_0ff6a97a7be71bdd.png',32149,'image/png',256,256,'9672e5e447a22c2001965ebf90593070eb7553ca70de8f6baef9f150b2fb26bd','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-06-24 07:58:50'),
(22,'materials/1771668349978_e84eb8f6c7a5454e.png','{\"w375\": \"materials/thumbnails/w375/1771668349978_e84eb8f6c7a5454e.webp\", \"w750\": \"materials/thumbnails/w750/1771668349978_e84eb8f6c7a5454e.webp\", \"w1080\": \"materials/thumbnails/w1080/1771668349978_e84eb8f6c7a5454e.webp\"}','1771668349978_e84eb8f6c7a5454e.png',43449,'image/png',256,256,'7a98fbcf91eec4bdfe2c9a29f76c0ff38bc48c483619e98a3c1541ceb783e1ef','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-06-24 07:58:50'),
(23,'materials/1771668350006_77dca65ac50dbbbb.png','{\"w375\": \"materials/thumbnails/w375/1771668350006_77dca65ac50dbbbb.webp\", \"w750\": \"materials/thumbnails/w750/1771668350006_77dca65ac50dbbbb.webp\", \"w1080\": \"materials/thumbnails/w1080/1771668350006_77dca65ac50dbbbb.webp\"}','1771668350006_77dca65ac50dbbbb.png',32546,'image/png',256,256,'5d7bb9308a0ed4251c812c007749554c90bdef01fbc8c712871590b211e87f1b','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-06-24 07:58:50'),
(24,'materials/1771668350025_249f12166232da17.png','{\"w375\": \"materials/thumbnails/w375/1771668350025_249f12166232da17.webp\", \"w750\": \"materials/thumbnails/w750/1771668350025_249f12166232da17.webp\", \"w1080\": \"materials/thumbnails/w1080/1771668350025_249f12166232da17.webp\"}','1771668350025_249f12166232da17.png',40566,'image/png',256,256,'e8b047d433828ac52893a90f8e71b80c223206f3fe57c37dcd715916b86395e4','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-06-24 07:58:50'),
(25,'materials/1771668350042_dea7a4f77e3bf5c3.png','{\"w375\": \"materials/thumbnails/w375/1771668350042_dea7a4f77e3bf5c3.webp\", \"w750\": \"materials/thumbnails/w750/1771668350042_dea7a4f77e3bf5c3.webp\", \"w1080\": \"materials/thumbnails/w1080/1771668350042_dea7a4f77e3bf5c3.webp\"}','1771668350042_dea7a4f77e3bf5c3.png',33277,'image/png',256,256,'0be32db21519b5cf1bf37d7df022837f56583d4633a042a2cbbfd34c0e511c3a','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-06-24 07:58:50'),
(26,'materials/1771668350058_571132e2187d28b6.png','{\"w375\": \"materials/thumbnails/w375/1771668350058_571132e2187d28b6.webp\", \"w750\": \"materials/thumbnails/w750/1771668350058_571132e2187d28b6.webp\", \"w1080\": \"materials/thumbnails/w1080/1771668350058_571132e2187d28b6.webp\"}','1771668350058_571132e2187d28b6.png',35713,'image/png',256,256,'9e7a3c3d6abf1dd3296644fc392bdf6d0a471034fb7c17185346f707b7c37f49','materials',NULL,NULL,'active',NULL,'2026-03-17 06:49:45','2026-06-24 07:58:50'),
(119,'materials/1782079197136_65856a130205422c.jpg','{\"w375\": \"materials/thumbnails/w375/1782079197136_65856a130205422c.webp\", \"w750\": \"materials/thumbnails/w750/1782079197136_65856a130205422c.webp\", \"w1080\": \"materials/thumbnails/w1080/1782079197136_65856a130205422c.webp\"}','star_stone.jpg',333041,'image/jpeg',1024,1024,'219b544dbd2b7a1a5158cd16f6410fe929ece61d7a36440f7d927a28df7e2c5f','materials',NULL,32,'active',NULL,'2026-06-22 05:59:57','2026-06-24 07:58:50'),
(121,'uploads/1782104351897_dba10e3af3d0c036.jpg','{\"large\": \"uploads/thumbnails/large/1782104351897_dba10e3af3d0c036.jpg\", \"small\": \"uploads/thumbnails/small/1782104351897_dba10e3af3d0c036.jpg\", \"medium\": \"uploads/thumbnails/medium/1782104351897_dba10e3af3d0c036.jpg\"}','å¾®ä¿¡å¾ç_2026-05-21_070720_795.jpg',1271273,'image/jpeg',2000,2000,'af1838472c0f92c5e7360432cf9f11b50e1a6064db3470ffc099b3dfc90762f4','uploads',NULL,32,'trashed','2026-06-25 09:30:00','2026-06-22 12:59:13','2026-06-25 09:30:00'),
(122,'uploads/1782104435765_ed2d14e15233066f.jpg','{\"large\": \"uploads/thumbnails/large/1782104435765_ed2d14e15233066f.jpg\", \"small\": \"uploads/thumbnails/small/1782104435765_ed2d14e15233066f.jpg\", \"medium\": \"uploads/thumbnails/medium/1782104435765_ed2d14e15233066f.jpg\"}','ç¼è¾å¾-2 - å¯æ¬.png',2180685,'image/png',4000,4000,'5323ffdf82806cd439cdd5d42c97a94e68e39f048bc196d38ebe1dadfa4e5987','uploads',NULL,32,'trashed','2026-06-24 11:30:00','2026-06-22 13:00:35','2026-06-24 11:30:00'),
(126,'uploads/1782268569292_7f6171ce86bbe299.jpg','{\"w375\": \"uploads/thumbnails/w375/1782268569292_7f6171ce86bbe299.webp\", \"w750\": \"uploads/thumbnails/w750/1782268569292_7f6171ce86bbe299.webp\", \"w1080\": \"uploads/thumbnails/w1080/1782268569292_7f6171ce86bbe299.webp\"}','288d324be4f6ff2900d6df6a25c650d7.jpg',169696,'image/jpeg',1280,1280,'250c3589298065d133e308db4a9b740fc2ee1240335f37d0f9d94aa22a545b1e','uploads',NULL,32,'active',NULL,'2026-06-24 10:36:09','2026-06-24 10:36:09'),
(127,'uploads/1782268604811_224a5a8b0917ccbe.jpg','{\"w375\": \"uploads/thumbnails/w375/1782268604811_224a5a8b0917ccbe.webp\", \"w750\": \"uploads/thumbnails/w750/1782268604811_224a5a8b0917ccbe.webp\", \"w1080\": \"uploads/thumbnails/w1080/1782268604811_224a5a8b0917ccbe.webp\"}','CB4392 580å.jpeg',1703520,'image/jpeg',4480,4480,'c2aba04bea14d0d76ba5d16b017d6ca7379be17c10df03b010b459761b4bcdc6','uploads',NULL,32,'trashed','2026-06-25 11:30:00','2026-06-24 10:36:45','2026-06-25 11:30:00'),
(128,'uploads/1782348011022_d0a289cbda29206c.jpg','{\"w375\": \"uploads/thumbnails/w375/1782348011022_d0a289cbda29206c.webp\", \"w750\": \"uploads/thumbnails/w750/1782348011022_d0a289cbda29206c.webp\", \"w1080\": \"uploads/thumbnails/w1080/1782348011022_d0a289cbda29206c.webp\"}','ç¼è¾å¾-2 - å¯æ¬.png',2180685,'image/png',4000,4000,'5323ffdf82806cd439cdd5d42c97a94e68e39f048bc196d38ebe1dadfa4e5987','uploads',NULL,32,'active',NULL,'2026-06-25 08:40:11','2026-06-25 08:40:11');
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

-- Dump completed on 2026-07-10 18:10:59
