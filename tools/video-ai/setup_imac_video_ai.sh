#!/bin/bash
# Estación de edición de video con IA para macOS (VILLEDA Inc.)
# Uso: bash setup_imac_video_ai.sh   (pide confirmación antes de instalar)
set -e
echo "== FASE 1: DIAGNÓSTICO =="
sysctl -n machdep.cpu.brand_string 2>/dev/null || uname -m
echo "RAM: $(( $(sysctl -n hw.memsize) / 1073741824 )) GB"
echo "macOS: $(sw_vers -productVersion)"
echo "Disco libre: $(df -h / | awk 'NR==2{print $4}')"
for t in brew ffmpeg python3 node whisper-cli capcut; do
  printf "%-12s %s\n" "$t" "$(command -v $t 2>/dev/null || echo 'NO')"
done
[ -d "/Applications/CapCut.app" ] && echo "CapCut: instalado" || echo "CapCut: NO instalado"
read -p "¿Continuar con la instalación? (s/n) " ok; [ "$ok" = "s" ] || exit 0

echo "== FASE 2: INSTALACIÓN =="
command -v brew >/dev/null || /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install ffmpeg python@3.12 node whisper-cpp
python3.12 -m venv ~/video-ai-env
source ~/video-ai-env/bin/activate
pip install -q --upgrade pip
pip install -q faster-whisper opencv-python scenedetect[opencv] numpy
# Modelo Whisper (necesario; ~1.5 GB large-v3-turbo, o usa "small" ~500 MB)
python -c "from faster_whisper import WhisperModel; WhisperModel('large-v3-turbo')"
npx --yes create-video@latest --help >/dev/null 2>&1 && echo "Remotion OK"

echo "== FASE 3: PRUEBAS =="
ffmpeg -version | head -1
python -c "import cv2, scenedetect, faster_whisper; print('OpenCV', cv2.__version__, '| PySceneDetect | faster-whisper OK')"
echo "Listo. Activa el entorno con: source ~/video-ai-env/bin/activate"
