import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id, query } = await request.json();

		const searchQuery = (query || '').trim();
		if (!searchQuery) {
			return json({ success: true, data: { users: [] } });
		}

		// 1. Search users by username (case-insensitive substring match)
		const { data: matchedUsers, error: searchError } = await supabase
			.from('chronomuse_users')
			.select('id, username, email, avatar_url, created_at, last_activity')
			.ilike('username', `%${searchQuery}%`)
			.limit(10);

		if (searchError) {
			return json({ error: searchError.message }, { status: 500 });
		}

		if (!matchedUsers || matchedUsers.length === 0) {
			return json({ success: true, data: { users: [] } });
		}

		const matchedUserIds = matchedUsers.map(u => u.id);

		// 2. Fetch friendships for current user to know who is already a friend
		let myFriendIds = new Set();
		if (user_id) {
			const { data: friendships } = await supabase
				.from('chronomuse_friends')
				.select('friend_id')
				.eq('user_id', user_id);

			if (friendships) {
				friendships.forEach(f => myFriendIds.add(Number(f.friend_id)));
			}
		}

		// 3. Fetch friend requests involving current user and matched users
		let sentPendingMap = new Map(); // targetId -> requestId
		let receivedPendingMap = new Map(); // senderId -> requestId
		if (user_id) {
			const { data: friendRequests } = await supabase
				.from('chronomuse_friend_requests')
				.select('id, sender_id, receiver_id, status')
				.or(`sender_id.eq.${user_id},receiver_id.eq.${user_id}`)
				.eq('status', 'pending');

			if (friendRequests) {
				friendRequests.forEach(req => {
					if (String(req.sender_id) === String(user_id)) {
						sentPendingMap.set(Number(req.receiver_id), req.id);
					} else if (String(req.receiver_id) === String(user_id)) {
						receivedPendingMap.set(Number(req.sender_id), req.id);
					}
				});
			}
		}

		// 4. Compute mutual friends count for each matched user
		// Fetch all friendships for the matched users
		let mutualFriendsCountMap = new Map();
		if (user_id && myFriendIds.size > 0 && matchedUserIds.length > 0) {
			const { data: targetFriendships } = await supabase
				.from('chronomuse_friends')
				.select('user_id, friend_id')
				.in('user_id', matchedUserIds);

			if (targetFriendships) {
				targetFriendships.forEach(tf => {
					if (myFriendIds.has(Number(tf.friend_id))) {
						const currentCount = mutualFriendsCountMap.get(tf.user_id) || 0;
						mutualFriendsCountMap.set(tf.user_id, currentCount + 1);
					}
				});
			}
		}

		// 5. Format results
		const users = matchedUsers.map(u => {
			const isSelf = user_id && String(u.id) === String(user_id);
			const isFriend = myFriendIds.has(Number(u.id));
			const isSentPending = sentPendingMap.has(Number(u.id));
			const isReceivedPending = receivedPendingMap.has(Number(u.id));
			const requestId = isSentPending ? sentPendingMap.get(Number(u.id)) : isReceivedPending ? receivedPendingMap.get(Number(u.id)) : null;

			let relationship = 'none';
			if (isSelf) relationship = 'self';
			else if (isFriend) relationship = 'friends';
			else if (isSentPending) relationship = 'request_sent';
			else if (isReceivedPending) relationship = 'request_received';

			return {
				id: u.id,
				username: u.username,
				email: u.email,
				avatar_url: u.avatar_url || null,
				created_at: u.created_at || null,
				last_activity: u.last_activity || null,
				relationship,
				request_id: requestId,
				mutual_friends_count: mutualFriendsCountMap.get(u.id) || 0
			};
		});

		// Sort exact match first, then alphabetically
		users.sort((a, b) => {
			if (a.username.toLowerCase() === searchQuery.toLowerCase()) return -1;
			if (b.username.toLowerCase() === searchQuery.toLowerCase()) return 1;
			return a.username.localeCompare(b.username);
		});

		return json({ success: true, data: { users } });
	} catch (err) {
		return json({ error: 'Search error: ' + err.message }, { status: 500 });
	}
}
