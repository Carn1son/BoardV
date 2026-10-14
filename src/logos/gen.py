"""Orange BoardV logo candidates (transparent background)."""
O = '#FF8A1F'
def svg(body): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{body}</svg>'
def pins(b0, b1, n, gap, ln, w, rx=4, fill=O, sides='trbl'):
    c0 = (b0 + b1) / 2; step = (b1 - b0) / (n + 1); out = []
    cs = [b0 + step * (i + 1) for i in range(n)]
    for c in cs:
        if 't' in sides: out.append(f'<rect x="{c-w/2}" y="{b0-gap-ln}" width="{w}" height="{ln}" rx="{rx}" fill="{fill}"/>')
        if 'b' in sides: out.append(f'<rect x="{c-w/2}" y="{b1+gap}" width="{w}" height="{ln}" rx="{rx}" fill="{fill}"/>')
        if 'l' in sides: out.append(f'<rect x="{b0-gap-ln}" y="{c-w/2}" width="{ln}" height="{w}" rx="{rx}" fill="{fill}"/>')
        if 'r' in sides: out.append(f'<rect x="{b1+gap}" y="{c-w/2}" width="{ln}" height="{w}" rx="{rx}" fill="{fill}"/>')
    return ''.join(out), cs
def trace(pts, sw=13, pad=17, ring=False):
    d = 'M' + ' L'.join(f'{x},{y}' for x, y in pts)
    x, y = pts[-1]
    p = f'<circle cx="{x}" cy="{y}" r="{pad}" fill="none" stroke="{O}" stroke-width="{sw}"/>' if ring else f'<circle cx="{x}" cy="{y}" r="{pad}" fill="{O}"/>'
    return f'<path d="{d}" fill="none" stroke="{O}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"/>' + p
def mirror(pts): return [(512 - x, 512 - y) for x, y in pts]

# A: like the reference — solid chip, pins, traces out of two corners
b0, b1 = 176, 336
P, cs = pins(b0, b1, 4, 14, 42, 15)
TR = [[(cs[3], b0-56), (cs[3], b0-70), (cs[3]+60, b0-130)],
      [(b1+56, cs[0]), (b1+66, cs[0]), (b1+116, cs[0]-50)],
      [(b1+56, cs[1]), (b1+100, cs[1]), (b1+140, cs[1]-40)]]
A = svg(f'<rect x="{b0}" y="{b0}" width="{b1-b0}" height="{b1-b0}" rx="16" fill="{O}"/>' + P + ''.join(trace(t) + trace(mirror(t)) for t in TR))

# B: chip frame with a solid core (like the reference chip), traces as rings — lighter look
F = f'<rect x="{b0+7}" y="{b0+7}" width="{b1-b0-14}" height="{b1-b0-14}" rx="16" fill="none" stroke="{O}" stroke-width="14"/><rect x="{b0+40}" y="{b0+40}" width="{b1-b0-80}" height="{b1-b0-80}" rx="8" fill="{O}"/>'
B = svg(F + P + ''.join(trace(t, ring=True, pad=14, sw=11) + trace(mirror(t), ring=True, pad=14, sw=11) for t in TR))

# C: chip with BV knocked out of the body, pins on all sides, no traces
C = svg(f'<mask id="m"><rect width="512" height="512" fill="#fff"/><text x="256" y="256" dy=".35em" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="92" letter-spacing="-2" fill="#000">BV</text></mask>'
        f'<rect x="{b0-16}" y="{b0-16}" width="{b1-b0+32}" height="{b1-b0+32}" rx="22" fill="{O}" mask="url(#m)"/>' + pins(b0-16, b1+16, 5, 14, 46, 15)[0])

# D: "circuit sun" — frame chip with traces leaving every side to pads
c0 = 256; core = f'<rect x="196" y="196" width="120" height="120" rx="14" fill="none" stroke="{O}" stroke-width="16"/><rect x="232" y="232" width="48" height="48" rx="6" fill="{O}"/>'
rays = []
for k in range(4):
    def rot(p):
        x, y = p[0]-256, p[1]-256
        for _ in range(k): x, y = -y, x
        return (x+256, y+256)
    for t in ([(226, 188), (226, 120), (180, 74)], [(256, 188), (256, 60)], [(286, 188), (286, 120), (332, 74)]):
        rays.append(trace([rot(p) for p in t], sw=12, pad=16))
D = svg(core + ''.join(rays))

import pathlib
for n, s in zip('ABCD', (A, B, C, D)): pathlib.Path(f'logo-{n}.svg').write_text(s)
html = '<!doctype html><meta charset=utf-8><body style="margin:0;font:16px sans-serif;color:#ddd;background:#111">'
html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0">'
for n in 'ABCD':
    s = open(f'logo-{n}.svg').read()
    html += f'<div style="padding:24px;text-align:center;background:#1b1d1c;border-right:1px solid #333"><div style="font-size:28px;font-weight:700;color:#fff;margin-bottom:8px">{n}</div><div style="width:260px;height:260px;margin:auto">{s}</div>'
    html += f'<div style="display:flex;gap:18px;justify-content:center;align-items:end;margin-top:18px"><div style="width:64px;height:64px">{s}</div><div style="width:32px;height:32px">{s}</div><div style="width:16px;height:16px">{s}</div></div>'
    html += f'<div style="background:#f3f3f3;margin-top:18px;padding:14px;border-radius:10px"><div style="width:96px;height:96px;margin:auto">{s}</div></div></div>'
html += '</div></body>'
pathlib.Path('sheet.html').write_text(html)
