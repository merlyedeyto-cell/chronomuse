import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { date, user_id, isPinned } = await request.json();

		if (!date || !user_id) {
			return json({ error: 'Date and User ID are required' }, { status: 400 });
		}

		if (isPinned) {
			// Date is currently pinned, so we UNPIN it (delete from database)
			const { error } = await supabase
				.from('chronomuse_pinned_dates')
				.delete()
				.eq('user_id', user_id)
				.eq('date', date);

			if (error) {
				return json({ error: 'Database delete error: ' + error.message }, { status: 500 });
			}

			return json({
				success: true,
				message: 'Date unpinned successfully'
			});
		} else {
			// Date is not pinned, so we PIN it (insert into database)
			const { error } = await supabase
				.from('chronomuse_pinned_dates')
				.insert([
					{
						user_id: user_id,
						date: date,
						title: 'Pinned Date'
					}
				]);

			if (error) {
				return json({ error: 'Database insert error: ' + error.message }, { status: 500 });
			}

			return json({
				success: true,
				message: 'Date pinned successfully'
			});
		}
	} catch (err) {
		return json({ error: 'An error occurred: ' + err.message }, { status: 500 });
	}
}
