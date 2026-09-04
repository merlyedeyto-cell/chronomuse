<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { supabase } from '$lib/supabaseClient';

	const dispatch = createEventDispatcher();

	let { selectedDate = '', memories = [] } = $props();

	let isLoading = $state(true);
	let isClosing = $state(false);
	let showEmojiPicker = $state(false);
	let editedDescription = $state('');
	let editedMoodTag = $state('');
	let editedMemoryTag = $state('');
	let editedPhotoVideo = $state(null);
	let editedMusic = $state(null);
	let editedPhotoVideoPreview = $state(null);
	let editedPhotoVideoType = $state('');
	let isEditing = $state(false);
	let isSaving = $state(false);
	let photoVideoInput;
	let musicInput;
	
	// Friends & Sharing State
	let friends = $state([]);
	let showShareModal = $state(false);
	let memoryToShare = $state(null);
	let selectedShareFriendIds = $state([]);
	let alreadySharedRecipientIds = $state([]);
	let isLoadingSharedRecipients = $state(false);
	let isSharing = $state(false);
	let shareSuccessMsg = $state('');
	
	// Full-screen image viewer
	let showFullScreenImage = $state(false);
	let fullScreenImageUrl = $state('');

	function openFullScreenImage(url) {
		fullScreenImageUrl = url;
		showFullScreenImage = true;
		document.body.style.overflow = 'hidden';
	}

	function closeFullScreenImage() {
		showFullScreenImage = false;
		fullScreenImageUrl = '';
		document.body.style.overflow = '';
	}

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

	const emojis = ['😀', '😁', '😂', '🥰', '😍', '🤩', '😊', '😎', '🥳', '🎉', '❤️', '🔥', '✨', '🌟', '💫', '🎈', '🎊', '📸', '📷', '🎵', '🎶', '💕', '💖', '💗', '🌸', '🌺', '🌻', '🌈', '☀️', '🌙', '⭐'];

	onMount(() => {
		// Prevent body scroll when modal is open
		document.body.style.overflow = 'hidden';
		fetchFriends();
	});

	function fetchFriends() {
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
			.catch(err => console.error('Error fetching friends for sharing:', err));
		}
	}

	async function openShareModal(memory) {
		memoryToShare = memory;
		selectedShareFriendIds = [];
		shareSuccessMsg = '';
		alreadySharedRecipientIds = [];
		isLoadingSharedRecipients = true;
		showShareModal = true;

		const currentUser = localStorage.getItem('chronomuse_user');
		const user = currentUser ? JSON.parse(currentUser) : null;

		if (user && user.id && memory && memory.id) {
			try {
				const { data: sharedRows } = await supabase
					.from('chronomuse_shared_memories')
					.select('recipient_id')
					.eq('memory_id', memory.id)
					.eq('sender_id', user.id);

				if (sharedRows && Array.isArray(sharedRows)) {
					alreadySharedRecipientIds = sharedRows.map(r => r.recipient_id);
				}
			} catch (err) {
				console.error('Error fetching already shared recipients:', err);
			} finally {
				isLoadingSharedRecipients = false;
			}
		} else {
			isLoadingSharedRecipients = false;
		}
	}

	function toggleShareFriend(friendId) {
		if (alreadySharedRecipientIds.includes(friendId)) return;
		if (selectedShareFriendIds.includes(friendId)) {
			selectedShareFriendIds = selectedShareFriendIds.filter(id => id !== friendId);
		} else {
			selectedShareFriendIds = [...selectedShareFriendIds, friendId];
		}
	}

	async function handleShareMemorySubmit() {
		if (!memoryToShare || selectedShareFriendIds.length === 0 || isSharing) return;
		isSharing = true;
		const currentUser = localStorage.getItem('chronomuse_user');
		const user = currentUser ? JSON.parse(currentUser) : null;

		// Filter out any friends that were already shared with
		const friendsToShare = selectedShareFriendIds.filter(id => !alreadySharedRecipientIds.includes(id));
		if (friendsToShare.length === 0) {
			isSharing = false;
			return;
		}

		try {
			const res = await fetch(API_ENDPOINTS.shareMemory, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					memory_id: memoryToShare.id,
					sender_id: user.id,
					recipient_ids: friendsToShare
				})
			});
			const data = await res.json();
			if (data.success) {
				alreadySharedRecipientIds = [...alreadySharedRecipientIds, ...friendsToShare];
				shareSuccessMsg = 'Memory shared successfully!';
				setTimeout(() => {
					showShareModal = false;
					memoryToShare = null;
					selectedShareFriendIds = [];
					shareSuccessMsg = '';
				}, 1500);
			} else {
				alert(data.error || 'Failed to share memory');
			}
		} catch (err) {
			console.error('Error sharing memory:', err);
		} finally {
			isSharing = false;
		}
	}

	function handleEditedPhotoVideoChange(event) {
		const file = event.target.files[0];
		if (file) {
			editedPhotoVideo = file;
			editedPhotoVideoType = file.type;
			// Create preview URL
			if (file.type.startsWith('image/')) {
				editedPhotoVideoPreview = URL.createObjectURL(file);
			} else if (file.type.startsWith('video/')) {
				editedPhotoVideoPreview = URL.createObjectURL(file);
			}
		}
	}

	function handleEditedMusicChange(event) {
		const file = event.target.files[0];
		if (file) {
			editedMusic = file;
		}
	}

	function getMediaUrl(url) {
		if (!url) return '';

		// If it's already a full URL (http/https), return as-is
		if (url.startsWith('http://') || url.startsWith('https://')) {
			return url;
		}

		// If starts with /uploads/, convert to full URL based on current environment
		if (url.startsWith('/uploads/')) {
			// On production (InfinityFree), use relative path with leading slash
			// On localhost with Vite dev server, relative path also works
			return url;
		}

		// Convert old localhost URLs to relative paths
		if (url.startsWith('http://localhost/chronomuse/')) {
			return url.replace('http://localhost/chronomuse/', '/');
		}
		if (url.startsWith('/chronomuse/')) {
			return url.replace('/chronomuse/', '/');
		}

		return url;
	}

	function getMusicUrl(url) {
		if (!url) return '';

		// If it's already a full URL (http/https), return as-is
		if (url.startsWith('http://') || url.startsWith('https://')) {
			return url;
		}

		// For music files, always use absolute path from root
		if (url.startsWith('/uploads/')) {
			return url;
		}

		// Handle any subfolder deployments
		if (url.startsWith('uploads/')) {
			return '/' + url;
		}

		return url;
	}

	function formatDate(dateString) {
		if (!dateString) return 'No date selected';
		// Parse date string manually to avoid timezone issues
		const [year, month, day] = dateString.split('-');
		const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
		return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
	}

	function formatTime(timestamp) {
		if (!timestamp) return '';
		const date = new Date(timestamp);
		return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
	}

	function getMoodColor(mood) {
		const moodColors = {
			'Happy': 'bg-yellow-100 text-yellow-700 border-yellow-300',
			'Sad': 'bg-blue-100 text-blue-700 border-blue-300',
			'Excited': 'bg-orange-100 text-orange-700 border-orange-300',
			'Angry': 'bg-red-100 text-red-700 border-red-300',
			'Calm': 'bg-green-100 text-green-700 border-green-300',
			'Anxious': 'bg-purple-100 text-purple-700 border-purple-300',
			'Grateful': 'bg-pink-100 text-pink-700 border-pink-300',
			'Lonely': 'bg-gray-100 text-gray-700 border-gray-300',
			'Love': 'bg-rose-100 text-rose-700 border-rose-300',
			'Neutral': 'bg-slate-100 text-slate-700 border-slate-300'
		};
		return moodColors[mood] || 'bg-pink-100 text-pink-700 border-pink-300';
	}

	function getMemoryDisplayDetails(memory) {
		let senderName = memory.shared_by || null;
		let desc = memory.description || '';
		let memTag = memory.memory_tag || '';

		// Extract sender from description or memory_tag if not already set
		if (!senderName) {
			const matchDesc = desc.match(/\(Shared by @([a-zA-Z0-9_]+)\)/i);
			if (matchDesc) {
				senderName = matchDesc[1];
			} else {
				const matchTag = memTag.match(/Shared memory from @([a-zA-Z0-9_]+)/i);
				if (matchTag) {
					senderName = matchTag[1];
				}
			}
		}

		// Clean description: strip trailing (Shared by @...) from the body text
		const cleanDesc = desc.replace(/\s*\(Shared by @[a-zA-Z0-9_]+\)\s*$/gi, '').trim();

		// Clean memory tag: strip "Shared memory from @..."
		let cleanTag = memTag.replace(/^Shared memory from @[a-zA-Z0-9_]+\s*$/gi, '').trim();
		if (cleanTag === 'Untitled Memory' || cleanTag === 'Special Memory') {
			cleanTag = '';
		}

		return {
			senderName,
			isShared: !!(senderName || memory.is_shared),
			cleanDesc,
			cleanTag
		};
	}

	function handleDeleteMemory(memoryId) {
		if (confirm('Are you sure you want to delete this memory?')) {
			dispatch('deleteMemory', { memoryId, date: selectedDate });
		}
	}

	function handleEditMemory(memory) {
		isEditing = true;
		editedDescription = memory.description || '';
		editedMoodTag = memory.mood_tag || '';
		editedMemoryTag = memory.memory_tag || '';
		editedPhotoVideo = null;
		editedMusic = null;
		editedPhotoVideoPreview = null;
		// Reset file inputs
		if (photoVideoInput) photoVideoInput.value = '';
		if (musicInput) musicInput.value = '';
	}

	function handleCancelEdit() {
		isEditing = false;
		editedDescription = '';
		editedMoodTag = '';
		editedMemoryTag = '';
		editedPhotoVideo = null;
		editedMusic = null;
		if (editedPhotoVideoPreview) {
			URL.revokeObjectURL(editedPhotoVideoPreview);
			editedPhotoVideoPreview = null;
		}
	}

	function handleSaveEdit(memory) {
		isSaving = true;
		
		// Create FormData for file upload
		const formData = new FormData();
		formData.append('memory_id', memory.id);
		formData.append('description', editedDescription);
		formData.append('mood_tag', editedMoodTag);
		formData.append('memory_tag', editedMemoryTag);
		
		if (editedPhotoVideo) {
			formData.append('photo_video', editedPhotoVideo);
		}
		if (editedMusic) {
			formData.append('music', editedMusic);
		}
		
		dispatch('updateMemoryWithFiles', {
			memory,
			formData,
			description: editedDescription,
			moodTag: editedMoodTag,
			memoryTag: editedMemoryTag
		});
		
		isSaving = false;
		isEditing = false;
	}

	function handleClose() {
		isClosing = true;
		// Restore body scroll
		document.body.style.overflow = '';
		setTimeout(() => {
			dispatch('close');
		}, 300);
	}

	function insertEmoji(emoji) {
		editedDescription += emoji;
		showEmojiPicker = false;
	}
