import * as pako from 'pako';

/**
 * Base64 SDP Token Compressor and Decompressor
 * Formats WebRTC SDP offers/answers into Base64 strings under 250 characters.
 */
export function compressSdpToken(sdpObj) {
  if (!sdpObj || !sdpObj.sdp) return '';

  const sdpText = sdpObj.sdp;
  const ufragMatch = sdpText.match(/a=ice-ufrag:(.+)/);
  const pwdMatch = sdpText.match(/a=ice-pwd:(.+)/);
  const fpMatch = sdpText.match(/a=fingerprint:sha-256 (.+)/);
  const setupMatch = sdpText.match(/a=setup:(.+)/);

  let compactObj;
  if (ufragMatch && pwdMatch && fpMatch) {
    const candidates = [];
    const candRegex = /a=candidate:(.+)/g;
    let m;
    while ((m = candRegex.exec(sdpText)) !== null) {
      candidates.push(m[1].trim());
    }
    compactObj = {
      t: sdpObj.type === 'offer' ? 'o' : 'a',
      u: ufragMatch[1].trim(),
      p: pwdMatch[1].trim(),
      f: fpMatch[1].trim(),
      s: setupMatch ? setupMatch[1].trim() : (sdpObj.type === 'offer' ? 'actpass' : 'active'),
      c: candidates
    };
  } else {
    compactObj = {
      t: sdpObj.type === 'offer' ? 'o' : 'a',
      sdp: sdpText
    };
  }

  const jsonStr = JSON.stringify(compactObj);
  const compressed = pako.deflate(jsonStr, { level: 9 });
  let binary = '';
  const bytes = new Uint8Array(compressed);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decompressSdpToken(token) {
  if (!token || typeof token !== 'string') return null;

  let cleanToken = token.trim().replace(/^["']|["']$/g, '');

  // Extract token from URL if full deep-link or query param was pasted
  if (cleanToken.includes('token=')) {
    const match = cleanToken.match(/token=([^&]+)/);
    if (match && match[1]) cleanToken = decodeURIComponent(match[1]);
  }

  // 1. Raw SDP Text format (starts with v=0)
  if (cleanToken.startsWith('v=0') || cleanToken.includes('a=fingerprint')) {
    const type = cleanToken.includes('a=setup:active') ? 'answer' : 'offer';
    return { type, sdp: cleanToken };
  }

  // 2. Direct JSON string format
  if (cleanToken.startsWith('{') && cleanToken.endsWith('}')) {
    try {
      const obj = JSON.parse(cleanToken);
      if (obj.sdp && obj.type) return obj;
      if (obj.sdp) return { type: 'offer', sdp: obj.sdp };
    } catch (e) {}
  }

  // Sanitize Base64 format
  let b64 = cleanToken.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';

  // 3. Uncompressed Base64 JSON format
  try {
    const decodedStr = atob(b64);
    if (decodedStr.startsWith('{') && decodedStr.endsWith('}')) {
      const obj = JSON.parse(decodedStr);
      if (obj.sdp && obj.type) return obj;
      if (obj.sdp) return { type: 'offer', sdp: obj.sdp };
    }
  } catch (e) {}

  // 4. Pako Deflated Base64 Token format
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const inflatedBytes = pako.inflate(bytes);
    const jsonStr = typeof inflatedBytes === 'string' ? inflatedBytes : new TextDecoder().decode(inflatedBytes);
    const obj = JSON.parse(jsonStr);

    const type = obj.t === 'o' ? 'offer' : (obj.t === 'a' ? 'answer' : (obj.type || 'offer'));
    if (obj.sdp) {
      return { type, sdp: obj.sdp };
    }

    let reconstructedSdp = `v=0\r\n` +
      `o=- ${Date.now()} 2 IN IP4 127.0.0.1\r\n` +
      `s=-\r\n` +
      `t=0 0\r\n` +
      `a=group:BUNDLE 0\r\n` +
      `m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n` +
      `c=IN IP4 0.0.0.0\r\n` +
      `a=ice-ufrag:${obj.u}\r\n` +
      `a=ice-pwd:${obj.p}\r\n` +
      `a=fingerprint:sha-256 ${obj.f}\r\n` +
      `a=setup:${obj.s}\r\n` +
      `a=mid:0\r\n` +
      `a=sctp-port:5000\r\n` +
      `a=max-message-size:262144\r\n`;

    if (obj.c && Array.isArray(obj.c)) {
      for (const cand of obj.c) {
        reconstructedSdp += `a=candidate:${cand}\r\n`;
      }
    }
    return { type, sdp: reconstructedSdp };
  } catch (e) {
    console.error('Failed to decompress SDP token:', e);
    return null;
  }
}

/**
 * MQTT 3.1.1 Helper utilities over WebSocket
 */
function encodeVarInt(num) {
  const bytes = [];
  do {
    let digit = num % 128;
    num = Math.floor(num / 128);
    if (num > 0) digit |= 0x80;
    bytes.push(digit);
  } while (num > 0);
  return bytes;
}

function decodeVarInt(bytes, startIdx = 1) {
  let multiplier = 1;
  let value = 0;
  let idx = startIdx;
  let encodedByte;
  do {
    encodedByte = bytes[idx++];
    value += (encodedByte & 127) * multiplier;
    multiplier *= 128;
  } while ((encodedByte & 128) !== 0);
  return { value, nextIdx: idx };
}

function buildConnectPacket(clientId) {
  const cidBytes = new TextEncoder().encode(clientId);
  const varHeader = [0, 4, 77, 81, 84, 84, 4, 2, 0, 60];
  const payloadLen = 2 + cidBytes.length;
  const remainingLen = varHeader.length + payloadLen;
  const remBytes = encodeVarInt(remainingLen);
  const packet = new Uint8Array(1 + remBytes.length + varHeader.length + payloadLen);
  packet[0] = 0x10;
  packet.set(remBytes, 1);
  let off = 1 + remBytes.length;
  packet.set(varHeader, off);
  off += varHeader.length;
  packet[off] = (cidBytes.length >> 8) & 0xff;
  packet[off + 1] = cidBytes.length & 0xff;
  packet.set(cidBytes, off + 2);
  return packet;
}

function buildPublishPacket(topic, payloadStr) {
  const topicBytes = new TextEncoder().encode(topic);
  const payloadBytes = typeof payloadStr === 'string' ? new TextEncoder().encode(payloadStr) : new Uint8Array(payloadStr);
  const varHeaderLen = 2 + topicBytes.length;
  const remainingLen = varHeaderLen + payloadBytes.length;
  const remBytes = encodeVarInt(remainingLen);
  const packet = new Uint8Array(1 + remBytes.length + varHeaderLen + payloadBytes.length);
  packet[0] = 0x30;
  packet.set(remBytes, 1);
  let off = 1 + remBytes.length;
  packet[off] = (topicBytes.length >> 8) & 0xff;
  packet[off + 1] = topicBytes.length & 0xff;
  packet.set(topicBytes, off + 2);
  off += 2 + topicBytes.length;
  packet.set(payloadBytes, off);
  return packet;
}

function buildSubscribePacket(topic, packetId = 1) {
  const topicBytes = new TextEncoder().encode(topic);
  const varHeaderLen = 2;
  const payloadLen = 2 + topicBytes.length + 1;
  const remainingLen = varHeaderLen + payloadLen;
  const remBytes = encodeVarInt(remainingLen);
  const packet = new Uint8Array(1 + remBytes.length + varHeaderLen + payloadLen);
  packet[0] = 0x82;
  packet.set(remBytes, 1);
  let off = 1 + remBytes.length;
  packet[off] = (packetId >> 8) & 0xff;
  packet[off + 1] = packetId & 0xff;
  off += 2;
  packet[off] = (topicBytes.length >> 8) & 0xff;
  packet[off + 1] = topicBytes.length & 0xff;
  packet.set(topicBytes, off + 2);
  off += 2 + topicBytes.length;
  packet[off] = 0;
  return packet;
}

function buildPingReqPacket() {
  return new Uint8Array([0xc0, 0x00]);
}

/**
 * SignalingAdapter Class
 * Manages MQTT signaling over WebSockets with broker pool failover,
 * SDP token compression, and LAN discovery integration.
 */
export class SignalingAdapter {
  constructor(options = {}) {
    this.brokers = options.brokers || [
      'wss://broker.emqx.io:8084/mqtt',
      'wss://broker.hivemq.com:8000/mqtt'
    ];
    this.currentBrokerIndex = 0;
    this.ws = null;
    this.isConnected = false;
    this.peerId = options.peerId || 'peer_' + Math.random().toString(36).substr(2, 9);
    this.roomCode = null;
    this.pingTimer = null;
    this.connectTimeoutTimer = null;

    this.signalHandlers = new Set();
    this.relayHandlers = new Set();
    this.lanHandlers = new Set();
    this.statusHandlers = new Set();

    this.lanCleanup = null;
  }

  get currentBroker() {
    return this.brokers[this.currentBrokerIndex];
  }

  async connect(roomCode, peerId) {
    this.roomCode = roomCode;
    if (peerId) this.peerId = peerId;
    return this._connectWithFailover();
  }

  _connectWithFailover() {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = this.brokers.length * 2;

      const tryNext = () => {
        if (attempts >= maxAttempts) {
          return reject(new Error('All MQTT brokers failed to connect'));
        }
        attempts++;
        const url = this.brokers[this.currentBrokerIndex];
        this._notifyStatus({ type: 'connecting', broker: url });

        this._cleanupWs();

        try {
          this.ws = new WebSocket(url, 'mqtt');
          this.ws.binaryType = 'arraybuffer';
        } catch (err) {
          this.currentBrokerIndex = (this.currentBrokerIndex + 1) % this.brokers.length;
          setTimeout(tryNext, 500);
          return;
        }

        this.connectTimeoutTimer = setTimeout(() => {
          console.warn(`Connection timeout to broker: ${url}`);
          this.currentBrokerIndex = (this.currentBrokerIndex + 1) % this.brokers.length;
          tryNext();
        }, 5000);

        this.ws.onopen = () => {
          const connectPkt = buildConnectPacket(`anidesk_${this.peerId}`);
          this.ws.send(connectPkt);
        };

        this.ws.onmessage = (event) => {
          const bytes = new Uint8Array(event.data);
          const packetType = bytes[0] >> 4;

          if (packetType === 2) { // CONNACK
            if (bytes[3] === 0) { // Success
              if (this.connectTimeoutTimer) clearTimeout(this.connectTimeoutTimer);
              this.isConnected = true;
              this._startPing();
              this._subscribeTopics();
              this._notifyStatus({ type: 'connected', broker: url });
              resolve(true);
            } else {
              this.currentBrokerIndex = (this.currentBrokerIndex + 1) % this.brokers.length;
              tryNext();
            }
          } else if (packetType === 3) { // PUBLISH
            this._handlePublish(bytes);
          }
        };

        this.ws.onerror = (err) => {
          console.warn(`MQTT WebSocket error on ${url}:`, err);
        };

        this.ws.onclose = () => {
          const wasConnected = this.isConnected;
          this.isConnected = false;
          this._stopPing();
          if (!wasConnected) {
            this.currentBrokerIndex = (this.currentBrokerIndex + 1) % this.brokers.length;
            tryNext();
          } else {
            this._notifyStatus({ type: 'disconnected', broker: url });
          }
        };
      };

      tryNext();
    });
  }

  _subscribeTopics() {
    if (!this.ws || !this.isConnected || !this.roomCode) return;
    const signalingTopic = `anideskplus/together/room/${this.roomCode}/signaling`;
    const relayTopic = `anideskplus/together/room/${this.roomCode}/relay`;

    this.ws.send(buildSubscribePacket(signalingTopic, 1));
    this.ws.send(buildSubscribePacket(relayTopic, 2));
  }

  _handlePublish(bytes) {
    try {
      const { value: remLen, nextIdx } = decodeVarInt(bytes, 1);
      const topicLen = (bytes[nextIdx] << 8) | bytes[nextIdx + 1];
      const topicStart = nextIdx + 2;
      const topic = new TextDecoder().decode(bytes.subarray(topicStart, topicStart + topicLen));
      const payloadStart = topicStart + topicLen;
      const payloadLen = remLen - (2 + topicLen);
      const payloadStr = new TextDecoder().decode(bytes.subarray(payloadStart, payloadStart + payloadLen));

      let data;
      try {
        data = JSON.parse(payloadStr);
      } catch (e) {
        data = payloadStr;
      }

      if (topic.endsWith('/signaling')) {
        if (data && data.senderId !== this.peerId) {
          for (const handler of this.signalHandlers) handler(data);
        }
      } else if (topic.endsWith('/relay')) {
        if (data && data.senderId !== this.peerId) {
          for (const handler of this.relayHandlers) handler(data);
        }
      }
    } catch (err) {
      console.error('Error handling MQTT publish packet:', err);
    }
  }

  sendSignal(signalData) {
    if (!this.ws || !this.isConnected || !this.roomCode) return false;
    const topic = `anideskplus/together/room/${this.roomCode}/signaling`;
    const payload = JSON.stringify({
      ...signalData,
      senderId: this.peerId,
      timestamp: Date.now()
    });
    this.ws.send(buildPublishPacket(topic, payload));
    return true;
  }

  sendRelay(messageData) {
    if (!this.ws || !this.isConnected || !this.roomCode) return false;
    const topic = `anideskplus/together/room/${this.roomCode}/relay`;
    const payload = JSON.stringify({
      senderId: this.peerId,
      payload: messageData,
      timestamp: Date.now()
    });
    this.ws.send(buildPublishPacket(topic, payload));
    return true;
  }

  startLanDiscovery(roomCode, peerId, nickname = '') {
    if (typeof window !== 'undefined' && window.togetherAPI) {
      if (typeof window.togetherAPI.onLanPeerDiscovered === 'function' && !this.lanCleanup) {
        this.lanCleanup = window.togetherAPI.onLanPeerDiscovered((peer) => {
          if (peer && peer.roomCode === (roomCode || this.roomCode) && peer.peerId !== (peerId || this.peerId)) {
            for (const handler of this.lanHandlers) handler(peer);
          }
        });
      }
      if (typeof window.togetherAPI.startLanDiscovery === 'function') {
        window.togetherAPI.startLanDiscovery({
          roomCode: roomCode || this.roomCode,
          peerId: peerId || this.peerId,
          nickname
        });
      }
    }
  }

  stopLanDiscovery() {
    if (typeof window !== 'undefined' && window.togetherAPI) {
      if (typeof window.togetherAPI.stopLanDiscovery === 'function') {
        window.togetherAPI.stopLanDiscovery();
      }
    }
    if (this.lanCleanup && typeof this.lanCleanup === 'function') {
      this.lanCleanup();
      this.lanCleanup = null;
    }
  }

  onSignal(handler) {
    this.signalHandlers.add(handler);
    return () => this.signalHandlers.delete(handler);
  }

  onRelay(handler) {
    this.relayHandlers.add(handler);
    return () => this.relayHandlers.delete(handler);
  }

  onLanPeer(handler) {
    this.lanHandlers.add(handler);
    return () => this.lanHandlers.delete(handler);
  }

  onStatusChange(handler) {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  _notifyStatus(status) {
    for (const handler of this.statusHandlers) handler(status);
  }

  _startPing() {
    this._stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.isConnected) {
        this.ws.send(buildPingReqPacket());
      }
    }, 30000);
  }

  _stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  _cleanupWs() {
    this.isConnected = false;
    this._stopPing();
    if (this.connectTimeoutTimer) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
  }

  disconnect() {
    this.stopLanDiscovery();
    this._cleanupWs();
    this.signalHandlers.clear();
    this.relayHandlers.clear();
    this.lanHandlers.clear();
    this.statusHandlers.clear();
  }
}
