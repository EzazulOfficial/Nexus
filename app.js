import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, doc, setDoc, getDoc, deleteDoc, updateDoc,
  query, orderBy, limit, where, onSnapshot, serverTimestamp,
  arrayUnion, arrayRemove, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, ADMIN_EMAIL } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ---------- ছোট সহায়ক ফাংশন ---------- */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const n = (x) => Number(x).toLocaleString("bn-BD");
const initial = (name) => (String(name || "?").trim()[0] || "?").toUpperCase();

function timeAgo(t) {
  if (!t || !t.toMillis) return "এইমাত্র";
  const s = Math.floor((Date.now() - t.toMillis()) / 1000);
  if (s < 60) return "এইমাত্র";
  const m = Math.floor(s / 60);
  if (m < 60) return `${n(m)} মিনিট আগে`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${n(h)} ঘণ্টা আগে`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${n(d)} দিন আগে`;
  return new Date(t.toMillis()).toLocaleDateString("bn-BD");
}
const ms = (t) => (t && t.toMillis ? t.toMillis() : Date.now());

let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3000);
}

const AUTH_ERRORS = {
  "auth/invalid-email": "ইমেইলটি সঠিক নয়।",
  "auth/user-not-found": "এই ইমেইলে কোনো অ্যাকাউন্ট নেই।",
  "auth/wrong-password": "পাসওয়ার্ড ভুল।",
  "auth/invalid-credential": "ইমেইল বা পাসওয়ার্ড ভুল।",
  "auth/email-already-in-use": "এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট খোলা হয়েছে।",
  "auth/weak-password": "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।",
  "auth/too-many-requests": "অনেকবার চেষ্টা করেছেন, একটু পরে আবার চেষ্টা করুন।",
  "auth/network-request-failed": "ইন্টারনেট সংযোগ চেক করুন।",
  "auth/configuration-not-found": "Firebase এ Authentication চালু করা হয়নি।",
  "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "firebase-config.js এ API Key ঠিকমতো বসানো হয়নি।"
};

/* ---------- অবস্থা (state) ---------- */
let me = null;
let isAdmin = false;
let view = { type: "home" };
let posts = [];
let unsubFeed = null;
let unsubComments = {};
let commentsCache = {};
let openSet = new Set();
let pendingImage = "";

/* ---------- লগইন / সাইনআপ ---------- */
let mode = "login";
function setMode(m) {
  mode = m;
  $("#tabLogin").classList.toggle("active", m === "login");
  $("#tabSignup").classList.toggle("active", m === "signup");
  $("#aName").classList.toggle("hidden", m !== "signup");
  $("#aName").required = m === "signup";
  $("#aSubmit").textContent = m === "login" ? "লগইন করুন" : "অ্যাকাউন্ট খুলুন";
  $("#aPass").autocomplete = m === "login" ? "current-password" : "new-password";
  $("#aError").textContent = "";
}
$("#tabLogin").onclick = () => setMode("login");
$("#tabSignup").onclick = () => setMode("signup");

$("#authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#aEmail").value.trim();
  const pass = $("#aPass").value;
  const name = $("#aName").value.trim();
  const btn = $("#aSubmit");
  btn.disabled = true;
  $("#aError").textContent = "";
  try {
    if (mode === "signup") {
      if (!name) throw { code: "custom", message: "আপনার নাম লিখুন।" };
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, { displayName: name });
      await setDoc(doc(db, "users", cred.user.uid), { name, bio: "", createdAt: serverTimestamp() }, { merge: true });
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
    }
  } catch (err) {
    $("#aError").textContent = AUTH_ERRORS[err.code] || err.message || "কিছু একটা সমস্যা হয়েছে।";
  }
  btn.disabled = false;
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    me = user;
    isAdmin = (user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
    $("#auth").classList.add("hidden");
    $("#app").classList.remove("hidden");
    try {
      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, { name: myName(), bio: "", createdAt: serverTimestamp() }, { merge: true });
      }
    } catch (e) { /* পরে আবার চেষ্টা হবে */ }
    go({ type: "home" });
  } else {
    me = null;
    isAdmin = false;
    stopAll();
    $("#app").classList.add("hidden");
    $("#auth").classList.remove("hidden");
  }
});

