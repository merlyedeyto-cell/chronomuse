import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { memory_id } = await request.json();

		if (!memory_id) {
			return json({ error: 'Memory ID is required' }, { status: 400 });
		}

		// 1. Fetch memory record first to check if there are files in storage
		const { data: memory, error: fetchError } = await supabase
			.from('chronomuse_memories')
			.select('photo_video, music')
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

		return json({
			success: true,
			message: 'Memory deleted successfully'
		});
	} catch (err) {
		return json({ error: 'An error occurred: ' + err.message }, { status: 500 });
	}
}
