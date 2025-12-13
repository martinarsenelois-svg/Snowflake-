/*********************************************************
 * FIREBASE INIT (v8)
 *********************************************************/
var firebaseConfig = {
  apiKey: "AIzaSyDWgauZPozTWUVuDGRaMCq2NgARt60p7wA",
  authDomain: "snowflake-62c81.firebaseapp.com",
  databaseURL: "https://snowflake-62c81-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "snowflake-62c81",
  storageBucket: "snowflake-62c81.appspot.com",
  messagingSenderId: "248778051768",
  appId: "1:248778051768:web:113d04d437849e01c2644d"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/*********************************************************
 * STATE
 *********************************************************/
const loginScreen = document.getElementById("loginScreen");
const chatScreen = document.getElementById("chatScreen");

const nameInput = document.getElementById("nameInput");
const passwordInput = document.getElementById("passwordInput");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");

const messagesDiv = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const typingIndicator = document.getElementById("typingIndicator");

const attachBtn = document.getElementById("attachBtn");
const fileInput = document.getElementById("fileInput");
const recordBtn = document.getElementById("recordBtn");

const chatStatus = document.getElementById("chatStatus");
const themeToggle = document.getElementById("themeToggle");

let myId = localStorage.getItem("sf_uid") ||
  Math.random().toString(36).slice(2, 10);
localStorage.setItem("sf_uid", myId);

let myName = localStorage.getItem("sf_name") || "";
let chatId = null;

let isRecording = false;
let recorder = null;
let audioChunks = [];

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

/*********************************************************
 * HELPERS
 *********************************************************/
function hashPassword(pw) {
  let hash = 0;
  for (let i = 0; i < pw.length; i++) {
    hash = ((hash << 5) - hash) + pw.charCodeAt(i);
    hash |= 0;
  }
  return "chat_" + Math.abs(hash);
}

function escapeHTML(str) {
  return str.replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[c]));
}

