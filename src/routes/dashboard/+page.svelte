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

	let user = $state(typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('chronomuse_user') || 'null') : null);
	let isLoading = $state(false);
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
				loadMemoriesForMonth(now.getMonth(), now.getFullYear());
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

			// Fast au interval to ensure instant memory updates across devices
			syncInterval = setInterval(() => {
				if (selectedDate) {
					loadMemoriesForDate(selectedDate);
				}
			}, 2500);
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
		loadMemoriesForMonth(month, year);
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
			memoriesForDate = memories;
		}
		showViewMemory = true;
		showViewMemoryModalWrapper = true;
		showAddMemory = false;
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
					const file = memoryData.photoVideo;
					const originalName = file.name || (file.type?.startsWith('video/') ? 'video.mp4' : 'image.jpg');
					const fileExt = (originalName.split('.').pop() || (file.type?.startsWith('video/') ? 'mp4' : 'jpg')).toLowerCase().replace(/[^a-z0-9]/g, '');
					const fileName = `media_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt || 'mp4'}`;
					const filePath = `${user.id}/${fileName}`;
					const mimeType = file.type || (fileExt === 'mp4' ? 'video/mp4' : fileExt === 'webm' ? 'video/webm' : 'image/jpeg');

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
				// Refresh memories data for this date
				await loadMemoriesForDate(selectedDate);
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
				if (showViewMemory && selectedDate === date) {
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
				<div class="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 lg:gap-6 xl:gap-8 max-w-7xl 2xl:max-w-[1600px] w-full">
					<!-- Left Column - Pinned Memories -->
					<div class="animate-fade-in-up" style="animation-delay: 0.1s">
						<PinnedMemoryCard bind:this={pinnedMemoryCardRef} userId={user?.id} on:deletePinnedDate={handleDeletePinnedDate} on:viewPinnedMemory={handleViewPinnedMemory} />
					</div>

					<!-- Center Column - Calendar -->
					<div class="animate-fade-in-up" style="animation-delay: 0.2s">
						<Calendar
							{memoriesData}
							{pinnedDates}
							selectedDateStr={selectedDate}
							on:dateSelected={handleDateSelected}
							on:dateWithMemoriesSelected={handleDateWithMemoriesSelected}
							on:monthChanged={handleMonthChanged}
							on:pinDate={handlePinDate}
						/>
					</div>

					<!-- Right Column - Add Memory Form / Info Card (Sa Gilid) -->
					<div bind:this={addMemoryContainerRef} class="animate-fade-in-up" style="animation-delay: 0.3s">
						{#if showAddMemory}
							<AddMemoryCard
								{selectedDate}
								bind:resetForm={resetAddMemoryForm}
								on:saveMemory={handleSaveMemory}
								on:close={handleCloseAddMemory}
								on:showToast={showMemoryToast}
							/>
						{:else}
							<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 text-center shadow-[0_4px_20px_rgba(244,114,182,0.08)] transition-all duration-300">
								<h3 class="text-xs sm:text-sm font-black text-pink-950 mb-1">Create & Capture Memories</h3>
								<p class="text-[11px] text-pink-400 mb-3 leading-relaxed font-bold">Click any date on the calendar to view or add new memories!</p>
								<button
									onclick={toggleAddMemory}
									class="w-full py-2 px-3 bg-[#f43f8e] text-white rounded-xl hover:bg-[#e0337f] active:scale-95 transition-all duration-200 text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm hover:shadow-md"
								>
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
										<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
									</svg>
									<span>Open Add Memory Form</span>
								</button>
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
			<div class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
				<div class="bg-white border-2 border-pink-300 rounded-3xl max-w-sm w-full p-6 text-center animate-modal-content relative overflow-hidden">
					<!-- Unpin Circle Icon -->
					<div class="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-7 h-7">
							<path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
						</svg>
					</div>
					<h3 class="text-base sm:text-lg font-black text-pink-950 mb-1.5">Unpin Date?</h3>
					<p class="text-xs sm:text-sm text-pink-600 mb-5 font-medium leading-relaxed">Are you sure you want to unpin this date from your pinned memories?</p>

					<!-- Modal Actions -->
					<div class="flex items-center space-x-3">
						<button
							onclick={closeDeletePinnedModal}
							class="w-1/2 py-2.5 bg-pink-100 text-pink-700 hover:bg-pink-200 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer"
						>
							Cancel
						</button>
						<button
							onclick={deletePinnedDate}
							class="w-1/2 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold text-xs sm:text-sm transition-all -rose-200 active:scale-95 cursor-pointer"
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
					class="px-6 py-3 rounded-xl border-2 flex items-center space-x-3"
					class:text-white={toastType === 'success'}
				>
					{#if toastType === 'success'}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
						</svg>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
						</svg>
					{/if}
					<span class="text-sm font-semibold">{toastMessage}</span>
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
				<div class="bg-white border-2 border-pink-300 rounded-3xl p-6 max-w-xs sm:max-w-sm w-full text-center space-y-4 animate-modal-content">
					<div class="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto {notificationModalType === 'error' ? 'bg-rose-100 text-rose-600 border border-rose-200' : 'bg-emerald-100 text-emerald-600 border border-emerald-200'}">
						{#if notificationModalType === 'error'}
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-7 h-7">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zM12 15.75h.007v.008H12v-.008z" />
							</svg>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-7 h-7">
								<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
							</svg>
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
						class="w-full py-2.5 bg-pink-500 hover:bg-pink-600 text-white rounded-2xl font-bold text-xs sm:text-sm transition-all active:scale-95 cursor-pointer"
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

	@keyframes slide-down {
		0% {
			opacity: 0;
			transform: translateY(-20px);
		}
		100% {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-slide-down {
		animation: slide-down 0.3s ease-out;
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
</style>
