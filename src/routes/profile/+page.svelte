<script>
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { supabase } from '$lib/supabaseClient';
	import { broadcastFriendEvent } from '$lib/realtimeBroadcast.js';
	import Sidebar from '$lib/Sidebar.svelte';

	let currentUser = $state(null);
	let targetUserId = $state(null);
	let profileData = $state(null);
	let isLoading = $state(true);
	let isSaving = $state(false);
	let isUploadingAvatar = $state(false);
	let sidebarOpen = $state(false);
	let activeTab = $state('friends'); // 'friends' | 'settings' | 'mutual'
	let friendsSearch = $state('');

	// Confirmation Modal states
	let showUnfriendModal = $state(false);
	let unfriendTarget = $state(null);
	let isUnfriending = $state(false);
	let showLogoutModal = $state(false);

	// Edit profile fields
	let editUsername = $state('');
	let editEmail = $state('');
	let editNewPassword = $state('');
	let editConfirmPassword = $state('');
	let avatarInput = null;

	// Toast state
	let toastMessage = $state('');
	let showToast = $state(false);
	let toastType = $state('success'); // 'success' | 'error'

	function showNotification(msg, type = 'success') {
		toastMessage = msg;
		toastType = type;
		showToast = true;
		setTimeout(() => {
			showToast = false;
		}, 3500);
	}

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

	let loadedProfileId = null;
	let fetchAbortController = null;

	async function loadProfile(targetId = null) {
		if (fetchAbortController) {
			fetchAbortController.abort();
		}
		fetchAbortController = new AbortController();

		isLoading = true;
		try {
			const stored = localStorage.getItem('chronomuse_user');
			if (!stored) {
				goto('/');
				return;
			}
			currentUser = JSON.parse(stored);

			// Determine which profile to load
			const urlParamId = $page.url.searchParams.get('id') || $page.url.searchParams.get('user_id');
			const effectiveTargetId = targetId || urlParamId || currentUser.id;
			targetUserId = effectiveTargetId;

			const res = await fetch(API_ENDPOINTS.getProfile, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: currentUser.id,
					target_user_id: effectiveTargetId
				}),
				signal: fetchAbortController.signal
			});

			const data = await res.json();
			if (data.success && data.data) {
				profileData = data.data;
				if (profileData.is_self) {
					editUsername = profileData.user.username || '';
					editEmail = profileData.user.email || '';
				}
			} else {
				showNotification(data.error || 'Failed to load profile', 'error');
			}
		} catch (err) {
			if (err.name === 'AbortError') return;
			console.error('Error loading profile:', err);
			showNotification('Failed to load profile data', 'error');
		} finally {
			isLoading = false;
		}
	}

	// Trigger avatar file selection
	function triggerAvatarUpload() {
		if (avatarInput) {
			avatarInput.click();
		}
	}

	// Handle avatar image selection and upload
	async function handleAvatarChange(e) {
		const file = e.target.files?.[0];
		if (!file) return;

		// Client-side file size & type check
		if (!file.type.startsWith('image/')) {
			showNotification('Please select a valid image file', 'error');
			return;
		}

		if (file.size > 5 * 1024 * 1024) {
			showNotification('Image must be under 5MB', 'error');
			return;
		}

		isUploadingAvatar = true;
		try {
			// Optimistic local preview
			const reader = new FileReader();
			reader.onload = (event) => {
				if (profileData?.user) {
					profileData.user.avatar_url = event.target.result;
				}
			};
			reader.readAsDataURL(file);

			const formData = new FormData();
			formData.append('user_id', currentUser.id);
			formData.append('avatar', file);

			const res = await fetch(API_ENDPOINTS.updateProfile, {
				method: 'POST',
				body: formData
			});

			const data = await res.json();
			if (data.success && data.user) {
				profileData.user = { ...profileData.user, ...data.user };
				
				// Update stored user in localStorage
				const updatedStored = { ...currentUser, ...data.user };
				localStorage.setItem('chronomuse_user', JSON.stringify(updatedStored));
				currentUser = updatedStored;

				if (typeof window !== 'undefined') {
					window.dispatchEvent(new Event('chronomuse_auth_change'));
				}
				showNotification('Profile picture updated successfully!');
			} else {
				showNotification(data.error || 'Failed to upload profile picture', 'error');
			}
		} catch (err) {
			console.error('Error uploading avatar:', err);
			showNotification('Error uploading picture', 'error');
		} finally {
			isUploadingAvatar = false;
			if (avatarInput) avatarInput.value = '';
		}
	}

	// Save profile info (username, email, password)
	async function handleSaveProfile() {
		if (!editUsername.trim() || !editEmail.trim()) {
			showNotification('Username and Email are required', 'error');
			return;
		}

		if (editNewPassword && editNewPassword.length < 6) {
			showNotification('Password must be at least 6 characters', 'error');
			return;
		}

		if (editNewPassword && editNewPassword !== editConfirmPassword) {
			showNotification('New passwords do not match', 'error');
			return;
		}

		isSaving = true;
		try {
			const res = await fetch(API_ENDPOINTS.updateProfile, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: currentUser.id,
					username: editUsername.trim(),
					email: editEmail.trim(),
					new_password: editNewPassword.trim() || undefined
				})
			});

			const data = await res.json();
			if (data.success && data.user) {
				profileData.user = { ...profileData.user, ...data.user };
				const updatedStored = { ...currentUser, ...data.user };
				localStorage.setItem('chronomuse_user', JSON.stringify(updatedStored));
				currentUser = updatedStored;

				editNewPassword = '';
				editConfirmPassword = '';

				if (typeof window !== 'undefined') {
					window.dispatchEvent(new Event('chronomuse_auth_change'));
				}
				showNotification('Profile settings saved successfully!');
			} else {
				showNotification(data.error || 'Failed to update profile', 'error');
			}
		} catch (err) {
			console.error('Error saving profile:', err);
			showNotification('Failed to save profile', 'error');
		} finally {
			isSaving = false;
		}
	}

	function openChatWithUser(user) {
		const targetId = user.friend_id || user.id;
		goto(`/chat?friend_id=${targetId}&username=${encodeURIComponent(user.username)}`);
	}

	function viewUserProfile(user) {
		const targetId = user?.friend_id || user?.id;
		if (!targetId) return;
		activeTab = 'friends';
		goto(`/profile?id=${targetId}`);
	}

	function promptRemoveFriend(friend) {
		unfriendTarget = friend;
		showUnfriendModal = true;
	}

	async function confirmRemoveFriend() {
		if (!unfriendTarget || !currentUser || isUnfriending) return;
		const targetId = unfriendTarget.friend_id || unfriendTarget.id;
		isUnfriending = true;

		// 0ms Optimistic broadcast & local state update
		broadcastFriendEvent(currentUser.id, targetId, 'unfriend');

		try {
			const res = await fetch(API_ENDPOINTS.removeFriend, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: currentUser.id,
					friend_id: targetId
				})
			});
			const data = await res.json();
			if (data.success) {
				showNotification(`Unfriended @${unfriendTarget.username}`);
				// Optimistically update friends list & friendship status
				if (profileData) {
					if (String(profileData.user?.id) === String(targetId)) {
						profileData.is_friend = false;
					}
					if (profileData.is_self && profileData.friends) {
						profileData.friends = profileData.friends.filter(f => String(f.friend_id || f.id) !== String(targetId));
						profileData.total_friends = profileData.friends.length;
					}
					if (profileData.mutual_friends) {
						profileData.mutual_friends = profileData.mutual_friends.filter(f => String(f.friend_id || f.id) !== String(targetId));
						profileData.mutual_friends_count = profileData.mutual_friends.length;
					}
				}
				showUnfriendModal = false;
				unfriendTarget = null;
				broadcastFriendEvent(currentUser.id, targetId, 'unfriend');
			} else {
				showNotification(data.error || 'Failed to remove friend', 'error');
			}
		} catch (err) {
			showNotification('Error removing friend', 'error');
		} finally {
			isUnfriending = false;
		}
	}

	async function sendFriendRequestToTargetUser() {
		if (!currentUser || !profileData?.user || isSaving) return;
		isSaving = true;

		// 0ms Optimistic UI feedback
		profileData.has_pending_request = true;
		profileData.pending_request_sender_id = currentUser.id;

		broadcastFriendEvent(currentUser.id, profileData.user.id, 'friend_request');

		try {
			const res = await fetch(API_ENDPOINTS.addFriend, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					friend_username: profileData.user.username,
					user_id: currentUser.id
				})
			});
			const data = await res.json();
			if (data.error) {
				// Revert on error
				profileData.has_pending_request = false;
				profileData.pending_request_sender_id = null;
				showNotification(data.error, 'error');
			} else {
				showNotification(data.message || `Friend request sent to @${profileData.user.username}!`);
				profileData.pending_request_id = data.request_id || null;
				broadcastFriendEvent(currentUser.id, profileData.user.id, 'friend_request');
			}
		} catch (err) {
			profileData.has_pending_request = false;
			profileData.pending_request_sender_id = null;
			showNotification('Failed to send friend request', 'error');
		} finally {
			isSaving = false;
		}
	}

	async function cancelFriendRequestOnProfile() {
		if (!currentUser || !profileData?.user || isSaving) return;
		isSaving = true;

		// 0ms Optimistic UI feedback
		const prevPending = profileData.has_pending_request;
		const prevReqId = profileData.pending_request_id;
		const prevSenderId = profileData.pending_request_sender_id;

		profileData.has_pending_request = false;
		profileData.pending_request_id = null;
		profileData.pending_request_sender_id = null;

		broadcastFriendEvent(currentUser.id, profileData.user.id, 'cancel_request');

		try {
			const res = await fetch(API_ENDPOINTS.cancelFriendRequest, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: currentUser.id,
					request_id: prevReqId || null,
					friend_id: profileData.user.id
				})
			});
			const data = await res.json();
			if (data.success) {
				showNotification('Friend request cancelled');
				broadcastFriendEvent(currentUser.id, profileData.user.id, 'cancel_request');
			} else {
				// Revert on error
				profileData.has_pending_request = prevPending;
				profileData.pending_request_id = prevReqId;
				profileData.pending_request_sender_id = prevSenderId;
				showNotification(data.error || 'Failed to cancel request', 'error');
			}
		} catch (err) {
			profileData.has_pending_request = prevPending;
			profileData.pending_request_id = prevReqId;
			profileData.pending_request_sender_id = prevSenderId;
			showNotification('Error cancelling request', 'error');
		} finally {
			isSaving = false;
		}
	}

	function formatDate(dateStr) {
		if (!dateStr) return '';
		const d = new Date(dateStr);
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function formatLastActive(lastActivity) {
		if (!lastActivity) return 'Offline';
		const diff = Date.now() - new Date(lastActivity).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 3) return 'Active now';
		if (mins < 60) return `Active ${mins}m ago`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `Active ${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `Active ${days}d ago`;
	}

	let filteredFriends = $derived(
		(profileData?.friends || []).filter(f => {
			if (!friendsSearch.trim()) return true;
			const query = friendsSearch.toLowerCase();
			return (f.username || '').toLowerCase().includes(query) || (f.email || '').toLowerCase().includes(query);
		})
	);

	$effect(() => {
		const id = $page.url.searchParams.get('id') || $page.url.searchParams.get('user_id');
		const stored = typeof window !== 'undefined' ? localStorage.getItem('chronomuse_user') : null;
		const myId = stored ? JSON.parse(stored)?.id : null;
		const activeId = id || myId;
		if (activeId && String(activeId) !== String(loadedProfileId)) {
			loadedProfileId = String(activeId);
			loadProfile(activeId);
		}
	});

	let profilePollInterval = null;

	onMount(() => {
		const handleRealtimeProfile = () => {
			if (loadedProfileId) {
				loadProfile(loadedProfileId);
			}
		};

		window.addEventListener('chronomuse_friend_change', handleRealtimeProfile);
		window.addEventListener('chronomuse_notification_change', handleRealtimeProfile);

		// Periodic background polling to sync profile if other user accepts/unfriends
		profilePollInterval = setInterval(() => {
			if (loadedProfileId) {
				loadProfile(loadedProfileId);
			}
		}, 2500);

		return () => {
			window.removeEventListener('chronomuse_friend_change', handleRealtimeProfile);
			window.removeEventListener('chronomuse_notification_change', handleRealtimeProfile);
			if (profilePollInterval) clearInterval(profilePollInterval);
		};
	});
</script>

<svelte:head>
	<title>{profileData?.user?.username ? `@${profileData.user.username}'s Profile` : 'My Profile'} - ChronoMuse</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-pink-50/80 via-pink-100/50 to-pink-200/40 flex flex-col font-sans">
	<!-- Hidden File Input for Avatar Upload -->
	<input
		type="file"
		accept="image/*"
		bind:this={avatarInput}
		onchange={handleAvatarChange}
		class="hidden"
		aria-label="Upload profile picture"
	/>

	<!-- Top Navigation Bar (Consistent with Dashboard, Friends & Notifications) -->
	<nav class="bg-white/85 backdrop-blur-md border-b-2 border-pink-300 shadow-lg sticky top-0 z-50 animate-slide-down">
		<div class="container mx-auto px-4 py-3 flex items-center justify-between">
			<div class="flex items-center space-x-3 min-w-0">
				<!-- Hamburger Menu Button - Mobile Only with Notification Dot -->
				<button
					onclick={toggleSidebar}
					class="p-1.5 sm:p-2 text-pink-500 hover:bg-pink-100 rounded-lg transition-colors flex-shrink-0 active:scale-95 relative"
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
				</button>
				<img src="/logo.png" alt="ChronoMuse" class="w-9 h-9 sm:w-10 sm:h-10 rounded-md object-contain flex-shrink-0" />
				<span class="text-base sm:text-lg font-bold text-pink-500 truncate">ChronoMuse</span>
			</div>

			<div class="flex items-center space-x-2 sm:space-x-4 flex-shrink-0 ml-2">
				<span class="text-pink-700 text-sm hidden md:inline">Welcome, <strong>{currentUser?.username}</strong></span>
				<span class="text-pink-700 text-xs sm:text-sm md:hidden truncate max-w-[110px]"><strong>{currentUser?.username}</strong></span>
				<button
					onclick={handleLogout}
					class="px-4 py-2 bg-gradient-to-r from-pink-400 to-pink-600 text-white rounded-lg hover:from-pink-500 hover:to-pink-700 transition-all duration-200 text-sm font-semibold shadow-md hidden md:block active:scale-95"
				>
					Logout
				</button>
			</div>
		</div>
	</nav>

	<!-- Sidebar Component -->
	<Sidebar bind:isOpen={sidebarOpen} on:logout={handleLogout} />

	<!-- Main Profile Container -->
	<main class="flex-grow container mx-auto px-4 py-6 sm:py-8 max-w-5xl space-y-5 sm:space-y-6">
		{#if isLoading}
			<div class="flex flex-col items-center justify-center py-24 space-y-3">
				<div class="w-10 h-10 border-4 border-pink-400 border-t-transparent rounded-full animate-spin"></div>
				<p class="text-sm font-semibold text-pink-600 animate-pulse">Loading profile...</p>
			</div>
		{:else if profileData}
			<!-- Hero Profile Header Card -->
			<div class="bg-white/90 backdrop-blur-md rounded-3xl border-2 border-pink-200 shadow-md p-6 sm:p-8 relative overflow-hidden animate-fade-in-up">
				<!-- Background ambient decorative glow -->
				<div class="absolute -right-12 -top-12 w-48 h-48 bg-pink-300/30 rounded-full blur-2xl pointer-events-none"></div>
				<div class="absolute -left-12 -bottom-12 w-48 h-48 bg-rose-300/20 rounded-full blur-2xl pointer-events-none"></div>

				<div class="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-6">
					<!-- Profile Picture Avatar -->
					<div class="relative group flex-shrink-0">
						<div class="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-pink-300 shadow-lg overflow-hidden bg-gradient-to-tr from-pink-400 to-rose-500 flex items-center justify-center text-white text-3xl font-extrabold relative">
							{#if profileData.user.avatar_url}
								<img
									src={profileData.user.avatar_url}
									alt={profileData.user.username}
									class="w-full h-full object-cover"
								/>
							{:else}
								<span>{profileData.user.username?.charAt(0).toUpperCase() || 'U'}</span>
							{/if}

							{#if isUploadingAvatar}
								<div class="absolute inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center">
									<div class="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
								</div>
							{/if}
						</div>

						<!-- Camera Edit Button (Own profile only) -->
						{#if profileData.is_self}
							<button
								onclick={triggerAvatarUpload}
								disabled={isUploadingAvatar}
								class="absolute bottom-0 right-0 p-2 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white rounded-full shadow-md border-2 border-white transition-all transform hover:scale-110 active:scale-95 cursor-pointer"
								title="Change profile picture"
								aria-label="Change profile picture"
							>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
									<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
								</svg>
							</button>
						{/if}
					</div>

					<!-- User Info & Badges -->
					<div class="flex-1 text-center md:text-left space-y-2.5">
						<div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
							<div>
								<div class="flex items-center justify-center md:justify-start space-x-2">
									<h2 class="text-xl sm:text-2xl font-black text-pink-950">
										@{profileData.user.username}
									</h2>
									{#if profileData.is_self}
										<span class="px-2 py-0.5 bg-pink-100 text-pink-700 text-[10px] font-bold rounded-full border border-pink-300">
											You
										</span>
									{/if}
								</div>
								<p class="text-xs sm:text-sm text-pink-600 font-medium">
									{profileData.user.email}
								</p>
							</div>

							<!-- Action Buttons -->
							<div class="flex items-center justify-center md:justify-end gap-2 flex-wrap">
								{#if profileData.is_self}
									<button
										onclick={() => activeTab = activeTab === 'settings' ? 'friends' : 'settings'}
										class="px-4 py-2 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-all flex items-center space-x-1.5 active:scale-95"
									>
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.27.1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.27-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
											<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
										</svg>
										<span>{activeTab === 'settings' ? 'View Friends' : 'Edit Account'}</span>
									</button>
								{:else}
									<!-- If Pending Request -->
									{#if profileData.has_pending_request}
										{#if String(profileData.pending_request_sender_id) === String(currentUser?.id)}
											<button
												onclick={cancelFriendRequestOnProfile}
												disabled={isSaving}
												class="px-3.5 py-2 bg-amber-50 hover:bg-red-50 text-amber-800 hover:text-red-600 border border-amber-300 hover:border-red-300 text-xs sm:text-sm font-bold rounded-xl active:scale-95 transition-all shadow-2xs flex items-center space-x-1 cursor-pointer disabled:opacity-50"
												title="Click to cancel pending friend request"
											>
												<span>Cancel Add</span>
											</button>
										{:else}
											<div class="px-3.5 py-2 bg-amber-50 text-amber-700 border border-amber-200 text-xs sm:text-sm font-bold rounded-xl flex items-center space-x-1 shadow-2xs">
												<span>Request Received</span>
											</div>
										{/if}
									{:else if !profileData.is_friend}
										<!-- Add Friend Button -->
										<button
											onclick={sendFriendRequestToTargetUser}
											disabled={isSaving}
											class="px-4 py-2 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-all flex items-center space-x-1.5 active:scale-95 disabled:opacity-50"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
												<path stroke-linecap="round" stroke-linejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3.75 19.125a1.125 1.125 0 011.125-1.125h15.375c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H4.875a1.125 1.125 0 01-1.125-1.125v-2.25z" />
											</svg>
											<span>Add Friend</span>
										</button>
									{:else}
										<!-- Friend indicator -->
										<div class="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl flex items-center space-x-1">
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5">
												<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
											</svg>
											<span>Friends</span>
										</div>

										<!-- Unfriend Button on Friend Profile Header -->
										<button
											type="button"
											onclick={() => promptRemoveFriend(profileData.user)}
											class="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 hover:border-rose-300 font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center space-x-1.5 active:scale-95 cursor-pointer"
											title="Unfriend @{profileData.user.username}"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 text-rose-500">
												<path stroke-linecap="round" stroke-linejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.765z" />
											</svg>
											<span>Unfriend</span>
										</button>
									{/if}

									<!-- Message User Button -->
									<button
										onclick={() => openChatWithUser(profileData.user)}
										class="px-4 py-2 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-all flex items-center space-x-1.5 active:scale-95 cursor-pointer"
									>
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-.818-.818 5.969 5.969 0 011.057-3.035C4.646 15.657 4 13.916 4 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
										</svg>
										<span>Message</span>
									</button>
								{/if}
							</div>
						</div>

						<!-- Statistics Pills / Badges -->
						<div class="flex items-center justify-center md:justify-start flex-wrap gap-2 pt-2 border-t border-pink-100">
							<!-- Total Memories Badge -->
							<div class="px-3 py-1 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-full text-xs font-bold flex items-center space-x-1.5 shadow-xs">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 text-pink-100">
									<path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
								</svg>
								<span>{profileData.total_memories || 0} {profileData.total_memories === 1 ? 'Memory' : 'Memories'}</span>
							</div>

							<!-- Total Friends Badge -->
							<div class="px-3 py-1 bg-pink-100/80 border border-pink-300 rounded-full text-xs font-bold text-pink-700 flex items-center space-x-1.5 shadow-xs">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 text-pink-600">
									<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
								</svg>
								<span>{profileData.total_friends} {profileData.total_friends === 1 ? 'Friend' : 'Friends'}</span>
							</div>

							<!-- Mutual Friends Badge (When viewing someone else) -->
							{#if !profileData.is_self}
								<div class="px-3 py-1 bg-rose-100/90 border border-rose-300 rounded-full text-xs font-bold text-rose-700 flex items-center space-x-1.5 shadow-xs">
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 text-rose-600">
										<path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a5.97 5.97 0 00-.942 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
									</svg>
									<span>{profileData.mutual_friends_count} Mutual {profileData.mutual_friends_count === 1 ? 'Friend' : 'Friends'}</span>
								</div>
							{/if}

							<!-- Joined Date Badge -->
							{#if profileData.user.created_at}
								<div class="px-3 py-1 bg-white border border-pink-200 rounded-full text-xs font-semibold text-pink-600 flex items-center space-x-1.5">
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 text-pink-500">
										<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
									</svg>
									<span>Joined {formatDate(profileData.user.created_at)}</span>
								</div>
							{/if}

							<!-- Active Status Badge -->
							<div class="px-3 py-1 bg-white border border-pink-200 rounded-full text-xs font-semibold text-pink-600 flex items-center space-x-1.5">
								<span class="w-2 h-2 rounded-full {formatLastActive(profileData.user.last_activity) === 'Active now' ? 'bg-emerald-500 animate-pulse' : 'bg-pink-300'}"></span>
								<span>{formatLastActive(profileData.user.last_activity)}</span>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Navigation Tabs (When viewing own profile) -->
			{#if profileData.is_self}
				<div class="flex items-center space-x-2 border-b-2 border-pink-200 pb-2">
					<button
						onclick={() => activeTab = 'friends'}
						class="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center space-x-2 {activeTab === 'friends' ? 'bg-gradient-to-r from-pink-500 to-rose-600 text-white shadow-xs' : 'bg-white/80 text-pink-700 hover:bg-pink-100'}"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
						</svg>
						<span>Friends ({profileData.total_friends})</span>
					</button>

					<button
						onclick={() => activeTab = 'settings'}
						class="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center space-x-2 {activeTab === 'settings' ? 'bg-gradient-to-r from-pink-500 to-rose-600 text-white shadow-xs' : 'bg-white/80 text-pink-700 hover:bg-pink-100'}"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.27.1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.27-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
							<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
						</svg>
						<span>Account Settings</span>
					</button>
				</div>
			{/if}

		<!-- Content Sections Container (Left & Right layout on Desktop when mutual friends exist) -->
		<div class="{!profileData.is_self && profileData.mutual_friends?.length > 0 ? 'grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 items-start' : 'space-y-5 sm:space-y-6'}">
			
			<!-- Mutual Friends Section (Left column on Desktop when viewing another user's profile) -->
			{#if !profileData.is_self && profileData.mutual_friends?.length > 0}
				<div class="bg-white/80 backdrop-blur-md rounded-2xl border-2 border-rose-200 shadow-xs p-5 space-y-3 flex flex-col h-full">
					<div class="flex items-center justify-between pb-2 border-b border-rose-100">
						<div class="flex items-center space-x-2">
							<div class="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 flex-shrink-0">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
									<path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a5.97 5.97 0 00-.942 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
								</svg>
							</div>
							<div class="min-w-0">
								<h3 class="text-sm font-bold text-rose-900 truncate">Mutual Friends</h3>
								<p class="text-[11px] text-rose-600 truncate">You and @{profileData.user.username} both know these people</p>
							</div>
						</div>
						<span class="px-2.5 py-0.5 bg-rose-100 text-rose-700 text-xs font-bold rounded-full flex-shrink-0">
							{profileData.mutual_friends.length}
						</span>
					</div>

					<div class="grid grid-cols-1 gap-2.5 pt-1 overflow-y-auto max-h-[480px]">
						{#each profileData.mutual_friends as mutual}
							<div class="flex items-center justify-between p-3 sm:p-3.5 bg-rose-50/70 hover:bg-rose-100/80 rounded-2xl border border-rose-200 transition-all gap-2">
								<button
									type="button"
									onclick={() => viewUserProfile(mutual)}
									class="flex items-center space-x-3 min-w-0 text-left hover:opacity-85 transition-opacity group cursor-pointer flex-grow"
									title="View @{mutual.username}'s Profile"
								>
									<div class="w-10 h-10 rounded-full bg-gradient-to-tr from-pink-400 to-rose-500 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 overflow-hidden group-hover:scale-105 transition-transform shadow-xs">
										{#if mutual.avatar_url}
											<img src={mutual.avatar_url} alt={mutual.username} class="w-full h-full object-cover" />
										{:else}
											{mutual.username?.charAt(0).toUpperCase()}
										{/if}
									</div>
									<div class="min-w-0 flex-grow pr-1">
										<p class="text-xs sm:text-sm font-bold text-rose-950 truncate group-hover:underline">@{mutual.username}</p>
										<p class="text-[11px] text-rose-600 truncate">{mutual.email}</p>
									</div>
								</button>
								<button
									onclick={() => viewUserProfile(mutual)}
									class="px-3 py-1.5 bg-white border border-rose-300 text-rose-600 hover:bg-rose-50 text-xs font-semibold rounded-xl transition-all shadow-2xs cursor-pointer flex items-center space-x-1 flex-shrink-0"
									title="View Profile"
								>
									<span>Profile</span>
								</button>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Tab 1: Friends Showcase List (Right column on Desktop when mutual friends exist, full width otherwise) -->
			{#if activeTab === 'friends' || !profileData.is_self}
				<div class="bg-white/80 backdrop-blur-md rounded-2xl border-2 border-pink-200 shadow-xs p-5 sm:p-6 space-y-4 flex flex-col h-full">
					<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-pink-100">
						<div>
							<h3 class="text-base font-bold text-pink-950">
								{profileData.is_self ? 'My Friends' : `@${profileData.user.username}'s Friends`}
							</h3>
							<p class="text-xs text-pink-600">
								{profileData.total_friends} total connection{profileData.total_friends === 1 ? '' : 's'}
							</p>
						</div>

						<!-- Search Friends Input -->
						<div class="relative w-full {!profileData.is_self && profileData.mutual_friends?.length > 0 ? 'sm:w-48 lg:w-52' : 'sm:w-64'}">
							<input
								type="text"
								bind:value={friendsSearch}
								placeholder="Search friends..."
								class="w-full pl-9 pr-3 py-1.5 bg-pink-50/80 border border-pink-300 rounded-xl text-xs font-medium text-pink-900 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:bg-white transition-all"
							/>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-pink-400 absolute left-2.5 top-2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
							</svg>
						</div>
					</div>

					<!-- Friends Grid: 1 column per row when side-by-side on desktop so cards never get squeezed -->
					{#if filteredFriends.length === 0}
						<div class="text-center py-12 border-2 border-dashed border-pink-200 rounded-xl">
							<div class="w-12 h-12 mx-auto mb-2 rounded-full bg-pink-100 flex items-center justify-center text-pink-400">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
									<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
								</svg>
							</div>
							<p class="text-xs font-semibold text-pink-600">
								{friendsSearch ? 'No friends matched your search.' : 'No friends yet.'}
							</p>
						</div>
					{:else}
						<div class="grid {!profileData.is_self && profileData.mutual_friends?.length > 0 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'} gap-2.5 overflow-y-auto max-h-[480px]">
							{#each filteredFriends as friend}
								<div class="bg-white/90 border border-pink-200 hover:border-pink-300 rounded-2xl p-3 sm:p-3.5 flex items-center justify-between gap-2 shadow-xs hover:shadow-md transition-all">
									<button
										type="button"
										onclick={() => viewUserProfile(friend)}
										class="flex items-center space-x-3 min-w-0 text-left hover:opacity-85 transition-opacity group cursor-pointer flex-grow"
										title="View @{friend.username}'s Profile"
									>
										<div class="relative flex-shrink-0">
											<div class="w-10 h-10 rounded-full bg-gradient-to-tr from-pink-400 to-rose-500 text-white flex items-center justify-center font-bold text-sm shadow-xs overflow-hidden group-hover:scale-105 transition-transform">
												{#if friend.avatar_url}
													<img src={friend.avatar_url} alt={friend.username} class="w-full h-full object-cover" />
												{:else}
													{friend.username?.charAt(0).toUpperCase()}
												{/if}
											</div>
											<span class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white {formatLastActive(friend.last_activity) === 'Active now' ? 'bg-emerald-500' : 'bg-pink-300'}"></span>
										</div>

										<div class="min-w-0 flex-grow pr-1">
											<p class="text-xs sm:text-sm font-bold text-pink-950 group-hover:text-pink-600 truncate block text-left transition-colors group-hover:underline">
												@{friend.username}
											</p>
											<p class="text-[11px] text-pink-500 truncate">{formatLastActive(friend.last_activity)}</p>
										</div>
									</button>

									<div class="flex items-center space-x-1.5 flex-shrink-0">
										<!-- Profile button -->
										<button
											onclick={() => viewUserProfile(friend)}
											class="px-2.5 py-1.5 bg-white border border-pink-300 text-pink-600 hover:bg-pink-100 rounded-xl text-xs font-semibold transition-all shadow-2xs cursor-pointer"
											title="View Profile"
										>
											Profile
										</button>

										<!-- Chat button -->
										<button
											onclick={() => openChatWithUser(friend)}
											class="p-2 text-pink-600 hover:text-pink-800 hover:bg-pink-100 rounded-xl transition-all"
											title="Chat"
											aria-label="Chat with friend"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
												<path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-.818-.818 5.969 5.969 0 011.057-3.035C4.646 15.657 4 13.916 4 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
											</svg>
										</button>

										<!-- Unfriend button (only on own profile) -->
										{#if profileData.is_self}
											<button
												onclick={() => promptRemoveFriend(friend)}
												class="p-2 text-pink-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
												title="Unfriend"
												aria-label="Unfriend"
											>
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
													<path stroke-linecap="round" stroke-linejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.765z" />
												</svg>
											</button>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

		</div>

			<!-- Tab 2: Account Settings (Own profile only) -->
			{#if profileData.is_self && activeTab === 'settings'}
				<div class="bg-white/80 backdrop-blur-md rounded-2xl border-2 border-pink-200 shadow-xs p-5 sm:p-6 space-y-5 animate-fade-in">
					<div>
						<h3 class="text-base font-bold text-pink-950">Account Settings</h3>
						<p class="text-xs text-pink-600">Update your username, email, and password</p>
					</div>

					<form onsubmit={(e) => { e.preventDefault(); handleSaveProfile(); }} class="space-y-4 max-w-xl">
						<div>
							<label class="block text-xs font-bold text-pink-700 mb-1">Username</label>
							<input
								type="text"
								bind:value={editUsername}
								class="w-full px-3.5 py-2 bg-pink-50/70 border-2 border-pink-200 rounded-xl text-xs sm:text-sm font-semibold text-pink-950 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:bg-white transition-all"
								placeholder="Your username"
								required
							/>
						</div>

						<div>
							<label class="block text-xs font-bold text-pink-700 mb-1">Email Address</label>
							<input
								type="email"
								bind:value={editEmail}
								class="w-full px-3.5 py-2 bg-pink-50/70 border-2 border-pink-200 rounded-xl text-xs sm:text-sm font-semibold text-pink-950 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:bg-white transition-all"
								placeholder="Your email address"
								required
							/>
						</div>

						<div class="pt-3 border-t border-pink-100 space-y-3">
							<h4 class="text-xs font-bold text-pink-800">Change Password (Leave blank to keep current)</h4>

							<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
								<div>
									<label class="block text-[11px] font-semibold text-pink-600 mb-1">New Password</label>
									<input
										type="password"
										bind:value={editNewPassword}
										placeholder="At least 6 characters"
										class="w-full px-3 py-2 bg-pink-50/70 border-2 border-pink-200 rounded-xl text-xs sm:text-sm font-medium text-pink-950 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:bg-white transition-all"
									/>
								</div>

								<div>
									<label class="block text-[11px] font-semibold text-pink-600 mb-1">Confirm New Password</label>
									<input
										type="password"
										bind:value={editConfirmPassword}
										placeholder="Re-type new password"
										class="w-full px-3 py-2 bg-pink-50/70 border-2 border-pink-200 rounded-xl text-xs sm:text-sm font-medium text-pink-950 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:bg-white transition-all"
									/>
								</div>
							</div>
						</div>

						<div class="pt-3 flex items-center justify-between gap-3">
							<button
								type="submit"
								disabled={isSaving}
								class="px-6 py-2.5 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md transition-all flex items-center space-x-2 active:scale-95 disabled:opacity-50"
							>
								{#if isSaving}
									<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
									<span>Saving...</span>
								{:else}
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
										<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
									</svg>
									<span>Save Changes</span>
								{/if}
							</button>

							<button
								type="button"
								onclick={() => showLogoutModal = true}
								class="px-4 py-2 text-rose-600 hover:text-rose-800 hover:bg-rose-50 text-xs sm:text-sm font-bold rounded-xl transition-all"
							>
								Logout Account
							</button>
						</div>
					</form>
				</div>
			{/if}
		{/if}
	</main>

	<!-- Unfriend Confirmation Modal -->
	{#if showUnfriendModal && unfriendTarget}
		<div
			class="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in"
			onclick={(e) => { if (e.target === e.currentTarget) { showUnfriendModal = false; unfriendTarget = null; } }}
		>
			<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center animate-modal-content relative overflow-hidden">
				<div class="w-14 h-14 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-3 shadow-xs">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-7 h-7">
						<path stroke-linecap="round" stroke-linejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.765z" />
					</svg>
				</div>
				<h3 class="text-base sm:text-lg font-black text-pink-950 mb-1.5">Unfriend @{unfriendTarget.username}?</h3>
				<p class="text-xs text-pink-600 mb-6 font-medium leading-relaxed">
					Are you sure you want to remove <strong class="text-pink-700">@{unfriendTarget.username}</strong> from your friends list?
				</p>

				<div class="flex items-center space-x-3">
					<button
						type="button"
						onclick={() => { showUnfriendModal = false; unfriendTarget = null; }}
						class="w-1/2 py-2.5 bg-pink-100 text-pink-700 hover:bg-pink-200 rounded-xl font-bold text-xs sm:text-sm transition-all"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={confirmRemoveFriend}
						disabled={isUnfriending}
						class="w-1/2 py-2.5 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white rounded-xl font-bold text-xs sm:text-sm transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-1"
					>
						{#if isUnfriending}
							<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
							<span>Removing...</span>
						{:else}
							<span>Unfriend</span>
						{/if}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Logout Confirmation Modal -->
	{#if showLogoutModal}
		<div
			class="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in"
			onclick={(e) => { if (e.target === e.currentTarget) showLogoutModal = false; }}
		>
			<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center animate-modal-content relative overflow-hidden">
				<div class="w-14 h-14 bg-pink-100 text-pink-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-xs">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-7 h-7">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
					</svg>
				</div>
				<h3 class="text-base sm:text-lg font-black text-pink-950 mb-1.5">Log Out of ChronoMuse?</h3>
				<p class="text-xs text-pink-600 mb-6 font-medium leading-relaxed">
					Are you sure you want to log out of your account?
				</p>

				<div class="flex items-center space-x-3">
					<button
						type="button"
						onclick={() => showLogoutModal = false}
						class="w-1/2 py-2.5 bg-pink-100 text-pink-700 hover:bg-pink-200 rounded-xl font-bold text-xs sm:text-sm transition-all"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={handleLogout}
						class="w-1/2 py-2.5 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white rounded-xl font-bold text-xs sm:text-sm transition-all shadow-md active:scale-95"
					>
						Log Out
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Toast Notification Banner -->
	{#if showToast}
		<div class="fixed bottom-5 right-5 z-50 animate-bounce">
			<div class="px-4 py-3 rounded-2xl shadow-xl border-2 flex items-center space-x-2.5 {toastType === 'error' ? 'bg-rose-500 border-rose-600 text-white' : 'bg-emerald-600 border-emerald-700 text-white'}">
				{#if toastType === 'error'}
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 flex-shrink-0">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
					</svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 flex-shrink-0">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
				{/if}
				<span class="text-xs sm:text-sm font-bold">{toastMessage}</span>
			</div>
		</div>
	{/if}

	<!-- Footer (Same as Dashboard & Mood Graph) -->
	<footer class="bg-white/85 backdrop-blur-md border-t-2 border-pink-300 animate-fade-in mt-auto" style="animation-delay: 0.4s">
		<div class="container mx-auto px-2 sm:px-4 py-2.5 sm:py-3 text-center flex items-center justify-center">
			<p class="text-[10px] sm:text-xs text-pink-700 whitespace-nowrap font-medium tracking-tight sm:tracking-normal">
				© 2026 CHRONOMUSE. All rights reserved. Developed by Merlye Deyto
			</p>
		</div>
	</footer>
</div>
