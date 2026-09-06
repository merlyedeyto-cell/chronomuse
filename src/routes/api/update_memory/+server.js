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
				// Fetch existing memory to check old file URLs
				const { data: existingMemory } = await supabase
					.from('chronomuse_memories')
					.select('photo_video, music')
					.eq('id', memoryId)
					.maybeSingle();

				const deleteFileFromStorage = async (publicUrl) => {
					if (!publicUrl) return;
					const bucketFolder = 'storage/v1/object/public/memories/';
					const index = publicUrl.indexOf(bucketFolder);
					if (index !== -1) {
						const filePath = publicUrl.substring(index + bucketFolder.length);
						await supabase.storage.from('memories').remove([filePath]);
					}
				};

				// Handle New Photo Upload
				if (photoVideoFile && photoVideoFile.size > 0) {
					if (existingMemory) await deleteFileFromStorage(existingMemory.photo_video);

					const fileExt = photoVideoFile.name.split('.').pop();
					const fileName = `photo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
					const filePath = `${userId || 'unknown'}/${fileName}`;

					const { error: uploadError } = await supabase.storage
						.from('memories')
						.upload(filePath, photoVideoFile);

					if (uploadError) {
						return json({ error: 'Photo upload failed: ' + uploadError.message }, { status: 500 });
					}

					const { data: urlData } = supabase.storage.from('memories').getPublicUrl(filePath);
					updateData.photo_video = urlData.publicUrl;
					updateData.photo_video_type = photoVideoFile.type;
				}

				// Handle New Music Upload
				if (musicFile && musicFile.size > 0) {
					if (existingMemory) await deleteFileFromStorage(existingMemory.music);

					const rawName = musicFile.name;
					const lastDotIndex = rawName.lastIndexOf('.');
					const baseName = lastDotIndex !== -1 ? rawName.substring(0, lastDotIndex) : rawName;
					const fileExt = lastDotIndex !== -1 ? rawName.substring(lastDotIndex + 1) : 'mp3';
					
					// Clean base name for URL safety while preserving human readability
					const safeBaseName = baseName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_');
					const fileName = `${Date.now()}_${safeBaseName || 'music'}.${fileExt}`;
					const filePath = `${userId || 'unknown'}/${fileName}`;

					const { error: uploadError } = await supabase.storage
						.from('memories')
						.upload(filePath, musicFile);

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

		// Broadcast realtime event for instantaneous updates across all connected clients
		try {
			const globalChannel = supabase.channel('chronomuse_global_events');
			globalChannel.subscribe((status) => {
				if (status === 'SUBSCRIBED') {
					globalChannel.send({
						type: 'broadcast',
						event: 'global_memory_event',
						payload: {
							memory_id: memoryId,
							user_id: updatedMemory.user_id,
							sender_id: updatedMemory.user_id,
							shared_with: sharedWith,
							eventType: 'shared_memory_update',
							memoryData: updatedMemory
						}
					});
				}
			});

			for (const recipientId of sharedWith) {
				const userChannel = supabase.channel(`chronomuse_user_inbox_${recipientId}`);
				userChannel.subscribe((status) => {
					if (status === 'SUBSCRIBED') {
						userChannel.send({
							type: 'broadcast',
							event: 'notification',
							payload: {
								eventType: 'shared_memory_update',
								sender_id: updatedMemory.user_id,
								target_id: recipientId,
								receiver_id: recipientId,
								memoryData: updatedMemory
							}
						});
					}
				});
			}
		} catch (e) {
			console.error('Realtime update broadcast error:', e);
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
