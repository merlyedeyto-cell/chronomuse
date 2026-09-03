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

		// Also fetch memories shared with this user
		let sharedMemoriesList = [];
		try {
			const { data: sharedRelations } = await supabase
				.from('chronomuse_shared_memories')
				.select('memory_id, sender_id')
				.eq('recipient_id', userId);

			if (sharedRelations && sharedRelations.length > 0) {
				const sharedMemoryIds = sharedRelations.map(sr => sr.memory_id);
				const { data: sharedMemories } = await supabase
					.from('chronomuse_memories')
					.select('*')
					.in('id', sharedMemoryIds)
					.gte('date', startDate)
					.lte('date', endDate);

				if (sharedMemories) {
					// Get usernames for senders
					const senderIds = sharedRelations.map(sr => sr.sender_id);
					const { data: senders } = await supabase
						.from('chronomuse_users')
						.select('id, username')
						.in('id', senderIds);

					sharedMemoriesList = sharedMemories.map(m => {
						const rel = sharedRelations.find(sr => sr.memory_id === m.id);
						const sender = senders?.find(s => s.id === rel?.sender_id);
						return {
							...m,
							is_shared: true,
							shared_by: sender?.username || 'a friend'
						};
					});
				}
			}
		} catch (e) {
			console.log('Shared memories fetch note:', e.message);
		}

		// Group memories by date string (YYYY-MM-DD)
		const groupedMemories = {};
		[...(memories || []), ...sharedMemoriesList].forEach(memory => {
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
