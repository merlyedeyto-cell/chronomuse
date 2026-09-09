<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import SelectOptionModal from '$lib/SelectOptionModal.svelte';

	const dispatch = createEventDispatcher();

	let { selectedDate = '', resetForm = $bindable(false) } = $props();

	let memoryDescription = $state('');
	let memoryTag = $state('');
	let moodTag = $state('');
	let showMemoryTagModal = $state(false);
	let showMoodTagModal = $state(false);
	let photoVideo = $state(null);
	let music = $state(null);
	let photoVideoPreview = $state(null);
	let isVideo = $state(false);
	let isSaving = $state(false);
	let isClosing = $state(false);
	let isOpening = $state(true);
	let showEmojiPicker = $state(false);
	let friends = $state([]);
	let selectedFriendIds = $state([]);
	let friendSearchQuery = $state('');
	let showFriendSelector = $state(false);

	// Video Trimmer State (Max 15 seconds)
	let showVideoTrimmerModal = $state(false);
	let rawVideoFile = $state(null);
	let rawVideoUrl = $state(null);
	let videoDuration = $state(0);
	let videoStartTime = $state(0);
	let isTrimmingVideo = $state(false);
	let trimVideoElement;
	let trimmerInterval;

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
		isVideo = false;
		selectedFriendIds = [];
		if (photoVideoPreview) {
			URL.revokeObjectURL(photoVideoPreview);
			photoVideoPreview = null;
		}
		if (rawVideoUrl) {
			URL.revokeObjectURL(rawVideoUrl);
			rawVideoUrl = null;
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
		if (!file) return;

		if (file.type.startsWith('video/')) {
			// Video selected -> setup 15s cropper/trimmer
			rawVideoFile = file;
			if (rawVideoUrl) URL.revokeObjectURL(rawVideoUrl);
			rawVideoUrl = URL.createObjectURL(file);
			videoStartTime = 0;
			showVideoTrimmerModal = true;
		} else if (file.type.startsWith('image/')) {
			isVideo = false;
			photoVideo = file;
			if (photoVideoPreview) URL.revokeObjectURL(photoVideoPreview);
			photoVideoPreview = URL.createObjectURL(file);
		}
	}

	function onVideoMetadataLoaded(e) {
		const vid = e.target;
		videoDuration = vid.duration || 0;
		if (videoDuration <= 15) {
			// If already <= 15 seconds, default full duration
			videoStartTime = 0;
		}
	}

	function handleSeekVideoPreview(time) {
		videoStartTime = Number(time);
		if (trimVideoElement) {
			trimVideoElement.currentTime = videoStartTime;
		}
	}

	async function confirmTrimmedVideo() {
		if (!rawVideoFile || !trimVideoElement) {
			showVideoTrimmerModal = false;
			return;
		}

		isTrimmingVideo = true;

		try {
			// If video duration is <= 15s and start is 0, use original file directly
			if (videoDuration <= 15 && videoStartTime === 0) {
				photoVideo = rawVideoFile;
				isVideo = true;
				if (photoVideoPreview) URL.revokeObjectURL(photoVideoPreview);
				photoVideoPreview = URL.createObjectURL(rawVideoFile);
				isTrimmingVideo = false;
				showVideoTrimmerModal = false;
				return;
			}

			// Crop video to 15 seconds using MediaRecorder + Video stream
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');
			
			const video = document.createElement('video');
			video.src = rawVideoUrl;
			video.crossOrigin = 'anonymous';
			video.muted = false;
			
			await new Promise((resolve) => {
				video.onloadedmetadata = resolve;
				video.load();
			});

			canvas.width = video.videoWidth || 640;
			canvas.height = video.videoHeight || 480;

			const stream = canvas.captureStream(30);
			
			// Try to capture audio track
			let audioTrack = null;
			try {
				const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
				const source = audioCtx.createMediaElementSource(video);
				const dest = audioCtx.createMediaStreamDestination();
				source.connect(dest);
				source.connect(audioCtx.destination);
				audioTrack = dest.stream.getAudioTracks()[0];
				if (audioTrack) {
					stream.addTrack(audioTrack);
				}
			} catch (ae) {}

			let mimeType = 'video/webm;codecs=vp8,opus';
			if (!MediaRecorder.isTypeSupported(mimeType)) {
				mimeType = 'video/webm';
			}
			if (!MediaRecorder.isTypeSupported(mimeType)) {
				mimeType = 'video/mp4';
			}

			const recorder = new MediaRecorder(stream, { mimeType });
			const chunks = [];

			recorder.ondataavailable = (e) => {
				if (e.data && e.data.size > 0) {
					chunks.push(e.data);
				}
			};

			const trimDuration = Math.min(15, videoDuration - videoStartTime);
			video.currentTime = videoStartTime;

			await new Promise((resolve) => {
				video.onseeked = resolve;
			});

			recorder.start();
			video.play();

			let animationFrameId;
			const drawFrame = () => {
				if (!video.paused && !video.ended) {
					ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
					animationFrameId = requestAnimationFrame(drawFrame);
				}
			};
			drawFrame();

			await new Promise((resolve) => {
				const checkTime = () => {
					if (video.currentTime >= videoStartTime + trimDuration || video.ended) {
						video.pause();
						cancelAnimationFrame(animationFrameId);
						resolve();
					} else {
						setTimeout(checkTime, 50);
					}
				};
				checkTime();
			});

			recorder.stop();
			await new Promise((resolve) => {
				recorder.onstop = resolve;
			});

			const blob = new Blob(chunks, { type: 'video/mp4' });
			const trimmedFile = new File([blob], `clip_${Date.now()}.mp4`, { type: 'video/mp4' });

			photoVideo = trimmedFile;
			isVideo = true;
			if (photoVideoPreview) URL.revokeObjectURL(photoVideoPreview);
			photoVideoPreview = URL.createObjectURL(blob);
		} catch (err) {
			console.error('Video trim error, falling back to original:', err);
			photoVideo = rawVideoFile;
			isVideo = true;
			if (photoVideoPreview) URL.revokeObjectURL(photoVideoPreview);
			photoVideoPreview = URL.createObjectURL(rawVideoFile);
		} finally {
			isTrimmingVideo = false;
			showVideoTrimmerModal = false;
		}
	}

	function handleMusicChange(event) {
		const file = event.target.files[0];
		if (file) {
			music = file;
		}
	}

	function handleSaveMemory() {
		if (!memoryDescription.trim()) {
			const event = new CustomEvent('showToast', {
				detail: { message: 'Failed! Please add a description.', type: 'error' }
			});
			dispatch('showToast', event);
			return;
		}

		if (selectedDate && isFutureDate()) {
			const event = new CustomEvent('showToast', {
				detail: { message: 'Cannot create memories for future dates! Please select today or a past date.', type: 'error' }
			});
			dispatch('showToast', event);
			isSaving = false;
			return;
		}

		isSaving = true;

		dispatch('saveMemory', {
			selectedDate,
			memoryDescription,
			memoryTag,
			moodTag,
			photoVideo,
			music,
			taggedFriendIds: selectedFriendIds
		});
	}

	function handleClearInputs() {
		memoryDescription = '';
		memoryTag = '';
		moodTag = '';
		photoVideo = null;
		music = null;
		isVideo = false;
		selectedFriendIds = [];
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
	}

	function handleClose() {
		isClosing = true;
		if (photoVideoPreview) {
			URL.revokeObjectURL(photoVideoPreview);
			photoVideoPreview = null;
		}
		if (rawVideoUrl) {
			URL.revokeObjectURL(rawVideoUrl);
			rawVideoUrl = null;
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
		const id = Number(friendId);
		if (selectedFriendIds.includes(id)) {
			selectedFriendIds = selectedFriendIds.filter(fId => fId !== id);
		} else {
			selectedFriendIds = [...selectedFriendIds, id];
		}
	}

	onMount(() => {
		setTimeout(() => {
			isOpening = false;
		}, 50);

		// Load friends list for direct sharing
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
			.catch(err => console.error('Error loading friends for sharing:', err));
		}
	});

	function formatDate(dateString) {
		if (!dateString) return 'No date selected';
		const [year, month, day] = dateString.split('-');
		const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
		return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
	}

	let filteredFriends = $derived(
		friends.filter(f => f.username?.toLowerCase().includes(friendSearchQuery.toLowerCase()))
	);
