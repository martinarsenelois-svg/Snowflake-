firebase.initializeApp({
  apiKey:"YOUR_KEY",
  authDomain:"YOUR_DOMAIN",
  databaseURL:"YOUR_DB",
  projectId:"YOUR_PROJECT"
});

const db = firebase.database();
const CHAT = db.ref("chat");
const PRES = db.ref("presence");
const TYPING = db.ref("typing");

const PASSWORD = "2382_BZ";
const TTL_MIN = 5;

const el = id => document.getElementById(id);

let myId = localStorage.getItem("sf_id") || crypto.randomUUID();
localStorage.setItem("sf_id", myId);

let myName = "";
let replyMeta = null;

el("loginBtn").onclick = () => {
  if (el("passInput").value !== PASSWORD) {
    el("loginError").textContent = "Wrong password";
    return;
  }

  myName = el("nameInput").value || "User";
  el("login").classList.add("hidden");
  el("chat").classList.remove("hidden");

  PRES.child(myId).set({ name: myName, online: true });
  PRES.child(myId).onDisconnect().remove();

  listen();
};

PRES.on("value", s => {
  const online = Object.keys(s.val() || {}).length > 1;
  el("status").textContent = online ? "online" : "offline";
});

el("messageInput").oninput = () => {
  TYPING.child(myId).set(true);
  setTimeout(() => TYPING.child(myId).remove(), 1500);
};

TYPING.on("value", s => {
  const typing = Object.keys(s.val() || {}).some(id => id !== myId);
  if (typing) el("status").textContent = "typing…";
});

function listen() {
  CHAT.on("child_added", snap => {
    const m = snap.val();
    if (m.expiresAt && Date.now() > m.expiresAt) {
      CHAT.child(snap.key).remove();
      return;
    }
    render(m, snap.key);
  });
}

el("composer").onsubmit = e => {
  e.preventDefault();
  const text = el("messageInput").value.trim();
  if (!text) return;
  send({ type: "text", text });
};

function send(data) {
  CHAT.push({
    senderId: myId,
    senderName: myName,
    time: Date.now(),
    expiresAt: Date.now() + TTL_MIN * 60000,
    reply: replyMeta,
    deleted: false,
    ...data
  });
  replyMeta = null;
  el("replyBar").classList.add("hidden");
  el("messageInput").value = "";
}

el("attachBtn").onclick = () => el("fileInput").click();

el("fileInput").onchange = () => {
  const f = el("fileInput").files[0];
  if (!f) return;
  if (f.size > 800 * 1024) return alert("File too large");

  const r = new FileReader();
  r.onload = () => send({ type: "image", data: r.result });
  r.readAsDataURL(f);
};

let recorder, chunks = [];
el("micBtn").onclick = async () => {
  if (recorder?.state === "recording") {
    recorder.stop();
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recorder = new MediaRecorder(stream);
  chunks = [];
  recorder.ondataavailable = e => chunks.push(e.data);
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: "audio/webm" });
    const r = new FileReader();
    r.onload = () => send({ type: "audio", data: r.result });
    r.readAsDataURL(blob);
  };
  recorder.start();
};

function render(m, id) {
  const d = document.createElement("div");
  d.className = "msg " + (m.senderId === myId ? "me" : "other");

  if (m.deleted) {
    d.textContent = "This message was deleted";
  } else {
    if (m.reply) {
      const r = document.createElement("div");
      r.className = "reply-preview";
      r.textContent = m.reply.preview;
      d.appendChild(r);
    }

    if (m.type === "text") d.append(m.text);
    if (m.type === "image") {
      const i = document.createElement("img");
      i.src = m.data;
      d.appendChild(i);
    }
    if (m.type === "audio") {
      const a = document.createElement("audio");
      a.controls = true;
      a.src = m.data;
      d.appendChild(a);
    }
  }

  d.oncontextmenu = e => {
    e.preventDefault();
    if (m.senderId === myId && !m.deleted) {
      if (confirm("Delete for everyone?")) {
        CHAT.child(id).update({ deleted: true });
      }
    }
  };

  d.onclick = () => {
    replyMeta = {
      preview: m.type === "text" ? m.text : m.type
    };
    el("replyPreview").textContent = replyMeta.preview;
    el("replyBar").classList.remove("hidden");
  };

  el("messages").appendChild(d);
  el("messages").scrollTop = el("messages").scrollHeight;
}

el("cancelReply").onclick = () => el("replyBar").classList.add("hidden");