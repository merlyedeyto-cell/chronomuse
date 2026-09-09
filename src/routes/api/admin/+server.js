import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';
import bcrypt from 'bcryptjs';
import {
	getUserStatus,
	setUserStatus,
	getPendingReactivations,
	resolveReactivationRequest,
	markAppealRead,
	markAllAppealsRead,
	deleteUserData
} from '$lib/server/suspensionStore';

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
			let pendingReactivations = 0;
			let unreadReactivations = 0;

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
				const storedAppeals = getPendingReactivations();
				const { count } = await supabase.from('chronomuse_reactivation_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending');
				pendingReactivations = Math.max(count || 0, storedAppeals.length);
				unreadReactivations = storedAppeals.filter(r => !r.is_read).length;
			} catch (e) {
				const storedAppeals = getPendingReactivations();
				pendingReactivations = storedAppeals.length;
				unreadReactivations = storedAppeals.filter(r => !r.is_read).length;
			}

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
						pending_reactivations: pendingReactivations,
						unread_reactivations: unreadReactivations,
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

			// Get contributions and pending reactivation requests per user safely in parallel
			let memoryCountsByUser = {};
			let pinnedCountsByUser = {};
			let notesCountsByUser = {};
			let messagesCountsByUser = {};
			let pendingReactivationsMap = {}; // user_id -> request object

			const [memRes, pinRes, notesRes, msgRes, reactivationsRes] = await Promise.allSettled([
				supabase.from('chronomuse_memories').select('user_id'),
				supabase.from('chronomuse_pinned_dates').select('user_id'),
				supabase.from('chronomuse_user_notes').select('user_id'),
				supabase.from('chronomuse_messages').select('sender_id'),
				supabase.from('chronomuse_reactivation_requests').select('*').eq('status', 'pending')
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
			if (reactivationsRes.status === 'fulfilled' && Array.isArray(reactivationsRes.value.data)) {
				reactivationsRes.value.data.forEach(req => {
					if (req.user_id) pendingReactivationsMap[req.user_id] = req;
				});
			}

			// Merge with persistent store appeals in case DB table is not yet created
			const localPendingAppeals = getPendingReactivations();
			localPendingAppeals.forEach(req => {
				if (req.user_id && !pendingReactivationsMap[req.user_id]) {
					pendingReactivationsMap[req.user_id] = req;
				}
			});

			// Format safe user objects without sensitive password hashes
			const safeUsers = (users || []).map(u => {
				const uId = u.id;
				const pendingReq = pendingReactivationsMap[uId] || pendingReactivationsMap[String(uId)] || pendingReactivationsMap[Number(uId)];
				const effectiveStatus = getUserStatus(uId, u.status);
				const hasPending = (effectiveStatus === 'suspended') && !!pendingReq;

				return {
					id: u.id,
					username: u.username || 'user_' + u.id,
					email: u.email || '—',
					avatar_url: u.avatar_url || null,
					created_at: u.created_at || null,
					last_activity: u.last_activity || null,
					status: effectiveStatus,
					memories_count: memoryCountsByUser[u.id] || 0,
					pinned_count: pinnedCountsByUser[u.id] || 0,
					notes_count: notesCountsByUser[u.id] || 0,
					messages_count: messagesCountsByUser[u.id] || 0,
					has_pending_reactivation: hasPending,
					reactivation_request: hasPending ? pendingReq : null
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

		// 3. GET REACTIVATION REQUESTS
		if (action === 'get_reactivations') {
			let mergedRequests = [];
			try {
				const { data: requests } = await supabase
					.from('chronomuse_reactivation_requests')
					.select('*')
					.eq('status', 'pending')
					.order('created_at', { ascending: false });

				if (Array.isArray(requests)) {
					mergedRequests = [...requests];
				}
			} catch (e) {}

			// Merge with locally stored appeals
			const localAppeals = getPendingReactivations();
			localAppeals.forEach(la => {
				if (!mergedRequests.some(mr => String(mr.id) === String(la.id) || String(mr.user_id) === String(la.user_id))) {
					mergedRequests.push(la);
				}
			});

			return json({
				success: true,
				data: {
					requests: mergedRequests
				}
			});
		}

		// 4. RESPOND TO REACTIVATION REQUEST (APPROVE / DISMISS)
		if (action === 'respond_reactivation') {
			const { request_id, user_id, action_type } = body;
			if (!user_id || !action_type) {
				return json({ error: 'User ID and action type required' }, { status: 400 });
			}

			const targetUidNum = Number(user_id) || user_id;
			const targetUidStr = String(user_id);

			// Resolve in persistent suspension store
			resolveReactivationRequest(request_id, targetUidStr, action_type);

			if (action_type === 'approve') {
				setUserStatus(targetUidStr, 'active');

				// Reactivate user in Supabase table
				try {
					await supabase
						.from('chronomuse_users')
						.update({ status: 'active' })
						.eq('id', targetUidNum);
				} catch (e) {}

				// Update request status in DB
				try {
					if (request_id) {
						await supabase
							.from('chronomuse_reactivation_requests')
							.update({ status: 'approved', updated_at: new Date().toISOString() })
							.eq('id', request_id);
					}
					await Promise.allSettled([
						supabase
							.from('chronomuse_reactivation_requests')
							.update({ status: 'approved', updated_at: new Date().toISOString() })
							.eq('user_id', targetUidNum)
							.eq('status', 'pending'),
						supabase
							.from('chronomuse_reactivation_requests')
							.update({ status: 'approved', updated_at: new Date().toISOString() })
							.eq('user_id', targetUidStr)
							.eq('status', 'pending')
					]);
				} catch (e) {}

				// Realtime broadcast so user's active session is notified
				try {
					const channel = supabase.channel('chronomuse_global_events');
					await channel.send({
						type: 'broadcast',
						event: 'global_friend_event',
						payload: {
							eventType: 'account_reactivated',
							target_id: Number(user_id)
						}
					});
					supabase.removeChannel(channel);
				} catch (e) {}

				return json({
					success: true,
					message: 'Account successfully reactivated!'
				});
			} else if (action_type === 'dismiss') {
				try {
					if (request_id) {
						await supabase
							.from('chronomuse_reactivation_requests')
							.update({ status: 'dismissed', updated_at: new Date().toISOString() })
							.eq('id', request_id);
					}
					await Promise.allSettled([
						supabase
							.from('chronomuse_reactivation_requests')
							.update({ status: 'dismissed', updated_at: new Date().toISOString() })
							.eq('user_id', targetUidNum)
							.eq('status', 'pending'),
						supabase
							.from('chronomuse_reactivation_requests')
							.update({ status: 'dismissed', updated_at: new Date().toISOString() })
							.eq('user_id', targetUidStr)
							.eq('status', 'pending')
					]);
				} catch (e) {}

				return json({
					success: true,
					message: 'Reactivation request dismissed'
				});
			}

			return json({ error: 'Invalid action type' }, { status: 400 });
		}

		// 4.1 MARK APPEAL AS READ
		if (action === 'mark_appeal_read') {
			const { request_id, user_id } = body;
			markAppealRead(request_id, user_id);
			return json({ success: true, message: 'Appeal marked as read' });
		}

		// 4.2 MARK ALL APPEALS AS READ
		if (action === 'mark_all_appeals_read') {
			markAllAppealsRead();
			return json({ success: true, message: 'All appeals marked as read' });
		}

		// 5. TOGGLE USER STATUS (ACTIVE / SUSPENDED)
		if (action === 'toggle_user_status') {
			const { user_id, new_status } = body;
			if (!user_id || !new_status) {
				return json({ error: 'User ID and new status required' }, { status: 400 });
			}

			const targetUidNum = Number(user_id) || user_id;
			const targetUidStr = String(user_id);

			// Store permanently on server
			setUserStatus(targetUidStr, new_status);

			try {
				const { error: updateError } = await supabase
					.from('chronomuse_users')
					.update({ status: new_status })
					.eq('id', targetUidNum);

				if (updateError) {
					console.warn('Status update warning (column may not exist yet in DB):', updateError.message);
				}
			} catch (dbErr) {
				console.warn('Supabase status update caught:', dbErr);
			}

			// If reactivated directly, mark any pending requests as resolved
			if (new_status === 'active') {
				try {
					await Promise.allSettled([
						supabase
							.from('chronomuse_reactivation_requests')
							.update({ status: 'approved', updated_at: new Date().toISOString() })
							.eq('user_id', targetUidNum)
							.eq('status', 'pending'),
						supabase
							.from('chronomuse_reactivation_requests')
							.update({ status: 'approved', updated_at: new Date().toISOString() })
							.eq('user_id', targetUidStr)
							.eq('status', 'pending')
					]);
				} catch (e) {}
			}

			// Realtime broadcast to instantly lock out or notify the user session
			try {
				const channel = supabase.channel('chronomuse_global_events');
				await channel.send({
					type: 'broadcast',
					event: 'global_friend_event',
					payload: {
						eventType: new_status === 'suspended' ? 'account_suspended' : 'account_reactivated',
						target_id: Number(user_id)
					}
				});
				supabase.removeChannel(channel);
			} catch (e) {}

			return json({
				success: true,
				message: `Account status updated to ${new_status}`
			});
		}

		// 6. RESET USER PASSWORD
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

		// 7. DELETE USER ACCOUNT AND ASSOCIATED DATA
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
				supabase.from('chronomuse_blocked_users').delete().or(`user_id.eq.${user_id},blocked_user_id.eq.${user_id}`),
				supabase.from('chronomuse_reactivation_requests').delete().eq('user_id', user_id)
			]);

			const { error: deleteError } = await supabase
				.from('chronomuse_users')
				.delete()
				.eq('id', user_id);

			if (deleteError) {
				return json({ error: deleteError.message }, { status: 500 });
			}

			deleteUserData(user_id);

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
