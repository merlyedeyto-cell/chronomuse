<script>
	import { createEventDispatcher, onMount } from 'svelte';

	const dispatch = createEventDispatcher();

	import { API_ENDPOINTS } from '$lib/apiConfig.js';

	let { selectedDate = '', resetForm = $bindable(false) } = $props();

	let memoryDescription = $state('');
	let memoryTag = $state('');
	let moodTag = $state('');
	let photoVideo = $state(null);
	let music = $state(null);
	let photoVideoPreview = $state(null);
	let isSaving = $state(false);
	let isClosing = $state(false);
	let isOpening = $state(true);
	let showEmojiPicker = $state(false);
	let friends = $state([]);
	let selectedFriendIds = $state([]);
	let photoVideoInput;
	let musicInput;

	// Check if selected date is in the future
	function isFutureDate() {
		if (!selectedDate) return false;
		const [year, month, day] = selectedDate.split('-');
		const selectedDateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		return selectedDateObj > today;
	}

	// Check if description is empty
	function isDescriptionEmpty() {
		return !memoryDescription || !memoryDescription.trim();
	}

	// Watch for resetForm signal
	$effect(() => {
		if (resetForm) {
			resetFormValues();
			resetForm = false;
		}
	});

	function resetFormValues() {
		memoryDescription = '';
		memoryTag = '';
		moodTag = '';
		photoVideo = null;
		music = null;
		if (photoVideoPreview) {
			URL.revokeObjectURL(photoVideoPreview);
			photoVideoPreview = null;
		}
		if (photoVideoInput) {
			photoVideoInput.value = '';
		}
		if (musicInput) {
			musicInput.value = '';
		}
		isSaving = false;
	}

	const memoryTags = [
		'Celebration',
		'Travel',
		'Family',
		'Friends',
		'Work',
		'School',
		'Hobby',
		'Milestone',
		'Everyday',
		'Other'
	];

	const moodTags = [
		'Happy',
		'Sad',
		'Excited',
		'Angry',
		'Calm',
		'Anxious',
		'Grateful',
		'Lonely',
		'Love',
		'Neutral'
	];

	const emojis = ['😀', '😁', '😂', '🥰', '😍', '🤩', '😊', '😎', '🥳', '🎉', '❤️', '🔥', '✨', '🌟', '💫', '🎈', '🎊', '📸', '📷', '🎵', '🎶', '💕', '💖', '💗', '🌸', '🌺', '🌻', '🌈', '☀️', '🌙', '⭐'];

	function handlePhotoVideoChange(event) {
		const file = event.target.files[0];
		if (file) {
			// Validate: Only photos allowed
			if (file.type.startsWith('video/')) {
				// Clear the input
				if (photoVideoInput) {
					photoVideoInput.value = '';
				}
				photoVideo = null;
				if (photoVideoPreview) {
					URL.revokeObjectURL(photoVideoPreview);
					photoVideoPreview = null;
				}
				// Dispatch custom event properly
				const event = new CustomEvent('showToast', {
					detail: { message: 'Failed! Videos are not allowed.', type: 'error' }
				});
				dispatch('showToast', event);
				return;
			}
			
			if (file.type.startsWith('image/')) {
				photoVideo = file;
				// Create preview URL
				photoVideoPreview = URL.createObjectURL(file);
			}
		}
	}

	function handleMusicChange(event) {
		const file = event.target.files[0];
		if (file) {
			music = file;
		}
	}

	function handleSaveMemory() {
		// Check if description is empty
		if (!memoryDescription.trim()) {
			const event = new CustomEvent('showToast', {
				detail: { message: 'Failed! Please add a description.', type: 'error' }
			});
			dispatch('showToast', event);
			return;
		}

		// Check if date is in the future
		if (selectedDate) {
			const [year, month, day] = selectedDate.split('-');
			const selectedDateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
			const today = new Date();
			today.setHours(0, 0, 0, 0);

			if (selectedDateObj > today) {
				const event = new CustomEvent('showToast', {
					detail: { message: 'Cannot create memories for future dates! Please select today or a past date.', type: 'error' }
				});
				dispatch('showToast', event);
				isSaving = false;
				return;
			}
		}

		isSaving = true;

		// Dispatch the save event with form data
		dispatch('saveMemory', {
			selectedDate,
			memoryDescription,
			memoryTag,
			moodTag,
			photoVideo,
			music,
			taggedFriendIds: selectedFriendIds
		});
		
		// Note: Don't reset form here - wait for parent to confirm save
	}

	function handleClearInputs() {
		memoryDescription = '';
		memoryTag = '';
		moodTag = '';
		photoVideo = null;
		music = null;
		selectedFriendIds = [];
		if (photoVideoPreview) {
			URL.revokeObjectURL(photoVideoPreview);
			photoVideoPreview = null;
		}
		// Reset file inputs
		if (photoVideoInput) {
			photoVideoInput.value = '';
		}
		if (musicInput) {
			musicInput.value = '';
		}
	}

	function handleClose() {
		isClosing = true;
		// Revoke preview URL to free memory
		if (photoVideoPreview) {
			URL.revokeObjectURL(photoVideoPreview);
			photoVideoPreview = null;
		}
		setTimeout(() => {
			dispatch('close');
		}, 300);
	}

	function insertEmoji(emoji) {
		memoryDescription += emoji;
		showEmojiPicker = false;
	}

	function toggleFriendTag(friendId) {
		if (selectedFriendIds.includes(friendId)) {
			selectedFriendIds = selectedFriendIds.filter(id => id !== friendId);
		} else {
			selectedFriendIds = [...selectedFriendIds, friendId];
		}
	}

	onMount(() => {
		// Trigger opening animation
		setTimeout(() => {
			isOpening = false;
		}, 50);

		// Load friends list for tagging
		const currentUser = localStorage.getItem('chronomuse_user');
		const user = currentUser ? JSON.parse(currentUser) : null;
		if (user && user.id) {
			fetch(API_ENDPOINTS.getFriendsList, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: user.id })
			})
			.then(res => res.json())
			.then(data => {
				if (data.data && data.data.friends) {
					friends = data.data.friends;
				}
			})
			.catch(err => console.error('Error loading friends for tagging:', err));
		}
	});

	function formatDate(dateString) {
		if (!dateString) return 'No date selected';
		// Parse date string manually to avoid timezone issues
		const [year, month, day] = dateString.split('-');
		const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
		return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
	}
