<script>
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { supabase } from '$lib/supabaseClient';
	import { playTypingSound, playMessageSentSound, playIncomingMessageSound } from '$lib/soundEffects.js';
	import Sidebar from '$lib/Sidebar.svelte';

	let user = $state(typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('chronomuse_user') || 'null') : null);
	let friends = $state([]);
	let requests = $state([]);
	let searchQuery = $state('');
	let chatListFilter = $state('all'); // 'all' | 'unread' | 'requests'
	let unreadFriendsCount = $derived(friends.filter(f => (f.unread_count || 0) > 0).length);
	let unreadRequestsCount = $derived(requests.filter(r => (r.unread_count || 0) > 0).length);
	let isSendingFriendRequest = $state(false);
	let activeFriend = $state(null);
	let messages = $state([]);
	let newMessageText = $state('');
	let isLoading = $state(true);
	let isLoadingChatList = $state(true);
	let isFetchingMessages = $state(false);
	let isLoadingOlder = $state(false);
	let hasMoreMessages = $state(true);
	let isSending = $state(false);
	let isUploadingImage = $state(false);
	let viewingImageModalUrl = $state(null);
	let viewingImageIndex = $state(-1);
	let zoomScale = $state(1);
	let baseScale = 1;
	let panX = $state(0);
	let panY = $state(0);
	let basePanX = 0;
	let basePanY = 0;
	let isMouseDragging = $state(false);
	let isTouching = $state(false);
	let touchStartX = 0;
	let touchStartY = 0;
	let touchDistStart = 0;
	let touchCenterStartX = 0;
	let touchCenterStartY = 0;
	let sidebarOpen = $state(false);
	let showEmojiPicker = $state(false);
	let showClearModal = $state(false);
	let isClearing = $state(false);
	let pollInterval;
	let chatContainer;
	let imageInput;

	// Multi-select & Long-press state
	let isSelectionMode = $state(false);
	let selectedMessageIds = $state(new Set());
	let longPressTimer = null;
	let removedMessageIds = $state(new Set());
	let isDeletingMessages = $state(false);

	// Swipe-to-reply state
	let replyingTo = $state(null);
	let swipingMessageId = $state(null);
	let swipeOffset = $state(0);
	let isSwipeThresholdReached = $state(false);
	let isResettingSwipe = $state(false);
	let isDragging = $state(false);
	let startDragX = 0;
	let startDragY = 0;
	let isGestureLocked = false;
	let isHorizontalSwipe = false;
	let wasSwiping = false;
	let messageInputRef;

	const SWIPE_THRESHOLD = 45; // px threshold to trigger reply
	const SWIPE_MAX = 75; // max horizontal drag distance

	// Visual Viewport tracking for mobile virtual keyboard
	let mobileViewportHeight = $state('100dvh');
	let mobileViewportTop = $state('0px');

	// Typing indicator state
	let isOtherUserTyping = $state(false);
	let typingTimeout = null;
	let myTypingTimeout = null;
	let myTypingInterval = null;
	let typingChannel = null;
	let unreadTotal = $derived(unreadFriendsCount + unreadRequestsCount);

	// Presence & Active state
	let presenceChannel = null;
	let onlineUserIds = $state(new Set());
	let userLastSeenMap = $state({});
	let currentTime = $state(Date.now());
	let heartbeatInterval = null;

	const emojis = ['😀', '😁', '😂', '🥰', '😍', '🤩', '😊', '😎', '🥳', '🎉', '❤️', '🔥', '✨', '🌟', '💫', '🎈', '🎊', '📸', '🎵', '🎶', '💕', '💖', '💗', '🌸', '🌈', '☀️', '🌙', '⭐'];

	onMount(() => {
		const storedUser = localStorage.getItem('chronomuse_user');
		if (storedUser) {
			user = JSON.parse(storedUser);
			loadRemovedMessages();
		} else {
			goto('/');
			return;
		}

		// Initialize Realtime Global Presence for online/active tracking
		initPresenceChannel();

		// Heartbeat to update last_activity every 30s while active
		heartbeatInterval = setInterval(() => {
			currentTime = Date.now();
			const isAppVisible = typeof document !== 'undefined' && !document.hidden;
			if (isAppVisible && user) {
				updateServerActivity(true);
			}
		}, 30000);

		// Listen to visibility & focus to toggle Active/Offline
		const handleVisibilityChange = () => {
			const isAppVisible = typeof document !== 'undefined' && !document.hidden;
			updateUserPresence(isAppVisible);
		};
		const handleFocus = () => updateUserPresence(true);
		const handleBlur = () => updateUserPresence(false);

		document.addEventListener('visibilitychange', handleVisibilityChange);
		window.addEventListener('focus', handleFocus);
		window.addEventListener('blur', handleBlur);

		// Clear any legacy un-scoped cache to prevent cross-account leak
		localStorage.removeItem('chronomuse_chat_list');

		// Load cached friends & requests list for THIS specific user id
		const cachedChatList = user?.id ? localStorage.getItem(`chronomuse_chat_list_${user.id}`) : null;
		if (cachedChatList) {
			try {
				const parsed = JSON.parse(cachedChatList);
				if (Array.isArray(parsed) && parsed.length > 0) {
					friends = parsed;
					isLoadingChatList = false;
				}
			} catch (e) {}
		}

		const cachedRequests = user?.id ? localStorage.getItem(`chronomuse_chat_requests_${user.id}`) : null;
		if (cachedRequests) {
			try {
				const parsed = JSON.parse(cachedRequests);
				if (Array.isArray(parsed)) {
					requests = parsed;
				}
			} catch (e) {}
		}

		// Read URL params for friend loading
		const friendIdParam = $page.url.searchParams.get('friend_id');
		const usernameParam = $page.url.searchParams.get('username');

		if (friendIdParam || usernameParam) {
			const fid = friendIdParam ? Number(friendIdParam) : null;
			if (fid && user?.id && Number(fid) === Number(user.id)) {
				activeFriend = null;
				if (typeof window !== 'undefined') {
					history.replaceState({ chatOpen: false }, '', '/chat');
				}
			} else {
				activeFriend = {
					friend_id: fid,
					id: fid,
					username: usernameParam || 'User',
					is_friend: friends.some(f => Number(f.friend_id) === fid)
				};
				if (friendIdParam) {
					fetchMessages(Number(friendIdParam), true);
					initTypingChannel(Number(friendIdParam));
				}

				// Ensure base history state is /chat so pressing back on mobile returns to chat list (Friends Chat)
				if (typeof window !== 'undefined') {
					const currentSearch = window.location.search;
					history.replaceState({ chatOpen: false }, '', '/chat');
					history.pushState({ chatOpen: true, friend_id: Number(friendIdParam) }, '', `/chat${currentSearch}`);
				}
			}
		} else {
			if (typeof window !== 'undefined') {
				history.replaceState({ chatOpen: false }, '', '/chat');
			}
		}

		isLoading = false;

		fetchChatList().then(() => {
			if (activeFriend) {
				const allList = [...friends, ...requests];
				const fullFriend = allList.find(f => 
					(activeFriend.friend_id && String(f.friend_id) === String(activeFriend.friend_id)) ||
					(activeFriend.username && f.username.toLowerCase() === activeFriend.username.toLowerCase())
				);
				if (fullFriend) {
					activeFriend = fullFriend;
				} else {
					activeFriend.is_friend = friends.some(f => String(f.friend_id) === String(activeFriend.friend_id));
					activeFriend.is_request = !activeFriend.is_friend;
				}
			}
		});

		pollInterval = setInterval(() => {
			fetchChatList();
			if (activeFriend) {
				fetchMessages(activeFriend.friend_id, false);
			}
		}, 2000);

		const handleRealtimeChatMessage = (e) => {
			fetchChatList();
			if (activeFriend) {
				const detail = e?.detail;
				if (detail && (Number(detail.sender_id) === Number(activeFriend.friend_id) || Number(detail.receiver_id) === Number(activeFriend.friend_id))) {
					fetchMessages(activeFriend.friend_id, false);
				}
			}
		};

		window.addEventListener('chronomuse_new_message', handleRealtimeChatMessage);
		window.addEventListener('chronomuse_friend_change', handleRealtimeChatMessage);

		// Handle mobile hardware & browser back button to return to chat list
		const handlePopState = () => {
			if (activeFriend) {
				stopMyTyping();
				activeFriend = null;
				messages = [];
				isSelectionMode = false;
				selectedMessageIds = new Set();
				replyingTo = null;
				isOtherUserTyping = false;
				if (typeof window !== 'undefined') {
					history.replaceState({ chatOpen: false }, '', '/chat');
				}
			}
		};
		window.addEventListener('popstate', handlePopState);

		const onWindowMouseMove = (e) => {
			if (isDragging && swipingMessageId) {
				const msg = messages.find(m => m.id === swipingMessageId);
				if (msg) {
					handleDragMove(e.clientX, e.clientY, msg, e);
				}
			}
		};

		const onWindowMouseUp = () => {
			if (isDragging && swipingMessageId) {
				const msg = messages.find(m => m.id === swipingMessageId);
				if (msg) {
					handleDragEnd(msg);
				} else {
					isDragging = false;
					swipingMessageId = null;
					swipeOffset = 0;
				}
			}
		};

		window.addEventListener('mousemove', onWindowMouseMove);
		window.addEventListener('mouseup', onWindowMouseUp);

		if (typeof window !== 'undefined') {
			if (window.visualViewport) {
				window.visualViewport.addEventListener('resize', updateMobileViewport);
				window.visualViewport.addEventListener('scroll', updateMobileViewport);
			}
			window.addEventListener('resize', updateMobileViewport);
			window.addEventListener('scroll', updateMobileViewport);
			updateMobileViewport();
		}

		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			window.removeEventListener('focus', handleFocus);
			window.removeEventListener('blur', handleBlur);
			window.removeEventListener('mousemove', onWindowMouseMove);
			window.removeEventListener('mouseup', onWindowMouseUp);
			window.removeEventListener('popstate', handlePopState);
			window.removeEventListener('chronomuse_new_message', handleRealtimeChatMessage);
			window.removeEventListener('chronomuse_friend_change', handleRealtimeChatMessage);
			if (typeof window !== 'undefined') {
				if (window.visualViewport) {
					window.visualViewport.removeEventListener('resize', updateMobileViewport);
					window.visualViewport.removeEventListener('scroll', updateMobileViewport);
				}
				window.removeEventListener('resize', updateMobileViewport);
				window.removeEventListener('scroll', updateMobileViewport);
				document.documentElement.style.overflow = '';
				document.body.style.overflow = '';
			}

			if (heartbeatInterval) clearInterval(heartbeatInterval);
			if (pollInterval) clearInterval(pollInterval);
			if (typingTimeout) clearTimeout(typingTimeout);
			if (myTypingTimeout) clearTimeout(myTypingTimeout);
			if (myTypingInterval) clearInterval(myTypingInterval);
			if (typingChannel) {
				supabase.removeChannel(typingChannel);
			}
			if (presenceChannel) {
				presenceChannel.untrack();
				supabase.removeChannel(presenceChannel);
			}
			// Mark user as offline on exit
			if (user) {
				updateServerActivity(false);
			}
		};
	});

	function initPresenceChannel() {
		if (!user) return;
		if (presenceChannel) {
			supabase.removeChannel(presenceChannel);
		}

		presenceChannel = supabase.channel('chronomuse_presence_global', {
			config: {
				presence: {
					key: String(user.id)
				}
			}
		});

		presenceChannel
			.on('presence', { event: 'sync' }, () => {
				const state = presenceChannel.presenceState();
				const activeIds = new Set();
				const nowIso = new Date().toISOString();
				Object.entries(state).forEach(([key, presences]) => {
					if (Array.isArray(presences)) {
						const hasActive = presences.some(p => p.is_active !== false);
						if (hasActive) {
							activeIds.add(Number(key));
						}
					}
				});

				// Record offline timestamp for any user who just disconnected/became inactive
				onlineUserIds.forEach(prevId => {
					if (!activeIds.has(prevId)) {
						userLastSeenMap[prevId] = nowIso;
					}
				});

				onlineUserIds = activeIds;
			})
			.subscribe(async (status) => {
				if (status === 'SUBSCRIBED') {
					const activeSetting = localStorage.getItem(`chronomuse_active_status_${user.id}`);
					const isAppVisible = typeof document !== 'undefined' && !document.hidden;
					const effectiveActive = activeSetting === 'false' ? false : isAppVisible;
					await presenceChannel.track({
						user_id: user.id,
						username: user.username,
						is_active: effectiveActive,
						online_at: new Date().toISOString()
					});
					updateServerActivity(effectiveActive);
				}
			});
	}

	async function updateUserPresence(isActive) {
		if (!user) return;
		const activeSetting = localStorage.getItem(`chronomuse_active_status_${user.id}`);
		const effectiveActive = activeSetting === 'false' ? false : isActive;
		if (presenceChannel) {
			try {
				await presenceChannel.track({
					user_id: user.id,
					username: user.username,
					is_active: effectiveActive,
					online_at: new Date().toISOString()
				});
			} catch (e) {}
		}
		updateServerActivity(effectiveActive);
	}

	function updateServerActivity(isActive) {
		if (!user) return;
		fetch(API_ENDPOINTS.updateActivity, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ user_id: user.id, is_active: isActive })
		}).catch(() => {});
	}

	function isFriendActive(friendId) {
		if (!friendId) return false;
		return onlineUserIds.has(Number(friendId));
	}

	function formatLastActive(friend) {
		// Depend on reactive currentTime so display advances every 30s
		const _ = currentTime;
		if (!friend) return 'Offline';
		if (isFriendActive(friend.friend_id)) return 'Active now';

		const timestamp = userLastSeenMap[friend.friend_id] || friend.last_activity || friend.last_message_time;
		if (!timestamp) return 'Offline';

		const now = Date.now();
		const date = new Date(timestamp);
		const diffMs = now - date.getTime();

		if (isNaN(diffMs) || diffMs < 0) return 'Active just now';

		const diffSec = Math.floor(diffMs / 1000);
		const diffMin = Math.floor(diffSec / 60);
		const diffHr = Math.floor(diffMin / 60);
		const diffDays = Math.floor(diffHr / 24);

		if (diffMin < 1) {
			return 'Active just now';
		} else if (diffMin === 1) {
			return 'Active 1 min ago';
		} else if (diffMin < 60) {
			return `Active ${diffMin} mins ago`;
		} else if (diffHr === 1) {
			return 'Active 1 hr ago';
		} else if (diffHr < 24) {
			return `Active ${diffHr} hrs ago`;
		} else if (diffDays === 1) {
			return 'Active yesterday';
		} else if (diffDays < 7) {
			return `Active ${diffDays}d ago`;
		} else {
			return `Active ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
		}
	}

	function isRecentActive(friend) {
		if (!friend) return false;
		if (isFriendActive(friend.friend_id)) return true;
		const statusText = formatLastActive(friend);
		return statusText === 'Active now' || statusText === 'Active just now';
	}

	function loadRemovedMessages() {
		if (!user) return;
		try {
			const stored = localStorage.getItem(`chronomuse_removed_msgs_${user.id}`);
			if (stored) {
				const arr = JSON.parse(stored);
				removedMessageIds = new Set(arr);
			}
		} catch (e) {}
	}

	function saveRemovedMessages() {
		if (!user) return;
		try {
			localStorage.setItem(`chronomuse_removed_msgs_${user.id}`, JSON.stringify(Array.from(removedMessageIds)));
		} catch (e) {}
	}

	function initTypingChannel(friendId) {
		if (!user || !friendId) return;
		if (typingChannel) {
			supabase.removeChannel(typingChannel);
		}

		const id1 = Number(user.id);
		const id2 = Number(friendId);
		const channelName = `chat_presence_${Math.min(id1, id2)}_${Math.max(id1, id2)}`;
		typingChannel = supabase.channel(channelName, {
			config: {
				broadcast: { ack: false, self: false }
			}
		});

		typingChannel
			.on('broadcast', { event: 'direct_message' }, async (payload) => {
				if (payload.payload && Number(payload.payload.sender_id) === Number(friendId)) {
					const incoming = payload.payload;
					if (!messages.some(m => m.id === incoming.id || (m.message === incoming.message && m.sender_id === incoming.sender_id))) {
						messages = [...messages, incoming];
						playIncomingMessageSound();
						await tick();
						scrollToBottom(true);
						broadcastSeen();
						fetchChatList();
					}
				}
			})
			.on('broadcast', { event: 'unsend_message' }, (payload) => {
				if (payload.payload && Array.isArray(payload.payload.message_ids)) {
					const delIds = new Set(payload.payload.message_ids);
					messages = messages.filter(m => !delIds.has(m.id));
					fetchChatList();
				}
			})
			.on('broadcast', { event: 'typing' }, (payload) => {
				if (payload.payload && Number(payload.payload.sender_id) === Number(friendId)) {
					const isTyping = Boolean(payload.payload.is_typing);
					if (typingTimeout) clearTimeout(typingTimeout);

					if (isTyping) {
						if (!isOtherUserTyping) {
							playTypingSound();
						}
						isOtherUserTyping = true;
						typingTimeout = setTimeout(() => {
							isOtherUserTyping = false;
						}, 4500);
						tick().then(() => scrollToBottom(true));
					} else {
						isOtherUserTyping = false;
					}
				}
			})
			.on('broadcast', { event: 'seen' }, (payload) => {
				if (payload.payload && Number(payload.payload.reader_id) === Number(friendId)) {
					messages = messages.map(m => m.sender_id === user.id ? { ...m, is_read: true } : m);
					if (activeFriend) {
						activeFriend.last_is_read = true;
					}
					friends = friends.map(f => f.friend_id === friendId ? { ...f, last_is_read: true } : f);
				}
			})
			.subscribe((status) => {
				if (status === 'SUBSCRIBED') {
					broadcastSeen();
				}
			});
	}

	function broadcastSeen() {
		if (!typingChannel || !user || !activeFriend) return;
		try {
			typingChannel.send({
				type: 'broadcast',
				event: 'seen',
				payload: {
					reader_id: user.id
				}
			});
		} catch (e) {}
	}

	function broadcastTyping(isTyping) {
		if (!typingChannel || !user || !activeFriend) return;
		try {
			typingChannel.send({
				type: 'broadcast',
				event: 'typing',
				payload: {
					sender_id: user.id,
					is_typing: isTyping
				}
			});
		} catch (e) {}
	}

	function handleInputTyping() {
		if (!activeFriend) return;
		const hasLetters = newMessageText.trim().length > 0;
		if (hasLetters) {
			broadcastTyping(true);
			if (!myTypingInterval) {
				myTypingInterval = setInterval(() => {
					if (newMessageText.trim().length > 0 && activeFriend) {
						broadcastTyping(true);
					} else {
						stopMyTyping();
					}
				}, 2500);
			}
		} else {
			stopMyTyping();
		}
	}

	function stopMyTyping() {
		if (myTypingInterval) {
			clearInterval(myTypingInterval);
			myTypingInterval = null;
		}
		if (myTypingTimeout) {
			clearTimeout(myTypingTimeout);
			myTypingTimeout = null;
		}
		broadcastTyping(false);
	}

	function updateMobileViewport() {
		if (typeof window !== 'undefined') {
			window.scrollTo(0, 0);
			document.body.scrollTop = 0;
			document.documentElement.scrollTop = 0;
			if (window.visualViewport) {
				mobileViewportHeight = `${window.visualViewport.height}px`;
				mobileViewportTop = `${window.visualViewport.offsetTop || 0}px`;
			} else {
				mobileViewportHeight = `${window.innerHeight}px`;
				mobileViewportTop = '0px';
			}
		}
	}

	function handleInputFocus() {
		updateMobileViewport();
		setTimeout(() => {
			updateMobileViewport();
			if (chatContainer) {
				scrollToBottom(true);
			}
		}, 80);
		setTimeout(() => {
			updateMobileViewport();
			if (chatContainer) {
				scrollToBottom(true);
			}
		}, 280);
	}

	function handleInputBlur() {
		updateMobileViewport();
		if (newMessageText.trim().length === 0) {
			stopMyTyping();
		}
	}

	async function sendFriendRequestFromChat(target) {
		if (!user || !target || isSendingFriendRequest) return;
		isSendingFriendRequest = true;
		try {
			const res = await fetch(API_ENDPOINTS.addFriend, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: user.id,
					friend_username: target.username
				})
			});
			const data = await res.json();
			if (data.error) {
				alert(data.error);
			} else {
				alert(data.message || `Friend request sent to @${target.username}!`);
				fetchChatList();
			}
		} catch (err) {
			console.error('Error sending friend request from chat:', err);
		} finally {
			isSendingFriendRequest = false;
		}
	}

	async function fetchChatList() {
		if (!user) return;
		try {
			const res = await fetch(API_ENDPOINTS.getChatList, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: user.id })
			});
			const data = await res.json();
			if (data.data) {
				friends = data.data.friends || [];
				requests = data.data.requests || [];
				localStorage.setItem(`chronomuse_chat_list_${user.id}`, JSON.stringify(friends));
				localStorage.setItem(`chronomuse_chat_requests_${user.id}`, JSON.stringify(requests));

				if (activeFriend) {
					const allList = [...friends, ...requests];
					const updated = allList.find(f => Number(f.friend_id) === Number(activeFriend.friend_id));
					if (updated) {
						activeFriend.last_activity = updated.last_activity;
						activeFriend.last_message_time = updated.last_message_time;
						activeFriend.last_is_read = updated.last_is_read;
						activeFriend.is_friend = updated.is_friend;
						activeFriend.is_request = updated.is_request;
					}
				}
			}
		} catch (err) {
			console.error('Error fetching chat list:', err);
		} finally {
			isLoading = false;
			isLoadingChatList = false;
		}
	}

	function filteredFriends() {
		let list = [];
		if (chatListFilter === 'all') {
			list = friends;
		} else if (chatListFilter === 'unread') {
			list = [...friends, ...requests].filter(f => (f.unread_count || 0) > 0);
		} else if (chatListFilter === 'requests') {
			list = requests;
		}

		if (searchQuery.trim()) {
			list = list.filter(f => f.username.toLowerCase().includes(searchQuery.toLowerCase()));
		}
		// Sort by most recent message descending (latest conversation at the very top)
		return [...list].sort((a, b) => {
			const timeA = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
			const timeB = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
			if (timeB !== timeA) {
				return timeB - timeA;
			}
			return a.username.localeCompare(b.username);
		});
	}

	async function selectFriend(friend) {
		if (user && Number(friend?.friend_id || friend?.id) === Number(user.id)) return;
		stopMyTyping();
		activeFriend = friend;
		friend.unread_count = 0;
		showEmojiPicker = false;
		isSelectionMode = false;
		selectedMessageIds = new Set();
		replyingTo = null;
		isOtherUserTyping = false;
		messages = [];
		hasMoreMessages = true;

		// Push history state so hardware back button on phone returns to chat list (the screen with all chats)
		if (typeof window !== 'undefined') {
			const chatUrl = `/chat?friend_id=${friend.friend_id}&username=${encodeURIComponent(friend.username)}`;
			history.pushState({ chatOpen: true, friend_id: friend.friend_id }, '', chatUrl);
		}

		initTypingChannel(friend.friend_id);
		await fetchMessages(friend.friend_id, true);
	}

	function handleBackToChatList() {
		stopMyTyping();
		activeFriend = null;
		messages = [];
		isSelectionMode = false;
		selectedMessageIds = new Set();
		replyingTo = null;
		isOtherUserTyping = false;
		if (typeof window !== 'undefined') {
			history.replaceState({ chatOpen: false }, '', '/chat');
		}
	}

	async function fetchMessages(friendId, isInitialLoad = false) {
		if (!user) return;
		if (isInitialLoad) {
			isFetchingMessages = true;
		}
		try {
			const res = await fetch(API_ENDPOINTS.getMessages, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: user.id, friend_id: friendId, limit: 20 })
			});
			const data = await res.json();
			if (data.data && data.data.messages) {
				const serverMessages = (data.data.messages || []).filter(m => !removedMessageIds.has(m.id));
				
				if (isInitialLoad) {
					hasMoreMessages = Boolean(data.data.has_more);
					messages = serverMessages;
					await tick();
					scrollToBottom(false);
				} else {
					// Polling merge: Avoid duplicates and preserve older prepended messages
					const existingIds = new Set(messages.map(m => m.id));
					const newIncoming = serverMessages.filter(sm => !existingIds.has(sm.id));

					// Preserve pending optimistic temporary messages
					const pendingTempMessages = messages.filter(m => 
						String(m.id).startsWith('temp-') && 
						!serverMessages.some(sm => sm.message === m.message && sm.sender_id === m.sender_id)
					);

					const updatedExisting = messages.filter(m => !String(m.id).startsWith('temp-')).map(m => {
						const found = serverMessages.find(sm => sm.id === m.id);
						return found ? { ...m, is_read: found.is_read } : m;
					});

					const isAtBottom = chatContainer ? (chatContainer.scrollHeight - chatContainer.scrollTop <= chatContainer.clientHeight + 80) : true;
					messages = [...updatedExisting, ...newIncoming, ...pendingTempMessages];

					if (newIncoming.length > 0) {
						if (newIncoming.some(sm => sm.sender_id !== user.id)) {
							playIncomingMessageSound();
						}
						if (isAtBottom) {
							await tick();
							scrollToBottom(true);
						}
					}
				}

				broadcastSeen();
			}
		} catch (err) {
			console.error('Error fetching messages:', err);
		} finally {
			isFetchingMessages = false;
		}
	}

	async function handleChatScroll() {
		if (!chatContainer || isLoadingOlder || !hasMoreMessages || !activeFriend) return;
		if (chatContainer.scrollTop <= 40) {
			await loadOlderMessages();
		}
	}

	async function loadOlderMessages() {
		if (isLoadingOlder || !hasMoreMessages || !activeFriend || messages.length === 0) return;
		const oldestMsg = messages.find(m => typeof m.id === 'number' || !String(m.id).startsWith('temp-'));
		if (!oldestMsg) return;

		isLoadingOlder = true;
		const oldScrollHeight = chatContainer ? chatContainer.scrollHeight : 0;
		const oldScrollTop = chatContainer ? chatContainer.scrollTop : 0;

		try {
			const res = await fetch(API_ENDPOINTS.getMessages, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: user.id,
					friend_id: activeFriend.friend_id,
					limit: 20,
					before_id: oldestMsg.id
				})
			});
			const data = await res.json();
			if (data.data && data.data.messages) {
				const olderMessages = (data.data.messages || []).filter(m => !removedMessageIds.has(m.id));
				hasMoreMessages = Boolean(data.data.has_more);

				if (olderMessages.length > 0) {
					const existingIds = new Set(messages.map(m => m.id));
					const uniqueOlder = olderMessages.filter(m => !existingIds.has(m.id));
					messages = [...uniqueOlder, ...messages];

					await tick();
					if (chatContainer) {
						chatContainer.scrollTop = chatContainer.scrollHeight - oldScrollHeight + oldScrollTop;
					}
				}
			}
		} catch (err) {
			console.error('Error loading older messages:', err);
		} finally {
			isLoadingOlder = false;
		}
	}

	function scrollToBottom(smooth = false) {
		if (chatContainer) {
			chatContainer.scrollTo({
				top: chatContainer.scrollHeight,
				behavior: smooth ? 'smooth' : 'auto'
			});
		}
	}

	async function sendMessage(textCustom) {
		const textToSend = textCustom || newMessageText.trim();
		if (!textToSend || !activeFriend || isSending) return;

		let formattedMessage = textToSend;
		if (replyingTo && !textCustom) {
			const replyPayloadText = replyingTo.isImage ? '📷 Photo' : replyingTo.text;
			formattedMessage = `[REPLY id="${replyingTo.id}" user="${replyingTo.sender_name}" text="${encodeURIComponent(replyPayloadText)}"]${textToSend}[/REPLY]`;
			replyingTo = null;
		}

		if (!textCustom) newMessageText = '';
		showEmojiPicker = false;
		isSending = true;
		stopMyTyping();
		playMessageSentSound();

		// Notify recipient's inbox channel for real-time sound trigger even if they are outside this chat
		try {
			const recipientInbox = supabase.channel(`chronomuse_user_inbox_${activeFriend.friend_id}`);
			recipientInbox.subscribe((status) => {
				if (status === 'SUBSCRIBED') {
					recipientInbox.send({
						type: 'broadcast',
						event: 'new_message',
						payload: {
							sender_id: user.id,
							receiver_id: activeFriend.friend_id,
							message: formattedMessage
						}
					}).then(() => {
						setTimeout(() => {
							try { supabase.removeChannel(recipientInbox); } catch (e) {}
						}, 800);
					});
				}
			});
		} catch (e) {}

		// Instant optimistic message insertion with enter animation
		const tempId = `temp-${Date.now()}`;
		const tempMsg = {
			id: tempId,
			sender_id: user.id,
			receiver_id: activeFriend.friend_id,
			message: formattedMessage,
			created_at: new Date().toISOString(),
			is_new: true
		};

		messages = [...messages, tempMsg];

		// Direct broadcast over active typingChannel for 0ms delivery if friend is currently inside chat
		if (typingChannel) {
			try {
				typingChannel.send({
					type: 'broadcast',
					event: 'direct_message',
					payload: tempMsg
				});
			} catch (e) {}
		}

		// Instantly bump activeFriend to the top of friends list with the new message preview
		const nowIso = new Date().toISOString();
		friends = [
			{
				...activeFriend,
				last_message: formattedMessage,
				last_message_time: nowIso,
				last_sender_id: user.id,
				last_is_read: false
			},
			...friends.filter(f => f.friend_id !== activeFriend.friend_id)
		];

		await tick();
		scrollToBottom(true);

		try {
			const res = await fetch(API_ENDPOINTS.sendMessage, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: user.id,
					friend_id: activeFriend.friend_id,
					message: formattedMessage
				})
			});
			const data = await res.json();
			if (data.success && data.data) {
				messages = messages.map(m => m.id === tempId ? { ...data.data, is_new: true } : m);
				await tick();
				scrollToBottom(true);
				fetchChatList();
			}
		} catch (err) {
			console.error('Error sending message:', err);
		} finally {
			isSending = false;
		}
	}

	// Long-press and Multi-Select handling
	function startLongPress(msg) {
		longPressTimer = setTimeout(() => {
			isSelectionMode = true;
			toggleMessageSelection(msg.id);
			if (typeof navigator !== 'undefined' && navigator.vibrate) {
				navigator.vibrate(50);
			}
		}, 450);
	}

	function cancelLongPress() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	function toggleMessageSelection(msgId) {
		const next = new Set(selectedMessageIds);
		if (next.has(msgId)) {
			next.delete(msgId);
		} else {
			next.add(msgId);
		}
		selectedMessageIds = next;
	}

	function handleMessageClick(msg) {
		if (wasSwiping) return;
		if (isSelectionMode) {
			toggleMessageSelection(msg.id);
		}
	}

	function exitSelectionMode() {
		isSelectionMode = false;
		selectedMessageIds = new Set();
	}

	// Unsend for Everyone (Deletes from DB)
	async function unsendSelectedMessages() {
		if (selectedMessageIds.size === 0 || isDeletingMessages) return;

		const idsToDelete = Array.from(selectedMessageIds);
		const validIds = messages
			.filter(m => idsToDelete.includes(m.id) && m.sender_id === user.id)
			.map(m => m.id);

		if (validIds.length === 0) {
			alert('You can only unsend messages that you sent.');
			return;
		}

		isDeletingMessages = true;
		messages = messages.filter(m => !validIds.includes(m.id));
		exitSelectionMode();

		if (typingChannel) {
			try {
				typingChannel.send({
					type: 'broadcast',
					event: 'unsend_message',
					payload: { message_ids: validIds, sender_id: user.id }
				});
			} catch (e) {}
		}

		try {
			await fetch(API_ENDPOINTS.deleteMessages, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: user.id,
					message_ids: validIds
				})
			});
			fetchChatList();
		} catch (err) {
			console.error('Error unsending messages:', err);
		} finally {
			isDeletingMessages = false;
		}
	}

	// Remove for Me (Hides locally for current user)
	function removeSelectedForMe() {
		if (selectedMessageIds.size === 0) return;
		const idsToRemove = Array.from(selectedMessageIds);
		const newRemoved = new Set(removedMessageIds);
		idsToRemove.forEach(id => newRemoved.add(id));
		removedMessageIds = newRemoved;
		saveRemovedMessages();

		messages = messages.filter(m => !idsToRemove.includes(m.id));
		exitSelectionMode();
	}

	// Swipe to reply gestures with smooth real-time tracking & recoil
	function handleDragStart(clientX, clientY, msg) {
		if (isSelectionMode) return;
		startDragX = clientX;
		startDragY = clientY;
		swipingMessageId = msg.id;
		swipeOffset = 0;
		isSwipeThresholdReached = false;
		isResettingSwipe = false;
		isDragging = true;
		isGestureLocked = false;
		isHorizontalSwipe = false;
		startLongPress(msg);
	}

	function handleDragMove(clientX, clientY, msg, originalEvent) {
		if (!isDragging || swipingMessageId !== msg.id) return;
		const diffX = clientX - startDragX;
		const diffY = clientY - startDragY;
		const isUserSender = msg.sender_id === user.id;

		// Cancel long press when moving
		if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) {
			cancelLongPress();
		}

		// Lock gesture direction once movement exceeds threshold:
		// For own message (right side): swipe left (diffX < -8)
		// For kausap message (left side): swipe right (diffX > 8)
		if (!isGestureLocked) {
			if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) {
				isGestureLocked = true;
				const isCorrectSwipeDirection = isUserSender ? (diffX < -8) : (diffX > 8);
				if (isCorrectSwipeDirection && Math.abs(diffX) > Math.abs(diffY) * 1.1) {
					isHorizontalSwipe = true;
				} else {
					isHorizontalSwipe = false;
				}
			}
		}

		if (isHorizontalSwipe) {
			if (originalEvent && originalEvent.cancelable) {
				originalEvent.preventDefault();
			}

			let rawOffset = 0;
			if (isUserSender) {
				// Own message: diffX is negative when dragging left
				if (diffX < 0) {
					const mag = Math.abs(diffX);
					if (mag <= SWIPE_THRESHOLD) {
						rawOffset = -mag;
					} else {
						rawOffset = -(SWIPE_THRESHOLD + (mag - SWIPE_THRESHOLD) * 0.35);
					}
				}
				swipeOffset = Math.max(Math.min(rawOffset, 0), -SWIPE_MAX);
			} else {
				// Kausap message: diffX is positive when dragging right
				if (diffX > 0) {
					if (diffX <= SWIPE_THRESHOLD) {
						rawOffset = diffX;
					} else {
						rawOffset = SWIPE_THRESHOLD + (diffX - SWIPE_THRESHOLD) * 0.35;
					}
				}
				swipeOffset = Math.min(Math.max(rawOffset, 0), SWIPE_MAX);
			}

			const reached = Math.abs(swipeOffset) >= SWIPE_THRESHOLD;
			if (reached && !isSwipeThresholdReached) {
				isSwipeThresholdReached = true;
				if (typeof navigator !== 'undefined' && navigator.vibrate) {
					try { navigator.vibrate(25); } catch (e) {}
				}
			} else if (!reached && isSwipeThresholdReached) {
				isSwipeThresholdReached = false;
			}
		}
	}

	function handleDragEnd(msg) {
		cancelLongPress();
		if (!isDragging) return;
		isDragging = false;

		if (swipingMessageId === msg.id && isHorizontalSwipe) {
			wasSwiping = true;
			setTimeout(() => { wasSwiping = false; }, 160);

			const shouldReply = Math.abs(swipeOffset) >= SWIPE_THRESHOLD && !isSelectionMode;
			if (shouldReply) {
				triggerReply(msg);
			}

			// Smooth recoil / spring return animation
			isResettingSwipe = true;
			swipeOffset = 0;
			isSwipeThresholdReached = false;

			setTimeout(() => {
				if (isResettingSwipe) {
					swipingMessageId = null;
					isResettingSwipe = false;
				}
			}, 320);
		} else {
			swipingMessageId = null;
			swipeOffset = 0;
			isSwipeThresholdReached = false;
		}

		isGestureLocked = false;
		isHorizontalSwipe = false;
	}

	function triggerReply(msg) {
		const parsed = parseMessage(msg.message);
		const replyText = parsed.isImage ? '📷 Photo' : (parsed.text || 'Photo / Attachment');
		replyingTo = {
			id: msg.id,
			sender_name: msg.sender_id === user.id ? 'You' : activeFriend.username,
			text: replyText,
			isImage: parsed.isImage,
			imageUrl: parsed.isImage ? parsed.imageUrl : null
		};
		tick().then(() => {
			if (messageInputRef) {
				messageInputRef.focus();
			}
		});
	}

	function cancelReply() {
		replyingTo = null;
	}

	async function handleImageUpload(e) {
		const files = Array.from(e.target.files || []);
		if (files.length === 0 || !activeFriend) return;

		isUploadingImage = true;
		try {
			for (const file of files) {
				const fileExt = file.name.split('.').pop();
				const fileName = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
				const filePath = `${user.id}/${fileName}`;

				const { error: uploadError } = await supabase.storage
					.from('memories')
					.upload(filePath, file);

				if (uploadError) {
					console.error('Image upload failed:', file.name, uploadError.message);
					alert('Image upload failed: ' + uploadError.message);
					continue;
				}

				const { data: urlData } = supabase.storage.from('memories').getPublicUrl(filePath);
				const imageUrl = urlData.publicUrl;

				await sendMessage(`[IMG]${imageUrl}[/IMG]`);
			}
		} catch (err) {
			console.error('Error uploading chat image:', err);
			alert('Failed to upload image. Please try again.');
		} finally {
			isUploadingImage = false;
			if (imageInput) imageInput.value = '';
		}
	}

	async function downloadChatImage(url) {
		if (!url) return;
		try {
			const res = await fetch(url);
			const blob = await res.blob();
			const blobUrl = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = blobUrl;
			link.download = `chronomuse_photo_${Date.now()}.jpg`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(blobUrl);
		} catch (e) {
			window.open(url, '_blank');
		}
	}

	// Photo Gallery Viewer & Zoom functions

	let chatImagesList = $derived(() => {
		const list = [];
		for (const msg of messages) {
			const parsed = parseMessage(msg.message);
			if (parsed.isImage && parsed.imageUrl) {
				list.push({
					id: msg.id,
					url: parsed.imageUrl,
					senderId: msg.sender_id,
					time: msg.created_at
				});
			}
		}
		return list;
	});

	function resetZoomAndPan() {
		zoomScale = 1;
		baseScale = 1;
		panX = 0;
		panY = 0;
		basePanX = 0;
		basePanY = 0;
		isTouching = false;
		isMouseDragging = false;
	}

	function openImageViewer(imageUrl) {
		const imgs = chatImagesList();
		const idx = imgs.findIndex(img => img.url === imageUrl);
		viewingImageIndex = idx !== -1 ? idx : 0;
		resetZoomAndPan();
	}

	function closeImageViewer() {
		viewingImageIndex = -1;
		resetZoomAndPan();
	}

	function prevImage() {
		const imgs = chatImagesList();
		if (imgs.length === 0) return;
		if (viewingImageIndex > 0) {
			viewingImageIndex--;
			resetZoomAndPan();
		}
	}

	function nextImage() {
		const imgs = chatImagesList();
		if (imgs.length === 0) return;
		if (viewingImageIndex < imgs.length - 1) {
			viewingImageIndex++;
			resetZoomAndPan();
		}
	}

	function handleViewerKeydown(e) {
		if (viewingImageIndex === -1) return;
		if (e.key === 'Escape') {
			closeImageViewer();
		} else if (e.key === 'ArrowLeft') {
			prevImage();
		} else if (e.key === 'ArrowRight') {
			nextImage();
		}
	}

	function handleViewerWheel(e) {
		if (viewingImageIndex === -1) return;
		e.preventDefault();
		if (e.deltaY < 0) {
			zoomScale = Math.min(5, zoomScale + 0.25);
		} else {
			zoomScale = Math.max(1, zoomScale - 0.25);
		}
		if (zoomScale === 1) {
			panX = 0;
			panY = 0;
		}
		baseScale = zoomScale;
		basePanX = panX;
		basePanY = panY;
	}

	function toggleZoomAtPoint(e) {
		if (zoomScale > 1) {
			resetZoomAndPan();
		} else {
			zoomScale = 2.5;
			baseScale = 2.5;
			if (e && e.clientX && e.clientY && e.currentTarget) {
				const rect = e.currentTarget.getBoundingClientRect();
				const offsetX = e.clientX - (rect.left + rect.width / 2);
				const offsetY = e.clientY - (rect.top + rect.height / 2);
				panX = Math.round(-offsetX * 1.15);
				panY = Math.round(-offsetY * 1.15);
				basePanX = panX;
				basePanY = panY;
			}
		}
	}

	function handleViewerTouchStart(e) {
		if (e.touches.length === 1) {
			isTouching = true;
			touchStartX = e.touches[0].clientX;
			touchStartY = e.touches[0].clientY;
			basePanX = panX;
			basePanY = panY;
		} else if (e.touches.length === 2) {
			isTouching = true;
			baseScale = zoomScale;
			basePanX = panX;
			basePanY = panY;
			touchDistStart = Math.hypot(
				e.touches[0].clientX - e.touches[1].clientX,
				e.touches[0].clientY - e.touches[1].clientY
			);
			touchCenterStartX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
			touchCenterStartY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
		}
	}

	function handleViewerTouchMove(e) {
		if (e.touches.length === 2 && touchDistStart > 0) {
			if (e.cancelable) e.preventDefault();
			isTouching = true;
			const currentDist = Math.hypot(
				e.touches[0].clientX - e.touches[1].clientX,
				e.touches[0].clientY - e.touches[1].clientY
			);
			const currentCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
			const currentCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

			const ratio = currentDist / touchDistStart;
			const newScale = Math.min(5, Math.max(1, baseScale * ratio));
			zoomScale = newScale;

			const deltaCenterX = currentCenterX - touchCenterStartX;
			const deltaCenterY = currentCenterY - touchCenterStartY;
			panX = basePanX + deltaCenterX;
			panY = basePanY + deltaCenterY;
		} else if (e.touches.length === 1 && zoomScale > 1.05) {
			if (e.cancelable) e.preventDefault();
			isTouching = true;
			const deltaX = e.touches[0].clientX - touchStartX;
			const deltaY = e.touches[0].clientY - touchStartY;
			panX = basePanX + deltaX;
			panY = basePanY + deltaY;
		}
	}

	function handleViewerTouchEnd(e) {
		if (e.touches.length < 2) {
			baseScale = zoomScale;
			basePanX = panX;
			basePanY = panY;
		}

		if (e.touches.length === 0) {
			isTouching = false;
		}

		if (e.changedTouches.length === 1 && zoomScale <= 1.05) {
			const touchEndX = e.changedTouches[0].clientX;
			const touchEndY = e.changedTouches[0].clientY;
			const deltaX = touchEndX - touchStartX;
			const deltaY = touchEndY - touchStartY;

			if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 80) {
				if (deltaX < 0) {
					nextImage();
				} else {
					prevImage();
				}
			}
		}
		touchDistStart = 0;
	}

	function handleMouseDown(e) {
		if (zoomScale <= 1) return;
		isMouseDragging = true;
		touchStartX = e.clientX;
		touchStartY = e.clientY;
		basePanX = panX;
		basePanY = panY;
	}

	function handleMouseMove(e) {
		if (!isMouseDragging || zoomScale <= 1) return;
		const deltaX = e.clientX - touchStartX;
		const deltaY = e.clientY - touchStartY;
		panX = basePanX + deltaX;
		panY = basePanY + deltaY;
	}

	function handleMouseUp() {
		isMouseDragging = false;
		basePanX = panX;
		basePanY = panY;
	}

	async function clearConversation() {
		if (!activeFriend || isClearing) return;
		isClearing = true;
		try {
			await fetch(API_ENDPOINTS.deleteConversation, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: user.id,
					friend_id: activeFriend.friend_id
				})
			});

			try {
				await supabase
					.from('chronomuse_messages')
					.delete()
					.or(`and(sender_id.eq.${user.id},receiver_id.eq.${activeFriend.friend_id}),and(sender_id.eq.${activeFriend.friend_id},receiver_id.eq.${user.id})`);
			} catch (sErr) {}

			messages = [];
			fetchChatList();
		} catch (err) {
			console.error('Error clearing conversation:', err);
		} finally {
			isClearing = false;
			showClearModal = false;
		}
	}

	function insertEmoji(emoji) {
		newMessageText += emoji;
	}

	function formatTime(dateStr) {
		if (!dateStr) return '';
		const d = new Date(dateStr);
		return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	// Always displays clear readable dates instead of ambiguous 'Yesterday'
	function formatDateDivider(dateStr) {
		if (!dateStr) return '';
		const d = new Date(dateStr);
		const today = new Date();

		if (d.toDateString() === today.toDateString()) {
			return `Today • ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
		} else {
			return d.toLocaleDateString('en-US', {
				weekday: 'short',
				month: 'short',
				day: 'numeric',
				year: 'numeric'
			});
		}
	}

	function formatFriendListDate(dateStr) {
		if (!dateStr) return '';
		const d = new Date(dateStr);
		const today = new Date();

		if (d.toDateString() === today.toDateString()) {
			return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		} else {
			return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		}
	}

	function isNewDay(index) {
		if (index === 0) return true;
		const prevDate = new Date(messages[index - 1].created_at).toDateString();
		const currDate = new Date(messages[index].created_at).toDateString();
		return prevDate !== currDate;
	}

	function isImageUrl(text) {
		return text.startsWith('[IMG]') && text.endsWith('[/IMG]');
	}

	function extractImageUrl(text) {
		return text.replace('[IMG]', '').replace('[/IMG]', '');
	}

	function getReplyDetails(rawReplyText) {
		if (!rawReplyText) return { isImage: false, text: '', imageUrl: '' };
		const isImg = isImageUrl(rawReplyText) || rawReplyText.includes('[IMG]') || rawReplyText.includes('.supabase.co') || rawReplyText.includes('📷 Photo');
		if (isImg) {
			const cleanUrl = extractImageUrl(rawReplyText);
			const hasValidUrl = cleanUrl && (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://'));
			return {
				isImage: true,
				text: '📷 Photo',
				imageUrl: hasValidUrl ? cleanUrl : ''
			};
		}
		return {
			isImage: false,
			text: rawReplyText,
			imageUrl: ''
		};
	}

	function parseMessage(text) {
		if (!text) return { reply: null, text: '', isImage: false, imageUrl: '' };
		
		let replyData = null;
		let cleanText = text;

		const replyRegex = /^\[REPLY id="([^"]*)" user="([^"]*)" text="([^"]*)"\]([\s\S]*?)\[\/REPLY\]/;
		const match = text.match(replyRegex);

		if (match) {
			replyData = {
				id: match[1],
				user: match[2],
				text: decodeURIComponent(match[3])
			};
			cleanText = match[4];
		}

		const isImage = isImageUrl(cleanText);
		const imageUrl = isImage ? extractImageUrl(cleanText) : '';

		return {
			reply: replyData,
			text: cleanText,
			isImage,
			imageUrl
		};
	}

	function formatLastMessagePreview(text) {
		if (!text) return 'Tap to start chatting';
		const parsed = parseMessage(text);
		if (parsed.isImage) return '📷 Photo attachment';
		if (parsed.reply) {
			return `↩ ${parsed.text}`;
		}
		return parsed.text;
	}

	function handleLogout() {
		if (presenceChannel) {
			try {
				presenceChannel.untrack();
				supabase.removeChannel(presenceChannel);
			} catch (e) {}
		}
		if (typingChannel) {
			try {
				supabase.removeChannel(typingChannel);
			} catch (e) {}
		}
		if (user) {
			updateServerActivity(false);
		}
		try {
			supabase.removeAllChannels();
		} catch (e) {}

		// Preserve user active status setting before wiping local storage
		const savedActiveStatus = user?.id ? localStorage.getItem(`chronomuse_active_status_${user.id}`) : null;
		const savedPrivateStatus = user?.id ? localStorage.getItem(`chronomuse_private_${user.id}`) : null;

		localStorage.clear();
		sessionStorage.clear();

		if (user?.id) {
			if (savedActiveStatus !== null) localStorage.setItem(`chronomuse_active_status_${user.id}`, savedActiveStatus);
			if (savedPrivateStatus !== null) localStorage.setItem(`chronomuse_private_${user.id}`, savedPrivateStatus);
		}

		if (typeof window !== 'undefined') {
			window.dispatchEvent(new Event('chronomuse_auth_change'));
		}
		goto('/');
	}
