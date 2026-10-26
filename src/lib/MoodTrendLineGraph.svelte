<script>
	import {
		Activity,
		ChevronRight,
		Eye,
		Camera,
		Check,
		ChevronDown
	} from 'lucide-svelte';
	import { playClickSound } from '$lib/soundEffects.js';

	let {
		moodData = [],
		selectedPeriod = 'all',
		onSelectMemory = () => {},
		onSelectDate = () => {}
	} = $props();

	// View mode: 'valence' (emotional positivity curve) or 'volume' (entry count per date)
	let viewMode = $state('valence'); // 'valence' | 'volume'
	let selectedMoodFilter = $state('all'); // 'all' or specific mood name
	let isMoodDropdownOpen = $state(false);
	let dropdownRef = $state();
	let chartContainerRef = $state();
	let activePointIndex = $state(null);
	let isHovering = $state(false);
	let selectedDateData = $state(null);
	let containerWidth = $state(600);
	let tooltipWidth = $state(180);
	let tooltipHeight = $state(90);

	// Mood score mapping (0 to 100 for Valence/Positivity)
	const MOOD_VALENCE_SCORES = {
		'love': 95,
		'excited': 90,
		'happy': 85,
		'grateful': 80,
		'calm': 72,
		'neutral': 50,
		'anxious': 35,
		'lonely': 28,
		'sad': 22,
		'angry': 18
	};

	const MOOD_COLORS = {
		'Happy': '#F59E0B',
		'Sad': '#3B82F6',
		'Excited': '#F97316',
		'Angry': '#F43F5E',
		'Calm': '#10B981',
		'Anxious': '#8B5CF6',
		'Grateful': '#EC4899',
		'Lonely': '#64748B',
		'Love': '#FB7185',
		'Neutral': '#94A3B8'
	};

	function getMoodScore(moodTag) {
		const tag = (moodTag || '').toLowerCase().trim();
		return MOOD_VALENCE_SCORES[tag] ?? 50;
	}

	function getMoodFillColor(mood) {
		const formatted = (mood || '').charAt(0).toUpperCase() + (mood || '').slice(1).toLowerCase();
		return MOOD_COLORS[formatted] || '#F43F8E';
	}

	// Filter raw memories if mood filter is applied
	let filteredMemories = $derived.by(() => {
		if (!moodData || moodData.length === 0) return [];
		if (selectedMoodFilter === 'all') return moodData;
		return moodData.filter(m => (m.mood_tag || '').toLowerCase().trim() === selectedMoodFilter.toLowerCase().trim());
	});

	// Process and aggregate moodData chronologically by day
	let aggregatedTimeline = $derived.by(() => {
		if (filteredMemories.length === 0) return [];

		const dateMap = new Map();

		for (const memory of filteredMemories) {
			const rawDate = memory.date || memory.created_at?.split('T')[0] || '';
			if (!rawDate) continue;

			if (!dateMap.has(rawDate)) {
				dateMap.set(rawDate, {
					date: rawDate,
					memories: [],
					moodCounts: {},
					totalScore: 0
				});
			}

			const group = dateMap.get(rawDate);
			group.memories.push(memory);
			const mood = (memory.mood_tag || 'Neutral').trim();
			const capitalizedMood = mood.charAt(0).toUpperCase() + mood.slice(1).toLowerCase();
			group.moodCounts[capitalizedMood] = (group.moodCounts[capitalizedMood] || 0) + 1;
			group.totalScore += getMoodScore(mood);
		}

		const points = Array.from(dateMap.values()).map(group => {
			const count = group.memories.length;
			const avgScore = count > 0 ? Math.round(group.totalScore / count) : 50;

			// Determine dominant mood of the date
			let dominantMood = 'Neutral';
			let maxMoodCount = 0;
			for (const [mood, cnt] of Object.entries(group.moodCounts)) {
				if (cnt > maxMoodCount) {
					maxMoodCount = cnt;
					dominantMood = mood;
				}
			}

			// Format label for display
			let displayDate = group.date;
			let fullDateLabel = group.date;
			try {
				const parts = group.date.split('-');
				if (parts.length === 3) {
					const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
					displayDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
					fullDateLabel = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
				}
			} catch (e) {}

			const moodList = Object.entries(group.moodCounts)
				.map(([mName, mCnt]) => ({
					mood: mName,
					count: mCnt,
					color: getMoodFillColor(mName)
				}))
				.sort((a, b) => b.count - a.count);

			const memoryTagsList = Array.from(
				new Set(group.memories.map(m => m.memory_tag).filter(Boolean))
			);

			return {
				date: group.date,
				displayDate,
				fullDateLabel,
				count,
				avgScore,
				dominantMood,
				color: getMoodFillColor(dominantMood),
				memories: group.memories,
				moodCounts: group.moodCounts,
				moodList,
				memoryTagsList
			};
		});

		// Sort ascending by chronological date
		points.sort((a, b) => a.date.localeCompare(b.date));
		return points;
	});

	// SVG Dimensions & Margins
	let chartWidth = $derived(containerWidth > 0 ? containerWidth : 600);
	const svgHeight = 240;
	const padding = { top: 38, right: 28, bottom: 44, left: 44 };

	let chartInnerWidth = $derived(Math.max(100, chartWidth - padding.left - padding.right));
	const chartInnerHeight = svgHeight - padding.top - padding.bottom;

	// Calculate Max Count for Volume View
	let maxVolume = $derived.by(() => {
		if (aggregatedTimeline.length === 0) return 5;
		const max = Math.max(...aggregatedTimeline.map(p => p.count));
		return Math.max(max, 4);
	});

	// Compute Coordinates for Points on the Chart
	let chartPoints = $derived.by(() => {
		if (aggregatedTimeline.length === 0) return [];
		const total = aggregatedTimeline.length;

		return aggregatedTimeline.map((item, index) => {
			let x;
			if (total === 1) {
				x = padding.left + chartInnerWidth / 2;
			} else {
				x = padding.left + (index / (total - 1)) * chartInnerWidth;
			}

			let y;
			if (viewMode === 'valence') {
				// Score is 0 - 100
				const normalizedScore = Math.max(0, Math.min(100, item.avgScore));
				y = padding.top + chartInnerHeight - (normalizedScore / 100) * chartInnerHeight;
			} else {
				// Volume mode
				const normalizedVol = Math.max(0, item.count / maxVolume);
				y = padding.top + chartInnerHeight - normalizedVol * chartInnerHeight;
			}

			return {
				...item,
				index,
				x,
				y
			};
		});
	});

	// Find Peak Point for Milestone
	let peakPoint = $derived.by(() => {
		if (chartPoints.length === 0) return null;
		let peak = chartPoints[0];

		for (const p of chartPoints) {
			if (viewMode === 'valence') {
				if (p.avgScore > peak.avgScore) peak = p;
			} else {
				if (p.count > peak.count) peak = p;
			}
		}

		return peak;
	});

	// Smooth Cubic Bezier Spline Path Generator
	let { pathD, areaD } = $derived.by(() => {
		if (chartPoints.length === 0) return { pathD: '', areaD: '' };
		const baselineY = padding.top + chartInnerHeight;

		if (chartPoints.length === 1) {
			const p = chartPoints[0];
			const pD = `M ${Math.max(padding.left, p.x - 30)} ${p.y} L ${Math.min(chartWidth - padding.right, p.x + 30)} ${p.y}`;
			const aD = `M ${Math.max(padding.left, p.x - 30)} ${baselineY} L ${Math.max(padding.left, p.x - 30)} ${p.y} L ${Math.min(chartWidth - padding.right, p.x + 30)} ${p.y} L ${Math.min(chartWidth - padding.right, p.x + 30)} ${baselineY} Z`;
			return { pathD: pD, areaD: aD };
		}

		let d = `M ${chartPoints[0].x},${chartPoints[0].y}`;

		for (let i = 0; i < chartPoints.length - 1; i++) {
			const p0 = chartPoints[i === 0 ? 0 : i - 1];
			const p1 = chartPoints[i];
			const p2 = chartPoints[i + 1];
			const p3 = chartPoints[i + 2 >= chartPoints.length ? chartPoints.length - 1 : i + 2];

			// Smooth tension control points with bounded clamping
			const cp1x = p1.x + (p2.x - p0.x) / 6;
			const cp1y = p1.y + (p2.y - p0.y) / 6;

			const cp2x = p2.x - (p3.x - p1.x) / 6;
			const cp2y = p2.y - (p3.y - p1.y) / 6;

			d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
		}

		const firstPoint = chartPoints[0];
		const lastPoint = chartPoints[chartPoints.length - 1];
		const areaPath = `${d} L ${lastPoint.x},${baselineY} L ${firstPoint.x},${baselineY} Z`;

		return { pathD: d, areaD: areaPath };
	});

	// Smart X-Axis Ticks (at most 5 to 7 evenly spaced labels to prevent any overlapping)
	let visibleAxisTicks = $derived.by(() => {
		if (chartPoints.length === 0) return [];
		const total = chartPoints.length;
		if (total <= 6) return chartPoints;

		const desiredCount = chartWidth < 450 ? 4 : 6;
		const step = (total - 1) / (desiredCount - 1);
		const indices = new Set();

		for (let i = 0; i < desiredCount; i++) {
			indices.add(Math.round(i * step));
		}

		return chartPoints.filter((_, idx) => indices.has(idx));
	});

	// Active Point (Hovered or explicitly selected)
	let activePoint = $derived.by(() => {
		if (activePointIndex !== null && chartPoints[activePointIndex]) {
			return chartPoints[activePointIndex];
		}
		if (selectedDateData) {
			const matched = chartPoints.find(p => p.date === selectedDateData.date);
			if (matched) return matched;
		}
		return null;
	});

	// Inspected point for memory preview (active point or latest date by default)
	let inspectedPoint = $derived.by(() => {
		if (activePoint) return activePoint;
		if (selectedDateData) {
			const matched = chartPoints.find(p => p.date === selectedDateData.date);
			if (matched) return matched;
		}
		return chartPoints[chartPoints.length - 1] || null;
	});


	// Smart dynamic tooltip placement calculations (clamps to never overflow card or screen)
	let isTooltipBelow = $derived.by(() => {
		if (!activePoint) return false;
		const tHeight = tooltipHeight > 0 ? tooltipHeight : 90;
		// Flip below if placing above would collide with top controls or exceed container top
		return (activePoint.y - 12 - tHeight) < 10;
	});

	let tooltipX = $derived.by(() => {
		if (!activePoint) return 0;
		const tWidth = tooltipWidth > 0 ? tooltipWidth : 180;
		const halfWidth = tWidth / 2;
		const pad = 12; // safe padding from container boundaries
		if (containerWidth <= tWidth + pad * 2) {
			return containerWidth / 2;
		}
		return Math.max(halfWidth + pad, Math.min(containerWidth - halfWidth - pad, activePoint.x));
	});

	let tooltipY = $derived.by(() => {
		if (!activePoint) return 0;
		if (isTooltipBelow) {
			return activePoint.y + 14;
		}
		return activePoint.y - 12;
	});

	let arrowX = $derived.by(() => {
		if (!activePoint) return 0;
		const tWidth = tooltipWidth > 0 ? tooltipWidth : 180;
		const minArrowX = 18;
		const maxArrowX = Math.max(minArrowX, tWidth - 18);
		const targetArrowX = (tWidth / 2) + (activePoint.x - tooltipX);
		return Math.max(minArrowX, Math.min(maxArrowX, targetArrowX));
	});

	// Interactive Mouse Scrubbing / Moving over SVG
	function handleSvgMouseMove(e) {
		if (chartPoints.length === 0) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;

		// Find closest point by X coordinate
		let closestIdx = 0;
		let minDiff = Infinity;

		for (let i = 0; i < chartPoints.length; i++) {
			const diff = Math.abs(chartPoints[i].x - mouseX);
			if (diff < minDiff) {
				minDiff = diff;
				closestIdx = i;
			}
		}

		activePointIndex = closestIdx;
		isHovering = true;
	}

	function handleSvgTouch(e) {
		if (chartPoints.length === 0 || !e.touches || e.touches.length === 0) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const touchX = e.touches[0].clientX - rect.left;

		let closestIdx = 0;
		let minDiff = Infinity;

		for (let i = 0; i < chartPoints.length; i++) {
			const diff = Math.abs(chartPoints[i].x - touchX);
			if (diff < minDiff) {
				minDiff = diff;
				closestIdx = i;
			}
		}

		activePointIndex = closestIdx;
		isHovering = true;
	}

	function handleSvgMouseLeave() {
		isHovering = false;
		activePointIndex = null;
	}

	function selectPoint(point) {
		playClickSound();
		selectedDateData = point;
		activePointIndex = point.index;
		isHovering = true;
		if (point.memories && point.memories.length > 0) {
			onSelectDate(point.date, point.memories);
			if (point.memories.length === 1) {
				onSelectMemory(point.memories[0]);
			}
		}
	}

	function handleMemoryCardClick(memory) {
		playClickSound();
		onSelectMemory(memory);
	}

	function handleClickOutside(event) {
		if (isMoodDropdownOpen && dropdownRef && !dropdownRef.contains(event.target)) {
			isMoodDropdownOpen = false;
		}
		if (isHovering && chartContainerRef && !chartContainerRef.contains(event.target)) {
			isHovering = false;
			activePointIndex = null;
		}
	}
