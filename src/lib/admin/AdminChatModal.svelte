<script>
	import { tick, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import {
		X, Send, MessageSquare, Bug, Lightbulb, CheckCircle2,
		AlertCircle, Sparkles, ShieldCheck, Wrench, HelpCircle,
		ExternalLink, Check, ChevronDown, ChevronUp
	} from 'lucide-svelte';
	import { playClickSound } from '$lib/soundEffects.js';

	let {
		isOpen = false,
		feedback = null,
		adminPasscode = '041205',
		onClose = () => {},
		onFeedbackUpdated = () => {}
	} = $props();

	// Component Reactive State
	let messages = $state([]);
	let adminId = $state(14);
	let targetUser = $state(null);
	let messageText = $state('');
	let resolveOnSend = $state(false);
	let isLoading = $state(false);
	let isSending = $state(false);
	let isUserTyping = $state(false);
	let showTicketDetails = $state(true);
	let errorMessage = $state('');
	let successNotice = $state('');
	let chatContainer = $state(null);

	// Realtime & Subscriptions
	let chatChannel = null;
	let typingTimer = null;
	let myTypingTimeout = null;
	let fallbackPollInterval = null;
	let activeTicketId = $state(null);

	// Strip ticket wrapper tags and emojis for clean, professional bubble rendering
	function cleanTicketMessage(text) {
		if (!text) return '';
		let clean = text;
		clean = clean.replace(/\[TICKET id="[^"]*"\]\n?/g, '');
		clean = clean.replace(/\n?\[\/TICKET\]/g, '');
		// Strip any emojis from ticket text
		clean = clean.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
		clean = clean.replace(/\[Need Help or Suggestion:\s+/g, '[Need Help or Suggestion: ');
		return clean.trim();
	}

	// Professional Support Canned Quick Responses (Lucide Icons, No Emojis)
	const quickResponses = [
		{ label: "Investigating", icon: Wrench, text: "Thank you for reporting! We are currently looking into this issue right now." },
		{ label: "Resolved", icon: CheckCircle2, text: "This has been successfully resolved! Please refresh your app to verify." },
		{ label: "Need Details", icon: HelpCircle, text: "Hi! Could you provide a bit more detail or steps to help us assist you better?" },
		{ label: "Feature Noted", icon: Lightbulb, text: "Awesome idea! We have logged this request on our ChronoMuse feature roadmap." },
		{ label: "Account Safe", icon: ShieldCheck, text: "All good! Your account data and privacy settings have been safely verified." }
	];

	// Synthesize subtle UI sounds for Support Desk
	function playSupportChime(type = 'send') {
		if (typeof window === 'undefined') return;
		try {
			const AudioContextClass = window.AudioContext || window.webkitAudioContext;
			if (!AudioContextClass) return;
			const ctx = new AudioContextClass();
			const now = ctx.currentTime;
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();

			if (type === 'send') {
				osc.type = 'sine';
				osc.frequency.setValueAtTime(540, now);
				osc.frequency.exponentialRampToValueAtTime(920, now + 0.08);
				gain.gain.setValueAtTime(0.08, now);
				gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
				osc.connect(gain);
				gain.connect(ctx.destination);
				osc.start(now);
				osc.stop(now + 0.1);
			} else if (type === 'receive') {
				osc.type = 'sine';
				osc.frequency.setValueAtTime(740, now);
				osc.frequency.exponentialRampToValueAtTime(1120, now + 0.12);
				gain.gain.setValueAtTime(0.12, now);
				gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
				osc.connect(gain);
				gain.connect(ctx.destination);
				osc.start(now);
				osc.stop(now + 0.18);
			}
		} catch (e) {}
	}

	$effect(() => {
		if (isOpen && feedback?.id) {
			if (activeTicketId !== feedback.id) {
				activeTicketId = feedback.id;
				// Immediately clear previous ticket's messages to prevent UI leakage
				messages = [];
				errorMessage = '';
				successNotice = '';
				isUserTyping = false;
				initializeSupportChat();
			}
		} else {
			activeTicketId = null;
			cleanupSupportChat();
			messages = [];
			errorMessage = '';
			successNotice = '';
			isUserTyping = false;
		}
	});

	onDestroy(() => {
		cleanupSupportChat();
	});

	function initializeSupportChat() {
		cleanupSupportChat();
		syncMessages(false);
		initRealtimeChannel();
		// Gentle 8s background heartbeat in case websocket disconnects
		fallbackPollInterval = setInterval(() => {
			if (isOpen && feedback?.user_id && !isLoading && !isSending) {
				syncMessages(true);
			}
		}, 8000);
	}

	function cleanupSupportChat() {
		if (fallbackPollInterval) {
			clearInterval(fallbackPollInterval);
			fallbackPollInterval = null;
		}
		if (chatChannel) {
			try { supabase.removeChannel(chatChannel); } catch (e) {}
			chatChannel = null;
		}
		if (typingTimer) {
			clearTimeout(typingTimer);
			typingTimer = null;
		}
		if (myTypingTimeout) {
			clearTimeout(myTypingTimeout);
			myTypingTimeout = null;
		}
	}

	function initRealtimeChannel() {
		if (!feedback?.user_id) return;
		const id1 = Number(adminId);
		const id2 = Number(feedback.user_id);
		const channelName = `chat_presence_${Math.min(id1, id2)}_${Math.max(id1, id2)}`;

		chatChannel = supabase.channel(channelName, {
			config: { broadcast: { ack: false, self: false } }
		});

		chatChannel
			.on('broadcast', { event: 'direct_message' }, async (payload) => {
				const incoming = payload.payload;
				if (!incoming || Number(incoming.sender_id) !== Number(feedback.user_id)) return;

				// Enforce ticket scoping: ignore messages addressed to another ticket
				if (incoming.feedback_id && String(incoming.feedback_id) !== String(feedback.id)) {
					return;
				}
				const ticketMatch = incoming.message?.match(/\[TICKET id="([^"]+)"\]/);
				if (ticketMatch && String(ticketMatch[1]) !== String(feedback.id)) {
					return;
				}

				if (!messages.some(m => String(m.id) === String(incoming.id) || (m.message === incoming.message && Number(m.sender_id) === Number(incoming.sender_id)))) {
					messages = [...messages, incoming];
					playSupportChime('receive');
					isUserTyping = false;
					await scrollToBottom(true);
				}
			})
			.on('broadcast', { event: 'typing' }, (payload) => {
				if (payload.payload && Number(payload.payload.sender_id) === Number(feedback.user_id)) {
					isUserTyping = Boolean(payload.payload.is_typing);
					if (typingTimer) clearTimeout(typingTimer);
					if (isUserTyping) {
						typingTimer = setTimeout(() => {
							isUserTyping = false;
						}, 4000);
						scrollToBottom(true);
					}
				}
			})
			.subscribe();
	}

	function broadcastAdminTyping(isTyping) {
		if (!chatChannel) return;
		try {
			chatChannel.send({
				type: 'broadcast',
				event: 'typing',
				payload: {
					sender_id: adminId,
					is_typing: isTyping
				}
			});
		} catch (e) {}
	}

	function handleInputTyping() {
		broadcastAdminTyping(true);
		if (myTypingTimeout) clearTimeout(myTypingTimeout);
		myTypingTimeout = setTimeout(() => {
			broadcastAdminTyping(false);
		}, 3000);
	}

	async function syncMessages(silent = false) {
		if (!feedback?.user_id) return;
		if (!silent) isLoading = true;
		errorMessage = '';

		try {
			const res = await fetch('/api/admin', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					passcode: adminPasscode,
					action: 'get_chat_history',
					user_id: feedback.user_id,
					feedback_id: feedback.id,
					feedback_created_at: feedback.created_at
				})
			});
			const data = await res.json();
			if (data.success && data.data) {
				const remoteMsgs = data.data.messages || [];
				messages = remoteMsgs;
				await scrollToBottom(!silent);
				if (data.data.admin_id) adminId = data.data.admin_id;
				if (data.data.user) targetUser = data.data.user;
			} else if (!silent) {
				errorMessage = data.error || 'Failed to load conversation history.';
			}
		} catch (err) {
			if (!silent) errorMessage = 'Network connection issue.';
		} finally {
			if (!silent) isLoading = false;
		}
	}

	async function handleSendMessage(e) {
		if (e) e.preventDefault();
		const text = messageText.trim();
		if (!text || isSending || !feedback?.user_id) return;

		isSending = true;
		errorMessage = '';
		successNotice = '';
		broadcastAdminTyping(false);

		// Optimistic message preview
		const tempId = `admin-temp-${Date.now()}`;
		const optimisticMsg = {
			id: tempId,
			sender_id: adminId,
			receiver_id: feedback.user_id,
			message: text,
			feedback_id: feedback.id,
			created_at: new Date().toISOString(),
			is_read: false
		};

		messages = [...messages, optimisticMsg];
		messageText = '';
		playSupportChime('send');
		await scrollToBottom(true);

		// 1. Direct realtime broadcast over chat channel for 0ms delivery
		if (chatChannel) {
			try {
				chatChannel.send({
					type: 'broadcast',
					event: 'direct_message',
					payload: optimisticMsg
				});
			} catch (e) {}
		}

		// 2. Broadcast to recipient's private inbox channel so they hear notification chime
		try {
			const userInbox = supabase.channel(`chronomuse_user_inbox_${feedback.user_id}`);
			userInbox.subscribe((status) => {
				if (status === 'SUBSCRIBED') {
					userInbox.send({
						type: 'broadcast',
						event: 'new_message',
						payload: {
							sender_id: adminId,
							receiver_id: feedback.user_id,
							message: text
						}
					}).then(() => {
						setTimeout(() => {
							try { supabase.removeChannel(userInbox); } catch (e) {}
						}, 800);
					});
				}
			});
		} catch (e) {}

		// 3. Persist to database via Admin API
		try {
			const res = await fetch('/api/admin', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					passcode: adminPasscode,
					action: 'send_chat_message',
					user_id: feedback.user_id,
					message: text,
					feedback_id: feedback.id,
					resolve_feedback: resolveOnSend
				})
			});
			const data = await res.json();
			if (data.success && data.data?.message) {
				// Replace temporary msg with server record
				messages = messages.map(m => m.id === tempId ? data.data.message : m);
				successNotice = 'Delivered to user in ChronoMuse Chat! ✨';
				if (data.data.feedback_resolved) {
					onFeedbackUpdated(feedback.id, 'resolved');
				}
				setTimeout(() => { successNotice = ''; }, 3500);
			} else {
				errorMessage = data.error || 'Failed to persist message.';
			}
		} catch (err) {
			errorMessage = 'Message could not be saved to server.';
		} finally {
			isSending = false;
		}
	}

	async function scrollToBottom(smooth = false) {
		await tick();
		if (chatContainer) {
			chatContainer.scrollTo({
				top: chatContainer.scrollHeight,
				behavior: smooth ? 'smooth' : 'auto'
			});
		}
	}

	function handleKeyDown(e) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSendMessage();
		}
	}

	function formatTime(isoStr) {
		if (!isoStr) return '';
		try {
			const d = new Date(isoStr);
			return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		} catch (e) {
			return '';
		}
	}

	function formatDateDivider(isoStr) {
		if (!isoStr) return '';
		try {
			const d = new Date(isoStr);
			return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		} catch (e) {
			return '';
		}
	}
