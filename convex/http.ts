import { httpRouter } from "convex/server";
import { auth } from "./auth";
import {
  httpAddInstructions,
  httpComment,
  httpCreateScript,
  httpGetScript,
  httpAddBriefLinks,
  httpDeleteComment,
  httpMoveComment,
  httpUpdateComment,
  httpDeleteInstruction,
  httpEditLines,
  httpEditScript,
  httpListVersions,
  httpRemoveBriefLinks,
  httpRemoveCaption,
  httpRestoreVersion,
  httpAddIdeas,
  httpListIdeas,
  httpListBoards,
  httpListTopics,
  httpCreateBoard,
  httpAddToBoard,
  httpEditBoard,
  httpAddTopics,
  httpUpdateTopic,
  httpFinishTopicRun,
  httpTopicRuns,
  httpTopicHistory,
  httpGetBoard,
  httpAddUpdate,
  httpListScripts,
  httpSetBrief,
  httpSetCaption,
  httpUpdateInstruction,
  httpSuggestEdit,
  httpUpdateDetails,
  httpPinBoard,
  httpPinScript,
  httpAttach,
  httpFile,
  httpUploadUrl,
} from "./agent";
import { help } from "./agentHelp";
import { mcpGet, mcpPost } from "./mcp";

const http = httpRouter();
auth.addHttpRoutes(http);

// Agent API (bearer AGENT_API_KEY). See convex/agent.ts for what each route may change.
http.route({ path: "/agent/help", method: "GET", handler: help });
http.route({ path: "/agent/scripts", method: "GET", handler: httpListScripts });
http.route({ path: "/agent/script", method: "GET", handler: httpGetScript });
http.route({ path: "/agent/scripts", method: "POST", handler: httpCreateScript });
http.route({ path: "/agent/details", method: "POST", handler: httpUpdateDetails });
http.route({ path: "/agent/suggest", method: "POST", handler: httpSuggestEdit });
http.route({ path: "/agent/instructions", method: "POST", handler: httpAddInstructions });
http.route({ path: "/agent/instruction", method: "POST", handler: httpUpdateInstruction });
http.route({ path: "/agent/caption", method: "POST", handler: httpSetCaption });
http.route({ path: "/agent/brief", method: "POST", handler: httpSetBrief });
http.route({ path: "/agent/brief-links", method: "POST", handler: httpAddBriefLinks });
http.route({ path: "/agent/update", method: "POST", handler: httpAddUpdate });
http.route({ path: "/agent/comment", method: "POST", handler: httpComment });
http.route({ path: "/agent/comment/attach", method: "POST", handler: httpAttach });
http.route({ path: "/agent/upload-url", method: "POST", handler: httpUploadUrl });
http.route({ path: "/agent/file", method: "POST", handler: httpFile });
http.route({ path: "/agent/ideas", method: "POST", handler: httpAddIdeas });
http.route({ path: "/agent/edit", method: "POST", handler: httpEditScript });
http.route({ path: "/agent/comment/move", method: "POST", handler: httpMoveComment });
http.route({ path: "/agent/comment/update", method: "POST", handler: httpUpdateComment });
http.route({ path: "/agent/comment/delete", method: "POST", handler: httpDeleteComment });
http.route({ path: "/agent/edit-lines", method: "POST", handler: httpEditLines });
http.route({ path: "/agent/versions", method: "GET", handler: httpListVersions });
http.route({ path: "/agent/restore", method: "POST", handler: httpRestoreVersion });
http.route({ path: "/agent/instruction/delete", method: "POST", handler: httpDeleteInstruction });
http.route({ path: "/agent/caption/delete", method: "POST", handler: httpRemoveCaption });
http.route({ path: "/agent/brief-links/delete", method: "POST", handler: httpRemoveBriefLinks });
http.route({ path: "/agent/ideas", method: "GET", handler: httpListIdeas });
http.route({ path: "/agent/boards", method: "GET", handler: httpListBoards });
http.route({ path: "/agent/board", method: "GET", handler: httpGetBoard });
http.route({ path: "/agent/board/create", method: "POST", handler: httpCreateBoard });
http.route({ path: "/agent/board/add", method: "POST", handler: httpAddToBoard });
http.route({ path: "/agent/board/edit", method: "POST", handler: httpEditBoard });
http.route({ path: "/agent/board/pin", method: "POST", handler: httpPinBoard });
http.route({ path: "/agent/pin", method: "POST", handler: httpPinScript });
http.route({ path: "/agent/topics", method: "GET", handler: httpListTopics });
http.route({ path: "/agent/topics", method: "POST", handler: httpAddTopics });
http.route({ path: "/agent/topic", method: "POST", handler: httpUpdateTopic });
http.route({ path: "/agent/topics/finish", method: "POST", handler: httpFinishTopicRun });
http.route({ path: "/agent/topics/runs", method: "GET", handler: httpTopicRuns });
http.route({ path: "/agent/topics/history", method: "GET", handler: httpTopicHistory });

// MCP server (same key, same safe operations). Composio holds the key as a connected account.
http.route({ path: "/mcp", method: "POST", handler: mcpPost });
http.route({ path: "/mcp", method: "GET", handler: mcpGet });

export default http;
