<script>
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';

	const dispatch = createEventDispatcher();

	let { memoriesData = {}, pinnedDates = [] } = $props();

	let currentDate = $state(new Date());
	let selectedDate = $state(null);
	let currentMonth = $state(currentDate.getMonth());
	let currentYear = $state(currentDate.getFullYear());

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
	});

	onDestroy(() => {
		document.removeEventListener('click', handleClickOutside);
		if (longPressTimer) {
			clearTimeout(longPressTimer);
		}
		if (closeTimer) {
			clearTimeout(closeTimer);
		}
	});

	const monthNames = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	];

	const currentRealYear = new Date().getFullYear();
	const maxYear = Math.max(2030, currentRealYear + 5);
	const years = Array.from({ length: maxYear - 1900 + 1 }, (_, i) => 1900 + i);

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

	function hasMemories(day) {
		const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
		return memoriesData[dateStr] && memoriesData[dateStr].length > 0;
	}
</script>

<div class="bg-white border-2 border-pink-300 rounded-2xl shadow-md p-4 sm:p-5 transition-all duration-300 hover:shadow-lg">
	<!-- Header -->
	<div class="flex items-center justify-between mb-4">
		<button
			onclick={prevMonth}
			class="p-1.5 sm:p-2 bg-pink-100 text-pink-600 rounded-lg hover:bg-pink-200 transition-all duration-200 active:scale-95"
			title="Previous month"
		>
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
			</svg>
		</button>

		<div class="text-center flex items-center justify-center space-x-1.5">
			<!-- Month Dropdown -->
			<div class="relative inline-flex items-center">
				<select
					bind:value={currentMonth}
					onchange={() => dispatch('monthChanged', { month: currentMonth, year: currentYear })}
					class="appearance-none pl-2.5 pr-6 py-1 bg-pink-100/80 hover:bg-pink-200/90 text-pink-600 font-bold text-xs sm:text-sm rounded-lg border border-pink-300/80 shadow-sm transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-pink-400"
				>
					{#each monthNames as month, i}
						<option value={i} class="bg-white text-pink-700 font-semibold py-1">{month}</option>
					{/each}
				</select>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3 text-pink-500 absolute right-2 pointer-events-none">
					<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
				</svg>
			</div>

			<!-- Year Dropdown -->
			<div class="relative inline-flex items-center">
				<select
					bind:value={currentYear}
					onchange={() => dispatch('monthChanged', { month: currentMonth, year: currentYear })}
					class="appearance-none pl-2.5 pr-6 py-1 bg-pink-100/80 hover:bg-pink-200/90 text-pink-600 font-bold text-xs sm:text-sm rounded-lg border border-pink-300/80 shadow-sm transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-pink-400"
				>
					{#each years as year}
						<option value={year} class="bg-white text-pink-700 font-semibold py-1">{year}</option>
					{/each}
				</select>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3 text-pink-500 absolute right-2 pointer-events-none">
					<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
				</svg>
			</div>
		</div>

		<button
			onclick={nextMonth}
			class="p-1.5 sm:p-2 bg-pink-100 text-pink-600 rounded-lg hover:bg-pink-200 transition-all duration-200 active:scale-95"
			title="Next month"
		>
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
				<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
			</svg>
		</button>
	</div>

	<!-- Day Names -->
	<div class="grid grid-cols-7 gap-1.5 mb-3">
		{#each dayNames as day}
			<div class="text-center text-xs font-medium text-pink-400 py-2.5">
				{day}
			</div>
		{/each}
	</div>

	<!-- Calendar Grid -->
	<div class="grid grid-cols-7 gap-1.5">
		{#each getDaysArray() as day, index}
			{#if day}
				<div class="relative">
					<button
						onclick={() => selectDate(day)}
						onmouseenter={() => handleMouseEnter(day)}
						onmouseleave={handleMouseLeave}
						ontouchstart={(e) => { e.preventDefault(); e.stopPropagation(); startLongPress(day); }}
						ontouchend={(e) => { e.stopPropagation(); cancelLongPress(); }}
						ontouchcancel={(e) => { e.stopPropagation(); cancelLongPress(); }}
						class="relative p-2.5 text-sm rounded-lg transition-all duration-200 flex flex-col items-center justify-center min-h-[45px] w-full"
						class:bg-pink-500={isToday(day)}
						class:text-white={isToday(day)}
						class:bg-pink-100={!isToday(day) && !isSelected(day)}
						class:text-pink-600={!isToday(day) && !isSelected(day)}
						class:bg-pink-200={isSelected(day) && !isToday(day)}
						class:hover:bg-pink-200={!isToday(day)}
						class:hover:scale-105={!isToday(day)}
					>
						<span class="font-medium">{day}</span>
						{#if hasMemories(day)}
							<span class="absolute bottom-1 w-2 h-2 rounded-full bg-gradient-to-r from-pink-400 to-pink-600"></span>
						{/if}
						{#if isDatePinned(day)}
							<span class="absolute top-0.5 right-0.5 w-3 h-3 text-pink-500">
								<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" stroke-width="1.5" class="w-full h-full">
									<path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
								</svg>
							</span>
						{/if}
					</button>
					
					<!-- Pin Tooltip - Desktop & Mobile (Long Press) -->
					{#if hoveredDate === day && hasMemories(day)}
						<div
							class="pin-tooltip absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-pink-600 text-white text-xs font-medium rounded-lg whitespace-nowrap shadow-lg z-50 flex items-center gap-2"
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
								class="bg-transparent text-white text-xs font-medium hover:text-pink-200 transition-colors duration-200 cursor-pointer"
							>
								{#if isDatePinned(day)}
									Unpin this date
								{:else}
									Pin this date
								{/if}
							</button>
							<button
								onclick={(e) => { e.stopPropagation(); closeTooltip(); }}
								class="text-white hover:text-pink-200 transition-colors duration-200"
								title="Close"
							>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3">
									<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
							<div class="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-pink-600"></div>
						</div>
					{/if}
				</div>
			{:else}
				<div class="min-h-[45px]"></div>
			{/if}
		{/each}
	</div>

	<!-- Jump to Today Button -->
	<div class="mt-5 pt-4 border-t border-pink-200">
		<button
			onclick={jumpToToday}
			class="w-full py-2.5 px-4 bg-gradient-to-r from-pink-400 to-pink-600 text-white rounded-lg hover:from-pink-500 hover:to-pink-700 transition-all duration-200 text-sm font-semibold shadow-md flex items-center justify-center space-x-2"
		>
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<span>Today</span>
		</button>
	</div>

	<!-- Legend -->
	<div class="mt-4 pt-4 border-t border-pink-200">
		<div class="flex items-center justify-center space-x-4 text-xs">
			<div class="flex items-center space-x-1">
				<div class="w-3 h-3 bg-pink-500 rounded"></div>
				<span class="text-pink-600">Today</span>
			</div>
			<div class="flex items-center space-x-1">
				<div class="w-3 h-3 bg-pink-200 rounded"></div>
				<span class="text-pink-600">Selected</span>
			</div>
			<div class="flex items-center space-x-1">
				<div class="w-2 h-2 bg-pink-500 rounded-full"></div>
				<span class="text-pink-600">Has Memories</span>
			</div>
		</div>
	</div>

	<!-- Selected Date Info -->
	{#if selectedDate}
		<div class="mt-4 p-3 bg-pink-50 border border-pink-200 rounded-lg text-center">
			<p class="text-sm text-pink-700">
				Selected: <strong>{selectedDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>
			</p>
		</div>
	{/if}
</div>
