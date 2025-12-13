/************************************************************
 * FIREBASE INIT (v8)
 ************************************************************/
var firebaseConfig = {
  apiKey: "AIzaSyDWgauZPozTWUVuDGRaMCq2NgARt60p7wA",
  authDomain: "snowflake-62c81.firebaseapp.com",
  databaseURL: "https://snowflake-62c81-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "snowflake-62c81",
  storageBucket: "snowflake-62c81.appspot.com",
  messagingSenderId: "248778051768",
  appId: "1:248778051768:web:5deffaea7073f9ddc2644d"
};
firebase.initializeApp(firebaseConfig);

const db = firebase.database();

/************************************************************
 * GLOBAL STATE
 ************************************************************/
const PASSWORD = "2382_BZ";

const myId =
  localStorage.getItem("sf_id") ||
  Math.random().toString(36).slice(2, 10);

localStorage.setItem("sf_id", myId);

let myName = localStorage.getItem("sf_name") || null;
let activeChatId = null;
let activeUserId = null;
let defaultTTL = parseInt(localStorage.getItem("sf_ttl") || "0", 10);
let snowEnabled = localStorage.getItem("sf_snow") !== "false";
let isRecording = false;
let recorder, audioChunks = [];
let isConverting = false;

/************************************************************
 * DOM
 ************************************************************/
const loginScreen = document.getElementById("loginScreen");
const app = document.getElementById("app");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");
const nameInput = document.getElementById("nameInput");
const saveNameBtn = document.getElementById("saveName");

const userSearch = document.getElementById("userSearch");
const userList = document.getElementById("userList");

const chatHeader = document.getElementById("chatHeader");
const chatWith = document.getElementById("chatWith");
const messagesDiv = document.getElementById("messages");
const typingIndicator = document.getElementById("typingIndicator");

const msgInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const attachBtn = document.getElementById("attachBtn");
const recordBtn = document.getElementById("recordBtn");
const fileInput = document.getElementById("fileInput");

const settingsPanel = document.getElementById("settingsPanel");
const openSettingsBtn = document.getElementById("openSettings");
const logoutBtn = document.getElementById("logoutBtn");
const clearChatBtn = document.getElementById("clearChatBtn");
const ttlSelect = document.getElementById("ttlSelect");
const snowToggle = document.getElementById("snowToggle");
const themeBtn = document.getElementById("toggleTheme");
const snowBtn = document.getElementById("toggleSnow");

/************************************************************
 * UTILITIES
 ************************************************************/
