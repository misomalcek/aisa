import { GoogleGenAI } from '@google/genai';

function getAIClient(customKey?: string) {
  const apiKey = customKey || import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API Key is missing. Please provide your own API Key in settings to run Aisa.');
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
    return 'Your Google AI Studio prepayment credits are depleted (429 RESOURCE_EXHAUSTED). Please top up your account balance or go to settings to configure your own free Gemini API key.';
  }
  return errStr || 'An error occurred while generating a response from Gemini';
}

export async function chatGroundedSearch(message: string, history: any[], personalContext: string, customKey: string) {
  try {
    const dynamicAI = getAIClient(customKey);

    let systemInstruction = "You are Aisa (AI Studio Assistant), an elegant, voice-enabled intelligence. ";
    systemInstruction += "You communicate with poise, warmth, and accuracy. You can translate real-time and provide deep answers. ";
    if (personalContext) {
      systemInstruction += "\n\n=== USER'S PERSONAL ARCHIVE (Google Drive & Notes Context) ===\n";
      systemInstruction += personalContext;
      systemInstruction += "\n===========================================================\n";
      systemInstruction += "Always prioritize grounding your responses with this personal context when discussing user files, tasks, or notes. ";
    }
    systemInstruction += "If the user asks questions needing real-time web verification, use the Google Search tool. Always output citations when using Google Search.";

    const formattedContents = history.map((msg: any) => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    }));

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

    return { text, citations };
  } catch (error: any) {
    console.error('Chat generation error:', error);
    throw new Error(formatAIError(error));
  }
}

export async function generateTTS(text: string, voiceName: string, customKey: string) {
  try {
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

    return base64Audio;
  } catch (error: any) {
    console.error('TTS generation error:', error);
    throw new Error(formatAIError(error));
  }
}

export async function transcribeAudio(audioBase64: string, mimeType: string, customKey: string) {
  try {
    const dynamicAI = getAIClient(customKey);

    const response = await dynamicAI.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: audioBase64,
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
    return text.trim();
  } catch (error: any) {
    console.error('Transcription API error:', error);
    throw new Error(formatAIError(error));
  }
}
