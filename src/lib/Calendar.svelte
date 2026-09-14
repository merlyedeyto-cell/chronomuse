<script>
	import { createEventDispatcher, onMount } from 'svelte';

	const dispatch = createEventDispatcher();

	let {
		memoriesData = {},
		pinnedDates = [],
		selectedDateStr = '',
		currentMonth = $bindable(new Date().getMonth()),
		currentYear = $bindable(new Date().getFullYear())
	} = $props();

	let currentDate = $state(new Date());
	let selectedDate = $state(null);
	let showMonthMenu = $state(false);
	let showYearMenu = $state(false);
	let yearInput = $state('');
	let yearSearchTerm = $derived(String(yearInput ?? '').trim());
	let filteredYears = $derived(yearSearchTerm ? years.filter(y => String(y).includes(yearSearchTerm)) : years);
	let highlightedDateStr = $state('');
	let highlightTimeout;

	$effect(() => {
		if (showMonthMenu || showYearMenu) {
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = '';
		}
		return () => {
			document.body.style.overflow = '';
		};
	});

	$effect(() => {
		if (selectedDateStr) {
			const parts = selectedDateStr.split('-');
			if (parts.length === 3) {
				const y = parseInt(parts[0], 10);
				const m = parseInt(parts[1], 10) - 1;
				const d = parseInt(parts[2], 10);
				if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
					currentYear = y;
					currentMonth = m;
					selectedDate = new Date(y, m, d);
					highlightedDateStr = selectedDateStr;

					// Automatically fade out the special highlight after 3.5 seconds
					if (highlightTimeout) clearTimeout(highlightTimeout);
					highlightTimeout = setTimeout(() => {
						highlightedDateStr = '';
					}, 3500);
				}
			}
		}
	});

	function isTargetHighlighted(day) {
		if (!highlightedDateStr) return false;
		const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
		return highlightedDateStr === dateStr;
	}

	function getDayMemories(day) {
		const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
		return memoriesData[dateStr] || [];
	}

	function isMemoryShared(m) {
		if (!m) return false;
		const desc = (m.description || '').toLowerCase();
		const tag = (m.memory_tag || '').toLowerCase();
		return Boolean(
			m.is_shared ||
			m.shared_by ||
			m.share_id ||
			desc.includes('(shared by') ||
			desc.includes('shared by @') ||
			tag.includes('shared memory from')
		);
	}

	function hasMemories(day) {
		return getDayMemories(day).length > 0;
	}

	function hasPersonalMemories(day) {
		const mems = getDayMemories(day);
		return mems.some(m => !isMemoryShared(m));
	}

	function hasSharedMemories(day) {
		const mems = getDayMemories(day);
		return mems.some(m => isMemoryShared(m));
	}

	// Hover state for pin tooltip
	let hoveredDate = $state(null);
	let longPressTimer;
	let longPressCompleted = $state(false);
	let isDesktopHover = $state(false);
	let closeTimer;

	function isDatePinned(day) {
		const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
		return pinnedDates.some(d => d.date === dateStr);
	}

	function handleClickOutside(event) {
		// Close tooltip when clicking outside
		if (hoveredDate && !event.target.closest('.pin-tooltip')) {
			closeTooltip();
		}
	}

	onMount(() => {
		document.addEventListener('click', handleClickOutside);

		return () => {
			document.removeEventListener('click', handleClickOutside);
			if (longPressTimer) {
				clearTimeout(longPressTimer);
			}
			if (closeTimer) {
				clearTimeout(closeTimer);
			}
		};
	});

	const monthNames = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	];

	const currentRealYear = new Date().getFullYear();
	const maxYear = Math.max(2035, currentRealYear + 5);
	const years = Array.from({ length: maxYear - 1950 + 1 }, (_, i) => maxYear - i);

	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	function getDaysInMonth(month, year) {
		return new Date(year, month + 1, 0).getDate();
	}

	function getFirstDayOfMonth(month, year) {
		return new Date(year, month, 1).getDay();
	}

	function prevMonth() {
		if (currentMonth === 0) {
			currentMonth = 11;
			currentYear--;
		} else {
			currentMonth--;
		}
		dispatch('monthChanged', { month: currentMonth, year: currentYear });
	}

	function nextMonth() {
		if (currentMonth === 11) {
			currentMonth = 0;
			currentYear++;
		} else {
			currentMonth++;
		}
		dispatch('monthChanged', { month: currentMonth, year: currentYear });
	}

	function selectMonth(index) {
		currentMonth = index;
		showMonthMenu = false;
		dispatch('monthChanged', { month: currentMonth, year: currentYear });
	}

	function selectYear(year) {
		currentYear = year;
		showYearMenu = false;
		yearInput = '';
		dispatch('monthChanged', { month: currentMonth, year: currentYear });
	}

	function toggleYearMenu() {
		showYearMenu = !showYearMenu;
		if (showYearMenu) {
			showMonthMenu = false;
			yearInput = '';
		}
	}

	function submitYearInput() {
		const strVal = String(yearInput ?? '').trim();
		const parsed = parseInt(strVal, 10);
		if (!isNaN(parsed) && parsed >= 1900 && parsed <= 2100) {
			selectYear(parsed);
		} else if (filteredYears.length > 0) {
			selectYear(filteredYears[0]);
		}
	}

	function jumpToToday() {
		const today = new Date();
		currentMonth = today.getMonth();
		currentYear = today.getFullYear();
		selectDate(today.getDate());
		dispatch('monthChanged', { month: currentMonth, year: currentYear });
	}

	function selectDate(day) {
		selectedDate = new Date(currentYear, currentMonth, day);
		// Use local date format instead of ISO to avoid timezone issues
		const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

		// Check if this date has memories
		if (memoriesData[dateStr] && memoriesData[dateStr].length > 0) {
			dispatch('dateWithMemoriesSelected', { date: selectedDate, memories: memoriesData[dateStr] });
		} else {
			dispatch('dateSelected', selectedDate);
		}
	}

	function isToday(day) {
		const today = new Date();
		return day === today.getDate() &&
			   currentMonth === today.getMonth() &&
			   currentYear === today.getFullYear();
	}

	function isSelected(day) {
		if (!selectedDate) return false;
		return day === selectedDate.getDate() &&
			   currentMonth === selectedDate.getMonth() &&
			   currentYear === selectedDate.getFullYear();
	}

	function getDaysArray() {
		const daysInMonth = getDaysInMonth(currentMonth, currentYear);
		const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
		const days = [];

		// Empty cells for days before the first day of the month
		for (let i = 0; i < firstDay; i++) {
			days.push(null);
		}

		// Days of the month
		for (let day = 1; day <= daysInMonth; day++) {
			days.push(day);
		}

		return days;
	}

	function startLongPress(day) {
		if (!hasMemories(day)) return;
		longPressCompleted = false;
		longPressTimer = setTimeout(() => {
			hoveredDate = day;
			longPressCompleted = true;
			isDesktopHover = false;
			// Vibrate if supported (mobile only)
			if (navigator.vibrate) {
				navigator.vibrate(50);
			}
		}, 500); // 500ms long press
	}

	function cancelLongPress() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
		}
		// Only clear hoveredDate if long press didn't complete
		if (!longPressCompleted) {
			hoveredDate = null;
		}
	}
	
	function closeTooltip() {
		hoveredDate = null;
		longPressCompleted = false;
		isDesktopHover = false;
	}
	
	function handleMouseEnter(day) {
		if (hasMemories(day)) {
			// Cancel any pending close timer
			if (closeTimer) {
				clearTimeout(closeTimer);
			}
			hoveredDate = day;
			isDesktopHover = true;
		}
	}
	
	function handleMouseLeave() {
		// Delay closing to allow moving to tooltip
		closeTimer = setTimeout(() => {
			if (isDesktopHover) {
				hoveredDate = null;
				isDesktopHover = false;
			}
		}, 200); // 200ms delay
	}
