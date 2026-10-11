<script>
	import {
		Eye,
		Lock,
		Info,
		MessageSquare,
		Compass,
		Flame
	} from 'lucide-svelte';

	let {
		currentUser = null,
		activeStatusEnabled = true,
		privateAccountEnabled = false,
		typingIndicatorEnabled = true,
		discoverabilityEnabled = true,
		showStreakEnabled = true,
		onToggleActiveStatus = () => {},
		onTogglePrivateAccount = () => {},
		onToggleTypingIndicator = () => {},
		onToggleDiscoverability = () => {},
		onToggleShowStreak = () => {}
	} = $props();
</script>

<div class="space-y-4 animate-fade-in">
	<!-- Privacy Description Info Note -->
	<div class="p-3 bg-gradient-to-r from-pink-50/80 to-rose-50/40 rounded-xl border border-pink-100 flex items-start space-x-2.5 text-xs text-pink-700 shadow-2xs">
		<Info class="w-4 h-4 text-[#f43f8e] flex-shrink-0 mt-0.5" />
		<p class="leading-relaxed text-[11px] sm:text-xs">
			Manage who can see your presence, online availability, chat interactions, and mood history across ChronoMuse.
		</p>
	</div>

	<!-- Section 1: Presence & Social Visibility -->
	<div class="space-y-1.5">
		<div class="px-1 flex items-center justify-between">
			<span class="text-[10px] font-black uppercase tracking-wider text-pink-400">
				Online Presence & Social Visibility
			</span>
		</div>

		<div class="bg-white rounded-xl border border-pink-100 divide-y divide-pink-50 overflow-hidden shadow-2xs">
			<!-- Row 1: Active / Online Status -->
			<div class="p-3.5 sm:p-4 flex items-center justify-between gap-3.5 hover:bg-pink-50/20 transition-colors">
				<div class="flex items-center space-x-3 min-w-0 flex-1">
					<div class="w-9 h-9 rounded-lg bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 text-[#f43f8e]">
						<Eye class="w-4 h-4" />
					</div>
					<div class="space-y-0.5 min-w-0 flex-1">
						<h4 class="text-xs sm:text-sm font-extrabold text-pink-950">Show Active / Online Status</h4>
						<p class="text-[11px] text-pink-400 font-medium leading-relaxed">
							When enabled, friends can see when you are active on ChronoMuse in real-time.
						</p>
					</div>
				</div>

				<div class="flex items-center flex-shrink-0">
					<label class="relative inline-flex items-center cursor-pointer select-none">
						<input
							type="checkbox"
							checked={activeStatusEnabled}
							onchange={onToggleActiveStatus}
							class="sr-only peer"
						/>
						<div class="w-10 h-6 bg-pink-200 peer-focus:outline-none rounded-full peer peer-checked:bg-[#f43f8e] transition-colors duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:shadow-sm after:transition-all after:duration-200 peer-checked:after:translate-x-4"></div>
					</label>
				</div>
			</div>

			<!-- Row 2: Chat Typing Indicator -->
			<div class="p-3.5 sm:p-4 flex items-center justify-between gap-3.5 hover:bg-pink-50/20 transition-colors">
				<div class="flex items-center space-x-3 min-w-0 flex-1">
					<div class="w-9 h-9 rounded-lg bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 text-[#f43f8e]">
						<MessageSquare class="w-4 h-4" />
					</div>
					<div class="space-y-0.5 min-w-0 flex-1">
						<h4 class="text-xs sm:text-sm font-extrabold text-pink-950">Live Typing Indicator in Chat</h4>
						<p class="text-[11px] text-pink-400 font-medium leading-relaxed">
							Display the bubble indicator to friends when you are actively typing a message.
						</p>
					</div>
				</div>

				<div class="flex items-center flex-shrink-0">
					<label class="relative inline-flex items-center cursor-pointer select-none">
						<input
							type="checkbox"
							checked={typingIndicatorEnabled}
							onchange={onToggleTypingIndicator}
							class="sr-only peer"
						/>
						<div class="w-10 h-6 bg-pink-200 peer-focus:outline-none rounded-full peer peer-checked:bg-[#f43f8e] transition-colors duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:shadow-sm after:transition-all after:duration-200 peer-checked:after:translate-x-4"></div>
					</label>
				</div>
			</div>

			<!-- Row 3: Discoverability in Suggestions -->
			<div class="p-3.5 sm:p-4 flex items-center justify-between gap-3.5 hover:bg-pink-50/20 transition-colors">
				<div class="flex items-center space-x-3 min-w-0 flex-1">
					<div class="w-9 h-9 rounded-lg bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 text-[#f43f8e]">
						<Compass class="w-4 h-4" />
					</div>
					<div class="space-y-0.5 min-w-0 flex-1">
						<h4 class="text-xs sm:text-sm font-extrabold text-pink-950">Appear in Suggested Friends & Search</h4>
						<p class="text-[11px] text-pink-400 font-medium leading-relaxed">
							Allow other users to discover and send friend requests to your profile.
						</p>
					</div>
				</div>

				<div class="flex items-center flex-shrink-0">
					<label class="relative inline-flex items-center cursor-pointer select-none">
						<input
							type="checkbox"
							checked={discoverabilityEnabled}
							onchange={onToggleDiscoverability}
							class="sr-only peer"
						/>
						<div class="w-10 h-6 bg-pink-200 peer-focus:outline-none rounded-full peer peer-checked:bg-[#f43f8e] transition-colors duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:shadow-sm after:transition-all after:duration-200 peer-checked:after:translate-x-4"></div>
					</label>
				</div>
			</div>
		</div>
	</div>

	<!-- Section 2: Mood Diary & Profile Privacy -->
	<div class="space-y-1.5">
		<div class="px-1 flex items-center justify-between">
			<span class="text-[10px] font-black uppercase tracking-wider text-pink-400">
				Mood Archives & Profile Access
			</span>
		</div>

		<div class="bg-white rounded-xl border border-pink-100 divide-y divide-pink-50 overflow-hidden shadow-2xs">
			<!-- Row 4: Private Account Protection -->
			<div class="p-3.5 sm:p-4 flex items-center justify-between gap-3.5 hover:bg-pink-50/20 transition-colors">
				<div class="flex items-center space-x-3 min-w-0 flex-1">
					<div class="w-9 h-9 rounded-lg bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 text-[#f43f8e]">
						<Lock class="w-4 h-4" />
					</div>
					<div class="space-y-0.5 min-w-0 flex-1">
						<h4 class="text-xs sm:text-sm font-extrabold text-pink-950">Private Account Protection</h4>
						<p class="text-[11px] text-pink-400 font-medium leading-relaxed">
							When enabled, your mood logs, memory archives, and emotional analytics are hidden from other users.
						</p>
					</div>
				</div>

				<div class="flex items-center flex-shrink-0">
					<label class="relative inline-flex items-center cursor-pointer select-none">
						<input
							type="checkbox"
							checked={privateAccountEnabled}
							onchange={onTogglePrivateAccount}
							class="sr-only peer"
						/>
						<div class="w-10 h-6 bg-pink-200 peer-focus:outline-none rounded-full peer peer-checked:bg-[#f43f8e] transition-colors duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:shadow-sm after:transition-all after:duration-200 peer-checked:after:translate-x-4"></div>
					</label>
				</div>
			</div>

			<!-- Row 5: Show Mood Streak -->
			<div class="p-3.5 sm:p-4 flex items-center justify-between gap-3.5 hover:bg-pink-50/20 transition-colors">
				<div class="flex items-center space-x-3 min-w-0 flex-1">
					<div class="w-9 h-9 rounded-lg bg-pink-50 border border-pink-100 flex items-center justify-center flex-shrink-0 text-[#f43f8e]">
						<Flame class="w-4 h-4" />
					</div>
					<div class="space-y-0.5 min-w-0 flex-1">
						<h4 class="text-xs sm:text-sm font-extrabold text-pink-950">Display Mood Streak on Profile</h4>
						<p class="text-[11px] text-pink-400 font-medium leading-relaxed">
							Show your consecutive active days badge on your public user profile card.
						</p>
					</div>
				</div>

				<div class="flex items-center flex-shrink-0">
					<label class="relative inline-flex items-center cursor-pointer select-none">
						<input
							type="checkbox"
							checked={showStreakEnabled}
							onchange={onToggleShowStreak}
							class="sr-only peer"
						/>
						<div class="w-10 h-6 bg-pink-200 peer-focus:outline-none rounded-full peer peer-checked:bg-[#f43f8e] transition-colors duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:shadow-sm after:transition-all after:duration-200 peer-checked:after:translate-x-4"></div>
					</label>
				</div>
			</div>
		</div>
	</div>
</div>
