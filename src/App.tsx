import React, { useState, useEffect, useRef } from 'react';
import { 
  initAuth, 
  googleSignIn, 
  logout, 
  getAccessToken 
} from './firebase';
import { 
  Phone, 
  PhoneOff, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  FileText, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  Search, 
  Globe, 
  Languages, 
  LogOut, 
  Info, 
  Sparkles, 
  Cpu,
  RefreshCw,
  Loader2,
  Check,
  Power,
  Settings,
  Key
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DriveFile, AisaNote, Message, VoiceName } from './types';

export default function App() {
  // Auth state
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);

  // Drive & Notes state
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [notes, setNotes] = useState<AisaNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<AisaNote | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [driveLoading, setDriveLoading] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  const [driveSearch, setDriveSearch] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Chat & Grounded Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [ttsPlaying, setTtsPlaying] = useState<boolean>(false);
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>(VoiceName.Kore);

  // Live Call state
  const [isCallActive, setIsCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState<'standby' | 'connecting' | 'listening' | 'speaking'>('standby');
  const [liveVoice, setLiveVoice] = useState<VoiceName>(VoiceName.Kore);
  const [translateMode, setTranslateMode] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState('Spanish');
  const [callLogs, setCallLogs] = useState<string[]>([]);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);

  // Progress & Upload states for auto-submitting recorded audio
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [recordingProgress, setRecordingProgress] = useState(0);

  // Custom Gemini API Key State for Free Quota Fallbacks
  const [customApiKey, setCustomApiKey] = useState<string>(() => localStorage.getItem('custom_gemini_api_key') || '');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(() => localStorage.getItem('custom_gemini_api_key') || '');

  const handleSaveApiKey = (key: string) => {
    const trimmed = key.trim();
    setCustomApiKey(trimmed);
    localStorage.setItem('custom_gemini_api_key', trimmed);
    setIsSettingsOpen(false);
    if (trimmed) {
      setBillingError(null);
    }
  };

  // Refs for audio processing and WebSockets
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingAudioRef = useRef(false);
  const nextPlayTimeRef = useRef(0);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const recordedAudioBuffersRef = useRef<Float32Array[]>([]);

  // Languages for Real-time Multilingual Translation
  const LANGUAGES = [
    'Spanish', 'French', 'German', 'Japanese', 'Chinese', 'Hindi', 'Arabic', 'Russian', 'Portuguese', 'Italian'
  ];

  // Initialize Auth
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, accessToken) => {
        setUser(user);
        setToken(accessToken);
        setNeedsAuth(false);
        setAuthLoading(false);
      },
      () => {
        setUser(null);
        setToken(null);
        setNeedsAuth(true);
        setAuthLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Sync Google Drive and Notes data when token is ready
  useEffect(() => {
    if (token) {
      loadDriveFiles();
      loadNotes();
    }
  }, [token]);

  // Load Google Drive Files
  const loadDriveFiles = async () => {
    if (!token) return;
    setDriveLoading(true);
    try {
      const response = await fetch('/api/drive/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token, query: driveSearch }),
      });
      const data = await response.json();
      if (data.files) {
        setDriveFiles(data.files);
      }
    } catch (error) {
      console.error('Failed to load Google Drive files:', error);
    } finally {
      setDriveLoading(false);
    }
  };

  // Load Google Drive customized Notes folder ("Aisa Notes")
  const loadNotes = async () => {
    if (!token) return;
    setNotesLoading(true);
    try {
      const response = await fetch('/api/drive/list-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token }),
      });
      const data = await response.json();
      if (data.notes) {
        setNotes(data.notes);
      }
    } catch (error) {
      console.error('Failed to load notes from Drive:', error);
    } finally {
      setNotesLoading(false);
    }
  };

  // Create or Update Note
  const handleSaveNote = async () => {
    if (!token || !noteTitle.trim()) return;
    setIsSavingNote(true);
    try {
      if (selectedNote) {
        // Update Note
        const response = await fetch('/api/drive/update-note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken: token,
            fileId: selectedNote.id,
            title: noteTitle,
            content: noteContent
          }),
        });
        const data = await response.json();
        if (data.success) {
          loadNotes();
          // Update selected
          setSelectedNote({
            ...selectedNote,
            title: noteTitle,
            content: noteContent
          });
        }
      } else {
        // Create Note
        const response = await fetch('/api/drive/create-note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken: token,
            title: noteTitle,
            content: noteContent
          }),
        });
        const data = await response.json();
        if (data.success) {
          loadNotes();
          // Reset
          setNoteTitle('');
          setNoteContent('');
          setSelectedNote(null);
        }
      }
    } catch (error) {
      console.error('Error saving note:', error);
    } finally {
      setIsSavingNote(false);
    }
  };

  // Delete Note with Explicit User Confirmation (Required by guidelines)
  const handleDeleteNote = async (noteId: string, title: string) => {
    if (!token) return;
    const confirmed = window.confirm(`Are you sure you want to delete note "${title}"? This cannot be undone.`);
    if (!confirmed) return;

    try {
      const response = await fetch('/api/drive/delete-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: token,
          fileId: noteId
        }),
      });
      const data = await response.json();
      if (data.success) {
        loadNotes();
        if (selectedNote?.id === noteId) {
          setSelectedNote(null);
          setNoteTitle('');
          setNoteContent('');
        }
      }
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  };

  // Authenticate user with Google Sign-In
  const handleSignIn = async () => {
    try {
      const result = await googleSignIn();
      if (result) {
        setToken(result.accessToken);
        setUser(result.user);
        setNeedsAuth(false);
      }
    } catch (error) {
      console.error('Google sign-in error:', error);
    }
  };

  // Logout
  const handleLogout = async () => {
    await logout();
    setUser(null);
    setToken(null);
    setNeedsAuth(true);
    setDriveFiles([]);
    setNotes([]);
  };

  // Grounded search chat session using Google Search grounding & personalized user file indexing
  const handleGroundedSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    const userMsg = searchQuery;
    setSearchQuery('');
    
    const userMessageObj: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: userMsg,
      timestamp: new Date().toLocaleTimeString()
    };
    
    setChatMessages(prev => [...prev, userMessageObj]);
    setIsSearching(true);

    // Formulate personalized background context using notes and matching drive content
    let personalContext = '';
    if (notes.length > 0) {
      personalContext += `The user has the following personalized Notes:\n`;
      notes.forEach(note => {
        personalContext += `- Note Title: "${note.title}". Content: "${note.content}"\n`;
      });
    }
    if (driveFiles.length > 0) {
      personalContext += `\nThe user has these documents in their Google Drive:\n`;
      driveFiles.slice(0, 10).forEach(file => {
        personalContext += `- File name: "${file.name}" (Type: ${file.mimeType}, File ID: ${file.id})\n`;
      });
    }

    try {
      // 1. Ask model for search grounded answer with personal archives injected
      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(customApiKey ? { 'x-gemini-api-key': customApiKey } : {})
        },
        body: JSON.stringify({
          message: userMsg,
          history: chatMessages,
          personalContext
        })
      });
      
      const chatData = await chatRes.json();
      
      if (chatData.error) {
        const errStr = String(chatData.error).toLowerCase();
        if (
          errStr.includes('depleted') || 
          errStr.includes('prepayment') || 
          errStr.includes('billing') || 
          errStr.includes('429') || 
          errStr.includes('quota') || 
          errStr.includes('exhausted')
        ) {
          setBillingError('Your Google AI Studio prepayment credits are depleted. Please update your billing details in Google AI Studio or configure a personal free API key in settings.');
        }
        throw new Error(chatData.error);
      }

      // 2. Add assistant message with citation metadata
      const aisaMessageObj: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'aisa',
        text: chatData.text,
        timestamp: new Date().toLocaleTimeString(),
        citations: chatData.citations
      };
      
      setChatMessages(prev => [...prev, aisaMessageObj]);

      // 3. Play vocal response using gemini-3.1-flash-tts-preview
      speakText(chatData.text);

    } catch (error: any) {
      console.error('Grounded search error:', error);
      const errStr = String(error?.message || error).toLowerCase();
      const isBilling = errStr.includes('depleted') || errStr.includes('prepayment') || errStr.includes('billing') || errStr.includes('429') || errStr.includes('quota') || errStr.includes('exhausted');
      setChatMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: 'aisa',
        text: isBilling 
          ? '⚠️ API Credits Depleted: Your Google AI Studio prepayment credits are depleted or quota has been exhausted. To restore service, please go to Google AI Studio Billing (https://aistudio.google.com/) to top up your balance, or configure a personal free API key in settings.'
          : 'Sorry, I encountered an error searching your knowledge archive. Please try again.',
        timestamp: new Date().toLocaleTimeString()
      }]);
    } finally {
      setIsSearching(false);
    }
  };

  // Convert text response to spoken voice (TTS)
  const speakText = async (text: string) => {
    // Strip markdown formatting for cleaner audio pronunciation
    const cleanText = text
      .replace(/[*_`#\-]/g, ' ')
      .replace(/\[\d+\]/g, '') // strip citation numbers e.g. [1]
      .trim();
      
    setTtsPlaying(true);
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(customApiKey ? { 'x-gemini-api-key': customApiKey } : {})
        },
        body: JSON.stringify({ text: cleanText, voiceName: selectedVoice }),
      });
      const data = await response.json();
      if (data.error) {
        const errStr = String(data.error).toLowerCase();
        if (
          errStr.includes('depleted') || 
          errStr.includes('prepayment') || 
          errStr.includes('billing') || 
          errStr.includes('429') || 
          errStr.includes('quota') || 
          errStr.includes('exhausted')
        ) {
          setBillingError('Your Google AI Studio prepayment credits are depleted. Please update your billing details in Google AI Studio or configure a personal free API key in settings.');
        }
        throw new Error(data.error);
      }
      if (data.audio) {
        // Decode and play in AudioContext
        const float32Array = pcm16ToFloat32(data.audio);
        playAudioBuffer(float32Array);
      }
    } catch (error) {
      console.error('TTS error:', error);
      setTtsPlaying(false);
    }
  };

  // Decode 16-bit PCM base64 string to Float32Array
  const pcm16ToFloat32 = (base64: string): Float32Array => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }
    return float32Array;
  };

  // Play Float32 PCM buffer seamlessly using audio queuing
  const playAudioBuffer = (float32Array: Float32Array) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    
    const audioCtx = audioContextRef.current;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const buffer = audioCtx.createBuffer(1, float32Array.length, 24000);
    buffer.copyToChannel(float32Array, 0);

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);

    // Schedule play
    const startTime = Math.max(nextPlayTimeRef.current, audioCtx.currentTime);
    source.start(startTime);
    nextPlayTimeRef.current = startTime + buffer.duration;
    
    isPlayingAudioRef.current = true;
    setTtsPlaying(true);
    
    source.onended = () => {
      // Check if this was the last scheduled sound
      if (audioCtx.currentTime >= nextPlayTimeRef.current - 0.05) {
        isPlayingAudioRef.current = false;
        setTtsPlaying(false);
      }
    };
  };

  // Downsample audio float32 buffer to 16kHz
  const downsampleBuffer = (buffer: Float32Array, inputSampleRate: number, outputSampleRate: number) => {
    if (inputSampleRate === outputSampleRate) {
      return buffer;
    }
    const ratio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  };

  // Float32 to 16-bit Signed PCM
  const floatTo16BitPCM = (output: DataView, offset: number, input: Float32Array) => {
    for (let i = 0; i < input.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
  };

  // Convert ArrayBuffer to Base64
  const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  // Start bidirectional live stream calling session (using gemini-3.1-flash-live-preview)
  const startLiveCall = async () => {
    recordedAudioBuffersRef.current = [];
    setCallStatus('connecting');
    setCallLogs(['Initiating secure tunnel...', 'Enabling hardware audio context...']);
    setIsCallActive(true);

    try {
      // 1. Instantiate browser AudioContext for recording and playback
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const audioCtx = audioContextRef.current;
      
      // Explicitly resume AudioContext inside synchronous user-gesture handler
      if (audioCtx.state === 'suspended') {
        setCallLogs(prev => [...prev, 'Resuming suspended AudioContext...']);
        await audioCtx.resume();
      }
      nextPlayTimeRef.current = audioCtx.currentTime;
      setCallLogs(prev => [...prev, `AudioContext active (${audioCtx.state}). Connecting WebSocket...`]);

      // 2. Establish connection to local proxy server WebSocket
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/api/live-stream${customApiKey ? `?key=${encodeURIComponent(customApiKey)}` : ''}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setCallStatus('listening');
        setCallLogs(prev => [...prev, 'Connected to Aisa. Voice call online.']);

        // Send setup configuration packet to Gemini Live API
        const liveModel = customApiKey ? 'models/gemini-2.5-flash-native-audio-latest' : 'models/gemini-3.1-flash-live-preview';
        const setupMessage: any = {
          setup: {
            model: liveModel,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: liveVoice
                  }
                }
              }
            }
          }
        };

        // If in real-time translation mode, inject system instructions to act as spoken translator
        if (translateMode) {
          setupMessage.setup.systemInstruction = {
            parts: [
              {
                text: `You are a professional real-time speech translator. Instantly translate whatever the user says from English into ${targetLanguage}, and speak it out loud. Do not offer explanation, do not add commentary, and respond with ONLY the spoken translation in ${targetLanguage}. Keep the tone extremely natural and emotive.`
              }
            ]
          };
          setCallLogs(prev => [...prev, `Aisa initialized as translation portal: English ➔ ${targetLanguage}`]);
        } else {
          // Normal mode with notes context
          let contextPrompt = "You are Aisa, the voice assistant. Communicate in an emotive, helpful, and natural vocal manner. ";
          if (notes.length > 0) {
            contextPrompt += "Ground your context in the user's personal notes: ";
            notes.forEach(n => {
              contextPrompt += `[Note: ${n.title} - ${n.content}] `;
            });
          }
          setupMessage.setup.systemInstruction = {
            parts: [{ text: contextPrompt }]
          };
        }

        ws.send(JSON.stringify(setupMessage));
        startMicrophoneStream();
      };

      ws.onmessage = async (event) => {
        try {
          if (typeof event.data === 'string') {
            const data = JSON.parse(event.data);
            
            // Check for propagated error packets
            if (data.error) {
              const errMsg = data.error.message || JSON.stringify(data.error);
              setCallLogs(prev => [...prev, `System Error: ${errMsg}`]);
              if (errMsg.includes('depleted') || errMsg.includes('prepayment') || errMsg.includes('billing') || errMsg.includes('429')) {
                setBillingError('Your Google AI Studio prepayment credits are depleted. Please update your billing details in Google AI Studio.');
              }
              stopLiveCall();
              return;
            }
            
            // Check for transcription or status messages
            if (data.serverContent?.modelTurn?.parts) {
              setCallStatus('speaking');
              for (const part of data.serverContent.modelTurn.parts) {
                // If text part
                if (part.text) {
                  setCallLogs(prev => [...prev, `Aisa: ${part.text}`]);
                }
                // If audio output part
                if (part.inlineData?.data) {
                  const float32Array = pcm16ToFloat32(part.inlineData.data);
                  playAudioBuffer(float32Array);
                }
              }
            }

            if (data.serverContent?.turnComplete) {
              setCallStatus('listening');
            }
          }
        } catch (error) {
          console.error('Error handling websocket packet:', error);
        }
      };

      ws.onerror = (err) => {
        console.error('Live call WebSocket error:', err);
        setCallLogs(prev => [...prev, 'Connection error. Reconnecting...']);
      };

      ws.onclose = () => {
        setCallStatus('standby');
        setCallLogs(prev => [...prev, 'Session offline.']);
        stopLiveCall();
      };

    } catch (error) {
      console.error('Error initiating live call:', error);
      stopLiveCall();
    }
  };

  // Start microphone streaming input
  const startMicrophoneStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const audioCtx = audioContextRef.current!;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      
      const source = audioCtx.createMediaStreamSource(stream);
      
      // Use standard ScriptProcessorNode for wide browser support inside sandboxed IFrames
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = processor;

      source.connect(processor);
      processor.connect(audioCtx.destination);

      let logCounter = 0;
      let lastStateUpdate = 0;
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Accumulate audio samples in background for automatic submit upon stop
        recordedAudioBuffersRef.current.push(new Float32Array(inputData));

        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        
        // Compute volume level for real-time validation
        let maxVal = 0;
        for (let i = 0; i < inputData.length; i++) {
          const abs = Math.abs(inputData[i]);
          if (abs > maxVal) maxVal = abs;
        }
        
        logCounter++;
        if (logCounter % 50 === 0) {
          console.log(`[Mic Level] Current peak volume input: ${maxVal.toFixed(4)} (Context State: ${audioCtx.state})`);
        }

        // Throttle React state updates to avoid audio stuttering
        const now = Date.now();
        if (now - lastStateUpdate > 100) {
          setMicLevel(maxVal);
          lastStateUpdate = now;
        }

        // Downsample on the fly to 16000Hz PCM
        const downsampled = downsampleBuffer(inputData, audioCtx.sampleRate, 16000);
        
        // Convert to 16-bit PCM array buffer
        const buffer = new ArrayBuffer(downsampled.length * 2);
        const view = new DataView(buffer);
        floatTo16BitPCM(view, 0, downsampled);

        // Convert array buffer to base64
        const base64Audio = arrayBufferToBase64(buffer);

        // Send realtimeInput mediaChunk
        const audioFrame = {
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: 'audio/pcm;rate=16000',
                data: base64Audio
              }
            ]
          }
        };

        wsRef.current.send(JSON.stringify(audioFrame));
      };

    } catch (error) {
      console.error('Error starting microphone stream:', error);
      setCallLogs(prev => [...prev, 'Error: Microphone access denied. Check your permissions.']);
      stopLiveCall();
    }
  };

  // End live call and release hardware resources
  const stopLiveCall = () => {
    setIsCallActive(false);
    setCallStatus('standby');
    setMicLevel(0);

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }

    // Retrieve accumulated audio for auto-transcription and submission
    const chunks = [...recordedAudioBuffersRef.current];
    recordedAudioBuffersRef.current = [];

    // Calculate total sample count to make sure there's at least ~0.5s of audio
    const totalSamples = chunks.reduce((sum, buf) => sum + buf.length, 0);
    // 4096 samples per buffer, so we want at least 3 buffers or 12,000 samples (~0.5s at 24kHz)
    if (chunks.length >= 3 && totalSamples > 12000) {
      processAndSubmitRecording(chunks);
    }
  };

  // Helper to compile uncompressed mono 16-bit WAV from raw Float32Array chunks
  const compileWav = (buffers: Float32Array[], sampleRate: number): ArrayBuffer => {
    // Calculate total length
    let totalLength = 0;
    for (const b of buffers) {
      totalLength += b.length;
    }
    
    // Create combined buffer
    const combined = new Float32Array(totalLength);
    let offset = 0;
    for (const b of buffers) {
      combined.set(b, offset);
      offset += b.length;
    }
    
    // Create WAV ArrayBuffer
    const buffer = new ArrayBuffer(44 + combined.length * 2);
    const view = new DataView(buffer);
    
    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // file length
    view.setUint32(4, 36 + combined.length * 2, true);
    // WAVE identifier
    writeString(view, 8, 'WAVE');
    // format chunk identifier
    writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (raw PCM is 1)
    view.setUint16(20, 1, true);
    // channel count
    view.setUint16(22, 1, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * 2, true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, 2, true);
    // bits per sample
    view.setUint16(34, 16, true);
    // data chunk identifier
    writeString(view, 36, 'data');
    // chunk length
    view.setUint32(40, combined.length * 2, true);
    
    // write the PCM samples
    floatTo16BitPCM(view, 44, combined);
    
    return buffer;
  };

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // Convert compiled WAV buffer, upload, transcribe, show progress, and auto-submit Grounded Search
  const processAndSubmitRecording = async (chunks: Float32Array[]) => {
    setIsProcessingAudio(true);
    setRecordingProgress(15);
    setProcessingStatus('Encoding voice track...');

    try {
      // Compile WAV array buffer on main AudioContext sampleRate (24000Hz)
      const wavBuffer = compileWav(chunks, 24000);
      
      setRecordingProgress(40);
      setProcessingStatus('Uploading audio stream...');

      // Convert array buffer to base64
      const base64Audio = arrayBufferToBase64(wavBuffer);

      setRecordingProgress(65);
      setProcessingStatus('Gemini transcribing spoken audio...');

      // Call the transcribe API
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(customApiKey ? { 'x-gemini-api-key': customApiKey } : {})
        },
        body: JSON.stringify({
          audio: base64Audio,
          mimeType: 'audio/wav'
        })
      });

      setRecordingProgress(85);
      setProcessingStatus('Analyzing transcription...');

      const data = await response.json();
      
      if (data.error) {
        const errStr = String(data.error).toLowerCase();
        if (
          errStr.includes('depleted') || 
          errStr.includes('prepayment') || 
          errStr.includes('billing') || 
          errStr.includes('429') || 
          errStr.includes('quota') || 
          errStr.includes('exhausted')
        ) {
          setBillingError('Your Google AI Studio prepayment credits are depleted. Please update your billing details in Google AI Studio or configure a personal free API key in settings.');
        }
        throw new Error(data.error);
      }

      setRecordingProgress(100);
      setProcessingStatus('Complete!');

      const transcript = data.text;
      
      setTimeout(async () => {
        setIsProcessingAudio(false);
        setRecordingProgress(0);

        if (!transcript || transcript.trim() === '') {
          setCallLogs(prev => [...prev, 'Aisa Spoken Portal: Silence or no words detected. Try speaking closer to the microphone.']);
          return;
        }

        setCallLogs(prev => [...prev, `Spoken Command detected: "${transcript}"`]);

        // Automatically submit transcription to Grounded Search!
        await executeGroundedSearchDirect(transcript);
      }, 500);

    } catch (error: any) {
      console.error('Error auto-processing recording:', error);
      setProcessingStatus(`Processing failed: ${error.message || 'Error'}`);
      setTimeout(() => {
        setIsProcessingAudio(false);
        setRecordingProgress(0);
      }, 3000);
    }
  };

  // Direct grounded search execution with custom query text
  const executeGroundedSearchDirect = async (queryText: string) => {
    if (!queryText.trim()) return;

    const userMessageObj: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: queryText,
      timestamp: new Date().toLocaleTimeString()
    };
    
    setChatMessages(prev => [...prev, userMessageObj]);
    setIsSearching(true);

    // Formulate personalized background context using notes and matching drive content
    let personalContext = '';
    if (notes.length > 0) {
      personalContext += `The user has the following personalized Notes:\n`;
      notes.forEach(note => {
        personalContext += `- Note Title: "${note.title}". Content: "${note.content}"\n`;
      });
    }
    if (driveFiles.length > 0) {
      personalContext += `\nThe user has these documents in their Google Drive:\n`;
      driveFiles.slice(0, 10).forEach(file => {
        personalContext += `- File name: "${file.name}" (Type: ${file.mimeType}, File ID: ${file.id})\n`;
      });
    }

    try {
      // Ask model for search grounded answer with personal archives injected
      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(customApiKey ? { 'x-gemini-api-key': customApiKey } : {})
        },
        body: JSON.stringify({
          message: queryText,
          history: chatMessages,
          personalContext
        })
      });
      
      const chatData = await chatRes.json();
      
      if (chatData.error) {
        const errStr = String(chatData.error).toLowerCase();
        if (
          errStr.includes('depleted') || 
          errStr.includes('prepayment') || 
          errStr.includes('billing') || 
          errStr.includes('429') || 
          errStr.includes('quota') || 
          errStr.includes('exhausted')
        ) {
          setBillingError('Your Google AI Studio prepayment credits are depleted. Please update your billing details in Google AI Studio or configure a personal free API key in settings.');
        }
        throw new Error(chatData.error);
      }

      // Add assistant message with citation metadata
      const aisaMessageObj: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'aisa',
        text: chatData.text,
        timestamp: new Date().toLocaleTimeString(),
        citations: chatData.citations
      };
      
      setChatMessages(prev => [...prev, aisaMessageObj]);

      // Play vocal response using gemini-3.1-flash-tts-preview
      speakText(chatData.text);

    } catch (error: any) {
      console.error('Grounded search error:', error);
      const errStr = String(error?.message || error).toLowerCase();
      const isBilling = errStr.includes('depleted') || errStr.includes('prepayment') || errStr.includes('billing') || errStr.includes('429') || errStr.includes('quota') || errStr.includes('exhausted');
      setChatMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: 'aisa',
        text: isBilling 
          ? '⚠️ API Credits Depleted: Your Google AI Studio prepayment credits are depleted or quota has been exhausted. To restore service, please go to Google AI Studio Billing (https://aistudio.google.com/) to top up your balance, or configure a personal free API key in settings.'
          : 'Sorry, I encountered an error searching your knowledge archive. Please try again.',
        timestamp: new Date().toLocaleTimeString()
      }]);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans glow-bg grid-overlay antialiased relative">
      {/* Background Atmosphere */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-orange-950/15 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[50%] h-[50%] rounded-full bg-blue-900/10 blur-[100px]" />
      </div>

      {/* Upper Navigation Bar */}
      <header className="border-b border-white/5 bg-[#050505]/70 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3 z-10">
          <div className="bg-orange-500/10 border border-orange-500/30 p-2 rounded-lg flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-orange-400 animate-pulse" />
          </div>
          <div>
            <span className="text-[9px] uppercase tracking-[0.3em] text-orange-500/80 font-bold mb-0.5 block">Assistant Platform</span>
            <h1 className="font-display font-light text-2xl tracking-tighter text-white flex items-center space-x-2">
              <span>Aisa</span>
              <span className="text-xs font-mono font-medium text-orange-400/80 border border-orange-500/20 px-1.5 py-0.5 rounded uppercase">#Studio</span>
            </h1>
          </div>
        </div>

        {/* User profile, Tech stats & Authentication controls */}
        <div className="flex items-center space-x-6 z-10">
          <div className="hidden md:flex space-x-6 border-r border-white/5 pr-6 text-xs">
            <div className="flex flex-col">
              <span className="text-[9px] uppercase tracking-widest text-white/30 font-semibold mb-0.5">Engine</span>
              <span className="font-mono text-gray-200">Gemini Live (3.1)</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] uppercase tracking-widest text-white/30 font-semibold mb-0.5">Latency</span>
              <span className="font-mono text-orange-400">142ms</span>
            </div>
          </div>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-xl bg-white/5 border border-white/10 hover:border-orange-500/30 hover:bg-orange-500/5 text-gray-400 hover:text-orange-400 transition-all cursor-pointer flex items-center justify-center relative"
            title="Aisa Settings & API Keys"
          >
            <Settings className="h-4 w-4" />
            {customApiKey && (
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-500 border border-[#050505] animate-pulse" />
            )}
          </button>

          {user ? (
            <div className="flex items-center space-x-3 bg-white/5 border border-white/10 rounded-full py-1 pl-2 pr-4">
              {user.photoURL ? (
                <img referrerPolicy="no-referrer" src={user.photoURL} alt={user.displayName} className="h-7 w-7 rounded-full border border-white/10" />
              ) : (
                <div className="h-7 w-7 rounded-full bg-orange-500 flex items-center justify-center text-xs font-bold text-black uppercase">
                  {user.displayName?.charAt(0) || user.email?.charAt(0)}
                </div>
              )}
              <div className="text-xs font-medium text-gray-300 max-w-[120px] truncate hidden md:block">
                {user.displayName || user.email}
              </div>
              <button onClick={handleLogout} className="text-gray-400 hover:text-red-400 transition-colors cursor-pointer pl-1">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            !authLoading && (
              <button onClick={handleSignIn} className="gsi-material-button cursor-pointer font-sans shadow-md border-0 bg-white hover:bg-gray-100 font-medium text-gray-900 rounded-lg text-sm px-4 py-2">
                <div className="gsi-material-button-icon">
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  </svg>
                </div>
                <span className="gsi-material-button-contents font-medium font-sans">Sign in with Google</span>
              </button>
            )
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 z-10">
        {authLoading ? (
          <div className="col-span-12 flex flex-col items-center justify-center py-20">
            <Loader2 className="h-10 w-10 text-orange-500 animate-spin mb-4" />
            <p className="text-gray-400 font-mono text-sm">Synchronizing OAuth and workspace credentials...</p>
          </div>
        ) : needsAuth ? (
          /* Unauthenticated Landing Experience */
          <div className="col-span-12 max-w-2xl mx-auto flex flex-col items-center justify-center text-center py-16 px-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="bg-white/5 border border-white/10 backdrop-blur-md p-8 rounded-2xl shadow-xl w-full relative overflow-hidden"
            >
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-orange-600/10 blur-[80px]" />
              </div>
              
              <div className="h-16 w-16 bg-orange-500/10 rounded-2xl mx-auto flex items-center justify-center border border-orange-500/30 mb-6">
                <Cpu className="h-8 w-8 text-orange-400" />
              </div>
              <h2 className="font-display font-light text-2xl md:text-3xl tracking-tight text-white mb-3">
                Unlock Spoken Intelligence
              </h2>
              <p className="text-gray-400 mb-8 max-w-md mx-auto text-sm leading-relaxed font-light">
                Connect your secure Google account to allow Aisa to sync with your Drive documents and personalize conversations based on your live archives.
              </p>

              <button onClick={handleSignIn} className="gsi-material-button w-full justify-center md:w-auto shadow-lg hover:shadow-orange-500/5 transition-all">
                <div className="gsi-material-button-icon">
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  </svg>
                </div>
                <span className="gsi-material-button-contents font-semibold">Sign in with Google</span>
              </button>

              <div className="grid grid-cols-3 gap-4 border-t border-white/10 pt-8 mt-8 text-left">
                <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                  <h4 className="text-xs font-bold text-white mb-1 flex items-center"><Volume2 className="h-3 w-3 mr-1 text-orange-400" /> Live Spoken</h4>
                  <p className="text-[10px] text-gray-500 leading-normal">Dual-way low-latency vocal responses.</p>
                </div>
                <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                  <h4 className="text-xs font-bold text-white mb-1 flex items-center"><Globe className="h-3 w-3 mr-1 text-orange-400" /> Translate</h4>
                  <p className="text-[10px] text-gray-500 leading-normal">Real-time multilingual cross-border translation.</p>
                </div>
                <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                  <h4 className="text-xs font-bold text-white mb-1 flex items-center"><FileText className="h-3 w-3 mr-1 text-orange-400" /> Grounding</h4>
                  <p className="text-[10px] text-gray-500 leading-normal">Connects with Google Drive notes & search.</p>
                </div>
              </div>
            </motion.div>
          </div>
        ) : (
          /* Main Dashboard App (Logged In) */
          <>
            {billingError && (
              <div className="col-span-12 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg shadow-amber-500/5 animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="flex items-start space-x-3">
                  <div className="bg-amber-500/20 text-amber-400 p-2 rounded-xl mt-0.5">
                    <Info className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-amber-200">Gemini API Prepayment Credits Depleted (429)</h4>
                    <p className="text-xs text-amber-400/80 mt-1 max-w-2xl leading-relaxed">
                      Your Google AI Studio prepayment credits are depleted. All features (Grounded Search, Spoken Terminal, Voice, TTS) require active billing credits to communicate with the Gemini API.
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <button 
                    onClick={() => setBillingError(null)} 
                    className="text-xs text-gray-400 hover:text-white transition-colors px-3 py-1.5 cursor-pointer"
                  >
                    Dismiss
                  </button>
                  <a 
                    href="https://aistudio.google.com/projects" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs px-4 py-2 rounded-xl transition-all shadow-md flex items-center space-x-1.5 cursor-pointer"
                  >
                    <span>Manage Billing</span>
                    <Sparkles className="h-3 w-3" />
                  </a>
                </div>
              </div>
            )}

            {/* LEFT AREA: Live Call Room & Voice Translation */}
            <div className="lg:col-span-5 flex flex-col space-y-6">
              
              {/* Voice Assistant calling panel */}
              <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl flex flex-col items-center relative overflow-hidden select-none">
                <div className="absolute top-4 right-4 flex space-x-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${isCallActive ? 'bg-orange-500 animate-ping' : 'bg-gray-600'}`} />
                  <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">
                    {isCallActive ? 'Active' : 'Standby'}
                  </span>
                </div>

                <h3 className="font-display font-semibold text-lg text-white mb-2 self-start flex items-center">
                  <Cpu className="h-4 w-4 mr-2 text-orange-400" />
                  <span>Aisa Spoken Terminal</span>
                </h3>
                <p className="text-xs text-gray-400 self-start mb-6">
                  Experience instantaneous conversations powered by gemini-3.1-flash-live-preview.
                </p>

                {/* Big Ambient Pulse Voice visualizer */}
                <div className="my-8 flex items-center justify-center h-48 w-full relative">
                  <AnimatePresence>
                    {isCallActive && (
                      <>
                        {/* Immersive glow aura */}
                        <div className="absolute w-96 h-96 rounded-full bg-orange-600/5 blur-3xl pointer-events-none" />
                        {/* Outer pulsing ring */}
                        <motion.div 
                          initial={{ scale: 0.8, opacity: 0.5 }}
                          animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0.05, 0.3] }}
                          transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                          className="absolute h-40 w-40 rounded-full border border-orange-500/20 bg-orange-500/5"
                        />
                        {/* Middle pulsing aura */}
                        <motion.div 
                          initial={{ scale: 0.9, opacity: 0.7 }}
                          animate={{ 
                            scale: callStatus === 'speaking' ? [1, 1.25, 1] : [1, 1.12, 1],
                            opacity: [0.5, 0.2, 0.5] 
                          }}
                          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                          className="absolute h-32 w-32 rounded-full border border-orange-400/30 bg-orange-400/10"
                        />
                      </>
                    )}
                  </AnimatePresence>

                  {/* Inner Solid Control Orb: The Voice Core */}
                  <button 
                    type="button"
                    onClick={isCallActive ? stopLiveCall : startLiveCall}
                    style={{ transform: isCallActive ? `scale(${1 + micLevel * 0.55})` : undefined }}
                    className={`h-28 w-28 rounded-full flex flex-col items-center justify-center shadow-2xl cursor-pointer border transition-all duration-300 z-10 ${
                      isCallActive 
                        ? 'bg-red-600/30 border-red-500/80 text-red-100 hover:bg-red-600/40 shadow-[0_0_50px_rgba(239,68,68,0.3)]' 
                        : 'bg-gradient-to-tr from-orange-600 via-orange-500 to-amber-300 border-orange-400/30 text-black font-bold hover:scale-105 shadow-[0_0_60px_rgba(249,115,22,0.35)]'
                    }`}
                  >
                    {isCallActive ? (
                      <>
                        <Power className="h-7 w-7 mb-1" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">ON</span>
                        <div className="flex gap-1 items-center justify-center mt-1">
                          <span className="w-1 h-3 bg-red-100/60 rounded-full animate-bounce" />
                          <span className="w-1 h-4 bg-red-100/60 rounded-full animate-bounce [animation-delay:0.15s]" />
                          <span className="w-1 h-2 bg-red-100/60 rounded-full animate-bounce [animation-delay:0.3s]" />
                        </div>
                      </>
                    ) : (
                      <>
                        <Power className="h-7 w-7 mb-1 text-black/70" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">OFF</span>
                        <div className="flex gap-1 items-center justify-center mt-1">
                          <span className="w-1 h-2 bg-black/40 rounded-full" />
                          <span className="w-1 h-3 bg-black/40 rounded-full" />
                          <span className="w-1 h-2 bg-black/40 rounded-full" />
                        </div>
                      </>
                    )}
                  </button>

                  {/* Tiny floating state indicators */}
                  {isCallActive && (
                    <div className="absolute bottom-0 bg-black/80 border border-white/10 rounded-full px-3 py-1 text-xs font-mono text-orange-400 flex items-center space-x-1.5 z-20">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                      </span>
                      <span className="capitalize">{callStatus}...</span>
                    </div>
                  )}
                </div>

                {/* Upload and Processing Progress Bar */}
                <AnimatePresence>
                  {isProcessingAudio && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0, scale: 0.95 }}
                      animate={{ opacity: 1, height: 'auto', scale: 1 }}
                      exit={{ opacity: 0, height: 0, scale: 0.95 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className="w-full bg-[#0c0c0c] border border-orange-500/25 rounded-xl p-4.5 mb-2 mt-1 relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 w-24 h-24 rounded-full bg-orange-500/5 blur-xl pointer-events-none" />
                      <div className="flex justify-between items-center mb-2.5 text-xs font-mono">
                        <span className="text-orange-400 font-bold flex items-center">
                          <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin text-orange-400" />
                          {processingStatus}
                        </span>
                        <span className="text-gray-400 font-bold">{recordingProgress}%</span>
                      </div>
                      <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                        <motion.div 
                          className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${recordingProgress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Settings Grid inside Terminal */}
                <div className="grid grid-cols-2 gap-4 w-full bg-black/30 border border-white/5 p-4 rounded-xl mt-4">
                  {/* Voice Selector */}
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Speaker Voice</label>
                    <select 
                      value={liveVoice} 
                      onChange={(e) => setLiveVoice(e.target.value as VoiceName)}
                      disabled={isCallActive}
                      className="w-full bg-[#050505] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500 cursor-pointer"
                    >
                      <option value={VoiceName.Kore}>Kore (Feminine / Soft)</option>
                      <option value={VoiceName.Zephyr}>Zephyr (Masculine / Warm)</option>
                      <option value={VoiceName.Puck}>Puck (Cheerful / Youthful)</option>
                      <option value={VoiceName.Charon}>Charon (Deep / Serious)</option>
                      <option value={VoiceName.Fenrir}>Fenrir (Rich / Husky)</option>
                    </select>
                  </div>

                  {/* Mode / Translator Toggle */}
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Terminal Role</label>
                    <button
                      onClick={() => setTranslateMode(!translateMode)}
                      disabled={isCallActive}
                      className={`w-full text-left bg-[#050505] border rounded px-2.5 py-1.5 text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                        translateMode ? 'border-orange-500/50 text-orange-400' : 'border-white/10 text-gray-300'
                      }`}
                    >
                      <span>{translateMode ? 'Voice Translator' : 'Personal Assistant'}</span>
                      <Globe className="h-3.5 w-3.5 text-orange-400" />
                    </button>
                  </div>

                  {/* Target language (only visible when translation is enabled) */}
                  <AnimatePresence>
                    {translateMode && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="col-span-2 mt-1 pt-2 border-t border-white/10"
                      >
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5 flex items-center">
                          <Languages className="h-3 w-3 mr-1 text-orange-400" />
                          <span>Translate Spoken English to:</span>
                        </label>
                        <div className="grid grid-cols-4 gap-1.5">
                          {LANGUAGES.slice(0, 8).map((lang) => (
                            <button
                              key={lang}
                              onClick={() => setTargetLanguage(lang)}
                              disabled={isCallActive}
                              className={`text-[10px] py-1 border rounded transition-all cursor-pointer ${
                                targetLanguage === lang 
                                  ? 'bg-orange-500/15 border-orange-500 text-orange-400 font-bold' 
                                  : 'bg-[#050505] border-white/10 text-gray-400 hover:text-white'
                              }`}
                            >
                              {lang}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Call Transcription and Activity logs */}
              <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-5 shadow-xl flex-1 flex flex-col">
                <h4 className="text-xs font-bold font-mono text-gray-400 uppercase tracking-widest mb-3 flex items-center">
                  <Cpu className="h-3.5 w-3.5 mr-1 text-orange-400" /> Session Activity Logs
                </h4>
                
                <div className="flex-1 bg-[#050505]/60 border border-white/5 rounded-xl p-4 font-mono text-xs text-gray-300 h-48 overflow-y-auto space-y-2.5">
                  {callLogs.length === 0 ? (
                    <div className="text-gray-600 italic text-center py-10">No voice conversation logs active yet. Click the central "OFF" button above to activate the voice channel.</div>
                  ) : (
                    callLogs.map((log, index) => (
                      <div key={index} className={`border-l-2 pl-2 ${
                        log.startsWith('Aisa:') ? 'border-orange-500 text-white' : 'border-white/15 text-gray-400'
                      }`}>
                        {log}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT AREA: Bento-Grid of Notes Management & Grounded Search Console */}
            <div className="lg:col-span-7 flex flex-col space-y-6 z-10">

              {/* Grounded Knowledge Search Engine */}
              <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl">
                <h3 className="font-display font-semibold text-lg text-white mb-2 flex items-center">
                  <Sparkles className="h-5 w-5 mr-2 text-orange-400" />
                  <span>Grounding & Insight Engine</span>
                </h3>
                <p className="text-xs text-gray-400 mb-4">
                  Query Aisa to ground facts with real-time Google Search, and cross-reference your private notes & Drive database.
                </p>

                {/* Grounded Search Form */}
                <form onSubmit={handleGroundedSearch} className="flex space-x-2 mb-5">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Search Google and your notes archive (e.g., 'What is in my project draft?')"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      disabled={isSearching}
                      className="w-full bg-[#050505]/80 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20"
                    />
                    <Search className="h-4.5 w-4.5 text-gray-500 absolute left-3.5 top-3.5" />
                  </div>
                  <button
                    type="submit"
                    disabled={isSearching || !searchQuery.trim()}
                    className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-800 disabled:text-gray-400 text-black font-semibold text-xs px-5 rounded-xl transition-all flex items-center space-x-2 shadow-lg cursor-pointer"
                  >
                    {isSearching ? (
                      <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    ) : (
                      <>
                        <span>Search</span>
                      </>
                    )}
                  </button>
                </form>

                {/* Search / Chat Feed */}
                <div className="bg-[#050505]/50 border border-white/5 rounded-xl p-4 h-64 overflow-y-auto space-y-4">
                  {chatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center h-full text-gray-500 space-y-2 py-8">
                      <Search className="h-8 w-8 text-white/10" />
                      <p className="text-xs">Grounding search console is ready. Type any question above.</p>
                    </div>
                  ) : (
                    chatMessages.map((msg) => (
                      <div 
                        key={msg.id} 
                        className={`flex flex-col max-w-[85%] rounded-xl p-3 text-sm ${
                          msg.sender === 'user' 
                            ? 'bg-orange-500/10 border border-orange-500/20 text-orange-100 self-end ml-auto' 
                            : 'bg-white/5 border border-white/10 text-gray-200 self-start mr-auto'
                        }`}
                      >
                        <div className="font-mono text-[9px] font-bold text-gray-500 uppercase mb-1 flex items-center justify-between">
                          <span>{msg.sender === 'user' ? 'You' : 'Aisa'}</span>
                          <span>{msg.timestamp}</span>
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                        
                        {/* Audio TTS trigger for assistant responses */}
                        {msg.sender === 'aisa' && (
                          <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
                            <button 
                              onClick={() => speakText(msg.text)}
                              className="text-xs text-orange-400 hover:text-orange-300 flex items-center space-x-1 font-medium bg-orange-500/5 px-2 py-1 rounded border border-orange-500/10 cursor-pointer"
                            >
                              <Volume2 className="h-3.5 w-3.5" />
                              <span>Listen Response</span>
                            </button>

                            {/* Voice option in bubble */}
                            <select 
                              value={selectedVoice}
                              onChange={(e) => setSelectedVoice(e.target.value as VoiceName)}
                              className="bg-transparent text-[10px] text-gray-400 focus:outline-none cursor-pointer"
                            >
                              <option value="Kore">Kore</option>
                              <option value="Zephyr">Zephyr</option>
                              <option value="Puck">Puck</option>
                              <option value="Charon">Charon</option>
                              <option value="Fenrir">Fenrir</option>
                            </select>
                          </div>
                        )}

                        {/* Search citations grounding block */}
                        {msg.citations && msg.citations.length > 0 && (
                          <div className="mt-3 pt-2 border-t border-white/5">
                            <span className="text-[10px] font-mono font-bold text-orange-400 uppercase tracking-wider block mb-1">Google Grounded Sources:</span>
                            <div className="flex flex-wrap gap-1.5">
                              {msg.citations.slice(0, 3).map((cit, i) => (
                                <a 
                                  key={i} 
                                  href={cit.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-[10px] bg-[#050505] border border-white/10 hover:border-orange-500/50 text-gray-300 px-2 py-0.5 rounded transition-all truncate max-w-[150px]"
                                  title={cit.title}
                                >
                                  {cit.title}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  {isSearching && (
                    <div className="bg-white/5 border border-white/10 text-gray-200 self-start mr-auto max-w-[85%] rounded-xl p-3 text-sm flex items-center space-x-3">
                      <Loader2 className="h-4 w-4 animate-spin text-orange-400" />
                      <span className="text-xs font-mono text-gray-400 animate-pulse">Grounding personal docs & searching Google...</span>
                    </div>
                  )}
                </div>
              </div>

              {/* TWO COLUMN BENTO BOTTOM: Notes Synchronizer & Google Drive Browser */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
                
                {/* Notes manager (synchronized to "Aisa Notes" in Drive) */}
                <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-5 shadow-xl flex flex-col h-[380px]">
                  <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2.5">
                    <h4 className="text-sm font-semibold text-white flex items-center">
                      <FileText className="h-4 w-4 mr-2 text-orange-400" />
                      <span>Drive Personal Notes</span>
                    </h4>
                    <button
                      onClick={() => {
                        setSelectedNote(null);
                        setNoteTitle('');
                        setNoteContent('');
                      }}
                      className="bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 text-xs p-1 rounded cursor-pointer"
                      title="New Note"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Loading block */}
                  {notesLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-xs font-mono">
                      <Loader2 className="h-5 w-5 animate-spin text-orange-500 mb-2" />
                      <span>Syncing notes folder...</span>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {/* Editor Active vs List view */}
                      {selectedNote || noteTitle || noteContent ? (
                        <div className="flex-1 flex flex-col space-y-2.5 overflow-y-auto">
                          <input
                            type="text"
                            placeholder="Note Title"
                            value={noteTitle}
                            onChange={(e) => setNoteTitle(e.target.value)}
                            className="bg-[#050505] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500 w-full font-bold"
                          />
                          <textarea
                            placeholder="Note content... (e.g. daily tasks, personal info, project draft)"
                            value={noteContent}
                            onChange={(e) => setNoteContent(e.target.value)}
                            className="bg-[#050505] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500 w-full flex-1 min-h-[140px] resize-none"
                          />
                          <div className="flex space-x-2 justify-end">
                            <button
                              onClick={() => {
                                setSelectedNote(null);
                                setNoteTitle('');
                                setNoteContent('');
                              }}
                              className="border border-white/10 hover:bg-white/5 text-xs px-3 py-1.5 rounded cursor-pointer text-gray-300"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleSaveNote}
                              disabled={isSavingNote || !noteTitle.trim()}
                              className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-800 disabled:text-gray-400 text-black font-semibold text-xs px-4 py-1.5 rounded flex items-center space-x-1.5 cursor-pointer"
                            >
                              {isSavingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                              <span>Save Note</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Notes List */
                        <div className="flex-1 overflow-y-auto space-y-2">
                          {notes.length === 0 ? (
                            <div className="text-gray-500 text-center py-10 text-xs italic">
                              No notes in Aisa Notes folder. Click the '+' icon above to add a personalized note.
                            </div>
                          ) : (
                            notes.map((note) => (
                              <div 
                                key={note.id}
                                className="group bg-[#050505]/40 hover:bg-[#050505]/80 border border-white/5 hover:border-white/15 rounded-xl p-3 flex items-start justify-between transition-all"
                              >
                                <div 
                                  onClick={() => {
                                    setSelectedNote(note);
                                    setNoteTitle(note.title);
                                    setNoteContent(note.content);
                                  }}
                                  className="flex-1 pr-3 cursor-pointer"
                                >
                                  <h5 className="text-xs font-semibold text-white group-hover:text-orange-400 transition-colors">{note.title}</h5>
                                  <p className="text-[10px] text-gray-500 line-clamp-2 mt-1 leading-relaxed">{note.content}</p>
                                </div>
                                <button
                                  onClick={() => handleDeleteNote(note.id, note.title)}
                                  className="text-gray-600 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                  title="Delete Note"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Google Drive Document Browser */}
                <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-5 shadow-xl flex flex-col h-[380px]">
                  <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2.5">
                    <h4 className="text-sm font-semibold text-white flex items-center">
                      <Cpu className="h-4 w-4 mr-2 text-orange-400" />
                      <span>Google Drive Archives</span>
                    </h4>
                    <button 
                      onClick={loadDriveFiles}
                      className="text-gray-400 hover:text-white p-1 rounded cursor-pointer"
                      title="Reload Files"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {driveLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-xs font-mono">
                      <Loader2 className="h-5 w-5 animate-spin text-orange-500 mb-2" />
                      <span>Retrieving Drive documents...</span>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto space-y-2">
                      {driveFiles.length === 0 ? (
                        <div className="text-gray-500 text-center py-10 text-xs italic">
                          No text documents or Google Docs found in your Google Drive.
                        </div>
                      ) : (
                        driveFiles.map((file) => (
                          <div 
                            key={file.id}
                            onClick={() => {
                              // Auto-generate grounding query about this file
                              setSearchQuery(`Read and summarize file "${file.name}"`);
                            }}
                            className="bg-[#050505]/40 border border-white/5 hover:border-orange-500/30 p-2.5 rounded-xl flex items-center space-x-3 hover:bg-[#050505]/80 transition-all cursor-pointer group"
                          >
                            <div className="bg-[#050505] border border-white/10 p-2 rounded-lg group-hover:bg-orange-500/10 group-hover:border-orange-500/20 transition-colors">
                              <FileText className="h-4 w-4 text-orange-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h5 className="text-[11px] font-medium text-gray-200 group-hover:text-white transition-colors truncate">{file.name}</h5>
                              <p className="text-[9px] font-mono text-gray-500 mt-0.5 truncate">{file.mimeType.split('.').pop()?.toUpperCase() || file.mimeType}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

              </div>

            </div>
          </>
        )}
      </main>

      {/* Aesthetic Footer */}
      <footer className="border-t border-white/5 bg-black/40 py-4 px-6 text-center text-xs text-gray-600 font-mono flex flex-col sm:flex-row items-center justify-between max-w-7xl w-full mx-auto mt-6 z-10">
        <div>Aisa Voice Portal is active and running in secure Cloud Run containers.</div>
        <div>Powered by Gemini 3 series • Google Free Tier</div>
      </footer>

      {/* Dynamic API Configuration Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-[#0c0c0c] border border-white/10 w-full max-w-lg rounded-2xl shadow-2xl p-6 relative overflow-hidden z-10 text-left"
            >
              {/* Top ambient glow */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full bg-orange-500/10 blur-3xl pointer-events-none" />

              <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
                <div className="flex items-center space-x-2">
                  <Key className="h-5 w-5 text-orange-400" />
                  <h3 className="font-display font-medium text-lg text-white">Gemini API Key Settings</h3>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="text-gray-400 hover:text-white transition-colors p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-xs text-gray-400 leading-relaxed font-light">
                  Aisa communicates with the Google Gemini API to run its conversational features. If our pre-paid workspace credits are depleted, you can easily bypass this by pasting your own **personal Gemini API key** below.
                </p>

                <div className="bg-orange-500/5 border border-orange-500/15 p-3.5 rounded-xl">
                  <h4 className="text-xs font-bold text-orange-400 flex items-center mb-1">
                    <Sparkles className="h-3 w-3 mr-1" /> Free Tier Google Account Quota
                  </h4>
                  <p className="text-[11px] text-gray-400 leading-relaxed font-light">
                    You can get an API key <strong>completely free</strong> under Google AI Studio's Free Tier (provides up to 15 Requests/Min).
                  </p>
                  <a
                    href="https://aistudio.google.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-orange-400 hover:text-orange-300 underline font-semibold mt-1.5 inline-block"
                  >
                    Get a Free API Key from Google AI Studio ↗
                  </a>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-widest text-gray-400 font-semibold block">Personal API Key</label>
                  <input
                    type="password"
                    placeholder="paste your AI Studio API Key (AIzaSy...)"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    className="w-full bg-black border border-white/10 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-orange-500"
                  />
                  {customApiKey ? (
                    <p className="text-[10px] text-emerald-400 flex items-center font-mono mt-1">
                      <Check className="h-3.5 w-3.5 mr-1" /> Custom key active. Running on personal quota!
                    </p>
                  ) : (
                    <p className="text-[10px] text-gray-500 font-mono mt-1">
                      Currently using our default system developer key (if credits available).
                    </p>
                  )}
                </div>

                <div className="flex space-x-2.5 justify-end border-t border-white/5 pt-4 mt-6">
                  {customApiKey && (
                    <button
                      onClick={() => {
                        setApiKeyInput('');
                        handleSaveApiKey('');
                      }}
                      className="text-xs font-semibold text-red-400 hover:text-red-300 px-4 py-2 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 cursor-pointer transition-all mr-auto"
                    >
                      Clear Saved Key
                    </button>
                  )}
                  <button
                    onClick={() => setIsSettingsOpen(false)}
                    className="text-xs font-semibold text-gray-400 hover:text-white px-4 py-2 rounded-xl border border-white/5 cursor-pointer transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSaveApiKey(apiKeyInput)}
                    className="text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-black px-5 py-2 rounded-xl cursor-pointer transition-all shadow-lg hover:shadow-orange-500/15"
                  >
                    Save & Apply Key
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
