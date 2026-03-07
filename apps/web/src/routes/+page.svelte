<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { CanvasRenderer, type CanvasObjectData } from '$lib/canvas/CanvasRenderer';
	import { useCurrentUser, initAuthService } from '$lib/auth';
	import { PeerManager } from '$lib/webrtc';
	// LandingAuthCard removed — auth forms now live in toolbar dropdowns
	import CanvasToolbar from '$lib/components/CanvasToolbar.svelte';
	import CreateCanvasModal from '$lib/components/CreateCanvasModal.svelte';
	import CreateBeaconModal from '$lib/components/CreateBeaconModal.svelte';
	import BeaconDetailPanel from '$lib/components/BeaconDetailPanel.svelte';
	import NoteDetailPanel from '$lib/components/NoteDetailPanel.svelte';
	import InlineNoteEditor from '$lib/components/InlineNoteEditor.svelte';
	import StickerPicker from '$lib/components/StickerPicker.svelte';
	import PhotoDetailPanel from '$lib/components/PhotoDetailPanel.svelte';
	import AddMusicModal from '$lib/components/AddMusicModal.svelte';
	import OrbytSettingsPanel from '$lib/components/OrbytSettingsPanel.svelte';
	import CanvasStylePicker from '$lib/components/CanvasStylePicker.svelte';
	import ViewerAvatars from '$lib/components/ViewerAvatars.svelte';
	import { TextBlock } from '$lib/canvas/objects/TextBlock';

	let canvasContainer: HTMLDivElement;
	let renderer: CanvasRenderer;
	let authSettled = $state(false);
	let landingMode = $state(false);
	let landingTransitionRunning = $state(false);
	let landingInitialized = false;

	// Returning user hint — localStorage flag avoids landing page flash on reload
	const AUTH_HINT_KEY = 'orbyt-auth-hint';
	const isBrowser = typeof window !== 'undefined';
	let returningUser = $state(isBrowser && !!window.localStorage?.getItem(AUTH_HINT_KEY));
	let showLoadingSpinner = $state(false);

	const client = useConvexClient();
	const currentUser = useCurrentUser();

	// Initialize the auth service with the Convex client (for post-signup mutations)
	initAuthService(client);

	// Active canvas state — starts with personal canvas, can switch to shared
	let activeCanvasId = $state<string | null>(null);
	let activeCanvasName = $state<string>('My Orbyt');

	// WebRTC state
	let peerManager = $state<PeerManager | null>(null);
	let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
	let webrtcConnected = $state(false);

	// Derive whether the current user owns the active canvas
	let isCanvasOwner = $derived.by(() => {
		if (!activeCanvasId || !accessibleCanvases.data) return false;
		const canvas = accessibleCanvases.data.find((c: any) => c._id === activeCanvasId);
		return canvas?.role === 'owner';
	});

	// Modal state
	let showCreateCanvas = $state(false);
	let showCreateBeacon = $state(false);
	let selectedBeacon = $state<any>(null);
	let selectedNote = $state<any>(null);
	let stickerPickerState = $state<{ objectId: string; x: number; y: number } | null>(null);
	let selectedPhoto = $state<any>(null);
	let showAddMusic = $state(false);
	let settingsCanvas = $state<{ id: string; name: string } | null>(null);
	let playingMusicId = $state<string | null>(null);
	let overlayMode = $state<'none' | 'dots' | 'lines'>('none');
	let dragOver = $state(false);
	let audioIframe: HTMLIFrameElement | null = null;
	let morphWrapper: HTMLDivElement | null = null;

	// Inline note editor state (owner-only, replaces NoteDetailPanel for owners)
	let inlineEditState = $state<{
		note: any;
		screenX: number;
		screenY: number;
		screenWidth: number;
		screenHeight: number;
		scale: number;
	} | null>(null);

	// Set the active canvas from the combined query (no separate personalCanvas subscription needed)
	$effect(() => {
		if (currentUser.canvasId && !activeCanvasId) {
			activeCanvasId = currentUser.canvasId;
			activeCanvasName = currentUser.canvasName ?? 'My Orbyt';
		}
	});

	// Sync overlay mode from canvas data
	$effect(() => {
		const canvases = accessibleCanvases.data;
		if (!canvases || !activeCanvasId) return;
		const canvas = canvases.find((c: any) => c._id === activeCanvasId);
		const mode = (canvas as any)?.overlayMode ?? 'none';
		overlayMode = mode;
		renderer?.setOverlayMode(mode);
	});

	// Query canvas objects for the active canvas
	const canvasObjects = useQuery(
		api.objects.getByCanvas,
		() => activeCanvasId ? { canvasId: activeCanvasId as any } : 'skip'
	);

	// O(1) object lookup map — avoids repeated .find() scans in tap callbacks
	const objectLookup = $derived.by(() =>
		new Map(canvasObjects.data?.map((o: any) => [o._id, o]) ?? [])
	);

	// Query stickers for the active canvas
	const canvasStickers = useQuery(
		api.stickers.getByCanvas,
		() => activeCanvasId ? { canvasId: activeCanvasId as any } : 'skip'
	);

	// Always-subscribed query for canvas switcher — data is ready instantly when dropdown opens
	const accessibleCanvases = useQuery(
		api.access.getAccessibleCanvases,
		() => currentUser.isAuthenticated ? {} : 'skip'
	);

	// Friend beacon activity — warm awareness (no badge counts, just presence)
	const friendBeaconActivity = useQuery(
		api.beacons.getFriendBeaconActivity,
		() => currentUser.isAuthenticated ? {} : 'skip'
	);

	// Presence: who's viewing this canvas
	const canvasViewers = useQuery(
		api.presence.getViewers,
		() => activeCanvasId && currentUser.isAuthenticated ? { canvasId: activeCanvasId as any } : 'skip'
	);

	// Signaling: incoming WebRTC signals for the current user
	const incomingSignals = useQuery(
		api.signaling.getSignals,
		() => activeCanvasId && currentUser.isAuthenticated ? { canvasId: activeCanvasId as any } : 'skip'
	);

	// Auth settling — reactive (replaces blocking poll in onMount).
	// Returning users: show spinner until auth resolves or 2.5s timeout.
	// New visitors: show landing after 300ms if no auth.
	let authTimeout: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (currentUser.isAuthenticated) {
			authSettled = true;
			showLoadingSpinner = false;
			try { localStorage.setItem(AUTH_HINT_KEY, '1'); } catch {}
			if (authTimeout) { clearTimeout(authTimeout); authTimeout = null; }
			return;
		}

		// Only set timeout once (when renderer is ready but auth hasn't resolved)
		if (!authSettled && renderer && !authTimeout) {
			const delay = returningUser ? 2500 : 300;
			authTimeout = setTimeout(() => {
				authTimeout = null;
				if (!currentUser.isAuthenticated && !landingInitialized) {
					authSettled = true;
					showLoadingSpinner = false;
					landingInitialized = true;
					landingMode = true;
					renderer.enterLandingMode();
					overlayMode = 'dots';
					if (returningUser) {
						try { localStorage.removeItem(AUTH_HINT_KEY); } catch {}
						returningUser = false;
					}
				}
			}, delay);
		}
	});

	// Landing → authenticated transition: run the cinematic pulse, then load user's canvas
	$effect(() => {
		if (currentUser.isAuthenticated && landingMode && !landingTransitionRunning && renderer) {
			handleAuthTransition();
		}
	});

	async function handleAuthTransition() {
		landingTransitionRunning = true;
		// Run the cinematic exit — dissolve auth card, pulse rings, etc.
		await renderer.exitLandingMode();
		landingMode = false;
		landingTransitionRunning = false;
		// Existing effects will kick in to load the user's personal canvas
	}

	// Logout → re-enter landing mode (clear canvas objects, show landing page)
	let wasAuthenticated = false;
	$effect(() => {
		if (currentUser.isAuthenticated) {
			wasAuthenticated = true;
		} else if (wasAuthenticated && !currentUser.isAuthenticated && renderer && !landingMode) {
			// User just logged out — reset to landing page
			wasAuthenticated = false;
			activeCanvasId = null;
			activeCanvasName = 'My Orbyt';
			renderer.syncObjects([], false);
			renderer.enterLandingMode();
			landingMode = true;
			landingInitialized = true;
			overlayMode = 'dots';
			try { localStorage.removeItem(AUTH_HINT_KEY); } catch {}
			// Clean up WebRTC
			peerManager?.destroy();
			peerManager = null;
			webrtcConnected = false;
		}
	});

	// Recovery: if auth exists but Astrophage user record is missing, create it
	$effect(() => {
		if (
			currentUser.isAuthenticated &&
			!currentUser.isLoading &&
			currentUser.user &&
			!currentUser.user.uuid // empty string = no Astrophage record
		) {
			const username = currentUser.user.username;
			const displayName = currentUser.user.displayName || username;
			if (username) {
				client
					.mutation(api.users.createUser, { username, displayName })
					.catch(() => {});
			}
		}
	});

	// Backfill friend code for pre-Layer 3 users (skip during landing transition)
	$effect(() => {
		if (currentUser.isAuthenticated && !landingMode && currentUser.user?.uuid && !currentUser.user?.friendCode) {
			client.mutation(api.users.ensureFriendCode, {}).catch(() => {});
		}
	});

	// Initialize PeerManager when user authenticates
	$effect(() => {
		const user = currentUser.user;
		if (!user?.uuid || !renderer) return;

		// Already have a PeerManager for this user
		if (peerManager) return;

		// PeerManager ready
		peerManager = new PeerManager(user.uuid, user.username, {
			onRemoteCursor: (userId, username, x, y) => {
				renderer?.updateRemoteCursor(userId, username, x, y);
			},
			onRemoteDragStart: (_userId, objectId) => {
				renderer?.animateRemoteDragLift(objectId);
			},
			onRemoteDrag: (_userId, objectId, x, y) => {
				renderer?.moveObjectRemotely(objectId, x, y);
			},
			onRemoteDragEnd: (_userId, objectId, x, y) => {
				renderer?.moveObjectRemotely(objectId, x, y);
				renderer?.stopRemoteObjectInterpolation(objectId);
				renderer?.animateRemoteDragDrop(objectId);
			},
			onPeerConnected: (userId) => {
				webrtcConnected = peerManager?.hasConnections ?? false;
			},
			onPeerDisconnected: (userId) => {
				webrtcConnected = peerManager?.hasConnections ?? false;
			},
			onSignal: (toUserId, signal) => {
				if (!activeCanvasId) return;
				// Determine signal type from the parsed signal data
				let type: 'offer' | 'answer' | 'ice-candidate' = 'ice-candidate';
				try {
					const parsed = JSON.parse(signal);
					if (parsed.type === 'offer') type = 'offer';
					else if (parsed.type === 'answer') type = 'answer';
				} catch { /* default to ice-candidate */ }

				client.mutation(api.signaling.sendSignal, {
					canvasId: activeCanvasId as any,
					toUserId,
					type,
					payload: signal,
				}).catch((err: unknown) => console.error('Signal send failed:', err));
			},
		});
	});

	// Presence lifecycle: join canvas, heartbeat, leave on switch
	$effect(() => {
		const canvasId = activeCanvasId;
		const user = currentUser.user;
		if (!canvasId || !user?.uuid) return;

		// Join this canvas
		client.mutation(api.presence.joinCanvas, { canvasId: canvasId as any }).catch(() => {});
		// Track visit for switcher sorting
		client.mutation(api.access.recordCanvasVisit, { canvasId: canvasId as any }).catch(() => {});

		// Set PeerManager canvas
		peerManager?.setCanvas(canvasId);

		// Clear old cursors
		renderer?.removeAllRemoteCursors();

		// Start heartbeat
		if (heartbeatInterval) clearInterval(heartbeatInterval);
		heartbeatInterval = setInterval(() => {
			client.mutation(api.presence.heartbeat, { canvasId: canvasId as any }).catch(() => {});
		}, 30_000);

		return () => {
			// Leave canvas on cleanup (canvas switch or unmount)
			client.mutation(api.presence.leaveCanvas, { canvasId: canvasId as any }).catch(() => {});
			if (heartbeatInterval) {
				clearInterval(heartbeatInterval);
				heartbeatInterval = null;
			}
		};
	});

	// Process incoming signaling messages
	$effect(() => {
		const signals = incomingSignals.data;
		if (!signals || signals.length === 0 || !peerManager) return;

		const consumed = peerManager.processSignals(signals as any[]);

		// Delete consumed signals from Convex
		for (const id of consumed) {
			client.mutation(api.signaling.consumeSignal, { signalId: id as any }).catch(() => {});
		}
	});

	// Discover new viewers → trigger WebRTC connections
	$effect(() => {
		const viewers = canvasViewers.data;
		if (!viewers || !peerManager || !currentUser.user?.uuid) return;

		const myUuid = currentUser.user.uuid;
		const others = viewers.filter((v: any) => v.userId !== myUuid);

		for (const viewer of others) {
			peerManager.onViewerDiscovered(viewer.userId);
		}
	});

	onMount(async () => {
		renderer = new CanvasRenderer();
		await renderer.init(canvasContainer);

		// Settle auth non-blockingly — event handlers wire up immediately below.
		// The reactive $effect (settleAuth) handles landing/spinner transitions.
		if (currentUser.isAuthenticated) {
			authSettled = true;
		} else if (returningUser) {
			showLoadingSpinner = true;
		}

		// Wire up drag-start → WebRTC broadcast (lift animation on remote)
		renderer.onObjectDragStart = (objectId) => {
			peerManager?.sendDragStart(objectId);
		};

		// Wire up drag-end → Convex mutation + WebRTC broadcast
		renderer.onObjectMoved = async (objectId, x, y) => {
			peerManager?.sendDragEnd(objectId, x, y);
			try {
				await client.mutation(api.objects.updatePosition, {
					id: objectId as any,
					position: { x, y },
				});
			} catch (err) {
				console.error('Failed to save position:', err);
			}
		};

		// Wire up mid-drag → WebRTC broadcast
		renderer.onObjectDragging = (objectId, x, y) => {
			peerManager?.sendDragPosition(objectId, x, y);
		};

		// Wire up beacon tap → detail panel
		renderer.onBeaconTapped = (objectId) => {
			const obj = objectLookup.get(objectId);
			if (obj && obj.type === 'beacon') {
				selectedBeacon = obj;
			}
		};

		// Wire up note tap → inline editor (owner) or detail panel (non-owner)
		renderer.onNoteTapped = async (objectId) => {
			const obj = objectLookup.get(objectId);
			if (!obj || obj.type !== 'textblock') return;

			if (isCanvasOwner) {
				// Owner: open inline editor overlay at note's screen position
				const block = renderer.getObject(objectId);
				if (!block || !(block instanceof TextBlock)) return;
				const screen = renderer.worldToScreen(block.container.x, block.container.y);
				const scale = renderer.getScale();

				// Animate lift, then show DOM overlay
				await block.animateEditLift();

				inlineEditState = {
					note: obj,
					screenX: screen.x,
					screenY: screen.y,
					screenWidth: block.width * scale,
					screenHeight: block.height * scale,
					scale,
				};
				renderer.lockPanZoom();
			} else {
				// Non-owner: read-only detail panel
				selectedNote = obj;
			}
		};

		// Wire up resize → Convex mutations (save both position + size)
		renderer.onObjectResized = async (objectId, x, y, width, height) => {
			try {
				await Promise.all([
					client.mutation(api.objects.updatePosition, {
						id: objectId as any,
						position: { x: Math.round(x), y: Math.round(y) },
					}),
					client.mutation(api.objects.updateSize, {
						id: objectId as any,
						size: { w: Math.round(width), h: Math.round(height) },
					}),
				]);
			} catch (err) {
				console.error('Failed to save resize:', err);
			}
		};

		// Wire up long-press → sticker picker
		renderer.onObjectLongPress = (objectId, screenX, screenY) => {
			stickerPickerState = { objectId, x: screenX, y: screenY };
		};

		// Wire up inline sticker selection (visitor hover menu on canvas)
		renderer.onStickerSelected = async (objectId, stickerType) => {
			try {
				await client.mutation(api.stickers.addSticker, {
					objectId: objectId as any,
					stickerType,
					position: { x: Math.random() * 80 - 20, y: -15 + Math.random() * 10 },
				});
			} catch (err) {
				console.error('Failed to place sticker:', err);
			}
		};

		// Wire up photo tap → detail panel
		renderer.onPhotoTapped = (objectId) => {
			const obj = objectLookup.get(objectId);
			if (obj && obj.type === 'photo') {
				selectedPhoto = obj;
			}
		};

		// Wire up music tap → toggle play on card
		renderer.onMusicTapped = (objectId) => {
			if (playingMusicId === objectId) {
				// Same card — stop playback
				stopMusicPlayback();
				return;
			}
			const obj = objectLookup.get(objectId);
			if (!obj || obj.type !== 'music') return;
			const content = obj.content as { embedUrl: string; platform: string };
			// Different card (or nothing playing) — start this one
			stopMusicPlayback();
			startMusicPlayback(objectId, content.embedUrl, content.platform);
		};

		// Wire up music delete
		renderer.onMusicDeleted = async (objectId) => {
			if (playingMusicId === objectId) stopMusicPlayback();
			try {
				await client.mutation(api.objects.remove, { id: objectId as any });
			} catch (err) {
				console.error('Failed to delete music:', err);
			}
		};

		// Wire up beacon delete
		renderer.onBeaconDeleted = async (objectId) => {
			try {
				await client.mutation(api.objects.remove, { id: objectId as any });
			} catch (err) {
				console.error('Failed to delete beacon:', err);
			}
		};

		// Stream cursor position over WebRTC (throttled to match PeerManager's 50ms rate)
		renderer.app.stage.eventMode = 'static';
		renderer.app.stage.hitArea = renderer.app.screen;
		let lastCursorSendTime = 0;
		renderer.app.stage.on('pointermove', (event) => {
			if (!peerManager) return;
			const now = performance.now();
			if (now - lastCursorSendTime < 50) return;
			lastCursorSendTime = now;
			const world = renderer.screenToWorld(event.globalX, event.globalY);
			peerManager.sendCursor(world.x, world.y);
		});

		// Drag-and-drop photos from Finder/Desktop
		canvasContainer.addEventListener('dragover', handleDragOver);
		canvasContainer.addEventListener('dragleave', handleDragLeave);
		canvasContainer.addEventListener('drop', handleDrop);

		// Global Escape key → close topmost modal/menu
		window.addEventListener('keydown', handleEscape);
	});

	function handleDragOver(e: DragEvent) {
		// Only react to file drags (not internal PixiJS drags)
		if (!e.dataTransfer?.types.includes('Files')) return;
		e.preventDefault();
		dragOver = true;
	}

	function handleDragLeave(e: DragEvent) {
		// Only trigger when actually leaving the container, not entering children
		const related = e.relatedTarget as Node | null;
		if (related && canvasContainer.contains(related)) return;
		dragOver = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const files = e.dataTransfer?.files;
		if (!files || files.length === 0) return;
		handleFileDrop(files, e.clientX, e.clientY);
	}

	function handleEscape(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		// Close the topmost open modal (order: overlays first, then panels, then pickers)
		if (settingsCanvas) { settingsCanvas = null; return; }
		if (inlineEditState) { closeInlineEditor(); return; }
		if (showAddMusic) { showAddMusic = false; return; }
		if (showCreateBeacon) { showCreateBeacon = false; return; }
		if (showCreateCanvas) { showCreateCanvas = false; return; }
		if (selectedPhoto) { selectedPhoto = null; return; }
		if (selectedBeacon) { selectedBeacon = null; return; }
		if (selectedNote) { selectedNote = null; return; }
		if (stickerPickerState) { stickerPickerState = null; return; }
		if (playingMusicId) { stopMusicPlayback(); return; }
	}

	onDestroy(() => {
		if (typeof window !== 'undefined') window.removeEventListener('keydown', handleEscape);
		if (canvasContainer) {
			canvasContainer.removeEventListener('dragover', handleDragOver);
			canvasContainer.removeEventListener('dragleave', handleDragLeave);
			canvasContainer.removeEventListener('drop', handleDrop);
		}
		stopMusicPlayback();
		peerManager?.destroy();
		peerManager = null;
		if (heartbeatInterval) {
			clearInterval(heartbeatInterval);
			heartbeatInterval = null;
		}
		if (authTimeout) {
			clearTimeout(authTimeout);
			authTimeout = null;
		}
		if (renderer) renderer.destroy();
	});

	// Update renderer editability when canvas ownership changes
	$effect(() => {
		if (renderer) {
			const wasEditable = renderer.editable;
			renderer.editable = isCanvasOwner;

			// If editability changed, force re-sync to update drag behavior on existing objects
			if (wasEditable !== isCanvasOwner && canvasObjects.data) {
				// Clear then recreate with correct editable state, but skip pop-in animations
				renderer.syncObjects([], false);
				renderer.syncObjects(canvasObjects.data as CanvasObjectData[], false);
			}
		}
	});

	// Reactively sync canvas objects from Convex → PixiJS
	$effect(() => {
		if (renderer && canvasObjects.data) {
			renderer.syncObjects(canvasObjects.data as CanvasObjectData[]);

			// Stop playback if the playing music card was deleted
			if (playingMusicId && !canvasObjects.data.some((o: any) => o._id === playingMusicId)) {
				stopMusicPlayback();
			}
		}
	});

	// Reactively sync stickers
	$effect(() => {
		if (renderer && canvasStickers.data) {
			renderer.syncStickers(canvasStickers.data as any[]);
		}
	});

	/** Add a new TextBlock at the center of the viewport */
	async function addNote() {
		if (!activeCanvasId || !currentUser.user) return;
		const center = renderer.getViewportCenter();

		const colors = [0xfff9c4, 0xc8e6c9, 0xbbdefb, 0xf8bbd0, 0xffe0b2];
		const color = colors[Math.floor(Math.random() * colors.length)];

		await client.mutation(api.objects.create, {
			canvasId: activeCanvasId as any,
			type: 'textblock',
			position: { x: center.x - 120, y: center.y - 40 },
			size: { w: 240, h: 80 },
			content: { text: 'New note...', color, title: '' },
		});
	}

	/** Upload a photo and create a polaroid object at viewport center */
	async function addPhoto() {
		if (!activeCanvasId || !currentUser.user) return;

		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/jpeg,image/png,image/webp,image/gif';
		input.style.display = 'none';

		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;

			if (file.size > 5 * 1024 * 1024) {
				console.error('Photo must be under 5MB');
				return;
			}

			try {
				const uploadUrl = await client.mutation(api.photos.generateUploadUrl, {});

				const result = await fetch(uploadUrl, {
					method: 'POST',
					headers: { 'Content-Type': file.type },
					body: file,
				});
				const { storageId } = await result.json();

				const center = renderer.getViewportCenter();
				await client.mutation(api.photos.createPhoto, {
					canvasId: activeCanvasId as any,
					storageId,
					position: { x: center.x - 130, y: center.y - 150 },
				});
			} catch (err) {
				console.error('Photo upload failed:', err);
			}

			document.body.removeChild(input);
		};

		document.body.appendChild(input);
		input.click();
	}

	/** Handle files dropped onto the canvas from Finder/Desktop */
	async function handleFileDrop(files: FileList, screenX: number, screenY: number) {
		if (!activeCanvasId || !currentUser.user) return;

		const VALID_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
		const MAX_SIZE = 5 * 1024 * 1024;

		const validFiles = Array.from(files).filter((f) => {
			if (!VALID_TYPES.includes(f.type)) {
				console.warn(`Skipped "${f.name}" — unsupported type: ${f.type}`);
				return false;
			}
			if (f.size > MAX_SIZE) {
				console.warn(`Skipped "${f.name}" — exceeds 5MB limit (${(f.size / 1024 / 1024).toFixed(1)}MB)`);
				return false;
			}
			return true;
		});

		if (validFiles.length === 0) return;

		const worldDrop = renderer.screenToWorld(screenX, screenY);

		for (let i = 0; i < validFiles.length; i++) {
			const file = validFiles[i];
			// Offset each subsequent photo so they fan out instead of stacking
			const offsetX = i * 30;
			const offsetY = i * 30;
			const x = Math.max(0, Math.min(3000 - 260, Math.round(worldDrop.x - 130 + offsetX)));
			const y = Math.max(0, Math.min(2000 - 300, Math.round(worldDrop.y - 150 + offsetY)));

			try {
				const uploadUrl = await client.mutation(api.photos.generateUploadUrl, {});
				const result = await fetch(uploadUrl, {
					method: 'POST',
					headers: { 'Content-Type': file.type },
					body: file,
				});
				const { storageId } = await result.json();

				await client.mutation(api.photos.createPhoto, {
					canvasId: activeCanvasId as any,
					storageId,
					position: { x, y },
				});
			} catch (err) {
				console.error(`Photo upload failed for "${file.name}":`, err);
			}
		}
	}

	/** Change the canvas overlay mode */
	function changeOverlayMode(mode: 'none' | 'dots' | 'lines') {
		console.log('[overlay] changeOverlayMode:', mode, 'renderer:', !!renderer);
		overlayMode = mode;
		renderer?.setOverlayMode(mode);
		if (activeCanvasId) {
			client.mutation(api.canvases.updateOverlayMode, {
				canvasId: activeCanvasId as any,
				overlayMode: mode,
			}).catch((err: unknown) => console.error('Failed to save overlay mode:', err));
		}
	}

	/** Switch to a different canvas */
	function switchCanvas(canvasId: string, name: string) {
		stopMusicPlayback();
		activeCanvasId = canvasId;
		activeCanvasName = name;
	}

	/** Handle new shared canvas creation */
	function onCanvasCreated(canvasId: string) {
		activeCanvasId = canvasId;
		activeCanvasName = 'New Orbyt';
		showCreateCanvas = false;
	}

	/** Place a sticker on an object */
	async function placeSticker(stickerType: string) {
		if (!stickerPickerState) return;
		try {
			await client.mutation(api.stickers.addSticker, {
				objectId: stickerPickerState.objectId as any,
				stickerType,
				position: { x: Math.random() * 80 - 20, y: -15 + Math.random() * 10 },
			});
		} catch (err) {
			console.error('Failed to place sticker:', err);
		}
		stickerPickerState = null;
	}

	/** Close inline editor: spring note back and unlock pan/zoom */
	function closeInlineEditor() {
		if (inlineEditState) {
			const block = renderer.getObject(inlineEditState.note._id);
			if (block instanceof TextBlock) {
				block.animateEditReturn();
			} else if (block) {
				block.container.visible = true;
			}
			renderer.unlockPanZoom();
			inlineEditState = null;
		}
	}

	/** Save inline note edits: optimistic update + Convex mutation */
	async function saveInlineNote(id: string, text: string, color: number, title: string) {
		// Optimistic: update PixiJS immediately
		const block = renderer.getObject(id);
		if (block instanceof TextBlock) {
			block.updateText(text);
			block.updateColor(color);
			block.updateTitle(title);
		}

		try {
			await client.mutation(api.objects.updateContent, {
				id: id as any,
				content: { text, color, title: title || undefined },
			});
		} catch (err) {
			console.error('Failed to save note:', err);
		}
	}

	/** Delete note from inline editor */
	async function deleteInlineNote(id: string) {
		closeInlineEditor();
		try {
			await client.mutation(api.objects.remove, { id: id as any });
		} catch (err) {
			console.error('Failed to delete note:', err);
		}
	}

	// Official embed dimensions per platform (fixed screen size, not scaled with zoom)
	const EMBED_SIZES: Record<string, { w: number; h: number }> = {
		spotify: { w: 352, h: 152 },
		youtube: { w: 380, h: 215 },
		'youtube-music': { w: 1, h: 1 },    // hidden, audio only
		'apple-music': { w: 400, h: 175 },
	};

	// Platforms whose embeds morph onto the card (positioned at card location on canvas)
	const MORPH_PLATFORMS = new Set(['spotify', 'apple-music']);

	/** Ticker callback for repositioning morph wrapper on pan/zoom */
	let morphTickerFn: (() => void) | null = null;
	/** Paused during DOM drag so ticker doesn't fight with pointer movement */
	let morphDragging = false;

	/** Create a draggable morph wrapper around an iframe, positioned at the card */
	function createMorphWrapper(iframe: HTMLIFrameElement, objectId: string, embed: { w: number; h: number }): HTMLDivElement {
		const HANDLE_H = 28;

		const wrapper = document.createElement('div');
		wrapper.style.cssText = `position:fixed;width:${embed.w}px;height:${embed.h + HANDLE_H}px;z-index:40;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.5);`;

		// Drag handle bar at top
		const handle = document.createElement('div');
		handle.style.cssText = `width:100%;height:${HANDLE_H}px;background:#1a1a2e;cursor:grab;display:flex;align-items:center;justify-content:center;user-select:none;`;

		// Grip dots
		const grip = document.createElement('div');
		grip.style.cssText = 'width:40px;height:4px;border-radius:2px;background:rgba(255,255,255,0.25);';
		handle.appendChild(grip);

		// Iframe fills the rest
		iframe.style.cssText = `width:100%;height:${embed.h}px;border:none;display:block;`;

		wrapper.appendChild(handle);
		wrapper.appendChild(iframe);

		// ── Drag logic ──
		let dragging = false;
		let startX = 0;
		let startY = 0;
		let wrapperStartX = 0;
		let wrapperStartY = 0;

		const onPointerDown = (e: PointerEvent) => {
			dragging = true;
			morphDragging = true;
			startX = e.clientX;
			startY = e.clientY;
			wrapperStartX = wrapper.offsetLeft;
			wrapperStartY = wrapper.offsetTop;
			handle.style.cursor = 'grabbing';
			handle.setPointerCapture(e.pointerId);
			e.preventDefault();
		};

		const onPointerMove = (e: PointerEvent) => {
			if (!dragging || !renderer) return;
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;
			const newLeft = wrapperStartX + dx;
			const newTop = wrapperStartY + dy;
			wrapper.style.left = `${newLeft}px`;
			wrapper.style.top = `${newTop}px`;

			// Sync the PixiJS object to follow the DOM drag
			// Convert wrapper center to world coords
			const centerScreenX = newLeft + embed.w / 2;
			const centerScreenY = newTop + HANDLE_H + embed.h / 2;
			const world = renderer.screenToWorld(centerScreenX, centerScreenY);
			// Offset so the card center aligns
			renderer.moveMusicObject(objectId, world.x - 160, world.y - 55);
		};

		const onPointerUp = (e: PointerEvent) => {
			if (!dragging || !renderer) return;
			dragging = false;
			morphDragging = false;
			handle.style.cursor = 'grab';
			handle.releasePointerCapture(e.pointerId);

			// Persist new position to Convex
			const rect = renderer.getMusicObjectRect(objectId);
			if (rect && renderer.onObjectMoved) {
				renderer.onObjectMoved(objectId, rect.worldX, rect.worldY);
			}
		};

		handle.addEventListener('pointerdown', onPointerDown);
		handle.addEventListener('pointermove', onPointerMove);
		handle.addEventListener('pointerup', onPointerUp);

		return wrapper;
	}

	/** Start playing music */
	function startMusicPlayback(objectId: string, embedUrl: string, platform: string) {
		const sep = embedUrl.includes('?') ? '&' : '?';
		let url = embedUrl + sep + 'autoplay=1';
		if (platform === 'spotify') url += '&theme=0';

		const embed = EMBED_SIZES[platform] ?? { w: 380, h: 152 };
		const isMorph = MORPH_PLATFORMS.has(platform);
		const isHidden = platform === 'youtube-music';

		const iframe = document.createElement('iframe');
		iframe.src = url;
		iframe.allow = 'autoplay; encrypted-media';
		iframe.setAttribute('frameborder', '0');
		iframe.sandbox.add('allow-same-origin', 'allow-scripts', 'allow-popups');

		if (isMorph && renderer) {
			// Morph: wrap iframe in draggable container, center on card
			const rect = renderer.getMusicObjectRect(objectId);
			if (rect) {
				const wrapper = createMorphWrapper(iframe, objectId, embed);

				const scale = renderer.getScale();
				const cardScreen = renderer.worldToScreen(rect.worldX, rect.worldY);
				const cx = cardScreen.x + (rect.w * scale) / 2;
				const cy = cardScreen.y + (rect.h * scale) / 2;
				wrapper.style.left = `${cx - embed.w / 2}px`;
				wrapper.style.top = `${cy - (embed.h + 28) / 2}px`;

				document.body.appendChild(wrapper);
				morphWrapper = wrapper;

				// Hide the PixiJS card underneath
				renderer.setMusicObjectVisible(objectId, false);

				// Track pan/zoom: reposition wrapper centered on card every frame
				morphTickerFn = () => {
					if (!morphWrapper || !renderer || morphDragging) return;
					const r = renderer.getMusicObjectRect(objectId);
					if (!r) return;
					const sc = renderer.getScale();
					const s = renderer.worldToScreen(r.worldX, r.worldY);
					const mcx = s.x + (r.w * sc) / 2;
					const mcy = s.y + (r.h * sc) / 2;
					morphWrapper.style.left = `${mcx - embed.w / 2}px`;
					morphWrapper.style.top = `${mcy - (embed.h + 28) / 2}px`;
				};
				renderer.app.ticker.add(morphTickerFn);
			}
		} else if (isHidden) {
			// YouTube Music: hidden, autoplay works
			iframe.style.cssText = 'position:fixed;bottom:0;left:0;width:1px;height:1px;border:none;opacity:0.01;pointer-events:none;';
			document.body.appendChild(iframe);
		} else {
			// YouTube video: visible floating embed at bottom-center
			iframe.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);width:${embed.w}px;max-width:calc(100vw - 32px);height:${embed.h}px;border:none;border-radius:12px;z-index:40;box-shadow:0 8px 32px rgba(0,0,0,0.4);`;
			document.body.appendChild(iframe);
		}

		audioIframe = iframe;
		playingMusicId = objectId;
		renderer?.setMusicPlaying(objectId, true);
	}

	/** Stop any playing music */
	function stopMusicPlayback() {
		// Remove the ticker that tracks pan/zoom
		if (morphTickerFn && renderer) {
			renderer.app.ticker.remove(morphTickerFn);
			morphTickerFn = null;
		}

		// Remove morph wrapper (contains the iframe) or standalone iframe
		if (morphWrapper) {
			document.body.removeChild(morphWrapper);
			morphWrapper = null;
			audioIframe = null;
		} else if (audioIframe) {
			document.body.removeChild(audioIframe);
			audioIframe = null;
		}

		if (playingMusicId) {
			renderer?.setMusicPlaying(playingMusicId, false);
			renderer?.setMusicObjectVisible(playingMusicId, true);
			playingMusicId = null;
		}
	}

</script>

<div bind:this={canvasContainer} class="w-screen h-screen overflow-hidden"></div>

{#if showLoadingSpinner}
	<div class="fixed inset-0 z-30 flex items-center justify-center pointer-events-none">
		<div class="loading-orb"></div>
	</div>
{/if}

{#if dragOver}
	<div class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
		<div class="absolute inset-4 border-2 border-dashed border-white/40 rounded-2xl"></div>
		<div class="bg-black/40 backdrop-blur-sm px-6 py-3 rounded-xl">
			<p class="text-white/80 text-lg font-medium">Drop photos here</p>
		</div>
	</div>
{/if}

<!-- Auth forms now live in toolbar dropdowns (AuthDropdown.svelte) -->

{#if currentUser.isAuthenticated}
	<CanvasToolbar
		username={currentUser.user?.displayName ?? currentUser.user?.username ?? ''}
		canvasName={activeCanvasName}
		isOwner={isCanvasOwner}
		onAddNote={addNote}
		onCreateBeacon={() => { showCreateBeacon = true; }}
		onAddPhoto={addPhoto}
		onAddMusic={() => { showAddMusic = true; }}
		onNavigateToFriend={(friendUuid, displayName) => {
			const canvas = accessibleCanvases.data?.find((c: any) => c.ownerId === friendUuid && c.type === 'personal');
			if (canvas) {
				switchCanvas(canvas._id, `${displayName}'s Canvas`);
			}
		}}
		friendCode={currentUser.user?.friendCode ?? ''}
		activeCanvasId={activeCanvasId}
		canvases={accessibleCanvases.data}
		onSelectCanvas={switchCanvas}
		onCreateCanvas={() => { showCreateCanvas = true; }}
		onSettingsCanvas={(id, name) => { settingsCanvas = { id, name }; }}
		{webrtcConnected}
		hasFriendBeacons={friendBeaconActivity.data?.hasFriendBeacons ?? false}
		activeBeaconCanvasIds={friendBeaconActivity.data?.activeCanvasIds ?? []}
	/>
{:else if landingMode}
	<CanvasToolbar
		username="visitor"
		canvasName="Orbyt"
		isOwner={true}
		showAccount={false}
		onAuthSuccess={() => {/* Transition handled by $effect watching isAuthenticated */}}
		onAddNote={() => {}}
		onCreateBeacon={() => {}}
		onAddPhoto={() => {}}
		onAddMusic={() => {}}
		activeCanvasId={null}
		canvases={undefined}
		onSelectCanvas={() => {}}
		onCreateCanvas={() => {}}
	/>
{/if}

