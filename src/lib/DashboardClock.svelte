<script>
	import { onMount, onDestroy } from 'svelte';
	import { Clock } from 'lucide-svelte';

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

	// Rotational angles for analog hands
	let secondAngle = $derived.by(() => {
		const s = currentTime.getSeconds();
		return s * 6; // 360 / 60 = 6 deg per sec
	});

	let minuteAngle = $derived.by(() => {
		const m = currentTime.getMinutes();
		const s = currentTime.getSeconds();
		return m * 6 + s * 0.1; // 360 / 60 = 6 deg per min
	});

	let hourAngle = $derived.by(() => {
		const h = currentTime.getHours() % 12;
		const m = currentTime.getMinutes();
		return h * 30 + m * 0.5; // 360 / 12 = 30 deg per hr
	});

	function getFormattedDigitalTime(date) {
		let hours = date.getHours();
		const minutes = String(date.getMinutes()).padStart(2, '0');
		const seconds = String(date.getSeconds()).padStart(2, '0');
		const ampm = hours >= 12 ? 'PM' : 'AM';
		hours = hours % 12;
		hours = hours ? hours : 12;
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

	let dt = $derived(getFormattedDigitalTime(currentTime));
	let formattedDate = $derived(getFormattedDate(currentTime));
	let greeting = $derived(getGreeting(currentTime));

	// 12 hour ticks
	const hourTicks = Array.from({ length: 12 }, (_, i) => i);
</script>

<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-[0_4px_20px_rgba(244,114,182,0.08)] font-sans transition-all">
	<!-- Header / Greeting Row -->
	<div class="flex items-center justify-between mb-3 border-b border-pink-50 pb-2">
		<div class="flex items-center space-x-1.5">
			<div class="w-6 h-6 rounded-lg bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center shadow-2xs">
				<Clock class="w-3.5 h-3.5" />
			</div>
			<span class="text-xs font-black text-pink-950">{greeting}</span>
		</div>
	</div>

	<!-- Analog Clock Widget Dial Container -->
	<div class="flex flex-col items-center justify-center pt-1 pb-1">
		<!-- Minimalist Analog Clock Dial -->
		<div class="relative w-32 h-32 sm:w-36 sm:h-36 rounded-full bg-gradient-to-br from-white via-pink-50/40 to-pink-100/30 flex items-center justify-center select-none shadow-[inset_0_2px_8px_rgba(244,114,182,0.06)]">
			<!-- 12 Hour Capsule Ticks -->
			{#each hourTicks as tick}
				{@const tickAngle = tick * 30}
				<div
					class="absolute top-1.5 bottom-1.5 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none"
					style="transform: rotate({tickAngle}deg);"
				>
					<div class="w-1 h-3 sm:h-3.5 bg-pink-950 rounded-full"></div>
				</div>
			{/each}

			<!-- Hour Hand -->
			<div
				class="absolute bottom-1/2 left-1/2 -translate-x-1/2 w-1.5 h-8 sm:h-9 rounded-full bg-pink-950 origin-bottom pointer-events-none z-10"
				style="transform: translateX(-50%) rotate({hourAngle}deg); transition: transform 0.2s cubic-bezier(0.4, 2.08, 0.55, 0.44);"
			></div>

			<!-- Minute Hand -->
			<div
				class="absolute bottom-1/2 left-1/2 -translate-x-1/2 w-1 h-11 sm:h-13 rounded-full bg-pink-950 origin-bottom pointer-events-none z-10"
				style="transform: translateX(-50%) rotate({minuteAngle}deg); transition: transform 0.2s cubic-bezier(0.4, 2.08, 0.55, 0.44);"
			></div>

			<!-- Second Hand (Classic Full-Length Hand) -->
			<div
				class="absolute bottom-1/2 left-1/2 -translate-x-1/2 w-0.5 h-[55px] sm:h-[62px] bg-[#f43f8e] rounded-full origin-bottom pointer-events-none z-10"
				style="transform: translateX(-50%) rotate({secondAngle}deg); transition: transform 0.15s cubic-bezier(0.18, 0.89, 0.32, 1.28);"
			>
				<!-- Tail counterbalance of second hand -->
				<div class="absolute -bottom-3 sm:-bottom-3.5 left-1/2 -translate-x-1/2 w-0.5 h-3 sm:h-3.5 bg-[#f43f8e] rounded-full"></div>
			</div>

			<!-- Center Pivot Pin Dot -->
			<div class="absolute w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-pink-950 ring-2 ring-white z-20 pointer-events-none shadow-xs"></div>
		</div>

		<!-- Digital Time & Date Below Analog Clock (Without borders on badges) -->
		<div class="mt-3 flex flex-col items-center text-center space-y-1.5 w-full">
			<!-- Digital Time Pill (No border) -->
			<div class="inline-flex items-center gap-1.5 px-3 py-1 bg-pink-50/80 rounded-full font-mono">
				<span class="text-xs font-black text-pink-950 tracking-wider">
					{dt.hours}:{dt.minutes}:{dt.seconds}
				</span>
				<span class="text-[8.5px] font-black text-[#f43f8e] uppercase px-1.5 py-0.5 bg-white/90 rounded-md">
					{dt.ampm}
				</span>
			</div>

			<!-- Full Date Display below Clock (No border, clean text) -->
			<div class="inline-flex items-center text-[10.5px] sm:text-[11px] text-pink-900 font-bold bg-pink-50/70 px-2.5 py-1 rounded-xl">
				<span>{formattedDate}</span>
			</div>
		</div>
	</div>
</div>
