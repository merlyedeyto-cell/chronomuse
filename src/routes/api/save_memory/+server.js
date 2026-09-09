import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const contentType = request.headers.get('content-type') || '';
		let userId, date, title, description, moodTag, memoryTag;
		let photoVideoUrl = null;
		let photoVideoType = null;
		let musicUrl = null;

		if (contentType.includes('application/json')) {
			const body = await request.json();
			userId = body.user_id;
			date = body.date;
			title = body.title || 'Untitled Memory';
			description = body.description || '';
			moodTag = body.mood_tag || '';
			memoryTag = body.memory_tag || '';
			photoVideoUrl = body.photo_video || null;
			photoVideoType = body.photo_video_type || null;
			musicUrl = body.music || null;
		} else {
			const formData = await request.formData();
			userId = formData.get('user_id');
			date = formData.get('date');
			title = formData.get('title') || 'Untitled Memory';
			description = formData.get('description') || '';
			moodTag = formData.get('mood_tag') || '';
			memoryTag = formData.get('memory_tag') || '';
			
			const photoVideoFile = formData.get('photo_video');
			const musicFile = formData.get('music');

			// If photoVideo is already a URL string in formData
			if (typeof photoVideoFile === 'string' && photoVideoFile) {
				photoVideoUrl = photoVideoFile;
				photoVideoType = formData.get('photo_video_type') || null;
			} else if (photoVideoFile && typeof photoVideoFile === 'object' && photoVideoFile.size > 0) {
				const originalName = photoVideoFile.name || 'media.mp4';
				const fileExt = (originalName.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '');
				const fileName = `media_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt || 'mp4'}`;
				const filePath = `${userId}/${fileName}`;
				const mimeType = photoVideoFile.type || (fileExt === 'mp4' ? 'video/mp4' : fileExt === 'webm' ? 'video/webm' : 'image/jpeg');

				// Convert file to Buffer for robust Node.js upload
				const arrayBuffer = await photoVideoFile.arrayBuffer();
				const fileBuffer = Buffer.from(arrayBuffer);

				const { error: uploadError } = await supabase.storage
					.from('memories')
					.upload(filePath, fileBuffer, { upsert: true, contentType: mimeType });

				if (uploadError) {
					console.error('Save memory media upload error:', uploadError);
					return json({ error: 'Media upload failed: ' + uploadError.message }, { status: 500 });
				}

				const { data: urlData } = supabase.storage.from('memories').getPublicUrl(filePath);
				photoVideoUrl = urlData.publicUrl;
				photoVideoType = mimeType;
			}

			// If music is already a URL string in formData
			if (typeof musicFile === 'string' && musicFile) {
				musicUrl = musicFile;
			} else if (musicFile && typeof musicFile === 'object' && musicFile.size > 0) {
				const rawName = musicFile.name || 'music.mp3';
				const lastDotIndex = rawName.lastIndexOf('.');
				const baseName = lastDotIndex !== -1 ? rawName.substring(0, lastDotIndex) : rawName;
				const fileExt = lastDotIndex !== -1 ? rawName.substring(lastDotIndex + 1) : 'mp3';
				const safeBaseName = baseName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_');
				const fileName = `${Date.now()}_${safeBaseName || 'music'}.${fileExt}`;
				const filePath = `${userId}/${fileName}`;

				const arrayBuffer = await musicFile.arrayBuffer();
				const fileBuffer = Buffer.from(arrayBuffer);

				const { error: uploadError } = await supabase.storage
					.from('memories')
					.upload(filePath, fileBuffer, { upsert: true });

				if (uploadError) {
					console.error('Save memory music upload error:', uploadError);
					return json({ error: 'Music upload failed: ' + uploadError.message }, { status: 500 });
				}

				const { data: urlData } = supabase.storage.from('memories').getPublicUrl(filePath);
				musicUrl = urlData.publicUrl;
			}
		}

		if (!userId || !date) {
			return json({ error: 'User ID and Date are required' }, { status: 400 });
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
			console.warn('Initial memory insert failed, retrying without photo_video_type column:', insertError.message);
			delete insertPayload.photo_video_type;
			const fallbackInsert = await supabase
				.from('chronomuse_memories')
				.insert([insertPayload])
				.select()
				.single();

			if (fallbackInsert.error) {
				console.error('Save memory DB insert error:', fallbackInsert.error);
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
		console.error('Save memory error:', err);
		return json({ error: 'An error occurred: ' + err.message }, { status: 500 });
	}
}
