<script>
	import { Volume2, VolumeX, Music, BellRing } from 'lucide-svelte';
	import { playClickSound } from '$lib/soundEffects.js';

	let { soundEffectsEnabled, onToggleSound } = $props();

	function testFeedbackAudio() {
		playClickSound();
	}
</script>

<div class="space-y-4 animate-fade-in">
	<!-- Audio Setting Master Card -->
	<div class="p-4 sm:p-5 bg-white border border-pink-100 rounded-2xl flex items-start sm:items-center justify-between gap-4 shadow-xs transition-all hover:border-pink-200">
		<div class="flex items-start space-x-3.5 min-w-0 flex-1">
			<div class="w-10 h-10 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 text-[#f43f8e]">
				{#if soundEffectsEnabled}
					<Volume2 class="w-5 h-5" />
				{:else}
					<VolumeX class="w-5 h-5 text-pink-300" />
				{/if}
			</div>
			<div class="space-y-0.5 min-w-0 flex-1">
				<div class="flex items-center space-x-2">
					<h4 class="text-xs sm:text-sm font-extrabold text-pink-950">Touch Sound Effects & Haptics</h4>
					<span class="text-[10px] font-bold px-2 py-0.2 rounded-full {soundEffectsEnabled ? 'bg-pink-100 text-[#f43f8e] border border-pink-200' : 'bg-slate-50 text-slate-500 border border-slate-200'}">
						{soundEffectsEnabled ? 'Audio Active' : 'Muted'}
					</span>
				</div>
				<p class="text-xs text-pink-400 font-medium leading-relaxed">
					Play subtle sound feedback effects whenever you tap buttons, switch tabs, like memories, and interact with the UI.
				</p>
			</div>
		</div>

		<div class="flex items-center flex-shrink-0 pt-1 sm:pt-0">
			<label class="relative inline-flex items-center cursor-pointer select-none">
				<input
					type="checkbox"
					checked={soundEffectsEnabled}
					onchange={onToggleSound}
					class="sr-only peer"
				/>
				<div class="w-11 h-6 bg-pink-200 peer-focus:outline-none rounded-full peer peer-checked:bg-[#f43f8e] transition-colors duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:shadow-sm after:transition-all after:duration-200 peer-checked:after:translate-x-5"></div>
			</label>
		</div>
	</div>

	<!-- Sound preview & info banner -->
	<div class="p-4 bg-gradient-to-br from-pink-50/60 to-rose-50/40 rounded-2xl border border-pink-100/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
		<div class="flex items-center space-x-3">
			<div class="w-8 h-8 rounded-xl bg-white border border-pink-100 text-[#f43f8e] flex items-center justify-center shadow-2xs flex-shrink-0">
				<Music class="w-4 h-4" />
			</div>
			<div>
				<h5 class="text-xs font-bold text-pink-950">Test Touch Sound Effect</h5>
				<p class="text-[11px] text-pink-400 font-medium">Click the button to preview the UI tap audio tone</p>
			</div>
		</div>

		<button
			type="button"
			onclick={testFeedbackAudio}
			class="w-full sm:w-auto px-4 py-2 bg-white hover:bg-pink-50 text-[#f43f8e] border border-pink-200 font-extrabold text-xs rounded-xl shadow-2xs transition-all active:scale-95 cursor-pointer flex items-center justify-center space-x-1.5"
		>
			<BellRing class="w-3.5 h-3.5" />
			<span>Play Sample Tone</span>
		</button>
	</div>
</div>
