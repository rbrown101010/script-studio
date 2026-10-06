# Weekly refresh for the YouTube app (public/data/youtube.json).
#
# Runs inside Composio's remote workbench (COMPOSIO_REMOTE_WORKBENCH), which provides
# run_composio_tool and proxy_execute. Claude's weekly routine pastes this file into a cell,
# then calls:
#
#   summary = refresh()          # pulls every public video + channel totals from YouTube
#   print(summary)               # what changed since last week, for writing the report
#   commit("One short paragraph on the week")   # saves the file to main (Vercel redeploys)
#
# The file keeps one snapshot per week (Monday, UTC) so the app can show views gained per week.

import base64, json, re, datetime

REPO = "rbrown101010/script-studio"
PATH = "public/data/youtube.json"
ACCOUNT = "youtube_almach-betoya"  # Riley Brown (@rileybrownai)

_state = {}


def _dur(s):
    m = re.match(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", s or "")
    if not m:
        return 0
    d, h, mi, se = [int(x or 0) for x in m.groups()]
    return d * 86400 + h * 3600 + mi * 60 + se


def _tool(slug, args):
    r, e = run_composio_tool(slug, args, account=ACCOUNT)
    if e:
        raise RuntimeError(f"{slug}: {e}")
    return r.get("data", r)


def _load():
    r, e = proxy_execute("GET", f"/repos/{REPO}/contents/{PATH}", "github", query_params={"ref": "main"})
    if e or not isinstance(r, dict) or "content" not in r:
        return None, {"snapshots": [], "reports": []}
    return r["sha"], json.loads(base64.b64decode(r["content"]).decode("utf-8"))


def refresh():
    ch = _tool("YOUTUBE_LIST_CHANNELS", {"mine": True, "part": "snippet,statistics"})["items"][0]
    ids, tok = [], None
    while True:
        a = {"mine": True, "maxResults": 50, "part": "snippet,contentDetails"}
        if tok:
            a["pageToken"] = tok
        d = _tool("YOUTUBE_LIST_CHANNEL_VIDEOS", a)
        for it in d.get("items") or []:
            vid = (it.get("contentDetails") or {}).get("videoId") or ((it.get("snippet") or {}).get("resourceId") or {}).get("videoId")
            if vid:
                ids.append(vid)
        tok = d.get("nextPageToken")
        if not tok:
            break
    videos = []
    for i in range(0, len(ids), 50):
        d = _tool("YOUTUBE_GET_VIDEO_DETAILS_BATCH", {"id": ids[i : i + 50], "parts": ["snippet", "statistics", "contentDetails", "status"]})
        for it in d.get("items") or []:
            if (it.get("status") or {}).get("privacyStatus") != "public":
                continue
            st, sn = it.get("statistics", {}), it.get("snippet", {})
            videos.append([it["id"], sn.get("title"), sn.get("publishedAt"), _dur((it.get("contentDetails") or {}).get("duration")),
                           int(st.get("viewCount", 0)), int(st.get("likeCount", 0)), int(st.get("commentCount", 0))])
    videos.sort(key=lambda v: v[2], reverse=True)

    sha, data = _load()
    now = datetime.datetime.now(datetime.timezone.utc)
    week = (now.date() - datetime.timedelta(days=now.weekday())).isoformat()
    stats = ch["statistics"]
    snap = {"week": week, "date": now.date().isoformat(), "subscribers": int(stats.get("subscriberCount", 0)),
            "views": int(stats.get("viewCount", 0)), "videoViews": {v[0]: v[4] for v in videos}}
    snaps = [s for s in data.get("snapshots", []) if s["week"] != week] + [snap]
    snaps.sort(key=lambda s: s["week"])
    data.update({
        "updatedAt": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "channel": {"id": ch["id"], "title": ch["snippet"]["title"], "handle": ch["snippet"].get("customUrl"),
                    "subscribers": snap["subscribers"], "views": snap["views"], "videos": len(videos)},
        "videos": videos,
        "snapshots": snaps,
    })
    data.setdefault("reports", [])
    _state.update(sha=sha, data=data, week=week)

    prev = snaps[-2] if len(snaps) > 1 else None
    gains = []
    if prev:
        gains = sorted(((v[4] - prev["videoViews"].get(v[0], 0), v[1]) for v in videos), reverse=True)[:5]
    new = [v for v in videos if v[2] >= (now - datetime.timedelta(days=7)).isoformat()]
    return json.dumps({
        "week": week, "subscribers": snap["subscribers"], "views": snap["views"], "videos": len(videos),
        "since_last_snapshot": prev and {"from": prev["date"], "subscribers": snap["subscribers"] - prev["subscribers"],
                                         "views": snap["views"] - prev["views"], "top_gainers": gains},
        "published_last_7_days": [{"title": v[1], "views": v[4], "likes": v[5], "comments": v[6]} for v in new],
    }, ensure_ascii=False, indent=1)


def commit(report=None):
    data, week = _state["data"], _state["week"]
    if report:
        data["reports"] = [r for r in data["reports"] if r["week"] != week] + [{"week": week, "text": report.strip()}]
        data["reports"].sort(key=lambda r: r["week"])
    sha, _ = _load()  # re-read so a change made in between doesn't block the save
    body = {"message": f"YouTube: weekly data refresh ({week})", "branch": "main",
            "content": base64.b64encode(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).decode()}
    if sha:
        body["sha"] = sha
    r, e = proxy_execute("PUT", f"/repos/{REPO}/contents/{PATH}", "github", body=body)
    if e:
        raise RuntimeError(e)
    return (r.get("commit") or {}).get("html_url")
