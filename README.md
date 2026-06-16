# fashion-auto-editor

Independent local Node.js + TypeScript CLI for generating first-sprint editing assets for women's fashion YouTube videos.

This project does not include real audio transcription, Pinterest integration, CapCut automation, automatic video rendering, SaaS panels, auth, database, or payments. The first sprint uses `input/transcript.txt` as a dev fallback.

## Requirements

- Node.js 20+
- npm

## Setup

```bash
npm install
```

## Usage

1. Add or edit transcript text in `input/transcript.txt`.
2. Run the CLI:

```bash
npm run dev
```

The CLI writes these files to `output/`:

- `transcript.txt`
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

If `input/transcript.txt` is missing or empty, the CLI exits with a clear error message explaining what to fix.