</script>

{#if isOpen && feedback}
	<div
		class="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4 animate-fade-in font-sans"
		role="dialog"
		aria-modal="true"
	>
		<!-- Backdrop dismissal button -->
		<button
			type="button"
			class="absolute inset-0 w-full h-full cursor-default"
			onclick={onClose}
			aria-label="Close dialog"
		></button>

		<!-- Support Console Window Container -->
		<div class="relative bg-white rounded-3xl border border-pink-200 shadow-[0_25px_70px_rgba(244,114,182,0.25)] max-w-lg w-full flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden z-10 animate-scale-up">
			
			<!-- Top Official Support Header -->
			<div class="p-3.5 sm:p-4 border-b border-pink-100 flex items-center justify-between bg-gradient-to-r from-pink-50 via-rose-50/70 to-pink-50/50 flex-shrink-0">
				<div class="flex items-center gap-2.5 min-w-0">
					<!-- Avatar with Active Status Indicator -->
					<div class="relative flex-shrink-0">
						<div class="w-10 h-10 rounded-2xl bg-pink-100 text-[#f43f8e] font-black flex items-center justify-center overflow-hidden border border-pink-200 shadow-2xs text-sm">
							{#if feedback.avatar_url || targetUser?.avatar_url}
								<img src={feedback.avatar_url || targetUser?.avatar_url} alt="" class="w-full h-full object-cover" />
							{:else}
								{feedback.username?.charAt(0).toUpperCase() || 'U'}
							{/if}
						</div>
						<span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full animate-pulse" title="Active"></span>
					</div>

					<div class="min-w-0">
						<div class="flex items-center gap-1.5 flex-wrap">
							<h3 class="text-xs sm:text-sm font-black text-pink-950 truncate flex items-center gap-1.5">
								<span>@{feedback.username}</span>
								<span class="px-1.5 py-0.5 rounded-md bg-pink-100 text-[#f43f8e] font-mono text-[9px] font-black border border-pink-200">
									#TKT-{feedback.id}
								</span>
							</h3>
							{#if feedback.status === 'new'}
								<span class="px-2 py-0.2 bg-amber-100/90 text-amber-800 rounded-full text-[9px] font-black border border-amber-200">
									Ticket Open
								</span>
							{:else}
								<span class="px-2 py-0.2 bg-emerald-100 text-emerald-800 rounded-full text-[9px] font-black border border-emerald-200">
									Resolved
								</span>
							{/if}
						</div>
						<div class="flex items-center gap-2 text-[10px] text-pink-500 font-bold truncate mt-0.5">
							<span class="truncate">{feedback.email || targetUser?.email || 'Registered User'}</span>
							{#if feedback.user_id}
								<span class="text-pink-300">•</span>
								<span class="font-mono text-[9px] text-pink-400">UID: {feedback.user_id}</span>
							{/if}
						</div>
					</div>
				</div>

				<!-- Actions: Support Badge, Close -->
				<div class="flex items-center gap-1 flex-shrink-0">
					<div class="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/80 border border-pink-200 text-[#f43f8e] text-[10px] font-black mr-1 shadow-3xs">
						<ShieldCheck class="w-3 h-3" />
						<span>Official Support</span>
					</div>

					<button
						type="button"
						onclick={onClose}
						class="w-8 h-8 flex items-center justify-center text-pink-400 hover:text-pink-800 hover:bg-pink-100/70 rounded-full transition-colors cursor-pointer"
						aria-label="Close modal"
					>
						<X class="w-4.5 h-4.5" />
					</button>
				</div>
			</div>

			<!-- User's Concern Context Card (Collapsible) -->
			<div class="bg-pink-50/40 border-b border-pink-100/80 text-xs flex-shrink-0">
				<button
					type="button"
					onclick={() => showTicketDetails = !showTicketDetails}
					class="w-full px-3.5 py-2 flex items-center justify-between text-left hover:bg-pink-50/70 transition-colors cursor-pointer"
				>
					<div class="flex items-center gap-2 font-black text-[11px]">
						{#if feedback.category === 'bug'}
							<span class="text-xs font-bold text-rose-500 inline-flex items-center gap-1">
								<Bug class="w-3.5 h-3.5 text-rose-500" />
								<span>Bug Report</span>
							</span>
						{:else if feedback.category === 'help'}
							<span class="text-xs font-bold text-purple-600 inline-flex items-center gap-1">
								<MessageSquare class="w-3.5 h-3.5 text-purple-500" />
								<span>Concern / Help</span>
							</span>
						{:else}
							<span class="text-xs font-bold text-amber-600 inline-flex items-center gap-1">
								<Lightbulb class="w-3.5 h-3.5 text-amber-500" />
								<span>Suggestion</span>
							</span>
						{/if}
						<span class="text-pink-300 font-bold select-none">•</span>
						<span class="text-pink-900 font-bold truncate max-w-[200px] sm:max-w-xs">{feedback.title}</span>
					</div>

					<div class="flex items-center gap-1 text-[10px] text-pink-400 font-bold">
						<span>{showTicketDetails ? 'Hide details' : 'View report'}</span>
						{#if showTicketDetails}
							<ChevronUp class="w-3.5 h-3.5" />
						{:else}
							<ChevronDown class="w-3.5 h-3.5" />
						{/if}
					</div>
				</button>

				{#if showTicketDetails}
					<div class="px-3.5 pb-2.5 pt-0.5 animate-fade-in">
						<p class="text-pink-900 bg-white/95 p-2.5 rounded-xl border border-pink-100 font-medium text-[11px] max-h-24 overflow-y-auto leading-relaxed whitespace-pre-wrap shadow-2xs">
							{feedback.message}
						</p>
					</div>
				{/if}
			</div>

			<!-- Notice Alerts -->
			{#if successNotice}
				<div class="px-3 py-1.5 bg-emerald-50 border-b border-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1.5 animate-fade-in flex-shrink-0">
					<CheckCircle2 class="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
					<span>{successNotice}</span>
				</div>
			{/if}
			{#if errorMessage}
				<div class="px-3 py-1.5 bg-rose-50 border-b border-rose-100 text-rose-800 text-xs font-bold flex items-center gap-1.5 animate-fade-in flex-shrink-0">
					<AlertCircle class="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
					<span>{errorMessage}</span>
				</div>
			{/if}

			<!-- Real-Time Chat Thread Area -->
			<div
				bind:this={chatContainer}
				class="flex-1 p-3.5 sm:p-4 overflow-y-auto space-y-3 min-h-[240px] max-h-[380px] bg-gradient-to-b from-white via-pink-50/15 to-pink-50/35"
			>
				{#if !feedback.user_id}
					<!-- Anonymous Submission Warning -->
					<div class="py-10 text-center space-y-2">
						<div class="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto shadow-2xs">
							<AlertCircle class="w-5 h-5" />
						</div>
						<p class="text-xs font-black text-pink-950">Anonymous Submission</p>
						<p class="text-[11px] text-pink-500 max-w-xs mx-auto leading-relaxed">
							This concern was submitted anonymously without a registered account ID. You can resolve or reopen this report using the button below.
						</p>
					</div>
				{:else if isLoading && messages.length === 0}
					<div class="py-12 text-center text-pink-400 space-y-2">
						<div class="animate-spin h-5 w-5 border-2 border-pink-200 border-t-[#f43f8e] rounded-full mx-auto"></div>
						<p class="text-xs font-bold">Connecting to Support Channel...</p>
					</div>
				{:else if messages.length === 0}
					<div class="py-10 text-center space-y-2">
						<div class="w-10 h-10 rounded-2xl bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center mx-auto shadow-2xs">
							<Sparkles class="w-5 h-5" />
						</div>
						<p class="text-xs font-black text-pink-950">No conversation history yet</p>
						<p class="text-[11px] text-pink-400 max-w-xs mx-auto">
							Send a direct reply to @{feedback.username}. Your response will be delivered live to their ChronoMuse chat.
						</p>
					</div>
				{:else}
					{#each messages as msg, index (msg.id || msg.created_at || index)}
						{@const isAdmin = Number(msg.sender_id) === Number(adminId)}
						<div class="flex flex-col {isAdmin ? 'items-end' : 'items-start'} space-y-1">
							<div class="flex items-center gap-1.5 text-[10px] text-pink-400 font-bold px-1">
								{#if isAdmin}
									<span class="text-[#f43f8e] flex items-center gap-0.5 font-black">
										<ShieldCheck class="w-3 h-3" />
										<span>Admin Support (You)</span>
									</span>
								{:else}
									<span>@{feedback.username}</span>
								{/if}
								{#if msg.created_at}
									<span>• {formatTime(msg.created_at)}</span>
								{/if}
							</div>
							<div class="max-w-[85%] sm:max-w-[80%] rounded-2xl px-3.5 py-2.5 text-xs font-medium leading-relaxed whitespace-pre-wrap shadow-2xs {isAdmin ? 'bg-gradient-to-r from-[#f43f8e] to-[#e0337f] text-white rounded-tr-xs' : 'bg-white border border-pink-200/90 text-pink-950 rounded-tl-xs'}">
								{cleanTicketMessage(msg.message)}
							</div>
						</div>
					{/each}

					<!-- Real-Time User Typing Bubble Indicator -->
					{#if isUserTyping}
						<div class="flex flex-col items-start space-y-1 animate-fade-in">
							<div class="text-[10px] text-pink-400 font-bold px-1 flex items-center gap-1">
								<span>@{feedback.username} is typing</span>
							</div>
							<div class="bg-white border border-pink-200 rounded-2xl rounded-tl-xs px-3.5 py-2.5 shadow-2xs flex items-center space-x-1">
								<span class="w-1.5 h-1.5 rounded-full bg-[#f43f8e] animate-bounce" style="animation-delay: 0ms"></span>
								<span class="w-1.5 h-1.5 rounded-full bg-[#f43f8e] animate-bounce" style="animation-delay: 150ms"></span>
								<span class="w-1.5 h-1.5 rounded-full bg-[#f43f8e] animate-bounce" style="animation-delay: 300ms"></span>
							</div>
						</div>
					{/if}
				{/if}
			</div>

			<!-- Quick Canned Response Pills -->
			{#if feedback.user_id}
				<div class="p-2 border-t border-pink-100 bg-pink-50/40 overflow-x-auto flex items-center gap-1.5 flex-shrink-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
					<span class="text-[10px] font-black text-pink-400 uppercase tracking-wider pl-1 whitespace-nowrap">
						Canned:
					</span>
					{#each quickResponses as quick}
						{@const IconComponent = quick.icon}
						<button
							type="button"
							onclick={() => {
								playClickSound();
								messageText = quick.text;
							}}
							class="px-2.5 py-1 bg-white hover:bg-pink-50 text-[#f43f8e] border border-pink-200/90 rounded-full text-[10px] font-bold whitespace-nowrap transition-colors cursor-pointer shadow-3xs active:scale-95 inline-flex items-center gap-1"
						>
							<IconComponent class="w-3 h-3 text-[#f43f8e] flex-shrink-0" />
							<span>{quick.label}</span>
						</button>
					{/each}
				</div>
			{/if}

			<!-- Message Input Area -->
			<div class="p-3 bg-white border-t border-pink-100 space-y-2 flex-shrink-0">
				{#if feedback.user_id}
					<form onsubmit={handleSendMessage} class="flex items-center gap-2">
						<input
							type="text"
							bind:value={messageText}
							oninput={handleInputTyping}
							onkeydown={handleKeyDown}
							placeholder="Type official reply to @{feedback.username}..."
							disabled={isSending}
							class="flex-1 px-3.5 py-2.5 bg-pink-50/50 border border-pink-200 rounded-full text-xs font-medium text-pink-950 placeholder:text-pink-400 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/30 focus:bg-white transition-all shadow-inner"
						/>

						<button
							type="submit"
							disabled={!messageText.trim() || isSending}
							class="px-4 py-2.5 bg-[#f43f8e] hover:bg-[#e0337f] disabled:opacity-50 text-white rounded-full text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 flex-shrink-0"
						>
							{#if isSending}
								<div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
								<span>Sending</span>
							{:else}
								<Send class="w-3.5 h-3.5" />
								<span>Reply</span>
							{/if}
						</button>
					</form>

					<div class="flex items-center justify-between text-[11px] px-1 text-pink-500 font-bold">
						<label class="flex items-center gap-1.5 cursor-pointer select-none">
							<input
								type="checkbox"
								bind:checked={resolveOnSend}
								class="rounded text-[#f43f8e] focus:ring-[#f43f8e] accent-[#f43f8e]"
							/>
							<span>Mark concern as Resolved upon sending</span>
						</label>

						<span class="text-[10px] text-pink-400 hidden sm:inline">Press Enter to send</span>
					</div>
				{:else}
					<!-- Anonymous Report Actions -->
					<div class="flex items-center justify-between">
						<span class="text-xs text-pink-400 font-bold">Anonymous report (No user chat channel)</span>
						<button
							type="button"
							onclick={() => {
								playClickSound();
								onFeedbackUpdated(feedback.id, feedback.status === 'new' ? 'resolved' : 'new');
								onClose();
							}}
							class="px-4 py-2 bg-[#f43f8e] text-white rounded-full text-xs font-black hover:bg-[#e0337f] transition-all cursor-pointer shadow-xs active:scale-95"
						>
							{feedback.status === 'new' ? 'Mark Resolved' : 'Reopen Report'}
						</button>
					</div>
				{/if}
			</div>

		</div>
	</div>
{/if}
