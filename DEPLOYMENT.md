# DEPLOYMENT.md - Render (free web service)

## Files
- `gunicorn.conf.py`: 1 worker, 100 threads (required: rooms live in memory; Flask-SocketIO threading mode), binds to `$PORT`, trusts Render's proxy headers.
- `render.yaml`: Blueprint (Python 3.12.3, free plan, `/health` check, generated `SECRET_KEY`).
- `requirements.txt`: now includes `gunicorn`.

## Steps
1. Push the project root (the folder containing `app.py`) to a GitHub repo.
2. Render dashboard -> **New** -> **Blueprint** -> pick the repo -> **Apply**.
   (Manual alternative: New -> Web Service; Build `pip install -r requirements.txt`; Start `gunicorn app:app`; Health check `/health`; env `PYTHON_VERSION=3.12.3`, `SECRET_KEY` = any random string.)
3. Wait for "Live", open `https://<name>.onrender.com`.

## Verify
- `https://<name>.onrender.com/health` returns `{"status":"ok"}`.
- Page header badge says "connected".
- Two browsers, same room and secret: messages arrive "authenticated"; a third with another secret shows red failure.
- Open "Performance benchmark", run it, download the CSV (real RTT) into `results/`.

## Test locally with Gunicorn (Linux/macOS/WSL only; Gunicorn does not run on native Windows)
```
gunicorn app:app
```
Open http://127.0.0.1:10000. On native Windows keep using `python app.py`.

## Free-tier behavior
- Service sleeps after ~15 min idle; first request takes ~30-60 s. Rooms are lost on sleep/restart; clients are sent back to the join screen.
- Do not raise workers above 1.

## Troubleshooting
| Symptom | Fix |
|---|---|
| Badge stuck on "connection error" | Set env `ALLOWED_ORIGINS=https://<name>.onrender.com`, redeploy |
| Build fails on a pinned version | Tell me the pip error; versions will be relaxed |
| "WebCrypto unavailable" | Use the https URL, not http |
| Disconnects after idle | Free-tier proxy timeouts; rejoin |