function myName() {
  const u = auth.currentUser;
  return (u && (u.displayName || (u.email || "").split("@")[0])) || "ব্যবহারকারী";
}

$("#navLogout").onclick = () => signOut(auth);
$("#navHome").onclick = () => go({ type: "home" });
$("#logoBtn").onclick = () => go({ type: "home" });
$("#navProfile").onclick = () => me && go({ type: "profile", uid: me.uid });

/* ---------- পেজ বদলানো ---------- */
function stopAll() {
  if (unsubFeed) { unsubFeed(); unsubFeed = null; }
  Object.values(unsubComments).forEach((f) => f());
  unsubComments = {};
  commentsCache = {};
  openSet = new Set();
  posts = [];
}

async function go(v) {
  stopAll();
  view = v;
  pendingImage = "";
  window.scrollTo(0, 0);
  const main = $("#main");
  if (v.type === "home") {
    main.innerHTML = composerHTML() + `<div id="feed"></div>`;
    bindComposer();
  } else {
    main.innerHTML = `<div id="profileBox" class="card profile"><p class="empty">লোড হচ্ছে...</p></div><div id="feed"></div>`;
    loadProfile(v.uid);
  }
  startFeed();
}

/* ---------- প্রোফাইল ---------- */
async function loadProfile(uid) {
  const box = $("#profileBox");
  let data = { name: "ব্যবহারকারী", bio: "" };
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) data = snap.data();
  } catch (e) { /* ignore */ }
  const own = me && uid === me.uid;
  box.innerHTML = `
    <div class="avatar big">${esc(initial(data.name))}</div>
    <h2>${esc(data.name)}</h2>
    <p class="bio">${esc(data.bio || (own ? "নিজের সম্পর্কে কিছু লিখুন..." : ""))}</p>
    ${own ? `<button class="btn ghost small" id="editBtn" type="button">✏️ প্রোফাইল এডিট</button>
    <form id="editForm" class="edit-form hidden">
      <input id="eName" maxlength="40" value="${esc(data.name)}" placeholder="নাম">
      <textarea id="eBio" rows="3" maxlength="200" placeholder="আপনার সম্পর্কে">${esc(data.bio || "")}</textarea>
      <button class="btn primary" type="submit">সেভ করুন</button>
    </form>` : ""}`;
  if (own) {
    $("#editBtn").onclick = () => $("#editForm").classList.toggle("hidden");
    $("#editForm").onsubmit = async (e) => {
      e.preventDefault();
      const name = $("#eName").value.trim();
      const bio = $("#eBio").value.trim();
      if (!name) return toast("নাম খালি রাখা যাবে না");
      try {
        await updateProfile(auth.currentUser, { displayName: name });
        await setDoc(doc(db, "users", me.uid), { name, bio }, { merge: true });
        toast("প্রোফাইল আপডেট হয়েছে");
        loadProfile(uid);
      } catch (err) { toast("সেভ করা যায়নি: " + (err.code || err.message)); }
    };
  }
}

/* ---------- পোস্ট লেখার বক্স ---------- */
function composerHTML() {
  return `<div class="card composer">
    <div class="composer-row">
      <div class="avatar">${esc(initial(myName()))}</div>
      <textarea id="pText" rows="1" maxlength="2000" placeholder="${esc(myName())}, আপনার মনে কী চলছে?"></textarea>
    </div>
    <div id="pPreview" class="preview hidden"><img id="pPreviewImg" alt=""><button id="pRemove" type="button">✕</button></div>
    <div class="composer-actions">
      <label class="file-btn">📷 ছবি<input id="pFile" type="file" accept="image/*" hidden></label>
      <button id="pSubmit" class="btn primary small" type="button">পোস্ট করুন</button>
    </div>
  </div>`;
}

function bindComposer() {
  const ta = $("#pText");
  ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 200) + "px"; });
  $("#pFile").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      pendingImage = await compress(f);
      $("#pPreviewImg").src = pendingImage;
      $("#pPreview").classList.remove("hidden");
    } catch (err) { toast("ছবিটি পড়া যায়নি"); }
    e.target.value = "";
  });
  $("#pRemove").onclick = () => { pendingImage = ""; $("#pPreview").classList.add("hidden"); };
  $("#pSubmit").onclick = submitPost;
}

