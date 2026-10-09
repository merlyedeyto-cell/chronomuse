<script>
	import { TrendingUp, Activity, ChevronRight } from 'lucide-svelte';
	import { playClickSound } from '$lib/soundEffects.js';

	let {
		moodData = [],
		selectedPeriod = 'all',
		onSelectMemory = () => {},
		onSelectDate = () => {}
	} = $props();

	// View mode: 'valence' (emotional positivity curve) or 'volume' (entry count per date)
	let viewMode = $state('valence'); // 'valence' | 'volume'
	let hoveredPoint = $state(null);
	let tooltipPos = $state({ x: 0, y: 0 });
	let isHoveringChart = $state(false);

	// Mood score mapping (0 to 100)
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
		return MOOD_COLORS[mood] || '#F43F8E';
	}

	// Process and aggregate moodData chronologically
	let aggregatedTimeline = $derived.by(() => {
		if (!moodData || moodData.length === 0) return [];

		// Group memories by date
		const dateMap = new Map();

		for (const memory of moodData) {
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

		// Convert to array and sort chronologically
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
			try {
				const parts = group.date.split('-');
				if (parts.length === 3) {
					const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
					displayDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
				}
			} catch (e) {}

			return {
				date: group.date,
				displayDate,
				count,
				avgScore,
				dominantMood,
				color: getMoodFillColor(dominantMood),
				memories: group.memories
			};
		});

		// Sort ascending by date
		points.sort((a, b) => a.date.localeCompare(b.date));
		return points;
	});

	// SVG Dimensions
	let containerWidth = $state(500);
	let chartWidth = $derived(containerWidth > 0 ? containerWidth : 500);
	const svgHeight = 215;
	const padding = { top: 32, right: 35, bottom: 42, left: 60 };

	let chartInnerWidth = $derived(Math.max(100, chartWidth - padding.left - padding.right));
	const chartInnerHeight = svgHeight - padding.top - padding.bottom;

	// Calculate Max Count for Volume View
	let maxVolume = $derived.by(() => {
		if (aggregatedTimeline.length === 0) return 5;
		const max = Math.max(...aggregatedTimeline.map(p => p.count));
		return Math.max(max, 3);
	});

	// Generate Coordinates for points
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
				x,
				y
			};
		});
	});

	// Smooth Cubic Bezier Spline Path Generator
	let { pathD, areaD } = $derived.by(() => {
		if (chartPoints.length === 0) return { pathD: '', areaD: '' };
		if (chartPoints.length === 1) {
			const p = chartPoints[0];
			const baselineY = padding.top + chartInnerHeight;
			const pD = `M ${p.x - 20} ${p.y} L ${p.x + 20} ${p.y}`;
			const aD = `M ${p.x - 20} ${baselineY} L ${p.x - 20} ${p.y} L ${p.x + 20} ${p.y} L ${p.x + 20} ${baselineY} Z`;
			return { pathD: pD, areaD: aD };
		}

		let d = `M ${chartPoints[0].x},${chartPoints[0].y}`;

		for (let i = 0; i < chartPoints.length - 1; i++) {
			const p0 = chartPoints[i === 0 ? 0 : i - 1];
			const p1 = chartPoints[i];
			const p2 = chartPoints[i + 1];
			const p3 = chartPoints[i + 2 >= chartPoints.length ? chartPoints.length - 1 : i + 2];

			// Smooth tension control points
			const cp1x = p1.x + (p2.x - p0.x) / 6;
			const cp1y = p1.y + (p2.y - p0.y) / 6;

			const cp2x = p2.x - (p3.x - p1.x) / 6;
			const cp2y = p2.y - (p3.y - p1.y) / 6;

			d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
		}

		const baselineY = padding.top + chartInnerHeight;
		const firstPoint = chartPoints[0];
		const lastPoint = chartPoints[chartPoints.length - 1];

		const areaPath = `${d} L ${lastPoint.x},${baselineY} L ${firstPoint.x},${baselineY} Z`;

		return { pathD: d, areaD: areaPath };
	});

	// Overall trend summary metrics
	let trendInsights = $derived.by(() => {
		if (aggregatedTimeline.length === 0) {
			return { label: 'Awaiting Data', sentiment: 'neutral', avg: 0, peak: null };
		}

		const avg = Math.round(
			aggregatedTimeline.reduce((sum, p) => sum + p.avgScore, 0) / aggregatedTimeline.length
		);

		let peak = aggregatedTimeline[0];
		for (const p of aggregatedTimeline) {
			if (p.avgScore > peak.avgScore) peak = p;
		}

		// Calculate slope of last few points vs earlier
		let label = 'Steady & Balanced';
		let sentiment = 'positive';
		if (aggregatedTimeline.length >= 2) {
			const firstHalf = aggregatedTimeline.slice(0, Math.ceil(aggregatedTimeline.length / 2));
			const secondHalf = aggregatedTimeline.slice(Math.ceil(aggregatedTimeline.length / 2));
			const avg1 = firstHalf.reduce((s, p) => s + p.avgScore, 0) / firstHalf.length;
			const avg2 = secondHalf.reduce((s, p) => s + p.avgScore, 0) / secondHalf.length;

			const diff = avg2 - avg1;
			if (diff > 5) {
				label = 'Positive Trajectory ↗';
				sentiment = 'positive';
			} else if (diff < -5) {
				label = 'Reflective Period ↘';
				sentiment = 'reflective';
			} else {
				label = 'Balanced Momentum ⟷';
				sentiment = 'positive';
			}
		}

		return { label, sentiment, avg, peak };
	});

	function handlePointClick(point) {
		playClickSound();
		if (point.memories && point.memories.length > 0) {
			onSelectDate(point.date, point.memories);
			if (point.memories.length === 1) {
				onSelectMemory(point.memories[0]);
			}
		}
	}

	function handleMouseMove(e, point) {
		const targetRect = e.currentTarget.getBoundingClientRect();
		tooltipPos = {
			x: targetRect.left + targetRect.width / 2,
			y: targetRect.top
		};
		hoveredPoint = point;
	}

	function handleMouseLeave() {
		hoveredPoint = null;
	}
