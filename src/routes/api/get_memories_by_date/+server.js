import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function GET({ url }) {
	try {
		const date = url.searchParams.get('date');
		const userId = url.searchParams.get('user_id');

		if (!date || !userId) {
			return json({ error: 'Date and User ID are required' }, { status: 400 });
		}

		const { data: memories, error } = await supabase
			.from('chronomuse_memories')
			.select('*')
			.eq('user_id', userId)
			.eq('date', date)
			.order('created_at', { ascending: true });

		if (error) {
			return json({ error: 'Database error: ' + error.message }, { status: 500 });
		}

		return json({
			success: true,
			data: memories
		});
	} catch (err) {
		return json({ error: 'An error occurred: ' + err.message }, { status: 500 });
	}
}
