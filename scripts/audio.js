export class AudioEngine {
  constructor() {
    this.currentAudio = null;
  }

  async playSentence(lesson, sentence, rate = 1) {
    if (sentence.audioUrl) {
      await this.playFile(sentence.audioUrl, rate, sentence.audioStart, sentence.audioEnd);
      return;
    }

    await this.speak(sentence.text, lesson.accent, rate);
  }

  async playText(text, accent = "US", rate = 1) {
    await this.speak(text, accent, rate);
  }

  playFile(url, rate, start, end) {
    return new Promise((resolve) => {
      this.stop();
      const audio = new Audio(url);
      this.currentAudio = audio;
      audio.playbackRate = Number(rate) || 1;
      if (Number.isFinite(start)) audio.currentTime = start;

      const cleanup = () => {
        audio.removeEventListener("ended", cleanup);
        audio.removeEventListener("error", cleanup);
        audio.removeEventListener("timeupdate", stopAtEnd);
        resolve();
      };

      const stopAtEnd = () => {
        if (Number.isFinite(end) && audio.currentTime >= end) {
          audio.pause();
          cleanup();
        }
      };

      audio.addEventListener("ended", cleanup);
      audio.addEventListener("error", cleanup);
      audio.addEventListener("timeupdate", stopAtEnd);
      audio.play().catch(cleanup);
    });
  }

  speak(text, accent, rate = 1) {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) {
        resolve();
        return;
      }

      this.stop();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = accentToLang(accent);
      utterance.rate = Number(rate) || 1;
      utterance.pitch = 1;

      const voice = pickVoice(utterance.lang);
      if (voice) utterance.voice = voice;

      utterance.onend = resolve;
      utterance.onerror = resolve;
      window.speechSynthesis.speak(utterance);
    });
  }

  stop() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }
}

function pickVoice(lang) {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((voice) => voice.lang === lang)
    || voices.find((voice) => voice.lang.startsWith(lang.split("-")[0]))
    || null;
}

function accentToLang(accent) {
  if (accent === "UK") return "en-GB";
  if (accent === "AU") return "en-AU";
  return "en-US";
}
