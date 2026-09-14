import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { pinned_id, title, user_id } = await request.json();

		if (!pinned_id || !title) {
			return json({ error: 'Pinned ID and Title are required' }, { status: 400 });
		}

		let query = supabase
			.from('chronomuse_pinned_dates')
			.update({ title: title })
			.eq('id', pinned_id);

		if (user_id) {
			query = query.eq('user_id', user_id);
		}

		const { error } = await query;

		if (error) {
			return json({ error: 'Database update error: ' + error.message }, { status: 500 });
		}

		return json({
			success: true,
			message: 'Pinned date title updated successfully'
		});
	} catch (err) {
		return json({ error: 'An error occurred: ' + err.message }, { status: 500 });
	}
}
