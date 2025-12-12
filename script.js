// ---------------- FIREBASE ----------------
// YOUR PROVIDED config (keeps the project ready-to-upload)
var firebaseConfig = {
  apiKey: "AIzaSyDWgauZPozTWUVuDGRaMCq2NgARt60p7wA",
  authDomain: "snowflake-62c81.firebaseapp.com",
  databaseURL: "https://snowflake-62c81-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "snowflake-62c81",
  storageBucket: "snowflake-62c81.appspot.com",
  messagingSenderId: "248778051768",
  appId: "1:248778051768:web:5deffaea7073f9ddc2644d",
  measurementId: "G-S76HLPKWXB"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ---------------- STATE ----------------
const PASSWORD = "2382_BZ";
let username = localStorage.getItem('sf_name') || null;
let myId = localStorage.getItem('sf_id') || (Math.random().toString(36).slice(2,9));
localStorage.setItem('sf_id', myId);
let defaultTTL = parseInt(localStorage.getItem('sf_ttl')||'0',10);
let snowEnabled = (localStorage.getItem('sf_snow')!=='false');
let isRecording = false;
let recorder, audioChunks = [];
let isConverting = false;
let isLoggedIn = false;

// Max file size (bytes) for base64 write - keep safe for DB usage
const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3 MB

// ---------------- DOM ----------------
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const settings = document.getElementById('settings');
const pwEnter = document.getElementById('pwEnter');
const loginPass = document.getElementById('loginPass');
const loginError = document.getElementById('loginError');
const nameInput = document.getElementById('nameInput');
const saveNameBtn = document.getElementById('saveName');
const createLinkBtn = document.getElementById('createLink');
const linkOut = document.getElementById('linkOut');
const messagesDiv = document.getElementById('messages');
const msgInput = document.getElementById('msg');
const sendBtn = document.getElementById('send');
const typingIndicator = document.getElementById('typingIndicator');
const attachBtn = document.getElementById('attach');
const fileInput = document.getElementById('fileInput');
const recordBtn = document.getElementById('record');
const themeBtn = document.getElementById('theme-toggle');
const openSettingsBtn = document.getElementById('open-settings');
const defaultTTLSelect = document.getElementById('defaultTTL');
const snowToggle = document.getElementById('snowToggle');
const logoutBtn = document.getElementById('logout');
const clearAdminBtn = document.getElementById('clear-chat-admin');
const toggleSnowTop = document.getElementById('toggle-snow');
const loaderEl = document.getElementById('loader');

if(username) nameInput.value = username;
defaultTTLSelect.value = String(defaultTTL);
if(snowToggle) snowToggle.checked = snowEnabled;
if(toggleSnowTop) toggleSnowTop.addEventListener('click', ()=>{ snowEnabled = !snowEnabled; localStorage.setItem('sf_snow', snowEnabled); document.getElementById('snow').style.display = snowEnabled ? 'block' : 'none'; });
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token') || null;

// Small helpers
function showLoader(show){
  if(!loaderEl) return;
  loaderEl.style.display = show ? 'block' : 'none';
}
function showToast(msg){
  // simple non-blocking error display
  showLoader(false);
  if(loaderEl){ loaderEl.innerText = msg; loaderEl.style.display = 'block'; setTimeout(()=>{ loaderEl.style.display='none'; loaderEl.innerText='Uploading…'; }, 2000); }
  else alert(msg);
  console.log('[toast]', msg);
}

// ---------------- LOGIN FLOW ----------------
pwEnter.addEventListener('click', ()=> {
  const pass = loginPass.value;
  if(pass === PASSWORD){
    loginError.innerText = '';
    if(!username) {
      username = prompt('Enter your name:') || ('User'+myId);
      localStorage.setItem('sf_name', username);
      nameInput.value = username;
    }
    showChat();
  } else {
    loginError.innerText = 'Wrong password ❌';
  }
});

// name save & link create
saveNameBtn.addEventListener('click', ()=>{
  const v = nameInput.value.trim();
  if(!v) return showToast('Enter a name');
  username = v; localStorage.setItem('sf_name', username);
  showToast('Saved name: ' + username);
});
createLinkBtn.addEventListener('click', ()=>{
  if(!username) return showToast('Save name first');
  const t = Math.random().toString(36).slice(2,10);
  db.ref('users/'+t).set({name:username, created:Date.now()}).catch(err=>{
    console.error('createLink error', err); showToast('Failed to create link');
  });
  const l = window.location.origin + window.location.pathname + '?token='+t;
  linkOut.value = l; linkOut.select();
});

// auto-login using token or saved name
if(token){
  db.ref('users/'+token).once('value').then(snap=>{
    const d = snap.val();
    if(d && d.name){ username = d.name; localStorage.setItem('sf_name', username); nameInput.value = username;}
    showChat();
  }).catch((e)=>{ console.warn('token lookup failed', e); showChat(); });
} else if(username){
  // don't automatically start listeners yet; showChat will call start
  // but allow UX: show login screen until user enters password
}

// show/hide chat after login
function showChat(){
  // set flag so listeners (if any) can use it
  isLoggedIn = true;
  loginScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
  settings.classList.add('hidden');
  msgInput.focus();

  // presence (best-effort)
  try {
    db.ref('presence/'+myId).set({name:username, online:true, last:Date.now()});
    db.ref('presence/'+myId).onDisconnect().set({name:username, online:false, last:Date.now()});
  } catch(e){ console.warn('presence not set', e); }

  // start the message listeners & realtime features now
  startRealtime();
}

// ---------------- REALTIME START (only called once after login) ----------------
let realtimeStarted = false;
function startRealtime(){
  if(realtimeStarted) return;
  realtimeStarted = true;

  // presence counter
  db.ref('presence').on('value', snap=>{
    const p = snap.val() || {};
    const arr = Object.values(p).filter(u=>u && u.online);
    const onlineCount = arr.length;
    document.querySelector('.title').innerText = `❄️ Snowflake Chat (${onlineCount} online)`;
  });

  // typing presence
  msgInput.addEventListener('input', ()=>{
    try {
      db.ref('typing/'+myId).set({name:username, time:Date.now()});
      db.ref('typing/'+myId).onDisconnect().remove();
    } catch(e){ console.warn('typing set failed', e); }
  });
  db.ref('typing').on('value', snap=>{
    const val = snap.val() || {};
    const otherKeys = Object.keys(val || {}).filter(k=>k!==myId);
    if(otherKeys.length>0){
      const person = val[otherKeys[0]].name || 'Someone';
      typingIndicator.innerText = `${person} is typing...`;
    } else typingIndicator.innerText = '';
  });
  // clean old typing entries
  setInterval(()=> {
    db.ref('typing').once('value').then(snap=>{
      const d = snap.val() || {};
      Object.keys(d).forEach(k=>{
        if(Date.now() - d[k].time > 3000) db.ref('typing/'+k).remove().catch(()=>{});
      });
    }).catch(()=>{});
  }, 3000);

  // messages
  db.ref('snowflakechat').on('child_added', snap=>{
    if(!isLoggedIn) return; // safety guard
    const dataRaw = snap.val() || {};
    const id = dataRaw.id || snap.key;
    if(!dataRaw.id) db.ref('snowflakechat/'+snap.key+'/id').set(id).catch(()=>{});
    const data = Object.assign({}, dataRaw, {id});
    renderMessage(data); // render on arrival
    // mark delivered
    try {
      const delivered = data.deliveredTo || {};
      delivered[myId] = Date.now();
      db.ref('snowflakechat/'+id+'/deliveredTo').set(delivered).catch(()=>{});
    } catch(e){ console.warn('delivered update failed', e); }
    // schedule TTL deletion client-side
    if(data.ttl && data.ttl>0){
      setTimeout(()=>{ db.ref('snowflakechat/'+id).remove().catch(()=>{}); }, data.ttl*60*1000);
    }
  });

  db.ref('snowflakechat').on('child_changed', snap=>{
    if(!isLoggedIn) return;
    const dataRaw = snap.val() || {};
    const id = dataRaw.id || snap.key;
    const data = Object.assign({}, dataRaw, {id});
    refreshMessageUI(data);
  });

  db.ref('snowflakechat').on('child_removed', snap=>{
    if(!isLoggedIn) return;
    const id = snap.key;
    const el = document.getElementById('msg_'+id);
    if(el) el.remove();
  });

  // presence listener already set above
}

// ---------------- PRESENCE (simple) ----------------
db.ref('presence').once('value').then(()=>{}).catch(()=>{});

// ---------------- SEND MESSAGE ----------------
sendBtn.addEventListener('click', ()=> sendMessage());
msgInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') sendMessage(); });

async function sendMessage(textOverride, fileMeta){
  if(isConverting) return showToast('Please wait; conversion in progress');
  const text = (textOverride !== undefined) ? textOverride : msgInput.value.trim();
  if(!text && !fileMeta) return;
  const focusedBefore = document.activeElement === msgInput;
  const ref = db.ref('snowflakechat').push();
  const payload = {
    id: ref.key,
    sender: username,
    senderId: myId,
    text: text || '',
    time: Date.now(),
    deliveredTo: {},
    seenBy: {},
    ttl: fileMeta && fileMeta.ttl!==undefined ? fileMeta.ttl : defaultTTL || 0
  };
  if(fileMeta){
    // store base64 data in 'fileData' (small files) — you already used this approach
    payload.fileData = fileMeta.data;
    payload.fileType = fileMeta.type;
    payload.fileName = fileMeta.name || ('file_'+Date.now());
  }
  try {
    await ref.set(payload);
    // clear input but keep focus if user was typing
    msgInput.value = '';
    if(focusedBefore) msgInput.focus();
    showHeart();
  } catch(err){
    console.error('sendMessage error', err);
    showToast('Failed to send message');
  }
}

// ---------------- FILE HELPERS ----------------
function fileToDataURL(file){
  return new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onerror = ()=> { fr.abort(); reject(new Error('Failed to read file')); };
    fr.onload = ()=> resolve(fr.result);
    fr.readAsDataURL(file);
  });
}
function blobToDataURL(blob){
  return new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onerror = ()=> { fr.abort(); reject(new Error('Failed to read blob')); };
    fr.onload = ()=> resolve(fr.result);
    fr.readAsDataURL(blob);
  });
}

