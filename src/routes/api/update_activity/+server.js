import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { user_id, is_active = true } = await request.json();

		if (!user_id) {
			return json({ error: 'User ID is required' }, { status: 400 });
		}

		// Update user's last_activity timestamp & show_active_status in database
		const { error } = await supabase
			.from('chronomuse_users')
			.update({
				last_activity: is_active ? new Date().toISOString() : null,
				show_active_status: Boolean(is_active)
			})
			.eq('id', user_id);

		if (error) {
			// Fallback if show_active_status column has not been added in Supabase yet
			await supabase
				.from('chronomuse_users')
				.update({
					last_activity: is_active ? new Date().toISOString() : null
				})
				.eq('id', user_id);
		}

		return json({ success: true });
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