</script>

<svelte:window
	onclick={handleClickOutside}
	onkeydown={(e) => { if (e.key === 'Escape') isMoodDropdownOpen = false; }}
/>

<div class="bg-white border border-pink-100/90 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-[0_4px_20px_rgba(244,114,182,0.08)] animate-fade-in-up font-sans transition-all">
	<!-- Chart Header Bar: Title and Subtitle -->
	<div class="mb-3 pb-2.5 border-b border-pink-50">
		<h2 class="text-xs sm:text-sm font-black text-pink-950">Interactive Mood Timeline</h2>
		<p class="text-[10px] sm:text-[11px] text-pink-400 font-bold truncate">Hover & click points to explore memories on that day</p>
	</div>

	<!-- Chart Controls Toolbar: Mood Filter on Left, View Mode Switcher on Right -->
	<div class="flex items-center justify-between gap-2 mb-3.5">
		<!-- Emotion Tag Filter Themed Custom Dropdown -->
		<div class="relative" bind:this={dropdownRef}>
			<button
				type="button"
				onclick={() => {
					playClickSound();
					isMoodDropdownOpen = !isMoodDropdownOpen;
				}}
				class="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold bg-[#fdf2f6] hover:bg-[#fce7f3] text-pink-900 border border-pink-100/90 hover:border-pink-300 rounded-xl px-2.5 py-1.5 cursor-pointer transition-all focus:outline-none focus:ring-1 focus:ring-[#f43f8e] shadow-2xs select-none active:scale-98"
				aria-haspopup="listbox"
				aria-expanded={isMoodDropdownOpen}
			>
				{#if selectedMoodFilter === 'all'}
					<span>All Moods ({moodData.length})</span>
				{:else}
					{@const formatted = selectedMoodFilter.charAt(0).toUpperCase() + selectedMoodFilter.slice(1).toLowerCase()}
					<span class="w-2 h-2 rounded-full flex-shrink-0" style="background-color: {getMoodFillColor(formatted)}"></span>
					<span class="capitalize">{selectedMoodFilter}</span>
				{/if}
				<ChevronDown class="w-3 h-3 text-pink-400 transition-transform duration-200 {isMoodDropdownOpen ? 'rotate-180 text-[#f43f8e]' : ''}" />
			</button>

			{#if isMoodDropdownOpen}
				<div
					class="absolute left-0 mt-1.5 w-44 bg-white/95 backdrop-blur-md border border-pink-100/90 rounded-2xl p-1.5 shadow-[0_10px_28px_rgba(244,63,142,0.18)] z-30 animate-scale-up max-h-60 overflow-y-auto"
					role="listbox"
				>
					<!-- All Moods Option -->
					<button
						type="button"
						role="option"
						aria-selected={selectedMoodFilter === 'all'}
						onclick={() => {
							playClickSound();
							selectedMoodFilter = 'all';
							isMoodDropdownOpen = false;
						}}
						class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all text-left cursor-pointer {selectedMoodFilter === 'all' ? 'bg-pink-50 text-[#f43f8e] font-black' : 'text-pink-900 hover:bg-[#fdf2f6] hover:text-[#f43f8e]'}"
					>
						<div class="flex items-center space-x-2 min-w-0">
							<span class="w-2 h-2 rounded-full bg-[#f43f8e] flex-shrink-0"></span>
							<span class="truncate">All Moods</span>
						</div>
						<span class="text-[10px] px-1.5 py-0.2 rounded-md bg-white border border-pink-100/90 font-black text-pink-500 shadow-2xs">
							{moodData.length}
						</span>
					</button>

					<div class="h-px bg-pink-50 my-1"></div>

					<!-- Each Mood Option -->
					{#each Object.keys(MOOD_COLORS) as mood}
						{@const moodKey = mood.toLowerCase()}
						{@const isSelected = selectedMoodFilter === moodKey}
						<button
							type="button"
							role="option"
							aria-selected={isSelected}
							onclick={() => {
								playClickSound();
								selectedMoodFilter = moodKey;
								isMoodDropdownOpen = false;
							}}
							class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all text-left cursor-pointer {isSelected ? 'bg-pink-50 text-[#f43f8e] font-black' : 'text-pink-900 hover:bg-[#fdf2f6] hover:text-[#f43f8e]'}"
						>
							<div class="flex items-center space-x-2 min-w-0">
								<span class="w-2 h-2 rounded-full flex-shrink-0 shadow-2xs" style="background-color: {MOOD_COLORS[mood]}"></span>
								<span class="truncate">{mood}</span>
							</div>
							{#if isSelected}
								<Check class="w-3 h-3 text-[#f43f8e] flex-shrink-0" strokeWidth={2.5} />
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Valence vs Volume Toggle -->
		<div class="flex items-center p-0.5 bg-[#fdf2f6] border border-pink-100/90 rounded-xl shadow-2xs flex-shrink-0">
			<button
				type="button"
				onclick={() => { playClickSound(); viewMode = 'valence'; }}
				class="px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all duration-200 cursor-pointer whitespace-nowrap {viewMode === 'valence' ? 'bg-[#f43f8e] text-white shadow-2xs' : 'text-pink-700 hover:text-[#f43f8e]'}"
			>
				Emotional Valence
			</button>
			<button
				type="button"
				onclick={() => { playClickSound(); viewMode = 'volume'; }}
				class="px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all duration-200 cursor-pointer whitespace-nowrap {viewMode === 'volume' ? 'bg-[#f43f8e] text-white shadow-2xs' : 'text-pink-700 hover:text-[#f43f8e]'}"
			>
				Entry Volume
			</button>
		</div>
	</div>

	<!-- Chart Area / Visualization -->
	{#if aggregatedTimeline.length > 0}
		<div class="relative w-full select-none" bind:clientWidth={containerWidth} bind:this={chartContainerRef}>
			<div class="w-full relative">
				<svg
					viewBox="0 0 {chartWidth} {svgHeight}"
					class="w-full h-48 sm:h-56 overflow-visible drop-shadow-xs cursor-crosshair"
					onmousemove={handleSvgMouseMove}
					onmouseleave={handleSvgMouseLeave}
					ontouchstart={handleSvgTouch}
					ontouchmove={handleSvgTouch}
					role="region"
					aria-label="Interactive timeline line graph"
				>
					<defs>
						<!-- Soft pink gradient fill for area under line -->
						<linearGradient id="moodAreaGradient" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stop-color="#f43f8e" stop-opacity="0.30" />
							<stop offset="60%" stop-color="#fb7185" stop-opacity="0.08" />
							<stop offset="100%" stop-color="#fce7f3" stop-opacity="0.0" />
						</linearGradient>

						<!-- Dynamic line stroke gradient -->
						<linearGradient id="moodLineGradient" x1="0" y1="0" x2="1" y2="0">
							<stop offset="0%" stop-color="#f43f8e" />
							<stop offset="40%" stop-color="#fb7185" />
							<stop offset="75%" stop-color="#ec4899" />
							<stop offset="100%" stop-color="#f43f8e" />
						</linearGradient>

						<!-- Subtle grid pattern -->
						<filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
							<feGaussianBlur stdDeviation="3" result="blur" />
							<feComposite in="SourceGraphic" in2="blur" operator="over" />
						</filter>
					</defs>

					<!-- Horizontal Reference Guideline Bands & Emotional Tiers -->
					{#if viewMode === 'valence'}
						<!-- High Positivity Zone (75 - 100) -->
						<rect
							x={padding.left}
							y={padding.top}
							width={chartInnerWidth}
							height={chartInnerHeight * 0.25}
							fill="#ecfdf5"
							opacity="0.4"
							rx="4"
						/>
						<line
							x1={padding.left}
							y1={padding.top + chartInnerHeight * 0.25}
							x2={chartWidth - padding.right}
							y2={padding.top + chartInnerHeight * 0.25}
							stroke="#a7f3d0"
							stroke-dasharray="3 3"
							stroke-width="1"
						/>
						<text
							x={padding.left - 8}
							y={padding.top + chartInnerHeight * 0.12 + 3}
							text-anchor="end"
							class="text-[9px] font-black fill-emerald-600 select-none tracking-tight"
						>
							Joyful
						</text>

						<!-- Balanced Mid Zone (45 - 75) -->
						<line
							x1={padding.left}
							y1={padding.top + chartInnerHeight * 0.55}
							x2={chartWidth - padding.right}
							y2={padding.top + chartInnerHeight * 0.55}
							stroke="#fce7f3"
							stroke-dasharray="4 4"
							stroke-width="1"
						/>
						<text
							x={padding.left - 8}
							y={padding.top + chartInnerHeight * 0.55 + 3}
							text-anchor="end"
							class="text-[9px] font-black fill-pink-400 select-none tracking-tight"
						>
							Steady
						</text>

						<!-- Reflective Low Zone (0 - 45) -->
						<line
							x1={padding.left}
							y1={padding.top + chartInnerHeight * 0.85}
							x2={chartWidth - padding.right}
							y2={padding.top + chartInnerHeight * 0.85}
							stroke="#fee2e2"
							stroke-dasharray="3 3"
							stroke-width="1"
						/>
						<text
							x={padding.left - 8}
							y={padding.top + chartInnerHeight * 0.85 + 3}
							text-anchor="end"
							class="text-[9px] font-black fill-rose-400 select-none tracking-tight"
						>
							Tender
						</text>
					{:else}
						<!-- Volume Guide Lines -->
						<line
							x1={padding.left}
							y1={padding.top}
							x2={chartWidth - padding.right}
							y2={padding.top}
							stroke="#fce7f3"
							stroke-dasharray="3 3"
							stroke-width="1"
						/>
						<text
							x={padding.left - 8}
							y={padding.top + 3}
							text-anchor="end"
							class="text-[9px] font-extrabold fill-pink-500 select-none"
						>
							{maxVolume}
						</text>

						<line
							x1={padding.left}
							y1={padding.top + chartInnerHeight * 0.5}
							x2={chartWidth - padding.right}
							y2={padding.top + chartInnerHeight * 0.5}
							stroke="#fce7f3"
							stroke-dasharray="3 3"
							stroke-width="1"
						/>
						<text
							x={padding.left - 8}
							y={padding.top + chartInnerHeight * 0.5 + 3}
							text-anchor="end"
							class="text-[9px] font-extrabold fill-pink-400 select-none"
						>
							{Math.round(maxVolume / 2)}
						</text>
					{/if}

					<!-- Baseline Axis -->
					<line
						x1={padding.left}
						y1={padding.top + chartInnerHeight}
						x2={chartWidth - padding.right}
						y2={padding.top + chartInnerHeight}
						stroke="#fbcfe8"
						stroke-width="1.2"
					/>

					<!-- Shaded Area Under Curve -->
					<path
						d={areaD}
						fill="url(#moodAreaGradient)"
						class="transition-all duration-300 ease-out pointer-events-none"
					/>

					<!-- Glowing Background Stroke -->
					<path
						d={pathD}
						fill="none"
						stroke="#f43f8e"
						stroke-width="6"
						stroke-linecap="round"
						stroke-linejoin="round"
						opacity="0.16"
						class="pointer-events-none"
					/>

					<!-- Main Gradient Stroke Line Path -->
					<path
						d={pathD}
						fill="none"
						stroke="url(#moodLineGradient)"
						stroke-width="3"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="transition-all duration-300 ease-out pointer-events-none"
					/>

					<!-- X-Axis Visible Ticks (Evenly spaced so they never collide) -->
					{#each visibleAxisTicks as tick}
						<line
							x1={tick.x}
							y1={padding.top + chartInnerHeight}
							x2={tick.x}
							y2={padding.top + chartInnerHeight + 4}
							stroke="#f472b6"
							stroke-width="1"
						/>
						<text
							x={tick.x}
							y={padding.top + chartInnerHeight + 16}
							text-anchor="middle"
							class="text-[10px] font-bold fill-pink-800/80 select-none"
						>
							{tick.displayDate}
						</text>
					{/each}

					<!-- Milestone Peak Badge Flag -->
					{#if peakPoint && chartPoints.length > 2}
						<g class="pointer-events-none">
							<line
								x1={peakPoint.x}
								y1={peakPoint.y}
								x2={peakPoint.x}
								y2={Math.max(padding.top - 8, peakPoint.y - 18)}
								stroke={peakPoint.color}
								stroke-width="1.2"
								stroke-dasharray="2 2"
							/>
							<rect
								x={Math.max(4, Math.min(chartWidth - 56, peakPoint.x - 26))}
								y={Math.max(padding.top - 20, peakPoint.y - 30)}
								width="52"
								height="15"
								rx="7.5"
								fill="#ffffff"
								stroke={peakPoint.color}
								stroke-width="1"
								class="drop-shadow-2xs"
							/>
							<text
								x={Math.max(30, Math.min(chartWidth - 30, peakPoint.x))}
								y={Math.max(padding.top - 20, peakPoint.y - 30) + 10.5}
								text-anchor="middle"
								class="text-[8.5px] font-black"
								fill={peakPoint.color}
							>
								{peakPoint.dominantMood}
							</text>
						</g>
					{/if}

					<!-- Active Scrubbing Crosshair Vertical Line -->
					{#if activePoint}
						<line
							x1={activePoint.x}
							y1={padding.top}
							x2={activePoint.x}
							y2={padding.top + chartInnerHeight}
							stroke="#f43f8e"
							stroke-width="1.5"
							stroke-dasharray="3 3"
							class="pointer-events-none transition-all duration-75"
							opacity="0.8"
						/>
					{/if}

					<!-- Data Point Nodes (Clean & Interactive) -->
					{#each chartPoints as point}
						{@const isCurrentActive = activePoint?.date === point.date}
						<g
							class="cursor-pointer"
							onclick={() => selectPoint(point)}
							onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectPoint(point); }}
							tabindex="0"
							role="button"
							aria-label={`View memories for ${point.displayDate}: ${point.dominantMood}`}
						>
							<!-- Highlight Halo when active/hovered (Static & crisp, no stray ping) -->
							{#if isCurrentActive}
								<circle
									cx={point.x}
									cy={point.y}
									r="11"
									fill={point.color}
									opacity="0.25"
								/>
							{/if}

							<!-- Extra multi-entry dash indicator if date has multiple entries -->
							{#if point.count > 1}
								<circle
									cx={point.x}
									cy={point.y}
									r={isCurrentActive ? '10' : '8'}
									fill="none"
									stroke={point.color}
									stroke-width="1.4"
									stroke-dasharray="2 2"
									opacity="0.85"
								/>
							{/if}

							<!-- Outer Ring -->
							<circle
								cx={point.x}
								cy={point.y}
								r={isCurrentActive ? '7' : '5'}
								fill={point.color}
								stroke="#ffffff"
								stroke-width="2"
								class="transition-all duration-150 drop-shadow-xs"
								filter="url(#softGlow)"
							/>

							<!-- Center Core Dot -->
							<circle
								cx={point.x}
								cy={point.y}
								r={isCurrentActive ? '3' : '2'}
								fill="#ffffff"
								class="transition-all duration-150"
							/>

							<!-- Invisible touch/click hit area -->
							<circle
								cx={point.x}
								cy={point.y}
								r="20"
								fill="transparent"
							/>
						</g>
					{/each}
				</svg>

				<!-- Floating Modern Tooltip positioned over Active Point -->
				{#if activePoint && isHovering}
					<div
						bind:clientWidth={tooltipWidth}
						bind:clientHeight={tooltipHeight}
						class="absolute pointer-events-none z-30 transition-all duration-100 ease-out"
						style="left: {tooltipX}px; top: {tooltipY}px; transform: translate(-50%, {isTooltipBelow ? '0%' : '-100%'});"
					>
						<div class="relative bg-white/95 backdrop-blur-md border border-pink-200/90 rounded-2xl p-2.5 shadow-[0_8px_24px_rgba(244,63,142,0.18)] min-w-[150px] max-w-[220px] text-center animate-scale-up">
							<!-- Dynamic Caret Arrow Pointer -->
							{#if isTooltipBelow}
								<div
									class="absolute -top-1.5 w-3 h-3 bg-white border-t border-l border-pink-200/90 transform rotate-45 -translate-x-1/2 pointer-events-none z-0"
									style="left: {arrowX}px;"
								></div>
							{:else}
								<div
									class="absolute -bottom-1.5 w-3 h-3 bg-white border-b border-r border-pink-200/90 transform rotate-45 -translate-x-1/2 pointer-events-none z-0"
									style="left: {arrowX}px;"
								></div>
							{/if}

							<div class="relative z-10">
								<!-- If single mood -->
								{#if !activePoint.moodList || activePoint.moodList.length <= 1}
									<div class="flex items-center justify-center space-x-1.5 mb-1">
										<span class="w-2 h-2 rounded-full flex-shrink-0" style="background-color: {activePoint.color}"></span>
										<span class="text-xs font-black truncate" style="color: {activePoint.color}">
											{activePoint.dominantMood}
										</span>
									</div>
								{:else}
									<!-- If multiple moods on same date, show all tags as distinct colored pills -->
									<div class="flex items-center justify-center gap-1 mb-1.5 flex-wrap max-w-[210px]">
										{#each activePoint.moodList as mItem}
											<span
												class="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-full text-[9px] font-black border shadow-2xs"
												style="background-color: {mItem.color}15; color: {mItem.color}; border-color: {mItem.color}40;"
											>
												<span class="w-1.5 h-1.5 rounded-full flex-shrink-0" style="background-color: {mItem.color}"></span>
												<span>{mItem.mood}</span>
												{#if mItem.count > 1}
													<span class="text-[8px] opacity-80">({mItem.count})</span>
												{/if}
											</span>
										{/each}
									</div>
								{/if}

								<p class="text-[10px] font-extrabold text-pink-950 truncate">{activePoint.fullDateLabel}</p>

								{#if activePoint.memoryTagsList && activePoint.memoryTagsList.length > 0}
									<div class="flex items-center justify-center gap-1 mt-1 flex-wrap">
										{#each activePoint.memoryTagsList.slice(0, 3) as mTag}
											<span class="text-[8.5px] font-bold text-pink-700 bg-pink-50 px-1.5 py-0.2 rounded-md border border-pink-200/60">
												#{mTag}
											</span>
										{/each}
									</div>
								{/if}

								<div class="flex items-center justify-center gap-1.5 mt-1 text-[9.5px] font-bold text-pink-500">
									<span>{activePoint.count} {activePoint.count === 1 ? 'memory' : 'memories'}</span>
									<span>·</span>
									<span>Score: {activePoint.avgScore}%</span>
								</div>
								<p class="text-[8.5px] text-[#f43f8e] font-black mt-1 uppercase tracking-wider">Tap to view entries ↓</p>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Interactive Day Memory Inspection Card (Below Graph) -->
		{#if inspectedPoint}
			<div class="mt-3 pt-3 border-t border-pink-100/80 animate-fade-in">
				<div class="flex items-center justify-between gap-2 mb-2 flex-wrap">
					<div class="flex items-center space-x-2 flex-wrap gap-y-1">
						<span class="w-3 h-3 rounded-full flex-shrink-0 shadow-2xs" style="background-color: {inspectedPoint.color}"></span>
						<span class="text-xs font-black text-pink-950">{inspectedPoint.fullDateLabel}</span>
						{#if inspectedPoint.moodList && inspectedPoint.moodList.length > 1}
							<div class="flex items-center gap-1 flex-wrap">
								{#each inspectedPoint.moodList as mItem}
									<span class="text-[10px] font-black px-2 py-0.5 rounded-full border shadow-2xs" style="background-color: {mItem.color}18; color: {mItem.color}; border-color: {mItem.color}35;">
										{mItem.mood} {mItem.count > 1 ? `(${mItem.count})` : ''}
									</span>
								{/each}
								<span class="text-[9.5px] font-bold text-pink-500">
									(Avg: {inspectedPoint.avgScore}%)
								</span>
							</div>
						{:else}
							<span class="text-[10px] font-black px-2 py-0.5 rounded-full border shadow-2xs" style="background-color: {inspectedPoint.color}18; color: {inspectedPoint.color}; border-color: {inspectedPoint.color}35;">
								{inspectedPoint.dominantMood} ({inspectedPoint.avgScore}%)
							</span>
						{/if}
					</div>

					<button
						onclick={() => selectPoint(inspectedPoint)}
						class="text-[10px] sm:text-[11px] font-black text-[#f43f8e] hover:text-[#db2777] flex items-center gap-1 bg-pink-50 hover:bg-pink-100/80 px-2.5 py-1 rounded-xl transition-all cursor-pointer shadow-2xs"
					>
						<span>Open All ({inspectedPoint.count})</span>
						<ChevronRight class="w-3 h-3" />
					</button>
				</div>

				<!-- Memory cards for the selected date -->
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
					{#each inspectedPoint.memories as memory}
						{@const mName = (memory.mood_tag || 'Neutral').charAt(0).toUpperCase() + (memory.mood_tag || 'Neutral').slice(1).toLowerCase()}
						<button
							onclick={() => handleMemoryCardClick(memory)}
							class="flex items-center space-x-2 p-2 rounded-xl bg-[#fdf2f6]/80 hover:bg-[#fff0f5] border border-pink-100/90 hover:border-pink-300 transition-all text-left group cursor-pointer active:scale-99 shadow-2xs"
						>
							<div class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: {getMoodFillColor(mName)}"></div>
							<div class="min-w-0 flex-1">
								<p class="text-[11px] font-bold text-pink-950 truncate group-hover:text-[#f43f8e] transition-colors leading-tight">
									{memory.description || memory.memory_tag || 'Untitled Memory'}
								</p>
								<div class="flex items-center gap-1.5 mt-0.5 text-[9px] text-pink-400">
									<span>{mName}</span>
									{#if memory.photo_video}
										<span class="inline-flex items-center gap-0.5">· <Camera class="w-2.5 h-2.5 inline" /> Media</span>
									{/if}
								</div>
							</div>
							<Eye class="w-3 h-3 text-pink-300 group-hover:text-[#f43f8e] flex-shrink-0 transition-colors" />
						</button>
					{/each}
				</div>
			</div>
		{/if}


	{:else}
		<!-- Empty Timeline State -->
		<div class="text-center py-10 bg-pink-50/40 rounded-2xl border border-dashed border-pink-200">
			<Activity class="w-8 h-8 text-pink-300 mx-auto mb-2 opacity-60" strokeWidth={1.8} />
			<p class="text-xs font-bold text-pink-900 mb-0.5">No Timeline Points Recorded</p>
			<p class="text-[11px] text-pink-400 font-medium">
				{selectedMoodFilter !== 'all' ? `No memories found with mood "${selectedMoodFilter}". Try selecting "All Moods".` : 'Capture memories across different dates to visualize your continuous emotional line graph.'}
			</p>
			{#if selectedMoodFilter !== 'all'}
				<button
					onclick={() => { playClickSound(); selectedMoodFilter = 'all'; }}
					class="mt-2.5 px-3 py-1 bg-[#f43f8e] text-white rounded-xl text-[10px] font-bold cursor-pointer hover:bg-[#db2777] transition-all"
				>
					Reset Filter to All
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	:global(svg),
	:global(svg *),
	:global(circle),
	:global(circle:focus),
	:global(path) {
		outline: none !important;
		-webkit-tap-highlight-color: transparent !important;
	}
</style>
