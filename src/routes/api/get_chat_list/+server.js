import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';
import { getLocalFeedbacks } from '$lib/server/feedbackStore';

export async function POST({ request }) {
	try {
		const { user_id } = await request.json();

		if (!user_id) {
			return json({ error: 'User ID is required' }, { status: 400 });
		}

		// 1. Fetch user's support tickets if any
		let userTickets = [];
		try {
			const { data: fbList } = await supabase
				.from('chronomuse_feedbacks')
				.select('id, category, title, message, status, created_at')
				.eq('user_id', user_id)
				.order('created_at', { ascending: false });

			if (Array.isArray(fbList)) {
				userTickets = fbList;
			}
		} catch (e) {}

		try {
			const localTickets = getLocalFeedbacks()
				.filter(f => String(f.user_id) === String(user_id));
			const seenTicketIds = new Set(userTickets.map(t => String(t.id)));
			localTickets.forEach(lt => {
				if (!seenTicketIds.has(String(lt.id))) {
					seenTicketIds.add(String(lt.id));
					userTickets.push(lt);
				}
			});
		} catch (e) {}

		// 2. Fetch Support Account Details
		let supportUser = null;
		try {
			const { data: sRow } = await supabase
				.from('chronomuse_users')
				.select('id, username, email, avatar_url, last_activity, note')
				.eq('username', 'chronomuse_support')
				.maybeSingle();
			if (sRow) {
				supportUser = sRow;
			}
		} catch (e) {}

		// 3. Get friends and recent conversation partners concurrently
		const [friendshipsRes, sentRes, receivedRes] = await Promise.all([
			supabase
				.from('chronomuse_friends')
				.select('friend_id')
				.eq('user_id', user_id),
			supabase
				.from('chronomuse_messages')
				.select('receiver_id')
				.eq('sender_id', user_id)
				.order('created_at', { ascending: false })
				.limit(200),
			supabase
				.from('chronomuse_messages')
				.select('sender_id')
				.eq('receiver_id', user_id)
				.order('created_at', { ascending: false })
				.limit(200)
		]);

		const friendIds = (friendshipsRes.data || []).map(f => Number(f.friend_id));
		const friendIdSet = new Set(friendIds);
		const sentMessages = sentRes.data || [];
		const receivedMessages = receivedRes.data || [];

		const allPartnerIds = new Set();
		friendIds.forEach(id => allPartnerIds.add(id));
		sentMessages.forEach(m => allPartnerIds.add(Number(m.receiver_id)));
		receivedMessages.forEach(m => allPartnerIds.add(Number(m.sender_id)));
		allPartnerIds.delete(Number(user_id));

		if (supportUser && (userTickets.length > 0 || allPartnerIds.has(Number(supportUser.id)))) {
			allPartnerIds.add(Number(supportUser.id));
		}

		const allPartnerIdsArray = Array.from(allPartnerIds);

		if (allPartnerIdsArray.length === 0 && userTickets.length === 0) {
			return json({
				success: true,
				data: {
					friends: [],
					requests: [],
					all_conversations: []
				}
			});
		}

		// 4. Fetch user details for all partners
		let partnerUsers = [];
		if (allPartnerIdsArray.length > 0) {
			let { data: pUsers, error: userError } = await supabase
				.from('chronomuse_users')
				.select('id, username, email, avatar_url, last_activity, note')
				.in('id', allPartnerIdsArray);

			if (userError && userError.message?.includes('avatar_url')) {
				const fallbackUsers = await supabase
					.from('chronomuse_users')
					.select('id, username, email, last_activity, note')
					.in('id', allPartnerIdsArray);
				pUsers = fallbackUsers.data;
			}
			partnerUsers = pUsers || [];
		}

		// Fetch blocked relationships
		let blockedSetByMe = new Set();
		let blockedSetByThem = new Set();
		try {
			const { data: bRows } = await supabase
				.from('chronomuse_blocked_users')
				.select('blocker_id, blocked_id')
				.or(`blocker_id.eq.${user_id},blocked_id.eq.${user_id}`);

			(bRows || []).forEach(r => {
				if (String(r.blocker_id) === String(user_id)) {
					blockedSetByMe.add(String(r.blocked_id));
				}
				if (String(r.blocked_id) === String(user_id)) {
					blockedSetByThem.add(String(r.blocker_id));
				}
			});
		} catch (e) {}

		// Fetch pending friend requests
		let pendingRequestsSet = new Map();
		try {
			const { data: reqs } = await supabase
				.from('chronomuse_friend_requests')
				.select('sender_id, receiver_id')
				.eq('status', 'pending')
				.or(`sender_id.eq.${user_id},receiver_id.eq.${user_id}`);

			(reqs || []).forEach(r => {
				if (String(r.sender_id) === String(user_id)) {
					pendingRequestsSet.set(String(r.receiver_id), String(user_id));
				}
				if (String(r.receiver_id) === String(user_id)) {
					pendingRequestsSet.set(String(r.sender_id), String(r.sender_id));
				}
			});
		} catch (e) {}

		// 5. Batch query unread messages for all partners
		const { data: allUnreadMessages } = await supabase
			.from('chronomuse_messages')
			.select('sender_id, message, feedback_id')
			.eq('receiver_id', user_id)
			.eq('is_read', false);

		const unreadCountMap = new Map();
		const ticketUnreadCountMap = new Map();

		(allUnreadMessages || []).forEach(m => {
			const sId = String(m.sender_id);
			unreadCountMap.set(sId, (unreadCountMap.get(sId) || 0) + 1);

			// Track unread count per ticket ID
			let tId = m.feedback_id ? String(m.feedback_id) : null;
			if (!tId && m.message) {
				const mMatch = m.message.match(/\[TICKET id="([^"]+)"\]/);
				if (mMatch) tId = mMatch[1];
			}
			if (tId) {
				ticketUnreadCountMap.set(tId, (ticketUnreadCountMap.get(tId) || 0) + 1);
			}
		});

		// 6. Batch query recent messages involving the user
		const { data: recentMessages } = await supabase
			.from('chronomuse_messages')
			.select('id, message, created_at, sender_id, receiver_id, is_read, feedback_id')
			.or(`sender_id.eq.${user_id},receiver_id.eq.${user_id}`)
			.order('created_at', { ascending: false })
			.limit(500);

		const lastMsgMap = new Map();
		const ticketLastMsgMap = new Map();

		(recentMessages || []).forEach(msg => {
			const partnerId = String(msg.sender_id) === String(user_id) ? String(msg.receiver_id) : String(msg.sender_id);
			if (!lastMsgMap.has(partnerId)) {
				lastMsgMap.set(partnerId, msg);
			}

			// Map recent message per ticket
			let tId = msg.feedback_id ? String(msg.feedback_id) : null;
			if (!tId && msg.message) {
				const mMatch = msg.message.match(/\[TICKET id="([^"]+)"\]/);
				if (mMatch) tId = mMatch[1];
			}
			if (tId && !ticketLastMsgMap.has(tId)) {
				ticketLastMsgMap.set(tId, msg);
			}
		});

		// 7. Assemble conversations
		const conversations = [];

		// A. Add regular friend/partner conversations (excluding support if split by tickets)
		partnerUsers.forEach(partner => {
			const pIdStr = String(partner.id);
			const uName = (partner.username || '').toLowerCase();
			const isSupport = uName === 'chronomuse_support' || uName === 'support';

			// If this is support and user has tickets, we will handle tickets separately below
			if (isSupport && userTickets.length > 0) {
				return;
			}

			const isFriend = friendIdSet.has(Number(partner.id)) || friendIdSet.has(String(partner.id)) || isSupport;
			const lastMsg = lastMsgMap.get(pIdStr) || null;
			const unreadCount = unreadCountMap.get(pIdStr) || 0;

			conversations.push({
				friend_id: partner.id,
				id: partner.id,
				username: partner.username,
				email: partner.email,
				avatar_url: partner.avatar_url || null,
				note: partner.note || null,
				last_activity: partner.last_activity,
				last_message: lastMsg ? lastMsg.message : null,
				last_message_time: lastMsg ? lastMsg.created_at : null,
				last_sender_id: lastMsg ? lastMsg.sender_id : null,
				last_is_read: lastMsg ? Boolean(lastMsg.is_read) : false,
				unread_count: unreadCount,
				is_friend: isFriend,
				is_support: isSupport,
				is_ticket: false,
				is_request: !isFriend && !isSupport,
				is_blocked_by_me: blockedSetByMe.has(pIdStr),
				is_blocking_me: blockedSetByThem.has(pIdStr),
				has_pending_request: pendingRequestsSet.has(pIdStr),
				pending_request_sender_id: pendingRequestsSet.get(pIdStr) || null
			});
		});

		// B. Add separate conversation for EACH support ticket!
		if (userTickets.length > 0 && supportUser) {
			userTickets.forEach(ticket => {
				const tIdStr = String(ticket.id);
				const tLastMsg = ticketLastMsgMap.get(tIdStr) || null;
				const tUnread = ticketUnreadCountMap.get(tIdStr) || 0;

				conversations.push({
					friend_id: supportUser.id,
					id: `ticket_${ticket.id}`,
					ticket_id: ticket.id,
					ticket_category: ticket.category || 'suggestion',
					ticket_title: ticket.title || 'Support Concern',
					ticket_status: ticket.status || 'new',
					username: 'chronomuse_support',
					display_title: ticket.title,
					email: supportUser.email,
					avatar_url: supportUser.avatar_url || '/logo.png',
					note: null,
					last_activity: supportUser.last_activity,
					last_message: tLastMsg ? tLastMsg.message : ticket.message,
					last_message_time: tLastMsg ? tLastMsg.created_at : ticket.created_at,
					last_sender_id: tLastMsg ? tLastMsg.sender_id : user_id,
					last_is_read: tLastMsg ? Boolean(tLastMsg.is_read) : true,
					unread_count: tUnread,
					is_friend: true,
					is_support: true,
					is_ticket: true,
					is_request: false,
					is_blocked_by_me: false,
					is_blocking_me: false,
					has_pending_request: false,
					pending_request_sender_id: null
				});
			});
		}

		// Separate friends and message requests (Support tickets always stay in main list)
		const friendsList = conversations.filter(c => c.is_friend || c.is_support || c.is_ticket);
		const requestsList = conversations.filter(c => !c.is_friend && !c.is_support && !c.is_ticket && c.last_message !== null);

		const sortByTime = (a, b) => {
			const timeA = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
			const timeB = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
			if (timeB !== timeA) {
				return timeB - timeA;
			}
			return a.username.localeCompare(b.username);
		};

		friendsList.sort(sortByTime);
		requestsList.sort(sortByTime);

		return json({
			success: true,
			data: {
				friends: friendsList,
				requests: requestsList,
				all_conversations: [...friendsList, ...requestsList].sort(sortByTime)
			}
		});
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
