# DiffScan

Fast, offline text diff tool with line/word/char precision and smart change navigation.

## Features

- **Split / Unified** layout
- **Line / Smart / Word / Char** diff precision
- **Hide whitespace**, **Ignore case**, **Hide unchanged** lines
- **Auto-update** on text change
- **Merge** lines between panels
- **Transforms**: Trim, UPPER, lower, Sort, Unique, Rm empty
- **Navigation**: jump between changes with highlight
- **Sync scroll** between input panels
- **Open files** from disk
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
index.html        # Main page
css/styles.css    # Styles
js/app.js         # Application logic
Dockerfile        # Docker image (nginx:alpine)
nginx.conf        # Nginx config
```

## License

MIT
