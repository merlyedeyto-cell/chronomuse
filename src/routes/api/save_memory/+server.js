import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const formData = await request.formData();
		
		const userId = formData.get('user_id');
		const date = formData.get('date');
		const title = formData.get('title') || 'Untitled Memory';
		const description = formData.get('description') || '';
		const moodTag = formData.get('mood_tag') || '';
		const memoryTag = formData.get('memory_tag') || '';
		
		const photoVideoFile = formData.get('photo_video');
		const musicFile = formData.get('music');

		if (!userId || !date) {
			return json({ error: 'User ID and Date are required' }, { status: 400 });
		}

		let photoVideoUrl = null;
		let photoVideoType = null;
		let musicUrl = null;

		// Handle Photo Upload
		if (photoVideoFile && photoVideoFile.size > 0) {
			const fileExt = photoVideoFile.name.split('.').pop();
			const fileName = `photo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
			const filePath = `${userId}/${fileName}`;

			const { error: uploadError } = await supabase.storage
				.from('memories')
				.upload(filePath, photoVideoFile);

			if (uploadError) {
				return json({ error: 'Photo upload failed: ' + uploadError.message + '. Please ensure a public storage bucket named "memories" exists in your Supabase project.' }, { status: 500 });
			}

			const { data: urlData } = supabase.storage.from('memories').getPublicUrl(filePath);
			photoVideoUrl = urlData.publicUrl;
			photoVideoType = photoVideoFile.type;
		}

		// Handle Music Upload
		if (musicFile && musicFile.size > 0) {
			const rawName = musicFile.name;
			const lastDotIndex = rawName.lastIndexOf('.');
			const baseName = lastDotIndex !== -1 ? rawName.substring(0, lastDotIndex) : rawName;
			const fileExt = lastDotIndex !== -1 ? rawName.substring(lastDotIndex + 1) : 'mp3';
			
			// Clean base name for URL safety while preserving human readability
			const safeBaseName = baseName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_');
			const fileName = `${Date.now()}_${safeBaseName || 'music'}.${fileExt}`;
			const filePath = `${userId}/${fileName}`;

			const { error: uploadError } = await supabase.storage
				.from('memories')
				.upload(filePath, musicFile);

			if (uploadError) {
				return json({ error: 'Music upload failed: ' + uploadError.message + '. Please ensure your "memories" bucket allows audio files (audio/*) and the file is under the size limit.' }, { status: 500 });
			}

			const { data: urlData } = supabase.storage.from('memories').getPublicUrl(filePath);
			musicUrl = urlData.publicUrl;
		}

		// Insert memory record
		const { data: newMemory, error: insertError } = await supabase
			.from('chronomuse_memories')
			.insert([
				{
					user_id: userId,
					date: date,
					title: title,
					description: description,
					mood_tag: moodTag,
					memory_tag: memoryTag,
					photo_video: photoVideoUrl,
					photo_video_type: photoVideoType,
					music: musicUrl
				}
			])
			.select()
			.single();

		if (insertError) {
			return json({ error: 'Database insert error: ' + insertError.message }, { status: 500 });
		}

		return json({
			success: true,
			data: newMemory,
			message: 'Memory saved successfully'
		});
	} catch (err) {
		return json({ error: 'An error occurred: ' + err.message }, { status: 500 });
	}
}
