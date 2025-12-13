/*********************************************************
 * ❄️ SNOWFLAKE CHAT — CORE ENGINE
 * Version: Extended / Backward Compatible
 * Firebase v8 ONLY
 *********************************************************/

/*********************************************************
 * FIREBASE INIT (UNCHANGED, VERIFIED)
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
 * DOM REFERENCES (ALL EXIST IN HTML)
 ***************onclick******************************************/
const loginScreen = document.getElementById("loginScreen");
const chatScreen  = document.getElementById("chatScreen");

const nameInput     = document.getElementById("nameInput");
const passwordInput = document.getElementById("passwordInput");
const loginBtn      = document.getElementById("loginBtn");
const loginError    = document.getElementById("loginError");

const messagesDiv      = document.getElementById("messages");
const messageInput     = document.getElementById("messageInput");
const sendBtn          = document.getElementById("sendBtn");
const typingIndicator  = document.getElementById("typingIndicator");

const attachBtn   = document.getElementById("attachBtn");
const fileInput   = document.getElementById("fileInput");
const recordBtn   = document.getElementById("recordBtn");

const chatStatus  = document.getElementById("chatStatus");
const themeToggle = document.getElementById("themeToggle");

const replyBar    = document.getElementById("replyBar");
const replyText   = document.getElementById("replyText");
const cancelReply = document.getElementById("cancelReply");


/*********************************************************
 * GLOBAL STATE (EXTENDED, SAFE DEFAULTS)
 *********************************************************/
let myId = localStorage.getItem("sf_uid");
if (!myId) {
  myId = Math.random().toString(36).slice(2, 10);
  localStorage.setItem("sf_uid", myId);
}

let myName  = localStorage.getItem("sf_name") || "";
let chatId  = null;
let adminId = null;

/* Reply state */
let replyToMessage = null;

/* Recording state */
let isRecording = false;
let recorder = null;
let audioChunks = [];

/* Feature flags */
const DEBUG = false;

/* Limits */
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

/*********************************************************
 * UTILITY FUNCTIONS (SAFE, PURE)
 *********************************************************/
function log(...args) {
  if (DEBUG) console.log("[SF]", ...args);
}

/* Password → chatId (UNCHANGED LOGIC) */
function hashPassword(pw) {
  let hash = 0;
  for (let i = 0; i < pw.length; i++) {
    hash = ((hash << 5) - hash) + pw.charCodeAt(i);
    hash |= 0;
  }
  return "chat_" + Math.abs(hash);
}

/* HTML escape */
function escapeHTML(str) {
  if (!str) return "";
  return str.replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[c]));
}

/* Scroll helpers */
function scrollToBottom(force = false) {
  if (force) {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    return;
  }

  const nearBottom =
    messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight < 120;

  if (nearBottom) {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
}

/* Time format */
function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

/* Local delete-for-me storage */
function getLocalDeletes() {
  try {
    return JSON.parse(localStorage.getItem("sf_deleted") || "{}");
  } catch {
    return {};
  }
}

function setLocalDelete(msgId) {
  const data = getLocalDeletes();
  data[msgId] = true;
  localStorage.setItem("sf_deleted", JSON.stringify(data));
}

function isLocallyDeleted(msgId) {
  return !!getLocalDeletes()[msgId];
}
/*********************************************************
 * LOGIN & CHAT ENTRY
 *********************************************************/

/* Restore name if available */
if (myName) {
  nameInput.value = myName;
}

/* Login click */
loginBtn.onclick = () => {
  const name = nameInput.value.trim();
  const pw   = passwordInput.value.trim();

  if (!name || !pw) {
    loginError.textContent = "Enter name and password";
    return;
  }

  myName = name;
  localStorage.setItem("sf_name", myName);

  chatId = hashPassword(pw);
  enterChat()/* Admin assignment (first user wins) */
 {
    adminRef.set(myId);
    isAdmin = true;
  } else {
    isAdmin = snap.val() === myId;
  }
});;
};

/* Enter chat */
function enterChat() {
  document.body.classList.remove("login");
  loginScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");

  setupPresence();
  setupAdmin();
  listenPresence();
  listenMessages();
  listenTyping();

  scrollToBottom(true);
}

