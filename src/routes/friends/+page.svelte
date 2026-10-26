<script>
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { supabase } from '$lib/supabaseClient';
	import { broadcastFriendEvent } from '$lib/realtimeBroadcast.js';
	import AppHeader from '$lib/AppHeader.svelte';
	import AppFooter from '$lib/AppFooter.svelte';
	import { toast } from '$lib/toastService.js';
	import { playClickSound } from '$lib/soundEffects.js';
	import {
		ArrowLeft, Users, UserPlus, Clock, Search, X, User, UserCircle,
		MessageSquare, Trash2, Check, Plus, ChevronDown, AlertCircle,
		Share2, Copy, UserCheck, Inbox, Send, ExternalLink
	} from 'lucide-svelte';

	let user = $state(typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('chronomuse_user') || 'null') : null);
	let isLoading = $state(false);
	let hasLoadedOnce = $state(false);
	let activeTab = $state('all'); // 'all', 'friends', 'discover'
	let mobileTab = $state('friends'); // 'friends', 'discover', 'requests'
	let pendingSubTab = $state('incoming'); // 'incoming', 'sent'
	let copiedLink = $state(false);
	let autoSyncInterval = null;

	function copyMyProfileLink() {
		if (!user || !user.id || typeof window === 'undefined') return;
		const url = `${window.location.origin}/profile?id=${user.id}`;
		navigator.clipboard.writeText(url);
		toast.success('Profile link copied to clipboard!');
		copiedLink = true;
		setTimeout(() => {
			copiedLink = false;
		}, 2500);
	}

	// Friends List State
	let friends = $state([]);
	let friendsSearchQuery = $state('');
	let isFetchingFriends = $state(false);
	let friendToRemove = $state(/** @type {any} */ (null));
	let showConfirmDelete = $state(false);
	let isRemoving = $state(false);

	let showNotificationModalPopup = $state(false);
	let notificationModalMessage = $state('');
	let notificationModalType = $state('success');

	function showNotificationModal(msg, type = 'success') {
		notificationModalMessage = msg;
		notificationModalType = type;
		showNotificationModalPopup = true;
	}

	// Add Friend / Search User State
	let friendUsername = $state('');
	let addingFriendUserId = $state(null);
	let cancelingFriendUserId = $state(null);
	let addFriendError = $state('');
	let addFriendSuccess = $state('');
	let searchResults = $state([]);
	let isSearchingUsers = $state(false);
	let hasSearched = $state(false);
	let searchDebounceTimer = null;

	// Pending Requests State
	let pendingRequests = $state([]); // Incoming
	let sentRequests = $state([]); // Outgoing
	let isFetchingRequests = $state(false);
	let isResponding = $state(false);

	onMount(() => {
		const storedUser = localStorage.getItem('chronomuse_user');
		if (storedUser) {
			user = JSON.parse(storedUser);
			const tabParam = $page.url.searchParams.get('tab');
			if (tabParam) {
				if (['friends'].includes(tabParam)) {
					activeTab = tabParam;
					mobileTab = 'friends';
				} else if (['add', 'discover'].includes(tabParam)) {
					activeTab = 'add';
					mobileTab = 'discover';
				} else if (['pending', 'requests', 'sent'].includes(tabParam)) {
					activeTab = 'pending';
					mobileTab = 'requests';
					if (tabParam === 'sent') pendingSubTab = 'sent';
				}
			}
			loadAllData();
		} else {
			goto('/');
		}
		isLoading = false;
		hasLoadedOnce = true;

		const handleRealtimeUpdate = (e) => {
			if (user && user.id) {
				fetchFriends(true);
				fetchPendingRequests(true);
			}
		};

		window.addEventListener('chronomuse_friend_change', handleRealtimeUpdate);
		window.addEventListener('chronomuse_notification_change', handleRealtimeUpdate);
		window.addEventListener('chronomuse_profile_change', handleRealtimeUpdate);
		window.addEventListener('chronomuse_note_change', handleRealtimeUpdate);

		const handleWindowFocus = () => {
			if (user && user.id) {
				fetchFriends(true);
				fetchPendingRequests(true);
			}
		};

		window.addEventListener('focus', handleWindowFocus);

		// Fallback periodic polling
		autoSyncInterval = setInterval(() => {
			if (typeof document !== 'undefined' && document.hidden) return;
			if (user && user.id) {
				fetchFriends(true);
				fetchPendingRequests(true);
			}
		}, 45000);

		return () => {
			window.removeEventListener('focus', handleWindowFocus);
			window.removeEventListener('chronomuse_friend_change', handleRealtimeUpdate);
			window.removeEventListener('chronomuse_notification_change', handleRealtimeUpdate);
			window.removeEventListener('chronomuse_profile_change', handleRealtimeUpdate);
			window.removeEventListener('chronomuse_note_change', handleRealtimeUpdate);
			if (autoSyncInterval) clearInterval(autoSyncInterval);
		};
	});

	let hasLoadedRequests = $state(false);
	let hasLoadedFriends = $state(false);

	$effect(() => {
		if (showConfirmDelete || showNotificationModalPopup) {
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = '';
		}
		return () => {
			document.body.style.overflow = '';
		};
	});

	// Suggested / Discover Users State
	let suggestedUsers = $state([]);
	let suggestedPage = $state(1);
	let hasMoreSuggested = $state(false);
	let isLoadingSuggested = $state(false);

	async function loadAllData() {
		await Promise.all([
			fetchFriends(false),
			fetchPendingRequests(false)
		]);
		await fetchSuggestedUsers(1, false);
	}

	async function fetchSuggestedUsers(page = 1, append = false) {
		if (!user || !user.id || isLoadingSuggested) return;
		isLoadingSuggested = true;
		try {
			const res = await fetch(API_ENDPOINTS.getSuggestedUsers, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: user.id,
					page: page,
					limit: 20
				})
			});
			const data = await res.json();
			if (data.success && data.data) {
				const newUsers = data.data.users || [];
				suggestedUsers = append ? [...suggestedUsers, ...newUsers] : newUsers;
				hasMoreSuggested = data.data.has_more || false;
				suggestedPage = page;
				syncSuggestedUsersWithState();
			}
		} catch (err) {
			console.error('Error fetching suggested users:', err);
		} finally {
			isLoadingSuggested = false;
		}
	}

	function loadMoreSuggestedUsers() {
		fetchSuggestedUsers(suggestedPage + 1, true);
	}

	function syncSuggestedUsersWithState() {
		if (!suggestedUsers || suggestedUsers.length === 0) return;
		const sentIds = new Set();
		(sentRequests || []).forEach(r => {
			if (r.receiver_id != null) {
				sentIds.add(Number(r.receiver_id));
				sentIds.add(String(r.receiver_id));
			}
		});

		const friendIds = new Set();
		(friends || []).forEach(f => {
			if (f.friend_id != null) {
				friendIds.add(Number(f.friend_id));
				friendIds.add(String(f.friend_id));
			}
		});

		const incomingSenderIds = new Set();
		(pendingRequests || []).forEach(r => {
			if (r.sender_id != null) {
				incomingSenderIds.add(Number(r.sender_id));
				incomingSenderIds.add(String(r.sender_id));
			}
		});

		suggestedUsers = suggestedUsers.map(u => {
			const uId = Number(u.id);
			const uIdStr = String(u.id);
			if (friendIds.has(uId) || friendIds.has(uIdStr)) {
				return { ...u, relationship: 'friends' };
			}
			if (sentIds.has(uId) || sentIds.has(uIdStr)) {
				const req = sentRequests.find(r => String(r.receiver_id) === uIdStr || Number(r.receiver_id) === uId);
				return { ...u, relationship: 'request_sent', request_id: req?.id || req?.request_id || u.request_id };
			}
			if (incomingSenderIds.has(uId) || incomingSenderIds.has(uIdStr)) {
				const req = pendingRequests.find(r => String(r.sender_id) === uIdStr || Number(r.sender_id) === uId);
				return { ...u, relationship: 'request_received', request_id: req?.id || req?.request_id || u.request_id };
			}
			if (hasLoadedRequests && hasLoadedFriends) {
				if (u.relationship === 'request_sent' || u.relationship === 'request_received') {
					return { ...u, relationship: 'none', request_id: null };
				}
			}
			return u;
		});
	}

	function syncSearchResultsWithState() {
		syncSuggestedUsersWithState();
		if (!searchResults || searchResults.length === 0) return;
		const sentIds = new Set();
		(sentRequests || []).forEach(r => {
			if (r.receiver_id != null) {
				sentIds.add(Number(r.receiver_id));
				sentIds.add(String(r.receiver_id));
			}
		});

		const friendIds = new Set();
		(friends || []).forEach(f => {
			if (f.friend_id != null) {
				friendIds.add(Number(f.friend_id));
				friendIds.add(String(f.friend_id));
			}
		});

		const incomingSenderIds = new Set();
		(pendingRequests || []).forEach(r => {
			if (r.sender_id != null) {
				incomingSenderIds.add(Number(r.sender_id));
				incomingSenderIds.add(String(r.sender_id));
			}
		});

		searchResults = searchResults.map(u => {
			const uId = Number(u.id);
			const uIdStr = String(u.id);
			if (u.relationship === 'self') return u;

			if (friendIds.has(uId) || friendIds.has(uIdStr)) {
				return { ...u, relationship: 'friends' };
			}
			if (sentIds.has(uId) || sentIds.has(uIdStr)) {
				const req = sentRequests.find(r => String(r.receiver_id) === uIdStr || Number(r.receiver_id) === uId);
				return { ...u, relationship: 'request_sent', request_id: req?.id || req?.request_id || u.request_id };
			}
			if (incomingSenderIds.has(uId) || incomingSenderIds.has(uIdStr)) {
				const req = pendingRequests.find(r => String(r.sender_id) === uIdStr || Number(r.sender_id) === uId);
				return { ...u, relationship: 'request_received', request_id: req?.id || req?.request_id || u.request_id };
			}
			if (hasLoadedRequests && hasLoadedFriends) {
				if (u.relationship === 'request_sent' || u.relationship === 'request_received') {
					return { ...u, relationship: 'none', request_id: null };
				}
			}
			return u;
		});
	}

	function fetchFriends(isSilent = false) {
		if (!user || !user.id) return;
		if (!isSilent && friends.length === 0) {
			isFetchingFriends = true;
		}

		return fetch(API_ENDPOINTS.getFriendsList, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ user_id: user.id })
		})
		.then(res => res.json())
		.then(data => {
			isFetchingFriends = false;
			hasLoadedFriends = true;
			if (data.data) {
				friends = data.data.friends || [];
				syncSearchResultsWithState();
			}
		})
		.catch(err => {
			isFetchingFriends = false;
			hasLoadedFriends = true;
			console.error('Error fetching friends:', err);
		});
	}

	function fetchPendingRequests(isSilent = false) {
		if (!user || !user.id) return;
		if (!isSilent && pendingRequests.length === 0 && sentRequests.length === 0) {
			isFetchingRequests = true;
		}

		return fetch(API_ENDPOINTS.getFriendRequests, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ user_id: user.id })
		})
		.then(res => res.json())
		.then(data => {
			isFetchingRequests = false;
			hasLoadedRequests = true;
			if (data.data) {
				pendingRequests = data.data.requests || [];
				sentRequests = data.data.sent_requests || [];
				syncSearchResultsWithState();
			}
		})
		.catch(err => {
			isFetchingRequests = false;
			hasLoadedRequests = true;
			console.error('Error fetching pending requests:', err);
		});
	}

	let searchAbortController = null;

	function handleSearchInput() {
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
		if (searchAbortController) searchAbortController.abort();

		const query = friendUsername.trim();
		if (!query) {
			searchResults = [];
			hasSearched = false;
			isSearchingUsers = false;
			return;
		}
		isSearchingUsers = true;
		searchDebounceTimer = setTimeout(() => {
			performUserSearch(query, false);
		}, 300);
	}

	async function performUserSearch(query, isSilent = false) {
		if (!user || !user.id || !query) return;
		if (searchAbortController) {
			searchAbortController.abort();
		}
		searchAbortController = new AbortController();

		if (!isSilent && searchResults.length === 0) {
			isSearchingUsers = true;
		}
		hasSearched = true;
		if (!isSilent) {
			addFriendError = '';
			addFriendSuccess = '';
		}

		try {
			const res = await fetch(API_ENDPOINTS.searchUsers, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: user.id,
					query: query
				}),
				signal: searchAbortController.signal
			});
			const data = await res.json();
			if (data.success && data.data) {
				searchResults = data.data.users || [];
			} else if (!isSilent) {
				searchResults = [];
			}
		} catch (err) {
			if (err.name === 'AbortError') return;
			console.error('Search users error:', err);
			if (!isSilent) searchResults = [];
		} finally {
			isSearchingUsers = false;
		}
	}

	function handleAddFriendSubmit(e) {
		if (e) e.preventDefault();
		const query = friendUsername.trim();
		if (!query) return;
		performUserSearch(query);
	}

	async function sendFriendRequestToUser(targetUser) {
		if (!user || !user.id || !targetUser || !targetUser.id || addingFriendUserId === targetUser.id) return;
		addingFriendUserId = targetUser.id;
		addFriendError = '';
		addFriendSuccess = '';

		// 0ms Optimistic UI update for targetUser
		const previousRel = targetUser.relationship;
		targetUser.relationship = 'request_sent';
		suggestedUsers = suggestedUsers.map(su => String(su.id) === String(targetUser.id) ? { ...su, relationship: 'request_sent' } : su);
		searchResults = searchResults.map(su => String(su.id) === String(targetUser.id) ? { ...su, relationship: 'request_sent' } : su);

		// Instant client-side broadcast
		try {
			if (typeof broadcastFriendEvent === 'function') {
				broadcastFriendEvent(user.id, targetUser.id, 'friend_request');
			}
		} catch (e) {
			console.warn('Broadcast friend event warn:', e);
		}

		try {
			const res = await fetch(API_ENDPOINTS.addFriend, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					friend_username: targetUser.username,
					user_id: user.id,
					sender_id: user.id,
					receiver_id: targetUser.id
				})
			});
			const data = await res.json();
			if (data.error) {
				targetUser.relationship = previousRel;
				suggestedUsers = suggestedUsers.map(su => String(su.id) === String(targetUser.id) ? { ...su, relationship: previousRel } : su);
				searchResults = searchResults.map(su => String(su.id) === String(targetUser.id) ? { ...su, relationship: previousRel } : su);
				addFriendError = data.error;
				showNotificationModal(data.error, 'error');
			} else {
				addFriendSuccess = data.message || `Friend request sent to @${targetUser.username}!`;
				targetUser.request_id = data.request_id || null;
				suggestedUsers = suggestedUsers.map(su => String(su.id) === String(targetUser.id) ? { ...su, relationship: 'request_sent', request_id: data.request_id || su.request_id } : su);
				searchResults = searchResults.map(su => String(su.id) === String(targetUser.id) ? { ...su, relationship: 'request_sent', request_id: data.request_id || su.request_id } : su);
				fetchPendingRequests(true);
				try {
					if (typeof broadcastFriendEvent === 'function') {
						broadcastFriendEvent(user.id, targetUser.id, 'friend_request');
					}
				} catch (e) {}
				setTimeout(() => {
					addFriendSuccess = '';
				}, 3000);
			}
		} catch (err) {
			targetUser.relationship = previousRel;
			suggestedUsers = suggestedUsers.map(su => String(su.id) === String(targetUser.id) ? { ...su, relationship: previousRel } : su);
			searchResults = searchResults.map(su => String(su.id) === String(targetUser.id) ? { ...su, relationship: previousRel } : su);
			addFriendError = 'An error occurred. Please try again.';
			showNotificationModal('An error occurred. Please try again.', 'error');
			console.error('Add friend error:', err);
		} finally {
			addingFriendUserId = null;
		}
	}

	async function handleCancelFriendRequestFromSearch(targetUser) {
		if (!user || !user.id || !targetUser || !targetUser.id || cancelingFriendUserId === targetUser.id) return;
		cancelingFriendUserId = targetUser.id;
		const previousRel = targetUser.relationship;
		const previousReqId = targetUser.request_id;
		// Optimistic instant toggle to Add Friend
		targetUser.relationship = 'none';
		targetUser.request_id = null;
		suggestedUsers = suggestedUsers.map(su => String(su.id) === String(targetUser.id) ? { ...su, relationship: 'none', request_id: null } : su);
		searchResults = searchResults.map(su => String(su.id) === String(targetUser.id) ? { ...su, relationship: 'none', request_id: null } : su);

		try {
			if (typeof broadcastFriendEvent === 'function') {
				broadcastFriendEvent(user.id, targetUser.id, 'cancel_request');
			}
		} catch (e) {}

		try {
			const res = await fetch(API_ENDPOINTS.cancelFriendRequest, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: user.id,
					request_id: previousReqId || null,
					friend_id: targetUser.id
				})
			});
			const data = await res.json();
			if (data.success) {
				fetchPendingRequests();
				try {
					if (typeof broadcastFriendEvent === 'function') {
						broadcastFriendEvent(user.id, targetUser.id, 'cancel_request');
					}
				} catch (e) {}
			} else {
				targetUser.relationship = previousRel;
				targetUser.request_id = previousReqId;
				suggestedUsers = suggestedUsers.map(su => String(su.id) === String(targetUser.id) ? { ...su, relationship: previousRel, request_id: previousReqId } : su);
				searchResults = searchResults.map(su => String(su.id) === String(targetUser.id) ? { ...su, relationship: previousRel, request_id: previousReqId } : su);
				showNotificationModal(data.error || 'Failed to cancel request', 'error');
			}
		} catch (err) {
			targetUser.relationship = previousRel;
			targetUser.request_id = previousReqId;
			suggestedUsers = suggestedUsers.map(su => String(su.id) === String(targetUser.id) ? { ...su, relationship: previousRel, request_id: previousReqId } : su);
			searchResults = searchResults.map(su => String(su.id) === String(targetUser.id) ? { ...su, relationship: previousRel, request_id: previousReqId } : su);
			console.error('Cancel friend request error:', err);
		} finally {
			cancelingFriendUserId = null;
		}
	}

	function handleRespondRequest(requestId, action) {
		if (!user || !user.id || isResponding) return;
		isResponding = true;

		// 0ms Optimistic UI removal and addition
		const reqItem = pendingRequests.find(r => r.id === requestId || r.request_id === requestId);
		const targetSenderId = reqItem?.sender_id || reqItem?.id;
		const prevPending = [...pendingRequests];
		const prevFriends = [...friends];

		pendingRequests = pendingRequests.filter(r => r.id !== requestId && r.request_id !== requestId);
		if (action === 'accept' && reqItem) {
			friends = [
				{
					id: targetSenderId,
					friend_id: targetSenderId,
					username: reqItem.username || reqItem.sender_username,
					email: reqItem.email || reqItem.sender_email,
					avatar_url: reqItem.avatar_url || reqItem.sender_avatar_url,
					last_activity: new Date().toISOString()
				},
				...friends
			];
		}

		broadcastFriendEvent(user.id, targetSenderId, action === 'accept' ? 'accept_request' : 'decline_request');

		fetch(API_ENDPOINTS.respondToFriendRequest, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				request_id: requestId,
				action,
				user_id: user.id
			})
		})
		.then(res => res.json())
		.then(data => {
			isResponding = false;
			if (data.success) {
				fetchPendingRequests();
				fetchFriends();
				broadcastFriendEvent(user.id, targetSenderId, action === 'accept' ? 'accept_request' : 'decline_request');
			} else {
				pendingRequests = prevPending;
				friends = prevFriends;
				showNotificationModal('Error: ' + (data.error || 'Failed to respond'), 'error');
			}
		})
		.catch(err => {
			isResponding = false;
			pendingRequests = prevPending;
			friends = prevFriends;
			console.error('Error responding to request:', err);
		});
	}

	function handleCancelSentRequest(requestId) {
		if (!user || !user.id) return;
		// 0ms instant optimistic removal
		const reqItem = sentRequests.find(r => r.id === requestId || r.request_id === requestId);
		const targetReceiverId = reqItem?.receiver_id || reqItem?.id;
		const backupSent = [...sentRequests];
		sentRequests = sentRequests.filter(r => r.id !== requestId && r.request_id !== requestId);

		broadcastFriendEvent(user.id, targetReceiverId, 'cancel_request');

		fetch(API_ENDPOINTS.cancelFriendRequest, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				request_id: requestId,
				user_id: user.id
			})
		})
		.then(res => res.json())
		.then(data => {
			if (data.success) {
				broadcastFriendEvent(user.id, targetReceiverId, 'cancel_request');
			} else {
				sentRequests = backupSent;
				showNotificationModal('Error: ' + (data.error || 'Failed to cancel request'), 'error');
			}
		})
		.catch(err => {
			sentRequests = backupSent;
			console.error('Error cancelling request:', err);
		});
	}

	function handleRemoveFriend(friend) {
		friendToRemove = friend;
		showConfirmDelete = true;
	}

	function confirmRemoveFriend() {
		if (!friendToRemove || !user || !user.id || isRemoving) return;
		isRemoving = true;
		const targetFriendId = friendToRemove.friend_id || friendToRemove.id;
		const prevFriends = [...friends];

		// Optimistic UI update
		friends = friends.filter(f => (f.friend_id || f.id) !== targetFriendId);

		broadcastFriendEvent(user.id, targetFriendId, 'unfriend');

		fetch(API_ENDPOINTS.removeFriend, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				user_id: user.id,
				friend_id: targetFriendId,
				friendship_id: friendToRemove.friendship_id || null
			})
		})
		.then(res => res.json())
		.then(data => {
			isRemoving = false;
			showConfirmDelete = false;
			friendToRemove = null;
			if (data.success) {
				fetchFriends();
				broadcastFriendEvent(user.id, targetFriendId, 'unfriend');
			} else {
				friends = prevFriends;
				showNotificationModal('Error: ' + (data.error || 'Failed to remove friend'), 'error');
			}
		})
		.catch(err => {
			isRemoving = false;
			friends = prevFriends;
			console.error('Error removing friend:', err);
		});
	}

	let sidebarOpen = $state(false);

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}

	function handleLogout() {
		try {
			supabase.removeAllChannels();
		} catch (e) {}
		localStorage.clear();
		sessionStorage.clear();
		if (typeof window !== 'undefined') {
			window.dispatchEvent(new Event('chronomuse_auth_change'));
		}
		goto('/');
	}

	function openChatWithFriend(friend) {
		const targetId = friend.friend_id || friend.id;
		if (user && String(targetId) === String(user.id)) {
			return;
		}
		goto(`/chat?friend_id=${targetId}&username=${encodeURIComponent(friend.username)}`);
	}

	function formatLastActive(lastActivity) {
		if (!lastActivity) return 'Offline';
		const diff = (Date.now() - new Date(lastActivity).getTime()) / 1000;
		if (diff < 120) return 'Active now';
		if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
		return `${Math.floor(diff / 86400)}d ago`;
	}

	function formatDate(dateStr) {
		if (!dateStr) return '';
		const d = new Date(dateStr);
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function filteredFriends() {
		if (!friendsSearchQuery.trim()) return friends;
		const query = friendsSearchQuery.toLowerCase();
		return friends.filter(f => f.username.toLowerCase().includes(query));
	}

	let totalPendingCount = $derived(pendingRequests.length + sentRequests.length);
	let hasNotifications = $derived(pendingRequests.length > 0);
</script>

<svelte:head>
	<title>Friends & Network - Chronomuse</title>
</svelte:head>

<div class="flex flex-col min-h-screen bg-[#fff0f5] animate-fade-in font-sans">
	<!-- Top Navigation -->
	<AppHeader />

	<!-- Main Content -->
	<main class="flex-grow container mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-8 pb-24 sm:pb-28 max-w-6xl">
		<!-- Header Banner -->
		<div class="bg-white border border-pink-100/90 rounded-2xl sm:rounded-3xl p-4 sm:p-5 mb-5 shadow-[0_4px_20px_rgba(244,114,182,0.08)] animate-fade-in-up">
			<div class="flex items-start sm:items-center space-x-3">
				<button
					onclick={() => goto('/dashboard')}
					class="w-8 h-8 rounded-xl bg-pink-50 hover:bg-pink-100 text-[#f43f8e] border border-pink-100 flex items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer shadow-2xs flex-shrink-0 mt-0.5 sm:mt-0"
					title="Back to Dashboard"
				>
					<ArrowLeft class="w-4 h-4" strokeWidth={2.5} />
				</button>
				<div>
					<div class="flex items-center space-x-2">
						<h1 class="text-base sm:text-lg font-black text-pink-950">Friends & Network</h1>
						<span class="px-2 py-0.5 rounded-full bg-pink-50 text-[#f43f8e] border border-pink-100 text-[10px] font-black uppercase tracking-wider">
							Community
						</span>
						<button
							type="button"
							onclick={copyMyProfileLink}
							class="p-1 rounded-lg text-pink-500 hover:text-[#f43f8e] hover:bg-pink-50 active:scale-90 transition-all cursor-pointer flex lg:hidden items-center justify-center"
							title={copiedLink ? "Link Copied to Clipboard!" : "Copy Profile Link"}
							aria-label="Copy Profile Link"
						>
							{#if copiedLink}
								<Check class="w-4 h-4 text-emerald-600 animate-scale-up" strokeWidth={2.5} />
							{:else}
								<Share2 class="w-4 h-4" />
							{/if}
						</button>
					</div>
					<p class="text-xs text-pink-400 font-semibold mt-0.5">Manage connections, discover friends, and sync moments</p>
				</div>
			</div>

			<!-- Mobile-Only Segmented Tabs (Inside White Header Card, Matches Notification Tab) -->
			<div class="block lg:hidden mt-3.5 bg-[#fff0f5] p-1 rounded-xl grid grid-cols-3 gap-1 border border-pink-100/80 animate-fade-in">
				<!-- Tab 1: Friends -->
				<button
					type="button"
					onclick={() => { playClickSound(); mobileTab = 'friends'; }}
					class="py-1.5 px-1 rounded-lg text-[11px] font-black transition-all flex items-center justify-center text-center cursor-pointer active:scale-95 whitespace-nowrap {mobileTab === 'friends' ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-600 hover:text-pink-800'}"
				>
					<span>Friends ({friends.length})</span>
				</button>

				<!-- Tab 2: Discover -->
				<button
					type="button"
					onclick={() => { playClickSound(); mobileTab = 'discover'; }}
					class="py-1.5 px-1 rounded-lg text-[11px] font-black transition-all flex items-center justify-center text-center cursor-pointer active:scale-95 whitespace-nowrap {mobileTab === 'discover' ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-600 hover:text-pink-800'}"
				>
					<span>Discover</span>
				</button>

				<!-- Tab 3: Requests -->
				<button
					type="button"
					onclick={() => { playClickSound(); mobileTab = 'requests'; }}
					class="relative py-1.5 px-1 rounded-lg text-[11px] font-black transition-all flex items-center justify-center text-center cursor-pointer active:scale-95 whitespace-nowrap {mobileTab === 'requests' ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-600 hover:text-pink-800'}"
				>
					<span>Requests ({pendingRequests.length})</span>
					{#if pendingRequests.length > 0}
						<span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping absolute top-1 right-1.5"></span>
					{/if}
				</button>
			</div>
		</div>

		<!-- 2-Column Split Layout Grid -->
		<div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
			
			<!-- LEFT COLUMN (Span 8): Friends List + Discover People -->
			<div class="lg:col-span-8 flex flex-col gap-5 {mobileTab === 'requests' ? 'hidden lg:flex' : 'flex'}">
				
				<!-- Section 1: My Friends Card -->
				<div class="{mobileTab === 'friends' ? 'block' : 'hidden'} lg:block bg-white border border-pink-100/90 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(244,114,182,0.08)]">
					<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-pink-100/80">
						<div class="flex items-center space-x-2.5">
							<div class="w-7 h-7 rounded-xl bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center shadow-2xs">
								<Users class="w-4 h-4" />
							</div>
							<div>
								<h2 class="text-sm font-black text-pink-950 flex items-center gap-1.5">
									<span>All Friends</span>
									<span class="text-xs px-2 py-0.2 bg-[#fdf2f6] text-[#f43f8e] rounded-full border border-pink-100 font-bold">
										{filteredFriends().length}
									</span>
								</h2>
							</div>
						</div>

						<!-- Search Friends Bar -->
						<div class="relative w-full sm:w-72 flex-shrink-0">
							<input
								type="text"
								bind:value={friendsSearchQuery}
								placeholder="Search friends by name..."
								class="w-full pl-8 pr-8 py-2 bg-[#fdf2f6] border border-pink-200/90 rounded-xl text-xs font-bold text-pink-950 placeholder-pink-400/70 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/25 focus:border-[#f43f8e] transition-all duration-200 focus:bg-white shadow-2xs"
							/>
							<Search class="w-3.5 h-3.5 text-pink-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={2.5} />
							{#if friendsSearchQuery}
								<button
									type="button"
									onclick={() => friendsSearchQuery = ''}
									class="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-pink-400 hover:text-pink-600 rounded-full cursor-pointer transition-colors"
									title="Clear search"
								>
									<X class="w-3.5 h-3.5" />
								</button>
							{/if}
						</div>
					</div>

					<!-- Friends List Render -->
					{#if isFetchingFriends && friends.length === 0}
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-pulse">
							{#each Array(4) as _}
								<div class="p-3 bg-[#fdf2f6]/60 border border-pink-100/80 rounded-2xl flex items-center justify-between gap-2">
									<div class="flex items-center space-x-2.5 min-w-0 flex-1">
										<div class="w-10 h-10 rounded-full bg-pink-200/70 flex-shrink-0"></div>
										<div class="space-y-1.5 flex-1">
											<div class="h-3.5 bg-pink-200/70 rounded w-2/3"></div>
											<div class="h-2.5 bg-pink-200/50 rounded w-1/3"></div>
										</div>
									</div>
									<div class="h-7 w-16 bg-pink-100/80 rounded-xl flex-shrink-0"></div>
								</div>
							{/each}
						</div>
					{:else if filteredFriends().length > 0}
						<div class="max-h-[640px] overflow-y-auto pr-1">
							<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-2.5">
								{#each filteredFriends() as friend (friend.friend_id || friend.friendship_id || friend.id)}
									<div class="bg-[#fcdde9] hover:bg-[#f8cadc] rounded-2xl p-2 transition-all duration-300 flex flex-col justify-between group relative border-0">
										<!-- Top Photo Container with floating Remove action -->
										<div class="relative w-full aspect-square rounded-xl overflow-hidden bg-gradient-to-b from-white to-pink-50 mb-1.5 flex items-center justify-center">
											{#if friend.avatar_url}
												<img
													src={friend.avatar_url}
													alt={friend.username}
													class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
												/>
											{:else}
												<div class="w-full h-full flex flex-col items-center justify-center bg-gradient-to-tr from-pink-200 via-rose-100 to-pink-300 text-[#f43f8e]">
													<span class="text-xl sm:text-2xl font-black opacity-80">{friend.username?.charAt(0).toUpperCase()}</span>
												</div>
											{/if}

											<!-- Status Badge on Photo -->
											<div class="absolute top-1 right-1 px-1.5 py-0.2 rounded-full bg-black/45 backdrop-blur-md text-white text-[8px] font-bold flex items-center space-x-1 shadow-xs">
												<span class="w-1 h-1 rounded-full {formatLastActive(friend.last_activity) === 'Active now' || formatLastActive(friend.last_activity) === 'Active just now' ? 'bg-[#10b981] animate-pulse' : 'bg-white/60'}"></span>
												<span>{formatLastActive(friend.last_activity)}</span>
											</div>

										</div>

										<!-- Name & Bio / Description -->
										<div class="space-y-0.5 mb-1 px-0.5">
											<h4 class="text-xs font-black text-pink-950 truncate group-hover:text-[#f43f8e] transition-colors">
												@{friend.username}
											</h4>
											<p class="text-[9.5px] sm:text-[10px] text-pink-600/80 font-medium truncate leading-tight">
												{friend.bio || friend.email || 'ChronoMuse Friend'}
											</p>
										</div>

										<!-- Bottom Action Bar (Pure Icons Only, Borderless) -->
										<div class="flex items-center justify-end pt-1 mt-auto gap-2">
											<button
												type="button"
												onclick={() => goto(`/profile?id=${friend.friend_id || friend.id}`)}
												class="p-1 text-pink-500 hover:text-[#f43f8e] transition-colors active:scale-90 flex items-center justify-center cursor-pointer"
												title="View @{friend.username}'s Profile"
											>
												<UserCircle class="w-4 h-4" strokeWidth={2} />
											</button>

											<button
												type="button"
												onclick={() => openChatWithFriend(friend)}
												class="p-1 text-[#f43f8e] hover:text-[#e0337f] transition-colors active:scale-90 flex items-center justify-center cursor-pointer"
												title="Chat with @{friend.username}"
											>
												<MessageSquare class="w-4 h-4" strokeWidth={2} />
											</button>

											<button
												type="button"
												onclick={() => handleRemoveFriend(friend)}
												class="p-1 text-pink-500 hover:text-rose-600 transition-colors active:scale-90 flex items-center justify-center cursor-pointer"
												title={`Remove @${friend.username}`}
											>
												<Trash2 class="w-4 h-4" strokeWidth={2} />
											</button>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{:else if friendsSearchQuery}
						<div class="text-center py-8 bg-[#fdf2f6]/40 rounded-2xl border border-dashed border-pink-200">
							<Search class="w-6 h-6 text-pink-300 mx-auto mb-1.5" />
							<p class="text-xs font-bold text-pink-950">No friends found matching "{friendsSearchQuery}"</p>
							<button
								onclick={() => friendsSearchQuery = ''}
								class="text-[11px] text-[#f43f8e] font-bold hover:underline mt-1 cursor-pointer"
							>
								Clear filter
							</button>
						</div>
					{:else}
						<!-- Clean & Engaging Empty State -->
						<div class="text-center py-6 px-4 bg-gradient-to-b from-[#fdf2f6]/80 to-pink-50/40 rounded-2xl border border-pink-100/90">
							<div class="w-12 h-12 bg-white text-[#f43f8e] rounded-2xl border border-pink-100 flex items-center justify-center mx-auto mb-2.5 shadow-2xs">
								<Users class="w-6 h-6 text-[#f43f8e]" strokeWidth={2} />
							</div>
							<h3 class="text-xs sm:text-sm font-black text-pink-950">No friends added yet</h3>
							<p class="text-[11px] text-pink-400 font-medium max-w-sm mx-auto mt-0.5">
								Discover friends and creators below to share calendars, memories, and mood updates!
							</p>
							<div class="mt-3 block lg:hidden">
								<button
									type="button"
									onclick={() => mobileTab = 'discover'}
									class="px-3 py-1.5 bg-[#f43f8e] hover:bg-[#e0337f] text-white text-xs font-black rounded-xl active:scale-95 transition-all shadow-xs inline-flex items-center space-x-1 cursor-pointer"
								>
									<UserPlus class="w-3.5 h-3.5" />
									<span>Discover People</span>
								</button>
							</div>
						</div>
					{/if}
				</div>

				<!-- Section 2: Discover & Search People Card -->
				<div class="{mobileTab === 'discover' ? 'block' : 'hidden'} lg:block bg-white border border-pink-100/90 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(244,114,182,0.08)]">
					<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-pink-100/80">
						<div class="flex items-center space-x-2.5">
							<div class="w-7 h-7 rounded-xl bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center shadow-2xs">
								<UserPlus class="w-4 h-4" />
							</div>
							<div>
								<h2 class="text-sm font-black text-pink-950 flex items-center gap-1.5">
									<span>Discover People</span>
									<span class="text-[10px] px-2 py-0.2 bg-pink-50 text-[#f43f8e] rounded-full font-bold border border-pink-100">
										Connect
									</span>
								</h2>
								<p class="text-[11px] text-pink-400 font-semibold">Search by username or connect with suggested members</p>
							</div>
						</div>
					</div>

					<!-- Search Form -->
					<form onsubmit={handleAddFriendSubmit} class="space-y-2.5 mb-4">
						{#if addFriendError}
						<div class="p-2.5 bg-rose-50 border border-rose-200 text-rose-600 text-xs rounded-xl font-bold text-center animate-fade-in shadow-2xs">
							{addFriendError}
						</div>
					{/if}

					{#if addFriendSuccess}
						<div class="p-2.5 bg-pink-50 border border-pink-200 text-[#f43f8e] text-xs rounded-xl font-bold text-center animate-fade-in shadow-2xs">
							{addFriendSuccess}
						</div>
					{/if}

					<div class="relative">
						<span class="absolute left-3 top-2.5 text-pink-400 font-black text-xs">@</span>
						<input
							type="text"
							bind:value={friendUsername}
							oninput={handleSearchInput}
							placeholder="Search by username..."
							class="w-full pl-7 pr-8 py-2 bg-[#fdf2f6] border border-pink-200/80 rounded-xl text-xs font-medium text-pink-950 placeholder-pink-400/60 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/20 focus:border-[#f43f8e] focus:bg-white transition-all duration-200 shadow-2xs"
						/>
						{#if friendUsername}
							<button
								type="button"
								onclick={() => { friendUsername = ''; searchResults = []; hasSearched = false; }}
								class="absolute right-2.5 top-2 p-1 text-pink-400 hover:text-pink-600 rounded-full cursor-pointer"
								title="Clear search"
							>
								<X class="w-3.5 h-3.5" />
							</button>
						{/if}
					</div>
				</form>

				<!-- Live Search State & Results Container -->
				{#if isSearchingUsers}
					<div class="space-y-2 mt-3 animate-pulse">
						{#each Array(2) as _}
							<div class="p-2.5 bg-[#fdf2f6]/60 border border-pink-100/80 rounded-2xl flex items-center justify-between gap-2">
								<div class="flex items-center space-x-2 min-w-0 flex-1">
									<div class="w-9 h-9 rounded-full bg-pink-200/70 flex-shrink-0"></div>
									<div class="space-y-1.5 flex-1">
										<div class="h-3.5 bg-pink-200/70 rounded w-1/2"></div>
										<div class="h-2.5 bg-pink-200/50 rounded w-1/3"></div>
									</div>
								</div>
								<div class="h-7 w-20 bg-pink-100/80 rounded-xl flex-shrink-0"></div>
							</div>
						{/each}
					</div>
				{:else if searchResults.length > 0}
					<div class="space-y-2.5 mt-3">
						<div class="flex items-center justify-between">
							<h3 class="text-[11px] font-black text-[#f43f8e] uppercase tracking-wide">
								Search Results ({searchResults.length})
							</h3>
							<span class="text-[10px] text-pink-400 font-bold">Preview profile before adding</span>
						</div>

						<div class="space-y-2 max-h-64 overflow-y-auto pr-1">
							{#each searchResults as targetUser (targetUser.id)}
								<div class="p-2.5 bg-[#fdf2f6]/60 hover:bg-[#fff5f8] border border-pink-100 hover:border-pink-200 rounded-2xl flex items-center justify-between gap-2 transition-all duration-200 shadow-2xs">
									<!-- User Info (Clickable) -->
									<button
										type="button"
										onclick={() => goto(`/profile?id=${targetUser.id}`)}
										class="flex items-center space-x-2 min-w-0 text-left hover:opacity-85 transition-opacity group cursor-pointer"
										title="View @{targetUser.username}'s Profile"
									>
										<div class="w-9 h-9 rounded-full border border-pink-200 shadow-2xs overflow-hidden bg-pink-100 text-[#f43f8e] font-black text-xs flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
											{#if targetUser.avatar_url}
												<img src={targetUser.avatar_url} alt={targetUser.username} class="w-full h-full object-cover" />
											{:else}
												{targetUser.username.charAt(0).toUpperCase()}
											{/if}
										</div>
										<div class="min-w-0">
											<div class="flex items-center gap-1 flex-wrap">
												<p class="text-xs font-black text-pink-950 truncate group-hover:text-[#f43f8e] transition-colors">@{targetUser.username}</p>
												{#if targetUser.mutual_friends_count > 0}
													<span class="text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-pink-100 text-[#f43f8e] border border-pink-200 whitespace-nowrap">
														{targetUser.mutual_friends_count} mutual
													</span>
												{/if}
											</div>
											<p class="text-[10px] text-pink-400 font-medium truncate">{targetUser.email}</p>
										</div>
									</button>

									<!-- Actions (View Profile & Add Friend) -->
									<div class="flex items-center space-x-1.5 flex-shrink-0">
										<!-- View Profile Button -->
										<button
											type="button"
											onclick={() => goto(`/profile?id=${targetUser.id}`)}
											class="px-2.5 py-1 bg-white border border-pink-200 hover:border-pink-300 hover:bg-pink-50 text-pink-700 active:scale-95 text-xs font-bold rounded-xl transition-all flex items-center space-x-1 cursor-pointer shadow-2xs"
											title="View Full Profile"
										>
											<User class="w-3 h-3 text-[#f43f8e]" strokeWidth={2} />
											<span>Profile</span>
										</button>

										<!-- Relationship Status Action -->
										{#if targetUser.relationship === 'self'}
											<span class="px-2.5 py-1 bg-pink-50 text-pink-500 text-xs font-bold rounded-xl border border-pink-100">
												You
											</span>
										{:else if targetUser.relationship === 'friends'}
											<button
												type="button"
												onclick={() => openChatWithFriend({ friend_id: targetUser.id, username: targetUser.username })}
												class="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all flex items-center space-x-1 cursor-pointer active:scale-95 shadow-xs"
											>
												<Check class="w-3 h-3" strokeWidth={2.5} />
												<span>Friends</span>
											</button>
										{:else if targetUser.relationship === 'request_sent'}
											<button
												type="button"
												onclick={() => handleCancelFriendRequestFromSearch(targetUser)}
												disabled={cancelingFriendUserId === targetUser.id}
												class="px-2.5 py-1 bg-amber-50 hover:bg-rose-50 text-amber-800 hover:text-rose-600 border border-amber-200 hover:border-rose-200 text-xs font-bold rounded-xl active:scale-95 transition-all flex items-center space-x-1 cursor-pointer disabled:opacity-50"
												title="Click to cancel friend request"
											>
												{#if cancelingFriendUserId === targetUser.id}
													<div class="animate-spin h-3 w-3 border-2 border-amber-400 border-t-amber-800 rounded-full"></div>
													<span>Canceling...</span>
												{:else}
													<span>Cancel Add</span>
												{/if}
											</button>
										{:else if targetUser.relationship === 'request_received'}
											<div class="flex items-center space-x-1 flex-shrink-0">
												<button
													type="button"
													onclick={() => handleRespondRequest(targetUser.request_id, 'accept')}
													class="px-2.5 py-1 bg-[#f43f8e] text-white text-xs font-bold rounded-xl hover:bg-[#e0337f] active:scale-95 transition-all cursor-pointer shadow-xs"
												>
													Accept
												</button>
												<button
													type="button"
													onclick={() => handleRespondRequest(targetUser.request_id, 'decline')}
													class="px-2.5 py-1 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer shadow-2xs"
												>
													Decline
												</button>
											</div>
										{:else}
											<button
												type="button"
												onclick={() => sendFriendRequestToUser(targetUser)}
												disabled={addingFriendUserId === targetUser.id}
												class="px-2.5 py-1 bg-[#f43f8e] hover:bg-[#e0337f] active:scale-95 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50 flex items-center space-x-1 cursor-pointer shadow-xs"
											>
												{#if addingFriendUserId === targetUser.id}
													<div class="animate-spin h-3 w-3 border-2 border-white/40 border-t-white rounded-full"></div>
													<span>Sending...</span>
												{:else}
													<Plus class="w-3 h-3" strokeWidth={2.5} />
													<span>Add Friend</span>
												{/if}
											</button>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{:else if hasSearched && friendUsername.trim()}
					<div class="text-center py-6 bg-pink-50/40 rounded-2xl border border-dashed border-pink-200 animate-fade-in">
						<div class="w-9 h-9 bg-pink-50 border border-pink-100 rounded-full flex items-center justify-center mx-auto mb-1.5 text-[#f43f8e]">
							<User class="w-4 h-4" strokeWidth={2} />
						</div>
						<p class="text-xs font-black text-pink-950">No user found matching "@{friendUsername.trim()}"</p>
						<p class="text-[11px] text-pink-400 font-medium mt-0.5">Please check the spelling and try again.</p>
					</div>
				{:else}
					<div class="p-3 bg-pink-50/40 rounded-2xl border border-pink-100 text-center">
						<p class="text-xs text-pink-950 font-bold">
							Type any username to find users
						</p>
						<p class="text-[11px] text-pink-400 font-medium mt-0.5">
							Preview their profile card, mutual friends, and details before adding!
						</p>
					</div>
				{/if}

				<!-- Discover People / Suggested Users Section -->
				<div class="mt-4 pt-4 border-t border-pink-100 space-y-2.5">
					<div class="flex items-center justify-between">
						<div class="flex items-center space-x-1.5">
							<div class="w-6 h-6 rounded-lg bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center shadow-2xs">
								<Users class="w-3.5 h-3.5" strokeWidth={2.2} />
							</div>
							<h3 class="text-xs font-black text-pink-950 uppercase tracking-wide">
								Discover People
							</h3>
						</div>
						<span class="text-[10px] text-pink-400 font-bold">Suggested Users</span>
					</div>

					{#if isLoadingSuggested && suggestedUsers.length === 0}
						<div class="space-y-2 max-h-72 overflow-hidden animate-pulse">
							{#each Array(3) as _}
								<div class="p-2.5 bg-[#fdf2f6]/60 border border-pink-100/80 rounded-2xl flex items-center justify-between gap-2">
									<div class="flex items-center space-x-2 min-w-0 flex-1">
										<div class="w-9 h-9 rounded-full bg-pink-200/70 flex-shrink-0"></div>
										<div class="space-y-1.5 flex-1">
											<div class="h-3.5 bg-pink-200/70 rounded w-1/2"></div>
											<div class="h-2.5 bg-pink-200/50 rounded w-1/3"></div>
										</div>
									</div>
									<div class="h-7 w-16 bg-pink-100/80 rounded-xl flex-shrink-0"></div>
								</div>
							{/each}
						</div>
					{:else if suggestedUsers.length > 0}
						<div class="space-y-2 max-h-72 overflow-y-auto pr-1">
							{#each suggestedUsers as sugUser (sugUser.id)}
								<div class="p-2.5 bg-[#fdf2f6]/60 hover:bg-[#fff5f8] border border-pink-100 hover:border-pink-200 rounded-2xl flex items-center justify-between gap-2 transition-all shadow-2xs">
									<!-- User Info -->
									<button
										type="button"
										onclick={() => goto(`/profile?id=${sugUser.id}`)}
										class="flex items-center space-x-2 min-w-0 text-left hover:opacity-85 transition-opacity group cursor-pointer"
										title="View @{sugUser.username}'s Profile"
									>
										<div class="w-9 h-9 rounded-full border border-pink-200 shadow-2xs overflow-hidden bg-pink-100 text-[#f43f8e] font-black text-xs flex items-center justify-center flex-shrink-0">
											{#if sugUser.avatar_url}
												<img src={sugUser.avatar_url} alt={sugUser.username} class="w-full h-full object-cover" />
											{:else}
												{sugUser.username.charAt(0).toUpperCase()}
											{/if}
										</div>
										<div class="min-w-0">
											<p class="text-xs font-black text-pink-950 truncate group-hover:text-[#f43f8e] transition-colors">@{sugUser.username}</p>
											<p class="text-[10px] text-pink-400 font-medium truncate">Joined {new Date(sugUser.created_at || Date.now()).toLocaleDateString()}</p>
										</div>
									</button>

									<!-- Actions -->
									<div class="flex items-center space-x-1.5 flex-shrink-0">
										{#if sugUser.relationship === 'friends'}
											<span class="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl flex items-center space-x-1">
												<span>Friends</span>
											</span>
										{:else if sugUser.relationship === 'request_sent'}
											<button
												type="button"
												onclick={() => handleCancelFriendRequestFromSearch(sugUser)}
												disabled={cancelingFriendUserId === sugUser.id}
												class="px-2.5 py-1 bg-amber-50 hover:bg-rose-50 text-amber-800 hover:text-rose-600 border border-amber-200 hover:border-rose-200 text-xs font-bold rounded-xl active:scale-95 transition-all flex items-center space-x-1 cursor-pointer disabled:opacity-50"
												title="Cancel request"
											>
												{#if cancelingFriendUserId === sugUser.id}
													<div class="animate-spin h-3 w-3 border-2 border-amber-400 border-t-amber-800 rounded-full"></div>
													<span>Canceling...</span>
												{:else}
													<span>Cancel Add</span>
												{/if}
											</button>
										{:else if sugUser.relationship === 'request_received'}
											<div class="flex items-center space-x-1 flex-shrink-0">
												<button
													type="button"
													onclick={() => handleRespondRequest(sugUser.request_id, 'accept')}
													class="px-2.5 py-1 bg-[#f43f8e] text-white text-xs font-bold rounded-xl hover:bg-[#e0337f] active:scale-95 transition-all cursor-pointer shadow-xs"
												>
													Accept
												</button>
												<button
													type="button"
													onclick={() => handleRespondRequest(sugUser.request_id, 'decline')}
													class="px-2.5 py-1 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer shadow-2xs"
												>
													Decline
												</button>
											</div>
										{:else}
											<button
												type="button"
												onclick={() => sendFriendRequestToUser(sugUser)}
												disabled={addingFriendUserId === sugUser.id}
												class="px-2.5 py-1 bg-[#f43f8e] hover:bg-[#e0337f] active:scale-95 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50 flex items-center space-x-1 cursor-pointer shadow-xs"
											>
												{#if addingFriendUserId === sugUser.id}
													<div class="animate-spin h-3 w-3 border-2 border-white/40 border-t-white rounded-full"></div>
													<span>Sending...</span>
												{:else}
													<Plus class="w-3 h-3" strokeWidth={2.5} />
													<span>Add Friend</span>
												{/if}
											</button>
										{/if}
									</div>
								</div>
							{/each}
						</div>

						<!-- Lazy load / Load more button -->
						{#if hasMoreSuggested}
							<div class="text-center pt-2">
								<button
									type="button"
									onclick={loadMoreSuggestedUsers}
									disabled={isLoadingSuggested}
									class="px-3.5 py-1.5 bg-pink-50 hover:bg-pink-100 border border-pink-200 text-pink-700 text-xs font-bold rounded-xl active:scale-95 transition-all disabled:opacity-50 cursor-pointer inline-flex items-center space-x-1 shadow-2xs"
								>
									{#if isLoadingSuggested}
										<div class="animate-spin h-3 w-3 border-2 border-pink-300 border-t-[#f43f8e] rounded-full"></div>
										<span>Loading...</span>
									{:else}
										<ChevronDown class="w-3 h-3 text-[#f43f8e]" strokeWidth={2.5} />
										<span>Load More Users (20)</span>
									{/if}
								</button>
							</div>
						{/if}
					{:else}
						<p class="text-center text-pink-400 py-4 text-xs font-medium">No suggested users found.</p>
					{/if}
				</div>
			</div>
		</div>

		<!-- RIGHT COLUMN (Span 4): Requests & Community Actions Sidebar -->
		<div class="lg:col-span-4 flex flex-col gap-5 lg:sticky lg:top-20 {mobileTab === 'requests' ? 'flex' : 'hidden lg:flex'}">
				
				<!-- Card 1: Friend Requests Widget (Incoming & Sent) -->
				<div class="bg-white border border-pink-100/90 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(244,114,182,0.08)]">
					<div class="flex items-center justify-between mb-3.5 pb-3 border-b border-pink-100/80">
						<div class="flex items-center space-x-2">
							<div class="w-7 h-7 rounded-xl bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center shadow-2xs">
								<Clock class="w-3.5 h-3.5" />
							</div>
							<h3 class="text-xs sm:text-sm font-black text-pink-950">
								Requests
							</h3>
						</div>

						<!-- Subtabs: Received vs Sent Segmented Switch -->
						<div class="flex items-center bg-[#fdf2f6] p-1 rounded-xl border border-pink-200/70 text-xs font-black shadow-2xs">
							<button
								type="button"
								onclick={() => pendingSubTab = 'incoming'}
								class="px-2.5 py-1 rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer {pendingSubTab === 'incoming' ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-700 hover:text-pink-950 hover:bg-white/60'}"
							>
								<span>Received</span>
								<span class="text-[10px] px-1.5 py-0.2 rounded-full font-bold {pendingSubTab === 'incoming' ? 'bg-white/25 text-white' : 'bg-pink-100 text-[#f43f8e]'}">
									{pendingRequests.length}
								</span>
							</button>

							<button
								type="button"
								onclick={() => pendingSubTab = 'sent'}
								class="px-2.5 py-1 rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer {pendingSubTab === 'sent' ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-700 hover:text-pink-950 hover:bg-white/60'}"
							>
								<span>Sent</span>
								<span class="text-[10px] px-1.5 py-0.2 rounded-full font-bold {pendingSubTab === 'sent' ? 'bg-white/25 text-white' : 'bg-pink-100 text-[#f43f8e]'}">
									{sentRequests.length}
								</span>
							</button>
						</div>
					</div>

					<!-- Incoming Requests Tab -->
					{#if pendingSubTab === 'incoming'}
						{#if pendingRequests.length > 0}
							<div class="space-y-2 max-h-80 overflow-y-auto pr-1">
								{#each pendingRequests as req, idx (req.id || req.request_id || idx)}
									<div class="p-2.5 bg-[#fdf2f6]/70 border border-pink-100 rounded-2xl flex items-center justify-between gap-2 shadow-2xs">
										<a
											href="/profile?id={req.sender_id || req.id}"
											class="flex items-center space-x-2 min-w-0 hover:opacity-85 transition-opacity group cursor-pointer flex-1"
											title="View @{req.username}'s Profile"
										>
											<div class="w-8 h-8 rounded-full border border-pink-200 overflow-hidden bg-pink-100 text-[#f43f8e] font-black flex items-center justify-center flex-shrink-0 text-xs">
												{#if req.avatar_url}
													<img src={req.avatar_url} alt={req.username} class="w-full h-full object-cover" />
												{:else}
													{(req.username || 'U').charAt(0).toUpperCase()}
												{/if}
											</div>
											<div class="min-w-0 flex-1">
												<p class="text-xs font-black text-pink-950 truncate group-hover:text-[#f43f8e]">@{req.username || 'Unknown'}</p>
												<p class="text-[9px] text-pink-400 font-semibold">{formatDate(req.created_at)}</p>
											</div>
										</a>

										<div class="flex items-center space-x-1 flex-shrink-0">
											<button
												onclick={() => handleRespondRequest(req.id || req.request_id, 'accept')}
												disabled={isResponding}
												class="px-2.5 py-1 bg-[#f43f8e] text-white text-xs font-bold rounded-xl hover:bg-[#e0337f] active:scale-95 transition-all cursor-pointer shadow-xs disabled:opacity-50"
											>
												Accept
											</button>
											<button
												onclick={() => handleRespondRequest(req.id || req.request_id, 'decline')}
												disabled={isResponding}
												class="px-2.5 py-1 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer shadow-2xs disabled:opacity-50"
												title="Decline Request"
											>
												Decline
											</button>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<div class="min-h-[175px] flex flex-col items-center justify-center text-center py-7 px-4 bg-gradient-to-b from-[#fdf2f6]/80 to-pink-50/40 rounded-2xl border border-pink-100/90 animate-fade-in">
								<div class="w-11 h-11 bg-white text-[#f43f8e] rounded-2xl border border-pink-100 flex items-center justify-center mx-auto mb-2 shadow-2xs">
									<Inbox class="w-5 h-5 text-[#f43f8e]" />
								</div>
								<h4 class="text-xs sm:text-sm font-black text-pink-950 mb-0.5">No incoming requests</h4>
								<p class="text-[11px] text-pink-400 font-medium">You're all caught up!</p>
							</div>
						{/if}
					{:else}
						<!-- Sent Requests Tab -->
						{#if sentRequests.length > 0}
							<div class="space-y-2 max-h-80 overflow-y-auto pr-1">
								{#each sentRequests as req, idx (req.id || req.request_id || idx)}
									<div class="p-2.5 bg-[#fdf2f6]/70 border border-pink-100 rounded-2xl flex items-center justify-between gap-2 shadow-2xs">
										<a
											href="/profile?id={req.receiver_id || req.id}"
											class="flex items-center space-x-2 min-w-0 hover:opacity-85 transition-opacity group cursor-pointer flex-1"
											title="View @{req.username}'s Profile"
										>
											<div class="w-8 h-8 rounded-full border border-pink-200 overflow-hidden bg-pink-100 text-pink-700 font-black flex items-center justify-center flex-shrink-0 text-xs">
												{#if req.avatar_url}
													<img src={req.avatar_url} alt={req.username} class="w-full h-full object-cover" />
												{:else}
													{(req.username || 'U').charAt(0).toUpperCase()}
												{/if}
											</div>
											<div class="min-w-0 flex-1">
												<p class="text-xs font-black text-pink-950 truncate group-hover:text-[#f43f8e]">@{req.username || 'Unknown'}</p>
												<p class="text-[9px] text-pink-400 font-semibold">{formatDate(req.created_at)}</p>
											</div>
										</a>

										<button
											onclick={() => handleCancelSentRequest(req.id || req.request_id)}
											disabled={isResponding}
											class="px-2 py-1 bg-amber-50 hover:bg-rose-50 border border-amber-200 hover:border-rose-200 text-amber-800 hover:text-rose-600 text-[10px] font-bold rounded-lg active:scale-95 transition-all cursor-pointer disabled:opacity-50"
										>
											Cancel
										</button>
									</div>
								{/each}
							</div>
						{:else}
							<div class="min-h-[175px] flex flex-col items-center justify-center text-center py-7 px-4 bg-gradient-to-b from-[#fdf2f6]/80 to-pink-50/40 rounded-2xl border border-pink-100/90 animate-fade-in">
								<div class="w-11 h-11 bg-white text-[#f43f8e] rounded-2xl border border-pink-100 flex items-center justify-center mx-auto mb-2 shadow-2xs">
									<Send class="w-5 h-5 text-[#f43f8e]" />
								</div>
								<h4 class="text-xs sm:text-sm font-black text-pink-950 mb-0.5">No sent requests</h4>
								<p class="text-[11px] text-pink-400 font-medium">All sent requests have been answered.</p>
							</div>
						{/if}
					{/if}
				</div>

				<!-- Card 2: Share Profile & Invite Card (Desktop only) -->
				<div class="hidden lg:block bg-gradient-to-br from-pink-50 via-white to-[#fdf2f6] border border-pink-200/80 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(244,114,182,0.08)]">
					<div class="flex items-center space-x-2.5 mb-2.5">
						<div class="w-7 h-7 rounded-xl bg-[#f43f8e] text-white flex items-center justify-center shadow-xs">
							<Share2 class="w-3.5 h-3.5" />
						</div>
						<h3 class="text-xs sm:text-sm font-black text-pink-950">Invite Friends</h3>
					</div>
					<p class="text-xs text-pink-700 font-semibold mb-3 leading-relaxed">
						Share your personal profile link so friends can easily find and connect with you!
					</p>
					<button
						onclick={copyMyProfileLink}
						class="w-full py-2.5 px-3 bg-[#f43f8e] hover:bg-[#e0337f] text-white rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs"
					>
						{#if copiedLink}
							<Check class="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
							<span class="font-black">Link Copied to Clipboard!</span>
						{:else}
							<Copy class="w-3.5 h-3.5" />
							<span>Copy Profile Link</span>
						{/if}
					</button>
				</div>
			</div>
		</div>
	</main>

	<!-- Confirmation Modal for Removing Friend -->
	{#if showConfirmDelete}
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="remove-friend-title"
			tabindex="-1"
			onkeydown={(e) => { if (e.key === 'Escape') { showConfirmDelete = false; friendToRemove = null; } }}
			class="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in"
			onclick={(e) => { if (e.target === e.currentTarget) { showConfirmDelete = false; friendToRemove = null; } }}
		>
			<div class="bg-white border border-pink-100 rounded-3xl max-w-sm w-full p-5 sm:p-6 text-center animate-modal-content shadow-2xl space-y-3.5">
				<div class="w-12 h-12 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto border border-rose-100 shadow-xs">
					<Trash2 class="w-5 h-5" strokeWidth={2} />
				</div>
				<div>
					<h3 id="remove-friend-title" class="text-sm sm:text-base font-black text-pink-950 mb-0.5">Remove Friend?</h3>
					<p class="text-xs text-pink-400 font-bold leading-relaxed">
						Are you sure you want to remove <span class="font-black text-pink-950">@{friendToRemove?.username}</span> from your friends list?
					</p>
				</div>

				<div class="flex items-center space-x-2.5 pt-1">
					<button
						type="button"
						onclick={() => { showConfirmDelete = false; friendToRemove = null; }}
						class="w-1/2 py-2.5 bg-pink-50 text-pink-700 hover:bg-pink-100 rounded-xl font-black text-xs transition-all active:scale-95 cursor-pointer border border-pink-100"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={confirmRemoveFriend}
						disabled={isRemoving}
						class="w-1/2 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50 shadow-md"
					>
						{isRemoving ? 'Removing...' : 'Remove'}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Custom Success / Alert Notification Modal -->
	{#if showNotificationModalPopup}
		<div
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="friends-alert-title"
			aria-describedby="friends-alert-desc"
			tabindex="-1"
			onkeydown={(e) => { if (e.key === 'Escape') showNotificationModalPopup = false; }}
			class="fixed inset-0 bg-black/40 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-fade-in"
			onclick={(e) => { if (e.target === e.currentTarget) showNotificationModalPopup = false; }}
		>
			<div class="bg-white border border-pink-100 rounded-3xl p-5 sm:p-6 max-w-xs sm:max-w-sm w-full text-center space-y-3.5 animate-modal-content shadow-2xl">
				<div class="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto {notificationModalType === 'error' ? 'bg-rose-50 text-rose-500 border border-rose-100' : 'bg-pink-50 text-[#f43f8e] border border-pink-200'} shadow-xs">
					{#if notificationModalType === 'error'}
						<AlertCircle class="w-6 h-6" strokeWidth={2.5} />
					{:else}
						<Check class="w-6 h-6 text-[#f43f8e]" strokeWidth={2.5} />
					{/if}
				</div>
				
				<div>
					<h3 id="friends-alert-title" class="text-sm sm:text-base font-black text-pink-950 mb-0.5">
						{notificationModalType === 'error' ? 'Notice' : 'Success!'}
					</h3>
					<p id="friends-alert-desc" class="text-xs text-pink-700 font-bold leading-relaxed">
						{notificationModalMessage}
					</p>
				</div>

				<div class="pt-1">
					<button
						type="button"
						onclick={() => showNotificationModalPopup = false}
						class="w-full py-2.5 bg-[#f43f8e] hover:bg-[#e0337f] text-white rounded-xl font-black text-xs transition-all active:scale-95 cursor-pointer shadow-md"
					>
						OK
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Bottom Navigation Bar (Footer) -->
	<AppFooter />
</div>
