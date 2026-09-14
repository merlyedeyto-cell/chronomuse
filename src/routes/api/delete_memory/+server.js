import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { memory_id } = await request.json();

		if (!memory_id) {
			return json({ error: 'Memory ID is required' }, { status: 400 });
		}

		// 1. Fetch memory record first to get date, user_id, and files in storage
		const { data: memory, error: fetchError } = await supabase
			.from('chronomuse_memories')
			.select('id, user_id, date, photo_video, music')
			.eq('id', memory_id)
			.maybeSingle();

		if (fetchError) {
			return json({ error: 'Database fetch error: ' + fetchError.message }, { status: 500 });
		}

		// Helper to extract file path from public URL and delete from storage
		const deleteFileFromStorage = async (publicUrl) => {
			if (!publicUrl) return;
			const bucketFolder = 'storage/v1/object/public/memories/';
			const index = publicUrl.indexOf(bucketFolder);
			if (index !== -1) {
				const filePath = publicUrl.substring(index + bucketFolder.length);
				await supabase.storage.from('memories').remove([filePath]);
			}
		};

		if (memory) {
			// Delete files if present
			await deleteFileFromStorage(memory.photo_video);
			await deleteFileFromStorage(memory.music);
		}

		// 2. Delete the record from the database
		const { error: deleteError } = await supabase
			.from('chronomuse_memories')
			.delete()
			.eq('id', memory_id);

		if (deleteError) {
			return json({ error: 'Database delete error: ' + deleteError.message }, { status: 500 });
		}

		// 3. Clean up associated pinned records & shared memory records
		if (memory) {
			// Check if there are any remaining memories for this user on this date
			const { data: remainingMemories } = await supabase
				.from('chronomuse_memories')
				.select('id')
				.eq('user_id', memory.user_id)
				.eq('date', memory.date)
				.limit(1);

			// If no remaining memories on this date, automatically delete the pinned date
			if (!remainingMemories || remainingMemories.length === 0) {
				await supabase
					.from('chronomuse_pinned_dates')
					.delete()
					.eq('user_id', memory.user_id)
					.eq('date', memory.date);
			}

			// Clean up pinned_memories table if present
			await supabase
				.from('chronomuse_pinned_memories')
				.delete()
				.eq('memory_id', memory_id);

			// Clean up shared_memories table
			await supabase
				.from('chronomuse_shared_memories')
				.delete()
				.eq('memory_id', memory_id);

		}

		return json({
			success: true,
			message: 'Memory deleted successfully'
		});
	} catch (err) {
		return json({ error: 'An error occurred: ' + err.message }, { status: 500 });
	}
}
