import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function GET({ url }) {
	try {
		const userId = url.searchParams.get('user_id');

		if (!userId) {
			return json({ error: 'User ID is required' }, { status: 400 });
		}

		const { data: pinned, error } = await supabase
			.from('chronomuse_pinned_dates')
			.select('id, date, title')
			.eq('user_id', userId)
			.order('date', { ascending: false });

		if (error) {
			return json({ error: 'Database error: ' + error.message }, { status: 500 });
		}

		// Map 'id' to 'pinned_id' to match client side expectations
		const mappedData = pinned.map(item => ({
			pinned_id: item.id,
			date: item.date,
			title: item.title
		}));

		return json({
			success: true,
			data: mappedData
		});
	} catch (err) {
		return json({ error: 'An error occurred: ' + err.message }, { status: 500 });
	}
}
