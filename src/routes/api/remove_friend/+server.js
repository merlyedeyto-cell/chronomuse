import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id, friend_id } = await request.json();

		if (!user_id || !friend_id) {
			return json({ error: 'User ID and Friend ID are required' }, { status: 400 });
		}

		await supabase
			.from('chronomuse_friends')
			.delete()
			.or(`and(user_id.eq.${user_id},friend_id.eq.${friend_id}),and(user_id.eq.${friend_id},friend_id.eq.${user_id})`);

		return json({ success: true, message: 'Friend removed successfully' });
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
