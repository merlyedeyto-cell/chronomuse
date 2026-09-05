import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id, target_user_id } = await request.json();

		const targetId = target_user_id || user_id;

		if (!targetId) {
			return json({ error: 'User ID is required' }, { status: 400 });
		}

		// 1. Fetch Target User Data
		let { data: targetUser, error: userError } = await supabase
			.from('chronomuse_users')
			.select('id, username, email, avatar_url, created_at, last_activity, bio, birthday, relationship_status, gender')
			.eq('id', targetId)
			.maybeSingle();

		// If new columns might not exist in database table yet, fallback gracefully
		if (userError) {
			const fallbackQuery = await supabase
				.from('chronomuse_users')
				.select('id, username, email, avatar_url, created_at, last_activity')
				.eq('id', targetId)
				.maybeSingle();

			if (fallbackQuery.error && fallbackQuery.error.message?.includes('avatar_url')) {
				const minimalQuery = await supabase
					.from('chronomuse_users')
					.select('id, username, email, created_at, last_activity')
					.eq('id', targetId)
					.maybeSingle();
				targetUser = minimalQuery.data;
				userError = minimalQuery.error;
			} else {
				targetUser = fallbackQuery.data;
				userError = fallbackQuery.error;
			}
		}

		if (userError) {
			return json({ error: 'Database error: ' + userError.message }, { status: 500 });
		}

		if (!targetUser) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		// 2. Fetch Target User's Friends
		const { data: targetFriendships } = await supabase
			.from('chronomuse_friends')
			.select('id, friend_id, created_at')
			.eq('user_id', targetId);

		const targetFriendIds = (targetFriendships || []).map(f => f.friend_id);
		let targetFriends = [];

		if (targetFriendIds.length > 0) {
			let { data: friendUsers, error: friendUsersError } = await supabase
				.from('chronomuse_users')
				.select('id, username, email, avatar_url, last_activity')
				.in('id', targetFriendIds);

			if (friendUsersError && friendUsersError.message?.includes('avatar_url')) {
				const fallbackFriendUsers = await supabase
					.from('chronomuse_users')
					.select('id, username, email, last_activity')
					.in('id', targetFriendIds);
				friendUsers = fallbackFriendUsers.data;
			}

			targetFriends = (friendUsers || []).map(u => {
				const rel = (targetFriendships || []).find(f => f.friend_id === u.id);
				return {
					friendship_id: rel ? rel.id : u.id,
					friend_id: u.id,
					id: u.id,
					username: u.username,
					email: u.email,
					avatar_url: u.avatar_url || null,
					last_activity: u.last_activity,
					friends_since: rel ? rel.created_at : null
				};
			});
		}

		// 3. Fetch Target User's Total Memories Count
		const { count: memoriesCount } = await supabase
			.from('chronomuse_memories')
			.select('id', { count: 'exact', head: true })
			.eq('user_id', targetId);

		const isSelf = String(user_id) === String(targetId);
		let isFriend = false;
		let hasPendingRequest = false;
		let pendingReq = null;
		let mutualFriends = [];

		// 4. If viewing another user, compute friendship status and mutual friends
		if (!isSelf && user_id) {
			// Check if viewer and target are friends
			isFriend = targetFriendIds.includes(Number(user_id)) || targetFriendIds.includes(String(user_id));

			// Check pending friend requests between viewer and target
			const { data: reqData } = await supabase
				.from('chronomuse_friend_requests')
				.select('id, sender_id, receiver_id, status')
				.or(`and(sender_id.eq.${user_id},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${user_id})`)
				.eq('status', 'pending')
				.maybeSingle();

			pendingReq = reqData;
			if (pendingReq) {
				hasPendingRequest = true;
			}

			// Get Viewer's friends to find mutual friends
			const { data: viewerFriendships } = await supabase
				.from('chronomuse_friends')
				.select('friend_id')
				.eq('user_id', user_id);

			const viewerFriendIds = new Set((viewerFriendships || []).map(f => Number(f.friend_id)));

			// Mutual friends are friends that exist in both targetFriends and viewerFriendIds
			mutualFriends = targetFriends.filter(f => viewerFriendIds.has(Number(f.friend_id)));
		}

		return json({
			success: true,
			data: {
				user: {
					id: targetUser.id,
					username: targetUser.username,
					email: targetUser.email,
					avatar_url: targetUser.avatar_url || null,
					created_at: targetUser.created_at || null,
					last_activity: targetUser.last_activity || null
				},
				is_self: isSelf,
				is_friend: isFriend,
				has_pending_request: hasPendingRequest,
				pending_request_id: pendingReq?.id || null,
				pending_request_sender_id: pendingReq?.sender_id || null,
				total_friends: targetFriends.length,
				total_memories: memoriesCount || 0,
				friends: targetFriends,
				mutual_friends: mutualFriends,
				mutual_friends_count: mutualFriends.length
			}
		});
	} catch (err) {
		return json({ error: 'Server error: ' + err.message }, { status: 500 });
	}
}
