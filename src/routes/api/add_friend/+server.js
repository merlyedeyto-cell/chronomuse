import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const body = await request.json();
		const senderId = body.user_id || body.sender_id;
		const receiverId = body.receiver_id || body.target_id || body.friend_id;
		const friendUsernameInput = body.friend_username ? String(body.friend_username).trim().replace(/^@/, '') : null;

		if (!senderId || (!receiverId && !friendUsernameInput)) {
			return json({ error: 'User ID and Target User or Friend Username are required' }, { status: 400 });
		}

		let targetUser = null;
		let userError = null;

		if (receiverId) {
			const res = await supabase
				.from('chronomuse_users')
				.select('id, username')
				.eq('id', receiverId)
				.maybeSingle();
			targetUser = res.data;
			userError = res.error;
		} else if (friendUsernameInput) {
			const res = await supabase
				.from('chronomuse_users')
				.select('id, username')
				.ilike('username', friendUsernameInput)
				.maybeSingle();
			targetUser = res.data;
			userError = res.error;
		}

		if (userError || !targetUser) {
			const displayTarget = friendUsernameInput ? `@${friendUsernameInput}` : `User #${receiverId}`;
			return json({ error: `${displayTarget} not found` }, { status: 404 });
		}

		const user_id = senderId;

		if (String(targetUser.id) === String(user_id)) {
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

		if (existingFriend) {
			return json({ error: `You are already friends with @${targetUser.username}` }, { status: 400 });
		}

		if (existingRequest) {
			if (existingRequest.status === 'pending') {
				return json({ error: `Friend request to @${targetUser.username} is already pending` }, { status: 400 });
			}
			if (existingRequest.status === 'accepted' && existingFriend) {
				return json({ error: `You are already friends with @${targetUser.username}` }, { status: 400 });
			}
			if (existingRequest.status === 'declined' || (existingRequest.status === 'accepted' && !existingFriend)) {
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

				if (updateError) {
					return json({ error: 'Failed to update friend request: ' + updateError.message }, { status: 500 });
				}

				// Broadcast friend request event to recipient inbox & global channel
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
					const globalChannel = supabase.channel('chronomuse_global_events');
					globalChannel.subscribe((status) => {
						if (status === 'SUBSCRIBED') {
							globalChannel.send({
								type: 'broadcast',
								event: 'global_friend_event',
								payload: { sender_id: user_id, target_id: targetUser.id, eventType: 'friend_request' }
							});
						}
					});
				} catch (e) {}

				return json({ success: true, request_id: existingRequest.id, message: `Friend request sent to @${targetUser.username}!` });
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
			.maybeSingle();

		if (insertError) {
			if (insertError.message?.includes('already exists') || insertError.code === '23505') {
				return json({ error: `Friend request to @${targetUser.username} is already pending` }, { status: 400 });
			}
			return json({ error: 'Database error: ' + insertError.message }, { status: 500 });
		}

		// Broadcast friend request event to recipient inbox & global channel
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
			const globalChannel = supabase.channel('chronomuse_global_events');
			globalChannel.subscribe((status) => {
				if (status === 'SUBSCRIBED') {
					globalChannel.send({
						type: 'broadcast',
						event: 'global_friend_event',
						payload: { sender_id: user_id, target_id: targetUser.id, eventType: 'friend_request' }
					});
				}
			});
		} catch (e) {}

		return json({ success: true, request_id: newReq?.id || null, message: `Friend request sent to ${targetUser.username}!` });
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