/*********************************************************
 * PRESENCE SYSTEM (EXTENDED, SAFE)
 *********************************************************/
function setupPresence() {
  const userRef = db.ref("users/" + myId);

  userRef.set({
    name: myName,
    online: true,
    lastSeen: Date.now(),
    chatId: chatId
  });

  userRef.onDisconnect().update({
    online: false,
    lastSeen: Date.now()
  });

  /* Join chat user list */
  db.ref(`chats/${chatId}/users/${myId}`).set(true);
  db.ref(`chats/${chatId}/users/${myId}`).onDisconnect().remove();
}

/* Listen other user presence */
function listenPresence() {
  const usersRef = db.ref(`chats/${chatId}/users`);

  usersRef.on("value", snap => {
    const users = snap.val() || {};
    const otherIds = Object.keys(users).filter(id => id !== myId);

    if (!otherIds.length) {
      chatStatus.textContent = "waiting for user…";
      return;
    }

    const otherId = otherIds[0];
    db.ref("users/" + otherId).on("value", s => {
      const u = s.val();
      if (!u) return;

      chatStatus.textContent = u.online
        ? "online"
        : "last seen " + new Date(u.lastSeen).toLocaleTimeString();
    });
  });
}

/*********************************************************
 * ADMIN ASSIGNMENT (FIRST USER = ADMIN)
 *********************************************************/
function setupAdmin() {
  const adminRef = db.ref(`chats/${chatId}/admin`);

  adminRef.transaction(current => {
    if (current === null) {
      return myId; // first user becomes admin
    }
    return current;
  }, (err, committed, snap) => {
    if (!err && snap) {
      adminId = snap.val();
      log("Admin ID:", adminId);
    }
  });
}
/*********************************************************
 * MESSAGE LISTENING & RENDERING
 *********************************************************/
function listenMessages() {
  const msgRef = db.ref(`chats/${chatId}/messages`);

  /* New messages */
  msgRef.limitToLast(300).on("child_added", snap => {
    const msgId = snap.key;
    const msg   = snap.val();

    /* Local delete-for-me */
    if (isLocallyDeleted(msgId)) return;

    renderMessage(msgId, msg);
  });

  /* Updates (seen, delivered, delete, edit, reactions) */
  msgRef.on("child_changed", snap => {
    const msgId = snap.key;
    const msg   = snap.val();

    const el = document.getElementById("msg_" + msgId);
    if (!el) return;

    updateMessage(el, msgId, msg);
  });

  /* Hard delete (admin) */
  msgRef.on("child_removed", snap => {
    const el = document.getElementById("msg_" + snap.key);
    if (el) el.remove();
  });
}

/*********************************************************
 * MESSAGE RENDER
 *********************************************************/
function renderMessage(id, m) {
  const isMine = m.from === myId;

  const el = document.createElement("div");
  el.className = "message " + (isMine ? "me" : "other");
  el.id = "msg_" + id;

  let html = "";

  /* 🔴 Deleted for everyone */
  if (m.deletedForAll) {
    el.innerHTML = `<i style="opacity:.6">🚫 Message deleted</i>`;
    messagesDiv.appendChild(el);
    scrollToBottom();
    return;
  }

  /* 🧵 Reply preview */
  if (m.replyTo) {
    html += `
      <div class="reply-preview">
        <small>${escapeHTML(m.replyTo.from)}</small>
        <div>${escapeHTML(m.replyTo.text)}</div>
      </div>
    `;
  }

  /* 📦 Message content */
  if (m.type === "image") {
    html += `<img src="${m.fileData}" />`;
  }
  else if (m.type === "audio") {
    html += `<audio controls src="${m.fileData}"></audio>`;
  }
  else {
    html += escapeHTML(m.text || "");
  }

  /* ✔✔ Ticks */
  const delivered = m.deliveredTo ? Object.keys(m.deliveredTo).length : 0;
  const seen = m.seenBy ? Object.keys(m.seenBy).length : 0;

  let ticks = "";
  if (seen > 0) ticks = "✔✔";
  else if (delivered > 0) ticks = "✔";

  html += `
    <div class="meta">
      <span>
        ${new Date(m.time).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        })}
      </span>
      ${isMine ? `<span>${ticks}</span>` : ""}
    </div>
  `;

  el.innerHTML = html;
  messagesDiv.appendChild(el);
  scrollToBottom();

  /* 👁 Seen / Delivered */
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

  /* 🖐 Gestures */
  enableSwipeReply(el, { ...m, id });
  attachLongPress(el, { ...m, id });
}

