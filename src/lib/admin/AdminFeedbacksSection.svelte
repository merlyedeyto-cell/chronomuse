<script>
	import AdminChatModal from '$lib/admin/AdminChatModal.svelte';
	import {
		Lightbulb, Bug, MessageSquare, Search, CheckCircle2,
		Clock, Trash2, MessageCircle, Filter, Sparkles, ShieldCheck
	} from 'lucide-svelte';
	import { playClickSound } from '$lib/soundEffects.js';

	let {
		feedbacks = [],
		isLoading = false,
		adminPasscode = '041205',
		onUpdateStatus = () => {},
		onDeleteFeedback = () => {}
	} = $props();

	let searchQuery = $state('');
	let activeTab = $state('all'); // 'all' | 'unread' | 'concerns' | 'suggestions' | 'bugs' | 'resolved'
	let categoryStatusFilter = $state('all'); // 'all' | 'new' | 'resolved'
	let activeChatFeedback = $state(null);
	let isChatModalOpen = $state(false);

	let tabs = $derived([
		{ id: 'all', label: 'All', count: feedbacks.length },
		{ id: 'unread', label: 'Unread', count: feedbacks.filter(f => f.status === 'new').length },
		{ id: 'concerns', label: 'Concerns', count: feedbacks.filter(f => f.category === 'help').length },
		{ id: 'suggestions', label: 'Suggestions', count: feedbacks.filter(f => f.category === 'suggestion').length },
		{ id: 'bugs', label: 'Bugs', count: feedbacks.filter(f => f.category === 'bug').length },
		{ id: 'resolved', label: 'Resolved', count: feedbacks.filter(f => f.status === 'resolved').length }
	]);

	let filteredFeedbacks = $derived.by(() => {
		return feedbacks.filter(item => {
			if (activeTab === 'unread' && item.status !== 'new') return false;
			if (activeTab === 'resolved' && item.status !== 'resolved') return false;
			if (activeTab === 'concerns') {
				if (item.category !== 'help') return false;
				if (categoryStatusFilter !== 'all' && item.status !== categoryStatusFilter) return false;
			}
			if (activeTab === 'suggestions') {
				if (item.category !== 'suggestion') return false;
				if (categoryStatusFilter !== 'all' && item.status !== categoryStatusFilter) return false;
			}
			if (activeTab === 'bugs') {
				if (item.category !== 'bug') return false;
				if (categoryStatusFilter !== 'all' && item.status !== categoryStatusFilter) return false;
			}

			// Search query
			const q = searchQuery.trim().toLowerCase();
			if (!q) return true;
			return (
				(item.username && item.username.toLowerCase().includes(q)) ||
				(item.title && item.title.toLowerCase().includes(q)) ||
				(item.message && item.message.toLowerCase().includes(q)) ||
				(item.email && item.email.toLowerCase().includes(q)) ||
				String(item.user_id).includes(q)
			);
		});
	});

	function formatDate(isoStr) {
		if (!isoStr) return '—';
		try {
			const d = new Date(isoStr);
			return d.toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch (e) {
			return isoStr;
		}
	}

	function formatTimeAgo(isoStr) {
		if (!isoStr) return '—';
		try {
			const diffMs = Date.now() - new Date(isoStr).getTime();
			const diffMins = Math.floor(diffMs / 60000);
			if (diffMins < 2) return 'Just now';
			if (diffMins < 60) return `${diffMins}m ago`;
			const diffHours = Math.floor(diffMins / 60);
			if (diffHours < 24) return `${diffHours}h ago`;
			const diffDays = Math.floor(diffHours / 24);
			return `${diffDays}d ago`;
		} catch (e) {
			return '—';
		}
	}

	function handleOpenChat(item) {
		activeChatFeedback = item;
		isChatModalOpen = true;
	}
</script>

<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 shadow-[0_4px_20px_rgba(244,114,182,0.08)] rounded-2xl sm:rounded-3xl p-4 sm:p-5 space-y-4">
	<!-- Section Header -->
	<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
		<div>
			<div class="flex items-center gap-2">
				<h2 class="text-base font-black text-pink-950">User Concerns & Suggestions ({filteredFeedbacks.length})</h2>
				{#if feedbacks.filter(f => f.status === 'new').length > 0}
					<span class="px-2 py-0.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-full text-[10px] font-black animate-pulse">
						{feedbacks.filter(f => f.status === 'new').length} New
					</span>
				{/if}
			</div>
			<p class="text-xs text-pink-400 font-bold">Review incoming feedback, bug reports, and user concerns submitted via "Need Help or Suggestions?"</p>
		</div>

		<!-- Search Input -->
		<div class="relative w-full sm:w-72">
			<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-pink-400">
				<Search class="w-3.5 h-3.5" strokeWidth={2} />
			</div>
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search concern, title, user..."
				class="w-full pl-8 pr-3 py-2 bg-pink-50/60 border border-pink-200/80 rounded-xl text-xs font-bold text-pink-950 placeholder:text-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:bg-white transition-all shadow-inner"
			/>
		</div>
	</div>

	<!-- Filter Tabs Bar (Instagram / Modern Pill Style) -->
	<div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 pt-1 border-t border-pink-100/60">
		<!-- Pill Tabs Bar -->
		<div class="inline-flex items-center gap-1 p-1 bg-[#fff0f5] border border-pink-200/60 rounded-full shadow-2xs overflow-x-auto max-w-full">
			{#each tabs as tab (tab.id)}
				<button
					type="button"
					onclick={() => {
						activeTab = tab.id;
						categoryStatusFilter = 'all';
					}}
					class="px-4 sm:px-5 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap {activeTab === tab.id ? 'bg-[#f43f8e] text-white shadow-sm' : 'text-[#f43f8e] hover:bg-pink-100/50'}"
				>
					<span>{tab.label}</span>
					<span class="px-2 py-0.5 rounded-full text-[11px] font-black transition-colors {activeTab === tab.id ? 'bg-white/25 text-white' : 'bg-pink-100/80 text-[#f43f8e]'}">
						{tab.count}
					</span>
				</button>
			{/each}
		</div>

		<!-- Optional Sub-status filter when inside a category tab -->
		{#if ['concerns', 'suggestions', 'bugs'].includes(activeTab)}
			<div class="inline-flex items-center gap-1 p-1 bg-[#fff0f5] border border-pink-200/60 rounded-full text-xs font-bold self-start lg:self-auto">
				<span class="text-pink-400 pl-2.5 pr-1 text-[11px] font-black flex items-center gap-1">
					<Filter class="w-3 h-3" />
					<span>Status:</span>
				</span>
				<button
					type="button"
					onclick={() => categoryStatusFilter = 'all'}
					class="px-3 py-1 rounded-full text-[11px] font-black transition-all cursor-pointer {categoryStatusFilter === 'all' ? 'bg-[#f43f8e] text-white shadow-2xs' : 'text-[#f43f8e] hover:bg-pink-100/50'}"
				>
					All
				</button>
				<button
					type="button"
					onclick={() => categoryStatusFilter = 'new'}
					class="px-3 py-1 rounded-full text-[11px] font-black transition-all cursor-pointer {categoryStatusFilter === 'new' ? 'bg-[#f43f8e] text-white shadow-2xs' : 'text-[#f43f8e] hover:bg-pink-100/50'}"
				>
					New
				</button>
				<button
					type="button"
					onclick={() => categoryStatusFilter = 'resolved'}
					class="px-3 py-1 rounded-full text-[11px] font-black transition-all cursor-pointer {categoryStatusFilter === 'resolved' ? 'bg-[#f43f8e] text-white shadow-2xs' : 'text-[#f43f8e] hover:bg-pink-100/50'}"
				>
					Resolved
				</button>
			</div>
		{/if}
	</div>

	<!-- Feedbacks List / Table -->
	{#if isLoading && feedbacks.length === 0}
		<div class="py-12 text-center text-pink-400 font-medium">
			<div class="inline-flex items-center gap-2">
				<div class="animate-spin h-4 w-4 border-2 border-pink-200 border-t-[#f43f8e] rounded-full"></div>
				<span>Loading user concerns and suggestions...</span>
			</div>
		</div>
	{:else if filteredFeedbacks.length === 0}
		<div class="py-12 text-center bg-pink-50/30 rounded-2xl border border-pink-100/60 space-y-2">
			<div class="w-10 h-10 rounded-2xl bg-pink-50 border border-pink-100 text-pink-400 flex items-center justify-center mx-auto shadow-2xs">
				<Sparkles class="w-5 h-5" />
			</div>
			<p class="text-xs font-bold text-pink-900">No concerns or suggestions match the selected filters.</p>
			<p class="text-[11px] text-pink-400">When users submit via "Need Help or Suggestions?", they will appear here live.</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each filteredFeedbacks as item (item.id)}
				<div class="p-3.5 sm:p-4 rounded-2xl border transition-all {item.status === 'new' ? 'bg-white border-pink-200 shadow-sm hover:border-[#f43f8e]/50' : 'bg-pink-50/30 border-pink-100/80 opacity-90 hover:opacity-100'}">
					<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 pb-2.5 border-b border-pink-100/70">
						<!-- User info & Category badge -->
						<div class="flex items-center gap-2.5 flex-wrap min-w-0">
							<div class="w-7 h-7 rounded-full bg-pink-100 text-[#f43f8e] font-black flex items-center justify-center overflow-hidden flex-shrink-0 text-xs border border-pink-200 shadow-2xs">
								{#if item.avatar_url}
									<img src={item.avatar_url} alt="" class="w-full h-full object-cover" />
								{:else}
									{item.username?.charAt(0).toUpperCase() || 'U'}
								{/if}
							</div>

							<div>
								<span class="text-xs font-black text-pink-950 block">@{item.username}</span>
								{#if item.email}
									<span class="text-[10px] text-pink-400 font-mono font-medium">{item.email}</span>
								{/if}
							</div>

							<!-- Category Tag -->
							{#if item.category === 'bug'}
								<span class="px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-black rounded-md flex items-center gap-1 shadow-3xs">
									<Bug class="w-3 h-3 text-rose-500" />
									<span>Bug Report</span>
								</span>
							{:else if item.category === 'help'}
								<span class="px-2 py-0.5 bg-purple-50 border border-purple-200 text-purple-700 text-[10px] font-black rounded-md flex items-center gap-1 shadow-3xs">
									<MessageSquare class="w-3 h-3 text-purple-500" />
									<span>Concern / Help</span>
								</span>
							{:else}
								<span class="px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-black rounded-md flex items-center gap-1 shadow-3xs">
									<Lightbulb class="w-3 h-3 text-amber-500" />
									<span>Suggestion</span>
								</span>
							{/if}

							<!-- Status Tag -->
							{#if item.status === 'new'}
								<span class="px-2 py-0.5 bg-amber-100/80 border border-amber-200 text-amber-800 text-[10px] font-extrabold rounded-full flex items-center gap-1 shadow-3xs">
									<span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
									<span>New</span>
								</span>
							{:else}
								<span class="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-extrabold rounded-full flex items-center gap-1 shadow-3xs">
									<CheckCircle2 class="w-3 h-3 text-emerald-500" />
									<span>Resolved</span>
								</span>
							{/if}
						</div>

						<!-- Time & Actions -->
						<div class="flex items-center gap-2 self-end sm:self-auto flex-wrap">
							<span class="text-[11px] text-pink-400 font-medium inline-flex items-center gap-1" title={formatDate(item.created_at)}>
								<Clock class="w-3 h-3 text-pink-300" />
								<span>{formatTimeAgo(item.created_at)}</span>
							</span>

							<!-- Chat with User button -->
							<button
								type="button"
								onclick={() => {
									playClickSound();
									handleOpenChat(item);
								}}
								title="Open real-time support chat with user"
								class="px-2.5 py-1 bg-[#f43f8e] hover:bg-[#e0337f] text-white text-[11px] font-black rounded-lg shadow-2xs transition-all flex items-center gap-1 cursor-pointer active:scale-95"
							>
								<MessageCircle class="w-3 h-3" />
								<span>Live Chat</span>
							</button>

							<!-- Toggle Status Button -->
							<button
								type="button"
								onclick={() => onUpdateStatus(item.id, item.status === 'new' ? 'resolved' : 'new')}
								class="px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer active:scale-95 {item.status === 'new' ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-pink-50 hover:bg-pink-100 text-pink-700 border-pink-200'}"
							>
								{item.status === 'new' ? 'Mark Resolved' : 'Reopen'}
							</button>

							<!-- Delete button -->
							<button
								type="button"
								onclick={() => onDeleteFeedback(item.id)}
								title="Delete this record"
								class="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
							>
								<Trash2 class="w-3.5 h-3.5" />
							</button>
						</div>
					</div>

					<!-- Content Body -->
					<div class="pt-2.5 space-y-1">
						<h4 class="text-xs sm:text-sm font-black text-pink-950 flex items-center gap-1.5">
							<span>{item.title}</span>
						</h4>
						<p class="text-xs text-pink-900/90 leading-relaxed font-medium bg-pink-50/40 p-2.5 rounded-xl border border-pink-100/70 whitespace-pre-wrap">
							{item.message}
						</p>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Admin Direct Chat Modal -->
<AdminChatModal
	isOpen={isChatModalOpen}
	feedback={activeChatFeedback}
	{adminPasscode}
	onClose={() => {
		isChatModalOpen = false;
		activeChatFeedback = null;
	}}
	onFeedbackUpdated={(feedbackId, newStatus) => {
		onUpdateStatus(feedbackId, newStatus);
		if (activeChatFeedback && activeChatFeedback.id === feedbackId) {
			activeChatFeedback.status = newStatus;
		}
	}}
/>
