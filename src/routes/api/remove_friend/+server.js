import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id, friend_id, friendship_id } = await request.json();

		if (!user_id || (!friend_id && !friendship_id)) {
			return json({ error: 'User ID and Friend ID or Friendship ID are required' }, { status: 400 });
		}

		let targetFriendId = friend_id;

		// If only friendship_id was provided, resolve friend_id from chronomuse_friends
		if (!targetFriendId && friendship_id) {
			const { data: rel } = await supabase
				.from('chronomuse_friends')
				.select('friend_id, user_id')
				.eq('id', friendship_id)
				.maybeSingle();

			if (rel) {
				targetFriendId = String(rel.user_id) === String(user_id) ? rel.friend_id : rel.user_id;
			}
		}

		if (targetFriendId) {
			// Delete bidirectional friendship records & reset friend requests in parallel
			await Promise.all([
				supabase
					.from('chronomuse_friends')
					.delete()
					.or(`and(user_id.eq.${user_id},friend_id.eq.${targetFriendId}),and(user_id.eq.${targetFriendId},friend_id.eq.${user_id})`),
				supabase
					.from('chronomuse_friend_requests')
					.delete()
					.or(`and(sender_id.eq.${user_id},receiver_id.eq.${targetFriendId}),and(sender_id.eq.${targetFriendId},receiver_id.eq.${user_id})`)
			]);

			// Broadcast realtime unfriend event
			try {
				const channel = supabase.channel(`chronomuse_user_inbox_${targetFriendId}`);
				channel.subscribe((status) => {
					if (status === 'SUBSCRIBED') {
						channel.send({
							type: 'broadcast',
							event: 'friend_change',
							payload: { sender_id: user_id, receiver_id: targetFriendId, eventType: 'unfriend' }
						});
					}
				});
				const globalChannel = supabase.channel('chronomuse_global_events');
				globalChannel.subscribe((status) => {
					if (status === 'SUBSCRIBED') {
						globalChannel.send({
							type: 'broadcast',
							event: 'global_friend_event',
							payload: { sender_id: user_id, target_id: targetFriendId, eventType: 'unfriend' }
						});
					}
				});
			} catch (e) {}
		} else if (friendship_id) {
			await supabase
				.from('chronomuse_friends')
				.delete()
				.eq('id', friendship_id);
		}

		return json({ success: true, message: 'Friend removed successfully' });
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
