<script>
	import { Volume2, VolumeX, Music, BellRing } from 'lucide-svelte';
	import { playClickSound } from '$lib/soundEffects.js';

	let { soundEffectsEnabled, onToggleSound } = $props();

	function testFeedbackAudio() {
		playClickSound();
	}
</script>

<div class="space-y-3.5 animate-fade-in">
	<!-- Audio Setting Master Card -->
	<div class="bg-white rounded-xl border border-pink-100 overflow-hidden shadow-2xs">
		<div class="p-3.5 sm:p-4 flex items-center justify-between gap-3.5 hover:bg-pink-50/20 transition-colors">
			<div class="flex items-center space-x-3 min-w-0 flex-1">
				<div class="w-9 h-9 rounded-lg bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 text-[#f43f8e]">
					{#if soundEffectsEnabled}
						<Volume2 class="w-4 h-4" />
					{:else}
						<VolumeX class="w-4 h-4 text-pink-300" />
					{/if}
				</div>
				<div class="space-y-0.5 min-w-0 flex-1">
					<h4 class="text-xs sm:text-sm font-extrabold text-pink-950">Touch Sound Effects & Haptics</h4>
					<p class="text-[11px] text-pink-400 font-medium leading-relaxed">
						Play subtle sound feedback effects whenever you tap buttons, switch tabs, and interact with the UI.
					</p>
				</div>
			</div>

			<div class="flex items-center flex-shrink-0">
				<label class="relative inline-flex items-center cursor-pointer select-none">
					<input
						type="checkbox"
						checked={soundEffectsEnabled}
						onchange={onToggleSound}
						class="sr-only peer"
					/>
					<div class="w-10 h-6 bg-pink-200 peer-focus:outline-none rounded-full peer peer-checked:bg-[#f43f8e] transition-colors duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:shadow-sm after:transition-all after:duration-200 peer-checked:after:translate-x-4"></div>
				</label>
			</div>
		</div>
	</div>

	<!-- Sound preview banner -->
	<div class="p-3.5 bg-gradient-to-r from-pink-50/80 via-white to-pink-50/40 rounded-xl border border-pink-100/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
		<div class="flex items-center space-x-2.5">
			<div class="w-8 h-8 rounded-lg bg-white border border-pink-100 text-[#f43f8e] flex items-center justify-center shadow-2xs flex-shrink-0">
				<Music class="w-4 h-4" />
			</div>
			<div>
				<h5 class="text-xs font-bold text-pink-950">Test Touch Sound Tone</h5>
				<p class="text-[11px] text-pink-400 font-medium">Click to preview the current audio feedback</p>
			</div>
		</div>

		<button
			type="button"
			onclick={testFeedbackAudio}
			class="w-full sm:w-auto px-3.5 py-1.5 bg-white hover:bg-pink-50 text-[#f43f8e] border border-pink-200 font-black text-xs rounded-lg shadow-2xs transition-all active:scale-95 cursor-pointer flex items-center justify-center space-x-1.5"
		>
			<BellRing class="w-3.5 h-3.5" />
			<span>Play Sample Tone</span>
		</button>
	</div>
</div>
