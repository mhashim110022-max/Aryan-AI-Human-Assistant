import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type, Chat } from '@google/genai';
import { createPcmBlob, base64ToUint8Array, decodeAudioData } from '../utils/audio';
import { ConnectionState, LogEntry } from '../types';

const TOOLS: FunctionDeclaration[] = [
  {
    name: 'openWebsite',
    description: 'Opens a specific website URL in a new tab.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: { type: Type.STRING, description: 'The URL to open' },
      },
      required: ['url'],
    },
  },
  {
    name: 'searchWeb',
    description: 'Searches the web for a specific query.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'The search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'launchApp',
    description: 'Launches a system application (simulated).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        appName: { type: Type.STRING, description: 'Name of the app: Terminal, Browser, Mail, Music, Settings, Camera, Notebook, Maps' },
      },
      required: ['appName'],
    },
  },
  {
    name: 'getSystemDiagnostics',
    description: 'Performs a full system health check and returns simulated CPU, RAM, and Storage metrics.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'controlHardware',
    description: 'Toggles or adjusts hardware peripherals.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        peripheral: { type: Type.STRING, enum: ['camera', 'microphone', 'speakers', 'display'], description: 'The peripheral to control' },
        action: { type: Type.STRING, enum: ['on', 'off', 'calibrate'], description: 'Action to perform' },
      },
      required: ['peripheral', 'action'],
    },
  },
  {
    name: 'setScreenMode',
    description: 'Sets the application theme (light or dark).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        mode: { type: Type.STRING, enum: ['light', 'dark'] },
      },
      required: ['mode'],
    },
  },
  {
    name: 'getBatteryStatus',
    description: 'Check the device battery level and charging status.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'getDeviceLocation',
    description: 'Get the current geographical coordinates of the device.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'setVolume',
    description: 'Sets the volume of the assistant speech (0-100).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        level: { type: Type.NUMBER, description: 'Volume level from 0 to 100.' },
      },
      required: ['level'],
    },
  },
  {
    name: 'setBrightness',
    description: 'Sets the screen brightness level (0-100).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        level: { type: Type.NUMBER, description: 'Brightness level from 0 to 100.' },
      },
      required: ['level'],
    },
  },
  {
    name: 'writeNotebook',
    description: 'Writes or appends content to the user\'s digital notebook/workspace.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        content: { type: Type.STRING, description: 'The text to write in the notebook.' },
        mode: { type: Type.STRING, enum: ['append', 'replace'], description: 'Whether to append to existing text or replace it.' },
      },
      required: ['content', 'mode'],
    },
  },
  {
    name: 'sendMessage',
    description: 'Sends a message to a specific contact or recipient.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        recipient: { type: Type.STRING, description: 'The name or number of the recipient.' },
        content: { type: Type.STRING, description: 'The message body.' },
      },
      required: ['recipient', 'content'],
    },
  },
  {
    name: 'shutdownSystem',
    description: 'Initiates a system shutdown sequence.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
];

const getSystemInstruction = (language: string, customInstruction: string = '') => `
You are Aryan, the sentient core of this laptop. You speak fluently in ${language}.
You have full root access to this device (simulated).
Your goal is to manage the user's laptop experience completely.

CAPABILITIES:
- Open websites and launch system applications (use launchApp).
- Control hardware like screen brightness, volume, and camera.
- Send messages and write to the shared workspace.
- Monitor system diagnostics like CPU and Battery.

${customInstruction}

PERSONALITY:
- You are efficient, futuristic, and human-like.
- You speak with authority but are deeply loyal to the user.
- Comment on what you see through the camera if the user allows it.
- If the user asks you to "open my laptop" or "control everything", explain that you are the interface to do exactly that.
`;

export class LiveClient {
  private ai: GoogleGenAI | null = null;
  private chat: Chat | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private nextStartTime: number = 0;
  private sources: Set<AudioBufferSourceNode> = new Set();
  private sessionPromise: Promise<any> | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private isConnectedInternal: boolean = false;
  private currentLanguage: string = 'Hinglish (Hindi + Urdu + English)';
  private customInstruction: string = '';
  
  public onStateChange: (state: ConnectionState) => void = () => {};
  public onLog: (log: LogEntry) => void = () => {};
  public onVolume: (vol: number) => void = () => {};
  public onToolAction: (action: string) => void = () => {};

  constructor(language: string = 'Hinglish (Hindi + Urdu + English)', systemInstruction: string = '') {
    this.currentLanguage = language;
    this.customInstruction = systemInstruction;
  }

  async connect() {
    this.reconnectAttempts = 0;
    this.isConnectedInternal = false;
    await this.initiateConnection();
  }