function escapeHtml(str = "") {
  return str.replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function chatIdFor(a, b) {
  return [a, b].sort().join("_");
}

function scrollBottom() {
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

/************************************************************
 * LOGIN
 ************************************************************/
if (myName) nameInput.value = myName;

loginBtn.onclick = () => {
  if (loginPassword.value !== PASSWORD) {
    loginError.innerText = "Wrong password ❌";
    return;
  }
  if (!nameInput.value.trim()) {
    loginError.innerText = "Enter a username";
    return;
  }
  myName = nameInput.value.trim();
  localStorage.setItem("sf_name", myName);
  showApp();
};

function showApp() {
  loginScreen.classList.add("hidden");
  app.classList.remove("hidden");

  db.ref("users/" + myId).set({
    name: myName,
    online: true,
    lastSeen: Date.now()
  });

  db.ref("users/" + myId).onDisconnect().set({
    name: myName,
    online: false,
    lastSeen: Date.now()
  });

  loadUsers();
}

if (myName) showApp();

/************************************************************
 * USERS & SEARCH
 ************************************************************/
function loadUsers() {
  db.ref("users").on("value", snap => {
    const users = snap.val() || {};
    renderUserList(users);
  });
}

function renderUserList(users) {
  userList.innerHTML = "";
  Object.entries(users).forEach(([uid, u]) => {
    if (uid === myId) return;
    const el = document.createElement("div");
    el.className = "userItem";
    el.innerHTML = `
      <img src="https://api.dicebear.com/6.x/identicon/svg?seed=${uid}">
      <div class="userMeta">
        <strong>${escapeHtml(u.name)}</strong>
        <small>${u.online ? "online" : "offline"}</small>
      </div>
    `;
    el.onclick = () => openChat(uid, u.name, el);
    userList.appendChild(el);
  });
}

/************************************************************
 * OPEN CHAT
 ************************************************************/
function openChat(userId, userName, el) {
  document
    .querySelectorAll(".userItem")
    .forEach(x => x.classList.remove("active"));
  el.classList.add("active");

  activeUserId = userId;
  activeChatId = chatIdFor(myId, userId);

  chatHeader.classList.remove("hidden");
  chatWith.innerText = userName;
  messagesDiv.innerHTML = "";

  listenMessages();
  listenTyping();
}

/************************************************************
 * MESSAGES
 ************************************************************/
let msgRef = null;

function listenMessages() {
  if (msgRef) msgRef.off();

  msgRef = db.ref("chats/" + activeChatId + "/messages");
  msgRef.limitToLast(200).on("child_added", snap => {
    renderMessage(snap.key, snap.val());
  });
}

function renderMessage(id, m) {
  if (document.getElementById("msg_" + id)) return;

  const mine = m.senderId === myId;
  const el = document.createElement("div");
  el.id = "msg_" + id;
  el.className = "msg " + (mine ? "me" : "other");

  let content = "";
  if (m.fileData) {
    if (m.fileType.startsWith("image"))
      content += `<img src="${m.fileData}">`;
    else if (m.fileType.startsWith("audio"))
      content += `<audio controls src="${m.fileData}"></audio>`;
  }
  if (m.text) content += `<div>${escapeHtml(m.text)}</div>`;

  const time = new Date(m.time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  content += `
    <div class="meta">
      ${time}
      ${mine && m.seenBy ? "✔✔" : mine && m.deliveredTo ? "✔" : ""}
    </div>
  `;

  el.innerHTML = content;
  messagesDiv.appendChild(el);
  scrollBottom();

  if (!mine) {
    db.ref(`chats/${activeChatId}/messages/${id}/seenBy/${myId}`)
      .set(Date.now());
  }
}

/************************************************************
 * SEND MESSAGE
 ************************************************************/
sendBtn.onclick = sendMessage;
msgInput.onkeydown = e => e.key === "Enter" && sendMessage();

function sendMessage(textOverride, fileMeta) {
  if (!activeChatId) return;
  const text = textOverride ?? msgInput.value.trim();
  if (!text && !fileMeta) return;

  const ref = db.ref("chats/" + activeChatId + "/messages").push();
  const msg = {
    senderId: myId,
    senderName: myName,
    text: text || "",
    time: Date.now(),
    deliveredTo: {},
    seenBy: {},
    ttl: defaultTTL
  };

  if (fileMeta) {
    msg.fileData = fileMeta.data;
    msg.fileType = fileMeta.type;
  }

  ref.set(msg);
  msgInput.value = "";
}

/************************************************************
 * TYPING
 ************************************************************/
msgInput.oninput = () => {
  if (!activeChatId) return;
  db.ref(`typing/${activeChatId}/${myId}`).set({
    name: myName,
    time: Date.now()
  });
};

function listenTyping() {
  db.ref(`typing/${activeChatId}`).on("value", snap => {
    const t = snap.val() || {};
    const others = Object.entries(t).filter(([k]) => k !== myId);
    typingIndicator.innerText =
      others.length ? `${others[0][1].name} is typing…` : "";
  });
}

/************************************************************
 * FILE & AUDIO (BASE64)
 ************************************************************/
attachBtn.onclick = () => fileInput.click();
fileInput.onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () =>
    sendMessage("", { data: reader.result, type: file.type });
  reader.readAsDataURL(file);
};

recordBtn.onclick = async () => {
  if (isRecording) {
    recorder.stop();
    recordBtn.innerText = "🎙";
    isRecording = false;
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recorder = new MediaRecorder(stream);
  audioChunks = [];
  recorder.ondataavailable = e => audioChunks.push(e.data);
  recorder.onstop = async () => {
    const blob = new Blob(audioChunks, { type: "audio/webm" });
    const r = new FileReader();
    r.onload = () =>
      sendMessage("", { data: r.result, type: "audio/webm" });
    r.readAsDataURL(blob);
  };
  recorder.start();
  recordBtn.innerText = "⏹";
  isRecording = true;
};

/************************************************************
 * SETTINGS / UI
 ************************************************************/
openSettingsBtn.onclick = () =>
  settingsPanel.classList.toggle("hidden");

logoutBtn.onclick = () => {
  localStorage.clear();
  location.reload();
};

ttlSelect.value = defaultTTL;
ttlSelect.onchange = () => {
  defaultTTL = parseInt(ttlSelect.value, 10);
  localStorage.setItem("sf_ttl", defaultTTL);
};

snowToggle.checked = snowEnabled;
snowToggle.onchange = () => {
  snowEnabled = snowToggle.checked;
  localStorage.setItem("sf_snow", snowEnabled);
};

themeBtn.onclick = () => {
  document.body.classList.toggle("dark");
};

clearChatBtn.onclick = () => {
  if (!activeChatId) return;
  if (confirm("Clear this chat?")) {
    db.ref("chats/" + activeChatId + "/messages").remove();
    messagesDiv.innerHTML = "";
  }
};

/************************************************************
 * SNOW (same logic, simplified)
 ************************************************************/
const canvas = document.getElementById("snow");
const ctx = canvas.getContext("2d");
let W = (canvas.width = window.innerWidth);
let H = (canvas.height = window.innerHeight);
const flakes = Array.from({ length: 200 }, () => ({
  x: Math.random() * W,
  y: Math.random() * H,
  r: Math.random() * 3 + 1,
  d: Math.random() * 2
}));

function drawSnow() {
  if (!snowEnabled) return ctx.clearRect(0, 0, W, H);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  flakes.forEach(f => {
    ctx.moveTo(f.x, f.y);
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    f.y += f.d;
    if (f.y > H) {
      f.y = 0;
      f.x = Math.random() * W;
    }
  });
  ctx.fill();
}

setInterval(drawSnow, 33);
window.onresize = () => {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
};