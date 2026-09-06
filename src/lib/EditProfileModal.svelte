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

	let showBirthdayModal = $state(false);
	let showRelationshipModal = $state(false);
	let showGenderModal = $state(false);

	// Internal state for custom birthday picker
	let tempMonth = $state(0);
	let tempDay = $state(1);
	let tempYear = $state(2005);

	const monthsList = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	];

	const relationshipOptions = [
		'Single',
		'In a relationship',
		'Engaged',
		'Married',
		'It\'s complicated',
		'Prefer not to say'
	];

	const genderOptions = [
		'Prefer not to say',
		'Female',
		'Male',
		'Non-binary',
		'Other'
	];

	function initBirthdayState() {
		if (editBirthday) {
			const parts = editBirthday.split('-');
			if (parts.length === 3) {
				const y = parseInt(parts[0], 10);
				const m = parseInt(parts[1], 10) - 1;
				const d = parseInt(parts[2], 10);
				if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
					tempYear = y;
					tempMonth = m;
					tempDay = d;
					return;
				}
			}
		}
		tempYear = 2005;
		tempMonth = 0;
		tempDay = 1;
	}

	function openBirthdayModal() {
		initBirthdayState();
		showBirthdayModal = true;
	}

	function getDaysInMonth(month, year) {
		return new Date(year, month + 1, 0).getDate();
	}

	function saveBirthday() {
		const safeDay = Math.min(tempDay, getDaysInMonth(tempMonth, tempYear));
		const mStr = String(tempMonth + 1).padStart(2, '0');
		const dStr = String(safeDay).padStart(2, '0');
		editBirthday = `${tempYear}-${mStr}-${dStr}`;
		showBirthdayModal = false;
	}

	function formatBirthdayDisplay(dateStr) {
		if (!dateStr) return 'Select Birthday...';
		const parts = dateStr.split('-');
		if (parts.length === 3) {
			const y = parseInt(parts[0], 10);
			const m = parseInt(parts[1], 10) - 1;
			const d = parseInt(parts[2], 10);
			if (!isNaN(y) && !isNaN(m) && !isNaN(d) && monthsList[m]) {
				return `${monthsList[m]} ${d}, ${y}`;
			}
		}
		return dateStr;
	}

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
		<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-2xl max-w-md w-full p-6 relative overflow-hidden space-y-4 animate-modal-content">
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
					<button
						type="button"
						onclick={openBirthdayModal}
						class="w-full px-3.5 py-2.5 bg-pink-50/60 hover:bg-pink-100/70 border-2 border-pink-200 rounded-xl text-xs sm:text-sm font-bold text-pink-950 flex items-center justify-between transition-all cursor-pointer active:scale-[0.99]"
					>
						<div class="flex items-center space-x-2">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-pink-500">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
							</svg>
							<span>{formatBirthdayDisplay(editBirthday)}</span>
						</div>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4 text-pink-400">
							<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
						</svg>
					</button>
				</div>

				<!-- Relationship Status -->
				<div>
					<label class="block text-xs font-extrabold text-pink-950 mb-1">Relationship Status</label>
					<button
						type="button"
						onclick={() => showRelationshipModal = true}
						class="w-full px-3.5 py-2.5 bg-pink-50/60 hover:bg-pink-100/70 border-2 border-pink-200 rounded-xl text-xs sm:text-sm font-bold text-pink-950 flex items-center justify-between transition-all cursor-pointer active:scale-[0.99]"
					>
						<div class="flex items-center space-x-2">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-pink-500">
								<path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
							</svg>
							<span>{editRelationshipStatus || 'Select status...'}</span>
						</div>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4 text-pink-400">
							<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
						</svg>
					</button>
				</div>

				<!-- Gender -->
				<div>
					<label class="block text-xs font-extrabold text-pink-950 mb-1">Gender <span class="text-pink-500 font-normal">(Optional)</span></label>
					<button
						type="button"
						onclick={() => showGenderModal = true}
						class="w-full px-3.5 py-2.5 bg-pink-50/60 hover:bg-pink-100/70 border-2 border-pink-200 rounded-xl text-xs sm:text-sm font-bold text-pink-950 flex items-center justify-between transition-all cursor-pointer active:scale-[0.99]"
					>
						<div class="flex items-center space-x-2">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-pink-500">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
							</svg>
							<span>{editGender || 'Select gender...'}</span>
						</div>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4 text-pink-400">
							<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
						</svg>
					</button>
				</div>

				<!-- Action Buttons -->
				<div class="flex items-center space-x-3 pt-2">
					<button
						type="button"
						onclick={() => isOpen = false}
						class="w-1/2 py-2.5 bg-pink-100 text-pink-700 hover:bg-pink-200 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer active:scale-95"
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