</script>

<div class="bg-white border border-pink-100/90 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-[0_4px_20px_rgba(244,114,182,0.08)] animate-fade-in-up font-sans transition-all">
	<!-- Chart Header Bar -->
	<div class="flex flex-col xl:flex-row xl:items-center justify-between gap-3 mb-3.5 pb-3 border-b border-pink-50">
		<div class="flex items-center space-x-2.5 min-w-0">
			<div class="w-7 h-7 rounded-xl bg-pink-50 border border-pink-100 text-[#f43f8e] flex items-center justify-center shadow-2xs flex-shrink-0">
				<TrendingUp class="w-4 h-4 text-[#f43f8e]" strokeWidth={2.4} />
			</div>
			<div class="min-w-0">
				<div class="flex items-center flex-wrap gap-2">
					<h2 class="text-xs sm:text-sm font-black text-pink-950 whitespace-nowrap">Emotional Flow & Trend</h2>
					{#if aggregatedTimeline.length > 0}
						<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black tracking-wide uppercase border whitespace-nowrap flex-shrink-0 shadow-2xs {trendInsights.sentiment === 'positive' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-pink-50 text-[#f43f8e] border-pink-200'}">
							{trendInsights.label}
						</span>
					{/if}
				</div>
				<p class="text-[10px] sm:text-[11px] text-pink-400 font-bold truncate">Continuous emotional trajectory across your memories</p>
			</div>
		</div>

		<!-- Mode Switchers & Stats -->
		<div class="flex items-center gap-2 self-start xl:self-auto flex-shrink-0">
			<!-- View Mode Toggle -->
			<div class="flex items-center p-0.5 bg-[#fdf2f6] border border-pink-100/90 rounded-xl shadow-2xs">
				<button
					type="button"
					onclick={() => { playClickSound(); viewMode = 'valence'; }}
					class="px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all duration-200 cursor-pointer whitespace-nowrap {viewMode === 'valence' ? 'bg-[#f43f8e] text-white shadow-2xs' : 'text-pink-700 hover:text-[#f43f8e]'}"
				>
					Mood Valence
				</button>
				<button
					type="button"
					onclick={() => { playClickSound(); viewMode = 'volume'; }}
					class="px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all duration-200 cursor-pointer whitespace-nowrap {viewMode === 'volume' ? 'bg-[#f43f8e] text-white shadow-2xs' : 'text-pink-700 hover:text-[#f43f8e]'}"
				>
					Memory Volume
				</button>
			</div>
		</div>
	</div>

	<!-- Chart Area / Visualization -->
	{#if aggregatedTimeline.length > 0}
		<div class="relative w-full select-none" bind:clientWidth={containerWidth}>
			<div class="w-full">
				<svg
					viewBox="0 0 {chartWidth} {svgHeight}"
					class="w-full h-44 sm:h-48 overflow-visible drop-shadow-xs"
				>
					<defs>
						<!-- Soft pink/magenta gradient fill for line area -->
						<linearGradient id="moodAreaGradient" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stop-color="#f43f8e" stop-opacity="0.28" />
							<stop offset="50%" stop-color="#fb7185" stop-opacity="0.10" />
							<stop offset="100%" stop-color="#fce7f3" stop-opacity="0.0" />
						</linearGradient>

						<!-- Dynamic line stroke gradient -->
						<linearGradient id="moodLineGradient" x1="0" y1="0" x2="1" y2="0">
							<stop offset="0%" stop-color="#f43f8e" />
							<stop offset="40%" stop-color="#fb7185" />
							<stop offset="75%" stop-color="#ec4899" />
							<stop offset="100%" stop-color="#f43f8e" />
						</linearGradient>

						<!-- Glow filter for nodes -->
						<filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
							<feGaussianBlur stdDeviation="2.5" result="blur" />
							<feComposite in="SourceGraphic" in2="blur" operator="over" />
						</filter>
					</defs>

					<!-- Horizontal Reference Guidelines & Y-Axis Labels -->
					{#if viewMode === 'valence'}
						<!-- High Valence line (85) -->
						<line
							x1={padding.left}
							y1={padding.top + chartInnerHeight * 0.15}
							x2={chartWidth - padding.right}
							y2={padding.top + chartInnerHeight * 0.15}
							stroke="#fbcfe8"
							stroke-dasharray="3 3"
							stroke-width="1"
						/>
						<text
							x={padding.left - 10}
							y={padding.top + chartInnerHeight * 0.15 + 3.5}
							text-anchor="end"
							class="text-[10px] font-extrabold fill-emerald-600/90 tracking-normal select-none"
						>
							High
						</text>

						<!-- Neutral Valence line (50) -->
						<line
							x1={padding.left}
							y1={padding.top + chartInnerHeight * 0.5}
							x2={chartWidth - padding.right}
							y2={padding.top + chartInnerHeight * 0.5}
							stroke="#fce7f3"
							stroke-dasharray="4 4"
							stroke-width="1"
						/>
						<text
							x={padding.left - 10}
							y={padding.top + chartInnerHeight * 0.5 + 3.5}
							text-anchor="end"
							class="text-[10px] font-extrabold fill-slate-500 tracking-normal select-none"
						>
							Balanced
						</text>

						<!-- Low Valence line (20) -->
						<line
							x1={padding.left}
							y1={padding.top + chartInnerHeight * 0.8}
							x2={chartWidth - padding.right}
							y2={padding.top + chartInnerHeight * 0.8}
							stroke="#fee2e2"
							stroke-dasharray="3 3"
							stroke-width="1"
						/>
						<text
							x={padding.left - 10}
							y={padding.top + chartInnerHeight * 0.8 + 3.5}
							text-anchor="end"
							class="text-[10px] font-extrabold fill-rose-500/90 tracking-normal select-none"
						>
							Low
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
							x={padding.left - 10}
							y={padding.top + 3.5}
							text-anchor="end"
							class="text-[10px] font-extrabold fill-pink-500 tracking-normal select-none"
						>
							{maxVolume} entries
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
							x={padding.left - 10}
							y={padding.top + chartInnerHeight * 0.5 + 3.5}
							text-anchor="end"
							class="text-[10px] font-extrabold fill-pink-400 tracking-normal select-none"
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
						class="transition-all duration-300 ease-out"
					/>

					<!-- Glowing / Shadow Line Path -->
					<path
						d={pathD}
						fill="none"
						stroke="#f43f8e"
						stroke-width="6"
						stroke-linecap="round"
						stroke-linejoin="round"
						opacity="0.15"
					/>

					<!-- Main Gradient Stroke Line Path -->
					<path
						d={pathD}
						fill="none"
						stroke="url(#moodLineGradient)"
						stroke-width="3"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="transition-all duration-300 ease-out"
					/>

					<!-- Interactive Points & Axis Ticks -->
					{#each chartPoints as point, idx}
						<!-- Vertical Date Tick Line -->
						<line
							x1={point.x}
							y1={padding.top + chartInnerHeight}
							x2={point.x}
							y2={padding.top + chartInnerHeight + 4}
							stroke="#f472b6"
							stroke-width="1"
						/>

						<!-- X-Axis Label -->
						<text
							x={point.x}
							y={padding.top + chartInnerHeight + 18}
							text-anchor="middle"
							class="text-[10px] font-extrabold fill-pink-900/80 transition-all hover:fill-[#f43f8e] cursor-pointer select-none"
						>
							{point.displayDate}
						</text>

						<!-- Data Point Circle (Interactive) -->
						<g
							class="cursor-pointer group"
							onclick={() => handlePointClick(point)}
							onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handlePointClick(point); }}
							onmouseenter={(e) => handleMouseMove(e, point)}
							onmouseleave={handleMouseLeave}
							tabindex="0"
							role="button"
							aria-label={`View memories for ${point.displayDate}: ${point.dominantMood}`}
						>
							<!-- Pulsing halo for hovered point -->
							{#if hoveredPoint?.date === point.date}
								<circle
									cx={point.x}
									cy={point.y}
									r="14"
									fill={point.color}
									opacity="0.3"
									class="animate-ping"
								/>
							{/if}

							<!-- Outer Ring Glow -->
							<circle
								cx={point.x}
								cy={point.y}
								r={hoveredPoint?.date === point.date ? '8.5' : '6.5'}
								fill={point.color}
								stroke="#ffffff"
								stroke-width="2.5"
								class="transition-all duration-200 drop-shadow-sm"
								filter="url(#glow)"
							/>

							<!-- Center White Core Dot -->
							<circle
								cx={point.x}
								cy={point.y}
								r={hoveredPoint?.date === point.date ? '3.5' : '2.5'}
								fill="#ffffff"
								class="transition-all duration-200"
							/>

							<!-- Written Mood Label on Graph -->
							<text
								x={point.x}
								y={point.y < padding.top + 22 ? point.y + 20 : point.y - 11}
								text-anchor="middle"
								class="text-[10px] font-black drop-shadow-xs select-none transition-all group-hover:scale-105"
								fill={point.color}
								style="paint-order: stroke fill; stroke: #ffffff; stroke-width: 3.5px; stroke-linecap: round; stroke-linejoin: round;"
							>
								{viewMode === 'valence' ? point.dominantMood : `${point.count} ${point.count === 1 ? 'entry' : 'entries'}`}
							</text>

							<!-- Invisible Larger Hit Area for easy touch / hover on mobile & desktop -->
							<circle
								cx={point.x}
								cy={point.y}
								r="22"
								fill="transparent"
							/>
						</g>
					{/each}
				</svg>
			</div>
		</div>

		<!-- Interactive Hover Information Pill / Tooltip Details & Quick Summary Badges -->
		<div class="mt-2.5 pt-2.5 border-t border-pink-50 flex items-center justify-between gap-2 min-h-[32px] flex-wrap">
			{#if hoveredPoint}
				<div class="flex items-center space-x-2 bg-pink-50/80 border border-pink-200/80 px-2.5 py-1 rounded-xl animate-fade-in shadow-2xs">
					<span class="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-2xs" style="background-color: {hoveredPoint.color}"></span>
					<div class="flex items-center space-x-1.5 text-xs">
						<span class="font-extrabold text-pink-950">{hoveredPoint.date}</span>
						<span class="text-pink-300">·</span>
						<span class="font-black px-1.5 py-0.5 rounded-full text-[10px]" style="background-color: {hoveredPoint.color}20; color: {hoveredPoint.color};">
							{hoveredPoint.dominantMood}
						</span>
						<span class="text-pink-300">·</span>
						<span class="text-pink-600 font-bold">{hoveredPoint.count} {hoveredPoint.count === 1 ? 'entry' : 'entries'}</span>
					</div>
					<span class="text-[10px] text-[#f43f8e] font-black ml-1 flex items-center">
						View <ChevronRight class="w-3 h-3" />
					</span>
				</div>
			{/if}

			<!-- Quick Summary Badges -->
			<div class="flex items-center gap-2 ml-auto flex-wrap">
				<div class="flex items-center space-x-1 text-[10px] font-bold bg-[#fdf2f6] px-2.5 py-1 rounded-lg border border-pink-100 text-pink-800">
					<span class="text-pink-400">Tracked Days:</span>
					<span class="font-black text-[#f43f8e]">{aggregatedTimeline.length}</span>
				</div>
				{#if trendInsights.peak}
					<div class="flex items-center space-x-1.5 text-[10px] font-bold bg-[#fdf2f6] px-2.5 py-1 rounded-lg border border-pink-100 text-pink-800">
						<span class="text-pink-400">Peak Vibe:</span>
						<span class="w-2 h-2 rounded-full flex-shrink-0" style="background-color: {trendInsights.peak.color}"></span>
						<span class="font-black text-pink-950">{trendInsights.peak.dominantMood}</span>
						<span class="text-pink-400">({trendInsights.peak.displayDate})</span>
					</div>
				{/if}
			</div>
		</div>
	{:else}
		<!-- Empty Timeline State -->
		<div class="text-center py-10 bg-pink-50/40 rounded-2xl border border-dashed border-pink-200">
			<Activity class="w-8 h-8 text-pink-300 mx-auto mb-2 opacity-60" strokeWidth={1.8} />
			<p class="text-xs font-bold text-pink-900 mb-0.5">No Timeline Points Recorded</p>
			<p class="text-[11px] text-pink-400 font-medium">Capture memories across different dates to visualize your continuous emotional line graph.</p>
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
