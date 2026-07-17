# DiffScan

Developed with AI assistance.
Offline text diff tool with line/word/char precision and smart change navigation.

## Features

- **Split / Unified** layout
- **Line / Smart / Word / Char** diff precision
- **Hide whitespace**, **Ignore case**, **Hide unchanged** lines
- **Auto-update** on text change
- **Merge** lines between panels
- **Transforms**: Trim, UPPER, lower, Sort, Unique, Rm empty
- **Navigation**: jump between changes with highlight
- **Sync scroll** between input panels
- **Drag and drop** file upload with visual drop zone
- **DOCX support** — open Word documents directly
- **Typography** — adjustable font size
- **Open files** from disk
- **Themes**: Light / Dark
- Works offline — 100% vanilla JS, single-page app

## Quick Start

```bash
# Run with Docker
docker run -d -p 8080:80 ghcr.io/dmitryoml/diffscan:latest
```

Then open http://localhost:8080

## Local Development

Just open `index.html` in a browser — no build step needed.

## Project Structure

```
index.html            # Main page
about.html            # About / FAQ page
css/styles.css        # Styles
js/app.js             # Application logic
js/mammoth.browser.js # DOCX reader library
icons/                # SVG icons
images/               # QR codes for donations
Dockerfile            # Docker image (nginx:alpine)
nginx.conf            # Nginx config
LICENSE               # MIT license
THIRD-PARTY-NOTICES.md # Third-party software notices
```

## Third-Party Software

This project uses [Octicons](https://github.com/primer/octicons) (MIT) and [Mammoth.js](https://github.com/mwilliamson/mammoth.js) (BSD-2-Clause). See `THIRD-PARTY-NOTICES.md` for details.

## License

MIT
