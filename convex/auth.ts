import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { ConvexError } from "convex/values";

// Everyone who signs up with the team password joins the one shared team.
// The password lives only in the TEAM_CODE environment variable; without it, nobody can sign up.
const TEAM_CODE = process.env.TEAM_CODE?.trim() || null;

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        if (params.flow === "signUp" && (!TEAM_CODE || String(params.teamCode ?? "").trim() !== TEAM_CODE)) {
          throw new ConvexError("That team password isn't right.");
        }
        const name = typeof params.name === "string" ? params.name.trim().slice(0, 80) : undefined;
        return { email: String(params.email).trim().toLowerCase(), ...(name ? { name } : {}) };
      },
    }),
  ],
});
