<script>
	import { onMount, onDestroy } from 'svelte';

	let currentTime = $state(new Date());
	let timer;

	onMount(() => {
		currentTime = new Date();
		timer = setInterval(() => {
			currentTime = new Date();
		}, 1000);

		return () => {
			if (timer) clearInterval(timer);
		};
	});

	onDestroy(() => {
		if (timer) clearInterval(timer);
	});

	function getFormattedTime(date) {
		let hours = date.getHours();
		const minutes = String(date.getMinutes()).padStart(2, '0');
		const seconds = String(date.getSeconds()).padStart(2, '0');
		const ampm = hours >= 12 ? 'PM' : 'AM';
		hours = hours % 12;
		hours = hours ? hours : 12; // '0' should be '12'
		const formattedHours = String(hours).padStart(2, '0');
		return { hours: formattedHours, minutes, seconds, ampm };
	}

	function getFormattedDate(date) {
		return date.toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function getGreeting(date) {
		const hour = date.getHours();
		if (hour >= 5 && hour < 12) return 'Good Morning';
		if (hour >= 12 && hour < 18) return 'Good Afternoon';
		return 'Good Evening';
	}
</script>

{#snippet timeDisplay()}
	{@const t = getFormattedTime(currentTime)}
	<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(244,114,182,0.08)] font-sans transition-all">
		<!-- Header / Greeting Row -->
		<div class="flex items-center justify-between mb-3 border-b border-pink-50 pb-2.5">
			<div class="flex items-center space-x-1.5">
				<div class="w-6 h-6 rounded-lg bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center shadow-2xs">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
				</div>
				<span class="text-xs font-black text-pink-950">{getGreeting(currentTime)}</span>
			</div>
			<span class="text-[10px] bg-pink-50 text-[#f43f8e] font-extrabold px-2.5 py-0.5 rounded-full border border-pink-200/60 shadow-2xs">
				Live Clock
			</span>
		</div>

		<!-- Clock Display -->
		<div class="bg-gradient-to-br from-[#fff5f8] to-pink-50/70 border border-pink-100 rounded-2xl p-3.5 text-center shadow-inner">
			<div class="flex items-baseline justify-center space-x-1.5 text-pink-950 font-black tabular-nums tracking-tight">
				<span class="text-3xl sm:text-4xl leading-none text-[#f43f8e] drop-shadow-2xs">{t.hours}</span>
				<span class="text-2xl sm:text-3xl leading-none text-pink-300 animate-pulse">:</span>
				<span class="text-3xl sm:text-4xl leading-none text-pink-900 drop-shadow-2xs">{t.minutes}</span>
				<span class="text-2xl sm:text-3xl leading-none text-pink-300 animate-pulse">:</span>
				<span class="text-2xl sm:text-3xl leading-none text-pink-700">{t.seconds}</span>
				<span class="text-xs sm:text-sm font-extrabold uppercase ml-1 px-1.5 py-0.5 rounded-md bg-white border border-pink-200 text-[#f43f8e] shadow-2xs">
					{t.ampm}
				</span>
			</div>
			<p class="text-[11px] sm:text-xs text-pink-400 font-bold mt-2">
				{getFormattedDate(currentTime)}
			</p>
		</div>
	</div>
{/snippet}

{@render timeDisplay()}