// ছবি ছোট করে (সর্বোচ্চ ~৩০০ KB) ডাটাবেসে রাখার উপযোগী করা, যাতে Storage না লাগে (ফ্রি)
function compress(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 900;
      let w = img.width, h = img.height;
      const s = Math.min(1, MAX / Math.max(w, h));
      w = Math.round(w * s); h = Math.round(h * s);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      let q = 0.75;
      let d = c.toDataURL("image/jpeg", q);
      while (d.length > 400000 && q > 0.3) { q -= 0.1; d = c.toDataURL("image/jpeg", q); }
      resolve(d);
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function submitPost() {
  const text = $("#pText").value.trim();
  if (!text && !pendingImage) return toast("কিছু লিখুন বা ছবি দিন");
  const btn = $("#pSubmit");
  btn.disabled = true;
  try {
    await addDoc(collection(db, "posts"), {
      uid: me.uid, name: myName(), text, image: pendingImage || "",
      likes: [], commentCount: 0, createdAt: serverTimestamp()
    });
    $("#pText").value = ""; $("#pText").style.height = "auto";
    pendingImage = ""; $("#pPreview").classList.add("hidden");
  } catch (err) {
    toast("পোস্ট করা যায়নি: " + (err.code || err.message));
  }
  btn.disabled = false;
}

/* ---------- ফিড ---------- */
function startFeed() {
  const q = view.type === "profile"
    ? query(collection(db, "posts"), where("uid", "==", view.uid))
    : query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(50));
  unsubFeed = onSnapshot(q, (snap) => {
    posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (view.type === "profile") posts.sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
    renderFeed();
  }, (err) => toast("ফিড লোড হয়নি: " + (err.code || err.message)));
}

function postHTML(p) {
  const canDel = p.uid === me.uid || isAdmin;
  const likes = Array.isArray(p.likes) ? p.likes : [];
  const liked = likes.includes(me.uid);
  const img = p.image && String(p.image).startsWith("data:image/") ? `<img class="pimg" src="${esc(p.image)}" alt="">` : "";
  return `<article class="card post" data-pid="${p.id}">
    <div class="phead">
      <div class="avatar" data-uid="${esc(p.uid)}">${esc(initial(p.name))}</div>
      <div><a class="uname" data-uid="${esc(p.uid)}">${esc(p.name)}</a><div class="time">${timeAgo(p.createdAt)}</div></div>
      ${canDel ? `<button class="icon-btn" data-act="delpost" data-id="${p.id}" title="মুছুন">🗑</button>` : ""}
    </div>
    ${p.text ? `<p class="ptext">${esc(p.text)}</p>` : ""}
    ${img}
    <div class="stats"><span>👍 ${n(likes.length)}</span><span class="ccount" data-act="togglec" data-id="${p.id}">${n(p.commentCount || 0)} টি মন্তব্য</span></div>
    <div class="actions">
      <button class="${liked ? "liked" : ""}" data-act="like" data-id="${p.id}">👍 লাইক</button>
      <button data-act="togglec" data-id="${p.id}">💬 মন্তব্য</button>
    </div>
    <div class="comments hidden" id="cbox-${p.id}">
      <div id="clist-${p.id}"></div>
      <form class="cform" data-id="${p.id}">
        <input class="cinput" data-id="${p.id}" maxlength="1000" placeholder="মন্তব্য লিখুন..." autocomplete="off">
        <button class="csend" type="submit">পাঠান</button>
      </form>
    </div>
  </article>`;
}

function renderFeed() {
  const feed = $("#feed");
  if (!feed) return;
  // টাইপ করা অসমাপ্ত মন্তব্য ও ফোকাস ধরে রাখা
  const drafts = {};
  document.querySelectorAll(".cinput").forEach((i) => { if (i.value) drafts[i.dataset.id] = i.value; });
  const active = document.activeElement;
  const focusId = active && active.classList && active.classList.contains("cinput") ? active.dataset.id : null;

  feed.innerHTML = posts.length
    ? posts.map(postHTML).join("")
    : `<div class="card empty">${view.type === "home" ? "এখনও কোনো পোস্ট নেই। প্রথম পোস্টটি আপনিই করুন!" : "কোনো পোস্ট নেই।"}</div>`;

  openSet.forEach((id) => {
    const box = $(`#cbox-${id}`);
    if (box) { box.classList.remove("hidden"); paintComments(id); }
  });
  Object.entries(drafts).forEach(([id, v]) => {
    const inp = document.querySelector(`.cinput[data-id="${id}"]`);
    if (inp) inp.value = v;
  });
  if (focusId) {
    const inp = document.querySelector(`.cinput[data-id="${focusId}"]`);
    if (inp) inp.focus();
  }
}

