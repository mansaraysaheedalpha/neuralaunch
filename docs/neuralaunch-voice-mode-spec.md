# NeuraLaunch — Voice Mode Specification

---

## 1. What Voice Mode Is

Voice mode is a speech-to-text input layer across every text input surface in NeuraLaunch. It does not change what the agents do — it changes how the founder communicates with them. The founder speaks instead of types. The system transcribes their speech into text. The text enters the existing pipeline exactly as if it had been typed. The agent responds with text on screen.

Voice mode solves one problem: **founders have more to say than they will ever type.** A founder describing their situation verbally will speak for 2-3 minutes, covering their background, frustrations, failed attempts, constraints, and the thing that happened last week that made them finally seek help. The same founder facing a text box will type 2-3 sentences because typing is effort and people self-edit when they type. They leave out the context that the agents need most.

The interview engine was designed to extract maximum information from rich responses so it can ask fewer follow-up questions. Voice is the input mode that produces those rich responses. A founder who speaks for 3 minutes gives the agent enough context to potentially skip 5-6 questions. Voice doesn't change the engine — it feeds the engine better fuel.

---

## 2. Design Principles

### 2.1 Voice-to-text, not voice-to-voice

The agent's response stays as text on screen. The founder reads the question, thinks about it, and chooses when to speak their answer. There is no time pressure, no awkward silence, no need to ask "could you repeat that?" The founder has the speed of voice with the precision of text.

**Why not voice-to-voice:**
- The founder needs to re-read questions, think through answers, and recall details before responding
- Voice-to-voice puts conversational time pressure on the founder — silence feels awkward
- Voice-to-voice requires persistent low-latency connections that are fragile on 3G/4G
- Text responses are scannable, re-readable, and searchable — audio responses are not
- The entire downstream pipeline (check-in agent, continuation brief, Cycle Summary) works on text

### 2.2 WhatsApp voice note pattern

The interaction should feel like recording a WhatsApp voice note — the single most familiar voice interaction pattern for the target user base. Tap the microphone, speak for as long as you want, tap to stop. The recording is sent, transcribed, and appears as text.

### 2.3 Edit before send

After transcription, the founder sees their words as text with the option to edit before sending. They can fix transcription errors, remove something they didn't mean to say, or add a forgotten detail. Most of the time they will send without editing — but having the option removes the anxiety of "what if it transcribes wrong?"

### 2.4 Available everywhere, not just the interview

The microphone button appears on every text input in the system. The interview is the highest-value surface, but the same principle applies to check-ins, Coach setup, Research Tool queries, Composer descriptions, and Packager adjustments. The architecture is identical everywhere.

### 2.5 The agent never speaks back

All agent responses remain as text on screen. No text-to-speech on agent outputs. This keeps the interface consistent, keeps responses scannable and re-readable, and avoids the cost and latency of text-to-speech synthesis.

A future "read aloud" accessibility feature could be added as an additive layer on top — a button on any agent response that reads it aloud using the device's native text-to-speech. This requires no server-side TTS infrastructure and is a separate feature from voice mode.

---

## 3. The Voice Input Flow

### 3.1 Step by step

1. **The founder sees a text input** — any input in the system (interview chat, check-in form, Coach setup, Research query, etc.). Next to the text input is a microphone icon button.

2. **Tap to record.** The founder taps the microphone button. The UI transitions to recording state: the microphone icon pulses, a timer shows elapsed recording time, and a waveform visualisation shows audio is being captured. The text input area shows "Recording..." in a muted state.

3. **Speak.** The founder speaks for as long as they want. There is no time limit imposed by the UI — the practical limit is determined by the speech-to-text provider (typically 5-10 minutes per clip, which is far more than any founder will use in a single response). A typical interview response might be 30 seconds to 3 minutes.

4. **Tap to stop.** The founder taps the stop button (the microphone icon transforms to a stop/square icon during recording). Recording ends.

5. **Transcription processing.** The audio is uploaded to the server. The server sends it to the speech-to-text provider. A loading state shows "Transcribing..." with a brief animation. Typical transcription time: 1-5 seconds depending on audio length and network speed.

