<script>
	import { Ban, Search, UserX, ShieldCheck, UserCheck } from 'lucide-svelte';

	let {
		blockSearchInput,
		onBlockSearchInput,
		searchResults,
		isSearchingUsers,
		onSelectUserToBlock,
		blockedUsers,
		onUserBlockToggle
	} = $props();
</script>

<div class="space-y-4 animate-fade-in">
	<!-- Search & Block User Box -->
	<div class="p-4 sm:p-5 bg-white border border-pink-100 rounded-2xl shadow-xs space-y-3">
		<div class="flex items-center space-x-2.5">
			<div class="w-8 h-8 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center text-[#f43f8e]">
				<UserX class="w-4 h-4" />
			</div>
			<div>
				<h4 class="text-xs sm:text-sm font-extrabold text-pink-950">Search & Block Account</h4>
				<p class="text-[11px] text-pink-400 font-medium">Type a username below to quickly block interactions</p>
			</div>
		</div>

		<!-- Live Search Input -->
		<div class="relative">
			<div class="relative">
				<input
					id="block-search-input-desktop"
					type="text"
					value={blockSearchInput}
					oninput={onBlockSearchInput}
					placeholder="Type username (e.g. alex, jane)..."
					class="w-full pl-10 pr-10 py-2.5 bg-pink-50/40 border border-pink-200 rounded-xl text-xs font-bold text-pink-950 placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/40 focus:bg-white transition-all"
				/>
				<Search class="w-4 h-4 text-pink-400 absolute left-3.5 top-3" />

				{#if isSearchingUsers}
					<div class="absolute right-3.5 top-3 w-4 h-4 border-2 border-[#f43f8e] border-t-transparent rounded-full animate-spin"></div>
				{/if}
			</div>

			<!-- Autocomplete Search Dropdown List -->
			{#if searchResults.length > 0}
				<div class="absolute left-0 right-0 top-full mt-1.5 bg-white border border-pink-200 rounded-2xl z-30 max-h-60 overflow-y-auto divide-y divide-pink-100 shadow-xl animate-fade-in">
					{#each searchResults as sUser}
						<button
							type="button"
							onclick={() => onSelectUserToBlock(sUser)}
							class="w-full p-3 flex items-center justify-between hover:bg-pink-50 transition-colors text-left group cursor-pointer"
						>
							<div class="flex items-center space-x-3 min-w-0">
								<div class="w-8 h-8 rounded-full bg-[#f43f8e] text-white flex items-center justify-center font-black text-xs overflow-hidden flex-shrink-0 shadow-xs ring-2 ring-pink-100">
									{#if sUser.avatar_url}
										<img src={sUser.avatar_url} alt={sUser.username} class="w-full h-full object-cover" />
									{:else}
										{(sUser.username || sUser.email)?.charAt(0).toUpperCase()}
									{/if}
								</div>
								<div class="min-w-0 pr-1">
									<p class="text-xs font-extrabold text-pink-950 group-hover:text-[#f43f8e] truncate">@{sUser.username}</p>
									<p class="text-[10px] text-pink-400 font-medium truncate">{sUser.email}</p>
								</div>
							</div>

							<span class="px-3 py-1 bg-rose-50 border border-rose-200 text-rose-600 font-extrabold text-[10px] rounded-full group-hover:bg-rose-600 group-hover:text-white transition-all flex-shrink-0">
								Select to Block
							</span>
						</button>
					{/each}
				</div>
			{:else if blockSearchInput && blockSearchInput.trim() && !isSearchingUsers}
				<div class="p-3 bg-white border border-pink-200 rounded-xl text-xs font-bold text-pink-400 text-center mt-1.5 shadow-2xs">
					No users found matching "{blockSearchInput}".
				</div>
			{/if}
		</div>
	</div>

	<!-- Blocked Users List Section -->
	<div class="space-y-2.5">
		<div class="flex items-center justify-between px-1">
			<h4 class="text-xs font-black text-pink-950 uppercase tracking-wider">
				Currently Blocked Accounts ({blockedUsers.length})
			</h4>
			{#if blockedUsers.length > 0}
				<span class="text-[10px] font-bold text-pink-400">Toggle switch to unblock</span>
			{/if}
		</div>

		{#if blockedUsers.length === 0}
			<div class="p-8 text-center border-2 border-dashed border-pink-200 rounded-2xl bg-white/60 space-y-2">
				<div class="w-10 h-10 rounded-2xl bg-pink-50 text-pink-300 flex items-center justify-center mx-auto">
					<ShieldCheck class="w-5 h-5" />
				</div>
				<p class="text-xs font-bold text-pink-800">No Blocked Accounts</p>
				<p class="text-[11px] font-medium text-pink-400 max-w-xs mx-auto">
					You have not blocked any users. Blocked users won't be able to message you or see your profile.
				</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-2.5">
				{#each blockedUsers as bUser}
					<div class="p-3.5 bg-white border border-pink-100 rounded-2xl flex items-center justify-between gap-3 shadow-xs hover:border-pink-200 transition-all">
						<div class="flex items-center space-x-3 min-w-0 flex-1">
							<div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-500 to-pink-500 text-white flex items-center justify-center font-black text-xs overflow-hidden flex-shrink-0 shadow-xs ring-2 ring-pink-100">
								{#if bUser.avatar_url}
									<img src={bUser.avatar_url} alt={bUser.username} class="w-full h-full object-cover" />
								{:else}
									{(bUser.username || bUser.email)?.charAt(0).toUpperCase()}
								{/if}
							</div>
							<div class="min-w-0 pr-1">
								<div class="flex items-center space-x-1.5">
									<p class="text-xs font-extrabold text-pink-950 truncate">@{bUser.username}</p>
									<span class="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-50 text-rose-600 border border-rose-200">
										Blocked
									</span>
								</div>
								<p class="text-[10px] text-pink-400 font-medium truncate mt-0.5">{bUser.email || 'Blocked User'}</p>
							</div>
						</div>

						<!-- Block Switch -->
						<div class="flex items-center space-x-2 flex-shrink-0">
							<span class="text-[10px] font-bold text-rose-500 hidden sm:inline">Active Block</span>
							<label class="relative inline-flex items-center cursor-pointer select-none" title="Toggle to unblock this user">
								<input
									type="checkbox"
									checked={true}
									onchange={(e) => onUserBlockToggle(bUser, e)}
									class="sr-only peer"
								/>
								<div class="w-10 h-6 bg-pink-200 peer-focus:outline-none rounded-full peer peer-checked:bg-rose-500 transition-colors duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:shadow-sm after:transition-all after:duration-200 peer-checked:after:translate-x-4"></div>
							</label>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
