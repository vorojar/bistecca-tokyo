import { ACCENT_LANG } from "./config";
import type { Accent, Lesson, LessonSentence } from "../types/domain";

export class AudioEngine {
  private currentAudio: HTMLAudioElement | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private finishCurrent: (() => void) | null = null;

  async playSentence(lesson: Lesson, sentence: LessonSentence, rate: number): Promise<void> {
    if (sentence.audioUrl) {
      await this.playFile(sentence.audioUrl, rate, sentence.audioStart, sentence.audioEnd);
      return;
    }
    await this.speak(sentence.text, lesson.accent, rate);
  }

  async playText(text: string, accent: Accent = "US", rate = 1): Promise<void> {
    await this.speak(text, accent, rate);
  }

  stop(): void {
    if (this.currentAudio) this.currentAudio.pause();
    if (this.currentUtterance && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    const finish = this.finishCurrent;
    if (finish) finish();
  }

  private playFile(url: string, rate: number, start?: number, end?: number): Promise<void> {
    return new Promise((resolve) => {
      this.stop();
      const audio = new Audio(url);
      this.currentAudio = audio;
      audio.playbackRate = rate || 1;
      if (Number.isFinite(start)) audio.currentTime = Number(start);

      const cleanup = (): void => {
        audio.removeEventListener("ended", cleanup);
        audio.removeEventListener("error", cleanup);
        audio.removeEventListener("timeupdate", stopAtEnd);
        audio.pause();
        if (this.currentAudio === audio) this.currentAudio = null;
        if (this.finishCurrent === cleanup) this.finishCurrent = null;
        resolve();
      };

      const stopAtEnd = (): void => {
        if (Number.isFinite(end) && audio.currentTime >= Number(end)) {
          audio.pause();
          cleanup();
        }
      };

      audio.addEventListener("ended", cleanup);
      audio.addEventListener("error", cleanup);
      audio.addEventListener("timeupdate", stopAtEnd);
      this.finishCurrent = cleanup;
      audio.play().catch(cleanup);
    });
  }

  private speak(text: string, accent: Accent, rate: number): Promise<void> {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) {
        resolve();
        return;
      }

      this.stop();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = ACCENT_LANG[accent];
      utterance.rate = rate || 1;
      utterance.pitch = 1;
      const voice = pickVoice(utterance.lang);
      if (voice) utterance.voice = voice;
      const cleanup = (): void => {
        utterance.onend = null;
        utterance.onerror = null;
        if (this.currentUtterance === utterance) this.currentUtterance = null;
        if (this.finishCurrent === cleanup) this.finishCurrent = null;
        resolve();
      };
      this.currentUtterance = utterance;
      this.finishCurrent = cleanup;
      utterance.onend = cleanup;
      utterance.onerror = cleanup;
      window.speechSynthesis.speak(utterance);
    });
  }
}

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((voice) => voice.lang === lang)
    || voices.find((voice) => voice.lang.startsWith(lang.split("-")[0]))
    || null;
}
