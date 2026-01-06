import React, { useEffect, useState, useRef } from 'react';
import { LiveClient } from './services/liveClient';
import { ConnectionState, LogEntry } from './types';
import { Visualizer } from './components/Visualizer';
import { 
  Mic, MicOff, Monitor, Battery, MapPin, Send, 
  ShieldCheck, AlertCircle, Globe, Camera, 
  CameraOff, Power, Sun, AlertTriangle, Eye, History, 
  Trash2, FileText, Settings, X, ChevronRight,
  Activity, Cpu, Shield, Languages, ChevronDown, Lock, Edit3, Ear, Radio,
  MessageSquare, User, Copy, Check, Terminal, Layout, Gauge, Smartphone, 
  Zap, HardDrive, Wifi
} from 'lucide-react';

const LANGUAGES = [
  'Hinglish (Hindi + Urdu + English)',
  'English',
  'Hindi',
  'Urdu',
  'Spanish',
  'French',
  'German',
  'Japanese',
  'Chinese (Mandarin)',
  'Arabic',
  'Portuguese',
  'kashmiri'
];

interface SentMessage {
  recipient: string;
  content: string;
  timestamp: string;
}

interface SystemMetrics {
  cpu: string;
  ram: string;
  temp: string;
  processes: string[];
}

const App: React.FC = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [logs, setLogs] = useState<LogEntry[]>(() => {
    const saved = localStorage.getItem('aryan_logs');
    return saved ? JSON.parse(saved).map((l: any) => ({...l, timestamp: new Date(l.timestamp)})) : [];
  });
  const [notebook, setNotebook] = useState(() => localStorage.getItem('aryan_notebook') || '');
  const [sentMessages, setSentMessages] = useState<SentMessage[]>(() => {
    const saved = localStorage.getItem('aryan_sent_messages');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeTab, setActiveTab] = useState<'chat' | 'messenger' | 'notebook' | 'logs' | 'command'>('chat');
  const [volume, setVolume] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [brightness, setBrightness] = useState(100);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [showShutdownConfirm, setShowShutdownConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(() => localStorage.getItem('aryan_lang') || LANGUAGES[0]);
  const [systemInstruction, setSystemInstruction] = useState(() => localStorage.getItem('aryan_instruction') || '');
  const [wakeWord, setWakeWord] = useState(() => localStorage.getItem('aryan_wakeword') || 'aryan');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isWakeWordEnabled, setIsWakeWordEnabled] = useState(false);
  const [lastToolAction, setLastToolAction] = useState<string>('');
  const [textInput, setTextInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [uptime, setUptime] = useState('00:00:00');
  const [wakeWordTranscript, setWakeWordTranscript] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics>({ cpu: '12%', ram: '4.2GB / 16GB', temp: '38°C', processes: ['Aryan.core', 'System_Idle'] });
  const [launchedApps, setLaunchedApps] = useState<string[]>([]);
  
  const clientRef = useRef<LiveClient | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recognitionRef = useRef<any>(null);

  // Uptime Counter
  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const diff = Date.now() - startTime;
      const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
      const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
      setUptime(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Persistence
  useEffect(() => { localStorage.setItem('aryan_logs', JSON.stringify(logs)); }, [logs]);
  useEffect(() => { localStorage.setItem('aryan_notebook', notebook); }, [notebook]);
  useEffect(() => { localStorage.setItem('aryan_sent_messages', JSON.stringify(sentMessages)); }, [sentMessages]);
  useEffect(() => { localStorage.setItem('aryan_lang', selectedLanguage); }, [selectedLanguage]);
  useEffect(() => { localStorage.setItem('aryan_instruction', systemInstruction); }, [systemInstruction]);
  useEffect(() => { localStorage.setItem('aryan_wakeword', wakeWord); }, [wakeWord]);

  useEffect(() => {
    document.body.classList.add('loaded');
    const handleThemeChange = (e: any) => setIsDarkMode(e.detail === 'dark');
    const handleBrightnessChange = (e: any) => setBrightness(Math.max(10, Math.min(100, e.detail)));
    const handleShutdownRequest = () => setShowShutdownConfirm(true);
    const handleNotebookUpdate = (e: any) => setNotebook(e.detail);
    const handleMessageSent = (e: any) => {
      setSentMessages(prev => [e.detail, ...prev]);
      setActiveTab('messenger');
    };
    const handleAppLaunch = (e: any) => {
      setLaunchedApps(prev => Array.from(new Set([...prev, e.detail])));
      setActiveTab('command');
    };
    const handleMetricsUpdate = (e: any) => setSystemMetrics(e.detail);

    window.addEventListener('theme-change' as any, handleThemeChange);
    window.addEventListener('brightness-change' as any, handleBrightnessChange);
    window.addEventListener('system-shutdown' as any, handleShutdownRequest);
    window.addEventListener('notebook-update' as any, handleNotebookUpdate);
    window.addEventListener('message-sent' as any, handleMessageSent);
    window.addEventListener('app-launched' as any, handleAppLaunch);
    window.addEventListener('system-metrics-update' as any, handleMetricsUpdate);

    return () => {
      window.removeEventListener('theme-change' as any, handleThemeChange);
      window.removeEventListener('brightness-change' as any, handleBrightnessChange);
      window.removeEventListener('system-shutdown' as any, handleShutdownRequest);
      window.removeEventListener('notebook-update' as any, handleNotebookUpdate);
      window.removeEventListener('message-sent' as any, handleMessageSent);
      window.removeEventListener('app-launched' as any, handleAppLaunch);
      window.removeEventListener('system-metrics-update' as any, handleMetricsUpdate);
      clientRef.current?.disconnect();
    };
  }, []);

  // Wake Word Engine
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const cleanupRecognition = () => {
      setWakeWordTranscript('');
      if (recognitionRef.current) {
        recognitionRef.current.onend = null; 
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        try { recognitionRef.current.abort(); } catch (e) {}
        recognitionRef.current = null;
      }
    };
    cleanupRecognition();
    if (SpeechRecognition && isWakeWordEnabled && connectionState === ConnectionState.DISCONNECTED) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-IN'; 
      recognition.onresult = (event: any) => {
        const transcript = event.results[event.resultIndex][0].transcript.toLowerCase();
        setWakeWordTranscript(transcript);
        const trigger = wakeWord.toLowerCase().trim();
        if (trigger && transcript.includes(trigger)) { cleanupRecognition(); toggleConnection(); }
      };
      recognition.onend = () => {
        setWakeWordTranscript('');
        if (isWakeWordEnabled && connectionState === ConnectionState.DISCONNECTED) {
          try { recognition.start(); } catch (e) {}
        }
      };
      try { recognition.start(); recognitionRef.current = recognition; } catch (e) {}
    }
    return cleanupRecognition;
  }, [isWakeWordEnabled, connectionState, wakeWord]);

  // Camera Loop
  useEffect(() => {
    let interval: any;
    if (isCameraActive && connectionState === ConnectionState.CONNECTED) {
      interval = setInterval(() => {
        if (videoRef.current && canvasRef.current && clientRef.current) {
          const context = canvasRef.current.getContext('2d');
          if (context) {
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
            context.drawImage(videoRef.current, 0, 0);
            const base64 = canvasRef.current.toDataURL('image/jpeg', 0.5).split(',')[1];
            clientRef.current.sendImage(base64);
          }
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isCameraActive, connectionState]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs, activeTab, sentMessages]);

  const toggleConnection = async () => {
    if (connectionState === ConnectionState.CONNECTED || connectionState === ConnectionState.CONNECTING) {
      clientRef.current?.disconnect();
      clientRef.current = null;
    } else {
      const client = new LiveClient(selectedLanguage, systemInstruction);
      client.onStateChange = setConnectionState;
      client.onLog = (log) => setLogs(prev => [...prev, log]);
      client.onVolume = setVolume;
      client.onToolAction = (action) => {
        setLastToolAction(action);
        setTimeout(() => setLastToolAction(''), 5000);
      };
      clientRef.current = client;
      try { await client.connect(); } catch (err: any) {
        setLogs(prev => [...prev, { id: Date.now().toString(), timestamp: new Date(), source: 'error', message: `Link Error: ${err.message}` }]);
      }
    }
  };

  const toggleCamera = async () => {
    if (!isCameraActive) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) videoRef.current.srcObject = stream;
        setIsCameraActive(true);
      } catch (err) {
        setLogs(prev => [...prev, { id: Date.now().toString(), timestamp: new Date(), source: 'error', message: 'Vision link authorization denied.' }]);
      }
    } else {
      (videoRef.current?.srcObject as MediaStream)?.getTracks().forEach(t => t.stop());
      setIsCameraActive(false);
    }
  };

  const handleLanguageChange = (lang: string) => setSelectedLanguage(lang);

  const handleSendText = async () => {
    if (!textInput.trim() || isTyping) return;
    const text = textInput.trim();
    setTextInput('');
    setIsTyping(true);
    if (!clientRef.current) await toggleConnection();
    try { await clientRef.current?.sendText(text); } finally { setIsTyping(false); }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (isShuttingDown) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center text-white font-mono">
        <div className="text-3xl font-bold text-red-600 mb-4 animate-pulse tracking-widest uppercase text-center px-6">System Termination In Progress</div>
        <div className="text-[10px] text-red-900 uppercase tracking-[0.5em] animate-pulse">Neural pathways purging...</div>
      </div>
    );
  }

  const isDark = isDarkMode;
  const cardColor = isDark ? 'bg-[#0a0c14]/90' : 'bg-white/95';
  const borderColor = isDark ? 'border-white/5' : 'border-black/5';

  return (
    <div 
        className={`min-h-screen w-full transition-all duration-700 ${isDark ? 'bg-[#02040a]' : 'bg-slate-50'} text-slate-100 flex flex-col items-center justify-center p-4 overflow-hidden relative font-sans`}
        style={{ filter: `brightness(${brightness}%)` }}
    >
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />
      <canvas ref={canvasRef} className="hidden" />

      {/* Atmospheric Background */}
      <div className="absolute inset-0 opacity-30 pointer-events-none">
          <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] bg-blue-600/10 rounded-full blur-[160px] animate-pulse"></div>
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150"></div>
      </div>

      <div className={`relative z-10 w-full max-w-4xl ${cardColor} backdrop-blur-3xl border ${borderColor} rounded-[2.5rem] shadow-[0_0_120px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col`} style={{height: '92vh'}}>
        
        {/* Header */}
        <div className="px-10 py-6 flex justify-between items-center bg-white/5 border-b border-white/5">
            <div className="flex items-center gap-6">
                <div className={`relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 group overflow-hidden ${connectionState === ConnectionState.CONNECTED ? 'bg-blue-500 shadow-[0_0_30px_rgba(14,165,233,0.5)]' : 'bg-white/5 border border-white/10'}`}>
                   <Cpu size={24} className={connectionState === ConnectionState.CONNECTED ? 'text-white' : 'text-slate-500'} />
                </div>
                <div>
                    <h1 className="text-xl font-black tracking-tight uppercase leading-none mb-1">Aryan <span className="text-blue-500">Core</span></h1>
                    <div className="flex items-center gap-3">
                        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/5`}>
                           <div className={`w-1.5 h-1.5 rounded-full ${connectionState === ConnectionState.CONNECTED ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></div>
                           <span className="text-[8px] uppercase tracking-widest text-slate-400 font-bold">{connectionState}</span>
                        </div>
                        <span className="text-[8px] text-slate-600 font-mono tracking-tighter uppercase font-bold">L-Core: {uptime}</span>
                    </div>
                </div>
            </div>
            <div className="flex gap-4">
                <div className="flex items-center gap-1 bg-white/5 rounded-2xl p-1 border border-white/5">
                    <button onClick={toggleCamera} className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${isCameraActive ? 'bg-blue-500 text-white' : 'text-slate-500 hover:text-white'}`}>
                        {isCameraActive ? <Camera size={16} /> : <CameraOff size={16} />}
                    </button>
                    <button onClick={() => setIsWakeWordEnabled(!isWakeWordEnabled)} className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${isWakeWordEnabled ? 'bg-amber-500 text-white' : 'text-slate-500 hover:text-white'}`}>
                        <Radio size={16} className={isWakeWordEnabled ? 'animate-pulse' : ''} />
                    </button>
                </div>
                <button onClick={() => setShowSettings(!showSettings)} className="w-9 h-9 rounded-2xl flex items-center justify-center bg-white/5 text-slate-500 hover:text-white transition-all"><Settings size={16} /></button>
                <button onClick={() => setShowShutdownConfirm(true)} className="w-9 h-9 rounded-2xl flex items-center justify-center bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500 transition-all"><Power size={16} /></button>
            </div>
        </div>

        {/* Display Area */}
        <div className="flex-none flex flex-col items-center justify-center relative bg-gradient-to-b from-transparent to-black/20 h-44">
            <Visualizer volume={volume} isActive={connectionState === ConnectionState.CONNECTED} />
            {isWakeWordEnabled && connectionState === ConnectionState.DISCONNECTED && (
                <div className="absolute top-1/2 translate-y-12 flex flex-col items-center gap-2">
                    <div className="px-3 py-1.5 bg-black/40 border border-white/5 rounded-full backdrop-blur-md flex items-center gap-2">
                        <div className="w-1 h-1 bg-amber-500 rounded-full animate-pulse"></div>
                        <span className="text-[8px] uppercase tracking-widest text-amber-500/80 font-bold">Listening for "{wakeWord}"</span>
                    </div>
                </div>
            )}
        </div>

        {/* Workspace Tabs */}
        <div className="flex-none bg-black/40 border-y border-white/5 flex px-8 overflow-x-auto no-scrollbar">
            <button onClick={() => setActiveTab('chat')} className={`relative flex items-center gap-2.5 px-6 py-4 transition-all font-bold text-[10px] uppercase tracking-widest whitespace-nowrap ${activeTab === 'chat' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
                <MessageSquare size={14} /> AI Chat
                {activeTab === 'chat' && <div className="absolute bottom-0 left-6 right-6 h-0.5 bg-blue-500"></div>}
            </button>
            <button onClick={() => setActiveTab('command')} className={`relative flex items-center gap-2.5 px-6 py-4 transition-all font-bold text-[10px] uppercase tracking-widest whitespace-nowrap ${activeTab === 'command' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
                <Layout size={14} /> Command Center
                {activeTab === 'command' && <div className="absolute bottom-0 left-6 right-6 h-0.5 bg-blue-500"></div>}
            </button>
            <button onClick={() => setActiveTab('messenger')} className={`relative flex items-center gap-2.5 px-6 py-4 transition-all font-bold text-[10px] uppercase tracking-widest whitespace-nowrap ${activeTab === 'messenger' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
                <Send size={14} /> Messenger
                {activeTab === 'messenger' && <div className="absolute bottom-0 left-6 right-6 h-0.5 bg-blue-500"></div>}
            </button>
            <button onClick={() => setActiveTab('notebook')} className={`relative flex items-center gap-2.5 px-6 py-4 transition-all font-bold text-[10px] uppercase tracking-widest whitespace-nowrap ${activeTab === 'notebook' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
                <FileText size={14} /> Workspace
                {activeTab === 'notebook' && <div className="absolute bottom-0 left-6 right-6 h-0.5 bg-blue-500"></div>}
            </button>
            <button onClick={() => setActiveTab('logs')} className={`relative flex items-center gap-2.5 px-6 py-4 transition-all font-bold text-[10px] uppercase tracking-widest whitespace-nowrap ${activeTab === 'logs' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
                <Terminal size={14} /> System
                {activeTab === 'logs' && <div className="absolute bottom-0 left-6 right-6 h-0.5 bg-blue-500"></div>}
            </button>
        </div>

        {/* Content View */}
        <div className="flex-1 p-8 bg-[#05070a]/80 overflow-hidden flex flex-col">
            <div className={`flex-1 overflow-y-auto scroll-smooth custom-scrollbar pr-4`} ref={scrollRef}>
                
                {activeTab === 'chat' && (
                    <div className="space-y-6">
                        {logs.filter(l => l.source === 'user' || (l.source === 'ai' && l.type !== 'tool')).map((log) => (
                            <div key={log.id} className={`flex flex-col ${log.source === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                                <div className={`max-w-[85%] p-4 rounded-2xl text-[14px] font-medium leading-relaxed border ${
                                    log.source === 'user' ? 'bg-blue-600 border-white/10 text-white rounded-tr-none' : 'bg-white/5 text-slate-200 rounded-tl-none border-white/5 backdrop-blur-md'
                                }`}>
                                    {log.message}
                                </div>
                                <span className="text-[8px] text-slate-600 font-mono mt-1.5 uppercase tracking-widest">{log.timestamp.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'command' && (
                    <div className="grid grid-cols-2 gap-6 animate-in zoom-in duration-500">
                        <div className="col-span-2 bg-white/5 border border-white/5 p-6 rounded-3xl backdrop-blur-md">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3 text-blue-400 font-black text-[10px] uppercase tracking-[0.2em]"><Gauge size={16} /> Core Hardware Metrics</div>
                                <button onClick={() => clientRef.current?.sendText("Get system diagnostics")} className="px-3 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-[9px] font-black uppercase rounded-lg transition-all">Refresh</button>
                            </div>
                            <div className="grid grid-cols-4 gap-4">
                                <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                                    <div className="text-[9px] text-slate-500 font-bold uppercase mb-1">CPU Load</div>
                                    <div className="text-xl font-black text-white">{systemMetrics.cpu}</div>
                                </div>
                                <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                                    <div className="text-[9px] text-slate-500 font-bold uppercase mb-1">Memory</div>
                                    <div className="text-xl font-black text-white truncate">{systemMetrics.ram.split(' / ')[0]}</div>
                                </div>
                                <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                                    <div className="text-[9px] text-slate-500 font-bold uppercase mb-1">Temp</div>
                                    <div className="text-xl font-black text-rose-500">{systemMetrics.temp}</div>
                                </div>
                                <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                                    <div className="text-[9px] text-slate-500 font-bold uppercase mb-1">Uplink</div>
                                    <div className="text-xl font-black text-emerald-500 flex items-center gap-2"><Wifi size={16} /> OK</div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white/5 border border-white/5 p-6 rounded-3xl backdrop-blur-md">
                            <div className="flex items-center gap-3 text-emerald-400 font-black text-[10px] uppercase tracking-[0.2em] mb-6"><Smartphone size={16} /> Application Sandbox</div>
                            <div className="grid grid-cols-2 gap-3">
                                {['Terminal', 'Browser', 'Music', 'Notebook', 'Camera', 'Mail'].map(app => (
                                    <button 
                                        key={app} 
                                        onClick={() => clientRef.current?.sendText(`Launch ${app}`)}
                                        className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${launchedApps.includes(app) ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-black/20 border-white/5 text-slate-400 hover:bg-white/5 hover:text-white'}`}
                                    >
                                        <Zap size={14} />
                                        <span className="text-[10px] font-bold">{app}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white/5 border border-white/5 p-6 rounded-3xl backdrop-blur-md">
                            <div className="flex items-center gap-3 text-amber-400 font-black text-[10px] uppercase tracking-[0.2em] mb-6"><HardDrive size={16} /> Root Processes</div>
                            <div className="space-y-2">
                                {systemMetrics.processes.map(proc => (
                                    <div key={proc} className="flex items-center justify-between p-3 bg-black/20 rounded-xl border border-white/5">
                                        <div className="text-[10px] font-mono text-slate-300">{proc}</div>
                                        <div className="text-[9px] text-emerald-500 font-black uppercase">Active</div>
                                    </div>
                                ))}
                                <div className="text-[9px] text-slate-600 text-center mt-4 uppercase font-bold tracking-widest">End of Process Stack</div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'logs' && (
                    <div className="space-y-3 font-mono">
                        {logs.map(log => (
                            <div key={log.id} className="text-[10px] flex gap-3 border-b border-white/5 pb-2">
                                <span className="text-slate-600">[{log.timestamp.toLocaleTimeString()}]</span>
                                <span className={`uppercase font-bold ${log.source === 'error' ? 'text-rose-500' : 'text-slate-400'}`}>{log.source}</span>
                                <span className="text-slate-300">{log.message}</span>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'messenger' && (
                    <div className="space-y-4">
                        {sentMessages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center opacity-20 py-20">
                                <Send size={48} className="mb-4" />
                                <p className="text-[10px] font-black uppercase tracking-widest text-center">No Communications Transmitted</p>
                            </div>
                        ) : (
                            sentMessages.map((msg, i) => (
                                <div key={i} className="bg-white/5 border border-white/5 p-5 rounded-2xl flex flex-col gap-2">
                                    <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-blue-400 border-b border-white/5 pb-2 mb-2">
                                        <span>To: {msg.recipient}</span>
                                        <span className="text-slate-600">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                    <p className="text-[13px] text-slate-300 italic">"{msg.content}"</p>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {activeTab === 'notebook' && (
                    <textarea 
                        value={notebook}
                        onChange={(e) => setNotebook(e.target.value)}
                        placeholder="Shared workspace..."
                        className="w-full h-full bg-transparent p-4 text-[14px] text-slate-300 resize-none outline-none custom-scrollbar"
                    />
                )}
            </div>
        </div>

        {/* Global Control Box */}
        <div className="p-8 bg-[#02040a] border-t border-white/5 relative">
            {isTyping && (
                <div className="absolute top-[-16px] left-10 flex items-center gap-2 px-3 py-1 bg-blue-600 rounded-full text-[9px] font-black uppercase tracking-widest animate-pulse">
                    <Activity size={10} className="animate-spin-slow" /> Core Synthesis...
                </div>
            )}
            <div className="flex items-center gap-6">
                <div className="flex-1 flex items-center gap-4 rounded-2xl bg-white/5 px-6 py-1.5 border border-white/5 focus-within:border-blue-500/40 transition-all duration-300">
                    <textarea 
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
                        placeholder="Master command console..."
                        className="flex-1 bg-transparent py-3 text-[14px] outline-none placeholder-slate-800 font-bold resize-none h-12 no-scrollbar"
                    />
                    <button onClick={handleSendText} disabled={!textInput.trim() || isTyping} className="w-10 h-10 flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all active:scale-95 disabled:opacity-10"><Send size={18} /></button>
                </div>
                <div className="relative">
                   <button 
                      onClick={toggleConnection}
                      className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-4xl border-[4px] ${
                          connectionState === ConnectionState.CONNECTED ? 'bg-rose-500 border-rose-400/20' : 'bg-blue-600 border-blue-500/20 hover:scale-105'
                      }`}
                   >
                      {connectionState === ConnectionState.CONNECTED ? <MicOff className="text-white" size={28} /> : <Mic className="text-white" size={28} />}
                   </button>
                   {connectionState === ConnectionState.CONNECTED && <div className="absolute inset-0 rounded-2xl bg-rose-500/10 blur-xl animate-pulse -z-10"></div>}
                </div>
            </div>
        </div>
      </div>

      {/* Settings */}
      {showSettings && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-[#0a0c14] border border-white/10 p-8 rounded-[2.5rem] shadow-4xl animate-in zoom-in duration-300">
               <div className="flex justify-between items-center mb-8">
                  <h3 className="text-[12px] font-black uppercase tracking-[0.2em] text-blue-500">Core Configuration</h3>
                  <button onClick={() => setShowSettings(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:text-rose-500 transition-all"><X size={16} /></button>
               </div>
               <div className="space-y-6">
                  <div className="space-y-2">
                     <label className="text-[9px] font-black uppercase text-slate-500">Linguistic Protocol</label>
                     <select value={selectedLanguage} onChange={(e) => handleLanguageChange(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-xs font-bold text-slate-200 outline-none">
                        {LANGUAGES.map(lang => <option key={lang} value={lang} className="bg-[#0a0c14]">{lang}</option>)}
                     </select>
                  </div>
                  <div className="space-y-2">
                     <label className="text-[9px] font-black uppercase text-slate-500">Auth Wake Phrase</label>
                     <input type="text" value={wakeWord} onChange={(e) => setWakeWord(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-xs font-bold text-slate-200 outline-none" />
                  </div>
                  <button onClick={() => setShowSettings(false)} className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">Apply & Save</button>
               </div>
            </div>
          </div>
        )}

      {showShutdownConfirm && (
        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-8 backdrop-blur-3xl">
          <div className="max-w-md w-full bg-[#0a0c14] border border-white/10 p-12 rounded-[3.5rem] text-center">
            <AlertTriangle size={40} className="text-rose-500 mx-auto mb-6" />
            <h3 className="text-2xl font-black text-white mb-4 uppercase tracking-tighter">Terminate Core Sync?</h3>
            <div className="grid grid-cols-2 gap-4 mt-10">
              <button onClick={() => setShowShutdownConfirm(false)} className="py-4 bg-white/5 text-white rounded-2xl text-[10px] font-black uppercase">Cancel</button>
              <button onClick={() => { setShowShutdownConfirm(false); setIsShuttingDown(true); clientRef.current?.disconnect(); }} className="py-4 bg-rose-600 text-white rounded-2xl text-[10px] font-black uppercase">Terminate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;