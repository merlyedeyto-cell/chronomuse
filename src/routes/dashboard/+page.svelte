<script>
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import Sidebar from '$lib/Sidebar.svelte';
	import Calendar from '$lib/Calendar.svelte';
	import AddMemoryCard from '$lib/AddMemoryCard.svelte';
	import PinnedMemoryCard from '$lib/PinnedMemoryCard.svelte';
	import ViewMemoryModal from '$lib/ViewMemoryModal.svelte';

	let user = $state(null);
	let isLoading = $state(true);
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

	onMount(() => {
		const storedUser = localStorage.getItem('chronomuse_user');
		if (storedUser) {
			user = JSON.parse(storedUser);
			const now = new Date();
			loadMemoriesForMonth(now.getMonth(), now.getFullYear());
			loadPinnedDates();
		} else {
			goto('/');
		}
		isLoading = false;

		// Listen for pinned dates changes (client-side only)
		if (browser) {
			window.addEventListener('pinnedDatesChanged', loadPinnedDates);
		}
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('pinnedDatesChanged', loadPinnedDates);
		}
	});

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}

	async function loadPinnedDates() {
		if (!user || !user.id) return;
		try {
			const response = await fetch(`${API_ENDPOINTS.getPinnedMemories}?user_id=${user.id}`);
			const data = await response.json();

			if (data.success && data.data) {
				pinnedDates = data.data;
			}
		} catch (error) {
			console.error('Error loading pinned dates:', error);
		}
	}

	function handleLogout() {
		localStorage.removeItem('chronomuse_user');
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
			const response = await fetch(`${API_ENDPOINTS.getMemoriesForMonth}?year=${year}&month=${month + 1}&user_id=${user.id}`);
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
					alert('Date unpinned successfully!');
				} else {
					alert('Date pinned successfully!');
				}
				// Refresh pinned dates
				await loadPinnedDates();
				// Refresh pinned memories card
				if (pinnedMemoryCardRef) {
					pinnedMemoryCardRef.loadPinnedMemories();
				}
			} else {
				alert('Error: ' + (data.error || 'Failed to update pin'));
			}
		} catch (error) {
			console.error('Error updating pin:', error);
			alert('Error updating pin. Please try again.');
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
		if (!selectedDate) return;

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
		
		try {
			const response = await fetch(API_ENDPOINTS.saveMemory, {
				method: 'POST',
				body: formData
			});
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
					} catch (shareErr) {
						console.error('Error sharing memory:', shareErr);
					}
				}

				alert('Memory saved successfully!');
				resetAddMemoryForm = true; // Trigger form reset
				showAddMemory = false;
				// Refresh memories data for this date
				await loadMemoriesForDate(selectedDate);
			} else {
				alert('Error saving memory: ' + (data.error || 'Unknown error'));
			}
		} catch (error) {
			console.error('Error saving memory:', error);
			alert('Error saving memory. Please try again.');
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
				alert('Error: ' + (data.error || 'Failed to delete'));
			}
		} catch (error) {
			console.error('Error deleting pinned date:', error);
			alert('Error deleting pinned date');
		}
	}

	async function deleteMemoryFromDatabase(memoryId) {
		try {
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
					delete memoriesData[selectedDate];
				} else {
					memoriesData[selectedDate] = memoriesForDate;
				}
				alert('Memory deleted successfully!');
			} else {
				alert('Error deleting memory: ' + (data.error || 'Unknown error'));
			}
		} catch (error) {
			console.error('Error deleting memory:', error);
			alert('Error deleting memory. Please try again.');
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
				alert('Memory updated successfully!');
			} else {
				alert('Error updating memory: ' + (data.error || 'Unknown error'));
			}
		} catch (error) {
			console.error('Error updating memory:', error);
			alert('Error updating memory. Please try again.');
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
				alert('Memory updated successfully!');
			} else {
				alert('Error updating memory: ' + (data.error || 'Unknown error'));
			}
		} catch (error) {
			console.error('Error updating memory:', error);
			alert('Error updating memory. Please try again.');
		}
	}

	async function loadMemoriesForDate(date) {
		if (!date) return;

		try {
			const response = await fetch(`${API_ENDPOINTS.getMemoriesByDate}?date=${date}&user_id=${user.id}`);
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

{#if isLoading}
	<div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-pink-100 to-pink-200">
		<div class="text-center">
			<div class="animate-spin rounded-full h-16 w-16 border-b-2 border-pink-500 mx-auto"></div>
			<p class="mt-4 text-pink-700">Loading...</p>
		</div>
	</div>
{:else}
	<div class="flex flex-col min-h-screen bg-gradient-to-br from-pink-50 via-pink-100 to-pink-200 animate-fade-in">
		<!-- Top Navigation -->
		<nav class="bg-white/85 backdrop-blur-md border-b-2 border-pink-300 shadow-lg sticky top-0 z-50 animate-slide-down">
			<div class="container mx-auto px-4 py-3 flex items-center justify-between">
				<div class="flex items-center space-x-2.5">
					<button
						onclick={toggleSidebar}
						class="p-1.5 sm:p-2 text-pink-500 hover:bg-pink-100 rounded-lg transition-colors flex-shrink-0 active:scale-95"
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
					<span class="text-pink-700 text-sm hidden md:inline">Welcome, <strong>{user?.username}</strong></span>
					<span class="text-pink-700 text-xs sm:text-sm md:hidden truncate max-w-[110px]"><strong>{user?.username}</strong></span>
					<button
						onclick={handleLogout}
						class="px-4 py-2 bg-gradient-to-r from-pink-400 to-pink-600 text-white rounded-lg hover:from-pink-500 hover:to-pink-700 transition-all duration-200 text-sm font-semibold shadow-md hidden md:block active:scale-95"
					>
						Logout
					</button>
				</div>
			</div>
		</nav>

		<!-- Sidebar -->
		<Sidebar
			bind:isOpen={sidebarOpen}
			on:addFriend={handleAddFriend}
			on:friendsList={handleFriendsList}
			on:chat={handleChat}
			on:moodGraph={handleMoodGraph}
			on:logout={handleSidebarLogout}
		/>

		<!-- Main Content -->
		<main class="flex-grow px-4 py-8 md:ml-0 overflow-hidden">
			<div class="flex justify-center">
				<div class="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl w-full">
					<!-- Left Column - Pinned Memories -->
					<div class="animate-fade-in-up" style="animation-delay: 0.1s">
						<PinnedMemoryCard bind:this={pinnedMemoryCardRef} userId={user.id} on:deletePinnedDate={handleDeletePinnedDate} on:viewPinnedMemory={handleViewPinnedMemory} />
					</div>

					<!-- Center Column - Calendar -->
					<div class="animate-fade-in-up" style="animation-delay: 0.2s">
						<Calendar
							{memoriesData}
							{pinnedDates}
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
							<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-lg p-6 text-center transition-all duration-300 hover:-translate-y-2 hover:shadow-xl">
								<h3 class="text-lg font-bold text-pink-500 mb-2">Create & Capture Memories</h3>
								<p class="text-sm text-pink-400 mb-4">Click any date on the calendar to view or add new memories!</p>
								<button
									onclick={toggleAddMemory}
									class="w-full py-3 px-4 bg-gradient-to-r from-pink-400 to-pink-600 text-white rounded-xl hover:from-pink-500 hover:to-pink-700 transition-all duration-200 text-sm font-semibold shadow-md flex items-center justify-center space-x-2"
								>
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
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
			/>
		{/if}

		<!-- Footer -->
		<footer class="bg-white/85 backdrop-blur-md border-t-2 border-pink-300 animate-fade-in" style="animation-delay: 0.4s">
			<div class="container mx-auto px-4 py-3 text-center">
				<p class="text-xs text-pink-700">
					© 2026 CHRONOMUSE. All rights reserved. Developed by Merlye Deyto
				</p>
			</div>
		</footer>

		<!-- Delete Pinned Date Modal -->
		{#if showDeletePinnedModal}
			<div class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 animate-fade-in">
				<div class="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full border-2 border-pink-300 animate-modal-content">
					<!-- Modal Header -->
					<div class="text-center mb-4">
						<div class="w-12 h-12 mx-auto mb-3 rounded-full bg-gradient-to-r from-pink-400 to-pink-600 flex items-center justify-center">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 text-white">
								<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 12.55a1.125 1.125 0 01-1.126 1.095H9.726a1.125 1.125 0 01-1.126-1.095L8.259 9M8.875 5.625V4.5c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v1.125m-4.5 0V4.5m0 0h4.5m-4.5 0a2.25 2.25 0 00-2.25 2.25v1.5a2.25 2.25 0 002.25 2.25h1.5a2.25 2.25 0 002.25-2.25v-1.5a2.25 2.25 0 00-2.25-2.25h-1.5z" />
							</svg>
						</div>
						<h3 class="text-lg font-bold text-pink-600">Delete Pinned Date?</h3>
						<p class="text-sm text-pink-400 mt-1">This action cannot be undone</p>
					</div>

					<!-- Modal Actions -->
					<div class="flex space-x-3">
						<button
							onclick={closeDeletePinnedModal}
							class="flex-1 py-2.5 px-4 bg-white border-2 border-pink-300 text-pink-600 rounded-xl hover:bg-pink-50 transition-all duration-200 text-sm font-semibold"
						>
							Cancel
						</button>
						<button
							onclick={deletePinnedDate}
							class="flex-1 py-2.5 px-4 bg-gradient-to-r from-pink-400 to-pink-600 text-white rounded-xl hover:from-pink-500 hover:to-pink-700 transition-all duration-200 text-sm font-semibold shadow-md"
						>
							Delete
						</button>
					</div>
				</div>
			</div>
		{/if}

		<!-- Toast Notification -->
		{#if showToast}
			<div class="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-bounce-in">
				<div
					class="px-6 py-3 rounded-xl shadow-2xl border-2 flex items-center space-x-3"
					class:bg-gradient-to-r={toastType === 'success'}
					class:from-green-400={toastType === 'success'}
					class:to-green-600={toastType === 'success'}
					class:text-white={toastType === 'success'}
					class:from-red-400={toastType === 'error'}
					class:to-red-600={toastType === 'error'}
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
	</div>
{/if}

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
			transform: translateY(0);
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
