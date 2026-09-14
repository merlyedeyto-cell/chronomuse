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

		const user_id = Number(senderId);
		const target_id = Number(targetUser.id);

		if (target_id === user_id) {
			return json({ error: 'You cannot add yourself as a friend' }, { status: 400 });
		}

		// Check if already friends & check existing requests between both users
		const [{ data: existingFriends }, { data: existingRequests }] = await Promise.all([
			supabase
				.from('chronomuse_friends')
				.select('id')
				.or(`and(user_id.eq.${user_id},friend_id.eq.${target_id}),and(user_id.eq.${target_id},friend_id.eq.${user_id})`)
				.limit(1),
			supabase
				.from('chronomuse_friend_requests')
				.select('id, status, sender_id, receiver_id')
				.or(`and(sender_id.eq.${user_id},receiver_id.eq.${target_id}),and(sender_id.eq.${target_id},receiver_id.eq.${user_id})`)
		]);

		if (existingFriends && existingFriends.length > 0) {
			return json({ error: `You are already friends with @${targetUser.username}` }, { status: 400 });
		}

		if (existingRequests && existingRequests.length > 0) {
			const pendingReq = existingRequests.find(r => r.status === 'pending');
			if (pendingReq) {
				if (Number(pendingReq.sender_id) === user_id) {
					return json({ error: `Friend request to @${targetUser.username} is already pending` }, { status: 400 });
				} else {
					// The other user already sent a pending request to this user -> automatically accept!
					await Promise.all([
						supabase
							.from('chronomuse_friend_requests')
							.update({ status: 'accepted', updated_at: new Date().toISOString() })
							.eq('id', pendingReq.id),
						supabase
							.from('chronomuse_friends')
							.upsert([
								{ user_id: user_id, friend_id: target_id },
								{ user_id: target_id, friend_id: user_id }
							], { onConflict: 'user_id,friend_id' })
					]);
					return json({ success: true, message: `You and @${targetUser.username} are now friends!` });
				}
			}

			// If old non-pending requests exist (declined/accepted/etc.), clean them up before inserting a fresh one
			await supabase
				.from('chronomuse_friend_requests')
				.delete()
				.or(`and(sender_id.eq.${user_id},receiver_id.eq.${target_id}),and(sender_id.eq.${target_id},receiver_id.eq.${user_id})`);
		}

		// Insert new friend request
		const { data: newReq, error: insertError } = await supabase
			.from('chronomuse_friend_requests')
			.insert([
				{
					sender_id: user_id,
					receiver_id: target_id,
					status: 'pending',
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
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

		return json({
			success: true,
			request_id: newReq?.id || null,
			message: `Friend request sent to @${targetUser.username}!`
		});
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
