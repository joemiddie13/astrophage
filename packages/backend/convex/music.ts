import { v } from "convex/values";
import { action, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthenticatedUser } from "./users";
import { checkCanvasAccess } from "./access";
import {
	validatePosition,
	validateMusicUrl,
	MAX_MUSIC_URL_LENGTH,
	MAX_MUSIC_TITLE_LENGTH,
	MAX_MUSIC_ARTIST_LENGTH,
} from "./validators";

/** Allowed thumbnail URL domains from oEmbed responses */
const ALLOWED_THUMBNAIL_DOMAINS = [
	"i.scdn.co",
	"mosaic.scdn.co",
	"i.ytimg.com",
	"is1-ssl.mzstatic.com",
	"is2-ssl.mzstatic.com",
	"is3-ssl.mzstatic.com",
	"is4-ssl.mzstatic.com",
	"is5-ssl.mzstatic.com",
];

/** Validate that a thumbnail URL is from a trusted domain */
function validateThumbnailUrl(url: string | undefined): string | undefined {
	if (!url) return undefined;
	try {
		const parsed = new URL(url);
		const isTrusted = ALLOWED_THUMBNAIL_DOMAINS.some(
			(domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
		);
		return isTrusted ? url : undefined;
	} catch {
		return undefined;
	}
}

// ── oEmbed metadata fetching ────────────────────────────────────────

interface MusicMetadata {
	platform: "spotify" | "apple-music" | "youtube" | "youtube-music";
	title: string;
	artist: string;
	thumbnailUrl?: string;
	embedUrl: string;
}

/** Allowed embed URL domains — validated before storing or rendering */
const ALLOWED_EMBED_DOMAINS = [
	"open.spotify.com",
	"www.youtube.com",
	"embed.music.apple.com",
];

/** Allowed platform values */
const ALLOWED_PLATFORMS = ["spotify", "apple-music", "youtube", "youtube-music"] as const;

/** Validate that an embed URL is from a trusted domain */
function validateEmbedUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "https:") return false;
		return ALLOWED_EMBED_DOMAINS.some(
			(domain) => parsed.hostname === domain
		);
	} catch {
		return false;
	}
}

/** Extract Spotify embed URL from an oEmbed HTML snippet */
function extractSpotifyEmbedUrl(html: string): string | null {
	const match = html.match(/src="(https:\/\/open\.spotify\.com\/embed[^"]+)"/);
	return match ? match[1] : null;
}

/** Build Apple Music embed URL from a regular Apple Music URL */
function buildAppleMusicEmbedUrl(url: string): string {
	return url.replace("music.apple.com", "embed.music.apple.com");
}

/** Extract YouTube video ID */
function extractYouTubeId(url: string): string | null {
	const patterns = [
		/youtube\.com\/watch\?v=([^&]+)/,
		/youtu\.be\/([^?]+)/,
		/youtube\.com\/shorts\/([^?]+)/,
		/music\.youtube\.com\/watch\?v=([^&]+)/,
	];
	for (const pattern of patterns) {
		const match = url.match(pattern);
		if (match) return match[1];
	}
	return null;
}

async function fetchSpotifyMetadata(url: string): Promise<MusicMetadata> {
	const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
	const res = await fetch(oembedUrl);
	if (!res.ok) throw new Error("Failed to fetch Spotify metadata");
	const data = await res.json();

	const embedUrl = extractSpotifyEmbedUrl(data.html ?? "") ??
		url.replace("open.spotify.com", "open.spotify.com/embed");

	// Spotify oEmbed returns title as "Song - Artist"
	let title = data.title ?? "Unknown";
	let artist = "";
	const dashIdx = title.lastIndexOf(" - ");
	if (dashIdx > 0) {
		artist = title.substring(dashIdx + 3);
		title = title.substring(0, dashIdx);
	}

	return {
		platform: "spotify",
		title: title.slice(0, MAX_MUSIC_TITLE_LENGTH),
		artist: artist.slice(0, MAX_MUSIC_ARTIST_LENGTH),
		thumbnailUrl: validateThumbnailUrl(data.thumbnail_url),
		embedUrl,
	};
}

