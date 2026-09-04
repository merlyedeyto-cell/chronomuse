import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export async function POST({ request }) {
	try {
		const { share_id, memory_id, user_id, action } = await request.json();

		if (!user_id || !action) {
			return json({ error: 'User ID and Action (accept/decline) are required' }, { status: 400 });
		}

		if (action === 'accept') {
			let memoryToCopy = null;
			let senderUsername = 'a friend';
			let originalSenderId = null;

			// Fetch details using share_id
			if (share_id) {
				const { data: shareRow } = await supabase
					.from('chronomuse_shared_memories')
					.select('sender_id, memory_id')
					.eq('id', share_id)
					.maybeSingle();
				
				if (shareRow) {
					originalSenderId = shareRow.sender_id || null;
					const targetMemId = memory_id || shareRow.memory_id;
					if (targetMemId) {
						const { data: memData } = await supabase
							.from('chronomuse_memories')
							.select('*')
							.eq('id', targetMemId)
							.maybeSingle();
						memoryToCopy = memData;
					}

					if (shareRow.sender_id) {
						const { data: senderUser } = await supabase
							.from('chronomuse_users')
							.select('username')
							.eq('id', shareRow.sender_id)
							.maybeSingle();
						if (senderUser) {
							senderUsername = senderUser.username;
						}
					}
				}
			} else if (memory_id) {
				const { data: memData } = await supabase
					.from('chronomuse_memories')
					.select('*')
					.eq('id', memory_id)
					.maybeSingle();
				memoryToCopy = memData;
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

			// Broadcast realtime notification to sender
			if (originalSenderId) {
				try {
					const senderChannel = supabase.channel(`chronomuse_user_inbox_${originalSenderId}`);
					senderChannel.subscribe((status) => {
						if (status === 'SUBSCRIBED') {
							senderChannel.send({
								type: 'broadcast',
								event: 'notification',
								payload: { sender_id: user_id, receiver_id: originalSenderId, eventType: 'shared_memory_accepted', memory_id }
							});
						}
					});
					const globalChannel = supabase.channel('chronomuse_global_events');
					globalChannel.subscribe((status) => {
						if (status === 'SUBSCRIBED') {
							globalChannel.send({
								type: 'broadcast',
								event: 'global_memory_event',
								payload: { sender_id: user_id, target_id: originalSenderId, eventType: 'shared_memory_accepted', memory_id }
							});
						}
					});
				} catch (e) {}
			}

			return json({
				success: true,
				message: 'Shared memory accepted and saved to your calendar!',
				memory_date: memoryToCopy ? memoryToCopy.date : null
			});
		} else if (action === 'decline') {
			let originalSenderId = null;
			if (share_id) {
				const { data: shareRow } = await supabase
					.from('chronomuse_shared_memories')
					.select('sender_id')
					.eq('id', share_id)
					.maybeSingle();
				originalSenderId = shareRow?.sender_id || null;

				await supabase
					.from('chronomuse_shared_memories')
					.delete()
					.eq('id', share_id)
					.eq('recipient_id', user_id);
			}

			if (originalSenderId) {
				try {
					const senderChannel = supabase.channel(`chronomuse_user_inbox_${originalSenderId}`);
					senderChannel.subscribe((status) => {
						if (status === 'SUBSCRIBED') {
							senderChannel.send({
								type: 'broadcast',
								event: 'notification',
								payload: { sender_id: user_id, receiver_id: originalSenderId, eventType: 'shared_memory_declined', memory_id }
							});
						}
					});
					const globalChannel = supabase.channel('chronomuse_global_events');
					globalChannel.subscribe((status) => {
						if (status === 'SUBSCRIBED') {
							globalChannel.send({
								type: 'broadcast',
								event: 'global_memory_event',
								payload: { sender_id: user_id, target_id: originalSenderId, eventType: 'shared_memory_declined', memory_id }
							});
						}
					});
				} catch (e) {}
			}

			return json({ success: true, message: 'Shared memory request declined.' });
		} else {
			return json({ error: 'Invalid action. Must be accept or decline.' }, { status: 400 });
		}
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
