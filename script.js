/* ====================================================== SNOWFLAKE PRIVATE CHAT — SCRIPT.JS Firebase v8 | 1-on-1 | Production-grade logic ====================================================== */

/********************* FIREBASE CONFIG *********************/ var firebaseConfig = { apiKey: "YOUR_API_KEY", authDomain: "YOUR_PROJECT.firebaseapp.com", databaseURL: "https://YOUR_PROJECT.firebaseio.com", projectId: "YOUR_PROJECT", storageBucket: "YOUR_PROJECT.appspot.com", messagingSenderId: "000000000", appId: "APP_ID" };

firebase.initializeApp(firebaseConfig); var db = firebase.database();

/********************* GLOBAL STATE *********************/ var state = { user: null, room: null, replyingTo: null, disappearing: false, snow: true, typingTimeout: null };

/********************* DOM REFERENCES *********************/ var loginScreen = document.getElementById('loginScreen'); var chatScreen = document.getElementById('chatScreen'); var loginBtn = document.getElementById('loginBtn'); var loginPassword = document.getElementById('loginPassword'); var loginName = document.getElementById('loginName'); var loginError = document.getElementById('loginError');

var messagesEl = document.getElementById('messages'); var messageInput = document.getElementById('messageInput'); var sendBtn = document.getElementById('sendBtn'); var replyBar = document.getElementById('replyBar'); var replyPreview = document.getElementById('replyPreview'); var cancelReply = document.getElementById('cancelReply'); var typingIndicator = document.getElementById('typingIndicator');

var themeToggle = document.getElementById('themeToggle'); var snowToggle = document.getElementById('snowToggle'); var openMenu = document.getElementById('openMenu'); var menu = document.getElementById('menu'); var clearChatBtn = document.getElementById('clearChatBtn'); var disappearToggle = document.getElementById('disappearToggle');

/********************* LOGIN LOGIC *********************/ loginBtn.onclick = function(){ var pass = loginPassword.value.trim(); var name = loginName.value.trim();

if(!pass || !name){ loginError.textContent = "Enter name and password"; return; }

state.user = name; state.room = btoa(pass); // simple obfuscation

loginScreen.classList.add('hidden'); chatScreen.classList.remove('hidden');

initPresence(); loadMessages(); };

/********************* MESSAGE SEND *********************/ sendBtn.onclick = sendMessage;

messageInput.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ sendMessage(); } sendTyping(); });

function sendMessage(){ var text = messageInput.value.trim(); if(!text) return;

var msgRef = db.ref('rooms/'+state.room+'/messages').push();

msgRef.set({ text: text, user: state.user, time: Date.now(), seen: false, reply: state.replyingTo || null, disappear: state.disappearing });

messageInput.value = ''; state.replyingTo = null; replyBar.classList.add('hidden'); }

/********************* LOAD MESSAGES *********************/ function loadMessages(){ var ref = db.ref('rooms/'+state.room+'/messages');

ref.on('child_added', function(snap){ renderMessage(snap.key, snap.val()); markSeen(snap.key, snap.val()); }); }

/********************* RENDER MESSAGE *********************/ function renderMessage(id, msg){ var div = document.createElement('div'); div.className = 'message ' + (msg.user === state.user ? 'me':'other'); div.dataset.id = id;

var content = document.createElement('div'); content.textContent = msg.text;

var meta = document.createElement('div'); meta.className = 'time'; meta.textContent = formatTime(msg.time);

if(msg.user === state.user){ var ticks = document.createElement('span'); ticks.className = 'ticks'; ticks.textContent = msg.seen ? '✓✓':'✓'; meta.appendChild(ticks); }

div.appendChild(content); div.appendChild(meta);

attachGestures(div, id, msg);

messagesEl.appendChild(div); messagesEl.scrollTop = messagesEl.scrollHeight;

if(msg.disappear){ setTimeout(function(){ db.ref('rooms/'+state.room+'/messages/'+id).remove(); }, 10000); } }

