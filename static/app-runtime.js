    // Shared audio helpers.
    function stopAudioPipeline() {
      if (processor) {
        processor.onaudioprocess = null;
        processor.disconnect();
        processor = null;
      }
      if (source) {
        source.disconnect();
        source = null;
      }
      if (mediaStream) {
        for (const track of mediaStream.getTracks()) {
          track.stop();
        }
        mediaStream = null;
      }
      if (audioContext) {
        audioContext.close().catch(() => {});
        audioContext = null;
      }
      playbackGainNode = null;
      resetStageAudioMeters();
      setMicMuted(false);
      setMuted(false);
    }

    function int16FromFloat32(float32) {
      const out = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        let s = Math.max(-1, Math.min(1, float32[i]));
        out[i] = s < 0 ? s * 32768 : s * 32767;
      }
      return out;
    }

    function levelFromFloat32(buffer) {
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < buffer.length; i++) {
        const sample = buffer[i];
        sum += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
      }
      const rms = buffer.length ? Math.sqrt(sum / buffer.length) : 0;
      return normalizeMeterLevel(rms, peak);
    }

    function levelFromInt16(buffer) {
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < buffer.length; i++) {
        const sample = buffer[i] / 32768.0;
        sum += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
      }
      const rms = buffer.length ? Math.sqrt(sum / buffer.length) : 0;
      return normalizeMeterLevel(rms, peak);
    }

    function downsampleBuffer(buffer, inRate, outRate) {
      if (outRate === inRate) return buffer;
      const ratio = inRate / outRate;
      const newLen = Math.round(buffer.length / ratio);
      const out = new Float32Array(newLen);
      let offset = 0;
      for (let i = 0; i < newLen; i++) {
        const next = Math.round((i + 1) * ratio);
        let acc = 0;
        let count = 0;
        for (let j = offset; j < next && j < buffer.length; j++) {
          acc += buffer[j]; count++;
        }
        out[i] = count ? acc / count : 0;
        offset = next;
      }
      return out;
    }

    async function requestAudioInputStream() {
      const nav = window.navigator;
      if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
        throw new Error("Microphone access requires HTTPS or localhost.");
      }
      if (nav && nav.mediaDevices && typeof nav.mediaDevices.getUserMedia === "function") {
        return await nav.mediaDevices.getUserMedia({
          audio: AUDIO_INPUT_CONSTRAINTS,
        });
      }

      const legacyGetUserMedia = nav && (nav.getUserMedia || nav.webkitGetUserMedia || nav.mozGetUserMedia);
      if (typeof legacyGetUserMedia === "function") {
        return await new Promise((resolve, reject) => {
          legacyGetUserMedia.call(nav, { audio: AUDIO_INPUT_CONSTRAINTS }, resolve, reject);
        });
      }

      throw new Error("This browser does not support microphone capture.");
    }

    function stopSelfTestAudioPipeline() {
      if (selfTestProcessor) {
        selfTestProcessor.onaudioprocess = null;
        selfTestProcessor.disconnect();
        selfTestProcessor = null;
      }
      if (selfTestSource) {
        selfTestSource.disconnect();
        selfTestSource = null;
      }
      if (selfTestMediaStream) {
        for (const track of selfTestMediaStream.getTracks()) {
          track.stop();
        }
        selfTestMediaStream = null;
      }
      if (selfTestAudioContext) {
        selfTestAudioContext.close().catch(() => {});
        selfTestAudioContext = null;
      }
      selfTestPlaybackGainNode = null;
      selfTestPlaybackCursorSec = 0;
    }

    function setSelfTestLevels(localLevel, serverLevel) {
      selfTestLocalLevel = clamp01(localLevel);
      selfTestServerLevel = clamp01(serverLevel);
      setMeterLevel(micSelfTestLocalFillEl, micSelfTestLocalValueEl, selfTestLocalLevel);
      setMeterLevel(micSelfTestServerFillEl, micSelfTestServerValueEl, selfTestServerLevel);
    }

    function finishMicSelfTest(nextStatus, errorMessage = "") {
      if (typeof nextStatus === "string" && nextStatus) {
        selfTestStatusCode = nextStatus;
      }
      selfTestErrorMessage = String(errorMessage || "");
      stopSelfTestAudioPipeline();
      selfTestWs = null;
      isSelfTestRunning = false;
      if (selfTestStatusCode !== "running") {
        setSelfTestLevels(0, 0);
      }
      setBusy(false);
      renderMicSelfTestUi();
      updateControls();
    }

    function playSelfTestEchoPcm(pcm) {
      if (!selfTestAudioContext || !selfTestPlaybackGainNode || !pcm || pcm.length === 0) return;
      const f32 = new Float32Array(pcm.length);
      for (let i = 0; i < pcm.length; i++) {
        f32[i] = pcm[i] / 32768.0;
      }
      const buf = selfTestAudioContext.createBuffer(1, f32.length, selfTestAudioSampleRate || 16000);
      buf.copyToChannel(f32, 0, 0);
      const srcNode = selfTestAudioContext.createBufferSource();
      srcNode.buffer = buf;
      srcNode.connect(selfTestPlaybackGainNode);
      const nowSec = selfTestAudioContext.currentTime;
      if (selfTestPlaybackCursorSec < nowSec + 0.02) {
        selfTestPlaybackCursorSec = nowSec + 0.02;
      }
      srcNode.start(selfTestPlaybackCursorSec);
      selfTestPlaybackCursorSec += buf.duration;
    }

    // Device self-test flows.
    function stopMicSelfTest() {
      const socket = selfTestWs;
      finishMicSelfTest("idle");
      safeCloseSocket(socket);
    }

    async function startMicSelfTest() {
      if (isSelfTestRunning || uiBusy || isRealtimeRunning || !hasBackendConnectionConfig()) return;
      stopSpeakerSelfTest();
      selfTestStatusCode = "preparing";
      selfTestErrorMessage = "";
      setSelfTestLevels(0, 0);
      renderMicSelfTestUi();
      setBusy(true);
      try {
        const socket = new WebSocket(resolveBackendWebSocketUrl("/ws/self-test"));
        selfTestWs = socket;
        socket.binaryType = "arraybuffer";

        socket.onopen = async () => {
          try {
            selfTestMediaStream = await requestAudioInputStream();
            if (selfTestWs !== socket || socket.readyState !== WebSocket.OPEN) {
              finishMicSelfTest("idle");
              return;
            }
            selfTestAudioContext = new (window.AudioContext || window.webkitAudioContext)();
            selfTestPlaybackGainNode = selfTestAudioContext.createGain();
            selfTestPlaybackGainNode.gain.value = 0.92;
            selfTestPlaybackGainNode.connect(selfTestAudioContext.destination);
            selfTestPlaybackCursorSec = selfTestAudioContext.currentTime + 0.04;

            selfTestSource = selfTestAudioContext.createMediaStreamSource(selfTestMediaStream);
            selfTestProcessor = selfTestAudioContext.createScriptProcessor(2048, 1, 1);
            selfTestProcessor.onaudioprocess = (e) => {
              if (selfTestWs !== socket || socket.readyState !== WebSocket.OPEN || !selfTestAudioContext) return;
              const input = e.inputBuffer.getChannelData(0);
              selfTestLocalLevel = levelFromFloat32(input);
              setMeterLevel(micSelfTestLocalFillEl, micSelfTestLocalValueEl, selfTestLocalLevel);

              const mono16k = downsampleBuffer(input, selfTestAudioContext.sampleRate, 16000);
              const i16 = int16FromFloat32(mono16k);
              if (i16.length > 0) {
                socket.send(i16.buffer);
              }
            };
            selfTestSource.connect(selfTestProcessor);
            selfTestProcessor.connect(selfTestAudioContext.destination);
            isSelfTestRunning = true;
            selfTestStatusCode = "running";
            selfTestErrorMessage = "";
            renderMicSelfTestUi();
            setBusy(false);
            updateControls();
          } catch (e) {
            const msg = (e && e.message) ? e.message : e;
            const activeSocket = selfTestWs === socket ? socket : null;
            finishMicSelfTest("failed", msg || "-");
            safeCloseSocket(activeSocket);
          }
        };

        socket.onmessage = (event) => {
          if (selfTestWs !== socket) return;
          if (typeof event.data === "string") {
            try {
              const meta = JSON.parse(event.data);
              if (meta.type === "init") {
                selfTestAudioSampleRate = meta.audio_sample_rate || meta.sample_rate || 16000;
                return;
              }
              if (meta.type === "stats") {
                selfTestServerLevel = normalizeMeterLevel(meta.rms, meta.peak);
                setMeterLevel(micSelfTestServerFillEl, micSelfTestServerValueEl, selfTestServerLevel);
              }
            } catch (_) {}
            return;
          }

          if (!selfTestAudioContext) return;
          playSelfTestEchoPcm(new Int16Array(event.data));
        };

        socket.onclose = () => {
          if (selfTestWs !== socket) return;
          const nextStatus = selfTestStatusCode === "failed" ? "failed" : "idle";
          finishMicSelfTest(nextStatus, selfTestStatusCode === "failed" ? selfTestErrorMessage : "");
        };

        socket.onerror = () => {
          if (selfTestWs !== socket) return;
          selfTestStatusCode = "failed";
          selfTestErrorMessage = selfTestErrorMessage || t("statusError");
        };
      } catch (e) {
        finishMicSelfTest("failed", (e && e.message) ? e.message : e);
      }
    }

    function stopSpeakerSelfTest() {
      if (speakerTestAudio) {
        speakerTestAudio.pause();
        speakerTestAudio.src = "";
        speakerTestAudio = null;
      }
      isSpeakerTestPlaying = false;
      speakerTestStatusCode = "idle";
      speakerTestErrorMessage = "";
      renderSpeakerSelfTestUi();
      updateControls();
    }

    async function toggleSpeakerSelfTest() {
      if (isSpeakerTestPlaying) {
        stopSpeakerSelfTest();
        return;
      }
      if (uiBusy || isRealtimeRunning || isSelfTestRunning || !hasBackendConnectionConfig()) return;

      const audio = new Audio(resolveBackendUrl(`/api/self-test/tone.wav?ts=${Date.now()}`));
      audio.preload = "auto";
      audio.addEventListener("ended", () => {
        if (speakerTestAudio !== audio) return;
        stopSpeakerSelfTest();
      });
      audio.addEventListener("error", () => {
        if (speakerTestAudio !== audio) return;
        speakerTestAudio = null;
        isSpeakerTestPlaying = false;
        speakerTestStatusCode = "failed";
        speakerTestErrorMessage = t("statusError");
        renderSpeakerSelfTestUi();
        updateControls();
      });

      try {
        speakerTestAudio = audio;
        isSpeakerTestPlaying = true;
        speakerTestStatusCode = "playing";
        speakerTestErrorMessage = "";
        renderSpeakerSelfTestUi();
        updateControls();
        await audio.play();
      } catch (e) {
        speakerTestAudio = null;
        isSpeakerTestPlaying = false;
        speakerTestStatusCode = "failed";
        speakerTestErrorMessage = (e && e.message) ? e.message : e;
        renderSpeakerSelfTestUi();
        updateControls();
      }
    }

    async function fetchJSON(url, options={}) {
      const requestUrl = resolveBackendUrl(url);
      const res = await fetch(requestUrl, options);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      return await res.json();
    }

    function syncIdentitySelection() {
      const items = identityListEl.querySelectorAll(".identity-item");
      for (const item of items) {
        const identityId = item.getAttribute("data-identity-id") || "";
        item.classList.toggle("active", identityId === selectedIdentityId);
      }
    }

    function renderIdentityList(identities) {
      identityListEl.innerHTML = "";
      for (const id of identities) {
        const item = document.createElement("div");
        item.setAttribute("data-identity-id", id.identity_id || "");
        item.className = "identity-item" + (id.identity_id === selectedIdentityId ? " active" : "");
        item.innerHTML = `
          <img src="${resolveBackendImageUrl(id.image_url)}" alt="${id.name || id.identity_id}" loading="lazy" decoding="async" />
          <div>
            <div class="name">${id.name || id.identity_id}</div>
          </div>
          <button class="identity-delete" type="button" aria-label="${t("deleteIdentity")}" title="${t("deleteIdentity")}">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 6h18"></path>
              <path d="M8 6V4h8v2"></path>
              <path d="M19 6l-1 14H6L5 6"></path>
              <path d="M10 11v5"></path>
              <path d="M14 11v5"></path>
            </svg>
          </button>
        `;
        item.onclick = () => {
          if (isRealtimeRunning || uiBusy) return;
          if (selectedIdentityId === id.identity_id) return;
          selectedIdentityId = id.identity_id;
          syncIdentitySelection();
          persistSessionConfigDraft();
        };
        const delBtn = item.querySelector(".identity-delete");
        delBtn.onclick = async (e) => {
          e.stopPropagation();
          await deleteIdentity(id.identity_id, id.name || id.identity_id);
        };
        identityListEl.appendChild(item);
      }
    }

    async function deleteIdentity(identityId, displayName) {
      if (isRealtimeRunning || uiBusy) return;
      if (!confirm(t("confirmDelete1", { name: displayName }))) return;

      setBusy(true);
      try {
        const res = await fetch(resolveBackendUrl(`/api/identities/${encodeURIComponent(identityId)}`), {
          method: "DELETE",
        });
        if (!res.ok) throw new Error(await res.text());

        if (selectedIdentityId === identityId) {
          selectedIdentityId = "";
          persistSessionConfigDraft();
        }
        await refreshIdentities();
        setStatus(t("statusDeleted"), "success");
        showToast({ level: "success", message: t("statusDeleted") });
      } catch (e) {
        showToast({
          level: "error",
          message: t("alertDeleteFailed", { msg: formatErrorMessage(e) }),
        });
        setStatus(t("statusDeleteFailed"), "error");
      } finally {
        setBusy(false);
      }
    }

    async function refreshIdentities() {
      const data = await fetchJSON("/api/identities");
      identitiesCache = data.identities || [];
      if (
        selectedIdentityId &&
        !identitiesCache.some((identity) => identity.identity_id === selectedIdentityId)
      ) {
        selectedIdentityId = "";
        persistSessionConfigDraft();
      }
      renderIdentityList(identitiesCache);
    }

    async function fetchRuntimeStatus() {
      return await fetchJSON("/api/session/runtime-status");
    }

    async function uploadIdentity() {
      const file = identityFileEl.files[0];
      if (!file) {
        showToast({ level: "warning", message: t("alertChooseImage") });
        return;
      }
      showBlockingModal(t("statusInitIdentity"));
      setBusy(true);
      try {
        const fd = new FormData();
        fd.append("image", file);
        fd.append("name", identityNameEl.value || "");
        const res = await fetch(resolveBackendUrl("/api/identities/upload"), { method: "POST", body: fd });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        selectedIdentityId = data.identity.identity_id;
        identityFileEl.value = "";
        renderFilePickerLabel();
        await refreshIdentities();
        persistSessionConfigDraft();
        setStatus(t("statusIdentityReady"), "success");
        showToast({ level: "success", message: t("statusIdentityReady") });
      } catch (e) {
        showToast({
          level: "error",
          message: t("alertUploadFailed", { msg: formatErrorMessage(e) }),
        });
        setStatus(t("statusInitFailed"), "error");
      } finally {
        hideBlockingModal();
        setBusy(false);
      }
    }

    // Realtime session lifecycle.
    async function startLocalAudioStream(socket, isRejected = () => false) {
      mediaStream = await requestAudioInputStream();
      if (isRejected() || ws !== socket || socket.readyState !== WebSocket.OPEN) {
        stopAudioPipeline();
        return;
      }
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      playbackGainNode = audioContext.createGain();
      playbackGainNode.gain.value = isMuted ? 0 : 1;
      playbackGainNode.connect(audioContext.destination);
      audioPlayCursorSec = audioContext.currentTime + 0.08;

      source = audioContext.createMediaStreamSource(mediaStream);
      processor = audioContext.createScriptProcessor(2048, 1, 1);

      processor.onaudioprocess = (e) => {
        if (isRejected() || ws !== socket || socket.readyState !== WebSocket.OPEN || !audioContext) return;
        const input = e.inputBuffer.getChannelData(0);
        // Reflect the browser-processed capture path, including echo cancellation.
        if (!isMicMuted) {
          pushStageAudioMeterLevel("mic", levelFromFloat32(input));
        }
        const mono16k = downsampleBuffer(input, audioContext.sampleRate, 16000);
        const i16 = int16FromFloat32(mono16k);
        socket.send((isMicMuted ? new Int16Array(i16.length) : i16).buffer);
      };
      source.connect(processor);
      processor.connect(audioContext.destination);
      setRealtimeRunning(true);
      setStatus(t("statusConnected"), "success");
    }

    async function startRealtime() {
      if (isRealtimeRunning || uiBusy || isSelfTestRunning || isSpeakerTestPlaying) return;
      setBusy(true);
      setStatus(t("statusConnecting"), "info");
      try {
        const runtime = await fetchRuntimeStatus();
        if (runtime.busy) {
          setStatus(t("statusResourceBusy"), "warning");
          setBusy(false);
          showToast({ level: "warning", message: t("alertResourceBusy") });
          return;
        }

        persistSessionConfigDraft();

        const socket = new WebSocket(resolveBackendWebSocketUrl("/ws"));
        ws = socket;
        socket.binaryType = "arraybuffer";
        let sessionRejected = false;
        let sessionInitialized = false;

        const rejectSession = ({
          status,
          statusLevel = "error",
          toastLevel = "error",
          toastMessage = "",
          toastTitle = "",
        } = {}) => {
          if (sessionRejected) return;
          sessionRejected = true;
          stopAudioPipeline();
          if (status) {
            setStatus(status, statusLevel);
          }
          if (toastMessage) {
            showToast({
              level: toastLevel,
              title: toastTitle,
              message: toastMessage,
            });
          }
          safeCloseSocket(socket);
        };

        socket.onopen = () => {
          try {
            socket.send(JSON.stringify({
              type: "start",
              config: getSessionConfigDraft(),
            }));
          } catch (e) {
            rejectSession({
              status: t("statusError"),
              statusLevel: "error",
              toastLevel: "error",
              toastMessage: t("alertStartFailed", { msg: formatErrorMessage(e) }),
            });
          }
        };

        socket.onmessage = (event) => {
          if (ws !== socket) return;
          if (typeof event.data === "string") {
            try {
              const meta = JSON.parse(event.data);
              if (meta.type === "busy") {
                rejectSession({
                  status: t("statusResourceBusy"),
                  statusLevel: "warning",
                  toastLevel: "warning",
                  toastMessage: t("alertResourceBusy"),
                });
                return;
              }
              if (meta.type === "error") {
                if (meta.code === "identity_load_failed") {
                  rejectSession({
                    status: t("statusIdentityLoadFailed"),
                    statusLevel: "error",
                    toastLevel: "error",
                    toastMessage: t("alertIdentityLoadFailed", { msg: meta.detail || "-" }),
                  });
                } else {
                  rejectSession({
                    status: t("statusError"),
                    statusLevel: "error",
                    toastLevel: "error",
                    toastMessage: t("alertStartFailed", { msg: meta.detail || meta.code || "unknown" }),
                  });
                }
                return;
              }
              if (meta.type === "init") {
                llmAudioSampleRate = meta.audio_sample_rate || 16000;
                if (meta.model) {
                  selectedModelId = String(meta.model);
                }
                if (meta.voice) {
                  selectedVoiceId = String(meta.voice);
                  renderVoiceTrigger();
                }
                if (meta.mode && MODE_OPTIONS.includes(String(meta.mode))) {
                  currentMode = String(meta.mode);
                  renderModeOptions();
                }
                renderModelTrigger();
                persistSessionConfigDraft();
                if (!sessionInitialized) {
                  sessionInitialized = true;
                  startLocalAudioStream(socket, () => sessionRejected)
                    .catch((e) => {
                      if (isMicPermissionError(e)) {
                        rejectSession({
                          status: t("statusMicFailed"),
                          statusLevel: "error",
                          toastLevel: "error",
                          toastMessage: t("alertMicPermissionDenied"),
                        });
                        return;
                      }
                      rejectSession({
                        status: t("statusMicFailed"),
                        statusLevel: "error",
                        toastLevel: "error",
                        toastMessage: t("alertMicFailed", { msg: formatErrorMessage(e) }),
                      });
                    })
                    .finally(() => {
                      if (ws === socket) {
                        setBusy(false);
                      }
                    });
                }
                return;
              }
              if (meta.type === "stats") {
                statsBufferFrames = String(meta.buffer_frames ?? "-");
                runtimeModeCode = String(meta.mode || "idle");
                renderStats();
              }
            } catch (_) {}
            return;
          }

          if (sessionRejected || !audioContext) return;
          const bytes = new Uint8Array(event.data);
          const msgType = bytes[0];
          if (msgType !== 3) return;

          const dv = new DataView(event.data);
          const audioLen = dv.getUint32(9, true);
          const frameLen = dv.getUint32(13, true);
          const audioStart = 17;
          const audioEnd = audioStart + audioLen;
          const frameEnd = audioEnd + frameLen;
          if (frameEnd > bytes.length) return;

          const audioBytes = event.data.slice(audioStart, audioEnd);
          const pcm = new Int16Array(audioBytes);
          let frameDelayMs = 0;
          if (pcm.length > 0) {
            if (!isMuted) {
              pushStageAudioMeterLevel("speaker", levelFromInt16(pcm));
            }
            const f32 = new Float32Array(pcm.length);
            for (let i = 0; i < pcm.length; i++) f32[i] = pcm[i] / 32768.0;
            const buf = audioContext.createBuffer(1, f32.length, llmAudioSampleRate);
            buf.copyToChannel(f32, 0, 0);
            const srcNode = audioContext.createBufferSource();
            srcNode.buffer = buf;
            srcNode.connect(playbackGainNode || audioContext.destination);
            const nowSec = audioContext.currentTime;
            if (audioPlayCursorSec < nowSec + 0.03) {
              audioPlayCursorSec = nowSec + 0.03;
            }
            const packetStartSec = audioPlayCursorSec;
            srcNode.start(packetStartSec);
            frameDelayMs = Math.max(0, (packetStartSec - nowSec) * 1000.0);
            audioPlayCursorSec += buf.duration;
          }

          const jpeg = bytes.slice(audioEnd, frameEnd);
          const blob = new Blob([jpeg], { type: "image/jpeg" });
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            setTimeout(() => {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              URL.revokeObjectURL(url);
            }, frameDelayMs);
          };
          img.src = url;
        };

        socket.onclose = () => {
          if (ws !== socket) return;
          stopAudioPipeline();
          const byUser = manualStopping;
          const rejected = sessionRejected;
          manualStopping = false;
          setRealtimeRunning(false);
          setBusy(false);
          if (!rejected) {
            setStatus(byUser ? t("statusStopped") : t("statusClosed"), byUser ? "success" : "warning");
          }
          ws = null;
        };
        socket.onerror = () => {
          if (ws !== socket) return;
          setStatus(t("statusError"), "error");
        };
      } catch (e) {
        setStatus(t("statusError"), "error");
        showToast({
          level: "error",
          message: t("alertStartFailed", { msg: formatErrorMessage(e) }),
        });
        setBusy(false);
      }
    }

    function stopRealtime() {
      if (!ws) return;
      manualStopping = true;
      setStatus(t("statusStopping"), "info");
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }

    function closeRealtimeForPageExit() {
      if (ws) {
        safeCloseSocket(ws);
      }
      stopAudioPipeline();
      ws = null;
      if (selfTestWs) {
        safeCloseSocket(selfTestWs);
      }
      stopSelfTestAudioPipeline();
      selfTestWs = null;
      isSelfTestRunning = false;
      selfTestStatusCode = "idle";
      selfTestErrorMessage = "";
      selfTestLocalLevel = 0;
      selfTestServerLevel = 0;
      if (speakerTestAudio) {
        speakerTestAudio.pause();
        speakerTestAudio.src = "";
      }
      speakerTestAudio = null;
      isSpeakerTestPlaying = false;
      speakerTestStatusCode = "idle";
      speakerTestErrorMessage = "";
    }

    // Event wiring.
    uploadBtn.addEventListener("click", uploadIdentity);
    micSelfTestBtnEl.addEventListener("click", () => {
      if (isSelfTestRunning) stopMicSelfTest();
      else startMicSelfTest();
    });
    speakerSelfTestBtnEl.addEventListener("click", () => {
      toggleSpeakerSelfTest();
    });
    selfTestOpenBtn.addEventListener("click", () => {
      openSelfTestOverlay();
    });
    sessionBtn.addEventListener("click", () => {
      if (isRealtimeRunning) stopRealtime();
      else startRealtime();
    });
    stageMicMeterEl.addEventListener("click", () => {
      if (stageMicMeterEl.disabled) return;
      setMicMuted(!isMicMuted);
    });
    stageSpeakerMeterEl.addEventListener("click", () => {
      if (stageSpeakerMeterEl.disabled) return;
      setMuted(!isMuted);
    });
    selfTestBackdropEl.addEventListener("click", closeSelfTestOverlay);
    selfTestCloseBtnEl.addEventListener("click", closeSelfTestOverlay);
    identityFileBtnEl.addEventListener("click", () => {
      if (identityFileBtnEl.disabled) return;
      identityFileEl.click();
    });
    identityFileEl.addEventListener("change", () => {
      renderFilePickerLabel();
    });
    modelPickerBtnEl.addEventListener("click", () => {
      openPicker("model");
    });
    voicePickerBtnEl.addEventListener("click", () => {
      openPicker("voice");
    });
    modeSegmentedEl.addEventListener("click", (event) => {
      const btn = event.target.closest(".mode-chip");
      if (!btn || btn.disabled) return;
      const mode = btn.dataset.mode || "";
      if (!MODE_OPTIONS.includes(mode) || mode === currentMode) return;
      currentMode = mode;
      renderModeOptions();
      persistSessionConfigDraft();
    });
    pickerBackdropEl.addEventListener("click", closePicker);
    pickerCloseBtnEl.addEventListener("click", closePicker);
    langToggleBtn.addEventListener("click", () => {
      currentLang = currentLang === "zh" ? "en" : "zh";
      localStorage.setItem("demo_lang", currentLang);
      applyLanguage();
    });
    window.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (activePickerKind) {
        closePicker();
        return;
      }
      if (isSelfTestOverlayOpen) closeSelfTestOverlay();
    });
    window.addEventListener("pagehide", closeRealtimeForPageExit);
    window.addEventListener("beforeunload", closeRealtimeForPageExit);

    startStageAudioMeterLoop();
    applyLanguage();

    (async () => {
      await initializeAppData();
    })();
