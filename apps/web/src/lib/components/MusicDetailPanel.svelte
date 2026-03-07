<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import gsap from 'gsap';
	import { animate } from 'motion';
	import { onMount, onDestroy } from 'svelte';

	let {
		music,
		isOwner,
		onClose,
		onDeleted,
	}: {
		music: {
			_id: string;
			content: {
				url: string;
				platform: string;
				title: string;
				artist: string;
				thumbnailUrl?: string;
				embedUrl: string;
			};
			creatorId: string;
		};
		isOwner: boolean;
		onClose: () => void;
		onDeleted: () => void;
	} = $props();

	const client = useConvexClient();

	let deleting = $state(false);

	// Platform theming
	const PLATFORM_CONFIG: Record<string, { color: string; rgb: string; label: string; embedHeight: number }> = {
		spotify: { color: '#1DB954', rgb: '29, 185, 84', label: 'Spotify', embedHeight: 152 },
		youtube: { color: '#FF0000', rgb: '255, 0, 0', label: 'YouTube', embedHeight: 200 },
		'apple-music': { color: '#FC3C44', rgb: '252, 60, 68', label: 'Apple Music', embedHeight: 175 },
	};

	const config = $derived(PLATFORM_CONFIG[music.content.platform] ?? PLATFORM_CONFIG.spotify);

	// Element refs
	let backdrop: HTMLDivElement;
	let panel: HTMLDivElement;
	let header: HTMLDivElement;
	let embedFrame: HTMLDivElement;
	let contentBlock: HTMLDivElement;
	let ambientOrb: HTMLDivElement;

	// Animation storage
	let entranceTl: gsap.core.Timeline | null = null;

	// Parallax
	let parallaxActive = $state(false);
	let grabbed = $state(false);
	let dragDistance = 0;
	let dragStartX = 0;
	let dragStartY = 0;
	let headerQX: ReturnType<typeof gsap.quickTo> | null = null;
	let headerQY: ReturnType<typeof gsap.quickTo> | null = null;
	let contentQX: ReturnType<typeof gsap.quickTo> | null = null;
	let contentQY: ReturnType<typeof gsap.quickTo> | null = null;
	let orbQX: ReturnType<typeof gsap.quickTo> | null = null;
	let orbQY: ReturnType<typeof gsap.quickTo> | null = null;
	let embedQX: ReturnType<typeof gsap.quickTo> | null = null;
	let embedQY: ReturnType<typeof gsap.quickTo> | null = null;

	const SNAP_DURATION = 0.8;
	const SNAP_EASE = 'elastic.out(1, 0.4)';
	const BASE_SHADOW = '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)';
	const SHIFT_CONTENT = 3;
	const SHIFT_EMBED = 4;
	const SHIFT_ORB = 10;
	const PANEL_DRAG = 0.4;
	const PANEL_TILT = 0.035;
	const GRAB_CONTENT = 0.1;
	const GRAB_EMBED = 0.08;
	const GRAB_ORB = 0.3;

	function initParallax() {
		if (!header || !contentBlock || !ambientOrb || !embedFrame) return;
		headerQX = gsap.quickTo(header, 'x', { duration: 0.6, ease: 'power3.out' });
		headerQY = gsap.quickTo(header, 'y', { duration: 0.6, ease: 'power3.out' });
		contentQX = gsap.quickTo(contentBlock, 'x', { duration: 0.6, ease: 'power3.out' });
		contentQY = gsap.quickTo(contentBlock, 'y', { duration: 0.6, ease: 'power3.out' });
		orbQX = gsap.quickTo(ambientOrb, 'x', { duration: 0.6, ease: 'power3.out' });
		orbQY = gsap.quickTo(ambientOrb, 'y', { duration: 0.6, ease: 'power3.out' });
		embedQX = gsap.quickTo(embedFrame, 'x', { duration: 0.6, ease: 'power3.out' });
		embedQY = gsap.quickTo(embedFrame, 'y', { duration: 0.6, ease: 'power3.out' });
		parallaxActive = true;
	}

	function handleMouseDown(e: MouseEvent) {
		if (!parallaxActive) return;
		const target = e.target as HTMLElement;
		if (target.closest('button') || target.closest('iframe')) return;
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

	function snapBack() {
		headerQX = headerQY = contentQX = contentQY = orbQX = orbQY = embedQX = embedQY = null;
		if (panel) {
			gsap.to(panel, {
				x: 0, y: 0, rotationY: 0, rotationX: 0,
				transformPerspective: 800,
				duration: SNAP_DURATION, ease: SNAP_EASE, overwrite: 'auto',
			});
		}
		if (header) gsap.to(header, { x: 0, y: 0, duration: SNAP_DURATION, ease: SNAP_EASE, overwrite: 'auto', onComplete: initParallax });
		if (contentBlock) gsap.to(contentBlock, { x: 0, y: 0, duration: SNAP_DURATION, ease: SNAP_EASE, overwrite: 'auto' });
		if (ambientOrb) gsap.to(ambientOrb, { x: 0, y: 0, duration: SNAP_DURATION, ease: SNAP_EASE, overwrite: 'auto' });
		if (embedFrame) gsap.to(embedFrame, { x: 0, y: 0, duration: SNAP_DURATION, ease: SNAP_EASE, overwrite: 'auto' });
	}

	function handleMouseMove(e: MouseEvent) {
		if (!parallaxActive) return;
		if (grabbed) dragDistance++;
		const nx = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
		const ny = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
		if (grabbed) {
			const dx = e.clientX - dragStartX;
			const dy = e.clientY - dragStartY;
			if (panel) {
				gsap.to(panel, {
					x: dx * PANEL_DRAG, y: dy * PANEL_DRAG,
					rotationY: dx * PANEL_TILT, rotationX: -dy * PANEL_TILT,
					transformPerspective: 800,
					duration: 0.25, ease: 'power2.out', overwrite: 'auto',
				});
			}
			headerQX?.(dx * GRAB_CONTENT);
			headerQY?.(dy * GRAB_CONTENT);
			contentQX?.(dx * GRAB_CONTENT);
			contentQY?.(dy * GRAB_CONTENT);
			orbQX?.(dx * GRAB_ORB);
			orbQY?.(dy * GRAB_ORB);
			embedQX?.(dx * GRAB_EMBED);
			embedQY?.(dy * GRAB_EMBED);
		} else {
			headerQX?.(nx * SHIFT_CONTENT);
			headerQY?.(ny * SHIFT_CONTENT);
			contentQX?.(nx * SHIFT_CONTENT);
			contentQY?.(ny * SHIFT_CONTENT);
			orbQX?.(nx * SHIFT_ORB);
			orbQY?.(ny * SHIFT_ORB);
			embedQX?.(nx * SHIFT_EMBED);
			embedQY?.(ny * SHIFT_EMBED);
		}
	}

	function handleMouseLeave() {
		if (grabbed) { grabbed = false; snapBack(); return; }
		if (!parallaxActive) return;
		headerQX?.(0); headerQY?.(0);
		contentQX?.(0); contentQY?.(0);
		orbQX?.(0); orbQY?.(0);
		embedQX?.(0); embedQY?.(0);
	}

	async function deleteMusic() {
		deleting = true;
		try {
			await client.mutation(api.objects.remove, { id: music._id as any });
			onDeleted();
		} catch (err) {
			console.error('Failed to delete music:', err);
		} finally {
			deleting = false;
		}
	}

	function openOriginal() {
		window.open(music.content.url, '_blank', 'noopener,noreferrer');
	}

	function handleClose() {
		parallaxActive = false;
		grabbed = false;
		const closeTl = gsap.timeline({ onComplete: () => onClose() });
		closeTl.to(panel, { scale: 0.95, opacity: 0, duration: 0.25, ease: 'power2.in' }, 0);
		closeTl.to(backdrop, { opacity: 0, duration: 0.2 }, 0.1);
	}

	onMount(() => {
		animate(backdrop, { opacity: [0, 1] }, { duration: 0.3 });
		const sections = contentBlock?.children ? Array.from(contentBlock.children) : [];
		entranceTl = gsap.timeline();
		entranceTl.fromTo(panel,
			{ scale: 0.92, opacity: 0 },
			{ scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.4)' },
			0
		);
		entranceTl.fromTo(embedFrame,
			{ y: 30, opacity: 0 },
			{ y: 0, opacity: 1, duration: 0.45, ease: 'power2.out' },
			0.12
		);
		entranceTl.fromTo(header,
			{ y: 12, opacity: 0 },
			{ y: 0, opacity: 1, duration: 0.35, ease: 'power2.out' },
			0.25
		);
		sections.forEach((section, i) => {
			entranceTl!.fromTo(section as HTMLElement,
				{ y: 10, opacity: 0 },
				{ y: 0, opacity: 1, duration: 0.3, ease: 'power2.out' },
				0.32 + i * 0.06
			);
		});
		entranceTl.to(panel, {
			boxShadow: `${BASE_SHADOW}, 0 0 40px rgba(${config.rgb}, 0.3), inset 0 0 20px rgba(${config.rgb}, 0.06)`,
			duration: 0.4, ease: 'power2.in',
		}, 0.3);
		entranceTl.to(panel, {
			boxShadow: `${BASE_SHADOW}, 0 0 8px rgba(${config.rgb}, 0.1), inset 0 0 8px rgba(${config.rgb}, 0.02)`,
			duration: 0.6, ease: 'power2.out',
		}, 0.7);
		entranceTl.call(() => { initParallax(); }, [], '+=0');
	});

	onDestroy(() => {
		if (entranceTl) { entranceTl.kill(); entranceTl = null; }
		parallaxActive = false;
		grabbed = false;
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	bind:this={backdrop}
	class="fixed inset-0 z-50 flex items-end sm:items-center justify-center glass-backdrop"
	onclick={(e) => { if (e.target === e.currentTarget && dragDistance < 5) handleClose(); }}
	onmousemove={handleMouseMove}
	onmouseleave={handleMouseLeave}
	onmousedown={handleMouseDown}
	onmouseup={handleMouseUp}
	style:cursor={grabbed ? 'grabbing' : parallaxActive ? 'grab' : undefined}
	style:user-select={grabbed ? 'none' : undefined}
>
	<div bind:this={panel} class="glass-panel rounded-t-2xl sm:rounded-2xl w-full max-w-md mx-0 sm:mx-4 overflow-hidden max-h-[85vh] flex flex-col relative" style="will-change: transform, box-shadow;">

		<!-- Ambient orb -->
		<div bind:this={ambientOrb} class="ambient-orb" style="--orb-color-12: rgba({config.rgb}, 0.12); --orb-color-06: rgba({config.rgb}, 0.06); --orb-color-02: rgba({config.rgb}, 0.02);"></div>

		<!-- Header -->
		<div class="p-4 pb-0 flex-shrink-0 relative z-10">
			<div bind:this={header} class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<span class="inline-block w-2.5 h-2.5 rounded-full" style="background: {config.color};"></span>
					<span class="text-xs font-medium uppercase tracking-wider" style="font-family: 'Geist Mono', monospace; color: {config.color}; text-shadow: 0 0 8px rgba({config.rgb}, 0.3);">{config.label}</span>
				</div>
				<button
					onclick={handleClose}
					class="text-white/40 hover:text-white/70 transition cursor-pointer flex-shrink-0"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		</div>

		<!-- Embed player -->
		<div class="px-6 pt-4 relative z-10">
			<div bind:this={embedFrame} class="embed-frame" style="border-color: rgba({config.rgb}, 0.15);">
				<iframe
					src={music.content.embedUrl}
					width="100%"
					height={config.embedHeight}
					frameborder="0"
					allow="autoplay; encrypted-media"
					sandbox="allow-same-origin allow-scripts allow-popups"
					loading="lazy"
					title="{music.content.title} - {config.label} embed"
					style="border-radius: 8px;"
				></iframe>
			</div>
		</div>

		<!-- Content area -->
		<div bind:this={contentBlock} class="flex-1 overflow-y-auto px-6 pt-4 pb-6 relative z-10" style="display: flex; flex-direction: column; gap: 0.75rem;">

			<!-- Title + Artist -->
			<div>
				<h3 class="text-base font-semibold text-white" style="font-family: 'Geist Mono', monospace;">{music.content.title}</h3>
				{#if music.content.artist}
					<p class="text-sm text-white/60 mt-0.5" style="font-family: 'Geist Mono', monospace;">{music.content.artist}</p>
				{/if}
			</div>

			<!-- Actions -->
			<div class="flex gap-2 pt-1">
				<button
					onclick={openOriginal}
					class="lego-btn lego-neutral flex-1 cursor-pointer"
				>
					Open in {config.label}
				</button>
				{#if isOwner}
					<button
						onclick={deleteMusic}
						disabled={deleting}
						class="lego-btn lego-red cursor-pointer"
					>
						{deleting ? 'Deleting...' : 'Delete'}
					</button>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.ambient-orb {
		position: absolute;
		top: 35%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 420px;
		height: 420px;
		border-radius: 50%;
		background: radial-gradient(circle, var(--orb-color-12) 0%, var(--orb-color-06) 25%, var(--orb-color-02) 50%, transparent 70%);
		pointer-events: none;
		will-change: transform, opacity;
	}

	.embed-frame {
		border-radius: 12px;
		overflow: hidden;
		border: 1px solid;
		background: rgba(0, 0, 0, 0.3);
		will-change: transform;
	}
</style>
