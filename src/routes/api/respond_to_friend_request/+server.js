import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id, request_id, action } = await request.json();

		if (!user_id || !request_id || !action) {
			return json({ error: 'User ID, Request ID, and Action are required' }, { status: 400 });
		}

		// Find the request
		const { data: friendReq, error: fetchErr } = await supabase
			.from('chronomuse_friend_requests')
			.select('*')
			.eq('id', request_id)
			.eq('receiver_id', user_id)
			.maybeSingle();

		if (fetchErr || !friendReq) {
			return json({ error: 'Friend request not found' }, { status: 404 });
		}

		if (action === 'accept') {
			// Update request status and add mutual friendships in parallel
			await Promise.all([
				supabase
					.from('chronomuse_friend_requests')
					.update({ status: 'accepted' })
					.eq('id', request_id),
				supabase
					.from('chronomuse_friends')
					.upsert([
						{ user_id: friendReq.receiver_id, friend_id: friendReq.sender_id },
						{ user_id: friendReq.sender_id, friend_id: friendReq.receiver_id }
					], { onConflict: 'user_id,friend_id' })
			]);

			return json({ success: true, message: 'Friend request accepted!' });
		} else if (action === 'decline') {
			// Cleanly remove from database so declined requests do not pile up in pending
			await supabase
				.from('chronomuse_friend_requests')
				.delete()
				.eq('id', request_id);

			return json({ success: true, message: 'Friend request declined' });
		} else {
			return json({ error: 'Invalid action' }, { status: 400 });
		}
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
