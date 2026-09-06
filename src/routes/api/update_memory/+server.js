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

					const fileExt = musicFile.name.split('.').pop();
					const fileName = `music_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
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

			if (ownerUsername) {
				for (const recipientId of sharedWith) {
					const { data: existingCopy } = await supabase
						.from('chronomuse_memories')
						.select('id')
						.eq('user_id', recipientId)
						.eq('date', updatedMemory.date)
						.ilike('description', `%Shared by @${ownerUsername}%`)
						.limit(1)
						.maybeSingle();

					if (existingCopy) {
						let copyUpdateData = { ...updateData };
						if (copyUpdateData.description !== undefined) {
							copyUpdateData.description = copyUpdateData.description ? `${copyUpdateData.description}\n\n(Shared by @${ownerUsername})` : `(Shared by @${ownerUsername})`;
						}
						
						await supabase
							.from('chronomuse_memories')
							.update(copyUpdateData)
							.eq('id', existingCopy.id);
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