</script>

<svelte:head>
	<title>Chat - ChronoMuse</title>
</svelte:head>

<div
	style={activeFriend !== null ? `height: ${mobileViewportHeight}; top: ${mobileViewportTop};` : ''}
	class="bg-gradient-to-br from-pink-100 via-pink-200 to-pink-300 flex flex-col font-sans animate-fade-in {activeFriend !== null ? 'fixed inset-x-0 bottom-auto z-40 w-full overflow-hidden overscroll-none md:static md:z-auto md:h-auto md:min-h-screen md:top-auto md:w-auto' : 'min-h-screen'}"
>
	<!-- Top Navigation (Hidden on mobile when chat is open, always visible on desktop) -->
	<nav class="bg-white/85 backdrop-blur-md border-b-2 border-pink-300 shadow-lg sticky top-0 z-50 animate-slide-down {activeFriend !== null ? 'hidden md:block' : 'block'}">
		<div class="container mx-auto px-4 py-3 flex items-center justify-between">
			<div class="flex items-center space-x-2.5">
				<button
					onclick={() => sidebarOpen = !sidebarOpen}
					class="p-1.5 sm:p-2 text-pink-600 hover:bg-pink-100/70 rounded-lg transition-colors flex-shrink-0 active:scale-95 relative"
					aria-label="Toggle menu"
					title="Toggle menu"
				>
					{#if sidebarOpen}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
							<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
						</svg>
					{/if}
					{#if unreadTotal > 0}
						<span class="absolute top-1 right-1 w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-white animate-pulse"></span>
					{/if}
				</button>
				<img src="/logo.png" alt="ChronoMuse" class="w-9 h-9 sm:w-10 sm:h-10 rounded-md object-contain flex-shrink-0" />
				<span class="text-base sm:text-lg font-bold text-pink-600 tracking-tight">ChronoMuse</span>
			</div>

			<div class="flex items-center space-x-2 sm:space-x-4 flex-shrink-0 ml-2">
				<button
					onclick={() => goto('/profile')}
					class="hidden md:block text-pink-700 hover:text-pink-900 transition-colors font-medium cursor-pointer text-left active:scale-95"
					title="View Profile"
				>
					<span class="text-sm">Welcome, <strong>{user?.username}</strong></span>
				</button>
				<button
					onclick={() => goto('/settings')}
					class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-pink-100 hover:bg-pink-200 border border-pink-300 text-pink-600 shadow-2xs flex items-center justify-center transition-all cursor-pointer active:scale-95 flex-shrink-0"
					title="Settings"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-5 h-5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
						<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
					</svg>
				</button>
			</div>
		</div>
	</nav>

	<!-- Sidebar -->
	<Sidebar
		bind:isOpen={sidebarOpen}
		on:home={() => goto('/dashboard')}
		on:moodGraph={() => goto('/mood-graph')}
		on:logout={handleLogout}
	/>

	<!-- Chat Body Container -->
	<div class="flex-grow flex flex-col md:flex-row overflow-hidden {activeFriend !== null ? 'p-0 w-full h-full max-w-full md:container md:mx-auto md:px-4 md:py-4 md:max-w-7xl md:gap-4 md:h-[calc(100vh-5rem)]' : 'container mx-auto px-2 sm:px-4 py-3 sm:py-4 max-w-7xl gap-3 sm:gap-4 h-[calc(100vh-4.5rem)] sm:h-[calc(100vh-5rem)]'}">
		
		<!-- Left Panel: Friends & Search -->
		<div class="w-full md:w-84 lg:w-96 flex-shrink-0 bg-white/95 backdrop-blur-md border-2 border-pink-300 rounded-2xl shadow-md flex flex-col overflow-hidden animate-fade-in-up" class:hidden={activeFriend !== null} class:md:flex={true} style="animation-delay: 0.05s">
			<!-- Conversations Header -->
			<div class="p-3.5 sm:p-4 bg-gradient-to-r from-pink-100 via-pink-200 to-pink-300 text-pink-950 border-b border-pink-300 font-bold text-sm sm:text-base flex items-center justify-between shadow-2xs">
				<div class="flex items-center space-x-2">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 text-pink-600">
						<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
					</svg>
					<span>Messages</span>
				</div>
				<span class="text-xs bg-pink-200/80 text-pink-700 px-2 py-0.5 rounded-full font-bold border border-pink-300">{friends.length + requests.length}</span>
			</div>

			<!-- Search Bar -->
			<div class="p-2.5 sm:p-3 border-b border-pink-100 bg-pink-50/30 space-y-2">
				<div class="relative">
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search conversations..."
						class="w-full pl-8 pr-3 py-2 bg-white border border-pink-200 rounded-xl text-pink-900 placeholder-pink-400/60 text-xs focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-300 transition-all font-medium"
					/>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-pink-400 absolute left-2.5 top-2.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
					</svg>
				</div>

				<!-- All / Unread / Requests Filter Tabs -->
				<div class="grid grid-cols-3 gap-1 p-1 bg-pink-100/70 rounded-xl border border-pink-200/80">
					<button
						onclick={() => chatListFilter = 'all'}
						class="py-1.5 px-1.5 rounded-lg text-xs font-bold transition-all duration-150 flex items-center justify-center space-x-1 active:scale-95 text-center {chatListFilter === 'all' ? 'bg-pink-500 text-white shadow-xs' : 'text-pink-600 hover:bg-pink-200/60'}"
					>
						<span>Friends</span>
						<span class="text-[10px] px-1.5 py-0.2 rounded-full {chatListFilter === 'all' ? 'bg-white/20 text-white' : 'bg-pink-200 text-pink-700 font-bold'}">
							{friends.length}
						</span>
					</button>

					<button
						onclick={() => chatListFilter = 'unread'}
						class="py-1.5 px-1.5 rounded-lg text-xs font-bold transition-all duration-150 flex items-center justify-center space-x-1 active:scale-95 text-center relative {chatListFilter === 'unread' ? 'bg-pink-500 text-white shadow-xs' : 'text-pink-600 hover:bg-pink-200/60'}"
					>
						<span>Unread</span>
						{#if unreadFriendsCount + unreadRequestsCount > 0}
							<span class="text-[10px] px-1.5 py-0.2 rounded-full font-bold {chatListFilter === 'unread' ? 'bg-white text-pink-600' : 'bg-pink-500 text-white animate-pulse'}">
								{unreadFriendsCount + unreadRequestsCount}
							</span>
						{:else}
							<span class="text-[10px] px-1.5 py-0.2 rounded-full {chatListFilter === 'unread' ? 'bg-white/20 text-white' : 'bg-pink-200 text-pink-700 font-bold'}">
								0
							</span>
						{/if}
					</button>

					<button
						onclick={() => chatListFilter = 'requests'}
						class="py-1.5 px-1.5 rounded-lg text-xs font-bold transition-all duration-150 flex items-center justify-center space-x-1 active:scale-95 text-center relative {chatListFilter === 'requests' ? 'bg-pink-500 text-white shadow-xs' : 'text-pink-600 hover:bg-pink-200/60'}"
					>
						<span>Requests</span>
						{#if requests.length > 0}
							<span class="text-[10px] px-1.5 py-0.2 rounded-full font-bold {chatListFilter === 'requests' ? 'bg-white text-pink-600' : unreadRequestsCount > 0 ? 'bg-rose-500 text-white animate-pulse' : 'bg-pink-200 text-pink-700'}">
								{requests.length}
							</span>
						{:else}
							<span class="text-[10px] px-1.5 py-0.2 rounded-full {chatListFilter === 'requests' ? 'bg-white/20 text-white' : 'bg-pink-200 text-pink-700 font-bold'}">
								0
							</span>
						{/if}
					</button>
				</div>
			</div>

			<!-- Friends List -->
			<div class="flex-grow overflow-y-auto divide-y divide-pink-50">
				{#if isLoadingChatList && friends.length === 0 && requests.length === 0}
					<div class="p-8 text-center text-pink-400 text-sm flex flex-col items-center">
						<div class="animate-spin w-7 h-7 border-3 border-pink-300 border-t-pink-500 rounded-full mb-2"></div>
						<span>Loading conversations...</span>
					</div>
				{:else if !isLoadingChatList && filteredFriends().length === 0}
					<div class="p-8 text-center text-pink-400 text-xs">
						{#if chatListFilter === 'unread'}
							<p class="font-semibold text-pink-700 text-sm mb-1">No unread chats</p>
							<p class="text-pink-400/80">You're all caught up!</p>
						{:else if chatListFilter === 'requests'}
							<div class="flex flex-col items-center">
								<p class="font-semibold text-pink-700 text-sm mb-1">No message requests</p>
								<p class="text-pink-400/80">Messages from people who aren't your friends yet will appear here.</p>
							</div>
						{:else if searchQuery.trim()}
							<p class="font-semibold text-pink-700 text-sm mb-1">No conversations found</p>
							<p class="text-pink-400/80">No results for "{searchQuery}"</p>
						{:else}
							<p class="font-semibold text-pink-700 text-sm mb-1">No friends found</p>
							<p class="text-pink-400/80">Add friends from the Friends menu to start chatting!</p>
						{/if}
					</div>
				{:else}
					{#each filteredFriends() as friend (friend.friend_id)}
						{@const isActive = isRecentActive(friend)}
						{@const isSelected = activeFriend?.friend_id === friend.friend_id}
						{@const isSentByMe = friend.last_sender_id === user?.id}
						{@const isUnread = friend.unread_count > 0}
						<button
							onclick={() => selectFriend(friend)}
							class="w-full p-3 sm:p-3.5 flex items-center space-x-3 transition-all text-left relative group {isSelected ? 'bg-gradient-to-r from-pink-100/90 to-pink-50/70 border-l-4 border-pink-500 shadow-2xs' : 'hover:bg-pink-50/60'}"
						>
							<div class="relative flex-shrink-0">
								<div class="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br from-pink-100 to-pink-200 text-pink-700 border border-pink-200/90 flex items-center justify-center font-bold text-sm sm:text-base shadow-2xs group-hover:scale-105 transition-transform overflow-hidden">
									{#if friend.avatar_url}
										<img src={friend.avatar_url} alt={friend.username} class="w-full h-full object-cover" />
									{:else}
										{friend.username.charAt(0).toUpperCase()}
									{/if}
								</div>
								<!-- Active / Offline Status Dot -->
								{#if isActive}
									<span class="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white shadow-2xs animate-pulse" title="Active now"></span>
								{:else}
									<span class="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-pink-200 border-2 border-white" title={formatLastActive(friend)}></span>
								{/if}
							</div>
							<div class="flex-grow min-w-0">
								<div class="flex items-center justify-between">
									<div class="flex items-center space-x-1.5 min-w-0 flex-grow pr-1">
										<p class="text-sm font-semibold truncate transition-colors {isUnread ? 'font-bold text-pink-950' : isSelected ? 'font-bold text-pink-700' : 'text-pink-900 group-hover:text-pink-600'}">
											@{friend.username}
										</p>
										{#if friend.is_request || !friend.is_friend}
											<span class="inline-flex items-center text-[9px] font-bold text-amber-700 bg-amber-100 border border-amber-300/80 px-1.5 py-0.2 rounded-full flex-shrink-0">
												Request
											</span>
										{/if}
									</div>
									{#if friend.last_message_time}
										<span class="text-[10px] font-medium ml-1 flex-shrink-0 {isUnread ? 'text-pink-600 font-bold' : 'text-pink-400/80'}">
											{formatFriendListDate(friend.last_message_time)}
										</span>
									{/if}
								</div>
								<div class="flex items-center justify-between mt-0.5 min-w-0">
									<p class="text-xs truncate flex items-center gap-1 min-w-0 {isUnread ? 'font-semibold text-pink-900' : 'text-pink-800/70'}">
										{#if activeFriend?.friend_id === friend.friend_id && isOtherUserTyping}
											<span class="text-pink-500 font-semibold italic animate-pulse">typing...</span>
										{:else}
											{#if isSentByMe && friend.last_message}
												{#if friend.last_is_read}
													<!-- Seen indicator -->
													<span class="inline-flex items-center text-pink-500 font-medium text-[11px] flex-shrink-0" title="Seen">
														<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5 text-pink-500 mr-0.5">
															<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
														</svg>
														<span class="text-[10px] font-semibold text-pink-500">Seen:</span>
													</span>
												{:else}
													<!-- Sent indicator -->
													<span class="inline-flex items-center text-pink-400 text-[11px] flex-shrink-0" title="Sent">
														<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3 text-pink-400 mr-0.5">
															<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
														</svg>
														<span class="text-[10px] text-pink-400">Sent:</span>
													</span>
												{/if}
											{/if}
											<span class="truncate">{formatLastMessagePreview(friend.last_message)}</span>
										{/if}
									</p>

									{#if isUnread}
										<span class="ml-1.5 px-1.5 py-0.2 bg-gradient-to-r from-pink-500 to-rose-500 text-white text-[10px] font-bold rounded-full shadow-2xs flex-shrink-0 animate-pulse">
											{friend.unread_count}
										</span>
									{/if}
								</div>
							</div>
						</button>
					{/each}
				{/if}
			</div>
		</div>

		<!-- Right Panel: Active Chat Stream -->
		<div
			class="flex-grow bg-white/95 backdrop-blur-md flex flex-col overflow-hidden relative animate-fade-in-up {activeFriend !== null ? 'h-full w-full rounded-none border-0 shadow-none md:h-full md:rounded-2xl md:border-2 md:border-pink-300 md:shadow-md' : 'border-2 border-pink-300 rounded-2xl shadow-md'}"
			class:hidden={activeFriend === null}
			class:md:flex={true}
			style="animation-delay: 0.1s"
		>
			{#if activeFriend}
				<!-- Top Header / Selection Header -->
				{#if isSelectionMode}
					<div class="p-3 bg-pink-500 text-white flex items-center justify-between shadow-xs animate-fade-in flex-shrink-0 sticky top-0 z-30">
						<div class="flex items-center space-x-2">
							<button onclick={exitSelectionMode} class="p-1 rounded-lg hover:bg-white/20 text-white transition-colors" aria-label="Exit selection">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-5 h-5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
							<span class="font-bold text-sm">{selectedMessageIds.size} selected</span>
						</div>

						<div class="flex items-center space-x-2">
							<button
								onclick={unsendSelectedMessages}
								disabled={selectedMessageIds.size === 0 || isDeletingMessages}
								class="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-all active:scale-95 shadow-xs"
								title="Unsend for everyone"
							>
								Unsend
							</button>
							<button
								onclick={removeSelectedForMe}
								disabled={selectedMessageIds.size === 0}
								class="px-3 py-1.5 bg-white/20 hover:bg-white/30 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-all active:scale-95"
								title="Remove for me"
							>
								Remove for me
							</button>
						</div>
					</div>
				{:else}
					<!-- Active Chat Normal Header (Harmonious Home Background Theme) -->
					<div class="p-3 sm:p-3.5 bg-gradient-to-r from-pink-100 via-pink-200 to-pink-300 backdrop-blur-md border-b-2 border-pink-300 text-pink-950 flex items-center justify-between shadow-2xs flex-shrink-0 sticky top-0 z-30">
						<div class="flex items-center space-x-2 min-w-0">
							<button
								onclick={handleBackToChatList}
								class="md:hidden p-1.5 bg-white/80 hover:bg-white border border-pink-300 rounded-lg text-pink-700 transition-colors flex-shrink-0 active:scale-95 shadow-2xs"
								title="Back to Chat List"
							>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-5 h-5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
								</svg>
							</button>
							<a
								href="/profile?id={activeFriend.friend_id}"
								class="flex items-center space-x-2.5 min-w-0 hover:opacity-95 transition-opacity group cursor-pointer"
								title="View @{activeFriend.username}'s Profile"
							>
								<div class="relative flex-shrink-0">
									<div class="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-pink-100 to-pink-200 border border-pink-300 flex items-center justify-center text-pink-700 font-bold text-sm sm:text-base overflow-hidden group-hover:scale-105 transition-transform">
										{#if activeFriend.avatar_url}
											<img src={activeFriend.avatar_url} alt={activeFriend.username} class="w-full h-full object-cover" />
										{:else}
											{activeFriend.username.charAt(0).toUpperCase()}
										{/if}
									</div>
									{#if isRecentActive(activeFriend)}
										<span class="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full shadow-2xs animate-pulse" title="Active"></span>
									{:else}
										<span class="absolute bottom-0 right-0 w-3 h-3 bg-slate-300 border-2 border-white rounded-full" title="Offline"></span>
									{/if}
								</div>
								<div class="min-w-0">
									<h3 class="font-bold text-sm leading-tight text-pink-950 truncate group-hover:underline flex items-center gap-1">
										<span>@{activeFriend.username}</span>
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5 text-pink-500 opacity-70 group-hover:opacity-100">
											<path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 111.04-1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
										</svg>
									</h3>
									<div class="text-[11px] text-pink-600 flex items-center gap-1.5 mt-0.5">
										{#if isOtherUserTyping}
											<span class="font-semibold italic text-pink-600 flex items-center gap-1">
												<span>typing</span>
												<span class="inline-flex gap-0.5">
													<span class="w-1 h-1 rounded-full bg-pink-500 animate-bounce" style="animation-delay: 0ms"></span>
													<span class="w-1 h-1 rounded-full bg-pink-500 animate-bounce" style="animation-delay: 150ms"></span>
													<span class="w-1 h-1 rounded-full bg-pink-500 animate-bounce" style="animation-delay: 300ms"></span>
												</span>
											</span>
										{:else if isRecentActive(activeFriend)}
											<span class="flex items-center gap-1.5 text-emerald-600 font-bold">
												<span class="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse shadow-xs"></span>
												<span>{formatLastActive(activeFriend)}</span>
											</span>
										{:else}
											<span class="flex items-center gap-1 text-pink-600/80 font-medium">
												<span class="w-1.5 h-1.5 rounded-full bg-pink-300 inline-block"></span>
												<span>{formatLastActive(activeFriend)}</span>
											</span>
										{/if}
									</div>
								</div>
							</a>
						</div>

						<!-- Header Actions -->
						<div class="flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0">
							<a
								href="/profile?id={activeFriend.friend_id}"
								class="px-2.5 py-1.5 bg-white/80 hover:bg-white border border-pink-300 text-pink-700 rounded-lg transition-colors text-xs font-semibold flex items-center space-x-1 shadow-2xs cursor-pointer"
								title="View Profile"
							>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-3.5 h-3.5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
								</svg>
								<span class="hidden sm:inline">Profile</span>
							</a>
							<button
								onclick={() => showClearModal = true}
								class="px-2.5 py-1.5 bg-white/80 hover:bg-white border border-pink-300 text-pink-700 rounded-lg transition-colors text-xs font-semibold flex items-center space-x-1 shadow-2xs cursor-pointer"
								title="Clear Chat History"
							>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5 text-pink-600">
									<path fill-rule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.256 1.478l-.209-.035-1.005 13.07a3 3 0 01-2.991 2.77H8.084a3 3 0 01-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 01-.256-1.478A48.567 48.567 0 017.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 013.369 0c1.603.051 2.815 1.387 2.815 2.951zm-6.136-1.452a51.196 51.196 0 013.272 0c.8.025 1.414.71 1.414 1.477v.187a49.71 49.71 0 00-6.1 0v-.187c0-.767.614-1.452 1.414-1.477zM9 9.75a.75.75 0 01.75.75v6a.75.75 0 01-1.5 0v-6A.75.75 0 019 9.75zm4.5 0a.75.75 0 01.75.75v6a.75.75 0 01-1.5 0v-6a.75.75 0 01.75-.75z" clip-rule="evenodd" />
								</svg>
								<span class="hidden sm:inline">Clear Chat</span>
							</button>
						</div>
					</div>
				{/if}

				<!-- Message Request Top Banner (Shown if not friends yet) -->
				{#if activeFriend && (activeFriend.is_request || !activeFriend.is_friend)}
					<div class="px-3.5 py-2.5 bg-gradient-to-r from-amber-50 via-pink-50 to-rose-50 border-b border-pink-200/90 flex items-center justify-between text-xs flex-wrap gap-2 animate-fade-in shadow-2xs flex-shrink-0">
						<div class="flex items-center text-pink-950 font-medium min-w-0">
							<span class="truncate"><strong>Message Request:</strong> You and @{activeFriend.username} are not connected as friends yet.</span>
						</div>
						<div class="flex items-center space-x-2 flex-shrink-0">
							<a
								href="/profile?id={activeFriend.friend_id}"
								class="px-2.5 py-1 bg-white hover:bg-pink-50 text-pink-700 border border-pink-300 font-bold rounded-lg transition-colors flex items-center space-x-1 cursor-pointer"
							>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
								</svg>
								<span>Profile</span>
							</a>
							<button
								onclick={() => sendFriendRequestFromChat(activeFriend)}
								disabled={isSendingFriendRequest}
								class="px-2.5 py-1 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-bold rounded-lg transition-all flex items-center space-x-1 shadow-2xs active:scale-95 disabled:opacity-50"
							>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3.75 19.125a1.125 1.125 0 011.125-1.125h15.375c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H4.875a1.125 1.125 0 01-1.125-1.125v-2.25z" />
								</svg>
								<span>Add Friend</span>
							</button>
						</div>
					</div>
				{/if}

				<!-- Message Stream Container -->
				<div
					bind:this={chatContainer}
					onscroll={handleChatScroll}
					class="flex-1 min-h-0 p-3 sm:p-4 overflow-y-auto overflow-x-hidden space-y-3 bg-[#fffafb] select-none overscroll-contain"
				>
					{#if isFetchingMessages && messages.length === 0}
						<div class="h-full flex items-center justify-center py-12">
							<div class="animate-spin h-6 w-6 border-2 border-pink-300 border-t-pink-500 rounded-full"></div>
						</div>
					{:else if messages.length === 0}
						<div class="h-full flex flex-col items-center justify-center text-pink-400 text-sm py-12">
							<div class="w-12 h-12 rounded-2xl bg-pink-100 border border-pink-200 text-pink-600 flex items-center justify-center mb-2.5 shadow-2xs">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-6 h-6">
									<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
								</svg>
							</div>
							<p class="font-bold text-pink-950 text-sm sm:text-base">Start a conversation with @{activeFriend.username}</p>
							<p class="text-xs text-pink-600 mt-1 max-w-xs text-center font-medium">Say hi, share photos, or hold messages to reply and interact!</p>
						</div>
					{:else}
						<!-- Loading Older Messages Spinner / History Header -->
						{#if isLoadingOlder}
							<div class="py-2.5 flex items-center justify-center space-x-2 text-pink-500 text-xs animate-fade-in bg-pink-50/60 rounded-xl border border-pink-100 mb-2">
								<div class="animate-spin w-4 h-4 border-2 border-pink-300 border-t-pink-500 rounded-full"></div>
								<span class="font-medium">Loading earlier messages...</span>
							</div>
						{:else if !hasMoreMessages && messages.length >= 20}
							<div class="py-2 text-center text-pink-400/80 text-[11px] font-medium border-b border-pink-100/60 pb-2 mb-2">
								<span>Beginning of conversation history</span>
							</div>
						{/if}

						{#each messages as msg, i (msg.id)}
							<!-- Date Separator Header with exact date formatting -->
							{#if isNewDay(i)}
								<div class="flex items-center justify-center my-3">
									<span class="px-3.5 py-1 bg-white border-2 border-pink-300 text-pink-700 text-[11px] font-bold rounded-full shadow-2xs">
										{formatDateDivider(msg.created_at)}
									</span>
								</div>
							{/if}

							{@const parsed = parseMessage(msg.message)}
							{@const isSelected = selectedMessageIds.has(msg.id)}
							{@const isUserSender = msg.sender_id === user.id}

							<!-- Message Container with Swipe-to-reply -->
							<div class="relative w-full overflow-visible py-0.5 select-none">
								<!-- Message Row -->
								<div
									class="flex items-center space-x-2 group w-full"
									class:justify-end={isUserSender}
									class:justify-start={!isUserSender}
								>
									<!-- Selection Circle Indicator (shown in selection mode) -->
									{#if isSelectionMode}
										<button
											type="button"
											onclick={() => toggleMessageSelection(msg.id)}
											class="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer flex-shrink-0"
											class:bg-pink-500={isSelected}
											class:border-pink-500={isSelected}
											class:border-pink-300={!isSelected}
											class:bg-white={!isSelected}
										>
											{#if isSelected}
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-3 h-3 text-white">
													<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
												</svg>
											{/if}
										</button>
									{/if}

									<!-- Quick Reply Button on Hover -->
									{#if !isSelectionMode && swipingMessageId !== msg.id}
										<button
											type="button"
											onclick={() => triggerReply(msg)}
											class="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-pink-600 hover:bg-pink-50 rounded-full transition-all text-xs flex-shrink-0"
											class:order-first={isUserSender}
											class:order-last={!isUserSender}
											title="Reply"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
											</svg>
										</button>
									{/if}

									<!-- Partner Profile Avatar (shown only on incoming partner messages) -->
									{#if !isUserSender}
										<a
											href="/profile?id={activeFriend.friend_id}"
											class="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-pink-100 to-pink-200 text-pink-700 border border-pink-300 flex items-center justify-center font-bold text-xs shadow-2xs overflow-hidden flex-shrink-0 self-end mb-1 mr-1 hover:scale-105 transition-transform"
											title="View @{activeFriend.username}'s Profile"
										>
											{#if activeFriend.avatar_url}
												<img src={activeFriend.avatar_url} alt={activeFriend.username} class="w-full h-full object-cover" />
											{:else}
												{activeFriend.username.charAt(0).toUpperCase()}
											{/if}
										</a>
									{/if}

									<!-- Bubble Wrapper with Swipe Indicator -->
									<div class="relative flex items-center max-w-[82%] sm:max-w-[78%]">
										<!-- Swipe Reply Indicator Icon (emerges right or left of bubble based on sender) -->
										{#if swipingMessageId === msg.id && (Math.abs(swipeOffset) > 4 || isResettingSwipe)}
											{@const progress = Math.min(Math.max((Math.abs(swipeOffset) - 4) / (SWIPE_THRESHOLD - 4), 0), 1)}
											<div
												class="absolute top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-20 {isUserSender ? 'right-1 sm:right-2' : 'left-1 sm:left-2'}"
												style="
													transform: translateY(-50%) scale({isResettingSwipe ? 0.35 : 0.45 + progress * 0.65}) rotate({isResettingSwipe ? (isUserSender ? '-20deg' : '20deg') : `${(1 - progress) * (isUserSender ? -35 : 35)}deg`});
													opacity: {isResettingSwipe ? 0 : progress};
													transition: {isResettingSwipe ? 'all 0.32s cubic-bezier(0.18, 0.9, 0.32, 1.15)' : 'none'};
												"
											>
												<div
													class="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shadow-xs transition-all duration-200 {isSwipeThresholdReached ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-pink-300 ring-2 ring-white scale-110' : 'bg-pink-100 text-pink-600 border border-pink-200'}"
												>
													<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform duration-200 {isSwipeThresholdReached ? 'scale-110 -rotate-12' : ''} {!isUserSender ? 'rotate-180' : ''}">
														<path stroke-linecap="round" stroke-linejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
													</svg>
												</div>
											</div>
										{/if}

										<!-- Bubble Container -->
										<div
											role="button"
											tabindex="0"
											onclick={() => handleMessageClick(msg)}
											onkeydown={(e) => { if (e.key === 'Enter') handleMessageClick(msg); }}
											ontouchstart={(e) => handleDragStart(e.touches[0].clientX, e.touches[0].clientY, msg)}
											ontouchmove={(e) => handleDragMove(e.touches[0].clientX, e.touches[0].clientY, msg, e)}
											ontouchend={() => handleDragEnd(msg)}
											ontouchcancel={() => handleDragEnd(msg)}
											onmousedown={(e) => { if (e.button === 0) handleDragStart(e.clientX, e.clientY, msg); }}
											class="flex flex-col w-full cursor-pointer select-none {msg.is_new ? 'animate-message-pop' : ''}"
											class:items-end={isUserSender}
											class:items-start={!isUserSender}
											style="
												transform: translateX({swipingMessageId === msg.id ? swipeOffset : 0}px);
												{isResettingSwipe && swipingMessageId === msg.id ? 'transition: transform 0.32s cubic-bezier(0.18, 0.9, 0.32, 1.15);' : isDragging && swipingMessageId === msg.id ? 'transition: none;' : ''}
												touch-action: pan-y;
												user-select: none;
												-webkit-user-select: none;
											"
										>
											<!-- Replied Quote Pill if present -->
											{#if parsed.reply}
												{@const replyDetails = getReplyDetails(parsed.reply.text)}
												<div
													class="mb-1 px-2.5 py-1 rounded-xl text-[11px] border-l-3 bg-pink-100/90 text-pink-900 border-pink-400 shadow-2xs max-w-full flex items-center space-x-1.5"
													class:self-end={isUserSender}
													class:self-start={!isUserSender}
												>
													<span class="font-bold text-pink-700">@{parsed.reply.user}:</span>
													{#if replyDetails.isImage}
														<div class="inline-flex items-center space-x-1 bg-white/80 px-1.5 py-0.5 rounded-md border border-pink-300">
															{#if replyDetails.imageUrl}
																<img src={replyDetails.imageUrl} alt="Replying photo" class="w-4 h-4 rounded-xs object-cover border border-pink-300 flex-shrink-0" />
															{/if}
															<span class="font-bold text-pink-700 text-[10px]">📷 Photo</span>
														</div>
													{:else}
														<span class="italic opacity-85 truncate">{replyDetails.text}</span>
													{/if}
												</div>
											{/if}

											<!-- Main Chat Bubble with Clear Visible Pink Border & Tail -->
											<div
												class="px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl text-xs sm:text-sm font-semibold text-pink-950 border-2 border-pink-300 shadow-2xs transition-all relative leading-relaxed"
												class:bg-pink-100={isUserSender}
												class:bg-white={!isUserSender}
												class:ring-2={isSelected}
												class:ring-pink-500={isSelected}
											>
												{#if isUserSender}
													<span class="absolute -right-[7px] top-3.5 w-3 h-3 bg-pink-100 border-t-2 border-r-2 border-pink-300 transform rotate-45 pointer-events-none rounded-tr-xs"></span>
												{:else}
													<span class="absolute -left-[7px] top-3.5 w-3 h-3 bg-white border-b-2 border-l-2 border-pink-300 transform rotate-45 pointer-events-none rounded-bl-xs"></span>
												{/if}

												<div class="relative z-10">
													{#if parsed.isImage}
														<div 
															class="relative group/img rounded-xl overflow-hidden max-w-[200px] sm:max-w-[230px] border border-pink-300/80 shadow-2xs cursor-pointer active:scale-98 transition-all my-0.5"
															onclick={(e) => { e.stopPropagation(); openImageViewer(parsed.imageUrl); }}
															role="button"
															tabindex="0"
															onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); openImageViewer(parsed.imageUrl); } }}
															title="Click to view & download photo"
														>
															<img 
																src={parsed.imageUrl} 
																alt="Chat Attachment" 
																class="w-full max-h-52 sm:max-h-60 object-cover rounded-xl transition-transform duration-200 group-hover/img:scale-105" 
																loading="lazy" 
															/>
															<div class="absolute inset-0 bg-pink-950/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white">
																<div class="p-1.5 bg-black/40 backdrop-blur-xs rounded-full shadow-md">
																	<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-white">
																		<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
																	</svg>
																</div>
															</div>
														</div>
													{:else}
														<p class="whitespace-pre-wrap break-words">{parsed.text}</p>
													{/if}
												</div>
											</div>
											<!-- Message Status & Time -->
											<div class="flex items-center gap-1 mt-1 px-1 text-[10px] font-bold {isUserSender ? 'text-pink-600 justify-end' : 'text-pink-600 justify-start'}">
												<span>{formatTime(msg.created_at)}</span>
												{#if isUserSender}
													{#if msg.is_read}
														<span class="inline-flex items-center gap-0.5 text-pink-600 font-semibold" title="Seen by @{activeFriend?.username}">
															<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5 text-pink-500">
																<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
															</svg>
															<span>Seen</span>
														</span>
													{:else}
														<span class="inline-flex items-center gap-0.5 text-pink-400/90" title="Sent">
															<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3 text-pink-400">
																<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
															</svg>
															<span>Sent</span>
														</span>
													{/if}
												{/if}
											</div>
										</div>
									</div>
								</div>
							</div>
						{/each}

						<!-- Typing Indicator Bubble in message stream -->
						{#if isOtherUserTyping}
							<div class="flex items-start space-x-2 animate-message-pop py-1 my-1">
								<div class="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-400 to-rose-400 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-2xs mt-0.5 overflow-hidden">
									{#if activeFriend.avatar_url}
										<img src={activeFriend.avatar_url} alt={activeFriend.username} class="w-full h-full object-cover" />
									{:else}
										{activeFriend.username.charAt(0).toUpperCase()}
									{/if}
								</div>
								<div class="flex flex-col items-start space-y-1">
									<!-- 3-dot Bubble with Cute Tail & Crisp Border -->
									<div class="bg-white border-2 border-pink-300 px-3.5 py-2.5 rounded-2xl shadow-xs flex items-center space-x-1.5 relative">
										<span class="absolute -left-[7px] top-3.5 w-3 h-3 bg-white border-b-2 border-l-2 border-pink-300 transform rotate-45 pointer-events-none rounded-bl-xs"></span>
										<div class="w-2 h-2 rounded-full bg-pink-500 animate-bounce relative z-10" style="animation-delay: 0ms"></div>
										<div class="w-2 h-2 rounded-full bg-pink-500 animate-bounce relative z-10" style="animation-delay: 150ms"></div>
										<div class="w-2 h-2 rounded-full bg-pink-500 animate-bounce relative z-10" style="animation-delay: 300ms"></div>
									</div>
									<!-- Label below the bubble -->
									<span class="text-[11px] text-pink-500 font-medium italic pl-1">
										@{activeFriend.username} is typing...
									</span>
								</div>
							</div>
						{/if}
					{/if}
				</div>

				<!-- Floating Reply Bar -->
				{#if replyingTo}
					<div class="px-3.5 py-2 bg-pink-50/95 border-t border-pink-200 flex items-center justify-between text-xs animate-slide-down">
						<div class="flex items-center space-x-2 min-w-0">
							<div class="w-1 h-7 bg-pink-500 rounded-full flex-shrink-0"></div>
							<div class="min-w-0 flex items-center space-x-2">
								{#if replyingTo.isImage && replyingTo.imageUrl}
									<img src={replyingTo.imageUrl} alt="Replying photo" class="w-7 h-7 rounded-lg object-cover border border-pink-300 flex-shrink-0 shadow-2xs" />
								{/if}
								<div class="min-w-0">
									<p class="font-bold text-pink-600">Replying to @{replyingTo.sender_name}</p>
									<p class="text-pink-900/80 truncate text-[11px] font-medium">{replyingTo.text}</p>
								</div>
							</div>
						</div>
						<button onclick={cancelReply} class="p-1 text-pink-400 hover:text-pink-600 rounded-full cursor-pointer transition-colors" aria-label="Cancel reply">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
				{/if}

				<!-- Emoji Picker Dropup -->
				{#if showEmojiPicker}
					<div class="absolute bottom-16 right-4 sm:right-14 p-3 bg-white border border-pink-200 rounded-2xl shadow-xl z-30 max-w-[240px] animate-fade-in-up">
						<div class="grid grid-cols-7 gap-1">
							{#each emojis as emoji}
								<button
									type="button"
									onclick={() => insertEmoji(emoji)}
									class="p-1 hover:bg-pink-50 rounded-lg transition-all text-lg hover:scale-110"
								>
									{emoji}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Input Form Section -->
				<form onsubmit={(e) => { e.preventDefault(); sendMessage(); }} class="p-2 sm:p-3 bg-white border-t border-pink-100 flex items-center space-x-1.5 sm:space-x-2 w-full min-w-0 flex-shrink-0 sticky bottom-0 z-20">
					<!-- Upload Photo Button -->
					<label class="p-1.5 sm:p-2 text-pink-500 hover:text-pink-600 hover:bg-pink-50 rounded-xl cursor-pointer transition-colors flex-shrink-0" title="Attach Photo">
						{#if isUploadingImage}
							<div class="animate-spin w-5 h-5 border-2 border-pink-300 border-t-pink-500 rounded-full"></div>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-5 h-5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
							</svg>
						{/if}
						<input
							type="file"
							accept="image/*"
							multiple
							bind:this={imageInput}
							onchange={handleImageUpload}
							disabled={isUploadingImage}
							class="hidden"
						/>
					</label>

					<!-- Text Input with Typing Handler & Emoji Button -->
					<div class="flex-grow min-w-0 relative flex items-center">
						<input
							type="text"
							bind:this={messageInputRef}
							bind:value={newMessageText}
							oninput={handleInputTyping}
							onfocus={handleInputFocus}
							onblur={handleInputBlur}
							placeholder="Type a message... (swipe to reply, hold to select)"
							class="w-full pl-3 pr-9 py-2 sm:py-2.5 bg-pink-50/40 border border-pink-200 rounded-xl text-gray-800 text-xs sm:text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-300 focus:bg-white transition-all font-normal"
						/>
						<!-- Emoji Picker Toggle Button -->
						<button
							type="button"
							onclick={() => showEmojiPicker = !showEmojiPicker}
							class="absolute right-2 p-1 text-pink-400 hover:text-pink-600 rounded-lg transition-colors cursor-pointer flex items-center justify-center"
							title="Emojis"
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-5 h-5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
							</svg>
						</button>
					</div>

					<!-- Send Button with Smooth Feedback -->
					<button
						type="submit"
						disabled={!newMessageText.trim() || isSending}
						class="py-2 sm:py-2.5 px-3.5 sm:px-4 bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white rounded-xl font-bold text-xs sm:text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center space-x-1.5 flex-shrink-0 active:scale-95 group cursor-pointer"
					>
						<span>Send</span>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 flex-shrink-0 group-hover:translate-x-1 group-hover:-translate-y-0.5 transition-transform duration-200">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
						</svg>
					</button>
				</form>
			{:else}
				<div class="h-full flex flex-col items-center justify-center p-6 text-center text-gray-400">
					<div class="w-14 h-14 rounded-full bg-pink-100 text-pink-500 flex items-center justify-center mb-3 shadow-2xs">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-7 h-7 text-pink-500">
							<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
						</svg>
					</div>
					<h3 class="text-base sm:text-lg font-bold text-gray-700 mb-0.5">Select a friend to start chatting</h3>
					<p class="text-xs text-gray-400 max-w-xs">Pick any friend from your list on the left to start sending messages, photos, and replies.</p>
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Clear Chat Confirmation Modal -->
{#if showClearModal}
	<div
		class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
		onclick={(e) => { if (e.target === e.currentTarget) showClearModal = false; }}
	>
		<div
			class="bg-white border-2 border-pink-300 rounded-3xl shadow-2xl p-6 max-w-sm w-full text-center animate-modal-content"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-xs">
				<svg class="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
					<path fill-rule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.256 1.478l-.209-.035-1.005 13.07a3 3 0 01-2.991 2.77H8.084a3 3 0 01-2.991-2.77L4.088 6.66l-.209.035a.75.75 0 01-.256-1.478A48.567 48.567 0 017.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 013.369 0c1.603.051 2.815 1.387 2.815 2.951zm-6.136-1.452a51.196 51.196 0 00-3.273 0C6.39 3.05 6 3.678 6 4.478v.113a49.488 49.488 0 0012 0v-.113c0-.8-.39-1.428-1.091-1.452a51.196 51.196 0 00-3.273 0zM9.75 9.75a.75.75 0 01.75.75v6.75a.75.75 0 01-1.5 0v-6.75a.75.75 0 01.75-.75zm4.5 0a.75.75 0 01.75.75v6.75a.75.75 0 01-1.5 0v-6.75a.75.75 0 01.75-.75z" clip-rule="evenodd" />
				</svg>
			</div>
			<h3 class="text-lg font-bold text-pink-950 mb-1.5">Clear Conversation?</h3>
			<p class="text-xs sm:text-sm text-pink-600 mb-6 leading-relaxed">
				Are you sure you want to clear all chat messages with <span class="font-bold text-pink-900">@{activeFriend?.username}</span>? This action cannot be undone.
			</p>
			<div class="flex space-x-3">
				<button
					onclick={() => showClearModal = false}
					disabled={isClearing}
					class="flex-1 py-2.5 bg-pink-100 text-pink-700 rounded-xl font-bold text-sm hover:bg-pink-200 active:scale-95 transition-all shadow-xs"
				>
					Cancel
				</button>
				<button
					onclick={clearConversation}
					disabled={isClearing}
					class="flex-1 py-2.5 bg-gradient-to-r from-rose-500 to-red-600 text-white rounded-xl font-bold text-sm hover:from-rose-600 hover:to-red-700 active:scale-95 transition-all shadow-md shadow-rose-200 flex items-center justify-center space-x-1"
				>
					{#if isClearing}Clearing...{:else}Clear Chat{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Full-Screen Image Gallery Viewer & Zoom Modal -->
{#if viewingImageIndex >= 0 && chatImagesList()[viewingImageIndex]}
	{@const currentImg = chatImagesList()[viewingImageIndex]}
	{@const totalImgs = chatImagesList().length}
	<div 
		class="fixed inset-0 z-[100] bg-pink-100/95 backdrop-blur-md flex flex-col justify-between p-3 sm:p-5 select-none animate-fade-in touch-none overflow-hidden"
		onclick={(e) => { if (e.target === e.currentTarget) closeImageViewer(); }}
		onkeydown={handleViewerKeydown}
		role="dialog"
		aria-modal="true"
		tabindex="0"
	>
		<!-- Header -->
		<div class="w-full max-w-5xl mx-auto flex items-center justify-between z-20 flex-shrink-0 pt-1">
			<div class="flex items-center space-x-2">
				<span class="text-xs sm:text-sm font-bold text-pink-900 bg-white/90 px-3.5 py-1.5 rounded-full backdrop-blur-sm border border-pink-300 shadow-2xs">
					Photo {viewingImageIndex + 1} of {totalImgs}
				</span>
				{#if zoomScale > 1}
					<span class="text-[11px] font-semibold text-pink-700 bg-white/80 px-2.5 py-1 rounded-full border border-pink-200">
						{Math.round(zoomScale * 100)}%
					</span>
				{/if}
			</div>

			<div class="flex items-center space-x-1.5 sm:space-x-2">
				<button 
					type="button"
					onclick={() => zoomScale = Math.max(1, zoomScale - 0.3)}
					disabled={zoomScale <= 1}
					class="p-2 text-pink-700 hover:text-pink-900 bg-white/90 hover:bg-white disabled:opacity-40 border border-pink-300 rounded-full transition-all backdrop-blur-sm cursor-pointer active:scale-95 shadow-2xs"
					title="Zoom Out"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4 sm:w-5 sm:h-5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6" />
					</svg>
				</button>
				<button 
					type="button"
					onclick={() => zoomScale = Math.min(3.5, zoomScale + 0.3)}
					disabled={zoomScale >= 3.5}
					class="p-2 text-pink-700 hover:text-pink-900 bg-white/90 hover:bg-white disabled:opacity-40 border border-pink-300 rounded-full transition-all backdrop-blur-sm cursor-pointer active:scale-95 shadow-2xs"
					title="Zoom In"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4 sm:w-5 sm:h-5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
					</svg>
				</button>
				<button 
					type="button"
					onclick={closeImageViewer}
					class="p-2 text-pink-700 hover:text-pink-900 bg-white/90 hover:bg-white border border-pink-300 rounded-full transition-all backdrop-blur-sm cursor-pointer active:scale-95 shadow-2xs flex items-center justify-center"
					title="Close Preview (Esc)"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-5 h-5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		</div>

		<!-- Main Image Preview & Controls -->
		<div 
			class="flex-grow flex items-center justify-center relative w-full max-w-5xl mx-auto overflow-hidden my-auto py-2 touch-none select-none overscroll-none"
			ontouchstart={handleViewerTouchStart}
			ontouchmove={handleViewerTouchMove}
			ontouchend={handleViewerTouchEnd}
			ontouchcancel={handleViewerTouchEnd}
			onwheel={handleViewerWheel}
		>
			<!-- Prev Button -->
			{#if viewingImageIndex > 0}
				<button 
					type="button"
					onclick={prevImage}
					class="absolute left-2 sm:left-4 z-30 p-2.5 sm:p-3 bg-white/90 hover:bg-white text-pink-700 hover:text-pink-900 border-2 border-pink-300 rounded-full shadow-lg transition-all active:scale-90 cursor-pointer"
					title="Previous Photo (Left Arrow)"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-5 h-5 sm:w-6 sm:h-6">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
					</svg>
				</button>
			{/if}

			<!-- Image Container with translate and scale -->
			<div 
				class="w-full h-full flex items-center justify-center p-2 {isTouching || isMouseDragging ? 'transition-none' : 'transition-transform duration-200 ease-out'}" 
				style="transform: translate3d({panX}px, {panY}px, 0px) scale({zoomScale}); transform-origin: center center; will-change: transform;"
				onmousedown={handleMouseDown}
				onmousemove={handleMouseMove}
				onmouseup={handleMouseUp}
				onmouseleave={handleMouseUp}
				role="button"
				tabindex="0"
			>
				<img 
					src={currentImg.url} 
					alt="Full Preview" 
					class="max-h-[72vh] max-w-full object-contain rounded-2xl border-2 border-pink-300 shadow-xl bg-white/40"
					class:cursor-grab={zoomScale > 1 && !isMouseDragging}
					class:cursor-grabbing={zoomScale > 1 && isMouseDragging}
					class:cursor-zoom-in={zoomScale <= 1}
					ondblclick={toggleZoomAtPoint}
					title="Double tap/click any spot to zoom into that location • Drag to pan"
				/>
			</div>

			<!-- Next Button -->
			{#if viewingImageIndex < totalImgs - 1}
				<button 
					type="button"
					onclick={nextImage}
					class="absolute right-2 sm:right-4 z-30 p-2.5 sm:p-3 bg-white/90 hover:bg-white text-pink-700 hover:text-pink-900 border-2 border-pink-300 rounded-full shadow-lg transition-all active:scale-90 cursor-pointer"
					title="Next Photo (Right Arrow)"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-5 h-5 sm:w-6 sm:h-6">
						<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
					</svg>
				</button>
			{/if}
		</div>

		<!-- Bottom Action Bar -->
		<div class="w-full max-w-5xl mx-auto flex flex-col items-center gap-2 z-20 flex-shrink-0 pb-1">
			<div class="flex items-center gap-3">
				<button 
					type="button"
					onclick={() => downloadChatImage(currentImg.url)}
					class="px-5 py-2.5 bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 hover:from-pink-600 hover:to-rose-600 text-white rounded-xl font-bold text-xs sm:text-sm transition-all shadow-md shadow-pink-300 flex items-center space-x-2 active:scale-95 cursor-pointer border border-pink-300/40"
					title="Download Photo"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-4 h-4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
					</svg>
					<span>Download Photo</span>
				</button>

				{#if zoomScale > 1 || panX !== 0 || panY !== 0}
					<button 
						type="button"
						onclick={resetZoomAndPan}
						class="px-3.5 py-2.5 bg-white/90 hover:bg-white text-pink-700 rounded-xl font-semibold text-xs transition-all border border-pink-300 shadow-2xs active:scale-95 cursor-pointer"
					>
						Reset Zoom
					</button>
				{/if}
			</div>

			<p class="text-[11px] text-pink-600/80 font-medium hidden sm:block">
				Swipe left/right or use arrow keys to navigate • Scroll or double click to zoom
			</p>
		</div>
	</div>
{/if}

<style>
	@keyframes fadeIn {
		0% {
			opacity: 0;
		}
		100% {
			opacity: 1;
		}
	}

	.animate-fade-in {
		animation: fadeIn 0.2s ease-out;
	}

	@keyframes slideDown {
		0% {
			opacity: 0;
			transform: translateY(-16px);
		}
		100% {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-slide-down {
		animation: slideDown 0.25s ease-out;
	}

	@keyframes fadeInUp {
		0% {
			opacity: 0;
			transform: translateY(20px);
		}
		100% {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-fade-in-up {
		animation: fadeInUp 0.35s ease-out forwards;
		opacity: 0;
	}

	@keyframes messagePop {
		0% {
			opacity: 0;
			transform: translateY(12px) scale(0.96);
		}
		60% {
			transform: translateY(-2px) scale(1.008);
		}
		100% {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.animate-message-pop {
		animation: messagePop 0.26s cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	:global(::-webkit-scrollbar) {
		width: 8px;
		height: 8px;
	}
	:global(::-webkit-scrollbar-track) {
		background: rgba(255, 225, 240, 0.5);
		border-radius: 9999px;
	}
	:global(::-webkit-scrollbar-thumb) {
		background: linear-gradient(180deg, #f472b6, #ec4899);
		border-radius: 9999px;
		border: 1.5px solid rgba(255, 255, 255, 0.7);
		box-shadow: 0 2px 6px rgba(236, 72, 153, 0.25);
	}
	:global(::-webkit-scrollbar-thumb:hover) {
		background: linear-gradient(180deg, #ec4899, #db2777);
	}
	:global(::-webkit-scrollbar-corner) {
		background: transparent;
	}
	:global(::-webkit-scrollbar-button) {
		display: none;
		width: 0;
		height: 0;
	}
	:global(*) {
		scrollbar-width: thin;
		scrollbar-color: #f472b6 rgba(255, 225, 240, 0.5);
	}
</style>
