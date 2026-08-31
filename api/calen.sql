-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Mar 18, 2026 at 08:01 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `calen`
--

-- --------------------------------------------------------

--
-- Table structure for table `chat_blocks`
--

CREATE TABLE `chat_blocks` (
  `id` int(11) NOT NULL,
  `blocker_id` int(11) NOT NULL,
  `blocked_id` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `chat_messages`
--

CREATE TABLE `chat_messages` (
  `id` int(11) NOT NULL,
  `sender_id` int(11) NOT NULL,
  `receiver_id` int(11) NOT NULL,
  `message` text NOT NULL,
  `media_path` varchar(500) DEFAULT NULL,
  `media_type` varchar(20) DEFAULT NULL,
  `delivered_at` timestamp NULL DEFAULT NULL,
  `seen_at` timestamp NULL DEFAULT NULL,
  `is_forwarded` tinyint(1) NOT NULL DEFAULT 0,
  `chat_reaction` varchar(16) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `deleted_by_sender` tinyint(1) DEFAULT 0,
  `deleted_by_receiver` tinyint(1) DEFAULT 0,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `has_attachment` tinyint(1) DEFAULT 0,
  `attachment_count` int(11) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `chat_message_attachments`
--

CREATE TABLE `chat_message_attachments` (
  `id` int(11) NOT NULL,
  `message_id` int(11) NOT NULL,
  `file_type` varchar(50) NOT NULL,
  `file_path` varchar(500) NOT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_size` int(11) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `chat_message_reactions`
--

CREATE TABLE `chat_message_reactions` (
  `id` int(11) NOT NULL,
  `message_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `reaction` varchar(16) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `chat_pinned_messages`
--

CREATE TABLE `chat_pinned_messages` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `friend_id` int(11) NOT NULL,
  `message_id` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `chat_typing_status`
--

CREATE TABLE `chat_typing_status` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `friend_id` int(11) NOT NULL,
  `is_typing` tinyint(1) DEFAULT 0,
  `typing_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `friend_requests`
--

CREATE TABLE `friend_requests` (
  `id` int(11) NOT NULL,
  `sender_id` int(11) NOT NULL,
  `receiver_id` int(11) NOT NULL,
  `status` enum('pending','accepted','declined') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `responded_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `friend_requests`
--

INSERT INTO `friend_requests` (`id`, `sender_id`, `receiver_id`, `status`, `created_at`, `updated_at`, `responded_at`) VALUES
(5, 10, 9, 'accepted', '2026-03-16 16:36:45', '2026-03-16 16:36:56', '2026-03-16 16:36:56');

-- --------------------------------------------------------

--
-- Table structure for table `memories`
--

CREATE TABLE `memories` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `date` date NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `mood_tag` varchar(50) DEFAULT NULL,
  `memory_tag` varchar(100) DEFAULT NULL,
  `photo_video` varchar(500) DEFAULT NULL,
  `photo_video_type` varchar(100) DEFAULT NULL,
  `music` varchar(500) DEFAULT NULL,
  `is_pinned` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `memory_shares`
--

CREATE TABLE `memory_shares` (
  `id` int(11) NOT NULL,
  `memory_id` int(11) NOT NULL,
  `sender_id` int(11) NOT NULL,
  `receiver_id` int(11) NOT NULL,
  `status` enum('pending','accepted','declined') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `responded_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `memory_tags`
--

CREATE TABLE `memory_tags` (
  `id` int(11) NOT NULL,
  `memory_id` int(11) NOT NULL,
  `tag` varchar(100) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `pinned_dates`
--

CREATE TABLE `pinned_dates` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `date` date NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `pinned_memories`
--

CREATE TABLE `pinned_memories` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `memory_id` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `last_activity` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `username`, `email`, `password`, `created_at`, `updated_at`, `last_activity`) VALUES
(9, 'merlye', 'merlyedeyto@gmail.com', '$2y$10$WUmG/kRTNZ28x4tYWMSe2.eDmZL5962VTw6FKeJ2L/U3zvuWOa2bO', '2026-03-16 13:44:39', '2026-03-16 16:36:59', '2026-03-16 16:36:59'),
(10, 'lex', 'beo.pobadora@gmail.com', '$2y$10$azOmOkeN3uex97kt1eP8CeMIouXNwfuWhJp5pKoZY5474oTXUhx0u', '2026-03-16 14:13:12', '2026-03-16 17:16:40', '2026-03-16 17:16:40');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `chat_blocks`
--
ALTER TABLE `chat_blocks`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_block_pair` (`blocker_id`,`blocked_id`),
  ADD KEY `idx_blocked` (`blocked_id`);

--
-- Indexes for table `chat_messages`
--
ALTER TABLE `chat_messages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_pair_time` (`sender_id`,`receiver_id`,`created_at`),
  ADD KEY `idx_receiver_time` (`receiver_id`,`created_at`),
  ADD KEY `idx_deleted` (`deleted_by_sender`,`deleted_by_receiver`);

--
-- Indexes for table `chat_message_attachments`
--
ALTER TABLE `chat_message_attachments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_message_id` (`message_id`),
  ADD KEY `idx_file_type` (`file_type`);

--
-- Indexes for table `chat_message_reactions`
--
ALTER TABLE `chat_message_reactions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_message_user` (`message_id`,`user_id`),
  ADD KEY `idx_message` (`message_id`),
  ADD KEY `idx_user` (`user_id`);

--
-- Indexes for table `chat_pinned_messages`
--
ALTER TABLE `chat_pinned_messages`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_user_message` (`user_id`,`message_id`),
  ADD KEY `idx_user_friend_created` (`user_id`,`friend_id`,`created_at`),
  ADD KEY `idx_message` (`message_id`),
  ADD KEY `chat_pinned_messages_ibfk_2` (`friend_id`);

--
-- Indexes for table `chat_typing_status`
--
ALTER TABLE `chat_typing_status`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_user_friend` (`user_id`,`friend_id`),
  ADD KEY `idx_typing` (`is_typing`,`typing_at`);

--
-- Indexes for table `friend_requests`
--
ALTER TABLE `friend_requests`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_sender_receiver` (`sender_id`,`receiver_id`),
  ADD KEY `idx_receiver_status` (`receiver_id`,`status`),
  ADD KEY `idx_sender_status` (`sender_id`,`status`);

--
-- Indexes for table `memories`
--
ALTER TABLE `memories`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_user_date` (`user_id`,`date`),
  ADD KEY `idx_date` (`date`);

--
-- Indexes for table `memory_shares`
--
ALTER TABLE `memory_shares`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_memory_receiver` (`memory_id`,`receiver_id`),
  ADD KEY `idx_receiver_status` (`receiver_id`,`status`),
  ADD KEY `idx_sender` (`sender_id`),
  ADD KEY `idx_memory` (`memory_id`);

--
-- Indexes for table `memory_tags`
--
ALTER TABLE `memory_tags`
  ADD PRIMARY KEY (`id`),
  ADD KEY `memory_id` (`memory_id`);

--
-- Indexes for table `pinned_dates`
--
ALTER TABLE `pinned_dates`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_user_date` (`user_id`,`date`),
  ADD KEY `idx_user_id` (`user_id`),
  ADD KEY `idx_date` (`date`);

--
-- Indexes for table `pinned_memories`
--
ALTER TABLE `pinned_memories`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_pin` (`user_id`,`memory_id`),
  ADD KEY `memory_id` (`memory_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_username` (`username`),
  ADD UNIQUE KEY `unique_email` (`email`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `chat_blocks`
--
ALTER TABLE `chat_blocks`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `chat_messages`
--
ALTER TABLE `chat_messages`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=63;

--
-- AUTO_INCREMENT for table `chat_message_attachments`
--
ALTER TABLE `chat_message_attachments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=20;

--
-- AUTO_INCREMENT for table `chat_message_reactions`
--
ALTER TABLE `chat_message_reactions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `chat_pinned_messages`
--
ALTER TABLE `chat_pinned_messages`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `chat_typing_status`
--
ALTER TABLE `chat_typing_status`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=234;

--
-- AUTO_INCREMENT for table `friend_requests`
--
ALTER TABLE `friend_requests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `memories`
--
ALTER TABLE `memories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=36;

--
-- AUTO_INCREMENT for table `memory_shares`
--
ALTER TABLE `memory_shares`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `memory_tags`
--
ALTER TABLE `memory_tags`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `pinned_dates`
--
ALTER TABLE `pinned_dates`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;

--
-- AUTO_INCREMENT for table `pinned_memories`
--
ALTER TABLE `pinned_memories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `chat_blocks`
--
ALTER TABLE `chat_blocks`
  ADD CONSTRAINT `chat_blocks_ibfk_1` FOREIGN KEY (`blocker_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `chat_blocks_ibfk_2` FOREIGN KEY (`blocked_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `chat_messages`
--
ALTER TABLE `chat_messages`
  ADD CONSTRAINT `chat_messages_ibfk_1` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `chat_messages_ibfk_2` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `chat_message_reactions`
--
ALTER TABLE `chat_message_reactions`
  ADD CONSTRAINT `chat_message_reactions_ibfk_1` FOREIGN KEY (`message_id`) REFERENCES `chat_messages` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `chat_message_reactions_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `chat_pinned_messages`
--
ALTER TABLE `chat_pinned_messages`
  ADD CONSTRAINT `chat_pinned_messages_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `chat_pinned_messages_ibfk_2` FOREIGN KEY (`friend_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `chat_pinned_messages_ibfk_3` FOREIGN KEY (`message_id`) REFERENCES `chat_messages` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `friend_requests`
--
ALTER TABLE `friend_requests`
  ADD CONSTRAINT `friend_requests_ibfk_1` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `friend_requests_ibfk_2` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `memory_shares`
--
ALTER TABLE `memory_shares`
  ADD CONSTRAINT `memory_shares_ibfk_1` FOREIGN KEY (`memory_id`) REFERENCES `memories` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `memory_shares_ibfk_2` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `memory_shares_ibfk_3` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `memory_tags`
--
ALTER TABLE `memory_tags`
  ADD CONSTRAINT `memory_tags_ibfk_1` FOREIGN KEY (`memory_id`) REFERENCES `memories` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `pinned_dates`
--
ALTER TABLE `pinned_dates`
  ADD CONSTRAINT `pinned_dates_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `pinned_memories`
--
ALTER TABLE `pinned_memories`
  ADD CONSTRAINT `pinned_memories_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `pinned_memories_ibfk_2` FOREIGN KEY (`memory_id`) REFERENCES `memories` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
