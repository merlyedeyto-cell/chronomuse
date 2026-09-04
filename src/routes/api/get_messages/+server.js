import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id, friend_id, limit = 20, before_id = null } = await request.json();

		if (!user_id || !friend_id) {
			return json({ error: 'User ID and Friend ID are required' }, { status: 400 });
		}

		const queryLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

		let query = supabase
			.from('chronomuse_messages')
			.select('*')
			.or(`and(sender_id.eq.${user_id},receiver_id.eq.${friend_id}),and(sender_id.eq.${friend_id},receiver_id.eq.${user_id})`);

		if (before_id) {
			query = query.lt('id', before_id);
		}

		const { data: messages, error } = await query
			.order('created_at', { ascending: false })
			.limit(queryLimit);

		if (error) {
			return json({ error: error.message }, { status: 500 });
		}

		const sortedMessages = (messages || []).reverse();
		const has_more = (messages || []).length === queryLimit;

		// Mark incoming messages as read
		await supabase
			.from('chronomuse_messages')
			.update({ is_read: true })
			.eq('sender_id', friend_id)
			.eq('receiver_id', user_id)
			.eq('is_read', false);

		return json({
			success: true,
			data: {
				messages: sortedMessages,
				has_more
			}
		});
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
