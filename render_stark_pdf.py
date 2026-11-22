#!/usr/bin/env python3
"""Render structured technical markdown-like content into an A4 Stark-themed multi-page PDF."""
import datetime
import json
import os
import re
import sys
from PIL import Image, ImageDraw, ImageFont

FONT_REG_PATH = "/usr/share/fonts/noto/NotoSans-Regular.ttf"
FONT_BOLD_PATH = "/usr/share/fonts/noto/NotoSans-Bold.ttf"

PAGE_W = 1240
PAGE_H = 1754
MARGIN_X = 80
CONTENT_W = PAGE_W - MARGIN_X * 2
FOOTER_Y = PAGE_H - 72
MAX_BODY_Y = FOOTER_Y - 38


def load_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


def wrap_lines(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_w: int):
    words = text.split()
    if not words:
        return [""]
    lines = []
    cur = words[0]
    for w in words[1:]:
        candidate = cur + " " + w
        if draw.textlength(candidate, font=font) <= max_w:
            cur = candidate
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines


def clean_inline(text: str) -> str:
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"`(.+?)`", r"\1", text)
    return text.strip()


def new_continuation_page(font_small):
    img = Image.new("RGB", (PAGE_W, PAGE_H), "#FAFCFF")
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, PAGE_W, 12], fill="#00F0FF")
    draw.text((MARGIN_X, 34), "J.E.A.R.V.I.S. MARK X // INFORME TÉCNICO AUTÓNOMO", fill="#64748B", font=font_small)
    return img, draw, 88


def render_pdf(payload_path: str) -> None:
    with open(payload_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    title = clean_inline(str(data.get("title") or data.get("topic") or "Informe J.E.A.R.V.I.S."))
    author = str(data.get("author") or "Zarate // J.E.A.R.V.I.S. Mark X")
    content = str(data.get("content") or "")
    out_path = str(data.get("outPath") or "")
    if not out_path:
        raise ValueError("outPath vacío")

    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    f_title = load_font(FONT_BOLD_PATH, 38)
    f_sub = load_font(FONT_BOLD_PATH, 20)
    f_h2 = load_font(FONT_BOLD_PATH, 29)
    f_h3 = load_font(FONT_BOLD_PATH, 24)
    f_body = load_font(FONT_REG_PATH, 22)
    f_small = load_font(FONT_REG_PATH, 18)

    pages = []
    img = Image.new("RGB", (PAGE_W, PAGE_H), "#FAFCFF")
    draw = ImageDraw.Draw(img)

    # First page Stark banner
    draw.rectangle([0, 0, PAGE_W, 215], fill="#04142E")
    draw.rectangle([0, 215, PAGE_W, 223], fill="#00F0FF")
    draw.text((MARGIN_X, 34), "STARK INDUSTRIES // J.E.A.R.V.I.S. DOC AUTOPILOT", fill="#00F0FF", font=f_sub)

    title_lines = wrap_lines(draw, title[:140], f_title, CONTENT_W)[:2]
    ty = 72
    for tl in title_lines:
        draw.text((MARGIN_X, ty), tl, fill="#FFFFFF", font=f_title)
        ty += 46

    stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    draw.text((MARGIN_X, 174), f"Autor: {author}   |   Generado: {stamp}", fill="#9BE8FF", font=f_small)

    y = 260

    def ensure_space(needed: int):
        nonlocal img, draw, y
        if y + needed > MAX_BODY_Y:
            pages.append(img)
            img, draw, y = new_continuation_page(f_small)

    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            y += 12
            continue

        if line.startswith("## ") or line.startswith("# "):
            heading = clean_inline(line.lstrip("#").strip())
            ensure_space(80)
            y += 10
            for hl in wrap_lines(draw, heading, f_h2, CONTENT_W):
                ensure_space(40)
                draw.text((MARGIN_X, y), hl, fill="#0052CC", font=f_h2)
                y += 38
            draw.line([MARGIN_X, y + 2, PAGE_W - MARGIN_X, y + 2], fill="#BAE6FD", width=2)
            y += 14
        elif line.startswith("### "):
            subh = clean_inline(line[4:])
            ensure_space(60)
            y += 6
            for hl in wrap_lines(draw, subh, f_h3, CONTENT_W):
                ensure_space(34)
                draw.text((MARGIN_X, y), hl, fill="#0F172A", font=f_h3)
                y += 32
            y += 6
        elif line.startswith("- ") or line.startswith("* ") or re.match(r"^\d+\.\s+", line):
            bullet_txt = re.sub(r"^(?:[-*]|\d+\.)\s+", "", line)
            bullet_txt = clean_inline(bullet_txt)
            wrapped = wrap_lines(draw, bullet_txt, f_body, CONTENT_W - 36)
            for idx, wl in enumerate(wrapped):
                ensure_space(34)
                if idx == 0:
                    draw.text((MARGIN_X + 6, y), "•", fill="#0077CC", font=f_h3)
                draw.text((MARGIN_X + 34, y), wl, fill="#101828", font=f_body)
                y += 32
            y += 4
        else:
            para = clean_inline(line)
            for pl in wrap_lines(draw, para, f_body, CONTENT_W):
                ensure_space(34)
                draw.text((MARGIN_X, y), pl, fill="#101828", font=f_body)
                y += 32
            y += 8

    pages.append(img)

    total = len(pages)
    for idx, page in enumerate(pages, start=1):
        d = ImageDraw.Draw(page)
        d.line([MARGIN_X, FOOTER_Y - 12, PAGE_W - MARGIN_X, FOOTER_Y - 12], fill="#CBD5E1", width=2)
        d.text((MARGIN_X, FOOTER_Y), author, fill="#64748B", font=f_small)
        pg_label = f"Página {idx} de {total}"
        pw = d.textlength(pg_label, font=f_small)
        d.text((PAGE_W - MARGIN_X - pw, FOOTER_Y), pg_label, fill="#64748B", font=f_small)

    pages[0].save(
        out_path,
        "PDF",
        resolution=150.0,
        save_all=True,
        append_images=pages[1:],
    )


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("Uso: render_stark_pdf.py <payload.json>")
    render_pdf(sys.argv[1])
