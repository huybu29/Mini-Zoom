const socket = io();
let localStream = null;
let peers = {};
let screenTrack = null;
let myName = '';
let myRoom = '';

const videos = document.getElementById('videos');
const userList = document.getElementById('userList');
const countEl = document.getElementById('count');
const roomInput = document.getElementById('room');
const nameInput = document.getElementById('name');
const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const micBtn = document.getElementById('micBtn');
const camBtn = document.getElementById('camBtn');
const shareBtn = document.getElementById('shareBtn');

const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const chatMessages = document.getElementById("chatMessages")

const users = {};

// -------------------- USER LIST --------------------
function renderUserList() {
  userList.innerHTML = '';
  const arr = Object.values(users);
  arr.forEach(u => {
    const div = document.createElement('div');
    div.className = 'user flex items-center gap-2';
    div.id = 'user-' + u.id;

    const dot = document.createElement('div');
    dot.className = 'status-dot w-2 h-2 rounded-full ' + (u.mic ? 'bg-green-500' : 'bg-gray-400');
    dot.title = u.mic ? 'Mic: ON' : 'Mic: OFF';

    const name = document.createElement('div');
    name.textContent = u.name + (u.id === 'local' ? ' (you)' : '');

    const cam = document.createElement('div');
    cam.className = 'ml-auto';
    cam.textContent = u.cam ? '📷' : '🚫';

    div.appendChild(dot);
    div.appendChild(name);
    div.appendChild(cam);

    userList.appendChild(div);
  });
  countEl.textContent = arr.length;
}

function addUser(u) { users[u.id] = u; renderUserList(); }
function removeUser(id) { delete users[id]; renderUserList(); }
function updateUser(u) { users[u.id] = { ...(users[u.id]||{}), ...u }; renderUserList(); }

// -------------------- VIDEO GRID --------------------
function addVideoEl(id, label, stream, isLocal=false) {
  let tile = document.getElementById('tile-' + id);
  if(!tile){
    tile = document.createElement('div');
    tile.className = 'tile relative bg-black rounded overflow-hidden';
    tile.id = 'tile-' + id;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = isLocal;
    video.id = 'video-' + id;

    const nameTag = document.createElement('div');
    nameTag.className = 'absolute bottom-2 left-2 px-2 py-1 bg-black bg-opacity-50 text-white text-xs rounded';
    nameTag.textContent = label;

    tile.appendChild(video);
    tile.appendChild(nameTag);
    videos.appendChild(tile);
  }
  document.getElementById('video-' + id).srcObject = stream;
  updateVideoGrid();
}

// Tự động điều chỉnh grid video
function updateVideoGrid() {
  const count = videos.children.length;
  videos.className = 'grid gap-2 p-2 transition-all duration-300';

  if (count === 1) {
    videos.classList.add('grid-cols-1', 'grid-rows-1', 'place-items-center');
  } 
  else if (count === 2) {
    videos.classList.add('grid-cols-2', 'grid-rows-1');
  } 
  else if (count <= 4) {
    videos.classList.add('grid-cols-2', 'grid-rows-2');
  } 
  else if (count <= 6) {
    videos.classList.add('grid-cols-3', 'grid-rows-2');
  } 
  else if (count <= 9) {
    videos.classList.add('grid-cols-3', 'grid-rows-3');
  } 
  else {
    videos.classList.add('grid-cols-4', 'grid-rows-3');
  }
}

// -------------------- JOIN / LEAVE --------------------
joinBtn.onclick = async () => {
  const room = roomInput.value.trim();
  if(!room) return alert('Nhập tên phòng!');
  if(localStream) return;

  myName = (nameInput.value||'').trim() || 'Me';
  myRoom = room;

  try{
    localStream = await navigator.mediaDevices.getUserMedia({video:true, audio:true});
  } catch(e){
    console.error(e); return alert('Không truy cập được camera/mic.');
  }

  addVideoEl('local', myName + ' (you)', localStream, true);
  addUser({ id:'local', name: myName, mic:true, cam:true });

  socket.emit('join', { room, name: myName });

  leaveBtn.disabled = false;
  micBtn.disabled = false;
  camBtn.disabled = false;
  shareBtn.disabled = false;
  joinBtn.disabled = true;
  roomInput.disabled = true;
  nameInput.disabled = true;
}

