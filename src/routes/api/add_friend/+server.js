import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id, friend_username } = await request.json();

		if (!user_id || !friend_username) {
			return json({ error: 'User ID and Friend Username are required' }, { status: 400 });
		}

		// Find target user by username (case-insensitive)
		const { data: targetUser, error: userError } = await supabase
			.from('chronomuse_users')
			.select('id, username')
			.ilike('username', friend_username.trim())
			.maybeSingle();

		if (userError || !targetUser) {
			return json({ error: `User "@${friend_username}" not found` }, { status: 404 });
		}

		if (targetUser.id === user_id) {
			return json({ error: 'You cannot add yourself as a friend' }, { status: 400 });
		}

		// Check if already friends & check existing request in parallel for fast response
		const [{ data: existingFriend }, { data: existingRequest }] = await Promise.all([
			supabase
				.from('chronomuse_friends')
				.select('id')
				.or(`and(user_id.eq.${user_id},friend_id.eq.${targetUser.id}),and(user_id.eq.${targetUser.id},friend_id.eq.${user_id})`)
				.maybeSingle(),
			supabase
				.from('chronomuse_friend_requests')
				.select('id, status, sender_id')
				.or(`and(sender_id.eq.${user_id},receiver_id.eq.${targetUser.id}),and(sender_id.eq.${targetUser.id},receiver_id.eq.${user_id})`)
				.maybeSingle()
		]);

		if (existingRequest) {
			if (existingRequest.status === 'pending') {
				return json({ error: 'Friend request already pending' }, { status: 400 });
			}
			if (existingRequest.status === 'accepted') {
				return json({ error: `You are already friends with ${targetUser.username}` }, { status: 400 });
			}
			if (existingRequest.status === 'declined') {
				// Re-open request
				const { error: updateError } = await supabase
					.from('chronomuse_friend_requests')
					.update({
						sender_id: user_id,
						receiver_id: targetUser.id,
						status: 'pending',
						updated_at: new Date()
					})
					.eq('id', existingRequest.id);

				// Broadcast friend request event to recipient inbox
				try {
					const channel = supabase.channel(`chronomuse_user_inbox_${targetUser.id}`);
					channel.subscribe((status) => {
						if (status === 'SUBSCRIBED') {
							channel.send({
								type: 'broadcast',
								event: 'friend_request',
								payload: { sender_id: user_id, receiver_id: targetUser.id }
							});
						}
					});
				} catch (e) {}

				return json({ success: true, request_id: existingRequest.id, message: `Friend request sent to ${targetUser.username}!` });
			}
		}

		// Insert friend request
		const { data: newReq, error: insertError } = await supabase
			.from('chronomuse_friend_requests')
			.insert([
				{
					sender_id: user_id,
					receiver_id: targetUser.id,
					status: 'pending'
				}
			])
			.select('id')
			.single();

		if (insertError) {
			return json({ error: insertError.message }, { status: 500 });
		}

		// Broadcast friend request event to recipient inbox
		try {
			const channel = supabase.channel(`chronomuse_user_inbox_${targetUser.id}`);
			channel.subscribe((status) => {
				if (status === 'SUBSCRIBED') {
					channel.send({
						type: 'broadcast',
						event: 'friend_request',
						payload: { sender_id: user_id, receiver_id: targetUser.id }
					});
				}
			});
		} catch (e) {}

		return json({ success: true, request_id: newReq?.id || null, message: `Friend request sent to ${targetUser.username}!` });
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
