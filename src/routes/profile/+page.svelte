<script>
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { supabase } from '$lib/supabaseClient';
	import { broadcastFriendEvent } from '$lib/realtimeBroadcast.js';
	import { isSoundEnabled, setSoundEnabled, playClickSound } from '$lib/soundEffects.js';
	import Sidebar from '$lib/Sidebar.svelte';
	import EditProfileModal from '$lib/EditProfileModal.svelte';

	let currentUser = $state(typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('chronomuse_user') || 'null') : null);
	let targetUserId = $state(null);
	let profileData = $state(/** @type {any} */ (null));
	let isLoading = $state(false);
	let isSaving = $state(false);
	let isUploadingAvatar = $state(false);
	let sidebarOpen = $state(false);
	let activeTab = $state('about'); // 'about' | 'friends' | 'mutual' | 'mood'
	let friendsSearch = $state('');

	// Blocked Users State
	let blockedUsers = $state(/** @type {any[]} */ ([]));
	let showBlockModal = $state(false);
	let blockTarget = $state(/** @type {any} */ (null));
	let isBlocking = $state(false);
	let blockSearchUsername = $state('');

	// Confirmation Modal states
	let showUnfriendModal = $state(false);
	let unfriendTarget = $state(/** @type {any} */ (null));
	let isUnfriending = $state(false);
	let showLogoutModal = $state(false);

	// Note / Thought Bubble State
	let showNoteModal = $state(false);
	let noteInputText = $state('');
	let userNote = $state('');

	function openNoteModal() {
		playClickSound();
		noteInputText = userNote || '';
		showNoteModal = true;
	}

	function saveUserNote() {
		playClickSound();
		const effectiveId = targetUserId || currentUser?.id;
		if (!effectiveId) return;
		const trimmed = noteInputText.trim();
		userNote = trimmed;
		if (typeof window !== 'undefined') {
			if (trimmed) {
				localStorage.setItem(`chronomuse_note_${effectiveId}`, trimmed);
			} else {
				localStorage.removeItem(`chronomuse_note_${effectiveId}`);
			}
		}
		showNoteModal = false;
		showNotification(trimmed ? 'Note updated!' : 'Note removed', 'success');
	}

	function deleteUserNote() {
		playClickSound();
		const effectiveId = targetUserId || currentUser?.id;
		if (!effectiveId) return;
		userNote = '';
		noteInputText = '';
		if (typeof window !== 'undefined') {
			localStorage.removeItem(`chronomuse_note_${effectiveId}`);
		}
		showNoteModal = false;
		showNotification('Note removed', 'success');
	}

	let avatarInput = /** @type {any} */ (null);
	let coverInput = /** @type {any} */ (null);
	let isUploadingCover = $state(false);

	function triggerCoverUpload() {
		if (coverInput) {
			coverInput.click();
		}
	}

	async function handleCoverChange(/** @type {any} */ e) {
		const file = e.target.files?.[0];
		if (!file) return;

		if (!file.type.startsWith('image/')) {
			showNotification('Please select a valid image file', 'error');
			return;
		}

		isUploadingCover = true;
		playClickSound();

		try {
			const reader = new FileReader();
			reader.onload = (readerEvent) => {
				const coverUrl = readerEvent.target?.result;
				if (coverUrl && profileData?.user) {
					profileData.user.cover_url = coverUrl;
					if (typeof window !== 'undefined' && currentUser?.id) {
						localStorage.setItem(`chronomuse_cover_${currentUser.id}`, coverUrl.toString());
					}
				}
			};
			reader.readAsDataURL(file);

			const fileExt = file.name.split('.').pop();
			const filePath = `covers/${currentUser.id}_${Date.now()}.${fileExt}`;

			const { error: uploadError } = await supabase.storage
				.from('avatars')
				.upload(filePath, file, { upsert: true });

			if (!uploadError) {
				const { data } = supabase.storage
					.from('avatars')
					.getPublicUrl(filePath);

				if (data?.publicUrl && profileData?.user) {
					profileData.user.cover_url = data.publicUrl;
					if (typeof window !== 'undefined' && currentUser?.id) {
						localStorage.setItem(`chronomuse_cover_${currentUser.id}`, data.publicUrl);
					}
				}
			}
			showNotification('Cover photo updated successfully!');
		} catch (err) {
			console.error('Error uploading cover photo:', err);
		} finally {
			isUploadingCover = false;
		}
	}

	// Mood Summary State for Self-Profile
	let moodSummary = $state({
		happy: 0,
		excited: 0,
		grateful: 0,
		calm: 0,
		love: 0,
		neutral: 0,
		sad: 0,
		anxious: 0,
		lonely: 0,
		angry: 0
	});
	let totalMoodLogs = $state(0);
	let dominantMood = $state('Happy');
	let isLoadingMoods = $state(false);

	// Toast state
	let toastMessage = $state('');
	let showToast = $state(false);
	let toastType = $state('success');

	// About You & Edit Profile Info State
	let showEditProfileModal = $state(false);
	let editBio = $state('');
	let editBirthday = $state('');
	let editRelationshipStatus = $state('Single');
	let editGender = $state('Prefer not to say');
	let isSavingAboutInfo = $state(false);

	function openEditProfileModal() {
		playClickSound();
		const userObj = profileData?.user || currentUser || {};
		const cachedAbout = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem(`chronomuse_about_${currentUser?.id}`) || '{}') : {};
		editBio = userObj.bio || cachedAbout.bio || currentUser?.bio || '';
		editBirthday = userObj.birthday || cachedAbout.birthday || currentUser?.birthday || '';
		editRelationshipStatus = userObj.relationship_status || cachedAbout.relationship_status || currentUser?.relationship_status || 'Single';
		editGender = userObj.gender || cachedAbout.gender || currentUser?.gender || 'Prefer not to say';
		showEditProfileModal = true;
	}

	async function handleSaveAboutProfile() {
		if (!currentUser?.id) return;
		playClickSound();
		isSavingAboutInfo = true;

		const updatedAboutData = {
			bio: editBio.trim(),
			birthday: editBirthday.trim(),
			relationship_status: editRelationshipStatus,
			gender: editGender
		};

		try {
			await fetch(API_ENDPOINTS.updateProfile, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: currentUser.id,
					...updatedAboutData
				})
			});
		} catch (err) {
			console.error('Error updating profile info:', err);
		} finally {
			try {
				localStorage.setItem(`chronomuse_about_${currentUser.id}`, JSON.stringify(updatedAboutData));
			} catch (e) {}

			const updatedStored = { ...currentUser, ...updatedAboutData };
			try {
				localStorage.setItem('chronomuse_user', JSON.stringify(updatedStored));
			} catch (e) {}
			currentUser = updatedStored;

			if (profileData && profileData.user) {
				profileData.user = { ...profileData.user, ...updatedAboutData };
			}

			showNotification('Profile info updated successfully!');
			showEditProfileModal = false;
			isSavingAboutInfo = false;
		}
	}

	function formatBirthday(/** @type {string} */ dateStr) {
		if (!dateStr) return '';
		try {
			const d = new Date(dateStr);
			if (isNaN(d.getTime())) return dateStr;
			return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		} catch (e) {
			return dateStr;
		}
	}

	function showNotification(/** @type {string} */ msg, type = 'success') {
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

	function loadBlockedUsers() {
		if (typeof window === 'undefined' || !currentUser?.id) return;
		try {
			const stored = localStorage.getItem(`chronomuse_blocked_${currentUser.id}`);
			blockedUsers = stored ? JSON.parse(stored) : [];
		} catch (e) {
			blockedUsers = [];
		}
	}

	function saveBlockedUsers(/** @type {any[]} */ list) {
		if (typeof window === 'undefined' || !currentUser?.id) return;
		try {
			localStorage.setItem(`chronomuse_blocked_${currentUser.id}`, JSON.stringify(list));
			blockedUsers = list;
		} catch (e) {}
	}

	function promptBlockUser(/** @type {any} */ userToBlock) {
		blockTarget = userToBlock;
		showBlockModal = true;
	}

	async function confirmBlockUser() {
		if (!blockTarget || !currentUser || isBlocking) return;
		isBlocking = true;
		const targetId = blockTarget.friend_id || blockTarget.id;
		const targetUsername = blockTarget.username || 'User';

		try {
			if (profileData && profileData.is_friend) {
				await fetch(API_ENDPOINTS.removeFriend, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ user_id: currentUser.id, friend_id: targetId })
				});
				broadcastFriendEvent(currentUser.id, targetId, 'unfriend');
			}

			const exists = blockedUsers.some(b => String(b.id) === String(targetId));
			if (!exists) {
				const updated = [
					...blockedUsers,
					{
						id: targetId,
						username: targetUsername,
						email: blockTarget.email || '',
						avatar_url: blockTarget.avatar_url || null,
						blocked_at: new Date().toISOString()
					}
				];
				saveBlockedUsers(updated);
			}

			showNotification(`Blocked @${targetUsername}`, 'success');
			if (profileData && String(profileData.user?.id) === String(targetId)) {
				profileData.is_friend = false;
				profileData.has_pending_request = false;
			}

			showBlockModal = false;
			blockTarget = null;
		} catch (e) {
			showNotification('Failed to block user', 'error');
		} finally {
			isBlocking = false;
		}
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

	async function fetchUserMoodSummary() {
		if (typeof window === 'undefined' || !currentUser?.id) return;
		isLoadingMoods = true;
		try {
			const res = await fetch(`${API_ENDPOINTS.getMoodData}?user_id=${currentUser.id}&period=all`);
			const data = await res.json();
			const moods = data.success && data.data ? data.data : [];

			const stats = /** @type {Record<string, number>} */ ({ happy: 0, excited: 0, grateful: 0, calm: 0, love: 0, neutral: 0, sad: 0, anxious: 0, lonely: 0, angry: 0 });
			let total = 0;

			moods.forEach((/** @type {any} */ m) => {
				const tag = (m.mood_tag || 'happy').toLowerCase();
				if (stats[tag] !== undefined) {
					stats[tag]++;
				} else {
					stats.neutral++;
				}
				total++;
			});

			moodSummary = stats;
			totalMoodLogs = total;

			let maxCount = -1;
			let topTag = 'Happy';
			Object.entries(stats).forEach(([tag, count]) => {
				if (count > maxCount) {
					maxCount = count;
					topTag = tag.charAt(0).toUpperCase() + tag.slice(1);
				}
			});
			dominantMood = topTag;
		} catch (e) {
			console.error('Error fetching mood summary:', e);
		} finally {
			isLoadingMoods = false;
		}
	}

	let fetchAbortController = /** @type {any} */ (null);
	const profileCache = new Map();

	async function loadProfile(/** @type {any} */ targetId = null, isSilent = false) {
		if (fetchAbortController) {
			fetchAbortController.abort();
		}
		fetchAbortController = new AbortController();

		const stored = typeof window !== 'undefined' ? localStorage.getItem('chronomuse_user') : null;
		if (!stored) {
			goto('/');
			return;
		}
		currentUser = JSON.parse(stored);
		loadBlockedUsers();

		const urlParamId = $page.url.searchParams.get('id') || $page.url.searchParams.get('user_id');
		const effectiveTargetId = targetId || urlParamId || currentUser.id;
		targetUserId = effectiveTargetId;
		const targetKey = String(effectiveTargetId);

		if (profileCache.has(targetKey)) {
			profileData = profileCache.get(targetKey);
			isLoading = false;
		} else if (!isSilent) {
			isLoading = true;
			profileData = null;
		}

		try {
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
				const cachedAbout = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem(`chronomuse_about_${effectiveTargetId}`) || '{}') : {};
				const savedCover = typeof window !== 'undefined' ? (localStorage.getItem(`chronomuse_cover_${effectiveTargetId}`) || null) : null;
				const mergedUser = {
					...data.data.user,
					cover_url: savedCover || data.data.user.cover_url || null,
					bio: data.data.user.bio || cachedAbout.bio || null,
					birthday: data.data.user.birthday || cachedAbout.birthday || null,
					relationship_status: data.data.user.relationship_status || cachedAbout.relationship_status || null,
					gender: data.data.user.gender || cachedAbout.gender || null
				};
				profileData = { ...data.data, user: mergedUser };
				userNote = typeof window !== 'undefined' ? (localStorage.getItem(`chronomuse_note_${effectiveTargetId}`) || '') : '';
				profileCache.set(targetKey, profileData);

				if (profileData.is_self) {
					fetchUserMoodSummary();
				}
			} else if (!isSilent) {
				showNotification(data.error || 'Failed to load profile', 'error');
			}
		} catch (err) {
			if (/** @type {any} */ (err)?.name === 'AbortError') return;
			console.error('Error loading profile:', err);
			if (!isSilent && !profileCache.has(targetKey)) {
				showNotification('Failed to load profile data', 'error');
			}
		} finally {
			isLoading = false;
		}
	}

	function triggerAvatarUpload() {
		if (avatarInput) {
			avatarInput.click();
		}
	}

	async function handleAvatarChange(/** @type {any} */ e) {
		const file = e.target.files?.[0];
		if (!file) return;

		if (!file.type.startsWith('image/')) {
			showNotification('Please select a valid image file', 'error');
			return;
		}

		isUploadingAvatar = true;
		playClickSound();

		try {
			const fileExt = file.name.split('.').pop();
			const filePath = `avatars/${currentUser.id}_${Date.now()}.${fileExt}`;

			const { error: uploadError } = await supabase.storage
				.from('avatars')
				.upload(filePath, file, { upsert: true });

			if (uploadError) {
				throw uploadError;
			}

			const { data } = supabase.storage
				.from('avatars')
				.getPublicUrl(filePath);

			const avatarUrl = data.publicUrl;

			const updateRes = await fetch(API_ENDPOINTS.updateProfile, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: currentUser.id,
					avatar_url: avatarUrl
				})
			});

			const updateData = await updateRes.json();

			if (updateData.success && updateData.user) {
				const updatedStoredUser = { ...currentUser, ...updateData.user };
				localStorage.setItem('chronomuse_user', JSON.stringify(updatedStoredUser));
				currentUser = updatedStoredUser;

				if (profileData && profileData.user) {
					profileData.user.avatar_url = avatarUrl;
				}

				if (typeof window !== 'undefined') {
					window.dispatchEvent(new Event('chronomuse_auth_change'));
				}

				showNotification('Profile avatar updated successfully!');
			} else {
				showNotification(updateData.error || 'Failed to update avatar', 'error');
			}
		} catch (err) {
			console.error('Error uploading avatar:', err);
			showNotification('Failed to upload profile picture', 'error');
		} finally {
			isUploadingAvatar = false;
		}
	}

	function promptRemoveFriend(/** @type {any} */ targetFriend) {
		unfriendTarget = targetFriend;
		showUnfriendModal = true;
	}

	async function confirmRemoveFriend() {
		if (!unfriendTarget || !currentUser || isUnfriending) return;

		isUnfriending = true;
		playClickSound();

		const friendId = unfriendTarget.friend_id || unfriendTarget.id;

		try {
			const res = await fetch(API_ENDPOINTS.removeFriend, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: currentUser.id,
					friend_id: friendId
				})
			});

			const data = await res.json();
			if (data.success) {
				showNotification(`Unfriended @${unfriendTarget.username}`);
				broadcastFriendEvent(currentUser.id, friendId, 'unfriend');

				if (profileData) {
					if (profileData.is_self) {
						profileData.friends = profileData.friends.filter((f) => (f.friend_id || f.id) !== friendId);
						profileData.total_friends = Math.max(0, profileData.total_friends - 1);
					} else if (profileData.user.id === friendId) {
						profileData.is_friend = false;
					}
				}

				showUnfriendModal = false;
				unfriendTarget = null;
			} else {
				showNotification(data.error || 'Failed to remove friend', 'error');
			}
		} catch (err) {
			console.error('Error removing friend:', err);
			showNotification('Error removing friend', 'error');
		} finally {
			isUnfriending = false;
		}
	}

	async function sendFriendRequestToTargetUser() {
		if (!profileData || profileData.is_self || isSaving) return;
		isSaving = true;
		playClickSound();

		try {
			const res = await fetch(API_ENDPOINTS.sendFriendRequest, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sender_id: currentUser.id,
					receiver_id: profileData.user.id
				})
			});

			const data = await res.json();
			if (data.success) {
				profileData.has_pending_request = true;
				profileData.pending_request_sender_id = currentUser.id;
				showNotification('Friend request sent!');
				broadcastFriendEvent(currentUser.id, profileData.user.id, 'request_sent');
			} else {
				showNotification(data.error || 'Failed to send request', 'error');
			}
		} catch (err) {
			showNotification('Error sending friend request', 'error');
		} finally {
			isSaving = false;
		}
	}

	async function cancelFriendRequestOnProfile() {
		if (!profileData || !profileData.has_pending_request || isSaving) return;
		isSaving = true;
		playClickSound();

		try {
			const res = await fetch(API_ENDPOINTS.cancelFriendRequest, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sender_id: currentUser.id,
					receiver_id: profileData.user.id
				})
			});

			const data = await res.json();
			if (data.success) {
				profileData.has_pending_request = false;
				profileData.pending_request_sender_id = null;
				showNotification('Friend request cancelled');
				broadcastFriendEvent(currentUser.id, profileData.user.id, 'request_cancelled');
			} else {
				showNotification(data.error || 'Failed to cancel request', 'error');
			}
		} catch (err) {
			showNotification('Error cancelling request', 'error');
		} finally {
			isSaving = false;
		}
	}

	function openChatWithUser(/** @type {any} */ targetUser) {
		playClickSound();
		const targetId = targetUser.friend_id || targetUser.id;
		goto(`/chat?user_id=${targetId}`);
	}

	function viewUserProfile(/** @type {any} */ targetUser) {
		playClickSound();
		const targetId = targetUser.friend_id || targetUser.id;
		goto(`/profile?id=${targetId}`);
	}

	function formatDate(/** @type {string} */ dateStr) {
		if (!dateStr) return '';
		const d = new Date(dateStr);
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function formatLastActive(/** @type {string} */ lastActive) {
		if (!lastActive) return 'Offline';
		const diffMs = Date.now() - new Date(lastActive).getTime();
		const diffMins = Math.floor(diffMs / 60000);
		if (diffMins < 5) return 'Active now';
		if (diffMins < 60) return `${diffMins}m ago`;
		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `${diffHours}h ago`;
		const diffDays = Math.floor(diffHours / 24);
		return `${diffDays}d ago`;
	}

	let unsubscribePage = $state(/** @type {any} */ (null));
	let realtimeChannel = $state(/** @type {any} */ (null));

	onMount(() => {
		loadProfile();

		unsubscribePage = page.subscribe(($p) => {
			const newId = $p.url.searchParams.get('id') || $p.url.searchParams.get('user_id');
			if (newId && String(newId) !== String(targetUserId)) {
				loadProfile(newId);
			}
		});

		try {
			realtimeChannel = supabase
				.channel('public:profile_updates')
				.on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, () => {
					loadProfile(targetUserId, true);
				})
				.on('postgres_changes', { event: '*', schema: 'public', table: 'friends' }, () => {
					loadProfile(targetUserId, true);
				})
				.subscribe();
		} catch (e) {}
	});

	onDestroy(() => {
		if (unsubscribePage) unsubscribePage();
		if (realtimeChannel) {
			try {
				supabase.removeChannel(realtimeChannel);
			} catch (e) {}
		}
	});

	let filteredFriends = $derived(
		(profileData?.friends || []).filter((f) =>
			(f.username || '').toLowerCase().includes((friendsSearch || '').toLowerCase())
		)
	);

	function getMoodColorClass(moodTag) {
		switch ((moodTag || '').toLowerCase()) {
			case 'happy': return 'bg-amber-100 text-amber-800 border-amber-300';
			case 'excited': return 'bg-orange-100 text-orange-800 border-orange-300';
			case 'grateful': return 'bg-emerald-100 text-emerald-800 border-emerald-300';
			case 'calm': return 'bg-cyan-100 text-cyan-800 border-cyan-300';
			case 'love': return 'bg-rose-100 text-rose-800 border-rose-300';
			case 'sad': return 'bg-indigo-100 text-indigo-800 border-indigo-300';
			case 'anxious': return 'bg-purple-100 text-purple-800 border-purple-300';
			case 'lonely': return 'bg-violet-100 text-violet-800 border-violet-300';
			case 'angry': return 'bg-red-100 text-red-800 border-red-300';
			default: return 'bg-slate-100 text-slate-800 border-slate-300';
		}
	}

	function getMoodEmoji(moodTag) {
		switch ((moodTag || '').toLowerCase()) {
			case 'happy': return '😊';
			case 'excited': return '🤩';
			case 'grateful': return '🙏';
			case 'calm': return '🌿';
			case 'love': return '💖';
			case 'sad': return '🥺';
			case 'anxious': return '😰';
			case 'lonely': return '🌧️';
			case 'angry': return '🔥';
			default: return '✨';
		}
	}

	function getSystemFeedbackMessage(moodTag) {
		switch ((moodTag || '').toLowerCase()) {
			case 'happy':
				return "You've been radiating joy and positivity! Keep sharing your warmth and celebrating life's wonderful moments.";
			case 'excited':
				return "Your energy and passion are inspiring! Harness this high enthusiasm to accomplish great things today.";
			case 'grateful':
				return "A thankful heart brings profound peace. Cherishing small joys illuminates even the cloudiest days.";
			case 'calm':
				return "You are in a peaceful, balanced state of mind. Breathe deeply and embrace this soothing serenity.";
			case 'love':
				return "Your heart is open and full of affection. Nurture these special connections with those around you.";
			case 'sad':
				return "It's completely natural to feel down at times. Be gentle with yourself—brighter, warmer days are ahead.";
			case 'anxious':
				return "Take a slow, deep breath. You are safe, grounded, and far stronger than whatever is weighing on your mind.";
			case 'lonely':
				return "You are never truly alone. Reach out to someone you care about or write down your feelings—ChronoMuse is here with you.";
			case 'angry':
				return "Your feelings are valid, but remember to give yourself space. A quiet walk or calming music can help restore your peace.";
			default:
				return "You're keeping a steady, mindful rhythm. Take a moment to reflect and appreciate where you are right now.";
		}
	}
