import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id } = await request.json();

		if (!user_id) {
			return json({ error: 'User ID is required' }, { status: 400 });
		}

		// Count incoming pending requests
		const { count: incomingCount, error: incError } = await supabase
			.from('chronomuse_friend_requests')
			.select('*', { count: 'exact', head: true })
			.eq('receiver_id', user_id)
			.eq('status', 'pending');

		if (incError) {
			return json({ error: incError.message }, { status: 500 });
		}

		// Count sent pending requests
		const { count: sentCount, error: sentError } = await supabase
			.from('chronomuse_friend_requests')
			.select('*', { count: 'exact', head: true })
			.eq('sender_id', user_id)
			.eq('status', 'pending');

		const totalPending = (incomingCount || 0) + (sentCount || 0);

		return json({
			success: true,
			data: {
				pending_count: totalPending,
				incoming_count: incomingCount || 0,
				sent_count: sentCount || 0
			}
		});
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
