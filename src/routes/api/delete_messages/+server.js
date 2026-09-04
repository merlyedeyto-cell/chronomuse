import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id, message_ids } = await request.json();

		if (!user_id || !message_ids || !Array.isArray(message_ids) || message_ids.length === 0) {
			return json({ error: 'User ID and array of message IDs are required' }, { status: 400 });
		}

		// Delete messages where sender is this user (unsend for everyone)
		const { error } = await supabase
			.from('chronomuse_messages')
			.delete()
			.in('id', message_ids)
			.eq('sender_id', user_id);

		if (error) {
			return json({ error: error.message }, { status: 500 });
		}

		// Broadcast unsend event
		try {
			const globalChannel = supabase.channel('chronomuse_global_events');
			globalChannel.subscribe((status) => {
				if (status === 'SUBSCRIBED') {
					globalChannel.send({
						type: 'broadcast',
						event: 'global_message_unsend',
						payload: { sender_id: user_id, message_ids }
					});
				}
			});
		} catch (e) {}

		return json({ success: true, message: 'Messages deleted successfully' });
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
