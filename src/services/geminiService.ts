
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "AIzaSyACcQnBiBRwFWDx-3nAigF9fHUYSY7nl8g" });

export interface SmartEventParams {
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  category: string;
  location: string;
}

export const parseEventNaturalLanguage = async (input: string): Promise<Partial<SmartEventParams>> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Parse this sentence into a calendar event: "${input}". 
      Assume today's date if not specified.
      If it's about the future, assume reasonable defaults.
      Available categories: Work, Personal, Meeting, Health, Other.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            startTime: { type: Type.STRING, description: "HH:mm format" },
            endTime: { type: Type.STRING, description: "HH:mm format" },
            category: { type: Type.STRING },
            location: { type: Type.STRING }
          },
          required: ["title", "startTime", "endTime"]
        }
      }
    });

    return JSON.parse(response.text.trim());
  } catch (error) {
    console.error("Gemini failed to parse event:", error);
    return {};
  }
};
