/****************************************************
 * SNOWFLAKE CHAT — FINAL JS (PART 1 / 4)
 * Core + Login + Presence + Admin
 ****************************************************/

/* ---------- FIREBASE ---------- */
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/* ---------- DOM ---------- */
const loginScreen = document.getElementById("loginScreen");
const chatScreen  = document.getElementById("chatScreen");

const nameInput = document.getElementById("nameInput");
const passwordInput = document.getElementById("passwordInput");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");

const messagesDiv = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

const typingIndicator = document.getElementById("typingIndicator");
const chatStatus = document.getElementById("chatStatus");
const themeToggle = document.getElementById("themeToggle");

const disappearSelect = document.getElementById("disappearSelect");
const clearChatBtn = document.getElementById("clearChatBtn");

const replyBar = document.getElementById("replyBar");
const replyText = document.getElementById("replyText");
const cancelReply = document.getElementById("cancelReply");

const msgMenu = document.getElementById("msgMenu");

/* ---------- STATE ---------- */
let myId = localStorage.getItem("sf_uid");
if (!myId) {
  myId = Math.random().toString(36).slice(2, 10);
  localStorage.setItem("sf_uid", myId);
}

let myName = localStorage.getItem("sf_name") || "";
let chatId = null;
let adminId = null;
let isAdmin = false;

let replyToMessage = null;
let selectedMsgId = null;
let selectedMsgData = null;

/* ---------- HELPERS ---------- */
function hashPassword(pw) {
  let h = 0;
  for (let i = 0; i < pw.length; i++) {
    h = ((h << 5) - h) + pw.charCodeAt(i);
    h |= 0;
  }
  return "chat_" + Math.abs(h);
}