{#if currentUser.isAuthenticated && isCanvasOwner}
	<CanvasStylePicker
		activeMode={overlayMode}
		onchange={changeOverlayMode}
		onpreview={(mode) => renderer?.setOverlayMode(mode)}
	/>
{:else if landingMode}
	<CanvasStylePicker
		activeMode={overlayMode}
		onchange={(mode) => { overlayMode = mode; renderer?.setOverlayMode(mode); }}
		onpreview={(mode) => renderer?.setOverlayMode(mode)}
	/>
{/if}

{#if currentUser.isAuthenticated && canvasViewers.data && canvasViewers.data.length > 1}
	<ViewerAvatars
		viewers={canvasViewers.data}
		currentUserId={currentUser.user?.uuid ?? ''}
	/>
{/if}

<!-- Modals -->
{#if showCreateCanvas}
	<CreateCanvasModal
		onCreated={onCanvasCreated}
		onClose={() => { showCreateCanvas = false; }}
	/>
{/if}

{#if showCreateBeacon && activeCanvasId && currentUser.user}
	<CreateBeaconModal
		canvasId={activeCanvasId}
		userUuid={currentUser.user.uuid}
		onClose={() => { showCreateBeacon = false; }}
	/>
{/if}

{#if selectedBeacon && currentUser.user}
	<BeaconDetailPanel
		beacon={selectedBeacon}
		userUuid={currentUser.user.uuid}
		onClose={() => { selectedBeacon = null; }}
		onNavigateToUser={(userId, displayName) => {
			const canvas = accessibleCanvases.data?.find((c: any) => c.ownerId === userId && c.type === 'personal');
			if (canvas) {
				selectedBeacon = null;
				switchCanvas(canvas._id, canvas.name);
			}
		}}
	/>
{/if}

{#if selectedNote && currentUser.user}
	<NoteDetailPanel
		note={selectedNote}
		isOwner={isCanvasOwner}
		onClose={() => { selectedNote = null; }}
		onDeleted={() => { selectedNote = null; }}
	/>
{/if}

{#if inlineEditState}
	<InlineNoteEditor
		note={inlineEditState.note}
		screenX={inlineEditState.screenX}
		screenY={inlineEditState.screenY}
		screenWidth={inlineEditState.screenWidth}
		screenHeight={inlineEditState.screenHeight}
		scale={inlineEditState.scale}
		onSave={saveInlineNote}
		onClose={closeInlineEditor}
		onDelete={deleteInlineNote}
	/>
{/if}

{#if stickerPickerState}
	<StickerPicker
		x={stickerPickerState.x}
		y={stickerPickerState.y}
		onSelect={placeSticker}
		onClose={() => { stickerPickerState = null; }}
	/>
{/if}

{#if selectedPhoto}
	<PhotoDetailPanel
		photo={selectedPhoto}
		isOwner={isCanvasOwner}
		onClose={() => { selectedPhoto = null; }}
		onDeleted={() => { selectedPhoto = null; }}
	/>
{/if}

{#if showAddMusic && activeCanvasId}
	<AddMusicModal
		canvasId={activeCanvasId}
		onClose={() => { showAddMusic = false; }}
		onCreated={() => { showAddMusic = false; }}
	/>
{/if}

{#if settingsCanvas}
	<OrbytSettingsPanel
		canvasId={settingsCanvas.id}
		canvasName={settingsCanvas.name}
		onClose={() => { settingsCanvas = null; }}
		onDeleted={() => {
			settingsCanvas = null;
			if (currentUser.canvasId) {
				activeCanvasId = currentUser.canvasId;
				activeCanvasName = currentUser.canvasName ?? 'My Orbyt';
			}
		}}
	/>
{/if}


