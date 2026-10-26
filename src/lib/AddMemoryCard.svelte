<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import SelectOptionModal from '$lib/SelectOptionModal.svelte';
	import { compressImage, compressAndTrimVideo } from '$lib/mediaOptimizer.js';
	import { X, Calendar, Play, Camera, Music, ChevronDown, Share2, Loader2, Bookmark, Scissors, Smile } from 'lucide-svelte';

	const dispatch = createEventDispatcher();

	let { selectedDate = '', resetForm = $bindable(false), isSaving = $bindable(false) } = $props();

	let memoryDescription = $state('');
	let memoryTag = $state('');
	let moodTag = $state('');
	let showMemoryTagModal = $state(false);
	let showMoodTagModal = $state(false);
	let photoVideo = $state(null);
	let music = $state(null);
	let photoVideoPreview = $state(null);
	let isVideo = $state(false);
	let isClosing = $state(false);
	let isOpening = $state(true);
	let showEmojiPicker = $state(false);
	let friends = $state([]);
	let isLoadingFriends = $state(false);
	let selectedFriendIds = $state([]);
	let friendSearchQuery = $state('');
	let showFriendSelector = $state(false);

	// Video Trimmer State (Max 15 seconds) - Messenger Style
	let showVideoTrimmerModal = $state(false);
	let rawVideoFile = $state(null);
	let rawVideoUrl = $state(null);
	let videoDuration = $state(0);
	let videoStartTime = $state(0);
	let videoEndTime = $state(15);
	let videoCurrentTime = $state(0);
	let isPlayingTrimVideo = $state(false);
	let isTrimmingVideo = $state(false);
	let trimProgress = $state(0);
	let trimVideoElement = $state();
	let videoThumbnails = $state([]);
	let isGeneratingThumbnails = $state(false);
	let filmstripElement = $state();

	let isDraggingLeft = false;
	let isDraggingRight = false;
	let isDraggingWindow = false;
	let dragStartX = 0;
	let dragStartStartTime = 0;
	let dragStartEndTime = 0;

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
		showFriendSelector = false;
		friendSearchQuery = '';
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
			rawVideoFile = file;
			if (rawVideoUrl) URL.revokeObjectURL(rawVideoUrl);
			rawVideoUrl = URL.createObjectURL(file);
			videoStartTime = 0;
			videoEndTime = 15;
			videoCurrentTime = 0;
			videoThumbnails = [];
			showVideoTrimmerModal = true;
		} else if (file.type.startsWith('image/')) {
			isVideo = false;
			photoVideo = file;
			if (photoVideoPreview) URL.revokeObjectURL(photoVideoPreview);
			photoVideoPreview = URL.createObjectURL(file);
			// Optimize image in background for lightning-fast uploads & reduced storage
			compressImage(file).then(compressed => {
				photoVideo = compressed;
			}).catch(() => {});
		}
	}

	async function onVideoMetadataLoaded(e) {
		const vid = e.target;
		videoDuration = vid.duration || 0;
		videoStartTime = 0;
		videoEndTime = Math.min(15, videoDuration);
		videoCurrentTime = 0;
		generateVideoThumbnails();
	}

	function handleTrimTimeUpdate() {
		if (!trimVideoElement) return;
		videoCurrentTime = trimVideoElement.currentTime;
		if (videoCurrentTime >= videoEndTime || videoCurrentTime < videoStartTime) {
			trimVideoElement.currentTime = videoStartTime;
		}
	}

	function togglePlayTrimVideo() {
		if (!trimVideoElement) return;
		if (trimVideoElement.paused) {
			if (trimVideoElement.currentTime < videoStartTime || trimVideoElement.currentTime >= videoEndTime) {
				trimVideoElement.currentTime = videoStartTime;
			}
			trimVideoElement.play();
			isPlayingTrimVideo = true;
		} else {
			trimVideoElement.pause();
			isPlayingTrimVideo = false;
		}
	}

	async function generateVideoThumbnails() {
		if (!rawVideoUrl || isGeneratingThumbnails || videoDuration <= 0) return;
		isGeneratingThumbnails = true;
		videoThumbnails = [];

		const numFrames = 8;
		const hiddenVid = document.createElement('video');
		hiddenVid.src = rawVideoUrl;
		hiddenVid.crossOrigin = 'anonymous';
		hiddenVid.muted = true;

		await new Promise((res) => {
			hiddenVid.onloadedmetadata = res;
			hiddenVid.load();
		});

		const canvas = document.createElement('canvas');
		canvas.width = 80;
		canvas.height = 80;
		const ctx = canvas.getContext('2d');

		const frames = [];
		const step = videoDuration / numFrames;

		for (let i = 0; i < numFrames; i++) {
			const targetTime = Math.min(videoDuration - 0.05, i * step);
			hiddenVid.currentTime = targetTime;
			await new Promise((res) => {
				hiddenVid.onseeked = res;
			});
			ctx.drawImage(hiddenVid, 0, 0, canvas.width, canvas.height);
			frames.push(canvas.toDataURL('image/jpeg', 0.6));
		}

		hiddenVid.removeAttribute('src');
		hiddenVid.load();

		videoThumbnails = frames;
		isGeneratingThumbnails = false;
	}

	function handlePointerDown(e, type) {
		e.preventDefault();
		e.stopPropagation();
		const target = e.currentTarget;
		try {
			target.setPointerCapture(e.pointerId);
		} catch (err) {}

		if (type === 'left') isDraggingLeft = true;
		else if (type === 'right') isDraggingRight = true;
		else if (type === 'window') isDraggingWindow = true;

		dragStartX = e.clientX;
		dragStartStartTime = videoStartTime;
		dragStartEndTime = videoEndTime;

		const onPointerMove = (moveEv) => {
			moveEv.preventDefault();
			handleTrimmerMove(moveEv.clientX);
		};

		const onPointerUp = (upEv) => {
			try {
				target.releasePointerCapture(upEv.pointerId);
			} catch (err) {}
			isDraggingLeft = false;
			isDraggingRight = false;
			isDraggingWindow = false;
			target.removeEventListener('pointermove', onPointerMove);
			target.removeEventListener('pointerup', onPointerUp);
			target.removeEventListener('pointercancel', onPointerUp);
		};

		target.addEventListener('pointermove', onPointerMove);
		target.addEventListener('pointerup', onPointerUp);
		target.addEventListener('pointercancel', onPointerUp);
	}

	function handleTrimmerMove(clientX) {
		if (!filmstripElement || videoDuration <= 0) return;
		const rect = filmstripElement.getBoundingClientRect();
		const deltaX = clientX - dragStartX;
		const deltaTime = (deltaX / rect.width) * videoDuration;

		if (isDraggingLeft) {
			let newStart = Math.max(0, Math.min(dragStartStartTime + deltaTime, videoEndTime - 1));
			if (videoEndTime - newStart > 15) {
				newStart = videoEndTime - 15;
			}
			videoStartTime = Math.max(0, newStart);
			if (trimVideoElement) trimVideoElement.currentTime = videoStartTime;
		} else if (isDraggingRight) {
			let newEnd = Math.min(videoDuration, Math.max(dragStartEndTime + deltaTime, videoStartTime + 1));
			if (newEnd - videoStartTime > 15) {
				newEnd = videoStartTime + 15;
			}
			videoEndTime = Math.min(videoDuration, newEnd);
			if (trimVideoElement) trimVideoElement.currentTime = videoEndTime;
		} else if (isDraggingWindow) {
			const windowDuration = dragStartEndTime - dragStartStartTime;
			let newStart = dragStartStartTime + deltaTime;
			if (newStart < 0) newStart = 0;
			if (newStart + windowDuration > videoDuration) newStart = Math.max(0, videoDuration - windowDuration);
			videoStartTime = Math.max(0, newStart);
			videoEndTime = Math.min(videoDuration, videoStartTime + windowDuration);
			if (trimVideoElement) trimVideoElement.currentTime = videoStartTime;
		}
	}

	function handleFilmstripTrackClick(e) {
		if (isDraggingLeft || isDraggingRight || isDraggingWindow) return;
		if (!filmstripElement || videoDuration <= 0) return;
		const rect = filmstripElement.getBoundingClientRect();
		const clickX = e.clientX - rect.left;
		const targetTime = (clickX / rect.width) * videoDuration;

		const windowDuration = Math.min(15, Math.max(1, videoEndTime - videoStartTime));
		let newStart = targetTime - (windowDuration / 2);
		if (newStart < 0) newStart = 0;
		if (newStart + windowDuration > videoDuration) newStart = Math.max(0, videoDuration - windowDuration);
		videoStartTime = Math.max(0, newStart);
		videoEndTime = Math.min(videoDuration, videoStartTime + windowDuration);
		if (trimVideoElement) trimVideoElement.currentTime = videoStartTime;
	}

	function handleRangeSliderChange(val) {
		const newStart = Number(val);
		const windowDuration = Math.min(15, Math.max(1, videoEndTime - videoStartTime));
		videoStartTime = Math.max(0, newStart);
		videoEndTime = Math.min(videoDuration, videoStartTime + windowDuration);
		if (trimVideoElement) trimVideoElement.currentTime = videoStartTime;
	}

	function portal(node) {
		document.body.appendChild(node);
		return {
			destroy() {
				if (node && node.parentNode) {
					node.parentNode.removeChild(node);
				}
			}
		};
	}

	function formatTimeDisplay(seconds) {
		const s = Math.floor(seconds || 0);
		const mins = Math.floor(s / 60);
		const secs = s % 60;
		return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
	}

	async function confirmTrimmedVideo() {
		if (!rawVideoFile) {
			showVideoTrimmerModal = false;
			return;
		}

		isTrimmingVideo = true;
		trimProgress = 0;

		try {
			// Extract 15s segment and transcode down to ~1.5MB 720p WebM
			const optimizedVideo = await compressAndTrimVideo(rawVideoFile, {
				startTime: videoStartTime,
				endTime: videoEndTime,
				maxWidth: 1280,
				maxHeight: 720,
				onProgress: (p) => {
					trimProgress = p;
				}
			});

			photoVideo = optimizedVideo;
			isVideo = true;
			if (photoVideoPreview) URL.revokeObjectURL(photoVideoPreview);
			photoVideoPreview = URL.createObjectURL(optimizedVideo);

			const sizeMb = ((optimizedVideo.size || 0) / (1024 * 1024)).toFixed(1);
			dispatch('showToast', {
				message: `15s Clip Optimized & Attached (${sizeMb} MB)!`,
				type: 'success'
			});
		} catch (err) {
			console.error('Video trim error:', err);
			photoVideo = rawVideoFile;
			isVideo = true;
			if (photoVideoPreview) URL.revokeObjectURL(photoVideoPreview);
			photoVideoPreview = URL.createObjectURL(rawVideoFile);
		} finally {
			if (rawVideoUrl) {
				URL.revokeObjectURL(rawVideoUrl);
				rawVideoUrl = null;
			}
			rawVideoFile = null;
			isTrimmingVideo = false;
			showVideoTrimmerModal = false;
		}
	}

	function handleMusicChange(event) {
		const file = event.target.files[0];
		if (file) {
			if (file.size > 25 * 1024 * 1024) {
				dispatch('showToast', {
					message: 'Audio file is too large! Maximum size allowed is 25MB.',
					type: 'error'
				});
				if (musicInput) musicInput.value = '';
				music = null;
				return;
			} else if (file.size > 12 * 1024 * 1024) {
				dispatch('showToast', {
					message: 'Audio is large (>12MB). We suggest MP3 under 10MB for fast loading.',
					type: 'warning'
				});
			}
			music = file;
		}
	}

	function handleSaveMemory() {
		if (isSaving) return;

		if (!memoryDescription.trim()) {
			dispatch('showToast', {
				message: 'Failed! Please add a description.',
				type: 'error'
			});
			return;
		}

		if (selectedDate && isFutureDate()) {
			dispatch('showToast', {
				message: 'Cannot create memories for future dates! Please select today or a past date.',
				type: 'error'
			});
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
		}, 220);
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
			isLoadingFriends = true;
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
			.catch(err => console.error('Error loading friends for sharing:', err))
			.finally(() => {
				isLoadingFriends = false;
			});
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
	class="bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-2xl sm:rounded-3xl pt-10 sm:pt-11 px-3.5 sm:px-4.5 pb-3.5 sm:pb-4.5 relative transition-all duration-200 ease-out animate-modal-content w-full shadow-[0_4px_24px_rgba(244,114,182,0.12)] font-sans"
	class:opacity-0={isOpening || isClosing}
	class:scale-95={isOpening || isClosing}
	class:transform={isOpening || isClosing}
