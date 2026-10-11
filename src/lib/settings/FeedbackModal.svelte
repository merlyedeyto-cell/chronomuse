<script>
	import { goto } from '$app/navigation';
	import { X, Lightbulb, Bug, HelpCircle, MessageSquare, Send, CheckCircle2, ChevronDown, MessageCircle, ShieldCheck } from 'lucide-svelte';
	import { playClickSound } from '$lib/soundEffects.js';

	let {
		isOpen = false,
		currentUser = null,
		onClose = () => {},
		onSubmitSuccess = () => {}
	} = $props();

	let activeCategory = $state('suggestion'); // 'suggestion' | 'help' | 'bug' | 'faq'
	let feedbackTitle = $state('');
	let feedbackMessage = $state('');
	let isSubmitting = $state(false);
	let submitted = $state(false);
	let submitFeedbackText = $state('');
	let targetAdminId = $state(12);
	let lastCreatedTicketId = $state(null);

	// FAQ Accordion state
	let expandedFaq = $state(null);

	const faqs = [
		{
			q: 'How does Private Account protection work?',
			a: 'When Private Account is enabled, other users and non-friends cannot view your daily mood entries, photo flashbacks, or monthly statistics.'
		},
		{
			q: 'Can friends see when I am typing in Chat?',
			a: 'You can disable the Live Typing Indicator in Settings > Privacy at any time to type privately without the bubble indicator.'
		},
		{
			q: 'How do I install ChronoMuse as a native app?',
			a: 'Go to Settings > Install ChronoMuse App and click Install. On iOS Safari, tap Share > Add to Home Screen.'
		},
		{
			q: 'Where are my uploaded photos and audio stored?',
			a: 'All memory uploads are encrypted and securely stored in your personal account vault on Supabase storage.'
		}
	];

	function handleSelectCategory(cat) {
		playClickSound();
		activeCategory = cat;
	}

	function toggleFaq(index) {
		playClickSound();
		expandedFaq = expandedFaq === index ? null : index;
	}

	async function handleSubmitFeedback(e) {
		e.preventDefault();
		if (!feedbackMessage.trim()) return;

		playClickSound();
		isSubmitting = true;

		try {
			// 1. Submit directly to server / Admin API
			const res = await fetch('/api/feedback', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_id: currentUser?.id || null,
					username: currentUser?.username || 'anonymous',
					email: currentUser?.email || null,
					category: activeCategory,
					title: feedbackTitle.trim() || (activeCategory === 'bug' ? 'Bug Report' : activeCategory === 'help' ? 'User Concern' : 'Feature Suggestion'),
					message: feedbackMessage.trim()
				})
			});

			const data = await res.json().catch(() => ({}));

			// 2. Cache locally for user history
			try {
				const existing = JSON.parse(localStorage.getItem('chronomuse_user_feedbacks') || '[]');
				existing.unshift({
					id: Date.now(),
					userId: currentUser?.id || 'guest',
					username: currentUser?.username || 'anonymous',
					category: activeCategory,
					title: feedbackTitle.trim() || 'General Feedback',
					message: feedbackMessage.trim(),
					timestamp: new Date().toISOString()
				});
				localStorage.setItem('chronomuse_user_feedbacks', JSON.stringify(existing.slice(0, 30)));
			} catch (err) {}

			if (data?.data?.admin_id) {
				targetAdminId = data.data.admin_id;
			}
			if (data?.data?.ticket_id || data?.data?.feedback?.id) {
				lastCreatedTicketId = data.data.ticket_id || data.data.feedback.id;
			}

			isSubmitting = false;
			submitted = true;
			submitFeedbackText = activeCategory === 'bug' 
				? 'Bug report sent to ChronoMuse Support! A support conversation has been opened in your Chat.'
				: activeCategory === 'help'
				? 'Your concern has been forwarded directly to ChronoMuse Support.'
				: 'Suggestion sent to ChronoMuse Support! Thank you for sharing your ideas with us.';

			onSubmitSuccess(submitFeedbackText);
		} catch (err) {
			console.error('Failed submitting feedback:', err);
			isSubmitting = false;
			submitted = true;
			submitFeedbackText = 'Feedback recorded. Thank you!';
		}
	}
</script>

