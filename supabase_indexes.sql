-- =========================================================================
-- ChronoMuse High-Performance Database Indexing Script
-- Run this in your Supabase SQL Editor to make queries 10x-50x faster.
-- =========================================================================

-- 1. Optimize Memory Queries (Dashboard, Calendar, Mood Graphs, Flashback)
CREATE INDEX IF NOT EXISTS idx_chronomuse_memories_user_date 
ON public.chronomuse_memories (user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_chronomuse_memories_user_mood 
ON public.chronomuse_memories (user_id, mood_tag);

CREATE INDEX IF NOT EXISTS idx_chronomuse_memories_created_at 
ON public.chronomuse_memories (created_at DESC);

-- 2. Optimize Pinned Dates Queries
CREATE INDEX IF NOT EXISTS idx_chronomuse_pinned_dates_user 
ON public.chronomuse_pinned_dates (user_id, date);

-- 3. Optimize Chat Messages (Instant messaging, conversation partner discovery, unread badges)
CREATE INDEX IF NOT EXISTS idx_chronomuse_messages_sender_receiver 
ON public.chronomuse_messages (sender_id, receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chronomuse_messages_receiver_sender 
ON public.chronomuse_messages (receiver_id, sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chronomuse_messages_receiver_read 
ON public.chronomuse_messages (receiver_id, is_read);

-- 4. Optimize Friends Relationships
CREATE INDEX IF NOT EXISTS idx_chronomuse_friends_user_id 
ON public.chronomuse_friends (user_id);

CREATE INDEX IF NOT EXISTS idx_chronomuse_friends_friend_id 
ON public.chronomuse_friends (friend_id);

CREATE INDEX IF NOT EXISTS idx_chronomuse_friends_user_friend 
ON public.chronomuse_friends (user_id, friend_id);

-- 5. Optimize Friend Requests
CREATE INDEX IF NOT EXISTS idx_chronomuse_friend_requests_receiver 
ON public.chronomuse_friend_requests (receiver_id, status);

CREATE INDEX IF NOT EXISTS idx_chronomuse_friend_requests_sender 
ON public.chronomuse_friend_requests (sender_id, status);

-- 6. Optimize Shared Memories
CREATE INDEX IF NOT EXISTS idx_chronomuse_shared_memories_recipient 
ON public.chronomuse_shared_memories (recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chronomuse_shared_memories_sender 
ON public.chronomuse_shared_memories (sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chronomuse_shared_memories_memory 
ON public.chronomuse_shared_memories (memory_id);

-- 7. Optimize Blocked Users Lookups
CREATE INDEX IF NOT EXISTS idx_chronomuse_blocked_users_blocker 
ON public.chronomuse_blocked_users (blocker_id, blocked_id);

-- 8. Optimize User Search & Profile Lookups
CREATE INDEX IF NOT EXISTS idx_chronomuse_users_username_lower 
ON public.chronomuse_users (LOWER(username));

CREATE INDEX IF NOT EXISTS idx_chronomuse_users_email_lower 
ON public.chronomuse_users (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_chronomuse_users_last_activity 
ON public.chronomuse_users (last_activity DESC);
