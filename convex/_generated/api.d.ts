/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as agentAuth from "../agentAuth.js";
import type * as agentFiles from "../agentFiles.js";
import type * as agentHelp from "../agentHelp.js";
import type * as auth from "../auth.js";
import type * as boards from "../boards.js";
import type * as commentAnchors from "../commentAnchors.js";
import type * as comments from "../comments.js";
import type * as composio from "../composio.js";
import type * as crons from "../crons.js";
import type * as docs from "../docs.js";
import type * as http from "../http.js";
import type * as ideas from "../ideas.js";
import type * as lib from "../lib.js";
import type * as library from "../library.js";
import type * as links from "../links.js";
import type * as mcp from "../mcp.js";
import type * as migrations from "../migrations.js";
import type * as partners from "../partners.js";
import type * as share from "../share.js";
import type * as socialLinks from "../socialLinks.js";
import type * as topicFields from "../topicFields.js";
import type * as topics from "../topics.js";
import type * as tweets from "../tweets.js";
import type * as updates from "../updates.js";
import type * as users from "../users.js";
import type * as videos from "../videos.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  agentAuth: typeof agentAuth;
  agentFiles: typeof agentFiles;
  agentHelp: typeof agentHelp;
  auth: typeof auth;
  boards: typeof boards;
  commentAnchors: typeof commentAnchors;
  comments: typeof comments;
  composio: typeof composio;
  crons: typeof crons;
  docs: typeof docs;
  http: typeof http;
  ideas: typeof ideas;
  lib: typeof lib;
  library: typeof library;
  links: typeof links;
  mcp: typeof mcp;
  migrations: typeof migrations;
  partners: typeof partners;
  share: typeof share;
  socialLinks: typeof socialLinks;
  topicFields: typeof topicFields;
  topics: typeof topics;
  tweets: typeof tweets;
  updates: typeof updates;
  users: typeof users;
  videos: typeof videos;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
