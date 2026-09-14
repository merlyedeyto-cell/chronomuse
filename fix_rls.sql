-- ==============================================================================
-- ChronoMuse Database RLS (Row Level Security) Fix
-- Run this in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- ==============================================================================

-- 1. Disable RLS on all ChronoMuse tables so custom auth & direct API queries succeed
ALTER TABLE IF EXISTS public.chronomuse_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chronomuse_memories DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chronomuse_memory_tags DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chronomuse_friends DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chronomuse_friend_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chronomuse_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chronomuse_pinned_dates DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chronomuse_pinned_memories DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chronomuse_shared_memories DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chronomuse_blocked_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chronomuse_notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chronomuse_user_notes DISABLE ROW LEVEL SECURITY;

-- 2. Grant permissions to anon and authenticated roles
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
