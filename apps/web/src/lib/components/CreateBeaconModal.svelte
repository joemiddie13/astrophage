<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { animate } from 'motion';
	import gsap from 'gsap';
	import { onMount, onDestroy } from 'svelte';
	import * as chrono from 'chrono-node';

	let {
		canvasId,
		userUuid,
		onClose,
	}: {
		canvasId: string;
		userUuid: string;
		onClose: () => void;
	} = $props();

	const client = useConvexClient();
	const friends = useQuery(api.friendships.getFriends, {});

	// Sentence inputs
	let whatText = $state('');
	let whereText = $state('');
	let whenText = $state('');
	let durationText = $state('');
	let description = $state('');
	let showDetails = $state(false);
	let visibilityType = $state<'canvas' | 'direct'>('canvas');
	let selectedRecipients = $state<Set<string>>(new Set());
	let creating = $state(false);
	let error = $state('');

	// Parsed time state
	let parsedStart: Date | null = $state(null);
	let parsedEnd: Date | null = $state(null);
	let timePreview = $state('');
	let parseError = $state('');

	// Element refs
	let backdrop: HTMLDivElement;
	let panel: HTMLDivElement;
	let header: HTMLDivElement;
	let sentenceBlock: HTMLDivElement;
	let submitBtn: HTMLButtonElement;
	let signalSvg: SVGSVGElement;
	let ambientOrb: HTMLDivElement;

	// SVG ring refs
	let ring1: SVGCircleElement;
	let ring2: SVGCircleElement;
	let ring3: SVGCircleElement;
	let ring4: SVGCircleElement;
	let centerDot: SVGCircleElement;

	// Animation storage
	let entranceTl: gsap.core.Timeline | null = null;
	let pulseTl: gsap.core.Timeline | null = null;

	// Parallax state — $state for cursor reactivity in template
	let parallaxActive = $state(false);
	let grabbed = $state(false);
	let dragDistance = 0;
	let dragStartX = 0;
	let dragStartY = 0;
	let headerQX: ReturnType<typeof gsap.quickTo> | null = null;
	let headerQY: ReturnType<typeof gsap.quickTo> | null = null;
	let sentenceQX: ReturnType<typeof gsap.quickTo> | null = null;
	let sentenceQY: ReturnType<typeof gsap.quickTo> | null = null;
	let orbQX: ReturnType<typeof gsap.quickTo> | null = null;
	let orbQY: ReturnType<typeof gsap.quickTo> | null = null;

	// Ripple state
	let rippleInterval: ReturnType<typeof setInterval> | null = null;
	let rippleTweens: gsap.core.Tween[] = [];
	let rippleElements: SVGCircleElement[] = [];

	// Idle phase gate
	let idleActive = false;

	// Colors
	const ORANGE = '#FFA726';
	const TEAL = '#26A69A';

	// SVG center coordinates
	const CX = 200;
	const CY = 252;

	// Passive parallax shift amounts (px) — subtle, mouse-position-based
	const SHIFT_DOT = 1.5;
	const SHIFT_CONTENT = 3;
	const SHIFT_INNER = 8;
	const SHIFT_ORB = 10;
	const SHIFT_OUTER = 16;

	// Grab mode — panel drags + layers separate based on raw drag delta
	const PANEL_DRAG = 0.4;       // panel moves at 40% of drag distance
	const PANEL_TILT = 0.035;     // rotation degrees per pixel of drag
	// Layer separation factors (per pixel of drag delta)
	const GRAB_CONTENT = 0.1;
	const GRAB_INNER = 0.2;
	const GRAB_ORB = 0.3;
	const GRAB_OUTER = 0.45;
	const GRAB_DOT = 0.05;        // inverse direction

	// Snap-back
	const SNAP_DURATION = 0.8;
	const SNAP_EASE = 'elastic.out(1, 0.4)';

	// Base glass-panel shadow (preserved during glow animation)
	const BASE_SHADOW = '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)';

	// --- Time parsing ---

	function parseWhen(text: string): Date | null {
		const trimmed = text.trim();
		if (!trimmed) return null;
		const results = chrono.parse(trimmed, new Date(), { forwardDate: true });
		if (results.length > 0 && results[0].start) {
			return results[0].start.date();
		}
		return null;
	}

	function parseDuration(text: string, start: Date): Date | null {
		const trimmed = text.trim();
		if (!trimmed) return null;

		const regexPatterns: [RegExp, (m: RegExpMatchArray) => number][] = [
			[/^(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)$/i, (m) => parseFloat(m[1]) * 60],
			[/^(\d+)\s*(?:minutes?|mins?)$/i, (m) => parseInt(m[1])],
			[/^(\d+)h\s*(\d+)m$/i, (m) => parseInt(m[1]) * 60 + parseInt(m[2])],
			[/^(\d+(?:\.\d+)?)h$/i, (m) => parseFloat(m[1]) * 60],
			[/^(\d+)\s*(?:days?)$/i, (m) => parseInt(m[1]) * 60 * 24],
		];

		for (const [regex, toMinutes] of regexPatterns) {
			const match = trimmed.match(regex);
			if (match) {
				const minutes = toMinutes(match);
				return new Date(start.getTime() + minutes * 60 * 1000);
			}
		}

		const untilStripped = trimmed.replace(/^until\s+/i, '');
		const chronoResult = chrono.parse(untilStripped, start, { forwardDate: true });
		if (chronoResult.length > 0 && chronoResult[0].start) {
			return chronoResult[0].start.date();
		}

		return null;
	}

	function formatTimePreview(start: Date, end: Date): string {
		const now = new Date();
		const isToday = start.toDateString() === now.toDateString();
		const tomorrow = new Date(now);
		tomorrow.setDate(tomorrow.getDate() + 1);
		const isTomorrow = start.toDateString() === tomorrow.toDateString();

		const timeOpts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
		const startStr = start.toLocaleTimeString([], timeOpts);
		const endStr = end.toLocaleTimeString([], timeOpts);

		let dayLabel: string;
		if (isToday) dayLabel = 'Today';
		else if (isTomorrow) dayLabel = 'Tomorrow';
		else dayLabel = start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

		return `${dayLabel}, ${startStr} \u2013 ${endStr}`;
	}

	// Reactive time parsing (debounced to avoid running chrono-node on every keystroke)
	let parseTimer: ReturnType<typeof setTimeout>;
	$effect(() => {
		const _w = whenText;
		const _d = durationText;

		clearTimeout(parseTimer);
		parseTimer = setTimeout(() => {
			const start = parseWhen(_w);
			const effectiveStart = start ?? new Date();

			const end = parseDuration(_d, effectiveStart);
			const effectiveEnd = end ?? new Date(effectiveStart.getTime() + 2 * 60 * 60 * 1000);

			parsedStart = start;
			parsedEnd = end;

			if (_w.trim() && !start) {
				parseError = "Try \u2018in 30 min\u2019 or \u2018at 5pm\u2019";
				timePreview = '';
			} else if (_d.trim() && !end) {
				parseError = "Try \u20182 hours\u2019 or \u2018until 6pm\u2019";
				timePreview = '';
			} else {
				parseError = '';
				timePreview = formatTimePreview(effectiveStart, effectiveEnd);
			}
		}, 300);
	});

	function toggleRecipient(uuid: string) {
		const next = new Set(selectedRecipients);
		if (next.has(uuid)) next.delete(uuid);
		else next.add(uuid);
		selectedRecipients = next;
	}

	// --- Parallax ---

	function initParallax() {
		if (!header || !sentenceBlock || !ambientOrb) return;
		headerQX = gsap.quickTo(header, 'x', { duration: 0.6, ease: 'power3.out' });
		headerQY = gsap.quickTo(header, 'y', { duration: 0.6, ease: 'power3.out' });
		sentenceQX = gsap.quickTo(sentenceBlock, 'x', { duration: 0.6, ease: 'power3.out' });
		sentenceQY = gsap.quickTo(sentenceBlock, 'y', { duration: 0.6, ease: 'power3.out' });
		orbQX = gsap.quickTo(ambientOrb, 'x', { duration: 0.6, ease: 'power3.out' });
		orbQY = gsap.quickTo(ambientOrb, 'y', { duration: 0.6, ease: 'power3.out' });
		parallaxActive = true;
	}

	function handleMouseDown(e: MouseEvent) {
		if (!parallaxActive) return;
		// Don't grab on interactive elements (inputs, buttons, etc.)
		const target = e.target as HTMLElement;
		if (target.closest('input, button, textarea, select, a')) return;
		grabbed = true;
		dragDistance = 0;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
	}

	function handleMouseUp() {
		if (grabbed) {
			grabbed = false;
			snapBack();
		}
	}

	// Elastic snap-back — bungee cord bounce to origin
	function snapBack() {
		// Immediately null quickTo refs so mousemove doesn't call stale functions
		// while the snap-back tween is in flight (overwrite: 'auto' kills their internal tweens)
		headerQX = headerQY = sentenceQX = sentenceQY = orbQX = orbQY = null;

		// Panel bounces home
		if (panel) {
			gsap.to(panel, {
				x: 0, y: 0, rotationY: 0, rotationX: 0,
				transformPerspective: 800,
				duration: SNAP_DURATION, ease: SNAP_EASE, overwrite: 'auto',
			});
		}

		// Content layers bounce home — re-init quickTo after snap completes
		if (header) gsap.to(header, { x: 0, y: 0, duration: SNAP_DURATION, ease: SNAP_EASE, overwrite: 'auto', onComplete: initParallax });
		if (sentenceBlock) gsap.to(sentenceBlock, { x: 0, y: 0, duration: SNAP_DURATION, ease: SNAP_EASE, overwrite: 'auto' });
		if (ambientOrb) gsap.to(ambientOrb, { x: 0, y: 0, duration: SNAP_DURATION, ease: SNAP_EASE, overwrite: 'auto' });

		// SVG elements bounce home
		[ring1, ring2, ring3, ring4, centerDot].forEach(el => {
			if (el) gsap.to(el, {
				attr: { cx: CX, cy: CY },
				duration: SNAP_DURATION, ease: SNAP_EASE, overwrite: 'auto',
			});
		});

		// Ripples bounce home
		rippleElements.forEach(circle => {
			gsap.to(circle, {
				attr: { cx: CX, cy: CY },
				duration: SNAP_DURATION, ease: SNAP_EASE, overwrite: 'auto',
			});
		});
	}

	function handleMouseMove(e: MouseEvent) {
		if (!parallaxActive) return;
		if (grabbed) dragDistance++;

		const nx = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
		const ny = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);

		if (grabbed) {
			// --- GRAB MODE: bungee cord pull ---
			const dx = e.clientX - dragStartX;
			const dy = e.clientY - dragStartY;

			// Panel physically drags + 3D tilt
			if (panel) {
				gsap.to(panel, {
					x: dx * PANEL_DRAG,
					y: dy * PANEL_DRAG,
					rotationY: dx * PANEL_TILT,
					rotationX: -dy * PANEL_TILT,
					transformPerspective: 800,
					duration: 0.25, ease: 'power2.out', overwrite: 'auto',
				});
			}

			// Layer separation based on drag delta (relative to panel)
			headerQX?.(dx * GRAB_CONTENT);
			headerQY?.(dy * GRAB_CONTENT);
			sentenceQX?.(dx * GRAB_CONTENT);
			sentenceQY?.(dy * GRAB_CONTENT);

			orbQX?.(dx * GRAB_ORB);
			orbQY?.(dy * GRAB_ORB);

			// Center dot resists (inverse)
			if (centerDot) {
				gsap.to(centerDot, {
					attr: { cx: CX - dx * GRAB_DOT, cy: CY - dy * GRAB_DOT },
					duration: 0.25, ease: 'power2.out', overwrite: 'auto',
				});
			}

			// Inner rings separate
			[ring1, ring2].forEach(ring => {
				if (ring) gsap.to(ring, {
					attr: { cx: CX + dx * GRAB_INNER, cy: CY + dy * GRAB_INNER },
					duration: 0.25, ease: 'power2.out', overwrite: 'auto',
				});
			});

			// Outer rings separate most
			[ring3, ring4].forEach(ring => {
				if (ring) gsap.to(ring, {
					attr: { cx: CX + dx * GRAB_OUTER, cy: CY + dy * GRAB_OUTER },
					duration: 0.25, ease: 'power2.out', overwrite: 'auto',
				});
			});

			// Ripples follow outer rings
			rippleElements.forEach(circle => {
				gsap.to(circle, {
					attr: { cx: CX + dx * GRAB_OUTER, cy: CY + dy * GRAB_OUTER },
					duration: 0.25, ease: 'power2.out', overwrite: 'auto',
				});
			});
		} else {
			// --- PASSIVE MODE: subtle mouse-position parallax ---
			headerQX?.(nx * SHIFT_CONTENT);
			headerQY?.(ny * SHIFT_CONTENT);
			sentenceQX?.(nx * SHIFT_CONTENT);
			sentenceQY?.(ny * SHIFT_CONTENT);

			orbQX?.(nx * SHIFT_ORB);
			orbQY?.(ny * SHIFT_ORB);

			if (centerDot) {
				gsap.to(centerDot, {
					attr: { cx: CX - nx * SHIFT_DOT, cy: CY - ny * SHIFT_DOT },
					duration: 0.6, ease: 'power3.out', overwrite: 'auto',
				});
			}

			[ring1, ring2].forEach(ring => {
				if (ring) gsap.to(ring, {
					attr: { cx: CX + nx * SHIFT_INNER, cy: CY + ny * SHIFT_INNER },
					duration: 0.6, ease: 'power3.out', overwrite: 'auto',
				});
			});

			[ring3, ring4].forEach(ring => {
				if (ring) gsap.to(ring, {
					attr: { cx: CX + nx * SHIFT_OUTER, cy: CY + ny * SHIFT_OUTER },
					duration: 0.6, ease: 'power3.out', overwrite: 'auto',
				});
			});

			rippleElements.forEach(circle => {
				gsap.to(circle, {
					attr: { cx: CX + nx * SHIFT_OUTER, cy: CY + ny * SHIFT_OUTER },
					duration: 0.6, ease: 'power3.out', overwrite: 'auto',
				});
			});
		}
	}

	function handleMouseLeave() {
		if (grabbed) {
			grabbed = false;
			snapBack();
			return;
		}
		if (!parallaxActive) return;

		// Smooth reset for passive parallax (no bounce)
		headerQX?.(0); headerQY?.(0);
		sentenceQX?.(0); sentenceQY?.(0);
		orbQX?.(0); orbQY?.(0);

		[ring1, ring2, ring3, ring4, centerDot].forEach(el => {
			if (el) gsap.to(el, {
				attr: { cx: CX, cy: CY },
				duration: 0.6, ease: 'power3.out', overwrite: 'auto',
			});
		});

		rippleElements.forEach(circle => {
			gsap.to(circle, {
				attr: { cx: CX, cy: CY },
				duration: 0.6, ease: 'power3.out', overwrite: 'auto',
			});
		});
	}

	// --- Ripple Emanation ---

	function spawnRipple(burst = false) {
		if (!signalSvg) return;
		if (!burst && rippleElements.length >= 2) return;

		const color = visibilityType === 'direct' ? TEAL : ORANGE;
		const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle') as SVGCircleElement;
		circle.setAttribute('cx', String(CX));
		circle.setAttribute('cy', String(CY));
		circle.setAttribute('r', '0');
		circle.setAttribute('fill', 'none');
		circle.setAttribute('stroke', color);
		circle.setAttribute('stroke-width', burst ? '1.2' : '0.8');
		circle.setAttribute('opacity', burst ? '0.3' : '0.12');

		signalSvg.insertBefore(circle, signalSvg.firstChild);
		rippleElements.push(circle);

		const duration = burst ? 0.8 : 3;
		const targetR = burst ? 400 : 280;

		const tween = gsap.to(circle, {
			attr: { r: targetR },
			opacity: 0,
			duration,
			ease: burst ? 'power2.out' : 'power1.out',
			onComplete: () => {
				circle.remove();
				rippleElements = rippleElements.filter(el => el !== circle);
				rippleTweens = rippleTweens.filter(t => t !== tween);
			},
		});
		rippleTweens.push(tween);
	}

	function startRipples() {
		spawnRipple();
		rippleInterval = setInterval(() => spawnRipple(), 2500);
	}

	function stopRipples() {
		if (rippleInterval) {
			clearInterval(rippleInterval);
			rippleInterval = null;
		}
		rippleTweens.forEach(t => t.kill());
		rippleTweens = [];
		rippleElements.forEach(el => el.remove());
		rippleElements = [];
	}

	// --- Unified Radiating Pulse ---
	// Single heartbeat timeline: wave emanates from center dot → rings → panel border

	function createPulseTimeline() {
		if (pulseTl) { pulseTl.kill(); pulseTl = null; }
		if (!centerDot) return;

		const rgb = visibilityType === 'direct' ? '38, 166, 154' : '255, 167, 38';
		pulseTl = gsap.timeline({ repeat: -1, repeatDelay: 1.5 });

		// Center dot: heartbeat origin — quick bright flash
		pulseTl.to(centerDot, {
			attr: { r: 10 }, opacity: 0.85,
			duration: 0.3, ease: 'power2.in',
		}, 0);
		pulseTl.to(centerDot, {
			attr: { r: 6 }, opacity: 0.4,
			duration: 0.5, ease: 'power2.out',
		}, 0.3);

		// Rings: staggered outward wave
		const ringConfigs = [
			{ el: ring1, baseR: 40, baseOp: 0.15, peakR: 48, peakOp: 0.28 },
			{ el: ring2, baseR: 80, baseOp: 0.10, peakR: 88, peakOp: 0.22 },
			{ el: ring3, baseR: 130, baseOp: 0.06, peakR: 138, peakOp: 0.16 },
			{ el: ring4, baseR: 190, baseOp: 0.03, peakR: 198, peakOp: 0.12 },
		];

		ringConfigs.forEach(({ el, baseR, baseOp, peakR, peakOp }, i) => {
			if (!el) return;
			const delay = 0.1 * (i + 1);
			pulseTl!.to(el, {
				attr: { r: peakR }, opacity: peakOp,
				duration: 0.3, ease: 'power2.in',
			}, delay);
			pulseTl!.to(el, {
				attr: { r: baseR }, opacity: baseOp,
				duration: 0.5, ease: 'power2.out',
			}, delay + 0.3);
		});

		// Orb brightens as wave passes through
		if (ambientOrb) {
			pulseTl.to(ambientOrb, {
				opacity: 1.0, duration: 0.35, ease: 'power2.in',
			}, 0.15);
			pulseTl.to(ambientOrb, {
				opacity: 0.7, duration: 0.5, ease: 'power2.out',
			}, 0.5);
		}

		// Panel glow: wave reaches the border
		if (panel) {
			pulseTl.to(panel, {
				boxShadow: `${BASE_SHADOW}, 0 0 30px rgba(${rgb}, 0.4), inset 0 0 25px rgba(${rgb}, 0.08)`,
				duration: 0.3, ease: 'power2.in',
			}, 0.45);
			pulseTl.to(panel, {
				boxShadow: `${BASE_SHADOW}, 0 0 8px rgba(${rgb}, 0.1), inset 0 0 8px rgba(${rgb}, 0.02)`,
				duration: 0.5, ease: 'power2.out',
			}, 0.75);
		}

		// Panel scale: subtle bump synced with glow
		if (panel) {
			pulseTl.to(panel, {
				scale: 1.006, duration: 0.25, ease: 'power2.in',
			}, 0.45);
			pulseTl.to(panel, {
				scale: 1, duration: 0.45, ease: 'power2.out',
			}, 0.7);
		}
	}

	function killPulse() {
		if (pulseTl) { pulseTl.kill(); pulseTl = null; }
	}

	// --- Lifecycle ---

	onMount(() => {
		// Backdrop fade
		animate(backdrop, { opacity: [0, 1] }, { duration: 0.3 });

		// Entrance timeline
		const rings = [ring1, ring2, ring3, ring4].filter(Boolean);
		const fields = sentenceBlock?.children ? Array.from(sentenceBlock.children) : [];

		entranceTl = gsap.timeline();

		// Panel scale + opacity
		entranceTl.fromTo(panel,
			{ scale: 0.92, opacity: 0 },
			{ scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.4)' },
			0
		);

		// Center dot pops in first
		entranceTl.fromTo(centerDot,
			{ attr: { r: 0 }, opacity: 0 },
			{ attr: { r: 6 }, opacity: 0.4, duration: 0.3, ease: 'back.out(2)' },
			0.1
		);

		// Rings expand outward with stagger
		rings.forEach((ring, i) => {
			const targetR = [40, 80, 130, 190][i];
			entranceTl!.fromTo(ring,
				{ attr: { r: 0 }, opacity: 0 },
				{
					attr: { r: targetR },
					opacity: [0.15, 0.10, 0.06, 0.03][i],
					duration: 0.4,
					ease: 'power2.out'
				},
				0.15 + i * 0.08
			);
		});

		// Header slides up + fades
		entranceTl.fromTo(header,
			{ y: 12, opacity: 0 },
			{ y: 0, opacity: 1, duration: 0.35, ease: 'power2.out' },
			0.25
		);

		// Sentence lines cascade
		fields.forEach((field, i) => {
			entranceTl!.fromTo(field as HTMLElement,
				{ y: 10, opacity: 0 },
				{ y: 0, opacity: 1, duration: 0.3, ease: 'power2.out' },
				0.32 + i * 0.06
			);
		});

		// Start all idle systems after entrance completes
		entranceTl.call(() => {
			startIdlePulse();
			startRipples();
			initParallax();
		}, [], '+=0');
	});

	function startIdlePulse() {
		idleActive = true;
		createPulseTimeline();
	}

	// Visibility toggle color shift
	$effect(() => {
		const color = visibilityType === 'direct' ? TEAL : ORANGE;
		const rings = [ring1, ring2, ring3, ring4].filter(Boolean);

		// Ring stroke color
		rings.forEach((ring) => {
			gsap.to(ring, {
				attr: { stroke: color },
				duration: 0.4,
				ease: 'power2.inOut',
			});
		});

		// Center dot fill
		if (centerDot) {
			gsap.to(centerDot, {
				attr: { fill: color },
				duration: 0.4,
				ease: 'power2.inOut',
			});
		}

		// Flash ring1 for feedback
		if (ring1) {
			gsap.to(ring1, {
				opacity: 0.35,
				duration: 0.15,
				yoyo: true,
				repeat: 1,
				ease: 'power1.inOut',
			});
		}

		// Active ripple colors
		rippleElements.forEach(circle => {
			gsap.to(circle, {
				attr: { stroke: color },
				duration: 0.4,
				ease: 'power2.inOut',
			});
		});

		// Recreate pulse timeline with new color (only after idle phase started)
		if (idleActive) {
			createPulseTimeline();
		}
	});

	async function createBeacon() {
		if (!whatText.trim()) { error = 'What are you up to?'; return; }
		if (visibilityType === 'direct' && selectedRecipients.size === 0) {
			error = 'Select at least one friend for a direct beacon';
			return;
		}

		const start = parsedStart ?? new Date();
		const end = parsedEnd ?? new Date(start.getTime() + 2 * 60 * 60 * 1000);

		if (start.getTime() >= end.getTime()) {
			error = 'End time must be after start time';
			return;
		}

		creating = true;
		error = '';

		// Kill all idle systems
		killPulse();
		idleActive = false;
		parallaxActive = false;
		grabbed = false;

		// Stop ambient ripples, then launch burst
		stopRipples();
		for (let i = 0; i < 3; i++) {
			setTimeout(() => spawnRipple(true), i * 100);
		}

		// Build broadcast timeline
		const rings = [ring1, ring2, ring3, ring4].filter(Boolean);
		const broadcastTl = gsap.timeline();

		// Button press
		broadcastTl.to(submitBtn, {
			scale: 0.95,
			duration: 0.1,
			ease: 'power2.in',
		}, 0);

		// Rings blast outward
		rings.forEach((ring, i) => {
			broadcastTl.to(ring, {
				attr: { r: 300 + i * 40 },
				opacity: 0,
				duration: 0.6,
				ease: 'power2.out',
			}, 0.1 + i * 0.04);
		});

		// Center dot blast
		broadcastTl.to(centerDot, {
			attr: { r: 20 },
			opacity: 0,
			duration: 0.4,
			ease: 'power2.out',
		}, 0.1);

		// Panel dissolve
		broadcastTl.to(panel, {
			scale: 1.05,
			opacity: 0,
			duration: 0.4,
			ease: 'power2.in',
		}, 0.3);

		// Backdrop fade
		broadcastTl.to(backdrop, {
			opacity: 0,
			duration: 0.3,
		}, 0.4);

		try {
			await Promise.all([
				client.mutation(api.objects.create, {
					canvasId: canvasId as any,
					type: 'beacon',
					position: { x: 400 + Math.random() * 600, y: 300 + Math.random() * 400 },
					size: { w: 260, h: 100 },
					content: {
						title: whatText.trim(),
						description: description.trim() || undefined,
						locationAddress: whereText.trim() || undefined,
						startTime: start.getTime(),
						endTime: end.getTime(),
						visibilityType,
						directRecipients: visibilityType === 'direct' ? [...selectedRecipients] : undefined,
					},
					expiresAt: end.getTime(),
				}),
				new Promise<void>((resolve) => {
					broadcastTl.eventCallback('onComplete', () => resolve());
				}),
			]);
			onClose();
		} catch (err: any) {
			broadcastTl.reverse();
			broadcastTl.eventCallback('onReverseComplete', () => {
				startIdlePulse();
				startRipples();
				initParallax();
			});
			const msg = err.message || '';
			if (msg.includes('Start time cannot be in the past')) {
				error = 'That time has already passed — try a future time like "in 30 min" or "tomorrow at 3pm"';
			} else if (msg.includes('Start time must be before end time')) {
				error = 'The end time needs to be after the start time — try a longer duration';
			} else if (msg.includes('Beacon duration cannot exceed')) {
				error = 'Beacons can last up to 90 days — try a shorter duration';
			} else if (msg.includes('cannot expire more than 90 days')) {
				error = 'That\'s too far out — beacons can be scheduled up to 90 days ahead';
			} else {
				error = 'Something went wrong broadcasting your beacon. Try again!';
			}
			creating = false;
		}
	}

	function handleClose() {
		stopRipples();
		killPulse();
		parallaxActive = false;
		grabbed = false;

		const closeTl = gsap.timeline({
			onComplete: () => onClose(),
		});

		closeTl.to(panel, {
			scale: 0.95,
			opacity: 0,
			duration: 0.25,
			ease: 'power2.in',
		}, 0);

		closeTl.to(backdrop, {
			opacity: 0,
			duration: 0.2,
		}, 0.1);
	}

	onDestroy(() => {
		killPulse();
		if (entranceTl) { entranceTl.kill(); entranceTl = null; }
		stopRipples();
		parallaxActive = false;
		grabbed = false;
		idleActive = false;
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	bind:this={backdrop}
	class="fixed inset-0 z-50 flex items-center justify-center glass-backdrop"
	onclick={(e) => { if (e.target === e.currentTarget && dragDistance < 5) handleClose(); }}
	onmousemove={handleMouseMove}
	onmouseleave={handleMouseLeave}
	onmousedown={handleMouseDown}
	onmouseup={handleMouseUp}
	style:cursor={grabbed ? 'grabbing' : parallaxActive ? 'grab' : undefined}
	style:user-select={grabbed ? 'none' : undefined}
>
	<div bind:this={panel} class="glass-panel rounded-2xl w-full max-w-md mx-4 overflow-hidden max-h-[85vh] flex flex-col relative" style="will-change: transform, box-shadow;">

		<!-- Ambient orb -->
		<div bind:this={ambientOrb} class="ambient-orb {visibilityType === 'direct' ? 'direct' : ''}"></div>

		<!-- SVG Signal Ring Layer -->
		<svg
			bind:this={signalSvg}
			class="absolute inset-0 w-full h-full pointer-events-none"
			viewBox="0 0 400 600"
			preserveAspectRatio="xMidYMid meet"
			aria-hidden="true"
		>
			<circle bind:this={ring1} cx="200" cy="252" r="40" fill="none" stroke={ORANGE} stroke-width="1.8" opacity="0.15" />
			<circle bind:this={ring2} cx="200" cy="252" r="80" fill="none" stroke={ORANGE} stroke-width="1.5" opacity="0.10" />
			<circle bind:this={ring3} cx="200" cy="252" r="130" fill="none" stroke={ORANGE} stroke-width="1.2" opacity="0.06" />
			<circle bind:this={ring4} cx="200" cy="252" r="190" fill="none" stroke={ORANGE} stroke-width="1.0" opacity="0.03" />
			<circle bind:this={centerDot} cx="200" cy="252" r="6" fill={ORANGE} opacity="0.4" />
		</svg>

		<div class="p-6 flex-shrink-0 relative z-10">
			<div bind:this={header} class="flex items-center justify-between mb-5">
				<h2 class="text-xl font-semibold text-white" style="font-family: 'Geist Mono', monospace;">Broadcast Signal</h2>
				<button
					onclick={handleClose}
					class="text-white/40 hover:text-white/70 transition cursor-pointer"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

		</div>

		<div bind:this={sentenceBlock} class="flex-1 overflow-y-auto px-6 pb-6 relative z-10" style="display: flex; flex-direction: column; gap: 0.75rem;">

			<!-- Line 1: Let's [what] at [where] -->
			<div class="flex items-baseline gap-1.5 flex-wrap">
				<span class="sentence-text">Let's</span>
				<input
					type="text"
					bind:value={whatText}
					placeholder="pickup basketball"
					maxlength="200"
					class="sentence-input flex-1 min-w-[80px] {visibilityType === 'direct' ? 'direct-mode' : ''}"
				/>
				<span class="sentence-text">at</span>
				<input
					type="text"
					bind:value={whereText}
					placeholder="the park"
					maxlength="200"
					class="sentence-input flex-1 min-w-[80px] {visibilityType === 'direct' ? 'direct-mode' : ''}"
				/>
			</div>

			<!-- Line 2: [when] for [duration] -->
			<div class="flex items-baseline gap-1.5 flex-wrap">
				<input
					type="text"
					bind:value={whenText}
					placeholder="in 30 min"
					maxlength="100"
					class="sentence-input flex-1 min-w-[80px] {visibilityType === 'direct' ? 'direct-mode' : ''}"
				/>
				<span class="sentence-text">for</span>
				<input
					type="text"
					bind:value={durationText}
					placeholder="2 hours"
					maxlength="100"
					class="sentence-input flex-1 min-w-[80px] {visibilityType === 'direct' ? 'direct-mode' : ''}"
				/>
			</div>

			<!-- Line 3: Time preview -->
			<div class="h-5 flex items-center">
				{#if parseError}
					<span class="text-sm text-white/40">{parseError}</span>
				{:else if timePreview}
					<span class="time-preview {visibilityType === 'direct' ? 'direct' : ''}">{timePreview}</span>
				{/if}
			</div>

			<!-- Line 4: Visibility toggle -->
			<div class="flex items-baseline gap-1.5 flex-wrap">
				<span class="sentence-text">with</span>
				<button
					onclick={() => { visibilityType = visibilityType === 'canvas' ? 'direct' : 'canvas'; }}
					class="visibility-toggle cursor-pointer {visibilityType === 'direct' ? 'direct' : ''}"
				>
					{visibilityType === 'canvas' ? 'everyone here' : 'select friends'}
				</button>
			</div>

			<!-- Line 5: Friend chips (direct mode) -->
			{#if visibilityType === 'direct' && friends.data && friends.data.length > 0}
				<div class="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
					{#each friends.data as friend (friend.uuid)}
						<button
							onclick={() => toggleRecipient(friend.uuid)}
							class="friend-chip cursor-pointer {selectedRecipients.has(friend.uuid) ? 'selected' : ''}"
						>
							{friend.displayName}
						</button>
					{/each}
				</div>
			{/if}

			<!-- Line 6: Add details expander -->
			<div>
				{#if !showDetails}
					<button
						onclick={() => { showDetails = true; }}
						class="text-sm text-white/30 hover:text-white/50 transition cursor-pointer"
					>
						+ Add details
					</button>
				{:else}
					<textarea
						bind:value={description}
						placeholder="Any extra info..."
						rows="2"
						maxlength="500"
						class="w-full px-3 py-2 rounded-xl glass-input text-base resize-none"
					></textarea>
				{/if}
			</div>

			<!-- Line 7: Error message -->
			{#if error}
				<p class="text-sm text-red-400">{error}</p>
			{/if}

			<!-- Line 8: Submit button -->
			<button
				bind:this={submitBtn}
				onclick={createBeacon}
				disabled={creating || !whatText.trim()}
				class="lego-btn lego-btn-full {visibilityType === 'direct' ? 'lego-teal' : 'lego-orange'} cursor-pointer"
			>
				{creating ? 'Broadcasting...' : 'Broadcast Beacon'}
			</button>
		</div>
	</div>
</div>

<style>
	.sentence-input {
		background: transparent;
		border: none;
		border-bottom: 1.5px solid rgba(255, 255, 255, 0.15);
		color: white;
		font-size: 1.05rem;
		padding: 0.25rem 0.125rem;
		outline: none;
		transition: border-color 0.2s, box-shadow 0.2s;
		font-family: 'Geist Mono', monospace;
	}

	.sentence-input::placeholder {
		color: rgba(255, 255, 255, 0.25);
		font-style: italic;
	}

	.sentence-input:focus {
		border-bottom-color: #FFA726;
		box-shadow: 0 2px 8px rgba(255, 167, 38, 0.3);
	}

	.sentence-input.direct-mode:focus {
		border-bottom-color: #26A69A;
		box-shadow: 0 2px 8px rgba(38, 166, 154, 0.3);
	}

	.sentence-text {
		color: rgba(255, 255, 255, 0.4);
		font-size: 1.05rem;
		white-space: nowrap;
		font-family: 'Geist Mono', monospace;
	}

	.visibility-toggle {
		background: none;
		border: none;
		color: #FFA726;
		font-size: 1.05rem;
		font-weight: 600;
		padding: 0;
		text-shadow: 0 0 12px rgba(255, 167, 38, 0.4);
		transition: color 0.3s, text-shadow 0.3s;
		font-family: 'Geist Mono', monospace;
	}

	.visibility-toggle:hover {
		text-shadow: 0 0 18px rgba(255, 167, 38, 0.6);
	}

	.visibility-toggle.direct {
		color: #26A69A;
		text-shadow: 0 0 12px rgba(38, 166, 154, 0.4);
	}

	.visibility-toggle.direct:hover {
		text-shadow: 0 0 18px rgba(38, 166, 154, 0.6);
	}

	.time-preview {
		font-size: 0.85rem;
		color: #FFA726;
		text-shadow: 0 0 8px rgba(255, 167, 38, 0.3);
		font-family: 'Geist Mono', monospace;
		letter-spacing: 0.02em;
	}

	.time-preview.direct {
		color: #26A69A;
		text-shadow: 0 0 8px rgba(38, 166, 154, 0.3);
	}

	.friend-chip {
		padding: 0.25rem 0.75rem;
		border-radius: 9999px;
		font-size: 0.9rem;
		background: rgba(255, 255, 255, 0.06);
		color: rgba(255, 255, 255, 0.6);
		border: 1px solid rgba(255, 255, 255, 0.1);
		transition: all 0.2s;
		font-family: 'Geist Mono', monospace;
	}

	.friend-chip:hover {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.8);
	}

	.friend-chip.selected {
		background: rgba(38, 166, 154, 0.15);
		color: #26A69A;
		border-color: rgba(38, 166, 154, 0.4);
	}

	.ambient-orb {
		position: absolute;
		top: 40%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 500px;
		height: 500px;
		border-radius: 50%;
		background: radial-gradient(circle, rgba(255, 167, 38, 0.12) 0%, rgba(255, 167, 38, 0.06) 25%, rgba(255, 167, 38, 0.02) 50%, transparent 70%);
		pointer-events: none;
		transition: background 0.4s ease;
		will-change: transform, opacity;
	}

	.ambient-orb.direct {
		background: radial-gradient(circle, rgba(38, 166, 154, 0.12) 0%, rgba(38, 166, 154, 0.06) 25%, rgba(38, 166, 154, 0.02) 50%, transparent 70%);
	}

</style>
