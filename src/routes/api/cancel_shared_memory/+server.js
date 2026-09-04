import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { share_id, user_id, memory_id, recipient_id } = await request.json();

		if (!user_id || (!share_id && !memory_id)) {
			return json({ error: 'User ID and Share ID (or Memory ID) are required' }, { status: 400 });
		}

		// 1. Find the share row(s) to verify ownership (user must be the sender)
		let query = supabase
			.from('chronomuse_shared_memories')
			.select('*')
			.eq('sender_id', user_id);

		if (share_id) {
			query = query.eq('id', share_id);
		} else {
			query = query.eq('memory_id', memory_id);
			if (recipient_id) {
				query = query.eq('recipient_id', recipient_id);
			}
		}

		const { data: shareRows, error: findError } = await query;
		if (findError || !shareRows || shareRows.length === 0) {
			return json({ error: 'Shared memory record not found or you are not authorized to cancel it.' }, { status: 404 });
		}

		// 2. Fetch sender username for cleaning up copied memories in recipient's calendar
		const { data: senderUser } = await supabase
			.from('chronomuse_users')
			.select('username')
			.eq('id', user_id)
			.single();

		const senderUsername = senderUser?.username || '';

		for (const row of shareRows) {
			// Delete from chronomuse_shared_memories
			await supabase
				.from('chronomuse_shared_memories')
				.delete()
				.eq('id', row.id);

			// Also delete any memory copied to recipient's calendar
			if (senderUsername && row.recipient_id) {
				const { data: origMem } = await supabase
					.from('chronomuse_memories')
					.select('date')
					.eq('id', row.memory_id)
					.single();

				if (origMem && origMem.date) {
					await supabase
						.from('chronomuse_memories')
						.delete()
						.eq('user_id', row.recipient_id)
						.eq('date', origMem.date)
						.ilike('description', `%Shared by @${senderUsername}%`);
				}
			}
		}

		return json({
			success: true,
			message: 'Shared memory cancelled and unshared successfully!'
		});
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