</script>

<!-- Backdrop Overlay -->
<div
	class="fixed inset-0 bg-black/40 backdrop-blur-md z-40 transition-opacity duration-300"
	class:opacity-0={isClosing}
	onclick={handleClose}
></div>

<!-- Modal Content Container -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center p-4"
	onclick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
>
	<div
		class="bg-white border-2 border-pink-300 rounded-2xl shadow-xl p-4 sm:p-5 relative transition-all duration-300 max-w-sm sm:max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col"
		class:opacity-0={isClosing}
		class:scale-95={isClosing}
		class:transform={isClosing}
		onclick={(e) => e.stopPropagation()}
	>
		<!-- Close Button -->
		<button
			onclick={handleClose}
			class="absolute top-3.5 right-3.5 p-1.5 text-pink-400 hover:text-pink-600 hover:bg-pink-100 rounded-lg transition-all duration-200"
			title="Close"
		>
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
				<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>

	<!-- Header -->
	<div class="text-center mb-4">
		<h2 class="text-base sm:text-lg font-bold text-pink-600">View Memories</h2>
		<p class="text-[11px] sm:text-xs text-pink-400 mt-0.5">Your special moments on this date</p>
	</div>

	<!-- Selected Date Card -->
	<div class="mb-3 p-3 bg-gradient-to-r from-pink-400 to-pink-600 rounded-xl shadow-sm text-white">
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

	<!-- Memories List - Scrollable -->
	<div class="flex-1 overflow-y-auto pr-1 -mr-1">
	{#if memories.length === 0}
		<div class="text-center py-8">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-16 h-16 text-pink-200 mx-auto mb-3">
				<path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
			</svg>
			<p class="text-sm text-pink-400 mb-4">No memories for this date yet</p>
			<button
				onclick={() => dispatch('addMemory')}
				class="py-2 px-4 bg-gradient-to-r from-pink-400 to-pink-600 text-white rounded-lg hover:from-pink-500 hover:to-pink-700 transition-all duration-200 text-sm font-semibold shadow-md"
			>
				Add Your First Memory
			</button>
		</div>
	{:else}
		<div class="space-y-3">
			{#each memories as memory (memory.id)}
				{@debug memory}
				<div class="p-4 bg-pink-50 border-2 border-pink-200 rounded-xl hover:border-pink-300 transition-all duration-200">
					{#if isEditing && memory.id}
						<!-- Edit Mode -->
						<div class="space-y-3">
							<!-- Mood Tag -->
							<select
								bind:value={editedMoodTag}
								class="w-full px-3 py-2 bg-white border-2 border-pink-200 rounded-lg text-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent text-sm"
							>
								<option value="">Select mood</option>
								{#each moodTags as mood}
									<option value={mood}>{mood}</option>
								{/each}
							</select>

							<!-- Memory Tag -->
							<select
								bind:value={editedMemoryTag}
								class="w-full px-3 py-2 bg-white border-2 border-pink-200 rounded-lg text-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent text-sm"
							>
								<option value="">Select tag</option>
								{#each memoryTags as tag}
									<option value={tag}>{tag}</option>
								{/each}
							</select>

							<!-- Upload Photo or Video -->
							<div>
								<label class="block text-xs font-medium text-pink-600 mb-1">Photo or Video</label>
								<label class="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-pink-300 rounded-xl bg-gradient-to-r from-pink-50 to-pink-100 cursor-pointer hover:bg-pink-100 hover:border-pink-400 transition-all duration-200 overflow-hidden">
									{#if editedPhotoVideoPreview}
										{#if editedPhotoVideoType.startsWith('image/')}
											<img src={editedPhotoVideoPreview} alt="Preview" class="w-full h-full object-contain" />
										{:else if editedPhotoVideoType.startsWith('video/')}
											<video src={editedPhotoVideoPreview} class="w-full h-full object-contain" controls aria-label="Memory video preview"></video>
										{/if}
									{:else if memory.photo_video}
										{#if memory.photo_video_type && memory.photo_video_type.startsWith('image/')}
											<img src={getMediaUrl(memory.photo_video)} alt="Current" class="w-full h-full object-contain" />
										{:else if memory.photo_video_type && memory.photo_video_type.startsWith('video/')}
											<video src={getMediaUrl(memory.photo_video)} class="w-full h-full object-contain" controls aria-label="Memory video"></video>
										{/if}
									{:else}
										<div class="flex items-center space-x-3 pt-2 pb-3 px-4">
											<div class="w-10 h-10 rounded-full bg-gradient-to-r from-pink-400 to-pink-600 flex items-center justify-center flex-shrink-0">
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 text-white">
													<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
												</svg>
											</div>
											<div class="flex-1 min-w-0">
												<p class="text-xs text-pink-600 font-semibold">Upload Photo/Video</p>
												<p class="text-xs text-pink-400">Click or drag to upload</p>
											</div>
										</div>
									{/if}
									<input
										type="file"
										accept="image/*,video/*"
										onchange={handleEditedPhotoVideoChange}
										bind:this={photoVideoInput}
										class="hidden"
									/>
								</label>
								{#if memory.photo_video && !editedPhotoVideo}
									<p class="text-xs text-pink-400 mt-1 flex items-center">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3 mr-1">
											<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
										</svg>
										Current file will be replaced
									</p>
								{/if}
							</div>

							<!-- Upload Music -->
							<div>
								<label class="block text-xs font-medium text-pink-600 mb-1">Music</label>
								<label class="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-pink-300 rounded-xl bg-gradient-to-r from-pink-50 to-pink-100 cursor-pointer hover:bg-pink-100 hover:border-pink-400 transition-all duration-200">
									<div class="flex items-center space-x-3 pt-2 pb-3 px-4">
										<div class="w-10 h-10 rounded-full bg-gradient-to-r from-pink-400 to-pink-600 flex items-center justify-center flex-shrink-0">
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 text-white">
												<path stroke-linecap="round" stroke-linejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
											</svg>
										</div>
										<div class="flex-1 min-w-0">
											{#if editedMusic}
												<p class="text-xs text-pink-700 font-semibold truncate">{editedMusic.name}</p>
												<p class="text-xs text-pink-400">Click to change</p>
											{:else if memory.music}
												<p class="text-xs text-pink-600 font-medium truncate">Current: {memory.music.split('/').pop()}</p>
												<p class="text-xs text-pink-400">Click to change</p>
											{:else}
												<p class="text-xs text-pink-600 font-semibold">Upload Music</p>
												<p class="text-xs text-pink-400">Click or drag to upload</p>
											{/if}
										</div>
									</div>
									<input
										type="file"
										accept="audio/*"
										onchange={handleEditedMusicChange}
										bind:this={musicInput}
										class="hidden"
									/>
								</label>
							</div>

							<!-- Description -->
							<div class="relative">
								<textarea
									bind:value={editedDescription}
									placeholder="Write about this memory..."
									rows="3"
									class="w-full px-3 py-2 pr-10 bg-white border-2 border-pink-200 rounded-lg text-pink-700 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent text-sm resize-none"
								></textarea>
								<button
									type="button"
									onclick={() => showEmojiPicker = !showEmojiPicker}
									class="absolute bottom-2 right-2 w-7 h-6 border-2 border-pink-400 hover:border-pink-600 rounded-full bg-transparent flex items-end justify-end pb-0 pr-0 transition-all duration-200 hover:scale-110"
								>
									<span class="text-lg leading-none translate-x-1 translate-y-1">😊</span>
								</button>
								{#if showEmojiPicker}
									<div class="absolute bottom-full right-0 mb-2 p-2 bg-white border-2 border-pink-300 rounded-lg shadow-lg z-10 max-w-[180px]">
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

							<!-- Save/Cancel Buttons -->
							<div class="flex space-x-2">
								<button
									onclick={() => handleSaveEdit(memory)}
									disabled={isSaving}
									class="flex-1 py-2 px-3 bg-gradient-to-r from-pink-400 to-pink-600 text-white rounded-lg hover:from-pink-500 hover:to-pink-700 transition-all duration-200 text-sm font-semibold disabled:opacity-50"
								>
									{#if isSaving}Saving...{:else}Save{/if}
								</button>
								<button
									onclick={handleCancelEdit}
									class="flex-1 py-2 px-3 bg-white border-2 border-pink-300 text-pink-600 rounded-lg hover:bg-pink-50 transition-all duration-200 text-sm font-semibold"
								>
									Cancel
								</button>
							</div>
						</div>
					{:else}
						<!-- View Mode -->
						{@const details = getMemoryDisplayDetails(memory)}
						<div class="space-y-3">
							<!-- Header Row: Tags & Shared Badge on Left, Action Toolbar on Right -->
							<div class="flex items-center justify-between gap-2 border-b border-pink-100 pb-2.5">
								<div class="flex items-center flex-wrap gap-1.5 min-w-0">
									{#if details.isShared && details.senderName}
										<span class="text-[11px] px-2.5 py-0.5 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold shadow-xs inline-flex items-center space-x-1">
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3 text-pink-100 flex-shrink-0">
												<path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a5.97 5.97 0 00-.942 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
											</svg>
											<span>Shared by @{details.senderName}</span>
										</span>
									{/if}

									{#if memory.mood_tag}
										<span class="text-[10px] px-2.5 py-0.5 rounded-full border {getMoodColor(memory.mood_tag)} font-bold whitespace-nowrap shadow-xs">
											{memory.mood_tag}
										</span>
									{/if}

									{#if details.cleanTag}
										<span class="text-[10px] px-2.5 py-0.5 rounded-full bg-pink-100 text-pink-700 border border-pink-300 font-bold whitespace-nowrap shadow-xs">
											{details.cleanTag}
										</span>
									{/if}
								</div>

								<!-- Action Toolbar on Right -->
								<div class="flex items-center space-x-1 flex-shrink-0">
									{#if !details.isShared}
										<!-- Share with Friend Button -->
										<button
											onclick={() => openShareModal(memory)}
											class="p-1.5 text-pink-500 hover:text-pink-700 hover:bg-pink-100 rounded-lg transition-all duration-200 flex items-center space-x-1 active:scale-95"
											title="Share with Friend"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
												<path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5zm0-12a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" />
											</svg>
											<span class="text-xs font-semibold">Share</span>
										</button>

										<button
											onclick={() => handleEditMemory(memory)}
											class="p-1.5 text-pink-400 hover:text-pink-600 hover:bg-pink-100 rounded-lg transition-all duration-200 active:scale-95"
											title="Edit"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
												<path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
											</svg>
										</button>
									{/if}

									<button
										onclick={() => handleDeleteMemory(memory.id)}
										class="p-1.5 text-pink-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 active:scale-95"
										title="Delete"
									>
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 12.55a1.125 1.125 0 01-1.126 1.095H9.726a1.125 1.125 0 01-1.126-1.095L8.259 9M8.875 5.625V4.5c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v1.125m-4.5 0V4.5m0 0h4.5m-4.5 0a2.25 2.25 0 00-2.25 2.25v1.5a2.25 2.25 0 002.25 2.25h1.5a2.25 2.25 0 002.25-2.25v-1.5a2.25 2.25 0 00-2.25-2.25h-1.5z" />
										</svg>
									</button>
								</div>
							</div>

							<!-- Clean Description Content -->
							{#if details.cleanDesc}
								<p class="text-xs sm:text-sm font-medium text-pink-900 leading-relaxed whitespace-pre-wrap">{details.cleanDesc}</p>
							{/if}

							<!-- Media -->
							{#if memory.photo_video}
								{#if !memory.photo_video_type || memory.photo_video_type.startsWith('image/')}
									<div class="relative rounded-lg overflow-hidden border-2 border-pink-200 cursor-pointer hover:border-pink-400 transition-all duration-200" onclick={() => openFullScreenImage(getMediaUrl(memory.photo_video))}>
										<img src={getMediaUrl(memory.photo_video)} alt="Memory" class="w-full h-44 object-cover hover:scale-105 transition-transform duration-300" />
										<div class="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-10 transition-all duration-200 flex items-center justify-center pointer-events-none">
											<span class="text-white text-xs font-medium opacity-0 hover:opacity-100 bg-black bg-opacity-50 px-2.5 py-1 rounded-full">Click to enlarge</span>
										</div>
									</div>
								{:else if memory.photo_video_type && memory.photo_video_type.startsWith('video/')}
									<div class="relative rounded-lg overflow-hidden border-2 border-pink-200">
										<video src={getMediaUrl(memory.photo_video)} class="w-full h-44 object-cover" controls aria-label="Memory video"></video>
									</div>
								{:else}
									<!-- Fallback: try to display as image -->
									<div class="relative rounded-lg overflow-hidden border-2 border-pink-200 cursor-pointer hover:border-pink-400 transition-all duration-200" onclick={() => openFullScreenImage(getMediaUrl(memory.photo_video))}>
										<img src={getMediaUrl(memory.photo_video)} alt="Memory" class="w-full h-44 object-cover hover:scale-105 transition-transform duration-300" />
									</div>
								{/if}
							{/if}

							{#if memory.music}
								<div class="rounded-lg overflow-hidden border border-pink-200 bg-gradient-to-r from-pink-50 to-pink-100 p-2.5">
									<div class="flex items-center space-x-1.5 mb-1.5">
										<div class="w-6 h-6 rounded-full bg-gradient-to-r from-pink-400 to-pink-600 flex items-center justify-center">
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5 text-white">
												<path stroke-linecap="round" stroke-linejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
											</svg>
										</div>
										<span class="text-[11px] font-semibold text-pink-600">Memory Music</span>
									</div>
									<div class="custom-audio-player">
										<audio src={getMusicUrl(memory.music)} controls preload="metadata" class="w-full" crossorigin="anonymous"></audio>
									</div>
									<style>
										.custom-audio-player audio {
											width: 100%;
											height: 36px;
											border-radius: 9999px;
										}
										.custom-audio-player audio::-webkit-media-controls-panel {
											background-color: #fce7f3;
											border-radius: 9999px;
										}
										.custom-audio-player audio::-webkit-media-controls-play-button {
											background-color: #ec4899;
											border-radius: 50%;
										}
										.custom-audio-player audio::-webkit-media-controls-current-time-display,
										.custom-audio-player audio::-webkit-media-controls-time-remaining-display {
											color: #be185d;
											font-size: 10px;
											font-weight: 600;
										}
									</style>
								</div>
							{/if}

							<!-- Timestamp -->
							<div class="flex items-center justify-between pt-1.5 border-t border-pink-200">
								<span class="text-[10px] text-pink-400">
									Created: {formatTime(memory.created_at)}
								</span>
								{#if memory.updated_at && memory.updated_at !== memory.created_at}
									<span class="text-[10px] text-pink-300">
										Updated: {formatTime(memory.updated_at)}
									</span>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
	</div>

	<!-- Add Memory Button - Fixed at Bottom -->
	<div class="mt-3 pt-3 border-t border-pink-200 flex-shrink-0">
		<button
			onclick={() => dispatch('addMemory')}
			class="w-full py-2 px-3 bg-gradient-to-r from-pink-500 to-pink-600 text-white rounded-lg hover:from-pink-600 hover:to-pink-700 active:scale-95 transition-all duration-200 text-xs sm:text-sm font-bold shadow-sm flex items-center justify-center space-x-1.5"
		>
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
			</svg>
			<span>Add Another Memory</span>
		</button>
	</div>
	</div>
</div>

<!-- Full-Screen Image Viewer -->
{#if showFullScreenImage}
	<div class="fixed inset-0 z-50 bg-black bg-opacity-95 flex items-center justify-center overflow-auto">
		<!-- Close Button (Top Right) -->
		<button
			onclick={closeFullScreenImage}
			class="absolute top-4 right-4 p-2 bg-white bg-opacity-20 hover:bg-opacity-30 text-white rounded-full backdrop-blur-sm transition-all duration-200 z-60"
			title="Close"
		>
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
				<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>

		<!-- Image Container -->
		<div class="w-full h-screen flex items-center justify-center p-4">
			<img src={fullScreenImageUrl} alt="Full size" class="max-w-full max-h-full object-contain" />
		</div>
	</div>
{/if}

<!-- Share Memory Modal -->
{#if showShareModal}
	<div class="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
		<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-2xl p-6 max-w-sm w-full relative animate-modal-content">
			<button
				onclick={() => showShareModal = false}
				class="absolute top-3 right-3 text-pink-400 hover:text-pink-600 p-1 rounded-lg"
			>
				✕
			</button>
			<div class="text-center mb-4">
				<div class="w-12 h-12 mx-auto mb-2 rounded-full bg-pink-100 flex items-center justify-center text-pink-500 text-xl shadow-inner">
					🤝
				</div>
				<h3 class="text-lg font-bold text-pink-600">Share Memory</h3>
				<p class="text-xs text-pink-400">Select friends to tag/share this memory with so both of you can see it on this date!</p>
			</div>

			{#if shareSuccessMsg}
				<div class="mb-4 p-2.5 bg-green-100 border border-green-300 text-green-700 rounded-xl text-xs text-center font-medium">
					{shareSuccessMsg}
				</div>
			{/if}

			{#if friends.length === 0}
				<p class="text-xs text-pink-400 text-center py-4">No friends found. Add friends first from the sidebar!</p>
			{:else}
				<div class="space-y-2 max-h-56 overflow-y-auto mb-5 p-1 pr-1.5">
					{#if isLoadingSharedRecipients}
						<div class="py-3 text-center">
							<div class="animate-spin w-5 h-5 border-2 border-pink-300 border-t-pink-500 rounded-full mx-auto mb-1"></div>
							<span class="text-[11px] text-pink-400">Checking shared status...</span>
						</div>
					{/if}
					{#each friends as friend (friend.friend_id)}
						{@const isAlreadyShared = alreadySharedRecipientIds.includes(friend.friend_id)}
						{@const isSelected = selectedShareFriendIds.includes(friend.friend_id)}
						<button
							type="button"
							disabled={isAlreadyShared}
							onclick={() => {
								if (!isAlreadyShared) toggleShareFriend(friend.friend_id);
							}}
							class="w-full p-2.5 rounded-xl border-2 transition-all flex items-center justify-between text-left {isAlreadyShared ? 'bg-pink-50/70 border-pink-200/80 opacity-80 cursor-not-allowed' : isSelected ? 'border-pink-500 bg-pink-50/90 shadow-2xs cursor-pointer' : 'border-pink-200 bg-white hover:bg-pink-50/40 hover:border-pink-300 cursor-pointer'}"
						>
							<div class="flex items-center space-x-2.5 min-w-0">
								<div class="w-8 h-8 rounded-full {isAlreadyShared ? 'bg-gradient-to-r from-pink-300 to-rose-300' : 'bg-gradient-to-r from-pink-400 to-pink-600'} text-white font-bold text-xs flex items-center justify-center flex-shrink-0 shadow-2xs">
									{friend.username.charAt(0).toUpperCase()}
								</div>
								<div class="min-w-0">
									<span class="text-xs font-semibold text-pink-700 block truncate">@{friend.username}</span>
									{#if isAlreadyShared}
										<span class="text-[10px] text-pink-500 font-medium block leading-tight">You already shared this memory to this user</span>
									{/if}
								</div>
							</div>
							<div class="flex-shrink-0 ml-2">
								{#if isAlreadyShared}
									<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-100 text-pink-600 border border-pink-200/90 flex items-center gap-1 shadow-2xs">
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3 h-3 text-pink-500">
											<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
										</svg>
										<span>Shared</span>
									</span>
								{:else if isSelected}
									<span class="w-5 h-5 rounded-full bg-pink-500 text-white flex items-center justify-center text-xs font-bold shadow-2xs">
										✓
									</span>
								{:else}
									<span class="w-5 h-5 rounded-full border-2 border-pink-300 bg-white"></span>
								{/if}
							</div>
						</button>
					{/each}
				</div>
				<button
					onclick={handleShareMemorySubmit}
					disabled={selectedShareFriendIds.length === 0 || isSharing}
					class="w-full py-2.5 bg-gradient-to-r from-pink-400 to-pink-600 text-white rounded-xl font-semibold text-sm hover:from-pink-500 hover:to-pink-700 transition-all disabled:opacity-50 shadow-md cursor-pointer disabled:cursor-not-allowed"
				>
					{#if isSharing}Sharing...{:else}Share Memory{/if}
				</button>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* Custom scrollbar for memories list */
	.flex-1::-webkit-scrollbar {
		width: 6px;
	}

	.flex-1::-webkit-scrollbar-track {
		background: rgba(255, 225, 240, 0.5);
		border-radius: 10px;
	}

	.flex-1::-webkit-scrollbar-thumb {
		background: linear-gradient(180deg, #ff69b4, #ff1493);
		border-radius: 10px;
	}

	.flex-1::-webkit-scrollbar-thumb:hover {
		background: linear-gradient(180deg, #ff1493, #b11663);
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

	.animate-modal-backdrop {
		animation: modal-backdrop 0.3s ease-out;
	}

	.animate-modal-content {
		animation: modal-content 0.3s ease-out cubic-bezier(0.34, 1.56, 0.64, 1);
	}
</style>
