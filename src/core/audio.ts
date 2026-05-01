import { ACCENT_LANG } from "./config";
import type { Accent, Lesson, LessonSentence } from "../types/domain";

export class AudioEngine {
  private currentAudio: HTMLAudioElement | null = null;

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
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
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
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
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
