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

	// 12 hour numbers with exact rotational position
	const hourNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
	// 60 minute ticks
	const minuteTicks = Array.from({ length: 60 }, (_, i) => i);
</script>

<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(244,114,182,0.08)] font-sans transition-all">
	<!-- Header / Greeting Row -->
	<div class="flex items-center justify-between mb-3.5 border-b border-pink-50 pb-2.5">
		<div class="flex items-center space-x-1.5">
			<div class="w-6 h-6 rounded-lg bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center shadow-2xs">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-3.5 h-3.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
			</div>
			<span class="text-xs font-black text-pink-950">{getGreeting(currentTime)}</span>
		</div>
		<span class="inline-flex items-center gap-1 text-[10px] bg-pink-50 text-[#f43f8e] font-extrabold px-2.5 py-0.5 rounded-full border border-pink-200/60 shadow-2xs">
			<span class="w-1.5 h-1.5 rounded-full bg-[#f43f8e] animate-ping inline-block"></span>
			<span>Live Clock</span>
		</span>
	</div>

	<!-- Analog Clock Widget Dial Container -->
	<div class="flex flex-col items-center justify-center pt-1 pb-1">
		<!-- Circular Clock Body (Bilog na Analog Clock Widget) -->
		<div class="relative w-40 h-40 sm:w-44 sm:h-44 rounded-full border-4 border-pink-200/90 shadow-[0_10px_28px_rgba(244,114,182,0.22)] bg-gradient-to-br from-white via-[#fff5f8] to-pink-100/70 flex items-center justify-center ring-4 ring-pink-100/60 select-none">
			<!-- Clock Inner Bezel Shadow Ring -->
			<div class="absolute inset-1.5 rounded-full border border-pink-200/50 shadow-inner pointer-events-none"></div>

			<!-- Minute/Second Ticks around dial -->
			{#each minuteTicks as tick}
				{@const tickAngle = tick * 6}
				{#if tick % 5 === 0}
					<!-- 5-minute major tick -->
					<div
						class="absolute w-0.5 h-1.5 bg-pink-300 rounded-full pointer-events-none"
						style="transform: rotate({tickAngle}deg) translateY(-68px);"
					></div>
				{:else}
					<!-- Sub tick -->
					<div
						class="absolute w-0.5 h-0.5 bg-pink-200 rounded-full pointer-events-none"
						style="transform: rotate({tickAngle}deg) translateY(-68px);"
					></div>
				{/if}
			{/each}

			<!-- 12 Hour Numbers (Modern Circular Dial Numbers) -->
			{#each hourNumbers as num}
				{@const numAngle = num * 30}
				<div
					class="absolute font-black pointer-events-none select-none text-center flex items-center justify-center {num % 3 === 0 ? 'text-pink-950 text-xs font-black' : 'text-pink-800/80 text-[10px] font-extrabold'}"
					style="
						transform: rotate({numAngle}deg) translateY(-54px) rotate(-{numAngle}deg);
						width: 16px;
						height: 16px;
					"
				>
					{num}
				</div>
			{/each}

			<!-- Subtle ChronoMuse Brand Accent inside dial -->
			<div class="absolute top-[28%] text-[8px] font-black text-[#f43f8e]/40 uppercase tracking-widest pointer-events-none select-none">
				CHRONOMUSE
			</div>

			<!-- Hour Hand -->
			<div
				class="absolute bottom-1/2 left-1/2 -translate-x-1/2 w-1.5 h-10 sm:h-12 rounded-full bg-gradient-to-t from-pink-950 via-pink-900 to-pink-800 shadow-md origin-bottom pointer-events-none"
				style="transform: translateX(-50%) rotate({hourAngle}deg); transition: transform 0.2s cubic-bezier(0.4, 2.08, 0.55, 0.44);"
			></div>

			<!-- Minute Hand -->
			<div
				class="absolute bottom-1/2 left-1/2 -translate-x-1/2 w-1 sm:w-1.2 h-14 sm:h-16 rounded-full bg-gradient-to-t from-[#f43f8e] via-pink-600 to-pink-500 shadow-md origin-bottom pointer-events-none"
				style="transform: translateX(-50%) rotate({minuteAngle}deg); transition: transform 0.2s cubic-bezier(0.4, 2.08, 0.55, 0.44);"
			></div>

			<!-- Second Hand with Tail Counterweight -->
			<div
				class="absolute bottom-1/2 left-1/2 -translate-x-1/2 w-0.5 h-16 sm:h-19 bg-[#ff1493] rounded-full shadow-xs origin-bottom pointer-events-none"
				style="transform: translateX(-50%) rotate({secondAngle}deg); transition: transform 0.15s cubic-bezier(0.18, 0.89, 0.32, 1.28);"
			>
				<!-- Tail of second hand -->
				<div class="absolute -bottom-3 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-[#ff1493] rounded-full"></div>
			</div>

			<!-- Center Pivot Pin Cap -->
			<div class="absolute w-3 h-3 rounded-full bg-[#f43f8e] border-2 border-white shadow-xs z-20 pointer-events-none"></div>
		</div>

		<!-- Digital Time & Date Below Analog Clock (Inside the Card) -->
		<div class="mt-4 flex flex-col items-center text-center space-y-1.5 w-full">
			<!-- Digital Time Pill -->
			<div class="inline-flex items-center gap-1.5 px-3 py-1 bg-[#fff5f8] border border-pink-200/80 rounded-full shadow-2xs font-mono">
				<span class="text-xs sm:text-sm font-black text-pink-950 tracking-wider">
					{dt.hours}:{dt.minutes}:{dt.seconds}
				</span>
				<span class="text-[9px] font-black text-[#f43f8e] uppercase px-1 py-0.2 bg-white rounded-md border border-pink-200 shadow-2xs">
					{dt.ampm}
				</span>
			</div>

			<!-- Full Date Display below Clock in card -->
			<div class="inline-flex items-center gap-1 text-[11px] sm:text-xs text-pink-700 font-bold bg-pink-50/70 border border-pink-100/90 px-3 py-1 rounded-xl shadow-2xs">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 text-[#f43f8e]">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.253 18.75h18a2.25 2.25 0 002.25-2.25V7.5a2.25 2.25 0 00-2.25-2.25H3.75A2.25 2.25 0 001.5 7.5v11.25c0 1.242 1.008 2.25 2.25 2.25z" />
				</svg>
				<span>{formattedDate}</span>
			</div>
		</div>
	</div>
</div>
