<script>
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { page } from '$app/stores';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { playIncomingMessageSound, playNotificationSound } from '$lib/soundEffects.js';

	let user = null;
	let globalMsgChannel = null;
	let lastSeenMessageId = 0;
	let lastTotalNotifs = null;
	let notifPollInterval = null;

	async function checkNotificationsCount() {
		if (!user?.id) return;
		try {
			const res = await fetch(API_ENDPOINTS.getNotifications, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: user.id })
			});
			const data = await res.json();
			if (data?.success && data?.data) {
				const incomingRequests = data.data.incoming_requests?.length || 0;
				const pendingShared = (data.data.shared_memories || []).filter(m => m.status !== 'accepted').length;
				const currentTotal = incomingRequests + pendingShared;

				if (lastTotalNotifs !== null && currentTotal > lastTotalNotifs) {
					// Trigger sound and vibration for new notification
					playNotificationSound();
				}
				lastTotalNotifs = currentTotal;
			}
		} catch (e) {}
	}

	onMount(() => {
		const initGlobalListener = () => {
			const storedUser = localStorage.getItem('chronomuse_user');
			if (storedUser) {
				try {
					user = JSON.parse(storedUser);
				} catch (e) {}
			}

			if (user?.id && !globalMsgChannel) {
				checkNotificationsCount();
				notifPollInterval = setInterval(checkNotificationsCount, 5000);

				// Listen for incoming realtime messages and notifications
				globalMsgChannel = supabase.channel(`chronomuse_user_inbox_${user.id}`);

				globalMsgChannel
					.on('broadcast', { event: 'new_message' }, (payload) => {
						if (payload?.payload && Number(payload.payload.receiver_id) === Number(user.id)) {
							const isChatPage = $page.url.pathname === '/chat';
							const currentFriendId = $page.url.searchParams.get('friend_id');

							// Play notification sound + vibrate if user is not currently inside this friend's active chat
							if (!isChatPage || String(currentFriendId) !== String(payload.payload.sender_id)) {
								playIncomingMessageSound();
							}
						}
					})
					.on('broadcast', { event: 'notification' }, () => {
						playNotificationSound();
					})
					.on('postgres_changes', {
						event: 'INSERT',
						schema: 'public',
						table: 'chronomuse_messages',
						filter: `receiver_id=eq.${user.id}`
					}, (payload) => {
						if (payload?.new && payload.new.id !== lastSeenMessageId) {
							lastSeenMessageId = payload.new.id;
							const isChatPage = $page.url.pathname === '/chat';
							const currentFriendId = $page.url.searchParams.get('friend_id');
							if (!isChatPage || String(currentFriendId) !== String(payload.new.sender_id)) {
								playIncomingMessageSound();
							}
						}
					})
					.on('postgres_changes', {
						event: 'INSERT',
						schema: 'public',
						table: 'chronomuse_friend_requests',
						filter: `receiver_id=eq.${user.id}`
					}, () => {
						playNotificationSound();
					})
					.on('postgres_changes', {
						event: 'INSERT',
						schema: 'public',
						table: 'chronomuse_shared_memories',
						filter: `recipient_id=eq.${user.id}`
					}, () => {
						playNotificationSound();
					})
					.subscribe();
			}
		};

		initGlobalListener();

		window.addEventListener('storage', initGlobalListener);

		return () => {
			window.removeEventListener('storage', initGlobalListener);
			if (notifPollInterval) clearInterval(notifPollInterval);
			if (globalMsgChannel) {
				supabase.removeChannel(globalMsgChannel);
			}
		};
	});

	onDestroy(() => {
		if (notifPollInterval) clearInterval(notifPollInterval);
		if (globalMsgChannel) {
			supabase.removeChannel(globalMsgChannel);
		}
	});
</script>

<slot />
