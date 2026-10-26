<script>
	import { toast } from '$lib/toastService.js';
	import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-svelte';

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
			class="pointer-events-auto px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full border backdrop-blur-md flex items-center gap-2.5 shadow-lg select-none transition-all duration-200 transform animate-fade-in
			{toastState.type === 'error'
				? 'bg-gradient-to-r from-rose-500 via-rose-600 to-red-600 border-white/25 text-white shadow-rose-500/25'
				: toastState.type === 'warning'
				? 'bg-gradient-to-r from-amber-500 via-orange-500 to-pink-500 border-white/25 text-white shadow-amber-500/25'
				: toastState.type === 'info'
				? 'bg-gradient-to-r from-[#ff3e88] to-pink-400 border-white/25 text-white shadow-pink-500/25'
				: 'bg-gradient-to-r from-[#ff3e88] via-[#f43f8e] to-pink-500 border-white/25 text-white shadow-pink-500/25'}"
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

			<!-- Dismiss Button -->
			<button
				type="button"
				onclick={() => toast.dismiss()}
				aria-label="Dismiss toast"
				class="p-0.5 -mr-1 rounded-full text-white/80 hover:text-white hover:bg-white/20 active:scale-90 transition-all cursor-pointer flex-shrink-0"
			>
				<X class="w-3.5 h-3.5" strokeWidth={2.5} />
			</button>
		</div>
	</div>
{/if}
