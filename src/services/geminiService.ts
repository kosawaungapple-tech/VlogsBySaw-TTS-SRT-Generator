import { GoogleGenAI, Modality, ThinkingLevel } from "@google/genai";
import { TTSConfig, AudioResult, SRTSubtitle } from "../types";
import { GEMINI_MODELS, VOICE_OPTIONS } from "../constants";
import { pcmToWav, formatTime } from "../utils/audioUtils";

export class GeminiTTSService {
  private ai: GoogleGenAI;
  private apiKeys: string[];
  private static currentKeyIndex: number = 0;
  private static keyStatuses: { [index: number]: { isRateLimited: boolean; lastUsed: number } } = {};

  constructor(apiKeys?: string | string[]) {
    if (Array.isArray(apiKeys)) {
      this.apiKeys = apiKeys.filter(k => k.trim()).map(k => k.trim());
    } else {
      const rawKey = apiKeys || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '') || '';
      // Support comma-separated keys if passed as string
      this.apiKeys = rawKey.split(',').map(k => k.trim()).filter(k => k);
    }

    if (this.apiKeys.length === 0) {
      this.apiKeys = [''];
    }

    // Initialize statuses if not already present
    this.apiKeys.forEach((_, i) => {
      if (!GeminiTTSService.keyStatuses[i]) {
        GeminiTTSService.keyStatuses[i] = { isRateLimited: false, lastUsed: 0 };
      }
    });

