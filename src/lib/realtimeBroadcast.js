import { supabase } from '$lib/supabaseClient';

/**
 * Broadcasts a friend or notification event across Supabase Realtime channels
 * so all connected clients (different browsers/devices) update immediately without refresh.
 */
export function broadcastFriendEvent(senderId, targetUserId, eventType = 'friend_change') {
	if (typeof window === 'undefined') return;

	try {
		// 1. Send direct to recipient's private inbox channel
		if (targetUserId) {
			const targetChannel = supabase.channel(`chronomuse_user_inbox_${targetUserId}`);
			targetChannel.subscribe((status) => {
				if (status === 'SUBSCRIBED') {
					targetChannel.send({
						type: 'broadcast',
						event: eventType === 'friend_request' ? 'friend_request' : 'friend_change',
						payload: {
							sender_id: senderId,
							receiver_id: targetUserId,
							eventType,
							timestamp: Date.now()
						}
					});
				}
			});
		}

		// 2. Send to global realtime events channel
		const globalChannel = supabase.channel('chronomuse_global_events');
		globalChannel.subscribe((status) => {
			if (status === 'SUBSCRIBED') {
				globalChannel.send({
					type: 'broadcast',
					event: 'global_friend_event',
					payload: {
						sender_id: senderId,
						target_id: targetUserId,
						eventType,
						timestamp: Date.now()
					}
				});
			}
		});

		// 3. Dispatch local window events for immediate same-window reactivity
		window.dispatchEvent(new CustomEvent('chronomuse_friend_change', {
			detail: { sender_id: senderId, target_id: targetUserId, eventType }
		}));
		window.dispatchEvent(new CustomEvent('chronomuse_notification_change', {
			detail: { sender_id: senderId, target_id: targetUserId, eventType }
		}));
	} catch (err) {
		console.error('Error broadcasting friend event:', err);
	}
}
