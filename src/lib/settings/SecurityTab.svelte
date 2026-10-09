<script>
	import { KeyRound, Mail, User, ShieldAlert, LogOut, Check, Save } from 'lucide-svelte';

	let {
		editUsername = $bindable(''),
		editEmail = $bindable(''),
		editNewPassword = $bindable(''),
		editConfirmPassword = $bindable(''),
		isSavingProfile,
		onSaveCredentials,
		onOpenLogoutModal
	} = $props();
</script>

<div class="space-y-5 animate-fade-in">
	<form onsubmit={(e) => { e.preventDefault(); onSaveCredentials(); }} class="space-y-4">
		<!-- Profile Info Section -->
		<div class="p-4 sm:p-5 bg-white border border-pink-100 rounded-2xl shadow-xs space-y-3.5">
			<div class="flex items-center space-x-2.5 pb-1 border-b border-pink-50">
				<div class="w-8 h-8 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center text-[#f43f8e]">
					<User class="w-4 h-4" />
				</div>
				<div>
					<h4 class="text-xs sm:text-sm font-extrabold text-pink-950">Account Information</h4>
					<p class="text-[11px] text-pink-400 font-medium">Update your public username and account email address</p>
				</div>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<div>
					<label for="settings-username" class="block text-xs font-bold text-pink-900 mb-1">
						Username <span class="text-rose-500">*</span>
					</label>
					<div class="relative">
						<input
							id="settings-username"
							type="text"
							bind:value={editUsername}
							class="w-full pl-9 pr-3 py-2.5 bg-pink-50/40 border border-pink-200 rounded-xl text-xs font-bold text-pink-950 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/40 focus:bg-white transition-all"
							placeholder="Your username"
							required
						/>
						<span class="absolute left-3 top-2.5 text-pink-400 font-black text-xs">@</span>
					</div>
				</div>

				<div>
					<label for="settings-email" class="block text-xs font-bold text-pink-900 mb-1">
						Email Address <span class="text-rose-500">*</span>
					</label>
					<div class="relative">
						<input
							id="settings-email"
							type="email"
							bind:value={editEmail}
							class="w-full pl-9 pr-3 py-2.5 bg-pink-50/40 border border-pink-200 rounded-xl text-xs font-bold text-pink-950 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/40 focus:bg-white transition-all"
							placeholder="Your email address"
							required
						/>
						<Mail class="w-4 h-4 text-pink-400 absolute left-3 top-3" />
					</div>
				</div>
			</div>
		</div>

		<!-- Password Management Section -->
		<div class="p-4 sm:p-5 bg-white border border-pink-100 rounded-2xl shadow-xs space-y-3.5">
			<div class="flex items-center space-x-2.5 pb-1 border-b border-pink-50">
				<div class="w-8 h-8 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center text-[#f43f8e]">
					<KeyRound class="w-4 h-4" />
				</div>
				<div>
					<h4 class="text-xs sm:text-sm font-extrabold text-pink-950">Change Password</h4>
					<p class="text-[11px] text-pink-400 font-medium">Leave password fields blank if you do not want to change it</p>
				</div>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<div>
					<label for="settings-new-password" class="block text-[11px] font-bold text-pink-800 mb-1">New Password</label>
					<input
						id="settings-new-password"
						type="password"
						bind:value={editNewPassword}
						placeholder="At least 6 characters"
						class="w-full px-3.5 py-2.5 bg-pink-50/40 border border-pink-200 rounded-xl text-xs font-bold text-pink-950 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/40 focus:bg-white transition-all"
					/>
				</div>

				<div>
					<label for="settings-confirm-password" class="block text-[11px] font-bold text-pink-800 mb-1">Confirm New Password</label>
					<input
						id="settings-confirm-password"
						type="password"
						bind:value={editConfirmPassword}
						placeholder="Re-type new password"
						class="w-full px-3.5 py-2.5 bg-pink-50/40 border border-pink-200 rounded-xl text-xs font-bold text-pink-950 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/40 focus:bg-white transition-all"
					/>
				</div>
			</div>
		</div>

		<!-- Form Actions Bar -->
		<div class="pt-2 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
			<button
				type="button"
				onclick={onOpenLogoutModal}
				class="w-full sm:w-auto px-4 py-2.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50/80 text-xs font-black rounded-xl transition-all cursor-pointer border border-rose-200 flex items-center justify-center space-x-1.5"
			>
				<LogOut class="w-3.5 h-3.5" />
				<span>Log Out Account</span>
			</button>

			<button
				type="submit"
				disabled={isSavingProfile}
				class="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-[#f43f8e] to-pink-500 hover:from-[#e0337f] hover:to-pink-600 text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 active:scale-95 disabled:opacity-50 cursor-pointer"
			>
				{#if isSavingProfile}
					<div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
					<span>Saving Changes...</span>
				{:else}
					<Save class="w-3.5 h-3.5" />
					<span>Save Credentials</span>
				{/if}
			</button>
		</div>
	</form>
</div>
