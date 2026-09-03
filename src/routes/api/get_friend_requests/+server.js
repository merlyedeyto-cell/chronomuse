import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id } = await request.json();

		if (!user_id) {
			return json({ error: 'User ID is required' }, { status: 400 });
		}

		// Get incoming pending requests (where receiver_id is user_id)
		const { data: requests, error: reqError } = await supabase
			.from('chronomuse_friend_requests')
			.select('id, sender_id, created_at')
			.eq('receiver_id', user_id)
			.eq('status', 'pending');

		if (reqError) {
			return json({ error: reqError.message }, { status: 500 });
		}

		// Get outgoing pending requests (where sender_id is user_id)
		const { data: sentRequests } = await supabase
			.from('chronomuse_friend_requests')
			.select('id, receiver_id, created_at')
			.eq('sender_id', user_id)
			.eq('status', 'pending');

		let formattedIncoming = [];
		if (requests && requests.length > 0) {
			const senderIds = requests.map(r => r.sender_id);
			const { data: senders } = await supabase
				.from('chronomuse_users')
				.select('id, username, email')
				.in('id', senderIds);

			formattedIncoming = requests.map(r => {
				const sender = senders?.find(s => s.id === r.sender_id);
				return {
					id: r.id,
					request_id: r.id,
					sender_id: r.sender_id,
					username: sender?.username || 'Unknown',
					email: sender?.email || '',
					created_at: r.created_at
				};
			});
		}

		let formattedSent = [];
		if (sentRequests && sentRequests.length > 0) {
			const receiverIds = sentRequests.map(r => r.receiver_id);
			const { data: receivers } = await supabase
				.from('chronomuse_users')
				.select('id, username, email')
				.in('id', receiverIds);

			formattedSent = sentRequests.map(r => {
				const receiver = receivers?.find(rec => rec.id === r.receiver_id);
				return {
					id: r.id,
					request_id: r.id,
					receiver_id: r.receiver_id,
					username: receiver?.username || 'Unknown',
					email: receiver?.email || '',
					created_at: r.created_at
				};
			});
		}

		return json({
			success: true,
			data: {
				requests: formattedIncoming,
				sent_requests: formattedSent
			}
		});
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
