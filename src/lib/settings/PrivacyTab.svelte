<script>
	import { Eye, ShieldAlert, Lock, UserCheck, Info } from 'lucide-svelte';

	let {
		activeStatusEnabled,
		privateAccountEnabled,
		onToggleActiveStatus,
		onTogglePrivateAccount
	} = $props();
</script>

<div class="space-y-4 animate-fade-in">
	<!-- Privacy Description Info Note -->
	<div class="p-3.5 bg-gradient-to-r from-pink-50/70 to-rose-50/40 rounded-xl border border-pink-100 flex items-start space-x-3 text-xs text-pink-700">
		<Info class="w-4 h-4 text-[#f43f8e] flex-shrink-0 mt-0.5" />
		<p class="leading-relaxed">
			Manage who can see your online availability and whether your emotional mood statistics are visible to other users on ChronoMuse.
		</p>
	</div>

	<div class="space-y-3">
		<!-- Active / Online Status Card -->
		<div class="p-4 sm:p-5 bg-white border border-pink-100 rounded-2xl flex items-start sm:items-center justify-between gap-4 shadow-xs transition-all hover:border-pink-200">
			<div class="flex items-start space-x-3.5 min-w-0 flex-1">
				<div class="w-10 h-10 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 text-[#f43f8e]">
					<Eye class="w-5 h-5" />
				</div>
				<div class="space-y-0.5 min-w-0 flex-1">
					<div class="flex items-center space-x-2">
						<h4 class="text-xs sm:text-sm font-extrabold text-pink-950">Show Active / Online Status</h4>
						<span class="text-[10px] font-bold px-2 py-0.2 rounded-full {activeStatusEnabled ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-50 text-slate-500 border border-slate-200'}">
							{activeStatusEnabled ? 'Currently Visible' : 'Hidden'}
						</span>
					</div>
					<p class="text-xs text-pink-400 font-medium leading-relaxed">
						When enabled, friends and connected users can see when you are active on the platform in real-time.
					</p>
				</div>
			</div>

			<div class="flex items-center flex-shrink-0 pt-1 sm:pt-0">
				<label class="relative inline-flex items-center cursor-pointer select-none">
					<input
						type="checkbox"
						checked={activeStatusEnabled}
						onchange={onToggleActiveStatus}
						class="sr-only peer"
					/>
					<div class="w-11 h-6 bg-pink-200 peer-focus:outline-none rounded-full peer peer-checked:bg-[#f43f8e] transition-colors duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:shadow-sm after:transition-all after:duration-200 peer-checked:after:translate-x-5"></div>
				</label>
			</div>
		</div>

		<!-- Private Account Protection Card -->
		<div class="p-4 sm:p-5 bg-white border border-pink-100 rounded-2xl flex items-start sm:items-center justify-between gap-4 shadow-xs transition-all hover:border-pink-200">
			<div class="flex items-start space-x-3.5 min-w-0 flex-1">
				<div class="w-10 h-10 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 text-[#f43f8e]">
					<Lock class="w-5 h-5" />
				</div>
				<div class="space-y-0.5 min-w-0 flex-1">
					<div class="flex items-center space-x-2">
						<h4 class="text-xs sm:text-sm font-extrabold text-pink-950">Private Account Protection</h4>
						<span class="text-[10px] font-bold px-2 py-0.2 rounded-full {privateAccountEnabled ? 'bg-pink-100 text-[#f43f8e] border border-pink-200' : 'bg-slate-50 text-slate-500 border border-slate-200'}">
							{privateAccountEnabled ? 'Private Enabled' : 'Public Profile'}
						</span>
					</div>
					<p class="text-xs text-pink-400 font-medium leading-relaxed">
						When enabled, your mood history, memory archives, and emotional analytics are completely hidden from other users.
					</p>
				</div>
			</div>

			<div class="flex items-center flex-shrink-0 pt-1 sm:pt-0">
				<label class="relative inline-flex items-center cursor-pointer select-none">
					<input
						type="checkbox"
						checked={privateAccountEnabled}
						onchange={onTogglePrivateAccount}
						class="sr-only peer"
					/>
					<div class="w-11 h-6 bg-pink-200 peer-focus:outline-none rounded-full peer peer-checked:bg-[#f43f8e] transition-colors duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:shadow-sm after:transition-all after:duration-200 peer-checked:after:translate-x-5"></div>
				</label>
			</div>
		</div>
	</div>
</div>