</script>

<svelte:head>
	<title>{profileData ? `@${profileData.user.username}'s Profile` : 'User Profile'} - ChronoMuse</title>
</svelte:head>

<div class="flex flex-col min-h-screen bg-gradient-to-br from-pink-100 via-pink-200 to-pink-300 animate-fade-in font-sans">
	<!-- Top Navigation Bar -->
	<nav class="bg-white/85 backdrop-blur-md border-b-2 border-pink-300 shadow-lg sticky top-0 z-50 animate-slide-down">
		<div class="container mx-auto px-4 py-3 flex items-center justify-between">
			<div class="flex items-center space-x-3 min-w-0">
				<!-- Hamburger Menu Button -->
				<button
					onclick={toggleSidebar}
					class="p-1.5 sm:p-2 text-pink-500 hover:bg-pink-100 rounded-lg transition-colors flex-shrink-0 active:scale-95 cursor-pointer"
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
				
				<div class="flex items-center space-x-2.5 cursor-pointer" onclick={() => goto('/dashboard')}>
					<img src="/logo.png" alt="ChronoMuse" class="w-9 h-9 sm:w-10 sm:h-10 rounded-md object-contain flex-shrink-0" />
					<span class="text-base sm:text-lg font-bold text-pink-500 truncate">ChronoMuse</span>
				</div>
			</div>

			<div class="flex items-center space-x-2 sm:space-x-4 flex-shrink-0 ml-2">
				<button
					onclick={() => goto('/profile')}
					class="hidden md:block text-pink-700 hover:text-pink-900 transition-colors font-medium cursor-pointer text-left active:scale-95"
					title="View Profile"
				>
					<span class="text-sm">Welcome, <strong>{currentUser?.username}</strong></span>
				</button>
				<!-- Soft Pink Glassmorphic Gear Settings Icon Button -->
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

	<!-- Sidebar Component -->
	<Sidebar bind:isOpen={sidebarOpen} on:logout={handleLogout} />

	<!-- Main Profile Container -->
	<main class="flex-grow container mx-auto px-4 py-6 sm:py-8 max-w-3xl space-y-6">
		{#if !profileData}
			{#if isLoading}
				<div class="flex flex-col items-center justify-center py-24 space-y-3">
					<div class="w-10 h-10 border-4 border-pink-400 border-t-transparent rounded-full animate-spin"></div>
					<p class="text-sm font-semibold text-pink-600 animate-pulse">Loading profile...</p>
				</div>
			{:else}
				<div class="flex flex-col items-center justify-center py-24 space-y-3">
					<p class="text-sm font-semibold text-pink-600">Profile not found.</p>
				</div>
			{/if}
		{:else}
			<!-- Hero Profile Header Card -->
			<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-xl overflow-hidden animate-fade-in-up relative">
				<!-- Cover Banner Background -->
				<div class="relative h-44 sm:h-56 md:h-64 w-full bg-gradient-to-r from-pink-400 via-rose-400 to-pink-500 overflow-hidden group">
					<!-- Soft ambient glows & patterns inside banner -->
					<div class="absolute -right-10 -top-10 w-48 h-48 bg-white/20 rounded-full blur-2xl pointer-events-none"></div>
					<div class="absolute -left-10 -bottom-10 w-48 h-48 bg-rose-600/20 rounded-full blur-2xl pointer-events-none"></div>

					<!-- Cover Image if present -->
					{#if profileData.user.cover_url}
						<img src={profileData.user.cover_url} alt="Cover Banner" class="w-full h-full object-cover" />
					{/if}

					<!-- Edit Cover Photo Upload Button -->
					{#if profileData.is_self}
						<input
							type="file"
							accept="image/*"
							bind:this={coverInput}
							onchange={handleCoverChange}
							class="hidden"
						/>
						<button
							type="button"
							onclick={triggerCoverUpload}
							disabled={isUploadingCover}
							class="absolute bottom-3 right-3 sm:top-3.5 sm:right-3.5 sm:bottom-auto px-3 py-1.5 bg-white/80 hover:bg-white/95 backdrop-blur-md text-pink-700 text-xs font-bold rounded-xl shadow-md transition-all active:scale-95 cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
							title="Upload Cover Photo"
						>
							{#if isUploadingCover}
								<div class="w-3.5 h-3.5 border-2 border-pink-600 border-t-transparent rounded-full animate-spin"></div>
								<span>Uploading...</span>
							{:else}
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-pink-600">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316A2.31 2.31 0 0014.71 3.75h-5.42a2.31 2.31 0 00-1.64 1.055l-.823 1.316z" />
									<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
								</svg>
								<span>Edit Cover</span>
							{/if}
						</button>
					{/if}
				</div>

				<!-- Main Profile Content Section (Overlapping Cover) -->
				<div class="px-5 sm:px-8 pb-6 pt-2 relative z-10">
					<div class="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 -mt-14 sm:-mt-20 mb-4">
						
						<!-- Left Avatar & Info Group -->
						<div class="flex flex-col sm:flex-row items-start sm:items-end gap-3 sm:gap-4 min-w-0 w-full sm:w-auto">
							
							<!-- Avatar Container + Floating Note Bubble -->
							<div class="relative flex-shrink-0 group">
								<!-- Floating Speech Bubble above Avatar ("Share a note...") -->
								{#if profileData.is_self}
									<button 
										type="button"
										class="absolute -top-11 left-1 z-20 bg-white/95 backdrop-blur-md px-3.5 py-1 rounded-2xl shadow-lg border-2 border-pink-300 text-xs font-bold text-pink-700 flex items-center space-x-1.5 cursor-pointer hover:bg-pink-100/80 hover:scale-105 active:scale-95 transition-all"
										onclick={openNoteModal}
										title="Click to add or edit status note"
									>
										<span class="max-w-[140px] sm:max-w-[180px] truncate">
											{userNote || "+ Share a note..."}
										</span>
										<!-- Speech Bubble Arrow -->
										<div class="absolute -bottom-1.5 left-5 w-3 h-3 bg-white border-r-2 border-b-2 border-pink-300 rotate-45"></div>
									</button>
								{:else}
									{#if userNote}
										<div 
											class="absolute -top-11 left-1 z-20 bg-white/95 backdrop-blur-md px-3.5 py-1 rounded-2xl shadow-lg border-2 border-pink-300 text-xs font-bold text-pink-700 flex items-center space-x-1.5"
										>
											<span class="max-w-[140px] sm:max-w-[180px] truncate">
												{userNote}
											</span>
											<div class="absolute -bottom-1.5 left-5 w-3 h-3 bg-white border-r-2 border-b-2 border-pink-300 rotate-45"></div>
										</div>
									{/if}
								{/if}

								<!-- Avatar Circle -->
								<div class="p-[3.5px] rounded-full bg-gradient-to-tr from-pink-400 via-rose-500 to-purple-600 shadow-xl">
									<div class="w-24 h-24 sm:w-32 sm:h-32 rounded-full border-4 border-white overflow-hidden bg-gradient-to-tr from-pink-400 to-rose-500 flex items-center justify-center text-white text-3xl font-extrabold relative shadow-inner">
										{#if profileData.user.avatar_url}
											<img
												src={profileData.user.avatar_url}
												alt={profileData.user.username}
												class="w-full h-full object-cover"
											/>
										{:else}
											{profileData.user.username.charAt(0).toUpperCase()}
										{/if}
									</div>
								</div>

								<!-- Avatar Camera Upload Button -->
								{#if profileData.is_self}
									<input
										type="file"
										accept="image/*"
										bind:this={avatarInput}
										onchange={handleAvatarChange}
										class="hidden"
									/>
									<button
										type="button"
										onclick={triggerAvatarUpload}
										disabled={isUploadingAvatar}
										class="absolute bottom-1 right-1 p-2 bg-pink-600 hover:bg-pink-700 text-white rounded-full border-2 border-white shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
										title="Upload Profile Picture"
									>
										{#if isUploadingAvatar}
											<div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
										{:else}
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
												<path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316A2.31 2.31 0 0014.71 3.75h-5.42a2.31 2.31 0 00-1.64 1.055l-.823 1.316z" />
												<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
											</svg>
										{/if}
									</button>
								{/if}
							</div>

							<!-- Name & Subtitle Info (Merlye Deyto / 17 friends · 33 posts) -->
							<div class="min-w-0 pt-2 sm:pt-0 sm:pb-1">
								<div class="flex items-center space-x-2 flex-wrap">
									<h2 class="text-xl sm:text-2xl font-black text-pink-950 truncate">
										{profileData.user.full_name || profileData.user.username}
									</h2>
									{#if profileData.is_self}
										<span class="px-2.5 py-0.5 bg-pink-100 text-pink-700 text-xs font-bold rounded-full border border-pink-300">
											You
										</span>
										<button
											type="button"
											onclick={openEditProfileModal}
											class="p-1.5 rounded-xl bg-pink-100 hover:bg-pink-200 border border-pink-300 text-pink-600 shadow-2xs transition-all active:scale-95 cursor-pointer flex items-center justify-center"
											title="Edit Profile Details"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
											</svg>
										</button>
									{/if}
								</div>

								<!-- Subtitle line: "X friends • Y memories" -->
								<p class="text-xs sm:text-sm text-pink-600 font-semibold mt-0.5 flex items-center space-x-1.5">
									<span>{profileData.total_friends} {profileData.total_friends === 1 ? 'friend' : 'friends'}</span>
									<span class="text-pink-400">•</span>
									<span>{profileData.total_memories || 0} {profileData.total_memories === 1 ? 'memory' : 'memories'}</span>
								</p>
							</div>

						</div>

						<!-- Right Side Action Buttons / Dropdown -->
						<div class="flex items-center gap-2 sm:mb-1 w-full sm:w-auto justify-start sm:justify-end flex-wrap">
							{#if !profileData.is_self}
								{#if profileData.has_pending_request}
									{#if String(profileData.pending_request_sender_id) === String(currentUser?.id)}
										<button
											onclick={cancelFriendRequestOnProfile}
											disabled={isSaving}
											class="px-3.5 py-2 bg-amber-50 hover:bg-red-50 text-amber-800 hover:text-red-600 border border-amber-300 hover:border-red-300 text-xs sm:text-sm font-bold rounded-xl transition-all shadow-2xs cursor-pointer disabled:opacity-50"
										>
											<span>Cancel Request</span>
										</button>
									{:else}
										<div class="px-3.5 py-2 bg-amber-50 text-amber-700 border border-amber-200 text-xs sm:text-sm font-bold rounded-xl flex items-center space-x-1 shadow-2xs">
											<span>Request Received</span>
										</div>
									{/if}
								{:else if !profileData.is_friend}
									<button
										onclick={sendFriendRequestToTargetUser}
										disabled={isSaving}
										class="px-4 py-2 bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-all flex items-center space-x-1.5 active:scale-95 disabled:opacity-50 cursor-pointer"
									>
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3.75 19.125a1.125 1.125 0 011.125-1.125h15.375c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H4.875a1.125 1.125 0 01-1.125-1.125v-2.25z" />
										</svg>
										<span>Add Friend</span>
									</button>
								{:else}
									<button
										type="button"
										onclick={() => promptRemoveFriend(profileData.user)}
										class="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 hover:border-rose-300 font-bold text-xs sm:text-sm rounded-xl shadow-2xs transition-all flex items-center space-x-1 cursor-pointer"
									>
										<span>Friends</span>
									</button>
								{/if}

								<button
									onclick={() => openChatWithUser(profileData.user)}
									class="px-4 py-2 bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-all flex items-center space-x-1.5 active:scale-95 cursor-pointer"
								>
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
										<path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-.818-.818 5.969 5.969 0 011.057-3.035C4.646 15.657 4 13.916 4 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
									</svg>
									<span>Message</span>
								</button>

								<button
									type="button"
									onclick={() => promptBlockUser(profileData.user)}
									class="p-2 sm:p-2.5 bg-rose-100 hover:bg-rose-200 text-rose-600 border border-rose-200 rounded-xl shadow-2xs transition-all active:scale-95 cursor-pointer flex items-center justify-center"
									title="Block user"
								>
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 sm:w-4.5 sm:h-4.5">
										<path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
									</svg>
								</button>
							{:else}
								<button
									type="button"
									onclick={openNoteModal}
									class="px-3.5 py-2 bg-pink-100 hover:bg-pink-200 border border-pink-300 text-pink-700 font-bold text-xs sm:text-sm rounded-xl shadow-2xs transition-all flex items-center space-x-1.5 active:scale-95 cursor-pointer"
									title="Add or Edit Status Note"
								>
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-pink-600">
										<path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-.818-.818 5.969 5.969 0 011.057-3.035C4.646 15.657 4 13.916 4 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
									</svg>
									<span>{userNote ? 'Edit Note' : 'Add Note'}</span>
								</button>
							{/if}
						</div>

					</div>

					<!-- Bottom Stat Badges Bar -->
					<div class="flex items-center justify-start flex-wrap gap-2 pt-3 border-t border-pink-100">
						<!-- Friends Count Badge -->
						<button
							onclick={() => activeTab = 'friends'}
							class="px-3.5 py-1.5 bg-gradient-to-r from-pink-500 to-pink-600 text-white rounded-full text-xs font-bold flex items-center space-x-1.5 shadow-xs cursor-pointer active:scale-95"
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-pink-100">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
							</svg>
							<span>{profileData.total_friends} Friends</span>
						</button>

						{#if !profileData.is_self}
							<button
								onclick={() => activeTab = 'mutual'}
								class="px-3.5 py-1.5 bg-pink-100 hover:bg-pink-200 border border-pink-300 rounded-full text-xs font-bold text-pink-700 flex items-center space-x-1.5 shadow-xs cursor-pointer active:scale-95"
							>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-pink-600">
									<path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a5.97 5.97 0 00-.942 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
								</svg>
								<span>{profileData.mutual_friends_count} Mutual</span>
							</button>
						{/if}

						<!-- Joined Date Badge -->
						{#if profileData.user.created_at}
							<div class="px-3 py-1.5 bg-white border border-pink-300 rounded-full text-xs font-semibold text-pink-600 flex items-center space-x-1.5">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 text-pink-500">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
								</svg>
								<span>Joined {formatDate(profileData.user.created_at)}</span>
							</div>
						{/if}

						<div class="px-3 py-1.5 bg-white border border-pink-300 rounded-full text-xs font-semibold text-pink-600 flex items-center space-x-1.5">
							<span class="w-2 h-2 rounded-full {formatLastActive(profileData.user.last_activity) === 'Active now' ? 'bg-emerald-500 animate-pulse' : 'bg-pink-300'}"></span>
							<span>{formatLastActive(profileData.user.last_activity)}</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Centered Tab Switcher Bar -->
			<div class="bg-white/90 border-2 border-pink-300 rounded-2xl p-1.5 shadow-md flex items-center justify-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar">
				<button
					onclick={() => activeTab = 'about'}
					class="flex-1 min-w-0 py-2 sm:py-2.5 px-2 sm:px-4 rounded-xl text-[11px] sm:text-sm font-bold transition-all flex items-center justify-center space-x-1.5 whitespace-nowrap cursor-pointer {activeTab === 'about' ? 'bg-gradient-to-r from-pink-500 to-pink-600 text-white shadow-sm' : 'bg-transparent text-pink-700 hover:bg-pink-100/70'}"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 flex-shrink-0">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
					</svg>
					<span class="truncate">About {profileData.is_self ? 'You' : ''}</span>
				</button>

				<button
					onclick={() => activeTab = 'friends'}
					class="flex-1 min-w-0 py-2 sm:py-2.5 px-2 sm:px-4 rounded-xl text-[11px] sm:text-sm font-bold transition-all flex items-center justify-center space-x-1.5 whitespace-nowrap cursor-pointer {activeTab === 'friends' ? 'bg-gradient-to-r from-pink-500 to-pink-600 text-white shadow-sm' : 'bg-transparent text-pink-700 hover:bg-pink-100/70'}"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 flex-shrink-0">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
					</svg>
					<span class="truncate">Friends ({profileData.total_friends})</span>
				</button>

				{#if !profileData.is_self && profileData.mutual_friends?.length > 0}
					<button
						onclick={() => activeTab = 'mutual'}
						class="flex-1 min-w-0 py-2 sm:py-2.5 px-2 sm:px-4 rounded-xl text-[11px] sm:text-sm font-bold transition-all flex items-center justify-center space-x-1.5 whitespace-nowrap cursor-pointer {activeTab === 'mutual' ? 'bg-gradient-to-r from-pink-500 to-pink-600 text-white shadow-sm' : 'bg-transparent text-pink-700 hover:bg-pink-100/70'}"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 flex-shrink-0">
							<path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a5.97 5.97 0 00-.942 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
						</svg>
						<span class="truncate">Mutual ({profileData.mutual_friends_count})</span>
					</button>
				{/if}

				{#if profileData.is_self}
					<button
						onclick={() => activeTab = 'mood'}
						class="flex-1 min-w-0 py-2 sm:py-2.5 px-2 sm:px-4 rounded-xl text-[11px] sm:text-sm font-bold transition-all flex items-center justify-center space-x-1.5 whitespace-nowrap cursor-pointer {activeTab === 'mood' ? 'bg-gradient-to-r from-pink-500 to-pink-600 text-white shadow-sm' : 'bg-transparent text-pink-700 hover:bg-pink-100/70'}"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 flex-shrink-0">
							<path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
						</svg>
						<span class="truncate">Mood Summary</span>
					</button>
				{/if}
			</div>

			<!-- TAB CONTENT SECTIONS -->

			<!-- TAB 0: ABOUT YOU / BIO SECTION CARD -->
			{#if activeTab === 'about'}
				<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-md p-5 sm:p-6 space-y-4 animate-fade-in">
					<div class="flex items-center justify-between gap-3 border-b border-pink-100 pb-3">
						<div class="flex items-center space-x-3">
							<div class="w-9 h-9 rounded-xl bg-pink-100 text-pink-600 border border-pink-200 flex items-center justify-center flex-shrink-0 shadow-2xs">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-5 h-5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
								</svg>
							</div>
							<div>
								<h3 class="text-sm sm:text-base font-black text-pink-950">
									{profileData.is_self ? 'About You' : `About @${profileData.user.username}`}
								</h3>
								<p class="text-[11px] text-pink-600 font-medium">Bio & personal information</p>
							</div>
						</div>
					</div>

					<!-- Bio Quote Block -->
					{#if profileData.user.bio}
						<div class="p-3.5 bg-gradient-to-r from-pink-50/80 via-rose-50/50 to-white border border-pink-200 rounded-xl shadow-2xs">
							<p class="text-xs sm:text-sm text-pink-950 font-medium leading-relaxed italic">
								"{profileData.user.bio}"
							</p>
						</div>
					{:else if profileData.is_self}
						<button
							type="button"
							onclick={openEditProfileModal}
							class="w-full p-4 border-2 border-dashed border-pink-300 rounded-xl bg-pink-50/30 hover:bg-pink-50 text-pink-600 text-xs font-bold text-center transition-all cursor-pointer"
						>
							+ Add your Bio & Personal Details
						</button>
					{/if}

					<!-- Vertical List Type Section -->
					<div class="divide-y divide-pink-100 rounded-2xl border-2 border-pink-200/90 bg-white overflow-hidden shadow-2xs">
						
						<!-- Row 1: Relationship Status -->
						<div class="p-3.5 sm:p-4 flex items-center justify-between hover:bg-pink-50/40 transition-colors">
							<div class="flex items-center space-x-3 min-w-0">
								<div class="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 border border-rose-200 flex items-center justify-center flex-shrink-0">
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-5 h-5">
										<path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
									</svg>
								</div>
								<div class="min-w-0">
									<p class="text-[11px] font-extrabold uppercase tracking-wider text-pink-500">Relationship Status</p>
									<p class="text-xs sm:text-sm font-bold text-pink-950 truncate">
										{profileData.user.relationship_status || 'Single'}
									</p>
								</div>
							</div>
						</div>

						<!-- Row 2: Birthday -->
						<div class="p-3.5 sm:p-4 flex items-center justify-between hover:bg-pink-50/40 transition-colors">
							<div class="flex items-center space-x-3 min-w-0">
								<div class="w-9 h-9 rounded-xl bg-pink-100 text-pink-600 border border-pink-200 flex items-center justify-center flex-shrink-0">
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-5 h-5">
										<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
									</svg>
								</div>
								<div class="min-w-0">
									<p class="text-[11px] font-extrabold uppercase tracking-wider text-pink-500">Birthday</p>
									<p class="text-xs sm:text-sm font-bold text-pink-950 truncate">
										{profileData.user.birthday ? formatBirthday(profileData.user.birthday) : 'Not specified'}
									</p>
								</div>
							</div>
						</div>

						<!-- Row 3: Gender -->
						{#if profileData.user.gender && profileData.user.gender !== 'Prefer not to say'}
							<div class="p-3.5 sm:p-4 flex items-center justify-between hover:bg-pink-50/40 transition-colors">
								<div class="flex items-center space-x-3 min-w-0">
									<div class="w-9 h-9 rounded-xl bg-purple-100 text-purple-600 border border-purple-200 flex items-center justify-center flex-shrink-0">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-5 h-5">
											<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
										</svg>
									</div>
									<div class="min-w-0">
										<p class="text-[11px] font-extrabold uppercase tracking-wider text-pink-500">Gender</p>
										<p class="text-xs sm:text-sm font-bold text-pink-950 truncate">
											{profileData.user.gender}
										</p>
									</div>
								</div>
							</div>
						{/if}

					</div>
				</div>
			{/if}

			<!-- TAB CONTENT SECTIONS -->

			<!-- TAB 1: FRIENDS SHOWCASE LIST -->
			{#if activeTab === 'friends'}
				<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-md p-6 space-y-4 animate-fade-in">
					<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-pink-100">
						<div>
							<h3 class="text-base font-bold text-pink-950">
								{profileData.is_self ? 'My Friends' : `@${profileData.user.username}'s Friends`}
							</h3>
							<p class="text-xs text-pink-600">{profileData.total_friends} total connection{profileData.total_friends === 1 ? '' : 's'}</p>
						</div>

						<!-- Search Friends -->
						<div class="relative w-full sm:w-64">
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

					{#if filteredFriends.length === 0}
						<div class="text-center py-12 border-2 border-dashed border-pink-200 rounded-2xl">
							<p class="text-xs font-semibold text-pink-600">
								{friendsSearch ? 'No friends matched your search.' : 'No friends yet.'}
							</p>
						</div>
					{:else}
						<div class="flex flex-col space-y-2.5">
							{#each filteredFriends as friend}
								<div class="bg-white border border-pink-200 hover:border-pink-300 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 shadow-2xs hover:shadow-md transition-all">
									<div
										onclick={() => viewUserProfile(friend)}
										class="flex items-center space-x-3.5 min-w-0 text-left hover:opacity-85 transition-opacity group cursor-pointer flex-grow"
									>
										<div class="relative flex-shrink-0">
											<div class="w-11 h-11 rounded-full bg-gradient-to-tr from-pink-400 to-rose-500 text-white flex items-center justify-center font-bold text-base shadow-xs overflow-hidden group-hover:scale-105 transition-transform">
												{#if friend.avatar_url}
													<img src={friend.avatar_url} alt={friend.username} class="w-full h-full object-cover" />
												{:else}
													{friend.username?.charAt(0).toUpperCase()}
												{/if}
											</div>
											<span class="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white {formatLastActive(friend.last_activity) === 'Active now' ? 'bg-emerald-500' : 'bg-pink-300'}"></span>
										</div>

										<div class="min-w-0 flex-grow pr-2">
											<p class="text-sm sm:text-base font-bold text-pink-950 group-hover:text-pink-600 truncate block text-left transition-colors group-hover:underline">
												@{friend.username}
											</p>
											<p class="text-xs text-pink-500 truncate">{formatLastActive(friend.last_activity)}</p>
										</div>
									</div>

									<div class="flex items-center space-x-2 flex-shrink-0">
										{#if String(friend.id || friend.friend_id || friend.user_id) === String(currentUser?.id)}
											<span class="px-3.5 py-1.5 bg-pink-100 text-pink-700 font-extrabold text-xs rounded-xl border border-pink-300">
												You
											</span>
										{:else}
											<button
												onclick={() => viewUserProfile(friend)}
												class="px-3 py-1.5 bg-white border border-pink-300 text-pink-700 hover:bg-pink-100 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center space-x-1"
											>
												<span>Profile</span>
											</button>
											<button
												onclick={() => openChatWithUser(friend)}
												class="px-3 py-1.5 bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-all flex items-center space-x-1.5 cursor-pointer active:scale-95"
												title="Chat"
											>
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
													<path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-.818-.818 5.969 5.969 0 011.057-3.035C4.646 15.657 4 13.916 4 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
												</svg>
												<span class="hidden sm:inline">Message</span>
											</button>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- TAB 2: MUTUAL FRIENDS -->
			{#if activeTab === 'mutual' && !profileData.is_self}
				<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-md p-6 space-y-4 animate-fade-in">
					<div>
						<h3 class="text-base font-bold text-pink-950">Mutual Friends</h3>
						<p class="text-xs text-pink-600">You and @{profileData.user.username} both know these people</p>
					</div>

					<div class="flex flex-col space-y-2.5">
						{#each profileData.mutual_friends as mutual}
							<div class="bg-white border border-pink-200 hover:border-pink-300 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 shadow-2xs hover:shadow-md transition-all">
								<div
									onclick={() => viewUserProfile(mutual)}
									class="flex items-center space-x-3.5 min-w-0 cursor-pointer flex-grow group"
								>
									<div class="w-11 h-11 rounded-full bg-gradient-to-tr from-pink-400 to-rose-500 text-white flex items-center justify-center font-bold text-base shadow-2xs overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform">
										{#if mutual.avatar_url}
											<img src={mutual.avatar_url} alt={mutual.username} class="w-full h-full object-cover" />
										{:else}
											{mutual.username?.charAt(0).toUpperCase()}
										{/if}
									</div>
									<div class="min-w-0 pr-2">
										<p class="text-sm sm:text-base font-bold text-pink-950 group-hover:text-pink-600 truncate block text-left transition-colors group-hover:underline">@{mutual.username}</p>
										<p class="text-xs text-pink-500 truncate">{mutual.email}</p>
									</div>
								</div>

								{#if String(mutual.id || mutual.friend_id || mutual.user_id) === String(currentUser?.id)}
									<span class="px-3.5 py-1.5 bg-pink-100 text-pink-700 font-extrabold text-xs rounded-xl border border-pink-300 flex-shrink-0">
										You
									</span>
								{:else}
									<button
										onclick={() => viewUserProfile(mutual)}
										class="px-3.5 py-1.5 bg-white border border-pink-300 text-pink-700 hover:bg-pink-100 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer flex-shrink-0"
									>
										Profile
									</button>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- TAB 3: MOOD SUMMARY FOR SELF-PROFILE -->
			{#if activeTab === 'mood' && profileData.is_self}
				<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-md p-5 sm:p-6 space-y-4 animate-fade-in">
					<div class="flex items-center justify-between gap-3 pb-3 border-b border-pink-100">
						<div class="min-w-0">
							<h3 class="text-base font-black text-pink-950 flex items-center space-x-2 truncate">
								<span>Mood Insights & Reflection</span>
							</h3>
							<p class="text-xs text-pink-600 font-medium truncate">System feedback based on your overall logged emotions</p>
						</div>

						<button
							onclick={() => goto('/mood-graph')}
							class="px-3.5 py-1.5 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-all flex items-center space-x-1.5 active:scale-95 cursor-pointer flex-shrink-0"
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
								<path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
							</svg>
							<span>Full Graph</span>
						</button>
					</div>

					{#if isLoadingMoods}
						<div class="py-8 flex flex-col items-center justify-center space-y-2">
							<div class="w-7 h-7 border-3 border-pink-400 border-t-transparent rounded-full animate-spin"></div>
							<p class="text-xs font-semibold text-pink-600">Analyzing mood insights...</p>
						</div>
					{:else}
						<!-- Compact Dominant Mood & System Feedback Card -->
						<div class="p-4 sm:p-5 bg-gradient-to-br from-pink-50 via-rose-50/50 to-white border-2 border-pink-200 rounded-2xl space-y-3 shadow-2xs">
							
							<div class="flex items-center justify-between gap-3">
								<div class="flex items-center space-x-3 min-w-0">
									<div class="w-10 h-10 rounded-xl bg-pink-100 text-pink-600 border border-pink-300 flex items-center justify-center font-bold text-xl flex-shrink-0 shadow-2xs">
										{getMoodEmoji(dominantMood)}
									</div>
									<div class="min-w-0">
										<p class="text-[11px] font-black uppercase tracking-wider text-pink-600">Dominant Mood</p>
										<p class="text-base sm:text-lg font-black text-pink-950 truncate capitalize">{dominantMood}</p>
									</div>
								</div>

								<div class="flex flex-col items-end flex-shrink-0">
									<span class="px-3 py-1 bg-white border border-pink-300 text-pink-800 rounded-full text-xs font-black shadow-2xs">
										{totalMoodLogs} Logs
									</span>
								</div>
							</div>

							<!-- System Feedback Message -->
							<div class="p-3.5 bg-white/95 border border-pink-200/90 rounded-xl flex items-start space-x-3 shadow-2xs">
								<div class="w-6 h-6 rounded-lg bg-pink-100 text-pink-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-2xs">
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
										<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
									</svg>
								</div>
								<p class="text-xs text-pink-900 font-medium leading-relaxed italic">
									"{getSystemFeedbackMessage(dominantMood)}"
								</p>
							</div>

						</div>
					{/if}
				</div>
			{/if}

		{/if}
	</main>

	<!-- Unfriend Confirmation Modal -->
	{#if showUnfriendModal && unfriendTarget}
		<div
			class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
			onclick={(e) => { if (e.target === e.currentTarget) showUnfriendModal = false; }}
		>
			<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center animate-modal-content">
				<div class="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-xs">
					<svg class="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
						<path fill-rule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.256 1.478l-.209-.035-1.005 13.07a3 3 0 01-2.991 2.77H8.084a3 3 0 01-2.991-2.77L4.088 6.66l-.209.035a.75.75 0 01-.256-1.478A48.567 48.567 0 017.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 013.369 0c1.603.051 2.815 1.387 2.815 2.951zm-6.136-1.452a51.196 51.196 0 00-3.273 0C6.39 3.05 6 3.678 6 4.478v.113a49.488 49.488 0 0012 0v-.113c0-.8-.39-1.428-1.091-1.452a51.196 51.196 0 00-3.273 0zM9.75 9.75a.75.75 0 01.75.75v6.75a.75.75 0 01-1.5 0v-6.75a.75.75 0 01.75-.75zm4.5 0a.75.75 0 01.75.75v6.75a.75.75 0 01-1.5 0v-6.75a.75.75 0 01.75-.75z" clip-rule="evenodd" />
					</svg>
				</div>
				<h3 class="text-lg font-bold text-pink-950 mb-1.5">Unfriend @{unfriendTarget.username}?</h3>
				<p class="text-xs sm:text-sm text-pink-600 mb-6 leading-relaxed">
					Are you sure you want to remove <span class="font-bold text-pink-900">@{unfriendTarget.username}</span> from your friends list?
				</p>

				<div class="flex items-center space-x-3">
					<button
						type="button"
						onclick={() => showUnfriendModal = false}
						class="w-1/2 py-2.5 bg-pink-100 text-pink-700 hover:bg-pink-200 rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-xs"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={confirmRemoveFriend}
						disabled={isUnfriending}
						class="w-1/2 py-2.5 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-rose-200 active:scale-95 cursor-pointer disabled:opacity-50"
					>
						{#if isUnfriending}
							<span>Removing...</span>
						{:else}
							<span>Unfriend</span>
						{/if}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Block User Confirmation Modal -->
	{#if showBlockModal && blockTarget}
		<div
			class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
			onclick={(e) => { if (e.target === e.currentTarget) showBlockModal = false; }}
		>
			<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center animate-modal-content">
				<div class="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-xs">
					<svg class="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
						<path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z" clip-rule="evenodd" />
					</svg>
				</div>
				<h3 class="text-lg font-bold text-pink-950 mb-1.5">Block @{blockTarget.username || 'User'}?</h3>
				<p class="text-xs sm:text-sm text-pink-600 mb-6 leading-relaxed">
					They will no longer be able to message you or see your profile.
				</p>

				<div class="flex items-center space-x-3">
					<button
						type="button"
						onclick={() => showBlockModal = false}
						class="w-1/2 py-2.5 bg-pink-100 text-pink-700 hover:bg-pink-200 rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-xs"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={confirmBlockUser}
						disabled={isBlocking}
						class="w-1/2 py-2.5 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-rose-200 active:scale-95 cursor-pointer disabled:opacity-50"
					>
						{#if isBlocking}
							<span>Blocking...</span>
						{:else}
							<span>Block User</span>
						{/if}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Edit Profile Information Modal -->
	<EditProfileModal
		bind:isOpen={showEditProfileModal}
		bind:editBio={editBio}
		bind:editBirthday={editBirthday}
		bind:editRelationshipStatus={editRelationshipStatus}
		bind:editGender={editGender}
		isSaving={isSavingAboutInfo}
		onSave={handleSaveAboutProfile}
	/>

	<!-- Add / Edit Note Modal -->
	{#if showNoteModal}
		<div
			class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
			onclick={(e) => { if (e.target === e.currentTarget) showNoteModal = false; }}
		>
			<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center animate-modal-content relative overflow-hidden">
				<div class="w-14 h-14 bg-pink-100 text-pink-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-xs">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-7 h-7">
						<path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-.818-.818 5.969 5.969 0 011.057-3.035C4.646 15.657 4 13.916 4 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
					</svg>
				</div>
				<h3 class="text-base sm:text-lg font-black text-pink-950 mb-1">
					{userNote ? 'Edit Note' : 'Add Note'}
				</h3>
				<p class="text-xs text-pink-600 mb-4 font-medium leading-relaxed">
					Share a quick thought that will float right above your profile photo!
				</p>

				<div class="mb-5 relative">
					<textarea
						bind:value={noteInputText}
						maxlength="60"
						placeholder="Type your note here... (e.g. Feeling awesome today!)"
						class="w-full px-3.5 py-2.5 bg-pink-50 border-2 border-pink-200 rounded-xl text-xs sm:text-sm font-semibold text-pink-900 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:bg-white resize-none"
						rows="2"
					></textarea>
					<span class="absolute bottom-2 right-2 text-[10px] text-pink-400 font-bold">
						{noteInputText.length}/60
					</span>
				</div>

				<div class="flex items-center space-x-2">
					{#if userNote}
						<button
							type="button"
							onclick={deleteUserNote}
							class="py-2.5 px-3 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-xs active:scale-95"
							title="Delete note"
						>
							Delete
						</button>
					{/if}
					<button
						type="button"
						onclick={() => showNoteModal = false}
						class="flex-1 py-2.5 bg-pink-100 text-pink-700 hover:bg-pink-200 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer shadow-xs active:scale-95"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={saveUserNote}
						class="flex-1 py-2.5 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white rounded-xl font-bold text-xs sm:text-sm transition-all shadow-md active:scale-95 cursor-pointer"
					>
						Save Note
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Toast Notification Banner -->
	{#if showToast}
		<div class="fixed bottom-5 right-5 z-50 animate-bounce">
			<div class="px-4 py-3 rounded-2xl shadow-xl border-2 flex items-center space-x-2.5 {toastType === 'error' ? 'bg-rose-500 border-rose-600 text-white' : 'bg-emerald-600 border-emerald-700 text-white'}">
				<span class="text-xs sm:text-sm font-bold">{toastMessage}</span>
			</div>
		</div>
	{/if}

	<!-- Footer -->
	<footer class="bg-white/85 backdrop-blur-md border-t-2 border-pink-300 mt-auto py-3 text-center">
		<p class="text-[11px] sm:text-xs text-pink-700 font-medium">
			© 2026 CHRONOMUSE. All rights reserved. Developed by Merlye Deyto
		</p>
	</footer>
</div>
