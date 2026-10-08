import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id, target_user_id } = await request.json();

		const targetId = target_user_id || user_id;

		if (!targetId) {
			return json({ error: 'User ID is required' }, { status: 400 });
		}

		// 1. Fetch Target User Data (Fast single lookup with fallback)
		let targetUser = null;
		const cleanTarget = String(targetId).replace(/^@/, '').trim();
		const isNumeric = !isNaN(Number(cleanTarget)) && /^\d+$/.test(cleanTarget);

		if (isNumeric) {
			const res = await supabase
				.from('chronomuse_users')
				.select('*')
				.eq('id', Number(cleanTarget))
				.maybeSingle();
			targetUser = res.data;
		}

		if (!targetUser) {
			const res = await supabase
				.from('chronomuse_users')
				.select('*')
				.ilike('username', cleanTarget)
				.maybeSingle();
			targetUser = res.data;
		}

		if (!targetUser) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		const resolvedTargetId = targetUser.id;
		const isSelf = String(user_id) === String(resolvedTargetId);

		// 2. Run all queries concurrently for maximum speed
		const queries = [
			// Query 0: Target user's friendships
			supabase
				.from('chronomuse_friends')
				.select('id, friend_id, created_at')
				.eq('user_id', resolvedTargetId),

			// Query 1: Target user's memories count
			supabase
				.from('chronomuse_memories')
				.select('id', { count: 'exact', head: true })
				.eq('user_id', resolvedTargetId)
		];

		// Additional queries if viewing another user
		if (!isSelf && user_id) {
			queries.push(
				// Query 2: Block status
				supabase
					.from('chronomuse_blocked_users')
					.select('blocker_id, blocked_id')
					.or(`and(blocker_id.eq.${user_id},blocked_id.eq.${resolvedTargetId}),and(blocker_id.eq.${resolvedTargetId},blocked_id.eq.${user_id})`),

				// Query 3: Pending friend request
				supabase
					.from('chronomuse_friend_requests')
					.select('id, sender_id, receiver_id, status')
					.or(`and(sender_id.eq.${user_id},receiver_id.eq.${resolvedTargetId}),and(sender_id.eq.${resolvedTargetId},receiver_id.eq.${user_id})`)
					.eq('status', 'pending')
					.maybeSingle(),

				// Query 4: Viewer's friendships (for mutual friends calculation)
				supabase
					.from('chronomuse_friends')
					.select('friend_id')
					.eq('user_id', user_id)
			);
		}

		const results = await Promise.all(queries);

		const targetFriendships = results[0]?.data || [];
		const memoriesCount = results[1]?.count || 0;
		const bData = !isSelf && user_id ? (results[2]?.data || []) : [];
		const pendingReq = !isSelf && user_id ? (results[3]?.data || null) : null;
		const viewerFriendships = !isSelf && user_id ? (results[4]?.data || []) : [];

		const targetFriendIds = targetFriendships.map(f => f.friend_id);
		let targetFriends = [];

		if (targetFriendIds.length > 0) {
			const { data: friendUsers } = await supabase
				.from('chronomuse_users')
				.select('id, username, email, avatar_url, last_activity, bio')
				.in('id', targetFriendIds);

			targetFriends = (friendUsers || []).map(u => {
				const rel = targetFriendships.find(f => f.friend_id === u.id);
				return {
					friendship_id: rel ? rel.id : u.id,
					friend_id: u.id,
					id: u.id,
					username: u.username,
					email: u.email,
					bio: u.bio || null,
					avatar_url: u.avatar_url || null,
					last_activity: u.last_activity,
					friends_since: rel ? rel.created_at : null
				};
			});
		}

		let isFriend = false;
		let hasPendingRequest = false;
		let mutualFriends = [];
		let isBlockedByMe = false;
		let isBlockingMe = false;

		if (!isSelf && user_id) {
			if (bData && bData.length > 0) {
				isBlockedByMe = bData.some(b => String(b.blocker_id) === String(user_id));
				isBlockingMe = bData.some(b => String(b.blocker_id) === String(resolvedTargetId));
			}

			isFriend = targetFriendIds.includes(Number(user_id)) || targetFriendIds.includes(String(user_id));

			if (pendingReq) {
				hasPendingRequest = true;
			}

			const viewerFriendIds = new Set((viewerFriendships || []).map(f => Number(f.friend_id)));
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
					cover_url: targetUser.cover_url || null,
					note: targetUser.note || null,
					bio: targetUser.bio || null,
					birthday: targetUser.birthday || null,
					relationship_status: targetUser.relationship_status || null,
					gender: targetUser.gender || null,
					is_private: targetUser.is_private === true,
					created_at: targetUser.created_at || null,
					last_activity: targetUser.last_activity || null
				},
				is_self: isSelf,
				is_private: targetUser.is_private === true,
				is_friend: isFriend,
				is_blocked_by_me: isBlockedByMe,
				is_blocking_me: isBlockingMe,
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