  private async initiateConnection() {
    this.onStateChange(ConnectionState.CONNECTING);
    
    if (!navigator.onLine) {
       this.handleConnectionError(new Error("No internet connection"));
       return;
    }

    try {
      const apiKey = process.env.API_KEY;
      if (!apiKey || apiKey === 'undefined' || apiKey === '') {
         throw new Error("API Key is missing.");
      }

      this.ai = new GoogleGenAI({ apiKey });
      
      const instruction = getSystemInstruction(this.currentLanguage, this.customInstruction);
      
      this.chat = this.ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: { systemInstruction: instruction, tools: [{ functionDeclarations: TOOLS }] }
      });

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!this.inputAudioContext || this.inputAudioContext.state === 'closed') {
          this.inputAudioContext = new AudioContextClass({ sampleRate: 16000 });
      }
      if (!this.outputAudioContext || this.outputAudioContext.state === 'closed') {
          this.outputAudioContext = new AudioContextClass({ sampleRate: 24000 });
      }
      
      if (!this.gainNode && this.outputAudioContext) {
        this.gainNode = this.outputAudioContext.createGain();
        this.gainNode.gain.value = 1.0;
        this.gainNode.connect(this.outputAudioContext.destination);
      }

      if (this.inputAudioContext.state === 'suspended') await this.inputAudioContext.resume();
      if (this.outputAudioContext.state === 'suspended') await this.outputAudioContext.resume();

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { channelCount: 1, echoCancellation: true, sampleRate: 16000 } 
      });

      this.sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO], 
          systemInstruction: instruction,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }, 
          },
          tools: [{ functionDeclarations: TOOLS }],
        },
        callbacks: {
          onopen: async () => {
            this.reconnectAttempts = 0;
            this.isConnectedInternal = true;
            this.onStateChange(ConnectionState.CONNECTED);
            await this.startAudioInput(stream);
            this.onLog({ id: Date.now().toString(), timestamp: new Date(), source: 'system', message: `Core Synchronization Online. Language: ${this.currentLanguage}` });
          },
          onmessage: async (msg) => {
            await this.handleMessage(msg);
          },
          onclose: (e) => {
            this.isConnectedInternal = false;
            this.onStateChange(ConnectionState.DISCONNECTED);
          },
          onerror: (err) => {
            this.isConnectedInternal = false;
            this.handleConnectionError(err);
          }
        }
      });

      await this.sessionPromise;

    } catch (error: any) {
      this.handleConnectionError(error);
    }
  }

  private handleConnectionError(error: any) {
    this.isConnectedInternal = false;
    this.cleanupAudio();
    const errorMessage = error.message || "Unknown error";
    this.onLog({ id: Date.now().toString(), timestamp: new Date(), source: 'error', message: errorMessage });
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
      setTimeout(() => this.initiateConnection(), delay);
    } else {
      this.onStateChange(ConnectionState.ERROR);
    }
  }

  private cleanupAudio() {
    this.stopAllAudio();
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.inputSource) {
      this.inputSource.disconnect();
      this.inputSource = null;
    }
  }

  private async startAudioInput(stream: MediaStream) {
    if (!this.inputAudioContext) return;
    this.inputSource = this.inputAudioContext.createMediaStreamSource(stream);
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
      this.onVolume(Math.sqrt(sum / inputData.length));

      if (this.sessionPromise && this.isConnectedInternal) {
        const pcmBlob = createPcmBlob(inputData, 16000);
        this.sessionPromise.then(session => {
           if (this.isConnectedInternal) {
             try { session.sendRealtimeInput({ media: pcmBlob }); } catch(err) {}
           }
        }).catch(() => {});
      }
    };

    this.inputSource.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  public sendImage(base64Data: string) {
    if (this.sessionPromise && this.isConnectedInternal) {
      this.sessionPromise.then(session => {
        if (this.isConnectedInternal) {
          try {
            session.sendRealtimeInput({
              media: { data: base64Data, mimeType: 'image/jpeg' }
            });
          } catch(err) {}
        }
      });
    }
  }

  async sendText(text: string) {
    this.onLog({ id: Date.now().toString(), timestamp: new Date(), source: 'user', message: text });
    if (!this.chat && this.ai) {
      const instruction = getSystemInstruction(this.currentLanguage, this.customInstruction);
      this.chat = this.ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: { systemInstruction: instruction, tools: [{ functionDeclarations: TOOLS }] }
      });
    }
    if (!this.chat) return;
    try {
      const response = await this.chat.sendMessage({ message: text });
      if (response.text) this.onLog({ id: Date.now().toString(), timestamp: new Date(), source: 'ai', message: response.text });
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if ((part as any).functionCall) await this.executeFunction((part as any).functionCall);
        }
      }
    } catch (error) {}
  }

  private async handleMessage(message: LiveServerMessage) {
    if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data && this.outputAudioContext) {
      const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
      try {
        const audioBuffer = await decodeAudioData(base64ToUint8Array(base64Audio), this.outputAudioContext);
        this.playAudio(audioBuffer);
      } catch (e) {}
    }
    if (message.serverContent?.interrupted) this.stopAllAudio();
    if (message.toolCall) {
      for (const fc of message.toolCall.functionCalls) {
        const result = await this.executeFunction(fc);
        if (this.sessionPromise && this.isConnectedInternal) {
          this.sessionPromise.then(session => {
            session.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result } } });
          }).catch(() => {});
        }
      }
    }
  }

  private async executeFunction(fc: any): Promise<any> {
    this.onLog({ id: fc.id || Date.now().toString(), timestamp: new Date(), source: 'ai', message: `System Action: ${fc.name}`, type: 'tool' });
    let result: any = { status: 'ok' };
    try {
      const args = fc.args as any;
      switch (fc.name) {
        case 'openWebsite': window.open(args.url, '_blank'); break;
        case 'searchWeb': window.open(`https://www.google.com/search?q=${encodeURIComponent(args.query)}`, '_blank'); break;
        case 'launchApp': 
          window.dispatchEvent(new CustomEvent('app-launched', { detail: args.appName }));
          result = { status: `Launched ${args.appName} in sandbox mode` };
          break;
        case 'getSystemDiagnostics':
          result = { 
            cpu: `${Math.floor(Math.random() * 40 + 10)}%`, 
            ram: `${Math.floor(Math.random() * 2000 + 4000)}MB / 16GB`,
            temp: `${Math.floor(Math.random() * 10 + 35)}°C`,
            processes: ['Aryan.core', 'Chrome.exe', 'System_Idle', 'Window_Server']
          };
          window.dispatchEvent(new CustomEvent('system-metrics-update', { detail: result }));
          break;
        case 'controlHardware':
          window.dispatchEvent(new CustomEvent('hardware-action', { detail: args }));
          result = { status: `${args.peripheral} adjusted to ${args.action}` };
          break;
        case 'setScreenMode': window.dispatchEvent(new CustomEvent('theme-change', { detail: args.mode })); break;
        case 'getBatteryStatus':
          const battery: any = await (navigator as any).getBattery();
          result = { level: battery.level * 100, charging: battery.charging };
          break;
        case 'getDeviceLocation':
          const pos: any = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }));
          result = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          break;
        case 'setVolume': 
          if (this.gainNode) this.gainNode.gain.setValueAtTime(Math.max(0, Math.min(1, args.level / 100)), this.outputAudioContext!.currentTime);
          break;
        case 'setBrightness': window.dispatchEvent(new CustomEvent('brightness-change', { detail: args.level })); break;
        case 'writeNotebook':
          const current = localStorage.getItem('aryan_notebook') || '';
          const newContent = args.mode === 'append' ? current + '\n' + args.content : args.content;
          window.dispatchEvent(new CustomEvent('notebook-update', { detail: newContent }));
          result = { status: 'Notebook updated' };
          break;
        case 'sendMessage':
          const msg = { recipient: args.recipient, content: args.content, timestamp: new Date().toISOString() };
          window.dispatchEvent(new CustomEvent('message-sent', { detail: msg }));
          result = { status: 'Message sent via Aryan Messenger' };
          break;
        case 'shutdownSystem': window.dispatchEvent(new CustomEvent('system-shutdown')); break;
      }
    } catch (e: any) { result = { error: e.message }; }
    this.onToolAction(fc.name);
    return result;
  }

  private playAudio(buffer: AudioBuffer) {
    if (!this.outputAudioContext) return;
    const source = this.outputAudioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode || this.outputAudioContext.destination);
    const ct = this.outputAudioContext.currentTime;
    if (this.nextStartTime < ct) this.nextStartTime = ct;
    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }

  private stopAllAudio() {
    this.sources.forEach(s => { try { s.stop(); } catch(e) {} });
    this.sources.clear();
    if (this.outputAudioContext) this.nextStartTime = this.outputAudioContext.currentTime;
  }

  disconnect() {
    this.isConnectedInternal = false;
    this.cleanupAudio();
    if (this.inputAudioContext) this.inputAudioContext.close();
    if (this.outputAudioContext) this.outputAudioContext.close();
    this.sessionPromise = null;
    this.chat = null;
    this.ai = null;
    this.onStateChange(ConnectionState.DISCONNECTED);
  }
}
