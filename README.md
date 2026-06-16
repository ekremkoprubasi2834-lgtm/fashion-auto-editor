# fashion-auto-editor

Independent local Node.js + TypeScript CLI for generating editing assets for women's fashion YouTube videos.

Sprint 2 supports optional OpenAI audio transcription from `input/voiceover.mp3`. If there is no voiceover file or no `OPENAI_API_KEY`, the CLI falls back to `input/transcript.txt`.

This project does not include Pinterest integration, CapCut automation, automatic video rendering, SaaS panels, auth, database, or payments.

## Requirements

- Node.js 20+
- npm

## Setup

```bash
npm install
```

## Usage With Transcript Fallback

1. Add or edit transcript text in `input/transcript.txt`.
2. Run the CLI:

```bash
npm run dev
```

## Usage With Voiceover

1. Add `input/voiceover.mp3`.
2. Create `.env` from `.env.example`.
3. Set `OPENAI_API_KEY`.
4. Run the CLI:

```bash
npm run dev
```

When `input/voiceover.mp3`, `OPENAI_API_KEY`, and `TRANSCRIPTION_PROVIDER=openai` are present, the CLI transcribes the audio first. If transcription fails, it prints a warning and falls back to `input/transcript.txt`.

The CLI writes these files to `output/`:

- `transcript.txt`
- `speech_segments.json`
- `scene_segments.json`
- `visual_timeline.csv`
- `editing_guide.md`
- `subtitles.srt`

## Build and Start

```bash
npm run build
npm run start
```

## CSV Columns

`visual_timeline.csv` includes:

```text
start_time,end_time,section,spoken_text,visual_intent,suggested_asset_folder,search_keywords
```

## Error Handling

If `input/voiceover.mp3` or `.env` is missing, the CLI still works with `input/transcript.txt`. If the fallback transcript is missing or empty, the CLI exits with a clear error message explaining what to fix.
