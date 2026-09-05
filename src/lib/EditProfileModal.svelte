<script>
	let {
		isOpen = $bindable(false),
		editBio = $bindable(''),
		editBirthday = $bindable(''),
		editRelationshipStatus = $bindable('Single'),
		editGender = $bindable('Prefer not to say'),
		isSaving = false,
		onSave = () => {}
	} = $props();

	function handleSubmit(e) {
		e.preventDefault();
		onSave();
	}
</script>

{#if isOpen}
	<div
		class="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in"
		onclick={(e) => { if (e.target === e.currentTarget) isOpen = false; }}
	>
		<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-2xl max-w-md w-full p-6 relative overflow-hidden space-y-4">
			<div class="flex items-center justify-between border-b border-pink-100 pb-3">
				<div class="flex items-center space-x-2.5">
					<div class="w-9 h-9 rounded-xl bg-pink-100 text-pink-600 border border-pink-300 flex items-center justify-center font-bold text-base shadow-2xs">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
						</svg>
					</div>
					<h3 class="text-base sm:text-lg font-black text-pink-950">Edit Profile Info</h3>
				</div>

				<button
					type="button"
					onclick={() => isOpen = false}
					class="p-1.5 text-pink-400 hover:text-pink-600 rounded-lg transition-colors cursor-pointer"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<form onsubmit={handleSubmit} class="space-y-4">
				<!-- Bio -->
				<div>
					<label class="block text-xs font-extrabold text-pink-950 mb-1">Bio / Status Quote</label>
					<textarea
						bind:value={editBio}
						rows="3"
						placeholder="Share a short bio or status message with your friends..."
						class="w-full px-3.5 py-2.5 bg-pink-50/50 border-2 border-pink-200 rounded-xl text-xs sm:text-sm font-medium text-pink-950 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:bg-white transition-all resize-none"
					></textarea>
				</div>

				<!-- Birthday -->
				<div>
					<label class="block text-xs font-extrabold text-pink-950 mb-1">Birthday</label>
					<input
						type="date"
						bind:value={editBirthday}
						class="w-full px-3.5 py-2.5 bg-pink-50/50 border-2 border-pink-200 rounded-xl text-xs sm:text-sm font-semibold text-pink-950 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:bg-white transition-all"
					/>
				</div>

				<!-- Relationship Status -->
				<div>
					<label class="block text-xs font-extrabold text-pink-950 mb-1">Relationship Status</label>
					<select
						bind:value={editRelationshipStatus}
						class="w-full px-3.5 py-2.5 bg-pink-50/50 border-2 border-pink-200 rounded-xl text-xs sm:text-sm font-semibold text-pink-950 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:bg-white transition-all cursor-pointer"
					>
						<option value="Single">Single</option>
						<option value="In a relationship">In a relationship</option>
						<option value="Engaged">Engaged</option>
						<option value="Married">Married</option>
						<option value="It's complicated">It's complicated</option>
						<option value="Prefer not to say">Prefer not to say</option>
					</select>
				</div>

				<!-- Gender (Optional) -->
				<div>
					<label class="block text-xs font-extrabold text-pink-950 mb-1">Gender <span class="text-pink-500 font-normal">(Optional)</span></label>
					<select
						bind:value={editGender}
						class="w-full px-3.5 py-2.5 bg-pink-50/50 border-2 border-pink-200 rounded-xl text-xs sm:text-sm font-semibold text-pink-950 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:bg-white transition-all cursor-pointer"
					>
						<option value="Prefer not to say">Prefer not to say</option>
						<option value="Female">Female</option>
						<option value="Male">Male</option>
						<option value="Non-binary">Non-binary</option>
						<option value="Other">Other</option>
					</select>
				</div>

				<!-- Action Buttons -->
				<div class="flex items-center space-x-3 pt-2">
					<button
						type="button"
						onclick={() => isOpen = false}
						class="w-1/2 py-2.5 bg-pink-100 text-pink-700 hover:bg-pink-200 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={isSaving}
						class="w-1/2 py-2.5 bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white rounded-xl font-bold text-xs sm:text-sm transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50 flex items-center justify-center space-x-1.5"
					>
						{#if isSaving}
							<span>Saving...</span>
						{:else}
							<span>Save Details</span>
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