>
	<!-- Close Button -->
	<button
		onclick={handleClose}
		class="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 w-7 h-7 rounded-full bg-pink-50 hover:bg-pink-100 text-pink-400 hover:text-[#f43f8e] flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
		title="Close"
	>
		<X class="w-4 h-4" />
	</button>

	<!-- Header -->
	<div class="text-center mb-3 sm:mb-3.5">
		<h2 class="text-sm sm:text-base font-black text-[#f43f8e]">Add New Memory</h2>
		<p class="text-[11px] text-pink-400 font-medium mt-0.5">Capture your special moments (Photos & 15s Video Clips)</p>
	</div>

	<!-- Selected Date Mini Card -->
	<div class="mb-3 sm:mb-3.5 p-2.5 bg-gradient-to-r from-[#f43f8e] to-[#e0337f] rounded-xl text-white shadow-xs">
		<div class="flex items-center space-x-2.5">
			<div class="p-1.5 bg-white/20 rounded-lg">
				<Calendar class="w-4 h-4" />
			</div>
			<div>
				<p class="text-[9px] text-pink-100 uppercase tracking-wide font-bold">Selected Date</p>
				<p class="text-xs sm:text-sm font-black leading-tight">{formatDate(selectedDate)}</p>
			</div>
		</div>
	</div>

	<!-- Form -->
	<div class="space-y-3 sm:space-y-3.5">
		<!-- Upload Photo / Video & Upload Music Side-by-Side -->
		<div class="grid grid-cols-2 gap-2.5 sm:gap-3">
			<!-- Upload Photo / Video -->
			<div>
				<span class="block text-[11px] font-bold text-pink-900 mb-1">Photo / Video (15s Max)</span>
				<label class="flex flex-col items-center justify-center w-full h-16 sm:h-18 border border-dashed border-pink-300 rounded-xl bg-[#fdf2f6]/60 cursor-pointer hover:bg-pink-100/70 transition-all duration-200 overflow-hidden relative shadow-2xs">
					{#if photoVideoPreview}
						{#if isVideo}
							<div class="flex items-center space-x-1.5 py-1 px-2 text-center">
								<Play class="w-4 h-4 text-[#f43f8e]" />
								<span class="text-[10px] text-pink-800 font-bold">{Math.max(1, Math.round(videoEndTime - videoStartTime))}s Clip Attached</span>
							</div>
						{:else}
							<img src={photoVideoPreview} alt="Preview" class="w-full h-full object-contain" />
						{/if}
					{:else}
						<div class="flex items-center space-x-1.5 py-1 text-center">
							<Camera class="w-4 h-4 text-[#f43f8e]" />
							<span class="text-[11px] text-pink-700 font-bold">Add Photo/Video</span>
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
				<span class="block text-[11px] font-bold text-pink-900 mb-1">Music (Optional)</span>
				<label class="flex flex-col items-center justify-center w-full h-16 sm:h-18 border border-dashed border-pink-300 rounded-xl bg-[#fdf2f6]/60 cursor-pointer hover:bg-pink-100/70 transition-all duration-200 overflow-hidden shadow-2xs">
					<div class="flex items-center space-x-1.5 py-1 px-2 w-full max-w-full min-w-0 overflow-hidden justify-center">
						<Music class="w-4 h-4 text-[#f43f8e] flex-shrink-0" />
						{#if music}
							<span class="text-[11px] text-pink-900 font-bold truncate block max-w-full min-w-0">{music.name}</span>
						{:else}
							<span class="text-[11px] text-pink-700 font-bold">Upload music</span>
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
		<div class="grid grid-cols-2 gap-2.5 sm:gap-3">
			<!-- Memory Tag Field -->
			<div>
				<span class="block text-[11px] font-bold text-pink-900 mb-1">Memory Tag</span>
				<button
					type="button"
					onclick={() => showMemoryTagModal = true}
					class="w-full px-3 py-2 bg-[#fdf2f6] border border-pink-200/80 rounded-xl text-xs text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/30 font-medium cursor-pointer transition-colors hover:bg-pink-100 shadow-2xs"
				>
					<span class={memoryTag ? 'text-pink-950 font-bold truncate' : 'text-pink-400 truncate'}>
						{memoryTag || 'Select a tag'}
					</span>
					<ChevronDown class="w-3.5 h-3.5 text-[#f43f8e] flex-shrink-0 ml-1" />
				</button>
			</div>

			<!-- Mood Tag Field -->
			<div>
				<span class="block text-[11px] font-bold text-pink-900 mb-1">Mood Tag</span>
				<button
					type="button"
					onclick={() => showMoodTagModal = true}
					class="w-full px-3 py-2 bg-[#fdf2f6] border border-pink-200/80 rounded-xl text-xs text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/30 font-medium cursor-pointer transition-colors hover:bg-pink-100 shadow-2xs"
				>
					<span class={moodTag ? 'text-pink-950 font-bold truncate' : 'text-pink-400 truncate'}>
						{moodTag || 'How are you feeling?'}
					</span>
					<ChevronDown class="w-3.5 h-3.5 text-[#f43f8e] flex-shrink-0 ml-1" />
				</button>
			</div>
		</div>

		<!-- Direct Share with Friends Section (Hidden / Collapsed by default) -->
		<div class="border border-pink-100/90 rounded-2xl p-2.5 sm:p-3 bg-[#fdf2f6]/70 transition-all shadow-2xs">
			<div class="flex items-center justify-between">
				<button
					type="button"
					onclick={() => showFriendSelector = !showFriendSelector}
					class="flex items-center gap-1.5 text-xs font-black text-pink-950 hover:text-[#f43f8e] cursor-pointer text-left w-full justify-between"
				>
					<span class="flex items-center gap-1.5">
						<Share2 class="w-3.5 h-3.5 text-[#f43f8e] flex-shrink-0" />
						<span>Share Directly with Friends</span>
						{#if selectedFriendIds.length > 0}
							<span class="px-1.5 py-0.2 bg-[#f43f8e] text-white rounded-full text-[10px] font-bold">
								{selectedFriendIds.length}
							</span>
						{/if}
					</span>
					<span class="text-[10px] font-bold text-[#f43f8e] hover:underline flex items-center gap-0.5">
						<span>{showFriendSelector ? 'Hide List' : (selectedFriendIds.length > 0 ? 'Edit Friends' : 'Select Friends')}</span>
						<ChevronDown class="w-3 h-3 transition-transform duration-200 {showFriendSelector ? 'rotate-180' : ''}" />
					</span>
				</button>
			</div>

			<!-- Selected Friends Chips Preview (visible if any selected) -->
			{#if selectedFriendIds.length > 0}
				<div class="flex flex-wrap gap-1.5 mt-2">
					{#each selectedFriendIds as fid}
						{@const f = friends.find(item => Number(item.friend_id) === fid || Number(item.id) === fid)}
						{#if f}
							<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-[#f43f8e] text-white rounded-full text-[10px] font-bold shadow-2xs">
								@{f.username}
								<button type="button" onclick={() => toggleFriendTag(fid)} class="hover:text-pink-200 cursor-pointer">×</button>
							</span>
						{/if}
					{/each}
				</div>
			{/if}

			{#if showFriendSelector}
				<div class="mt-2.5 pt-2.5 border-t border-pink-200/80 space-y-2">
					{#if isLoadingFriends}
						<div class="py-2.5 text-center text-[10px] text-pink-400 font-bold flex items-center justify-center space-x-1.5">
							<div class="w-3 h-3 border-2 border-[#f43f8e] border-t-transparent rounded-full animate-spin"></div>
							<span>Loading friends...</span>
						</div>
					{:else if friends.length === 0}
						<p class="text-[10px] text-pink-400 py-1 font-medium">No friends added yet to share with.</p>
					{:else}
						{#if friends.length > 4}
							<input
								type="text"
								bind:value={friendSearchQuery}
								placeholder="Search friends..."
								class="w-full px-2.5 py-1.5 bg-white border border-pink-200 rounded-lg text-xs text-pink-900 placeholder-pink-300 focus:outline-none focus:ring-1 focus:ring-[#f43f8e]"
							/>
						{/if}
						<div class="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto pr-0.5">
							{#each filteredFriends as friend}
								{@const isSelected = selectedFriendIds.includes(Number(friend.friend_id || friend.id))}
								<button
									type="button"
									onclick={() => toggleFriendTag(friend.friend_id || friend.id)}
									class="flex items-center gap-1.5 p-1.5 rounded-xl border text-left transition-all text-xs cursor-pointer shadow-2xs"
									class:bg-pink-100={isSelected}
									class:border-[#f43f8e]={isSelected}
									class:font-bold={isSelected}
									class:bg-white={!isSelected}
									class:border-pink-100={!isSelected}
								>
									<div class="w-5 h-5 rounded-full bg-pink-100 text-[#f43f8e] text-[9px] font-black flex items-center justify-center overflow-hidden flex-shrink-0 border border-pink-200">
										{#if friend.avatar_url}
											<img src={friend.avatar_url} alt="" class="w-full h-full object-cover" />
										{:else}
											{friend.username?.charAt(0).toUpperCase()}
										{/if}
									</div>
									<span class="truncate text-pink-950 text-[10px]">@{friend.username}</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>
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
			<label for="add-memory-description" class="block text-[11px] font-bold text-pink-900 mb-1">Description</label>
			<div class="relative">
				<textarea
					id="add-memory-description"
					bind:value={memoryDescription}
					placeholder="Write about this memory..."
					rows="2"
					class="w-full px-3 py-2 pr-8 bg-[#fdf2f6] border border-pink-200/80 rounded-xl text-pink-950 placeholder-pink-400/60 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/20 focus:border-[#f43f8e] focus:bg-white text-xs resize-none font-medium transition-all shadow-2xs"
				></textarea>
				<!-- Emoji Button -->
				<button
					onclick={() => showEmojiPicker = !showEmojiPicker}
					type="button"
					class="absolute bottom-2.5 right-2.5 text-pink-400 hover:text-[#f43f8e] transition-transform hover:scale-110 cursor-pointer"
					title="Add emoji"
				>
					<Smile class="w-4 h-4" />
				</button>

				<!-- Emoji Picker Popup -->
				{#if showEmojiPicker}
					<div class="absolute bottom-full right-0 mb-2 p-2 bg-white border border-pink-200 rounded-2xl z-10 max-w-[180px] shadow-lg">
						<div class="grid grid-cols-6 gap-1">
							{#each emojis as emoji}
								<button
									type="button"
									onclick={() => insertEmoji(emoji)}
									class="p-1 hover:bg-pink-100 rounded-lg transition-colors text-sm cursor-pointer"
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
		<div class="flex space-x-2 pt-1.5 sm:pt-2">
			<button
				onclick={handleClearInputs}
				type="button"
				class="w-1/3 py-2 px-3 bg-white border border-pink-200 text-pink-700 hover:text-[#f43f8e] rounded-xl hover:bg-pink-50 transition-all text-xs font-bold shadow-2xs active:scale-95 cursor-pointer"
			>
				Clear
			</button>

			{#if isFutureDate()}
				<div class="w-2/3 p-2 bg-amber-50 border border-amber-200 rounded-xl text-center">
					<p class="text-[10px] text-amber-800 font-bold leading-tight">
						Select today or a past date.
					</p>
				</div>
			{:else}
				<button
					onclick={handleSaveMemory}
					disabled={isSaving || !selectedDate || isDescriptionEmpty()}
					class="w-2/3 py-2 px-3.5 bg-[#f43f8e] hover:bg-[#e0337f] text-white rounded-xl transition-all text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-1.5 shadow-xs active:scale-95 cursor-pointer"
				>
					{#if isSaving}
						<Loader2 class="animate-spin h-3.5 w-3.5 text-white" />
						<span>Saving...</span>
					{:else}
						<Bookmark class="w-3.5 h-3.5" />
						<span>Save {selectedFriendIds.length > 0 ? '& Share' : 'Memory'}</span>
					{/if}
				</button>
			{/if}
		</div>
	</div>
</div>

<!-- ChronoMuse Themed Messenger-Style Video Trimmer Modal -->
{#if showVideoTrimmerModal && rawVideoUrl}
	<div
		use:portal
		class="fixed inset-0 bg-transparent z-[9999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in select-none"
		onclick={(e) => { if (e.target === e.currentTarget && !isTrimmingVideo) showVideoTrimmerModal = false; }}
		onkeydown={(e) => { if (e.key === 'Escape' && !isTrimmingVideo) showVideoTrimmerModal = false; }}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
	>
		<div class="bg-white border border-pink-100 rounded-3xl max-w-lg w-full p-4 sm:p-5 flex flex-col space-y-3.5 relative animate-modal-content m-auto max-h-[92vh] overflow-y-auto shadow-2xl">
			<!-- Top Header: Title, Live Island Timer, Close Button -->
			<div class="flex items-center justify-between gap-2 border-b border-pink-100 pb-2.5">
				<div class="flex items-center space-x-2">
					<div class="w-8 h-8 rounded-xl bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center font-bold shadow-2xs">
						<Scissors class="w-4 h-4" />
					</div>
					<div>
						<h3 class="text-sm sm:text-base font-black text-pink-950 leading-tight">Trim Video Clip</h3>
						<p class="text-[11px] text-pink-400 font-bold">15 seconds max clip</p>
					</div>
				</div>

				<!-- Live Timer Pill Badge -->
				<div class="flex items-center space-x-1.5 bg-[#fdf2f6] border border-pink-100 px-3 py-1 rounded-full shadow-2xs">
					<span class="w-2 h-2 rounded-full bg-[#f43f8e] animate-pulse"></span>
					<span class="font-mono font-black text-xs text-pink-950">
						{formatTimeDisplay(videoCurrentTime)}
					</span>
					<span class="text-[10px] text-pink-400 font-bold">
						/ {formatTimeDisplay(videoEndTime - videoStartTime)}
					</span>
				</div>

				<!-- Cancel / Close X Button -->
				<button
					type="button"
					onclick={() => { showVideoTrimmerModal = false; rawVideoFile = null; if (photoVideoInput) photoVideoInput.value = ''; }}
					disabled={isTrimmingVideo}
					class="w-7 h-7 rounded-full bg-pink-50 hover:bg-pink-100 text-pink-400 hover:text-[#f43f8e] flex items-center justify-center transition-colors cursor-pointer"
					title="Cancel"
				>
					<X class="w-3.5 h-3.5" />
				</button>
			</div>

			<!-- Center: Video Player Viewport -->
			<button
				type="button"
				class="relative w-full rounded-2xl overflow-hidden bg-black border border-pink-100 flex items-center justify-center cursor-pointer group max-h-56 shadow-xs p-0"
				onclick={togglePlayTrimVideo}
				aria-label="Toggle video playback"
			>
				<video
					src={rawVideoUrl}
					bind:this={trimVideoElement}
					onloadedmetadata={onVideoMetadataLoaded}
					ontimeupdate={handleTrimTimeUpdate}
					playsinline
					class="w-full max-h-56 object-contain"
					aria-label="Trim video preview"
				><track kind="captions" /></video>

				<!-- Play/Pause Overlay Icon -->
				{#if !isPlayingTrimVideo}
					<div class="absolute inset-0 bg-black/30 flex items-center justify-center transition-all">
						<div class="w-12 h-12 rounded-full bg-[#f43f8e] text-white flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
							<Play class="w-6 h-6 ml-0.5 fill-current" />
						</div>
					</div>
				{/if}
			</button>

			<!-- Messenger Storyboard Filmstrip Scrubber Tool -->
			<div class="bg-[#fdf2f6]/70 border border-pink-100 rounded-2xl p-3.5 space-y-2.5">
				<div class="flex items-center justify-between text-xs font-black">
					<span class="text-[#f43f8e]">Storyboard Timeline</span>
					<span class="text-pink-950 font-black">
						Duration: {(videoEndTime - videoStartTime).toFixed(1)}s (Max 15s)
					</span>
				</div>

				<!-- Filmstrip Scrubber Track -->
				<div
					class="relative w-full h-14 rounded-xl overflow-hidden bg-pink-100/60 border-2 border-pink-200 select-none cursor-pointer"
					style="touch-action: none;"
					bind:this={filmstripElement}
					onclick={handleFilmstripTrackClick}
					role="button"
					tabindex="0"
					onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleFilmstripTrackClick(e); }}
					aria-label="Seek video position"
				>
					<!-- Frame Thumbnails Strip -->
					<div class="absolute inset-0 flex w-full h-full pointer-events-none">
						{#if videoThumbnails.length > 0}
							{#each videoThumbnails as thumb}
								<div class="flex-1 h-full overflow-hidden border-r border-pink-200">
									<img src={thumb} alt="frame" class="w-full h-full object-cover" />
								</div>
							{/each}
						{:else}
							<div class="w-full h-full flex items-center justify-center text-pink-400 text-[10px] font-bold">
								Generating frames...
							</div>
						{/if}
					</div>

					{#if videoDuration > 0}
						{@const leftPercent = (videoStartTime / videoDuration) * 100}
						{@const widthPercent = ((videoEndTime - videoStartTime) / videoDuration) * 100}
						{@const rightPercent = 100 - (leftPercent + widthPercent)}
						{@const currentPercent = (videoCurrentTime / videoDuration) * 100}

						<!-- Left Dimmed Overlay -->
						<div
							class="absolute top-0 bottom-0 left-0 bg-pink-950/60 pointer-events-none"
							style="width: {leftPercent}%;"
						></div>

						<!-- Right Dimmed Overlay -->
						<div
							class="absolute top-0 bottom-0 right-0 bg-pink-950/60 pointer-events-none"
							style="width: {rightPercent}%;"
						></div>

						<!-- Active Pink Selection Box -->
						<div
							class="absolute top-0 bottom-0 border-y-3 border-[#f43f8e] bg-[#f43f8e]/25 cursor-grab active:cursor-grabbing flex items-center justify-between"
							style="left: {leftPercent}%; width: {widthPercent}%; touch-action: none;"
							role="slider"
							aria-label="Trim window"
							tabindex="0"
							aria-valuemin="0"
							aria-valuemax={videoDuration}
							aria-valuenow={videoStartTime}
							onpointerdown={(e) => handlePointerDown(e, 'window')}
						>
							<!-- Left Drag Handle -->
							<div
								class="w-6 h-full bg-[#f43f8e] hover:bg-[#e0337f] text-white cursor-ew-resize flex items-center justify-center rounded-l-md active:scale-95 transition-transform"
								style="touch-action: none;"
								role="slider"
								aria-label="Trim start"
								tabindex="0"
								aria-valuemin="0"
								aria-valuemax={videoDuration}
								aria-valuenow={videoStartTime}
								onpointerdown={(e) => handlePointerDown(e, 'left')}
							>
								<div class="w-1 h-4 bg-white rounded-full"></div>
							</div>

							<!-- Right Drag Handle -->
							<div
								class="w-6 h-full bg-[#f43f8e] hover:bg-[#e0337f] text-white cursor-ew-resize flex items-center justify-center rounded-r-md active:scale-95 transition-transform"
								style="touch-action: none;"
								role="slider"
								aria-label="Trim end"
								tabindex="0"
								aria-valuemin="0"
								aria-valuemax={videoDuration}
								aria-valuenow={videoEndTime}
								onpointerdown={(e) => handlePointerDown(e, 'right')}
							>
								<div class="w-1 h-4 bg-white rounded-full"></div>
							</div>
						</div>

						<!-- Live Playhead Needle -->
						<div
							class="absolute top-0 bottom-0 w-1 bg-white pointer-events-none z-20"
							style="left: {currentPercent}%;"
						>
							<div class="w-2.5 h-2.5 -ml-0.75 bg-[#f43f8e] border border-white rounded-full -mt-1 shadow-xs"></div>
						</div>
					{/if}
				</div>

				<!-- Fine-tuning Range Slider -->
				{#if videoDuration > 15}
					<div class="pt-1">
						<div class="flex items-center justify-between text-[11px] font-black text-pink-950 mb-1">
							<span>Slide position:</span>
							<span class="text-[#f43f8e]">{videoStartTime.toFixed(1)}s - {videoEndTime.toFixed(1)}s</span>
						</div>
						<input
							type="range"
							min="0"
							max={Math.max(0, videoDuration - 1)}
							step="0.2"
							value={videoStartTime}
							oninput={(e) => handleRangeSliderChange(e.target.value)}
							class="w-full accent-[#f43f8e] cursor-pointer h-1.5 bg-pink-200 rounded-lg"
						/>
					</div>
				{/if}

				<p class="text-[11px] text-center text-pink-400 font-bold">
					Hold and drag the box or handles, tap on the timeline, or use the slider to move the 15s clip.
				</p>
			</div>

			<!-- Bottom Action Buttons -->
			<div class="flex items-center space-x-2 pt-1">
				<button
					type="button"
					onclick={() => { showVideoTrimmerModal = false; rawVideoFile = null; if (photoVideoInput) photoVideoInput.value = ''; }}
					disabled={isTrimmingVideo}
					class="w-1/3 py-2.5 bg-pink-50 text-pink-700 hover:bg-pink-100 border border-pink-100 rounded-xl font-black text-xs sm:text-sm active:scale-95 transition-all cursor-pointer"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={confirmTrimmedVideo}
					disabled={isTrimmingVideo}
					class="w-2/3 py-2.5 bg-[#f43f8e] hover:bg-[#e0337f] active:scale-95 text-white rounded-xl font-black text-xs sm:text-sm flex items-center justify-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-xs"
				>
					{#if isTrimmingVideo}
						<Loader2 class="animate-spin h-4 w-4 text-white" />
						<span>{trimProgress > 0 ? `Optimizing Clip (${trimProgress}%)...` : 'Trimming 15s Clip...'}</span>
					{:else}
						<Scissors class="w-4 h-4" />
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