/********************* SEEN LOGIC *********************/ function markSeen(id, msg){ if(msg.user !== state.user && !msg.seen){ db.ref('rooms/'+state.room+'/messages/'+id+'/seen').set(true); } }

/********************* TIME FORMAT *********************/ function formatTime(ts){ var d = new Date(ts); return d.getHours()+":"+String(d.getMinutes()).padStart(2,'0'); }

/********************* REPLY / LONG PRESS *********************/ function attachGestures(el, id, msg){ var startX = 0;

el.addEventListener('touchstart', function(e){ startX = e.touches[0].clientX; });

el.addEventListener('touchmove', function(e){ var diff = e.touches[0].clientX - startX; if(diff < -60){ startReply(msg.text); } });

el.addEventListener('contextmenu', function(e){ e.preventDefault(); if(msg.user === state.user){ if(confirm('Delete for everyone?')){ db.ref('rooms/'+state.room+'/messages/'+id).remove(); } } }); }

function startReply(text){ state.replyingTo = text; replyPreview.textContent = text; replyBar.classList.remove('hidden'); }

cancelReply.onclick = function(){ state.replyingTo = null; replyBar.classList.add('hidden'); };

/********************* CLEAR CHAT *********************/ clearChatBtn.onclick = function(){ if(confirm('Clear chat for everyone?')){ db.ref('rooms/'+state.room+'/messages').remove(); messagesEl.innerHTML = ''; } };

/********************* DISAPPEARING MODE *********************/ disappearToggle.onclick = function(){ state.disappearing = !state.disappearing; disappearToggle.textContent = state.disappearing ? 'Disappearing ON':'Disappearing OFF'; };

/********************* PRESENCE & TYPING *********************/ function initPresence(){ var presRef = db.ref('rooms/'+state.room+'/presence/'+state.user); presRef.set(true); presRef.onDisconnect().remove();

db.ref('rooms/'+state.room+'/presence').on('value', function(snap){ var users = snap.val() || {}; var otherOnline = Object.keys(users).length > 1; document.getElementById('presenceText').textContent = otherOnline ? 'Online':'Offline'; }); }

function sendTyping(){ var ref = db.ref('rooms/'+state.room+'/typing/'+state.user); ref.set(true); clearTimeout(state.typingTimeout); state.typingTimeout = setTimeout(function(){ ref.remove(); }, 1500);

db.ref('rooms/'+state.room+'/typing').on('value', function(snap){ var val = snap.val() || {}; typingIndicator.textContent = Object.keys(val).length > 1 ? 'Typing…':''; }); }

/********************* THEME & SNOW *********************/ themeToggle.onclick = function(){ document.body.classList.toggle('dark'); };

snowToggle.onclick = function(){ state.snow = !state.snow; document.getElementById('snow').style.display = state.snow?'block':'none'; };

/********************* MENU *********************/ openMenu.onclick = function(){ menu.classList.toggle('hidden'); };

/********************* SNOW ENGINE *********************/ var canvas = document.getElementById('snow'); var ctx = canvas.getContext('2d'); var flakes = [];

function resize(){ canvas.width = innerWidth; canvas.height = innerHeight; } window.addEventListener('resize', resize); resize();

for(var i=0;i<120;i++){ flakes.push({ x:Math.random()*canvas.width, y:Math.random()*canvas.height, r:Math.random()*3+1, s:Math.random()*1+0.5 }); }

function snowLoop(){ ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillStyle='rgba(255,255,255,0.8)';

flakes.forEach(function(f){ ctx.beginPath(); ctx.arc(f.x,f.y,f.r,0,Math.PI*2); ctx.fill();

f.y+=f.s;
if(f.y>canvas.height){
  f.y=0;
  f.x=Math.random()*canvas.width;
}

});

requestAnimationFrame(snowLoop); }

snowLoop();