6. **Review the transcription.** The transcribed text appears in the text input area as editable text. The founder sees exactly what the system heard. Below the text are two buttons: "Edit" (selects the text for editing) and "Send" (submits the text). If the transcription is clearly wrong (rare with modern providers but possible on noisy connections), the founder can tap a "Re-record" button to try again.

7. **Send.** The founder taps Send. The text enters the existing pipeline exactly as if it had been typed. The agent processes it and responds with text on screen. The voice origin is invisible to the agent — it receives plain text.

### 3.2 Cancel during recording

If the founder changes their mind during recording, they can tap a cancel/X button to discard the recording without transcription. The UI returns to the normal text input state.

### 3.3 Fallback to typing

Voice mode never replaces the text input — it augments it. The text input field is always visible and functional. The founder can choose to type on any interaction, even if they've been using voice for the entire session. The microphone button is an addition to the input, not a replacement.

---

## 4. Speech-to-Text Provider Evaluation

### 4.1 Requirements

The provider must support:
- English as the primary language (with accurate transcription of West African, Nigerian, Ghanaian, and other English accents)
- Audio file upload (not just real-time streaming) — the founder records first, then the audio is sent as a complete file
- Fast turnaround — under 5 seconds for a 2-minute clip
- Reasonable cost — voice mode will be used by Compound tier users primarily, so the cost must fit within the Compound tier's margin
- Reliable API with good uptime
- Ability to handle background noise (founders may record in noisy environments)

### 4.2 Provider Comparison

| Provider | Model | Cost | Latency | Accuracy | Accent Support | Notes |
|---|---|---|---|---|---|---|
| **OpenAI Whisper API** | whisper-1 | $0.006 per minute | ~2-5 seconds for 2-minute clip | High (state of the art for general speech) | Good across English accents | Hosted by OpenAI, simple API, batch upload |
| **Deepgram** | Nova-2 | $0.0043 per minute (pay-as-you-go) | Real-time or batch, very fast | High, competitive with Whisper | Strong accent handling, trained on diverse English | Developer-friendly, WebSocket and REST options |
| **AssemblyAI** | Universal-2 | $0.01 per minute (async) | ~5-10 seconds for 2-minute clip | Very high | Good multi-accent support | Higher accuracy but higher cost and latency |
| **Google Cloud Speech-to-Text** | V2 | $0.016 per minute (standard) | ~3-8 seconds | High | Excellent multi-language and accent support | Complex setup, higher cost, GCP dependency |
| **Local Whisper (self-hosted)** | whisper-large-v3 | Free (compute cost only) | Depends on hardware | Same as OpenAI Whisper | Same | Requires GPU infrastructure, complex to manage |

### 4.3 Recommendation: Deepgram Nova-2

**Primary:** Deepgram Nova-2 at $0.0043/minute.

Deepgram offers the best combination of cost, speed, and accuracy for NeuraLaunch's use case. At $0.0043 per minute, a founder who records 10 minutes of voice input in a session costs $0.043 — negligible within the Compound tier's margin. The API supports both REST (batch file upload) and WebSocket (real-time streaming), giving flexibility for future expansion. Nova-2 handles diverse English accents well, which is critical for the West African user base.

**Fallback:** OpenAI Whisper API at $0.006/minute.

If Deepgram has availability issues or if the accent accuracy proves insufficient in testing, Whisper is the reliable fallback. Slightly higher cost but proven quality. The integration is simpler (single REST endpoint with file upload).

**Do not self-host Whisper.** The operational complexity of maintaining GPU infrastructure for speech-to-text is not justified at NeuraLaunch's scale. The cost difference between hosted APIs ($0.004-0.006/minute) and self-hosted (GPU compute + maintenance) only favours self-hosting at extremely high volume — thousands of hours per month.

---

## 5. Cost Modelling

### 5.1 Per-Session Voice Usage Estimates

