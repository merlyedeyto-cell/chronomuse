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
	import { compressImage } from '$lib/imageOptimizer.js';
	import {
		User, Ban, Camera, Check, Link, Pencil, Clock, X, UserPlus,
		MessageSquare, Users, Calendar, Info, BarChart3, Heart, Search,
		UserCircle, MessageCircle, Trash2
	} from 'lucide-svelte';

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
			const optimizedFile = await compressImage(file, { maxWidth: 1280, maxHeight: 720, quality: 0.80, outputType: 'image/webp' });
			const reader = new FileReader();
			const dataUrlPromise = new Promise((resolve) => {
				reader.onload = (readerEvent) => {
					resolve(readerEvent.target?.result?.toString() || '');
				};
			});
			reader.readAsDataURL(optimizedFile);
			const dataUrl = await dataUrlPromise;

			const fileExt = optimizedFile.name.split('.').pop() || 'webp';
			const filePath = `covers/${currentUser.id}_${Date.now()}.${fileExt}`;

			let finalCoverUrl = null;

			// Try avatars bucket first
			const { error: uploadError } = await supabase.storage
				.from('avatars')
				.upload(filePath, optimizedFile, { upsert: true });

			if (!uploadError) {
				const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
				finalCoverUrl = data?.publicUrl;
			} else {
				// Fallback to memories bucket
				const { error: memError } = await supabase.storage
					.from('memories')
					.upload(filePath, optimizedFile, { upsert: true });

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

	let lastLoadedTargetId = $state(/** @type {string|null} */ (undefined));

	// Automatically reload profile & mood insights when navigating to any user (stalking/viewing profiles)
	$effect(() => {
		const currentUrlId = $page.url.searchParams.get('id') || $page.url.searchParams.get('user_id') || '';
		if (lastLoadedTargetId === undefined || currentUrlId !== lastLoadedTargetId) {
			lastLoadedTargetId = currentUrlId;
			// Immediately clear previous user's mood stats and set loading
			isLoadingMoods = true;
			dominantMoods = [];
			dominantMood = '';
			dominantMoodCount = 0;
			totalMoodLogs = 0;
			moodSummary = {
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
			};
			loadProfile(currentUrlId || null, false);
		}
	});

	$effect(() => {
		if (showEditProfileModal || showUnfriendModal || showBlockModal || showNoteModal || viewingUserNote) {
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = '';
		}
		return () => {
			document.body.style.overflow = '';
		};
	});

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
		if (!isSilent) {
			isLoadingMoods = true;
		}
		try {
			const res = await fetch(`${API_ENDPOINTS.getMoodData}?user_id=${effectiveId}&period=all`);
			const data = await res.json();
			const moods = data.success && Array.isArray(data.data) ? data.data : [];

			const stats = /** @type {Record<string, number>} */ ({
				happy: 0,
				sad: 0,
				excited: 0,
				angry: 0,
				calm: 0,
				anxious: 0,
				grateful: 0,
				lonely: 0,
				love: 0,
				neutral: 0
			});
			let total = 0;

			moods.forEach((/** @type {any} */ m) => {
				const tag = (m.mood_tag || '').toLowerCase().trim();
				if (tag && stats.hasOwnProperty(tag)) {
					stats[tag]++;
					total++;
				}
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
					fetchUserMoodSummary(data.data.user.id, isSilent);
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
		updateNoteTimer();
		noteTimerInterval = setInterval(updateNoteTimer, 1000);

		const handleWindowFocus = () => {
			const activeId = targetUserId || $page.url.searchParams.get('id') || $page.url.searchParams.get('user_id') || currentUser?.id;
			if (activeId) {
				loadProfile(activeId, true);
			}
		};

		window.addEventListener('focus', handleWindowFocus);

		const autoSyncTimer = setInterval(() => {
			if (typeof document !== 'undefined' && document.hidden) return;
			const activeId = targetUserId || $page.url.searchParams.get('id') || $page.url.searchParams.get('user_id') || currentUser?.id;
			if (activeId) {
				loadProfile(activeId, true);
			}
		}, 60000);

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
			window.removeEventListener('focus', handleWindowFocus);
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
			const optimizedFile = await compressImage(file, { maxWidth: 400, maxHeight: 400, quality: 0.80, outputType: 'image/webp' });
			let dataUrl = '';
			const reader = new FileReader();
			const readerPromise = new Promise((resolve) => {
				reader.onload = (readerEvent) => {
					dataUrl = readerEvent.target?.result?.toString() || '';
					resolve(dataUrl);
				};
			});
			reader.readAsDataURL(optimizedFile);

			const fileExt = optimizedFile.name.split('.').pop() || 'webp';
			const filePath = `avatars/${currentUser.id}_${Date.now()}.${fileExt}`;

			let avatarUrl = null;

			// Try avatars bucket first
			const { error: uploadError } = await supabase.storage
				.from('avatars')
				.upload(filePath, optimizedFile, { upsert: true });

			if (!uploadError) {
				const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
				avatarUrl = data?.publicUrl;
			} else {
				// Fallback to memories bucket
				const { error: memError } = await supabase.storage
					.from('memories')
					.upload(filePath, optimizedFile, { upsert: true });

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
		if (!profileData || profileData.is_self || isSaving || !currentUser) return;
		isSaving = true;
		playClickSound();

		try {
			const res = await fetch(API_ENDPOINTS.sendFriendRequest, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: currentUser.id,
					sender_id: currentUser.id,
					receiver_id: profileData.user.id,
					friend_id: profileData.user.id
				})
			});

			const data = await res.json();
			if (data.success || !data.error) {
				profileData.has_pending_request = true;
				profileData.pending_request_sender_id = currentUser.id;
				showNotification('Friend request sent!');
				broadcastFriendEvent(currentUser.id, profileData.user.id, 'friend_request');
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_friend_change'));
				}
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
		if (!profileData || isSaving || !currentUser) return;
		isSaving = true;
		playClickSound();

		try {
			const res = await fetch(API_ENDPOINTS.cancelFriendRequest, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: currentUser.id,
					sender_id: currentUser.id,
					receiver_id: profileData.user.id,
					friend_id: profileData.user.id
				})
			});

			const data = await res.json();
			if (data.success || !data.error) {
				profileData.has_pending_request = false;
				profileData.pending_request_sender_id = null;
				showNotification('Friend request cancelled');
				broadcastFriendEvent(currentUser.id, profileData.user.id, 'request_cancelled');
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_friend_change'));
				}
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

	function getMoodBadgeStyle(moodTag) {
		switch ((moodTag || '').toLowerCase()) {
			case 'happy': return 'bg-amber-50 text-amber-900 border-amber-200';
			case 'sad': return 'bg-sky-50 text-sky-900 border-sky-200';
			case 'excited': return 'bg-orange-50 text-orange-900 border-orange-200';
			case 'calm': return 'bg-emerald-50 text-emerald-900 border-emerald-200';
			case 'love': return 'bg-rose-50 text-rose-900 border-rose-200';
			case 'angry': return 'bg-red-50 text-red-900 border-red-200';
			case 'grateful': return 'bg-pink-50 text-pink-900 border-pink-200';
			case 'anxious': return 'bg-purple-50 text-purple-900 border-purple-200';
			case 'lonely': return 'bg-slate-50 text-slate-900 border-slate-200';
			case 'neutral': return 'bg-gray-50 text-gray-900 border-gray-200';
			default: return 'bg-pink-50 text-pink-900 border-pink-200';
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
	<main class="flex-grow container mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-8 pb-24 sm:pb-28 max-w-4xl lg:max-w-5xl xl:max-w-6xl space-y-3.5 sm:space-y-4">
		{#if !profileData && (isLoading || !isProfileNotFound)}
			<div class="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start animate-pulse">
				<!-- Left Column Skeleton: Profile Header -->
				<div class="lg:col-span-5 space-y-4">
					<div class="bg-white rounded-3xl overflow-hidden border border-pink-100 shadow-sm">
						<div class="h-32 sm:h-44 bg-pink-100/70"></div>
						<div class="px-5 pb-5 -mt-12 sm:-mt-16 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
							<div class="flex items-end space-x-3">
								<div class="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 border-white bg-pink-200/80 shadow-md flex-shrink-0"></div>
								<div class="space-y-1.5 pb-1">
									<div class="h-4 w-32 bg-pink-200/70 rounded"></div>
									<div class="h-3 w-20 bg-pink-100/80 rounded"></div>
								</div>
							</div>
							<div class="h-8 w-28 bg-pink-100/80 rounded-xl"></div>
						</div>
					</div>
				</div>

				<!-- Right Column Skeleton: Tabs (mobile) + Cards -->
				<div class="lg:col-span-7 space-y-4">
					<div class="flex lg:hidden space-x-2 bg-pink-100/50 p-1 rounded-xl">
						<div class="flex-1 h-8 bg-white/80 rounded-lg"></div>
						<div class="flex-1 h-8 bg-pink-100/60 rounded-lg"></div>
						<div class="flex-1 h-8 bg-pink-100/60 rounded-lg"></div>
					</div>

					<div class="bg-white rounded-2xl p-5 border border-pink-100 shadow-xs space-y-3">
						<div class="h-4 w-40 bg-pink-200/70 rounded"></div>
						<div class="h-16 bg-pink-50 rounded-xl"></div>
					</div>
					<div class="hidden lg:block bg-white rounded-2xl p-5 border border-pink-100 shadow-xs space-y-3">
						<div class="h-4 w-32 bg-pink-200/70 rounded"></div>
						<div class="h-20 bg-pink-50 rounded-xl"></div>
					</div>
				</div>
			</div>
		{:else if !profileData}
			<div class="bg-white rounded-2xl p-6 border border-pink-100 shadow-[0_4px_20px_rgba(244,114,182,0.1)] flex flex-col items-center justify-center text-center space-y-3">
				<div class="w-12 h-12 bg-pink-50 text-[#f43f8e] rounded-full flex items-center justify-center mx-auto border border-pink-100 shadow-xs">
					<User class="w-6 h-6" strokeWidth={2} />
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
					<Ban class="w-7 h-7" strokeWidth={2} />
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
						<Ban class="w-3.5 h-3.5" strokeWidth={2} />
						<span>Unblock @{profileData.user.username}</span>
					</button>
				{/if}
			</div>
		{:else}
			<!-- Literal 2-Column Layout Grid (Desktop: Left = Profile Header, Right = 3 Cards) -->
			<div class="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
				
				<!-- COLUMN 1 (Desktop Left Column: Profile Header Card) -->
				<div class="lg:col-span-5 xl:col-span-5 lg:sticky lg:top-20 flex flex-col gap-4">
					<div class="bg-white rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(244,114,182,0.1)] border border-pink-100/90 relative">
						<!-- Cover Banner Background -->
						<div class="relative h-44 sm:h-52 lg:h-44 w-full bg-gradient-to-tr from-[#3b82f6] via-[#ec4899] to-[#8b5cf6] overflow-hidden group">
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
										<Camera class="w-4 h-4" />
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
										{:else}
											<button 
												type="button"
												class="absolute -top-7 left-0 z-20 bg-white/95 backdrop-blur-xs px-2.5 py-0.5 rounded-full border-2 border-pink-200 text-[11px] font-black text-[#f43f8e] shadow-md flex items-center space-x-1 cursor-pointer hover:scale-105 active:scale-95 transition-all whitespace-nowrap hover:bg-pink-50"
												onclick={openNoteModal}
												title="Add a note"
											>
												<span>+ Note</span>
												<div class="absolute -bottom-1 left-4 w-1.5 h-1.5 bg-white border-r-2 border-b-2 border-pink-200 rotate-45"></div>
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

									<!-- Avatar Camera Badge -->
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
												<Camera class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
											{/if}
										</label>
									{/if}
								</div>

								<!-- Action buttons -->
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
												<Check class="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#f43f8e] flex-shrink-0" strokeWidth={2.5} />
												<span class="text-[#f43f8e] font-black hidden sm:inline">Link Copied!</span>
											{:else}
												<Link class="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#f43f8e] flex-shrink-0" strokeWidth={2.2} />
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
											<Pencil class="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#f43f8e] flex-shrink-0" strokeWidth={2.2} />
											<span class="hidden sm:inline">Edit Profile</span>
										</button>
									</div>
								{:else}
									<div class="flex items-center gap-1 sm:gap-1.5 flex-nowrap flex-shrink-0">
										<button
											type="button"
											onclick={handleCopyProfileLink}
											class="p-1.5 sm:px-3 sm:py-1.5 bg-pink-50 hover:bg-pink-100 border border-pink-200/90 text-pink-700 text-[11px] sm:text-xs font-bold rounded-full transition-all active:scale-95 shadow-2xs flex items-center justify-center space-x-1 cursor-pointer"
											title="Share Profile Link"
											aria-label="Share Profile Link"
										>
											{#if isCopiedLink}
												<Check class="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#f43f8e] flex-shrink-0" strokeWidth={2.5} />
												<span class="text-[#f43f8e] font-black hidden sm:inline">Copied!</span>
											{:else}
												<Link class="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#f43f8e] flex-shrink-0" strokeWidth={2.2} />
												<span class="hidden sm:inline">Share</span>
											{/if}
										</button>
										{#if profileData.has_pending_request}
											<button
												type="button"
												onclick={cancelFriendRequestOnProfile}
												disabled={isSaving}
												class="group px-2.5 py-1.5 sm:px-3.5 sm:py-1.5 bg-amber-50 hover:bg-rose-50 text-amber-700 hover:text-rose-600 border border-amber-200 hover:border-rose-200 text-[11px] sm:text-xs font-black rounded-full transition-all cursor-pointer active:scale-95 shadow-2xs flex items-center space-x-1"
												title="Click to cancel friend request"
											>
												<Clock class="w-3.5 h-3.5 text-amber-600 group-hover:hidden flex-shrink-0" strokeWidth={2.2} />
												<X class="w-3.5 h-3.5 text-rose-500 hidden group-hover:inline flex-shrink-0" strokeWidth={2.2} />
												<span class="group-hover:hidden whitespace-nowrap"><span class="hidden sm:inline">Request </span>Pending</span>
												<span class="hidden group-hover:inline whitespace-nowrap">Cancel<span class="hidden sm:inline"> Request</span></span>
											</button>
										{:else if !profileData.is_friend}
											<button
												type="button"
												onclick={sendFriendRequestToTargetUser}
												disabled={isSaving}
												class="px-2.5 py-1.5 sm:px-3.5 sm:py-1.5 bg-[#f43f8e] hover:bg-[#e0337f] text-white font-black text-[11px] sm:text-xs rounded-full transition-all shadow-xs active:scale-95 cursor-pointer flex items-center space-x-1"
											>
												<UserPlus class="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.2} />
												<span class="whitespace-nowrap">Add Friend</span>
											</button>
										{:else}
											<button
												type="button"
												onclick={() => promptRemoveFriend(profileData.user)}
												class="px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-black text-[11px] sm:text-xs rounded-full transition-all cursor-pointer whitespace-nowrap"
											>
												Friends
											</button>
										{/if}
										<button
											type="button"
											onclick={() => openChatWithUser(profileData.user)}
											class="px-2.5 py-1.5 sm:px-3.5 sm:py-1.5 bg-[#f43f8e] hover:bg-[#e0337f] text-white font-black text-[11px] sm:text-xs rounded-full transition-all shadow-xs active:scale-95 cursor-pointer flex items-center space-x-1"
										>
											<MessageSquare class="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.2} />
											<span class="whitespace-nowrap">Message</span>
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
									<Users class="w-3 h-3" strokeWidth={2} />
									<span>{profileData.total_friends !== null && profileData.total_friends !== undefined ? `${profileData.total_friends} Friends` : '0 Friends'}</span>
								</button>

								{#if profileData.user.created_at}
									<div class="px-2.5 py-1 bg-pink-50 border border-pink-200 text-[#f43f8e] text-[11px] font-black rounded-xl flex items-center space-x-1">
										<Calendar class="w-3 h-3" strokeWidth={2} />
										<span>Joined {formatDate(profileData.user.created_at)}</span>
									</div>
								{/if}

								<div class="px-2.5 py-1 bg-pink-50 border border-pink-200 text-[#059669] text-[11px] font-black rounded-xl flex items-center space-x-1">
									<span class="w-1.5 h-1.5 rounded-full {formatLastActive(profileData.user.last_activity) === 'Active now' || formatLastActive(profileData.user.last_activity) === 'Active just now' ? 'bg-[#10b981] animate-pulse' : 'bg-pink-300'}"></span>
									<span>{formatLastActive(profileData.user.last_activity)}</span>
								</div>
							</div>

							<!-- Desktop-only Merged About You Section Inside Header Card -->
							<div class="hidden lg:block pt-3 mt-2 border-t border-pink-100/90 space-y-2.5">
								<div class="flex items-center space-x-1.5 text-xs font-black text-pink-950">
									<User class="w-3.5 h-3.5 text-[#f43f8e]" strokeWidth={2.2} />
									<span>About {profileData.is_self ? 'You' : `@${profileData.user.username}`}</span>
								</div>

								<!-- Bio Quote Block or Add Bio Button -->
								{#if profileData.user.bio}
									<div class="p-2.5 bg-pink-50/50 border border-pink-100 rounded-xl">
										<p class="text-xs text-pink-950 font-bold leading-relaxed italic">
											"{profileData.user.bio}"
										</p>
									</div>
								{:else if profileData.is_self}
									<button
										type="button"
										onclick={openEditProfileModal}
										class="w-full py-2 border border-dashed border-pink-300 hover:border-[#f43f8e] bg-pink-50/30 hover:bg-pink-50 text-[#f43f8e] font-black text-[11px] rounded-xl flex items-center justify-center space-x-1 transition-all cursor-pointer"
									>
										+ Add your Bio & Personal Details
									</button>
								{/if}

								<!-- Subcards for Relationship, Birthday, Gender -->
								<div class="space-y-1.5">
									<!-- Relationship Status Card -->
									<div class="p-2 bg-pink-50/30 border border-pink-100 rounded-xl flex items-center space-x-2.5 shadow-2xs">
										<div class="w-7 h-7 rounded-lg bg-pink-100/70 text-[#f43f8e] border border-pink-200/60 flex items-center justify-center flex-shrink-0">
											<Heart class="w-3.5 h-3.5" />
										</div>
										<div class="min-w-0">
											<p class="text-[8px] font-black text-pink-400 uppercase tracking-wider">RELATIONSHIP STATUS</p>
											<p class="text-[11px] font-black text-pink-950 truncate">
												{profileData.user.relationship_status || 'In a relationship'}
											</p>
										</div>
									</div>

									<!-- Birthday Card -->
									<div class="p-2 bg-pink-50/30 border border-pink-100 rounded-xl flex items-center space-x-2.5 shadow-2xs">
										<div class="w-7 h-7 rounded-lg bg-pink-100/70 text-[#f43f8e] border border-pink-200/60 flex items-center justify-center flex-shrink-0">
											<Calendar class="w-3.5 h-3.5" strokeWidth={2} />
										</div>
										<div class="min-w-0">
											<p class="text-[8px] font-black text-pink-400 uppercase tracking-wider">BIRTHDAY</p>
											<p class="text-[11px] font-black text-pink-950 truncate">
												{profileData.user.birthday ? formatBirthday(profileData.user.birthday) : 'April 12, 2005'}
											</p>
										</div>
									</div>

									<!-- Gender Card -->
									{#if profileData.user.gender && profileData.user.gender !== 'Prefer not to say'}
										<div class="p-2 bg-pink-50/30 border border-pink-100 rounded-xl flex items-center space-x-2.5 shadow-2xs">
											<div class="w-7 h-7 rounded-lg bg-pink-100/70 text-[#f43f8e] border border-pink-200/60 flex items-center justify-center flex-shrink-0">
												<User class="w-3.5 h-3.5" strokeWidth={2} />
											</div>
											<div class="min-w-0">
												<p class="text-[8px] font-black text-pink-400 uppercase tracking-wider">GENDER</p>
												<p class="text-[11px] font-black text-pink-950 truncate">
													{profileData.user.gender}
												</p>
											</div>
										</div>
									{/if}
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- COLUMN 2 (Desktop Right Column: Mobile Tab Switcher + Cards) -->
				<div class="lg:col-span-7 xl:col-span-7 flex flex-col gap-4 sm:gap-5">
					
					<!-- Mobile-only Centered Tab Switcher Bar -->
					<div class="lg:hidden bg-white rounded-xl p-1 shadow-[0_2px_12px_rgba(244,114,182,0.08)] border border-pink-100/90 flex items-center justify-between gap-1">
						<button
							type="button"
							onclick={() => activeTab = 'about'}
							class="flex-1 py-1.5 px-2 rounded-lg text-xs font-black transition-all flex items-center justify-center space-x-1 cursor-pointer {activeTab === 'about' ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-500 hover:text-pink-700'}"
						>
							<User class="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
							<span>About {profileData.is_self ? 'You' : ''}</span>
						</button>

						<button
							type="button"
							onclick={() => activeTab = 'friends'}
							class="flex-1 py-1.5 px-2 rounded-lg text-xs font-black transition-all flex items-center justify-center space-x-1 cursor-pointer {activeTab === 'friends' ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-500 hover:text-pink-700'}"
						>
							<Users class="w-3.5 h-3.5 flex-shrink-0" />
							<span>Friends {profileData.total_friends !== null && profileData.total_friends !== undefined ? `(${profileData.total_friends})` : ''}</span>
						</button>

						{#if profileData.is_self || !isTargetPrivate}
							<button
								type="button"
								onclick={() => activeTab = 'mood'}
								class="flex-1 py-1.5 px-2 rounded-lg text-xs font-black transition-all flex items-center justify-center space-x-1 cursor-pointer {activeTab === 'mood' ? 'bg-[#f43f8e] text-white shadow-xs' : 'text-pink-500 hover:text-pink-700'}"
							>
								<BarChart3 class="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
								<span class="truncate">Mood Insights</span>
							</button>
						{/if}
					</div>

					<!-- CARD 1: ABOUT YOU (Mobile Only, since merged into Left Header on Desktop) -->
					<div class="{activeTab === 'about' ? 'block' : 'hidden'} lg:hidden bg-white rounded-2xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(244,114,182,0.08)] border border-pink-100/90 space-y-3 animate-fade-in">
						<div class="flex items-center space-x-2.5">
							<User class="w-4 h-4 text-[#f43f8e]" strokeWidth={2} />
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
									<Heart class="w-4 h-4" />
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
									<Calendar class="w-4 h-4" strokeWidth={2} />
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
										<User class="w-4 h-4" strokeWidth={2} />
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

					<!-- CARD 2: FRIENDS LIST -->
					<div class="{activeTab === 'friends' ? 'block' : 'hidden'} lg:block bg-white rounded-2xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(244,114,182,0.08)] border border-pink-100/90 space-y-3 animate-fade-in">
						<div>
							<h3 class="text-sm font-black text-pink-950">
								{profileData.is_self ? 'My Friends' : `@${profileData.user.username}'s Friends`}
							</h3>
							<p class="text-[11px] text-pink-400 font-bold">{profileData.total_friends !== null && profileData.total_friends !== undefined ? `${profileData.total_friends} total connections` : '0 total connections'}</p>
						</div>

						<!-- Search Friends Input -->
						<div class="relative">
							<input
								type="text"
								bind:value={friendsSearch}
								placeholder="Search friends..."
								class="w-full pl-8 pr-3.5 py-2 bg-white border border-pink-200 rounded-xl text-xs font-bold text-pink-950 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/30 transition-all"
							/>
							<Search class="w-3.5 h-3.5 text-pink-400 absolute left-2.5 top-2.5" strokeWidth={2} />
						</div>

						{#if filteredFriends.length === 0}
							<div class="text-center py-7 bg-pink-50/30 border border-dashed border-pink-200 rounded-xl">
								<div class="w-9 h-9 bg-white text-[#f43f8e] rounded-xl border border-pink-100 flex items-center justify-center mx-auto mb-1.5 shadow-2xs">
									<Users class="w-4 h-4 text-[#f43f8e]" strokeWidth={2} />
								</div>
								<p class="text-xs font-bold text-pink-400">
									{friendsSearch ? 'No friends matched your search.' : 'No friends yet.'}
								</p>
							</div>
						{:else}
							<!-- Modern Profile Cards Grid (4 Columns, Borderless & Slightly Darker Tint) -->
							<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-2.5 max-h-[600px] overflow-y-auto pr-1">
								{#each filteredFriends as friend}
									<div class="bg-[#fcdde9] hover:bg-[#f8cadc] rounded-2xl p-2 transition-all duration-300 flex flex-col justify-between group relative border-0">
										<!-- Rounded Photo Container -->
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
												onclick={() => viewUserProfile(friend)}
												class="p-1 text-pink-500 hover:text-[#f43f8e] transition-colors active:scale-90 flex items-center justify-center cursor-pointer"
												title="View @{friend.username}'s Profile"
											>
												<UserCircle class="w-4 h-4" strokeWidth={2} />
											</button>

											{#if String(friend.id || friend.friend_id || friend.user_id) === String(currentUser?.id)}
												<span class="text-[10px] font-black text-[#f43f8e]">
													You
												</span>
											{:else}
												<button
													type="button"
													onclick={() => openChatWithUser(friend)}
													class="p-1 text-[#f43f8e] hover:text-[#e0337f] transition-colors active:scale-90 flex items-center justify-center cursor-pointer"
													title="Chat with @{friend.username}"
												>
													<MessageSquare class="w-4 h-4" strokeWidth={2} />
												</button>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>

					<!-- MUTUAL FRIENDS CARD (if not self and has mutual friends) -->
					{#if !profileData.is_self && profileData.mutual_friends && profileData.mutual_friends.length > 0}
						<div class="{activeTab === 'mutual' || activeTab === 'friends' ? 'block' : 'hidden'} lg:block bg-white rounded-2xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(244,114,182,0.08)] border border-pink-100/90 space-y-3 animate-fade-in">
							<div>
								<h3 class="text-sm font-black text-pink-950">Mutual Friends</h3>
								<p class="text-[11px] text-pink-400 font-bold">You and @{profileData.user.username} both know these people</p>
							</div>

							<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-2.5 max-h-[400px] overflow-y-auto pr-1">
								{#each profileData.mutual_friends as mutual}
									<div class="bg-[#fcdde9] hover:bg-[#f8cadc] rounded-2xl p-2 transition-all duration-300 flex flex-col justify-between group border-0">
										<!-- Rounded Photo Container -->
										<div class="relative w-full aspect-square rounded-xl overflow-hidden bg-gradient-to-b from-white to-pink-50 mb-1.5 flex items-center justify-center">
											{#if mutual.avatar_url}
												<img
													src={mutual.avatar_url}
													alt={mutual.username}
													class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
												/>
											{:else}
												<div class="w-full h-full flex flex-col items-center justify-center bg-gradient-to-tr from-pink-200 via-rose-100 to-pink-300 text-[#f43f8e]">
													<span class="text-xl sm:text-2xl font-black opacity-80">{mutual.username?.charAt(0).toUpperCase()}</span>
												</div>
											{/if}
										</div>

										<!-- Middle: Name & Info -->
										<div class="space-y-0.5 mb-1 px-0.5">
											<h4 class="text-xs font-black text-pink-950 truncate group-hover:text-[#f43f8e] transition-colors">
												@{mutual.username}
											</h4>
											<p class="text-[9.5px] sm:text-[10px] text-pink-600/80 font-medium truncate leading-tight">
												{mutual.email || 'Mutual connection'}
											</p>
										</div>

										<!-- Bottom: View Profile Button (Pure Icon Only) -->
										<div class="flex items-center justify-end pt-1 mt-auto">
											<button
												type="button"
												onclick={() => viewUserProfile(mutual)}
												class="p-1 text-[#f43f8e] hover:text-[#e0337f] transition-colors flex items-center justify-center cursor-pointer active:scale-90"
												title="View @{mutual.username}'s Profile"
											>
												<UserCircle class="w-4 h-4" strokeWidth={2} />
											</button>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- CARD 3: MOOD INSIGHTS & REFLECTION -->
					{#if profileData.is_self || !isTargetPrivate}
						<div class="{activeTab === 'mood' ? 'block' : 'hidden'} lg:block bg-white rounded-2xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(244,114,182,0.08)] border border-pink-100/90 space-y-3 animate-fade-in">
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

							{#if isLoadingMoods}
								<!-- Skeleton Loader for Mood Insights & Reflection -->
								<div class="p-3 bg-pink-50/20 border border-pink-100 rounded-xl space-y-2.5 shadow-2xs animate-pulse">
									<div class="h-3 w-32 bg-pink-200/70 rounded-md"></div>
									<div class="flex items-center gap-2 flex-wrap py-0.5">
										<div class="h-6 w-28 bg-pink-200/60 rounded-full"></div>
										<div class="h-6 w-16 bg-pink-100/80 rounded-full"></div>
									</div>
									<div class="p-2.5 bg-white border border-pink-100 rounded-xl flex items-start space-x-2 shadow-2xs">
										<div class="w-3.5 h-3.5 rounded-full bg-pink-200/70 flex-shrink-0 mt-0.5"></div>
										<div class="flex-1 space-y-1.5 py-0.5">
											<div class="h-3 bg-pink-200/60 rounded w-11/12"></div>
											<div class="h-3 bg-pink-100/70 rounded w-2/3"></div>
										</div>
									</div>
								</div>
							{:else}
								<!-- Dominant Moods Container -->
								<div class="p-3 bg-pink-50/20 border border-pink-100 rounded-xl space-y-2 shadow-2xs">
									<p class="text-[9px] font-black uppercase tracking-wider text-[#f43f8e]">
										{#if dominantMoods && dominantMoods.length > 1}
											DOMINANT MOODS (TIED)
										{:else if dominantMoods && dominantMoods.length === 1}
											DOMINANT MOOD
										{:else}
											NO MOOD LOGS YET
										{/if}
									</p>

									<div class="flex items-center gap-1.5 flex-wrap">
										{#if dominantMoods && dominantMoods.length > 0}
											{#each dominantMoods as mood}
												<div class="px-2.5 py-0.5 border font-black text-[11px] rounded-full flex items-center space-x-1 shadow-2xs {getMoodBadgeStyle(mood)}">
													<span>{getMoodDynamicEmoji(mood)}</span>
													<span>{mood} {dominantMoodCount}</span>
												</div>
											{/each}
											<div class="px-2.5 py-0.5 bg-pink-100/70 text-[#f43f8e] border border-pink-200 font-black text-[11px] rounded-full flex items-center space-x-1 shadow-2xs">
												<span>{totalMoodLogs} {totalMoodLogs === 1 ? 'Log' : 'Logs'}</span>
											</div>
										{:else}
											<p class="text-xs text-pink-400 font-medium">No mood entries recorded yet.</p>
										{/if}
									</div>

									<!-- System Feedback Quote -->
									<div class="p-2.5 bg-white border border-pink-100 rounded-xl flex items-start space-x-2 shadow-2xs">
										<MessageCircle class="w-3.5 h-3.5 text-[#f43f8e] shrink-0 mt-0.5" strokeWidth={2} />
										<p class="text-xs text-pink-950/80 font-bold italic leading-relaxed">
											"{getSystemFeedbackMessage(dominantMood, dominantMoods)}"
										</p>
									</div>
								</div>
							{/if}
						</div>
					{/if}

				</div>
			</div>

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
					<Trash2 class="w-5 h-5" strokeWidth={2} />
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
					<Ban class="w-5 h-5" strokeWidth={2} />
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
					<MessageSquare class="w-5 h-5" strokeWidth={2} />
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
						<Clock class="w-3.5 h-3.5" strokeWidth={2.2} />
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
						<X class="w-3.5 h-3.5" strokeWidth={2.5} />
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
