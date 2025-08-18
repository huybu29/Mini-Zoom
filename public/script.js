const socket = io();
const localVideo = document.getElementById('localVideo');
const remoteVideos = document.getElementById('remoteVideos');
let localStream;
let peers = {};

let screenTrack = null;
let myName = '';
let myRoom = '';

const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const micBtn = document.getElementById('micBtn');
const camBtn = document.getElementById('camBtn');
const shareBtn = document.getElementById('shareBtn');

document.getElementById('joinBtn').onclick = async () => {
  const room = document.getElementById('room').value;
  if (!room) return alert('Nhập tên phòng!');

  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;

  socket.emit('join', room);
};

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
    document.getElementById(peerId)?.remove();
  }
});

function createPeer(peerId) {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', { to: peerId, signal: { candidate: event.candidate } });
    }
  };

  pc.ontrack = (event) => {
    let video = document.getElementById(peerId);
    if (!video) {
      video = document.createElement('video');
      video.id = peerId;
      video.autoplay = true;
      video.playsInline = true;
      remoteVideos.appendChild(video);
    }
    video.srcObject = event.streams[0];
  };

  peers[peerId] = pc;
  return pc;
}


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
  socket.emit('leave');
  Object.keys(peers).forEach(id => cleanupPeer(id));
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
  }
  localStream = null;
  screenTrack = null;
  removePeerUI('local');

  joinBtn.disabled = false;
  roomInput.disabled = false;
  nameInput.disabled = false;

  leaveBtn.disabled = true;
  micBtn.disabled = true;
  camBtn.disabled = true;
  shareBtn.disabled = true;
};

micBtn.onclick = () => {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  if (track) {
    track.enabled = !track.enabled;
    micBtn.textContent = track.enabled ? 'Tắt mic' : 'Bật mic';
  }
};

camBtn.onclick = () => {
  if (!localStream) return;
  const track = localStream.getVideoTracks()[0];
  if (track) {
    track.enabled = !track.enabled;
    camBtn.textContent = track.enabled ? 'Tắt cam' : 'Bật cam';
  }
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

    const localVideo = document.getElementById('video-local');
    if (localVideo) {
      const newStream = new MediaStream([screenTrack, ...localStream.getAudioTracks()]);
      localVideo.srcObject = newStream;
    }

    screenTrack.onended = async () => {
      const camTrack = localStream.getVideoTracks()[0];
      for (const id of Object.keys(peers)) {
        const sender = peers[id].pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) await sender.replaceTrack(camTrack);
      }
      const localVideo = document.getElementById('video-local');
      if (localVideo) localVideo.srcObject = localStream;
    };
  } catch (e) {
    console.warn('Hủy chia sẻ màn hình hoặc lỗi:', e);
  }
};

window.addEventListener('beforeunload', () => {
  try { socket.emit('leave'); } catch {}
});