| Surface | Estimated Voice Time Per Use | Uses Per Month (Active User) | Monthly Voice Minutes |
|---|---|---|---|
| Discovery interview | 8-15 minutes total (across all responses) | 0.25 (one interview per ~4 months) | 2-4 minutes amortised |
| Check-in | 30 seconds - 2 minutes per check-in | 8-12 check-ins | 4-24 minutes |
| Coach setup | 1-3 minutes | 2-4 sessions | 2-12 minutes |
| Research query | 15-60 seconds | 3-5 queries | 1-5 minutes |
| Composer description | 15-30 seconds | 3-5 uses | 1-2.5 minutes |
| Packager input | 30-60 seconds | 1-2 uses | 0.5-2 minutes |
| **Total per month** | | | **10-50 minutes** |

### 5.2 Cost Per User Per Month

| Usage Level | Minutes | Deepgram Cost | Whisper Cost |
|---|---|---|---|
| Light (voice on interviews only) | 5-10 | $0.02-0.04 | $0.03-0.06 |
| Moderate (voice on interviews + check-ins) | 15-25 | $0.06-0.11 | $0.09-0.15 |
| Heavy (voice everywhere) | 35-50 | $0.15-0.22 | $0.21-0.30 |

**Conclusion:** Voice mode adds $0.02-0.30 per user per month to COGS. This is negligible — well within the Compound tier's margin. Voice mode does not require usage limits, credit systems, or per-minute billing. Unlimited voice input within the subscription is economically viable.

---

## 6. Technical Architecture

### 6.1 Audio Recording (Client-Side)

**Web (Next.js):**
Use the Web Audio API / MediaRecorder API to capture audio from the device microphone. Record in WebM/Opus format (widely supported, good compression, small file sizes). The recording is stored as a Blob in memory until the founder taps stop.

```typescript
// Simplified recording logic
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
const chunks: Blob[] = [];

mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
mediaRecorder.onstop = () => {
  const audioBlob = new Blob(chunks, { type: 'audio/webm' });
  // Upload audioBlob to transcription endpoint
};

mediaRecorder.start();
// ... founder speaks ...
mediaRecorder.stop();
```

**Mobile (React Native / Expo):**
Use `expo-av` Audio.Recording API to capture audio. Record in M4A/AAC format (native iOS/Android format, good quality, small size).

```typescript
import { Audio } from 'expo-av';

const recording = new Audio.Recording();
await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
await recording.startAsync();
// ... founder speaks ...
await recording.stopAndUnloadAsync();
const uri = recording.getURI(); // Local file URI
// Upload to transcription endpoint
```

### 6.2 Microphone Permissions

**Web:** The browser will prompt for microphone permission on first use. The voice button should handle the permission denied state gracefully — show a message explaining that microphone access is needed and how to enable it in browser settings.

**Mobile:** Request microphone permission explicitly using `expo-av` Permissions before the first recording attempt. If denied, show an in-app prompt explaining why microphone access is needed with a button that opens device settings.

Permission should be requested at the moment the founder first taps the microphone button — not during onboarding or app launch. Just-in-time permission requests have higher approval rates.

### 6.3 Audio Upload and Transcription (Server-Side)

Create a transcription API route:

**Route:** `POST /api/voice/transcribe`

**Authentication:** `requireUserId` — only authenticated users can transcribe.

**Rate limiting:** `VOICE_TRANSCRIPTION` tier — max 30 transcriptions per hour per user (prevents abuse while allowing heavy usage).

**Flow:**

1. Receive the audio file as a multipart form upload
2. Validate: file size under 25MB, audio format is supported (webm, m4a, mp4, wav, mp3)
3. Send to Deepgram API (or Whisper fallback) for transcription
4. Return the transcribed text to the client

```typescript
// app/api/voice/transcribe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { transcribeAudio } from '@/lib/voice/transcriber';

export async function POST(req: NextRequest) {
  const userId = await requireUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await req.formData();
  const audioFile = formData.get('audio') as File;

  if (!audioFile) {
    return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
  }

  // Validate file size (25MB max)
  if (audioFile.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: 'Audio file too large' }, { status: 400 });
  }

  const transcription = await transcribeAudio(audioFile);

  return NextResponse.json({
    text: transcription.text,
    duration: transcription.duration, // seconds
    confidence: transcription.confidence,
  });
}
```

### 6.4 Transcription Service Abstraction

Create a provider-agnostic transcription module:

