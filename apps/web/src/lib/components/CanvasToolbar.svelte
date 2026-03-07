<script lang="ts">
	import { signOut, registerPasskey } from '$lib/auth';
	import gsap from 'gsap';
	import { onMount, onDestroy } from 'svelte';
	import CanvasSwitcher from './CanvasSwitcher.svelte';
	import FriendCodeModal from './FriendCodeModal.svelte';
	import FriendsList from './FriendsList.svelte';
	import AuthDropdown from './AuthDropdown.svelte';
	import RecoveryCodesModal from './RecoveryCodesModal.svelte';

	let {
		username,
		canvasName,
		isOwner = true,
		onAddNote,
		onCreateBeacon,
		onAddPhoto,
		onAddMusic,
		onNavigateToFriend = undefined,
		friendCode = '',
		activeCanvasId,
		canvases,
		onSelectCanvas,
		onCreateCanvas,
		onSettingsCanvas,
		webrtcConnected = false,
		showAccount = true,
		onAuthSuccess = undefined,
		hasFriendBeacons = false,
		activeBeaconCanvasIds = [],
	}: {
		username: string;
		canvasName?: string;
		isOwner?: boolean;
		onAddNote: () => void;
		onCreateBeacon: () => void;
		onAddPhoto: () => void;
		onAddMusic: () => void;
		onNavigateToFriend?: (friendUuid: string, displayName: string) => void;
		friendCode?: string;
		activeCanvasId: string | null;
		canvases: any[] | undefined;
		onSelectCanvas: (canvasId: string, canvasName: string) => void;
		onCreateCanvas: () => void;
		onSettingsCanvas?: (canvasId: string, canvasName: string) => void;
		webrtcConnected?: boolean;
		/** Hide sign out, friend code, friends list (landing page) */
		showAccount?: boolean;
		/** Auth success callback (landing page dropdowns) */
		onAuthSuccess?: () => void;
		/** Whether any friend has an active beacon */
		hasFriendBeacons?: boolean;
		/** Canvas IDs that have active friend beacons */
		activeBeaconCanvasIds?: string[];
	} = $props();

	let isSigningOut = $state(false);

	// Account menu state
	let accountMenuOpen = $state(false);
	let accountMenuEl = $state<HTMLDivElement>(undefined!);
	let accountBtnEl = $state<HTMLButtonElement>(undefined!);
	let supportsPasskeys = $state(false);
	let passkeyStatus = $state<string>('');
	let showRecoveryModal = $state(false);

	// Beacon button ref for funky color cycling
	let beaconBtn: HTMLButtonElement = $state(undefined!);
	let beaconGlowTimeline: gsap.core.Timeline | null = null;

	// Funky rapid color cycle when friends have active beacons
	const FUNKY_COLORS = [
		'#FF6B6B', '#FECA57', '#48DBFB', '#FF9FF3',
		'#54A0FF', '#5F27CD', '#01A3A4', '#F368E0',
		'#FF6348', '#7BED9F', '#E056FD', '#FFC312',
	];

	$effect(() => {
		if (hasFriendBeacons && beaconBtn) {
			if (!beaconGlowTimeline) {
				const tl = gsap.timeline({ repeat: -1 });
				FUNKY_COLORS.forEach((color, i) => {
					tl.to(beaconBtn, {
						boxShadow: `0 0 14px 4px ${color}88, inset 0 0 8px ${color}44`,
						background: `${color}30`,
						duration: 0.25,
						ease: 'power1.inOut',
					});
				});
				beaconGlowTimeline = tl;
			}
		} else {
			if (beaconGlowTimeline) {
				beaconGlowTimeline.kill();
				beaconGlowTimeline = null;
				if (beaconBtn) {
					gsap.set(beaconBtn, { boxShadow: 'none', background: 'transparent', clearProps: 'boxShadow,background' });
				}
			}
		}
	});

	// SVG element refs for GSAP animations
	let noteSparkle: SVGElement = $state(undefined!);
	let notePencil: SVGElement = $state(undefined!);
	let beaconWave1: SVGElement = $state(undefined!);
	let beaconWave2: SVGElement = $state(undefined!);
	let photoFlash: SVGElement = $state(undefined!);
	let photoLens: SVGElement = $state(undefined!);
	let musicNote: SVGElement = $state(undefined!);
	let musicWave1: SVGElement = $state(undefined!);
	let musicWave2: SVGElement = $state(undefined!);

	// Store tweens for cleanup
	let idleTweens: gsap.core.Tween[] = [];

	onMount(() => {
		supportsPasskeys = typeof window !== 'undefined' && !!window.PublicKeyCredential;
		document.addEventListener('pointerdown', handleAccountMenuClickOutside);

		// Note sparkle idle — opacity breathe
		if (noteSparkle) {
			idleTweens.push(
				gsap.to(noteSparkle, {
					opacity: 1,
					duration: 2,
					ease: 'sine.inOut',
					yoyo: true,
					repeat: -1,
				})
			);
		}

		// Beacon outer arc idle — opacity pulse
		if (beaconWave2) {
			idleTweens.push(
				gsap.to(beaconWave2, {
					opacity: 0.8,
					duration: 1.8,
					ease: 'sine.inOut',
					yoyo: true,
					repeat: -1,
				})
			);
		}

		// Photo lens highlight idle — subtle gleam
		if (photoLens) {
			idleTweens.push(
				gsap.to(photoLens, {
					opacity: 0.7,
					duration: 2.5,
					ease: 'sine.inOut',
					yoyo: true,
					repeat: -1,
				})
			);
		}

		// Music wave idle — opacity pulse
		if (musicWave2) {
			idleTweens.push(
				gsap.to(musicWave2, {
					opacity: 0.8,
					duration: 2,
					ease: 'sine.inOut',
					yoyo: true,
					repeat: -1,
				})
			);
		}

	});

	onDestroy(() => {
		idleTweens.forEach((t) => t.kill());
		idleTweens = [];
		beaconGlowTimeline?.kill();
		beaconGlowTimeline = null;
		if (typeof document !== 'undefined') {
			document.removeEventListener('pointerdown', handleAccountMenuClickOutside);
		}
	});

	function noteEnter() {
		if (!notePencil || !noteSparkle) return;
		const tl = gsap.timeline();
		tl.to(notePencil, { rotation: -12, transformOrigin: '50% 100%', duration: 0.15, ease: 'power2.out' });
		tl.to(notePencil, { rotation: 0, duration: 0.15, ease: 'power2.out' });
		tl.to(noteSparkle, { scale: 1.5, opacity: 1, transformOrigin: '50% 50%', duration: 0.15, ease: 'power2.out' }, 0);
		tl.to(noteSparkle, { scale: 1, duration: 0.15, ease: 'power2.out' }, 0.15);
	}

	function beaconEnter() {
		if (!beaconWave1 || !beaconWave2) return;
		const tl = gsap.timeline();
		tl.fromTo(beaconWave1, { scale: 0.85, opacity: 0.9, transformOrigin: '50% 100%' }, { scale: 1.1, opacity: 0.3, duration: 0.4, ease: 'power2.out' });
		tl.fromTo(beaconWave2, { scale: 0.85, opacity: 0.9, transformOrigin: '50% 100%' }, { scale: 1.1, opacity: 0.3, duration: 0.4, ease: 'power2.out' }, 0.1);
	}

	function photoEnter() {
		if (!photoFlash || !photoLens) return;
		const tl = gsap.timeline();
		tl.fromTo(photoFlash, { scale: 0, opacity: 0, transformOrigin: '50% 50%' }, { scale: 1.3, opacity: 1, duration: 0.18, ease: 'back.out(1.4)' });
		tl.to(photoFlash, { scale: 1, opacity: 0.7, duration: 0.17, ease: 'power2.out' });
		tl.fromTo(photoLens, { scale: 1, transformOrigin: '50% 50%' }, { scale: 1.15, duration: 0.15, ease: 'power2.out' }, 0);
		tl.to(photoLens, { scale: 1, duration: 0.2, ease: 'back.out(1.4)' }, 0.15);
	}

	function musicEnter() {
		if (!musicNote || !musicWave1 || !musicWave2) return;
		const tl = gsap.timeline();
		tl.to(musicNote, { rotation: -15, transformOrigin: '50% 100%', duration: 0.12, ease: 'power2.out' });
		tl.to(musicNote, { rotation: 15, duration: 0.12, ease: 'power2.out' });
		tl.to(musicNote, { rotation: 0, duration: 0.12, ease: 'power2.out' });
		tl.fromTo(musicWave1, { scale: 0.8, opacity: 0.3, transformOrigin: '50% 50%' }, { scale: 1.2, opacity: 0.9, duration: 0.25, ease: 'power2.out' }, 0);
		tl.fromTo(musicWave2, { scale: 0.8, opacity: 0.2, transformOrigin: '50% 50%' }, { scale: 1.2, opacity: 0.7, duration: 0.25, ease: 'power2.out' }, 0.08);
	}

	function toggleAccountMenu() {
		if (accountMenuOpen) {
			closeAccountMenu();
		} else {
			accountMenuOpen = true;
			passkeyStatus = '';
			requestAnimationFrame(() => {
				if (!accountMenuEl) return;
				gsap.fromTo(accountMenuEl,
					{ scale: 0.6, opacity: 0, transformOrigin: 'top center' },
					{ scale: 1, opacity: 1, duration: 0.25, ease: 'back.out(2)' }
				);
			});
		}
	}

	function closeAccountMenu() {
		if (!accountMenuOpen || !accountMenuEl) { accountMenuOpen = false; return; }
		gsap.to(accountMenuEl, {
			scale: 0.6, opacity: 0, duration: 0.15, ease: 'power2.in',
			transformOrigin: 'top center',
			onComplete: () => { accountMenuOpen = false; },
		});
	}

	function handleAccountMenuClickOutside(e: MouseEvent) {
		if (!accountMenuOpen) return;
		const target = e.target as HTMLElement;
		if (accountBtnEl?.contains(target) || accountMenuEl?.contains(target)) return;
		closeAccountMenu();
	}

	async function handleSetupPasskey() {
		passkeyStatus = 'Registering...';
		const result = await registerPasskey();
		if (result.error) {
			passkeyStatus = result.error;
		} else {
			passkeyStatus = 'Passkey registered!';
			setTimeout(() => { passkeyStatus = ''; }, 3000);
		}
	}

	function handleOpenRecoveryCodes() {
		showRecoveryModal = true;
		closeAccountMenu();
	}

	async function handleSignOut() {
		isSigningOut = true;
		closeAccountMenu();
		await signOut();
	}
