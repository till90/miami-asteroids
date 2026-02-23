# Miami Asteroids 🌴

A classic Asteroids arcade game reimagined with a Miami Vice / synthwave aesthetic.
Built with HTML5 Canvas + Vanilla JavaScript, served by a Python Flask backend.

## Features

- Smooth 60fps canvas rendering with neon glow effects
- Synthwave perspective grid background with retro sun
- Parallax star field
- Procedural asteroid shapes with neon outlines
- Particle explosion system
- Web Audio API synthesized sound effects (no audio files)
- Mobile touch controls
- High score persistence (localStorage)
- Progressive difficulty across levels

## Controls

| Key | Action |
|-----|--------|
| ← → / A D | Rotate ship |
| ↑ / W | Thrust |
| Space | Fire |
| P / Escape | Pause |

## Running Locally

### With Python (recommended for development)

```bash
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open http://localhost:8080 in your browser.

### With Docker

```bash
docker build -t miami-asteroids .
docker run -p 8080:8080 miami-asteroids
```

## Deploying to Google Cloud Run

```bash
gcloud run deploy miami-asteroids \
  --source . \
  --platform managed \
  --region europe-west1 \
  --allow-unauthenticated
```

## Tech Stack

- **Frontend**: HTML5 Canvas, Vanilla JavaScript, CSS3
- **Backend**: Python / Flask / Gunicorn
- **Fonts**: [Orbitron](https://fonts.google.com/specimen/Orbitron) (OFL License)
- **Assets**: 100% procedural — no copyrighted images or audio samples

## License

MIT