```typescript
// lib/voice/transcriber.ts

interface TranscriptionResult {
  text: string;
  duration: number; // audio duration in seconds
  confidence: number; // 0-1
  provider: 'deepgram' | 'whisper';
}

export async function transcribeAudio(audioFile: File): Promise<TranscriptionResult> {
  try {
    return await transcribeWithDeepgram(audioFile);
  } catch (error) {
    console.error('Deepgram transcription failed, falling back to Whisper:', error);
    return await transcribeWithWhisper(audioFile);
  }
}

async function transcribeWithDeepgram(audioFile: File): Promise<TranscriptionResult> {
  const buffer = Buffer.from(await audioFile.arrayBuffer());

  const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=en', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
      'Content-Type': audioFile.type,
    },
    body: buffer,
  });

  const data = await response.json();
  const result = data.results.channels[0].alternatives[0];

  return {
    text: result.transcript,
    duration: data.metadata.duration,
    confidence: result.confidence,
    provider: 'deepgram',
  };
}

async function transcribeWithWhisper(audioFile: File): Promise<TranscriptionResult> {
  const formData = new FormData();
  formData.append('file', audioFile);
  formData.append('model', 'whisper-1');
  formData.append('language', 'en');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: formData,
  });

  const data = await response.json();

  return {
    text: data.text,
    duration: data.duration || 0,
    confidence: 0.95, // Whisper doesn't return confidence scores
    provider: 'whisper',
  };
}
```

The fallback chain: Deepgram (primary) → Whisper (fallback). If both fail, the client shows an error message and the founder can re-record or fall back to typing.

### 6.5 No Audio Storage

Raw audio files are never permanently stored. The audio is:
1. Recorded on the client device (in-memory blob)
2. Uploaded to the transcription endpoint
3. Forwarded to the speech-to-text provider
4. Discarded after the transcription text is returned

Only the transcribed text is stored in the database — as part of the interview transcript, check-in history, or tool session, exactly as if it had been typed. The text record includes a `inputMethod: 'voice'` metadata flag so the system knows the text originated from voice input, but the audio itself is not retained.

This is explicitly stated in the Privacy Policy: "Raw audio may be temporarily processed for transcription but is not permanently stored."

---

## 7. UI Components

### 7.1 VoiceInputButton

A microphone icon button that sits alongside every text input in the system. Three states:

**Idle state:** Microphone icon in the secondary text color. Tapping initiates recording.

**Recording state:** Microphone icon pulses in the primary accent color (electric blue). A timer shows elapsed time (0:00, 0:01, 0:02...). A subtle waveform animation shows audio is being captured. A cancel (X) button appears to discard the recording.

**Processing state:** A loading spinner replaces the microphone icon. Text shows "Transcribing..." Duration of the original recording is shown.

### 7.2 VoiceTranscriptionReview

After transcription completes, the transcribed text appears in the text input area. Below the input:

- **Send button** — submits the text as-is (primary action, prominent)
- **Edit button** — activates the text input for keyboard editing (secondary action)
- **Re-record button** — discards the transcription and returns to idle state (tertiary action, small)

If the transcription confidence is below a threshold (e.g., 0.7), a subtle warning appears: "The transcription may contain errors. Please review before sending." This encourages the founder to check the text without blocking them.

### 7.3 VoicePermissionPrompt

Shown when the founder taps the microphone button for the first time and the browser/OS permission hasn't been granted yet.

**Web:** "NeuraLaunch needs access to your microphone to transcribe your voice. This is used only during recording — no audio is stored." With a "Allow microphone" button that triggers the browser permission dialog.

**Mobile:** "To use voice input, NeuraLaunch needs access to your microphone. Your voice is transcribed to text and the audio is not stored." With "Allow" and "Not now" buttons. "Not now" hides the prompt and the voice button remains available for future attempts.

### 7.4 Voice Input Indicator on Messages

When a message was transcribed from voice (the `inputMethod: 'voice'` flag is set), a small microphone icon appears next to the message in the chat history. This is a subtle visual cue — not prominent, just informational. It helps the founder distinguish their voice-input messages from typed messages when scrolling back through a session.

---

## 8. Per-Surface Behaviour

The voice button appears on every text input, but some surfaces have specific behaviours:

### 8.1 Discovery Interview