function esc(str = "") {
  return str.replace(/[&<>"']/g, m =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[m])
  );
}

function scrollBottom() {
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

/* ---------- LOGIN ---------- */
if (myName) nameInput.value = myName;

loginBtn.onclick = () => {
  const name = nameInput.value.trim();
  const pass = passwordInput.value.trim();

  if (!name || !pass) {
    loginError.textContent = "Enter name & password";
    return;
  }

  myName = name;
  localStorage.setItem("sf_name", name);

  chatId = hashPassword(pass);
  enterChat();
};

function enterChat() {
  loginScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");

  setupPresence();
  setupAdmin();

  listenPresence();
}

/* ---------- PRESENCE ---------- */
function setupPresence() {
  const uref = db.ref("users/" + myId);
  uref.set({
    name: myName,
    online: true,
    lastSeen: Date.now(),
    chatId: chatId
  });

  uref.onDisconnect().update({
    online: false,
    lastSeen: Date.now()
  });

  const cref = db.ref(`chats/${chatId}/users/${myId}`);
  cref.set(true);
  cref.onDisconnect().remove();
}

function listenPresence() {
  db.ref(`chats/${chatId}/users`).on("value", snap => {
    const users = snap.val() || {};
    const others = Object.keys(users).filter(id => id !== myId);

    if (!others.length) {
      chatStatus.textContent = "waiting…";
      return;
    }

    db.ref("users/" + others[0]).on("value", s => {
      const u = s.val();
      if (!u) return;
      chatStatus.textContent = u.online
        ? "online"
        : "last seen " + new Date(u.lastSeen).toLocaleTimeString();
    });
  });
}

/* ---------- ADMIN ---------- */
function setupAdmin() {
  const aref = db.ref(`chats/${chatId}/admin`);
  aref.transaction(cur => cur || myId, () => {
    aref.once("value", s => {
      adminId = s.val();
      isAdmin = adminId === myId;

      disappearSelect.disabled = !isAdmin;
      clearChatBtn.style.display = isAdmin ? "inline" : "none";
    });
  });
}

/* PART 1 END */

/****************************************************
 * SNOWFLAKE CHAT — FINAL JS (PART 2 / 4)
 * Messaging + Ticks + Disappearing
 ****************************************************/

/* ---------- MESSAGE LISTENERS ---------- */
function listenMessages() {
  const ref = db.ref(`chats/${chatId}/messages`);

  ref.on("child_added", snap => {
    renderMessage(snap.key, snap.val());
  });

  ref.on("child_changed", snap => {
    const el = document.getElementById("msg_" + snap.key);
    if (el) updateTicks(el, snap.val());
  });

  ref.on("child_removed", snap => {
    const el = document.getElementById("msg_" + snap.key);
    if (el) el.remove();
  });
}

/* ---------- RENDER MESSAGE ---------- */
function renderMessage(msgId, msg) {
  const mine = msg.from === myId;

  const div = document.createElement("div");
  div.className = "message " + (mine ? "me" : "other");
  div.id = "msg_" + msgId;

  if (msg.deletedForAll) {
    div.innerHTML = "<i>🚫 Message deleted</i>";
    messagesDiv.appendChild(div);
    scrollBottom();
    return;
  }

  let html = "";

  /* Reply preview */
  if (msg.replyTo) {
    html += `
      <div class="reply-preview">
        <small>${esc(msg.replyTo.from)}</small>
        <div>${esc(msg.replyTo.text)}</div>
      </div>`;
  }

  /* Content */
  if (msg.type === "image") {
    html += `<img src="${msg.fileData}">`;
  } else if (msg.type === "audio") {
    html += `<audio controls src="${msg.fileData}"></audio>`;
  } else {
    html += esc(msg.text);
  }

  /* Meta */
  html += `
    <div class="meta">
      <span>${new Date(msg.time).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })}</span>
      ${mine ? `<span class="ticks"></span>` : ""}
    </div>
  `;

  div.innerHTML = html;
  messagesDiv.appendChild(div);
  scrollBottom();

  /* Delivery + Seen */
  if (!mine) {
    const mref = db.ref(`chats/${chatId}/messages/${msgId}`);
    mref.child(`deliveredTo/${myId}`).set(Date.now());
    mref.child(`seenBy/${myId}`).set(Date.now());
  }

  applyDisappearing(msgId, msg.time);
}

/* ---------- TICK ACCURACY ---------- */
function updateTicks(el, msg) {
  const t = el.querySelector(".ticks");
  if (!t) return;

  const deliveredCount = msg.deliveredTo
    ? Object.keys(msg.deliveredTo).length
    : 0;

  const seenCount = msg.seenBy
    ? Object.keys(msg.seenBy).length
    : 0;

  if (seenCount > 1) {
    t.textContent = "✔✔";
  } else if (deliveredCount > 1) {
    t.textContent = "✔";
  } else {
    t.textContent = "";
  }
}

/* ---------- SEND TEXT ---------- */
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

/* ---------- CORE SEND ---------- */
function sendMessage(payload) {
  const ref = db.ref(`chats/${chatId}/messages`).push();

  ref.set({
    from: myId,
    name: myName,
    time: Date.now(),
    deliveredTo: {},
    seenBy: {},
    replyTo: replyToMessage,
    ...payload
  });

  replyToMessage = null;
  replyBar.classList.add("hidden");
}

/* ---------- DISAPPEARING ---------- */
function applyDisappearing(msgId, msgTime) {
  db.ref(`chats/${chatId}/disappear`).once("value", snap => {
    const seconds = snap.val();
    if (!seconds || seconds <= 0) return;

    const remaining = (seconds * 1000) - (Date.now() - msgTime);
    if (remaining <= 0) {
      db.ref(`chats/${chatId}/messages/${msgId}`)
        .update({ deletedForAll: true });
    } else {
      setTimeout(() => {
        db.ref(`chats/${chatId}/messages/${msgId}`)
          .update({ deletedForAll: true });
      }, remaining);
    }
  });
}

/* START MESSAGE LISTENING AFTER LOGIN */
function startChatListeners() {
  listenMessages();
}

/* Call after admin setup */
setTimeout(() => {
  if (chatId) startChatListeners();
}, 300);

/* PART 2 END */
/****************************************************
 * SNOWFLAKE CHAT — FINAL JS (PART 3 / 4)
 * Swipe Reply + Long Press + Delete
 ****************************************************/

/* ---------- MESSAGE INTERACTIONS ---------- */
function attachMessageEvents(el, msgId, msgData) {
  let startX = 0;
  let startTime = 0;
  let longPressTimer = null;

  /* ----- TOUCH START ----- */
  el.addEventListener("touchstart", e => {
    startX = e.touches[0].clientX;
    startTime = Date.now();

    longPressTimer = setTimeout(() => {
      openMsgMenu(msgId, msgData);
    }, 450);
  });

  /* ----- TOUCH MOVE ----- */
  el.addEventListener("touchmove", e => {
    const dx = e.touches[0].clientX - startX;
    if (Math.abs(dx) > 25) clearTimeout(longPressTimer);
  });

  /* ----- TOUCH END ----- */
  el.addEventListener("touchend", e => {
    clearTimeout(longPressTimer);
    const dx = e.changedTouches[0].clientX - startX;
    const dt = Date.now() - startTime;

    /* Swipe left to reply */
    if (dx < -40 && dt < 500) {
      startReply(msgId, msgData);
    }
  });
}

/* ---------- OVERRIDE RENDER TO ATTACH EVENTS ---------- */
const _renderMessageOriginal = renderMessage;
renderMessage = function (msgId, msg) {
  _renderMessageOriginal(msgId, msg);
  const el = document.getElementById("msg_" + msgId);
  if (el) attachMessageEvents(el, msgId, msg);
};

/* ---------- REPLY ---------- */
function startReply(msgId, msg) {
  replyToMessage = {
    id: msgId,
    from: msg.name,
    text: msg.text || (msg.type === "image" ? "📷 Image" : "🎤 Audio")
  };

  replyText.textContent = replyToMessage.text;
  replyBar.classList.remove("hidden");
  messageInput.focus();
}

cancelReply.onclick = () => {
  replyToMessage = null;
  replyBar.classList.add("hidden");
};

/* ---------- MESSAGE MENU ---------- */
function openMsgMenu(msgId, msg) {
  selectedMsgId = msgId;
  selectedMsgData = msg;

  msgMenu.classList.add("show");

  document.getElementById("menuReply").onclick = () => {
    closeMsgMenu();
    startReply(msgId, msg);
  };

  document.getElementById("menuDeleteMe").onclick = () => {
    closeMsgMenu();
    document.getElementById("msg_" + msgId)?.remove();
  };

  document.getElementById("menuDeleteAll").onclick = () => {
    closeMsgMenu();
    if (!isAdmin && msg.from !== myId) {
      alert("Only sender or admin can delete for everyone");
      return;
    }
    db.ref(`chats/${chatId}/messages/${msgId}`)
      .update({ deletedForAll: true });
  };
}

/* ---------- CLOSE MENU ---------- */
function closeMsgMenu() {
  msgMenu.classList.remove("show");
}

document.addEventListener("click", e => {
  if (!msgMenu.contains(e.target)) closeMsgMenu();
});

/* PART 3 END */
/****************************************************
 * SNOWFLAKE CHAT — FINAL JS (PART 4 / 4)
 * Disappearing + Clear Chat + Accurate Ticks
 ****************************************************/

/* ================= TICK ACCURACY FIX ================= */

/*
✔ Sent     = message exists
✔✔ Delivered = other user joined chat
✔✔ Blue    = other user opened chat (seen)
*/

function updateTicks(msgId, msg) {
  const el = document.getElementById("msg_" + msgId);
  if (!el) return;

  const tickSpan = el.querySelector(".ticks");
  if (!tickSpan) return;

  const deliveredCount = msg.deliveredTo
    ? Object.keys(msg.deliveredTo).length
    : 0;
  const seenCount = msg.seenBy
    ? Object.keys(msg.seenBy).length
    : 0;

  if (seenCount > 0) {
    tickSpan.textContent = "✔✔";
    tickSpan.classList.add("seen");
  } else if (deliveredCount > 0) {
    tickSpan.textContent = "✔✔";
  } else {
    tickSpan.textContent = "✔";
  }
}

/* ================= DISAPPEARING MESSAGES ================= */

const DISAPPEAR_TIME = 60 * 1000; // 1 minute

function handleDisappearing(msgId, msg) {
  if (!msg.disappear) return;

  const remaining = msg.expireAt - Date.now();
  if (remaining <= 0) {
    db.ref(`chats/${chatId}/messages/${msgId}`).remove();
  } else {
    setTimeout(() => {
      db.ref(`chats/${chatId}/messages/${msgId}`).remove();
    }, remaining);
  }
}

/* Extend render */
const _renderOriginal2 = renderMessage;
renderMessage = function (msgId, msg) {
  _renderOriginal2(msgId, msg);
  handleDisappearing(msgId, msg);
};

/* Enable disappear toggle (admin only) */
let disappearEnabled = false;

document.getElementById("exportChatBtn").onclick = () => {
  if (!isAdmin) {
    alert("Only admin can toggle disappearing messages");
    return;
  }
  disappearEnabled = !disappearEnabled;
  alert(
    disappearEnabled
      ? "Disappearing messages ON (1 min)"
      : "Disappearing messages OFF"
  );
};

/* ================= CLEAR CHAT FOR EVERYONE ================= */

function clearChatForEveryone() {
  if (!isAdmin) {
    alert("Admin only");
    return;
  }
  if (!confirm("Clear chat for everyone?")) return;

  db.ref(`chats/${chatId}/messages`).remove();
}

document.getElementById("chatName").onclick = clearChatForEveryone;

/* ================= SEND MESSAGE EXTENSION ================= */

const _sendMessageOriginal = sendMessage;
sendMessage = function (payload) {
  const ref = db.ref(`chats/${chatId}/messages`).push();

  const base = {
    from: myId,
    name: myName,
    time: Date.now(),
    deliveredTo: {},
    seenBy: {}
  };

  if (replyToMessage) base.replyTo = replyToMessage;

  if (disappearEnabled) {
    base.disappear = true;
    base.expireAt = Date.now() + DISAPPEAR_TIME;
  }

  ref.set({ ...base, ...payload });

  replyToMessage = null;
  replyBar.classList.add("hidden");
};

/* ================= TYPING INDICATOR ================= */

messageInput.addEventListener("input", () => {
  const ref = db.ref(`chats/${chatId}/typing/${myId}`);
  ref.set(myName);

  clearTimeout(window._typingTimer);
  window._typingTimer = setTimeout(() => {
    ref.remove();
  }, 1200);
});

function listenTyping() {
  const ref = db.ref(`chats/${chatId}/typing`);
  ref.on("value", snap => {
    const data = snap.val() || {};
    const names = Object.values(data).filter(n => n !== myName);
    typingIndicator.textContent = names.length
      ? names[0] + " is typing..."
      : "";
  });
}

/* ================= THEME TOGGLE (FIXED) ================= */

themeToggle.onclick = () => {
  document.body.classList.toggle("dark");
  localStorage.setItem(
    "sf_theme",
    document.body.classList.contains("dark") ? "dark" : "light"
  );
};

if (localStorage.getItem("sf_theme") === "dark") {
  document.body.classList.add("dark");
}

/* ================= MOBILE KEYBOARD FIX ================= */

messageInput.addEventListener("focus", () => {
  setTimeout(() => {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }, 300);
});

/* ================= FIREBASE CONNECTION WATCH ================= */

db.ref(".info/connected").on("value", snap => {
  if (!snap.val()) {
    console.warn("Firebase disconnected");
  }
});

/* ================= FINAL SAFETY ================= */

window.addEventListener("beforeunload", () => {
  db.ref("users/" + myId + "/online").set(false);
});

/* ======== END OF SCRIPT.JS ======== */

