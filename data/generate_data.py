"""
generate_data.py
-----------------
Genera dos archivos JSON que consume la extensión:
  - matches.json  -> próximos partidos de Valorant, LoL y CS2 (PandaScore)
  - patches.json  -> últimas notas de parche de Valorant, LoL y CS2

Uso:
    python generate_data.py                # modo real (requiere PANDASCORE_TOKEN)
    python generate_data.py --mock         # modo demo, sin llamadas de red

Variables de entorno (crea un archivo .env a partir de .env.example):
    PANDASCORE_TOKEN=tu_token_gratuito_de_pandascore

Pensado para correr con un cron (GitHub Actions) que commitee los JSON
generados al repo, y la extensión los lee vía jsDelivr.
"""

import os
import sys
import json
import argparse
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

PANDASCORE_TOKEN = os.getenv("PANDASCORE_TOKEN")
PANDASCORE_BASE = "https://api.pandascore.co"


GAMES = {
    "valorant": "valorant",
    "lol": "lol",
    "cs2": "csgo",  
}

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
HEADERS = {"User-Agent": "eSportsDashboardPro/1.0 (+extension)"}




def fetch_matches_pandascore(game_key: str, slug: str, per_page: int = 8) -> list:
    """Trae los próximos partidos de un juego desde PandaScore (plan Fixtures, gratis)."""
    if not PANDASCORE_TOKEN:
        raise RuntimeError("Falta PANDASCORE_TOKEN en el entorno (.env)")

    url = f"{PANDASCORE_BASE}/{slug}/matches/upcoming"
    params = {"token": PANDASCORE_TOKEN, "per_page": per_page, "sort": "begin_at"}
    resp = requests.get(url, params=params, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    raw = resp.json()

    matches = []
    for m in raw:
        opponents = m.get("opponents") or []
        team_names = [o["opponent"]["name"] for o in opponents if o.get("opponent")]
        matches.append({
            "game": game_key,
            "id": m.get("id"),
            "league": (m.get("league") or {}).get("name"),
            "tournament": (m.get("tournament") or {}).get("name"),
            "team_a": team_names[0] if len(team_names) > 0 else "TBD",
            "team_b": team_names[1] if len(team_names) > 1 else "TBD",
            "begin_at": m.get("begin_at"),  # ISO 8601 UTC, la extensión lo convierte a hora local
            "status": m.get("status"),
        })
    return matches


def mock_matches() -> dict:
    """Datos de ejemplo para probar el pipeline sin llamadas de red."""
    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "valorant": [{
            "game": "valorant", "id": 111, "league": "VCT Americas",
            "tournament": "Stage 2", "team_a": "KRÜ Esports", "team_b": "Leviatán",
            "begin_at": now_iso, "status": "not_started",
        }],
        "lol": [{
            "game": "lol", "id": 222, "league": "LTA Sur",
            "tournament": "Split 2", "team_a": "Isurus", "team_b": "Estral",
            "begin_at": now_iso, "status": "not_started",
        }],
        "cs2": [{
            "game": "cs2", "id": 333, "league": "ESL Pro League",
            "tournament": "Season 21", "team_a": "FURIA", "team_b": "MIBR",
            "begin_at": now_iso, "status": "not_started",
        }],
    }


def build_matches(mock: bool) -> dict:
    if mock:
        return mock_matches()

    data = {}
    for game_key, slug in GAMES.items():
        try:
            data[game_key] = fetch_matches_pandascore(game_key, slug)
        except Exception as exc:  # no tumbar todo el pipeline por un juego
            print(f"[WARN] No se pudieron obtener partidos de {game_key}: {exc}", file=sys.stderr)
            data[game_key] = []
    return data




import re