async function fetchYouTubeMetadata(url: string, platform: "youtube" | "youtube-music"): Promise<MusicMetadata> {
	const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
	const res = await fetch(oembedUrl);
	if (!res.ok) throw new Error("Failed to fetch YouTube metadata");
	const data = await res.json();

	const videoId = extractYouTubeId(url);
	const embedUrl = videoId
		? `https://www.youtube.com/embed/${videoId}`
		: url;

	return {
		platform,
		title: (data.title ?? "Unknown").slice(0, MAX_MUSIC_TITLE_LENGTH),
		artist: (data.author_name ?? "").slice(0, MAX_MUSIC_ARTIST_LENGTH),
		thumbnailUrl: validateThumbnailUrl(data.thumbnail_url),
		embedUrl,
	};
}

async function fetchAppleMusicMetadata(url: string): Promise<MusicMetadata> {
	// Apple Music has no public oEmbed — fetch the page and parse OG tags
	const res = await fetch(url, {
		headers: { "User-Agent": "Mozilla/5.0 (compatible; Astrophage/1.0)" },
	});
	if (!res.ok) throw new Error("Failed to fetch Apple Music page");
	const html = await res.text();

	const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/) ??
		html.match(/<meta\s+content="([^"]*)"\s+property="og:title"/);
	const imageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/) ??
		html.match(/<meta\s+content="([^"]*)"\s+property="og:image"/);

	// Try to extract artist from og:description or page title
	const descMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/) ??
		html.match(/<meta\s+content="([^"]*)"\s+property="og:description"/);

	let title = titleMatch?.[1] ?? "Unknown";
	let artist = "";

	// Apple Music OG description often contains artist info
	if (descMatch?.[1]) {
		const desc = descMatch[1];
		// Common format: "Song by Artist on Apple Music" or "Album by Artist"
		const byMatch = desc.match(/by\s+(.+?)(?:\s+on\s+Apple Music|\.\s|$)/i);
		if (byMatch) artist = byMatch[1];
	}

	return {
		platform: "apple-music",
		title: title.slice(0, MAX_MUSIC_TITLE_LENGTH),
		artist: artist.slice(0, MAX_MUSIC_ARTIST_LENGTH),
		thumbnailUrl: validateThumbnailUrl(imageMatch?.[1]),
		embedUrl: buildAppleMusicEmbedUrl(url),
	};
}

// ── Convex action: fetch metadata from external APIs ────────────────

export const fetchMusicMetadata = action({
	args: { url: v.string() },
	handler: async (ctx, args) => {
		// Verify caller is authenticated (actions don't have ctx.db — use internal query)
		await ctx.runQuery(internal.users.verifyAuth);

		const platform = validateMusicUrl(args.url);

		switch (platform) {
			case "spotify":
				return await fetchSpotifyMetadata(args.url);
			case "youtube":
				return await fetchYouTubeMetadata(args.url, "youtube");
			case "youtube-music":
				return await fetchYouTubeMetadata(args.url, "youtube-music");
			case "apple-music":
				return await fetchAppleMusicMetadata(args.url);
		}
	},
});

// ── Convex mutation: create music canvas object ─────────────────────

export const createMusic = mutation({
	args: {
		canvasId: v.id("canvases"),
		position: v.object({ x: v.number(), y: v.number() }),
		url: v.string(),
		platform: v.string(),
		title: v.string(),
		artist: v.string(),
		thumbnailUrl: v.optional(v.string()),
		embedUrl: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx);
		await checkCanvasAccess(ctx, args.canvasId, user.uuid, "member");

		validatePosition(args.position);

		if (args.url.length > MAX_MUSIC_URL_LENGTH) {
			throw new Error(`URL must be ${MAX_MUSIC_URL_LENGTH} characters or less`);
		}
		if (args.title.length > MAX_MUSIC_TITLE_LENGTH) {
			throw new Error(`Title must be ${MAX_MUSIC_TITLE_LENGTH} characters or less`);
		}
		if (args.artist.length > MAX_MUSIC_ARTIST_LENGTH) {
			throw new Error(`Artist must be ${MAX_MUSIC_ARTIST_LENGTH} characters or less`);
		}
		if (!(ALLOWED_PLATFORMS as readonly string[]).includes(args.platform)) {
			throw new Error("Invalid platform");
		}
		if (!validateEmbedUrl(args.embedUrl)) {
			throw new Error("Invalid embed URL — must be HTTPS from a trusted music platform");
		}

		return ctx.db.insert("canvasObjects", {
			canvasId: args.canvasId,
			creatorId: user.uuid,
			type: "music",
			position: args.position,
			size: { w: 320, h: 110 },
			content: {
				url: args.url,
				platform: args.platform,
				title: args.title,
				artist: args.artist,
				thumbnailUrl: args.thumbnailUrl,
				embedUrl: args.embedUrl,
			},
		});
	},
});
