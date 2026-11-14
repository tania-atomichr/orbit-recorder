"""Crops the raw screenshots into docs/ and builds docs/demo.gif.

Run after `npm test` (guide panel, picture editor), `node scripts/screenshots.js`
and `node scripts/demo-frames.js`. Needs Pillow and ffmpeg.
"""
import glob
import os
import shutil
import subprocess
import tempfile

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SHOTS = os.path.join(HERE, 'out', 'shots')
FRAMES = os.path.join(HERE, 'out', 'frames')
TEST = os.path.join(REPO, 'test', 'out')
DOCS = os.path.join(REPO, 'docs')


def save(src, dst, box=None, size=None):
    im = Image.open(src).convert('RGB')
    if box:
        im = im.crop(box)
    if size:
        im = im.resize(size, Image.LANCZOS)
    im.save(os.path.join(DOCS, dst), optimize=True)


def s(name):
    return os.path.join(SHOTS, name + '.png')


save(s('call-offer'), 'call-offer.png', size=(800, 450))
save(s('call-bar'), 'call-bar.png', size=(800, 450))
save(s('note-1280'), 'note.png', box=(0, 0, 1280, 1300))
save(s('note-trim'), 'note-trim.png')
save(s('note-send'), 'note-send.png')
save(s('note-embed'), 'note-embed.png', box=(350, 240, 930, 660))
save(s('settings-places'), 'settings-places.png')
save(s('guide-1280'), 'guide.png', box=(0, 0, 1280, 1450))
save(s('library-1280'), 'library.png', box=(0, 0, 1280, 520))
save(s('popup-1280'), 'popup.png', box=(0, 0, 320, 640))
for page in ('note', 'guide', 'library'):
    save(s('phone-' + page), 'phone-' + page + '.png', box=(0, 0, 390, 844))
save(os.path.join(TEST, 'panel-1280.png'), 'panel.png', box=(0, 0, 1280, 560))
save(os.path.join(TEST, 'picture-editor-1280.png'), 'picture-editor.png', box=(40, 0, 1240, 400))

# the demo: the call first (held longer), then the guide, note and library frames
tmp = tempfile.mkdtemp()
n = 0
for name, hold in (('call-offer', 3), ('call-bar', 4)):
    frame = Image.new('RGB', (1280, 800), (32, 33, 36))
    frame.paste(Image.open(s(name)).convert('RGB'), (0, 40))
    for _ in range(hold):
        frame.save(os.path.join(tmp, '%03d.png' % n))
        n += 1
for f in sorted(glob.glob(os.path.join(FRAMES, '*.png'))):
    Image.open(f).convert('RGB').save(os.path.join(tmp, '%03d.png' % n))
    n += 1
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-framerate', '1.25', '-i', os.path.join(tmp, '%03d.png'),
                '-vf', 'scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
                os.path.join(DOCS, 'demo.gif')], check=True)
shutil.rmtree(tmp)
print('docs/ pictures and demo.gif redrawn')
