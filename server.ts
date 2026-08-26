import express from 'express';
import path from 'path';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = 3000;

// Helper: Get dynamic client for user-specific key support
function getAIClient(customKey?: string) {
  const apiKey = customKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API Key is missing. Please provide your own API Key in settings to run Aisa on your personal quota.');
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Helper: Standardize AI error messages (detect quota/billing 429 exhaustions)
function formatAIError(error: any): string {
  const errStr = error?.message || error?.toString() || '';
  if (
    errStr.includes('RESOURCE_EXHAUSTED') ||
    errStr.includes('quota') ||
    errStr.includes('429') ||
    errStr.includes('prepayment') ||
    errStr.includes('billing') ||
    errStr.includes('limit')
  ) {
    return 'Your Google AI Studio prepayment credits are depleted (429 RESOURCE_EXHAUSTED). All search, spoken, and vocal features require active billing credits. Please top up your account balance at Google AI Studio Billing or go to settings to configure your own free Gemini API key.';
  }
  return errStr || 'An error occurred while generating a response from Gemini';
}

// Helper: Fetch Google Drive files using Bearer Token
async function fetchDriveFiles(accessToken: string, query = '') {
  try {
    // List text files and google docs
    let q = "(mimeType = 'text/plain' or mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/json')";
    if (query) {
      q += ` and name contains '${query.replace(/'/g, "\\'")}'`;
    }
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime,size)&pageSize=30`;
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Drive API returned ${response.status}: ${errorText}`);
    }
    const data = await response.json();
    return data.files || [];
  } catch (error) {
    console.error('Error fetching from Google Drive:', error);
    return [];
  }
}

// Helper: Fetch content of a specific Drive file
async function fetchDriveFileContent(accessToken: string, fileId: string, mimeType: string): Promise<string> {
  try {
    let url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    if (mimeType === 'application/vnd.google-apps.document') {
      url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
    }
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (!response.ok) {
      return `[Error loading file content: ${response.statusText}]`;
    }
    return await response.text();
  } catch (error) {
    console.error(`Error loading content for file ${fileId}:`, error);
    return `[Exception loading file content]`;
  }
}

// 1. Google Drive proxy: List files
app.post('/api/drive/files', async (req, res) => {
  const { accessToken, query } = req.body;
  if (!accessToken) {
    return res.status(401).json({ error: 'OAuth Access Token is required' });
  }
  const files = await fetchDriveFiles(accessToken, query);
  res.json({ files });
});

// 2. Google Drive proxy: Get file content
app.post('/api/drive/file-content', async (req, res) => {
  const { accessToken, fileId, mimeType } = req.body;
  if (!accessToken || !fileId || !mimeType) {
    return res.status(400).json({ error: 'Missing parameters' });
  }
  const content = await fetchDriveFileContent(accessToken, fileId, mimeType);
  res.json({ content });
});

