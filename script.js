/* ================= FIREBASE ================= */
firebase.initializeApp({
  apiKey:"AIzaSyDWgauZPozTWUVuDGRaMCq2NgARt60p7wA",
  databaseURL:"https://snowflake-62c81-default-rtdb.europe-west1.firebasedatabase.app"
});
const db = firebase.database();

/* ================= STATE ================= */
const PASSWORD="2382_BZ";
const uid=localStorage.sf_uid||(localStorage.sf_uid=Math.random().toString(36).slice(2));
let name=localStorage.sf_name||"";
let chatId=new URLSearchParams(location.search).get("chat")||uid;
let replyTo=null;
let defaultTTL=parseInt(localStorage.sf_ttl||"0",10);
let isConverting=false;

/* ================= DOM ================= */
const login=document.getElementById("login");
const chat=document.getElementById("chat");
const composer=document.querySelector(".composer");
const messages=document.getElementById("messages");
const input=document.getElementById("msgInput");
const send=document.getElementById("send");
const typingDiv=document.getElementById("typing");
const presence=document.getElementById("presence");

/* ================= LOGIN ================= */
document.getElementById("loginBtn").onclick=()=>{
  if(document.getElementById("password").value!==PASSWORD){
    document.getElementById("loginError").innerText="Wrong password";
    return;
  }
  if(!name){
    name=document.getElementById("nameInput").value.trim();
    if(!name) return alert("Enter name");
    localStorage.sf_name=name;
  }
  startChat();
};

document.getElementById("saveName").onclick=()=>{
  const v=document.getElementById("nameInput").value.trim();
  if(v){name=v;localStorage.sf_name=v;}
};

/* ================= CHAT INIT ================= */
function startChat(){
  login.classList.add("hidden");
  chat.classList.remove("hidden");
  composer.classList.remove("hidden");

  const room=db.ref("chats/"+chatId);

  // presence
  db.ref("presence/"+uid).set({name,chatId,online:true});
  db.ref("presence/"+uid).onDisconnect().set({name,chatId,online:false,last:Date.now()});

  db.ref("presence").on("value",s=>{
    const arr=Object.values(s.val()||{}).filter(u=>u.chatId===chatId&&u.online);
    presence.innerText=arr.length+" online";
  });

  // messages
  room.on("child_added",snap=>{
    renderMessage(snap.key,snap.val());
  });

  // typing
  input.oninput=()=>{
    db.ref("typing/"+chatId+"/"+uid).set(Date.now());
    db.ref("typing/"+chatId+"/"+uid).onDisconnect().remove();
  };

  db.ref("typing/"+chatId).on("value",s=>{
    const v=s.val()||{};
    const others=Object.keys(v).filter(k=>k!==uid);
    typingDiv.innerText=others.length? "Typing…" : "";
  });
}

/* ================= SEND ================= */
send.onclick=sendMessage;
input.onkeydown=e=>e.key==="Enter"&&sendMessage();

function sendMessage(){
  if(isConverting||!input.value.trim())return;
  const msg={
    senderId:uid,
    sender:name,
    text:input.value,
    time:Date.now(),
    ttl:defaultTTL,
    reply:replyTo,
    reactions:{}
  };
  db.ref("chats/"+chatId).push(msg);
  input.value="";
  replyTo=null;
}

/* ================= RENDER ================= */
function renderMessage(id,m){
  if(m.deletedForAll){
    const t=document.createElement("div");
    t.className="msg other";
    t.innerText="❌ Message deleted";
    messages.appendChild(t);
    return;
  }

  const el=document.createElement("div");
  el.className="msg "+(m.senderId===uid?"me":"other");

  if(m.reply){
    el.innerHTML+=`<div class="meta">↪ ${m.reply.text}</div>`;
  }

  if(m.fileData){
    if(m.fileType.startsWith("image")){
      el.innerHTML+=`<img src="${m.fileData}" style="max-width:200px">`;
    }else if(m.fileType.startsWith("audio")){
      el.innerHTML+=`<audio controls src="${m.fileData}"></audio>`;
    }else{
      el.innerHTML+=`<a download="${m.fileName}" href="${m.fileData}">📎 ${m.fileName}</a>`;
    }
  }

  if(m.text) el.innerHTML+=`<div>${m.text}</div>`;

  const reacts=document.createElement("div");
  reacts.className="reactions";
  ["❤️","😂","❄️"].forEach(r=>{
    const s=document.createElement("span");
    s.innerText=r;
    s.onclick=()=>toggleReaction(id,r);
    reacts.appendChild(s);
  });
  el.appendChild(reacts);

  el.innerHTML+=`<div class="meta">${m.sender}</div>`;
  messages.appendChild(el);
  messages.scrollTop=messages.scrollHeight;

  // TTL
  if(m.ttl>0){
    setTimeout(()=>db.ref("chats/"+chatId+"/"+id).remove(),m.ttl*60000);
  }
}

/* ================= REACTIONS ================= */
function toggleReaction(id,r){
  const ref=db.ref("chats/"+chatId+"/"+id+"/reactions/"+r+"/"+uid);
  ref.once("value").then(s=>{
    if(s.exists()) ref.remove();
    else ref.set(true);
  });
}

/* ================= SNOW ================= */
const canvas=document.getElementById("snow");
const ctx=canvas.getContext("2d");
let W=canvas.width=innerWidth,H=canvas.height=innerHeight;
const flakes=[...Array(150)].map(()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*3+1,d:Math.random()*2}));
setInterval(()=>{
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle="rgba(255,255,255,.8)";
  ctx.beginPath();
  flakes.forEach(f=>{
    ctx.moveTo(f.x,f.y);
    ctx.arc(f.x,f.y,f.r,0,Math.PI*2);
    f.y+=f.d;if(f.y>H){f.y=0;f.x=Math.random()*W;}
  });
  ctx.fill();
},33);