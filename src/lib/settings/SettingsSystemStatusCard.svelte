<script>
	import { ShieldCheck } from 'lucide-svelte';

	let { onReportFeedback = () => {} } = $props();
</script>

<div class="bg-white rounded-2xl p-4 border border-pink-100/90 shadow-xs space-y-3.5">
	<div class="flex items-center justify-between">
		<span class="text-[11px] font-black text-pink-950 uppercase tracking-wider">
			System Status
		</span>
		<span class="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
			Online & Synced
		</span>
	</div>

	<div class="grid grid-cols-2 gap-2 text-[11px]">
		<div class="p-2.5 rounded-xl bg-pink-50/40 border border-pink-100/80 space-y-0.5">
			<p class="text-[10px] text-pink-400 font-bold uppercase tracking-wider">ChronoMuse</p>
			<p class="text-xs font-black text-pink-950">v1.0.4 Release</p>
		</div>
		<div class="p-2.5 rounded-xl bg-pink-50/40 border border-pink-100/80 space-y-0.5">
			<p class="text-[10px] text-pink-400 font-bold uppercase tracking-wider">Encryption</p>
			<p class="text-xs font-black text-pink-950 flex items-center space-x-1">
				<ShieldCheck class="w-3.5 h-3.5 text-pink-500 inline mr-0.5" />
				<span>Secured</span>
			</p>
		</div>
	</div>

	<!-- Cute App Affirmation Quote -->
	<div class="p-2.5 bg-pink-50/30 rounded-xl border border-pink-100/80 text-center">
		<p class="text-[11px] text-pink-600 font-bold italic leading-snug">
			"Capture each day's emotions, cherish each memory."
		</p>
	</div>

	<!-- Quick Feedback button without icon -->
	<button
		type="button"
		onclick={onReportFeedback}
		class="w-full py-2 px-3 bg-pink-50/60 hover:bg-pink-100/80 text-pink-700 hover:text-pink-900 border border-pink-200/80 rounded-xl font-bold text-xs transition-all flex items-center justify-center cursor-pointer shadow-3xs active:scale-95"
	>
		<span>Need Help or Suggestions?</span>
	</button>
</div>
