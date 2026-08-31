import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { pinned_id, user_id } = await request.json();

		if (!pinned_id || !user_id) {
			return json({ error: 'Pinned ID and User ID are required' }, { status: 400 });
		}

		const { error } = await supabase
			.from('chronomuse_pinned_dates')
			.delete()
			.eq('id', pinned_id)
			.eq('user_id', user_id);

		if (error) {
			return json({ error: 'Database delete error: ' + error.message }, { status: 500 });
		}

		return json({
			success: true,
			message: 'Pinned date deleted successfully'
		});
	} catch (err) {
		return json({ error: 'An error occurred: ' + err.message }, { status: 500 });
	}
}
