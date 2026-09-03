import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id, friend_id } = await request.json();

		if (!user_id || !friend_id) {
			return json({ error: 'User ID and Friend ID are required' }, { status: 400 });
		}

		// Fetch messages between user and friend
		const { data: messages, error } = await supabase
			.from('chronomuse_messages')
			.select('*')
			.or(`and(sender_id.eq.${user_id},receiver_id.eq.${friend_id}),and(sender_id.eq.${friend_id},receiver_id.eq.${user_id})`)
			.order('created_at', { ascending: true });

		if (error) {
			return json({ error: error.message }, { status: 500 });
		}

		// Mark incoming messages as read
		await supabase
			.from('chronomuse_messages')
			.update({ is_read: true })
			.eq('sender_id', friend_id)
			.eq('receiver_id', user_id)
			.eq('is_read', false);

		return json({ success: true, data: { messages: messages || [] } });
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
