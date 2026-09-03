import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { memory_id, sender_id, recipient_ids } = await request.json();

		if (!memory_id || !sender_id || !recipient_ids || !Array.isArray(recipient_ids)) {
			return json({ error: 'Memory ID, Sender ID, and Array of Recipient IDs are required' }, { status: 400 });
		}

		if (recipient_ids.length === 0) {
			return json({ success: true, message: 'No recipients specified' });
		}

		const rowsToInsert = recipient_ids.map(recipient_id => ({
			memory_id,
			sender_id,
			recipient_id
		}));

		const { error } = await supabase
			.from('chronomuse_shared_memories')
			.upsert(rowsToInsert, { onConflict: 'memory_id,recipient_id' });

		if (error) {
			return json({ error: error.message }, { status: 500 });
		}

		return json({ success: true, message: 'Memory shared successfully with tagged friends!' });
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
