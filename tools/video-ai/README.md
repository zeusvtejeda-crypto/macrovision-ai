# video-ai

Flujo de subtitulado automático (Whisper + ffmpeg).

- `setup_imac_video_ai.sh`: instala ffmpeg, whisper, OpenCV, PySceneDetect y Remotion en macOS.
- `transcribe.py`: transcribe audio (f32le 16 kHz mono) con marcas por palabra -> `words.json`.
- `mkass.py`: genera `subs.ass` estilo karaoke (palabra resaltada) desde `words.json`.

```bash
ffmpeg -i video.mp4 -ac 1 -ar 16000 -f f32le audio.raw
python3 transcribe.py audio.raw
python3 mkass.py
ffmpeg -i video.mp4 -vf "ass=subs.ass" -c:a copy salida.mp4
```
