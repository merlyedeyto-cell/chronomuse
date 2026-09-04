import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id, request_id, friend_id, receiver_id } = await request.json();

		if (!user_id) {
			return json({ error: 'User ID is required' }, { status: 400 });
		}

		let query = supabase.from('chronomuse_friend_requests').delete();

		if (request_id) {
			query = query.eq('id', request_id).eq('sender_id', user_id);
		} else if (friend_id || receiver_id) {
			const targetId = friend_id || receiver_id;
			query = query.eq('sender_id', user_id).eq('receiver_id', targetId).eq('status', 'pending');
		} else {
			return json({ error: 'Request ID or Friend ID is required' }, { status: 400 });
		}

		const { error } = await query;

		if (error) {
			return json({ error: error.message }, { status: 500 });
		}

		return json({ success: true, message: 'Friend request cancelled' });
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