<!-- Custom Birthday Picker Modal -->
{#if showBirthdayModal}
	<div
		class="fixed inset-0 bg-black/40 backdrop-blur-xs z-[60] flex items-center justify-center p-4 animate-fade-in"
		onclick={(e) => { if (e.target === e.currentTarget) showBirthdayModal = false; }}
	>
		<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-2xl max-w-xs sm:max-w-sm w-full p-5 space-y-4 animate-modal-content">
			<div class="flex items-center justify-between border-b border-pink-100 pb-2.5">
				<div class="flex items-center space-x-2">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 text-pink-600">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
					</svg>
					<h3 class="text-base font-black text-pink-950">Select Birthday</h3>
				</div>
				<button
					type="button"
					onclick={() => showBirthdayModal = false}
					class="p-1 text-pink-400 hover:text-pink-600 rounded-lg transition-colors cursor-pointer"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="space-y-3">
				<!-- Month Selection Grid -->
				<div>
					<label class="block text-xs font-bold text-pink-600 mb-1">Month</label>
					<div class="grid grid-cols-3 gap-1.5 max-h-36 overflow-y-auto p-1">
						{#each monthsList as mName, idx}
							<button
								type="button"
								onclick={() => tempMonth = idx}
								class="py-1.5 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer border {tempMonth === idx ? 'bg-gradient-to-r from-pink-500 to-rose-600 text-white border-pink-600 shadow-xs' : 'bg-pink-50/70 hover:bg-pink-100 text-pink-900 border-pink-200'}"
							>
								{mName.slice(0, 3)}
							</button>
						{/each}
					</div>
				</div>

				<!-- Day & Year Row -->
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-xs font-bold text-pink-600 mb-1">Day (1-{getDaysInMonth(tempMonth, tempYear)})</label>
						<input
							type="number"
							min="1"
							max={getDaysInMonth(tempMonth, tempYear)}
							bind:value={tempDay}
							class="w-full px-3 py-2 bg-pink-50/80 border border-pink-200 rounded-xl text-sm font-bold text-pink-900 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:bg-white text-center"
						/>
					</div>

					<div>
						<label class="block text-xs font-bold text-pink-600 mb-1">Year</label>
						<input
							type="number"
							min="1920"
							max="2026"
							bind:value={tempYear}
							class="w-full px-3 py-2 bg-pink-50/80 border border-pink-200 rounded-xl text-sm font-bold text-pink-900 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:bg-white text-center"
						/>
					</div>
				</div>

				<div class="flex items-center space-x-2 pt-2">
					<button
						type="button"
						onclick={() => showBirthdayModal = false}
						class="w-1/2 py-2.5 bg-pink-100 text-pink-700 rounded-xl font-bold text-xs cursor-pointer active:scale-95"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={saveBirthday}
						class="w-1/2 py-2.5 bg-gradient-to-r from-pink-500 to-rose-600 text-white rounded-xl font-bold text-xs shadow-md active:scale-95 cursor-pointer"
					>
						Set Birthday
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Custom Relationship Status Modal -->
{#if showRelationshipModal}
	<div
		class="fixed inset-0 bg-black/40 backdrop-blur-xs z-[60] flex items-center justify-center p-4 animate-fade-in"
		onclick={(e) => { if (e.target === e.currentTarget) showRelationshipModal = false; }}
	>
		<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-2xl max-w-xs sm:max-w-sm w-full p-5 space-y-4 animate-modal-content">
			<div class="flex items-center justify-between border-b border-pink-100 pb-2.5">
				<div class="flex items-center space-x-2">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 text-pink-600">
						<path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
					</svg>
					<h3 class="text-base font-black text-pink-950">Relationship Status</h3>
				</div>
				<button
					type="button"
					onclick={() => showRelationshipModal = false}
					class="p-1 text-pink-400 hover:text-pink-600 rounded-lg transition-colors cursor-pointer"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="space-y-2 max-h-72 overflow-y-auto p-1">
				{#each relationshipOptions as option}
					<button
						type="button"
						onclick={() => { editRelationshipStatus = option; showRelationshipModal = false; }}
						class="w-full py-2.5 px-4 rounded-2xl text-xs sm:text-sm font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-between border {editRelationshipStatus === option ? 'bg-gradient-to-r from-pink-500 to-rose-600 text-white border-pink-600 shadow-md scale-[1.01]' : 'bg-pink-50/70 hover:bg-pink-100 text-pink-900 border-pink-200'}"
					>
						<span>{option}</span>
						{#if editRelationshipStatus === option}
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-4 h-4 text-white">
								<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
							</svg>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}

<!-- Custom Gender Selector Modal -->
{#if showGenderModal}
	<div
		class="fixed inset-0 bg-black/40 backdrop-blur-xs z-[60] flex items-center justify-center p-4 animate-fade-in"
		onclick={(e) => { if (e.target === e.currentTarget) showGenderModal = false; }}
	>
		<div class="bg-white border-2 border-pink-300 rounded-3xl shadow-2xl max-w-xs sm:max-w-sm w-full p-5 space-y-4 animate-modal-content">
			<div class="flex items-center justify-between border-b border-pink-100 pb-2.5">
				<div class="flex items-center space-x-2">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 text-pink-600">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
					</svg>
					<h3 class="text-base font-black text-pink-950">Select Gender</h3>
				</div>
				<button
					type="button"
					onclick={() => showGenderModal = false}
					class="p-1 text-pink-400 hover:text-pink-600 rounded-lg transition-colors cursor-pointer"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="space-y-2 max-h-72 overflow-y-auto p-1">
				{#each genderOptions as option}
					<button
						type="button"
						onclick={() => { editGender = option; showGenderModal = false; }}
						class="w-full py-2.5 px-4 rounded-2xl text-xs sm:text-sm font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-between border {editGender === option ? 'bg-gradient-to-r from-pink-500 to-rose-600 text-white border-pink-600 shadow-md scale-[1.01]' : 'bg-pink-50/70 hover:bg-pink-100 text-pink-900 border-pink-200'}"
					>
						<span>{option}</span>
						{#if editGender === option}
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-4 h-4 text-white">
								<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
							</svg>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}