</script>

<div class="fixed top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-[rgba(15,14,26,0.75)] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-white/[0.08]">
	<span class="text-sm font-medium text-white/80 flex items-center gap-1.5">
		{username}
		{#if webrtcConnected}
			<span
				class="w-2 h-2 rounded-full bg-emerald-400"
				title="Real-time connected"
			></span>
		{/if}
	</span>

	<div class="w-px h-5 bg-white/10"></div>

	<!-- Canvas switcher dropdown -->
	<CanvasSwitcher
		{activeCanvasId}
		{canvases}
		canvasName={canvasName ?? 'My Orbyt'}
		onSelect={onSelectCanvas}
		onCreateNew={onCreateCanvas}
		onSettings={onSettingsCanvas}
		{activeBeaconCanvasIds}
	/>

	<div class="w-px h-5 bg-white/10"></div>

	{#if isOwner}
		<!-- Note button — pencil + sparkle -->
		<button
			onclick={onAddNote}
			onmouseenter={noteEnter}
			class="lego-btn lego-amber flex items-center gap-1.5"
		>
			<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
				<!-- Pencil body -->
				<g bind:this={notePencil}>
					<rect x="4" y="3" width="4" height="12" rx="1" transform="rotate(-5 6 9)" fill="white" opacity="0.95"/>
					<polygon points="4.5,14.5 5,17 7.5,16.5" fill="white" opacity="0.95"/>
					<rect x="4.2" y="3" width="4" height="2.5" rx="0.5" transform="rotate(-5 6.2 4.25)" fill="white" opacity="0.6"/>
				</g>
				<!-- Sparkle at writing tip -->
				<path bind:this={noteSparkle}
					d="M12 4 L13 6 L15 7 L13 8 L12 10 L11 8 L9 7 L11 6 Z"
					fill="white" opacity="0.5"
				/>
			</svg>
			Note
		</button>

		<!-- Beacon button — signal broadcast -->
		<button
			bind:this={beaconBtn}
			onclick={onCreateBeacon}
			onmouseenter={beaconEnter}
			class="lego-btn lego-orange flex items-center gap-1.5"
			style="border-radius: 8px;"
		>
			<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
				<!-- Center dot -->
				<circle cx="10" cy="14" r="2" fill="white" opacity="0.95"/>
				<!-- Inner arc wave -->
				<path bind:this={beaconWave1}
					d="M6.5 10 A5 5 0 0 1 13.5 10"
					stroke="white" stroke-width="1.8" stroke-linecap="round" fill="none" opacity="0.7"
				/>
				<!-- Outer arc wave -->
				<path bind:this={beaconWave2}
					d="M4 7 A8 8 0 0 1 16 7"
					stroke="white" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.4"
				/>
			</svg>
			Beacon
		</button>

		<!-- Photo button — camera + flash -->
		<button
			onclick={onAddPhoto}
			onmouseenter={photoEnter}
			class="lego-btn lego-violet flex items-center gap-1.5"
		>
			<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
				<!-- Camera body -->
				<rect x="2" y="8" width="16" height="10" rx="2" fill="white" opacity="0.95"/>
				<!-- Viewfinder bump -->
				<rect x="7" y="5.5" width="6" height="3.5" rx="1" fill="white" opacity="0.95"/>
				<!-- Lens circle -->
				<circle cx="10" cy="13" r="3" fill="none" stroke="rgba(139,92,246,0.8)" stroke-width="1.5"/>
				<!-- Lens highlight -->
				<circle bind:this={photoLens}
					cx="9" cy="12" r="1" fill="white" opacity="0.3"
				/>
				<!-- Flash burst (4-point star) -->
				<path bind:this={photoFlash}
					d="M16 3 L16.5 4.5 L18 5 L16.5 5.5 L16 7 L15.5 5.5 L14 5 L15.5 4.5 Z"
					fill="white" opacity="0.7"
				/>
			</svg>
			Photo
		</button>

		<!-- Music button — note + sound waves -->
		<button
			onclick={onAddMusic}
			onmouseenter={musicEnter}
			class="lego-btn lego-teal flex items-center gap-1.5"
		>
			<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
				<!-- Music note -->
				<g bind:this={musicNote}>
					<circle cx="7" cy="15" r="2.5" fill="white" opacity="0.95"/>
					<rect x="9" y="4" width="2" height="11" rx="0.5" fill="white" opacity="0.95"/>
					<path d="M9.5 4 L16 2 L16 6 L11 8" fill="white" opacity="0.8"/>
				</g>
				<!-- Sound wave arcs -->
				<path bind:this={musicWave1}
					d="M14 9 A3 3 0 0 1 14 15"
					stroke="white" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.5"
				/>
				<path bind:this={musicWave2}
					d="M16 7 A6 6 0 0 1 16 17"
					stroke="white" stroke-width="1.2" stroke-linecap="round" fill="none" opacity="0.3"
				/>
			</svg>
			Music
		</button>
	{/if}

	{#if showAccount}
		<div class="w-px h-5 bg-white/10"></div>

		<!-- Friend code dropdown -->
		<FriendCodeModal {friendCode} />

		<!-- Friends list dropdown -->
		<FriendsList {onNavigateToFriend} />

		<!-- Account dropdown -->
		<div class="relative">
			<button
				bind:this={accountBtnEl}
				onclick={toggleAccountMenu}
				class="lego-btn lego-btn-sm lego-neutral"
			>
				<svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
					<circle cx="10" cy="7" r="4" fill="currentColor" opacity="0.8"/>
					<path d="M3 18 C3 14 6 12 10 12 C14 12 17 14 17 18" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.6"/>
				</svg>
			</button>

			{#if accountMenuOpen}
				<div bind:this={accountMenuEl} class="absolute top-[calc(100%+8px)] right-0 w-52 rounded-xl bg-[rgba(15,14,26,0.92)] backdrop-blur-2xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-50 overflow-hidden">
					{#if supportsPasskeys}
						<button
							onclick={handleSetupPasskey}
							class="w-full px-4 py-2.5 text-left text-sm text-white/70 hover:bg-white/[0.06] transition flex items-center gap-2 cursor-pointer"
						>
							<svg width="14" height="14" viewBox="0 0 20 20" fill="none">
								<rect x="2" y="8" width="10" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
								<path d="M5 8 V5 A5 5 0 0 1 15 5 V8" stroke="currentColor" stroke-width="1.5" fill="none"/>
								<circle cx="7" cy="12" r="1" fill="currentColor"/>
							</svg>
							Set up Passkey
						</button>
					{/if}

					<button
						onclick={handleOpenRecoveryCodes}
						class="w-full px-4 py-2.5 text-left text-sm text-white/70 hover:bg-white/[0.06] transition flex items-center gap-2 cursor-pointer"
					>
						<svg width="14" height="14" viewBox="0 0 20 20" fill="none">
							<rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/>
							<line x1="6" y1="6" x2="14" y2="6" stroke="currentColor" stroke-width="1" opacity="0.5"/>
							<line x1="6" y1="9" x2="14" y2="9" stroke="currentColor" stroke-width="1" opacity="0.5"/>
							<line x1="6" y1="12" x2="11" y2="12" stroke="currentColor" stroke-width="1" opacity="0.5"/>
						</svg>
						Recovery Codes
					</button>

					{#if passkeyStatus}
						<p class="px-4 py-2 text-xs text-center {passkeyStatus.includes('!') ? 'text-emerald-400' : 'text-white/40'}">
							{passkeyStatus}
						</p>
					{/if}

					<div class="h-px bg-white/[0.06] mx-2"></div>

					<button
						onclick={handleSignOut}
						disabled={isSigningOut}
						class="w-full px-4 py-2.5 text-left text-sm text-red-400/70 hover:bg-red-500/[0.08] transition cursor-pointer disabled:opacity-50"
					>
						Sign out
					</button>
				</div>
			{/if}
		</div>
	{:else}
		<div class="w-px h-5 bg-white/10"></div>

		<AuthDropdown initialMode="signin" onAuthSuccess={onAuthSuccess} />
		<AuthDropdown initialMode="signup" onAuthSuccess={onAuthSuccess} />
	{/if}
</div>

<!-- Recovery codes modal -->
{#if showRecoveryModal}
	<RecoveryCodesModal onClose={() => { showRecoveryModal = false; }} />
{/if}
