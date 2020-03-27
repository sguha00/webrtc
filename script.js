// Generate random room name if needed
if (!location.hash) {
  location.hash = '_o7qjN3KF8U';
}
const roomHash = location.pathname;
const videoId = location.hash;

// TODO: Replace with your own channel ID
const drone = new ScaleDrone('yiS12Ts5RdNhebyM');
// Room name needs to be prefixed with 'observable-'
const roomName = 'observable-' + roomHash;
const configuration = {
  iceServers: [{
    urls: 'stun:stun.l.google.com:19302'
  }]
};
let room;
let pc;
// RTCDataChannel
let dataChannel;

let isOfferer = false;


function onSuccess() {};
function onError(error) {
  console.error(error);
};

drone.on('open', error => {
  if (error) {
    return console.error(error);
  }
  room = drone.subscribe(roomName);
  room.on('open', error => {
    if (error) {
      onError(error);
    }
  });
  // We're connected to the room and received an array of 'members'
  // connected to the room (including us). Signaling server is ready.
  room.on('members', members => {
    console.log('MEMBERS', members);
    if (members.length > 2) {
      return alert('The room is full');
    }
    // If we are the second user to connect to the room we will be creating the offer
    isOfferer = members.length === 2;
    startWebRTC(isOfferer);
  });
});

// Send signaling data via Scaledrone
function sendSignalingMessage(message) {
  drone.publish({
    room: roomName,
    message
  });
}

function startWebRTC(isOfferer) {
  pc = new RTCPeerConnection(configuration);

  // 'onicecandidate' notifies us whenever an ICE agent needs to deliver a
  // message to the other peer through the signaling server
  pc.onicecandidate = event => {
    if (event.candidate) {
      sendSignalingMessage({'candidate': event.candidate});
    }
  };

  // If user is offerer let the 'negotiationneeded' event create the offer
  if (isOfferer) {
    pc.onnegotiationneeded = () => {
      pc.createOffer().then(localDescCreated).catch(onError);
    }
    dataChannel = pc.createDataChannel('videosync');
    setupDataChannel();
  }  else {
    // If user is not the offerer let wait for a data channel
    pc.ondatachannel = event => {
      dataChannel = event.channel;
      setupDataChannel();
    }
  }

  // When a remote stream arrives display it in the #remoteVideo element
  pc.ontrack = event => {
    const stream = event.streams[0];
    if (!remoteVideo.srcObject || remoteVideo.srcObject.id !== stream.id) {
      remoteVideo.srcObject = stream;
    }
  };

  navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true,
  }).then(stream => {
    // Display your local video in #localVideo element
    localVideo.srcObject = stream;
    // Add your stream to be sent to the conneting peer
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
  }, onError);

  // Listen to signaling data from Scaledrone
  room.on('data', (message, client) => {
    // Message was sent by us
    if (client.id === drone.clientId) {
      return;
    }

    if (message.sdp) {
      // This is called after receiving an offer or answer from another peer
      pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
        // When receiving an offer lets answer it
        if (pc.remoteDescription.type === 'offer') {
          pc.createAnswer().then(localDescCreated).catch(onError);
        }
      }, onError);
    } else if (message.candidate) {
      // Add the new ICE candidate to our connections remote description
      pc.addIceCandidate(
        new RTCIceCandidate(message.candidate), onSuccess, onError
      );
    }
  });
}

function localDescCreated(desc) {
  pc.setLocalDescription(
    desc,
    () => sendSignalingMessage({'sdp': pc.localDescription}),
    onError
  );
}

function processMessage(event) {
  console.log("processMessage", event);

  switch (event.data) {
    case YT.PlayerState.PLAYING:
      player.seekTo(event.target.playerInfo.currentTime);
      // window.phone.sendData(event);
      player.playVideo();
      break;
    case YT.PlayerState.PAUSED:
      player.pauseVideo()
      // window.phone.sendData(event);
      break;
    case YT.PlayerState.BUFFERING: // If they seeked, dont send this.
      player.seekTo(event.target.playerInfo.currentTime);
      // else window.phone.sendData(event);
  }
}

// Hook up data channel event handlers
function setupDataChannel() {
  console.log("setupDataChannel");
  checkDataChannelState();
  dataChannel.onopen = checkDataChannelState;
  dataChannel.onclose = checkDataChannelState;
  dataChannel.onmessage = event =>
    processMessage(JSON.parse(event.data))
}

function checkDataChannelState() {
  console.log('WebRTC channel state is:', dataChannel.readyState);
}

// 2. This code loads the IFrame Player API code asynchronously.
var tag = document.createElement('script');

tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

// 3. This function creates an <iframe> (and YouTube player)
//    after the API code downloads.
let player;
function onYouTubeIframeAPIReady() {
  player = new YT.Player('player', {
    height: '100%',
    width: '100%',
    videoId: videoId || '_o7qjN3KF8U',
    events: {
      'onReady': onPlayerReady,
      'onStateChange': onPlayerStateChange
    }
  });
}

let element = document.getElementById('timer');

function pad(num) {
  return ("0"+num).slice(-2);
}

function step() {
  const remaining = Math.round(player.getDuration() - player.getCurrentTime());
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining - hours * 60) / 60);
  const seconds = remaining - hours * 3600 - minutes * 60;
  let remainingStr = `${pad(minutes)}:${pad(seconds)}`;
  if (hours > 0) remainingStr = `${pad(hours)}:${remainingStr}`;
  if (element.innerHTML !== remainingStr) element.innerHTML = remainingStr;
  setTimeout(step, 1000);
}

// 4. The API will call this function when the video player is ready.
function onPlayerReady(event) {
  step();
}

// 5. The API calls this function when the player's state changes.
//    The function indicates that when playing a video (state=1),
//    the player should play for six seconds and then stop.
var done = false;
// function onPlayerStateChange(event) {
//   console.log("EVENT", event);
//   if (event.data == YT.PlayerState.PLAYING && !done) {
//     setTimeout(stopVideo, 6000);
//     done = true;
//   }
// }

function onPlayerStateChange(event) {
  if (!isOfferer) {
    console.log("send", JSON.stringify(event))
    dataChannel.send(JSON.stringify(event));
  }
  console.log("EVENT", isOfferer, event.data, event.target.playerInfo.currentTime);
  switch (event.data) {
    case YT.PlayerState.PLAYING:
      if (done) return;
      // window.phone.sendData(event);
      break;
    case YT.PlayerState.PAUSED:
      // window.phone.sendData(event);
      break;
    case YT.PlayerState.BUFFERING: // If they seeked, dont send this.
      if (seek) seek = false;
      // else window.phone.sendData(event);
  }
}


function stopVideo() {
  player.stopVideo();
}
