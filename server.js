import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
const storageDir = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : path.join(__dirname, "storage");
const videoDir = path.join(storageDir, "videos");
const thumbnailDir = path.join(storageDir, "thumbnails");
const sessions = new Map();
const maxUploadBytes = Number(process.env.MAX_UPLOAD_MB || 800) * 1024 * 1024;
const mediaAccelEnabled = /^(1|true|yes)$/i.test(process.env.MEDIA_ACCEL_ENABLED || "");
const mediaAccelVideoPrefix = stripTrailingSlash(process.env.MEDIA_ACCEL_VIDEO_PREFIX || "/_protected_media/videos");
const mediaAccelThumbnailPrefix = stripTrailingSlash(process.env.MEDIA_ACCEL_THUMBNAIL_PREFIX || "/_protected_media/thumbnails");
const thumbnailCacheSeconds = Number(process.env.THUMBNAIL_CACHE_SECONDS || 86400);
const videoCacheSeconds = Number(process.env.VIDEO_CACHE_SECONDS || 3600);

await fs.mkdir(dataDir, { recursive: true });
await fs.mkdir(videoDir, { recursive: true });
await fs.mkdir(thumbnailDir, { recursive: true });

const roles = {
  admin: { canUpload: true, canManageUsers: true, canViewAll: true, canDeleteVideos: true, canEditVideos: true },
  trainer: { canUpload: true, canManageUsers: false, canViewAll: true, canDeleteVideos: false, canEditVideos: true },
  parent: { canUpload: false, canManageUsers: false, canViewAll: false, canDeleteVideos: false, canEditVideos: false }
};

function jsonPath(name) {
  return path.join(dataDir, `${name}.json`);
}

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

async function ensureJson(name, fallback) {
  try {
    await fs.access(jsonPath(name));
  } catch {
    await fs.writeFile(jsonPath(name), JSON.stringify(fallback, null, 2));
  }
}

await ensureJson("categories", [
  "Trainingsspiel",
  "Überzahlspiel",
  "Passtraining",
  "Schusstraining",
  "Sonstiges"
]);

await ensureJson("videos", []);

await ensureJson("users", [
  {
    id: "u_admin",
    name: "Admin",
    email: "admin@u9.local",
    role: "admin",
    passwordHash: "c2fb788c7deedbeaa296e424d4c2921b871a4f6cb4cf393c1c1105653ab399b4"
  },
  {
    id: "u_trainer",
    name: "Trainer",
    email: "trainer@u9.local",
    role: "trainer",
    passwordHash: "c2fb788c7deedbeaa296e424d4c2921b871a4f6cb4cf393c1c1105653ab399b4"
  },
  {
    id: "u_eltern",
    name: "Eltern",
    email: "eltern@u9.local",
    role: "parent",
    passwordHash: "c2fb788c7deedbeaa296e424d4c2921b871a4f6cb4cf393c1c1105653ab399b4"
  }
]);

async function readJson(name) {
  return JSON.parse(await fs.readFile(jsonPath(name), "utf8"));
}

async function writeJson(name, value) {
  await fs.writeFile(jsonPath(name), JSON.stringify(value, null, 2));
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, payload, headers = {}) {
  send(res, status, JSON.stringify(payload), { "content-type": "application/json; charset=utf-8", ...headers });
}

function privateCacheHeaders(seconds) {
  return {
    "cache-control": `private, max-age=${seconds}, no-transform`,
    "vary": "Cookie, Authorization"
  };
}

