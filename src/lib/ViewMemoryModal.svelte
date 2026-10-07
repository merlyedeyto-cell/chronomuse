<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { API_ENDPOINTS } from '$lib/apiConfig.js';
	import { supabase } from '$lib/supabaseClient';
	import { broadcastMemoryEvent } from '$lib/realtimeBroadcast.js';
	import SelectOptionModal from '$lib/SelectOptionModal.svelte';
	import { compressImage, compressAndTrimVideo } from '$lib/mediaOptimizer.js';
	import {
		X, Calendar, Pencil, ChevronDown, RefreshCw, Image as ImageIcon,
		Music, Bookmark, Share2, Trash2, Maximize2, Pause, Play, Plus, Scissors, Check
	} from 'lucide-svelte';

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
	let editingMemoryId = $state(/** @type {any} */ (null));
	let editingMemory = $state(/** @type {any} */ (null));
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

	// Audio Player State per memory
	let playingAudioId = $state(/** @type {any} */ (null));
	let audioCurrentTimes = $state({});
	let audioDurations = $state({});
	let audioElements = {};

	function togglePlayAudio(memId) {
		const el = audioElements[memId];
		if (!el) return;
		if (playingAudioId === memId) {
			el.pause();
			playingAudioId = null;
		} else {
			if (playingAudioId && audioElements[playingAudioId]) {
				audioElements[playingAudioId].pause();
			}
			el.play().then(() => {
				playingAudioId = memId;
			}).catch(() => {});
		}
	}

	function handleAudioSeek(memId, e) {
		const el = audioElements[memId];
		if (!el) return;
		const val = parseFloat(e.target.value);
		el.currentTime = val;
		audioCurrentTimes[memId] = val;
	}

	function formatAudioTime(seconds) {
		if (!seconds || isNaN(seconds)) return '0:00';
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
	}

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

	$effect(() => {
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = '';
		};
	});

	$effect(() => {
		if (memories && memories.length === 0 && !isClosing) {
			handleClose();
		}
	});

	onMount(() => {
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
			compressImage(file, { maxWidth: 1400, maxHeight: 1400, quality: 0.80, outputType: 'image/webp' }).then(compressed => {
				editedPhotoVideo = compressed;
				editedPhotoVideoType = compressed.type;
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
			const optimizedVideo = await compressAndTrimVideo(rawVideoFile, {
				startTime: videoStartTime,
				endTime: videoEndTime,
				maxWidth: 1280,
				maxHeight: 720,
				onProgress: (p) => {
					trimProgress = p;
				}
			});

			editedPhotoVideo = optimizedVideo;
			editedPhotoVideoType = optimizedVideo.type;
			if (editedPhotoVideoPreview) URL.revokeObjectURL(editedPhotoVideoPreview);
			editedPhotoVideoPreview = URL.createObjectURL(optimizedVideo);
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
			'Happy': 'bg-emerald-50 text-emerald-600 border-emerald-200',
			'Sad': 'bg-amber-50 text-amber-600 border-amber-200',
			'Excited': 'bg-orange-50 text-orange-600 border-orange-200',
			'Angry': 'bg-rose-50 text-rose-600 border-rose-200',
			'Calm': 'bg-teal-50 text-teal-600 border-teal-200',
			'Anxious': 'bg-purple-50 text-purple-600 border-purple-200',
			'Grateful': 'bg-pink-50 text-pink-600 border-pink-200',
			'Lonely': 'bg-slate-50 text-slate-600 border-slate-200',
			'Love': 'bg-rose-50 text-rose-600 border-rose-200',
			'Neutral': 'bg-stone-50 text-stone-600 border-stone-200'
		};
		return moodColors[mood] || 'bg-pink-50 text-pink-600 border-pink-200';
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

	function handleSenderClick(senderName) {
		handleClose();
		if (senderName) {
			goto(`/profile?id=${encodeURIComponent(senderName)}`);
		}
	}

	function handleDeleteMemory(memoryId) {
		memoryToDeleteId = memoryId;
		showDeleteConfirmModal = true;
	}

	function confirmDeleteMemory() {
		if (memoryToDeleteId) {
			const toDelete = memoryToDeleteId;
			const remainingCount = (memories || []).filter(m => m.id !== toDelete).length;
			dispatch('deleteMemory', { memoryId: toDelete, date: selectedDate });
			showDeleteConfirmModal = false;
			memoryToDeleteId = null;

			// If all memories for this date/modal have been deleted, close modal automatically
			if (remainingCount === 0) {
				handleClose();
			}
		}
	}

	function handleEditMemory(memory) {
		editingMemoryId = memory.id;
		editingMemory = memory;
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
		editingMemoryId = null;
		editingMemory = null;
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
		if (!memory) return;
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
		editingMemoryId = null;
		editingMemory = null;
	}

	// Gesture Drag Animation State (Mobile Touch & Pointer Optimized)
	let isDragging = $state(false);
	let dragStartY = 0;
	let dragTranslateY = $state(0);
	let dragStartTime = 0;
	let activePointerId = null;
	let hasMounted = $state(false);

	$effect(() => {
		const timer = setTimeout(() => {
			hasMounted = true;
		}, 350);
		return () => clearTimeout(timer);
	});

	function handleModalDragPointerDown(e) {
		if (isClosing) return;
		if (e.target.closest('button, input, textarea, a, select, audio, video')) return;
		if (e.button !== undefined && e.button !== 0) return;

		dragStartY = e.clientY;
		dragTranslateY = 0;
		dragStartTime = Date.now();
		isDragging = true;
		activePointerId = e.pointerId;

		try {
			if (e.currentTarget && e.currentTarget.setPointerCapture) {
				e.currentTarget.setPointerCapture(e.pointerId);
			}
		} catch (err) {}
	}

	function handleModalDragPointerMove(e) {
		if (!isDragging || isClosing) return;
		if (activePointerId !== null && e.pointerId !== activePointerId) return;

		const deltaY = e.clientY - dragStartY;
		if (deltaY > 0) {
			// Dragging down (1:1 direct follow)
			dragTranslateY = deltaY;
		} else {
			// Dragging up (elastic rubber-band resistance)
			dragTranslateY = deltaY * 0.35;
		}
	}

	function handleModalDragPointerUp(e) {
		if (!isDragging) return;
		if (activePointerId !== null && e.pointerId !== activePointerId) return;

		isDragging = false;
		if (activePointerId !== null) {
			try {
				if (e.currentTarget && e.currentTarget.releasePointerCapture) {
					e.currentTarget.releasePointerCapture(activePointerId);
				}
			} catch (err) {}
			activePointerId = null;
		}

		const elapsedTime = Date.now() - dragStartTime;
		const velocity = dragTranslateY / Math.max(elapsedTime, 1);

		// Dismiss if pulled down past threshold (> 85px or quick swipe down)
		if (dragTranslateY > 85 || (velocity > 0.3 && dragTranslateY > 30)) {
			handleClose();
		} else {
			// Smoothly bounce / spring back to 0
			dragTranslateY = 0;
		}
	}

	function handleModalDragPointerCancel(e) {
		if (isDragging) {
			isDragging = false;
			activePointerId = null;
			dragTranslateY = 0;
		}
	}

	function handleClose() {
		if (isClosing) return;
		isClosing = true;
		// Restore body scroll
		document.body.style.overflow = '';
		setTimeout(() => {
			dispatch('close');
		}, 200);
	}

	function insertEmoji(emoji) {
		editedDescription += emoji;
		showEmojiPicker = false;
	}
</script>

<!-- Backdrop Overlay -->
<div
	class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 pointer-events-auto"
	style="opacity: {isClosing ? 0 : Math.max(0.1, 1 - (dragTranslateY / 380))}; transition: {isDragging ? 'none' : 'opacity 0.25s ease'};"
	onclick={handleClose}
></div>

<!-- Bottom Sheet Modal Container -->
<div
	class="fixed inset-0 z-50 flex items-end justify-center font-sans pointer-events-none select-none"
	onclick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
>
	<div
		class="bg-gradient-to-b from-[#fff5f8] via-[#fff0f5] to-white border-t-2 border-x border-pink-200/90 rounded-t-[32px] sm:rounded-t-[38px] p-4 sm:p-6 pb-6 relative w-full max-w-xl sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[96vh] sm:max-h-[92vh] h-[93vh] sm:h-[89vh] md:h-[88vh] overflow-hidden flex flex-col shadow-[0_-12px_45px_rgba(244,63,142,0.22)] pointer-events-auto {!hasMounted ? 'animate-bottom-sheet' : ''}"
		style="transform: translateY({isClosing ? '100%' : `${dragTranslateY}px`}); transition: {isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s ease'}; opacity: {isClosing ? 0 : 1}; will-change: transform;"
		onclick={(e) => e.stopPropagation()}
	>
		<!-- Large Draggable Header Area (Drag up or down from handle or header on mobile/desktop) -->
		<div
			class="w-full pt-1 pb-2 -mt-1.5 mb-1 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing select-none flex-shrink-0 touch-none"
			style="touch-action: none; -webkit-user-select: none;"
			onpointerdown={handleModalDragPointerDown}
			onpointermove={handleModalDragPointerMove}
			onpointerup={handleModalDragPointerUp}
			onpointercancel={handleModalDragPointerCancel}
		>
			<!-- Pill Handle Bar -->
			<div class="py-1 px-8 flex items-center justify-center">
				<div
					class="h-1.5 rounded-full transition-all duration-200 {isDragging ? 'w-24 bg-[#f43f8e] scale-110 shadow-sm' : 'w-14 sm:w-16 bg-pink-300/80 hover:bg-pink-400 hover:w-20'}"
				></div>
			</div>

			<!-- Header Title -->
			<div class="text-center pr-10 pl-10 mt-1 pointer-events-none">
				<h2 class="text-lg sm:text-xl md:text-2xl font-black text-[#f43f8e] tracking-tight">View Memories</h2>
				<p class="text-[11px] sm:text-xs text-pink-400 font-bold mt-0.5">Your special moments on this date</p>
			</div>
		</div>

		<!-- Close Button -->
		<button
			onclick={handleClose}
			class="absolute top-3.5 right-3.5 sm:top-5 sm:right-5 w-8 h-8 rounded-full text-pink-400 hover:text-[#f43f8e] bg-white/90 hover:bg-white border border-pink-200/90 flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95 z-10"
			title="Close"
		>
			<X class="w-4 h-4" />
		</button>

		<!-- Selected Date Banner -->
		<div class="mb-3.5 p-3.5 sm:p-4 bg-gradient-to-r from-[#f43f8e] via-[#ec4899] to-[#db2777] text-white rounded-2xl text-left shadow-[0_4px_20px_rgba(244,63,94,0.22)] flex items-center space-x-3.5 flex-shrink-0">
			<div class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center flex-shrink-0 text-white shadow-inner">
				<Calendar class="w-5 h-5" />
			</div>
			<div class="min-w-0 flex-1">
				<span class="text-[10px] sm:text-[11px] font-black tracking-wider uppercase text-white/80 block leading-tight">SELECTED DATE</span>
				<span class="text-sm sm:text-base md:text-lg font-black text-white block truncate leading-tight">{formatDate(selectedDate)}</span>
			</div>
		</div>

	<!-- Memories List or Single Dedicated Edit View - Scrollable -->
	<div class="flex-1 overflow-y-auto">
	{#if editingMemoryId && editingMemory}
		<!-- Dedicated Single Memory Edit Card (Isang memory lang ang mae-edit at walang ibang memory sa baba) -->
		<div class="p-3.5 sm:p-4 bg-white border border-pink-200/90 rounded-2xl shadow-xs animate-fade-in mb-3">
			<div class="flex items-center justify-between pb-2.5 mb-3 border-b border-pink-100">
				<div class="flex items-center space-x-2">
					<div class="w-6 h-6 rounded-lg bg-pink-100 text-[#f43f8e] flex items-center justify-center">
						<Pencil class="w-3.5 h-3.5" />
					</div>
					<h3 class="text-xs sm:text-sm font-black text-pink-950">Editing Memory</h3>
				</div>
				<button
					type="button"
					onclick={handleCancelEdit}
					class="text-[11px] font-bold text-pink-400 hover:text-pink-600 px-2 py-0.5 rounded-lg hover:bg-pink-50 transition-colors cursor-pointer"
				>
					Cancel
				</button>
			</div>

			<!-- Edit Mode (2-column on desktop, 1-column on mobile) -->
			<div class="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 items-start">
				<!-- Left Column: Mood, Tag, Description, Save/Cancel -->
				<div class="space-y-2.5">
					<!-- Mood Tag -->
					<div>
						<label class="block text-[10px] font-bold text-pink-500 mb-1">Mood Tag</label>
						<button
							type="button"
							onclick={() => showMoodTagModal = true}
							class="w-full px-3 py-1.5 bg-[#fdf2f6] border border-pink-200/80 rounded-xl text-xs text-left flex items-center justify-between font-bold text-pink-950 cursor-pointer transition-colors hover:bg-pink-100"
						>
							<span class={editedMoodTag ? 'text-pink-950 truncate' : 'text-pink-400 truncate'}>
								{editedMoodTag || 'Select mood'}
							</span>
							<ChevronDown class="w-3.5 h-3.5 text-[#f43f8e] flex-shrink-0 ml-1" />
						</button>
					</div>

					<!-- Memory Tag -->
					<div>
						<label class="block text-[10px] font-bold text-pink-500 mb-1">Memory Tag</label>
						<button
							type="button"
							onclick={() => showMemoryTagModal = true}
							class="w-full px-3 py-1.5 bg-[#fdf2f6] border border-pink-200/80 rounded-xl text-xs text-left flex items-center justify-between font-bold text-pink-950 cursor-pointer transition-colors hover:bg-pink-100"
						>
							<span class={editedMemoryTag ? 'text-pink-950 truncate' : 'text-pink-400 truncate'}>
								{editedMemoryTag || 'Select tag'}
							</span>
							<ChevronDown class="w-3.5 h-3.5 text-[#f43f8e] flex-shrink-0 ml-1" />
						</button>
					</div>

					<!-- Description -->
					<div>
						<label class="block text-[10px] font-bold text-pink-500 mb-1">Description</label>
						<div class="relative">
							<textarea
								bind:value={editedDescription}
								placeholder="Write about this memory..."
								rows="3"
								class="w-full px-3 py-2 pr-9 bg-[#fdf2f6] border border-pink-200/80 rounded-xl text-pink-950 placeholder:text-pink-300 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/30 focus:border-[#f43f8e] focus:bg-white text-xs font-bold resize-none"
							></textarea>
							<button
								type="button"
								onclick={() => showEmojiPicker = !showEmojiPicker}
								class="absolute bottom-2 right-2 w-6 h-6 rounded-full bg-white border border-pink-200 flex items-center justify-center text-xs hover:scale-110 transition-transform cursor-pointer"
							>
								<span>😊</span>
							</button>
							{#if showEmojiPicker}
								<div class="absolute bottom-full right-0 mb-1.5 p-2 bg-white border border-pink-100 rounded-2xl z-10 max-w-[180px] shadow-lg">
									<div class="grid grid-cols-6 gap-1">
										{#each emojis as emoji}
											<button
												type="button"
												onclick={() => insertEmoji(emoji)}
												class="p-1 hover:bg-pink-50 rounded-lg transition-colors text-sm cursor-pointer"
											>
												{emoji}
											</button>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</div>

					<!-- Save/Cancel Buttons -->
					<div class="flex space-x-2 pt-1">
						<button
							onclick={() => handleSaveEdit(editingMemory)}
							disabled={isSaving}
							class="flex-1 py-2 px-3 bg-[#f43f8e] text-white rounded-xl hover:bg-[#e0337f] transition-all text-xs font-bold disabled:opacity-50 active:scale-95 shadow-xs cursor-pointer"
						>
							{#if isSaving}Saving...{:else}Save{/if}
						</button>
						<button
							onclick={handleCancelEdit}
							class="flex-1 py-2 px-3 bg-white border border-pink-200 text-pink-600 rounded-xl hover:bg-pink-50 transition-all text-xs font-bold active:scale-95 cursor-pointer"
						>
							Cancel
						</button>
					</div>
				</div>

				<!-- Right Column: Media Uploads (Photo/Video & Music) -->
				<div class="space-y-2.5">
					<!-- Upload Photo or Video -->
					<div>
						<div class="flex items-center justify-between mb-1">
							<label class="block text-[10px] font-bold text-pink-500">Photo or Video</label>
							{#if editedPhotoVideo || editingMemory.photo_video}
								<button
									type="button"
									onclick={() => { photoVideoInput?.click(); }}
									class="text-[10px] font-bold text-[#f43f8e] hover:text-[#e0337f] bg-pink-50 px-2 py-0.5 rounded-full transition-all flex items-center space-x-1 cursor-pointer"
								>
									<RefreshCw class="w-3 h-3" />
									<span>Change</span>
								</button>
							{/if}
						</div>

						<div
							class="relative flex flex-col items-center justify-center w-full min-h-[80px] max-h-36 border border-dashed border-pink-300 rounded-xl bg-[#fdf2f6]/70 cursor-pointer hover:bg-pink-100/70 transition-all duration-200 overflow-hidden group"
							onclick={() => { photoVideoInput?.click(); }}
						>
							{#if editedPhotoVideoPreview}
								{#if editedPhotoVideoType.startsWith('image/')}
									<img src={editedPhotoVideoPreview} alt="Preview" class="w-full max-h-36 object-contain" />
								{:else}
									<div class="relative w-full h-full flex items-center justify-center bg-black/80 py-1.5">
										<video src={editedPhotoVideoPreview} class="w-full max-h-36 object-contain pointer-events-none" muted playsinline></video>
										<div class="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-all">
											<span class="text-[10px] font-bold text-white bg-[#f43f8e] px-2.5 py-0.5 rounded-full shadow-sm flex items-center space-x-1">
												<span>Change Video</span>
											</span>
										</div>
									</div>
								{/if}
							{:else if editingMemory.photo_video}
								{#if (editingMemory.photo_video_type && editingMemory.photo_video_type.startsWith('video/')) || (typeof editingMemory.photo_video === 'string' && (editingMemory.photo_video.endsWith('.mp4') || editingMemory.photo_video.endsWith('.webm') || editingMemory.photo_video.endsWith('.mov')))}
									<div class="relative w-full h-full flex items-center justify-center bg-black/80 py-1.5">
										<video src={getMediaUrl(editingMemory.photo_video)} class="w-full max-h-36 object-contain pointer-events-none" muted playsinline></video>
										<div class="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-all">
											<span class="text-[10px] font-bold text-white bg-[#f43f8e] px-2.5 py-0.5 rounded-full shadow-sm flex items-center space-x-1">
												<span>Change Video</span>
											</span>
										</div>
									</div>
								{:else}
									<div class="relative w-full h-full flex items-center justify-center">
										<img src={getMediaUrl(editingMemory.photo_video)} alt="Current" class="w-full max-h-36 object-contain" />
										<div class="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-all">
											<span class="text-[10px] font-bold text-white bg-[#f43f8e] px-2.5 py-0.5 rounded-full shadow-sm">Change Photo</span>
										</div>
									</div>
								{/if}
							{:else}
								<div class="flex items-center space-x-2.5 py-2 px-3">
									<div class="w-7 h-7 rounded-lg bg-pink-100 text-[#f43f8e] flex items-center justify-center flex-shrink-0">
										<ImageIcon class="w-4 h-4" />
									</div>
									<div class="flex-1 min-w-0">
										<p class="text-xs font-bold text-[#f43f8e]">Upload Photo/Video</p>
										<p class="text-[10px] text-pink-400 font-medium">Click to select file</p>
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
					</div>

					<!-- Upload Music -->
					<div>
						<label class="block text-[10px] font-bold text-pink-500 mb-1">Music</label>
						<label class="flex flex-col items-center justify-center w-full py-2 px-3 border border-dashed border-pink-300 rounded-xl bg-[#fdf2f6]/70 cursor-pointer hover:bg-pink-100 transition-all duration-200">
							<div class="flex items-center space-x-2.5 w-full max-w-full min-w-0 overflow-hidden">
								<div class="w-7 h-7 rounded-lg bg-pink-100 text-[#f43f8e] flex items-center justify-center flex-shrink-0">
									<Music class="w-4 h-4" />
								</div>
								<div class="flex-1 min-w-0">
									{#if editedMusic}
										<p class="text-xs text-pink-950 font-bold truncate">{editedMusic.name}</p>
										<p class="text-[10px] text-pink-400">Click to change</p>
									{:else if editingMemory.music}
										<p class="text-xs text-pink-950 font-bold truncate">Current: {getMusicName(editingMemory.music)}</p>
										<p class="text-[10px] text-pink-400">Click to change</p>
									{:else}
										<p class="text-xs text-[#f43f8e] font-bold">Upload Music</p>
										<p class="text-[10px] text-pink-400">Click to select audio</p>
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
				</div>
			</div>
		</div>
	{:else if memories.length === 0}
		<div class="text-center py-6">
			<div class="w-10 h-10 bg-white rounded-full flex items-center justify-center mx-auto mb-2 text-pink-300 border border-pink-100 shadow-2xs">
				<Bookmark class="w-5 h-5" />
			</div>
			<p class="text-xs font-black text-pink-950 mb-0.5">No memories for this date yet</p>
			<p class="text-[10px] text-pink-400 font-medium mb-3">Add memories to keep track of this special day!</p>
			<button
				onclick={() => dispatch('addMemory')}
				class="py-1.5 px-3 bg-[#f43f8e] hover:bg-[#e0337f] text-white rounded-xl transition-all text-xs font-bold active:scale-95 shadow-xs cursor-pointer"
			>
				Add Your First Memory
			</button>
		</div>
	{:else}
		<div class="space-y-2.5">
			{#each memories as memory (memory.id)}
				{@const details = getMemoryDisplayDetails(memory)}
				<div class="p-3.5 bg-white border border-pink-100/90 rounded-2xl shadow-2xs hover:border-pink-200 transition-all">
					<!-- Hidden audio element mounted once per memory -->
						{#if memory.music}
							<audio
								bind:this={audioElements[memory.id]}
								src={getMusicUrl(memory.music)}
								preload="metadata"
								onloadedmetadata={(e) => { audioDurations[memory.id] = e.currentTarget.duration || 0; }}
								ontimeupdate={(e) => { audioCurrentTimes[memory.id] = e.currentTarget.currentTime || 0; }}
								onended={() => { if (playingAudioId === memory.id) playingAudioId = null; audioCurrentTimes[memory.id] = 0; }}
								onplay={() => { playingAudioId = memory.id; }}
								onerror={() => { if (playingAudioId === memory.id) playingAudioId = null; }}
								crossorigin="anonymous"
								class="hidden"
							></audio>
						{/if}

						{#snippet cardHeader()}
							<div class="flex items-center justify-between gap-2 border-b border-pink-100/80 pb-2 mb-2.5 min-w-0">
								<!-- Tags & Badges -->
								<div class="flex items-center flex-wrap gap-1.5 min-w-0">
									{#if details.isShared && details.senderName}
										<button
											type="button"
											onclick={() => handleSenderClick(details.senderName)}
											class="text-[10.5px] sm:text-xs px-2.5 py-0.5 rounded-full bg-pink-500 text-white font-bold flex items-center space-x-1 shadow-2xs hover:bg-pink-600 transition-colors cursor-pointer"
										>
											<span>Shared by @{details.senderName}</span>
										</button>
									{/if}

									{#if memory.mood_tag}
										<span class="text-[10.5px] sm:text-xs px-2.5 py-0.5 rounded-full border {getMoodColor(memory.mood_tag)} font-bold whitespace-nowrap">
											{memory.mood_tag}
										</span>
									{/if}

									{#if details.cleanTag}
										<span class="text-[10.5px] sm:text-xs px-2.5 py-0.5 rounded-full bg-pink-50 text-pink-500 border border-pink-200 font-bold whitespace-nowrap">
											{details.cleanTag}
										</span>
									{/if}
								</div>

								<!-- Action Buttons -->
								<div class="flex items-center space-x-1 flex-shrink-0">
									{#if !details.isShared}
										<button
											type="button"
											onclick={() => openShareModal(memory)}
											class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-pink-50/80 hover:bg-pink-100 text-pink-400 hover:text-[#f43f8e] active:scale-95 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
											title="Share with Friend"
										>
											<Share2 class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
										</button>

										<button
											type="button"
											onclick={() => handleEditMemory(memory)}
											class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-pink-50/80 hover:bg-pink-100 text-pink-400 hover:text-[#f43f8e] active:scale-95 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
											title="Edit"
										>
											<Pencil class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
										</button>
									{/if}

									<button
										type="button"
										onclick={() => handleDeleteMemory(memory.id)}
										class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-pink-50/80 hover:bg-rose-50 text-pink-400 hover:text-rose-600 active:scale-95 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
										title="Delete"
									>
										<Trash2 class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
									</button>
								</div>
							</div>
						{/snippet}

						{#snippet mediaBox()}
							{#if (!memory.photo_video_type || memory.photo_video_type.startsWith('image/')) && !(typeof memory.photo_video === 'string' && (memory.photo_video.endsWith('.mp4') || memory.photo_video.endsWith('.webm') || memory.photo_video.endsWith('.mov')))}
								<div 
									class="relative rounded-xl overflow-hidden border border-pink-100/90 cursor-pointer hover:border-pink-300 transition-all duration-200 bg-pink-50/50 shadow-2xs group w-full h-44 sm:h-48 md:h-full md:min-h-[160px] md:max-h-[220px] flex items-center justify-center" 
									onclick={() => openFullScreenImage(getMediaUrl(memory.photo_video), 'image')}
								>
									<img 
										src={getMediaUrl(memory.photo_video)} 
										alt="Memory" 
										class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 rounded-xl" 
									/>
									<div class="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center pointer-events-none">
										<span class="bg-black/60 text-white text-[10px] sm:text-xs font-bold px-3 py-1.5 rounded-full backdrop-blur-xs flex items-center space-x-1.5 shadow-sm">
											<Maximize2 class="w-3.5 h-3.5" />
											<span>Full view</span>
										</span>
									</div>
								</div>
							{:else}
								<div class="relative rounded-xl overflow-hidden border border-pink-100/90 bg-black shadow-2xs group w-full h-44 sm:h-48 md:h-full md:min-h-[160px] md:max-h-[220px] flex items-center justify-center">
									<video 
										src={getMediaUrl(memory.photo_video)} 
										class="w-full h-full object-cover" 
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
										class="absolute top-2.5 right-2.5 bg-[#f43f8e]/90 hover:bg-[#e0337f] text-white text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-lg backdrop-blur-xs flex items-center space-x-1 transition-all z-10 shadow-xs active:scale-95 cursor-pointer"
										title="Full view"
									>
										<Maximize2 class="w-3.5 h-3.5" />
										<span>Full view</span>
									</button>
								</div>
							{/if}
						{/snippet}

						{#snippet audioBox()}
							{#if memory.music}
								<div class="bg-pink-50/60 border border-pink-100/90 rounded-xl p-2 sm:p-2.5 space-y-1">
									<p class="text-[11px] sm:text-xs font-bold text-pink-950 truncate px-0.5">{getMusicName(memory.music)}</p>

									<div class="flex items-center space-x-2">
										<button
											type="button"
											onclick={() => togglePlayAudio(memory.id)}
											class="w-6 h-6 rounded-full bg-[#f43f8e] hover:bg-[#e0337f] text-white flex items-center justify-center flex-shrink-0 transition-all active:scale-95 shadow-2xs cursor-pointer"
										>
											{#if playingAudioId === memory.id}
												<Pause class="w-3 h-3 fill-current" />
											{:else}
												<Play class="w-3 h-3 fill-current" />
											{/if}
										</button>

										<span class="text-[9.5px] font-bold text-pink-600 min-w-[24px] text-right tabular-nums">
											{formatAudioTime(audioCurrentTimes[memory.id] || 0)}
										</span>

										<input
											type="range"
											min="0"
											max={audioDurations[memory.id] || 100}
											step="0.1"
											value={audioCurrentTimes[memory.id] || 0}
											oninput={(e) => handleAudioSeek(memory.id, e)}
											class="flex-1 h-1.5 bg-pink-100 accent-[#f43f8e] rounded-full cursor-pointer"
										/>

										<span class="text-[9.5px] font-bold text-pink-400 min-w-[24px] tabular-nums">
											{formatAudioTime(audioDurations[memory.id] || 0)}
										</span>
									</div>
								</div>
							{/if}
						{/snippet}

						{#if memory.photo_video}
							<!-- MOBILE VIEW (< md): Stacked in exact clean proportion -->
							<div class="flex flex-col space-y-2.5 md:hidden min-w-0">
								{@render cardHeader()}

								<!-- Description Content -->
								{#if details.cleanDesc}
									<p class="text-xs sm:text-sm font-semibold text-pink-950 leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-h-40 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:#f43f8e_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-pink-300 [&::-webkit-scrollbar-thumb]:rounded-full">
										{details.cleanDesc}
									</p>
								{/if}

								<!-- Photo / Video (Media) on Phone View -->
								{@render mediaBox()}

								<!-- Audio Player on Phone View -->
								{@render audioBox()}

								<!-- Timestamp on Phone View -->
								<div class="pt-1.5 border-t border-pink-50">
									<span class="text-[10px] text-pink-400 font-bold">
										Created: {formatTime(memory.created_at)}
									</span>
								</div>
							</div>

							<!-- DESKTOP VIEW (md:): Balanced 2-Column Split -->
							<div class="hidden md:flex md:flex-col min-w-0">
								{@render cardHeader()}

								<div class="grid grid-cols-2 gap-4 items-stretch min-w-0">
									<!-- Left Column (Description, Audio Player, Timestamp) -->
									<div class="flex flex-col justify-between space-y-2.5 min-w-0 overflow-hidden">
										<!-- Description Content -->
										{#if details.cleanDesc}
											<p class="text-xs sm:text-sm font-semibold text-pink-950 leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-h-36 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:#f43f8e_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-pink-300 [&::-webkit-scrollbar-thumb]:rounded-full">
												{details.cleanDesc}
											</p>
										{/if}

										<!-- Bottom of Left Column: Audio Player & Timestamp -->
										<div class="space-y-2 pt-2 border-t border-pink-50 min-w-0 mt-auto">
											{@render audioBox()}
											<div class="pt-0.5">
												<span class="text-xs text-pink-400 font-bold">
													Created: {formatTime(memory.created_at)}
												</span>
											</div>
										</div>
									</div>

									<!-- Right Column (Media Box) -->
									<div class="flex flex-col justify-center min-w-0">
										{@render mediaBox()}
									</div>
								</div>
							</div>
						{:else}
							<!-- Layout Without Media: Single Full-Width Card -->
							<div class="space-y-2.5 min-w-0 overflow-hidden">
								{@render cardHeader()}

								<!-- Clean Description Content -->
								{#if details.cleanDesc}
									<p class="text-xs sm:text-sm md:text-[14.5px] font-semibold text-pink-950 leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-h-48 md:max-h-36 overflow-y-auto pr-1.5 [scrollbar-width:thin] [scrollbar-color:#f43f8e_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-pink-300 [&::-webkit-scrollbar-thumb]:rounded-full my-1">{details.cleanDesc}</p>
								{/if}

								<!-- Audio Player -->
								{@render audioBox()}

								<!-- Timestamp -->
								<div class="pt-2 border-t border-pink-50">
									<span class="text-[10px] sm:text-xs text-pink-400 font-bold">
										Created: {formatTime(memory.created_at)}
									</span>
								</div>
							</div>
						{/if}
				</div>
			{/each}
		</div>
	{/if}
	</div>

	<!-- Add Memory Button - Fixed at Bottom (Only shown when not editing) -->
	{#if !editingMemoryId}
		<div class="mt-3 pt-3 border-t border-pink-200/70 flex-shrink-0">
			<button
				onclick={() => dispatch('addMemory')}
				class="w-full py-2.5 sm:py-3 px-4 bg-[#f43f8e] hover:bg-[#e0337f] active:scale-95 transition-all duration-200 text-xs sm:text-sm font-bold text-white rounded-xl flex items-center justify-center space-x-1.5 shadow-xs cursor-pointer"
			>
				<Plus class="w-4 h-4" />
				<span>Add Another Memory</span>
			</button>
		</div>
	{/if}
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
				<X class="w-5 h-5" strokeWidth={2.5} />
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
		class="fixed inset-0 z-[120] bg-transparent flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in font-sans select-none"
		onclick={(e) => { if (e.target === e.currentTarget && !isTrimmingVideo) { showVideoTrimmerModal = false; rawVideoFile = null; if (photoVideoInput) photoVideoInput.value = ''; } }}
	>
		<div
			class="bg-white border border-pink-100 rounded-3xl max-w-md w-full p-4 sm:p-5 space-y-3.5 shadow-2xl relative animate-modal-content max-h-[88vh] overflow-y-auto my-auto"
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Top Header -->
			<div class="flex items-center justify-between pb-2.5 border-b border-pink-100">
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
					<X class="w-3.5 h-3.5" strokeWidth={2.5} />
				</button>
			</div>

			<!-- Center: Video Player Viewport -->
			<div
				class="relative w-full rounded-2xl overflow-hidden bg-black border border-pink-100 flex items-center justify-center cursor-pointer group max-h-56 shadow-xs"
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
					<div class="absolute inset-0 bg-black/30 flex items-center justify-center transition-all">
						<div class="w-12 h-12 rounded-full bg-[#f43f8e] text-white flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
							<Play class="w-6 h-6 ml-0.5 fill-current" />
						</div>
					</div>
				{/if}
			</div>

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
							onpointerdown={(e) => handlePointerDown(e, 'window')}
						>
							<!-- Left Drag Handle -->
							<div
								class="w-6 h-full bg-[#f43f8e] hover:bg-[#e0337f] text-white cursor-ew-resize flex items-center justify-center rounded-l-md active:scale-95 transition-transform"
								style="touch-action: none;"
								onpointerdown={(e) => handlePointerDown(e, 'left')}
							>
								<div class="w-1 h-4 bg-white rounded-full"></div>
							</div>

							<!-- Right Drag Handle -->
							<div
								class="w-6 h-full bg-[#f43f8e] hover:bg-[#e0337f] text-white cursor-ew-resize flex items-center justify-center rounded-r-md active:scale-95 transition-transform"
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
						<div class="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
						<span>{trimProgress > 0 ? `Optimizing Clip (${trimProgress}%)...` : 'Trimming 15s Clip...'}</span>
					{:else}
						<Check class="w-4 h-4" />
						<span>Attach 15s Clip</span>
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Share Memory Modal -->
{#if showShareModal}
	<div class="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 font-sans">
		<div class="bg-white border border-pink-100 rounded-3xl p-5 max-w-sm w-full max-h-[82vh] overflow-y-auto relative animate-modal-content shadow-2xl my-auto">
			<button
				onclick={() => showShareModal = false}
				class="absolute top-3.5 right-3.5 w-7 h-7 rounded-full bg-pink-50 hover:bg-pink-100 text-pink-400 hover:text-[#f43f8e] flex items-center justify-center transition-colors cursor-pointer"
			>
				✕
			</button>
			<div class="text-center mb-3">
				<h3 class="text-base font-black text-pink-950">Share Memory</h3>
				<p class="text-xs text-pink-400 font-bold">Select friends to tag/share this memory with so both of you can see it on this date!</p>
			</div>

			{#if shareSuccessMsg}
				<div class="mb-3.5 p-2.5 bg-pink-50 border border-pink-200 text-[#f43f8e] rounded-xl text-xs text-center font-bold">
					{shareSuccessMsg}
				</div>
			{/if}

			{#if friends.length === 0}
				<p class="text-xs text-pink-400 text-center py-4 font-bold">No friends found. Add friends first from the sidebar!</p>
			{:else}
				<div class="space-y-2 max-h-56 overflow-y-auto mb-4 p-0.5 pr-1">
					{#if isLoadingSharedRecipients}
						<div class="py-3 text-center">
							<div class="animate-spin w-5 h-5 border-2 border-pink-100 border-t-[#f43f8e] rounded-full mx-auto mb-1"></div>
							<span class="text-[11px] text-pink-400 font-bold">Checking shared status...</span>
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
							class="w-full p-2.5 rounded-2xl border transition-all flex items-center justify-between text-left {isAlreadyShared ? 'bg-[#fdf2f6]/70 border-pink-100 opacity-80 cursor-not-allowed' : isSelected ? 'border-[#f43f8e] bg-pink-50/90 cursor-pointer shadow-2xs' : 'border-pink-100 bg-white hover:bg-[#fdf2f6]/60 hover:border-pink-200 cursor-pointer'}"
						>
							<div class="flex items-center space-x-2.5 min-w-0">
								<div class="w-8 h-8 rounded-xl {isAlreadyShared ? 'bg-pink-300' : 'bg-gradient-to-tr from-[#f43f8e] to-[#ec4899]'} text-white font-black text-xs flex items-center justify-center flex-shrink-0 overflow-hidden shadow-2xs">
									{#if friend.avatar_url}
										<img src={friend.avatar_url} alt={friend.username} class="w-full h-full object-cover" />
									{:else}
										{friend.username.charAt(0).toUpperCase()}
									{/if}
								</div>
								<div class="min-w-0">
									<span class="text-xs font-black text-[#e8367f] block truncate">@{friend.username}</span>
									{#if isAlreadyShared}
										<span class="text-[10px] text-pink-400 font-bold block leading-tight">Already shared</span>
									{/if}
								</div>
							</div>
							<div class="flex-shrink-0 ml-2">
								{#if isAlreadyShared}
									<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center gap-1">
										<span>Shared</span>
									</span>
								{:else if isSelected}
									<span class="w-5 h-5 rounded-full bg-[#f43f8e] text-white flex items-center justify-center text-xs font-black shadow-xs">
										✓
									</span>
								{:else}
									<span class="w-5 h-5 rounded-full border border-pink-300 bg-white"></span>
								{/if}
							</div>
						</button>
					{/each}
				</div>
				<button
					onclick={handleShareMemorySubmit}
					disabled={selectedShareFriendIds.length === 0 || isSharing}
					class="w-full py-2.5 bg-[#f43f8e] hover:bg-[#e0337f] text-white rounded-xl font-bold text-xs transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed shadow-xs active:scale-95"
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
		class="fixed inset-0 bg-black/40 backdrop-blur-xs z-[70] flex items-center justify-center p-3 sm:p-4 animate-fade-in font-sans"
		onclick={(e) => { if (e.target === e.currentTarget) { showDeleteConfirmModal = false; memoryToDeleteId = null; } }}
	>
		<div class="bg-white border border-pink-100 rounded-3xl max-w-xs w-full p-5 text-center animate-modal-content relative overflow-hidden shadow-2xl my-auto">
			<!-- Trash Bin Circle Icon -->
			<div class="w-12 h-12 bg-rose-50 text-rose-500 border border-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-2.5 shadow-2xs">
				<Trash2 class="w-6 h-6" />
			</div>
			<h3 class="text-sm font-black text-pink-950 mb-1">Delete Memory?</h3>
			<p class="text-xs text-pink-950/70 mb-4 font-medium leading-relaxed">
				Are you sure you want to delete this memory? This action cannot be undone.
			</p>

			<div class="flex items-center space-x-2">
				<button
					type="button"
					onclick={() => { showDeleteConfirmModal = false; memoryToDeleteId = null; }}
					class="w-1/2 py-2 px-3 bg-[#fdf2f6] text-pink-950 hover:bg-pink-100 rounded-xl font-bold text-xs transition-all cursor-pointer active:scale-95"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={confirmDeleteMemory}
					class="w-1/2 py-2 px-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold text-xs transition-all active:scale-95 cursor-pointer shadow-xs"
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
	/* Hide scrollbar while preserving smooth scrolling */
	.flex-1::-webkit-scrollbar {
		display: none;
		width: 0px;
		background: transparent;
	}

	.flex-1 {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}

	@keyframes bottom-sheet-slide {
		from {
			transform: translateY(100%);
			opacity: 0.8;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.animate-bottom-sheet {
		animation: bottom-sheet-slide 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards;
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
