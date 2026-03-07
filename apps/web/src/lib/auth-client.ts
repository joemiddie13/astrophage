import { createAuthClient } from "better-auth/svelte";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { usernameClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
	baseURL: import.meta.env.DEV ? "http://localhost:5173" : import.meta.env.VITE_SITE_URL,
	plugins: [convexClient(), usernameClient(), passkeyClient()],
});