function etagFor(stat) {
  return `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
}

function isFresh(req, etag, stat) {
  const ifNoneMatch = req.headers["if-none-match"];
  if (ifNoneMatch && ifNoneMatch.split(",").map((value) => value.trim()).includes(etag)) return true;

  const ifModifiedSince = req.headers["if-modified-since"];
  if (!ifModifiedSince) return false;
  const since = Date.parse(ifModifiedSince);
  return Number.isFinite(since) && Math.floor(stat.mtimeMs / 1000) <= Math.floor(since / 1000);
}

function parseByteRange(value, size) {
  if (!value || !value.startsWith("bytes=")) return null;
  const ranges = value.slice(6).split(",");
  if (ranges.length !== 1) return { invalid: true };

  const [startText, endText] = ranges[0].trim().split("-");
  let start;
  let end;

  if (startText === "") {
    const suffixLength = Number(endText);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return { invalid: true };
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : size - 1;
  }

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) {
    return { invalid: true };
  }

  return { start, end: Math.min(end, size - 1) };
}

function shouldUseAccel(req) {
  return mediaAccelEnabled && Boolean(req.headers["x-forwarded-proto"]);
}

function internalMediaUri(prefix, filename) {
  return `${prefix}/${encodeURIComponent(path.basename(filename))}`;
}

function sendAccelRedirect(res, internalUri, headers) {
  res.writeHead(200, {
    ...headers,
    "x-accel-redirect": internalUri
  });
  res.end();
}

function sendNotModified(res, headers) {
  const { "content-length": _contentLength, "content-type": _contentType, ...notModifiedHeaders } = headers;
  res.writeHead(304, notModifiedHeaders);
  res.end();
}

function streamFile(req, res, filePath, mimeType, cacheSeconds) {
  return fs.stat(filePath).then((stat) => {
    const headers = {
      "accept-ranges": "bytes",
      "content-type": mimeType,
      "etag": etagFor(stat),
      "last-modified": stat.mtime.toUTCString(),
      ...privateCacheHeaders(cacheSeconds)
    };

    if (!req.headers.range && isFresh(req, headers.etag, stat)) {
      sendNotModified(res, headers);
      return;
    }

    const range = parseByteRange(req.headers.range, stat.size);
    if (range?.invalid) {
      res.writeHead(416, {
        "content-range": `bytes */${stat.size}`,
        ...headers
      });
      res.end();
      return;
    }

    if (range) {
      const partialHeaders = {
        ...headers,
        "content-range": `bytes ${range.start}-${range.end}/${stat.size}`,
        "content-length": range.end - range.start + 1
      };
      res.writeHead(206, partialHeaders);
      if (req.method === "HEAD") return res.end();
      createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
      return;
    }

    res.writeHead(200, { ...headers, "content-length": stat.size });
    if (req.method === "HEAD") return res.end();
    createReadStream(filePath).pipe(res);
  });
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const index = cookie.indexOf("=");
        return [cookie.slice(0, index), decodeURIComponent(cookie.slice(index + 1))];
      })
  );
}

async function getCurrentUser(req) {
  const auth = req.headers.authorization || "";
  const bearerSid = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const sid = bearerSid || parseCookies(req).sid;
  if (!sid || !sessions.has(sid)) return null;
  const session = sessions.get(sid);
  const users = await readJson("users");
  return users.find((user) => user.id === session.userId) || null;
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function isValidRole(role) {
  return Object.keys(roles).includes(role);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxUploadBytes) {
        reject(new Error("UPLOAD_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw new Error("Missing multipart boundary");
  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const fields = {};
  const files = {};
  let offset = 0;

  while (offset < buffer.length) {
    const start = buffer.indexOf(boundary, offset);
    if (start === -1) break;
    const partStart = start + boundary.length;
    if (buffer.slice(partStart, partStart + 2).toString() === "--") break;
    const headerStart = partStart + 2;
    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), headerStart);
    if (headerEnd === -1) break;
    const headers = buffer.slice(headerStart, headerEnd).toString("utf8");
    const nextBoundary = buffer.indexOf(boundary, headerEnd + 4);
    if (nextBoundary === -1) break;
    const body = buffer.slice(headerEnd + 4, nextBoundary - 2);
    const name = headers.match(/name="([^"]+)"/)?.[1];
    const filename = headers.match(/filename="([^"]*)"/)?.[1];
    const type = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1] || "application/octet-stream";
    if (name && filename) {
      files[name] = { filename, type, data: body };
    } else if (name) {
      fields[name] = body.toString("utf8");
    }
    offset = nextBoundary;
  }

  return { fields, files };
}

function cleanText(value, fallback = "") {
  return String(value || fallback).trim().slice(0, 5000);
}

function formatVideo(video, user) {
  if (!video.allowedRoles.includes(user.role) && user.role !== "admin" && user.role !== "trainer") return null;
  const thumbnailVersion = encodeURIComponent(video.thumbnailUpdatedAt || video.uploadedAt || video.id);
  return {
    id: video.id,
    title: video.title,
    description: video.description,
    category: video.category,
    uploadedAt: video.uploadedAt,
    durationSeconds: video.durationSeconds,
    filename: video.originalName,
    thumbnailUrl: video.thumbnailName ? `/api/videos/${video.id}/thumbnail?v=${thumbnailVersion}` : null,
    visibility: video.allowedRoles.includes("parent") ? "Eltern freigegeben" : "Nur Trainer",
    allowParents: video.allowedRoles.includes("parent"),
    canEdit: roles[user.role]?.canEditVideos || false,
    canDelete: roles[user.role]?.canDeleteVideos || false,
    canRefreshThumbnail: roles[user.role]?.canUpload || false
  };
}

function decodeDataUrlImage(value) {
  const match = String(value || "").match(/^data:image\/(png|jpeg|webp);base64,([a-z0-9+/=]+)$/i);
  if (!match) return null;
  const extension = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  return {
    extension,
    mimeType: `image/${match[1].toLowerCase()}`,
    data: Buffer.from(match[2], "base64")
  };
}

async function saveThumbnail(video, thumbnail) {
  if (!thumbnail || thumbnail.data.length > 3 * 1024 * 1024) return video;
  if (video.thumbnailName) {
    await fs.unlink(path.join(thumbnailDir, video.thumbnailName)).catch(() => {});
  }
  const thumbnailName = `${video.id}.${thumbnail.extension}`;
  await fs.writeFile(path.join(thumbnailDir, thumbnailName), thumbnail.data);
  return {
    ...video,
    thumbnailName,
    thumbnailMimeType: thumbnail.mimeType,
    thumbnailUpdatedAt: new Date().toISOString()
  };
}

async function serveStatic(req, res) {
  const requestPath = new URL(req.url, "http://localhost").pathname;
  const filePath = path.normalize(path.join(publicDir, requestPath === "/" ? "index.html" : requestPath));
  if (!filePath.startsWith(publicDir)) return send(res, 403, "Forbidden");
  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const contentTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml"
    };
    send(res, 200, file, { "content-type": contentTypes[ext] || "application/octet-stream" });
  } catch {
    send(res, 404, "Not found");
  }
}

async function requireUser(req, res) {
  const user = await getCurrentUser(req);
  if (!user) {
    sendJson(res, 401, { error: "Nicht angemeldet" });
    return null;
  }
  return user;
}

async function handleApi(req, res) {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/api/login" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
    const users = await readJson("users");
    const user = users.find((entry) => entry.email.toLowerCase() === String(body.email || "").toLowerCase());
    if (!user || user.passwordHash !== hashPassword(String(body.password || ""))) {
      return sendJson(res, 401, { error: "E-Mail oder Passwort stimmt nicht." });
    }
    const sid = crypto.randomBytes(24).toString("hex");
    sessions.set(sid, { userId: user.id, createdAt: new Date().toISOString() });
    return sendJson(res, 200, { user: publicUser(user), sessionToken: sid }, {
      "set-cookie": `sid=${sid}; HttpOnly; SameSite=Lax; Path=/`
    });
  }

  if (url.pathname === "/api/logout" && req.method === "POST") {
    const sid = parseCookies(req).sid;
    if (sid) sessions.delete(sid);
    return sendJson(res, 200, { ok: true }, { "set-cookie": "sid=; Max-Age=0; Path=/" });
  }

  if (url.pathname === "/api/me") {
    const user = await getCurrentUser(req);
    return sendJson(res, 200, { user: user ? publicUser(user) : null });
  }

  const user = await requireUser(req, res);
  if (!user) return;

  if (url.pathname === "/api/categories") {
    return sendJson(res, 200, { categories: await readJson("categories") });
  }

  if (url.pathname === "/api/users" && req.method === "GET") {
    if (!roles[user.role]?.canManageUsers) return sendJson(res, 403, { error: "Keine Berechtigung fuer Benutzerverwaltung." });
    const users = await readJson("users");
    return sendJson(res, 200, { users: users.map(publicUser) });
  }

  if (url.pathname === "/api/users" && req.method === "POST") {
    if (!roles[user.role]?.canManageUsers) return sendJson(res, 403, { error: "Keine Berechtigung fuer Benutzerverwaltung." });
    const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
    const name = cleanText(body.name).slice(0, 120);
    const email = cleanText(body.email).toLowerCase();
    const role = cleanText(body.role);
    const password = String(body.password || "");
    if (!name || !email.includes("@") || !isValidRole(role) || password.length < 6) {
      return sendJson(res, 400, { error: "Name, gueltige E-Mail, Rolle und Passwort ab 6 Zeichen sind erforderlich." });
    }
    const users = await readJson("users");
    if (users.some((entry) => entry.email.toLowerCase() === email)) {
      return sendJson(res, 409, { error: "Diese E-Mail ist bereits angelegt." });
    }
    const newUser = {
      id: crypto.randomUUID(),
      name,
      email,
      role,
      passwordHash: hashPassword(password)
    };
    users.push(newUser);
    await writeJson("users", users);
    return sendJson(res, 201, { user: publicUser(newUser) });
  }

  const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userMatch && req.method === "PATCH") {
    if (!roles[user.role]?.canManageUsers) return sendJson(res, 403, { error: "Keine Berechtigung fuer Benutzerverwaltung." });
    const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
    const users = await readJson("users");
    const index = users.findIndex((entry) => entry.id === userMatch[1]);
    if (index === -1) return sendJson(res, 404, { error: "Benutzer nicht gefunden." });
    const nextRole = cleanText(body.role || users[index].role);
    if (!isValidRole(nextRole)) return sendJson(res, 400, { error: "Ungueltige Rolle." });
    const adminCount = users.filter((entry) => entry.role === "admin").length;
    if (users[index].role === "admin" && nextRole !== "admin" && adminCount < 2) {
      return sendJson(res, 400, { error: "Der letzte Admin kann nicht heruntergestuft werden." });
    }
    const nextPassword = typeof body.password === "string" ? body.password : "";
    if (nextPassword && nextPassword.length < 6) {
      return sendJson(res, 400, { error: "Das neue Passwort braucht mindestens 6 Zeichen." });
    }
    users[index] = {
      ...users[index],
      name: cleanText(body.name || users[index].name).slice(0, 120),
      role: nextRole,
      ...(nextPassword ? { passwordHash: hashPassword(nextPassword) } : {})
    };
    await writeJson("users", users);
    return sendJson(res, 200, { user: publicUser(users[index]) });
  }

  if (url.pathname === "/api/videos" && req.method === "GET") {
    const videos = await readJson("videos");
    const categories = await readJson("categories");
    const query = (url.searchParams.get("q") || "").toLowerCase();
    const category = url.searchParams.get("category") || "";
    const visible = videos
      .map((video) => categories.includes(video.category) ? video : { ...video, category: "Sonstiges" })
      .map((video) => formatVideo(video, user))
      .filter(Boolean)
      .filter((video) => !category || video.category === category)
      .filter((video) => {
        const haystack = `${video.title} ${video.description} ${video.category}`.toLowerCase();
        return !query || haystack.includes(query);
      })
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    return sendJson(res, 200, { videos: visible });
  }

  if (url.pathname === "/api/videos" && req.method === "POST") {
    if (!roles[user.role]?.canUpload) return sendJson(res, 403, { error: "Keine Upload-Berechtigung." });
    const { fields, files } = parseMultipart(await readBody(req), req.headers["content-type"] || "");
    const upload = files.video;
    if (!upload || !upload.data.length) return sendJson(res, 400, { error: "Bitte ein Video auswaehlen." });
    if (!upload.type.startsWith("video/")) return sendJson(res, 400, { error: "Nur Videodateien sind erlaubt." });

    const videos = await readJson("videos");
    const categories = await readJson("categories");
    const category = categories.includes(fields.category) ? fields.category : "Sonstiges";
    const id = crypto.randomUUID();
    const ext = path.extname(upload.filename).toLowerCase() || ".mp4";
    const storedName = `${id}${ext}`;
    await fs.writeFile(path.join(videoDir, storedName), upload.data);
    const thumbnail = decodeDataUrlImage(fields.thumbnail);
    const allowParents = fields.allowParents === "true";
    let video = {
      id,
      title: cleanText(fields.title, "Unbenanntes Training"),
      description: cleanText(fields.description),
      category,
      uploadedAt: new Date().toISOString(),
      durationSeconds: Number(fields.durationSeconds || 0),
      storedName,
      thumbnailName: "",
      thumbnailMimeType: "",
      thumbnailUpdatedAt: "",
      originalName: upload.filename,
      mimeType: upload.type,
      uploadedBy: user.id,
      allowedRoles: allowParents ? ["admin", "trainer", "parent"] : ["admin", "trainer"]
    };
    video = await saveThumbnail(video, thumbnail);
    videos.push(video);
    await writeJson("videos", videos);
    return sendJson(res, 201, { video: formatVideo(video, user) });
  }

  const deleteVideoMatch = url.pathname.match(/^\/api\/videos\/([^/]+)$/);
  if (deleteVideoMatch && req.method === "PATCH") {
    if (!roles[user.role]?.canEditVideos) return sendJson(res, 403, { error: "Keine Berechtigung zum Bearbeiten." });
    const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
    const videos = await readJson("videos");
    const categories = await readJson("categories");
    const index = videos.findIndex((entry) => entry.id === deleteVideoMatch[1]);
    if (index === -1) return sendJson(res, 404, { error: "Video nicht gefunden." });
    const category = categories.includes(body.category) ? body.category : videos[index].category;
    const allowParents = body.allowParents === true;
    videos[index] = {
      ...videos[index],
      title: cleanText(body.title, videos[index].title).slice(0, 120),
      description: cleanText(body.description),
      category,
      allowedRoles: allowParents ? ["admin", "trainer", "parent"] : ["admin", "trainer"],
      updatedAt: new Date().toISOString(),
      updatedBy: user.id
    };
    await writeJson("videos", videos);
    return sendJson(res, 200, { video: formatVideo(videos[index], user) });
  }

  if (deleteVideoMatch && req.method === "DELETE") {
    if (!roles[user.role]?.canDeleteVideos) return sendJson(res, 403, { error: "Nur Admins koennen Videos loeschen." });
    const videos = await readJson("videos");
    const video = videos.find((entry) => entry.id === deleteVideoMatch[1]);
    if (!video) return sendJson(res, 404, { error: "Video nicht gefunden." });
    await writeJson("videos", videos.filter((entry) => entry.id !== video.id));
    await fs.unlink(path.join(videoDir, video.storedName)).catch(() => {});
    if (video.thumbnailName) await fs.unlink(path.join(thumbnailDir, video.thumbnailName)).catch(() => {});
    return sendJson(res, 200, { ok: true });
  }

  const updateThumbnailMatch = url.pathname.match(/^\/api\/videos\/([^/]+)\/thumbnail$/);
  if (updateThumbnailMatch && req.method === "PATCH") {
    if (!roles[user.role]?.canUpload) return sendJson(res, 403, { error: "Keine Berechtigung fuer Vorschaubilder." });
    const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
    const thumbnail = decodeDataUrlImage(body.thumbnail);
    if (!thumbnail) return sendJson(res, 400, { error: "Kein gueltiges Vorschaubild erhalten." });
    const videos = await readJson("videos");
    const index = videos.findIndex((entry) => entry.id === updateThumbnailMatch[1]);
    if (index === -1) return sendJson(res, 404, { error: "Video nicht gefunden." });
    videos[index] = await saveThumbnail(videos[index], thumbnail);
    await writeJson("videos", videos);
    return sendJson(res, 200, { video: formatVideo(videos[index], user) });
  }

  const thumbnailMatch = url.pathname.match(/^\/api\/videos\/([^/]+)\/thumbnail$/);
  if (thumbnailMatch && (req.method === "GET" || req.method === "HEAD")) {
    const videos = await readJson("videos");
    const video = videos.find((entry) => entry.id === thumbnailMatch[1]);
    if (!video || !video.thumbnailName || !formatVideo(video, user)) return send(res, 404, "Not found");
    const filePath = path.join(thumbnailDir, video.thumbnailName);
    const stat = await fs.stat(filePath);
    const headers = {
      "content-type": video.thumbnailMimeType || "image/jpeg",
      "etag": etagFor(stat),
      "last-modified": stat.mtime.toUTCString(),
      ...privateCacheHeaders(thumbnailCacheSeconds)
    };
    if (isFresh(req, headers.etag, stat)) return sendNotModified(res, headers);
    if (shouldUseAccel(req)) {
      return sendAccelRedirect(res, internalMediaUri(mediaAccelThumbnailPrefix, video.thumbnailName), headers);
    }
    await streamFile(req, res, filePath, video.thumbnailMimeType || "image/jpeg", thumbnailCacheSeconds);
    return;
  }

  const videoMatch = url.pathname.match(/^\/api\/videos\/([^/]+)\/stream$/);
  if (videoMatch && (req.method === "GET" || req.method === "HEAD")) {
    const videos = await readJson("videos");
    const video = videos.find((entry) => entry.id === videoMatch[1]);
    if (!video || !formatVideo(video, user)) return send(res, 404, "Not found");
    const filePath = path.join(videoDir, video.storedName);
    const stat = await fs.stat(filePath);
    const headers = {
      "accept-ranges": "bytes",
      "content-type": video.mimeType,
      "etag": etagFor(stat),
      "last-modified": stat.mtime.toUTCString(),
      ...privateCacheHeaders(videoCacheSeconds)
    };
    if (!req.headers.range && isFresh(req, headers.etag, stat)) return sendNotModified(res, headers);
    if (shouldUseAccel(req)) {
      return sendAccelRedirect(res, internalMediaUri(mediaAccelVideoPrefix, video.storedName), headers);
    }
    await streamFile(req, res, filePath, video.mimeType, videoCacheSeconds);
    return;
  }

  sendJson(res, 404, { error: "Nicht gefunden" });
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: roles[user.role] || {}
  };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) return await handleApi(req, res);
    await serveStatic(req, res);
  } catch (error) {
    if (error.message === "UPLOAD_TOO_LARGE") {
      return sendJson(res, 413, { error: "Upload ist zu gross." });
    }
    console.error(error);
    sendJson(res, 500, { error: "Serverfehler" });
  }
});

const port = Number(process.env.PORT || 3001);
server.listen(port, () => {
  console.log(`Private U9 Videothek laeuft auf http://127.0.0.1:${port}`);
});