// compress image using canvas
async function compressImage(file, maxWidth = 800) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const fr = new FileReader();
    fr.onload = () => {
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = fr.result;
    };
    fr.onerror = ()=> { fr.abort(); reject(new Error('File read failed')); };
    fr.readAsDataURL(file);
  });
}

// ---------------- FILE ATTACH (base64, client-side) ----------------
attachBtn.addEventListener('click', ()=> fileInput.click());
fileInput.addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  if(file.size > MAX_FILE_BYTES){
    showToast('File too large. Max '+Math.round(MAX_FILE_BYTES/1024/1024)+' MB');
    fileInput.value = '';
    return;
  }
  try {
    isConverting = true;
    showLoader(true);
    sendBtn.disabled = true; attachBtn.disabled = true;
    let dataUrl;
    if(file.type.startsWith('image/')) {
      dataUrl = await compressImage(file, 800);
    } else {
      dataUrl = await fileToDataURL(file);
    }
    await sendMessage('', {data: dataUrl, type: file.type || 'application/octet-stream', name: file.name, ttl: defaultTTL||0});
    fileInput.value = '';
  } catch(err){
    console.error('file convert/send error', err);
    showToast('File send failed');
  } finally {
    isConverting = false;
    showLoader(false);
    sendBtn.disabled = false; attachBtn.disabled = false;
  }
});