/*********************************************************
 * MESSAGE UPDATE (TICKS, DELETE, EDIT)
 *********************************************************/
function updateMessage(el, id, m) {
  /* Soft delete */
  if (m.deleted) {
    el.className = "message deleted";
    el.textContent = "This message was deleted";
    return;
  }

  const meta = el.querySelector(".meta");
  if (!meta) return;

  const delivered = m.deliveredTo ? Object.keys(m.deliveredTo).length : 0;
  const seen      = m.seenBy ? Object.keys(m.seenBy).length : 0;

  let ticks = "";
  if (seen > 0) ticks = "✔✔";
  else if (delivered > 0) ticks = "✔";

  const spans = meta.querySelectorAll("span");
  if (spans[1]) spans[1].textContent = ticks;
}
/*********************************************************
 * SEND TEXT (UNCHANGED + SAFE EXTENSION)
 *********************************************************/
sendBtn.onclick = sendText;

messageInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendText();
  }
});

function sendText() {
  const text = messageInput.value.trim();
  if (!text) return;

  sendMessage({
    type: "text",
    text: text
  });

  messageInput.value = "";
}

/*********************************************************
 * SEND FILE (IMAGE / AUDIO)
 *********************************************************/
attachBtn.onclick = () => fileInput.click();

fileInput.onchange = async () => {
  const file = fileInput.files[0];
  if (!file) return;

  if (file.size > MAX_FILE_SIZE) {
    alert("File too large (max 2MB)");
    fileInput.value = "";
    return;
  }

  /* Basic MIME guard */
  if (!file.type.startsWith("image") && !file.type.startsWith("audio")) {
    alert("Unsupported file type");
    fileInput.value = "";
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
 * VOICE RECORDING (UNCHANGED LOGIC + SAFETY)
 *********************************************************/
recordBtn.onclick = async () => {
  if (isRecording) {
    recorder.stop();
    isRecording = false;
    recordBtn.textContent = "🎙";
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recorder = new MediaRecorder(stream);
  } catch (err) {
    alert("Microphone permission denied");
    return;
  }

  audioChunks = [];

  recorder.ondataavailable = e => audioChunks.push(e.data);

  recorder.onstop = async () => {
    const blob = new Blob(audioChunks, { type: "audio/webm" });
    if (blob.size > MAX_FILE_SIZE) {
      alert("Audio too large");
      return;
    }

    const data = await readFile(blob);
    sendMessage({
      type: "audio",
      fileData: data
    });
  };

  recorder.start();
  isRecording = true;
  recordBtn.textContent = "⏹";
};
/*********************************************************
 * MESSAGE INTERACTION STATE
 *********************************************************/
let replyToMessage = null;
let longPressTimer = null;
let activeMessageId = null;

/* Admin logic (first user becomes admin) */
let isAdmin = false;
function enableSwipeReply(el, msg) {
  let startX = 0;
  let moved = false;

  el.addEventListener("touchstart", e => {
    startX = e.touches[0].clientX;
    moved = false;
  }, { passive: true });

  el.addEventListener("touchmove", e => {
    const dx = e.touches[0].clientX - startX;
    if (dx > 40) {
      moved = true;
      el.style.transform = "translateX(20px)";
    }
  }, { passive: true });

  el.addEventListener("touchend", () => {
    el.style.transform = "";
    if (moved) {
      setReply(msg);
    }
  });
}
function setReply(msg) {
  replyToMessage = {
    id: msg.id,
    text: msg.text || msg.type,
    from: msg.from === myId ? "You" : msg.name
  };

  replyText.textContent =
    `${replyToMessage.from}: ${replyToMessage.text}`;

  replyBar.classList.remove("hidden");
}

cancelReply.onclick = () => {
  replyToMessage = null;
  replyBar.classList.add("hidden");
};
function attachLongPress(el, msg) {
  el.addEventListener("touchstart", () => {
    longPressTimer = setTimeout(() => {
      activeMessageId = msg.id;
      showMessageMenu(msg);
    }, 600);
  });

  el.addEventListener("touchend", () => {
    clearTimeout(longPressTimer);
  });
}
const menu = document.createElement("div");
menu.id = "msgMenu";
menu.innerHTML = `
  <div class="menu-box">
    <button id="replyOpt">Reply</button>
    <button id="delMe">Delete for me</button>
    <button id="delAll">Delete for everyone</button>
    <button id="delAdmin">Admin delete</button>
    <button id="menuClose">Cancel</button>
  </div>
`;
document.body.appendChild(menu);

function showMessageMenu(msg) {
  menu.classList.add("show");

  document.getElementById("replyOpt").onclick = () => {
    setReply(msg);
    hideMenu();
  };

  document.getElementById("delMe").onclick = () => {
    document.getElementById("msg_" + msg.id)?.remove();
    hideMenu();
  };

  document.getElementById("delAll").onclick = () => {
    if (msg.from !== myId) {
      alert("Only sender can delete for everyone");
      return;
    }
    db.ref(`chats/${chatId}/messages/${msg.id}`).update({
      deletedForAll: true,
      text: "🚫 Message deleted"
    });
    hideMenu();
  };

  document.getElementById("delAdmin").onclick = () => {
    if (!isAdmin) {
      alert("Admin only");
      return;
    }
    db.ref(`chats/${chatId}/messages/${msg.id}`).remove();
    hideMenu();
  };

  document.getElementById("menuClose").onclick = hideMenu;
}

function hideMenu() {
  menu.classList.remove("show");
}
/*********************************************************
 * MOBILE KEYBOARD FIX (ANTI-COLLAPSE)
 *********************************************************/
let lastScrollTop = 0;

messageInput.addEventListener("focus", () => {
  lastScrollTop = messagesDiv.scrollTop;
  setTimeout(() => scrollBottom(), 300);
});

messageInput.addEventListener("blur", () => {
  messagesDiv.scrollTop = lastScrollTop;
});

/* Visual viewport handling (modern mobile browsers) */
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    const vh = window.visualViewport.height;
    document.body.style.height = vh + "px";
    scrollBottom();
  });
}
/*********************************************************
 * TYPING AUTO-CLEANUP
 *********************************************************/
