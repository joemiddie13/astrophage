"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal, components } from "./_generated/api";
import { hashPassword } from "better-auth/crypto";
import { createHash } from "crypto";

/** SHA-256 hash a string (Node.js crypto — works in "use node" actions) */
function sha256(input: string): string {
	return createHash("sha256").update(input).digest("hex");
}

/**
 * Verify a recovery code and reset the user's password.
 * This is an unauthenticated action (the user is locked out).
 * Uses "use node" for password hashing via Better Auth's hashPassword.
 */
export const verifyRecoveryCodeAndResetPassword = action({
	args: {
		username: v.string(),
		recoveryCode: v.string(),
		newPassword: v.string(),
	},
	handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
		// Uniform error message for all failure cases — prevents information leakage
		const GENERIC_ERROR = "Invalid username or recovery code";

		try {
			// Validate password length
			if (args.newPassword.length < 10 || args.newPassword.length > 64) {
				return { success: false, error: "Password must be 10–64 characters" };
			}

			if (args.username.length < 3 || args.username.length > 30) {
				return { success: false, error: GENERIC_ERROR };
			}

			// Rate limit: max 5 recovery attempts per username per 15 minutes
			const rateLimited = await ctx.runQuery(
				internal.recovery.checkRecoveryRateLimit,
				{ username: args.username },
			);
			if (rateLimited) {
				return { success: false, error: "Too many attempts — try again later" };
			}

			// Record this attempt before checking credentials
			await ctx.runMutation(
				internal.recovery.recordRecoveryAttempt,
				{ username: args.username },
			);

			// 1. Find user by username
			const user = await ctx.runQuery(
				internal.recovery.getUserByUsername,
				{ username: args.username },
			);

			if (!user) {
				return { success: false, error: GENERIC_ERROR };
			}

			if (!user.recoveryCodeHashes || user.recoveryCodeHashes.length === 0) {
				return { success: false, error: GENERIC_ERROR };
			}

			// 2. Normalize + hash the provided recovery code
			const normalizedCode = args.recoveryCode.replace(/[\s-]/g, "").toUpperCase();
			const codeHash = sha256(normalizedCode);

			// 3. Check against stored hashes
			if (!user.recoveryCodeHashes.includes(codeHash)) {
				return { success: false, error: GENERIC_ERROR };
			}

			// 4. Hash the new password (Better Auth compatible)
			const hashedPassword = await hashPassword(args.newPassword);

			// 5. Find the credential account in Better Auth's component tables
			const account = await ctx.runQuery(
				components.betterAuth.adapter.findOne,
				{
					model: "account",
					where: [
						{ field: "userId", value: user.authAccountId },
						{ field: "providerId", value: "credential" },
					],
				},
			) as { _id: string; id?: string } | null;

			if (!account) {
				return { success: false, error: "Account not found" };
			}

			// 6. Update the password hash in Better Auth's account table
			await ctx.runMutation(
				components.betterAuth.adapter.updateOne,
				{
					input: {
						model: "account",
						where: [{ field: "_id" as any, value: (account as any)._id }],
						update: { password: hashedPassword },
					},
				} as any,
			);

			// 7. Remove the used recovery code
			await ctx.runMutation(
				internal.recovery.removeUsedRecoveryCode,
				{ userId: user._id, codeHash },
			);

			return { success: true };
		} catch (err: any) {
			// Never leak internal error details
			console.error("Recovery error:", err?.message ?? String(err));
			return { success: false, error: GENERIC_ERROR };
		}
	},
});