// ---------------- VOICE RECORDING ----------------
recordBtn.addEventListener('click', async ()=>{
  if(isRecording){
    try { recorder.stop(); } catch(e){ console.warn('recorder stop error', e); }
    isRecording = false; recordBtn.innerText = '🎙';
    return;
  }
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return showToast('Recording not supported on this device/browser');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    let options = {};
    try {
      if(MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm')) options = {mimeType:'audio/webm'};
      else if(MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/ogg')) options = {mimeType:'audio/ogg'};
    } catch(e){}
    recorder = new MediaRecorder(stream, options);
    audioChunks = [];
    recorder.ondataavailable = e=> audioChunks.push(e.data);
    recorder.onstop = async ()=>{
      try {
        const blob = new Blob(audioChunks,{type: audioChunks[0]?.type || 'audio/webm'});
        if(blob.size > MAX_FILE_BYTES){
          showToast('Recording too large. Keep it short.');
          return;
        }
        isConverting = true;
        showLoader(true);
        sendBtn.disabled = true; attachBtn.disabled = true; recordBtn.disabled = true;
        const dataUrl = await blobToDataURL(blob);
        await sendMessage('', {data: dataUrl, type: blob.type || 'audio/webm', name: 'voice_'+Date.now()+'.webm', ttl: defaultTTL||0});
      } catch(err){
        console.error('voice send error', err); showToast('Voice send failed');
      } finally {
        isConverting = false;
        showLoader(false);
        sendBtn.disabled = false; attachBtn.disabled = false; recordBtn.disabled = false;
      }
    };
    recorder.start();
    isRecording = true; recordBtn.innerText = '⏹';
  } catch(err){
    console.error('getUserMedia error', err);
    showToast('Could not start recording');
  }
});

// ---------------- RENDERING MESSAGES ----------------
function escapeHtml(s){
  if(!s) return '';
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderMessage(m){
  const id = m.id;
  if(!id) return;
  // prevent duplicate rendering
  let el = document.getElementById('msg_'+id);
  const isMine = m.senderId === myId;
  if(!el){
    el = document.createElement('div');
    el.id = 'msg_'+id;
    el.className = 'msg ' + (isMine ? 'me' : 'other');
    // fade-in
    el.style.opacity = 0;
    messagesDiv.appendChild(el);
    requestAnimationFrame(()=> el.style.opacity = 1);
  }
  // build inner HTML
  let inner = '';
  if(m.fileData){
    try {
      if(m.fileType && m.fileType.startsWith('image')) {
        inner += `<img src="${m.fileData}" alt="img" />`;
      } else if(m.fileType && m.fileType.startsWith('audio')) {
        inner += `<audio controls src="${m.fileData}"></audio>`;
      } else {
        const fname = escapeHtml(m.fileName || 'file');
        inner += `<div class="file"><a href="${m.fileData}" download="${fname}">📁 Download ${fname}</a></div>`;
      }
    } catch(e){ console.error('render file error', e); }
  }
  if(m.text) inner += `<div class="text">${escapeHtml(m.text)}</div>`;
  const time = new Date(m.time || Date.now());
  const tstr = time.getHours()+':'+('0'+time.getMinutes()).slice(-2);
  const delivered = m.deliveredTo ? Object.keys(m.deliveredTo).length : 0;
  const seen = m.seenBy ? Object.keys(m.seenBy).length : 0;
  const tickHtml = (seen>0) ? '<span class="tick">✅✅</span>' : (delivered>0 ? '<span class="tick">✅</span>' : '');
  inner += `<div class="meta"><strong>${escapeHtml(m.sender)}</strong><span>${tstr} ${tickHtml}</span></div>`;

  inner += `
    <div class="msg-menu" aria-hidden="true">
      <button class="menu-btn" title="Options">⋮</button>
      <div class="menu-options" role="menu">
        ${isMine ? `<div class="opt delete" data-delete="${id}">Delete</div>` : `<div class="opt report" data-report="${id}">Report</div>`}
      </div>
    </div>
  `;

  el.innerHTML = inner;
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  // seen update (if message is not mine)
  if(!isMine){
    try {
      const seenBy = m.seenBy || {};
      if(!seenBy[myId]){
        seenBy[myId] = Date.now();
        db.ref('snowflakechat/'+id+'/seenBy').set(seenBy).catch(()=>{});
      }
    } catch(e){ console.warn('seen update failed', e); }
  }

  // menu actions
  const menuBtn = el.querySelector('.menu-btn');
  const menuOptions = el.querySelector('.menu-options');
  if(menuBtn && menuOptions){
    menuBtn.onclick = (ev) => {
      ev.stopPropagation();
      const open = menuOptions.classList.toggle('show');
      if(open){
        setTimeout(()=> {
          const closeFn = (e)=> {
            if(!menuOptions.contains(e.target) && e.target !== menuBtn){
              menuOptions.classList.remove('show');
              document.removeEventListener('click', closeFn);
            }
          };
          document.addEventListener('click', closeFn);
        }, 10);
      }
    };
  }
  const deleteOpt = el.querySelector('.opt.delete');
  if(deleteOpt) deleteOpt.onclick = ()=> { if(confirm('Delete this message for everyone?')) db.ref('snowflakechat/'+id).remove().catch(()=>{}); };
  const reportOpt = el.querySelector('.opt.report');
  if(reportOpt) reportOpt.onclick = ()=> { alert('Reported'); menuOptions.classList.remove('show'); };
}

function refreshMessageUI(m){
  const el = document.getElementById('msg_'+m.id);
  if(el) renderMessage(m);
}

// heart animation
function showHeart(){
  const heart = document.createElement('div');
  heart.innerText = '💖';
  heart.style.position = 'absolute';
  heart.style.left = (20 + Math.random()*60) + '%';
  heart.style.bottom = '60px';
  heart.style.fontSize = '24px';
  heart.style.pointerEvents = 'none';
  document.body.appendChild(heart);
  let bottom = 60; let opacity = 1;
  const id = setInterval(()=> {
    bottom += 2; opacity -= 0.03;
    heart.style.bottom = bottom + 'px';
    heart.style.opacity = opacity;
    if(opacity <= 0){ heart.remove(); clearInterval(id); }
  }, 16);
}

// ---------------- SETTINGS UI ----------------
openSettingsBtn.addEventListener('click', ()=> settings.classList.toggle('hidden'));
defaultTTLSelect.addEventListener('change', ()=> {
  defaultTTL = parseInt(defaultTTLSelect.value||'0',10);
  localStorage.setItem('sf_ttl', String(defaultTTL));
});
if(snowToggle) snowToggle.addEventListener('change', ()=> {
  snowEnabled = snowToggle.checked;
  localStorage.setItem('sf_snow', snowEnabled?'true':'false');
  document.getElementById('snow').style.display = snowEnabled ? 'block' : 'none';
});
themeBtn.addEventListener('click', ()=> {
  document.body.classList.toggle('dark');
  themeBtn.innerText = document.body.classList.contains('dark') ? '☀️' : '🌙';
});
logoutBtn.addEventListener('click', ()=> {
  localStorage.removeItem('sf_name');
  // remove realtime listeners so messages won't come after logout
  try { db.ref('snowflakechat').off(); db.ref('typing').off(); db.ref('presence').off(); } catch(e){}
  location.reload();
});
clearAdminBtn.addEventListener('click', ()=> {
  if(confirm('Clear ALL messages from database?')){
    db.ref('snowflakechat').remove().catch(()=>{});
    messagesDiv.innerHTML = '';
  }
});

// ---------------- SNOW EFFECT ----------------
const canvas = document.getElementById('snow');
const ctx = canvas.getContext('2d');
let W = canvas.width = window.innerWidth;
let H = canvas.height = window.innerHeight;
const flakes = [];