The interview is the highest-value voice surface. Founders describing their situation verbally produce richer, longer responses that allow the interview agent to extract more belief state dimensions per response and ask fewer follow-up questions.

**Specific behaviour:** When the founder sends a voice-transcribed message in the interview, the UI briefly shows the word count and estimated speaking time below their message: "247 words — about 1.5 minutes of speaking." This is a subtle positive reinforcement — it shows the founder that their voice input gave the system rich context. It also helps the system analyst (you) understand whether voice users provide meaningfully more context than typing users.

**No change to the agent:** The interview agent receives plain text. It does not know or care that the text came from voice. The existing interview logic (extract maximum information from each response, reduce follow-up questions) works identically.

### 8.2 Check-ins

Voice check-ins mirror the WhatsApp voice note experience the target user base is already familiar with. The founder opens a task, taps the microphone, and says "I talked to three hotels today, two were interested in the trial, one said the pricing was too high but asked me to come back with a lower tier. I think I need to add a basic tier at 25 cedis."

**Specific behaviour:** After transcription, the check-in category is auto-suggested based on the transcription content. If the founder mentions "blocked" or "stuck" or "can't figure out," the category pre-selects to "Blocked." If they mention completing something, it pre-selects to "Completed." The founder can change the category before submitting.

### 8.3 Conversation Coach Setup

The Coach setup asks about the upcoming conversation — who, what, why, and what the founder is afraid of. These are emotional questions that founders answer more honestly and completely when speaking.

**Specific behaviour:** No special behaviour. The voice button appears on the chat input during the setup exchange. The founder speaks their answers. The setup agent receives text.

### 8.4 Conversation Coach Role-Play

The role-play is the one surface where voice-to-voice would be most natural — the founder is literally rehearsing a conversation. However, for v1, the role-play remains text-based with voice input only. The founder speaks their side of the conversation, it's transcribed, and the AI responds with text.

**Future consideration:** Voice-to-voice role-play (the AI speaks back in character) is a compelling future feature but requires real-time TTS with low latency and character-consistent voice. This is a separate spec and a separate build, after the voice-to-text foundation is proven.

### 8.5 Outreach Composer

The founder describes the recipient and the purpose of the outreach. Voice input here is convenience — "I want to reach out to the hotel manager I met yesterday at the business mixer, his name is Ibrahim, he runs a 50-room hotel in East Legon and he mentioned he's unhappy with his current laundry provider."

**Specific behaviour:** No special behaviour. The voice button appears on the recipient description and purpose inputs.

### 8.6 Research Tool

The founder describes their research question. Voice input produces more natural, detailed queries: "I need to know who supplies restaurant equipment in the Freetown area, what they charge, whether they offer financing, and if any of them have worked with small restaurants that are just starting out."

**Specific behaviour:** No special behaviour. The voice button appears on the research query input.

### 8.7 Service Packager

Voice input on the context confirmation step (when the founder adjusts the pre-populated summary) and on adjustment requests. "Actually I want to add a rush service tier for events — hotels sometimes need same-day turnaround for conference laundry and I could charge a premium for that."

**Specific behaviour:** No special behaviour. The voice button appears on the confirmation input and adjustment input.

---

## 9. Environment Variables

```
DEEPGRAM_API_KEY=[key]           # Primary transcription provider
OPENAI_API_KEY=[key]             # Already exists — used for Whisper fallback
```

The OpenAI API key already exists in the environment for the Gemini Flash fallback chain. Whisper uses the same key. No new OpenAI configuration is needed.

---

## 10. Tier Gating

Voice mode is gated to the **Compound tier** ($49/month).

**Implementation:** The `VoiceInputButton` component checks the user's subscription tier from the session. If the tier is not `compound`, the microphone button is hidden or replaced with a subtle "Upgrade to use voice" indicator.

**API-level enforcement:** The `POST /api/voice/transcribe` route checks the user's tier before processing. Non-Compound users receive a 403 response.

**Why gate to Compound:** Voice mode is a premium experience that differentiates the $49 tier from the $29 tier. It adds real cost (speech-to-text API calls) and real value (richer context, faster interviews, more natural interaction). Gating it to Compound creates a clear upgrade incentive for Execute-tier founders who want the voice experience.

