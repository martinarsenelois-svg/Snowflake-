// FIREBASE CONFIG
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

// CONFIG
const PASSWORD = "2382_BZ";
const ROOM = "snowflake_private_room";
const uid = "u_" + Math.random().toString(36).slice(2);
let disappearing = false;

// LOGIN
function login() {
  if (pass.value !== PASSWORD) {
    alert("Wrong password");
    return;
  }
  login.style.display = "none";
  chat.classList.remove("hidden");
  listen();
}

// SEND MESSAGE
function send() {
  if (!text.value.trim()) return;

  db.ref(ROOM).push({
    text: text.value,
    uid: uid,
    time: Date.now(),
    disappear: disappearing
  });

  text.value = "";
}

// LISTEN
function listen() {
  db.ref(ROOM).on("child_added", snap => {
    render(snap.key, snap.val());
  });

  db.ref(ROOM).on("child_removed", () => {
    messages.innerHTML = "";
  });
}

// RENDER MESSAGE
function render(id, msg) {
  const div = document.createElement("div");
  div.className = "msg " + (msg.uid === uid ? "me" : "other");

  div.innerHTML = `
    <div>${msg.text}</div>
    <div class="time">
      ${new Date(msg.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
      ${msg.uid === uid ? "✓✓" : ""}
    </div>
  `;

  // Delete for everyone
  div.ondblclick = () => {
    if (confirm("Delete for everyone?")) {
      db.ref(ROOM + "/" + id).remove();
    }
  };

  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;

  // Disappearing
  if (msg.disappear) {
    setTimeout(() => {
      db.ref(ROOM + "/" + id).remove();
    }, 10000);
  }
}

// EXTRAS
function toggleDisappear() {
  disappearing = !disappearing;
  alert("Disappearing mode: " + (disappearing ? "ON" : "OFF"));
}

function clearChat() {
  if (confirm("Delete entire chat for everyone?")) {
    db.ref(ROOM).remove();
    messages.innerHTML = "";
  }
}