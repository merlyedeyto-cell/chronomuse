<script>
	import { onMount, tick } from 'svelte';
	import { goto, pushState, replaceState } from '$app/navigation';
	import { page } from '$app/stores';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { supabase } from '$lib/supabaseClient';
	import { playTypingSound, playMessageSentSound, playIncomingMessageSound, playClickSound } from '$lib/soundEffects.js';
	import { broadcastFriendEvent } from '$lib/realtimeBroadcast.js';
	import AppHeader from '$lib/AppHeader.svelte';
	import AppFooter from '$lib/AppFooter.svelte';
	import { compressImage } from '$lib/imageOptimizer.js';
	import {
		MessageSquare, Search, Clock, Check, X, ChevronLeft, ChevronRight,
		User, Ban, Trash2, UserPlus, Reply, Image as ImageIcon, ZoomIn,
		ZoomOut, Download, Smile, Send, AlertCircle, CheckCircle2, MessageCircle, ShieldCheck,
		MoreVertical
	} from 'lucide-svelte';

	let user = $state(typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('chronomuse_user') || 'null') : null);
	let friends = $state([]);
	let requests = $state([]);
	let allConversations = $state([]);
	let sentFriendRequestUsernames = $state([]);
	let searchQuery = $state('');
	let chatListFilter = $state('all'); // 'all' | 'unread' | 'requests'
	let unreadFriendsCount = $derived(friends.reduce((sum, f) => sum + (f.unread_count || 0), 0));
	let unreadRequestsCount = $derived(requests.reduce((sum, f) => sum + (f.unread_count || 0), 0));
	// Count of USERS (conversations) with unread messages — same pool the Unread filter uses
	let unreadUsersCount = $derived(
		((allConversations.length > 0 ? allConversations : [...friends, ...requests]) || [])
			.filter(f => !f.is_blocked_by_me && !f.is_blocking_me && (f.unread_count || 0) > 0).length
	);
	let unreadTotal = $derived(unreadFriendsCount + unreadRequestsCount);

	let showNotificationModalPopup = $state(false);
	let notificationModalMessage = $state('');
	let notificationModalType = $state('success');

	function showNotificationModal(msg, type = 'success') {
		notificationModalMessage = msg;
		notificationModalType = type;
		showNotificationModalPopup = true;
	}

	function safeReplaceState(url, state = {}) {
		if (typeof window === 'undefined') return;
		try {
			replaceState(url, state);
		} catch (e) {
			try {
				window.history.replaceState({ ...window.history.state, ...state }, '', url);
			} catch (_) {}
		}
	}

	function safePushState(url, state = {}) {
		if (typeof window === 'undefined') return;
		try {
			pushState(url, state);
		} catch (e) {
			try {
				window.history.pushState({ ...window.history.state, ...state }, '', url);
			} catch (_) {}
		}
	}

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
	let showBlockConfirmModal = $state(false);
	let showHeaderMenu = $state(false);
	let blockModalTarget = $state(null);
	let isClearing = $state(false);
	let pollInterval;
	let chatContainer = $state();
	let imageInput = $state();
	let emojiPickerRef = $state();
	let emojiButtonRef = $state();

	// iMessage-style Notes state — unified with Profile page (uses chronomuse_users.note)
	let myNote = $state(null); // { note_text } — loaded from user profile
	let friendNotes = $state([]); // [{ user_id, username, avatar_url, note_text }] — derived from friends list
	let showNoteModal = $state(false);
	let noteInput = $state('');
	let isSavingNote = $state(false);
	let viewingNote = $state(null); // { username, avatar_url, note_text, friend_id }
	let notesScrollRef = $state();

	// Multi-select & Long-press state
	let isSelectionMode = $state(false);
	let selectedMessageIds = $state(new Set());
	let longPressTimer = null;
	let removedMessageIds = $state(new Set());
	let recentlyDeletedMessageIds = $state(new Set());
	let isDeletingMessages = $state(false);

	// Swipe- state
	let replyingTo = $state(null);
	let highlightedMessageId = $state(null);
	let highlightTimer = null;
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
	let messageInputRef = $state();

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

	// Presence & Active state
	let presenceChannel = null;
	let onlineUserIds = $state(new Set());
	let userLastSeenMap = $state({});
	let currentTime = $state(Date.now());
	let heartbeatInterval = null;

	let isCurrentFriendBlockedByMe = $derived.by(() => {
		if (!activeFriend) return false;
		if (activeFriend.is_blocked_by_me) return true;
		if (typeof window !== 'undefined' && user?.id) {
			try {
				const stored = localStorage.getItem(`chronomuse_blocked_${user.id}`);
				if (stored) {
					const list = JSON.parse(stored);
					const fId = String(activeFriend.friend_id || activeFriend.id);
					if (Array.isArray(list) && list.some(b => String(b.id || b.friend_id) === fId)) {
						return true;
					}
				}
			} catch (e) {}
		}
		return false;
	});

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

		// Note expiration live countdown interval
		noteCountdownInterval = setInterval(() => {
			updateChatNoteCountdown();
		}, 1000);

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
		// Note reply handoff from profile page ("Reply in Chat" on a friend's note)
		let pendingNoteReply = null;
		if ($page.url.searchParams.get('note_reply') === '1' && friendIdParam && typeof window !== 'undefined') {
			try {
				pendingNoteReply = JSON.parse(sessionStorage.getItem('chronomuse_note_reply') || 'null');
			} catch (e) {}
			sessionStorage.removeItem('chronomuse_note_reply');
		}

		// Shared Memory "Say Thanks" reply handoff from notifications modal
		let pendingMemoryReply = null;
		if ($page.url.searchParams.get('memory_reply') === '1' && friendIdParam && typeof window !== 'undefined') {
			try {
				pendingMemoryReply = JSON.parse(sessionStorage.getItem('chronomuse_memory_reply') || 'null');
			} catch (e) {}
			sessionStorage.removeItem('chronomuse_memory_reply');
		}

		if (friendIdParam || usernameParam) {
			const fid = friendIdParam ? Number(friendIdParam) : null;
			if (pendingMemoryReply) {
				safeReplaceState('/chat', { chatOpen: false });
				triggerMemoryReply({
					friend_id: pendingMemoryReply.sender_id || pendingMemoryReply.friend_id || fid,
					username: pendingMemoryReply.sender_username || pendingMemoryReply.username || usernameParam || 'User',
					avatar_url: null,
					memory_id: pendingMemoryReply.memory_id,
					memory_date: pendingMemoryReply.memory_date || ''
				});
			} else if (pendingNoteReply) {
				// Open the chat immediately (no waiting for the chat list) with the reply bar
				safeReplaceState('/chat', { chatOpen: false });
				triggerNoteReply({
					user_id: pendingNoteReply.user_id,
					username: pendingNoteReply.username || usernameParam || 'User',
					avatar_url: null,
					note_text: pendingNoteReply.note_text || ''
				});
			} else if (fid && user?.id && Number(fid) === Number(user.id)) {
				activeFriend = null;
				safeReplaceState('/chat', { chatOpen: false });
			} else {
				const uParam = (usernameParam || '').toLowerCase();
				const isSupport = uParam === 'chronomuse_support' || uParam === 'support';
				const ticketIdParam = $page.url.searchParams.get('ticket_id');
				activeFriend = {
					friend_id: fid,
					id: ticketIdParam ? `ticket_${ticketIdParam}` : fid,
					username: usernameParam || 'User',
					ticket_id: ticketIdParam ? Number(ticketIdParam) : null,
					is_support: isSupport,
					is_ticket: Boolean(isSupport && ticketIdParam),
					is_friend: isSupport || friends.some(f => Number(f.friend_id) === fid)
				};
				if (friendIdParam) {
					fetchMessages(Number(friendIdParam), true);
					initTypingChannel(Number(friendIdParam));
				}

				// Ensure base history state is /chat so pressing back on mobile returns to chat list (Friends Chat)
				const currentSearch = typeof window !== 'undefined' ? window.location.search : '';
				safeReplaceState('/chat', { chatOpen: false });
				safePushState(`/chat${currentSearch}`, { chatOpen: true, friend_id: Number(friendIdParam) });
			}
		} else {
			safeReplaceState('/chat', { chatOpen: false });
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
					const uName = (activeFriend.username || '').toLowerCase();
					const isSupport = uName === 'chronomuse_support' || uName === 'support' || Boolean(activeFriend.is_support);
					activeFriend.is_support = isSupport;
					activeFriend.is_friend = isSupport || friends.some(f => String(f.friend_id) === String(activeFriend.friend_id));
					activeFriend.is_request = !activeFriend.is_friend && !isSupport;
				}
			}
		});

		fetchNotes();

		pollInterval = setInterval(() => {
			if (typeof document !== 'undefined' && document.hidden) return;
			fetchChatList();
			if (activeFriend) {
				fetchMessages(activeFriend.friend_id, false);
			}
		}, 20000);

		const handleRealtimeChatMessage = (e) => {
			fetchChatList();
			if (activeFriend) {
				const detail = e?.detail;
				if (detail) {
					if (detail.id) {
						messages = messages.map(m => String(m.id) === String(detail.id) ? { ...m, message: '__UNSENT__' } : m);
					}
					if (Number(detail.sender_id) === Number(activeFriend.friend_id) || Number(detail.receiver_id) === Number(activeFriend.friend_id)) {
						fetchMessages(activeFriend.friend_id, false);
					}
				}
			}
		};

		window.addEventListener('chronomuse_new_message', handleRealtimeChatMessage);
		window.addEventListener('chronomuse_message_unsend', handleRealtimeChatMessage);
		window.addEventListener('chronomuse_friend_change', handleRealtimeChatMessage);
		window.addEventListener('chronomuse_profile_change', handleRealtimeChatMessage);

		// Listen for note changes broadcast from profile page — update myNote reactively
		const handleNoteChange = (e) => {
			const detail = e?.detail;
			if (!detail) return;
			if (user && String(detail.user_id) === String(user.id)) {
				// Own note updated from Profile page
				const noteText = detail.note !== undefined ? detail.note : (detail.updated_fields?.note);
				if (noteText !== undefined) {
					myNote = noteText ? { note_text: noteText } : null;
				}
			} else {
				// A friend's note changed — refresh friend notes
				const noteText = detail.note !== undefined ? detail.note : (detail.updated_fields?.note);
				if (noteText !== undefined && detail.user_id) {
					friendNotes = friendNotes.map(fn =>
						String(fn.user_id) === String(detail.user_id)
							? { ...fn, note_text: noteText }
							: fn
					).filter(fn => fn.note_text);
					// Also add note if not yet in list
					if (noteText && !friendNotes.some(fn => String(fn.user_id) === String(detail.user_id))) {
						const allFriendsList = [...friends, ...requests];
						const friend = allFriendsList.find(f => String(f.friend_id) === String(detail.user_id));
						if (friend) {
							friendNotes = [...friendNotes, { user_id: detail.user_id, username: friend.username, avatar_url: friend.avatar_url || null, note_text: noteText }];
						}
					}
				}
			}
		};
		window.addEventListener('chronomuse_note_change', handleNoteChange);
		window.addEventListener('chronomuse_profile_change', handleNoteChange);

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
				safeReplaceState('/chat', { chatOpen: false });
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

		const handleWindowClick = (e) => {
			if (showEmojiPicker) {
				if (emojiPickerRef && !emojiPickerRef.contains(e.target) && emojiButtonRef && !emojiButtonRef.contains(e.target)) {
					showEmojiPicker = false;
				}
			}
		};

		window.addEventListener('mousemove', onWindowMouseMove);
		window.addEventListener('mouseup', onWindowMouseUp);
		window.addEventListener('click', handleWindowClick);

		if (typeof window !== 'undefined') {
			if (window.visualViewport) {
				window.visualViewport.addEventListener('resize', updateMobileViewport);
				window.visualViewport.addEventListener('scroll', updateMobileViewport);
			}
			window.addEventListener('resize', updateMobileViewport);
			window.addEventListener('scroll', updateMobileViewport);
			updateMobileViewport();
		}

		updateChatNoteCountdown();
		const chatNoteTimerInterval = setInterval(updateChatNoteCountdown, 1000);

		return () => {
			if (chatNoteTimerInterval) clearInterval(chatNoteTimerInterval);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			window.removeEventListener('focus', handleFocus);
			window.removeEventListener('blur', handleBlur);
			window.removeEventListener('mousemove', onWindowMouseMove);
			window.removeEventListener('mouseup', onWindowMouseUp);
			window.removeEventListener('click', handleWindowClick);
			window.removeEventListener('popstate', handlePopState);
			window.removeEventListener('chronomuse_new_message', handleRealtimeChatMessage);
			window.removeEventListener('chronomuse_friend_change', handleRealtimeChatMessage);
			window.removeEventListener('chronomuse_profile_change', handleRealtimeChatMessage);
			window.removeEventListener('chronomuse_note_change', handleNoteChange);
			window.removeEventListener('chronomuse_profile_change', handleNoteChange);
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
			if (noteCountdownInterval) clearInterval(noteCountdownInterval);
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

		// Only use real activity signals — falling back to last_message_time made offline
		// users appear "Active just now" whenever the conversation had a recent message.
		const timestamp = userLastSeenMap[friend.friend_id] || friend.last_activity;
		if (!timestamp) return 'Offline';

		const now = Date.now();
		const date = new Date(timestamp);
		const diffMs = now - date.getTime();

		if (isNaN(diffMs)) return 'Offline';
		if (diffMs < 0) return 'Active just now';

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
				const set = new Set();
				(arr || []).forEach(id => {
					set.add(id);
					set.add(String(id));
					if (typeof id === 'string' && !isNaN(Number(id))) {
						set.add(Number(id));
					}
				});
				removedMessageIds = set;
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
					if (recentlyDeletedMessageIds.has(incoming.id) || recentlyDeletedMessageIds.has(String(incoming.id))) return;

					// If currently viewing a ticket, ignore messages that belong to another ticket
					if (activeFriend?.ticket_id) {
						if (incoming.feedback_id && String(incoming.feedback_id) !== String(activeFriend.ticket_id)) {
							fetchChatList();
							return;
						}
						const tMatch = incoming.message?.match(/\[TICKET id="([^"]+)"\]/);
						if (tMatch && String(tMatch[1]) !== String(activeFriend.ticket_id)) {
							fetchChatList();
							return;
						}
					}

					if (!messages.some(m => String(m.id) === String(incoming.id) || (m.message === incoming.message && Number(m.sender_id) === Number(incoming.sender_id)))) {
						messages = [...messages, incoming];
						playIncomingMessageSound(user?.id);
						await tick();
						scrollToBottom(true);
						broadcastSeen();
						fetchChatList();
					}
				}
			})
			.on('broadcast', { event: 'unsend_message' }, (payload) => {
				if (payload.payload && Array.isArray(payload.payload.message_ids)) {
					const delIds = new Set(payload.payload.message_ids.map(id => String(id)));
					messages = messages.map(m => {
						if (delIds.has(String(m.id))) {
							return { ...m, message: '__UNSENT__' };
						}
						return m;
					});
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
		if (isTyping && typeof window !== 'undefined') {
			try {
				if (localStorage.getItem(`chronomuse_typing_indicator_${user.id}`) === 'false') {
					return;
				}
			} catch (e) {}
		}
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
		// Au selection mode when textbox is focused
		if (isSelectionMode) {
			isSelectionMode = false;
			selectedMessageIds = new Set();
		}
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
		const targetId = String(target.friend_id || target.id);
		const targetUname = (target.username || '').toLowerCase();
		try {
			const res = await fetch(API_ENDPOINTS.addFriend, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: user.id,
					sender_id: user.id,
					receiver_id: target.friend_id || target.id,
					friend_username: target.username
				})
			});
			const data = await res.json();
			if (data.error) {
				showNotificationModal(data.error, 'error');
			} else {
				showNotificationModal(data.message || `Friend request sent to @${target.username}!`);
				if (targetUname && !sentFriendRequestUsernames.includes(targetUname)) {
					sentFriendRequestUsernames = [...sentFriendRequestUsernames, targetUname];
				}

				if (activeFriend && (String(activeFriend.friend_id || activeFriend.id) === targetId || (activeFriend.username || '').toLowerCase() === targetUname)) {
					activeFriend = {
						...activeFriend,
						has_pending_request: true,
						pending_request_sender_id: user.id
					};
				}

				broadcastFriendEvent(user.id, targetId, 'friend_request');
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_friend_change'));
				}

				fetchChatList();
			}
		} catch (err) {
			console.error('Error sending friend request from chat:', err);
		} finally {
			isSendingFriendRequest = false;
		}
	}

	async function cancelFriendRequestFromChat(target) {
		if (!user || !target || isSendingFriendRequest) return;
		isSendingFriendRequest = true;
		const targetId = String(target.friend_id || target.id);
		const targetUname = (target.username || '').toLowerCase();
		try {
			const res = await fetch(API_ENDPOINTS.cancelFriendRequest, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: user.id,
					friend_id: targetId
				})
			});
			const data = await res.json();
			if (data.error) {
				showNotificationModal(data.error, 'error');
			} else {
				showNotificationModal('Friend request cancelled');
				sentFriendRequestUsernames = sentFriendRequestUsernames.filter(u => u !== targetUname);

				if (activeFriend && (String(activeFriend.friend_id || activeFriend.id) === targetId || (activeFriend.username || '').toLowerCase() === targetUname)) {
					activeFriend = {
						...activeFriend,
						has_pending_request: false,
						pending_request_sender_id: null
					};
				}

				broadcastFriendEvent(user.id, targetId, 'request_cancelled');
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_friend_change'));
				}

				fetchChatList();
			}
		} catch (err) {
			console.error('Error cancelling friend request from chat:', err);
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
				requests = (data.data.requests || []).filter(r => !r.is_blocked_by_me && !r.is_blocking_me);
				allConversations = data.data.all_conversations || [...friends, ...requests];
				localStorage.setItem(`chronomuse_chat_list_${user.id}`, JSON.stringify(friends));
				localStorage.setItem(`chronomuse_chat_requests_${user.id}`, JSON.stringify(requests));

				if (activeFriend) {
					const allList = [...friends, ...requests];
					const updated = allList.find(f => Number(f.friend_id || f.id) === Number(activeFriend.friend_id || activeFriend.id));
					if (updated) {
						const isLocallyPending = sentFriendRequestUsernames.includes((activeFriend.username || '').toLowerCase());
						activeFriend = {
							...activeFriend,
							...updated,
							has_pending_request: updated.has_pending_request || isLocallyPending,
							pending_request_sender_id: updated.pending_request_sender_id || (isLocallyPending ? user.id : null),
							last_activity: updated.last_activity,
							last_message_time: updated.last_message_time,
							last_is_read: updated.last_is_read,
							is_friend: updated.is_friend,
							is_request: updated.is_request,
							is_blocked_by_me: Boolean(updated.is_blocked_by_me),
							is_blocking_me: Boolean(updated.is_blocking_me)
						};
					}
				}
			}
			// Refresh friend notes from the updated chat list (includes note field per friend)
			fetchNotes();
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
			list = allConversations.length > 0 ? allConversations : [...friends, ...requests];
		} else if (chatListFilter === 'unread') {
			const pool = allConversations.length > 0 ? allConversations : [...friends, ...requests];
			list = pool.filter(f => (f.unread_count || 0) > 0);
		} else if (chatListFilter === 'requests') {
			list = requests.filter(r => !r.is_blocked_by_me && !r.is_blocking_me);
		}

		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			list = list.filter(f => 
				f.username.toLowerCase().includes(q) ||
				(f.ticket_title && f.ticket_title.toLowerCase().includes(q)) ||
				(f.ticket_id && String(f.ticket_id).includes(q))
			);
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
		showHeaderMenu = false;
		isSelectionMode = false;
		selectedMessageIds = new Set();
		replyingTo = null;
		isOtherUserTyping = false;
		messages = [];
		hasMoreMessages = true;

		// Push history state so hardware back button on phone returns to chat list (the screen with all chats)
		const ticketParam = friend.ticket_id ? `&ticket_id=${friend.ticket_id}` : '';
		const chatUrl = `/chat?friend_id=${friend.friend_id}&username=${encodeURIComponent(friend.username)}${ticketParam}`;
		safePushState(chatUrl, { chatOpen: true, friend_id: friend.friend_id, ticket_id: friend.ticket_id });

		initTypingChannel(friend.friend_id);
		await fetchMessages(friend.friend_id, true);
	}

	function handleBackToChatList() {
		stopMyTyping();
		showHeaderMenu = false;
		activeFriend = null;
		messages = [];
		isSelectionMode = false;
		selectedMessageIds = new Set();
		replyingTo = null;
		isOtherUserTyping = false;
		safeReplaceState('/chat', { chatOpen: false });
	}

	async function fetchMessages(friendId, isInitialLoad = false) {
		if (!user) return;
		if (isInitialLoad) {
			isFetchingMessages = true;
		}
		try {
			const ticketId = activeFriend?.ticket_id || null;
			const res = await fetch(API_ENDPOINTS.getMessages, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ 
					user_id: user.id, 
					friend_id: friendId, 
					ticket_id: ticketId,
					limit: ticketId ? 200 : 20 
				})
			});
			const data = await res.json();
			if (data.data && data.data.messages) {
				const serverMessages = (data.data.messages || []).filter(m => 
					!removedMessageIds.has(m.id) && 
					!removedMessageIds.has(String(m.id)) &&
					!recentlyDeletedMessageIds.has(m.id) &&
					!recentlyDeletedMessageIds.has(String(m.id))
				);
				
				if (activeFriend && Number(activeFriend.friend_id) === Number(friendId)) {
					activeFriend.is_blocked_by_me = Boolean(data.data.is_blocked_by_me);
					activeFriend.is_blocking_me = Boolean(data.data.is_blocking_me);
				}

				if (isInitialLoad) {
					hasMoreMessages = Boolean(data.data.has_more);
					messages = serverMessages;
					await tick();
					scrollToBottom(false);
				} else {
					// Polling & Realtime merge: Remove unsent/deleted messages and merge new incoming messages cleanly
					const serverIds = new Set(serverMessages.map(sm => sm.id));
					const minServerId = serverMessages.length > 0 ? Math.min(...serverMessages.map(sm => sm.id)) : 0;

					// Preserve pending optimistic temporary messages
					const pendingTempMessages = messages.filter(m => 
						String(m.id).startsWith('temp-') && 
						!serverMessages.some(sm => sm.message === m.message && sm.sender_id === m.sender_id)
					);

					const updatedExisting = messages.filter(m => {
						const idStr = String(m.id);
						if (removedMessageIds.has(m.id) || removedMessageIds.has(idStr)) return false;
						if (recentlyDeletedMessageIds.has(m.id) || recentlyDeletedMessageIds.has(idStr)) return false;
						if (idStr.startsWith('temp-')) return false; // Handled separately in pendingTempMessages
						// If message was within the range returned by server, but missing from serverMessages, it was unsent/deleted!
						if (minServerId > 0 && typeof m.id === 'number' && m.id >= minServerId && !serverIds.has(m.id)) {
							return false;
						}
						return true;
					}).map(m => {
						const found = serverMessages.find(sm => String(sm.id) === String(m.id));
						return found ? { ...m, ...found } : m;
					});

					const updatedExistingIds = new Set(updatedExisting.map(m => m.id));
					const newIncoming = serverMessages.filter(sm => !updatedExistingIds.has(sm.id));

					const isAtBottom = chatContainer ? (chatContainer.scrollHeight - chatContainer.scrollTop <= chatContainer.clientHeight + 80) : true;
					
					const combined = [...updatedExisting, ...newIncoming, ...pendingTempMessages];
					combined.sort((a, b) => {
						const timeA = new Date(a.created_at || 0).getTime();
						const timeB = new Date(b.created_at || 0).getTime();
						if (timeA !== timeB) return timeA - timeB;
						return (a.id || 0) - (b.id || 0);
					});

					messages = combined;

					if (newIncoming.length > 0) {
						if (newIncoming.some(sm => sm.sender_id !== user.id)) {
							playIncomingMessageSound(user?.id);
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
			const ticketId = activeFriend?.ticket_id || null;
			const res = await fetch(API_ENDPOINTS.getMessages, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: user.id,
					friend_id: activeFriend.friend_id,
					ticket_id: ticketId,
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

	function promptToggleBlockUser(target) {
		if (!target) return;
		if (isCurrentFriendBlockedByMe) {
			handleToggleBlockUser(target.friend_id || target.id, true);
		} else {
			blockModalTarget = target;
			showBlockConfirmModal = true;
		}
	}

	async function handleToggleBlockUser(targetId, currentIsBlocked) {
		if (!user || !targetId) return;
		const action = currentIsBlocked ? 'unblock' : 'block';
		try {
			const res = await fetch(API_ENDPOINTS.blockUser, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: user.id,
					target_id: targetId,
					action: action
				})
			});
			const data = await res.json();
			if (data.success) {
				const isBlockedNow = action === 'block';
				if (activeFriend && String(activeFriend.friend_id || activeFriend.id) === String(targetId)) {
					activeFriend.is_blocked_by_me = isBlockedNow;
				}

				try {
					const stored = localStorage.getItem(`chronomuse_blocked_${user.id}`);
					let list = stored ? JSON.parse(stored) : [];
					if (isBlockedNow) {
						if (!list.some(b => String(b.id || b.friend_id) === String(targetId))) {
							list.push({ id: targetId, username: activeFriend?.username || 'User' });
						}
					} else {
						list = list.filter(b => String(b.id || b.friend_id) !== String(targetId));
					}
					localStorage.setItem(`chronomuse_blocked_${user.id}`, JSON.stringify(list));
				} catch (e) {}

				fetchChatList();
			} else if (data.error) {
				showNotificationModal(data.error, 'error');
			}
		} catch (err) {
			console.error('Error toggling block user:', err);
		}
	}

	async function sendMessage(textCustom) {
		const textToSend = textCustom || newMessageText.trim();
		if (!textToSend || !activeFriend || isSending) return;

		let formattedMessage = textToSend;
		if (replyingTo && !textCustom) {
			const replyPayloadText = replyingTo.isImage ? 'Photo' : replyingTo.text;
			const replyId = replyingTo.kind === 'note' ? (replyingTo.id || `note-${replyingTo.user_id}`) : (replyingTo.kind === 'memory' ? (replyingTo.id || `memory-${replyingTo.memory_id}`) : replyingTo.id);
			const replyUser = (replyingTo.kind === 'note' || replyingTo.kind === 'memory') ? replyingTo.username : replyingTo.sender_name;
			const replyTypeAttr = replyingTo.kind === 'note' ? ' type="note"' : (replyingTo.kind === 'memory' ? ' type="memory"' : '');
			formattedMessage = `[REPLY id="${replyId}" user="${encodeURIComponent(replyUser)}" text="${encodeURIComponent(replyPayloadText)}"${replyTypeAttr}]${textToSend}[/REPLY]`;
			replyingTo = null;
		}

		// If messaging a specific support ticket, bind reply to that ticket
		if (activeFriend?.ticket_id) {
			if (!formattedMessage.includes('[TICKET id="')) {
				formattedMessage = `[TICKET id="${activeFriend.ticket_id}"]${formattedMessage}[/TICKET]`;
			}
		} else if (activeFriend?.is_support || ['chronomuse_support', 'support'].includes(activeFriend?.username?.toLowerCase())) {
			let latestTicketId = null;
			for (let i = messages.length - 1; i >= 0; i--) {
				const tMatch = messages[i]?.message?.match(/\[TICKET id="([^"]+)"\]/);
				if (tMatch) {
					latestTicketId = tMatch[1];
					break;
				}
			}
			if (latestTicketId && !formattedMessage.includes('[TICKET id="')) {
				formattedMessage = `[TICKET id="${latestTicketId}"]${formattedMessage}[/TICKET]`;
			}
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
							message: formattedMessage,
							feedback_id: activeFriend.ticket_id || null
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
			feedback_id: activeFriend.ticket_id || null,
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
			...friends.filter(f => (activeFriend.ticket_id ? (f.id !== activeFriend.id) : (f.friend_id !== activeFriend.friend_id)))
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
					message: formattedMessage,
					feedback_id: activeFriend.ticket_id || null
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
		if (next.size === 0) {
			isSelectionMode = false;
		}
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

		const idsToDeleteStr = new Set(Array.from(selectedMessageIds).map(id => String(id)));
		const validIds = messages
			.filter(m => idsToDeleteStr.has(String(m.id)) && String(m.sender_id) === String(user.id))
			.map(m => m.id);

		if (validIds.length === 0) {
			showNotificationModal('You can only unsend messages that you sent.', 'error');
			return;
		}

		const validIdsStr = new Set(validIds.map(id => String(id)));
		isDeletingMessages = true;
		messages = messages.map(m => {
			if (validIdsStr.has(String(m.id))) {
				return { ...m, message: '__UNSENT__' };
			}
			return m;
		});
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
		idsToRemove.forEach(id => {
			newRemoved.add(id);
			newRemoved.add(String(id));
			recentlyDeletedMessageIds.add(id);
			recentlyDeletedMessageIds.add(String(id));
			if (typeof id === 'string' && !isNaN(Number(id))) {
				newRemoved.add(Number(id));
				recentlyDeletedMessageIds.add(Number(id));
			}
		});
		removedMessageIds = newRemoved;
		saveRemovedMessages();

		const strIdsToRemove = new Set(idsToRemove.map(id => String(id)));
		messages = messages.filter(m => !strIdsToRemove.has(String(m.id)) && !recentlyDeletedMessageIds.has(m.id) && !recentlyDeletedMessageIds.has(String(m.id)));
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
		const replyText = parsed.isImage ? 'Photo' : (parsed.text === '__UNSENT__' ? 'Unsent message' : (parsed.text || 'Photo / Attachment'));
		replyingTo = {
			kind: 'message',
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

	// Opens the friend's chat and pre-fills a reply that quotes their note
	async function triggerNoteReply(fn) {
		if (!fn) return;
		const targetFriend = [...friends, ...requests].find(f => Number(f.friend_id) === Number(fn.user_id))
			|| { friend_id: fn.user_id, username: fn.username, avatar_url: fn.avatar_url || null };
		viewingNote = null;
		// Don't await: show the reply bar instantly while messages load in the background
		selectFriend(targetFriend);
		replyingTo = {
			kind: 'note',
			id: `note-${fn.user_id}`,
			user_id: fn.user_id,
			username: fn.username,
			sender_name: fn.username,
			text: fn.note_text,
			isImage: false,
			imageUrl: null
		};
		tick().then(() => {
			if (messageInputRef) {
				messageInputRef.focus();
			}
		});
	}

	// Opens the friend's chat and pre-fills a thanks reply quoting their shared memory
	async function triggerMemoryReply(mr) {
		if (!mr) return;
		const targetFriend = [...friends, ...requests].find(f => Number(f.friend_id) === Number(mr.friend_id))
			|| { friend_id: mr.friend_id, username: mr.username, avatar_url: mr.avatar_url || null };
		viewingNote = null;
		selectFriend(targetFriend);
		replyingTo = {
			kind: 'memory',
			id: `memory-${mr.memory_id || Date.now()}`,
			memory_id: mr.memory_id,
			user_id: mr.friend_id,
			username: mr.username,
			sender_name: mr.username,
			text: mr.memory_date,
			isImage: false,
			imageUrl: null
		};
		newMessageText = 'Thanks!';
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
				const optimizedFile = await compressImage(file, { maxWidth: 1400, maxHeight: 1400, quality: 0.80, outputType: 'image/webp' });
				const fileExt = optimizedFile.name.split('.').pop() || 'webp';
				const fileName = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
				const filePath = `${user.id}/${fileName}`;

				const { error: uploadError } = await supabase.storage
					.from('memories')
					.upload(filePath, optimizedFile);

				if (uploadError) {
					console.error('Image upload failed:', file.name, uploadError.message);
					showNotificationModal('Image upload failed: ' + uploadError.message, 'error');
					continue;
				}

				const { data: urlData } = supabase.storage.from('memories').getPublicUrl(filePath);
				const imageUrl = urlData.publicUrl;

				await sendMessage(`[IMG]${imageUrl}[/IMG]`);
			}
		} catch (err) {
			console.error('Error uploading chat image:', err);
			showNotificationModal('Failed to upload image. Please try again.', 'error');
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
		if (rawReplyText === '__UNSENT__') return { isImage: false, text: 'Unsent message', imageUrl: '' };
		const isImg = isImageUrl(rawReplyText) || rawReplyText.includes('[IMG]') || rawReplyText.includes('.supabase.co') || rawReplyText === 'Photo' || rawReplyText.includes('📷 Photo');
		if (isImg) {
			const cleanUrl = extractImageUrl(rawReplyText);
			const hasValidUrl = cleanUrl && (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://'));
			return {
				isImage: true,
				text: 'Photo',
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

		const replyRegex = /^\[REPLY id="([^"]*)" user="([^"]*)" text="([^"]*)"(?: type="([^"]*)")?\]([\s\S]*?)\[\/REPLY\]/;
		const match = text.match(replyRegex);

		if (match) {
			let decodedUser = match[2];
			try {
				decodedUser = decodeURIComponent(match[2]);
			} catch (e) {}
			replyData = {
				id: match[1],
				user: decodedUser,
				text: decodeURIComponent(match[3]),
				type: match[4] || null
			};
			cleanText = match[5];
		}

		// Strip ticket metadata wrapper tags for a clean customer support experience
		cleanText = cleanText.replace(/\[TICKET id="[^"]*"\]\n?/g, '');
		cleanText = cleanText.replace(/\n?\[\/TICKET\]/g, '');

		const isImage = isImageUrl(cleanText);
		const imageUrl = isImage ? extractImageUrl(cleanText) : '';

		return {
			reply: replyData,
			text: cleanText,
			isImage,
			imageUrl
		};
	}

	function scrollToMessage(targetId) {
		if (!targetId) return;

		let targetElem = document.getElementById(`msg-${targetId}`);
		
		// Fallback: search by message id or matching reply text if element not immediately found by exact id
		if (!targetElem) {
			const foundMsg = messages.find(m => String(m.id) === String(targetId));
			if (foundMsg) {
				targetElem = document.getElementById(`msg-${foundMsg.id}`);
			}
		}

		if (targetElem) {
			targetElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
			const actualId = targetElem.id.replace('msg-', '');
			highlightedMessageId = actualId;
			if (highlightTimer) clearTimeout(highlightTimer);
			highlightTimer = setTimeout(() => {
				if (highlightedMessageId === actualId) {
					highlightedMessageId = null;
				}
			}, 2400);
		}
	}

	function formatLastMessagePreview(text, isSentByMe = false, partnerName = 'User') {
		if (!text) return 'Tap to start chatting';
		if (text === '__UNSENT__') {
			return isSentByMe ? 'You unsent a message' : `${partnerName} unsent a message`;
		}
		const parsed = parseMessage(text);
		if (parsed.isImage) return 'Photo attachment';
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

	// ─── Notes Functions (Unified with Profile page — uses chronomuse_users.note) ───

	function fetchNotes() {
		if (!user) return;
		// Own note: load from localStorage (set by profile page) or from user object
		let storedNote = typeof window !== 'undefined'
			? (localStorage.getItem(`chronomuse_note_${user.id}`) || user.note || '')
			: (user.note || '');
		const storedNoteTime = typeof window !== 'undefined'
			? localStorage.getItem(`chronomuse_note_time_${user.id}`)
			: null;
		if (storedNote && storedNoteTime) {
			const diff = (parseInt(storedNoteTime, 10) + 24 * 60 * 60 * 1000) - Date.now();
			if (diff <= 0) {
				storedNote = '';
				if (typeof window !== 'undefined') {
					localStorage.removeItem(`chronomuse_note_${user.id}`);
					localStorage.removeItem(`chronomuse_note_time_${user.id}`);
				}
				deleteNote();
			}
		}
		myNote = storedNote ? { note_text: storedNote } : null;

		// Friends' notes: derived from friends/requests list (note field from get_chat_list API)
		const allFriendsList = [...friends, ...requests];
		friendNotes = allFriendsList
			.filter(f => f.note && f.note.trim())
			.map(f => ({
				user_id: f.friend_id,
				username: f.username,
				avatar_url: f.avatar_url || null,
				note_text: f.note
			}));
	}

	async function saveNote() {
		if (!user || !noteInput.trim() || isSavingNote) return;
		isSavingNote = true;
		try {
			const noteText = noteInput.trim().slice(0, 60);
			const nowTimestamp = Date.now();
			// Update note via profile API — same as Profile page
			await fetch(API_ENDPOINTS.updateProfile, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: user.id, note: noteText })
			});
			// Update localStorage so profile page stays in sync
			if (typeof window !== 'undefined') {
				if (noteText) {
					localStorage.setItem(`chronomuse_note_${user.id}`, noteText);
					localStorage.setItem(`chronomuse_note_time_${user.id}`, nowTimestamp.toString());
				} else {
					localStorage.removeItem(`chronomuse_note_${user.id}`);
					localStorage.removeItem(`chronomuse_note_time_${user.id}`);
				}
				// Update stored user object too
				try {
					const storedUser = localStorage.getItem('chronomuse_user');
					if (storedUser) {
						const parsed = JSON.parse(storedUser);
						localStorage.setItem('chronomuse_user', JSON.stringify({ ...parsed, note: noteText }));
					}
				} catch (e) {}
			}
			myNote = noteText ? { note_text: noteText } : null;
			showNoteModal = false;
			noteInput = '';
			// Broadcast note change so Profile page and other devices update in realtime
			try {
				broadcastProfileEvent(user.id, { note: noteText, note_time: nowTimestamp });
			} catch (e) {}
		} catch (err) {
			console.error('Error saving note:', err);
		} finally {
			isSavingNote = false;
		}
	}

	async function deleteNote() {
		if (!user) return;
		try {
			await fetch(API_ENDPOINTS.updateProfile, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: user.id, note: '' })
			});
			if (typeof window !== 'undefined') {
				localStorage.removeItem(`chronomuse_note_${user.id}`);
				localStorage.removeItem(`chronomuse_note_time_${user.id}`);
				try {
					const storedUser = localStorage.getItem('chronomuse_user');
					if (storedUser) {
						const parsed = JSON.parse(storedUser);
						localStorage.setItem('chronomuse_user', JSON.stringify({ ...parsed, note: '' }));
					}
				} catch (e) {}
			}
			myNote = null;
			showNoteModal = false;
			noteInput = '';
			try {
				broadcastProfileEvent(user.id, { note: '' });
			} catch (e) {}
		} catch (err) {
			console.error('Error deleting note:', err);
		}
	}

	function openNoteModal() {
		viewingNote = null;
		noteInput = myNote?.note_text || '';
		updateChatNoteCountdown();
		showNoteModal = true;
	}

	let chatNoteCountdown = $state('24h 00m 00s');
	let noteCountdownInterval = null;

	function updateChatNoteCountdown() {
		currentTime = Date.now();
		const now = Date.now();
		const targetId = viewingNote?.friend_id || viewingNote?.user_id || user?.id;
		if (!targetId || (!myNote && !viewingNote)) {
			chatNoteCountdown = '24h 00m 00s';
			return;
		}

		let noteTime = null;
		if (typeof window !== 'undefined') {
			const stored = localStorage.getItem(`chronomuse_note_time_${targetId}`);
			if (stored) {
				noteTime = parseInt(stored, 10);
			} else {
				noteTime = now;
				localStorage.setItem(`chronomuse_note_time_${targetId}`, noteTime.toString());
			}
		}

		const diff = (noteTime + 24 * 60 * 60 * 1000) - now;
		if (diff <= 0) {
			chatNoteCountdown = 'Expired';
			// Auto clear note when expired so user can write a new one
			if (user?.id && (String(targetId) === String(user.id) || !viewingNote)) {
				myNote = null;
				deleteNote();
			}
		} else {
			const h = Math.floor(diff / (1000 * 60 * 60));
			const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
			const s = Math.floor((diff % (1000 * 60)) / 1000);
			chatNoteCountdown = `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
		}
	}

	function getMyNoteTimeRemaining() {
		const _ = currentTime; // Reactive dependency
		if (!myNote || !user?.id) return '';
		const now = Date.now();
		let noteTime = now;
		if (typeof window !== 'undefined') {
			const stored = localStorage.getItem(`chronomuse_note_time_${user.id}`);
			if (stored) noteTime = parseInt(stored, 10);
		}
		const diff = (noteTime + 24 * 60 * 60 * 1000) - now;
		if (diff <= 0) return 'Expired';
		const h = Math.floor(diff / (1000 * 60 * 60));
		const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
		if (h > 0) return `${h}h left`;
		return `${Math.max(1, m)}m left`;
	}

	function getNoteTimeLeft() {
		return chatNoteCountdown;
	}
</script>

<svelte:head>
	<title>Chat - ChronoMuse</title>
</svelte:head>

<div
	style={activeFriend !== null ? `height: ${mobileViewportHeight}; top: ${mobileViewportTop};` : ''}
	class="bg-[#fff0f5] flex flex-col font-sans animate-fade-in {activeFriend !== null ? 'fixed inset-x-0 bottom-auto z-40 w-full overflow-hidden overscroll-none md:static md:z-auto md:h-auto md:min-h-screen md:top-auto md:w-auto' : 'min-h-screen'}"
>
	<!-- Top Navigation (Hidden on mobile when chat is open, always visible on desktop) -->
	<div class="{activeFriend !== null ? 'hidden md:block' : 'block'}">
		<AppHeader />
	</div>

	<!-- Chat Body Container (Sized consistent with Dashboard and Friends pages: max-w-6xl xl:max-w-7xl) -->
	<div class="flex-grow flex flex-col md:flex-row overflow-hidden {activeFriend !== null ? 'p-0 w-full h-full max-w-full md:container md:mx-auto md:px-6 lg:md:px-8 md:py-4 md:max-w-6xl md:xl:max-w-7xl md:gap-4 md:h-[calc(100vh-5.5rem)]' : 'container mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4 max-w-6xl xl:max-w-7xl gap-3 sm:gap-4 h-[calc(100vh-4.5rem)] sm:h-[calc(100vh-5.5rem)]'}">
		
		<!-- Left Panel: Friends & Search (Consistent Sizing) -->
		<div class="w-full md:w-80 lg:w-96 flex-shrink-0 bg-white/95 backdrop-blur-md border border-pink-100 rounded-2xl sm:rounded-3xl shadow-[0_4px_20px_rgba(244,114,182,0.08)] flex flex-col overflow-hidden animate-fade-in-up" class:hidden={activeFriend !== null} class:md:flex={true} style="animation-delay: 0.05s">
			<!-- Conversations Header -->
			<div class="p-3.5 sm:p-4 bg-[#fdf2f6] text-pink-950 border-b border-pink-100 font-black text-xs sm:text-sm flex items-center justify-between">
				<div class="flex items-center space-x-2">
					<div class="w-7 h-7 rounded-xl bg-[#f43f8e]/10 text-[#f43f8e] flex items-center justify-center">
						<MessageSquare class="w-4 h-4" strokeWidth={2.2} />
					</div>
					<span class="font-black text-pink-950 text-sm">Messages</span>
				</div>
				<span class="text-[10px] bg-pink-100 text-[#f43f8e] px-2.5 py-0.5 rounded-full font-black border border-pink-200/80">{friends.length + requests.length}</span>
			</div>

			<!-- Search Bar -->
			<div class="p-2.5 sm:p-3 border-b border-pink-100/80 bg-[#fff5f8]/50 space-y-1.5">
				<div class="relative">
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search conversations..."
						class="w-full pl-8 pr-3 py-2 bg-[#fdf2f6] border border-pink-200/80 rounded-xl text-pink-900 placeholder-pink-400/70 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/30 focus:border-[#f43f8e] focus:bg-white transition-all shadow-2xs"
					/>
					<Search class="w-3.5 h-3.5 text-pink-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={2.5} />
				</div>
			</div>

			<!-- iMessage-style Notes Row with Expiration Time Count -->
			{#if myNote || friendNotes.length > 0 || (!isLoadingChatList)}
			<div class="px-2.5 sm:px-3 pt-2.5 pb-1.5">
				<div
					bind:this={notesScrollRef}
					class="flex gap-2.5 overflow-x-auto pb-1.5 notes-scroll-row items-start"
					style="scrollbar-width: none; -ms-overflow-style: none;"
				>
					<!-- "Your Note" pill with live expiration count -->
					<button
						onclick={openNoteModal}
						class="flex flex-col items-center flex-shrink-0 group cursor-pointer select-none"
						style="min-width: 68px; max-width: 80px;"
						title="{myNote ? `Edit your note (Expires in ${chatNoteCountdown})` : 'Add a note'}"
					>
						<!-- Speech bubble -->
						<div class="relative mb-1.5 w-full">
							<div class="note-bubble bg-white border border-pink-200 rounded-xl px-1.5 py-1 text-[10px] font-semibold text-pink-800 leading-tight text-center min-h-[28px] flex items-center justify-center shadow-2xs transition-all group-hover:border-[#f43f8e]/50 group-active:scale-95">
								{#if myNote}
									<span class="line-clamp-2">{myNote.note_text}</span>
								{:else}
									<span class="text-[#f43f8e] text-base leading-none font-bold">+</span>
								{/if}
							</div>
							<!-- Bubble tail -->
							<span class="absolute -bottom-[4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-white border-b border-r border-pink-200 rotate-45 pointer-events-none rounded-br-2xs"></span>
						</div>
						<!-- Avatar & Expiration Indicator -->
						<div class="relative">
							<div class="w-10 h-10 rounded-2xl bg-pink-100 border-2 border-pink-200 flex items-center justify-center overflow-hidden group-hover:scale-105 transition-transform shadow-2xs">
								{#if user?.avatar_url}
									<img src={user.avatar_url} alt="You" class="w-full h-full object-cover" />
								{:else}
									<span class="text-[#f43f8e] font-black text-sm">{user?.username?.charAt(0).toUpperCase() || '?'}</span>
								{/if}
							</div>
						</div>
						<span class="text-[9px] font-bold text-pink-800 mt-1 truncate w-full text-center">Your note</span>
						{#if myNote}
							<span class="text-[8px] font-black text-[#f43f8e] tracking-tight bg-pink-50 border border-pink-200/80 px-1.5 py-0.5 rounded-full mt-0.5 shadow-2xs flex items-center gap-0.5">
								<Clock class="w-2 h-2" strokeWidth={2.5} />
								<span>{getMyNoteTimeRemaining()}</span>
							</span>
						{/if}
					</button>

					<!-- Divider -->
					{#if friendNotes.length > 0}
						<div class="w-px bg-pink-100 self-stretch my-1 flex-shrink-0"></div>
					{/if}

					<!-- Friends' Notes -->
					{#each friendNotes as fn (fn.user_id)}
						<button
							onclick={() => { viewingNote = fn; updateChatNoteCountdown(); }}
							class="flex flex-col items-center flex-shrink-0 group cursor-pointer select-none"
							style="min-width: 64px; max-width: 72px;"
							title="{fn.username}'s note"
						>
							<!-- Speech bubble -->
							<div class="relative mb-1.5 w-full">
								<div class="note-bubble bg-white border border-pink-200 rounded-xl px-1.5 py-1 text-[10px] font-semibold text-pink-800 leading-tight text-center min-h-[28px] flex items-center justify-center shadow-2xs transition-all group-hover:border-[#f43f8e]/50 group-active:scale-95">
									<span class="line-clamp-2">{fn.note_text}</span>
								</div>
								<!-- Bubble tail -->
								<span class="absolute -bottom-[4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-white border-b border-r border-pink-200 rotate-45 pointer-events-none rounded-br-2xs"></span>
							</div>
							<!-- Avatar -->
							<div class="w-10 h-10 rounded-2xl bg-pink-50 border-2 border-pink-200 flex items-center justify-center overflow-hidden group-hover:scale-105 transition-transform shadow-2xs">
								{#if fn.avatar_url}
									<img src={fn.avatar_url} alt={fn.username} class="w-full h-full object-cover" />
								{:else}
									<span class="text-[#f43f8e] font-black text-sm">{fn.username.charAt(0).toUpperCase()}</span>
								{/if}
							</div>
							<span class="text-[9px] font-bold text-pink-700 mt-1 truncate w-full text-center">@{fn.username}</span>
						</button>
					{/each}
				</div>
			</div>
			{/if}

			<!-- All / Unread / Requests Filter Tabs (Pills) -->
			<div class="px-2 sm:px-2.5 pb-2 pt-0.5">
				<div class="grid grid-cols-3 gap-1 p-0.5 bg-[#fdf2f6] rounded-xl border border-pink-100">
					<button
						onclick={() => chatListFilter = 'all'}
						class="py-1 px-1 rounded-lg text-xs font-bold transition-all duration-150 flex items-center justify-center space-x-1 active:scale-95 text-center cursor-pointer {chatListFilter === 'all' ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-600 hover:bg-pink-100/70 hover:text-pink-900'}"
					>
						<span>All</span>
						<span class="text-[9px] px-1 py-0.2 rounded-full {chatListFilter === 'all' ? 'bg-white/20 text-white' : 'bg-pink-100 text-pink-700 font-bold'}">
							{allConversations.length || (friends.length + requests.length)}
						</span>
					</button>

					<button
						onclick={() => chatListFilter = 'unread'}
						class="py-1 px-1 rounded-lg text-xs font-bold transition-all duration-150 flex items-center justify-center space-x-1 active:scale-95 text-center relative cursor-pointer {chatListFilter === 'unread' ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-600 hover:bg-pink-100/70 hover:text-pink-900'}"
					>
						<span>Unread</span>
						{#if unreadUsersCount > 0}
							<span class="text-[9px] px-1 py-0.2 rounded-full font-bold {chatListFilter === 'unread' ? 'bg-white text-[#f43f8e]' : 'bg-[#f43f8e] text-white animate-pulse'}">
								{unreadUsersCount}
							</span>
						{:else}
							<span class="text-[9px] px-1 py-0.2 rounded-full {chatListFilter === 'unread' ? 'bg-white/20 text-white' : 'bg-pink-100 text-pink-700 font-bold'}">
								0
							</span>
						{/if}
					</button>

					<button
						onclick={() => chatListFilter = 'requests'}
						class="py-1 px-1 rounded-lg text-xs font-bold transition-all duration-150 flex items-center justify-center space-x-1 active:scale-95 text-center relative cursor-pointer {chatListFilter === 'requests' ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-600 hover:bg-pink-100/70 hover:text-pink-900'}"
					>
						<span>Requests</span>
						{#if requests.length > 0}
							<span class="text-[9px] px-1 py-0.2 rounded-full font-bold {chatListFilter === 'requests' ? 'bg-white text-[#f43f8e]' : unreadRequestsCount > 0 ? 'bg-rose-500 text-white animate-pulse' : 'bg-pink-100 text-pink-700'}">
								{requests.length}
							</span>
						{:else}
							<span class="text-[9px] px-1 py-0.2 rounded-full {chatListFilter === 'requests' ? 'bg-white/20 text-white' : 'bg-pink-100 text-pink-700 font-bold'}">
								0
							</span>
						{/if}
					</button>
				</div>
			</div>

			<!-- Friends List -->
			<div class="flex-grow overflow-y-auto p-2 sm:p-2.5 space-y-1.5">
				{#if isLoadingChatList && friends.length === 0 && requests.length === 0}
					<div class="space-y-2 p-1 animate-pulse">
						{#each Array(5) as _}
							<div class="p-2.5 rounded-2xl bg-pink-50/50 border border-pink-100 flex items-center space-x-3">
								<div class="w-10 h-10 rounded-full bg-pink-200/70 flex-shrink-0"></div>
								<div class="flex-1 space-y-1.5 min-w-0">
									<div class="h-3.5 bg-pink-200/70 rounded w-1/2"></div>
									<div class="h-2.5 bg-pink-200/50 rounded w-3/4"></div>
								</div>
							</div>
						{/each}
					</div>
				{:else if !isLoadingChatList && filteredFriends().length === 0}
					<div class="p-6 text-center text-pink-400 text-xs">
						{#if chatListFilter === 'unread'}
							<p class="font-semibold text-pink-700 text-xs mb-1">No unread chats</p>
							<p class="text-pink-400/80">You're all caught up!</p>
						{:else if chatListFilter === 'requests'}
							<div class="flex flex-col items-center">
								<p class="font-semibold text-pink-700 text-xs mb-1">No message requests</p>
								<p class="text-pink-400/80">Messages from people who aren't your friends yet will appear here.</p>
							</div>
						{:else if searchQuery.trim()}
							<p class="font-semibold text-pink-700 text-xs mb-1">No conversations found</p>
							<p class="text-pink-400/80">No results for "{searchQuery}"</p>
						{:else}
							<p class="font-semibold text-pink-700 text-xs mb-1">No friends found</p>
							<p class="text-pink-400/80">Add friends from the Friends menu to start chatting!</p>
						{/if}
					</div>
				{:else}
					{#each filteredFriends() as friend (friend.id || friend.friend_id)}
						{@const isActive = isRecentActive(friend)}
						{@const isSelected = activeFriend?.ticket_id ? (Number(activeFriend.ticket_id) === Number(friend.ticket_id)) : (Number(activeFriend?.friend_id) === Number(friend.friend_id) && !friend.ticket_id)}
						{@const isSentByMe = friend.last_sender_id === user?.id}
						{@const isUnread = friend.unread_count > 0}
						<button
							onclick={() => selectFriend(friend)}
							class="w-full p-2 sm:p-2.5 flex items-center space-x-2.5 text-left relative group rounded-xl border transition-all cursor-pointer hover:shadow-2xs active:scale-[0.99] {isSelected ? 'bg-[#fdf2f6] border-[#f43f8e]/50 ring-2 ring-[#f43f8e]/20 shadow-xs' : 'bg-white/90 hover:bg-[#fff5f8] border-pink-100 hover:border-pink-200'}"
						>
							<div class="relative flex-shrink-0">
								<div class="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-pink-100 text-[#f43f8e] border border-pink-200/90 flex items-center justify-center font-bold text-xs sm:text-sm group-hover:scale-105 transition-transform overflow-hidden">
									{#if friend.avatar_url}
										<img src={friend.avatar_url} alt={friend.username} class="w-full h-full object-cover" />
									{:else}
										{friend.username.charAt(0).toUpperCase()}
									{/if}
								</div>
								<!-- Active / Offline Status Dot -->
								{#if isActive}
									<span class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white animate-pulse" title="Active now"></span>
								{:else}
									<span class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-pink-200 border-2 border-white" title={formatLastActive(friend)}></span>
								{/if}
							</div>
							<div class="flex-grow min-w-0">
								<div class="flex items-center justify-between">
									<div class="flex items-center space-x-1.5 min-w-0 flex-grow pr-1">
										{#if friend.is_ticket}
											<p class="text-xs sm:text-sm font-black truncate transition-colors {isUnread ? 'text-pink-950' : isSelected ? 'text-[#f43f8e]' : 'text-pink-900 group-hover:text-[#f43f8e]'}">
												{friend.ticket_title}
											</p>
											<span class="inline-flex items-center text-[8px] font-mono font-black text-[#f43f8e] bg-pink-100/90 border border-pink-200 px-1 py-0.2 rounded-md flex-shrink-0">
												#{friend.ticket_id}
											</span>
											{#if friend.ticket_status === 'resolved'}
												<span class="inline-flex items-center text-[8px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.2 rounded-full flex-shrink-0">
													Resolved
												</span>
											{:else}
												<span class="inline-flex items-center text-[8px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.2 rounded-full flex-shrink-0">
													Open
												</span>
											{/if}
										{:else}
											<p class="text-xs sm:text-sm font-semibold truncate transition-colors {isUnread ? 'font-bold text-pink-950' : isSelected ? 'font-bold text-[#f43f8e]' : 'text-pink-900 group-hover:text-[#f43f8e]'}">
												@{friend.username}
											</p>
											{#if friend.is_support || ['chronomuse_support', 'support'].includes(friend.username?.toLowerCase())}
												<span class="inline-flex items-center gap-0.5 text-[8px] font-black text-[#f43f8e] bg-pink-50 border border-pink-200 px-1.5 py-0.2 rounded-full flex-shrink-0 shadow-3xs">
													<ShieldCheck class="w-2.5 h-2.5 text-[#f43f8e]" />
													<span>Support</span>
												</span>
											{:else if friend.is_request || !friend.is_friend}
												<span class="inline-flex items-center text-[8px] font-bold text-amber-700 bg-amber-100 border border-amber-300/80 px-1 py-0.1 rounded-full flex-shrink-0">
													Request
												</span>
											{/if}
										{/if}
									</div>
									{#if friend.last_message_time}
										<span class="text-[9px] sm:text-[10px] font-medium ml-1 flex-shrink-0 {isUnread ? 'text-[#f43f8e] font-bold' : 'text-pink-400/80'}">
											{formatFriendListDate(friend.last_message_time)}
										</span>
									{/if}
								</div>
								<div class="flex items-center justify-between mt-0.5 min-w-0">
									<p class="text-[11px] sm:text-xs truncate flex items-center gap-1 min-w-0 {isUnread ? 'font-semibold text-pink-900' : 'text-pink-800/70'}">
										{#if activeFriend?.friend_id === friend.friend_id && isOtherUserTyping}
											<span class="text-[#f43f8e] font-semibold italic animate-pulse">typing...</span>
										{:else}
											{#if isSentByMe && friend.last_message}
												{#if friend.last_is_read}
													<!-- Seen indicator -->
													<span class="inline-flex items-center text-[#f43f8e] font-medium text-[10px] flex-shrink-0" title="Seen">
														<Check class="w-3 h-3 text-[#f43f8e] mr-0.5" strokeWidth={2.5} />
														<span class="text-[9px] font-semibold text-[#f43f8e]">Seen:</span>
													</span>
												{:else}
													<!-- Sent indicator -->
													<span class="inline-flex items-center text-pink-400 text-[10px] flex-shrink-0" title="Sent">
														<Check class="w-2.5 h-2.5 text-pink-400 mr-0.5" strokeWidth={2.5} />
														<span class="text-[9px] text-pink-400">Sent:</span>
													</span>
												{/if}
											{/if}
											<span class="truncate">{formatLastMessagePreview(friend.last_message, isSentByMe, friend.username)}</span>
										{/if}
									</p>

									{#if isUnread}
										<span class="ml-1.5 px-1.5 py-0.2 bg-[#f43f8e] text-white text-[9px] font-bold rounded-full flex-shrink-0 animate-pulse">
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
			class="flex-grow bg-white/95 backdrop-blur-md flex flex-col overflow-hidden relative animate-fade-in-up {activeFriend !== null ? 'h-full w-full rounded-none border-0 md:h-full md:rounded-2xl md:sm:rounded-3xl md:border md:border-pink-100 md:shadow-[0_4px_20px_rgba(244,114,182,0.08)]' : 'border border-pink-100 rounded-2xl sm:rounded-3xl shadow-[0_4px_20px_rgba(244,114,182,0.08)]'}"
			class:hidden={activeFriend === null}
			class:md:flex={true}
			style="animation-delay: 0.1s"
		>
			{#if activeFriend}
				<!-- Top Header / Selection Header -->
				{#if isSelectionMode}
					<div class="p-3 bg-[#f43f8e] text-white flex items-center justify-between animate-fade-in flex-shrink-0 sticky top-0 z-30 shadow-xs">
						<div class="flex items-center space-x-2">
							<button onclick={exitSelectionMode} class="p-1.5 rounded-xl hover:bg-white/20 text-white transition-colors cursor-pointer" aria-label="Exit selection">
								<X class="w-5 h-5" strokeWidth={2.5} />
							</button>
							<span class="font-bold text-sm">{selectedMessageIds.size} selected</span>
						</div>

						<div class="flex items-center space-x-2">
							<button
								onclick={unsendSelectedMessages}
								disabled={selectedMessageIds.size === 0 || isDeletingMessages}
								class="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all active:scale-95 shadow-2xs cursor-pointer"
								title="Unsend for everyone"
							>
								Unsend
							</button>
							<button
								onclick={removeSelectedForMe}
								disabled={selectedMessageIds.size === 0}
								class="px-3 py-1.5 bg-white/20 hover:bg-white/30 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all active:scale-95 cursor-pointer"
								title="Remove for me"
							>
								Remove for me
							</button>
						</div>
					</div>
				{:else}
					<!-- Active Chat Normal Header -->
					<div class="px-3 sm:px-6 lg:px-8 py-2 sm:py-2.5 bg-white/95 backdrop-blur-md border-b border-pink-200/60 text-pink-950 flex items-center justify-between flex-shrink-0 sticky top-0 z-30 shadow-xs">
						<div class="flex items-center space-x-2 sm:space-x-3 min-w-0">
							<button
								onclick={handleBackToChatList}
								class="md:hidden w-8 h-8 sm:w-8.5 sm:h-8.5 bg-white hover:bg-pink-50 border border-pink-200/90 rounded-xl text-pink-500 shadow-2xs flex items-center justify-center transition-all flex-shrink-0 active:scale-95 cursor-pointer"
								title="Back to Chat List"
								aria-label="Back to Chat List"
							>
								<ChevronLeft class="w-4 h-4" strokeWidth={2.5} />
							</button>
							<a
								href="/profile?id={activeFriend.friend_id}"
								class="flex items-center space-x-2.5 min-w-0 hover:opacity-95 transition-opacity group cursor-pointer"
								title="View @{activeFriend.username}'s Profile"
							>
								<div class="relative flex-shrink-0">
									<div class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-pink-100 border border-pink-200/90 flex items-center justify-center text-[#f43f8e] font-black text-sm sm:text-base overflow-hidden group-hover:scale-105 transition-transform shadow-2xs">
										{#if activeFriend.avatar_url}
											<img src={activeFriend.avatar_url} alt={activeFriend.username} class="w-full h-full object-cover" />
										{:else}
											{activeFriend.username.charAt(0).toUpperCase()}
										{/if}
									</div>
									{#if isRecentActive(activeFriend)}
										<span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full animate-pulse" title="Active"></span>
									{:else}
										<span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-slate-300 border-2 border-white rounded-full" title="Offline"></span>
									{/if}
								</div>
								<div class="min-w-0">
									<h3 class="font-black text-xs sm:text-sm leading-tight text-pink-950 truncate group-hover:underline flex items-center gap-1.5 flex-wrap">
										{#if activeFriend.is_ticket}
											<span>ChronoMuse Support</span>
											<span class="px-1.5 py-0.5 rounded-md bg-pink-100 text-[#f43f8e] font-mono text-[9px] font-black border border-pink-200">
												#TKT-{activeFriend.ticket_id}
											</span>
											{#if activeFriend.ticket_status === 'resolved'}
												<span class="px-2 py-0.2 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-black border border-emerald-200">
													Resolved
												</span>
											{:else}
												<span class="px-2 py-0.2 bg-amber-100 text-amber-700 rounded-full text-[9px] font-black border border-amber-200">
													Open
												</span>
											{/if}
										{:else}
											<span>@{activeFriend.username}</span>
											{#if activeFriend.is_support || ['chronomuse_support', 'support'].includes(activeFriend.username?.toLowerCase())}
												<span class="inline-flex items-center text-[#f43f8e]" title="Verified Official Support">
													<ShieldCheck class="w-3.5 h-3.5" />
												</span>
											{/if}
										{/if}
										<ChevronRight class="w-3.5 h-3.5 text-[#f43f8e] opacity-70 group-hover:opacity-100" strokeWidth={2.5} />
									</h3>
									<div class="text-[10px] text-pink-600 flex items-center gap-1 mt-0.5 min-w-0">
										{#if isOtherUserTyping}
											<span class="font-bold italic text-[#f43f8e] flex items-center gap-1">
												<span>typing</span>
												<span class="inline-flex gap-0.5">
													<span class="w-1 h-1 rounded-full bg-[#f43f8e] animate-bounce" style="animation-delay: 0ms"></span>
													<span class="w-1 h-1 rounded-full bg-[#f43f8e] animate-bounce" style="animation-delay: 150ms"></span>
													<span class="w-1 h-1 rounded-full bg-[#f43f8e] animate-bounce" style="animation-delay: 300ms"></span>
												</span>
											</span>
										{:else if activeFriend.is_ticket}
											<span class="font-bold text-pink-700 truncate">
												{activeFriend.ticket_category === 'bug' ? 'Bug: ' : activeFriend.ticket_category === 'help' ? 'Concern: ' : 'Idea: '}
												{activeFriend.ticket_title}
											</span>
										{:else if isRecentActive(activeFriend)}
											<span class="flex items-center gap-1 text-emerald-600 font-bold">
												<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
												<span>{formatLastActive(activeFriend)}</span>
											</span>
										{:else}
											<span class="flex items-center gap-1 text-pink-600/80 font-medium">
												<span class="w-1 h-1 rounded-full bg-pink-300 inline-block"></span>
												<span>{formatLastActive(activeFriend)}</span>
											</span>
										{/if}
									</div>
								</div>
							</a>
						</div>

						<!-- Header Action Menu (Three-dot Menu) -->
						<div class="relative flex-shrink-0">
							<button
								type="button"
								onclick={() => {
									playClickSound();
									showHeaderMenu = !showHeaderMenu;
								}}
								class="w-8 h-8 sm:w-8.5 sm:h-8.5 bg-white hover:bg-pink-50 border border-pink-200/90 text-pink-500 hover:text-[#f43f8e] rounded-xl flex items-center justify-center transition-all shadow-2xs active:scale-95 cursor-pointer {showHeaderMenu ? 'bg-pink-50 text-[#f43f8e] border-[#f43f8e]/40 ring-2 ring-pink-200/70' : ''}"
								title="Chat options"
								aria-label="Chat options"
								aria-expanded={showHeaderMenu}
							>
								<MoreVertical class="w-4 h-4 sm:w-4.5 sm:h-4.5" strokeWidth={2.2} />
							</button>

							{#if showHeaderMenu}
								<!-- Click-outside backdrop -->
								<div
									class="fixed inset-0 z-40"
									onclick={() => showHeaderMenu = false}
									role="presentation"
								></div>

								<!-- Dropdown Menu -->
								<div class="absolute right-0 top-full mt-2 w-48 sm:w-52 bg-white border border-pink-200 rounded-2xl shadow-2xl shadow-pink-500/20 z-50 p-1.5 animate-scale-up space-y-0.5">
									<!-- View Profile -->
									<a
										href="/profile?id={activeFriend.friend_id}"
										onclick={() => {
											playClickSound();
											showHeaderMenu = false;
										}}
										class="w-full px-3 py-2 rounded-xl flex items-center space-x-2.5 text-xs font-bold text-pink-950 hover:bg-pink-50 transition-colors group cursor-pointer"
									>
										<div class="w-7 h-7 rounded-lg bg-pink-50 border border-pink-100 flex items-center justify-center text-pink-500 group-hover:text-[#f43f8e] flex-shrink-0 shadow-3xs">
											<User class="w-3.5 h-3.5" strokeWidth={2.5} />
										</div>
										<span class="truncate">View Profile</span>
									</a>

									<!-- Block / Unblock User -->
									<button
										type="button"
										onclick={() => {
											playClickSound();
											showHeaderMenu = false;
											promptToggleBlockUser(activeFriend);
										}}
										class="w-full px-3 py-2 rounded-xl flex items-center space-x-2.5 text-xs font-bold {isCurrentFriendBlockedByMe ? 'text-emerald-700 hover:bg-emerald-50' : 'text-pink-950 hover:bg-rose-50'} transition-colors group cursor-pointer text-left"
									>
										<div class="w-7 h-7 rounded-lg {isCurrentFriendBlockedByMe ? 'bg-emerald-50 border border-emerald-100 text-emerald-600' : 'bg-pink-50 border border-pink-100 text-rose-500 group-hover:text-rose-600'} flex items-center justify-center flex-shrink-0 shadow-3xs">
											<Ban class="w-3.5 h-3.5" strokeWidth={2} />
										</div>
										<span class="truncate">{isCurrentFriendBlockedByMe ? 'Unblock User' : 'Block User'}</span>
									</button>

									<div class="my-1 border-t border-pink-100/70"></div>

									<!-- Clear Chat History -->
									<button
										type="button"
										onclick={() => {
											playClickSound();
											showHeaderMenu = false;
											showClearModal = true;
										}}
										class="w-full px-3 py-2 rounded-xl flex items-center space-x-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors group cursor-pointer text-left"
									>
										<div class="w-7 h-7 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500 group-hover:text-rose-600 flex-shrink-0 shadow-3xs">
											<Trash2 class="w-3.5 h-3.5" strokeWidth={2} />
										</div>
										<span class="truncate">Clear Chat History</span>
									</button>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Support Channel Banner or Friend Request Top Banner -->
				{#if activeFriend && (activeFriend.is_support || ['chronomuse_support', 'support'].includes(activeFriend.username?.toLowerCase()))}
					<div class="px-3 py-2 bg-gradient-to-r from-pink-50/90 to-rose-50/70 border-b border-pink-100 flex items-center justify-between text-xs gap-2 animate-fade-in flex-shrink-0">
						<div class="flex items-center gap-2 min-w-0">
							<div class="w-6 h-6 rounded-full bg-[#f43f8e] text-white flex items-center justify-center flex-shrink-0 shadow-3xs">
								<ShieldCheck class="w-3.5 h-3.5" />
							</div>
							<div class="min-w-0">
								{#if activeFriend.is_ticket}
									<p class="text-[11px] font-black text-pink-950 truncate">Ticket #{activeFriend.ticket_id}: {activeFriend.ticket_title}</p>
									<p class="text-[10px] text-pink-500 font-medium truncate">Dedicated conversation thread for this concern.</p>
								{:else}
									<p class="text-[11px] font-black text-pink-950 truncate">Official ChronoMuse Support</p>
									<p class="text-[10px] text-pink-500 font-medium truncate">Official Help Desk & Customer Support channel.</p>
								{/if}
							</div>
						</div>
						<span class="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black rounded-full flex items-center gap-1 flex-shrink-0">
							<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
							<span>Verified Support</span>
						</span>
					</div>
				{:else if activeFriend && (activeFriend.is_request || !activeFriend.is_friend)}
					{@const isPendingRequest = activeFriend.has_pending_request || sentFriendRequestUsernames.includes((activeFriend.username || '').toLowerCase()) || (activeFriend.pending_request_sender_id && String(activeFriend.pending_request_sender_id) === String(user?.id))}
					<div class="px-3 py-2 bg-amber-50 border-b border-pink-100 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs gap-2 animate-fade-in flex-shrink-0">
						<div class="text-pink-950 font-medium leading-relaxed">
							<span><strong>Message Request:</strong> You and @{activeFriend.username} are not connected as friends yet.</span>
						</div>
						<div class="flex items-center space-x-1.5 flex-shrink-0 self-end sm:self-auto">
							<a
								href="/profile?id={activeFriend.friend_id || activeFriend.id}"
								class="px-2.5 py-1 bg-white hover:bg-pink-50 text-pink-700 border border-pink-200 font-bold rounded-lg transition-colors flex items-center space-x-1 cursor-pointer shadow-2xs"
							>
								<User class="w-3.5 h-3.5" strokeWidth={2} />
								<span>Profile</span>
							</a>
							{#if isPendingRequest}
								<button
									type="button"
									onclick={() => cancelFriendRequestFromChat(activeFriend)}
									disabled={isSendingFriendRequest}
									class="group px-2.5 py-1 bg-amber-50 hover:bg-rose-50 text-amber-800 hover:text-rose-600 border border-amber-300 hover:border-rose-200 font-bold rounded-lg transition-all flex items-center space-x-1 shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50"
									title="Click to cancel friend request"
								>
									<Clock class="w-3.5 h-3.5 text-amber-700 group-hover:hidden" strokeWidth={2.2} />
									<X class="w-3.5 h-3.5 text-rose-500 hidden group-hover:inline" strokeWidth={2.2} />
									<span class="group-hover:hidden">Pending</span>
									<span class="hidden group-hover:inline">Cancel</span>
								</button>
							{:else}
								<button
									type="button"
									onclick={() => sendFriendRequestFromChat(activeFriend)}
									disabled={isSendingFriendRequest}
									class="px-2.5 py-1 bg-[#f43f8e] hover:bg-[#e0337f] text-white font-bold rounded-lg transition-all flex items-center space-x-1 active:scale-95 cursor-pointer shadow-xs disabled:opacity-50"
								>
									<UserPlus class="w-3.5 h-3.5" strokeWidth={2.2} />
									<span>Add Friend</span>
								</button>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Message Stream Container -->
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<div
					bind:this={chatContainer}
					role="region"
					aria-label="Chat messages"
					tabindex="-1"
					onscroll={handleChatScroll}
					onkeydown={(e) => {
						if (e.key === 'Escape' && isSelectionMode) {
							exitSelectionMode();
						}
					}}
					onclick={(e) => {
						if (isSelectionMode) {
							const isMessageBubble = e.target.closest('[id^="msg-"]');
							const isActionButton = e.target.closest('button');
							if (!isMessageBubble && !isActionButton) {
								exitSelectionMode();
							}
						}
					}}
					class="flex-1 min-h-0 p-2.5 sm:p-3 overflow-y-auto overflow-x-hidden space-y-2 sm:space-y-2.5 bg-[#fffafb] select-none overscroll-contain"
				>
					{#if isFetchingMessages && messages.length === 0}
						<div class="space-y-3 py-6 px-3 animate-pulse">
							<div class="flex items-start space-x-2.5">
								<div class="w-8 h-8 rounded-full bg-pink-200/70 flex-shrink-0"></div>
								<div class="h-10 w-44 bg-pink-100/80 rounded-2xl"></div>
							</div>
							<div class="flex items-start justify-end space-x-2.5">
								<div class="h-12 w-52 bg-pink-200/60 rounded-2xl"></div>
							</div>
							<div class="flex items-start space-x-2.5">
								<div class="w-8 h-8 rounded-full bg-pink-200/70 flex-shrink-0"></div>
								<div class="h-8 w-36 bg-pink-100/80 rounded-2xl"></div>
							</div>
						</div>
					{:else if messages.length === 0}
						<div class="h-full flex flex-col items-center justify-center text-pink-400 text-xs py-10">
							<div class="w-11 h-11 rounded-2xl bg-pink-100 border border-pink-200 text-pink-600 flex items-center justify-center mb-2">
								<MessageSquare class="w-5 h-5" strokeWidth={1.8} />
							</div>
							<p class="font-bold text-pink-950 text-xs sm:text-sm">Start a conversation with @{activeFriend.username}</p>
							<p class="text-[11px] text-pink-600 mt-0.5 max-w-xs text-center font-medium">Say hi, share photos, or swipe to reply!</p>
						</div>
					{:else}
						<!-- Loading Older Messages Spinner / History Header -->
						{#if isLoadingOlder}
							<div class="py-2 flex items-center justify-center space-x-2 text-pink-500 text-[11px] animate-fade-in bg-pink-50/60 rounded-xl border border-pink-100 mb-2">
								<div class="animate-spin w-3.5 h-3.5 border-2 border-pink-300 border-t-pink-500 rounded-full"></div>
								<span class="font-medium">Loading earlier messages...</span>
							</div>
						{:else if !hasMoreMessages && messages.length >= 20}
							<div class="py-1.5 text-center text-pink-400/80 text-[10px] font-medium border-b border-pink-100/60 pb-1.5 mb-1.5">
								<span>Beginning of conversation history</span>
							</div>
						{/if}

						{#each messages as msg, i (msg.id)}
							<!-- Date Separator Header with exact date formatting -->
							{#if isNewDay(i)}
								<div class="flex items-center justify-center my-2">
									<span class="px-3 py-0.5 bg-white/90 border border-pink-200 text-pink-700 text-[10px] font-bold rounded-full shadow-2xs">
										{formatDateDivider(msg.created_at)}
									</span>
								</div>
							{/if}

							{@const parsed = parseMessage(msg.message)}
							{@const isSelected = selectedMessageIds.has(msg.id)}
							{@const isUserSender = msg.sender_id === user.id}
							{@const isUnsent = msg.message === '__UNSENT__'}

							<!-- Message Container with Swipe -->
							<div class="relative w-full overflow-visible py-0.5 select-none">
								<!-- Message Row -->
								<div
									class="flex items-center space-x-1.5 group w-full"
									class:justify-end={isUserSender}
									class:justify-start={!isUserSender}
								>
									<!-- Selection Circle Indicator (shown in selection mode) -->
									{#if isSelectionMode}
										<button
											type="button"
											onclick={() => toggleMessageSelection(msg.id)}
											class="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer flex-shrink-0"
											class:bg-[#f43f8e]={isSelected}
											class:border-[#f43f8e]={isSelected}
											class:border-pink-300={!isSelected}
											class:bg-white={!isSelected}
										>
											{#if isSelected}
												<Check class="w-2.5 h-2.5 text-white" strokeWidth={3} />
											{/if}
										</button>
									{/if}

									<!-- Quick Reply Button on Hover -->
									{#if !isSelectionMode && !isUnsent && swipingMessageId !== msg.id}
										<button
											type="button"
											onclick={() => triggerReply(msg)}
											class="opacity-0 group-hover:opacity-100 p-1 text-pink-400 hover:text-[#f43f8e] hover:bg-pink-100/70 rounded-full transition-all text-xs flex-shrink-0 cursor-pointer"
											class:order-first={isUserSender}
											class:order-last={!isUserSender}
											title="Reply"
										>
											<Reply class="w-3.5 h-3.5" strokeWidth={2} />
										</button>
									{/if}

									<!-- Partner Profile Avatar (shown only on incoming partner messages) -->
									{#if !isUserSender}
										<a
											href="/profile?id={activeFriend.friend_id}"
											class="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-pink-100 text-[#f43f8e] border border-pink-200 flex items-center justify-center font-bold text-[11px] overflow-hidden flex-shrink-0 self-end mb-1 mr-0.5 hover:scale-105 transition-transform"
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
										<!-- Swipe Reply Indicator Icon -->
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
													class="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center transition-all duration-200 {isSwipeThresholdReached ? 'bg-[#f43f8e] text-white ring-2 ring-white scale-110 shadow-xs' : 'bg-pink-100 text-[#f43f8e] border border-pink-200'}"
												>
													<Reply class="w-3 h-3 sm:w-3.5 sm:h-3.5 transition-transform duration-200 {isSwipeThresholdReached ? 'scale-110 -rotate-12' : ''} {!isUserSender ? 'rotate-180' : ''}" strokeWidth={2.5} />
												</div>
											</div>
										{/if}

										<!-- Bubble Container -->
										<div
											id="msg-{msg.id}"
											role="button"
											tabindex="0"
											onclick={() => handleMessageClick(msg)}
											onkeydown={(e) => { if (e.key === 'Enter') handleMessageClick(msg); }}
											ontouchstart={(e) => handleDragStart(e.touches[0].clientX, e.touches[0].clientY, msg)}
											ontouchmove={(e) => handleDragMove(e.touches[0].clientX, e.touches[0].clientY, msg, e)}
											ontouchend={() => handleDragEnd(msg)}
											ontouchcancel={() => handleDragEnd(msg)}
											onmousedown={(e) => { if (e.button === 0) handleDragStart(e.clientX, e.clientY, msg); }}
											class="flex flex-col w-full cursor-pointer select-none transition-all duration-300 {msg.is_new ? 'animate-message-pop' : ''}"
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
													role="button"
													tabindex="0"
													onclick={(e) => { e.stopPropagation(); if (parsed.reply.type !== 'note' && parsed.reply.type !== 'memory') scrollToMessage(parsed.reply.id); }}
													onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); if (parsed.reply.type !== 'note' && parsed.reply.type !== 'memory') scrollToMessage(parsed.reply.id); } }}
													class="mb-1 px-2.5 py-1 rounded-xl text-[10px] border-l-3 bg-pink-100/90 text-pink-900 border-[#f43f8e] max-w-full flex items-center space-x-1 cursor-pointer hover:bg-pink-200/90 hover:border-pink-600 active:scale-95 transition-all group/reply shadow-2xs"
													class:self-end={isUserSender}
													class:self-start={!isUserSender}
													title="{parsed.reply.type === 'note' ? 'Replied to note' : parsed.reply.type === 'memory' ? 'Replied to shared memory' : 'Click to jump to replied message'}"
												>
													<span class="font-bold text-[#f43f8e] flex items-center gap-1 group-hover/reply:text-pink-900 transition-colors">
														<Reply class="w-2.5 h-2.5 text-[#f43f8e] group-hover/reply:-translate-x-0.5 transition-transform flex-shrink-0" strokeWidth={2.5} />
														{#if parsed.reply.type === 'memory'}
															<span>Replied to memory you shared on {parsed.reply.text}</span>
														{:else if parsed.reply.type === 'note'}
															{#if user && String(parsed.reply.user).toLowerCase() === String(user.username).toLowerCase()}
																<span>Replied to your note:</span>
															{:else}
																<span>Replied to @{parsed.reply.user}'s note:</span>
															{/if}
														{:else}
															<span>@{parsed.reply.user}:</span>
														{/if}
													</span>
													{#if parsed.reply.type !== 'memory'}
														{#if replyDetails.isImage}
															<div class="inline-flex items-center space-x-1 bg-white/80 px-1 py-0.2 rounded-xs border border-pink-200">
																{#if replyDetails.imageUrl}
																	<img src={replyDetails.imageUrl} alt="" class="w-3.5 h-3.5 rounded-xs object-cover border border-pink-200 flex-shrink-0" />
																{:else}
																	<ImageIcon class="w-3 h-3 text-pink-700 flex-shrink-0" strokeWidth={1.8} />
																{/if}
																<span class="font-bold text-pink-700 text-[9px]">Photo</span>
															</div>
														{:else}
															<span class="italic opacity-85 truncate">{replyDetails.text}</span>
														{/if}
													{/if}
												</div>
											{/if}

											<!-- Main Chat Bubble with Clear Visible Styling & Tail -->
											<div
												class="px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl text-[13px] sm:text-sm font-semibold transition-all duration-300 relative leading-relaxed shadow-2xs {highlightedMessageId === String(msg.id) ? 'bg-pink-200 text-pink-950 border-2 border-[#f43f8e] ring-4 ring-[#f43f8e]/40 scale-[1.03] animate-pulse z-20' : isUnsent ? 'bg-pink-50/70 text-pink-400/90 border border-pink-200/80 italic' : isUserSender ? 'bg-[#f43f8e] text-white border border-[#f43f8e]' : 'bg-white text-gray-900 border border-pink-100'}"
												class:ring-2={isSelected && highlightedMessageId !== String(msg.id)}
												class:ring-[#f43f8e]={isSelected && highlightedMessageId !== String(msg.id)}
											>
												{#if isUserSender}
													<span class="absolute -right-[5px] top-3 w-2.5 h-2.5 {isUnsent ? 'bg-pink-50/70 border-pink-200/80' : 'bg-[#f43f8e]'} border-t border-r transform rotate-45 pointer-events-none rounded-tr-xs"></span>
												{:else}
													<span class="absolute -left-[5px] top-3 w-2.5 h-2.5 bg-white border-b border-l border-pink-100 transform rotate-45 pointer-events-none rounded-bl-xs"></span>
												{/if}

												<div class="relative z-10">
													{#if isUnsent}
														<p class="italic text-xs sm:text-sm text-pink-400/90 flex items-center gap-1 select-none font-medium">
															<Ban class="w-3.5 h-3.5 opacity-70 flex-shrink-0" strokeWidth={1.5} />
															<span>{isUserSender ? 'You unsent a message' : `${activeFriend?.username || 'User'} unsent a message`}</span>
														</p>
													{:else if parsed.isImage}
														<div 
															class="relative group/img rounded-xl overflow-hidden max-w-[200px] sm:max-w-[230px] border border-pink-200/80 cursor-pointer active:scale-98 transition-all my-0.5 shadow-2xs"
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
															<div class="absolute inset-0 bg-pink-950/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-1 text-white">
																<div class="p-1 bg-black/40 backdrop-blur-xs rounded-full">
																	<ZoomIn class="w-3.5 h-3.5 text-white" strokeWidth={2} />
																</div>
															</div>
														</div>
													{:else}
														<p class="whitespace-pre-wrap break-words">{parsed.text}</p>
													{/if}
												</div>
											</div>
											<!-- Message Status & Time -->
											<div class="flex items-center gap-1 mt-0.5 px-1 text-[11px] sm:text-xs font-bold {isUserSender ? 'text-pink-600 justify-end' : 'text-pink-600 justify-start'}">
												<span>{formatTime(msg.created_at)}</span>
												{#if isUserSender && !isUnsent}
													{#if msg.is_read}
														<span class="inline-flex items-center gap-0.5 text-[#f43f8e] font-semibold" title="Seen by @{activeFriend?.username}">
															<Check class="w-3.5 h-3.5 text-[#f43f8e]" strokeWidth={2.5} />
															<span>Seen</span>
														</span>
													{:else}
														<span class="inline-flex items-center gap-0.5 text-pink-500 font-bold" title="Sent">
															<Check class="w-3 h-3 text-pink-500" strokeWidth={2.5} />
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
							<div class="flex items-start space-x-1.5 animate-message-pop py-0.5 my-0.5">
								<div class="w-6 h-6 rounded-full bg-pink-100 text-[#f43f8e] border border-pink-200 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5 overflow-hidden">
									{#if activeFriend.avatar_url}
										<img src={activeFriend.avatar_url} alt={activeFriend.username} class="w-full h-full object-cover" />
									{:else}
										{activeFriend.username.charAt(0).toUpperCase()}
									{/if}
								</div>
								<div class="flex flex-col items-start space-y-0.5">
									<!-- 3-dot Bubble with Cute Tail & Crisp Border -->
									<div class="bg-white border border-pink-200 px-3 py-1.5 rounded-xl flex items-center space-x-1 relative shadow-2xs">
										<span class="absolute -left-[5px] top-2.5 w-2 h-2 bg-white border-b border-l border-pink-200 transform rotate-45 pointer-events-none rounded-bl-xs"></span>
										<div class="w-1.5 h-1.5 rounded-full bg-[#f43f8e] animate-bounce relative z-10" style="animation-delay: 0ms"></div>
										<div class="w-1.5 h-1.5 rounded-full bg-[#f43f8e] animate-bounce relative z-10" style="animation-delay: 150ms"></div>
										<div class="w-1.5 h-1.5 rounded-full bg-[#f43f8e] animate-bounce relative z-10" style="animation-delay: 300ms"></div>
									</div>
									<!-- Label below the bubble -->
									<span class="text-[10px] text-[#f43f8e] font-medium italic pl-0.5">
										@{activeFriend.username} is typing...
									</span>
								</div>
							</div>
						{/if}
					{/if}
				</div>

				<!-- Floating Reply Bar -->
				{#if replyingTo}
					<div class="px-3 py-1.5 bg-[#fdf2f6] border-t border-pink-100 flex items-center justify-between text-xs animate-slide-down">
						<div class="flex items-center space-x-2 min-w-0">
							<div class="w-1 h-6 bg-[#f43f8e] rounded-full flex-shrink-0"></div>
							<div class="min-w-0 flex items-center space-x-1.5">
								{#if replyingTo.isImage && replyingTo.imageUrl}
									<img src={replyingTo.imageUrl} alt="" class="w-6 h-6 rounded-md object-cover border border-pink-200 flex-shrink-0" />
								{/if}
								<div class="min-w-0">
									{#if replyingTo.kind === 'note'}
										<p class="font-bold text-[#f43f8e] text-[11px]">Replying to @{replyingTo.username}'s note</p>
										<p class="text-pink-900/80 truncate text-[10px] font-medium">{replyingTo.text}</p>
									{:else if replyingTo.kind === 'memory'}
										<p class="font-bold text-[#f43f8e] text-[11px]">Replying to shared memory</p>
										<p class="text-pink-900/80 truncate text-[10px] font-medium">Memory on {replyingTo.text}</p>
									{:else}
										<p class="font-bold text-[#f43f8e] text-[11px]">Replying to @{replyingTo.sender_name}</p>
										<p class="text-pink-900/80 truncate text-[10px] font-medium">{replyingTo.text}</p>
									{/if}
								</div>
							</div>
						</div>
						<button onclick={cancelReply} class="p-1 text-pink-400 hover:text-[#f43f8e] rounded-full cursor-pointer transition-colors" aria-label="Cancel reply">
							<X class="w-3.5 h-3.5" strokeWidth={2.5} />
						</button>
					</div>
				{/if}

				<!-- Emoji Picker Dropup -->
				{#if showEmojiPicker}
					<div bind:this={emojiPickerRef} class="absolute bottom-14 right-3 sm:right-10 p-2.5 bg-white border border-pink-200 rounded-2xl z-30 max-w-[220px] shadow-[0_4px_20px_rgba(244,114,182,0.15)] animate-fade-in-up">
						<div class="grid grid-cols-7 gap-1">
							{#each emojis as emoji}
								<button
									type="button"
									onclick={() => insertEmoji(emoji)}
									class="p-0.5 hover:bg-pink-50 rounded-md transition-all text-base hover:scale-110 cursor-pointer"
								>
									{emoji}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Input Form Section or Blocked Banner -->
				{#if isCurrentFriendBlockedByMe}
					<div class="p-2.5 sm:p-3 bg-pink-50/80 border-t border-pink-100 flex flex-col sm:flex-row items-center justify-between gap-2.5 sticky bottom-0 z-20">
						<div class="flex items-center space-x-1.5 text-pink-950 text-xs font-semibold">
							<Ban class="w-4 h-4 text-rose-500 inline-block flex-shrink-0" strokeWidth={2} />
							<span>You blocked @{activeFriend.username}. You cannot send or receive messages.</span>
						</div>
						<button
							onclick={() => handleToggleBlockUser(activeFriend.friend_id || activeFriend.id, true)}
							class="px-3 py-1 bg-[#f43f8e] hover:bg-[#e0337f] text-white font-bold text-xs rounded-lg shadow-xs active:scale-95 transition-all cursor-pointer flex-shrink-0"
						>
							Unblock @{activeFriend.username}
						</button>
					</div>
				{:else if activeFriend?.is_blocking_me}
					<div class="p-2.5 sm:p-3 bg-gray-50 border-t border-pink-100 flex items-center justify-center space-x-1.5 text-pink-900 text-xs font-semibold sticky bottom-0 z-20">
						<Ban class="w-4 h-4 text-rose-500 inline-block flex-shrink-0" strokeWidth={2} />
						<span>You cannot message @{activeFriend.username} because you have been blocked.</span>
					</div>
				{:else}
					<form onsubmit={(e) => { e.preventDefault(); sendMessage(); }} class="p-2 sm:p-2.5 bg-white border-t border-pink-100 flex items-center space-x-2 w-full min-w-0 flex-shrink-0 sticky bottom-0 z-20">
						<!-- Upload Photo Button -->
						<label class="p-1.5 sm:p-2 text-[#f43f8e] hover:bg-pink-50 rounded-xl cursor-pointer transition-colors flex-shrink-0 active:scale-95" title="Attach Photo">
							{#if isUploadingImage}
								<div class="animate-spin w-5 h-5 border-2 border-pink-300 border-t-[#f43f8e] rounded-full"></div>
							{:else}
								<ImageIcon class="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2} />
							{/if}
							<input
								type="file"
								accept="image/*"
								multiple
								bind:this={imageInput}
								onclick={() => { if (isSelectionMode) { isSelectionMode = false; selectedMessageIds = new Set(); } }}
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
								placeholder="Type a message..."
								class="w-full pl-3.5 pr-10 py-2 sm:py-2.5 bg-[#fdf2f6] border border-pink-200/80 rounded-2xl text-gray-800 text-sm sm:text-base placeholder-pink-400/60 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/20 focus:border-[#f43f8e] focus:bg-white transition-all font-medium"
							/>
							<!-- Emoji Picker Toggle Button -->
							<button
								type="button"
								bind:this={emojiButtonRef}
								onclick={() => showEmojiPicker = !showEmojiPicker}
								class="absolute right-2 p-1.5 text-pink-400 hover:text-[#f43f8e] rounded-lg transition-colors cursor-pointer flex items-center justify-center active:scale-95"
								title="Emojis"
							>
								<Smile class="w-5 h-5" strokeWidth={2} />
							</button>
						</div>

						<!-- Send Button -->
						<button
							type="submit"
							disabled={!newMessageText.trim() || isSending}
							class="py-2 sm:py-2.5 px-3.5 sm:px-4 bg-[#f43f8e] hover:bg-[#e0337f] text-white rounded-2xl font-bold text-sm sm:text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1.5 flex-shrink-0 active:scale-95 group cursor-pointer shadow-xs"
						>
							<span>Send</span>
							<Send class="w-4 h-4 shrink-0 group-hover:translate-x-0.5 transition-transform duration-200" strokeWidth={2} />
						</button>
					</form>
				{/if}
			{:else}
				<div class="h-full flex flex-col items-center justify-center p-6 text-center text-gray-400">
					<div class="w-14 h-14 rounded-2xl bg-pink-100 text-[#f43f8e] flex items-center justify-center mb-3">
						<MessageSquare class="w-7 h-7 text-[#f43f8e]" strokeWidth={1.5} />
					</div>
					<h3 class="text-base sm:text-lg font-bold text-gray-700 mb-0.5">Select a friend to start chatting</h3>
					<p class="text-xs text-gray-400 max-w-xs">Pick any friend from your list on the left to start sending messages, photos, and replies.</p>
				</div>
			{/if}
		</div>
	</div>

	<!-- Bottom Navigation Bar (Footer) -->
	<AppFooter hideOnMobile={activeFriend !== null} />
</div>

<!-- Clear Chat Confirmation Modal -->
{#if showClearModal}
	<div
		role="dialog"
		aria-modal="true"
		aria-labelledby="clear-chat-title"
		tabindex="-1"
		onkeydown={(e) => { if (e.key === 'Escape') showClearModal = false; }}
		class="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in"
		onclick={(e) => { if (e.target === e.currentTarget) showClearModal = false; }}
	>
		<div class="bg-white border border-pink-100 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl animate-modal-content">
			<div class="w-14 h-14 bg-rose-50 text-rose-500 rounded-2xl border border-rose-100 flex items-center justify-center mx-auto mb-3">
				<Trash2 class="w-7 h-7" strokeWidth={2} />
			</div>
			<h3 id="clear-chat-title" class="text-lg font-black text-pink-950 mb-1.5">Clear Conversation?</h3>
			<p class="text-xs sm:text-sm text-pink-700/80 mb-6 leading-relaxed">
				Are you sure you want to clear all chat messages with <span class="font-bold text-pink-900">@{activeFriend?.username}</span>? This action cannot be undone.
			</p>
			<div class="flex space-x-3">
				<button
					type="button"
					onclick={() => showClearModal = false}
					disabled={isClearing}
					class="flex-1 py-2.5 bg-pink-100 text-pink-700 rounded-2xl font-bold text-sm hover:bg-pink-200/80 active:scale-95 transition-all cursor-pointer"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={clearConversation}
					disabled={isClearing}
					class="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-bold text-sm shadow-xs active:scale-95 transition-all flex items-center justify-center space-x-1 cursor-pointer"
				>
					{#if isClearing}Clearing...{:else}Clear Chat{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Block User Confirmation Modal -->
{#if showBlockConfirmModal && blockModalTarget}
	<div
		role="dialog"
		aria-modal="true"
		aria-labelledby="block-user-title"
		tabindex="-1"
		onkeydown={(e) => { if (e.key === 'Escape') { showBlockConfirmModal = false; blockModalTarget = null; } }}
		class="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in"
		onclick={(e) => { if (e.target === e.currentTarget) { showBlockConfirmModal = false; blockModalTarget = null; } }}
	>
		<div class="bg-white border border-pink-100 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl animate-modal-content">
			<div class="w-14 h-14 bg-rose-50 text-rose-500 rounded-2xl border border-rose-100 flex items-center justify-center mx-auto mb-3">
				<Ban class="w-7 h-7" strokeWidth={1.8} />
			</div>
			<h3 id="block-user-title" class="text-lg font-black text-pink-950 mb-1.5">Block @{blockModalTarget.username}?</h3>
			<p class="text-xs sm:text-sm text-pink-700/80 mb-6 leading-relaxed bg-[#fdf2f6] p-3 rounded-2xl border border-pink-100">
				Are you sure you want to block <strong class="text-pink-950">@{blockModalTarget.username}</strong>? You will no longer be able to message each other or view each other's profile details.
			</p>
			<div class="flex space-x-3">
				<button
					type="button"
					onclick={() => { showBlockConfirmModal = false; blockModalTarget = null; }}
					class="flex-1 py-2.5 bg-pink-100 text-pink-700 rounded-2xl font-bold text-xs sm:text-sm hover:bg-pink-200/80 active:scale-95 transition-all cursor-pointer"
				>
					No, Cancel
				</button>
				<button
					type="button"
					onclick={() => {
						const targetId = blockModalTarget.friend_id;
						showBlockConfirmModal = false;
						blockModalTarget = null;
						handleToggleBlockUser(targetId, false);
					}}
					class="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-bold text-xs sm:text-sm shadow-xs active:scale-95 transition-all flex items-center justify-center space-x-1 cursor-pointer"
				>
					Yes, Block
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
		class="fixed inset-0 z-[100] bg-[#fff0f5]/95 backdrop-blur-md flex flex-col justify-between p-3 sm:p-5 select-none animate-fade-in touch-none overflow-hidden"
		onclick={(e) => { if (e.target === e.currentTarget) closeImageViewer(); }}
		onkeydown={handleViewerKeydown}
		role="dialog"
		aria-modal="true"
		tabindex="0"
	>
		<!-- Header -->
		<div class="w-full max-w-5xl mx-auto flex items-center justify-between z-20 flex-shrink-0 pt-1">
			<div class="flex items-center space-x-2">
				<span class="text-xs sm:text-sm font-bold text-pink-950 bg-white px-3.5 py-1.5 rounded-full shadow-2xs border border-pink-200">
					Photo {viewingImageIndex + 1} of {totalImgs}
				</span>
				{#if zoomScale > 1}
					<span class="text-[11px] font-semibold text-[#f43f8e] bg-white px-2.5 py-1 rounded-full border border-pink-200 shadow-2xs">
						{Math.round(zoomScale * 100)}%
					</span>
				{/if}
			</div>

			<div class="flex items-center space-x-1.5 sm:space-x-2">
				<button 
					type="button"
					onclick={() => zoomScale = Math.max(1, zoomScale - 0.3)}
					disabled={zoomScale <= 1}
					class="p-2 text-pink-700 hover:text-pink-900 bg-white hover:bg-pink-50 disabled:opacity-40 border border-pink-200 rounded-full transition-all shadow-2xs cursor-pointer active:scale-95"
					title="Zoom Out"
				>
					<ZoomOut class="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2.5} />
				</button>
				<button 
					type="button"
					onclick={() => zoomScale = Math.min(3.5, zoomScale + 0.3)}
					disabled={zoomScale >= 3.5}
					class="p-2 text-pink-700 hover:text-pink-900 bg-white hover:bg-pink-50 disabled:opacity-40 border border-pink-200 rounded-full transition-all shadow-2xs cursor-pointer active:scale-95"
					title="Zoom In"
				>
					<ZoomIn class="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2.5} />
				</button>
				<button 
					type="button"
					onclick={closeImageViewer}
					class="p-2 text-pink-700 hover:text-pink-900 bg-white hover:bg-pink-50 border border-pink-200 rounded-full transition-all shadow-2xs cursor-pointer active:scale-95 flex items-center justify-center"
					title="Close Preview (Esc)"
				>
					<X class="w-5 h-5" strokeWidth={2.5} />
				</button>
			</div>
		</div>

		<!-- Main Image Preview & Controls -->
		<div 
			role="region"
			aria-label="Image viewer gestures area"
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
					class="absolute left-2 sm:left-4 z-30 p-2.5 sm:p-3 bg-white/95 hover:bg-white text-pink-700 hover:text-pink-900 border border-pink-200 rounded-full transition-all active:scale-90 cursor-pointer shadow-md"
					title="Previous Photo (Left Arrow)"
				>
					<ChevronLeft class="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={3} />
				</button>
			{/if}

			<!-- Stationary Frame Container -->
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_static_element_interactions -->
			<div 
				role="region"
				aria-label="Image preview interactive frame"
				class="relative overflow-hidden rounded-3xl border border-pink-200 bg-white/60 max-h-[72vh] flex items-center justify-center select-none shadow-sm"
				onmousedown={handleMouseDown}
				onmousemove={handleMouseMove}
				onmouseup={handleMouseUp}
				onmouseleave={handleMouseUp}
			>
				<img 
					src={currentImg.url} 
					alt="Full Preview" 
					class="max-h-[72vh] max-w-full object-contain {isTouching || isMouseDragging ? 'transition-none' : 'transition-transform duration-200 ease-out'}"
					style="transform: translate3d({panX}px, {panY}px, 0px) scale({zoomScale}); transform-origin: center center; will-change: transform;"
					class:cursor-grab={zoomScale > 1 && !isMouseDragging}
					class:cursor-grabbing={zoomScale > 1 && isMouseDragging}
					class:cursor-zoom-in={zoomScale <= 1}
					ondblclick={toggleZoomAtPoint}
					title="Double tap/click to zoom inside frame • Drag to pan inside frame"
				/>
			</div>

			<!-- Next Button -->
			{#if viewingImageIndex < totalImgs - 1}
				<button 
					type="button"
					onclick={nextImage}
					class="absolute right-2 sm:right-4 z-30 p-2.5 sm:p-3 bg-white/95 hover:bg-white text-pink-700 hover:text-pink-900 border border-pink-200 rounded-full transition-all active:scale-90 cursor-pointer shadow-md"
					title="Next Photo (Right Arrow)"
				>
					<ChevronRight class="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={3} />
				</button>
			{/if}
		</div>

		<!-- Bottom Action Bar -->
		<div class="w-full max-w-5xl mx-auto flex flex-col items-center gap-2 z-20 flex-shrink-0 pb-1">
			<div class="flex items-center gap-3">
				<button 
					type="button"
					onclick={() => downloadChatImage(currentImg.url)}
					class="px-5 py-2.5 bg-[#f43f8e] hover:bg-[#e0337f] text-white rounded-2xl font-bold text-xs sm:text-sm transition-all shadow-xs flex items-center space-x-2 active:scale-95 cursor-pointer"
					title="Download Photo"
				>
					<Download class="w-4 h-4" strokeWidth={2.2} />
					<span>Download Photo</span>
				</button>

				{#if zoomScale > 1 || panX !== 0 || panY !== 0}
					<button 
						type="button"
						onclick={resetZoomAndPan}
						class="px-3.5 py-2.5 bg-white hover:bg-pink-50 text-pink-700 rounded-2xl font-semibold text-xs transition-all border border-pink-200 shadow-2xs active:scale-95 cursor-pointer"
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

<!-- Custom Success / Alert Notification Modal -->
{#if showNotificationModalPopup}
	<div
		role="alertdialog"
		aria-modal="true"
		aria-labelledby="chat-notification-title"
		aria-describedby="chat-notification-desc"
		tabindex="-1"
		onkeydown={(e) => { if (e.key === 'Escape') showNotificationModalPopup = false; }}
		class="fixed inset-0 bg-black/40 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-fade-in"
		onclick={(e) => { if (e.target === e.currentTarget) showNotificationModalPopup = false; }}
	>
		<div class="bg-white border border-pink-100 rounded-3xl p-6 max-w-xs sm:max-w-sm w-full text-center space-y-4 shadow-2xl animate-modal-content">
			<div class="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto {notificationModalType === 'error' ? 'bg-rose-50 text-rose-500 border border-rose-100' : 'bg-pink-50 text-[#f43f8e] border border-pink-200'} shadow-xs">
				{#if notificationModalType === 'error'}
					<AlertCircle class="w-7 h-7" strokeWidth={2.5} />
				{:else}
					<CheckCircle2 class="w-7 h-7 text-[#f43f8e]" strokeWidth={2.5} />
				{/if}
			</div>
			
			<div class="space-y-1">
				<h3 id="chat-notification-title" class="text-base sm:text-lg font-black text-pink-950">
					{notificationModalType === 'error' ? 'Notice' : 'Success!'}
				</h3>
				<p id="chat-notification-desc" class="text-xs sm:text-sm font-bold text-pink-700 leading-relaxed">
					{notificationModalMessage}
				</p>
			</div>

			<button
				type="button"
				onclick={() => showNotificationModalPopup = false}
				class="w-full py-2.5 bg-[#f43f8e] hover:bg-[#e0337f] text-white rounded-2xl font-black text-xs sm:text-sm shadow-md transition-all active:scale-95 cursor-pointer"
			>
				OK
			</button>
		</div>
	</div>
{/if}

<!-- ═══ Note Write / Edit Modal ═══════════════════════════════ -->
{#if showNoteModal}
	<div
		role="dialog"
		aria-modal="true"
		aria-labelledby="note-modal-title"
		tabindex="-1"
		onkeydown={(e) => { if (e.key === 'Escape') { showNoteModal = false; noteInput = ''; } }}
		class="fixed inset-0 bg-black/40 backdrop-blur-xs z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
		onclick={(e) => { if (e.target === e.currentTarget) { showNoteModal = false; noteInput = ''; } }}
	>
		<div class="bg-white border-t sm:border border-pink-100 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm shadow-2xl animate-slide-up overflow-hidden">
			<!-- Modal Header -->
			<div class="px-5 pt-5 pb-3 flex items-center justify-between border-b border-pink-100">
				<div class="flex items-center gap-2.5">
					<!-- Avatar preview -->
					<div class="w-9 h-9 rounded-full bg-pink-100 border border-pink-200 flex items-center justify-center overflow-hidden">
						{#if user?.avatar_url}
							<img src={user.avatar_url} alt="You" class="w-full h-full object-cover" />
						{:else}
							<span class="text-[#f43f8e] font-bold text-sm">{user?.username?.charAt(0).toUpperCase() || '?'}</span>
						{/if}
					</div>
					<div>
						<p id="note-modal-title" class="font-bold text-pink-950 text-sm leading-tight">Your Note</p>
						<p class="text-[10px] text-pink-500 font-medium">Visible to friends • expires in 24h</p>
					</div>
				</div>
				<button
					type="button"
					aria-label="Close note modal"
					onclick={() => { showNoteModal = false; noteInput = ''; }}
					class="p-1.5 text-pink-400 hover:text-pink-700 hover:bg-pink-50 rounded-full transition-all cursor-pointer"
				>
					<X class="w-5 h-5" strokeWidth={2.5} />
				</button>
			</div>

			<!-- Note Input -->
			<div class="px-5 py-4">
				<!-- Speech bubble preview -->
				<div class="relative mb-5">
					<div class="bg-[#fdf2f6] border border-pink-200/80 rounded-2xl px-4 py-3 min-h-[52px] flex items-center">
						{#if noteInput.trim()}
							<p class="text-sm font-semibold text-pink-900 break-words w-full">{noteInput}</p>
						{:else}
							<p class="text-sm text-pink-300 font-medium">Write a note...</p>
						{/if}
					</div>
					<!-- Bubble tail -->
					<span class="absolute -bottom-[6px] left-6 w-3 h-3 bg-[#fdf2f6] border-b border-r border-pink-200/80 rotate-45 pointer-events-none rounded-br-2xs"></span>
				</div>

				<!-- Textarea -->
				<textarea
					bind:value={noteInput}
					maxlength="60"
					rows="2"
					placeholder="What's on your mind?"
					class="w-full px-3.5 py-2.5 bg-[#fdf2f6] border border-pink-200/80 rounded-2xl text-sm text-pink-900 placeholder-pink-400/60 font-medium resize-none focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/20 focus:border-[#f43f8e] focus:bg-white transition-all"
					onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveNote(); } }}
				></textarea>
				<div class="flex items-center justify-between mt-1 px-1">
					<span class="text-[10px] text-pink-400 font-medium">{noteInput.length}/60 characters</span>
				</div>
				{#if myNote}
					<div class="flex items-center justify-between px-3 py-1.5 bg-[#fdf2f6] rounded-xl border border-pink-200/80 text-[11px] font-bold text-pink-700 mt-2.5">
						<span class="flex items-center gap-1.5">
							<Clock class="w-3.5 h-3.5 text-[#f43f8e]" strokeWidth={2} />
							<span>Expires in:</span>
						</span>
						<span class="font-mono text-pink-900 bg-white px-2 py-0.5 rounded-md border border-pink-200 shadow-2xs font-bold">{chatNoteCountdown}</span>
					</div>
				{/if}
			</div>

			<!-- Action Buttons -->
			<div class="px-5 pb-5 flex gap-2.5">
				{#if myNote}
					<button
						type="button"
						onclick={deleteNote}
						class="flex-shrink-0 px-4 py-2.5 border border-rose-200 text-rose-500 hover:bg-rose-50 rounded-2xl font-bold text-sm transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
					>
						<Trash2 class="w-4 h-4" strokeWidth={2.2} />
						Delete
					</button>
				{/if}
				<button
					type="button"
					onclick={saveNote}
					disabled={!noteInput.trim() || isSavingNote}
					class="flex-grow py-2.5 bg-[#f43f8e] hover:bg-[#e0337f] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-bold text-sm shadow-xs transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
				>
					{#if isSavingNote}
						<div class="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
					{:else}
						<Send class="w-4 h-4" strokeWidth={2.2} />
					{/if}
					{myNote ? 'Update Note' : 'Post Note'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- ═══ Friend Note Viewer Popup ════════════════════════════════ -->
{#if viewingNote}
	<div
		role="dialog"
		aria-modal="true"
		aria-labelledby="viewing-note-user"
		tabindex="-1"
		onkeydown={(e) => { if (e.key === 'Escape') viewingNote = null; }}
		class="fixed inset-0 bg-black/40 backdrop-blur-xs z-[110] flex items-center justify-center p-5 animate-fade-in"
		onclick={(e) => { if (e.target === e.currentTarget) viewingNote = null; }}
	>
		<div class="bg-white border border-pink-100 rounded-3xl max-w-xs w-full overflow-hidden shadow-2xl animate-modal-content">
			<!-- Header -->
			<div class="px-5 pt-5 pb-4 flex items-center gap-3 border-b border-pink-100">
				<div class="w-11 h-11 rounded-full bg-pink-100 border border-pink-200 flex items-center justify-center overflow-hidden flex-shrink-0">
					{#if viewingNote.avatar_url}
						<img src={viewingNote.avatar_url} alt={viewingNote.username} class="w-full h-full object-cover" />
					{:else}
						<span class="text-[#f43f8e] font-bold text-lg">{viewingNote.username.charAt(0).toUpperCase()}</span>
					{/if}
				</div>
				<div class="flex-grow min-w-0">
					<p id="viewing-note-user" class="font-bold text-pink-950 text-sm truncate">@{viewingNote.username}</p>
					<p class="text-[10px] text-[#f43f8e] font-medium flex items-center gap-1">
						<MessageSquare class="w-3 h-3 text-[#f43f8e] shrink-0" strokeWidth={2.2} />
						Note
					</p>
				</div>
				<button
					type="button"
					aria-label="Close note viewer"
					onclick={() => viewingNote = null}
					class="p-1.5 text-pink-400 hover:text-pink-700 hover:bg-pink-50 rounded-full transition-all flex-shrink-0 cursor-pointer"
				>
					<X class="w-5 h-5" strokeWidth={2.5} />
				</button>
			</div>

			<!-- Note content -->
			<div class="px-5 py-4">
				<!-- Speech bubble display -->
				<div class="relative mb-3">
					<div class="bg-[#fdf2f6] border border-pink-200/80 rounded-2xl px-4 py-3.5 text-sm font-semibold text-pink-900 leading-relaxed">
						"{viewingNote.note_text}"
					</div>
					<span class="absolute -bottom-[6px] left-5 w-3 h-3 bg-[#fdf2f6] border-b border-r border-pink-200/80 rotate-45 pointer-events-none rounded-br-2xs"></span>
				</div>

				<!-- Live 24h Expiration Countdown Timer -->
				<div class="flex items-center justify-between px-2.5 py-1.5 bg-[#fdf2f6] rounded-xl border border-pink-200/80 text-[11px] font-bold text-pink-700">
					<span class="flex items-center gap-1">
						<Clock class="w-3.5 h-3.5 text-[#f43f8e]" strokeWidth={2} />
						Expires in:
					</span>
					<span class="font-mono text-pink-900 bg-white px-2 py-0.5 rounded-md border border-pink-200 shadow-2xs">{chatNoteCountdown}</span>
				</div>
			</div>

			<div class="px-5 pb-5 flex gap-2">
				<button
					onclick={() => { triggerNoteReply(viewingNote); }}
					class="flex-grow py-2.5 bg-[#f43f8e] hover:bg-[#e0337f] text-white rounded-2xl font-bold text-sm shadow-xs transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
				>
					<MessageSquare class="w-4 h-4" strokeWidth={2.2} />
					Reply in Chat
				</button>
				<button
					onclick={() => viewingNote = null}
					class="px-4 py-2.5 border border-pink-200 text-pink-700 hover:bg-pink-50 rounded-2xl font-bold text-sm transition-all active:scale-95 cursor-pointer"
				>
					Close
				</button>
			</div>
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

	@keyframes slideUp {
		0% {
			opacity: 0;
			transform: translateY(100%);
		}
		100% {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-slide-up {
		animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}

	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.notes-scroll-row::-webkit-scrollbar {
		display: none;
	}
</style>