def _extraer_og_image(url: str) -> str | None:
    """Trae la imagen destacada (og:image) de una página de artículo, si existe."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        tag = soup.find("meta", property="og:image")
        return tag["content"] if tag and tag.get("content") else None
    except Exception:
        return None


def _limpiar_texto_tarjeta(texto_crudo: str, patron_titulo: str) -> tuple:
    """
    Las páginas de noticias de Riot devuelven el texto de cada tarjeta pegado,
    sin espacios entre categoría + fecha ISO + título + descripción, ej:
    'Game Updates2026-08-18T13:00:00.000ZVALORANT Patch Notes 13.04New map...'
    Aquí lo separamos: quitamos categoría+fecha, y usamos un patrón específico
    del juego para encontrar dónde termina el título y empieza la descripción.
    """
    
    sin_fecha = re.sub(r"^.*?\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", "", texto_crudo).strip()

    match = re.search(patron_titulo, sin_fecha, re.IGNORECASE)
    if not match:
        return sin_fecha, ""

    titulo = match.group(0)
    descripcion = sin_fecha[match.end():].strip()
    return titulo, descripcion


def fetch_patch_cs2() -> dict:
    """CS2: Steam Web API oficial (ISteamNews), no requiere API key."""
    url = "http://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/"
    params = {"appid": 730, "count": 5, "maxlength": 300, "format": "json"}
    resp = requests.get(url, params=params, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    items = resp.json().get("appnews", {}).get("newsitems", [])
    patch_items = [n for n in items if any(
        kw in n.get("title", "").lower() for kw in ["update", "patch", "release notes"]
    )] or items[:1]

    if not patch_items:
        return {"game": "cs2", "title": None, "url": None, "date": None, "description": None, "image": None}

    latest = patch_items[0]
    
    imagen = None
    contenido = latest.get("contents", "")
    match_img = re.search(r'(https?://[^\s"\'<>]+\.(?:jpg|jpeg|png))', contenido)
    if match_img:
        imagen = match_img.group(1)

    return {
        "game": "cs2",
        "title": latest.get("title"),
        "url": latest.get("url"),
        "date": datetime.fromtimestamp(latest.get("date", 0), tz=timezone.utc).isoformat(),
        "description": re.sub(r"<[^>]+>", "", contenido)[:200].strip() or None,
        "image": imagen,
    }


def fetch_patch_lol() -> dict:
    """
    LoL: scrapeamos la página oficial de 'Game Updates' (lista de artículos),
    tomamos el primer link cuya URL sea de un patch note, separamos
    título/descripción, y sacamos su imagen destacada (og:image) de la
    página del artículo.
    """
    url = "https://www.leagueoflegends.com/en-us/news/game-updates/"
    resp = requests.get(url, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    link_tag = None
    for a in soup.find_all("a", href=True):
        if re.search(r"league-of-legends-patch-[\d-]+-notes", a["href"], re.IGNORECASE):
            link_tag = a
            break

    if not link_tag:
        return {"game": "lol", "title": None, "url": None, "date": None, "description": None, "image": None}

    href = link_tag["href"]
    full_url = href if href.startswith("http") else f"https://www.leagueoflegends.com{href}"
    texto_crudo = link_tag.get_text(strip=True)
    titulo, descripcion = _limpiar_texto_tarjeta(texto_crudo, r"League of Legends Patch [\d.]+ Notes")

    return {
        "game": "lol",
        "title": titulo or None,
        "url": full_url,
        "date": None,
        "description": descripcion or None,
        "image": _extraer_og_image(full_url),
    }


def fetch_patch_valorant() -> dict:
    """
    Valorant: scrapeamos la página oficial de noticias, tomamos el primer
    link cuya URL sea de un patch note (no el primer <a> de la página en
    general, que puede ser cualquier cosa), separamos título/descripción,
    y sacamos su imagen destacada (og:image) de la página del artículo.
    """
    url = "https://playvalorant.com/en-us/news/"
    resp = requests.get(url, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    link_tag = None
    for a in soup.find_all("a", href=True):
        if re.search(r"valorant-patch-notes-[\d-]+", a["href"], re.IGNORECASE):
            link_tag = a
            break

    if not link_tag:
        return {"game": "valorant", "title": None, "url": None, "date": None, "description": None, "image": None}

    href = link_tag["href"]
    full_url = href if href.startswith("http") else f"https://playvalorant.com{href}"
    texto_crudo = link_tag.get_text(strip=True)
    titulo, descripcion = _limpiar_texto_tarjeta(texto_crudo, r"VALORANT Patch Notes [\d.]+")

    return {
        "game": "valorant",
        "title": titulo or None,
        "url": full_url,
        "date": None,
        "description": descripcion or None,
        "image": _extraer_og_image(full_url),
    }


def mock_patches() -> dict:
    return {
        "valorant": {"game": "valorant", "title": "VALORANT Patch Notes 13.04 (demo)",
                     "description": "New map rotation and bug fixes for Agents and melee skins.",
                     "url": "https://playvalorant.com/en-us/news/tags/patch-notes/", "date": None, "image": None},
        "lol": {"game": "lol", "title": "League of Legends Patch 26.17 Notes (demo)",
                "description": "Arenas, Bridges, Summoner's Rifts new and old… change comes for us all.",
                "url": "https://www.leagueoflegends.com/en-us/news/tags/patch-notes/", "date": None, "image": None},
        "cs2": {"game": "cs2", "title": "Actualización de CS2 (demo)",
                "description": None,
                "url": "https://www.counter-strike.net/news", "date": None, "image": None},
    }


def build_patches(mock: bool) -> dict:
    if mock:
        return mock_patches()

    fetchers = {"cs2": fetch_patch_cs2, "lol": fetch_patch_lol, "valorant": fetch_patch_valorant}
    data = {}
    for game_key, fetcher in fetchers.items():
        try:
            data[game_key] = fetcher()
        except Exception as exc:
            print(f"[WARN] No se pudo obtener el parche de {game_key}: {exc}", file=sys.stderr)
            data[game_key] = {"game": game_key, "title": None, "url": None, "date": None}
    return data




def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mock", action="store_true",
                         help="Genera los JSON con datos de ejemplo, sin llamadas de red")
    args = parser.parse_args()

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    matches = build_matches(mock=args.mock)
    patches = build_patches(mock=args.mock)

    generated_at = datetime.now(timezone.utc).isoformat()

    matches_payload = {"generated_at": generated_at, "matches": matches}
    patches_payload = {"generated_at": generated_at, "patches": patches}

    with open(os.path.join(OUTPUT_DIR, "matches.json"), "w", encoding="utf-8") as f:
        json.dump(matches_payload, f, ensure_ascii=False, indent=2)

    with open(os.path.join(OUTPUT_DIR, "patches.json"), "w", encoding="utf-8") as f:
        json.dump(patches_payload, f, ensure_ascii=False, indent=2)

    print(f"OK -> {OUTPUT_DIR}/matches.json y {OUTPUT_DIR}/patches.json ({'mock' if args.mock else 'real'})")


if __name__ == "__main__":
    main()