{#if isOpen}
	<div
		class="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-3.5 sm:p-4 animate-fade-in font-sans"
		onclick={(e) => { if (e.target === e.currentTarget && !isSubmitting) onClose(); }}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onkeydown={(e) => { if (e.key === 'Escape' && !isSubmitting) onClose(); }}
	>
		<div class="bg-white border border-pink-100 rounded-3xl max-w-md w-full p-5 sm:p-6 relative overflow-hidden shadow-2xl animate-scale-up space-y-4">
			
			<!-- Modal Header -->
			<div class="flex items-start justify-between">
				<div class="space-y-0.5 min-w-0 pr-3">
					<h3 class="text-base sm:text-lg font-black text-pink-950 tracking-tight">
						Help, Concern & Feedback
					</h3>
					<p class="text-xs text-pink-400 font-medium">
						Send your concerns or suggestions directly to Admin.
					</p>
				</div>

				<button
					type="button"
					onclick={() => { playClickSound(); onClose(); }}
					class="w-8 h-8 rounded-xl bg-pink-50 hover:bg-pink-100 text-pink-400 hover:text-pink-700 flex items-center justify-center transition-all cursor-pointer flex-shrink-0"
					aria-label="Close modal"
				>
					<X class="w-4 h-4" />
				</button>
			</div>

			<!-- Category Tabs -->
			<div class="grid grid-cols-4 gap-1 p-1 bg-pink-50/60 rounded-xl border border-pink-100/70">
				<button
					type="button"
					onclick={() => handleSelectCategory('suggestion')}
					class="py-2 px-1 rounded-lg text-[11px] font-black transition-all flex items-center justify-center space-x-1 cursor-pointer {activeCategory === 'suggestion' ? 'bg-white text-[#f43f8e] shadow-xs' : 'text-pink-600 hover:text-pink-950'}"
				>
					<Lightbulb class="w-3.5 h-3.5 flex-shrink-0" />
					<span class="truncate">Suggest</span>
				</button>

				<button
					type="button"
					onclick={() => handleSelectCategory('help')}
					class="py-2 px-1 rounded-lg text-[11px] font-black transition-all flex items-center justify-center space-x-1 cursor-pointer {activeCategory === 'help' ? 'bg-white text-purple-600 shadow-xs' : 'text-pink-600 hover:text-pink-950'}"
				>
					<MessageSquare class="w-3.5 h-3.5 flex-shrink-0" />
					<span class="truncate">Concern</span>
				</button>

				<button
					type="button"
					onclick={() => handleSelectCategory('bug')}
					class="py-2 px-1 rounded-lg text-[11px] font-black transition-all flex items-center justify-center space-x-1 cursor-pointer {activeCategory === 'bug' ? 'bg-white text-rose-600 shadow-xs' : 'text-pink-600 hover:text-pink-950'}"
				>
					<Bug class="w-3.5 h-3.5 flex-shrink-0" />
					<span class="truncate">Bug</span>
				</button>

				<button
					type="button"
					onclick={() => handleSelectCategory('faq')}
					class="py-2 px-1 rounded-lg text-[11px] font-black transition-all flex items-center justify-center space-x-1 cursor-pointer {activeCategory === 'faq' ? 'bg-white text-[#f43f8e] shadow-xs' : 'text-pink-600 hover:text-pink-950'}"
				>
					<HelpCircle class="w-3.5 h-3.5 flex-shrink-0" />
					<span class="truncate">FAQs</span>
				</button>
			</div>

			<!-- Content Area -->
			{#if submitted}
				<div class="py-6 text-center space-y-3.5 animate-fade-in">
					<div class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 border border-emerald-200 flex items-center justify-center mx-auto shadow-2xs">
						<CheckCircle2 class="w-6 h-6" strokeWidth={2.5} />
					</div>
					<div class="space-y-1">
						<div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-pink-100/70 text-[#f43f8e] text-[10px] font-black uppercase tracking-wider">
							<ShieldCheck class="w-3 h-3" />
							<span>Support Request Logged</span>
						</div>
						<h4 class="text-sm font-black text-pink-950">Message Sent to ChronoMuse Support!</h4>
						<p class="text-xs text-pink-600 font-medium max-w-xs mx-auto leading-relaxed">
							{submitFeedbackText}
						</p>
					</div>

					<div class="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
						{#if currentUser?.id}
							<button
								type="button"
								onclick={() => {
									playClickSound();
									submitted = false;
									feedbackTitle = '';
									feedbackMessage = '';
									onClose();
									const ticketParam = lastCreatedTicketId ? `&ticket_id=${lastCreatedTicketId}` : '';
									goto(`/chat?friend_id=${targetAdminId}&username=chronomuse_support${ticketParam}`);
								}}
								class="w-full sm:w-auto px-4 py-2.5 bg-[#f43f8e] hover:bg-[#e0337f] text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
							>
								<MessageCircle class="w-4 h-4" />
								<span>Open Chat with Support</span>
							</button>
						{/if}
						<button
							type="button"
							onclick={() => {
								playClickSound();
								submitted = false;
								feedbackTitle = '';
								feedbackMessage = '';
								onClose();
							}}
							class="w-full sm:w-auto px-4 py-2.5 bg-pink-50 hover:bg-pink-100 text-pink-700 text-xs font-black rounded-xl transition-all cursor-pointer"
						>
							Done
						</button>
					</div>
				</div>
			{:else if activeCategory === 'faq'}
				<div class="space-y-2 max-h-72 overflow-y-auto pr-1 animate-fade-in">
					{#each faqs as item, idx}
						<div class="bg-pink-50/40 rounded-xl border border-pink-100 overflow-hidden transition-all">
							<button
								type="button"
								onclick={() => toggleFaq(idx)}
								class="w-full p-3 text-left flex items-center justify-between text-xs font-bold text-pink-950 hover:bg-pink-50 transition-colors cursor-pointer"
							>
								<span>{item.q}</span>
								<ChevronDown class="w-3.5 h-3.5 text-pink-400 transition-transform duration-200 {expandedFaq === idx ? 'rotate-180 text-[#f43f8e]' : ''}" />
							</button>
							{#if expandedFaq === idx}
								<div class="px-3 pb-3 pt-0.5 text-[11px] text-pink-600 font-medium leading-relaxed border-t border-pink-100/60 bg-white/60 animate-fade-in">
									{item.a}
								</div>
							{/if}
						</div>
					{/each}

					<!-- Quick link to ask Admin -->
					<div class="p-3 bg-pink-50/70 rounded-xl border border-pink-200/80 text-center space-y-1.5 mt-2">
						<p class="text-xs font-bold text-pink-950">Still need help?</p>
						<p class="text-[11px] text-pink-500">Send your concern or inquiry directly to the Admin console.</p>
						<button
							type="button"
							onclick={() => handleSelectCategory('help')}
							class="mt-1 px-3 py-1.5 bg-[#f43f8e] text-white text-xs font-bold rounded-lg shadow-2xs hover:bg-[#e0337f] transition-all cursor-pointer"
						>
							Ask Admin a Question
						</button>
					</div>
				</div>
			{:else}
				<!-- Feedback Form for Suggestion, Concern/Help, or Bug -->
				<form onsubmit={handleSubmitFeedback} class="space-y-3 animate-fade-in">
					<div>
						<label for="feedback-title" class="block text-xs font-bold text-pink-900 mb-1">
							{activeCategory === 'bug' ? 'Issue Summary' : activeCategory === 'help' ? 'Concern Topic' : 'Idea Title'}
						</label>
						<input
							id="feedback-title"
							type="text"
							bind:value={feedbackTitle}
							placeholder={activeCategory === 'bug' ? 'e.g. Calendar icon not updating' : activeCategory === 'help' ? 'e.g. Need assistance with my memory privacy' : 'e.g. Add weekly mood summary charts'}
							class="w-full px-3.5 py-2.5 bg-pink-50/40 border border-pink-200 rounded-xl text-xs font-bold text-pink-950 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/40 focus:bg-white transition-all"
						/>
					</div>

					<div>
						<label for="feedback-message" class="block text-xs font-bold text-pink-900 mb-1">
							{activeCategory === 'help' ? 'Your Concern / Question' : 'Details'} <span class="text-rose-500">*</span>
						</label>
						<textarea
							id="feedback-message"
							rows="4"
							required
							bind:value={feedbackMessage}
							placeholder={activeCategory === 'bug' ? 'Describe the steps to reproduce the issue...' : activeCategory === 'help' ? 'Type your concern or question here for the Admin to read and assist you...' : 'Share what feature you would love to have in ChronoMuse...'}
							class="w-full px-3.5 py-2.5 bg-pink-50/40 border border-pink-200 rounded-xl text-xs font-medium text-pink-950 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/40 focus:bg-white transition-all resize-none leading-relaxed"
						></textarea>
					</div>

					<div class="pt-1 flex items-center justify-end space-x-2">
						<button
							type="button"
							onclick={() => { playClickSound(); onClose(); }}
							class="py-2.5 px-4 bg-pink-50 hover:bg-pink-100 text-pink-700 text-xs font-black rounded-xl transition-all cursor-pointer"
						>
							Cancel
						</button>

						<button
							type="submit"
							disabled={isSubmitting || !feedbackMessage.trim()}
							class="py-2.5 px-5 bg-[#f43f8e] hover:bg-[#e0337f] text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center space-x-1.5 active:scale-95 disabled:opacity-50 cursor-pointer"
						>
							{#if isSubmitting}
								<div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
								<span>Sending to Admin...</span>
							{:else}
								<Send class="w-3.5 h-3.5" />
								<span>Submit {activeCategory === 'bug' ? 'Report' : activeCategory === 'help' ? 'Concern' : 'Suggestion'}</span>
							{/if}
						</button>
					</div>
				</form>
			{/if}

		</div>
	</div>
{/if}
