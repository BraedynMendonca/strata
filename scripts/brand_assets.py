"""Render the Strata SVG mark to browser and device icon sizes."""
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
svg = ET.parse(root / 'web/icon.svg').getroot()
ns = {'svg': 'http://www.w3.org/2000/svg'}
scale = 16
image = Image.new('RGBA', (64 * scale, 64 * scale))
draw = ImageDraw.Draw(image)
rect = svg.find('svg:rect', ns)
draw.rounded_rectangle((0, 0, 64 * scale - 1, 64 * scale - 1),
                       radius=int(rect.attrib['rx']) * scale, fill=rect.attrib['fill'])
for path in svg.findall('.//svg:path', ns):
    x0,y0,x1,y1,x2,y2,x3,y3 = map(float, re.findall(r'-?\d+(?:\.\d+)?', path.attrib['d']))
    points=[]
    for i in range(201):
        t=i/200; u=1-t
        points.append(((u**3*x0+3*u*u*t*x1+3*u*t*t*x2+t**3*x3)*scale,
                       (u**3*y0+3*u*u*t*y1+3*u*t*t*y2+t**3*y3)*scale))
    width=round(5.5*scale); radius=width/2
    draw.line(points, fill=path.attrib['stroke'], width=width)
    for x,y in points:
        draw.ellipse((x-radius,y-radius,x+radius,y+radius),fill=path.attrib['stroke'])
for filename,size in [('strata-icon.png',512),('apple-touch-icon.png',180),('favicon-32.png',32)]:
    image.resize((size,size),Image.Resampling.LANCZOS).save(root/'web'/filename)
image.save(root/'web/favicon.ico',sizes=[(16,16),(32,32),(48,48)])
print('Strata icon assets exported.')
