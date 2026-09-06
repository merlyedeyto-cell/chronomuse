import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id, friend_id, message } = await request.json();

		if (!user_id || !friend_id || !message || !message.trim()) {
			return json({ error: 'User ID, Friend ID, and non-empty message are required' }, { status: 400 });
		}

		if (String(user_id) === String(friend_id)) {
			return json({ error: 'You cannot send messages to yourself' }, { status: 400 });
		}

		// Check if either user has blocked the other
		try {
			const { data: blockedRows } = await supabase
				.from('chronomuse_blocked_users')
				.select('id')
				.or(`and(blocker_id.eq.${user_id},blocked_id.eq.${friend_id}),and(blocker_id.eq.${friend_id},blocked_id.eq.${user_id})`);

			if (blockedRows && blockedRows.length > 0) {
				return json({ error: 'Messaging is unavailable because one of the accounts has blocked the other.' }, { status: 403 });
			}
		} catch (bErr) {}

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

		// Update sender's last activity timestamp
		await supabase
			.from('chronomuse_users')
			.update({ last_activity: new Date().toISOString() })
			.eq('id', user_id);

		// Real-time broadcast directly to recipient inbox and conversation channel
		try {
			const recipientInbox = supabase.channel(`chronomuse_user_inbox_${friend_id}`);
			recipientInbox.subscribe((status) => {
				if (status === 'SUBSCRIBED') {
					recipientInbox.send({
						type: 'broadcast',
						event: 'new_message',
						payload: newMessage
					});
				}
			});

			const id1 = Number(user_id);
			const id2 = Number(friend_id);
			const chatChan = supabase.channel(`chat_presence_${Math.min(id1, id2)}_${Math.max(id1, id2)}`);
			chatChan.subscribe((status) => {
				if (status === 'SUBSCRIBED') {
					chatChan.send({
						type: 'broadcast',
						event: 'direct_message',
						payload: newMessage
					});
				}
			});
		} catch (e) {}

		return json({ success: true, data: newMessage });
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
