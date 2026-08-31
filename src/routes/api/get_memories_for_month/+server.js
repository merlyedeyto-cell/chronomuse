import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function GET({ url }) {
	try {
		const year = url.searchParams.get('year');
		const month = url.searchParams.get('month');
		const userId = url.searchParams.get('user_id');

		if (!year || !month || !userId) {
			return json({ error: 'Year, Month, and User ID are required' }, { status: 400 });
		}

		// Calculate start and end date for filtering
		const formattedMonth = String(month).padStart(2, '0');
		const startDate = `${year}-${formattedMonth}-01`;
		const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
		const endDate = `${year}-${formattedMonth}-${String(lastDay).padStart(2, '0')}`;

		const { data: memories, error } = await supabase
			.from('chronomuse_memories')
			.select('*')
			.eq('user_id', userId)
			.gte('date', startDate)
			.lte('date', endDate)
			.order('created_at', { ascending: true });

		if (error) {
			return json({ error: 'Database error: ' + error.message }, { status: 500 });
		}

		// Group memories by date string (YYYY-MM-DD)
		const groupedMemories = {};
		memories.forEach(memory => {
			const dateStr = memory.date;
			if (!groupedMemories[dateStr]) {
				groupedMemories[dateStr] = [];
			}
			groupedMemories[dateStr].push(memory);
		});

		return json({
			success: true,
			data: groupedMemories
		});
	} catch (err) {
		return json({ error: 'An error occurred: ' + err.message }, { status: 500 });
	}
}