function scrollBottom() {
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

/*********************************************************
 * LOGIN
 *********************************************************/
if (myName) nameInput.value = myName;

loginBtn.onclick = () => {
  const name = nameInput.value.trim();
  const pw = passwordInput.value.trim();

  if (!name || !pw) {
    loginError.textContent = "Enter name and password";
    return;
  }

  myName = name;
  localStorage.setItem("sf_name", myName);

  chatId = hashPassword(pw);
  enterChat();
};

function enterChat() {
  document.body.classList.remove("login");
  loginScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");

  // Presence
  const userRef = db.ref("users/" + myId);
  userRef.set({
    name: myName,
    online: true,
    lastSeen: Date.now(),
    chatId
  });
  userRef.onDisconnect().update({
    online: false,
    lastSeen: Date.now()
  });

  // Join chat
  db.ref(`chats/${chatId}/users/${myId}`).set(true);

  listenPresence();
  listenMessages();
  listenTyping();
}

/*********************************************************
 * PRESENCE
 *********************************************************/
function listenPresence() {
  db.ref(`chats/${chatId}/users`).on("value", snap => {
    const users = snap.val() || {};
    const otherIds = Object.keys(users).filter(id => id !== myId);

    if (!otherIds.length) {
      chatStatus.textContent = "waiting for user…";
      return;
    }

    db.ref("users/" + otherIds[0]).on("value", s => {
      const u = s.val();
      if (!u) return;
      chatStatus.textContent = u.online ? "online" : "last seen";
    });
  });
}

/*********************************************************
 * MESSAGES
 *********************************************************/
function listenMessages() {
  const msgRef = db.ref(`chats/${chatId}/messages`);

  msgRef.limitToLast(200).on("child_added", snap => {
    renderMessage(snap.key, snap.val());
  });

  msgRef.on("child_changed", snap => {
    updateTicks(snap.key, snap.val());
  });
}

function renderMessage(id, m) {
  const isMine = m.from === myId;

  const el = document.createElement("div");
  el.className = "message " + (isMine ? "me" : "other");
  el.id = "msg_" + id;

  let html = "";

  if (m.type === "image") {
    html += `<img src="${m.fileData}">`;
  } else if (m.type === "audio") {
    html += `<audio controls src="${m.fileData}"></audio>`;
  } else {
    html += escapeHTML(m.text || "");
  }

  const delivered = m.deliveredTo ? Object.keys(m.deliveredTo).length : 0;
  const seen = m.seenBy ? Object.keys(m.seenBy).length : 0;

  let ticks = "";
  if (seen > 0) ticks = "✔✔";
  else if (delivered > 0) ticks = "✔";

  html += `
    <div class="meta">
      <span>${new Date(m.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
      ${isMine ? `<span>${ticks}</span>` : ""}
    </div>
  `;

  el.innerHTML = html;
  messagesDiv.appendChild(el);
  scrollBottom();

  // Delivered / seen
  if (!isMine) {
    const seenBy = m.seenBy || {};
    if (!seenBy[myId]) {
      db.ref(`chats/${chatId}/messages/${id}/seenBy/${myId}`)
        .set(Date.now());
    }
  } else {
    db.ref(`chats/${chatId}/messages/${id}/deliveredTo/${myId}`)
      .set(Date.now());
  }
}

function updateTicks(id, m) {
  const el = document.getElementById("msg_" + id);
  if (!el) return;
  const meta = el.querySelector(".meta");
  if (!meta) return;

  const delivered = m.deliveredTo ? Object.keys(m.deliveredTo).length : 0;
  const seen = m.seenBy ? Object.keys(m.seenBy).length : 0;

  let ticks = "";
  if (seen > 0) ticks = "✔✔";
  else if (delivered > 0) ticks = "✔";

  const spans = meta.querySelectorAll("span");
  if (spans[1]) spans[1].textContent = ticks;
}

/*********************************************************
 * SEND TEXT
 *********************************************************/
sendBtn.onclick = sendText;
messageInput.addEventListener("keydown", e => {
  if (e.key === "Enter") sendText();
});

function sendText() {
  const text = messageInput.value.trim();
  if (!text) return;

  sendMessage({
    type: "text",
    text
  });

  messageInput.value = "";
}

/*********************************************************
 * SEND FILE
 *********************************************************/
attachBtn.onclick = () => fileInput.click();

fileInput.onchange = async () => {
  const file = fileInput.files[0];
  if (!file) return;

  if (file.size > MAX_FILE_SIZE) {
    alert("File too large");
    return;
  }

  const dataUrl = await readFile(file);

  sendMessage({
    type: file.type.startsWith("image") ? "image" : "audio",
    fileData: dataUrl
  });

  fileInput.value = "";
};

function readFile(file) {
  return new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.readAsDataURL(file);
  });
}

/*********************************************************
 * VOICE
 *********************************************************/
recordBtn.onclick = async () => {
  if (isRecording) {
    recorder.stop();
    isRecording = false;
    recordBtn.textContent = "🎙";
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recorder = new MediaRecorder(stream);
  audioChunks = [];

  recorder.ondataavailable = e => audioChunks.push(e.data);
  recorder.onstop = async () => {
    const blob = new Blob(audioChunks, { type: "audio/webm" });
    if (blob.size > MAX_FILE_SIZE) return;

    const data = await readFile(blob);
    sendMessage({ type: "audio", fileData: data });
  };

  recorder.start();
  isRecording = true;
  recordBtn.textContent = "⏹";
};

/*********************************************************
 * CORE SEND
 *********************************************************/
function sendMessage(payload) {
  const ref = db.ref(`chats/${chatId}/messages`).push();
  ref.set({
    from: myId,
    name: myName,
    time: Date.now(),
    deliveredTo: {},
    seenBy: {},
    ...payload
  });
}

/*********************************************************
 * TYPING
 *********************************************************/
messageInput.addEventListener("input", () => {
  db.ref(`chats/${chatId}/typing/${myId}`).set(true);
  db.ref(`chats/${chatId}/typing/${myId}`).onDisconnect().remove();
});

function listenTyping() {
  db.ref(`chats/${chatId}/typing`).on("value", snap => {
    const v = snap.val() || {};
    const others = Object.keys(v).filter(id => id !== myId);
    typingIndicator.textContent = others.length ? "typing…" : "";
  });
}

/*********************************************************
 * THEME
 *********************************************************/
themeToggle.onclick = () => {
  document.body.classList.toggle("dark");
  themeToggle.textContent =
    document.body.classList.contains("dark") ? "☀️" : "🌙";
};