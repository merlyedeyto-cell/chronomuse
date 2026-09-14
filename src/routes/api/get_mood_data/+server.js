import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function GET({ url }) {
	try {
		const userId = url.searchParams.get('user_id');
		const period = url.searchParams.get('period') || 'all';
		const moodOnly = url.searchParams.get('mood_only') === 'true';

		if (!userId) {
			return json({ error: 'User ID is required' }, { status: 400 });
		}

		let query = supabase
			.from('chronomuse_memories')
			.select('id, user_id, date, mood_tag, memory_tag, title, description, photo_video, photo_video_type, created_at')
			.eq('user_id', userId)
			.order('date', { ascending: false });

		if (moodOnly) {
			query = query.not('mood_tag', 'is', null).neq('mood_tag', '');
		}

		if (period !== 'all') {
			let days = 7;
			if (period === 'month') days = 30;
			else if (period === 'year') days = 365;

			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - days);
			const formattedCutoff = cutoffDate.toISOString().split('T')[0];

			query = query.gte('date', formattedCutoff);
		}

		const { data: memories, error } = await query;

		if (error) {
			return json({ error: 'Database error: ' + error.message }, { status: 500 });
		}

		return json({
			success: true,
			data: memories || []
		});
	} catch (err) {
		return json({ error: 'An error occurred: ' + err.message }, { status: 500 });
	}
}
