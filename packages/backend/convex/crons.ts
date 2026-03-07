import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Clean up expired beacons every 15 minutes
crons.interval(
	"cleanup expired beacons",
	{ minutes: 15 },
	internal.beacons.cleanupExpired
);

// Clean up stale signaling messages every 5 minutes
crons.interval(
	"cleanup stale signals",
	{ minutes: 5 },
	internal.signaling.cleanupStaleSignals
);

// Clean up stale presence records every 2 minutes
crons.interval(
	"cleanup stale presence",
	{ minutes: 2 },
	internal.presence.cleanupStalePresence
);

// Clean up expired recovery attempt records every 30 minutes
crons.interval(
	"cleanup recovery attempts",
	{ minutes: 30 },
	internal.recovery.cleanupRecoveryAttempts
);

export default crons;