let typingTimeout = null;

messageInput.addEventListener("input", () => {
  const ref = db.ref(`chats/${chatId}/typing/${myId}`);
  ref.set(true);

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    ref.remove();
  }, 1200);
});
/*********************************************************
 * ONLINE HEARTBEAT
 *********************************************************/
setInterval(() => {
  if (!chatId) return;
  db.ref("users/" + myId + "/lastSeen").set(Date.now());
}, 15000);
/*********************************************************
 * DOUBLE SEND PROTECTION
 *********************************************************/
let sendingLock = false;

function sendMessage(payload) {
  if (sendingLock) return;
  sendingLock = true;

  const ref = db.ref(`chats/${chatId}/messages`).push();

  const base = {
    from: myId,
    name: myName,
    time: Date.now(),
    deliveredTo: {},
    seenBy: {}
  };

  if (replyToMessage) {
    base.replyTo = replyToMessage;
  }

  ref.set({ ...base, ...payload }).finally(() => {
    sendingLock = false;
  });

  replyToMessage = null;
  replyBar.classList.add("hidden");
}
/*********************************************************
 * FIREBASE SANITY CHECK
 *********************************************************/
db.ref(".info/connected").on("value", snap => {
  if (!snap.val()) {
    console.warn("Firebase disconnected");
  }
});
/*********************************************************
 * SCROLL STABILITY
 *********************************************************/
messagesDiv.addEventListener("load", e => {
  if (e.target.tagName === "IMG" || e.target.tagName === "AUDIO") {
    scrollBottom();
  }
}, true);

