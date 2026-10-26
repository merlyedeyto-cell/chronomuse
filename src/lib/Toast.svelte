<script>
	import { toast } from '$lib/toastService.js';
	import { CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-svelte';

	// Svelte 5 store auto-subscription
	let toastState = $derived($toast);
</script>

{#if toastState.visible}
	<div
		class="fixed top-3 sm:top-5 left-1/2 -translate-x-1/2 z-[100] pointer-events-none max-w-[92vw] sm:max-w-md w-fit transition-all duration-300 ease-out"
		role="status"
		aria-live="polite"
	>
		<div
			class="pointer-events-auto px-4 py-1.5 sm:py-2 rounded-full border flex items-center gap-2.5 shadow-md select-none transition-all duration-200 transform animate-fade-in
			{toastState.type === 'error'
				? 'bg-[#e11d48] border-rose-400/30 text-white shadow-rose-600/20'
				: toastState.type === 'warning'
				? 'bg-[#d97706] border-amber-400/30 text-white shadow-amber-600/20'
				: toastState.type === 'info'
				? 'bg-[#ff4fae] border-pink-300/40 text-white shadow-pink-500/20'
				: 'bg-[#ff4fae] border-pink-300/40 text-white shadow-pink-500/20'}"
		>
			<!-- Icon -->
			{#if toastState.type === 'error'}
				<AlertCircle class="w-4 h-4 text-white flex-shrink-0" strokeWidth={2.5} />
			{:else}
				{#if toastState.type === 'warning'}
					<AlertTriangle class="w-4 h-4 text-white flex-shrink-0" strokeWidth={2.5} />
				{:else}
					{#if toastState.type === 'info'}
						<Info class="w-4 h-4 text-white flex-shrink-0" strokeWidth={2.5} />
					{:else}
						<CheckCircle2 class="w-4 h-4 text-white flex-shrink-0" strokeWidth={2.5} />
					{/if}
				{/if}
			{/if}

			<!-- Message -->
			<span class="text-xs sm:text-[13px] font-bold tracking-tight leading-snug line-clamp-2">
				{toastState.message}
			</span>
		</div>
	</div>
{/if}