---

## 11. Bandwidth and Offline Considerations

### 11.1 Audio File Sizes

WebM/Opus at speech-quality bitrate (~32kbps): a 2-minute recording is approximately 480KB. This is smaller than a typical smartphone photo. Even on 3G connections (300-400 kbps), a 2-minute voice clip uploads in 1-2 seconds. Voice mode is inherently low-bandwidth-friendly.

### 11.2 Offline Recording (Mobile Only)

On the mobile app, if the founder records a voice message while offline (no network connection), the recording is saved locally. When connectivity returns, the audio is uploaded for transcription and the transcribed text is delivered to the appropriate input. The UI shows "Saved — will transcribe when online" during the offline period.

This is important for the target user base — intermittent connectivity is common.

### 11.3 Compression

Audio is recorded at speech-quality settings (mono, 16kHz sample rate or higher, Opus codec). There is no need for high-fidelity music-quality recording. Speech-quality compression produces small files with excellent transcription accuracy.

---

## 12. Analytics and Quality Monitoring

### 12.1 Metrics to Track

Track the following to monitor voice mode quality and usage:

- **Voice adoption rate:** percentage of Compound users who use voice at least once per week
- **Voice vs typed response length:** average word count of voice-transcribed messages vs typed messages (expected: voice produces 3-5x more words)
- **Transcription accuracy:** percentage of voice messages that are edited before sending (high edit rate indicates transcription quality issues)
- **Re-record rate:** percentage of recordings that are discarded and re-recorded (high rate indicates UX or quality issues)
- **Voice-input interview length:** number of interview questions asked when founder uses voice vs types (expected: fewer questions needed when voice is used)
- **Surface distribution:** which surfaces have the highest voice usage (expected: interview and check-ins)

### 12.2 Quality Alerts

If the average edit rate exceeds 20% for a specific accent or region, investigate whether the transcription provider handles that accent well. Consider adding accent hints to the transcription request if the provider supports it (Deepgram supports `language=en-GB`, `en-US`, `en-AU` etc.).

---

## 13. Security

- Audio files are transmitted over HTTPS (TLS encrypted in transit)
- Audio files are never stored permanently — processed in memory and discarded after transcription
- The transcription endpoint requires authentication (`requireUserId`) and is rate-limited
- Transcribed text goes through `renderUserContent()` before being processed by any agent — same as typed text
- The SECURITY NOTE appears in all agent prompts regardless of input method
- Voice recordings are not included in training data exports or anonymised datasets — only the transcribed text is included (if the founder opts in)

---

## 14. Implementation Phases

### Phase 1 — Infrastructure

Set up the transcription service abstraction (`lib/voice/transcriber.ts`) with Deepgram as primary and Whisper as fallback. Create the `POST /api/voice/transcribe` route with authentication, validation, and rate limiting. Test with sample audio files in multiple English accents.

### Phase 2 — Web Client

Build the `VoiceInputButton`, `VoiceTranscriptionReview`, and `VoicePermissionPrompt` components. Integrate with the Web Audio API / MediaRecorder. Add the voice button to the interview chat input first. Test the full flow: record → upload → transcribe → review → send.

### Phase 3 — Mobile Client

Build the equivalent components in React Native using `expo-av`. Add the voice button to the interview chat input. Test on physical devices (not simulators) to verify microphone access, audio quality, and upload reliability on various connection speeds.

### Phase 4 — Expand to All Surfaces

Once the interview voice input is validated, add the microphone button to: check-in input, Coach setup chat, Research Tool query input, Composer description inputs, Packager confirmation and adjustment inputs. Each surface uses the same `VoiceInputButton` component — no per-surface engineering.

### Phase 5 — Tier Gating and Launch

Enable the Compound tier gate on the voice transcription route. Hide the voice button for non-Compound users. Add the "Voice mode" feature to the Compound tier marketing on the pricing page. Launch.

### Phase 6 — Monitoring and Optimisation

Activate the analytics tracking from Section 12. Monitor transcription accuracy across accents. Adjust provider configuration if needed. Evaluate whether voice users generate measurably richer interview context than typing users — this data validates the feature's core hypothesis.