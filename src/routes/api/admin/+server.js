import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';
import bcrypt from 'bcryptjs';

const ADMIN_PASSCODE = '041205';

export async function POST({ request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const { passcode, action = 'get_metrics' } = body;

		if (passcode !== ADMIN_PASSCODE) {
			return json({ error: 'Unauthorized: Invalid Admin Passcode' }, { status: 401 });
		}

		// 1. GET METRICS
		if (action === 'get_metrics') {
			const startPing = Date.now();

			let totalUsers = 0;
			let totalMemories = 0;
			let totalPinnedDates = 0;
			let totalNotes = 0;
			let totalMessages = 0;
			let activeToday = 0;

			try {
				const { count } = await supabase.from('chronomuse_users').select('*', { count: 'exact', head: true });
				totalUsers = count || 0;
			} catch (e) {}

			try {
				const { count } = await supabase.from('chronomuse_memories').select('*', { count: 'exact', head: true });
				totalMemories = count || 0;
			} catch (e) {}

			try {
				const { count } = await supabase.from('chronomuse_pinned_dates').select('*', { count: 'exact', head: true });
				totalPinnedDates = count || 0;
			} catch (e) {}

			try {
				const { count } = await supabase.from('chronomuse_user_notes').select('*', { count: 'exact', head: true });
				totalNotes = count || 0;
			} catch (e) {}

			try {
				const { count } = await supabase.from('chronomuse_messages').select('*', { count: 'exact', head: true });
				totalMessages = count || 0;
			} catch (e) {}

			try {
				const { data: usersActivity } = await supabase.from('chronomuse_users').select('id, last_activity');
				const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
				const list = usersActivity || [];
				activeToday = list.filter(u => u.last_activity && u.last_activity >= oneDayAgo).length;
			} catch (e) {}

			const latencyMs = Math.max(1, Date.now() - startPing);

			return json({
				success: true,
				data: {
					metrics: {
						total_users: totalUsers,
						total_memories: totalMemories,
						total_pinned_dates: totalPinnedDates,
						total_notes: totalNotes,
						total_messages: totalMessages,
						active_today: activeToday,
						db_latency_ms: latencyMs,
						database_status: 'Operational',
						server_time: new Date().toISOString()
					}
				}
			});
		}

		// 2. GET USERS LIST
		if (action === 'get_users') {
			const { page = 1, limit = 200, search = '' } = body;
			const offset = (Math.max(1, page) - 1) * limit;

			let query = supabase
				.from('chronomuse_users')
				.select('*')
				.order('id', { ascending: false })
				.range(offset, offset + limit - 1);

			if (search && search.trim()) {
				query = query.or(`username.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`);
			}

			const { data: users, count, error } = await query;

			if (error) {
				console.error('Error fetching users in admin:', error);
				return json({ error: error.message }, { status: 500 });
			}

			// Get contributions per user safely in parallel
			let memoryCountsByUser = {};
			let pinnedCountsByUser = {};
			let notesCountsByUser = {};
			let messagesCountsByUser = {};

			const [memRes, pinRes, notesRes, msgRes] = await Promise.allSettled([
				supabase.from('chronomuse_memories').select('user_id'),
				supabase.from('chronomuse_pinned_dates').select('user_id'),
				supabase.from('chronomuse_user_notes').select('user_id'),
				supabase.from('chronomuse_messages').select('sender_id')
			]);

			if (memRes.status === 'fulfilled' && Array.isArray(memRes.value.data)) {
				memRes.value.data.forEach(m => {
					if (m.user_id) memoryCountsByUser[m.user_id] = (memoryCountsByUser[m.user_id] || 0) + 1;
				});
			}
			if (pinRes.status === 'fulfilled' && Array.isArray(pinRes.value.data)) {
				pinRes.value.data.forEach(p => {
					if (p.user_id) pinnedCountsByUser[p.user_id] = (pinnedCountsByUser[p.user_id] || 0) + 1;
				});
			}
			if (notesRes.status === 'fulfilled' && Array.isArray(notesRes.value.data)) {
				notesRes.value.data.forEach(n => {
					if (n.user_id) notesCountsByUser[n.user_id] = (notesCountsByUser[n.user_id] || 0) + 1;
				});
			}
			if (msgRes.status === 'fulfilled' && Array.isArray(msgRes.value.data)) {
				msgRes.value.data.forEach(msg => {
					if (msg.sender_id) messagesCountsByUser[msg.sender_id] = (messagesCountsByUser[msg.sender_id] || 0) + 1;
				});
			}

			// Format safe user objects without sensitive password hashes
			const safeUsers = (users || []).map(u => {
				return {
					id: u.id,
					username: u.username || 'user_' + u.id,
					email: u.email || '—',
					avatar_url: u.avatar_url || null,
					created_at: u.created_at || null,
					last_activity: u.last_activity || null,
					status: 'active',
					memories_count: memoryCountsByUser[u.id] || 0,
					pinned_count: pinnedCountsByUser[u.id] || 0,
					notes_count: notesCountsByUser[u.id] || 0,
					messages_count: messagesCountsByUser[u.id] || 0
				};
			});

			return json({
				success: true,
				data: {
					users: safeUsers,
					total: count || safeUsers.length,
					page
				}
			});
		}

		// 3. RESET USER PASSWORD
		if (action === 'reset_password') {
			const { user_id, new_password } = body;
			if (!user_id || !new_password || new_password.trim().length < 6) {
				return json({ error: 'User ID and a password of at least 6 characters are required' }, { status: 400 });
			}

			const hashedPassword = await bcrypt.hash(new_password.trim(), 10);
			const { error: updateError } = await supabase
				.from('chronomuse_users')
				.update({ password: hashedPassword })
				.eq('id', user_id);

			if (updateError) {
				return json({ error: updateError.message }, { status: 500 });
			}

			return json({
				success: true,
				message: 'Password successfully updated'
			});
		}

		// 4. DELETE USER ACCOUNT AND ASSOCIATED DATA
		if (action === 'delete_user') {
			const { user_id } = body;
			if (!user_id) {
				return json({ error: 'User ID is required' }, { status: 400 });
			}

			// Clean up child tables
			await Promise.allSettled([
				supabase.from('chronomuse_memories').delete().eq('user_id', user_id),
				supabase.from('chronomuse_pinned_dates').delete().eq('user_id', user_id),
				supabase.from('chronomuse_pinned_memories').delete().eq('user_id', user_id),
				supabase.from('chronomuse_user_notes').delete().eq('user_id', user_id),
				supabase.from('chronomuse_friend_requests').delete().or(`sender_id.eq.${user_id},receiver_id.eq.${user_id}`),
				supabase.from('chronomuse_friends').delete().or(`user_id.eq.${user_id},friend_id.eq.${user_id}`),
				supabase.from('chronomuse_messages').delete().or(`sender_id.eq.${user_id},receiver_id.eq.${user_id}`),
				supabase.from('chronomuse_shared_memories').delete().or(`sender_id.eq.${user_id},receiver_id.eq.${user_id}`),
				supabase.from('chronomuse_blocked_users').delete().or(`user_id.eq.${user_id},blocked_user_id.eq.${user_id}`)
			]);

			const { error: deleteError } = await supabase
				.from('chronomuse_users')
				.delete()
				.eq('id', user_id);

			if (deleteError) {
				return json({ error: deleteError.message }, { status: 500 });
			}

			return json({
				success: true,
				message: 'User account and associated data successfully removed'
			});
		}

		return json({ error: 'Unknown action' }, { status: 400 });
	} catch (err) {
		console.error('Admin API Catch Error:', err);
		return json({ error: err.message }, { status: 500 });
	}
}
