const state = {
  user: null,
  categories: [],
  videos: [],
  users: [],
  activeCategory: "",
  search: "",
  visibleLimit: 12
};

const $ = (selector) => document.querySelector(selector);
const tokenKey = "u9SessionToken";
const thumbnailWidth = 480;
const initialVideoLimit = 12;

const loginView = $("#loginView");
const appView = $("#appView");
const videoGrid = $("#videoGrid");
const categoryList = $("#categoryList");
const uploadSection = $("#uploadSection");
const uploadCategory = $("#uploadCategory");
const uploadStatus = $("#uploadStatus");
const emptyState = $("#emptyState");
const adminSection = $("#adminSection");
const userList = $("#userList");
const userStatus = $("#userStatus");
const editDialog = $("#editDialog");
const editForm = $("#editForm");
const editCategory = $("#editCategory");
const editStatus = $("#editStatus");
const toggleUploadButton = $("#toggleUploadButton");
const optimizeThumbnailsButton = $("#optimizeThumbnailsButton");
const loadMoreButton = $("#loadMoreButton");
const libraryStatus = $("#libraryStatus");

function secondsToTime(total) {
  const value = Number(total || 0);
  if (!value) return "Laenge unbekannt";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function dateText(value) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

async function api(path, options = {}) {
  const token = localStorage.getItem(tokenKey);
  const baseHeaders = token ? { authorization: `Bearer ${token}` } : {};
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: options.body instanceof FormData ? {
      ...baseHeaders,
      ...(options.headers || {})
    } : {
      "content-type": "application/json",
      ...baseHeaders,
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Fehler");
  return data;
}

async function boot() {
  const { user } = await api("/api/me");
  if (!user) {
    loginView.hidden = false;
    appView.hidden = true;
    return;
  }
  state.user = user;
  loginView.hidden = true;
  appView.hidden = false;
  $("#userName").textContent = `${user.name} (${roleLabel(user.role)})`;
  uploadSection.hidden = true;
  toggleUploadButton.hidden = !user.permissions.canUpload;
  optimizeThumbnailsButton.hidden = !user.permissions.canUpload;
  adminSection.hidden = !user.permissions.canManageUsers;
  await loadCategories();
  if (user.permissions.canManageUsers) await loadUsers();
  await loadVideos();
}

async function enterApp(user) {
  state.user = user;
  loginView.hidden = true;
  appView.hidden = false;
  $("#userName").textContent = `${user.name} (${roleLabel(user.role)})`;
  uploadSection.hidden = true;
  toggleUploadButton.hidden = !user.permissions.canUpload;
  optimizeThumbnailsButton.hidden = !user.permissions.canUpload;
  adminSection.hidden = !user.permissions.canManageUsers;
  await loadCategories();
  if (user.permissions.canManageUsers) await loadUsers();
  await loadVideos();
}

function roleLabel(role) {
  return { admin: "Admin", trainer: "Trainer", parent: "Eltern" }[role] || role;
}

async function loadCategories() {
  const { categories } = await api("/api/categories");
  state.categories = categories;
  categoryList.innerHTML = categories.map((category) => (
    `<button class="category" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`
  )).join("");
  uploadCategory.innerHTML = categories.map((category) => (
    `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`
  )).join("");
  editCategory.innerHTML = uploadCategory.innerHTML;
}

async function loadVideos() {
  const params = new URLSearchParams();
  if (state.search) params.set("q", state.search);
  if (state.activeCategory) params.set("category", state.activeCategory);
  const { videos } = await api(`/api/videos?${params}`);
  state.videos = videos;
  renderVideos();
}

async function loadUsers() {
  const { users } = await api("/api/users");
  state.users = users;
  renderUsers();
}

function renderVideos() {
  $("#resultSummary").textContent = `${state.videos.length} Video${state.videos.length === 1 ? "" : "s"}`;
  emptyState.hidden = state.videos.length > 0;
  const visibleVideos = state.videos.slice(0, state.visibleLimit);
  videoGrid.innerHTML = visibleVideos.map((video) => `
    <article class="video-card">
      ${video.thumbnailUrl ? `<img class="thumb" src="${video.thumbnailUrl}" alt="" width="480" height="270" loading="lazy" decoding="async" fetchpriority="low">` : `<span class="thumb">${escapeHtml(video.category)}</span>`}
      <h3>${escapeHtml(video.title)}</h3>
      <p class="meta">
        <span>${escapeHtml(video.category)}</span>
        <span>${secondsToTime(video.durationSeconds)}</span>
        <span>${dateText(video.uploadedAt)}</span>
      </p>
      <p class="muted">${escapeHtml(video.visibility)}</p>
      <div class="card-actions">
        <button class="icon-button open-video" type="button" data-id="${video.id}" title="Ansehen" aria-label="Video ansehen">▶</button>
        ${video.canEdit ? `<button class="icon-button edit-video" type="button" data-id="${video.id}" title="Bearbeiten" aria-label="Video bearbeiten">✎</button>` : ""}
        ${video.canRefreshThumbnail ? `<button class="icon-button refresh-thumb" type="button" data-id="${video.id}" title="Vorschaubild neu erzeugen" aria-label="Vorschaubild neu erzeugen">↻</button>` : ""}
        ${video.canDelete ? `<button class="icon-button danger delete-video" type="button" data-id="${video.id}" title="Loeschen" aria-label="Video loeschen">×</button>` : ""}
      </div>
    </article>
  `).join("");
  loadMoreButton.hidden = state.videos.length <= state.visibleLimit;
}

function renderUsers() {
  userList.innerHTML = state.users.map((user) => `
    <article class="user-row">
      <div>
        <strong>${escapeHtml(user.name)}</strong>
        <p class="muted">${escapeHtml(user.username)}</p>
      </div>
      <select class="role-select" data-id="${user.id}" aria-label="Rolle fuer ${escapeHtml(user.name)}">
        <option value="parent" ${user.role === "parent" ? "selected" : ""}>Eltern</option>
        <option value="trainer" ${user.role === "trainer" ? "selected" : ""}>Trainer</option>
        <option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin</option>
      </select>
      <div class="password-reset">
        <input class="password-input" data-id="${user.id}" type="password" minlength="6" placeholder="Neues Passwort" aria-label="Neues Passwort fuer ${escapeHtml(user.name)}">
        <button class="icon-button set-password" type="button" data-id="${user.id}" title="Passwort setzen" aria-label="Passwort setzen">⚿</button>
      </div>
      ${user.id !== state.user?.id ? `<button class="icon-button danger delete-user" type="button" data-id="${user.id}" title="Benutzer loeschen" aria-label="Benutzer loeschen">×</button>` : "<span></span>"}
    </article>
  `).join("");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#loginError").textContent = "";
  const form = new FormData(event.currentTarget);
  try {
    const result = await api("/api/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form))
    });
    localStorage.setItem(tokenKey, result.sessionToken);
    await enterApp(result.user);
  } catch (error) {
    $("#loginError").textContent = error.message;
  }
});

