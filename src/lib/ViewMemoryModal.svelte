<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { supabase } from '$lib/supabaseClient';
	import { broadcastMemoryEvent } from '$lib/realtimeBroadcast.js';
	import SelectOptionModal from '$lib/SelectOptionModal.svelte';

	const dispatch = createEventDispatcher();

	let { selectedDate = '', memories = [] } = $props();

	let isLoading = $state(true);
	let isClosing = $state(false);
	let showEmojiPicker = $state(false);
	let editedDescription = $state('');
	let editedMoodTag = $state('');
	let editedMemoryTag = $state('');
	let showMoodTagModal = $state(false);
	let showMemoryTagModal = $state(false);
	let editedPhotoVideo = $state(null);
	let editedMusic = $state(null);
	let editedPhotoVideoPreview = $state(null);
	let isEditing = $state(false);
	let isSaving = $state(false);
	let photoVideoInput;
	let musicInput;
	
	let editedPhotoVideoType = $state('');
	
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
	
	// Friends & Sharing State
	let friends = $state([]);
	let showShareModal = $state(false);
	let memoryToShare = $state(null);
	let selectedShareFriendIds = $state([]);
	let alreadySharedRecipientIds = $state([]);
	let isLoadingSharedRecipients = $state(false);
	let isSharing = $state(false);
	let shareSuccessMsg = $state('');

	// Delete Confirmation state
	let showDeleteConfirmModal = $state(false);
	let memoryToDeleteId = $state(null);
	
	// Full-screen media viewer
	let showFullScreenImage = $state(false);
	let fullScreenImageUrl = $state('');
	let fullScreenMediaType = $state('image');

	function openFullScreenImage(url, type = 'image') {
		fullScreenImageUrl = url;
		fullScreenMediaType = type;
		showFullScreenImage = true;
		document.body.style.overflow = 'hidden';
	}

	function closeFullScreenImage() {
		showFullScreenImage = false;
		fullScreenImageUrl = '';
		fullScreenMediaType = 'image';
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

		const handleRealtimeChange = (e) => {
			if (e && e.detail && e.detail.memoryData) {
				const updated = e.detail.memoryData;
				const memIndex = memories.findIndex(m => m.id === updated.id || (m.date === updated.date && m.description?.includes('Shared by')));
				if (memIndex !== -1) {
					memories[memIndex] = {
						...memories[memIndex],
						...updated,
						id: memories[memIndex].id,
						user_id: memories[memIndex].user_id
					};
				}
			}
			dispatch('refresh');
		};

		window.addEventListener('chronomuse_memory_change', handleRealtimeChange);
		return () => {
			window.removeEventListener('chronomuse_memory_change', handleRealtimeChange);
		};
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
				
				for (const fid of friendsToShare) {
					broadcastMemoryEvent(user.id, fid, 'shared_memory_incoming', memoryToShare);
				}

				setTimeout(() => {
					showShareModal = false;
					memoryToShare = null;
					selectedShareFriendIds = [];
					shareSuccessMsg = '';
				}, 1500);
			} else {
				shareSuccessMsg = data.error || 'Failed to share memory';
			}
		} catch (err) {
			console.error('Error sharing memory:', err);
		} finally {
			isSharing = false;
		}
	}

	function handleEditedPhotoVideoChange(event) {
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
			editedPhotoVideo = file;
			editedPhotoVideoType = file.type;
			if (editedPhotoVideoPreview) URL.revokeObjectURL(editedPhotoVideoPreview);
			editedPhotoVideoPreview = URL.createObjectURL(file);
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

		try {
			editedPhotoVideo = rawVideoFile;
			editedPhotoVideoType = rawVideoFile.type || 'video/mp4';
			if (editedPhotoVideoPreview) URL.revokeObjectURL(editedPhotoVideoPreview);
			editedPhotoVideoPreview = URL.createObjectURL(rawVideoFile);
		} catch (err) {
			console.error('Video trim error in ViewMemoryModal:', err);
			editedPhotoVideo = rawVideoFile;
			editedPhotoVideoType = rawVideoFile.type || 'video/mp4';
			if (editedPhotoVideoPreview) URL.revokeObjectURL(editedPhotoVideoPreview);
			editedPhotoVideoPreview = URL.createObjectURL(rawVideoFile);
		} finally {
			isTrimmingVideo = false;
			showVideoTrimmerModal = false;
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

	function getMusicName(url) {
		if (!url) return '';
		try {
			const cleanUrl = url.split('?')[0];
			let filename = cleanUrl.split('/').pop();
			filename = decodeURIComponent(filename);

			// Remove timestamp/ID prefixes: e.g. "1788710854603_", "music_1788710854603_egtchb_", "music_1788710854603_"
			filename = filename.replace(/^music_\d+_[a-z0-9]{6,8}_/i, '');
			filename = filename.replace(/^music_\d+_/i, '');
			filename = filename.replace(/^\d+_/i, '');

			// Convert underscores back to spaces for clean display
			if (filename.includes('_')) {
				filename = filename.replace(/_/g, ' ');
			}

			return filename;
		} catch (e) {
			return url;
		}
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
			const matchDesc = desc.match(/\(Shared by @([^)\r\n]+)\)/i);
			if (matchDesc) {
				senderName = matchDesc[1].trim();
			} else {
				const matchTag = memTag.match(/Shared memory from @([^)\r\n]+)/i);
				if (matchTag) {
					senderName = matchTag[1].trim();
				}
			}
		}

		// Clean description: strip (Shared by @...) from the body text
		const cleanDesc = desc.replace(/\s*\(Shared by @[^)\r\n]+\)\s*/gi, '').trim();

		// Clean memory tag: strip "Shared memory from @..."
		let cleanTag = memTag.replace(/^Shared memory from @[^)\r\n]+\s*$/gi, '').trim();
		if (cleanTag === 'Untitled Memory' || cleanTag === 'Special Memory') {
			cleanTag = '';
		}

		const isShared = Boolean(senderName || memory.is_shared || (memory.description || '').includes('(Shared by @'));

		return {
			senderName: senderName || (isShared ? 'Friend' : null),
			isShared,
			cleanDesc,
			cleanTag
		};
	}

	function handleDeleteMemory(memoryId) {
		memoryToDeleteId = memoryId;
		showDeleteConfirmModal = true;
	}

	function confirmDeleteMemory() {
		if (memoryToDeleteId) {
			dispatch('deleteMemory', { memoryId: memoryToDeleteId, date: selectedDate });
			showDeleteConfirmModal = false;
			memoryToDeleteId = null;
		}
	}

	function handleEditMemory(memory) {
		isEditing = true;
		editedDescription = memory.description || '';
		editedMoodTag = memory.mood_tag || '';
		editedMemoryTag = memory.memory_tag || '';
		editedPhotoVideo = null;
		editedPhotoVideoType = memory.photo_video_type || '';
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
		editedPhotoVideoType = '';
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
		class="bg-white border-2 border-pink-300 rounded-2xl p-4 sm:p-5 relative transition-all duration-300 max-w-sm sm:max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col"
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
	<div class="mb-3 p-3 bg-pink-400 rounded-xl text-white">
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
				class="py-2 px-4 bg-pink-400 text-white rounded-lg hover:bg-pink-500 transition-all duration-200 text-sm font-semibold"
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
							<button
								type="button"
								onclick={() => showMoodTagModal = true}
								class="w-full px-3 py-2 bg-white border-2 border-pink-200 rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-pink-400 font-medium cursor-pointer transition-colors hover:bg-pink-100/30"
							>
								<span class={editedMoodTag ? 'text-pink-700 font-semibold truncate' : 'text-pink-400 truncate'}>
									{editedMoodTag || 'Select mood'}
								</span>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-pink-400 flex-shrink-0 ml-1">
									<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
								</svg>
							</button>

							<!-- Memory Tag -->
							<button
								type="button"
								onclick={() => showMemoryTagModal = true}
								class="w-full px-3 py-2 bg-white border-2 border-pink-200 rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-pink-400 font-medium cursor-pointer transition-colors hover:bg-pink-100/30"
							>
								<span class={editedMemoryTag ? 'text-pink-700 font-semibold truncate' : 'text-pink-400 truncate'}>
									{editedMemoryTag || 'Select tag'}
								</span>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-pink-400 flex-shrink-0 ml-1">
									<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
								</svg>
							</button>

							<!-- Upload Photo or Video -->
							<div>
								<div class="flex items-center justify-between mb-1">
									<label class="block text-xs font-medium text-pink-600">Photo or Video</label>
									{#if editedPhotoVideo || memory.photo_video}
										<button
											type="button"
											onclick={() => { photoVideoInput?.click(); }}
											class="text-[11px] font-bold text-pink-600 hover:text-pink-700 bg-pink-100 hover:bg-pink-200 px-2.5 py-0.5 rounded-full transition-all flex items-center space-x-1"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3">
												<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
											</svg>
											<span>Change / Replace</span>
										</button>
									{/if}
								</div>

								<div
									class="relative flex flex-col items-center justify-center w-full min-h-[96px] max-h-48 border-2 border-dashed border-pink-300 rounded-xl bg-pink-50 cursor-pointer hover:bg-pink-100/70 hover:border-pink-400 transition-all duration-200 overflow-hidden group"
									onclick={() => { photoVideoInput?.click(); }}
								>
									{#if editedPhotoVideoPreview}
										{#if editedPhotoVideoType.startsWith('image/')}
											<img src={editedPhotoVideoPreview} alt="Preview" class="w-full max-h-44 object-contain" />
										{:else}
											<div class="relative w-full h-full flex items-center justify-center bg-black/80 py-2">
												<video src={editedPhotoVideoPreview} class="w-full max-h-40 object-contain pointer-events-none" muted playsinline></video>
												<div class="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-all">
													<span class="text-xs font-bold text-white bg-pink-600 px-3 py-1 rounded-full shadow-md flex items-center space-x-1">
														<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
															<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
														</svg>
														<span>Click to Change Video</span>
													</span>
												</div>
											</div>
										{/if}
									{:else if memory.photo_video}
										{#if (memory.photo_video_type && memory.photo_video_type.startsWith('video/')) || (typeof memory.photo_video === 'string' && (memory.photo_video.endsWith('.mp4') || memory.photo_video.endsWith('.webm') || memory.photo_video.endsWith('.mov')))}
											<div class="relative w-full h-full flex items-center justify-center bg-black/80 py-2">
												<video src={getMediaUrl(memory.photo_video)} class="w-full max-h-40 object-contain pointer-events-none" muted playsinline></video>
												<div class="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-all">
													<span class="text-xs font-bold text-white bg-pink-600 px-3 py-1 rounded-full shadow-md flex items-center space-x-1">
														<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
															<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
														</svg>
														<span>Click to Change Video</span>
													</span>
												</div>
											</div>
										{:else}
											<div class="relative w-full h-full flex items-center justify-center">
												<img src={getMediaUrl(memory.photo_video)} alt="Current" class="w-full max-h-44 object-contain" />
												<div class="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-all">
													<span class="text-xs font-bold text-white bg-pink-600 px-3 py-1 rounded-full shadow-md">Click to Change Photo</span>
												</div>
											</div>
										{/if}
									{:else}
										<div class="flex items-center space-x-3 pt-2 pb-3 px-4">
											<div class="w-10 h-10 rounded-full bg-pink-400 flex items-center justify-center flex-shrink-0">
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
								</div>
								{#if memory.photo_video && !editedPhotoVideo}
									<p class="text-xs text-pink-400 mt-1 flex items-center">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3 mr-1">
											<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
										</svg>
										Click box or button to replace current video/photo
									</p>
								{/if}
							</div>

							<!-- Upload Music -->
							<div>
								<label class="block text-xs font-medium text-pink-600 mb-1">Music</label>
								<label class="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-pink-300 rounded-xl bg-pink-50 cursor-pointer hover:bg-pink-100 hover:border-pink-400 transition-all duration-200">
									<div class="flex items-center space-x-3 pt-2 pb-3 px-4 w-full max-w-full min-w-0 overflow-hidden">
										<div class="w-10 h-10 rounded-full bg-pink-400 flex items-center justify-center flex-shrink-0">
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 text-white">
												<path stroke-linecap="round" stroke-linejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
											</svg>
										</div>
										<div class="flex-1 min-w-0">
											{#if editedMusic}
												<p class="text-xs text-pink-700 font-semibold truncate">{editedMusic.name}</p>
												<p class="text-xs text-pink-400">Click to change</p>
											{:else if memory.music}
												<p class="text-xs text-pink-600 font-medium truncate">Current: {getMusicName(memory.music)}</p>
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
									<div class="absolute bottom-full right-0 mb-2 p-2 bg-white border-2 border-pink-300 rounded-lg z-10 max-w-[180px]">
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
									class="flex-1 py-2 px-3 bg-pink-400 text-white rounded-lg hover:bg-pink-500 transition-all duration-200 text-sm font-semibold disabled:opacity-50"
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
										<button
											type="button"
											onclick={() => { handleClose(); goto(`/profile?id=${encodeURIComponent(details.senderName)}`); }}
											class="text-[11px] px-2.5 py-0.5 rounded-full bg-pink-500 hover:bg-pink-600 text-white font-bold inline-flex items-center space-x-1 cursor-pointer transition-all active:scale-95 shadow-xs"
											title="View @{details.senderName}'s Profile"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3 text-pink-100 flex-shrink-0">
												<path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a5.97 5.97 0 00-.942 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
											</svg>
											<span>Shared by @{details.senderName}</span>
										</button>
									{/if}

									{#if memory.mood_tag}
										<span class="text-[10px] px-2.5 py-0.5 rounded-full border {getMoodColor(memory.mood_tag)} font-bold whitespace-nowrap">
											{memory.mood_tag}
										</span>
									{/if}

									{#if details.cleanTag}
										<span class="text-[10px] px-2.5 py-0.5 rounded-full bg-pink-100 text-pink-700 border border-pink-300 font-bold whitespace-nowrap">
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
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 text-pink-400 hover:text-red-600">
											<path fill-rule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.256 1.478l-.209-.035-1.005 13.07a3 3 0 01-2.991 2.77H8.084a3 3 0 01-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 01-.256-1.478A48.567 48.567 0 017.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 013.369 0c1.603.051 2.815 1.387 2.815 2.951zm-6.136-1.452a51.196 51.196 0 013.272 0c.8.025 1.414.71 1.414 1.477v.187a49.71 49.71 0 00-6.1 0v-.187c0-.767.614-1.452 1.414-1.477zM9 9.75a.75.75 0 01.75.75v6a.75.75 0 01-1.5 0v-6A.75.75 0 019 9.75zm4.5 0a.75.75 0 01.75.75v6a.75.75 0 01-1.5 0v-6a.75.75 0 01.75-.75z" clip-rule="evenodd" />
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
								{#if (!memory.photo_video_type || memory.photo_video_type.startsWith('image/')) && !(typeof memory.photo_video === 'string' && (memory.photo_video.endsWith('.mp4') || memory.photo_video.endsWith('.webm') || memory.photo_video.endsWith('.mov')))}
									<div class="relative rounded-lg overflow-hidden border-2 border-pink-200 cursor-pointer hover:border-pink-400 transition-all duration-200" onclick={() => openFullScreenImage(getMediaUrl(memory.photo_video), 'image')}>
										<img src={getMediaUrl(memory.photo_video)} alt="Memory" class="w-full h-44 object-cover hover:scale-105 transition-transform duration-300" />
										<div class="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-10 transition-all duration-200 flex items-center justify-center pointer-events-none">
											<span class="text-white text-xs font-medium opacity-0 hover:opacity-100 bg-black bg-opacity-50 px-2.5 py-1 rounded-full">Click to enlarge</span>
										</div>
									</div>
								{:else}
									<div class="relative rounded-lg overflow-hidden border-2 border-pink-200 bg-black flex flex-col items-center justify-center">
										<video 
											src={getMediaUrl(memory.photo_video)} 
											class="w-full max-h-72 sm:max-h-96 object-contain bg-black" 
											controls 
											playsinline 
											preload="metadata"
											controlslist="nofullscreen nodownload noremoteplayback"
											disablepictureinpicture
											aria-label="Memory video"
										></video>
										<button
											type="button"
											onclick={() => openFullScreenImage(getMediaUrl(memory.photo_video), 'video')}
											class="absolute top-2.5 right-2.5 bg-pink-600 hover:bg-pink-700 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg backdrop-blur-xs flex items-center space-x-1.5 transition-all z-10 shadow-sm active:scale-95 cursor-pointer"
											title="Full view"
										>
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-3.5 h-3.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
											</svg>
											<span>Full view</span>
										</button>
									</div>
								{/if}
							{/if}

							{#if memory.music}
								<div class="rounded-lg overflow-hidden border border-pink-200 bg-pink-50 p-2.5">
									<div class="flex items-center space-x-1.5 mb-1.5 min-w-0">
										<div class="w-6 h-6 rounded-full bg-pink-400 flex items-center justify-center shrink-0">
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5 text-white">
												<path stroke-linecap="round" stroke-linejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
											</svg>
										</div>
										<span class="text-[11px] font-semibold text-pink-600 truncate" title={getMusicName(memory.music)}>{getMusicName(memory.music)}</span>
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
			class="w-full py-2 px-3 bg-pink-500 text-white rounded-lg hover:bg-pink-600 active:scale-95 transition-all duration-200 text-xs sm:text-sm font-bold flex items-center justify-center space-x-1.5"
		>
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
			</svg>
			<span>Add Another Memory</span>
		</button>
	</div>
	</div>
</div>

<!-- Full-Screen Media Viewer (Chronomuse Light Pink Theme matching Chat) -->
{#if showFullScreenImage}
	<div 
		class="fixed inset-0 z-[100] bg-pink-100/95 backdrop-blur-md flex flex-col justify-between p-3 sm:p-5 select-none animate-fade-in touch-none overflow-hidden"
		onclick={(e) => { if (e.target === e.currentTarget) closeFullScreenImage(); }}
	>
		<!-- Header Toolbar -->
		<div class="w-full max-w-5xl mx-auto flex items-center justify-between z-20 flex-shrink-0 pt-1">
			<div class="flex items-center space-x-2">
				<span class="text-xs sm:text-sm font-bold text-pink-900 bg-white/90 px-3.5 py-1.5 rounded-full backdrop-blur-sm border border-pink-300 flex items-center space-x-2">
					<span class="w-2 h-2 rounded-full bg-pink-500"></span>
					<span>{fullScreenMediaType === 'video' ? 'Video View' : 'Photo View'}</span>
				</span>
			</div>

			<!-- Close Button -->
			<button
				type="button"
				onclick={closeFullScreenImage}
				class="p-2 text-pink-700 hover:text-pink-900 bg-white/90 hover:bg-white border border-pink-300 rounded-full transition-all backdrop-blur-sm cursor-pointer active:scale-95 flex items-center justify-center"
				title="Close Full View"
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-5 h-5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<!-- Media Display Box -->
		<div class="relative overflow-hidden rounded-2xl border-2 border-pink-300 bg-white/60 max-h-[75vh] sm:max-h-[82vh] flex items-center justify-center select-none p-2 sm:p-4 my-auto w-full max-w-5xl mx-auto">
			{#if fullScreenMediaType === 'video'}
				<video 
					src={fullScreenImageUrl} 
					class="max-w-full max-h-[72vh] sm:max-h-[78vh] object-contain rounded-xl" 
					controls 
					autoplay 
					playsinline
					controlslist="nofullscreen nodownload noremoteplayback"
					disablepictureinpicture
				></video>
			{:else}
				<img src={fullScreenImageUrl} alt="Full size" class="max-w-full max-h-[72vh] sm:max-h-[78vh] object-contain rounded-xl" />
			{/if}
		</div>
	</div>
{/if}

<!-- Video Trimmer Modal (Max 15s - Messenger Style) -->
{#if showVideoTrimmerModal && rawVideoUrl}
	<div
		use:portal
		class="fixed inset-0 z-[80] bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in"
		onclick={(e) => { if (e.target === e.currentTarget && !isTrimmingVideo) { showVideoTrimmerModal = false; rawVideoFile = null; if (photoVideoInput) photoVideoInput.value = ''; } }}
	>
		<div
			class="bg-white border-2 border-pink-300 rounded-3xl max-w-md w-full p-4 sm:p-5 space-y-3.5 shadow-2xl relative animate-modal-content"
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Top Header -->
			<div class="flex items-center justify-between pb-2 border-b border-pink-100">
				<div class="flex items-center space-x-2">
					<div class="w-8 h-8 rounded-xl bg-pink-100 text-pink-600 flex items-center justify-center font-bold">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
							<path d="M6 3.75a3 3 0 100 6 3 3 0 000-6zm0 1.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm12-1.5a3 3 0 100 6 3 3 0 000-6zm0 1.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM9.545 10.379l-4.59 7.87a.75.75 0 101.3.758l4.086-7.006 4.085 7.006a.75.75 0 001.3-.758l-4.59-7.87a.75.75 0 00-1.591 0z" />
						</svg>
					</div>
					<div>
						<h3 class="text-sm sm:text-base font-extrabold text-pink-950 leading-tight">Trim Video Clip</h3>
						<p class="text-[11px] text-pink-400">15 seconds max clip</p>
					</div>
				</div>

				<!-- Live Timer Pill Badge -->
				<div class="flex items-center space-x-1.5 bg-pink-50 border-2 border-pink-200 px-3 py-1 rounded-full">
					<span class="w-2 h-2 rounded-full bg-pink-500 animate-pulse"></span>
					<span class="font-mono font-black text-xs text-pink-900">
						{formatTimeDisplay(videoCurrentTime)}
					</span>
					<span class="text-[10px] text-pink-400 font-semibold">
						/ {formatTimeDisplay(videoEndTime - videoStartTime)}
					</span>
				</div>

				<!-- Cancel / Close X Button -->
				<button
					type="button"
					onclick={() => { showVideoTrimmerModal = false; rawVideoFile = null; if (photoVideoInput) photoVideoInput.value = ''; }}
					disabled={isTrimmingVideo}
					class="p-1.5 text-pink-400 hover:text-pink-700 hover:bg-pink-100 rounded-full transition-all"
					title="Cancel"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
						<path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
					</svg>
				</button>
			</div>

			<!-- Center: Video Player Viewport -->
			<div
				class="relative w-full rounded-2xl overflow-hidden bg-black border-2 border-pink-200 flex items-center justify-center cursor-pointer group max-h-56"
				onclick={togglePlayTrimVideo}
			>
				<video
					src={rawVideoUrl}
					bind:this={trimVideoElement}
					onloadedmetadata={onVideoMetadataLoaded}
					ontimeupdate={handleTrimTimeUpdate}
					playsinline
					class="w-full max-h-56 object-contain"
				></video>

				<!-- Play/Pause Overlay Icon -->
				{#if !isPlayingTrimVideo}
					<div class="absolute inset-0 bg-black/25 flex items-center justify-center transition-all">
						<div class="w-12 h-12 rounded-full bg-pink-500 text-white flex items-center justify-center group-hover:scale-110 transition-transform">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6 ml-0.5">
								<path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd" />
							</svg>
						</div>
					</div>
				{/if}
			</div>

			<!-- Messenger Storyboard Filmstrip Scrubber Tool -->
			<div class="bg-pink-50 border-2 border-pink-200 rounded-2xl p-3 space-y-2.5">
				<div class="flex items-center justify-between text-xs font-bold">
					<span class="text-pink-600">Storyboard Timeline</span>
					<span class="text-pink-800">
						Duration: {(videoEndTime - videoStartTime).toFixed(1)}s (Max 15s)
					</span>
				</div>

				<!-- Filmstrip Scrubber Track -->
				<div
					class="relative w-full h-14 rounded-xl overflow-hidden bg-pink-100 border-2 border-pink-300 select-none cursor-pointer"
					style="touch-action: none;"
					bind:this={filmstripElement}
					onclick={handleFilmstripTrackClick}
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
							<div class="w-full h-full flex items-center justify-center text-pink-400 text-[10px] font-semibold">
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
							class="absolute top-0 bottom-0 border-y-3 border-pink-500 bg-pink-500/25 cursor-grab active:cursor-grabbing flex items-center justify-between"
							style="left: {leftPercent}%; width: {widthPercent}%; touch-action: none;"
							onpointerdown={(e) => handlePointerDown(e, 'window')}
						>
							<!-- Left Drag Handle -->
							<div
								class="w-6 h-full bg-pink-500 hover:bg-pink-600 text-white cursor-ew-resize flex items-center justify-center rounded-l-md active:scale-95 transition-transform"
								style="touch-action: none;"
								onpointerdown={(e) => handlePointerDown(e, 'left')}
							>
								<div class="w-1 h-4 bg-white rounded-full"></div>
							</div>

							<!-- Right Drag Handle -->
							<div
								class="w-6 h-full bg-pink-500 hover:bg-pink-600 text-white cursor-ew-resize flex items-center justify-center rounded-r-md active:scale-95 transition-transform"
								style="touch-action: none;"
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
							<div class="w-2.5 h-2.5 -ml-0.75 bg-pink-600 border border-white rounded-full -mt-1"></div>
						</div>
					{/if}
				</div>

				<!-- Fine-tuning Range Slider -->
				{#if videoDuration > 15}
					<div class="pt-1">
						<div class="flex items-center justify-between text-[11px] font-bold text-pink-700 mb-1">
							<span>Slide position:</span>
							<span>{videoStartTime.toFixed(1)}s - {videoEndTime.toFixed(1)}s</span>
						</div>
						<input
							type="range"
							min="0"
							max={Math.max(0, videoDuration - 1)}
							step="0.2"
							value={videoStartTime}
							oninput={(e) => handleRangeSliderChange(e.target.value)}
							class="w-full accent-pink-500 cursor-pointer h-1.5 bg-pink-200 rounded-lg"
						/>
					</div>
				{/if}

				<p class="text-[11px] text-center text-pink-500 font-medium">
					Hold and drag the box or handles, tap on the timeline, or use the slider to move the 15s clip.
				</p>
			</div>

			<!-- Bottom Action Buttons -->
			<div class="flex items-center space-x-2 pt-1">
				<button
					type="button"
					onclick={() => { showVideoTrimmerModal = false; rawVideoFile = null; if (photoVideoInput) photoVideoInput.value = ''; }}
					disabled={isTrimmingVideo}
					class="w-1/3 py-2.5 bg-pink-100 text-pink-700 hover:bg-pink-200 border border-pink-300 rounded-xl font-bold text-xs sm:text-sm active:scale-95 transition-all"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={confirmTrimmedVideo}
					disabled={isTrimmingVideo}
					class="w-2/3 py-2.5 bg-pink-500 hover:bg-pink-600 active:scale-95 text-white rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
				>
					{#if isTrimmingVideo}
						<div class="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
						<span>Attaching...</span>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
							<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
						</svg>
						<span>Attach 15s Clip</span>
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Share Memory Modal -->
{#if showShareModal}
	<div class="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
		<div class="bg-white border-2 border-pink-300 rounded-2xl p-6 max-w-sm w-full relative animate-modal-content">
			<button
				onclick={() => showShareModal = false}
				class="absolute top-3 right-3 text-pink-400 hover:text-pink-600 p-1 rounded-lg"
			>
				✕
			</button>
			<div class="text-center mb-4">
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
							class="w-full p-2.5 rounded-xl border-2 transition-all flex items-center justify-between text-left {isAlreadyShared ? 'bg-pink-50/70 border-pink-200/80 opacity-80 cursor-not-allowed' : isSelected ? 'border-pink-500 bg-pink-50/90 cursor-pointer' : 'border-pink-200 bg-white hover:bg-pink-50/40 hover:border-pink-300 cursor-pointer'}"
						>
							<div class="flex items-center space-x-2.5 min-w-0">
								<div class="w-8 h-8 rounded-full {isAlreadyShared ? 'bg-pink-300' : 'bg-pink-400'} text-white font-bold text-xs flex items-center justify-center flex-shrink-0 overflow-hidden">
									{#if friend.avatar_url}
										<img src={friend.avatar_url} alt={friend.username} class="w-full h-full object-cover" />
									{:else}
										{friend.username.charAt(0).toUpperCase()}
									{/if}
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
									<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-100 text-pink-600 border border-pink-200/90 flex items-center gap-1">
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3 h-3 text-pink-500">
											<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
										</svg>
										<span>Shared</span>
									</span>
								{:else if isSelected}
									<span class="w-5 h-5 rounded-full bg-pink-500 text-white flex items-center justify-center text-xs font-bold">
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
					class="w-full py-2.5 bg-pink-400 text-white rounded-xl font-semibold text-sm hover:bg-pink-500 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
				>
					{#if isSharing}Sharing...{:else}Share Memory{/if}
				</button>
			{/if}
		</div>
	</div>
{/if}

<!-- Delete Memory Confirmation Modal -->
{#if showDeleteConfirmModal}
	<div
		class="fixed inset-0 bg-black/50 backdrop-blur-xs z-[70] flex items-center justify-center p-4 animate-fade-in"
		onclick={(e) => { if (e.target === e.currentTarget) { showDeleteConfirmModal = false; memoryToDeleteId = null; } }}
	>
		<div class="bg-white border-2 border-pink-300 rounded-3xl max-w-sm w-full p-6 text-center animate-modal-content relative overflow-hidden">
			<!-- Trash Bin Circle Icon -->
			<div class="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3">
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-7 h-7">
					<path fill-rule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.256 1.478l-.209-.035-1.005 13.07a3 3 0 01-2.991 2.77H8.084a3 3 0 01-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 01-.256-1.478A48.567 48.567 0 017.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 013.369 0c1.603.051 2.815 1.387 2.815 2.951zm-6.136-1.452a51.196 51.196 0 013.272 0c.8.025 1.414.71 1.414 1.477v.187a49.71 49.71 0 00-6.1 0v-.187c0-.767.614-1.452 1.414-1.477zM9 9.75a.75.75 0 01.75.75v6a.75.75 0 01-1.5 0v-6A.75.75 0 019 9.75zm4.5 0a.75.75 0 01.75.75v6a.75.75 0 01-1.5 0v-6a.75.75 0 01.75-.75z" clip-rule="evenodd" />
				</svg>
			</div>
			<h3 class="text-base sm:text-lg font-black text-pink-950 mb-1.5">Delete Memory?</h3>
			<p class="text-xs text-pink-600 mb-5 font-medium leading-relaxed">
				Are you sure you want to delete this memory? This action cannot be undone.
			</p>

			<div class="flex items-center space-x-3">
				<button
					type="button"
					onclick={() => { showDeleteConfirmModal = false; memoryToDeleteId = null; }}
					class="w-1/2 py-2.5 bg-pink-100 text-pink-700 hover:bg-pink-200 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={confirmDeleteMemory}
					class="w-1/2 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold text-xs sm:text-sm transition-all active:scale-95 cursor-pointer"
				>
					Delete
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Memory Tag Edit Modal -->
<SelectOptionModal
	isOpen={showMemoryTagModal}
	title="Select tag"
	defaultOption="Select tag"
	options={memoryTags}
	selectedValue={editedMemoryTag}
	onSelect={(val) => editedMemoryTag = val}
	onClose={() => showMemoryTagModal = false}
/>

<!-- Mood Tag Edit Modal -->
<SelectOptionModal
	isOpen={showMoodTagModal}
	title="Select mood"
	defaultOption="Select mood"
	options={moodTags}
	selectedValue={editedMoodTag}
	onSelect={(val) => editedMoodTag = val}
	onClose={() => showMoodTagModal = false}
/>

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
