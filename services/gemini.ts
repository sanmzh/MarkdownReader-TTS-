import { GoogleGenAI, Modality } from "@google/genai";
import { VoiceName } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface AudioController {
  promise: Promise<void>;
  stop: () => void;
  setRate: (rate: number) => void;
}

// --- GEMINI CLOUD TTS IMPLEMENTATION ---

// Audio Context Singleton
let audioContext: AudioContext | null = null;

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 24000, // Gemini Flash TTS output rate
    });
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

/**
 * Decodes Base64 audio string to an AudioBuffer.
 * Gemini 2.5 Flash TTS returns raw PCM.
 */
async function decodeAudioData(base64Data: string): Promise<AudioBuffer> {
  const ctx = getAudioContext();
  
  // Convert base64 to binary
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  
  // Ensure we have an even number of bytes for 16-bit PCM
  const safeLen = len % 2 === 0 ? len : len - 1;
  
  const bytes = new Uint8Array(safeLen);
  for (let i = 0; i < safeLen; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Convert raw PCM (Int16) to Float32 for AudioContext
  // Assuming 1 channel, 24kHz, 16-bit depth from Gemini 2.5 Flash TTS
  const dataInt16 = new Int16Array(bytes.buffer);
  const frameCount = dataInt16.length; 
  const audioBuffer = ctx.createBuffer(1, frameCount, 24000);
  const channelData = audioBuffer.getChannelData(0);

  for (let i = 0; i < frameCount; i++) {
    // Normalize Int16 to Float32 [-1.0, 1.0]
    channelData[i] = dataInt16[i] / 32768.0;
  }

  return audioBuffer;
}

/**
 * Generate speech from text using Gemini 2.5 Flash TTS.
 */
export async function generateSpeech(text: string, voice: string): Promise<AudioBuffer> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice as VoiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (!base64Audio) {
      throw new Error("No audio data received from Gemini");
    }

    return await decodeAudioData(base64Audio);
  } catch (error) {
    console.error("Error generating speech:", error);
    throw error;
  }
}

// --- OPENAI TTS IMPLEMENTATION ---

export async function generateOpenAISpeech(text: string, voice: string, apiKey: string): Promise<AudioBuffer> {
  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: voice,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API Error: ${err.error?.message || response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const ctx = getAudioContext();
    // decodeAudioData handles MP3 decoding natively
    return await ctx.decodeAudioData(arrayBuffer);
  } catch (error) {
    console.error("Error generating OpenAI speech:", error);
    throw error;
  }
}

/**
 * Plays an AudioBuffer and returns a controller to stop or change rate.
 * @param rate Playback rate (speed).
 */
export function playAudioBuffer(buffer: AudioBuffer, rate: number = 1.0): AudioController {
  const ctx = getAudioContext();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  
  // Apply initial playback rate
  source.playbackRate.value = rate;

  source.connect(ctx.destination);
  
  let isStopped = false;

  const promise = new Promise<void>((resolve) => {
    source.onended = () => {
      if (!isStopped) resolve();
    };
    source.start();
  });

  const stop = () => {
    isStopped = true;
    try {
      source.stop();
    } catch (e) {
      // Ignore
    }
  };

  const setRate = (newRate: number) => {
    try {
      // AudioParam.setValueAtTime can be used, or just direct assignment
      // Direct assignment usually ramps instantly or quickly
      if (source) {
        source.playbackRate.value = newRate;
      }
    } catch (e) {
      console.warn("Could not set playback rate", e);
    }
  };

  return { promise, stop, setRate };
}


// --- NATIVE BROWSER TTS IMPLEMENTATION ---

export async function getBrowserVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    let voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }
    
    // Chrome/Safari load voices asynchronously
    window.speechSynthesis.onvoiceschanged = () => {
      voices = window.speechSynthesis.getVoices();
      resolve(voices);
    };
  });
}

/**
 * Plays text using browser's native SpeechSynthesis.
 * @param rate Playback rate (0.1 to 10). Default 1.0.
 */
export function playNativeText(text: string, voiceName: string, rate: number = 1.0): AudioController {
  const synth = window.speechSynthesis;
  // Cancel any pending speech to ensure immediate playback of this segment
  if (synth.speaking) {
    synth.cancel();
  }

  const utterance = new SpeechSynthesisUtterance(text);
  
  // Find the voice object
  const voices = synth.getVoices();
  const selectedVoice = voices.find(v => v.name === voiceName);
  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  // Set rate
  // Note: Some browsers/voices cap this at 2.0 or 3.0 even if spec allows 10.
  utterance.rate = rate;

  let isStopped = false;

  const promise = new Promise<void>((resolve, reject) => {
    utterance.onend = () => {
      if (!isStopped) resolve();
    };
    utterance.onerror = (e) => {
      // interruption is not an error for our flow, but we check just in case
      if (e.error === 'interrupted') {
        // do nothing
      } else {
        if (!isStopped) resolve(); // Resolve anyway to continue flow usually
      }
    };
    
    synth.speak(utterance);
  });

  const stop = () => {
    isStopped = true;
    synth.cancel();
  };

  const setRate = (newRate: number) => {
    // Native TTS does not support changing rate mid-utterance without restarting.
    // For now we do nothing; the next segment will pick up the new speed.
    // Implementing restart logic here is complex due to charIndex tracking issues across browsers.
  };

  return { promise, stop, setRate };
}