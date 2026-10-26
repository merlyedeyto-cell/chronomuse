<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import {
		ChevronLeft,
		ChevronRight,
		ChevronDown,
		Calendar as CalendarIcon,
		Trash2,
		X,
		Check,
		Bookmark,
		Clock,
		AlertCircle
	} from 'lucide-svelte';

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

	// Selection & Batch Delete State
	let isSelectionMode = $state(false);
	let selectedDaysForDelete = $state(new Set());
	let showBatchDeleteModal = $state(false);
	let isBatchDeleting = $state(false);

	$effect(() => {
		if (showMonthMenu || showYearMenu || showBatchDeleteModal) {
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

	function getDateString(day) {
		return `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
	}

	function isTargetHighlighted(day) {
		if (!highlightedDateStr) return false;
		return highlightedDateStr === getDateString(day);
	}

	function getDayMemories(day) {
		const dateStr = getDateString(day);
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

	function isDateSelectedForDelete(day) {
		return selectedDaysForDelete.has(getDateString(day));
	}

	function getDaysWithMemoriesInCurrentMonth() {
		const daysInMonth = getDaysInMonth(currentMonth, currentYear);
		const days = [];
		for (let d = 1; d <= daysInMonth; d++) {
			if (hasMemories(d)) {
				days.push(d);
			}
		}
		return days;
	}

	function getSelectedMemoriesCount() {
		let count = 0;
		for (const dateStr of selectedDaysForDelete) {
			count += (memoriesData[dateStr] || []).length;
		}
		return count;
	}

	function getAllSelectedMemoryIds() {
		const ids = [];
		for (const dateStr of selectedDaysForDelete) {
			const list = memoriesData[dateStr] || [];
			list.forEach(m => {
				if (m && m.id) ids.push(Number(m.id));
			});
		}
		return ids;
	}

	function toggleDateSelection(day) {
		if (!hasMemories(day)) return;
		const dateStr = getDateString(day);
		const next = new Set(selectedDaysForDelete);
		if (next.has(dateStr)) {
			next.delete(dateStr);
		} else {
			next.add(dateStr);
		}
		selectedDaysForDelete = next;
	}

	function toggleSelectAllMonth() {
		const withMemories = getDaysWithMemoriesInCurrentMonth();
		const allCurrentSelected = withMemories.every(d => selectedDaysForDelete.has(getDateString(d)));
		const next = new Set(selectedDaysForDelete);

		if (allCurrentSelected) {
			withMemories.forEach(d => next.delete(getDateString(d)));
		} else {
			withMemories.forEach(d => next.add(getDateString(d)));
		}
		selectedDaysForDelete = next;
	}

	function enterSelectionMode(initialDay = null) {
		isSelectionMode = true;
		closeTooltip();
		const next = new Set();
		if (initialDay && hasMemories(initialDay)) {
			next.add(getDateString(initialDay));
		}
		selectedDaysForDelete = next;
	}

	function exitSelectionMode() {
		isSelectionMode = false;
		selectedDaysForDelete = new Set();
		showBatchDeleteModal = false;
	}

	function confirmBatchDelete() {
		if (selectedDaysForDelete.size === 0) return;
		const memoryIds = getAllSelectedMemoryIds();
		const dates = Array.from(selectedDaysForDelete);

		isBatchDeleting = true;
		dispatch('batchDeleteMemories', {
			dates: dates,
			memoryIds: memoryIds,
			onComplete: () => {
				isBatchDeleting = false;
				exitSelectionMode();
			}
		});
	}

	// Hover state for pin / action tooltip
	let hoveredDate = $state(null);
	let longPressTimer;
	let longPressCompleted = $state(false);
	let isDesktopHover = $state(false);
	let closeTimer;

	function isDatePinned(day) {
		const dateStr = getDateString(day);
		return pinnedDates.some(d => d.date === dateStr);
	}

	function handleClickOutside(event) {
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
		if (isSelectionMode) {
			toggleDateSelection(day);
			return;
		}

		selectedDate = new Date(currentYear, currentMonth, day);
		const dateStr = getDateString(day);

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
		if (longPressTimer) clearTimeout(longPressTimer);

		longPressTimer = setTimeout(() => {
			longPressCompleted = true;
			isDesktopHover = false;
			// Vibrate if supported (mobile only)
			if (typeof navigator !== 'undefined' && navigator.vibrate) {
				try { navigator.vibrate(50); } catch(e) {}
			}
			if (isSelectionMode) {
				toggleDateSelection(day);
			} else {
				hoveredDate = day;
			}
		}, 450); // 450ms long press
	}

	function cancelLongPress() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
		}
	}
	
	function closeTooltip() {
		hoveredDate = null;
		longPressCompleted = false;
		isDesktopHover = false;
	}
	
	function handleMouseEnter(day) {
		if (isSelectionMode) return;
		if (hasMemories(day)) {
			if (closeTimer) clearTimeout(closeTimer);
			hoveredDate = day;
			isDesktopHover = true;
		}
	}
	
	function handleMouseLeave() {
		if (isSelectionMode) return;
		closeTimer = setTimeout(() => {
			if (isDesktopHover) {
				hoveredDate = null;
				isDesktopHover = false;
			}
		}, 200);
	}
</script>

<div class="bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4.5 shadow-[0_8px_30px_rgba(244,114,182,0.08)] font-sans animate-fade-in-up relative max-w-[430px] mx-auto w-full">
	<!-- Multi-Select Delete Mode Floating Banner -->
	{#if isSelectionMode}
		<div class="mb-3 p-2 sm:p-2.5 bg-gradient-to-r from-[#f43f8e] via-[#e11d48] to-[#be123c] text-white rounded-xl shadow-md border border-pink-300/40 animate-fade-in flex items-center justify-between gap-2">
			<div class="flex items-center space-x-2 min-w-0">
				<div class="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-xs flex items-center justify-center flex-shrink-0 shadow-inner">
					<Trash2 class="w-3.5 h-3.5 text-white" />
				</div>
				<div class="min-w-0">
					<p class="text-[11px] font-black tracking-wide flex items-center gap-1.5 flex-wrap">
						<span>Select & Delete Mode</span>
						<span class="px-1.5 py-0.2 bg-white/25 text-white rounded-full text-[9.5px] font-black">{selectedDaysForDelete.size} date{selectedDaysForDelete.size === 1 ? '' : 's'}</span>
					</p>
					<p class="text-[9.5px] text-pink-100 font-semibold">
						{getSelectedMemoriesCount()} total {getSelectedMemoriesCount() === 1 ? 'memory' : 'memories'} selected
					</p>
				</div>
			</div>

			<div class="flex items-center space-x-1.5 flex-shrink-0">
				{#if getDaysWithMemoriesInCurrentMonth().length > 0}
					<button
						type="button"
						onclick={toggleSelectAllMonth}
						class="px-2 py-0.5 bg-white/20 hover:bg-white/30 active:scale-95 text-white text-[10px] font-bold rounded-lg transition-all cursor-pointer"
					>
						{getDaysWithMemoriesInCurrentMonth().every(d => selectedDaysForDelete.has(getDateString(d))) ? 'Deselect All' : 'Select All'}
					</button>
				{/if}
				<button
					type="button"
					onclick={exitSelectionMode}
					class="w-6 h-6 bg-white/20 hover:bg-white/30 active:scale-95 text-white rounded-full flex items-center justify-center transition-all cursor-pointer"
					title="Exit Select Mode"
				>
					<X class="w-3 h-3" />
				</button>
			</div>
		</div>
	{/if}

	<!-- Header -->
	<div class="flex items-center justify-between gap-1.5 sm:gap-2 mb-3.5 sm:mb-4">
		<!-- Previous Month (Round Button) -->
		<button
			type="button"
			onclick={prevMonth}
			class="w-7 sm:w-8 h-7 sm:h-8 rounded-full bg-white hover:bg-pink-50 text-[#e0337f] border border-pink-200/90 flex items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer shadow-xs flex-shrink-0"
			title="Previous month"
		>
			<ChevronLeft class="w-3.5 h-3.5" />
		</button>

		<!-- Center Month & Year Pill Selectors -->
		<div class="flex items-center justify-center space-x-1.5 sm:space-x-2 relative z-20">
			<!-- Month Pill Button -->
			<button
				type="button"
				onclick={() => { showMonthMenu = !showMonthMenu; showYearMenu = false; }}
				class="px-2.5 sm:px-3 py-1 bg-white hover:bg-pink-50 text-[#e0337f] font-bold text-xs rounded-full border border-pink-200/90 transition-all duration-200 cursor-pointer active:scale-95 flex items-center space-x-1 shadow-xs"
			>
				<span>{monthNames[currentMonth]}</span>
				<ChevronDown class="w-3 h-3 text-[#e0337f] transition-transform duration-200 {showMonthMenu ? 'rotate-180' : ''}" />
			</button>

			<!-- Year Pill Button -->
			<button
				type="button"
				onclick={toggleYearMenu}
				class="px-2.5 sm:px-3 py-1 bg-white hover:bg-pink-50 text-[#e0337f] font-bold text-xs rounded-full border border-pink-200/90 transition-all duration-200 cursor-pointer active:scale-95 flex items-center space-x-1 shadow-xs"
			>
				<span>{currentYear}</span>
				<ChevronDown class="w-3 h-3 text-[#e0337f] transition-transform duration-200 {showYearMenu ? 'rotate-180' : ''}" />
			</button>
		</div>

		<!-- Next Month (Round Button) -->
		<button
			type="button"
			onclick={nextMonth}
			class="w-7 sm:w-8 h-7 sm:h-8 rounded-full bg-white hover:bg-pink-50 text-[#e0337f] border border-pink-200/90 flex items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer shadow-xs flex-shrink-0"
			title="Next month"
		>
			<ChevronRight class="w-3.5 h-3.5" />
		</button>
	</div>

	<!-- Weekday Names -->
	<div class="grid grid-cols-7 gap-2 sm:gap-2.5 mb-2 sm:mb-2.5">
		{#each dayNames as day}
			<div class="text-center text-[10.5px] sm:text-[11.5px] font-bold text-[#e05688] py-0.5">
				{day}
			</div>
		{/each}
	</div>

	<!-- Calendar Days Grid -->
	<div class="grid grid-cols-7 gap-2 sm:gap-2.5">
		{#each getDaysArray() as day, index}
			{#if day}
				<div class="relative">
					<button
						type="button"
						onclick={() => { closeTooltip(); highlightedDateStr = ''; selectDate(day); }}
						onmouseenter={() => handleMouseEnter(day)}
						onmouseleave={handleMouseLeave}
						ontouchstart={() => startLongPress(day)}
						ontouchend={cancelLongPress}
						ontouchcancel={cancelLongPress}
						onmousedown={() => startLongPress(day)}
						onmouseup={cancelLongPress}
						oncontextmenu={(e) => { e.preventDefault(); if (hasMemories(day)) { hoveredDate = day; isDesktopHover = false; } }}
						class="relative aspect-square w-full rounded-xl sm:rounded-2xl transition-all duration-200 flex flex-col items-center justify-center p-1 cursor-pointer select-none {isSelectionMode ? (hasMemories(day) ? (isDateSelectedForDelete(day) ? 'bg-gradient-to-br from-[#f43f8e] to-[#e11d48] text-white shadow-md ring-2 ring-rose-400 scale-102 font-black' : 'bg-pink-50/80 text-pink-950 border border-pink-200 hover:border-rose-400 hover:bg-pink-100 hover:scale-102') : 'bg-pink-50/20 text-pink-200 opacity-30 pointer-events-none') : (isToday(day) ? 'bg-[#e0337f] text-white shadow-[0_4px_14px_rgba(224,51,127,0.35)] scale-102' : isSelected(day) ? 'bg-[#fff0f5] text-[#9d2b63] border-2 border-[#e0337f] shadow-xs' : 'bg-[#fff0f5] text-[#9d2b63] border border-pink-100/60 hover:bg-[#ffe4ee] hover:scale-105')} {isTargetHighlighted(day) && !isSelectionMode ? (hasSharedMemories(day) ? 'ring-2 ring-emerald-500 ring-offset-1 scale-105 animate-subtle-glow' : 'ring-2 ring-[#e0337f] ring-offset-1 scale-105 animate-subtle-glow') : ''}"
					>
						<!-- Selection Checkbox Overlay in Selection Mode -->
						{#if isSelectionMode && hasMemories(day)}
							<div class="absolute top-1 right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center transition-all shadow-xs {isDateSelectedForDelete(day) ? 'bg-white text-rose-600 scale-105' : 'bg-white/90 border border-pink-300 text-transparent'}">
								<Check class="w-2.5 h-2.5" />
							</div>
						{/if}

						<!-- Day Number -->
						<span class="leading-none text-[11.5px] sm:text-[12.5px] {isToday(day) || isSelected(day) || (isSelectionMode && isDateSelectedForDelete(day)) ? 'font-black' : 'font-bold'} {isToday(day) || (isSelectionMode && isDateSelectedForDelete(day)) ? 'text-white' : 'text-[#9d2b63]'}">{day}</span>
						
						<!-- Memory Dots with proper spacing from number -->
						{#if !isSelectionMode}
							<div class="h-2 flex items-center justify-center mt-1 sm:mt-1.5">
								{#if hasPersonalMemories(day) && hasSharedMemories(day)}
									<div class="flex items-center justify-center space-x-1">
										<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-2xs"></span>
										<span class="w-1.5 h-1.5 rounded-full {isToday(day) ? 'bg-white' : 'bg-[#e0337f]'} shadow-2xs"></span>
									</div>
								{:else if hasSharedMemories(day)}
									<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-2xs"></span>
								{:else if hasPersonalMemories(day)}
									<span class="w-1.5 h-1.5 rounded-full {isToday(day) ? 'bg-white' : 'bg-[#e0337f]'} shadow-2xs"></span>
								{/if}
							</div>

							<!-- Pinned Ribbon Bookmark (Tucked in top corner) -->
							{#if isDatePinned(day)}
								<span class="absolute top-1 right-1 sm:top-1.5 sm:right-1.5 w-2 sm:w-2.5 h-2 sm:h-2.5 {isToday(day) ? 'text-white' : 'text-[#e0337f]'}" title="Pinned date">
									<Bookmark class="w-full h-full drop-shadow-2xs fill-current" />
								</span>
							{/if}
						{:else if hasMemories(day)}
							<!-- Count pill inside selection mode -->
							<span class="text-[8px] font-black mt-0.5 px-1 py-0.2 rounded-full {isDateSelectedForDelete(day) ? 'text-white/90 bg-black/15' : 'text-pink-600 bg-pink-100/70'}">
								{getDayMemories(day).length} {getDayMemories(day).length === 1 ? 'mem' : 'mems'}
							</span>
						{/if}
					</button>
					
					<!-- Long Press / Context Action Stacked Popover (Pin Date & Select & Delete) -->
					{#if hoveredDate === day && hasMemories(day) && !isSelectionMode}
						<div
							class="pin-tooltip absolute bottom-full mb-2 p-1.5 bg-[#2a0618]/95 backdrop-blur-md text-white rounded-2xl whitespace-nowrap z-50 flex flex-col gap-1 shadow-[0_12px_32px_rgba(0,0,0,0.4)] border border-pink-400/30 animate-scale-in min-w-[130px] {index % 7 >= 5 ? 'right-0 translate-x-0' : (index % 7 <= 1 ? 'left-0 translate-x-0' : 'left-1/2 -translate-x-1/2')}"
							role="tooltip"
							onmouseenter={() => {
								if (closeTimer) clearTimeout(closeTimer);
							}}
							onmouseleave={() => {
								if (isDesktopHover) handleMouseLeave();
							}}
							ontouchstart={(e) => { e.stopPropagation(); }}
						>
							<!-- Pin / Unpin Button (Top Item) -->
							<button
								type="button"
								onclick={(e) => {
									e.stopPropagation();
									dispatch('pinDate', { date: day, month: currentMonth, year: currentYear, isPinned: isDatePinned(day) });
									closeTooltip();
								}}
								class="w-full px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-pink-100 hover:text-white text-xs font-bold transition-all duration-150 cursor-pointer flex items-center space-x-2 active:scale-95 text-left shadow-2xs"
							>
								<Bookmark class="w-3.5 h-3.5 text-[#f43f8e] flex-shrink-0 fill-current" />
								<span>{isDatePinned(day) ? 'Unpin Date' : 'Pin Date'}</span>
							</button>

							<!-- Select & Delete (Bottom Item - Stacked) -->
							<button
								type="button"
								onclick={(e) => {
									e.stopPropagation();
									enterSelectionMode(day);
								}}
								class="w-full px-2.5 py-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white text-xs font-black transition-all duration-150 cursor-pointer flex items-center space-x-2 active:scale-95 text-left shadow-2xs"
							>
								<Trash2 class="w-3.5 h-3.5 text-white flex-shrink-0" />
								<span>Select & Delete</span>
							</button>

							<!-- Tooltip Arrow Pointer -->
							<div class="absolute top-full w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-transparent border-t-[#2a0618]/95 {index % 7 >= 5 ? 'right-4' : (index % 7 <= 1 ? 'left-4' : 'left-1/2 -translate-x-1/2')}"></div>
						</div>
					{/if}
				</div>
			{:else}
				<div class="aspect-square w-full"></div>
			{/if}
		{/each}
	</div>

	<!-- Bottom Action Bar -->
	{#if isSelectionMode}
		<div class="mt-3.5 sm:mt-4 pt-3 border-t border-pink-100/80 flex items-center justify-between gap-2 animate-fade-in">
			<button
				type="button"
				onclick={exitSelectionMode}
				class="w-1/3 py-2 px-2.5 bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 active:scale-95 transition-all cursor-pointer"
			>
				<X class="w-3.5 h-3.5" />
				<span>Cancel</span>
			</button>

			<button
				type="button"
				onclick={() => showBatchDeleteModal = true}
				disabled={selectedDaysForDelete.size === 0}
				class="w-2/3 py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black flex items-center justify-center space-x-1.5 shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
			>
				<Trash2 class="w-3.5 h-3.5" />
				<span>Delete Selected ({selectedDaysForDelete.size})</span>
			</button>
		</div>
	{:else}
		<div class="mt-3.5 sm:mt-4 pt-3 border-t border-pink-100/80 flex items-center justify-center">
			<button
				type="button"
				onclick={jumpToToday}
				class="w-full py-2 px-3 bg-[#e0337f] hover:bg-[#c9256d] text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm hover:shadow-md active:scale-95 transition-all duration-200 cursor-pointer"
			>
				<Clock class="w-3.5 h-3.5" />
				<span>Today</span>
			</button>
		</div>
	{/if}

	<!-- Legend & Hold Tip -->
	<div class="mt-3 sm:mt-3.5 pt-2.5 sm:pt-3 border-t border-pink-100/80 space-y-1.5">
		<div class="flex items-center justify-center flex-wrap gap-x-2.5 gap-y-1 text-[9.5px] sm:text-[10px] font-bold">
			<div class="flex items-center space-x-1">
				<div class="w-2 h-2 bg-[#e0337f] rounded-md shadow-2xs"></div>
				<span class="text-pink-900">Today</span>
			</div>
			<div class="flex items-center space-x-1">
				<div class="w-2 h-2 bg-[#fff0f5] border-2 border-[#e0337f] rounded-md"></div>
				<span class="text-pink-900">Selected</span>
			</div>
			<div class="flex items-center space-x-1">
				<div class="w-1.5 h-1.5 bg-[#e0337f] rounded-full"></div>
				<span class="text-pink-700">My Memory</span>
			</div>
			<div class="flex items-center space-x-1">
				<div class="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
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
		<p class="text-center text-[9px] sm:text-[9.5px] text-pink-400 font-medium">
			Tip: Long-press / hold any date to Pin or Select & Delete in bulk.
		</p>
	</div>

	<!-- Selected Date Info -->
	{#if selectedDate && !isSelectionMode}
		<div class="mt-3 sm:mt-3.5 py-2 sm:py-2.5 px-3 bg-[#fff0f5] border border-pink-200/80 rounded-xl text-center shadow-2xs flex items-center justify-center">
			<p class="text-[11px] sm:text-xs text-pink-900 font-bold">
				Selected: <span class="text-[#e0337f] font-extrabold">{selectedDate.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
			</p>
		</div>
	{/if}
</div>

<!-- Batch Delete Confirmation Modal -->
{#if showBatchDeleteModal}
	<div
		class="fixed inset-0 bg-pink-950/40 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget && !isBatchDeleting) showBatchDeleteModal = false; }}
		onkeydown={(e) => { if (e.key === 'Escape' && !isBatchDeleting) showBatchDeleteModal = false; }}
	>
		<div class="bg-white border border-rose-100 rounded-3xl p-5 sm:p-6 max-w-sm sm:max-w-md w-full space-y-4 shadow-2xl animate-scale-in">
			<div class="flex items-center space-x-3">
				<div class="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0 shadow-inner">
					<Trash2 class="w-6 h-6" />
				</div>
				<div>
					<h3 class="text-base font-black text-rose-950 leading-tight">Delete Selected Memories?</h3>
					<p class="text-xs text-rose-500 font-bold mt-0.5">Bulk Delete Confirmation</p>
				</div>
			</div>

			<div class="p-3.5 bg-rose-50/70 border border-rose-200/80 rounded-2xl space-y-2">
				<p class="text-xs text-rose-950 font-medium leading-relaxed">
					Are you sure you want to permanently delete all memories on the <strong class="text-rose-700 font-black">{selectedDaysForDelete.size} selected date(s)</strong> ({getSelectedMemoriesCount()} total memories)?
				</p>
				<p class="text-[11px] text-rose-600 font-bold flex items-center gap-1">
					<AlertCircle class="w-3.5 h-3.5 text-rose-600 shrink-0" />
					<span>This will remove all associated media, tags, and pinned dates. This action cannot be undone.</span>
				</p>
			</div>

			<!-- Dates Chips Preview -->
			<div class="max-h-32 overflow-y-auto space-y-1.5 pr-1">
				<p class="text-[11px] font-black text-pink-950 uppercase tracking-wide">Selected Dates to Remove:</p>
				<div class="flex flex-wrap gap-1.5">
					{#each Array.from(selectedDaysForDelete) as dateStr}
						<span class="px-2.5 py-1 bg-white border border-rose-200 rounded-xl text-xs font-bold text-rose-800 shadow-2xs flex items-center space-x-1">
							<span>{dateStr}</span>
							<span class="text-[10px] text-rose-500 font-medium">({(memoriesData[dateStr] || []).length} mems)</span>
						</span>
					{/each}
				</div>
			</div>

			<!-- Actions -->
			<div class="flex items-center justify-end space-x-2 pt-2 border-t border-rose-100">
				<button
					type="button"
					onclick={() => showBatchDeleteModal = false}
					disabled={isBatchDeleting}
					class="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-all cursor-pointer active:scale-95 disabled:opacity-50"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={confirmBatchDelete}
					disabled={isBatchDeleting}
					class="px-4 py-2 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 text-white text-xs font-black rounded-xl transition-all cursor-pointer active:scale-95 shadow-md hover:shadow-lg disabled:opacity-50 flex items-center space-x-1.5"
				>
					{#if isBatchDeleting}
						<div class="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></div>
						<span>Deleting...</span>
					{:else}
						<Trash2 class="w-3.5 h-3.5" />
						<span>Delete All ({getSelectedMemoriesCount()})</span>
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

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
						<CalendarIcon class="w-3.5 h-3.5" />
					</div>
					<h3 class="text-sm font-black text-pink-950">Select Month</h3>
				</div>
				<button
					type="button"
					onclick={() => showMonthMenu = false}
					class="w-6 h-6 rounded-full bg-pink-50 hover:bg-pink-100 text-pink-400 hover:text-[#f43f8e] flex items-center justify-center transition-colors cursor-pointer"
				>
					<X class="w-3.5 h-3.5" />
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
							<Check class="w-3 h-3 text-white flex-shrink-0 ml-1 stroke-[3]" />
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
						<CalendarIcon class="w-3.5 h-3.5" />
					</div>
					<h3 class="text-sm font-black text-pink-950">Select Year</h3>
				</div>
				<button
					type="button"
					onclick={() => showYearMenu = false}
					class="w-6 h-6 rounded-full bg-pink-50 hover:bg-pink-100 text-pink-400 hover:text-[#f43f8e] flex items-center justify-center transition-colors cursor-pointer"
				>
					<X class="w-3.5 h-3.5" />
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
