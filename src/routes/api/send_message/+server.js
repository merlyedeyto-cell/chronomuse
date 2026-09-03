import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id, friend_id, message } = await request.json();

		if (!user_id || !friend_id || !message || !message.trim()) {
			return json({ error: 'User ID, Friend ID, and non-empty message are required' }, { status: 400 });
		}

		const { data: newMessage, error } = await supabase
			.from('chronomuse_messages')
			.insert([
				{
					sender_id: user_id,
					receiver_id: friend_id,
					message: message.trim(),
					is_read: false
				}
			])
			.select()
			.single();

		if (error) {
			return json({ error: error.message }, { status: 500 });
		}

		return json({ success: true, data: newMessage });
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
