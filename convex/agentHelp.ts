import { httpAction } from "./_generated/server";

/** Public guide for agents (no key needed to read it). Also returned by the MCP tool read_guide. */
// The deployment's own HTTP address (Convex sets CONVEX_SITE_URL), so no deployment name is written in the code
const SITE = process.env.CONVEX_SITE_URL ?? "https://<your-deployment>.convex.site";

export const HELP = `# Native Note: guide for agents

Native Note is Riley's team app for video scripts (https://script-studio-kohl.vercel.app).
You can read every script and change anything about it, including editing, adding and deleting lines of
the script itself. The one thing you can't do is delete a script. Every script edit saves the previous
text as a version first, so nothing is ever lost and any edit can be undone with restore_version.

## How to connect
- In Composio: use the Native Note tools (toolkit custom_native_note, slugs CUSTOM_NATIVE_NOTE_*).
  Composio holds the key, so you never need one. Never ask for, look for, or print a key.
- As an MCP server: ${SITE}/mcp (Authorization: Bearer <key>).
- Plain HTTP: the same operations under ${SITE}/agent/... (see the end).

## What a script has (the tabs under the title)
- Title, and the script itself: lines, each with a stable key, a type (p text, h1 heading, bullet, number, todo,
  images, board) and text. A board line shows an Excalidraw board right in the script: its text is the board id,
  and get_script adds "board" with the board's title, link and full summary (see "Excalidraw boards").
  Lines can hold links: write [the words](https://example.com) to link words, or paste a bare https:// URL.
  They show as real links in the app (just "the words", underlined). **Bold** is written with double asterisks.
  Each line can have a text color (textColor: gray, red, orange, green, blue, purple) and a background color
  (color: yellow, blue, green, red, rose; red shows as purple and rose shows as red). Set them on lines in edit_lines / edit_script;
  get_script shows them.
- Editor instructions: to-dos for the video editor, each with a key, text and checked.
- Details: liveDate (YYYY-MM-DD or null), format (long | short), status (inProduction = being made now | upcoming = a future video | done | idea = not committed to yet),
  sponsored (none = not decided yet | noSponsor | dedicated | integration | adRead).
- Captions: one entry per platform (Instagram, TikTok, YouTube, YouTube Shorts, X, LinkedIn, Facebook, Threads, or any name),
  each with caption, linkInBio, posted (true once it's been posted) and custom fields (label + value).
- Brief: free text, e.g. a marketing or sponsor brief with the delivery requirements, plus a list of links
  (brief doc, contract, script doc, email and Slack threads). Internal: not shown on share links.
- Updates: a running log of what happened on the video, newest first. Each entry has a title, details, a link to
  the conversation (email, Slack, doc), a source and a date. Internal: not shown on share links.
- Comments: on the whole script or on one line. Agent comments show an "Agent" badge.
  Files attached to comments (footage, images, audio) come with direct download URLs in get_script (comments[].files[].url).
  To edit the video: GET <shareUrl>/agent for the whole script, comments and every file (JSON; ?format=md for Markdown),
  or run: curl -fsSL '<shareUrl>/agent?format=sh' | sh   to download every file into ./assets (no sign-in needed).
  Links to X, YouTube, TikTok, Instagram, Threads, LinkedIn and Facebook in a comment show as preview cards.
  Agents can attach files to comments too, including files from their own computer (see "Files in comments").

## Mymind (ideas)
Separate from scripts: Riley's board of saved ideas. Each idea is a link (tweet/X post, image, YouTube/TikTok/Instagram
video, video file, any web page) and/or a note. The card type is worked out from the link. Save one with add_ideas, or
import many at once (up to 200 per call, e.g. bookmarks); links already saved aren't duplicated. Write a short note on
each idea saying what it is and why it's worth keeping. Use list_ideas to search what's there.

## Excalidraw boards
Riley's whiteboards (the Excalidraw app in Native Note, links look like /b/<id>). list_boards to find one, get_board to
read it: a summary (all text top to bottom, labelled shapes, arrows "A → B", links), its style, and items (everything
on it with ids). Agents can draw too:
- create_board {title, items?} makes a board (and draws on it).
- add_to_board {board, items} adds to a board and never removes or moves what's there.
- edit_board {board, ops} changes existing things by id: setText, setColor, move, delete.
Items are simple; the server makes the real Excalidraw shapes and lays them out:
  {"type":"text","text":"Launch plan","size":"xl"}               heading (size s/m/l/xl)
  {"type":"shape","id":"a","label":"Record intro","shape":"rectangle"}   labelled box (rectangle/ellipse/diamond)
  {"type":"sticky","text":"Idea: open on the result"}            sticky note (yellow unless color is set)
  {"type":"arrow","from":"a","to":"b","label":"then"}            arrow between new items (your ids) or existing
                                                                 things (element id, or their label)
  {"type":"image","url":"https://…/thumb.jpg","width":320}       picture
How to draw boards that look like Riley's:
1. Always get_board first. Its style says how the board is drawn (stroke and fill colors, fill style, roughness,
   corners, font, text and heading sizes, usual box size, spacing, direction). add_to_board copies all of it by
   default, so leave color and size out unless you mean to differ. Reuse the board's own fill colors for meaning
   (e.g. the same color for the same kind of thing).
2. New content goes beside what's there, in the board's direction (to the right for left-to-right boards, below for
   top-to-bottom). Put one group per call: a heading text first, then its boxes and arrows.
3. Keep labels short (2-6 words); details go in stickies or a text under the box. One idea per box.
4. Flows: give every box an id and connect them with arrows; layout auto draws them as a flowchart. Use diamond for
   decisions, ellipse for start/end, dashed arrows for "maybe".
5. Brainstorms: stickies (they go in a grid). Lists: text items in a column.
6. To change existing things use edit_board with ids from get_board items; don't redraw them.
Boards can sit inside a script as a board line. get_script already includes each one's summary, so you can read a
script and its boards together. To put a board in a script, add a line {"type":"board","text":"<board id or /b/<id> link>"}
with edit_lines or edit_script.

## Topic opportunities
Researched YouTube video ideas for Riley's channel (the Topic opportunities app). Each topic has an angle, a 0-100
opportunity score, demand and competition (high/medium/low with the evidence), trend, why now, search keywords,
outlier videos (views vs the channel's usual views, with links), title ideas, hooks and sources. The team saves the
good ones (status saved), turns some into scripts (used) and dismisses the rest.
- list_topics to see what's there (full:true for everything). Check before adding so you refresh instead of duplicating.
- add_topics to add or refresh research: same title = refreshed, and the team's status and notes are kept.
- update_topic to change one topic's research, status or notes.
Never invent numbers or videos. Only include view counts you actually saw at that URL; leave unknowns null.

## Rules
1. You can't delete a script. Everything else is yours to change.
2. Edit script text directly with edit_lines (small changes) or edit_script (big rewrites). The previous text is
   saved automatically under Versions, with your name, so people can see and restore it.
3. Always read the script (get_script) first and work from its current lines and keys.
   Comments are never lost by an edit. To keep a comment on a line, keep (or replace) that line rather than
   deleting it and adding a new one. If you do rewrite lines, comments follow to the new line that reads most
   like the old one; any left over show on the whole script (get_script marks them onRemovedLine), so move
   them to the right line with move_comment. Earlier versions keep where every comment was, and restoring a
   version puts comments back on their old lines.
4. Keep each edit focused on what the user asked; don't rewrite parts they didn't ask about.
5. Whenever you learn something new about a video (a new email or Slack thread, an approval, a date moving),
   log it with add_update, with a link to where it came from.
6. Don't create scripts in bulk unless asked.
7. After changing something, tell the user what you changed. They can undo any script edit from Versions.

## Tools ("script" is always the script's id or its share link)
| Tool | What it does |
|---|---|
| read_guide | This guide |
| list_scripts {query?} | Scripts, newest first, with status, format, live date, edited versions waiting |
| get_script {script} | Everything above: details, lines, instructions, captions, brief, comments |
| edit_lines {script, ops, agentName?} | Edit script lines directly: replace / insert / delete / move |
| edit_script {script, lines, agentName?} | Rewrite the whole script directly |
| list_versions {script} | Earlier versions of the text |
| restore_version {script, versionId} | Bring an earlier version back |
| suggest_script_edit {script, agentName?, lines} | Only if the user wants to approve changes first |
| comment_on_script {script, text, agentName?, blockKey?, lineContains?, attachments?} | Comment on the script or a line, with images, videos, PDFs or any files (see "Files in comments") |
| attach_files {comment, attachments} | Add files to an existing comment |
| get_upload_url {} | One-time URL to upload a file from your computer (any size) |
| move_comment {script, commentId, toKey? or lineContains?} | Put any comment on another line (or the whole script) |
| update_comment {script, commentId, text} | Rewrite a comment an agent wrote |
| delete_comment {script, commentId} | Delete a comment an agent wrote |
| add_editor_instructions {script, items} | Add to-dos for the editor |
| update_editor_instruction {script, key, text?, checked?} | Edit an instruction or check it off |
| delete_editor_instruction {script, key} | Remove an instruction |
| update_script_details {script, title?, liveDate?, format?, status?, sponsored?} | Change details |
| set_caption {script, platform, caption?, linkInBio?, posted?, fields?} | Add or update one platform's caption |
| remove_caption {script, platform} | Remove a platform's caption |
| set_brief {script, text, mode?} | Append to the brief (default) or replace it (mode "replace") |
| add_brief_links {script, links:[{label,url}]} | Attach docs / threads to the brief |
| remove_brief_links {script, urls} | Remove brief links |
| add_update {script, title, details?, link?, source?, date?, urgent?} | Log what happened on the Updates tab (urgent: needs a response now, pinned to the top of the Feed) |
| add_ideas {ideas:[{url?, note?, date?}]} | Save ideas to Mymind (bulk import OK) |
| list_ideas {query?, limit?} | Search Mymind |
| list_boards {query?} | List / search Excalidraw boards |
| list_topics {status?, query?, full?} | Topic opportunities, best first |
| add_topics {topics, agentName?} | Add or refresh researched topics (see "Topic opportunities") |
| update_topic {topic, status?, notes?, research?} | Change one topic |
| get_board {board, includeElements?} | Read a board: summary, style and items (with ids) |
| create_board {title, items?, layout?, direction?} | New board, optionally drawn on |
| add_to_board {board, items, layout?, direction?, placement?} | Draw on a board in its style (never removes anything) |
| edit_board {board, ops?, title?} | Change existing things by id: setText, setColor, move, delete |
| create_script {title, format?, status?, liveDate?, sponsored?, lines?, instructions?, brief?, updates?} | New script |

### edit_lines
Line keys come from get_script. ops run in order as one change:
  {"op":"replace","key":"<key>","text":"New text"}              change a line (text and/or type)
  {"op":"insert","afterKey":"<key>","lines":[{"text":"..."}]}  add lines after a line (afterKey null = at the top)
  {"op":"delete","key":"<key>"}                                remove a line
  {"op":"move","key":"<key>","afterKey":"<key>"}               move a line
The result lists the new lines and keys. Line types: p (text), h1 (heading), bullet, number, todo, board (text = board id).

### edit_script
"lines" is the WHOLE script as you want it, in order. Keep a line's key to keep that line (its comments stay
on it). Leave out key for new lines. Lines you leave out are deleted.

### Files in comments
"attachments" (on comment_on_script and attach_files) is a list; each item is ONE of:
- {"url": "https://..."}: a link. Image/video URLs show as media. Nothing is copied.
- {"base64": "...", "name": "shot.png"}: the file's bytes (raw base64 or a data: URL), stored in Native Note. Under 20 MB.
- {"storageId": "...", "name": "shot.png"}: a file you uploaded. Best for files on your computer, any size:
    1. get_upload_url {}                                  -> {"uploadUrl": "..."}
    2. curl -s -X POST -H "Content-Type: image/png" --data-binary @shot.png "<uploadUrl>"   -> {"storageId": "..."}
    3. comment_on_script / attach_files with attachments [{"storageId": "...", "name": "shot.png"}]
"mime" is optional everywhere (guessed from the name). Up to 20 files per call. Stored files show in the app
like files people drop in: images and videos play inline, anything else is a download.
With plain HTTP there's also a one-step upload (under 20 MB), see the end.

### set_caption
The platform is matched by name (case-insensitive) and added if it's not there yet. Only what you pass changes.
Custom fields are matched by label: a new label is added, an existing label gets the new value.

## Examples
Write an Instagram caption with hashtags and a link in bio:
  set_caption {"script":"<id>","platform":"Instagram","caption":"New video is up!","linkInBio":"https://youtu.be/abc",
               "fields":[{"label":"Hashtags","value":"#ai #claude"}]}
Mark TikTok as posted:
  set_caption {"script":"<id>","platform":"TikTok","posted":true}
Add a sponsor brief:
  set_brief {"script":"<id>","text":"Sponsor: Acme. Mention https://acme.com in the first 30 seconds."}
Log a new email about a video:
  add_update {"script":"<id>","title":"ASUS asked for the revised final draft","source":"Email","date":"2026-09-24",
              "link":"https://mail.google.com/...","details":"They want v2 with the matte touchscreen line by Friday."}
Check off an instruction (key from get_script's instructions):
  update_editor_instruction {"script":"<id>","key":"<key>","checked":true}
Tighten the second line and add a new line after it:
  s = get_script {"script":"<id>"}
  edit_lines {"script":"<id>","agentName":"Claude","ops":[
    {"op":"replace","key":s.lines[1].key,"text":"A tighter second line."},
    {"op":"insert","afterKey":s.lines[1].key,"lines":[{"text":"A brand new third line."}]}]}
Comment on a line with an image:
  comment_on_script {"script":"<id>","lineContains":"B-roll","text":"Use this shot",
                     "attachments":[{"url":"https://example.com/shot.png"}]}
Put a screenshot from your computer on a line:
  get_upload_url {}  ->  curl -s -X POST -H "Content-Type: image/png" --data-binary @shot.png "<uploadUrl>"  ->  {"storageId":"kg2..."}
  comment_on_script {"script":"<id>","lineContains":"Decisions API","text":"Press image",
                     "attachments":[{"storageId":"kg2...","name":"shot.png"}]}
Add another file to that comment later:
  attach_files {"comment":"<comment id>","attachments":[{"storageId":"kg3...","name":"demo.mp4"}]}

## Plain HTTP (header Authorization: Bearer <key>, from your own secret store; never put a key in a prompt or skill)
GET  /agent/scripts?q=...              list_scripts
GET  /agent/script?script=<id>          get_script
POST /agent/scripts                     create_script
POST /agent/details                     update_script_details
POST /agent/edit-lines                  edit_lines
POST /agent/edit                        edit_script
POST /agent/comment/move                move_comment
POST /agent/comment/update              update_comment
POST /agent/comment/delete              delete_comment
GET  /agent/versions?script=<id>        list_versions
POST /agent/restore                     restore_version
POST /agent/suggest                     suggest_script_edit
POST /agent/instruction/delete          delete_editor_instruction
POST /agent/caption/delete              remove_caption
POST /agent/brief-links/delete          remove_brief_links
POST /agent/instructions                add_editor_instructions
POST /agent/instruction                 update_editor_instruction
POST /agent/caption                     set_caption
POST /agent/brief                       set_brief
POST /agent/brief-links                 add_brief_links
POST /agent/update                      add_update
POST /agent/comment                     comment_on_script
POST /agent/comment/attach              attach_files
GET  /agent/boards?q=...                list_boards
GET  /agent/board?board=<id>&elements=1 get_board
POST /agent/board/create                create_board
POST /agent/board/add                   add_to_board
POST /agent/board/edit                  edit_board
GET  /agent/topics?status=saved&q=...&full=1  list_topics
POST /agent/topics                      add_topics
POST /agent/topic                       update_topic
POST /agent/upload-url                  get_upload_url
POST /agent/file?script=<id>&lineContains=...&text=...&name=shot.png   (or ?comment=<id>)
     One step: the body is the raw file (Content-Type = its type, under 20 MB); posts the comment with it attached.
     curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: image/png" --data-binary @shot.png \\
       "${SITE}/agent/file?script=<id>&lineContains=Decisions%20API&text=Press%20image&name=shot.png"
POST /agent/ideas                       add_ideas
GET  /agent/ideas?q=...                 list_ideas
Bodies are the same JSON as the tool arguments. Errors come back as {"error": "..."} with a 4xx status.
Fix the input; don't retry the same call in a loop.
`;

export const help = httpAction(async () => new Response(HELP, { headers: { "content-type": "text/markdown; charset=utf-8" } }));
