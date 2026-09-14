import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id, page = 1, limit = 20 } = await request.json();
		const currentUserId = Number(user_id);
		const pageNum = Math.max(1, Number(page) || 1);
		const pageSize = Math.min(50, Math.max(1, Number(limit) || 20));
		const offset = (pageNum - 1) * pageSize;

		// 1. Fetch total count of other users
		const { count, error: countErr } = await supabase
			.from('chronomuse_users')
			.select('*', { count: 'exact', head: true })
			.neq('id', currentUserId || 0);

		// 2. Fetch paginated users
		let query = supabase
			.from('chronomuse_users')
			.select('id, username, email, avatar_url, created_at, last_activity')
			.order('id', { ascending: false })
			.range(offset, offset + pageSize - 1);

		if (currentUserId) {
			query = query.neq('id', currentUserId);
		}

		const { data: userRows, error: userError } = await query;

		if (userError) {
			return json({ error: userError.message }, { status: 500 });
		}

		if (!userRows || userRows.length === 0) {
			return json({
				success: true,
				data: {
					users: [],
					has_more: false,
					total: count || 0,
					page: pageNum
				}
			});
		}

		const userIds = userRows.map(u => u.id);

		// 3. Fetch friendships for current user to know who is already a friend
		let myFriendIds = new Set();
		if (currentUserId) {
			const { data: friendships } = await supabase
				.from('chronomuse_friends')
				.select('friend_id')
				.eq('user_id', currentUserId);

			if (friendships) {
				friendships.forEach(f => {
					myFriendIds.add(Number(f.friend_id));
					myFriendIds.add(String(f.friend_id));
				});
			}
		}

		// 4. Fetch pending friend requests involving current user and returned users
		let sentPendingMap = new Map();
		let receivedPendingMap = new Map();
		if (currentUserId) {
			const { data: friendRequests } = await supabase
				.from('chronomuse_friend_requests')
				.select('id, sender_id, receiver_id, status')
				.or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
				.eq('status', 'pending');

			if (friendRequests) {
				friendRequests.forEach(req => {
					if (Number(req.sender_id) === currentUserId || String(req.sender_id) === String(currentUserId)) {
						sentPendingMap.set(Number(req.receiver_id), req.id);
						sentPendingMap.set(String(req.receiver_id), req.id);
					} else if (Number(req.receiver_id) === currentUserId || String(req.receiver_id) === String(currentUserId)) {
						receivedPendingMap.set(Number(req.sender_id), req.id);
						receivedPendingMap.set(String(req.sender_id), req.id);
					}
				});
			}
		}

		// 5. Format results
		const users = userRows.map(u => {
			const uId = Number(u.id);
			const uIdStr = String(u.id);
			const isFriend = myFriendIds.has(uId) || myFriendIds.has(uIdStr);
			const isSentPending = sentPendingMap.has(uId) || sentPendingMap.has(uIdStr);
			const isReceivedPending = receivedPendingMap.has(uId) || receivedPendingMap.has(uIdStr);
			const requestId = isSentPending ? (sentPendingMap.get(uId) || sentPendingMap.get(uIdStr)) : isReceivedPending ? (receivedPendingMap.get(uId) || receivedPendingMap.get(uIdStr)) : null;

			let relationship = 'none';
			if (isFriend) relationship = 'friends';
			else if (isSentPending) relationship = 'request_sent';
			else if (isReceivedPending) relationship = 'request_received';

			return {
				id: u.id,
				username: u.username,
				email: u.email,
				avatar_url: u.avatar_url || null,
				created_at: u.created_at,
				last_activity: u.last_activity,
				relationship: relationship,
				request_id: requestId
			};
		});

		const totalCount = count || 0;
		const hasMore = offset + userRows.length < totalCount;

		return json({
			success: true,
			data: {
				users,
				has_more: hasMore,
				total: totalCount,
				page: pageNum
			}
		});
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
