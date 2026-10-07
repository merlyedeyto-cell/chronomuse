<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { supabase } from '$lib/supabaseClient';
	import { broadcastMemoryEvent } from '$lib/realtimeBroadcast.js';
	import AppHeader from '$lib/AppHeader.svelte';
	import AppFooter from '$lib/AppFooter.svelte';
	import Calendar from '$lib/Calendar.svelte';
	import AddMemoryCard from '$lib/AddMemoryCard.svelte';
	import PinnedMemoryCard from '$lib/PinnedMemoryCard.svelte';
	import ViewMemoryModal from '$lib/ViewMemoryModal.svelte';
	import DashboardStatsCard from '$lib/DashboardStatsCard.svelte';
	import DashboardFlashback from '$lib/DashboardFlashback.svelte';
	import DashboardClock from '$lib/DashboardClock.svelte';
	import DashboardMonthsMemoryCard from '$lib/DashboardMonthsMemoryCard.svelte';
	import { compressImage } from '$lib/mediaOptimizer.js';
	import { Plus, Bookmark, CheckCircle2, AlertCircle, Check } from 'lucide-svelte';

	let user = $state(typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('chronomuse_user') || 'null') : null);
	let isLoading = $state(false);
	let currentCalendarMonth = $state(new Date().getMonth());
	let currentCalendarYear = $state(new Date().getFullYear());
	let showAddMemory = $state(false);
	let showViewMemory = $state(false);
	let selectedDate = $state('');
	let memoriesForDate = $state([]);
	let memoriesData = $state({});
	let resetAddMemoryForm = $state(false);
	let pinnedMemoryCardRef;
	let pinnedDates = $state([]);
	let sidebarOpen = $state(false);
	let showToast = $state(false);
	let toastMessage = $state('');
	let toastType = $state('success');
	let showNotificationModalPopup = $state(false);
	let notificationModalMessage = $state('');
	let notificationModalType = $state('success');

	function showNotificationModal(msg, type = 'success') {
		notificationModalMessage = msg;
		notificationModalType = type;
		showNotificationModalPopup = true;
	}
	let showDeletePinnedModal = $state(false);
	let pinnedDateToDelete = $state(null);
	let showViewMemoryModalWrapper = $state(false);

	$effect(() => {
		if (showViewMemory || showDeletePinnedModal || showNotificationModalPopup || sidebarOpen || showViewMemoryModalWrapper) {
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = '';
		}
		return () => {
			document.body.style.overflow = '';
		};
	});

	function showMemoryToast(event) {
		toastMessage = event.detail.message;
		toastType = event.detail.type;
		showToast = true;

		setTimeout(() => {
			showToast = false;
		}, 3000);
	}

	let hasNotifications = $state(false);

	function checkNotifications() {
		if (!user || !user.id) return;
		Promise.all([
			fetch(API_ENDPOINTS.getNotifications, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: user.id })
			}).then(r => r.json()),
			fetch(API_ENDPOINTS.getChatList, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: user.id })
			}).then(r => r.json())
		])
		.then(([notifData, chatData]) => {
			const notifCount = notifData?.data?.total_notifications_count || 0;
			const unreadChats = chatData?.data?.friends?.reduce((sum, f) => sum + (f.unread_count || 0), 0) || 0;
			hasNotifications = notifCount > 0 || unreadChats > 0;
		})
		.catch(() => {});
	}

	onMount(() => {
		const storedUser = localStorage.getItem('chronomuse_user');
		if (storedUser) {
			user = JSON.parse(storedUser);
			const targetDate = $page.url.searchParams.get('date');
			const now = new Date();
			
			if (targetDate) {
				const parts = targetDate.split('-');
				if (parts.length === 3) {
					const year = parseInt(parts[0], 10);
					const month = parseInt(parts[1], 10) - 1;
					selectedDate = targetDate;
					loadMemoriesForMonth(month, year).then(() => {
						memoriesForDate = memoriesData[targetDate] || [];
						if (memoriesForDate && memoriesForDate.length > 0) {
							showViewMemory = true;
							showViewMemoryModalWrapper = true;
							showAddMemory = false;
						} else {
							showAddMemory = true;
							showViewMemory = false;
						}
					});
				} else {
					loadMemoriesForMonth(now.getMonth(), now.getFullYear());
				}
			} else {
				const y = now.getFullYear();
				const m = String(now.getMonth() + 1).padStart(2, '0');
				const d = String(now.getDate()).padStart(2, '0');
				selectedDate = `${y}-${m}-${d}`;
				loadMemoriesForMonth(now.getMonth(), now.getFullYear()).then(() => {
					memoriesForDate = memoriesData[selectedDate] || [];
				});
			}

			loadPinnedDates();
			checkNotifications();
		} else {
			goto('/');
		}
		isLoading = false;

		const handleMemoryChange = () => {
			checkNotifications();
			const now = new Date();
			loadMemoriesForMonth(now.getMonth(), now.getFullYear());
			loadPinnedDates();
			if (pinnedMemoryCardRef) pinnedMemoryCardRef.loadPinnedMemories(true);
			if (selectedDate) loadMemoriesForDate(selectedDate);
		};

		const handlePinnedChange = () => {
			loadPinnedDates();
			if (pinnedMemoryCardRef) pinnedMemoryCardRef.loadPinnedMemories(true);
		};

		let syncInterval;
		// Listen for pinned dates and memory changes
		if (browser) {
			window.addEventListener('pinnedDatesChanged', handlePinnedChange);
			window.addEventListener('chronomuse_pinned_change', handlePinnedChange);
			window.addEventListener('chronomuse_notification_change', checkNotifications);
			window.addEventListener('chronomuse_memory_change', handleMemoryChange);

			// Fallback interval to ensure memory updates across devices
			syncInterval = setInterval(() => {
				if (typeof document !== 'undefined' && document.hidden) return;
				if (selectedDate) {
					loadMemoriesForDate(selectedDate);
				}
			}, 60000);
		}

		return () => {
			if (browser) {
				if (syncInterval) clearInterval(syncInterval);
				window.removeEventListener('pinnedDatesChanged', handlePinnedChange);
				window.removeEventListener('chronomuse_pinned_change', handlePinnedChange);
				window.removeEventListener('chronomuse_notification_change', checkNotifications);
				window.removeEventListener('chronomuse_memory_change', handleMemoryChange);
			}
		};
	});

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}

	async function loadPinnedDates() {
		if (!user || !user.id) return;
		try {
			const response = await fetch(`${API_ENDPOINTS.getPinnedMemories}?user_id=${user.id}`, { cache: 'no-store' });
			const data = await response.json();

			if (data.success && data.data) {
				pinnedDates = data.data;
			}
		} catch (error) {
			console.error('Error loading pinned dates:', error);
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

	function handleAddFriend(event) {
		console.log('Add friend:', event.detail);
	}

	function handleHome(event) {
		console.log('Home:', event.detail);
	}

	function handleFriendsList(event) {
		console.log('Friends list:', event.detail);
	}

	function handleChat(event) {
		goto('/chat');
	}

	async function loadMemoriesForMonth(month, year) {
		if (!user || !user.id) return;
		try {
			const response = await fetch(`${API_ENDPOINTS.getMemoriesForMonth}?year=${year}&month=${month + 1}&user_id=${user.id}`, { cache: 'no-store' });
			const data = await response.json();

			if (data.success && data.data) {
				memoriesData = data.data;
			}
		} catch (error) {
			console.error('Error loading memories for month:', error);
		}
	}

	function handleMonthChanged(event) {
		const { month, year } = event.detail;
		currentCalendarMonth = month;
		if (year) currentCalendarYear = year;
		loadMemoriesForMonth(month, year);
	}

	function handleNavigateToMonthFromCard(event) {
		const { month, year } = event.detail;
		currentCalendarMonth = month;
		if (year) currentCalendarYear = year;
		loadMemoriesForMonth(month, year || currentCalendarYear);
	}

	function handleYearChangedFromMonthCard(event) {
		const { year } = event.detail;
		currentCalendarYear = year;
		loadMemoriesForMonth(currentCalendarMonth, year);
	}

	function handlePinDate(event) {
		const { date, month, year, isPinned } = event.detail;
		pinOrUnpinDate(date, month, year, isPinned);
	}

	async function pinOrUnpinDate(date, month, year, isPinned) {
		try {
			const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;

			const response = await fetch(API_ENDPOINTS.pinDate, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					date: dateStr,
					user_id: user.id,
					isPinned: isPinned
				})
			});
			const data = await response.json();
			
			if (data.success) {
				if (isPinned) {
					showNotificationModal('Date unpinned successfully!');
				} else {
					showNotificationModal('Date pinned successfully!');
				}
				// Refresh pinned dates
				await loadPinnedDates();
				// Refresh pinned memories card
				if (pinnedMemoryCardRef) {
					pinnedMemoryCardRef.loadPinnedMemories();
				}
			} else {
				showNotificationModal('Error: ' + (data.error || 'Failed to update pin'), 'error');
			}
		} catch (error) {
			console.error('Error updating pin:', error);
			showNotificationModal('Error updating pin. Please try again.', 'error');
		}
	}

	let addMemoryContainerRef = $state(null);

	function handleDateSelected(event) {
		const date = event.detail;
		if (date) {
			// Use local date format to avoid timezone issues
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, '0');
			const day = String(date.getDate()).padStart(2, '0');
			selectedDate = `${year}-${month}-${day}`;
			memoriesForDate = memoriesData[selectedDate] || [];
		}
		document.body.style.overflow = '';
		showAddMemory = true;
		showViewMemory = false;
		setTimeout(() => {
			if (addMemoryContainerRef) {
				addMemoryContainerRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}
		}, 150);
	}

	function handleDateWithMemoriesSelected(event) {
		const { date, memories } = event.detail;
		if (date) {
			// Use local date format to avoid timezone issues
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, '0');
			const day = String(date.getDate()).padStart(2, '0');
			selectedDate = `${year}-${month}-${day}`;
			memoriesForDate = memories || memoriesData[selectedDate] || [];
		}
		showViewMemory = true;
		showViewMemoryModalWrapper = true;
		showAddMemory = false;
	}

	function handleViewStatsMemory(event) {
		const memory = event.detail;
		if (memory && memory.date) {
			selectedDate = memory.date;
			memoriesForDate = memoriesData[memory.date] || [memory];
			showViewMemory = true;
			showViewMemoryModalWrapper = true;
			showAddMemory = false;
			// Refresh memories in background without delaying modal presentation
			loadMemoriesForDate(memory.date).then(() => {
				if (memoriesData[memory.date]) {
					memoriesForDate = memoriesData[memory.date];
				}
			});
		}
	}

	function handleSaveMemory(event) {
		const memoryData = event.detail;
		saveMemoryToDatabase(memoryData);
	}

	async function saveMemoryToDatabase(memoryData) {
		if (!selectedDate || !user?.id) return;

		let photoVideoUrl = null;
		let photoVideoType = null;
		let musicUrl = null;

		// 1. Fast Direct Upload to Supabase Storage (Bypasses Node payload limits and prevents server timeout)
		if (memoryData.photoVideo) {
			if (typeof memoryData.photoVideo === 'string') {
				photoVideoUrl = memoryData.photoVideo;
			} else {
				try {
					let file = memoryData.photoVideo;
					if (file.type?.startsWith('image/')) {
						file = await compressImage(file, { maxWidth: 1400, maxHeight: 1400, quality: 0.80, outputType: 'image/webp' });
					}
					const originalName = file.name || (file.type?.startsWith('video/') ? 'video.mp4' : 'image.webp');
					const fileExt = (originalName.split('.').pop() || (file.type?.startsWith('video/') ? 'mp4' : 'webp')).toLowerCase().replace(/[^a-z0-9]/g, '');
					const fileName = `media_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt || 'webp'}`;
					const filePath = `${user.id}/${fileName}`;
					const mimeType = file.type || (fileExt === 'mp4' ? 'video/mp4' : fileExt === 'webm' ? 'video/webm' : 'image/webp');

					const { error: uploadError } = await supabase.storage
						.from('memories')
						.upload(filePath, file, { upsert: true, contentType: mimeType });

					if (!uploadError) {
						const { data: urlData } = supabase.storage.from('memories').getPublicUrl(filePath);
						photoVideoUrl = urlData.publicUrl;
						photoVideoType = mimeType;
					} else {
						console.warn('Direct media upload warning, will fallback to server upload:', uploadError);
					}
				} catch (uploadErr) {
					console.warn('Direct media upload error, will fallback to server upload:', uploadErr);
				}
			}
		}

		if (memoryData.music) {
			if (typeof memoryData.music === 'string') {
				musicUrl = memoryData.music;
			} else {
				try {
					const file = memoryData.music;
					const rawName = file.name || 'music.mp3';
					const lastDotIndex = rawName.lastIndexOf('.');
					const baseName = lastDotIndex !== -1 ? rawName.substring(0, lastDotIndex) : rawName;
					const fileExt = lastDotIndex !== -1 ? rawName.substring(lastDotIndex + 1) : 'mp3';
					const safeBaseName = baseName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_');
					const fileName = `${Date.now()}_${safeBaseName || 'music'}.${fileExt}`;
					const filePath = `${user.id}/${fileName}`;

					const { error: uploadError } = await supabase.storage
						.from('memories')
						.upload(filePath, file, { upsert: true });

					if (!uploadError) {
						const { data: urlData } = supabase.storage.from('memories').getPublicUrl(filePath);
						musicUrl = urlData.publicUrl;
					} else {
						console.warn('Direct music upload warning:', uploadError);
					}
				} catch (uploadErr) {
					console.warn('Direct music upload error:', uploadErr);
				}
			}
		}

		try {
			let response;
			// If media/music are already uploaded (or not present), send instant JSON payload
			if ((!memoryData.photoVideo || photoVideoUrl) && (!memoryData.music || musicUrl)) {
				response = await fetch(API_ENDPOINTS.saveMemory, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						user_id: user.id,
						date: selectedDate,
						title: 'Untitled Memory',
						description: memoryData.memoryDescription || '',
						mood_tag: memoryData.moodTag || '',
						memory_tag: memoryData.memoryTag || '',
						photo_video: photoVideoUrl,
						photo_video_type: photoVideoType,
						music: musicUrl
					})
				});
			} else {
				// Fallback to FormData upload
				const formData = new FormData();
				formData.append('user_id', user.id);
				formData.append('date', selectedDate);
				formData.append('title', 'Untitled Memory');
				formData.append('description', memoryData.memoryDescription || '');
				formData.append('mood_tag', memoryData.moodTag || '');
				formData.append('memory_tag', memoryData.memoryTag || '');
				
				if (memoryData.photoVideo) {
					formData.append('photo_video', memoryData.photoVideo);
				}
				if (memoryData.music) {
					formData.append('music', memoryData.music);
				}

				response = await fetch(API_ENDPOINTS.saveMemory, {
					method: 'POST',
					body: formData
				});
			}

			const data = await response.json();
			
			if (data.success) {
				// Share memory with tagged friends if selected
				if (memoryData.taggedFriendIds && memoryData.taggedFriendIds.length > 0 && data.data?.id) {
					try {
						await fetch(API_ENDPOINTS.shareMemory, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								memory_id: data.data.id,
								sender_id: user.id,
								recipient_ids: memoryData.taggedFriendIds
							})
						});
						for (const fid of memoryData.taggedFriendIds) {
							broadcastMemoryEvent(user.id, fid, 'shared_memory_incoming', data.data);
						}
					} catch (shareErr) {
						console.error('Error sharing memory:', shareErr);
					}
				}

				showNotificationModal('Memory saved successfully!');
				resetAddMemoryForm = true; // Trigger form reset
				showAddMemory = false;
				// Refresh memories data for this date and month
				await loadMemoriesForDate(selectedDate);
				await loadMemoriesForMonth(currentCalendarMonth, currentCalendarYear);
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_memory_change'));
				}
			} else {
				showNotificationModal('Error saving memory: ' + (data.error || 'Unknown error'), 'error');
			}
		} catch (error) {
			console.error('Error saving memory:', error);
			showNotificationModal('Error saving memory. Please try again.', 'error');
		}
	}

	function handleCloseAddMemory() {
		showAddMemory = false;
		document.body.style.overflow = '';
	}

	function handleSidebarLogout() {
		localStorage.removeItem('chronomuse_user');
		goto('/');
	}

	function toggleAddMemory() {
		document.body.style.overflow = '';
		showAddMemory = !showAddMemory;
		showViewMemory = false;
		if (showAddMemory) {
			setTimeout(() => {
				if (addMemoryContainerRef) {
					addMemoryContainerRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
				}
			}, 150);
		}
	}

	function handleCloseViewMemory() {
		showViewMemory = false;
		showViewMemoryModalWrapper = false;
		document.body.style.overflow = '';
	}

	function handleAddMemoryFromView() {
		document.body.style.overflow = '';
		showViewMemory = false;
		showAddMemory = true;
		setTimeout(() => {
			if (addMemoryContainerRef) {
				addMemoryContainerRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}
		}, 150);
	}

	function handleMoodGraph(event) {
		console.log('Mood graph:', event.detail);
		// Navigate to mood graph page
		goto('/mood-graph');
	}

	function handleDeleteMemory(event) {
		const { memoryId } = event.detail;
		deleteMemoryFromDatabase(memoryId);
	}

	function handleDeletePinnedDate(event) {
		pinnedDateToDelete = event.detail;
		showDeletePinnedModal = true;
	}

	function handleViewPinnedMemory(event) {
		const pinned = event.detail;
		if (pinned && pinned.date) {
			selectedDate = pinned.date;
			// Load memories for this date
			loadMemoriesForDate(pinned.date).then(() => {
				memoriesForDate = memoriesData[pinned.date] || [];
				showViewMemory = true;
				showAddMemory = false;
			});
		}
	}

	function closeDeletePinnedModal() {
		showDeletePinnedModal = false;
		pinnedDateToDelete = null;
	}

	async function deletePinnedDate() {
		if (!pinnedDateToDelete) return;

		try {
			const response = await fetch(API_ENDPOINTS.deletePinnedDate, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					pinned_id: pinnedDateToDelete.pinned_id,
					user_id: user.id
				})
			});
			const data = await response.json();

			if (data.success) {
				// Remove from local state
				pinnedDates = pinnedDates.filter(p => p.pinned_id !== pinnedDateToDelete.pinned_id);
				// Refresh pinned memories card
				if (pinnedMemoryCardRef) {
					pinnedMemoryCardRef.loadPinnedMemories();
				}
				closeDeletePinnedModal();
			} else {
				showNotificationModal('Error: ' + (data.error || 'Failed to delete'), 'error');
			}
		} catch (error) {
			console.error('Error deleting pinned date:', error);
			showNotificationModal('Error deleting pinned date', 'error');
		}
	}

	async function deleteMemoryFromDatabase(memoryId) {
		try {
			const deletedDate = selectedDate;
			const response = await fetch(API_ENDPOINTS.deleteMemory, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ memory_id: memoryId })
			});
			const data = await response.json();
			
			if (data.success) {
				// Remove from local state
				memoriesForDate = memoriesForDate.filter(m => m.id !== memoryId);
				// Update memoriesData
				if (memoriesForDate.length === 0) {
					delete memoriesData[deletedDate];
					pinnedDates = pinnedDates.filter(p => p.date !== deletedDate);
					showViewMemory = false;
					showViewMemoryModalWrapper = false;
				} else {
					memoriesData[deletedDate] = memoriesForDate;
				}
				// Refresh pinned memories card & calendar
				await loadPinnedDates();
				if (pinnedMemoryCardRef) {
					pinnedMemoryCardRef.loadPinnedMemories(true);
				}
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_memory_change'));
					window.dispatchEvent(new CustomEvent('chronomuse_pinned_change'));
				}
				showNotificationModal('Memory deleted successfully!');
			} else {
				showNotificationModal('Error deleting memory: ' + (data.error || 'Unknown error'), 'error');
			}
		} catch (error) {
			console.error('Error deleting memory:', error);
			showNotificationModal('Error deleting memory. Please try again.', 'error');
		}
	}

	async function handleBatchDeleteMemories(event) {
		const { dates = [], memoryIds = [], onComplete } = event.detail || {};
		if (dates.length === 0 && memoryIds.length === 0) {
			if (onComplete) onComplete();
			return;
		}

		try {
			const response = await fetch(API_ENDPOINTS.deleteMemory, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					dates: dates,
					memory_ids: memoryIds,
					user_id: user?.id
				})
			});
			const data = await response.json();

			if (data.success) {
				// Remove all deleted dates from memoriesData
				const nextMemoriesData = { ...memoriesData };
				dates.forEach(d => {
					delete nextMemoriesData[d];
				});
				memoriesData = nextMemoriesData;

				// Remove deleted dates from pinnedDates
				pinnedDates = pinnedDates.filter(p => !dates.includes(p.date));

				// Refresh stats, pinned memories, and month memory card
				await Promise.all([
					loadPinnedDates(),
					loadMemoriesForMonth(currentCalendarMonth, currentCalendarYear)
				]);

				if (pinnedMemoryCardRef) {
					pinnedMemoryCardRef.loadPinnedMemories(true);
				}

				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_memory_change'));
					window.dispatchEvent(new CustomEvent('chronomuse_pinned_change'));
				}

				showNotificationModal(data.message || 'Selected memories deleted successfully!');
			} else {
				showNotificationModal('Error: ' + (data.error || 'Failed to delete selected memories'), 'error');
			}
		} catch (err) {
			console.error('Batch delete error:', err);
			showNotificationModal('An error occurred during batch deletion', 'error');
		} finally {
			if (onComplete) onComplete();
		}
	}

	function handleUpdateMemory(event) {
		const { memoryId, description, moodTag, memoryTag } = event.detail;
		updateMemoryInDatabase(memoryId, { description, mood_tag: moodTag, memory_tag: memoryTag });
	}

	function handleUpdateMemoryWithFiles(event) {
		const { memory, formData, description, moodTag, memoryTag } = event.detail;
		updateMemoryWithFilesInDatabase(memory, formData, { description, mood_tag: moodTag, memory_tag: memoryTag });
	}

	async function updateMemoryInDatabase(memoryId, updateData) {
		try {
			const response = await fetch(API_ENDPOINTS.updateMemory, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					memory_id: memoryId,
					...updateData
				})
			});
			const data = await response.json();

			if (data.success) {
				// Update local state
				const memoryIndex = memoriesForDate.findIndex(m => m.id === memoryId);
				if (memoryIndex !== -1) {
					memoriesForDate[memoryIndex] = {
						...memoriesForDate[memoryIndex],
						...updateData
					};
					memoriesData[selectedDate] = memoriesForDate;
				}
				
				if (data.shared_with && data.shared_with.length > 0) {
					for (const fid of data.shared_with) {
						broadcastMemoryEvent(user.id, fid, 'shared_memory_update', data.data);
					}
				}

				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_memory_change'));
				}

				showNotificationModal('Memory updated successfully!');
			} else {
				showNotificationModal('Error updating memory: ' + (data.error || 'Unknown error'), 'error');
			}
		} catch (error) {
			console.error('Error updating memory:', error);
			showNotificationModal('Error updating memory. Please try again.', 'error');
		}
	}

	async function updateMemoryWithFilesInDatabase(memory, formData, updateData) {
		try {
			const response = await fetch(API_ENDPOINTS.updateMemory, {
				method: 'POST',
				body: formData
			});
			const data = await response.json();

			if (data.success) {
				// Update local state
				const memoryIndex = memoriesForDate.findIndex(m => m.id === memory.id);
				if (memoryIndex !== -1) {
					memoriesForDate[memoryIndex] = {
						...memoriesForDate[memoryIndex],
						...updateData,
						photo_video: data.data.photo_video || memoriesForDate[memoryIndex].photo_video,
						photo_video_type: data.data.photo_video_type || memoriesForDate[memoryIndex].photo_video_type,
						music: data.data.music || memoriesForDate[memoryIndex].music
					};
					memoriesData[selectedDate] = memoriesForDate;
				}

				if (data.shared_with && data.shared_with.length > 0) {
					for (const fid of data.shared_with) {
						broadcastMemoryEvent(user.id, fid, 'shared_memory_update', data.data);
					}
				}

				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('chronomuse_memory_change'));
				}

				showNotificationModal('Memory updated successfully!');
			} else {
				showNotificationModal('Error updating memory: ' + (data.error || 'Unknown error'), 'error');
			}
		} catch (error) {
			console.error('Error updating memory:', error);
			showNotificationModal('Error updating memory. Please try again.', 'error');
		}
	}

	async function loadMemoriesForDate(date) {
		if (!date) return;

		try {
			const response = await fetch(`${API_ENDPOINTS.getMemoriesByDate}?date=${date}&user_id=${user.id}`, { cache: 'no-store' });
			const data = await response.json();

			if (data.success && data.data) {
				memoriesData = { ...memoriesData, [date]: data.data };
				if (selectedDate === date) {
					memoriesForDate = data.data;
				}
			}
		} catch (error) {
			console.error('Error loading memories:', error);
		}
	}

	function toggleViewMemory() {
		if (showViewMemory) {
			showViewMemory = false;
		} else {
			// Check if selected date has memories
			if (selectedDate && memoriesData[selectedDate]) {
				memoriesForDate = memoriesData[selectedDate];
				showViewMemory = true;
				showAddMemory = false;
			} else {
				showAddMemory = true;
			}
		}
	}
