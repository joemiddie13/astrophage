import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	users: defineTable({
		uuid: v.string(),
		authAccountId: v.string(),
		username: v.string(),
		displayName: v.string(),
		avatarUrl: v.optional(v.string()),
		email: v.optional(v.string()),
		friendCode: v.optional(v.string()),
		recoveryCodeHashes: v.optional(v.array(v.string())),
		recoveryCodesCreatedAt: v.optional(v.number()),
	})
		.index("by_uuid", ["uuid"])
		.index("by_username", ["username"])
		.index("by_auth_account", ["authAccountId"])
		.index("by_friend_code", ["friendCode"]),

	canvases: defineTable({
		ownerId: v.string(), // UUID, not Convex _id — portable for AT Protocol
		name: v.string(),
		type: v.union(v.literal("personal"), v.literal("shared")),
		bounds: v.object({
			width: v.number(),
			height: v.number(),
		}),
		overlayMode: v.optional(v.union(v.literal("none"), v.literal("dots"), v.literal("lines"))),
	})
		.index("by_owner", ["ownerId"])
		.index("by_owner_type", ["ownerId", "type"]),

	canvasAccess: defineTable({
		canvasId: v.id("canvases"),
		userId: v.string(), // UUID
		role: v.union(v.literal("owner"), v.literal("member"), v.literal("viewer")),
		invitedBy: v.string(), // UUID
		invitedAt: v.number(),
		lastAccessedAt: v.optional(v.number()),
	})
		.index("by_canvas", ["canvasId"])
		.index("by_user", ["userId"])
		.index("by_canvas_user", ["canvasId", "userId"]),

	friendships: defineTable({
		requesterId: v.string(), // UUID
		receiverId: v.string(), // UUID
		status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("declined")),
		createdAt: v.number(),
	})
		.index("by_requester", ["requesterId"])
		.index("by_receiver", ["receiverId"])
		.index("by_pair", ["requesterId", "receiverId"])
		.index("by_pair_status", ["requesterId", "receiverId", "status"])
		.index("by_requester_status", ["requesterId", "status"])
		.index("by_receiver_status", ["receiverId", "status"]),

	canvasObjects: defineTable({
		canvasId: v.id("canvases"),
		creatorId: v.string(), // UUID, not Convex _id
		type: v.union(v.literal("textblock"), v.literal("beacon"), v.literal("photo"), v.literal("music")),
		position: v.object({
			x: v.number(),
			y: v.number(),
		}),
		size: v.object({
			w: v.number(),
			h: v.number(),
		}),
		content: v.union(
			v.object({
				text: v.string(),
				color: v.number(),
				title: v.optional(v.string()),
			}),
			v.object({
				title: v.string(),
				description: v.optional(v.string()),
				locationAddress: v.optional(v.string()),
				startTime: v.number(),
				endTime: v.number(),
				visibilityType: v.union(v.literal("direct"), v.literal("canvas")),
				directRecipients: v.optional(v.array(v.string())),
				directBeaconGroupId: v.optional(v.string()),
			}),
			v.object({
				storageId: v.string(),
				caption: v.optional(v.string()),
				rotation: v.number(),
			}),
			v.object({
				url: v.string(),
				platform: v.string(),
				title: v.string(),
				artist: v.string(),
				thumbnailUrl: v.optional(v.string()),
				embedUrl: v.string(),
			}),
		),
		expiresAt: v.optional(v.number()),
		/** Top-level field for direct beacon group lookups (indexed). Mirrors content.directBeaconGroupId. */
		directBeaconGroupId: v.optional(v.string()),
	})
		.index("by_canvas", ["canvasId"])
		.index("by_creator", ["creatorId"])
		.index("by_creator_type", ["creatorId", "type"])
		.index("by_type_expires", ["type", "expiresAt"])
		.index("by_beacon_group", ["directBeaconGroupId"]),

	beaconResponses: defineTable({
		beaconId: v.id("canvasObjects"),
		userId: v.string(), // UUID
		status: v.union(v.literal("joining"), v.literal("interested"), v.literal("declined")),
		respondedAt: v.number(),
	})
		.index("by_beacon", ["beaconId"])
		.index("by_beacon_user", ["beaconId", "userId"]),

	stickerReactions: defineTable({
		objectId: v.id("canvasObjects"),
		userId: v.string(), // UUID
		stickerType: v.string(),
		position: v.object({ x: v.number(), y: v.number() }),
		createdAt: v.number(),
	}).index("by_object", ["objectId"]),

	signalingMessages: defineTable({
		canvasId: v.id("canvases"),
		fromUserId: v.string(), // UUID
		toUserId: v.string(), // UUID
		type: v.union(
			v.literal("offer"),
			v.literal("answer"),
			v.literal("ice-candidate"),
		),
		payload: v.string(), // JSON-serialized SDP/ICE
		createdAt: v.number(),
	})
		.index("by_canvas_recipient", ["canvasId", "toUserId"])
		.index("by_created", ["createdAt"])
		.index("by_sender_created", ["fromUserId", "createdAt"]),

	recoveryAttempts: defineTable({
		username: v.string(),
		attemptedAt: v.number(),
	})
		.index("by_username", ["username"])
		.index("by_attempted", ["attemptedAt"]),

	canvasPresence: defineTable({
		canvasId: v.id("canvases"),
		userId: v.string(), // UUID
		username: v.string(),
		displayName: v.string(),
		lastSeen: v.number(),
	})
		.index("by_canvas", ["canvasId"])
		.index("by_canvas_user", ["canvasId", "userId"])
		.index("by_last_seen", ["lastSeen"]),
});
