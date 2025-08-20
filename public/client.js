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
function renderUserList() {
  userList.innerHTML = '';
  const arr = Object.values(users);
  arr.forEach(u => {
    const div = document.createElement('div');
    div.className = 'user';
    div.id = 'user-' + u.id;

    const dot = document.createElement('div');
    dot.className = 'status-dot ' + (u.mic ? 'mic-on' : 'mic-off');
    dot.title = u.mic ? 'Mic: ON' : 'Mic: OFF';

    const name = document.createElement('div');
    name.textContent = u.name + (u.id === 'local' ? ' (you)' : '');

    const cam = document.createElement('div');
    cam.style.marginLeft = 'auto';
    cam.textContent = u.cam ? '📷' : '🚫';

    div.appendChild(dot);
    div.appendChild(name);
    div.appendChild(cam);

    userList.appendChild(div);
  });
  countEl.textContent = arr.length;
}

function addUser(u) {
  users[u.id] = u;
  renderUserList();
}
function removeUser(id) {
  delete users[id];
  renderUserList();
}
function updateUser(u) {
  const existing = users[u.id] || {};
  users[u.id] = { ...existing, ...u };
  renderUserList();
}
function addVideoEl(id, label, stream, isLocal = false) {
  let tile = document.getElementById('tile-' + id);
  if (!tile) {
    tile = document.createElement('div');
    tile.className = 'tile';
    tile.id = 'tile-' + id;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = isLocal; // tránh vọng
    video.id = 'video-' + id;

    const name = document.createElement('div');
    name.className = 'label';
    name.textContent = label;

    tile.appendChild(video);
    tile.appendChild(name);
    videos.appendChild(tile);
  }
  document.getElementById('video-' + id).srcObject = stream;

}
// Join room
joinBtn.onclick = async () => {
  const room = roomInput.value.trim();
  if (!room) return alert('Nhập tên phòng!');
  if (localStream) return;

  myName = (nameInput.value || '').trim() || 'Me';
  myRoom = room;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (e) {
    console.error(e);
    return alert('Không truy cập được camera/mic.');
  }
  // Hiển thị video local
  addVideoEl('local', myName + ' (you)', localStream, true);

  socket.emit('join', { room, name: myName });

  leaveBtn.disabled = false;
  micBtn.disabled = false;
  camBtn.disabled = false;
  shareBtn.disabled = false;
  joinBtn.disabled = true;
  roomInput.disabled = true;
  nameInput.disabled = true;
};
leaveBtn.onclick = () => {
  // close all peers
  Object.keys(peers).forEach(peerId => {
    peers[peerId].close();
    const wrapper = document.getElementById('wrapper-' + peerId);
    if (wrapper) wrapper.remove();
  });
  peers = {};

  // remove local stream
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
   const localEl = document.getElementById('video-local');
  if (localEl) localEl.srcObject = null;
  localStream = null;
  }

  socket.emit('leave-room'); // optional if server tracks rooms

  // reset buttons
  leaveBtn.disabled = true;
  micBtn.disabled = true;
  camBtn.disabled = true;
  shareBtn.disabled = true;
  joinBtn.disabled = false;
  document.getElementById('room').disabled = false;
}
socket.on('room-users', (arr) => {
  // arr là danh sách người có trong phòng (do server gửi)
  // map server list -> local representation (server có id = socketId)
  removeAllExceptLocal();
  arr.forEach(u => {
    if (u.id !== socket.id) addUser({ id: u.id, name: u.name, mic: u.mic, cam: u.cam });
  });
});

socket.on('user-joined', (u) => {
  if (u.id !== socket.id) addUser(u);
});

socket.on('user-left', (id) => {
  // xóa user khỏi list & xóa video nếu có
  removeUser(id);
  document.getElementById('tile-' + id)?.remove();
  if (peers[id]) {
    peers[id].close();
    delete peers[id];
  }
});

socket.on('update-user', (u) => {
  updateUser(u);
});
// Socket events
socket.on('new-peer', async (peerId) => {
  const pc = createPeer(peerId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('signal', { to: peerId, signal: { type: 'offer', sdp: offer } });
});
socket.on('signal', async ({ from, data }) => {
  let pc = peers[from];
  if (!pc) pc = createPeer(from);

  if (data.type === 'offer') {
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('signal', { to: from, signal: { type: 'answer', sdp: answer } });
  } else if (data.type === 'answer') {
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
  } else if (data.candidate) {
    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
});

socket.on('peer-disconnected', (peerId) => {
  if (peers[peerId]) {
    peers[peerId].close();
    delete peers[peerId];
    const wrapper = document.getElementById('wrapper-' + peerId);
    if (wrapper) wrapper.remove();
  }
});
// Peer connections
function createPeer(peerId) {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', { to: peerId, signal: { candidate: event.candidate } });
    }
  };

pc.ontrack = (event) => {
  addVideoEl(peerId, peerId, event.streams[0]);
  }
  peers[peerId] = pc;
  return pc;
  
}




// Button handles
micBtn.onclick = () => {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  if (track) {
    track.enabled = !track.enabled;
    micBtn.textContent = track.enabled ? 'Tắt mic' : 'Bật mic';
  }
   updateUser({ id: 'local', mic: track.enabled });
  socket.emit('toggle-mic', track.enabled);
};

camBtn.onclick = () => {
  if (!localStream) return;
  const track = localStream.getVideoTracks()[0];
  if (track) {
    track.enabled = !track.enabled;
    camBtn.textContent = track.enabled ? 'Tắt cam' : 'Bật cam';
  }
  updateUser({ id: 'local', cam: track.enabled });
  socket.emit('toggle-cam', track.enabled);
};

shareBtn.onclick = async () => {
  if (!localStream) return;
  try {
    const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
    screenTrack = display.getVideoTracks()[0];

    for (const id of Object.keys(peers)) {
      const sender = peers[id].pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) await sender.replaceTrack(screenTrack);
    }

    const localEl = document.getElementById('video-local');
    if (localEl) {
      const newStream = new MediaStream([screenTrack, ...localStream.getAudioTracks()]);
      localEl.srcObject = newStream;
    }

    screenTrack.onended = async () => {
      const camTrack = localStream.getVideoTracks()[0];
      for (const id of Object.keys(peers)) {
        const sender = peers[id].pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) await sender.replaceTrack(camTrack);
      }
      const localVideo = document.    getElementById('video-local');
      if (localVideo) localVideo.srcObject = localStream;
    };
  } catch (e) {
    console.warn('Hủy chia sẻ màn hình hoặc lỗi:', e);
  }
};

sendBtn.onclick = () => {
  const message = chatInput.value;
  if (message.trim() !== "") {
    socket.emit("chatMessage", {  message });
    chatInput.value = "";
  }
};

// Nhận tin nhắn
socket.on("chatMessage", (data) => {
  const msgEl = document.createElement("div");
  msgEl.innerHTML = `<strong>${data.name}:</strong> ${data.message}`;
  chatMessages.appendChild(msgEl);
  chatMessages.scrollTop = chatMessages.scrollHeight; // Tự động cuộn xuống
});

window.addEventListener('beforeunload', () => {
  try { socket.emit('leave'); } catch {}
});