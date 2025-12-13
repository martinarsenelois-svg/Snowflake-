// ================= FIREBASE SETUP =================

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

// ================= CONSTANTS =================

const ROOM_PASSWORD = "2382_BZ";
const ROOM_PATH = "snowflake_private_room";
const USER_ID = "user_" + Math.random().toString(36).slice(2);

let disappearingEnabled = false;

// ================= DOM REFERENCES =================

const loginScreen = document.getElementById("loginScreen");
const chatScreen = document.getElementById("chatScreen");

const passwordInput = document.getElementById("passwordInput");
const loginButton = document.getElementById("loginButton");

const messageList = document.getElementById("messageList");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");

const toggleDisappearBtn = document.getElementById("toggleDisappear");
const clearChatBtn = document.getElementById("clearChatBtn");

// ================= LOGIN =================

loginButton.addEventListener("click", () => {
  const entered = passwordInput.value.trim();

  if (!entered) {
    alert("Please enter the password.");
    return;
  }

  if (entered !== ROOM_PASSWORD) {
    alert("Incorrect password.");
    return;
  }

  loginScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");

  startListening();
});

// ================= SEND MESSAGE =================

sendButton.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", e => {
  if (e.key === "Enter") sendMessage();
});

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  const msg = {
    text,
    sender: USER_ID,
    timestamp: Date.now(),
    disappear: disappearingEnabled
  };

  db.ref(ROOM_PATH).push(msg);
  messageInput.value = "";
}

// ================= RECEIVE MESSAGES =================

function startListening() {
  db.ref(ROOM_PATH).on("child_added", snap => {
    renderMessage(snap.key, snap.val());
  });

  db.ref(ROOM_PATH).on("child_removed", () => {
    messageList.innerHTML = "";
  });
}

// ================= RENDER =================

function renderMessage(id, msg) {
  const div = document.createElement("div");
  div.className = "message " + (msg.sender === USER_ID ? "me" : "other");

  const time = new Date(msg.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  div.innerHTML = `
    <div class="message-text">${msg.text}</div>
    <div class="message-time">${time}${msg.sender === USER_ID ? " ✓✓" : ""}</div>
  `;

  div.addEventListener("dblclick", () => {
    if (confirm("Delete this message for everyone?")) {
      db.ref(ROOM_PATH + "/" + id).remove();
    }
  });

  messageList.appendChild(div);
  messageList.scrollTop = messageList.scrollHeight;

  if (msg.disappear) {
    setTimeout(() => {
      db.ref(ROOM_PATH + "/" + id).remove();
    }, 10000);
  }
}

// ================= EXTRAS =================

toggleDisappearBtn.addEventListener("click", () => {
  disappearingEnabled = !disappearingEnabled;
  alert("Disappearing messages: " + (disappearingEnabled ? "ON" : "OFF"));
});

clearChatBtn.addEventListener("click", () => {
  if (confirm("Delete entire chat for everyone?")) {
    db.ref(ROOM_PATH).remove();
    messageList.innerHTML = "";
  }
});