"""Cut the recorded demo scenes (video/raw/*.mp4) into the 2:30 film: each scene trimmed, captioned,
then joined with half-second cross-fades into video/tripwire-demo-4k60.mp4 (3840x2160, 60 fps)."""
import shutil
import subprocess
from pathlib import Path

RAW = Path('video/raw')
FADE = 0.5
# (scene, start second, seconds kept, caption)
PLAN = [
    ('00-hook', 0, 8.0, ''),
    ('01-problem', 0, 6.0, ''),
    ('02-scam-message', 0, 21.0, 'A fake bank text · Gemini Nano decided on the computer, nothing was sent'),
    ('13-offline', 9, 9.0, 'Internet cut off for the whole browser · Gemini Nano still pauses the scam email'),
    ('03-ordinary-checkout', 0, 7.5, 'An ordinary checkout · a quick check, then no warning, even while a card number is typed'),
    ('04-tech-support-call', 0, 10.5, 'Fake tech support · the phone link is paused before it dials'),
    ('05-gift-card-code', 0, 8.0, 'Pay us in gift cards · the code box is paused'),
    ('06-crypto-wallet', 0, 7.5, 'A crypto investment that cannot lose · the wallet box is paused'),
    ('07-gift-card-cart', 0, 8.0, 'Gift cards at a real store · an $800 cart gets the five-minute hold'),
    ('08-bank-transfer', 0, 8.0, 'Their own bank, a new payee · one question and a five-minute hold'),
    ('09-family-answers', 0, 13.0, 'The family page · they answer the hold: keep it on hold for 30 minutes'),
    ('09b-pause-updates', 0, 5.0, 'Back on their computer · the pause now says the family asked them to wait'),
    ('10-call-check', 0, 28.0, 'Is this call a scam? · taps only, and a receipt of exactly what was sent'),
    ('11-hybrid', 0, 9.5, ''),
    ('12-close', 0, 8.0, ''),
]
NOTE = 'Practice pages recreating scam types the FTC warns about'

shutil.copy('C:/Windows/Fonts/segoeuib.ttf', RAW / 'font.ttf')
cut = []
for name, start, keep, caption in PLAN:
    out = RAW / f'cut-{name}.mp4'
    # The scene at 90%, on a deep-blue frame, so the caption has its own band and covers nothing.
    vf = 'fps=60,scale=3456:1944:flags=lanczos,pad=3840:2160:192:24:color=0x15315f,format=yuv420p'
    if caption:
        txt = RAW / f'cap-{name}.txt'
        txt.write_text(caption, encoding='utf-8')
        vf += (f",drawtext=fontfile=video/raw/font.ttf:textfile=video/raw/{txt.name}:fontsize=64:fontcolor=white"
               f":x=(w-text_w)/2:y=h-150")
        if name == '02-scam-message':
            note = RAW / 'cap-note.txt'
            note.write_text(NOTE, encoding='utf-8')
            vf += (f",drawtext=fontfile=video/raw/font.ttf:textfile=video/raw/{note.name}:fontsize=40:fontcolor=0xc9d6ee"
                   f":x=w-text_w-200:y=h-60")
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', str(start), '-i', str(RAW / f'{name}.mp4'), '-t', str(keep), '-vf', vf,
                    '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-an', str(out)], check=True)
    cut.append((out, keep))
    print('cut', name)

inputs = []
for out, _ in cut:
    inputs += ['-i', str(out)]
graph, last, t = [], '[0:v]', cut[0][1]
for i in range(1, len(cut)):
    t -= FADE
    graph.append(f'{last}[{i}:v]xfade=transition=fade:duration={FADE}:offset={t:.3f}[x{i}]')
    last = f'[x{i}]'
    t += cut[i][1]
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *inputs, '-filter_complex', ';'.join(graph), '-map', last,
                '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', '60', '-movflags', '+faststart',
                'video/tripwire-demo-4k60.mp4'], check=True)
print(f'film: {t:.1f} s')
