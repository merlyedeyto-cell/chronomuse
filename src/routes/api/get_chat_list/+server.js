import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id } = await request.json();

		if (!user_id) {
			return json({ error: 'User ID is required' }, { status: 400 });
		}

		// Get all friends
		const { data: friendships } = await supabase
			.from('chronomuse_friends')
			.select('friend_id')
			.eq('user_id', user_id);

		if (!friendships || friendships.length === 0) {
			return json({ success: true, data: { friends: [] } });
		}

		const friendIds = friendships.map(f => f.friend_id);
		const { data: friendUsers } = await supabase
			.from('chronomuse_users')
			.select('id, username, email, avatar_url, last_activity')
			.in('id', friendIds);

		if (!friendUsers) {
			return json({ success: true, data: { friends: [] } });
		}

		// For each friend, fetch last message and unread count
		const friendsWithChat = await Promise.all(
			friendUsers.map(async friend => {
				// Last message
				const { data: lastMsgArr } = await supabase
					.from('chronomuse_messages')
					.select('message, created_at, sender_id, is_read')
					.or(`and(sender_id.eq.${user_id},receiver_id.eq.${friend.id}),and(sender_id.eq.${friend.id},receiver_id.eq.${user_id})`)
					.order('created_at', { ascending: false })
					.limit(1);

				// Unread count
				const { count: unreadCount } = await supabase
					.from('chronomuse_messages')
					.select('*', { count: 'exact', head: true })
					.eq('sender_id', friend.id)
					.eq('receiver_id', user_id)
					.eq('is_read', false);

				const lastMsg = lastMsgArr && lastMsgArr.length > 0 ? lastMsgArr[0] : null;

				return {
					friend_id: friend.id,
					username: friend.username,
					email: friend.email,
					avatar_url: friend.avatar_url || null,
					last_activity: friend.last_activity,
					last_message: lastMsg ? lastMsg.message : null,
					last_message_time: lastMsg ? lastMsg.created_at : null,
					last_sender_id: lastMsg ? lastMsg.sender_id : null,
					last_is_read: lastMsg ? Boolean(lastMsg.is_read) : false,
					unread_count: unreadCount || 0
				};
			})
		);

		// Sort friends by most recent message descending (latest conversation at the very top)
		friendsWithChat.sort((a, b) => {
			const timeA = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
			const timeB = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
			if (timeB !== timeA) {
				return timeB - timeA;
			}
			return a.username.localeCompare(b.username);
		});

		return json({ success: true, data: { friends: friendsWithChat } });
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
