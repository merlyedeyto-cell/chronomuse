import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const body = await request.json();
		const currentUserId = body.user_id || body.sender_id;
		const requestId = body.request_id;
		let targetRecipientId = body.friend_id || body.receiver_id || body.target_id;
		const friendUsername = body.friend_username ? String(body.friend_username).trim().replace(/^@/, '') : null;

		if (!currentUserId) {
			return json({ error: 'User ID is required' }, { status: 400 });
		}

		if (!targetRecipientId && friendUsername) {
			const { data: uData } = await supabase
				.from('chronomuse_users')
				.select('id')
				.ilike('username', friendUsername)
				.maybeSingle();
			if (uData?.id) {
				targetRecipientId = uData.id;
			}
		}

		if (requestId && !targetRecipientId) {
			const { data: reqData } = await supabase
				.from('chronomuse_friend_requests')
				.select('receiver_id, sender_id')
				.eq('id', requestId)
				.maybeSingle();
			if (reqData?.receiver_id) {
				targetRecipientId = reqData.receiver_id;
			}
		}

		if (!requestId && !targetRecipientId) {
			return json({ error: 'Request ID or Friend ID is required' }, { status: 400 });
		}

		let query = supabase.from('chronomuse_friend_requests').delete();

		if (requestId) {
			query = query.eq('id', requestId);
		} else if (targetRecipientId) {
			query = query
				.or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${targetRecipientId}),and(sender_id.eq.${targetRecipientId},receiver_id.eq.${currentUserId})`)
				.eq('status', 'pending');
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
