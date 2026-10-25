import json
segs=json.load(open("words.json"))
words=[w for s in segs for w in s["words"]]
for w in words: w["w"]=w["w"].replace("Desire","Dzire").replace("desire","Dzire")
def ts(t): h=int(t//3600); m=int(t%3600//60); s=t%60; return f"{h}:{m:02d}:{s:05.2f}"
hdr="""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Inter Display,62,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,2,2,60,60,420,1
Style: Title,Inter Display,54,&H00000000,&H00000000,&H0000FFFF,&H0000FFFF,-1,0,0,0,100,100,0,0,3,14,0,8,60,60,160,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
lines=[hdr, f"Dialogue: 0,{ts(0)},{ts(4)},Title,,0,0,0,,¿SWIFT O DZIRE? LA\\NDIFERENCIA"]
N=4
for i in range(0,len(words),N):
    chunk=words[i:i+N]
    for j,w in enumerate(chunk):
        txt=" ".join(("{\\c&H00FFFF&}"+x["w"].upper()+"{\\c&HFFFFFF&}") if k==j else x["w"].upper() for k,x in enumerate(chunk))
        end=chunk[j+1]["s"] if j+1<len(chunk) else w["e"]+0.15
        lines.append(f"Dialogue: 0,{ts(w['s'])},{ts(end)},Sub,,0,0,0,,{txt}")
open("subs.ass","w").write("\n".join(lines)+"\n")
print(len(lines)-1,"eventos")
