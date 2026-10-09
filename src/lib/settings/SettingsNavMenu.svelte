<script>
	import {
		Lock,
		Volume2,
		Ban,
		KeyRound,
		Smartphone,
		ChevronRight,
		LogOut,
		Sparkles
	} from 'lucide-svelte';

	let {
		activeTab,
		onSelectTab,
		activeStatusEnabled,
		soundEffectsEnabled,
		blockedCount,
		pwaStatus,
		onOpenLogoutModal
	} = $props();

	const navItems = $derived([
		{
			id: 'privacy',
			title: 'Privacy & Online Status',
			subtitle: 'Online visibility & private account',
			icon: Lock,
			badge: activeStatusEnabled ? 'Active' : 'Hidden',
			badgeColor: activeStatusEnabled ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'
		},
		{
			id: 'audio',
			title: 'Sound & Touch Feedback',
			subtitle: 'Audio effects for clicks and taps',
			icon: Volume2,
			badge: soundEffectsEnabled ? 'Sound ON' : 'Muted',
			badgeColor: soundEffectsEnabled ? 'bg-pink-50 text-[#f43f8e] border-pink-200' : 'bg-slate-100 text-slate-500 border-slate-200'
		},
		{
			id: 'blocked',
			title: 'Blocked Accounts',
			subtitle: 'Manage blocked users & search',
			icon: Ban,
			badge: blockedCount > 0 ? `${blockedCount} Blocked` : 'None',
			badgeColor: blockedCount > 0 ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-slate-100 text-slate-500 border-slate-200'
		},
		{
			id: 'security',
			title: 'Password & Credentials',
			subtitle: 'Username, email & security',
			icon: KeyRound,
			badge: 'Security',
			badgeColor: 'bg-pink-50 text-[#f43f8e] border-pink-200'
		},
		{
			id: 'install',
			title: 'Install ChronoMuse App',
			subtitle: 'PWA native home screen app',
			icon: Smartphone,
			badge: pwaStatus.isStandalone ? 'Installed' : pwaStatus.isAppInstalled ? 'Open' : 'Install',
			badgeColor: pwaStatus.isStandalone ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-pink-50 text-[#f43f8e] border-pink-200'
		}
	]);
</script>

<div class="bg-white rounded-2xl shadow-xs border border-pink-100/90 overflow-hidden divide-y divide-pink-50">
	<div class="p-3 bg-gradient-to-r from-pink-50/50 to-white">
		<span class="text-[10px] font-black uppercase tracking-wider text-pink-400">Settings Navigation</span>
	</div>

	<div class="p-1.5 space-y-1">
		{#each navItems as item}
			{@const isActive = activeTab === item.id}
			<button
				type="button"
				onclick={() => onSelectTab(item.id)}
				class="w-full p-2.5 rounded-xl flex items-center justify-between text-left transition-all duration-200 cursor-pointer group {isActive ? 'bg-[#f43f8e] text-white shadow-md shadow-pink-500/20' : 'hover:bg-pink-50/70 text-pink-950'}"
			>
				<div class="flex items-center space-x-3 min-w-0 pr-2">
					<div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors {isActive ? 'bg-white/20 text-white' : 'bg-pink-50 text-[#f43f8e] group-hover:bg-pink-100/80'}">
						<item.icon class="w-4 h-4" />
					</div>
					<div class="min-w-0">
						<h4 class="text-xs font-black truncate {isActive ? 'text-white' : 'text-pink-950'}">
							{item.title}
						</h4>
						<p class="text-[10px] font-medium truncate mt-0.5 {isActive ? 'text-pink-100' : 'text-pink-400'}">
							{item.subtitle}
						</p>
					</div>
				</div>

				<div class="flex items-center space-x-1.5 flex-shrink-0">
					<span class="text-[9px] font-black px-2 py-0.5 rounded-full border transition-all {isActive ? 'bg-white/20 text-white border-white/30' : item.badgeColor}">
						{item.badge}
					</span>
					<ChevronRight class="w-3.5 h-3.5 transition-transform duration-200 {isActive ? 'text-white translate-x-0.5' : 'text-pink-300 group-hover:text-pink-500 group-hover:translate-x-0.5'}" />
				</div>
			</button>
		{/each}
	</div>

	<div class="p-2.5 bg-pink-50/30">
		<button
			type="button"
			onclick={onOpenLogoutModal}
			class="w-full py-2 px-3 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 hover:border-rose-300 font-extrabold text-xs rounded-xl transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-2xs"
		>
			<LogOut class="w-3.5 h-3.5" />
			<span>Log Out Account</span>
		</button>
	</div>
</div>