</script>

<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-3xl p-3.5 sm:p-4 shadow-[0_8px_30px_rgba(244,114,182,0.1)] font-sans animate-fade-in-up">
	<!-- Header -->
	<div class="flex items-center justify-between gap-1.5 sm:gap-2 mb-3.5">
		<!-- Previous Month (Round Button) -->
		<button
			type="button"
			onclick={prevMonth}
			class="w-8 sm:w-9 h-8 sm:h-9 rounded-full bg-white hover:bg-pink-50 text-[#e0337f] border border-pink-200/90 flex items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer shadow-xs flex-shrink-0"
			title="Previous month"
		>
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-3.5 sm:w-4 h-3.5 sm:h-4">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
			</svg>
		</button>

		<!-- Center Month & Year Pill Selectors -->
		<div class="flex items-center justify-center space-x-1.5 sm:space-x-2 relative z-20">
			<!-- Month Pill Button -->
			<button
				type="button"
				onclick={() => { showMonthMenu = !showMonthMenu; showYearMenu = false; }}
				class="px-3 sm:px-4 py-1 sm:py-1.5 bg-white hover:bg-pink-50 text-[#e0337f] font-bold text-xs sm:text-sm rounded-full border border-pink-200/90 transition-all duration-200 cursor-pointer active:scale-95 flex items-center space-x-1.5 shadow-xs"
			>
				<span>{monthNames[currentMonth]}</span>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 sm:w-3.5 h-3 sm:h-3.5 text-[#e0337f] transition-transform duration-200 {showMonthMenu ? 'rotate-180' : ''}">
					<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
				</svg>
			</button>

			<!-- Year Pill Button -->
			<button
				type="button"
				onclick={toggleYearMenu}
				class="px-3 sm:px-4 py-1 sm:py-1.5 bg-white hover:bg-pink-50 text-[#e0337f] font-bold text-xs sm:text-sm rounded-full border border-pink-200/90 transition-all duration-200 cursor-pointer active:scale-95 flex items-center space-x-1.5 shadow-xs"
			>
				<span>{currentYear}</span>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 sm:w-3.5 h-3 sm:h-3.5 text-[#e0337f] transition-transform duration-200 {showYearMenu ? 'rotate-180' : ''}">
					<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
				</svg>
			</button>
		</div>

		<!-- Next Month (Round Button) -->
		<button
			type="button"
			onclick={nextMonth}
			class="w-8 sm:w-9 h-8 sm:h-9 rounded-full bg-white hover:bg-pink-50 text-[#e0337f] border border-pink-200/90 flex items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer shadow-xs flex-shrink-0"
			title="Next month"
		>
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-3.5 sm:w-4 h-3.5 sm:h-4">
				<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
			</svg>
		</button>
	</div>

	<!-- Weekday Names -->
	<div class="grid grid-cols-7 gap-1.5 sm:gap-2 mb-2">
		{#each dayNames as day}
			<div class="text-center text-[10px] sm:text-xs font-bold text-[#e05688] py-0.5">
				{day}
			</div>
		{/each}
	</div>

	<!-- Calendar Days Grid -->
	<div class="grid grid-cols-7 gap-1.5 sm:gap-2">
		{#each getDaysArray() as day, index}
			{#if day}
				<div class="relative">
					<button
						type="button"
						onclick={() => { closeTooltip(); highlightedDateStr = ''; selectDate(day); }}
						onmouseenter={() => handleMouseEnter(day)}
						onmouseleave={handleMouseLeave}
						ontouchstart={() => { startLongPress(day); }}
						ontouchend={() => { cancelLongPress(); }}
						ontouchcancel={() => { cancelLongPress(); }}
						class="relative aspect-square w-full rounded-2xl transition-all duration-200 flex flex-col items-center justify-center cursor-pointer select-none {isToday(day) ? 'bg-[#e0337f] text-white shadow-[0_4px_14px_rgba(224,51,127,0.35)] scale-102' : isSelected(day) ? 'bg-[#fff0f5] text-[#9d2b63] border-2 border-[#e0337f] shadow-xs' : 'bg-[#fff0f5] text-[#9d2b63] hover:bg-[#ffe4ee] hover:scale-105'} {isTargetHighlighted(day) ? (hasSharedMemories(day) ? 'ring-2 ring-emerald-500 ring-offset-1 scale-105 animate-subtle-glow' : 'ring-2 ring-[#e0337f] ring-offset-1 scale-105 animate-subtle-glow') : ''}"
					>
						<!-- Day Number -->
						<span class="leading-none text-xs sm:text-sm {isToday(day) || isSelected(day) ? 'font-black' : 'font-bold'} {isToday(day) ? 'text-white' : 'text-[#9d2b63]'}">{day}</span>
						
						<!-- Memory Dots -->
						{#if hasPersonalMemories(day) && hasSharedMemories(day)}
							<!-- Both Personal & Shared memories: Two dots side-by-side (Green and Pink) -->
							<div class="mt-1 flex items-center justify-center space-x-1">
								<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-2xs"></span>
								<span class="w-1.5 h-1.5 rounded-full {isToday(day) ? 'bg-white' : 'bg-[#e0337f]'} shadow-2xs"></span>
							</div>
						{:else if hasSharedMemories(day)}
							<!-- Only Shared memory: 1 Green dot -->
							<div class="mt-1 flex items-center justify-center">
								<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-2xs"></span>
							</div>
						{:else if hasPersonalMemories(day)}
							<!-- Only Personal memory: 1 Pink dot -->
							<div class="mt-1 flex items-center justify-center">
								<span class="w-1.5 h-1.5 rounded-full {isToday(day) ? 'bg-white' : 'bg-[#e0337f]'} shadow-2xs"></span>
							</div>
						{/if}

						<!-- Pinned Ribbon Bookmark (Day 2 style) -->
						{#if isDatePinned(day)}
							<span class="absolute top-1 right-1.5 w-2.5 h-2.5 {isToday(day) ? 'text-white' : 'text-[#e0337f]'}" title="Pinned date">
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-full h-full drop-shadow-2xs">
									<path fill-rule="evenodd" d="M6.32 2.577a49.255 49.255 0 0111.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 01-1.085.67L12 18.089l-7.165 3.58A.75.75 0 013.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93z" clip-rule="evenodd" />
								</svg>
							</span>
						{/if}
					</button>
					
					<!-- Pin Tooltip - Desktop & Mobile (Long Press) -->
					{#if hoveredDate === day && hasMemories(day)}
						<div
							class="pin-tooltip absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 bg-pink-950/90 backdrop-blur-xs text-white text-[11px] font-bold rounded-xl whitespace-nowrap z-50 flex items-center gap-1.5 shadow-lg border border-pink-300/30"
							onmouseenter={() => {
								if (closeTimer) {
									clearTimeout(closeTimer);
								}
							}}
							onmouseleave={() => {
								if (isDesktopHover) {
									handleMouseLeave();
								}
							}}
							ontouchstart={(e) => { e.stopPropagation(); }}
						>
							<button
								onclick={(e) => { e.stopPropagation(); dispatch('pinDate', { date: day, month: currentMonth, year: currentYear, isPinned: isDatePinned(day) }); }}
								class="bg-transparent text-white text-[11px] font-bold hover:text-pink-200 transition-colors duration-200 cursor-pointer"
							>
								{#if isDatePinned(day)}
									Unpin date
								{:else}
									Pin date
								{/if}
							</button>
							<button
								onclick={(e) => { e.stopPropagation(); closeTooltip(); }}
								class="text-white hover:text-pink-200 transition-colors duration-200 p-0.5"
								title="Close"
							>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
							<div class="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-3 border-r-3 border-t-3 border-transparent border-t-pink-950/90"></div>
						</div>
					{/if}
				</div>
			{:else}
				<div class="aspect-square w-full"></div>
			{/if}
		{/each}
	</div>

	<!-- Jump to Today Button -->
	<div class="mt-3.5 pt-3 border-t border-pink-100">
		<button
			onclick={jumpToToday}
			class="w-full py-2.5 px-3 bg-[#e0337f] hover:bg-[#c9256d] text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm hover:shadow-md active:scale-95 transition-all duration-200 cursor-pointer"
		>
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-3.5 h-3.5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<span>Today</span>
		</button>
	</div>

	<!-- Legend -->
	<div class="mt-3 pt-2.5 border-t border-pink-100">
		<div class="flex items-center justify-center flex-wrap gap-x-3 gap-y-1.5 text-[10px] sm:text-[11px] font-bold">
			<div class="flex items-center space-x-1">
				<div class="w-2.5 h-2.5 bg-[#e0337f] rounded-md shadow-2xs"></div>
				<span class="text-pink-900">Today</span>
			</div>
			<div class="flex items-center space-x-1">
				<div class="w-2.5 h-2.5 bg-[#fff0f5] border-2 border-[#e0337f] rounded-md"></div>
				<span class="text-pink-900">Selected</span>
			</div>
			<div class="flex items-center space-x-1">
				<div class="w-2 h-2 bg-[#e0337f] rounded-full"></div>
				<span class="text-pink-700">My Memory</span>
			</div>
			<div class="flex items-center space-x-1">
				<div class="w-2 h-2 bg-emerald-500 rounded-full"></div>
				<span class="text-emerald-700">Shared</span>
			</div>
			<div class="flex items-center space-x-1">
				<div class="flex items-center space-x-0.5">
					<div class="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
					<div class="w-1.5 h-1.5 bg-[#e0337f] rounded-full"></div>
				</div>
				<span class="text-pink-800">Both</span>
			</div>
		</div>
	</div>

	<!-- Selected Date Info -->
	{#if selectedDate}
		<div class="mt-2.5 py-2.5 px-3 bg-[#fff0f5] border border-pink-200/80 rounded-xl text-center shadow-2xs flex items-center justify-center">
			<p class="text-xs sm:text-[13px] text-pink-900 font-bold">
				Selected: <span class="text-[#e0337f] font-extrabold">{selectedDate.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
			</p>
		</div>
	{/if}
</div>

<!-- Custom Month Selection Popup -->
{#if showMonthMenu}
	<div
		class="fixed inset-0 bg-transparent z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) showMonthMenu = false; }}
		onkeydown={(e) => { if (e.key === 'Escape') showMonthMenu = false; }}
	>
		<div class="bg-white border border-pink-100 rounded-3xl p-4 sm:p-5 max-w-xs sm:max-w-sm w-full space-y-3 shadow-2xl animate-modal-content max-h-[85vh] overflow-y-auto my-auto">
			<div class="flex items-center justify-between border-b border-pink-100 pb-2">
				<div class="flex items-center space-x-1.5">
					<div class="w-6 h-6 rounded-lg bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center shadow-2xs">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-3.5 h-3.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
						</svg>
					</div>
					<h3 class="text-sm font-black text-pink-950">Select Month</h3>
				</div>
				<button
					type="button"
					onclick={() => showMonthMenu = false}
					class="w-6 h-6 rounded-full bg-pink-50 hover:bg-pink-100 text-pink-400 hover:text-[#f43f8e] flex items-center justify-center transition-colors cursor-pointer"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="grid grid-cols-2 gap-1.5 p-0.5">
				{#each monthNames as month, i}
					<button
						type="button"
						onclick={() => selectMonth(i)}
						class="py-1.5 px-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-between border {currentMonth === i ? 'bg-[#f43f8e] text-white border-[#e0337f] shadow-xs' : 'bg-[#fdf2f6]/60 hover:bg-pink-100 text-pink-900 border-pink-100'}"
					>
						<span>{month}</span>
						{#if currentMonth === i}
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-3 h-3 text-white flex-shrink-0 ml-1">
								<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
							</svg>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}

<!-- Custom Glassmorphic Year Selection Popup -->
{#if showYearMenu}
	<div
		class="fixed inset-0 bg-transparent z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) showYearMenu = false; }}
		onkeydown={(e) => { if (e.key === 'Escape') showYearMenu = false; }}
	>
		<div class="bg-white border border-pink-100 rounded-3xl p-4 sm:p-5 max-w-xs sm:max-w-sm w-full space-y-3 shadow-2xl animate-modal-content max-h-[85vh] overflow-y-auto my-auto">
			<div class="flex items-center justify-between border-b border-pink-100 pb-2">
				<div class="flex items-center space-x-1.5">
					<div class="w-6 h-6 rounded-lg bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center shadow-2xs">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-3.5 h-3.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
						</svg>
					</div>
					<h3 class="text-sm font-black text-pink-950">Select Year</h3>
				</div>
				<button
					type="button"
					onclick={() => showYearMenu = false}
					class="w-6 h-6 rounded-full bg-pink-50 hover:bg-pink-100 text-pink-400 hover:text-[#f43f8e] flex items-center justify-center transition-colors cursor-pointer"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="flex items-center space-x-1.5 pt-0.5">
				<div class="relative flex-1">
					<input
						type="number"
						min="1900"
						max="2100"
						placeholder="Type year e.g. 2026..."
						bind:value={yearInput}
						onkeydown={(e) => { if (e.key === 'Enter') submitYearInput(); }}
						class="w-full py-1.5 px-3 bg-[#fdf2f6] border border-pink-200/80 rounded-xl text-xs font-bold text-pink-950 focus:outline-none focus:ring-2 focus:ring-[#f43f8e]/30 focus:border-[#f43f8e] focus:bg-white transition-all placeholder:text-pink-300"
					/>
				</div>
				<button
					type="button"
					onclick={submitYearInput}
					class="py-1.5 px-3.5 bg-[#f43f8e] hover:bg-[#e0337f] text-white rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap active:scale-95 shadow-xs"
				>
					Go
				</button>
			</div>

			<div class="grid grid-cols-3 gap-1.5 max-h-52 overflow-y-auto p-0.5">
				{#each filteredYears as year}
					<button
						type="button"
						onclick={() => selectYear(year)}
						class="py-2 px-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center border {currentYear === year ? 'bg-[#f43f8e] text-white border-[#e0337f] shadow-xs scale-102' : 'bg-[#fdf2f6]/60 hover:bg-pink-100 text-pink-900 border-pink-100'}"
					>
						<span>{year}</span>
					</button>
				{:else}
					<div class="col-span-3 py-3 text-center text-xs text-pink-400 font-medium">
						No year found. Click "Go" to use {yearInput}.
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	@keyframes subtle-glow {
		0%, 100% {
			transform: scale(1.04);
		}
		50% {
			transform: scale(1.08);
		}
	}

	.animate-subtle-glow {
		animation: subtle-glow 1.4s ease-in-out 2;
	}
</style>
