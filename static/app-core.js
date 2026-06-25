    // DOM bindings.
    const statusEl = document.getElementById("status");
    const sessionBtn = document.getElementById("sessionBtn");
    const uploadBtn = document.getElementById("uploadBtn");
    const langToggleBtn = document.getElementById("langToggleBtn");
    const selfTestOpenBtn = document.getElementById("selfTestOpenBtn");
    const identityLabelEl = document.getElementById("identityLabel");
    const modelLabelEl = document.getElementById("modelLabel");
    const voiceLabelEl = document.getElementById("voiceLabel");
    const modeLabelLeftEl = document.getElementById("modeLabelLeft");
    const stageTitleEl = document.getElementById("stageTitle");
    const identityListEl = document.getElementById("identityList");
    const identityNameEl = document.getElementById("identityName");
    const identityFileEl = document.getElementById("identityFile");
    const identityFileBtnEl = document.getElementById("identityFileBtn");
    const identityFileNameEl = document.getElementById("identityFileName");
    const identityFormatsNoteEl = document.getElementById("identityFormatsNote");
    const modelPickerBtnEl = document.getElementById("modelPickerBtn");
    const modelPickerTitleEl = document.getElementById("modelPickerTitle");
    const modelPickerMetaEl = document.getElementById("modelPickerMeta");
    const voicePickerBtnEl = document.getElementById("voicePickerBtn");
    const voicePickerTitleEl = document.getElementById("voicePickerTitle");
    const voicePickerMetaEl = document.getElementById("voicePickerMeta");
    const modeSegmentedEl = document.getElementById("modeSegmented");
    const statsEl = document.getElementById("stats");
    const stageMicMeterEl = document.getElementById("stageMicMeter");
    const stageMicMeterFillEl = document.getElementById("stageMicMeterFill");
    const stageSpeakerMeterEl = document.getElementById("stageSpeakerMeter");
    const stageSpeakerMeterFillEl = document.getElementById("stageSpeakerMeterFill");
    const blockingModalEl = document.getElementById("blockingModal");
    const blockingModalTextEl = document.getElementById("blockingModalText");
    const toastViewportEl = document.getElementById("toastViewport");
    const pickerOverlayEl = document.getElementById("pickerOverlay");
    const pickerBackdropEl = document.getElementById("pickerBackdrop");
    const pickerCloseBtnEl = document.getElementById("pickerCloseBtn");
    const pickerSheetEyebrowEl = document.getElementById("pickerSheetEyebrow");
    const pickerSheetTitleEl = document.getElementById("pickerSheetTitle");
    const pickerOptionsEl = document.getElementById("pickerOptions");
    const selfTestOverlayEl = document.getElementById("selfTestOverlay");
    const selfTestBackdropEl = document.getElementById("selfTestBackdrop");
    const selfTestCloseBtnEl = document.getElementById("selfTestCloseBtn");
    const selfTestSheetEyebrowEl = document.getElementById("selfTestSheetEyebrow");
    const selfTestSheetTitleEl = document.getElementById("selfTestSheetTitle");
    const micSelfTestTitleEl = document.getElementById("micSelfTestTitle");
    const micSelfTestDescEl = document.getElementById("micSelfTestDesc");
    const micSelfTestBadgeEl = document.getElementById("micSelfTestBadge");
    const micSelfTestLocalLabelEl = document.getElementById("micSelfTestLocalLabel");
    const micSelfTestLocalValueEl = document.getElementById("micSelfTestLocalValue");
    const micSelfTestLocalFillEl = document.getElementById("micSelfTestLocalFill");
    const micSelfTestServerLabelEl = document.getElementById("micSelfTestServerLabel");
    const micSelfTestServerValueEl = document.getElementById("micSelfTestServerValue");
    const micSelfTestServerFillEl = document.getElementById("micSelfTestServerFill");
    const micSelfTestHintEl = document.getElementById("micSelfTestHint");
    const micSelfTestBtnEl = document.getElementById("micSelfTestBtn");
    const speakerSelfTestTitleEl = document.getElementById("speakerSelfTestTitle");
    const speakerSelfTestDescEl = document.getElementById("speakerSelfTestDesc");
    const speakerSelfTestBadgeEl = document.getElementById("speakerSelfTestBadge");
    const speakerSelfTestVisualEl = document.getElementById("speakerSelfTestVisual");
    const speakerSelfTestHintEl = document.getElementById("speakerSelfTestHint");
    const speakerSelfTestBtnEl = document.getElementById("speakerSelfTestBtn");
    const statusTextEl = statusEl.querySelector(".status-text");

    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");

    // Runtime state.
    let ws = null;
    let audioContext = null;
    let processor = null;
    let source = null;
    let mediaStream = null;
    let playbackGainNode = null;
    let selfTestWs = null;
    let selfTestAudioContext = null;
    let selfTestProcessor = null;
    let selfTestSource = null;
    let selfTestMediaStream = null;
    let selfTestPlaybackGainNode = null;
    let selectedIdentityId = "";
    let audioPlayCursorSec = 0;
    let llmAudioSampleRate = 16000;
    let selfTestPlaybackCursorSec = 0;
    let selfTestAudioSampleRate = 16000;
    let uiBusy = false;
    let isRealtimeRunning = false;
    let isSelfTestRunning = false;
    let manualStopping = false;
    let isMicMuted = false;
    let isMuted = false;
    let speakerTestAudio = null;
    let isSpeakerTestPlaying = false;
    let currentLang = localStorage.getItem("demo_lang") || "zh";
    let identitiesCache = [];
    let modelsCache = [];
    let voicesCache = [];
    let defaultModelId = "";
    let selectedModelId = "";
    let selectedVoiceId = "";
    let currentModelDefaultVoice = "";
    let currentMode = "talk";
    let activePickerKind = "";
    let isSelfTestOverlayOpen = false;
    let runtimeModeCode = "idle";
    let statsBufferFrames = "-";
    let selfTestStatusCode = "idle";
    let speakerTestStatusCode = "idle";
    let selfTestLocalLevel = 0;
    let selfTestServerLevel = 0;
    let stageMicLevel = 0;
    let stageSpeakerLevel = 0;
    let selfTestErrorMessage = "";
    let speakerTestErrorMessage = "";
    let toastIdSeq = 0;
    const toastTimers = new Map();
    const SESSION_CONFIG_STORAGE_KEY = "demo_session_config_v2";
    const METER_FLOOR_DB = -60;
    const METER_RMS_FULL_DB = -5;
    const METER_PEAK_FULL_DB = 0;
    const STAGE_METER_DECAY_STEP = 0.055;
    const STAGE_METER_IDLE_DECAY_STEP = 0.09;
    const STAGE_METER_TICK_MS = 80;
    const AUDIO_INPUT_CONSTRAINTS = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };

    const requiresExplicitBackend = location.hostname.endsWith("github.io");

    function safeCloseSocket(socket) {
      if (!socket) return;
      try {
        socket.close();
      } catch (_) {}
    }

    // Backend resolution.
    function normalizeBackendOrigin(value) {
      const raw = String(value || "").trim();
      if (!raw) return "";
      try {
        return new URL(raw).origin;
      } catch (_) {
        return "";
      }
    }

    function resolveBackendOrigin() {
      const params = new URLSearchParams(location.search);
      const queryValue = normalizeBackendOrigin(params.get("backend") || "");
      if (queryValue) return queryValue;

      const configValue = normalizeBackendOrigin(window.__DEMO_BACKEND_ORIGIN__ || "");
      if (configValue) return configValue;

      return "";
    }

    let backendOrigin = resolveBackendOrigin();

    function resolveBackendUrl(pathOrUrl) {
      const raw = String(pathOrUrl || "");
      if (/^https?:\/\//i.test(raw)) return raw;
      if (!backendOrigin) return raw;
      return new URL(raw, `${backendOrigin}/`).toString();
    }

    function resolveBackendImageUrl(pathOrUrl) {
      return resolveBackendUrl(pathOrUrl);
    }

    function resolveBackendWebSocketUrl(pathname) {
      if (!backendOrigin) {
        const proto = location.protocol === "https:" ? "wss:" : "ws:";
        return `${proto}//${location.host}${pathname}`;
      }

      const originUrl = new URL(backendOrigin);
      const wsProto = originUrl.protocol === "https:" ? "wss:" : "ws:";
      return `${wsProto}//${originUrl.host}${pathname}`;
    }

    const MODE_OPTIONS = ["talk", "listen", "mimic"];

    const I18N = window.DEMO_I18N;

    function t(key, vars = {}) {
      const table = I18N[currentLang] || I18N.zh;
      let raw = table[key] || I18N.zh[key] || key;
      for (const [k, v] of Object.entries(vars)) {
        raw = raw.replaceAll(`{${k}}`, String(v));
      }
      return raw;
    }

    // UI rendering.
    function runtimeModeText(modeCode) {
      if (modeCode === "llm-enabled") return t("modeLlmEnabled");
      if (modeCode === "listening-only") return t("modeListeningOnly");
      if (modeCode === "mimic") return t("modeMimicRunning");
      return t("stateIdle");
    }

    function renderLangToggle() {
      const langCode = currentLang === "zh" ? "ZH" : "EN";
      langToggleBtn.textContent = `🌐 ${langCode}`;
      langToggleBtn.title = t("langToggleTitle");
      langToggleBtn.setAttribute("aria-label", t("langToggleTitle"));
    }

    function renderFilePickerLabel() {
      const file = identityFileEl.files && identityFileEl.files[0];
      identityFileBtnEl.textContent = t("chooseImageBtn");
      identityFileNameEl.textContent = file ? file.name : t("noFileChosen");
    }

    function hasBackendConnectionConfig() {
      return !!backendOrigin || !requiresExplicitBackend;
    }

    function renderStats() {
      const wsState = isRealtimeRunning ? t("wsConnected") : t("wsDisconnected");
      const modeText = runtimeModeText(runtimeModeCode);
      statsEl.innerHTML = `
        <span class="pill">${t("wsLabel")}: ${wsState}</span>
        <span class="pill">${t("bufferFrames")}: ${statsBufferFrames}</span>
        <span class="pill">${t("stateLabel")}: ${modeText}</span>
      `;
    }

    function clamp01(value) {
      if (!Number.isFinite(value)) return 0;
      return Math.max(0, Math.min(1, value));
    }

    function levelFromDb(value, fullScaleDb) {
      if (!Number.isFinite(value) || value <= 0) return 0;
      const db = 20 * Math.log10(value);
      return clamp01((db - METER_FLOOR_DB) / (fullScaleDb - METER_FLOOR_DB));
    }

    function normalizeMeterLevel(rms, peak = rms) {
      const safeRms = Math.max(0, Number(rms) || 0);
      const safePeak = Math.max(0, Number(peak) || 0);
      const rmsLevel = levelFromDb(safeRms, METER_RMS_FULL_DB);
      const peakLevel = levelFromDb(safePeak, METER_PEAK_FULL_DB);
      return clamp01(Math.max(rmsLevel, peakLevel));
    }

    function setMeterLevel(fillEl, valueEl, level) {
      const safeLevel = clamp01(level);
      if (fillEl) {
        fillEl.style.width = `${(safeLevel * 100).toFixed(1)}%`;
      }
      if (valueEl) {
        valueEl.textContent = `${Math.round(safeLevel * 100)}%`;
      }
    }

    function setStageIconMeter(meterEl, fillEl, level) {
      const safeLevel = clamp01(level);
      if (fillEl) {
        fillEl.style.height = `${(safeLevel * 100).toFixed(1)}%`;
      }
    }

    function setStageAudioButtonState(buttonEl, actionLabel, levelLabel, level, muted) {
      if (!buttonEl) return;
      const percent = Math.round(clamp01(level) * 100);
      const statusText = muted ? `, ${t("stageMutedState")}` : `, ${percent}%`;
      const text = `${levelLabel}${statusText} · ${actionLabel}`;
      buttonEl.setAttribute("aria-label", text);
      buttonEl.title = text;
      buttonEl.classList.toggle("is-muted", !!muted);
      buttonEl.setAttribute("aria-pressed", muted ? "true" : "false");
    }

    function renderStageAudioMeters() {
      setStageIconMeter(stageMicMeterEl, stageMicMeterFillEl, stageMicLevel);
      setStageIconMeter(stageSpeakerMeterEl, stageSpeakerMeterFillEl, stageSpeakerLevel);
      setStageAudioButtonState(
        stageMicMeterEl,
        isMicMuted ? t("stageMicUnmute") : t("stageMicMute"),
        t("stageMicMeterLabel"),
        stageMicLevel,
        isMicMuted,
      );
      setStageAudioButtonState(
        stageSpeakerMeterEl,
        isMuted ? t("stageSpeakerUnmute") : t("stageSpeakerMute"),
        t("stageSpeakerMeterLabel"),
        stageSpeakerLevel,
        isMuted,
      );
    }

    function pushStageAudioMeterLevel(kind, level) {
      const safeLevel = clamp01(level);
      if (kind === "mic") {
        stageMicLevel = Math.max(stageMicLevel, safeLevel);
      } else {
        stageSpeakerLevel = Math.max(stageSpeakerLevel, safeLevel);
      }
    }

    function resetStageAudioMeters() {
      stageMicLevel = 0;
      stageSpeakerLevel = 0;
      renderStageAudioMeters();
    }

    function tickStageAudioMeters() {
      const decay = isRealtimeRunning ? STAGE_METER_DECAY_STEP : STAGE_METER_IDLE_DECAY_STEP;
      stageMicLevel = Math.max(0, stageMicLevel - decay);
      stageSpeakerLevel = Math.max(0, stageSpeakerLevel - decay);
      renderStageAudioMeters();
    }

    function startStageAudioMeterLoop() {
      window.setInterval(tickStageAudioMeters, STAGE_METER_TICK_MS);
    }

    function renderMicSelfTestUi() {
      if (!micSelfTestBadgeEl) return;
      micSelfTestTitleEl.textContent = t("micSelfTestTitle");
      micSelfTestDescEl.textContent = t("micSelfTestDesc");
      micSelfTestLocalLabelEl.textContent = t("micSelfTestLocalLabel");
      micSelfTestServerLabelEl.textContent = t("micSelfTestServerLabel");
      setMeterLevel(micSelfTestLocalFillEl, micSelfTestLocalValueEl, selfTestLocalLevel);
      setMeterLevel(micSelfTestServerFillEl, micSelfTestServerValueEl, selfTestServerLevel);

      let badgeKey = "micSelfTestIdle";
      let badgeClass = "self-test-badge";
      let hintText = t("micSelfTestHint");
      if (selfTestStatusCode === "preparing") {
        badgeKey = "micSelfTestPreparing";
        badgeClass += " warn";
      } else if (selfTestStatusCode === "running") {
        badgeKey = "micSelfTestRunning";
        badgeClass += " active";
      } else if (selfTestStatusCode === "failed") {
        badgeKey = "micSelfTestFailed";
        badgeClass += " error";
        hintText = t("micSelfTestError", { msg: selfTestErrorMessage || "-" });
      }

      micSelfTestBadgeEl.className = badgeClass;
      micSelfTestBadgeEl.textContent = t(badgeKey);
      micSelfTestHintEl.textContent = hintText;
      micSelfTestBtnEl.textContent = isSelfTestRunning ? t("micSelfTestStop") : t("micSelfTestStart");
    }

    function renderSpeakerSelfTestUi() {
      if (!speakerSelfTestBadgeEl) return;
      speakerSelfTestTitleEl.textContent = t("speakerSelfTestTitle");
      speakerSelfTestDescEl.textContent = t("speakerSelfTestDesc");

      let badgeKey = "speakerSelfTestIdle";
      let badgeClass = "self-test-badge";
      let hintText = t("speakerSelfTestHint");
      if (speakerTestStatusCode === "playing") {
        badgeKey = "speakerSelfTestPlaying";
        badgeClass += " active";
      } else if (speakerTestStatusCode === "failed") {
        badgeKey = "speakerSelfTestFailed";
        badgeClass += " error";
        hintText = t("speakerSelfTestError", { msg: speakerTestErrorMessage || "-" });
      }

      speakerSelfTestBadgeEl.className = badgeClass;
      speakerSelfTestBadgeEl.textContent = t(badgeKey);
      speakerSelfTestHintEl.textContent = hintText;
      speakerSelfTestBtnEl.textContent = isSpeakerTestPlaying ? t("speakerSelfTestStop") : t("speakerSelfTestStart");
      speakerSelfTestVisualEl.classList.toggle("playing", isSpeakerTestPlaying);
    }

    function modeShortLabel(mode) {
      if (mode === "talk") return t("modeTalkShort");
      if (mode === "listen") return t("modeListenShort");
      return t("modeMimicShort");
    }

    function modeMetaLabel(mode) {
      if (mode === "talk") return t("modeTalkMeta");
      if (mode === "listen") return t("modeListenMeta");
      return t("modeMimicMeta");
    }

    function renderModeOptions() {
      const selected = MODE_OPTIONS.includes(currentMode) ? currentMode : "talk";
      currentMode = selected;
      modeSegmentedEl.innerHTML = "";
      for (const mode of MODE_OPTIONS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mode-chip" + (mode === selected ? " active" : "");
        btn.dataset.mode = mode;
        btn.setAttribute("aria-pressed", mode === selected ? "true" : "false");
        btn.innerHTML = `
          <span class="mode-chip-title">${modeShortLabel(mode)}</span>
          <span class="mode-chip-meta">${modeMetaLabel(mode)}</span>
        `;
        modeSegmentedEl.appendChild(btn);
      }
    }

    function currentModelMeta() {
      return modelsCache.find((model) => model.id === selectedModelId) || null;
    }

    function voiceDisplayTitle(meta) {
      if (!meta) return "-";
      const zhName = (meta.name && meta.name.zh) || meta.id;
      const enName = (meta.name && meta.name.en) || meta.id;
      return currentLang === "en" ? enName : zhName;
    }

    function renderModelTrigger() {
      const model = currentModelMeta();
      modelPickerTitleEl.textContent = model ? modelLabel(model) : "-";
      const desc = model && model.desc ? model.desc : null;
      modelPickerMetaEl.textContent = model
        ? (currentLang === "en" ? (desc && desc.en) : ((desc && desc.zh) || (desc && desc.en)) || "-")
        : "-";
      modelPickerBtnEl.setAttribute("aria-label", t("pickerModelTitle"));
    }

    function renderVoiceTrigger() {
      voicePickerBtnEl.setAttribute("aria-label", t("pickerVoiceTitle"));
      const meta = currentVoiceMeta(selectedVoiceId);
      if (!meta) {
        voicePickerTitleEl.textContent = "-";
        voicePickerMetaEl.textContent = "-";
        return;
      }
      const desc = meta.desc || {};
      voicePickerTitleEl.textContent = voiceDisplayTitle(meta);
      voicePickerMetaEl.textContent = currentLang === "en"
        ? (desc.en || "-")
        : (desc.zh || desc.en || "-");
    }

    function renderPickerOptions() {
      pickerOptionsEl.innerHTML = "";
      if (!activePickerKind) return;

      const isModel = activePickerKind === "model";
      const items = isModel ? modelsCache : voicesCache;
      const activeId = isModel ? selectedModelId : selectedVoiceId;

      for (const item of items) {
        const id = item.id;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "picker-option" + (id === activeId ? " active" : "");
        const title = isModel ? modelLabel(item) : voiceDisplayTitle(item);
        const meta = isModel
          ? (((item.desc && (currentLang === "en" ? item.desc.en : item.desc.zh)) || (item.desc && item.desc.en) || item.id))
          : (((item.desc && (currentLang === "en" ? item.desc.en : item.desc.zh)) || item.id));
        btn.innerHTML = `
          <span class="picker-option-main">
            <span class="picker-option-title">${title}</span>
            <span class="picker-option-meta">${meta}</span>
          </span>
          <span class="picker-option-check">${id === activeId ? "✓" : ""}</span>
        `;
        btn.addEventListener("click", async () => {
          if (isModel) {
            if (id === selectedModelId) {
              closePicker();
              return;
            }
            const previousModel = selectedModelId;
            const previousVoice = selectedVoiceId || currentModelDefaultVoice;
            closePicker();
            setBusy(true);
            try {
              await refreshVoices(id);
              persistSessionConfigDraft();
            } catch (e) {
              await refreshVoices(previousModel, previousVoice);
              showToast({
                level: "error",
                message: t("alertCatalogLoadFailed", { msg: formatErrorMessage(e) }),
              });
            } finally {
              setBusy(false);
            }
            return;
          }
          selectedVoiceId = id;
          renderVoiceTrigger();
          persistSessionConfigDraft();
          closePicker();
        });
        pickerOptionsEl.appendChild(btn);
      }
    }

    function openPicker(kind) {
      if (uiBusy || isRealtimeRunning) return;
      activePickerKind = kind;
      const isModel = kind === "model";
      pickerSheetEyebrowEl.textContent = isModel ? t("modelLabel") : t("voiceLabel");
      pickerSheetTitleEl.textContent = isModel ? t("pickerModelTitle") : t("pickerVoiceTitle");
      pickerOverlayEl.classList.add("show");
      pickerOverlayEl.setAttribute("aria-hidden", "false");
      modelPickerBtnEl.setAttribute("aria-expanded", isModel ? "true" : "false");
      voicePickerBtnEl.setAttribute("aria-expanded", isModel ? "false" : "true");
      renderPickerOptions();
    }

    function closePicker() {
      activePickerKind = "";
      pickerOverlayEl.classList.remove("show");
      pickerOverlayEl.setAttribute("aria-hidden", "true");
      modelPickerBtnEl.setAttribute("aria-expanded", "false");
      voicePickerBtnEl.setAttribute("aria-expanded", "false");
      pickerOptionsEl.innerHTML = "";
    }

    function openSelfTestOverlay() {
      if (uiBusy || !hasBackendConnectionConfig() || isRealtimeRunning) return;
      if (activePickerKind) closePicker();
      isSelfTestOverlayOpen = true;
      selfTestOverlayEl.classList.add("show");
      selfTestOverlayEl.setAttribute("aria-hidden", "false");
      selfTestOpenBtn.setAttribute("aria-expanded", "true");
    }

    function closeSelfTestOverlay() {
      if (isSelfTestRunning) stopMicSelfTest();
      if (isSpeakerTestPlaying) toggleSpeakerSelfTest();
      isSelfTestOverlayOpen = false;
      selfTestOverlayEl.classList.remove("show");
      selfTestOverlayEl.setAttribute("aria-hidden", "true");
      selfTestOpenBtn.setAttribute("aria-expanded", "false");
    }

    function applyLanguage() {
      if (currentLang !== "zh" && currentLang !== "en") currentLang = "zh";
      document.documentElement.lang = currentLang === "zh" ? "zh-CN" : "en";
      renderLangToggle();
      selfTestOpenBtn.textContent = t("selfTestLabel");
      selfTestOpenBtn.setAttribute("aria-label", t("selfTestLabel"));
      selfTestOpenBtn.title = t("selfTestLabel");
      identityLabelEl.textContent = t("identityLabel");
      identityNameEl.placeholder = t("identityPlaceholder");
      identityFormatsNoteEl.textContent = t("identityFormatsNote");
      uploadBtn.textContent = t("uploadIdentity");
      renderFilePickerLabel();
      modelLabelEl.textContent = t("modelLabel");
      voiceLabelEl.textContent = t("voiceLabel");
      modeLabelLeftEl.textContent = t("modeLabelLeft");
      stageTitleEl.textContent = t("stageTitle");
      renderModeOptions();
      renderModelTrigger();
      renderVoiceTrigger();
      if (activePickerKind) renderPickerOptions();
      renderIdentityList(identitiesCache);
      renderMicSelfTestUi();
      renderSpeakerSelfTestUi();
      renderStageAudioMeters();
      setMuted(isMuted);
      updateControls();
      renderStats();
      if (blockingModalTextEl) {
        blockingModalTextEl.textContent = t("statusInitIdentity");
      }
      pickerCloseBtnEl.setAttribute("aria-label", t("close"));
      pickerCloseBtnEl.title = t("close");
      selfTestCloseBtnEl.setAttribute("aria-label", t("close"));
      selfTestCloseBtnEl.title = t("close");
      selfTestSheetEyebrowEl.textContent = t("selfTestEyebrow");
      selfTestSheetTitleEl.textContent = t("selfTestLabel");
    }

    function showBlockingModal(text) {
      if (!blockingModalEl) return;
      if (blockingModalTextEl) blockingModalTextEl.textContent = text || t("statusInitIdentity");
      blockingModalEl.classList.add("show");
    }

    function hideBlockingModal() {
      if (!blockingModalEl) return;
      blockingModalEl.classList.remove("show");
    }

    // Global status and toast notifications.
    function normalizeStatusLevel(level) {
      if (level === true) return "success";
      if (level === false || level == null || level === "") return "neutral";
      const safe = String(level);
      if (["neutral", "info", "success", "warning", "error"].includes(safe)) {
        return safe;
      }
      return "neutral";
    }

    function toastIcon(level) {
      if (level === "success") return "✓";
      if (level === "warning") return "!";
      if (level === "error") return "!";
      return "i";
    }

    function toastTitleForLevel(level) {
      if (level === "success") return t("toastTitleSuccess");
      if (level === "warning") return t("toastTitleWarning");
      if (level === "error") return t("toastTitleError");
      return t("toastTitleInfo");
    }

    function dismissToast(toastId) {
      const toastEl = document.querySelector(`[data-toast-id="${toastId}"]`);
      const timerId = toastTimers.get(toastId);
      if (timerId) {
        clearTimeout(timerId);
        toastTimers.delete(toastId);
      }
      if (!toastEl) return;
      toastEl.classList.remove("show");
      window.setTimeout(() => {
        if (toastEl.parentNode) {
          toastEl.parentNode.removeChild(toastEl);
        }
      }, 220);
    }

    function showToast(options = {}) {
      if (!toastViewportEl) return;
      const level = normalizeStatusLevel(options.level || "info");
      const toastId = `toast-${++toastIdSeq}`;
      const duration = Number.isFinite(options.duration) ? Number(options.duration) : (level === "success" ? 2600 : 4200);
      const toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.dataset.level = level;
      toastEl.dataset.toastId = toastId;

      const iconEl = document.createElement("div");
      iconEl.className = "toast-icon";
      iconEl.setAttribute("aria-hidden", "true");
      iconEl.textContent = toastIcon(level);

      const bodyEl = document.createElement("div");
      bodyEl.className = "toast-body";

      const titleEl = document.createElement("div");
      titleEl.className = "toast-title";
      titleEl.textContent = String(options.title || toastTitleForLevel(level));
      bodyEl.appendChild(titleEl);

      const message = String(options.message || "").trim();
      if (message) {
        const messageEl = document.createElement("div");
        messageEl.className = "toast-message";
        messageEl.textContent = message;
        bodyEl.appendChild(messageEl);
      }

      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "toast-close";
      closeBtn.setAttribute("aria-label", t("close"));
      closeBtn.title = t("close");
      closeBtn.textContent = "×";
      closeBtn.addEventListener("click", () => dismissToast(toastId));

      toastEl.appendChild(iconEl);
      toastEl.appendChild(bodyEl);
      toastEl.appendChild(closeBtn);
      toastViewportEl.appendChild(toastEl);

      window.requestAnimationFrame(() => {
        toastEl.classList.add("show");
      });

      if (!options.sticky) {
        const timerId = window.setTimeout(() => dismissToast(toastId), Math.max(1200, duration));
        toastTimers.set(toastId, timerId);
      }

      return toastId;
    }

    function setStatus(text, level = "neutral") {
      statusTextEl.textContent = String(text || "");
      statusEl.dataset.level = normalizeStatusLevel(level);
    }

    function formatErrorMessage(error) {
      if (!error) return "-";
      if (typeof error === "string") return error;
      if (error && typeof error.message === "string" && error.message.trim()) {
        return error.message;
      }
      return String(error);
    }

    function isMicPermissionError(error) {
      const name = String(error && error.name ? error.name : "");
      return name === "NotAllowedError" || name === "PermissionDeniedError";
    }

    function updateControls() {
      const disableConfig = uiBusy || isRealtimeRunning || isSelfTestRunning;
      const backendMissing = !hasBackendConnectionConfig();
      uploadBtn.disabled = disableConfig || backendMissing;
      sessionBtn.disabled = uiBusy || backendMissing || isSelfTestRunning || isSpeakerTestPlaying;
      selfTestOpenBtn.disabled = uiBusy || backendMissing || isRealtimeRunning;
      stageMicMeterEl.disabled = uiBusy || !isRealtimeRunning;
      stageSpeakerMeterEl.disabled = uiBusy || !isRealtimeRunning;
      identityNameEl.disabled = disableConfig;
      identityFileEl.disabled = disableConfig;
      identityFileBtnEl.disabled = disableConfig;
      modelPickerBtnEl.disabled = disableConfig || backendMissing || modelsCache.length === 0;
      voicePickerBtnEl.disabled = disableConfig || backendMissing || voicesCache.length === 0;
      micSelfTestBtnEl.disabled = uiBusy || backendMissing || isRealtimeRunning;
      speakerSelfTestBtnEl.disabled = uiBusy || backendMissing || isRealtimeRunning || isSelfTestRunning;
      for (const modeBtn of modeSegmentedEl.querySelectorAll(".mode-chip")) {
        modeBtn.disabled = disableConfig || backendMissing;
      }
      if ((disableConfig || backendMissing) && activePickerKind) closePicker();
      if ((backendMissing || isRealtimeRunning) && isSelfTestOverlayOpen) closeSelfTestOverlay();
      sessionBtn.textContent = isRealtimeRunning ? t("stopSession") : t("startSession");
      sessionBtn.className = isRealtimeRunning ? "btn secondary" : "btn primary";
      renderMicSelfTestUi();
      renderSpeakerSelfTestUi();
      renderStageAudioMeters();
    }

    function setMicMuted(v) {
      isMicMuted = !!v;
      if (isMicMuted) {
        stageMicLevel = 0;
      }
      renderStageAudioMeters();
    }

    function setMuted(v) {
      isMuted = !!v;
      if (playbackGainNode) {
        playbackGainNode.gain.value = isMuted ? 0 : 1;
      }
      if (isMuted) {
        stageSpeakerLevel = 0;
      }
      renderStageAudioMeters();
    }

    function setBusy(b) {
      uiBusy = b;
      updateControls();
    }

    function setRealtimeRunning(v) {
      isRealtimeRunning = v;
      if (!isRealtimeRunning) {
        runtimeModeCode = "idle";
        statsBufferFrames = "-";
      }
      updateControls();
      renderStats();
    }

    function loadSessionConfigDraft() {
      try {
        const raw = localStorage.getItem(SESSION_CONFIG_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (_) {
        return {};
      }
    }

    function getSessionConfigDraft() {
      const mode = MODE_OPTIONS.includes(currentMode) ? currentMode : "talk";
      return {
        identity_id: selectedIdentityId || "",
        model: selectedModelId || defaultModelId || "",
        voice: selectedVoiceId || currentModelDefaultVoice || "",
        mode,
      };
    }

    function persistSessionConfigDraft() {
      localStorage.setItem(SESSION_CONFIG_STORAGE_KEY, JSON.stringify(getSessionConfigDraft()));
    }

    function modelLabel(model) {
      if (!model) return "-";
      const label = model.label || {};
      return currentLang === "en"
        ? (label.en || model.id || "-")
        : (label.zh || label.en || model.id || "-");
    }

    function currentVoiceMeta(voiceId) {
      return voicesCache.find((voice) => voice.id === voiceId) || null;
    }

    // Catalog and identity loading.
    async function refreshModels() {
      const data = await fetchJSON("/api/llm/models");
      modelsCache = Array.isArray(data.models) ? data.models : [];
      defaultModelId = data.default_model || (modelsCache[0] && modelsCache[0].id) || "";
      const validIds = modelsCache.map((model) => model.id);
      selectedModelId = validIds.includes(selectedModelId)
        ? selectedModelId
        : (validIds.includes(defaultModelId) ? defaultModelId : validIds[0] || "");
      renderModelTrigger();
    }

    async function refreshVoices(modelId, preferredVoice = "") {
      const targetModel = modelId || defaultModelId;
      if (!targetModel) {
        voicesCache = [];
        currentModelDefaultVoice = "";
        selectedVoiceId = "";
        renderModelTrigger();
        renderVoiceTrigger();
        return;
      }
      const data = await fetchJSON(`/api/llm/models/${encodeURIComponent(targetModel)}/voices`);
      selectedModelId = data.model || targetModel;
      currentModelDefaultVoice = data.default_voice || "";
      voicesCache = Array.isArray(data.voices) ? data.voices : [];
      const validIds = voicesCache.map((voice) => voice.id);
      const nextVoice = validIds.includes(preferredVoice)
        ? preferredVoice
        : (validIds.includes(selectedVoiceId) ? selectedVoiceId : (validIds.includes(currentModelDefaultVoice) ? currentModelDefaultVoice : validIds[0] || ""));
      selectedVoiceId = nextVoice;
      renderModelTrigger();
      renderVoiceTrigger();
      if (activePickerKind) renderPickerOptions();
    }

    async function initializeAppData() {
      if (!hasBackendConnectionConfig()) {
        identitiesCache = [];
        modelsCache = [];
        voicesCache = [];
        selectedIdentityId = "";
        selectedModelId = "";
        selectedVoiceId = "";
        currentMode = "talk";
        renderIdentityList(identitiesCache);
        renderModeOptions();
        renderModelTrigger();
        renderVoiceTrigger();
        updateControls();
        renderStats();
        setStatus(t("statusBackendRequired"), "warning");
        return;
      }

      try {
        await refreshModels();
        const draft = loadSessionConfigDraft();
        selectedIdentityId = String(draft.identity_id || "").trim();
        currentMode = draft.mode && MODE_OPTIONS.includes(String(draft.mode)) ? String(draft.mode) : "talk";
        const requestedModel = String(draft.model || "").trim();
        if (requestedModel && modelsCache.some((model) => model.id === requestedModel)) {
          selectedModelId = requestedModel;
        }
        await refreshVoices(selectedModelId || defaultModelId, String(draft.voice || "").trim());
        await refreshIdentities();
        persistSessionConfigDraft();
        setMuted(false);
        renderModeOptions();
        updateControls();
        renderStats();
        setStatus(t("statusReady"), "success");
      } catch (e) {
        setStatus(t("statusCatalogLoadFailed"), "error");
        showToast({
          level: "error",
          message: t("alertCatalogLoadFailed", { msg: formatErrorMessage(e) }),
        });
      }
    }