</script>

<div class="flex flex-col min-h-screen bg-[#fff0f5] font-sans animate-fade-in">
	<!-- Top Navigation -->
	<AppHeader />

	<!-- Main Content -->
	<main class="flex-grow px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 pb-28 sm:pb-32 md:ml-0 overflow-hidden">
			<div class="flex justify-center">
				<div class="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 lg:gap-6 max-w-6xl xl:max-w-7xl w-full items-start">
					<!-- Left Column - Pinned Memories & Memory Flashback -->
					<div class="space-y-4 animate-fade-in-up" style="animation-delay: 0.1s">
						<PinnedMemoryCard
							bind:this={pinnedMemoryCardRef}
							userId={user?.id}
							currentYear={currentCalendarYear}
							currentMonth={currentCalendarMonth}
							{memoriesData}
							on:deletePinnedDate={handleDeletePinnedDate}
							on:viewPinnedMemory={handleViewPinnedMemory}
							on:monthSelected={handleNavigateToMonthFromCard}
							on:yearChanged={handleYearChangedFromMonthCard}
						/>
						<!-- Desktop Only: Memory Flashback & Live Clock in Left Column -->
						<div class="hidden md:block space-y-4">
							<DashboardFlashback
								userId={user?.id}
								{memoriesData}
								on:viewMemory={handleViewStatsMemory}
							/>
							<DashboardClock />
						</div>
					</div>

					<!-- Center Column - Calendar -->
					<div id="calendar-section" class="animate-fade-in-up" style="animation-delay: 0.2s">
						<Calendar
							{memoriesData}
							{pinnedDates}
							selectedDateStr={selectedDate}
							bind:currentMonth={currentCalendarMonth}
							bind:currentYear={currentCalendarYear}
							on:dateSelected={handleDateSelected}
							on:dateWithMemoriesSelected={handleDateWithMemoriesSelected}
							on:monthChanged={handleMonthChanged}
							on:pinDate={handlePinDate}
							on:batchDeleteMemories={handleBatchDeleteMemories}
						/>
					</div>

					<!-- Right Column - Add Memory Form / Daily Affirmation & Streak / Months Explorer -->
					<div bind:this={addMemoryContainerRef} class="space-y-4 animate-fade-in-up" style="animation-delay: 0.3s">
						{#if showAddMemory}
							<div class="animate-smooth-reveal">
								<AddMemoryCard
									{selectedDate}
									bind:resetForm={resetAddMemoryForm}
									on:saveMemory={handleSaveMemory}
									on:close={handleCloseAddMemory}
									on:showToast={showMemoryToast}
								/>
							</div>
						{:else}
							<div class="space-y-4 animate-smooth-reveal">
								<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 text-center shadow-[0_4px_20px_rgba(244,114,182,0.08)] transition-all duration-300 hover:border-pink-200">
									<h3 class="text-xs sm:text-sm font-black text-pink-950 mb-1">Create & Capture Memories</h3>
									<p class="text-[11px] text-pink-400 mb-3 leading-relaxed font-bold">Click any date on the calendar to view or add new memories!</p>
									<button
										onclick={toggleAddMemory}
										class="w-full py-2.5 px-3 bg-[#f43f8e] text-white rounded-xl hover:bg-[#e0337f] active:scale-95 transition-all duration-200 text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm hover:shadow-md cursor-pointer"
									>
										<Plus class="w-3.5 h-3.5" strokeWidth={2.5} />
										<span>Open Add Memory Form</span>
									</button>
								</div>

								<DashboardStatsCard
									userId={user?.id}
									{memoriesData}
								/>

								<!-- Desktop only: Months with Memories in Right Column -->
								<div class="hidden md:block">
									<DashboardMonthsMemoryCard
										userId={user?.id}
										currentYear={currentCalendarYear}
										currentMonth={currentCalendarMonth}
										{memoriesData}
										on:monthSelected={handleNavigateToMonthFromCard}
										on:yearChanged={handleYearChangedFromMonthCard}
									/>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</main>

		<!-- View Memory Modal -->
		{#if showViewMemory}
			<ViewMemoryModal
				{selectedDate}
				memories={memoriesForDate}
				on:close={handleCloseViewMemory}
				on:addMemory={handleAddMemoryFromView}
				on:deleteMemory={handleDeleteMemory}
				on:updateMemory={handleUpdateMemory}
				on:updateMemoryWithFiles={handleUpdateMemoryWithFiles}
				on:refresh={() => loadMemoriesForDate(selectedDate)}
			/>
		{/if}

		<!-- Unpin Date Modal -->
		{#if showDeletePinnedModal}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in font-sans"
				onclick={(e) => { if (e.target === e.currentTarget) closeDeletePinnedModal(); }}
			>
				<div class="bg-white border border-pink-100/90 rounded-3xl max-w-sm w-full p-5 sm:p-6 text-center animate-modal-content shadow-2xl space-y-4">
					<!-- Unpin Circle Icon -->
					<div class="w-12 h-12 bg-pink-50 text-[#f43f8e] rounded-2xl flex items-center justify-center mx-auto border border-pink-100/80 shadow-xs">
						<Bookmark class="w-6 h-6 fill-current" />
					</div>
					<div>
						<h3 class="text-base sm:text-lg font-black text-pink-950">Unpin Date?</h3>
						<p class="text-xs sm:text-sm text-pink-600/90 mt-1 font-medium leading-relaxed">Are you sure you want to unpin this date from your pinned memories?</p>
					</div>

					<!-- Modal Actions -->
					<div class="flex items-center space-x-2.5 pt-1">
						<button
							onclick={closeDeletePinnedModal}
							class="w-1/2 py-2.5 bg-pink-50 hover:bg-pink-100 text-pink-700 font-black text-xs sm:text-sm rounded-xl transition-all cursor-pointer border border-pink-100 shadow-2xs active:scale-95"
						>
							Cancel
						</button>
						<button
							onclick={deletePinnedDate}
							class="w-1/2 py-2.5 bg-[#f43f8e] hover:bg-[#e0337f] text-white font-black text-xs sm:text-sm rounded-xl transition-all cursor-pointer shadow-md shadow-pink-300/40 active:scale-95"
						>
							Unpin
						</button>
					</div>
				</div>
			</div>
		{/if}

		<!-- Toast Notification -->
		{#if showToast}
			<div class="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-bounce-in">
				<div
					class="px-6 py-3 rounded-2xl border flex items-center space-x-3 shadow-xl {toastType === 'success' ? 'bg-gradient-to-r from-[#f43f8e] to-pink-500 border-pink-300/40 text-white shadow-pink-500/20' : 'bg-gradient-to-r from-rose-500 to-pink-600 border-rose-400 text-white shadow-pink-500/20'}"
				>
					{#if toastType === 'success'}
						<CheckCircle2 class="w-5 h-5 text-white flex-shrink-0" strokeWidth={2.5} />
					{:else}
						<AlertCircle class="w-5 h-5 text-white flex-shrink-0" strokeWidth={2.5} />
					{/if}
					<span class="text-sm font-black">{toastMessage}</span>
				</div>
			</div>
		{/if}

		<!-- Custom Success / Alert Notification Modal -->
		{#if showNotificationModalPopup}
			<div
				class="fixed inset-0 bg-black/40 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-fade-in"
				role="dialog"
				aria-modal="true"
				tabindex="-1"
				onclick={(e) => { if (e.target === e.currentTarget) showNotificationModalPopup = false; }}
				onkeydown={(e) => { if (e.key === 'Escape') showNotificationModalPopup = false; }}
			>
				<div class="bg-white border-2 border-pink-200 rounded-3xl p-6 max-w-xs sm:max-w-sm w-full text-center space-y-4 shadow-2xl animate-modal-content">
					<div class="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto {notificationModalType === 'error' ? 'bg-rose-50 text-rose-500 border border-rose-100' : 'bg-pink-50 text-[#f43f8e] border border-pink-200'} shadow-xs">
						{#if notificationModalType === 'error'}
							<AlertCircle class="w-7 h-7" strokeWidth={2.5} />
						{:else}
							<Check class="w-7 h-7 text-[#f43f8e]" strokeWidth={2.5} />
						{/if}
					</div>
					
					<div class="space-y-1">
						<h3 class="text-base sm:text-lg font-black text-pink-950">
							{notificationModalType === 'error' ? 'Notice' : 'Success!'}
						</h3>
						<p class="text-xs sm:text-sm font-bold text-pink-700 leading-relaxed">
							{notificationModalMessage}
						</p>
					</div>

					<button
						type="button"
						onclick={() => showNotificationModalPopup = false}
						class="w-full py-2.5 bg-[#f43f8e] hover:bg-[#e0337f] text-white rounded-2xl font-black text-xs sm:text-sm transition-all active:scale-95 cursor-pointer shadow-md"
					>
						OK
					</button>
				</div>
			</div>
		{/if}

	<!-- Bottom Navigation Bar (Footer) -->
	<AppFooter />
</div>

<style>
	@keyframes bounce-in {
		0% {
			opacity: 0;
			transform: translate(-50%, -100px) scale(0.3);
		}
		50% {
			transform: translate(-50%, 0) scale(1.05);
		}
		70% {
			transform: translate(-50%, 0) scale(0.9);
		}
		100% {
			opacity: 1;
			transform: translate(-50%, 0) scale(1);
		}
	}

	.animate-bounce-in {
		animation: bounce-in 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
	}

	@keyframes fade-in {
		0% {
			opacity: 0;
		}
		100% {
			opacity: 1;
		}
	}

	.animate-fade-in {
		animation: fade-in 0.2s ease-out;
	}

	@keyframes fade-in-up {
		0% {
			opacity: 0;
			transform: translateY(30px);
		}
		100% {
			opacity: 1;
			transform: none;
		}
	}

	.animate-fade-in-up {
		animation: fade-in-up 0.4s ease-out forwards;
		opacity: 0;
	}

	@keyframes modal-backdrop {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes modal-content {
		from {
			opacity: 0;
			transform: scale(0.9) translateY(-20px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	.animate-modal-content {
		animation: modal-content 0.3s ease-out cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes smooth-reveal {
		0% {
			opacity: 0;
			transform: translateY(6px) scale(0.99);
		}
		100% {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.animate-smooth-reveal {
		animation: smooth-reveal 0.15s ease-out forwards;
		will-change: opacity, transform;
	}
</style>
