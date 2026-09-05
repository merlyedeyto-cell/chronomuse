import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id } = await request.json();

		if (!user_id) {
			return json({ error: 'User ID is required' }, { status: 400 });
		}

		// 1. Get all friends of this user
		const { data: friendships } = await supabase
			.from('chronomuse_friends')
			.select('friend_id')
			.eq('user_id', user_id);

		const friendIds = (friendships || []).map(f => Number(f.friend_id));
		const friendIdSet = new Set(friendIds);

		// 2. Get distinct conversation partners from chronomuse_messages (both sent and received)
		const { data: sentMessages } = await supabase
			.from('chronomuse_messages')
			.select('receiver_id')
			.eq('sender_id', user_id);

		const { data: receivedMessages } = await supabase
			.from('chronomuse_messages')
			.select('sender_id')
			.eq('receiver_id', user_id);

		const allPartnerIds = new Set();
		friendIds.forEach(id => allPartnerIds.add(id));
		(sentMessages || []).forEach(m => allPartnerIds.add(Number(m.receiver_id)));
		(receivedMessages || []).forEach(m => allPartnerIds.add(Number(m.sender_id)));
		allPartnerIds.delete(Number(user_id));

		const allPartnerIdsArray = Array.from(allPartnerIds);

		if (allPartnerIdsArray.length === 0) {
			return json({
				success: true,
				data: {
					friends: [],
					requests: [],
					all_conversations: []
				}
			});
		}

		// 3. Fetch user details for all partners
		let { data: partnerUsers, error: userError } = await supabase
			.from('chronomuse_users')
			.select('id, username, email, avatar_url, last_activity')
			.in('id', allPartnerIdsArray);

		if (userError && userError.message?.includes('avatar_url')) {
			const fallbackUsers = await supabase
				.from('chronomuse_users')
				.select('id, username, email, last_activity')
				.in('id', allPartnerIdsArray);
			partnerUsers = fallbackUsers.data;
		}

		if (!partnerUsers || partnerUsers.length === 0) {
			return json({
				success: true,
				data: {
					friends: [],
					requests: [],
					all_conversations: []
				}
			});
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

		// 4. For each partner, fetch last message and unread count
		const conversations = await Promise.all(
			partnerUsers.map(async partner => {
				const isFriend = friendIdSet.has(Number(partner.id)) || friendIdSet.has(String(partner.id));

				// Last message
				const { data: lastMsgArr } = await supabase
					.from('chronomuse_messages')
					.select('message, created_at, sender_id, is_read')
					.or(`and(sender_id.eq.${user_id},receiver_id.eq.${partner.id}),and(sender_id.eq.${partner.id},receiver_id.eq.${user_id})`)
					.order('created_at', { ascending: false })
					.limit(1);

				// Unread count
				const { count: unreadCount } = await supabase
					.from('chronomuse_messages')
					.select('*', { count: 'exact', head: true })
					.eq('sender_id', partner.id)
					.eq('receiver_id', user_id)
					.eq('is_read', false);

				const lastMsg = lastMsgArr && lastMsgArr.length > 0 ? lastMsgArr[0] : null;

				return {
					friend_id: partner.id,
					id: partner.id,
					username: partner.username,
					email: partner.email,
					avatar_url: partner.avatar_url || null,
					last_activity: partner.last_activity,
					last_message: lastMsg ? lastMsg.message : null,
					last_message_time: lastMsg ? lastMsg.created_at : null,
					last_sender_id: lastMsg ? lastMsg.sender_id : null,
					last_is_read: lastMsg ? Boolean(lastMsg.is_read) : false,
					unread_count: unreadCount || 0,
					is_friend: isFriend,
					is_request: !isFriend,
					is_blocked_by_me: blockedSetByMe.has(String(partner.id)),
					is_blocking_me: blockedSetByThem.has(String(partner.id))
				};
			})
		);

		// Separate friends and message requests
		const friendsList = conversations.filter(c => c.is_friend);
		const requestsList = conversations.filter(c => !c.is_friend && c.last_message !== null);

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
