<script>
	import { createEventDispatcher, onMount } from 'svelte';

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
	});

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
	class="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-300"
	class:opacity-0={isClosing}
	onclick={handleClose}
></div>

<!-- Modal Content -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center p-4"
>
	<div
		class="bg-white border-2 border-pink-300 rounded-2xl shadow-2xl p-6 relative transition-all duration-300 max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col"
		class:opacity-0={isClosing}
		class:scale-95={isClosing}
		class:transform={isClosing}
	>
		<!-- Close Button -->
		<button
			onclick={handleClose}
			class="absolute top-3 right-3 p-2 text-pink-400 hover:text-pink-600 hover:bg-pink-100 rounded-lg transition-all duration-200"
			title="Close"
		>
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>

	<!-- Header -->
	<div class="text-center mb-6">
		<h2 class="text-xl font-bold text-pink-500">View Memories</h2>
		<p class="text-sm text-pink-400 mt-1">Your special moments on this date</p>
	</div>

	<!-- Selected Date Card -->
	<div class="mb-4 p-4 bg-gradient-to-r from-pink-400 to-pink-600 rounded-xl shadow-md text-white">
		<div class="flex items-center space-x-3">
			<div class="p-2 bg-white/20 rounded-lg">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
				</svg>
			</div>
			<div>
				<p class="text-xs text-pink-100 uppercase tracking-wide">Selected Date</p>
				<p class="text-sm font-semibold">{formatDate(selectedDate)}</p>
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
						<div class="space-y-2">
							<!-- Header with tags -->
							<div class="flex items-start justify-between">
								<div class="flex items-center space-x-2 flex-wrap gap-2">
									{#if memory.mood_tag}
										<span class="text-xs px-2 py-1 rounded-full border {getMoodColor(memory.mood_tag)} font-medium">
											{memory.mood_tag}
										</span>
									{/if}
									{#if memory.memory_tag}
										<span class="text-xs px-2 py-1 rounded-full bg-pink-200 text-pink-700 border border-pink-300 font-medium">
											{memory.memory_tag}
										</span>
									{/if}
								</div>
								<div class="flex items-center space-x-1">
									<button
										onclick={() => handleEditMemory(memory)}
										class="p-1.5 text-pink-400 hover:text-pink-600 hover:bg-pink-100 rounded transition-all duration-200"
										title="Edit"
									>
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
										</svg>
									</button>
									<button
										onclick={() => handleDeleteMemory(memory.id)}
										class="p-1.5 text-pink-400 hover:text-red-600 hover:bg-red-50 rounded transition-all duration-200"
										title="Delete"
									>
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
											<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 12.55a1.125 1.125 0 01-1.126 1.095H9.726a1.125 1.125 0 01-1.126-1.095L8.259 9M8.875 5.625V4.5c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v1.125m-4.5 0V4.5m0 0h4.5m-4.5 0a2.25 2.25 0 00-2.25 2.25v1.5a2.25 2.25 0 002.25 2.25h1.5a2.25 2.25 0 002.25-2.25v-1.5a2.25 2.25 0 00-2.25-2.25h-1.5z" />
										</svg>
									</button>
								</div>
							</div>

							<!-- Description -->
							{#if memory.description}
								<p class="text-sm text-pink-700 whitespace-pre-wrap">{memory.description}</p>
							{/if}

							<!-- Media -->
							{#if memory.photo_video}
								{#if !memory.photo_video_type || memory.photo_video_type.startsWith('image/')}
									<div class="relative rounded-lg overflow-hidden border-2 border-pink-200 cursor-pointer hover:border-pink-400 transition-all duration-200" onclick={() => openFullScreenImage(getMediaUrl(memory.photo_video))}>
										<img src={getMediaUrl(memory.photo_video)} alt="Memory" class="w-full h-48 object-cover hover:scale-105 transition-transform duration-300" />
										<div class="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-10 transition-all duration-200 flex items-center justify-center pointer-events-none">
											<span class="text-white text-sm font-medium opacity-0 hover:opacity-100 bg-black bg-opacity-50 px-3 py-1 rounded-full">Click to enlarge</span>
										</div>
									</div>
								{:else if memory.photo_video_type && memory.photo_video_type.startsWith('video/')}
									<div class="relative rounded-lg overflow-hidden border-2 border-pink-200">
										<video src={getMediaUrl(memory.photo_video)} class="w-full h-48 object-cover" controls aria-label="Memory video"></video>
									</div>
								{:else}
									<!-- Fallback: try to display as image -->
									<div class="relative rounded-lg overflow-hidden border-2 border-pink-200 cursor-pointer hover:border-pink-400 transition-all duration-200" onclick={() => openFullScreenImage(getMediaUrl(memory.photo_video))}>
										<img src={getMediaUrl(memory.photo_video)} alt="Memory" class="w-full h-48 object-cover hover:scale-105 transition-transform duration-300" />
									</div>
								{/if}
							{/if}

							{#if memory.music}
								<div class="rounded-lg overflow-hidden border-2 border-pink-200 bg-gradient-to-r from-pink-50 to-pink-100 p-3">
									<div class="flex items-center space-x-2 mb-2">
										<div class="w-8 h-8 rounded-full bg-gradient-to-r from-pink-400 to-pink-600 flex items-center justify-center">
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-white">
												<path stroke-linecap="round" stroke-linejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
											</svg>
										</div>
										<span class="text-xs font-medium text-pink-600">Memory Music</span>
									</div>
									<div class="custom-audio-player">
										<audio src={getMusicUrl(memory.music)} controls preload="metadata" class="w-full" crossorigin="anonymous"></audio>
									</div>
									<style>
										.custom-audio-player audio {
											width: 100%;
											height: 40px;
										}
										.custom-audio-player audio::-webkit-media-controls-panel {
											background: linear-gradient(to right, #fce7f3, #fbcfe8);
										}
										.custom-audio-player audio::-webkit-media-controls-play-button,
										.custom-audio-player audio::-webkit-media-controls-current-time-display,
										.custom-audio-player audio::-webkit-media-controls-time-remaining-display {
											color: #ec4899;
										}
										.custom-audio-player audio::-webkit-media-controls-play-button {
											filter: hue-rotate(300deg);
										}
										.custom-audio-player audio::-webkit-slider-thumb {
											-webkit-appearance: none;
											appearance: none;
											width: 16px;
											height: 16px;
											border-radius: 50%;
											background: #ec4899;
											cursor: pointer;
										}
										.custom-audio-player audio::-moz-range-thumb {
											width: 16px;
											height: 16px;
											border-radius: 50%;
											background: #ec4899;
											cursor: pointer;
											border: none;
										}
										.custom-audio-player audio::-webkit-slider-runnable-track {
											background: #fbcfe8;
											height: 6px;
											border-radius: 3px;
										}
										.custom-audio-player audio::-moz-range-track {
											background: #fbcfe8;
											height: 6px;
											border-radius: 3px;
										}
									</style>
								</div>
							{/if}

							<!-- Timestamp -->
							<div class="flex items-center justify-between pt-2 border-t border-pink-200">
								<span class="text-xs text-pink-400">
									Created: {formatTime(memory.created_at)}
								</span>
								{#if memory.updated_at && memory.updated_at !== memory.created_at}
									<span class="text-xs text-pink-300">
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
	<div class="mt-4 pt-4 border-t border-pink-200 flex-shrink-0">
		<button
			onclick={() => dispatch('addMemory')}
			class="w-full py-3 px-4 bg-gradient-to-r from-pink-400 to-pink-600 text-white rounded-xl hover:from-pink-500 hover:to-pink-700 transition-all duration-200 text-sm font-semibold shadow-md flex items-center justify-center space-x-2"
		>
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
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
