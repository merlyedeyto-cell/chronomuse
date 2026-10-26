import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const body = await request.json();
		const singleId = body.memory_id;
		const memoryIds = Array.isArray(body.memory_ids) ? body.memory_ids.map(Number).filter(Boolean) : (singleId ? [Number(singleId)] : []);
		const dates = Array.isArray(body.dates) ? body.dates : (body.date ? [body.date] : []);
		const userId = body.user_id ? Number(body.user_id) : null;

		if (memoryIds.length === 0 && (dates.length === 0 || !userId)) {
			return json({ error: 'Memory ID(s) or Date(s) with User ID are required' }, { status: 400 });
		}

		// 1. Fetch memories to delete to get their file paths and dates
		let query = supabase.from('chronomuse_memories').select('id, user_id, date, photo_video, music');
		if (userId) {
			query = query.eq('user_id', userId);
		}
		if (memoryIds.length > 0) {
			query = query.in('id', memoryIds);
		} else if (dates.length > 0) {
			query = query.in('date', dates);
		}

		const { data: memories, error: fetchError } = await query;

		if (fetchError) {
			return json({ error: 'Database fetch error: ' + fetchError.message }, { status: 500 });
		}

		if (!memories || memories.length === 0) {
			return json({ success: true, message: 'No memories to delete', deleted_count: 0 });
		}

		const foundIds = memories.map(m => m.id);
		const affectedUserDates = new Map();
		memories.forEach(m => {
			affectedUserDates.set(`${m.user_id}_${m.date}`, { user_id: m.user_id, date: m.date });
		});

		// Helper to extract file path from public URL and delete from storage
		const deleteFileFromStorage = async (publicUrl) => {
			if (!publicUrl) return;
			const bucketFolder = 'storage/v1/object/public/memories/';
			const index = publicUrl.indexOf(bucketFolder);
			if (index !== -1) {
				const filePath = publicUrl.substring(index + bucketFolder.length);
				try {
					await supabase.storage.from('memories').remove([filePath]);
				} catch (e) {
					console.error('Storage deletion warning:', e);
				}
			}
		};

		// Delete storage files in parallel
		await Promise.all(
			memories.flatMap(m => [
				deleteFileFromStorage(m.photo_video),
				deleteFileFromStorage(m.music)
			])
		);

		// 2. Delete the records from chronomuse_memories
		const { error: deleteError } = await supabase
			.from('chronomuse_memories')
			.delete()
			.in('id', foundIds);

		if (deleteError) {
			return json({ error: 'Database delete error: ' + deleteError.message }, { status: 500 });
		}

		// 3. Clean up associated pinned_memories & shared_memories
		await Promise.all([
			supabase.from('chronomuse_pinned_memories').delete().in('memory_id', foundIds),
			supabase.from('chronomuse_shared_memories').delete().in('memory_id', foundIds)
		]);

		// 4. Clean up chronomuse_pinned_dates if no remaining memories on those dates
		for (const { user_id, date } of affectedUserDates.values()) {
			const { data: remaining } = await supabase
				.from('chronomuse_memories')
				.select('id')
				.eq('user_id', user_id)
				.eq('date', date)
				.limit(1);

			if (!remaining || remaining.length === 0) {
				await supabase
					.from('chronomuse_pinned_dates')
					.delete()
					.eq('user_id', user_id)
					.eq('date', date);
			}
		}

		return json({
			success: true,
			message: `${foundIds.length} memory/memories deleted successfully`,
			deleted_count: foundIds.length,
			deleted_ids: foundIds
		});
	} catch (err) {
		return json({ error: 'An error occurred: ' + err.message }, { status: 500 });
	}
}
