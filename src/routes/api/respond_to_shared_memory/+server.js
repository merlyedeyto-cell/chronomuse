import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { share_id, memory_id, user_id, action } = await request.json();

		if (!user_id || !action) {
			return json({ error: 'User ID and Action (accept/decline) are required' }, { status: 400 });
		}

		if (action === 'accept') {
			// 1. Fetch original memory details
			let memoryToCopy = null;
			if (memory_id) {
				const { data: memData } = await supabase
					.from('chronomuse_memories')
					.select('*')
					.eq('id', memory_id)
					.single();
				memoryToCopy = memData;
			}

			// 2. Fetch sender username
			let senderUsername = 'a friend';
			if (share_id) {
				const { data: shareRow } = await supabase
					.from('chronomuse_shared_memories')
					.select('sender_id')
					.eq('id', share_id)
					.single();
				
				if (shareRow && shareRow.sender_id) {
					const { data: senderUser } = await supabase
						.from('chronomuse_users')
						.select('username')
						.eq('id', shareRow.sender_id)
						.single();
					if (senderUser) {
						senderUsername = senderUser.username;
					}
				}
			}

			// 3. Insert into recipient's memories if not already saved
			if (memoryToCopy) {
				const { data: existingCopy } = await supabase
					.from('chronomuse_memories')
					.select('id')
					.eq('user_id', user_id)
					.eq('date', memoryToCopy.date)
					.ilike('description', `%Shared by @${senderUsername}%`)
					.limit(1);

				if (!existingCopy || existingCopy.length === 0) {
					const { error: insertError } = await supabase
						.from('chronomuse_memories')
						.insert([
							{
								user_id: user_id,
								date: memoryToCopy.date,
								title: memoryToCopy.title || 'Untitled Memory',
								description: memoryToCopy.description ? `${memoryToCopy.description}\n\n(Shared by @${senderUsername})` : `(Shared by @${senderUsername})`,
								mood_tag: memoryToCopy.mood_tag || 'Happy',
								memory_tag: memoryToCopy.memory_tag || 'Special Memory',
								photo_video: memoryToCopy.photo_video || null,
								photo_video_type: memoryToCopy.photo_video_type || null,
								music: memoryToCopy.music || null
							}
						]);

					if (insertError) {
						return json({ error: 'Failed to save memory: ' + insertError.message }, { status: 500 });
					}
				}
			}

			return json({
				success: true,
				message: 'Shared memory accepted and saved to your calendar!',
				memory_date: memoryToCopy ? memoryToCopy.date : null
			});
		} else if (action === 'decline') {
			// Remove from shared memories
			if (share_id) {
				await supabase
					.from('chronomuse_shared_memories')
					.delete()
					.eq('id', share_id)
					.eq('recipient_id', user_id);
			}

			return json({ success: true, message: 'Shared memory request declined.' });
		} else {
			return json({ error: 'Invalid action. Must be accept or decline.' }, { status: 400 });
		}
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
