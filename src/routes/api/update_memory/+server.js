import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const contentType = request.headers.get('content-type') || '';
		let memoryId;
		let updateData = {};

		if (contentType.includes('multipart/form-data')) {
			const formData = await request.formData();
			memoryId = formData.get('memory_id');
			const userId = formData.get('user_id');
			
			if (formData.has('description')) updateData.description = formData.get('description');
			if (formData.has('mood_tag')) updateData.mood_tag = formData.get('mood_tag');
			if (formData.has('memory_tag')) updateData.memory_tag = formData.get('memory_tag');
			if (formData.has('title')) updateData.title = formData.get('title');

			const photoVideoFile = formData.get('photo_video');
			const musicFile = formData.get('music');

			// If new files are uploaded, delete the old ones first if needed, then upload new
			if ((photoVideoFile && photoVideoFile.size > 0) || (musicFile && musicFile.size > 0)) {
				// Fetch existing memory to check old file URLs and user_id fallback
				const { data: existingMemory } = await supabase
					.from('chronomuse_memories')
					.select('user_id, photo_video, music')
					.eq('id', memoryId)
					.maybeSingle();

				const targetUserId = userId || existingMemory?.user_id || 'unknown';

				const deleteFileFromStorage = async (publicUrl) => {
					if (!publicUrl) return;
					const bucketFolder = 'storage/v1/object/public/memories/';
					const index = publicUrl.indexOf(bucketFolder);
					if (index !== -1) {
						const filePath = publicUrl.substring(index + bucketFolder.length);
						await supabase.storage.from('memories').remove([filePath]);
					}
				};

				// Handle New Photo / Video Upload
				if (photoVideoFile && photoVideoFile.size > 0) {
					if (existingMemory) await deleteFileFromStorage(existingMemory.photo_video);

					const fileExt = ((photoVideoFile.name || 'photo.webp').split('.').pop() || 'webp').toLowerCase().replace(/[^a-z0-9]/g, '');
					const fileName = `photo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt || 'webp'}`;
					const filePath = `${targetUserId}/${fileName}`;
					const mimeType = photoVideoFile.type || (fileExt === 'mp4' ? 'video/mp4' : fileExt === 'webm' ? 'video/webm' : fileExt === 'webp' ? 'image/webp' : 'image/jpeg');

					const arrayBuffer = await photoVideoFile.arrayBuffer();
					const fileBuffer = Buffer.from(arrayBuffer);

					const { error: uploadError } = await supabase.storage
						.from('memories')
						.upload(filePath, fileBuffer, { upsert: true, contentType: mimeType });

					if (uploadError) {
						return json({ error: 'Photo upload failed: ' + uploadError.message }, { status: 500 });
					}

					const { data: urlData } = supabase.storage.from('memories').getPublicUrl(filePath);
					updateData.photo_video = urlData.publicUrl;
					updateData.photo_video_type = mimeType;
				}

				// Handle New Music Upload
				if (musicFile && musicFile.size > 0) {
					if (existingMemory) await deleteFileFromStorage(existingMemory.music);

					const rawName = musicFile.name || 'music.mp3';
					const lastDotIndex = rawName.lastIndexOf('.');
					const baseName = lastDotIndex !== -1 ? rawName.substring(0, lastDotIndex) : rawName;
					const fileExt = lastDotIndex !== -1 ? rawName.substring(lastDotIndex + 1) : 'mp3';
					
					// Clean base name for URL safety while preserving human readability
					const safeBaseName = baseName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_');
					const fileName = `${Date.now()}_${safeBaseName || 'music'}.${fileExt}`;
					const filePath = `${targetUserId}/${fileName}`;
					const mimeType = musicFile.type || (fileExt === 'mp3' ? 'audio/mpeg' : fileExt === 'm4a' ? 'audio/mp4' : fileExt === 'wav' ? 'audio/wav' : 'audio/mpeg');

					const arrayBuffer = await musicFile.arrayBuffer();
					const fileBuffer = Buffer.from(arrayBuffer);

					const { error: uploadError } = await supabase.storage
						.from('memories')
						.upload(filePath, fileBuffer, { upsert: true, contentType: mimeType });

					if (uploadError) {
						return json({ error: 'Music upload failed: ' + uploadError.message + '. Please ensure your "memories" bucket allows audio files (audio/*) and the file is under the size limit.' }, { status: 500 });
					}

					const { data: urlData } = supabase.storage.from('memories').getPublicUrl(filePath);
					updateData.music = urlData.publicUrl;
				}
			}
		} else {
			// Handle JSON update
			const body = await request.json();
			memoryId = body.memory_id;
			
			if (body.description !== undefined) updateData.description = body.description;
			if (body.mood_tag !== undefined) updateData.mood_tag = body.mood_tag;
			if (body.memory_tag !== undefined) updateData.memory_tag = body.memory_tag;
			if (body.title !== undefined) updateData.title = body.title;
		}

		if (!memoryId) {
			return json({ error: 'Memory ID is required' }, { status: 400 });
		}

		// Update database
		const { data: updatedMemory, error } = await supabase
			.from('chronomuse_memories')
			.update(updateData)
			.eq('id', memoryId)
			.select()
			.single();

		if (error) {
			return json({ error: 'Database update error: ' + error.message }, { status: 500 });
		}

		// Fetch shared recipients to notify them
		const { data: sharedRows } = await supabase
			.from('chronomuse_shared_memories')
			.select('recipient_id')
			.eq('memory_id', memoryId);
			
		const sharedWith = sharedRows ? sharedRows.map(r => r.recipient_id) : [];

		if (sharedWith.length > 0) {
			const { data: owner } = await supabase.from('chronomuse_users').select('username').eq('id', updatedMemory.user_id).single();
			const ownerUsername = owner ? owner.username : '';

			for (const recipientId of sharedWith) {
				// 1. Try matching recipient memories by Shared by tag
				let { data: recipientCopies } = await supabase
					.from('chronomuse_memories')
					.select('id, description')
					.eq('user_id', recipientId)
					.eq('date', updatedMemory.date)
					.ilike('description', '%Shared by%');

				// 2. Fallback to all recipient memories on that date
				if (!recipientCopies || recipientCopies.length === 0) {
					const { data: dateCopies } = await supabase
						.from('chronomuse_memories')
						.select('id, description')
						.eq('user_id', recipientId)
						.eq('date', updatedMemory.date);
					recipientCopies = dateCopies || [];
				}

				if (recipientCopies && recipientCopies.length > 0) {
					for (const copyRecord of recipientCopies) {
						let copyUpdateData = { ...updateData };
						if (copyUpdateData.description !== undefined) {
							const tagText = ownerUsername ? `(Shared by @${ownerUsername})` : '(Shared Memory)';
							const baseDesc = copyUpdateData.description
								? copyUpdateData.description.replace(/\(Shared by @[^)]+\)/gi, '').trim()
								: '';
							copyUpdateData.description = baseDesc ? `${baseDesc}\n\n${tagText}` : tagText;
						}

						await supabase
							.from('chronomuse_memories')
							.update(copyUpdateData)
							.eq('id', copyRecord.id);
					}
				}
			}
		}

		return json({
			success: true,
			data: updatedMemory,
			shared_with: sharedWith,
			message: 'Memory updated successfully'
		});
	} catch (err) {
		return json({ error: 'An error occurred: ' + err.message }, { status: 500 });
	}
}
