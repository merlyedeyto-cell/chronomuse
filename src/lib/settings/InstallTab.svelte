<script>
	import { CheckCircle2, ExternalLink, Download, Maximize2, Zap, ShieldCheck } from 'lucide-svelte';

	let { pwaStatus, installGuideMessage, onInstallApp } = $props();
</script>

<div class="space-y-4 animate-fade-in">
	<!-- Hero App Banner Card -->
	<div class="p-4 sm:p-5 bg-gradient-to-br from-pink-50/80 via-white to-pink-50/40 rounded-2xl border border-pink-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
		<div class="flex items-start space-x-3.5">
			<img src="/logo.png" alt="ChronoMuse" class="w-12 h-12 rounded-2xl bg-black p-1.5 object-contain flex-shrink-0 shadow-xs ring-2 ring-pink-100" />
			<div class="space-y-1">
				<div class="flex items-center space-x-2">
					<h3 class="text-sm sm:text-base font-extrabold text-pink-950">ChronoMuse Desktop & Mobile App</h3>
					<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-pink-100 text-[#f43f8e] border border-pink-200">
						PWA Ready
					</span>
				</div>
				<p class="text-xs text-pink-500 font-medium leading-relaxed max-w-xl">
					Install ChronoMuse on your device for instant offline access, ultra-smooth full-screen mood tracking, and zero latency.
				</p>
			</div>
		</div>

		<div class="w-full sm:w-auto flex-shrink-0">
			{#if pwaStatus.isStandalone}
				<div class="w-full sm:w-auto py-2 px-4 bg-emerald-50 text-emerald-600 border border-emerald-200 font-extrabold text-xs rounded-xl flex items-center justify-center space-x-1.5 shadow-2xs">
					<CheckCircle2 class="w-4 h-4" strokeWidth={2.5} />
					<span>App Installed & Active</span>
				</div>
			{:else if pwaStatus.isAppInstalled}
				<button
					type="button"
					onclick={onInstallApp}
					class="w-full sm:w-auto py-2.5 px-5 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center space-x-2 active:scale-95 cursor-pointer"
				>
					<ExternalLink class="w-4 h-4" strokeWidth={2.5} />
					<span>Open ChronoMuse App</span>
				</button>
			{:else}
				<button
					type="button"
					onclick={onInstallApp}
					class="w-full sm:w-auto py-2.5 px-5 bg-[#f43f8e] hover:bg-[#e0337f] text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 active:scale-95 cursor-pointer"
				>
					<Download class="w-4 h-4" strokeWidth={2.5} />
					<span>Install App Now</span>
				</button>
			{/if}
		</div>
	</div>

	<!-- Feature Highlights Grid -->
	<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
		<div class="p-3.5 bg-white rounded-xl border border-pink-100/90 shadow-2xs flex items-start space-x-3">
			<div class="w-7 h-7 rounded-lg bg-pink-50 text-[#f43f8e] flex items-center justify-center flex-shrink-0 mt-0.5">
				<Zap class="w-3.5 h-3.5" />
			</div>
			<div class="min-w-0 space-y-1">
				<h4 class="text-xs font-black text-pink-950">Fast & Native Feel</h4>
				<p class="text-[11px] text-pink-400 font-medium leading-normal">
					Lightning-fast loading directly from your desktop dock or home screen.
				</p>
			</div>
		</div>

		<div class="p-3.5 bg-white rounded-xl border border-pink-100/90 shadow-2xs flex items-start space-x-3">
			<div class="w-7 h-7 rounded-lg bg-pink-50 text-[#f43f8e] flex items-center justify-center flex-shrink-0 mt-0.5">
				<Maximize2 class="w-3.5 h-3.5" />
			</div>
			<div class="min-w-0 space-y-1">
				<h4 class="text-xs font-black text-pink-950">Full-Screen Focus</h4>
				<p class="text-[11px] text-pink-400 font-medium leading-normal">
					Distraction-free environment without browser toolbars or URL bars.
				</p>
			</div>
		</div>

		<div class="p-3.5 bg-white rounded-xl border border-pink-100/90 shadow-2xs flex items-start space-x-3">
			<div class="w-7 h-7 rounded-lg bg-pink-50 text-[#f43f8e] flex items-center justify-center flex-shrink-0 mt-0.5">
				<ShieldCheck class="w-3.5 h-3.5" />
			</div>
			<div class="min-w-0 space-y-1">
				<h4 class="text-xs font-black text-pink-950">Secure & Offline</h4>
				<p class="text-[11px] text-pink-400 font-medium leading-normal">
					Cached memory entries and safe encrypted local sync capabilities.
				</p>
			</div>
		</div>
	</div>

	{#if installGuideMessage}
		<div class="p-3.5 bg-pink-50/80 rounded-xl border border-pink-200 text-xs font-bold text-pink-800 text-center animate-fade-in shadow-2xs">
			{installGuideMessage}
		</div>
	{/if}
</div>