</script>

<div
	class="bg-white border-2 border-pink-300 rounded-2xl shadow-lg p-4 sm:p-5 relative transition-all duration-300 hover:shadow-xl animate-modal-content"
	class:opacity-0={isOpening || isClosing}
	class:scale-95={isOpening || isClosing}
	class:transform={isOpening || isClosing}
>
	<!-- Close Button -->
	<button
		onclick={handleClose}
		class="absolute top-3 right-3 p-1.5 text-pink-400 hover:text-pink-600 hover:bg-pink-100 rounded-lg transition-all duration-200"
		title="Close"
	>
		<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
			<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
		</svg>
	</button>

	<!-- Header -->
	<div class="text-center mb-3">
		<h2 class="text-base sm:text-lg font-bold text-pink-600">Add New Memory</h2>
		<p class="text-[11px] sm:text-xs text-pink-400 mt-0.5">Capture your special moments</p>
	</div>

	<!-- Selected Date Mini Card -->
	<div class="mb-3 p-2.5 bg-gradient-to-r from-pink-400 to-pink-600 rounded-xl shadow-sm text-white">
		<div class="flex items-center space-x-2.5">
			<div class="p-1.5 bg-white/20 rounded-lg">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
				</svg>
			</div>
			<div>
				<p class="text-[10px] text-pink-100 uppercase tracking-wide font-medium">Selected Date</p>
				<p class="text-xs sm:text-sm font-bold">{formatDate(selectedDate)}</p>
			</div>
		</div>
	</div>

	<!-- Form -->
	<div class="space-y-2.5">
		<!-- Upload Photo & Upload Music Side-by-Side -->
		<div class="grid grid-cols-2 gap-2">
			<!-- Upload Photo -->
			<div>
				<label class="block text-xs font-medium text-pink-600 mb-1">Photo</label>
				<label class="flex flex-col items-center justify-center w-full h-14 border-2 border-dashed border-pink-300 rounded-lg bg-pink-50 cursor-pointer hover:bg-pink-100 transition-all duration-200 overflow-hidden">
					{#if photoVideoPreview}
						{#if photoVideo?.type.startsWith('image/')}
							<img src={photoVideoPreview} alt="Preview" class="w-full h-full object-contain" />
						{/if}
					{:else}
						<div class="flex items-center space-x-1.5 py-1">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 text-pink-400">
								<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
							</svg>
							<span class="text-xs text-pink-500 font-medium">Upload photo</span>
						</div>
					{/if}
					<input
						type="file"
						accept="image/*"
						onchange={handlePhotoVideoChange}
						bind:this={photoVideoInput}
						class="hidden"
					/>
				</label>
			</div>

			<!-- Upload Music -->
			<div>
				<label class="block text-xs font-medium text-pink-600 mb-1">Music (Optional)</label>
				<label class="flex flex-col items-center justify-center w-full h-14 border-2 border-dashed border-pink-300 rounded-lg bg-pink-50 cursor-pointer hover:bg-pink-100 transition-all duration-200 overflow-hidden">
					<div class="flex items-center space-x-1.5 py-1 px-2 w-full max-w-full min-w-0 overflow-hidden justify-center">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 text-pink-400 flex-shrink-0">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
						</svg>
						{#if music}
							<span class="text-xs text-pink-600 font-medium truncate block max-w-full min-w-0">{music.name}</span>
						{:else}
							<span class="text-xs text-pink-500 font-medium">Upload music</span>
						{/if}
					</div>
					<input
						type="file"
						accept="audio/*"
						onchange={handleMusicChange}
						bind:this={musicInput}
						class="hidden"
					/>
				</label>
			</div>
		</div>

		<!-- Memory Tag and Mood Tag Row -->
		<div class="grid grid-cols-2 gap-2">
			<!-- Memory Tag Dropdown -->
			<div>
				<label class="block text-xs font-medium text-pink-600 mb-1">Memory Tag</label>
				<select
					bind:value={memoryTag}
					class="w-full px-2.5 py-1.5 bg-pink-50 border-2 border-pink-200 rounded-lg text-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent text-xs"
				>
					<option value="">Select a tag</option>
					{#each memoryTags as tag}
						<option value={tag}>{tag}</option>
					{/each}
				</select>
			</div>

			<!-- Mood Tag Dropdown -->
			<div>
				<label class="block text-xs font-medium text-pink-600 mb-1">Mood Tag</label>
				<select
					bind:value={moodTag}
					class="w-full px-2.5 py-1.5 bg-pink-50 border-2 border-pink-200 rounded-lg text-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent text-xs"
				>
					<option value="">How are you feeling?</option>
					{#each moodTags as mood}
						<option value={mood}>{mood}</option>
					{/each}
				</select>
			</div>
		</div>

		<!-- Memory Description with Emoji Picker -->
		<div>
			<label class="block text-xs font-medium text-pink-600 mb-1">Description</label>
			<div class="relative">
				<textarea
					bind:value={memoryDescription}
					placeholder="Write about this memory..."
					rows="2"
					class="w-full px-3 py-1.5 pr-9 bg-pink-50 border-2 border-pink-200 rounded-lg text-pink-700 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent text-xs resize-none"
				></textarea>
				<!-- Emoji Button -->
				<button
					onclick={() => showEmojiPicker = !showEmojiPicker}
					type="button"
					class="absolute bottom-2 right-2 text-pink-500 hover:text-pink-700 transition-transform hover:scale-110"
					title="Add emoji"
				>
					<span class="text-base leading-none">😊</span>
				</button>

				<!-- Emoji Picker Popup -->
				{#if showEmojiPicker}
					<div class="absolute bottom-full right-0 mb-2 p-2 bg-white border-2 border-pink-300 rounded-xl shadow-lg z-10 max-w-[180px]">
						<div class="grid grid-cols-6 gap-1">
							{#each emojis as emoji}
								<button
									type="button"
									onclick={() => insertEmoji(emoji)}
									class="p-1 hover:bg-pink-100 rounded transition-colors duration-200 text-base"
								>
									{emoji}
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Action Buttons Row -->
		<div class="flex space-x-2 pt-1">
			<button
				onclick={handleClearInputs}
				type="button"
				class="w-1/3 py-2 px-3 bg-white border-2 border-pink-300 text-pink-600 rounded-xl hover:bg-pink-50 transition-all duration-200 text-xs font-semibold"
			>
				Clear
			</button>

			{#if isFutureDate()}
				<div class="w-2/3 p-2 bg-yellow-50 border border-yellow-300 rounded-xl">
					<p class="text-[11px] text-yellow-700 font-medium leading-tight">
						Select today or a past date.
					</p>
				</div>
			{:else}
				<button
					onclick={handleSaveMemory}
					disabled={isSaving || !selectedDate || isDescriptionEmpty()}
					class="w-2/3 py-2.5 px-4 bg-gradient-to-r from-pink-400 to-pink-600 text-white rounded-xl hover:from-pink-500 hover:to-pink-700 transition-all duration-200 text-xs font-semibold shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-1.5"
				>
					{#if isSaving}
						<svg class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
						<span>Saving...</span>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
						</svg>
						<span>Save Memory</span>
					{/if}
				</button>
			{/if}
		</div>
	</div>
</div>

<style>
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
