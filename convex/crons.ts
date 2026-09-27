import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Keeps the Library in step with scripts even for changes that didn't refresh it right away
crons.interval("refresh library", { minutes: 10 }, internal.library.syncAll, {});

export default crons;