    console.log("GeminiTTSService: Initialized with", this.apiKeys.length, "keys");
    this.ai = new GoogleGenAI({ apiKey: this.apiKeys[GeminiTTSService.currentKeyIndex] || this.apiKeys[0], apiVersion: 'v1beta' });
  }

  public static getActiveKeyIndex(): number {
    return GeminiTTSService.currentKeyIndex;
  }

  public getKeyCount(): number {
    return this.apiKeys.length;
  }

  private rotateKey(): boolean {
    if (this.apiKeys.length <= 1) return false;
    
    // Mark current key as rate limited
    GeminiTTSService.keyStatuses[GeminiTTSService.currentKeyIndex].isRateLimited = true;
    GeminiTTSService.keyStatuses[GeminiTTSService.currentKeyIndex].lastUsed = Date.now();

    // Find next available key that isn't rate limited (or the one that was limited longest ago)
    let nextIndex = (GeminiTTSService.currentKeyIndex + 1) % this.apiKeys.length;
    let found = false;
    
    // Try to find a non-limited key
    for (let i = 0; i < this.apiKeys.length; i++) {
      const idx = (GeminiTTSService.currentKeyIndex + 1 + i) % this.apiKeys.length;
      if (!GeminiTTSService.keyStatuses[idx].isRateLimited) {
        nextIndex = idx;
        found = true;
        break;
      }
    }

    // If all are limited, just pick the next one anyway (it might have recovered)
    if (!found) {
      nextIndex = (GeminiTTSService.currentKeyIndex + 1) % this.apiKeys.length;
    }

    GeminiTTSService.currentKeyIndex = nextIndex;
    const nextKey = this.apiKeys[GeminiTTSService.currentKeyIndex];
    this.ai = new GoogleGenAI({ apiKey: nextKey, apiVersion: 'v1beta' });
    console.log(`GeminiTTSService: Rotated to key index ${GeminiTTSService.currentKeyIndex} (Starts with ${nextKey.substring(0, 4)}...)`);
    return true;
  }

  async verifyConnection(): Promise<{ isValid: boolean; status?: number; error?: string }> {
    if (!this.apiKeys[GeminiTTSService.currentKeyIndex]) {
      console.error("GeminiTTSService: Cannot verify connection - Current API Key is empty");
      return { isValid: false, error: "Empty API Key" };
    }

    try {
      console.log("GeminiTTSService: Verifying connection with models.list...");
      const response = await this.ai.models.list();
      
      if (response) {
        return { isValid: true };
      } else {
        return { isValid: false, error: "No response from models.list" };
      }
    } catch (err: any) {
      console.error("GeminiTTSService: Verification failed:", err);
      return { isValid: false, error: err.message, status: err.status };
    }
  }

  public async preProcessScript(text: string, targetSeconds: number): Promise<string> {
    if (targetSeconds <= 0) return text;

    // Use a fast model for reasoning
    const model = 'gemini-3-flash-preview'; 
    const baselineCharsPerSec = 17;
    const estimatedDuration = text.length / baselineCharsPerSec;

    // If text is significantly too long (e.g. > 130% of target duration), we suggest condensing
    if (estimatedDuration > targetSeconds * 1.3) {
      console.log(`TTS Service: Script pre-processing - Text likely too long (${estimatedDuration.toFixed(2)}s vs ${targetSeconds}s). Condensing...`);
      
      try {
        const response = await this.ai.models.generateContent({
          model,
          contents: `I need to narrate the following text in exactly ${targetSeconds} seconds. 
          Current text is too long. Please condense it while maintaining the original meaning and cinematic tone. 
          Return ONLY the condensed text, no preamble. 
          
          Text: ${text}`,
          config: {
            temperature: 0.3
          }
        });

        const condensedText = response.text?.trim();
        if (condensedText) {
          console.log(`TTS Service: Script condensed from ${text.length} to ${condensedText.length} chars.`);
          return condensedText;
        }
      } catch (err) {
        console.error("TTS Service: Script condensation failed", err);
      }
    }

    return text;
  }

  public async generateTTS(
    text: string, 
    config: TTSConfig, 
    forceMock: boolean = false,
    onProgress?: (progress: number) => void,
    signal?: AbortSignal
  ): Promise<AudioResult & { isSimulation?: boolean }> {
    console.log("TTS Service: Starting generation...", { 
      forceMock, 
      textLength: text.length,
      model: config.model
    });

    if (signal?.aborted) throw new Error("AbortError");

    // [PRE-PROCESSING CHECK]
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    const targetDuration = config.targetDuration;
    const totalTargetSeconds = targetDuration ? (targetDuration.minutes * 60 + targetDuration.seconds) : 0;
    
    // Burmese characters are dense, so we check character length too
    const charCount = text.length;
    if (totalTargetSeconds > 0) {
      // 5000 chars is roughly 300 seconds (5 mins) at 16 chars/sec.
      // If user wants 1 minute (60s), that's 5x speed boost (unnatural)
      const maxNaturalChars = totalTargetSeconds * 25; // 25 chars/sec is very fast rapping
      if (charCount > maxNaturalChars) {
        throw new Error(`TEXT_TOO_LONG|${charCount}|${maxNaturalChars}`);
      }
    }

    // No fallback to mock as ordered by commander
    if (forceMock) {
      throw new Error("MOCK_MODE_DISABLED");
    }

    if (!this.apiKeys[GeminiTTSService.currentKeyIndex]) {
      throw new Error("API_KEY_MISSING");
    }

    const voiceId = config.voiceId || 'zephyr';
    const voice = VOICE_OPTIONS.find(v => v.id === voiceId) || VOICE_OPTIONS[0];
    const language = voice.name.split(' ')[0];
    const { vocalStyle = 'natural', styleInstruction = '', pitch = 0, volume = 80 } = config;
    
    // Request Validation (Error 400 Fix)
    let speed = Math.max(0.25, Math.min(4.0, parseFloat(String(config.speed)) || 1.0));

    if (totalTargetSeconds > 0) {
      // [SINGLE-PASS TEMPO SYNC - COMMANDER ORDER]
      const baselineCPS = language === 'Burmese' ? 14.0 : 16.5; 
      const estimatedBaseDuration = text.length / baselineCPS;
      
      const calculatedSpeed = Math.max(0.6, Math.min(2.8, estimatedBaseDuration / totalTargetSeconds));
      
      speed = calculatedSpeed;
      console.log(`TTS Service: Single-Pass Sync - Speed: ${speed.toFixed(2)}x`);
    }

    const payload = {
      model: config.model || GEMINI_MODELS.TTS,
      contents: [{ parts: [{ text: `Vocal Style: ${vocalStyle}. ${styleInstruction ? `Style Instruction: ${styleInstruction}. ` : ""}
      Speaking rate: ${speed.toFixed(2)}x. 
      Pitch: ${pitch.toFixed(1)}. 
      Volume: ${volume}%.
      Language: ${language}.
      Ensure word-for-word accuracy: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        temperature: config.creativityLevel || 0.4,
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voice.voiceName
            }
          }
        }
      }
    };

    console.log("TTS Service: API Payload", JSON.stringify(payload, null, 2));

    let attempts = 0;
    const maxAttempts = this.apiKeys.length;

    while (attempts < maxAttempts) {
      try {
        if (signal?.aborted) throw new Error("AbortError");
        console.log(`TTS Service: Sending request (Attempt ${attempts + 1}/${maxAttempts}) using key index ${GeminiTTSService.currentKeyIndex} with 60s timeout`);
        
        // [60-SECOND EMERGENCY TIMEOUT - COMMANDER ORDER]
        const apiPromise = this.ai.models.generateContent(payload);
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error("GENERATION_TIMEOUT")), 60000)
        );

        const response = await Promise.race([apiPromise, timeoutPromise]);
        if (signal?.aborted) throw new Error("AbortError");

        console.log("TTS Service: Received response from API");

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

        if (!base64Audio) {
          throw new Error('No audio data received from Gemini');
        }

        const binaryString = window.atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const sampleRate = 24000;
        
        // Calculate actual duration
        const actualDuration = bytes.length / (sampleRate * 2);
        
        // [PURE SINGLE-PASS ESTIMATION - COMMANDER ORDER]
        // Abandonment of post-process sync loops. Trust the estimation once.
        const finalBytes = bytes;
        
        onProgress?.(100);
        const wavBlob = pcmToWav(finalBytes, sampleRate);
        const audioUrl = URL.createObjectURL(wavBlob);
        
        const effectiveDuration = totalTargetSeconds > 0 ? totalTargetSeconds : actualDuration;
        const subtitles = this.generateMockSRT(text, effectiveDuration);
        const srtContent = subtitles.map(s => 
          `${s.index}\n${s.startTime} --> ${s.endTime}\n${s.text}`
        ).join('\n\n') + '\n\n';

        // [ULTIMATE STACK OVERFLOW FIX - NO SPREAD, ASYNC FILEREADER]
        const finalBase64 = await this.uint8ArrayToBase64Async(finalBytes);

        console.log("TTS Service: API generation successful", { actualDuration, finalDuration: (finalBytes.length / (sampleRate * 2)) });
        return {
          audioUrl,
          audioData: finalBase64,
          srtContent,
          subtitles
        };
      } catch (err: any) {
        if (err.message === 'AbortError' || err.name === 'AbortError') {
          throw err;
        }

        const isRateLimit = err.status === 429 || 
                          (err.message && err.message.includes('429')) || 
                          (err.details && err.details.includes('429')) ||
                          (err.message && err.message.toLowerCase().includes('rate limit'));
        
        if (isRateLimit && attempts < maxAttempts - 1) {
          console.warn(`TTS Service: Rate limit hit (429) on key index ${GeminiTTSService.currentKeyIndex}. Rotating key...`);
          this.rotateKey();
          attempts++;
          continue;
        }

        if (isRateLimit && attempts >= maxAttempts - 1) {
          throw new Error("RATE_LIMIT_EXHAUSTED");
        }

        if (err.status === 500 || (err.message && err.message.includes('500'))) {
          throw new Error("SERVER_BUSY_RETRY");
        }

        console.error("TTS Service: API call failed.", {
          message: err.message,
          status: err.status,
          attempts: attempts + 1
        });
        
        throw err;
      }
    }

    throw new Error("TTS Service: Exhausted all available API channels.");
  }

  async rewriteContent(text: string): Promise<string> {
    console.log("GeminiTTSService: Rewriting content...");
    
    if (!this.apiKeys[GeminiTTSService.currentKeyIndex]) {
      throw new Error("No API Key available for rewriting");
    }

    const prompt = `You are a professional Burmese content creator. Paraphrase the following text to be unique, engaging, and copyright-safe. Use a natural storytelling tone. Original text: ${text}`;

    let attempts = 0;
    const maxAttempts = this.apiKeys.length;

    while (attempts < maxAttempts) {
      try {
        const response = await this.ai.models.generateContent({
          model: GEMINI_MODELS.REWRITE,
          contents: prompt,
        });

        const resultText = response.text;
        if (!resultText) {
          throw new Error("No text returned from Gemini");
        }

        return resultText.trim();
      } catch (err: any) {
        const isRateLimit = err.status === 429 || (err.message && err.message.includes('429'));
        
        if (isRateLimit && attempts < maxAttempts - 1) {
          this.rotateKey();
          attempts++;
          continue;
        }

        if (isRateLimit && attempts >= maxAttempts - 1) {
          throw new Error("RATE_LIMIT_EXHAUSTED");
        }
        throw err;
      }
    }
    throw new Error("Failed to rewrite content after all attempts");
  }

  async translateContent(text: string): Promise<string> {
    console.log("GeminiTTSService: Translating content...");
    
    if (!this.apiKeys[GeminiTTSService.currentKeyIndex]) {
      throw new Error("No API Key available for translation");
    }

    const prompt = `Translate the provided text into Natural, Cinematic, and Professional storytelling Burmese. Use a tone suitable for high-end video narration. Ensure the phrasing is concise and readable for subtitles. Original: ${text}`;

    let attempts = 0;
    const maxAttempts = this.apiKeys.length;

    while (attempts < maxAttempts) {
      try {
        const response = await this.ai.models.generateContent({
          model: GEMINI_MODELS.TRANSLATE,
          contents: prompt,
        });

        const resultText = response.text;
        if (!resultText) {
          throw new Error("No text returned from Gemini");
        }

        return resultText.trim();
      } catch (err: any) {
        const isRateLimit = err.status === 429 || (err.message && err.message.includes('429'));
        
        if (isRateLimit && attempts < maxAttempts - 1) {
          this.rotateKey();
          attempts++;
          continue;
        }

        if (isRateLimit && attempts >= maxAttempts - 1) {
          throw new Error("RATE_LIMIT_EXHAUSTED");
        }
        throw err;
      }
    }
    throw new Error("Failed to translate content after all attempts");
  }

  async transcribeVideo(videoBase64: string, mimeType: string): Promise<string> {
    console.log("GeminiTTSService: Transcribing video...");
    
    if (!this.apiKeys[GeminiTTSService.currentKeyIndex]) {
      throw new Error("No API Key available for transcription");
    }

    const prompt = "Listen to this video carefully. Transcribe every word spoken. Output the result in a clean script format. Do not include timestamps, just the spoken text.";

    let attempts = 0;
    const maxAttempts = this.apiKeys.length;

    while (attempts < maxAttempts) {
      try {
        const response = await this.ai.models.generateContent({
          model: GEMINI_MODELS.REWRITE,
          contents: {
            parts: [
              { inlineData: { data: videoBase64, mimeType } },
              { text: prompt }
            ]
          },
        });

        const resultText = response.text;
        if (!resultText) {
          throw new Error("No text returned from Gemini");
        }

        return resultText.trim();
      } catch (err: any) {
        const isRateLimit = err.status === 429 || (err.message && err.message.includes('429'));
        
        if (isRateLimit && attempts < maxAttempts - 1) {
          this.rotateKey();
          attempts++;
          continue;
        }

        if (isRateLimit && attempts >= maxAttempts - 1) {
          throw new Error("RATE_LIMIT_EXHAUSTED");
        }
        throw err;
      }
    }
    throw new Error("Failed to transcribe video after all attempts");
  }

  static parseSRT(srt: string): SRTSubtitle[] {
    const blocks = srt.trim().split(/\n\s*\n/);
    return blocks.map(block => {
      const lines = block.split('\n');
      if (lines.length < 3) return null;
      const index = parseInt(lines[0]);
      const [startTime, endTime] = lines[1].split(' --> ');
      const text = lines.slice(2).join(' ');
      return { index, startTime, endTime, text };
    }).filter((s): s is SRTSubtitle => s !== null);
  }

  private async uint8ArrayToBase64Async(uint8: Uint8Array): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(new Blob([uint8]));
    });
  }

  private uint8ArrayToBase64(uint8: Uint8Array): string {
    // Legacy sync version, though uint8ArrayToBase64Async is preferred
    const CHUNK_SIZE = 0x8000; // 32KB chunks
    let index = 0;
    let binary = '';
    while (index < uint8.length) {
      const chunk = uint8.subarray(index, index + CHUNK_SIZE);
      // Safe use of spread for smaller chunks
      binary += String.fromCharCode(...(chunk as unknown as any[]));
      index += CHUNK_SIZE;
    }
    return window.btoa(binary);
  }

  private generateMockSRT(text: string, totalDuration?: number): SRTSubtitle[] {
    // Clean text and handle multiple spaces
    const cleanText = text.replace(/\s+/g, ' ').trim();
    const words = cleanText.split(' ');
    const chunks: string[] = [];
    const MAX_CHARS_PER_LINE = 48; 
    let currentChunk = "";
    
    for (const word of words) {
      if ((currentChunk.length + word.length + 1 > MAX_CHARS_PER_LINE && currentChunk.length > 0)) {
        chunks.push(currentChunk);
        currentChunk = word;
      } else {
        currentChunk = currentChunk ? `${currentChunk} ${word}` : word;
      }
    }
    if (currentChunk) chunks.push(currentChunk);

    const subtitles: SRTSubtitle[] = [];
    const effectiveDuration = totalDuration || 10;
    
    let currentTime = 0;
    for (let i = 0; i < chunks.length; i++) {
        const duration = effectiveDuration / chunks.length;
        const endTime = currentTime + duration;
        subtitles.push({
            index: i + 1,
            startTime: formatTime(currentTime),
            endTime: formatTime(endTime),
            text: chunks[i]
        });
        currentTime = endTime;
    }
    return subtitles;
  }
}
