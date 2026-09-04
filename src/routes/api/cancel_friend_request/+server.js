import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id, request_id, friend_id, receiver_id } = await request.json();

		if (!user_id) {
			return json({ error: 'User ID is required' }, { status: 400 });
		}

		let targetRecipientId = friend_id || receiver_id;

		if (request_id && !targetRecipientId) {
			const { data: reqData } = await supabase
				.from('chronomuse_friend_requests')
				.select('receiver_id')
				.eq('id', request_id)
				.maybeSingle();
			if (reqData?.receiver_id) {
				targetRecipientId = reqData.receiver_id;
			}
		}

		let query = supabase.from('chronomuse_friend_requests').delete();

		if (request_id) {
			query = query.eq('id', request_id).eq('sender_id', user_id);
		} else if (targetRecipientId) {
			query = query.eq('sender_id', user_id).eq('receiver_id', targetRecipientId).eq('status', 'pending');
		} else {
			return json({ error: 'Request ID or Friend ID is required' }, { status: 400 });
		}

		const { error } = await query;

		if (error) {
			return json({ error: error.message }, { status: 500 });
		}

		if (targetRecipientId) {
			try {
				const channel = supabase.channel(`chronomuse_user_inbox_${targetRecipientId}`);
				channel.subscribe((status) => {
					if (status === 'SUBSCRIBED') {
						channel.send({
							type: 'broadcast',
							event: 'friend_change',
							payload: { sender_id: user_id, receiver_id: targetRecipientId, eventType: 'cancel_request' }
						});
					}
				});
				const globalChannel = supabase.channel('chronomuse_global_events');
				globalChannel.subscribe((status) => {
					if (status === 'SUBSCRIBED') {
						globalChannel.send({
							type: 'broadcast',
							event: 'global_friend_event',
							payload: { sender_id: user_id, target_id: targetRecipientId, eventType: 'cancel_request' }
						});
					}
				});
			} catch (e) {}
		}

		return json({ success: true, message: 'Friend request cancelled' });
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
