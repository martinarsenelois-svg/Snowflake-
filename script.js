/* ---------- FIREBASE ---------- */
firebase.initializeApp({
  apiKey:"AIzaSyDWgauZPozTWUVuDGRaMCq2NgARt60p7wA",
  databaseURL:"https://snowflake-62c81-default-rtdb.europe-west1.firebasedatabase.app"
});
const db = firebase.database();

/* ---------- STATE ---------- */
const PASSWORD = "2382_BZ";
const uid = localStorage.uid || (localStorage.uid=Math.random().toString(36).slice(2));
const name = localStorage.name || (localStorage.name=prompt("Your name"));
let chatId = new URLSearchParams(location.search).get("chat") || uid;
let replyTo=null;

/* ---------- DOM ---------- */
const login=document.getElementById("login");
const chat=document.getElementById("chat");
const composer=document.querySelector(".composer");
const messages=document.getElementById("messages");
const input=document.getElementById("msgInput");
const send=document.getElementById("sendBtn");
const presence=document.getElementById("presence");

/* ---------- LOGIN ---------- */
document.getElementById("loginBtn").onclick=()=>{
  if(document.getElementById("password").value===PASSWORD){
    login.classList.add("hidden");
    chat.classList.remove("hidden");
    composer.classList.remove("hidden");
    initChat();
  } else {
    document.getElementById("loginError").textContent="Wrong password";
  }
};

/* ---------- CHAT ---------- */
function initChat(){
  const room=db.ref("chats/"+chatId);

  // presence
  db.ref("presence/"+uid).set({name,chatId,online:true});
  db.ref("presence/"+uid).onDisconnect().set({name,chatId,online:false,last:Date.now()});

  db.ref("presence").on("value",s=>{
    const v=Object.values(s.val()||{}).filter(u=>u.chatId===chatId&&u.online);
    presence.textContent=v.length+" online";
  });

  // receive
  room.limitToLast(200).on("child_added",s=>{
    render(s.key,s.val());
  });

  send.onclick=sendMsg;
  input.onkeydown=e=>e.key==="Enter"&&sendMsg();
}

function sendMsg(){
  if(!input.value.trim())return;
  db.ref("chats/"+chatId).push({
    text:input.value,
    uid,name,time:Date.now(),
    reply:replyTo
  });
  input.value="";
  replyTo=null;
}

/* ---------- RENDER ---------- */
function render(id,m){
  const el=document.createElement("div");
  el.className="msg "+(m.uid===uid?"me":"other");
  if(m.reply) el.innerHTML+=`<div class="meta">↪ ${m.reply.text}</div>`;
  el.innerHTML+=`<div>${m.text}</div>
    <div class="meta">${m.name}</div>`;
  messages.appendChild(el);
  messages.scrollTop=messages.scrollHeight;

  // swipe reply
  let x=0;
  el.ontouchstart=e=>x=e.touches[0].clientX;
  el.ontouchend=e=>{
    if(e.changedTouches[0].clientX-x>80){
      replyTo={text:m.text};
      document.getElementById("replyText").textContent=m.text;
      document.getElementById("replyBar").classList.remove("hidden");
    }
  };
}

/* ---------- THEME ---------- */
document.getElementById("themeToggle").onclick=()=>{
  document.body.classList.toggle("dark");
};