<script>
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { page } from '$app/stores';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { playIncomingMessageSound, playNotificationSound } from '$lib/soundEffects.js';

	let user = $state(null);
	let globalMsgChannel = null;
	let globalEventsChannel = null;
	let subscribedUserId = null;
	let lastSeenMessageId = 0;
	let lastTotalNotifs = null;
	let notifPollInterval = null;

	function getActiveLoggedInUser() {
		if (typeof window === 'undefined') return null;
		try {
			const stored = localStorage.getItem('chronomuse_user');
			if (!stored) return null;
			const parsed = JSON.parse(stored);
			return parsed?.id ? parsed : null;
		} catch (e) {
			return null;
		}
	}

	function teardownListeners() {
		if (notifPollInterval) {
			clearInterval(notifPollInterval);
			notifPollInterval = null;
		}
		if (globalMsgChannel) {
			try {
				supabase.removeChannel(globalMsgChannel);
			} catch (e) {}
			globalMsgChannel = null;
		}
		if (globalEventsChannel) {
			try {
				supabase.removeChannel(globalEventsChannel);
			} catch (e) {}
			globalEventsChannel = null;
		}
		try {
			supabase.removeAllChannels();
		} catch (e) {}
		subscribedUserId = null;
		lastTotalNotifs = null;
		lastSeenMessageId = 0;
		user = null;
	}

	async function checkNotificationsCount() {
		const activeUser = getActiveLoggedInUser();
		if (!activeUser?.id || Number(activeUser.id) !== Number(subscribedUserId)) {
			// User logged out or switched accounts
			syncUserStateAndListeners();
			return;
		}

		try {
			const res = await fetch(API_ENDPOINTS.getNotifications, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: activeUser.id })
			});
			const data = await res.json();
			
			// Verify again that user is still active before playing any sound
			const verifiedUser = getActiveLoggedInUser();
			if (!verifiedUser?.id || Number(verifiedUser.id) !== Number(subscribedUserId)) {
				syncUserStateAndListeners();
				return;
			}

			if (data?.success && data?.data) {
				const incomingRequests = data.data.incoming_requests?.length || 0;
				const pendingShared = (data.data.shared_memories || []).filter(m => m.status !== 'accepted').length;
				const currentTotal = incomingRequests + pendingShared;

				if (lastTotalNotifs !== null && currentTotal > lastTotalNotifs) {
					// Trigger sound and vibration ONLY for the currently active logged-in user
					playNotificationSound(verifiedUser.id);
				}
				lastTotalNotifs = currentTotal;
			}
		} catch (e) {}
	}

	function syncUserStateAndListeners() {
		if (typeof window === 'undefined') return;

		const activeUser = getActiveLoggedInUser();

		// Case 1: No user is logged in (Logged out)
		if (!activeUser?.id) {
			teardownListeners();
			return;
		}

		// Case 2: Already subscribed to this exact active user
		if (subscribedUserId === activeUser.id && globalMsgChannel && globalEventsChannel) {
			user = activeUser;
			return;
		}

		// Case 3: Different user or fresh subscription
		teardownListeners();

		user = activeUser;
		subscribedUserId = activeUser.id;
		const targetUserId = activeUser.id;

		checkNotificationsCount();
		notifPollInterval = setInterval(checkNotificationsCount, 2500);

		// Global Realtime Events channel for fast cross-client sync
		globalEventsChannel = supabase.channel('chronomuse_global_events');
		globalEventsChannel
			.on('broadcast', { event: 'global_friend_event' }, (payload) => {
				const current = getActiveLoggedInUser();
				if (!current?.id) return;
				const sId = payload?.payload?.sender_id;
				const tId = payload?.payload?.target_id;
				const myId = Number(current.id);

				if (Number(sId) === myId || Number(tId) === myId) {
					if (payload?.payload?.eventType === 'friend_request' && Number(tId) === myId) {
						playNotificationSound(myId);
					}
					checkNotificationsCount();
					if (typeof window !== 'undefined') {
						window.dispatchEvent(new CustomEvent('chronomuse_friend_change', { detail: payload?.payload }));
						window.dispatchEvent(new CustomEvent('chronomuse_notification_change', { detail: payload?.payload }));
					}
				}
			})
			.subscribe();

		// Listen strictly for this specific logged-in user's inbox
		globalMsgChannel = supabase.channel(`chronomuse_user_inbox_${targetUserId}`);

		globalMsgChannel
			.on('broadcast', { event: 'new_message' }, (payload) => {
				const current = getActiveLoggedInUser();
				if (!current || Number(current.id) !== Number(targetUserId)) {
					syncUserStateAndListeners();
					return;
				}

				if (payload?.payload && Number(payload.payload.receiver_id) === Number(targetUserId)) {
					const isChatPage = $page.url.pathname === '/chat';
					const currentFriendId = $page.url.searchParams.get('friend_id');

					// Play notification sound if user is not currently inside this friend's active chat
					if (!isChatPage || String(currentFriendId) !== String(payload.payload.sender_id)) {
						playIncomingMessageSound(targetUserId);
					}
				}
			})
			.on('broadcast', { event: 'friend_request' }, (payload) => {
				const current = getActiveLoggedInUser();
				if (!current || Number(current.id) !== Number(targetUserId)) return;
				playNotificationSound(targetUserId);
				checkNotificationsCount();
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_friend_change', { detail: payload }));
					window.dispatchEvent(new CustomEvent('chronomuse_notification_change', { detail: payload }));
				}
			})
			.on('broadcast', { event: 'friend_change' }, (payload) => {
				const current = getActiveLoggedInUser();
				if (!current || Number(current.id) !== Number(targetUserId)) return;
				checkNotificationsCount();
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_friend_change', { detail: payload }));
					window.dispatchEvent(new CustomEvent('chronomuse_notification_change', { detail: payload }));
				}
			})
			.on('broadcast', { event: 'notification' }, (payload) => {
				const current = getActiveLoggedInUser();
				if (!current || Number(current.id) !== Number(targetUserId)) {
					syncUserStateAndListeners();
					return;
				}
				playNotificationSound(targetUserId);
				checkNotificationsCount();
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_notification_change', { detail: payload }));
				}
			})
			.on('postgres_changes', {
				event: 'INSERT',
				schema: 'public',
				table: 'chronomuse_messages',
				filter: `receiver_id=eq.${targetUserId}`
			}, (payload) => {
				const current = getActiveLoggedInUser();
				if (!current || Number(current.id) !== Number(targetUserId)) {
					syncUserStateAndListeners();
					return;
				}

				if (payload?.new && payload.new.id !== lastSeenMessageId) {
					lastSeenMessageId = payload.new.id;
					const isChatPage = $page.url.pathname === '/chat';
					const currentFriendId = $page.url.searchParams.get('friend_id');
					if (!isChatPage || String(currentFriendId) !== String(payload.new.sender_id)) {
						playIncomingMessageSound(targetUserId);
					}
				}
			})
			.on('postgres_changes', {
				event: '*',
				schema: 'public',
				table: 'chronomuse_friend_requests',
				filter: `receiver_id=eq.${targetUserId}`
			}, (payload) => {
				const current = getActiveLoggedInUser();
				if (!current || Number(current.id) !== Number(targetUserId)) return;
				if (payload.eventType === 'INSERT') {
					playNotificationSound(targetUserId);
				}
				checkNotificationsCount();
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_friend_change', { detail: payload }));
					window.dispatchEvent(new CustomEvent('chronomuse_notification_change', { detail: payload }));
				}
			})
			.on('postgres_changes', {
				event: '*',
				schema: 'public',
				table: 'chronomuse_friend_requests',
				filter: `sender_id=eq.${targetUserId}`
			}, (payload) => {
				const current = getActiveLoggedInUser();
				if (!current || Number(current.id) !== Number(targetUserId)) return;
				checkNotificationsCount();
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_friend_change', { detail: payload }));
					window.dispatchEvent(new CustomEvent('chronomuse_notification_change', { detail: payload }));
				}
			})
			.on('postgres_changes', {
				event: '*',
				schema: 'public',
				table: 'chronomuse_friends',
				filter: `user_id=eq.${targetUserId}`
			}, (payload) => {
				const current = getActiveLoggedInUser();
				if (!current || Number(current.id) !== Number(targetUserId)) return;
				checkNotificationsCount();
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_friend_change', { detail: payload }));
				}
			})
			.on('postgres_changes', {
				event: '*',
				schema: 'public',
				table: 'chronomuse_friends',
				filter: `friend_id=eq.${targetUserId}`
			}, (payload) => {
				const current = getActiveLoggedInUser();
				if (!current || Number(current.id) !== Number(targetUserId)) return;
				checkNotificationsCount();
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_friend_change', { detail: payload }));
				}
			})
			.on('postgres_changes', {
				event: '*',
				schema: 'public',
				table: 'chronomuse_shared_memories',
				filter: `recipient_id=eq.${targetUserId}`
			}, (payload) => {
				const current = getActiveLoggedInUser();
				if (!current || Number(current.id) !== Number(targetUserId)) return;
				if (payload.eventType === 'INSERT') {
					playNotificationSound(targetUserId);
				}
				checkNotificationsCount();
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_notification_change', { detail: payload }));
				}
			})
			.on('postgres_changes', {
				event: '*',
				schema: 'public',
				table: 'chronomuse_shared_memories',
				filter: `sender_id=eq.${targetUserId}`
			}, (payload) => {
				const current = getActiveLoggedInUser();
				if (!current || Number(current.id) !== Number(targetUserId)) return;
				checkNotificationsCount();
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_notification_change', { detail: payload }));
				}
			})
			.subscribe();
	}

	// Reactively check whenever $page changes (e.g. navigation after login/logout)
	$effect(() => {
		const _ = $page.url.pathname;
		syncUserStateAndListeners();
	});

	onMount(() => {
		syncUserStateAndListeners();

		window.addEventListener('storage', syncUserStateAndListeners);
		window.addEventListener('chronomuse_auth_change', syncUserStateAndListeners);

		return () => {
			window.removeEventListener('storage', syncUserStateAndListeners);
			window.removeEventListener('chronomuse_auth_change', syncUserStateAndListeners);
			teardownListeners();
		};
	});

	onDestroy(() => {
		teardownListeners();
	});
</script>

<slot />
