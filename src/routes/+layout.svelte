<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabaseClient';
	import { page } from '$app/stores';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { playIncomingMessageSound, playNotificationSound, playClickSound } from '$lib/soundEffects.js';

	let user = $state(null);
	let isAccountSuspended = $state(false);
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

	function handleAccountSuspended() {
		if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
			return;
		}
		isAccountSuspended = true;
		teardownListeners();
		if (typeof window !== 'undefined') {
			localStorage.removeItem('chronomuse_user');
			window.dispatchEvent(new Event('chronomuse_auth_change'));
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
		if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
			return;
		}

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

			if (data?.is_suspended) {
				handleAccountSuspended();
				return;
			}
			
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

		// Inside admin portal, do not attach user listeners or trigger user lockouts
		if (window.location.pathname.startsWith('/admin') || ($page && $page.url && $page.url.pathname.startsWith('/admin'))) {
			teardownListeners();
			return;
		}

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
				if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) return;
				const current = getActiveLoggedInUser();
				if (!current?.id) return;
				const sId = payload?.payload?.sender_id;
				const tId = payload?.payload?.target_id;
				const myId = Number(current.id);

				if (payload?.payload?.eventType === 'account_suspended' && Number(tId) === myId) {
					handleAccountSuspended();
					return;
				}

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
			.on('broadcast', { event: 'global_memory_event' }, (payload) => {
				const current = getActiveLoggedInUser();
				if (!current?.id) return;
				const sId = payload?.payload?.sender_id;
				const tId = payload?.payload?.target_id || payload?.payload?.receiver_id;
				const rId = payload?.payload?.receiver_id;
				const sharedWith = payload?.payload?.shared_with || [];
				const myId = Number(current.id);

				if (Number(sId) === myId || Number(tId) === myId || Number(rId) === myId || sharedWith.map(Number).includes(myId)) {
					if (payload?.payload?.eventType === 'shared_memory_incoming' && (Number(tId) === myId || Number(rId) === myId)) {
						playNotificationSound(myId);
					}
					checkNotificationsCount();
					if (typeof window !== 'undefined') {
						window.dispatchEvent(new CustomEvent('chronomuse_notification_change', { detail: payload?.payload }));
						window.dispatchEvent(new CustomEvent('chronomuse_memory_change', { detail: payload?.payload }));
					}
				}
			})
			.on('broadcast', { event: 'global_note_event' }, (payload) => {
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_note_change', { detail: payload?.payload }));
					window.dispatchEvent(new CustomEvent('chronomuse_profile_change', {
						detail: { user_id: payload?.payload?.user_id, updated_fields: { note: payload?.payload?.note } }
					}));
				}
			})
			.on('broadcast', { event: 'global_profile_event' }, (payload) => {
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_profile_change', { detail: payload?.payload }));
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

					if (typeof window !== 'undefined') {
						window.dispatchEvent(new CustomEvent('chronomuse_new_message', { detail: payload.payload }));
						window.dispatchEvent(new CustomEvent('chronomuse_notification_change', { detail: payload.payload }));
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
					window.dispatchEvent(new CustomEvent('chronomuse_memory_change', { detail: payload }));
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

					if (typeof window !== 'undefined') {
						window.dispatchEvent(new CustomEvent('chronomuse_new_message', { detail: payload.new }));
						window.dispatchEvent(new CustomEvent('chronomuse_notification_change', { detail: payload.new }));
					}
				}
			})
			.on('postgres_changes', {
				event: 'DELETE',
				schema: 'public',
				table: 'chronomuse_messages'
			}, (payload) => {
				const current = getActiveLoggedInUser();
				if (!current || Number(current.id) !== Number(targetUserId)) return;
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_message_unsend', { detail: payload.old }));
					window.dispatchEvent(new CustomEvent('chronomuse_notification_change', { detail: payload.old }));
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
			.on('postgres_changes', {
				event: '*',
				schema: 'public',
				table: 'chronomuse_pinned_dates',
				filter: `user_id=eq.${targetUserId}`
			}, (payload) => {
				const current = getActiveLoggedInUser();
				if (!current || Number(current.id) !== Number(targetUserId)) return;
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_pinned_change', { detail: payload }));
					window.dispatchEvent(new CustomEvent('chronomuse_memory_change', { detail: payload }));
				}
			})
			.on('postgres_changes', {
				event: '*',
				schema: 'public',
				table: 'chronomuse_memories',
				filter: `user_id=eq.${targetUserId}`
			}, (payload) => {
				const current = getActiveLoggedInUser();
				if (!current || Number(current.id) !== Number(targetUserId)) return;
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_memory_change', { detail: payload }));
					window.dispatchEvent(new CustomEvent('chronomuse_pinned_change', { detail: payload }));
				}
			})
			.on('postgres_changes', {
				event: 'UPDATE',
				schema: 'public',
				table: 'chronomuse_users'
			}, (payload) => {
				if (typeof window !== 'undefined' && payload?.new) {
					const updatedUser = payload.new;
					window.dispatchEvent(new CustomEvent('chronomuse_profile_change', {
						detail: {
							user_id: updatedUser.id,
							updated_fields: updatedUser,
							note: updatedUser.note
						}
					}));
					if (updatedUser.note !== undefined) {
						window.dispatchEvent(new CustomEvent('chronomuse_note_change', {
							detail: { user_id: updatedUser.id, note: updatedUser.note }
						}));
					}
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

		const handleGlobalClick = (e) => {
			const target = e.target?.closest?.('button, a, input[type="submit"], input[type="button"], [role="button"], .cursor-pointer');
			if (target) {
				playClickSound();
			}
		};

		window.addEventListener('click', handleGlobalClick, { capture: true, passive: true });
		window.addEventListener('storage', syncUserStateAndListeners);
		window.addEventListener('chronomuse_auth_change', syncUserStateAndListeners);

		return () => {
			window.removeEventListener('click', handleGlobalClick, { capture: true });
			window.removeEventListener('storage', syncUserStateAndListeners);
			window.removeEventListener('chronomuse_auth_change', syncUserStateAndListeners);
			teardownListeners();
		};
	});
</script>

<slot />

<!-- Real-time Account Suspended Modal -->
{#if isAccountSuspended && !$page.url.pathname.startsWith('/admin')}
	<div class="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4 animate-fade-in">
		<div class="bg-white border-2 border-rose-300 rounded-3xl max-w-sm w-full p-6 text-center shadow-2xl space-y-4">
			<div class="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto border-2 border-rose-200">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-8 h-8">
					<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
				</svg>
			</div>
			<div>
				<h2 class="text-lg font-black text-rose-700">Account Suspended</h2>
				<p class="text-xs text-pink-600 font-medium mt-1.5 leading-relaxed">
					Your ChronoMuse account has been suspended by the administrator. Access to diaries, notes, chats, and features has been disabled.
				</p>
			</div>
			<button
				type="button"
				onclick={() => { isAccountSuspended = false; goto('/'); }}
				class="w-full py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
			>
				Return to Sign In
			</button>
		</div>
	</div>
{/if}

<style>
	:global(video::-webkit-media-controls-fullscreen-button),
	:global(video *::-webkit-media-controls-fullscreen-button),
	:global(video::-webkit-media-controls-enclosure .fullscreen-button),
	:global(video::-webkit-media-controls-toggle-closed-captions-button),
	:global(video::-internal-media-controls-overlay-cast-button) {
		display: none !important;
		-webkit-appearance: none !important;
		visibility: hidden !important;
		opacity: 0 !important;
		pointer-events: none !important;
		width: 0px !important;
		height: 0px !important;
		max-width: 0px !important;
		max-height: 0px !important;
		position: absolute !important;
		right: -9999px !important;
	}
</style>
