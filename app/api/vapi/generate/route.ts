// ./app/api/vapi/generate/route.ts

// 1. IMPORT 'generateText' from 'ai'
import { generateText } from "ai"; 

// 2. IMPORT 'z' (Zod) from the 'zod' package itself
import { z } from "zod"; 

// 3. Keep the rest of your imports
import { google } from "@ai-sdk/google";
import { db } from "@/firebase/admin";
import { getRandomInterviewCover } from "@/lib/utils";

// ... rest of your route code

// Define the expected output structure using Zod
const interviewSchema = z.object({
  questions: z.array(z.string()).describe("An array of interview questions."),
});

export async function POST(request: Request) {
  let type: string, role: string, level: string, techstack: string, amount: number, userid: string;
  let body: any;

  // Robustly parse the request body and handle the 'Unexpected end of JSON input' error
  try {
    body = await request.json();
  } catch (e) {
    console.error("Failed to parse request body:", e);
    return Response.json({ success: false, error: "Invalid or empty JSON body." }, { status: 400 });
  }
  
  // Destructure after successful parsing
  ({ type, role, level, techstack, amount, userid } = body);

  // Basic validation for required fields
  if (!type || !role || !level || !techstack || !amount || !userid) {
    return Response.json({ success: false, error: "Missing required fields (type, role, level, techstack, amount, or userid) in request." }, { status: 400 });
  }

  try {
    // Use responseSchema to force the AI model to return structured JSON
    const aiResult = await generateText({
      model: google("gemini-1.5-flash").v2(),
      prompt: `Prepare questions for a job interview.
        The job role is ${role}.
        The job experience level is ${level}.
        The tech stack used in the job is: ${techstack}.
        The focus between behavioural and technical questions should lean towards: ${type}.
        The amount of questions required is: ${amount}.
        Please return only the questions, without any additional text.
        The questions are going to be read by a voice assistant so do not use "/" or "*" or any other special characters which might break the voice assistant.
        `, 
    });

    // Validate and parse the AI response using Zod
    let parsedQuestions: string[] = [];
    try {
      const parsed = interviewSchema.parse(JSON.parse(aiResult.text));
      parsedQuestions = parsed.questions;
    } catch (e) {
      return Response.json({ success: false, error: "AI response could not be parsed or validated." }, { status: 500 });
    }

    // Optional: Add validation to ensure the AI returned any questions
    if (!parsedQuestions || parsedQuestions.length === 0) {
        return Response.json({ success: false, error: "AI failed to generate questions." }, { status: 500 });
    }

    const interview = {
      role: role,
      type: type,
      level: level,
      techstack: techstack.split(",").map(s => s.trim()).filter(s => s.length > 0),
      questions: parsedQuestions,
      userId: userid,
      finalized: true,
      coverImage: getRandomInterviewCover(),
      createdAt: new Date().toISOString(),
    };

    // Store in database
    await db.collection("interviews").add(interview);

    return Response.json({ success: true, interviewId: (interview as any).id }, { status: 200 });
  } catch (error) {
    console.error("AI Generation or Database Error:", error);
    return Response.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ success: true, data: "Thank you!" }, { status: 200 });
}