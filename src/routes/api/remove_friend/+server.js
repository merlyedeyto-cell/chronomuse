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
			// Delete bidirectional friendship records
			await supabase
				.from('chronomuse_friends')
				.delete()
				.eq('user_id', user_id)
				.eq('friend_id', targetFriendId);

			await supabase
				.from('chronomuse_friends')
				.delete()
				.eq('user_id', targetFriendId)
				.eq('friend_id', user_id);

			// Also reset any friend requests between them so they can send requests again if needed
			await supabase
				.from('chronomuse_friend_requests')
				.delete()
				.or(`and(sender_id.eq.${user_id},receiver_id.eq.${targetFriendId}),and(sender_id.eq.${targetFriendId},receiver_id.eq.${user_id})`);
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
