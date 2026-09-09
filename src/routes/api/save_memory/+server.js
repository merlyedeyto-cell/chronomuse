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

		// Handle Photo / Video Upload
		if (photoVideoFile && photoVideoFile.size > 0) {
			const originalName = photoVideoFile.name || 'media.mp4';
			const fileExt = (originalName.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '');
			const fileName = `media_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt || 'mp4'}`;
			const filePath = `${userId}/${fileName}`;
			const mimeType = photoVideoFile.type || (fileExt === 'mp4' ? 'video/mp4' : fileExt === 'webm' ? 'video/webm' : 'image/jpeg');

			const { error: uploadError } = await supabase.storage
				.from('memories')
				.upload(filePath, photoVideoFile, { upsert: true, contentType: mimeType });

			if (uploadError) {
				return json({ error: 'Media upload failed: ' + uploadError.message + '. Please ensure your "memories" bucket exists and allows uploads.' }, { status: 500 });
			}

			const { data: urlData } = supabase.storage.from('memories').getPublicUrl(filePath);
			photoVideoUrl = urlData.publicUrl;
			photoVideoType = photoVideoFile.type || (fileExt === 'mp4' || fileExt === 'webm' || fileExt === 'mov' ? 'video/mp4' : 'image/jpeg');
		}

		// Handle Music Upload
		if (musicFile && musicFile.size > 0) {
			const rawName = musicFile.name || 'music.mp3';
			const lastDotIndex = rawName.lastIndexOf('.');
			const baseName = lastDotIndex !== -1 ? rawName.substring(0, lastDotIndex) : rawName;
			const fileExt = lastDotIndex !== -1 ? rawName.substring(lastDotIndex + 1) : 'mp3';
			
			// Clean base name for URL safety while preserving human readability
			const safeBaseName = baseName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_');
			const fileName = `${Date.now()}_${safeBaseName || 'music'}.${fileExt}`;
			const filePath = `${userId}/${fileName}`;

			const { error: uploadError } = await supabase.storage
				.from('memories')
				.upload(filePath, musicFile, { upsert: true });

			if (uploadError) {
				return json({ error: 'Music upload failed: ' + uploadError.message }, { status: 500 });
			}

			const { data: urlData } = supabase.storage.from('memories').getPublicUrl(filePath);
			musicUrl = urlData.publicUrl;
		}

		// Insert memory record with column fallback
		const insertPayload = {
			user_id: userId,
			date: date,
			title: title,
			description: description,
			mood_tag: moodTag,
			memory_tag: memoryTag,
			photo_video: photoVideoUrl,
			photo_video_type: photoVideoType,
			music: musicUrl
		};

		let { data: newMemory, error: insertError } = await supabase
			.from('chronomuse_memories')
			.insert([insertPayload])
			.select()
			.single();

		if (insertError) {
			// If photo_video_type column does not exist yet in table, fallback without it
			delete insertPayload.photo_video_type;
			const fallbackInsert = await supabase
				.from('chronomuse_memories')
				.insert([insertPayload])
				.select()
				.single();

			if (fallbackInsert.error) {
				return json({ error: 'Database insert error: ' + fallbackInsert.error.message }, { status: 500 });
			}
			newMemory = {
				...fallbackInsert.data,
				photo_video_type: photoVideoType
			};
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
