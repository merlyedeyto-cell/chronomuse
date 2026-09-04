<script>
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { page } from '$app/stores';
	import { playIncomingMessageSound } from '$lib/soundEffects.js';

	let user = null;
	let globalMsgChannel = null;
	let lastSeenMessageId = 0;

	onMount(() => {
		const initGlobalListener = () => {
			const storedUser = localStorage.getItem('chronomuse_user');
			if (storedUser) {
				try {
					user = JSON.parse(storedUser);
				} catch (e) {}
			}

			if (user?.id && !globalMsgChannel) {
				// Listen for incoming realtime messages sent to this user
				globalMsgChannel = supabase.channel(`chronomuse_user_inbox_${user.id}`);

				globalMsgChannel
					.on('broadcast', { event: 'new_message' }, (payload) => {
						if (payload?.payload && Number(payload.payload.receiver_id) === Number(user.id)) {
							const isChatPage = $page.url.pathname === '/chat';
							const currentFriendId = $page.url.searchParams.get('friend_id');

							// Play notification chime if user is not currently actively viewing this specific friend's chat
							if (!isChatPage || String(currentFriendId) !== String(payload.payload.sender_id)) {
								playIncomingMessageSound();
							}
						}
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
					.subscribe();
			}
		};

		initGlobalListener();

		window.addEventListener('storage', initGlobalListener);

		return () => {
			window.removeEventListener('storage', initGlobalListener);
			if (globalMsgChannel) {
				supabase.removeChannel(globalMsgChannel);
			}
		};
	});

	onDestroy(() => {
		if (globalMsgChannel) {
			supabase.removeChannel(globalMsgChannel);
		}
	});
</script>

<slot />