</script>

<div
	class="bg-white border-2 border-pink-300 rounded-2xl p-4 sm:p-5 relative transition-all duration-300 animate-modal-content max-w-lg mx-auto"
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
		<p class="text-[11px] sm:text-xs text-pink-400 mt-0.5">Capture your special moments (Photos & 15s Video Clips)</p>
	</div>

	<!-- Selected Date Mini Card -->
	<div class="mb-3 p-2.5 bg-pink-500 rounded-xl text-white">
		<div class="flex items-center space-x-2.5">
			<div class="p-1.5 bg-pink-600 rounded-lg">
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
		<!-- Upload Photo / Video & Upload Music Side-by-Side -->
		<div class="grid grid-cols-2 gap-2">
			<!-- Upload Photo / Video -->
			<div>
				<label class="block text-xs font-medium text-pink-600 mb-1">Photo / Video (15s Max)</label>
				<label class="flex flex-col items-center justify-center w-full h-16 border-2 border-dashed border-pink-300 rounded-lg bg-pink-50 cursor-pointer hover:bg-pink-100 transition-all duration-200 overflow-hidden relative">
					{#if photoVideoPreview}
						{#if isVideo}
							<div class="flex items-center space-x-1.5 py-1 px-2 text-center">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 text-pink-600">
									<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
								</svg>
								<span class="text-[11px] text-pink-700 font-bold">15s Clip Attached</span>
							</div>
						{:else}
							<img src={photoVideoPreview} alt="Preview" class="w-full h-full object-contain" />
						{/if}
					{:else}
						<div class="flex items-center space-x-1.5 py-1 text-center">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 text-pink-400">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
							</svg>
							<span class="text-xs text-pink-500 font-medium">Add Photo/Video</span>
						</div>
					{/if}
					<input
						type="file"
						accept="image/*,video/*"
						onchange={handlePhotoVideoChange}
						bind:this={photoVideoInput}
						class="hidden"
					/>
				</label>
			</div>

			<!-- Upload Music -->
			<div>
				<label class="block text-xs font-medium text-pink-600 mb-1">Music (Optional)</label>
				<label class="flex flex-col items-center justify-center w-full h-16 border-2 border-dashed border-pink-300 rounded-lg bg-pink-50 cursor-pointer hover:bg-pink-100 transition-all duration-200 overflow-hidden">
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
			<!-- Memory Tag Field -->
			<div>
				<label class="block text-xs font-medium text-pink-600 mb-1">Memory Tag</label>
				<button
					type="button"
					onclick={() => showMemoryTagModal = true}
					class="w-full px-2.5 py-1.5 bg-pink-50 border-2 border-pink-200 rounded-lg text-xs text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-pink-400 font-medium cursor-pointer transition-colors hover:bg-pink-100"
				>
					<span class={memoryTag ? 'text-pink-700 font-semibold truncate' : 'text-pink-400 truncate'}>
						{memoryTag || 'Select a tag'}
					</span>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 text-pink-400 flex-shrink-0 ml-1">
						<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
					</svg>
				</button>
			</div>

			<!-- Mood Tag Field -->
			<div>
				<label class="block text-xs font-medium text-pink-600 mb-1">Mood Tag</label>
				<button
					type="button"
					onclick={() => showMoodTagModal = true}
					class="w-full px-2.5 py-1.5 bg-pink-50 border-2 border-pink-200 rounded-lg text-xs text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-pink-400 font-medium cursor-pointer transition-colors hover:bg-pink-100"
				>
					<span class={moodTag ? 'text-pink-700 font-semibold truncate' : 'text-pink-400 truncate'}>
						{moodTag || 'How are you feeling?'}
					</span>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 text-pink-400 flex-shrink-0 ml-1">
						<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
					</svg>
				</button>
			</div>
		</div>

		<!-- Direct Share with Friends Section -->
		<div class="border border-pink-200 rounded-xl p-2.5 bg-pink-50">
			<div class="flex items-center justify-between mb-1.5">
				<label class="text-xs font-bold text-pink-700 flex items-center gap-1.5">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-pink-500">
						<path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
					</svg>
					Share Directly with Friends ({selectedFriendIds.length})
				</label>
				{#if friends.length > 0}
					<button
						type="button"
						onclick={() => showFriendSelector = !showFriendSelector}
						class="text-[11px] font-bold text-pink-600 hover:text-pink-800 underline cursor-pointer"
					>
						{showFriendSelector ? 'Hide List' : 'Select Friends'}
					</button>
				{/if}
			</div>

			{#if friends.length === 0}
				<p class="text-[11px] text-pink-400">No friends added yet to share with.</p>
			{:else}
				<!-- Selected Friends Chips Preview -->
				{#if selectedFriendIds.length > 0}
					<div class="flex flex-wrap gap-1 mb-2">
						{#each selectedFriendIds as fid}
							{@const f = friends.find(item => Number(item.friend_id) === fid || Number(item.id) === fid)}
							{#if f}
								<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-pink-500 text-white rounded-full text-[11px] font-bold">
									@{f.username}
									<button type="button" onclick={() => toggleFriendTag(fid)} class="hover:text-pink-200">×</button>
								</span>
							{/if}
						{/each}
					</div>
				{/if}

				{#if showFriendSelector}
					<div class="mt-1 space-y-1.5 max-h-36 overflow-y-auto pr-1">
						{#if friends.length > 5}
							<input
								type="text"
								bind:value={friendSearchQuery}
								placeholder="Search friends..."
								class="w-full px-2.5 py-1 bg-white border border-pink-200 rounded-lg text-xs text-pink-800 placeholder-pink-300 focus:outline-none"
							/>
						{/if}
						<div class="grid grid-cols-2 gap-1">
							{#each filteredFriends as friend}
								{@const isSelected = selectedFriendIds.includes(Number(friend.friend_id || friend.id))}
								<button
									type="button"
									onclick={() => toggleFriendTag(friend.friend_id || friend.id)}
									class="flex items-center gap-1.5 p-1.5 rounded-lg border text-left transition-all text-xs"
									class:bg-pink-200={isSelected}
									class:border-pink-400={isSelected}
									class:font-bold={isSelected}
									class:bg-white={!isSelected}
									class:border-pink-200={!isSelected}
								>
									<div class="w-5 h-5 rounded-full bg-pink-400 text-white text-[10px] font-bold flex items-center justify-center overflow-hidden">
										{#if friend.avatar_url}
											<img src={friend.avatar_url} alt="" class="w-full h-full object-cover" />
										{:else}
											{friend.username?.charAt(0).toUpperCase()}
										{/if}
									</div>
									<span class="truncate text-pink-900 text-[11px]">@{friend.username}</span>
								</button>
							{/each}
						</div>
					</div>
				{/if}
			{/if}
		</div>

		<!-- Memory Tag Modal -->
		<SelectOptionModal
			isOpen={showMemoryTagModal}
			title="Select tag"
			defaultOption="Select tag"
			options={memoryTags}
			selectedValue={memoryTag}
			onSelect={(val) => memoryTag = val}
			onClose={() => showMemoryTagModal = false}
		/>

		<!-- Mood Tag Modal -->
		<SelectOptionModal
			isOpen={showMoodTagModal}
			title="Select mood"
			defaultOption="Select mood"
			options={moodTags}
			selectedValue={moodTag}
			onSelect={(val) => moodTag = val}
			onClose={() => showMoodTagModal = false}
		/>

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
					<div class="absolute bottom-full right-0 mb-2 p-2 bg-white border-2 border-pink-300 rounded-xl z-10 max-w-[180px]">
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
					class="w-2/3 py-2.5 px-4 bg-pink-500 text-white rounded-xl hover:bg-pink-600 transition-all duration-200 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-1.5"
				>
					{#if isSaving}
						<svg class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
						<span>Saving & Sharing...</span>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
						</svg>
						<span>Save {selectedFriendIds.length > 0 ? '& Share' : 'Memory'}</span>
					{/if}
				</button>
			{/if}
		</div>
	</div>
</div>

<!-- 15-Second Video Trimmer / Cropper Modal -->
{#if showVideoTrimmerModal && rawVideoUrl}
	<div
		class="fixed inset-0 bg-black/60 z-[120] flex items-center justify-center p-4 animate-fade-in"
		onclick={(e) => { if (e.target === e.currentTarget && !isTrimmingVideo) showVideoTrimmerModal = false; }}
	>
		<div class="bg-white border-2 border-pink-300 rounded-2xl max-w-md w-full p-4 sm:p-5 relative animate-modal-content text-center">
			<h3 class="text-base font-bold text-pink-700 mb-1">Crop Video to 15s Clip</h3>
			<p class="text-xs text-pink-500 mb-3">Adjust the slider to choose the 15-second part of the video you want to save.</p>

			<div class="rounded-xl overflow-hidden bg-black max-h-56 mb-3 flex items-center justify-center">
				<video
					src={rawVideoUrl}
					bind:this={trimVideoElement}
					onloadedmetadata={onVideoMetadataLoaded}
					controls
					class="w-full max-h-56 object-contain"
				></video>
			</div>

			<div class="space-y-3 text-left bg-pink-50 p-3 rounded-xl border border-pink-200 mb-4">
				<div class="flex items-center justify-between text-xs font-bold text-pink-800">
					<span>Total Duration: {videoDuration ? videoDuration.toFixed(1) + 's' : 'Loading...'}</span>
					<span class="text-pink-600">Clip: {videoStartTime.toFixed(1)}s - {Math.min(videoDuration, videoStartTime + 15).toFixed(1)}s (Max 15s)</span>
				</div>

				{#if videoDuration > 15}
					<div>
						<label class="block text-[11px] font-bold text-pink-700 mb-1">Start Time (Scrub): {videoStartTime.toFixed(1)}s</label>
						<input
							type="range"
							min="0"
							max={Math.max(0, videoDuration - 1)}
							step="0.5"
							value={videoStartTime}
							oninput={(e) => handleSeekVideoPreview(e.target.value)}
							class="w-full accent-pink-500 cursor-pointer"
						/>
					</div>
				{:else}
					<p class="text-[11px] text-emerald-700 font-medium">Video is already under 15 seconds! It can be used directly.</p>
				{/if}
			</div>

			<div class="flex gap-2">
				<button
					type="button"
					onclick={() => { showVideoTrimmerModal = false; rawVideoFile = null; if (photoVideoInput) photoVideoInput.value = ''; }}
					disabled={isTrimmingVideo}
					class="w-1/3 py-2 bg-pink-100 text-pink-700 hover:bg-pink-200 rounded-xl font-bold text-xs"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={confirmTrimmedVideo}
					disabled={isTrimmingVideo}
					class="w-2/3 py-2 bg-pink-500 hover:bg-pink-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5"
				>
					{#if isTrimmingVideo}
						<svg class="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
						<span>Trimming 15s Clip...</span>
					{:else}
						<span>Use 15s Clip</span>
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	@keyframes modal-content {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	.animate-modal-content {
		animation: modal-content 0.25s ease-out;
	}
</style>
