/**
 * Reactive auth state store using Svelte 5 runes.
 * Components import this to check auth — never Better Auth directly.
 *
 * Uses a single combined query (getUserWithCanvas) to eliminate the
 * 3-step waterfall: getCurrentUser → getByAuthAccount → getPersonalCanvas.
 */
import { useQuery } from "convex-svelte";
import { api } from "$convex/_generated/api";
import type { AuthState, AuthUser } from "./types";

/** Reactive query for the current authenticated Astrophage user + personal canvas */
export function useCurrentUser() {
	// Single query: auth check + user lookup + personal canvas — ONE subscription
	const combined = useQuery(api.users.getUserWithCanvas, {});

	const state = $derived.by((): AuthState & { canvasId: string | null; canvasName: string | null } => {
		if (combined.isLoading) {
			return { isAuthenticated: false, isLoading: true, user: null, canvasId: null, canvasName: null };
		}

		if (!combined.data) {
			return { isAuthenticated: false, isLoading: false, user: null, canvasId: null, canvasName: null };
		}

		const d = combined.data;
		return {
			isAuthenticated: true,
			isLoading: false,
			user: {
				uuid: d.uuid,
				username: d.username,
				displayName: d.displayName,
				avatarUrl: d.avatarUrl,
				friendCode: d.friendCode,
			},
			canvasId: d.canvasId,
			canvasName: d.canvasName,
		};
	});

	return {
		get isAuthenticated() { return state.isAuthenticated; },
		get isLoading() { return state.isLoading; },
		get user() { return state.user; },
		get canvasId() { return state.canvasId; },
		get canvasName() { return state.canvasName; },
	};
}
