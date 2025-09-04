# BandScape Companion App (Python)

This is a lightweight desktop companion for BandScape to parse research files into BandScape schema tasks and safely apply them to `public/nodesData.json`.

## Features
- Data Correction: parse TXT/JSON/CSV/DOCX and optionally use Gemini to extract schema-compliant nodes
- Two preview panes: left (raw), right (task/result)
- Apply Task: merges into memory by filling only missing fields and de-duplicating arrays
- Apply to BandScape: backs up and saves `public/nodesData.json`

## Setup
1. Ensure Python 3.10+ is installed.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Create a `.env` in this folder with:
   ```env
   GEMINI_API_KEY=your_key_here
   ```

## Run
```bash
python app.py
```

## Task Format
A task is a JSON object with a `nodes` array mirroring BandScape's `nodesData` schema. Example:
```json
{
  "source_file": "path/to/file.txt",
  "created_at": "2025-08-24 19:24:18",
  "nodes": [
    {
      "type": "member",
      "name": "John Doe",
      "aliases": ["J. Doe"],
      "description": "",
      "image_url": "",
      "website_url": "",
      "socials": {"instagram": ""},
      "location": {"city": "", "country": ""},
      "start_date": "",
      "end_date": null,
      "origin": "",
      "tag_ids": []
    }
  ]
}
```

## Notes
- The app infers the schema from `public/nodesData.json` at startup; no hardcoding.
- If Gemini is not configured, the app provides a minimal skeleton task you can edit.
- Backups of `nodesData.json` are created with timestamp before saving.
- Color theme is placeholder; will be updated to match your Python app once screenshot is provided.