/* ---------- মন্তব্য ---------- */
function toggleComments(id) {
  const box = $(`#cbox-${id}`);
  if (!box) return;
  if (openSet.has(id)) {
    openSet.delete(id);
    box.classList.add("hidden");
    return;
  }
  openSet.add(id);
  box.classList.remove("hidden");
  if (!unsubComments[id]) {
    const q = query(collection(db, "posts", id, "comments"), orderBy("createdAt", "asc"));
    unsubComments[id] = onSnapshot(q, (snap) => {
      commentsCache[id] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      paintComments(id);
    }, (err) => toast("মন্তব্য লোড হয়নি: " + (err.code || err.message)));
  } else {
    paintComments(id);
  }
}

function paintComments(id) {
  const list = $(`#clist-${id}`);
  if (!list) return;
  const items = commentsCache[id] || [];
  list.innerHTML = items.map((c) => `
    <div class="comment">
      <div class="avatar" data-uid="${esc(c.uid)}">${esc(initial(c.name))}</div>
      <div>
        <div class="cbubble"><a class="uname" data-uid="${esc(c.uid)}">${esc(c.name)}</a><p>${esc(c.text)}</p></div>
        <div class="cmeta">${timeAgo(c.createdAt)}${(c.uid === me.uid || isAdmin) ? `<button data-act="delcomment" data-id="${id}" data-cid="${c.id}">মুছুন</button>` : ""}</div>
      </div>
    </div>`).join("");
}

document.addEventListener("submit", async (e) => {
  const form = e.target.closest(".cform");
  if (!form) return;
  e.preventDefault();
  const id = form.dataset.id;
  const input = form.querySelector(".cinput");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  try {
    await addDoc(collection(db, "posts", id, "comments"), {
      uid: me.uid, name: myName(), text, createdAt: serverTimestamp()
    });
    await updateDoc(doc(db, "posts", id), { commentCount: increment(1) });
  } catch (err) {
    input.value = text;
    toast("মন্তব্য করা যায়নি: " + (err.code || err.message));
  }
});

/* ---------- ক্লিক হ্যান্ডলার (লাইক, মুছা, প্রোফাইলে যাওয়া) ---------- */
document.addEventListener("click", async (e) => {
  const uidEl = e.target.closest("[data-uid]");
  if (uidEl && !e.target.closest("[data-act]") && me) {
    go({ type: "profile", uid: uidEl.dataset.uid });
    return;
  }
  const el = e.target.closest("[data-act]");
  if (!el || !me) return;
  const act = el.dataset.act;
  const id = el.dataset.id;

  try {
    if (act === "like") {
      const p = posts.find((x) => x.id === id);
      const liked = p && (p.likes || []).includes(me.uid);
      await updateDoc(doc(db, "posts", id), { likes: liked ? arrayRemove(me.uid) : arrayUnion(me.uid) });
    } else if (act === "togglec") {
      toggleComments(id);
    } else if (act === "delpost") {
      if (!confirm("এই পোস্টটি মুছে ফেলবেন?")) return;
      await deleteDoc(doc(db, "posts", id));
      toast("পোস্ট মুছে গেছে");
    } else if (act === "delcomment") {
      if (!confirm("মন্তব্যটি মুছে ফেলবেন?")) return;
      await deleteDoc(doc(db, "posts", id, "comments", el.dataset.cid));
      await updateDoc(doc(db, "posts", id), { commentCount: increment(-1) });
    }
  } catch (err) {
    toast("কাজটি হয়নি: " + (err.code || err.message));
  }
});

/* ---------- অফলাইন সাপোর্ট (অ্যাপের মতো ইনস্টল) ---------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
