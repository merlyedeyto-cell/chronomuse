import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';
import bcrypt from 'bcryptjs';
import { getLocalFeedbacks, updateLocalFeedbackStatus, deleteLocalFeedback } from '$lib/server/feedbackStore';

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

			let totalFeedbacks = 0;
			let newFeedbacks = 0;
			try {
				const localList = getLocalFeedbacks();
				totalFeedbacks = localList.length;
				newFeedbacks = localList.filter(f => f.status === 'new').length;
			} catch (e) {}

			try {
				const { data: dbFeedbacks } = await supabase.from('chronomuse_feedbacks').select('id, status');
				if (Array.isArray(dbFeedbacks) && dbFeedbacks.length > 0) {
					totalFeedbacks = Math.max(totalFeedbacks, dbFeedbacks.length);
					newFeedbacks = Math.max(newFeedbacks, dbFeedbacks.filter(f => f.status === 'new').length);
				}
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
						total_feedbacks: totalFeedbacks,
						new_feedbacks: newFeedbacks,
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

		// 5. GET FEEDBACKS & CONCERNS
		if (action === 'get_feedbacks') {
			let feedbacks = [];
			const seenKeys = new Set();
			const seenIds = new Set();

			// A. Fetch from DB if table exists
			try {
				const { data: dbRows } = await supabase
					.from('chronomuse_feedbacks')
					.select('*')
					.order('created_at', { ascending: false });

				if (Array.isArray(dbRows)) {
					dbRows.forEach(item => {
						const key = `${item.user_id}_${item.title}_${item.created_at?.slice(0, 16)}`;
						seenKeys.add(key);
						if (item.id) seenIds.add(String(item.id));
						feedbacks.push({
							id: item.id,
							user_id: item.user_id,
							username: item.username || 'anonymous',
							email: item.email || null,
							avatar_url: null,
							category: item.category || 'suggestion',
							title: item.title,
							message: item.message,
							status: item.status || 'new',
							created_at: item.created_at
						});
					});
				}
			} catch (dbErr) {}

			// B. Merge with persistent local storage
			try {
				const localRows = getLocalFeedbacks();
				localRows.forEach(item => {
					const key = `${item.user_id}_${item.title}_${item.created_at?.slice(0, 16)}`;
					if (!seenKeys.has(key) && (!item.id || !seenIds.has(String(item.id)))) {
						seenKeys.add(key);
						if (item.id) seenIds.add(String(item.id));
						feedbacks.push({
							id: item.id,
							user_id: item.user_id,
							username: item.username || 'anonymous',
							email: item.email || null,
							avatar_url: null,
							category: item.category || 'suggestion',
							title: item.title,
							message: item.message,
							status: item.status || 'new',
							created_at: item.created_at
						});
					}
				});
			} catch (locErr) {}

			// C. Enrich with user avatars and emails from chronomuse_users
			try {
				const userIds = Array.from(new Set(feedbacks.map(f => f.user_id).filter(Boolean)));
				if (userIds.length > 0) {
					const { data: usersData } = await supabase
						.from('chronomuse_users')
						.select('id, username, email, avatar_url')
						.in('id', userIds);

					if (Array.isArray(usersData)) {
						const userMap = new Map(usersData.map(u => [u.id, u]));
						feedbacks = feedbacks.map(f => {
							const user = f.user_id ? userMap.get(f.user_id) : null;
							return {
								...f,
								username: user?.username || f.username,
								email: user?.email || f.email,
								avatar_url: user?.avatar_url || null
							};
						});
					}
				}
			} catch (enrichErr) {}

			// Sort newest first
			feedbacks.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

			return json({
				success: true,
				data: {
					feedbacks
				}
			});
		}

		// 6. UPDATE FEEDBACK STATUS
		if (action === 'update_feedback_status') {
			const { feedback_id, status } = body;
			if (!feedback_id || !status) {
				return json({ error: 'Feedback ID and status are required' }, { status: 400 });
			}

			updateLocalFeedbackStatus(feedback_id, status);

			try {
				await supabase
					.from('chronomuse_feedbacks')
					.update({ status })
					.eq('id', feedback_id);
			} catch (e) {}

			return json({
				success: true,
				message: `Status updated to ${status}`
			});
		}

		// 7. DELETE FEEDBACK
		if (action === 'delete_feedback') {
			const { feedback_id } = body;
			if (!feedback_id) {
				return json({ error: 'Feedback ID is required' }, { status: 400 });
			}

			deleteLocalFeedback(feedback_id);

			try {
				await supabase
					.from('chronomuse_feedbacks')
					.delete()
					.eq('id', feedback_id);
			} catch (e) {}

			return json({
				success: true,
				message: 'Feedback record deleted'
			});
		}

		// 8. GET CHAT HISTORY WITH USER (ADMIN CHAT - SCOPED TO TICKET)
		if (action === 'get_chat_history') {
			const { user_id, feedback_id, feedback_created_at } = body;
			if (!user_id) {
				return json({ error: 'User ID is required' }, { status: 400 });
			}

			let adminId = 14;
			try {
				const { data: supportRow } = await supabase
					.from('chronomuse_users')
					.select('id, username')
					.eq('username', 'chronomuse_support')
					.maybeSingle();

				if (supportRow?.id) {
					adminId = supportRow.id;
				}
			} catch (uErr) {}

			// Fetch target user info
			let targetUser = null;
			try {
				const { data: uData } = await supabase
					.from('chronomuse_users')
					.select('id, username, email, avatar_url, last_activity')
					.eq('id', user_id)
					.maybeSingle();
				targetUser = uData;
			} catch (e) {}

			// Fetch messages between admin and user
			let chatMessages = [];
			try {
				const { data: msgs, error: mErr } = await supabase
					.from('chronomuse_messages')
					.select('*')
					.or(`and(sender_id.eq.${adminId},receiver_id.eq.${user_id}),and(sender_id.eq.${user_id},receiver_id.eq.${adminId})`)
					.order('created_at', { ascending: true })
					.limit(500);

				if (!mErr && Array.isArray(msgs)) {
					if (feedback_id) {
						// Find next ticket creation time if any, to establish an upper bound for untagged messages
						let nextTicketTime = null;
						try {
							const { data: userTickets } = await supabase
								.from('chronomuse_feedbacks')
								.select('id, created_at')
								.eq('user_id', user_id)
								.order('created_at', { ascending: true });

							if (Array.isArray(userTickets)) {
								const currIndex = userTickets.findIndex(t => String(t.id) === String(feedback_id));
								if (currIndex !== -1 && currIndex + 1 < userTickets.length) {
									nextTicketTime = new Date(userTickets[currIndex + 1].created_at).getTime();
								}
							}
						} catch (tErr) {}

						if (!nextTicketTime) {
							try {
								const localTickets = getLocalFeedbacks()
									.filter(t => String(t.user_id) === String(user_id))
									.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
								const currIndex = localTickets.findIndex(t => String(t.id) === String(feedback_id));
								if (currIndex !== -1 && currIndex + 1 < localTickets.length) {
									nextTicketTime = new Date(localTickets[currIndex + 1].created_at).getTime();
								}
							} catch (lErr) {}
						}

						// Filter strictly to this ticket's conversation so other tickets NEVER leak!
						chatMessages = msgs.filter(m => {
							// 1. Explicit feedback_id match if column exists
							if (m.feedback_id && String(m.feedback_id) === String(feedback_id)) return true;
							// 2. Exact ticket marker match: [TICKET id="${feedback_id}"]
							if (m.message && m.message.includes(`[TICKET id="${feedback_id}"]`)) return true;
							// 3. If tagged with ANOTHER ticket ID, strictly EXCLUDE it!
							const otherTicketMatch = m.message?.match(/\[TICKET id="([^"]+)"\]/);
							if (otherTicketMatch && String(otherTicketMatch[1]) !== String(feedback_id)) {
								return false;
							}
							// 4. If it's a different ticket submission header, exclude it!
							if (m.message && m.message.includes('[Need Help or Suggestion:') && !m.message.includes(`[TICKET id="${feedback_id}"]`)) {
								return false;
							}
							// 5. If feedback_created_at is provided, exclude any messages sent BEFORE this ticket was opened
							if (feedback_created_at) {
								const msgTime = new Date(m.created_at).getTime();
								const ticketTime = new Date(feedback_created_at).getTime();
								// Allow 10s buffer for clock skew
								if (msgTime < ticketTime - 10000) {
									return false;
								}
							}
							// 6. If a subsequent ticket was opened, exclude untagged messages sent after next ticket was opened
							if (nextTicketTime) {
								const msgTime = new Date(m.created_at).getTime();
								if (msgTime >= nextTicketTime - 5000) {
									return false;
								}
							}
							return true;
						});
					} else {
						chatMessages = msgs;
					}
				}
			} catch (e) {}

			return json({
				success: true,
				data: {
					admin_id: adminId,
					user: targetUser,
					messages: chatMessages
				}
			});
		}

		// 9. SEND CHAT MESSAGE TO USER AS ADMIN
		if (action === 'send_chat_message') {
			const { user_id, message, feedback_id, resolve_feedback = false } = body;
			if (!user_id || !message || !message.trim()) {
				return json({ error: 'User ID and non-empty message are required' }, { status: 400 });
			}

			let adminId = 14;
			try {
				const { data: supportRow } = await supabase
					.from('chronomuse_users')
					.select('id, username')
					.eq('username', 'chronomuse_support')
					.maybeSingle();

				if (supportRow?.id) {
					adminId = supportRow.id;
				}
			} catch (uErr) {}

			const formattedMessage = feedback_id
				? `[TICKET id="${feedback_id}"]${message.trim()}[/TICKET]`
				: message.trim();

			let { data: newMsg, error: sendErr } = await supabase
				.from('chronomuse_messages')
				.insert([
					{
						sender_id: adminId,
						receiver_id: user_id,
						message: formattedMessage,
						is_read: false,
						feedback_id: feedback_id || null
					}
				])
				.select()
				.single();

			if (sendErr && sendErr.message?.includes('feedback_id')) {
				const fallback = await supabase
					.from('chronomuse_messages')
					.insert([
						{
							sender_id: adminId,
							receiver_id: user_id,
							message: formattedMessage,
							is_read: false
						}
					])
					.select()
					.single();
				newMsg = fallback.data;
				sendErr = fallback.error;
			}

			if (sendErr) {
				return json({ error: sendErr.message }, { status: 500 });
			}

			// If requested, mark feedback as resolved
			if (resolve_feedback && feedback_id) {
				updateLocalFeedbackStatus(feedback_id, 'resolved');
				try {
					await supabase
						.from('chronomuse_feedbacks')
						.update({ status: 'resolved' })
						.eq('id', feedback_id);
				} catch (e) {}
			}

			return json({
				success: true,
				data: {
					message: newMsg,
					feedback_resolved: Boolean(resolve_feedback && feedback_id)
				}
			});
		}

		return json({ error: 'Unknown action' }, { status: 400 });
	} catch (err) {
		console.error('Admin API Catch Error:', err);
		return json({ error: err.message }, { status: 500 });
	}
}
