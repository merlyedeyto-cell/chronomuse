<script>
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { supabase } from '$lib/supabaseClient';
	import { broadcastFriendEvent, broadcastProfileEvent } from '$lib/realtimeBroadcast.js';
	import { playClickSound } from '$lib/soundEffects.js';
	import AppHeader from '$lib/AppHeader.svelte';
	import AppFooter from '$lib/AppFooter.svelte';
	import EditProfileModal from '$lib/EditProfileModal.svelte';

	let currentUser = $state(typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('chronomuse_user') || 'null') : null);
	let targetUserId = $state(null);

	function getInitialProfileData() {
		if (typeof window === 'undefined') return null;
		try {
			const stored = localStorage.getItem('chronomuse_user');
			if (!stored) return null;
			const u = JSON.parse(stored);
			if (!u || !u.id) return null;

			const urlParams = new URLSearchParams(window.location.search);
			const paramId = urlParams.get('id') || urlParams.get('user_id');
			const effectiveId = paramId || u.id;

			const storedCache = localStorage.getItem(`chronomuse_profile_cache_${effectiveId}`);
			if (storedCache) {
				const parsed = JSON.parse(storedCache);
				if (parsed && parsed.user) return parsed;
			}

			if (String(effectiveId) !== String(u.id)) {
				return null;
			}

			const cachedAbout = JSON.parse(localStorage.getItem(`chronomuse_about_${u.id}`) || '{}');
			const savedCover = localStorage.getItem(`chronomuse_cover_${u.id}`) || null;
			let savedNote = localStorage.getItem(`chronomuse_note_${u.id}`) || '';
			const savedNoteTime = localStorage.getItem(`chronomuse_note_time_${u.id}`);
			if (savedNoteTime && (parseInt(savedNoteTime, 10) + 24 * 60 * 60 * 1000) <= Date.now()) {
				savedNote = '';
				try {
					localStorage.removeItem(`chronomuse_note_${u.id}`);
					localStorage.removeItem(`chronomuse_note_time_${u.id}`);
				} catch (e) {}
			}
			return {
				user: {
					id: u.id,
					username: u.username || 'User',
					email: u.email || '',
					avatar_url: u.avatar_url || null,
					cover_url: u.cover_url || savedCover || null,
					note: u.note !== undefined ? (savedNoteTime && (parseInt(savedNoteTime, 10) + 24 * 60 * 60 * 1000) <= Date.now() ? '' : u.note) : savedNote,
					bio: u.bio !== undefined && u.bio !== null ? u.bio : (cachedAbout.bio || null),
					birthday: u.birthday !== undefined && u.birthday !== null ? u.birthday : (cachedAbout.birthday || null),
					relationship_status: u.relationship_status !== undefined && u.relationship_status !== null ? u.relationship_status : (cachedAbout.relationship_status || null),
					gender: u.gender !== undefined && u.gender !== null ? u.gender : (cachedAbout.gender || null)
				},
				is_self: String(effectiveId) === String(u.id),
				is_friend: false,
				is_fetching_details: true,
				total_friends: null,
				total_memories: null,
				friends: [],
				mutual_friends: [],
				mutual_friends_count: 0
			};
		} catch (e) {
			return null;
		}
	}

	let profileData = $state(getInitialProfileData());
	let isProfileNotFound = $state(false);
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
	let viewingUserNote = $state(false);

	function openNoteModal() {
		playClickSound();
		noteInputText = userNote || '';
		showNoteModal = true;
	}

	async function saveUserNote() {
		playClickSound();
		const effectiveId = targetUserId || currentUser?.id;
		if (!effectiveId) return;
		const trimmed = noteInputText.trim();
		userNote = trimmed;
		if (profileData?.user) {
			profileData.user.note = trimmed;
		}
		const nowTimestamp = Date.now();
		if (typeof window !== 'undefined') {
			if (trimmed) {
				localStorage.setItem(`chronomuse_note_${effectiveId}`, trimmed);
				localStorage.setItem(`chronomuse_note_time_${effectiveId}`, nowTimestamp.toString());
			} else {
				localStorage.removeItem(`chronomuse_note_${effectiveId}`);
				localStorage.removeItem(`chronomuse_note_time_${effectiveId}`);
			}
		}

		if (currentUser?.id) {
			try {
				await fetch(API_ENDPOINTS.updateProfile, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						user_id: currentUser.id,
						note: trimmed
					})
				});
			} catch (e) {}

			try {
				broadcastProfileEvent(currentUser.id, { note: trimmed, note_time: nowTimestamp });
			} catch (e) {}
		}

		showNoteModal = false;
		showNotification(trimmed ? 'Note updated!' : 'Note removed', 'success');
	}

	async function deleteUserNote() {
		playClickSound();
		const effectiveId = targetUserId || currentUser?.id;
		if (!effectiveId) return;
		userNote = '';
		noteInputText = '';
		if (profileData?.user) {
			profileData.user.note = '';
		}
		if (typeof window !== 'undefined') {
			localStorage.removeItem(`chronomuse_note_${effectiveId}`);
			localStorage.removeItem(`chronomuse_note_time_${effectiveId}`);
		}
		if (currentUser?.id) {
			try {
				await fetch(API_ENDPOINTS.updateProfile, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						user_id: currentUser.id,
						note: ''
					})
				});
			} catch (e) {}

			try {
				broadcastProfileEvent(currentUser.id, { note: '' });
			} catch (e) {}
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
			const dataUrlPromise = new Promise((resolve) => {
				reader.onload = (readerEvent) => {
					resolve(readerEvent.target?.result?.toString() || '');
				};
			});
			reader.readAsDataURL(file);
			const dataUrl = await dataUrlPromise;

			const fileExt = file.name.split('.').pop() || 'jpg';
			const filePath = `covers/${currentUser.id}_${Date.now()}.${fileExt}`;

			let finalCoverUrl = null;

			// Try avatars bucket first
			const { error: uploadError } = await supabase.storage
				.from('avatars')
				.upload(filePath, file, { upsert: true });

			if (!uploadError) {
				const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
				finalCoverUrl = data?.publicUrl;
			} else {
				// Fallback to memories bucket
				const { error: memError } = await supabase.storage
					.from('memories')
					.upload(filePath, file, { upsert: true });

				if (!memError) {
					const { data } = supabase.storage.from('memories').getPublicUrl(filePath);
					finalCoverUrl = data?.publicUrl;
				}
			}

			if (!finalCoverUrl) {
				finalCoverUrl = dataUrl;
			}

			if (finalCoverUrl && profileData?.user) {
				profileData = {
					...profileData,
					user: {
						...profileData.user,
						cover_url: finalCoverUrl
					}
				};

				if (typeof window !== 'undefined' && currentUser?.id) {
					localStorage.setItem(`chronomuse_cover_${currentUser.id}`, finalCoverUrl);
					const updatedStored = { ...currentUser, cover_url: finalCoverUrl };
					try {
						localStorage.setItem('chronomuse_user', JSON.stringify(updatedStored));
					} catch (e) {}
					currentUser = updatedStored;
					window.dispatchEvent(new Event('chronomuse_auth_change'));
				}

				// Persist cover_url to database table
				try {
					await fetch(API_ENDPOINTS.updateProfile, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							user_id: currentUser.id,
							cover_url: finalCoverUrl
						})
					});
				} catch (dbErr) {}

				broadcastProfileEvent(currentUser.id, { cover_url: finalCoverUrl });
			}
			showNotification('Cover photo updated successfully!');
		} catch (err) {
			console.error('Error uploading cover photo:', err);
			showNotification('Failed to upload cover photo', 'error');
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
	let dominantMoods = $state(['Happy']);
	let dominantMoodCount = $state(0);
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

			broadcastProfileEvent(currentUser.id, updatedAboutData);

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
			// Call blockUser API endpoint
			await fetch(API_ENDPOINTS.blockUser, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: currentUser.id, target_id: targetId, action: 'block' })
			}).catch(() => {});

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
				profileData.is_blocked_by_me = true;
			}

			showBlockModal = false;
			blockTarget = null;
		} catch (e) {
			showNotification('Failed to block user', 'error');
		} finally {
			isBlocking = false;
		}
	}

	async function handleUnblockTargetUser() {
		if (!currentUser || !profileData || !profileData.user) return;
		playClickSound();
		try {
			const res = await fetch(API_ENDPOINTS.blockUser, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: currentUser.id,
					target_id: profileData.user.id,
					action: 'unblock'
				})
			});
			const data = await res.json();
			if (data.success) {
				showNotification(`Unblocked @${profileData.user.username}`);
				profileData.is_blocked_by_me = false;
				loadProfileData(profileData.user.id);
			} else {
				showNotification(data.error || 'Failed to unblock user', 'error');
			}
		} catch (err) {
			console.error('Error unblocking user:', err);
			showNotification('Error unblocking user', 'error');
		}
	}

	let isCopiedLink = $state(false);
	let copyLinkTimer = /** @type {any} */ (null);

	async function handleCopyProfileLink() {
		playClickSound();
		if (!profileData?.user?.id || typeof window === 'undefined') return;
		const profileUrl = `${window.location.origin}/profile?id=${profileData.user.id}`;
		try {
			if (navigator?.clipboard?.writeText) {
				await navigator.clipboard.writeText(profileUrl);
			} else {
				const textArea = document.createElement('textarea');
				textArea.value = profileUrl;
				textArea.style.position = 'fixed';
				textArea.style.opacity = '0';
				document.body.appendChild(textArea);
				textArea.focus();
				textArea.select();
				document.execCommand('copy');
				document.body.removeChild(textArea);
			}
			isCopiedLink = true;
			showNotification('Profile link copied to clipboard!', 'success');
			if (copyLinkTimer) clearTimeout(copyLinkTimer);
			copyLinkTimer = setTimeout(() => {
				isCopiedLink = false;
			}, 2500);
		} catch (err) {
			console.error('Failed to copy profile link:', err);
			showNotification('Failed to copy profile link', 'error');
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

	async function fetchUserMoodSummary(targetId = null, isSilent = false) {
		const effectiveId = targetId || profileData?.user?.id || currentUser?.id;
		if (typeof window === 'undefined' || !effectiveId) return;
		if (!isSilent && totalMoodLogs === 0) {
			isLoadingMoods = true;
		}
		try {
			const res = await fetch(`${API_ENDPOINTS.getMoodData}?user_id=${effectiveId}&period=all`);
			const data = await res.json();
			const moods = data.success && Array.isArray(data.data) ? data.data : [];

			const stats = /** @type {Record<string, number>} */ ({ happy: 0, excited: 0, grateful: 0, calm: 0, love: 0, neutral: 0, sad: 0, anxious: 0, lonely: 0, angry: 0 });
			let total = 0;

			moods.forEach((/** @type {any} */ m) => {
				const tag = (m.mood_tag || 'happy').toLowerCase().trim();
				if (stats[tag] !== undefined) {
					stats[tag]++;
				} else {
					stats.neutral = (stats.neutral || 0) + 1;
				}
				total++;
			});

			moodSummary = stats;
			totalMoodLogs = total;

			if (total > 0) {
				const maxVal = Math.max(...Object.values(stats));
				if (maxVal > 0) {
					dominantMoodCount = maxVal;
					dominantMoods = Object.entries(stats)
						.filter(([_, count]) => count === maxVal)
						.map(([tag]) => tag.charAt(0).toUpperCase() + tag.slice(1));
					dominantMood = dominantMoods.join(' & ');
				} else {
					dominantMoodCount = 0;
					dominantMoods = [];
					dominantMood = '';
				}
			} else {
				dominantMoodCount = 0;
				dominantMoods = [];
				dominantMood = '';
			}
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
			if (typeof window !== 'undefined') {
				const returnUrl = window.location.pathname + window.location.search;
				sessionStorage.setItem('chronomuse_redirect_after_login', returnUrl);
				goto(`/?redirect=${encodeURIComponent(returnUrl)}`);
			} else {
				goto('/');
			}
			return;
		}
		currentUser = JSON.parse(stored);
		loadBlockedUsers();

		const urlParamId = $page.url.searchParams.get('id') || $page.url.searchParams.get('user_id');
		const effectiveTargetId = targetId || urlParamId || currentUser.id;
		targetUserId = effectiveTargetId;
		const targetKey = String(effectiveTargetId);

		let cached = profileCache.get(targetKey);
		if (!cached && typeof window !== 'undefined') {
			try {
				const storedCache = localStorage.getItem(`chronomuse_profile_cache_${effectiveTargetId}`);
				if (storedCache) {
					cached = JSON.parse(storedCache);
					profileCache.set(targetKey, cached);
				}
			} catch (e) {}
		}

		if (cached && !isSilent) {
			profileData = cached;
			userNote = (cached?.user?.note !== null && cached?.user?.note !== undefined)
				? cached.user.note
				: (cached?.is_self && typeof window !== 'undefined' ? (localStorage.getItem(`chronomuse_note_${effectiveTargetId}`) || '') : '');
			isLoading = false;
		} else if (!isSilent) {
			isLoading = true;
			isProfileNotFound = false;
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
				isProfileNotFound = false;
				const cachedAbout = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem(`chronomuse_about_${effectiveTargetId}`) || '{}') : {};
				const savedCover = typeof window !== 'undefined' ? (localStorage.getItem(`chronomuse_cover_${effectiveTargetId}`) || null) : null;
				const mergedUser = {
					...data.data.user,
					avatar_url: data.data.user.avatar_url || (data.data.is_self ? currentUser?.avatar_url : null),
					cover_url: data.data.user.cover_url !== undefined && data.data.user.cover_url !== null ? data.data.user.cover_url : (savedCover || null),
					bio: data.data.user.bio !== undefined && data.data.user.bio !== null ? data.data.user.bio : (cachedAbout.bio || null),
					birthday: data.data.user.birthday !== undefined && data.data.user.birthday !== null ? data.data.user.birthday : (cachedAbout.birthday || null),
					relationship_status: data.data.user.relationship_status !== undefined && data.data.user.relationship_status !== null ? data.data.user.relationship_status : (cachedAbout.relationship_status || null),
					gender: data.data.user.gender !== undefined && data.data.user.gender !== null ? data.data.user.gender : (cachedAbout.gender || null)
				};
				profileData = { ...data.data, user: mergedUser, is_fetching_details: false };
				userNote = (data.data.user.note !== null && data.data.user.note !== undefined)
					? data.data.user.note
					: (data.data.is_self && typeof window !== 'undefined' ? (localStorage.getItem(`chronomuse_note_${effectiveTargetId}`) || '') : '');
				profileCache.set(targetKey, profileData);
				if (typeof window !== 'undefined') {
					try {
						localStorage.setItem(`chronomuse_profile_cache_${effectiveTargetId}`, JSON.stringify(profileData));
					} catch (e) {}
				}

				if (profileData.is_self) {
					const updatedStored = { ...currentUser, ...mergedUser };
					try {
						localStorage.setItem('chronomuse_user', JSON.stringify(updatedStored));
						if (mergedUser.cover_url) {
							localStorage.setItem(`chronomuse_cover_${mergedUser.id}`, mergedUser.cover_url);
						}
						localStorage.setItem(`chronomuse_about_${mergedUser.id}`, JSON.stringify({
							bio: mergedUser.bio || '',
							birthday: mergedUser.birthday || '',
							relationship_status: mergedUser.relationship_status || 'Single',
							gender: mergedUser.gender || 'Prefer not to say'
						}));
						if (mergedUser.note !== undefined && mergedUser.note !== null) {
							localStorage.setItem(`chronomuse_note_${mergedUser.id}`, mergedUser.note);
						}
						if (typeof window !== 'undefined') {
							window.dispatchEvent(new Event('chronomuse_auth_change'));
						}
					} catch (e) {}
					currentUser = updatedStored;
				}

				// Check target privacy: if self or public, load their mood summary
				const targetIsPrivate = profileData.is_self
					? false
					: (profileData.user?.is_private ?? (typeof window !== 'undefined' ? localStorage.getItem(`chronomuse_private_${effectiveTargetId}`) === 'true' : false));

				if (profileData.is_self || !targetIsPrivate) {
					fetchUserMoodSummary(effectiveTargetId, isSilent);
				} else {
					if (activeTab === 'mood') {
						activeTab = 'about';
					}
				}
			} else {
				if (data.error && data.error.toLowerCase().includes('not found')) {
					isProfileNotFound = true;
				}
				if (!isSilent) {
					showNotification(data.error || 'Failed to load profile', 'error');
				}
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

	onMount(() => {
		loadProfile();
		updateNoteTimer();
		noteTimerInterval = setInterval(updateNoteTimer, 1000);

		const autoSyncTimer = setInterval(() => {
			const activeId = targetUserId || $page.url.searchParams.get('id') || $page.url.searchParams.get('user_id') || currentUser?.id;
			if (activeId) {
				loadProfile(activeId, true);
			}
		}, 2000);

		const handleRealtimeNoteChange = (e) => {
			const detail = e?.detail;
			if (detail && detail.user_id && profileData?.user) {
				if (String(profileData.user.id) === String(detail.user_id)) {
					userNote = detail.note || '';
					profileData = {
						...profileData,
						user: {
							...profileData.user,
							note: detail.note || ''
						}
					};
				}
			}
		};

		const handleRealtimeProfileChange = (e) => {
			const detail = e?.detail;
			if (detail && detail.user_id && profileData?.user) {
				if (String(profileData.user.id) === String(detail.user_id)) {
					const updatedFields = detail.updated_fields || {};
					profileData = {
						...profileData,
						user: {
							...profileData.user,
							...updatedFields
						}
					};
					if (updatedFields.note !== undefined) {
						userNote = updatedFields.note || '';
					}
				}
			}
		};

		window.addEventListener('chronomuse_note_change', handleRealtimeNoteChange);
		window.addEventListener('chronomuse_profile_change', handleRealtimeProfileChange);
		return () => {
			if (autoSyncTimer) clearInterval(autoSyncTimer);
			if (noteTimerInterval) clearInterval(noteTimerInterval);
			window.removeEventListener('chronomuse_note_change', handleRealtimeNoteChange);
			window.removeEventListener('chronomuse_profile_change', handleRealtimeProfileChange);
		};
	});

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
			let dataUrl = '';
			const reader = new FileReader();
			const readerPromise = new Promise((resolve) => {
				reader.onload = (readerEvent) => {
					dataUrl = readerEvent.target?.result?.toString() || '';
					resolve(dataUrl);
				};
			});
			reader.readAsDataURL(file);

			const fileExt = file.name.split('.').pop() || 'jpg';
			const filePath = `avatars/${currentUser.id}_${Date.now()}.${fileExt}`;

			let avatarUrl = null;

			// Try avatars bucket first
			const { error: uploadError } = await supabase.storage
				.from('avatars')
				.upload(filePath, file, { upsert: true });

			if (!uploadError) {
				const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
				avatarUrl = data?.publicUrl;
			} else {
				// Fallback to memories bucket
				const { error: memError } = await supabase.storage
					.from('memories')
					.upload(filePath, file, { upsert: true });

				if (!memError) {
					const { data } = supabase.storage.from('memories').getPublicUrl(filePath);
					avatarUrl = data?.publicUrl;
				}
			}

			await readerPromise;

			if (!avatarUrl) {
				avatarUrl = dataUrl;
			}

			const updateRes = await fetch(API_ENDPOINTS.updateProfile, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: currentUser.id,
					avatar_url: avatarUrl
				})
			});

			const updateData = await updateRes.json();

			if (updateData.success || avatarUrl) {
				const updatedStoredUser = { ...currentUser, avatar_url: avatarUrl, ...(updateData.user || {}) };
				localStorage.setItem('chronomuse_user', JSON.stringify(updatedStoredUser));
				currentUser = updatedStoredUser;

				if (profileData && profileData.user) {
					profileData.user.avatar_url = avatarUrl;
				}

				broadcastProfileEvent(currentUser.id, { avatar_url: avatarUrl, ...(updateData.user || {}) });

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

	function openChatWithUser(/** @type {any} */ targetUser, /** @type {string|null} */ replyNoteText = null) {
		playClickSound();
		const targetId = targetUser.friend_id || targetUser.id;
		const username = targetUser.username || '';
		if (replyNoteText && typeof window !== 'undefined') {
			// Hand off the note text so the chat page can open the conversation
			// directly with a "Replying to @user" bar pre-filled
			try {
				sessionStorage.setItem('chronomuse_note_reply', JSON.stringify({
					user_id: targetId,
					username,
					note_text: replyNoteText
				}));
			} catch (e) {}
			goto(`/chat?friend_id=${targetId}&username=${encodeURIComponent(username)}&note_reply=1`);
		} else {
			goto(`/chat?friend_id=${targetId}&username=${encodeURIComponent(username)}`);
		}
	}

	function viewUserProfile(/** @type {any} */ targetUser) {
		if (!targetUser) return;
		playClickSound();
		const targetId = targetUser.friend_id || targetUser.id || targetUser.user_id;
		if (!targetId) return;

		const targetKey = String(targetId);
		targetUserId = targetId;

		let cached = profileCache.get(targetKey);
		if (!cached && typeof window !== 'undefined') {
			try {
				const storedCache = localStorage.getItem(`chronomuse_profile_cache_${targetId}`);
				if (storedCache) {
					cached = JSON.parse(storedCache);
					profileCache.set(targetKey, cached);
				}
			} catch (e) {}
		}

		if (cached) {
			profileData = cached;
			userNote = (cached?.user?.note !== null && cached?.user?.note !== undefined) ? cached.user.note : '';
			isLoading = false;
		} else {
			const cachedAbout = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem(`chronomuse_about_${targetId}`) || '{}') : {};
			const savedCover = typeof window !== 'undefined' ? (localStorage.getItem(`chronomuse_cover_${targetId}`) || null) : null;
			profileData = {
				user: {
					id: targetId,
					username: targetUser.username || 'User',
					email: targetUser.email || '',
					avatar_url: targetUser.avatar_url || null,
					cover_url: targetUser.cover_url || savedCover || null,
					note: targetUser.note !== undefined ? targetUser.note : '',
					bio: targetUser.bio || cachedAbout.bio || null,
					birthday: targetUser.birthday || cachedAbout.birthday || null,
					relationship_status: targetUser.relationship_status || cachedAbout.relationship_status || null,
					gender: targetUser.gender || cachedAbout.gender || null
				},
				is_self: String(targetId) === String(currentUser?.id),
				is_friend: true,
				is_fetching_details: true,
				total_friends: targetUser.total_friends !== undefined ? targetUser.total_friends : null,
				total_memories: targetUser.total_memories !== undefined ? targetUser.total_memories : null,
				friends: targetUser.friends || [],
				mutual_friends: targetUser.mutual_friends || [],
				mutual_friends_count: targetUser.mutual_friends_count !== undefined ? targetUser.mutual_friends_count : 0
			};
			userNote = targetUser.note !== undefined ? targetUser.note : '';
			isLoading = false;
		}

		if (typeof window !== 'undefined') {
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}

		// 2. Update URL
		goto(`/profile?id=${targetId}`, { replaceState: false, keepFocus: true, noScroll: true });

		// 3. Fetch full data silently in background
		loadProfile(targetId, true);
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
	let bcBus = /** @type {any} */ (null);

	onMount(() => {
		loadProfile();

		unsubscribePage = page.subscribe(($p) => {
			const rawParamId = $p.url.searchParams.get('id') || $p.url.searchParams.get('user_id');
			const effectiveId = rawParamId || currentUser?.id;
			if (effectiveId && String(effectiveId) !== String(targetUserId)) {
				if (currentUser?.id && String(effectiveId) === String(currentUser.id)) {
					viewUserProfile(currentUser);
				} else {
					loadProfile(effectiveId);
				}
			}
		});

		const handleGoSelfProfile = () => {
			if (currentUser?.id) {
				viewUserProfile(currentUser);
			}
		};
		window.addEventListener('chronomuse_go_self_profile', handleGoSelfProfile);

		// Handle browser/hardware back button to restore the correct profile view
		const handlePopState = () => {
			const urlParams = new URLSearchParams(window.location.search);
			const paramId = urlParams.get('id') || urlParams.get('user_id');
			const effectiveId = paramId || currentUser?.id;
			if (effectiveId && String(effectiveId) !== String(targetUserId)) {
				// Load the profile corresponding to where we navigated back to
				if (currentUser?.id && String(effectiveId) === String(currentUser.id)) {
					// Going back to own profile
					loadProfile(currentUser.id);
				} else if (effectiveId) {
					loadProfile(effectiveId);
				}
			} else if (!paramId && currentUser?.id) {
				// No id param means we went back to /profile (own profile)
				loadProfile(currentUser.id);
			}
		};
		window.addEventListener('popstate', handlePopState);

		try {
			realtimeChannel = supabase
				.channel('public:profile_updates')
				.on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, () => {
					loadProfile(targetUserId, true);
				})
				.on('postgres_changes', { event: '*', schema: 'public', table: 'friends' }, () => {
					loadProfile(targetUserId, true);
				})
				.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chronomuse_users' }, (payload) => {
					const updated = payload.new;
					const currentId = targetUserId || profileData?.user?.id;
					if (updated && currentId && String(updated.id) === String(currentId)) {
						if (updated.note !== undefined) {
							userNote = updated.note || '';
						}
						if (profileData?.user) {
							profileData = {
								...profileData,
								user: {
									...profileData.user,
									...updated
								}
							};
						}
						loadProfile(currentId, true);
					}
				})
				.subscribe();
		} catch (e) {}

		if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
			try {
				bcBus = new BroadcastChannel('chronomuse_realtime_bus');
				bcBus.onmessage = (msg) => {
					if (msg.data?.type === 'profile_change' || msg.data?.type === 'note_change') {
						const detail = msg.data.detail;
						if (detail && detail.user_id && profileData?.user && String(detail.user_id) === String(profileData.user.id)) {
							if (detail.updated_fields) {
								profileData = {
									...profileData,
									user: {
										...profileData.user,
										...detail.updated_fields
									}
								};
							}
							if (detail.note !== undefined) {
								userNote = detail.note || '';
								if (profileData?.user) profileData.user.note = detail.note || '';
							}
							loadProfile(profileData.user.id, true);
						}
					}
				};
			} catch (e) {}
		}

		return () => {
			window.removeEventListener('chronomuse_go_self_profile', handleGoSelfProfile);
			window.removeEventListener('popstate', handlePopState);
		};
	});

	onDestroy(() => {
		if (unsubscribePage) unsubscribePage();
		if (realtimeChannel) {
			try {
				supabase.removeChannel(realtimeChannel);
			} catch (e) {}
		}
		if (bcBus) {
			try {
				bcBus.close();
			} catch (e) {}
		}
	});

	let filteredFriends = $derived(
		(profileData?.friends || []).filter((f) =>
			(f.username || '').toLowerCase().includes((friendsSearch || '').toLowerCase())
		)
	);

	let isTargetPrivate = $derived(
		profileData?.is_self
			? false
			: (profileData?.user?.is_private ?? (typeof window !== 'undefined' && profileData?.user?.id ? localStorage.getItem(`chronomuse_private_${profileData.user.id}`) === 'true' : false))
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

	function getMoodDynamicEmoji(moodTag) {
		switch ((moodTag || '').toLowerCase()) {
			case 'happy': return '😊';
			case 'sad': return '😢';
			case 'excited': return '🤩';
			case 'calm': return '🌿';
			case 'love': return '💖';
			case 'angry': return '🔥';
			case 'grateful': return '🙏';
			case 'anxious': return '🌊';
			case 'lonely': return '🌧️';
			case 'neutral': return '✨';
			default: return '🌟';
		}
	}

	function getSystemFeedbackMessage(moodTag, tiedMoods = []) {
		if (tiedMoods && tiedMoods.length > 1) {
			const joined = tiedMoods.join(' and ');
			return `You are experiencing a harmonious balance of ${joined}. Embracing these diverse emotions shows great self-awareness and emotional richness in your journey!`;
		}
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
				return "It's completely natural to feel down at times. Be gentle with yourself. Brighter, warmer days are ahead.";
			case 'anxious':
				return "Take a slow, deep breath. You are safe, grounded, and far stronger than whatever is weighing on your mind.";
			case 'lonely':
				return "You are never truly alone. Reach out to someone you care about or write down your feelings. ChronoMuse is here with you.";
			case 'angry':
				return "Your feelings are valid, but remember to give yourself space. A quiet walk or calming music can help restore your peace.";
			default:
				return "You're keeping a steady, mindful rhythm. Take a moment to reflect and appreciate where you are right now.";
		}
	}

	let noteCountdownTimer = $state('24h 00m 00s');
	let noteTimerInterval = null;

	function updateNoteTimer() {
		const now = Date.now();
		const targetId = profileData?.user?.id || targetUserId || currentUser?.id;
		if (!targetId || !userNote) {
			noteCountdownTimer = '24h 00m 00s';
			return;
		}

		let noteTime = null;
		if (typeof window !== 'undefined' && targetId) {
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
			noteCountdownTimer = 'Expired';
			// Note expired: Wipe it out so user can write a new one
			userNote = '';
			noteInputText = '';
			if (profileData?.user) {
				profileData.user.note = '';
			}
			if (typeof window !== 'undefined') {
				localStorage.removeItem(`chronomuse_note_${targetId}`);
				localStorage.removeItem(`chronomuse_note_time_${targetId}`);
			}
			if (profileData?.is_self && currentUser?.id) {
				try {
					fetch(API_ENDPOINTS.updateProfile, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ user_id: currentUser.id, note: '' })
					});
					broadcastProfileEvent(currentUser.id, { note: '' });
				} catch (e) {}
			}
		} else {
			const h = Math.floor(diff / (1000 * 60 * 60));
			const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
			const s = Math.floor((diff % (1000 * 60)) / 1000);
			noteCountdownTimer = `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
		}
	}
</script>

<svelte:head>
	<title>{profileData ? `@${profileData.user.username}'s Profile` : 'User Profile'} - ChronoMuse</title>
</svelte:head>

<div class="flex flex-col min-h-screen bg-[#fff0f5] animate-fade-in font-sans text-pink-950">
	<!-- Top Navigation -->
	<AppHeader />

	<!-- Main Profile Container -->
	<main class="flex-grow container mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-8 pb-24 sm:pb-28 max-w-lg md:max-w-2xl lg:max-w-3xl xl:max-w-4xl space-y-3.5 sm:space-y-4">
		{#if !profileData && (isLoading || !isProfileNotFound)}
			<div class="flex flex-col items-center justify-center py-20 space-y-2.5">
				<div class="w-8 h-8 border-3 border-[#f43f8e] border-t-transparent rounded-full animate-spin"></div>
				<p class="text-xs font-extrabold text-pink-400 animate-pulse">Loading profile...</p>
			</div>
		{:else if !profileData}
			<div class="bg-white rounded-2xl p-6 border border-pink-100 shadow-[0_4px_20px_rgba(244,114,182,0.1)] flex flex-col items-center justify-center text-center space-y-3">
				<div class="w-12 h-12 bg-pink-50 text-[#f43f8e] rounded-full flex items-center justify-center mx-auto border border-pink-100 shadow-xs">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
					</svg>
				</div>
				<div class="space-y-0.5">
					<p class="text-base font-black text-pink-950">Profile not available</p>
					<p class="text-xs text-pink-400 font-bold">This account might be private or no longer exists.</p>
				</div>
				<button 
					type="button"
					onclick={() => goto('/profile')}
					class="px-4 py-2 bg-[#f43f8e] hover:bg-[#e0337f] text-white text-xs font-black rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
				>
					Go to My Profile
				</button>
			</div>
		{:else if profileData.is_blocked_by_me || profileData.is_blocking_me}
			<!-- Blocked Profile View Screen -->
			<div class="bg-white border border-pink-100 rounded-2xl shadow-[0_4px_20px_rgba(244,114,182,0.1)] p-6 sm:p-7 text-center space-y-4">
				<div class="w-14 h-14 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto border border-rose-100 shadow-xs">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-7 h-7">
						<path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
					</svg>
				</div>
				
				<div class="space-y-1">
					<h2 class="text-lg sm:text-xl font-black text-pink-950">@{profileData.user.username}</h2>
					{#if profileData.is_blocked_by_me}
						<p class="text-pink-400 text-xs font-bold max-w-md mx-auto leading-relaxed">
							You have blocked @{profileData.user.username}. You cannot view their profile details, notes, cover photo, or memories while blocked.
						</p>
					{:else}
						<p class="text-pink-400 text-xs font-bold max-w-md mx-auto leading-relaxed">
							You are blocked by @{profileData.user.username}. You cannot view this profile or interact with this user.
						</p>
					{/if}
				</div>

				{#if profileData.is_blocked_by_me}
					<button
						onclick={handleUnblockTargetUser}
						class="px-5 py-2 bg-[#f43f8e] hover:bg-[#e0337f] text-white font-black text-xs rounded-xl active:scale-95 transition-all cursor-pointer shadow-md inline-flex items-center space-x-1.5"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
						</svg>
						<span>Unblock @{profileData.user.username}</span>
					</button>
				{/if}
			</div>
		{:else}
			<!-- Top Hero Profile Card -->
			<div class="bg-white rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(244,114,182,0.1)] border border-pink-100/90 relative">
				<!-- Cover Banner Background (Roomier height so banners look complete) -->
				<div class="relative h-52 sm:h-60 w-full bg-gradient-to-tr from-[#3b82f6] via-[#ec4899] to-[#8b5cf6] overflow-hidden group">
					<!-- Cover Image if present -->
					{#if profileData.user.cover_url}
						<img src={profileData.user.cover_url} alt="Cover Banner" class="w-full h-full object-cover" />
					{/if}

					<!-- Edit Cover Button on bottom right -->
					{#if profileData.is_self}
						<label
							class="absolute bottom-3 right-3 px-3 py-1.5 bg-white/90 hover:bg-white text-[#f43f8e] text-xs font-black rounded-full border border-pink-200/80 shadow-xs flex items-center space-x-1.5 backdrop-blur-xs transition-all active:scale-95 cursor-pointer z-30"
							title="Upload Cover Photo"
						>
							<input
								type="file"
								accept="image/*"
								onchange={handleCoverChange}
								class="hidden"
							/>
							{#if isUploadingCover}
								<div class="w-3.5 h-3.5 border-2 border-[#f43f8e] border-t-transparent rounded-full animate-spin"></div>
								<span>Uploading...</span>
							{:else}
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
									<path d="M12 9a3.75 3.75 0 100 7.5 3.75 3.75 0 000-7.5z" />
									<path fill-rule="evenodd" d="M9.344 3.071a49.52 49.52 0 015.312 0c.967.052 1.83.585 2.332 1.39l.821 1.317c.24.383.645.643 1.11.71a41.402 41.402 0 016.581 1.764c.94.33 1.5 1.258 1.5 2.25v9.75c0 1.242-1.008 2.25-2.25 2.25H3.75A2.25 2.25 0 011.5 20.25v-9.75c0-.992.56-1.92 1.5-2.25a41.402 41.402 0 016.58-1.764c.466-.067.871-.327 1.111-.71l.821-1.317c.502-.805 1.365-1.338 2.332-1.39zM6.75 12.75a5.25 5.25 0 1110.5 0 5.25 5.25 0 01-10.5 0zm12-1.5a.75.75 0 100-1.5.75.75 0 000 1.5z" clip-rule="evenodd" />
								</svg>
								<span>Edit Cover</span>
							{/if}
						</label>
					{/if}
				</div>

				<!-- Profile Info Section -->
				<div class="px-5 sm:px-6 pb-5 sm:pb-6 pt-0 relative z-10">
					<!-- Avatar & Note Row -->
					<div class="flex items-end justify-between -mt-10 sm:-mt-12 mb-3">
						<div class="relative w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0">
							<!-- Floating Note Speech Bubble on Top-Left of Avatar -->
							{#if profileData.is_self}
								{#if userNote}
									<button 
										type="button"
										class="absolute -top-8 left-0 z-20 bg-white px-2.5 py-0.5 rounded-xl border-2 border-pink-200 text-[11px] font-black text-[#f43f8e] shadow-md flex items-center space-x-1 cursor-pointer hover:scale-105 active:scale-95 transition-all whitespace-nowrap"
										onclick={openNoteModal}
										title="Click to edit status note"
									>
										<span class="max-w-[120px] truncate">{userNote}</span>
										<div class="absolute -bottom-1.5 left-4 w-2 h-2 bg-white border-r-2 border-b-2 border-pink-200 rotate-45"></div>
									</button>
								{/if}
							{:else}
								{#if userNote}
									<button
										type="button"
										class="absolute -top-8 left-0 z-20 bg-white px-2.5 py-0.5 rounded-xl border-2 border-pink-200 text-[11px] font-black text-[#f43f8e] shadow-md flex items-center space-x-1 cursor-pointer hover:scale-105 active:scale-95 transition-all whitespace-nowrap"
										onclick={() => viewingUserNote = true}
										title="View note"
									>
										<span class="max-w-[120px] truncate">{userNote}</span>
										<div class="absolute -bottom-1.5 left-4 w-2 h-2 bg-white border-r-2 border-b-2 border-pink-200 rotate-45"></div>
									</button>
								{/if}
							{/if}

							<!-- Avatar Circular Picture -->
							<div class="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 border-white shadow-md bg-[#fef08a] flex items-center justify-center text-3xl font-black overflow-hidden relative">
								{#if profileData.user.avatar_url}
									<img
										src={profileData.user.avatar_url}
										alt={profileData.user.username}
										class="w-full h-full object-cover"
									/>
								{:else}
									<span class="text-3xl">🤪</span>
								{/if}
							</div>

							<!-- Avatar Camera Badge (Positioned outside overflow-hidden) -->
							{#if profileData.is_self}
								<label
									class="absolute -bottom-1 -right-1 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#f43f8e] hover:bg-[#e0337f] text-white border-2 border-white flex items-center justify-center shadow-md cursor-pointer z-30 transition-all active:scale-95"
									title="Upload Profile Photo"
								>
									<input
										type="file"
										accept="image/*"
										onchange={handleAvatarChange}
										class="hidden"
									/>
									{#if isUploadingAvatar}
										<div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
									{:else}
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5 sm:w-4 sm:h-4">
											<path d="M12 9a3.75 3.75 0 100 7.5 3.75 3.75 0 000-7.5z" />
											<path fill-rule="evenodd" d="M9.344 3.071a49.52 49.52 0 015.312 0c.967.052 1.83.585 2.332 1.39l.821 1.317c.24.383.645.643 1.11.71a41.402 41.402 0 016.581 1.764c.94.33 1.5 1.258 1.5 2.25v9.75c0 1.242-1.008 2.25-2.25 2.25H3.75A2.25 2.25 0 011.5 20.25v-9.75c0-.992.56-1.92 1.5-2.25a41.402 41.402 0 016.58-1.764c.466-.067.871-.327 1.111-.71l.821-1.317c.502-.805 1.365-1.338 2.332-1.39zM6.75 12.75a5.25 5.25 0 1110.5 0 5.25 5.25 0 01-10.5 0zm12-1.5a.75.75 0 100-1.5.75.75 0 000 1.5z" clip-rule="evenodd" />
										</svg>
									{/if}
								</label>
							{/if}
						</div>

						<!-- Action buttons on own profile (Icon-only on mobile to save space, full text on desktop) -->
						{#if profileData.is_self}
							<div class="flex items-center gap-1.5 flex-nowrap">
								<button
									type="button"
									onclick={handleCopyProfileLink}
									class="p-2 sm:px-3 sm:py-1.5 bg-pink-50 hover:bg-pink-100 border border-pink-200/90 text-[#f43f8e] text-xs font-bold rounded-full transition-all active:scale-95 shadow-2xs flex items-center justify-center space-x-1.5 cursor-pointer"
									title="Copy link to your profile"
									aria-label="Copy Profile Link"
								>
									{#if isCopiedLink}
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#f43f8e] flex-shrink-0">
											<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
										</svg>
										<span class="text-[#f43f8e] font-black hidden sm:inline">Link Copied!</span>
									{:else}
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#f43f8e] flex-shrink-0">
											<path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
										</svg>
										<span class="hidden sm:inline">Copy Link</span>
									{/if}
								</button>
								<button
									type="button"
									onclick={openEditProfileModal}
									class="p-2 sm:px-3 sm:py-1.5 bg-white hover:bg-pink-50 border border-pink-200 text-pink-700 text-xs font-bold rounded-full transition-all active:scale-95 shadow-2xs flex items-center justify-center space-x-1 cursor-pointer"
									title="Edit Profile Info"
									aria-label="Edit Profile"
								>
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#f43f8e] flex-shrink-0">
										<path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
									</svg>
									<span class="hidden sm:inline">Edit Profile</span>
								</button>
							</div>
						{:else}
							<!-- Action buttons on other user profile -->
							<div class="flex items-center gap-1.5 flex-wrap">
								<button
									type="button"
									onclick={handleCopyProfileLink}
									class="p-2 sm:px-3 sm:py-1.5 bg-pink-50 hover:bg-pink-100 border border-pink-200/90 text-pink-700 text-xs font-bold rounded-full transition-all active:scale-95 shadow-2xs flex items-center justify-center space-x-1.5 cursor-pointer"
									title="Share Profile Link"
									aria-label="Share Profile Link"
								>
									{#if isCopiedLink}
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#f43f8e] flex-shrink-0">
											<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
										</svg>
										<span class="text-[#f43f8e] font-black hidden sm:inline">Copied!</span>
									{:else}
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#f43f8e] flex-shrink-0">
											<path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
										</svg>
										<span class="hidden sm:inline">Share</span>
									{/if}
								</button>
								{#if profileData.has_pending_request}
									<span class="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-black rounded-full">
										Request Pending
									</span>
								{:else if !profileData.is_friend}
									<button
										onclick={sendFriendRequestToTargetUser}
										disabled={isSaving}
										class="px-3.5 py-1.5 bg-[#f43f8e] hover:bg-[#e0337f] text-white font-black text-xs rounded-full transition-all shadow-xs active:scale-95 cursor-pointer"
									>
										Add Friend
									</button>
								{:else}
									<button
										type="button"
										onclick={() => promptRemoveFriend(profileData.user)}
										class="px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-black text-xs rounded-full transition-all cursor-pointer"
									>
										Friends
									</button>
								{/if}
								<button
									onclick={() => openChatWithUser(profileData.user)}
									class="px-3.5 py-1.5 bg-[#f43f8e] hover:bg-[#e0337f] text-white font-black text-xs rounded-full transition-all shadow-xs active:scale-95 cursor-pointer"
								>
									Message
								</button>
							</div>
						{/if}
					</div>

					<!-- Name & Stats -->
					<div class="space-y-0.5 mt-1.5">
						<div class="flex items-center space-x-2">
							<h2 class="text-base sm:text-lg font-black text-pink-950 tracking-tight">
								{profileData.user.full_name || profileData.user.username}
							</h2>
							{#if profileData.is_self}
								<span class="px-1.5 py-0.2 bg-pink-50 text-[#f43f8e] border border-pink-200 text-[9px] font-black rounded-full uppercase">
									You
								</span>
							{/if}
						</div>
						<p class="text-xs text-pink-400 font-bold">
							<span>{profileData.total_friends !== null && profileData.total_friends !== undefined ? `${profileData.total_friends} friends` : '0 friends'}</span>
							<span>•</span>
							<span>{profileData.total_memories !== null && profileData.total_memories !== undefined ? `${profileData.total_memories} memories` : '0 memories'}</span>
						</p>
					</div>

					<!-- Pill Badges Row -->
					<div class="flex items-center flex-wrap gap-1.5 pt-2.5 pb-1">
						<button
							type="button"
							onclick={() => activeTab = 'friends'}
							class="px-2.5 py-1 bg-pink-50 border border-pink-200 text-[#f43f8e] text-[11px] font-black rounded-xl flex items-center space-x-1 cursor-pointer hover:bg-pink-100 transition-colors"
						>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3 h-3">
								<path d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.633 13.067 13.067 0 01-6.761 1.87 13.067 13.067 0 01-6.761-1.87.75.75 0 01-.363-.633l-.001-.122zM16.231 17.5a8.625 8.625 0 00-6.031-4.875 6 6 0 016.031 4.875z" />
							</svg>
							<span>{profileData.total_friends !== null && profileData.total_friends !== undefined ? `${profileData.total_friends} Friends` : '0 Friends'}</span>
						</button>

						{#if profileData.user.created_at}
							<div class="px-2.5 py-1 bg-pink-50 border border-pink-200 text-[#f43f8e] text-[11px] font-black rounded-xl flex items-center space-x-1">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
								</svg>
								<span>Joined {formatDate(profileData.user.created_at)}</span>
							</div>
						{/if}

						<div class="px-2.5 py-1 bg-pink-50 border border-pink-200 text-[#059669] text-[11px] font-black rounded-xl flex items-center space-x-1">
							<span class="w-1.5 h-1.5 rounded-full {formatLastActive(profileData.user.last_activity) === 'Active now' || formatLastActive(profileData.user.last_activity) === 'Active just now' ? 'bg-[#10b981] animate-pulse' : 'bg-pink-300'}"></span>
							<span>{formatLastActive(profileData.user.last_activity)}</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Centered Tab Switcher Bar -->
			<div class="bg-white rounded-xl p-1 shadow-[0_2px_12px_rgba(244,114,182,0.08)] border border-pink-100/90 flex items-center justify-between gap-1">
				<button
					type="button"
					onclick={() => activeTab = 'about'}
					class="flex-1 py-1.5 px-2 rounded-lg text-xs font-black transition-all flex items-center justify-center space-x-1 cursor-pointer {activeTab === 'about' ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-500 hover:text-pink-700'}"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 flex-shrink-0">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
					</svg>
					<span>About {profileData.is_self ? 'You' : ''}</span>
				</button>

				<button
					type="button"
					onclick={() => activeTab = 'friends'}
					class="flex-1 py-1.5 px-2 rounded-lg text-xs font-black transition-all flex items-center justify-center space-x-1 cursor-pointer {activeTab === 'friends' ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-500 hover:text-pink-700'}"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5 flex-shrink-0">
						<path d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.633 13.067 13.067 0 01-6.761 1.87 13.067 13.067 0 01-6.761-1.87.75.75 0 01-.363-.633l-.001-.122zM16.231 17.5a8.625 8.625 0 00-6.031-4.875 6 6 0 016.031 4.875z" />
					</svg>
					<span>Friends {profileData.total_friends !== null && profileData.total_friends !== undefined ? `(${profileData.total_friends})` : ''}</span>
				</button>

				{#if profileData.is_self || !isTargetPrivate}
					<button
						type="button"
						onclick={() => activeTab = 'mood'}
						class="flex-1 py-1.5 px-2 rounded-lg text-xs font-black transition-all flex items-center justify-center space-x-1 cursor-pointer {activeTab === 'mood' ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-500 hover:text-pink-700'}"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 flex-shrink-0">
							<path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
						</svg>
						<span class="truncate">Mood Insights</span>
					</button>
				{/if}
			</div>

			<!-- TAB CONTENT SECTIONS -->

			<!-- TAB 0: ABOUT YOU -->
			{#if activeTab === 'about'}
				<div class="bg-white rounded-2xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(244,114,182,0.08)] border border-pink-100/90 space-y-3 animate-fade-in">
					<div class="flex items-center space-x-2.5">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-[#f43f8e]">
							<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
						</svg>
						<div>
							<h3 class="text-sm font-black text-pink-950">
								{profileData.is_self ? 'About You' : `About @${profileData.user.username}`}
							</h3>
							<p class="text-[11px] text-pink-400 font-bold">Bio & personal information</p>
						</div>
					</div>

					<!-- Bio Quote Block or Add Bio Button -->
					{#if profileData.user.bio}
						<div class="p-3 bg-pink-50/50 border border-pink-100 rounded-xl">
							<p class="text-xs text-pink-950 font-bold leading-relaxed italic">
								"{profileData.user.bio}"
							</p>
						</div>
					{:else if profileData.is_self}
						<button
							type="button"
							onclick={openEditProfileModal}
							class="w-full py-2.5 border border-dashed border-pink-300 hover:border-[#f43f8e] bg-pink-50/30 hover:bg-pink-50 text-[#f43f8e] font-black text-xs rounded-xl flex items-center justify-center space-x-1 transition-all cursor-pointer"
						>
							+ Add your Bio & Personal Details
						</button>
					{/if}

					<!-- Subcards for Relationship, Birthday, Gender -->
					<div class="space-y-2">
						<!-- Relationship Status Card -->
						<div class="p-2.5 bg-pink-50/30 border border-pink-100 rounded-xl flex items-center space-x-3 shadow-2xs">
							<div class="w-8 h-8 rounded-lg bg-pink-100/70 text-[#f43f8e] border border-pink-200/60 flex items-center justify-center flex-shrink-0">
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
									<path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
								</svg>
							</div>
							<div>
								<p class="text-[9px] font-black text-pink-400 uppercase tracking-wider">RELATIONSHIP STATUS</p>
								<p class="text-xs font-black text-pink-950">
									{profileData.user.relationship_status || 'In a relationship'}
								</p>
							</div>
						</div>

						<!-- Birthday Card -->
						<div class="p-2.5 bg-pink-50/30 border border-pink-100 rounded-xl flex items-center space-x-3 shadow-2xs">
							<div class="w-8 h-8 rounded-lg bg-pink-100/70 text-[#f43f8e] border border-pink-200/60 flex items-center justify-center flex-shrink-0">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
								</svg>
							</div>
							<div>
								<p class="text-[9px] font-black text-pink-400 uppercase tracking-wider">BIRTHDAY</p>
								<p class="text-xs font-black text-pink-950">
									{profileData.user.birthday ? formatBirthday(profileData.user.birthday) : 'April 12, 2005'}
								</p>
							</div>
						</div>

						<!-- Gender Card -->
						{#if profileData.user.gender && profileData.user.gender !== 'Prefer not to say'}
							<div class="p-2.5 bg-pink-50/30 border border-pink-100 rounded-xl flex items-center space-x-3 shadow-2xs">
								<div class="w-8 h-8 rounded-lg bg-pink-100/70 text-[#f43f8e] border border-pink-200/60 flex items-center justify-center flex-shrink-0">
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
										<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
									</svg>
								</div>
								<div>
									<p class="text-[9px] font-black text-pink-400 uppercase tracking-wider">GENDER</p>
									<p class="text-xs font-black text-pink-950">
										{profileData.user.gender}
									</p>
								</div>
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- TAB 1: FRIENDS LIST -->
			{#if activeTab === 'friends'}
				<div class="bg-white rounded-2xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(244,114,182,0.08)] border border-pink-100/90 space-y-3 animate-fade-in">
					<div>
						<h3 class="text-sm font-black text-pink-950">
							{profileData.is_self ? 'My Friends' : `@${profileData.user.username}'s Friends`}
						</h3>
						<p class="text-[11px] text-pink-400 font-bold">{profileData.total_friends !== null && profileData.total_friends !== undefined ? `${profileData.total_friends} total connections` : '2 total connections'}</p>
					</div>

					<!-- Search Friends Input -->
					<div class="relative">
						<input
							type="text"
							bind:value={friendsSearch}
							placeholder="Search friends..."
							class="w-full pl-8 pr-3.5 py-2 bg-white border border-pink-200 rounded-xl text-xs font-bold text-pink-950 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/30 transition-all"
						/>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 text-pink-400 absolute left-2.5 top-2.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
						</svg>
					</div>

					{#if filteredFriends.length === 0}
						<div class="text-center py-8 border border-dashed border-pink-200 rounded-xl">
							<p class="text-xs font-bold text-pink-400">
								{friendsSearch ? 'No friends matched your search.' : 'No friends yet.'}
							</p>
						</div>
					{:else}
						<div class="space-y-2">
							{#each filteredFriends as friend}
								<div class="p-2.5 bg-white border border-pink-100 rounded-xl flex items-center justify-between shadow-2xs hover:border-pink-200 transition-all">
									<button
										type="button"
										onclick={() => viewUserProfile(friend)}
										class="flex items-center space-x-2.5 min-w-0 text-left cursor-pointer flex-grow border-0 bg-transparent p-0"
									>
										<div class="relative flex-shrink-0">
											<div class="w-9 h-9 rounded-full bg-pink-400 text-white flex items-center justify-center font-bold text-xs overflow-hidden shadow-2xs">
												{#if friend.avatar_url}
													<img src={friend.avatar_url} alt={friend.username} class="w-full h-full object-cover" />
												{:else}
													{friend.username?.charAt(0).toUpperCase()}
												{/if}
											</div>
											<span class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white {formatLastActive(friend.last_activity) === 'Active now' || formatLastActive(friend.last_activity) === 'Active just now' ? 'bg-[#10b981] animate-pulse' : 'bg-pink-300'}"></span>
										</div>

										<div class="min-w-0 flex-grow pr-1">
											<p class="text-xs font-black text-pink-950 truncate">
												@{friend.username}
											</p>
											<p class="text-[10px] text-pink-400 font-bold truncate">{formatLastActive(friend.last_activity)}</p>
										</div>
									</button>

									<div class="flex items-center space-x-1.5 flex-shrink-0">
										{#if String(friend.id || friend.friend_id || friend.user_id) === String(currentUser?.id)}
											<span class="px-2.5 py-1 bg-pink-50 text-[#f43f8e] font-black text-[11px] rounded-lg border border-pink-200">
												You
											</span>
										{:else}
											<button
												onclick={() => viewUserProfile(friend)}
												class="px-2.5 py-1 bg-white border border-pink-200 text-pink-500 font-black text-[11px] rounded-lg hover:bg-pink-50 transition-all cursor-pointer shadow-2xs"
											>
												Profile
											</button>
											<button
												onclick={() => openChatWithUser(friend)}
												class="w-8 h-8 rounded-lg bg-[#f43f8e] hover:bg-[#e0337f] text-white flex items-center justify-center shadow-2xs transition-all active:scale-95 cursor-pointer"
												title="Chat"
											>
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-3.5 h-3.5">
													<path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-.818-.818 5.969 5.969 0 011.057-3.035C4.646 15.657 4 13.916 4 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
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

			<!-- TAB 2: MUTUAL FRIENDS -->
			{#if activeTab === 'mutual' && !profileData.is_self}
				<div class="bg-white rounded-2xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(244,114,182,0.08)] border border-pink-100/90 space-y-3 animate-fade-in">
					<div>
						<h3 class="text-sm font-black text-pink-950">Mutual Friends</h3>
						<p class="text-[11px] text-pink-400 font-bold">You and @{profileData.user.username} both know these people</p>
					</div>

					<div class="space-y-2">
						{#each profileData.mutual_friends as mutual}
							<div class="p-2.5 bg-white border border-pink-100 rounded-xl flex items-center justify-between shadow-2xs hover:border-pink-200 transition-all">
								<button
									type="button"
									onclick={() => viewUserProfile(mutual)}
									class="flex items-center space-x-2.5 min-w-0 text-left cursor-pointer flex-grow border-0 bg-transparent p-0"
								>
									<div class="w-9 h-9 rounded-full bg-pink-400 text-white flex items-center justify-center font-bold text-xs overflow-hidden flex-shrink-0 shadow-2xs">
										{#if mutual.avatar_url}
											<img src={mutual.avatar_url} alt={mutual.username} class="w-full h-full object-cover" />
										{:else}
											{mutual.username?.charAt(0).toUpperCase()}
										{/if}
									</div>
									<div class="min-w-0 pr-1">
										<p class="text-xs font-black text-pink-950 truncate">@{mutual.username}</p>
										<p class="text-[10px] text-pink-400 font-bold truncate">{mutual.email}</p>
									</div>
								</button>

								<button
									onclick={() => viewUserProfile(mutual)}
									class="px-2.5 py-1 bg-white border border-pink-200 text-pink-500 font-black text-[11px] rounded-lg hover:bg-pink-50 transition-all cursor-pointer shadow-2xs"
								>
									Profile
								</button>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- TAB 3: MOOD SUMMARY -->
			{#if activeTab === 'mood' && (profileData.is_self || !isTargetPrivate)}
				<div class="bg-white rounded-2xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(244,114,182,0.08)] border border-pink-100/90 space-y-3 animate-fade-in">
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0">
							<h3 class="text-sm font-black text-pink-950 truncate">
								Mood Insights & Reflection
							</h3>
							<p class="text-[11px] text-pink-400 font-bold truncate">
								{profileData.is_self ? 'System feedback based on your overall mood logs' : 'System feedback based on overall mood logs'}
							</p>
						</div>

						{#if profileData.is_self}
							<button
								onclick={() => goto('/mood-graph')}
								class="px-3 py-1 bg-[#f43f8e] hover:bg-[#e0337f] text-white font-black text-[11px] rounded-lg shadow-2xs active:scale-95 transition-all cursor-pointer flex-shrink-0"
							>
								Full Graph
							</button>
						{/if}
					</div>

					<!-- Dominant Moods Container -->
					<div class="p-3 bg-pink-50/20 border border-pink-100 rounded-xl space-y-2 shadow-2xs">
						<p class="text-[9px] font-black uppercase tracking-wider text-[#f43f8e]">
							DOMINANT MOODS (TIED)
						</p>

						<div class="flex items-center gap-1.5 flex-wrap">
							<div class="px-2.5 py-0.5 bg-amber-50 text-amber-900 border border-amber-200 font-black text-[11px] rounded-full flex items-center space-x-1 shadow-2xs">
								<span>😊</span>
								<span>Happy 3</span>
							</div>

							<div class="px-2.5 py-0.5 bg-sky-50 text-sky-900 border border-sky-200 font-black text-[11px] rounded-full flex items-center space-x-1 shadow-2xs">
								<span>😢</span>
								<span>Sad 3</span>
							</div>

							<div class="px-2.5 py-0.5 bg-purple-50 text-purple-900 border border-purple-200 font-black text-[11px] rounded-full flex items-center space-x-1 shadow-2xs">
								<span>8 Logs</span>
							</div>
						</div>

						<!-- System Feedback Quote -->
						<div class="p-2.5 bg-white border border-pink-100 rounded-xl flex items-start space-x-2 shadow-2xs">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 text-[#f43f8e] flex-shrink-0 mt-0.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
							</svg>
							<p class="text-xs text-pink-950/80 font-bold italic leading-relaxed">
								"{getSystemFeedbackMessage(dominantMood, dominantMoods)}"
							</p>
						</div>
					</div>
				</div>
			{/if}

		{/if}
	</main>

	<!-- Unfriend Confirmation Modal -->
	{#if showUnfriendModal && unfriendTarget}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in"
			onclick={(e) => { if (e.target === e.currentTarget) showUnfriendModal = false; }}
		>
			<div class="bg-white border border-pink-100 rounded-3xl max-w-sm w-full p-5 sm:p-6 text-center animate-modal-content shadow-2xl space-y-3.5">
				<div class="w-12 h-12 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto border border-rose-100 shadow-xs">
					<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
						<path fill-rule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.256 1.478l-.209-.035-1.005 13.07a3 3 0 01-2.991 2.77H8.084a3 3 0 01-2.991-2.77L4.088 6.66l-.209.035a.75.75 0 01-.256-1.478A48.567 48.567 0 017.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 013.369 0c1.603.051 2.815 1.387 2.815 2.951zm-6.136-1.452a51.196 51.196 0 00-3.273 0C6.39 3.05 6 3.678 6 4.478v.113a49.488 49.488 0 0012 0v-.113c0-.8-.39-1.428-1.091-1.452a51.196 51.196 0 00-3.273 0zM9.75 9.75a.75.75 0 01.75.75v6.75a.75.75 0 01-1.5 0v-6.75a.75.75 0 01.75-.75zm4.5 0a.75.75 0 01.75.75v6.75a.75.75 0 01-1.5 0v-6.75a.75.75 0 01.75-.75z" clip-rule="evenodd" />
					</svg>
				</div>
				<div>
					<h3 class="text-sm sm:text-base font-black text-pink-950 mb-0.5">Unfriend @{unfriendTarget.username}?</h3>
					<p class="text-xs text-pink-400 font-bold leading-relaxed">
						Are you sure you want to remove <span class="text-pink-950 font-black">@{unfriendTarget.username}</span> from your friends list?
					</p>
				</div>

				<div class="flex items-center space-x-2.5 pt-1">
					<button
						type="button"
						onclick={() => showUnfriendModal = false}
						class="w-1/2 py-2.5 bg-pink-50 text-pink-700 hover:bg-pink-100 rounded-xl font-black text-xs transition-all active:scale-95 cursor-pointer border border-pink-100"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={confirmRemoveFriend}
						disabled={isUnfriending}
						class="w-1/2 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50 shadow-md"
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
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in"
			onclick={(e) => { if (e.target === e.currentTarget) showBlockModal = false; }}
		>
			<div class="bg-white border border-pink-100 rounded-3xl max-w-sm w-full p-5 sm:p-6 text-center animate-modal-content shadow-2xl space-y-3.5">
				<div class="w-12 h-12 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto border border-rose-100 shadow-xs">
					<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
						<path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z" clip-rule="evenodd" />
					</svg>
				</div>
				<div>
					<h3 class="text-sm sm:text-base font-black text-pink-950 mb-0.5">Block @{blockTarget.username || 'User'}?</h3>
					<p class="text-xs text-pink-400 font-bold leading-relaxed">
						They will no longer be able to message you or see your profile.
					</p>
				</div>

				<div class="flex items-center space-x-2.5 pt-1">
					<button
						type="button"
						onclick={() => showBlockModal = false}
						class="w-1/2 py-2.5 bg-pink-50 text-pink-700 hover:bg-pink-100 rounded-xl font-black text-xs transition-all active:scale-95 cursor-pointer border border-pink-100"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={confirmBlockUser}
						disabled={isBlocking}
						class="w-1/2 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50 shadow-md"
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

	<!-- Add / Edit Note Modal (Matching Screenshot 4) -->
	{#if showNoteModal}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in"
			onclick={(e) => { if (e.target === e.currentTarget) showNoteModal = false; }}
		>
			<div class="bg-white border border-pink-100 rounded-3xl max-w-sm w-full p-5 sm:p-6 text-center animate-modal-content relative shadow-2xl space-y-3.5">
				<!-- Chat Icon on Top -->
				<div class="w-11 h-11 bg-pink-50 text-[#f43f8e] border border-pink-100 rounded-full flex items-center justify-center mx-auto shadow-xs">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-.818-.818 5.969 5.969 0 011.057-3.035C4.646 15.657 4 13.916 4 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
					</svg>
				</div>

				<div>
					<h3 class="text-base sm:text-lg font-black text-[#f43f8e]">
						{userNote ? 'Edit Note' : 'Add Note'}
					</h3>
					<p class="text-xs text-pink-400 font-bold mt-0.5 leading-relaxed">
						Share a quick thought that will float right above your profile photo!
					</p>
				</div>

				<!-- 24h Expiration Timer -->
				<div class="p-2.5 bg-pink-50/50 border border-pink-200/80 rounded-xl flex items-center justify-between shadow-2xs">
					<span class="flex items-center gap-1.5 text-xs font-black text-[#f43f8e]">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-3.5 h-3.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						24h Expiration:
					</span>
					<span class="font-black text-pink-950 border border-pink-200 bg-white px-2 py-0.5 rounded-lg text-xs font-mono">{noteCountdownTimer}</span>
				</div>

				<div class="relative">
					<textarea
						bind:value={noteInputText}
						maxlength="60"
						placeholder="Add a note..."
						class="w-full px-3.5 py-2.5 bg-white border border-pink-200 rounded-xl text-xs font-bold text-pink-950 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/30 transition-all resize-none shadow-2xs"
						rows="2"
					></textarea>
					<span class="block text-right text-[10px] text-pink-400 font-bold mt-0.5">
						{noteInputText.length}/60
					</span>
				</div>

				<div class="flex items-center space-x-2 pt-1">
					{#if userNote}
						<button
							type="button"
							onclick={deleteUserNote}
							class="flex-1 py-2.5 bg-pink-50 text-rose-500 hover:bg-rose-100/70 rounded-xl font-black text-xs transition-all cursor-pointer border border-pink-100 active:scale-95"
						>
							Delete
						</button>
					{/if}
					<button
						type="button"
						onclick={() => showNoteModal = false}
						class="flex-1 py-2.5 bg-pink-50 text-pink-700 hover:bg-pink-100 rounded-xl font-black text-xs transition-all cursor-pointer border border-pink-100 active:scale-95"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={saveUserNote}
						class="flex-1 py-2.5 bg-[#f43f8e] hover:bg-[#e0337f] text-white rounded-xl font-black text-xs transition-all active:scale-95 cursor-pointer shadow-md"
					>
						Save Note
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- View Other User's Note Popup -->
	{#if viewingUserNote && !profileData.is_self && userNote}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed inset-0 bg-black/40 backdrop-blur-xs z-[110] flex items-center justify-center p-4 animate-fade-in"
			onclick={(e) => { if (e.target === e.currentTarget) viewingUserNote = false; }}
		>
			<div class="bg-white border border-pink-100 rounded-2xl max-w-xs w-full overflow-hidden shadow-xl animate-modal-content">
				<!-- Header -->
				<div class="p-3.5 flex items-center gap-2.5 border-b border-pink-100">
					<div class="w-8 h-8 rounded-full bg-pink-200 flex items-center justify-center overflow-hidden flex-shrink-0">
						{#if profileData.user.avatar_url}
							<img src={profileData.user.avatar_url} alt={profileData.user.username} class="w-full h-full object-cover" />
						{:else}
							<span class="text-pink-700 font-bold text-xs">{profileData.user.username.charAt(0).toUpperCase()}</span>
						{/if}
					</div>
					<div class="flex-grow min-w-0">
						<p class="font-black text-pink-950 text-xs truncate">@{profileData.user.username}</p>
						<p class="text-[9px] text-pink-400 font-bold">Note</p>
					</div>
					<button
						type="button"
						aria-label="Close"
						onclick={() => viewingUserNote = false}
						class="p-1 text-pink-400 hover:text-pink-700 rounded-full"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				<!-- Note content -->
				<div class="p-3.5 space-y-2.5">
					<div class="bg-pink-50 border border-pink-200 rounded-xl p-2.5 text-xs font-bold text-pink-900 leading-relaxed">
						"{userNote}"
					</div>

					<div class="flex items-center justify-between p-1.5 bg-pink-50/50 rounded-lg border border-pink-100 text-[10px] font-bold text-pink-600">
						<span>Expires in:</span>
						<span class="font-mono text-pink-900 font-bold">{noteCountdownTimer}</span>
					</div>
				</div>

				<div class="px-3.5 pb-3.5 flex gap-2">
					<button
						onclick={() => { viewingUserNote = false; openChatWithUser(profileData.user, userNote); }}
						class="flex-grow py-2 bg-[#f43f8e] hover:bg-[#e0337f] text-white rounded-xl font-black text-xs transition-all active:scale-95 shadow-xs"
					>
						Reply in Chat
					</button>
					<button
						type="button"
						onclick={() => viewingUserNote = false}
						class="px-3.5 py-2 border border-pink-200 text-pink-600 hover:bg-pink-50 rounded-xl font-black text-xs transition-all active:scale-95"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Toast Notification Banner -->
	{#if showToast}
		<div class="fixed bottom-24 right-5 z-50 animate-bounce">
			<div class="px-4 py-3 rounded-2xl shadow-xl flex items-center space-x-2.5 {toastType === 'error' ? 'bg-gradient-to-r from-rose-500 to-pink-600 text-white border border-rose-300/40 shadow-pink-500/20' : 'bg-gradient-to-r from-[#f43f8e] to-pink-500 text-white border border-pink-300/40 shadow-pink-500/20'}">
				<span class="text-xs sm:text-sm font-black">{toastMessage}</span>
			</div>
		</div>
	{/if}

	<!-- Bottom Navigation Bar (Footer) -->
	<AppFooter />
</div>
