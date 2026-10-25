import sys, json
from faster_whisper import WhisperModel
m = WhisperModel("small", device="cpu", compute_type="int8")
import numpy as np; audio=np.fromfile(sys.argv[1],dtype=np.float32); segs, info = m.transcribe(audio, language="es", word_timestamps=True)
out=[]
for s in segs:
    out.append({"start":s.start,"end":s.end,"text":s.text.strip(),"words":[{"w":w.word.strip(),"s":w.start,"e":w.end} for w in s.words]})
json.dump(out, open("words.json","w"), ensure_ascii=False, indent=1)
for s in out: print(f"[{s['start']:.1f}-{s['end']:.1f}] {s['text']}")
