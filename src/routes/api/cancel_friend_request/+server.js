import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id, request_id } = await request.json();

		if (!user_id || !request_id) {
			return json({ error: 'User ID and Request ID are required' }, { status: 400 });
		}

		const { error } = await supabase
			.from('chronomuse_friend_requests')
			.delete()
			.eq('id', request_id)
			.eq('sender_id', user_id);

		if (error) {
			return json({ error: error.message }, { status: 500 });
		}

		return json({ success: true, message: 'Friend request cancelled' });
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