$("#logoutButton").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST", body: "{}" });
  localStorage.removeItem(tokenKey);
  location.reload();
});

$("#searchForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  state.search = $("#searchInput").value.trim();
  state.visibleLimit = initialVideoLimit;
  await loadVideos();
});

document.addEventListener("click", async (event) => {
  const categoryButton = event.target.closest(".category");
  if (categoryButton) {
    state.activeCategory = categoryButton.dataset.category || "";
    state.visibleLimit = initialVideoLimit;
    document.querySelectorAll(".category").forEach((button) => {
      button.classList.toggle("active", button.dataset.category === state.activeCategory);
    });
    await loadVideos();
  }

  const openButton = event.target.closest(".open-video");
  if (openButton) openPlayer(openButton.dataset.id);

  const editButton = event.target.closest(".edit-video");
  if (editButton) openEditDialog(editButton.dataset.id);

  const deleteButton = event.target.closest(".delete-video");
  if (deleteButton) {
    const video = state.videos.find((entry) => entry.id === deleteButton.dataset.id);
    if (!video || !confirm(`Video "${video.title}" wirklich loeschen?`)) return;
    await api(`/api/videos/${video.id}`, { method: "DELETE", body: "{}" });
    await loadVideos();
  }

  const refreshButton = event.target.closest(".refresh-thumb");
  if (refreshButton) {
    const video = state.videos.find((entry) => entry.id === refreshButton.dataset.id);
    if (!video) return;
    refreshButton.disabled = true;
    refreshButton.textContent = "...";
    try {
      await refreshVideoThumbnail(video);
      await loadVideos();
    } catch (error) {
      alert(error.message);
      refreshButton.disabled = false;
      refreshButton.textContent = "↻";
    }
  }

  const passwordButton = event.target.closest(".set-password");
  if (passwordButton) {
    const input = document.querySelector(`.password-input[data-id="${passwordButton.dataset.id}"]`);
    const password = input?.value || "";
    if (password.length < 6) {
      userStatus.textContent = "Das neue Passwort braucht mindestens 6 Zeichen.";
      return;
    }
    userStatus.textContent = "Passwort wird gesetzt ...";
    try {
      await api(`/api/users/${passwordButton.dataset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ password })
      });
      input.value = "";
      userStatus.textContent = "Passwort gesetzt.";
    } catch (error) {
      userStatus.textContent = error.message;
    }
  }

  const deleteUserButton = event.target.closest(".delete-user");
  if (deleteUserButton) {
    const targetUser = state.users.find((entry) => entry.id === deleteUserButton.dataset.id);
    if (!targetUser || !confirm(`Benutzer "${targetUser.name}" wirklich loeschen?`)) return;
    userStatus.textContent = "Benutzer wird geloescht ...";
    try {
      await api(`/api/users/${targetUser.id}`, { method: "DELETE", body: "{}" });
      userStatus.textContent = "Benutzer geloescht.";
      await loadUsers();
    } catch (error) {
      userStatus.textContent = error.message;
    }
  }
});

loadMoreButton.addEventListener("click", () => {
  state.visibleLimit += initialVideoLimit;
  renderVideos();
});

document.addEventListener("change", async (event) => {
  const select = event.target.closest(".role-select");
  if (!select) return;
  userStatus.textContent = "Rolle wird gespeichert ...";
  try {
    await api(`/api/users/${select.dataset.id}`, {
      method: "PATCH",
      body: JSON.stringify({ role: select.value })
    });
    userStatus.textContent = "Rolle gespeichert.";
    await loadUsers();
  } catch (error) {
    userStatus.textContent = error.message;
    await loadUsers();
  }
});

function once(target, eventName) {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("timeout")), 5000);
    target.addEventListener(eventName, () => {
      window.clearTimeout(timeout);
      resolve();
    }, { once: true });
    target.addEventListener("error", () => {
      window.clearTimeout(timeout);
      reject(new Error("video error"));
    }, { once: true });
  });
}

function frameScore(context, width, height) {
  const sample = context.getImageData(0, 0, width, height).data;
  let brightness = 0;
  let variance = 0;
  const step = 16;
  const count = Math.floor(sample.length / (4 * step));
  for (let index = 0; index < sample.length; index += 4 * step) {
    const value = (sample[index] + sample[index + 1] + sample[index + 2]) / 3;
    brightness += value;
    variance += Math.abs(value - 35);
  }
  return { brightness: brightness / count, variance: variance / count };
}

async function captureThumbnail(file) {
  const video = document.createElement("video");
  const objectUrl = URL.createObjectURL(file);
  video.muted = true;
  video.preload = "auto";
  video.playsInline = true;
  video.src = objectUrl;

  try {
    await once(video, "loadedmetadata");
    $("#durationSeconds").value = Math.round(video.duration || 0);
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 3;
    const candidates = [0.15, 0.25, 0.4, 0.6, 0.8].map((part) => Math.min(duration - 0.1, Math.max(0.2, duration * part)));
    let fallback = "";

    for (const time of candidates) {
      video.currentTime = time;
      await once(video, "seeked");
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const canvas = document.createElement("canvas");
      canvas.width = thumbnailWidth;
      canvas.height = Math.round(thumbnailWidth * (video.videoHeight || 9) / (video.videoWidth || 16));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
      fallback = fallback || dataUrl;

      const score = frameScore(context, canvas.width, canvas.height);
      if (score.brightness > 28 && score.variance > 8) {
        return dataUrl;
      }
    }

    return fallback;
  } catch {
    return "";
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function captureThumbnailFromProtectedVideo(videoId) {
  const token = localStorage.getItem(tokenKey);
  const response = await fetch(`/api/videos/${videoId}/stream`, {
    credentials: "same-origin",
    headers: token ? { authorization: `Bearer ${token}` } : {}
  });
  if (!response.ok) throw new Error("Video konnte nicht geladen werden.");
  const blob = await response.blob();
  return captureThumbnail(blob);
}

async function refreshVideoThumbnail(video) {
  const thumbnail = await captureThumbnailFromProtectedVideo(video.id);
  if (!thumbnail) throw new Error(`Kein Vorschaubild fuer "${video.title}" erzeugt.`);
  await api(`/api/videos/${video.id}/thumbnail`, {
    method: "PATCH",
    body: JSON.stringify({ thumbnail })
  });
}

function dataUrlSize(dataUrl) {
  const base64 = String(dataUrl).split(",")[1] || "";
  return Math.floor(base64.length * 3 / 4);
}

function loadImageBlob(blob) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Vorschaubild konnte nicht gelesen werden."));
    };
    image.src = objectUrl;
  });
}

async function compressThumbnailBlob(blob) {
  const image = await loadImageBlob(blob);
  const canvas = document.createElement("canvas");
  canvas.width = thumbnailWidth;
  canvas.height = Math.round(thumbnailWidth * image.naturalHeight / image.naturalWidth);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.68);
}

async function optimizeExistingThumbnail(video) {
  const token = localStorage.getItem(tokenKey);
  const response = await fetch(video.thumbnailUrl, {
    credentials: "same-origin",
    headers: token ? { authorization: `Bearer ${token}` } : {}
  });
  if (!response.ok) throw new Error("Vorschaubild konnte nicht geladen werden.");

  const blob = await response.blob();
  const thumbnail = await compressThumbnailBlob(blob);
  const optimizedSize = dataUrlSize(thumbnail);
  if (optimizedSize >= blob.size * 0.92) {
    return { updated: false, originalSize: blob.size, optimizedSize };
  }

  await api(`/api/videos/${video.id}/thumbnail`, {
    method: "PATCH",
    body: JSON.stringify({ thumbnail })
  });
  return { updated: true, originalSize: blob.size, optimizedSize };
}

optimizeThumbnailsButton.addEventListener("click", async () => {
  const candidates = state.videos.filter((video) => video.thumbnailUrl && video.canRefreshThumbnail);
  if (!candidates.length) {
    libraryStatus.textContent = "Keine Vorschaubilder zum Optimieren gefunden.";
    return;
  }
  if (!confirm(`${candidates.length} Vorschaubilder jetzt verkleinern?`)) return;

  optimizeThumbnailsButton.disabled = true;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let savedBytes = 0;

  for (let index = 0; index < candidates.length; index += 1) {
    const video = candidates[index];
    libraryStatus.textContent = `Bilder werden optimiert: ${index + 1}/${candidates.length}`;
    try {
      const result = await optimizeExistingThumbnail(video);
      if (result.updated) {
        updated += 1;
        savedBytes += Math.max(0, result.originalSize - result.optimizedSize);
      } else {
        skipped += 1;
      }
    } catch {
      failed += 1;
    }
  }

  optimizeThumbnailsButton.disabled = false;
  await loadVideos();
  const savedMb = (savedBytes / (1024 * 1024)).toFixed(1);
  libraryStatus.textContent = failed
    ? `${updated} Bilder optimiert, ${skipped} uebersprungen, ${failed} fehlgeschlagen.`
    : `${updated} Bilder optimiert, ${skipped} uebersprungen, ca. ${savedMb} MB gespart.`;
});

$("#videoFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  uploadStatus.textContent = "Vorschaubild wird erstellt ...";
  $("#thumbnailData").value = await captureThumbnail(file);
  uploadStatus.textContent = $("#thumbnailData").value ? "Vorschaubild bereit." : "Kein Vorschaubild erstellt.";
});

$("#uploadForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  uploadStatus.textContent = "Upload laeuft ...";
  const form = new FormData(formElement);
  form.set("allowParents", form.has("allowParents") ? "true" : "false");
  try {
    await api("/api/videos", { method: "POST", body: form });
    formElement.reset();
    $("#durationSeconds").value = "";
    $("#thumbnailData").value = "";
    uploadStatus.textContent = "Video gespeichert.";
    uploadSection.hidden = true;
    toggleUploadButton.textContent = "Upload";
    await loadVideos();
  } catch (error) {
    uploadStatus.textContent = error.message;
  }
});

toggleUploadButton.addEventListener("click", () => {
  uploadSection.hidden = !uploadSection.hidden;
  toggleUploadButton.textContent = uploadSection.hidden ? "Upload" : "Upload schliessen";
  if (!uploadSection.hidden) uploadSection.scrollIntoView({ block: "nearest" });
});

$("#userForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  userStatus.textContent = "Benutzer wird angelegt ...";
  const form = new FormData(formElement);
  try {
    await api("/api/users", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form))
    });
    formElement.reset();
    userStatus.textContent = "Benutzer angelegt.";
    await loadUsers();
  } catch (error) {
    userStatus.textContent = error.message;
  }
});

editForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  editStatus.textContent = "Speichern ...";
  const form = new FormData(editForm);
  const id = form.get("id");
  try {
    await api(`/api/videos/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: form.get("title"),
        description: form.get("description"),
        category: form.get("category"),
        allowParents: form.has("allowParents")
      })
    });
    editStatus.textContent = "Gespeichert.";
    editDialog.close();
    await loadVideos();
  } catch (error) {
    editStatus.textContent = error.message;
  }
});

function openEditDialog(id) {
  const video = state.videos.find((entry) => entry.id === id);
  if (!video) return;
  editForm.elements.id.value = video.id;
  editForm.elements.title.value = video.title;
  editForm.elements.description.value = video.description || "";
  editForm.elements.category.value = video.category;
  editForm.elements.allowParents.checked = Boolean(video.allowParents);
  editStatus.textContent = "";
  editDialog.showModal();
}

function openPlayer(id) {
  const video = state.videos.find((entry) => entry.id === id);
  if (!video) return;
  $("#playerTitle").textContent = video.title;
  $("#playerMeta").textContent = `${video.category} | ${secondsToTime(video.durationSeconds)} | ${dateText(video.uploadedAt)}`;
  $("#playerDescription").textContent = video.description || "Keine Beschreibung hinterlegt.";
  $("#player").src = `/api/videos/${video.id}/stream`;
  $("#playerDialog").showModal();
}

$("#closePlayer").addEventListener("click", () => {
  $("#player").pause();
  $("#player").removeAttribute("src");
  $("#playerDialog").close();
});

$("#closeEdit").addEventListener("click", () => {
  editDialog.close();
});

boot();