leaveBtn.onclick = () => {
  Object.keys(peers).forEach(pid => { peers[pid].close(); delete peers[pid]; document.getElementById('tile-'+pid)?.remove(); });
  if(localStream){ localStream.getTracks().forEach(t=>t.stop()); document.getElementById('video-local').srcObject=null; localStream=null; }
  socket.emit('leave');

  leaveBtn.disabled = true;
  micBtn.disabled = true;
  camBtn.disabled = true;
  shareBtn.disabled = true;
  joinBtn.disabled = false;
  roomInput.disabled = false;
  removeUser('local');
}

// -------------------- SOCKET EVENTS --------------------
socket.on('room-users', arr => { arr.forEach(u=>{ if(u.id!==socket.id) addUser(u); }); });
socket.on('user-joined', u => { if(u.id!==socket.id) addUser(u); });
socket.on('peer-disconnected', id => {
  removeUser(id);
  const videoTile = document.getElementById('tile-' + id);
  if (videoTile) videoTile.remove();
  if (peers[id]) { 
    peers[id].close(); 
    delete peers[id]; 
  }
  updateVideoGrid();
});

socket.on('update-user', u => updateUser(u));

// -------------------- PEER CONNECTION --------------------
socket.on('new-peer', async (peerId) => {
  const pc = createPeer(peerId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('signal', { to: peerId, signal:{ type:'offer', sdp:offer }});
});

socket.on('signal', async ({from,data}) => {
  let pc = peers[from] || createPeer(from);
  if(data.type==='offer'){
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('signal',{to:from, signal:{type:'answer', sdp:answer}});
  } else if(data.type==='answer'){
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
  } else if(data.candidate){
    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
});

socket.on('peer-disconnected', peerId => {
  if(peers[peerId]) peers[peerId].close(), delete peers[peerId];
  document.getElementById('tile-'+peerId)?.remove();
  updateVideoGrid();
});

function createPeer(peerId){
  const pc = new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
  localStream.getTracks().forEach(track=>pc.addTrack(track, localStream));

  pc.onicecandidate = e => { if(e.candidate) socket.emit('signal',{to:peerId, signal:{candidate:e.candidate}}); };
  pc.ontrack = e => { addVideoEl(peerId, peerId, e.streams[0]); };
  peers[peerId] = pc;
  return pc;
}

// -------------------- CONTROLS --------------------
micBtn.onclick = () => {
  if(!localStream) return;
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  micBtn.textContent = track.enabled ? 'Tắt mic':'Bật mic';
  updateUser({id:'local', mic:track.enabled});
  socket.emit('toggle-mic', track.enabled);
}

camBtn.onclick = () => {
  if(!localStream) return;
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  camBtn.textContent = track.enabled ? 'Tắt cam':'Bật cam';
  updateUser({id:'local', cam:track.enabled});
  socket.emit('toggle-cam', track.enabled);
}

shareBtn.onclick = async () => {
  if(!localStream) return;
  try{
    const display = await navigator.mediaDevices.getDisplayMedia({video:true});
    screenTrack = display.getVideoTracks()[0];
    for(const id of Object.keys(peers)){
      const sender = peers[id].getSenders().find(s=>s.track&&s.track.kind==='video');
      if(sender) sender.replaceTrack(screenTrack);
    }
    document.getElementById('video-local').srcObject = new MediaStream([screenTrack, ...localStream.getAudioTracks()]);
    screenTrack.onended = async ()=>{
      const camTrack = localStream.getVideoTracks()[0];
      for(const id of Object.keys(peers)){
        const sender = peers[id].getSenders().find(s=>s.track&&s.track.kind==='video');
        if(sender) sender.replaceTrack(camTrack);
      }
      document.getElementById('video-local').srcObject = localStream;
    }
  }catch(e){ console.warn('Hủy chia sẻ màn hình hoặc lỗi:', e); }
}

// -------------------- CHAT --------------------
sendBtn.onclick = ()=>{
  const msg = chatInput.value.trim();
  if(msg!==""){
    socket.emit('chatMessage',{message:msg});
    chatInput.value="";
  }
}

socket.on('chatMessage', data=>{
  const msgEl = document.createElement('div');
  msgEl.innerHTML = `<strong>${data.name}:</strong> ${data.message}`;
  chatMessages.appendChild(msgEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

// -------------------- BEFORE UNLOAD --------------------
window.addEventListener('beforeunload',()=>{ try{socket.emit('leave');}catch{} });
