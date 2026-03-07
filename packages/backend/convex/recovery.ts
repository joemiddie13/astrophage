import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { getAuthenticatedUser } from "./users";

const CODE_COUNT = 10;
const CODE_LENGTH = 10;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars

/** SHA-256 hash a string — uses Web Crypto (available in Convex runtime) */
async function sha256(input: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(input);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Generate a random alphanumeric code */
function generateCode(): string {
	let code = "";
	const randomValues = new Uint8Array(CODE_LENGTH);
	crypto.getRandomValues(randomValues);
	for (let i = 0; i < CODE_LENGTH; i++) {
		code += CODE_CHARS[randomValues[i] % CODE_CHARS.length];
	}
	return code;
}

/**
 * Generate 10 recovery codes for the authenticated user.
 * Returns plaintext codes (shown once, never retrievable again).
 * Replaces any previously generated codes.
 */
export const generateRecoveryCodes = mutation({
	args: {},
	handler: async (ctx) => {
		const user = await getAuthenticatedUser(ctx);

		const plaintextCodes: string[] = [];
		const hashes: string[] = [];

		for (let i = 0; i < CODE_COUNT; i++) {
			const code = generateCode();
			plaintextCodes.push(code);
			hashes.push(await sha256(code));
		}

		await ctx.db.patch(user._id, {
			recoveryCodeHashes: hashes,
			recoveryCodesCreatedAt: Date.now(),
		});

		return plaintextCodes;
	},
});

/** Internal query: find user by username (for use by the recovery action) */
export const getUserByUsername = internalQuery({
	args: { username: v.string() },
	handler: async (ctx, args) => {
		return ctx.db
			.query("users")
			.withIndex("by_username", (q) => q.eq("username", args.username))
			.first();
	},
});

const MAX_RECOVERY_ATTEMPTS = 5;
const RECOVERY_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/** Internal query: check if a username has exceeded recovery attempt rate limit */
export const checkRecoveryRateLimit = internalQuery({
	args: { username: v.string() },
	handler: async (ctx, args) => {
		const cutoff = Date.now() - RECOVERY_WINDOW_MS;
		const recentAttempts = await ctx.db
			.query("recoveryAttempts")
			.withIndex("by_username", (q) => q.eq("username", args.username))
			.filter((q) => q.gt(q.field("attemptedAt"), cutoff))
			.collect();
		return recentAttempts.length >= MAX_RECOVERY_ATTEMPTS;
	},
});

/** Internal mutation: record a recovery attempt */
export const recordRecoveryAttempt = internalMutation({
	args: { username: v.string() },
	handler: async (ctx, args) => {
		await ctx.db.insert("recoveryAttempts", {
			username: args.username,
			attemptedAt: Date.now(),
		});
	},
});

/** Internal mutation: clean up old recovery attempt records (called by cron) */
export const cleanupRecoveryAttempts = internalMutation({
	args: {},
	handler: async (ctx) => {
		const cutoff = Date.now() - RECOVERY_WINDOW_MS;
		const stale = await ctx.db
			.query("recoveryAttempts")
			.withIndex("by_attempted", (q) => q.lt("attemptedAt", cutoff))
			.collect();
		await Promise.all(stale.map((r) => ctx.db.delete(r._id)));
	},
});

/** Internal mutation: remove a used recovery code hash from the user's array */
export const removeUsedRecoveryCode = internalMutation({
	args: {
		userId: v.id("users"),
		codeHash: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await ctx.db.get(args.userId);
		if (!user?.recoveryCodeHashes) return;

		const idx = user.recoveryCodeHashes.indexOf(args.codeHash);
		if (idx === -1) return;

		const remaining = [...user.recoveryCodeHashes];
		remaining.splice(idx, 1);
		await ctx.db.patch(args.userId, { recoveryCodeHashes: remaining });
	},
});
