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

/**
 * Broadcasts memory share, accept, decline, or cancel events in real time
 */
export function broadcastMemoryEvent(senderId, recipientId, eventType = 'shared_memory_change', memoryData = null) {
	if (typeof window === 'undefined') return;

	try {
		// 1. Send direct to recipient's or sender's private inbox channel
		if (recipientId) {
			const targetChannel = supabase.channel(`chronomuse_user_inbox_${recipientId}`);
			targetChannel.subscribe((status) => {
				if (status === 'SUBSCRIBED') {
					targetChannel.send({
						type: 'broadcast',
						event: 'notification',
						payload: {
							sender_id: senderId,
							receiver_id: recipientId,
							eventType,
							memoryData,
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
					event: 'global_memory_event',
					payload: {
						sender_id: senderId,
						target_id: recipientId,
						eventType,
						memoryData,
						timestamp: Date.now()
					}
				});
			}
		});

		window.dispatchEvent(new CustomEvent('chronomuse_notification_change', {
			detail: { sender_id: senderId, target_id: recipientId, eventType, memoryData }
		}));
		window.dispatchEvent(new CustomEvent('chronomuse_memory_change', {
			detail: { sender_id: senderId, target_id: recipientId, eventType, memoryData }
		}));
	} catch (err) {
		console.error('Error broadcasting memory event:', err);
	}
}

/**
 * Broadcasts profile changes (note, bio, avatar, cover photo, info) in real time
 */
export function broadcastProfileEvent(userId, updatedFields = {}) {
	if (typeof window === 'undefined' || !userId) return;

	try {
		const globalChannel = supabase.channel('chronomuse_global_events');
		globalChannel.subscribe((status) => {
			if (status === 'SUBSCRIBED') {
				globalChannel.send({
					type: 'broadcast',
					event: 'global_profile_event',
					payload: {
						user_id: userId,
						updated_fields: updatedFields,
						timestamp: Date.now()
					}
				});
			}
		});

		window.dispatchEvent(new CustomEvent('chronomuse_profile_change', {
			detail: { user_id: userId, updated_fields: updatedFields }
		}));
	} catch (err) {
		console.error('Error broadcasting profile event:', err);
	}
}

