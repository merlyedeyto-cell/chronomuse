<script>
	let { currentUser, activeStatusEnabled } = $props();
</script>

<div class="bg-white rounded-2xl p-4 shadow-xs border border-pink-100/90 transition-all hover:shadow-sm">
	<div class="flex items-center space-x-3.5">
		<!-- Avatar with Active Indicator -->
		<div class="relative flex-shrink-0">
			<div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#f43f8e] to-pink-400 text-white flex items-center justify-center font-black text-lg overflow-hidden shadow-xs ring-2 ring-pink-100">
				{#if currentUser?.avatar_url}
					<img src={currentUser.avatar_url} alt={currentUser.username || 'User'} class="w-full h-full object-cover" />
				{:else}
					{(currentUser?.username || currentUser?.email || 'U').charAt(0).toUpperCase()}
				{/if}
			</div>
			<div
				class="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center {activeStatusEnabled ? 'bg-emerald-500' : 'bg-slate-400'}"
				title={activeStatusEnabled ? 'Online & Visible' : 'Status Hidden'}
			></div>
		</div>

		<!-- User Meta -->
		<div class="min-w-0 flex-1">
			<div class="flex items-center space-x-1.5">
				<h3 class="text-sm font-black text-pink-950 truncate">
					{currentUser?.username ? `@${currentUser.username}` : 'User'}
				</h3>
				<span class="inline-flex items-center px-1.5 py-0.5 rounded-md bg-pink-50 text-[10px] font-bold text-[#f43f8e] border border-pink-200">
					Member
				</span>
			</div>
			<p class="text-[11px] text-pink-400 font-medium truncate mt-0.5">
				{currentUser?.email || 'No email set'}
			</p>
		</div>
	</div>
</div>
