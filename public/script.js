const socket = io();
const localVideo = document.getElementById('localVideo');
const remoteVideos = document.getElementById('remoteVideos');
let localStream;
let peers = {};

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