// 2b. Google Drive proxy: List notes in "Aisa Notes" folder
app.post('/api/drive/list-notes', async (req, res) => {
  const { accessToken } = req.body;
  if (!accessToken) {
    return res.status(401).json({ error: 'OAuth Access Token is required' });
  }
  try {
    let folderId = '';
    const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=name%3D%27Aisa+Notes%27+and+mimeType%3D%27application%2Fvnd.google-apps.folder%27+and+trashed%3Dfalse&fields=files(id)`;
    const searchRes = await fetch(folderSearchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const searchData = await searchRes.json();
    
    if (searchData.files && searchData.files.length > 0) {
      folderId = searchData.files[0].id;
    } else {
      return res.json({ notes: [] });
    }

    const listUrl = `https://www.googleapis.com/drive/v3/files?q=%27${folderId}%27+in+parents+and+mimeType%3D%27text%2Fplain%27+and+trashed%3Dfalse&fields=files(id,name,modifiedTime)&pageSize=50`;
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const listData = await listRes.json();
    const files = listData.files || [];

    const notes = await Promise.all(files.map(async (f: any) => {
      const content = await fetchDriveFileContent(accessToken, f.id, 'text/plain');
      return {
        id: f.id,
        title: f.name.replace(/\.txt$/, ''),
        content,
        modifiedTime: f.modifiedTime
      };
    }));

    res.json({ notes });
  } catch (err: any) {
    console.error('Error listing notes:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2c. Google Drive proxy: Create a note in "Aisa Notes" folder
app.post('/api/drive/create-note', async (req, res) => {
  const { accessToken, title, content } = req.body;
  if (!accessToken || !title) {
    return res.status(400).json({ error: 'Missing parameters' });
  }
  try {
    let folderId = '';
    const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=name%3D%27Aisa+Notes%27+and+mimeType%3D%27application%2Fvnd.google-apps.folder%27+and+trashed%3Dfalse&fields=files(id)`;
    const searchRes = await fetch(folderSearchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const searchData = await searchRes.json();
    
    if (searchData.files && searchData.files.length > 0) {
      folderId = searchData.files[0].id;
    } else {
      const createFolderRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Aisa Notes',
          mimeType: 'application/vnd.google-apps.folder'
        })
      });
      const folderData = await createFolderRes.json();
      folderId = folderData.id;
    }

    const boundary = 'foo_bar_baz';
    const metadataStr = JSON.stringify({
      name: `${title}.txt`,
      parents: [folderId],
      mimeType: 'text/plain'
    });
    
    const multipartBody = 
      `\r\n--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${metadataStr}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: text/plain\r\n\r\n` +
      `${content}\r\n` +
      `--${boundary}--`;

    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartBody
    });

    if (!uploadRes.ok) {
      throw new Error(`Failed to upload note to Drive: ${await uploadRes.text()}`);
    }

    const fileData = await uploadRes.json();
    res.json({ success: true, fileId: fileData.id });
  } catch (err: any) {
    console.error('Error creating note:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2d. Google Drive proxy: Update a note in Drive
app.post('/api/drive/update-note', async (req, res) => {
  const { accessToken, fileId, title, content } = req.body;
  if (!accessToken || !fileId || !title) {
    return res.status(400).json({ error: 'Missing parameters' });
  }
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: `${title}.txt`
      })
    });

    const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'text/plain'
      },
      body: content
    });

    if (!uploadRes.ok) {
      throw new Error(`Failed to update note content: ${await uploadRes.text()}`);
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error updating note:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2e. Google Drive proxy: Delete a note in Drive
app.post('/api/drive/delete-note', async (req, res) => {
  const { accessToken, fileId } = req.body;
  if (!accessToken || !fileId) {
    return res.status(400).json({ error: 'Missing parameters' });
  }
  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
      throw new Error(`Failed to delete note: ${await response.text()}`);
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting note:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Grounded Search Chat API (Gemini 3.5 Flash)
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [], personalContext = '' } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const customKey = req.headers['x-gemini-api-key'] as string;
    const dynamicAI = getAIClient(customKey);

    // Build user system instructions injecting Keep Notes and Drive files if available
    let systemInstruction = "You are Aisa (AI Studio Assistant), an elegant, voice-enabled intelligence. ";
    systemInstruction += "You communicate with poise, warmth, and accuracy. You can translate real-time and provide deep answers. ";
    if (personalContext) {
      systemInstruction += "\n\n=== USER'S PERSONAL ARCHIVE (Google Drive & Notes Context) ===\n";
      systemInstruction += personalContext;
      systemInstruction += "\n===========================================================\n";
      systemInstruction += "Always prioritize grounding your responses with this personal context when discussing user files, tasks, or notes. ";
    }
    systemInstruction += "If the user asks questions needing real-time web verification, use the Google Search tool. Always output citations when using Google Search.";

    // Convert history format to GenAI SDK contents structure
    const formattedContents = history.map((msg: any) => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    }));

    // Add current user prompt
    formattedContents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    let response;
    try {
      response = await dynamicAI.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: formattedContents,
        config: {
          systemInstruction,
          tools: [{ googleSearch: {} }],
        },
      });
    } catch (modelErr: any) {
      console.warn(`Primary model gemini-3.5-flash failed or unavailable (${modelErr.message || modelErr}), falling back to gemini-3.1-flash-lite...`);
      response = await dynamicAI.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: formattedContents,
        config: {
          systemInstruction,
          tools: [{ googleSearch: {} }],
        },
      });
    }

    const text = response.text || "I couldn't generate a response.";
    
    // Extract search grounding metadata / citations
    let citations: { title: string; url: string }[] = [];
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    if (groundingMetadata?.groundingChunks) {
      citations = groundingMetadata.groundingChunks
        .filter((chunk: any) => chunk.web?.title && chunk.web?.uri)
        .map((chunk: any) => ({
          title: chunk.web.title,
          url: chunk.web.uri,
        }));
    }

    res.json({ text, citations });
  } catch (error: any) {
    console.error('Chat generation error:', error);
    res.status(500).json({ error: formatAIError(error) });
  }
});

// 4. Text-To-Speech API (gemini-3.1-flash-tts-preview)
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voiceName = 'Kore' } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const customKey = req.headers['x-gemini-api-key'] as string;
    const dynamicAI = getAIClient(customKey);

    const response = await dynamicAI.models.generateContent({
      model: 'gemini-3.1-flash-tts-preview',
      contents: [{ parts: [{ text: `Say this: ${text}` }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error('No audio content returned from TTS model');
    }

    res.json({ audio: base64Audio });
  } catch (error: any) {
    console.error('TTS generation error:', error);
    res.status(500).json({ error: formatAIError(error) });
  }
});

// 5. Speech-To-Text Transcription API (using gemini-3.5-flash for audio files)
app.post('/api/transcribe', async (req, res) => {
  try {
    const { audio, mimeType = 'audio/webm' } = req.body;
    if (!audio) {
      return res.status(400).json({ error: 'Audio is required for transcription' });
    }

    const customKey = req.headers['x-gemini-api-key'] as string;
    const dynamicAI = getAIClient(customKey);

    const response = await dynamicAI.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: audio,
                mimeType: mimeType
              }
            },
            {
              text: "Transcribe the spoken words in the provided audio file. Provide ONLY the direct, verbatim transcription. Do not explain, do not add conversational filler or commentary, and output exactly what was spoken with clean capitalization and punctuation. If the audio has no speech or contains only noise/silence, return an empty string."
            }
          ]
        }
      ]
    });

    const text = response.text || "";
    res.json({ text: text.trim() });
  } catch (error: any) {
    console.error('Transcription API error:', error);
    res.status(500).json({ error: formatAIError(error) });
  }
});

// Create HTTP Server to attach WebSocket Server
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Live API WebSocket Tunnel Setup
wss.on('connection', (ws, req: http.IncomingMessage) => {
  console.log('Client connected to Aisa Live Stream WS');

  // Retrieve user custom API key from the query string if provided
  const urlObj = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  const userKey = urlObj.searchParams.get('key');
  const apiKey = userKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY is not defined in environment and no custom key provided.');
    ws.close(1011, 'GEMINI_API_KEY is missing. Please provide a custom API Key in settings.');
    return;
  }

  // Google Gemini Live API URI (Bidirectional WebSocket)
  const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
  const geminiWs = new WebSocket(geminiUrl);

  geminiWs.on('open', () => {
    console.log('Connected to official Gemini Live API');
  });

  // Pipe Client -> Gemini
  ws.on('message', (message, isBinary) => {
    if (geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.send(message, { binary: isBinary });
    }
  });

  // Pipe Gemini -> Client
  geminiWs.on('message', (message, isBinary) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message, { binary: isBinary });
    }
  });

  // Closures & Cleanup
  ws.on('close', () => {
    console.log('Client closed connection');
    if (geminiWs.readyState === WebSocket.OPEN || geminiWs.readyState === WebSocket.CONNECTING) {
      geminiWs.close();
    }
  });

  geminiWs.on('close', (code, reason) => {
    console.log(`Gemini Live API closed connection: ${code} - ${reason}`);
    if (ws.readyState === WebSocket.OPEN) {
      // Propagate potential credit/quota depletion error to client
      ws.send(JSON.stringify({
        error: {
          code: code || 429,
          message: reason?.toString() || 'Your prepayment credits are depleted. Please check your Google AI Studio project billing at https://aistudio.google.com/projects.'
        }
      }));
      ws.close();
    }
  });

  ws.on('error', (err) => {
    console.error('Client WS Error:', err);
    geminiWs.close();
  });

  geminiWs.on('error', (err) => {
    console.error('Gemini WS Error:', err);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        error: {
          code: 429,
          message: 'Gemini Live API connection refused or closed. Your prepayment credits are depleted. Please check your Google AI Studio project billing at https://aistudio.google.com/projects.'
        }
      }));
      ws.close();
    }
  });
});

// Attach WebSockets upgrade handler to HTTP Server
server.on('upgrade', (request, socket, head) => {
  const pathname = request.url ? new URL(request.url, `http://${request.headers.host}`).pathname : '';
  if (pathname === '/api/live-stream') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Implement Vite middleware or serve static files
const startApp = async () => {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Aisa full-stack server running on http://0.0.0.0:${PORT}`);
  });
};

startApp();
