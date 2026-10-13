# FogShooter — Real Cities FPS (Three.js)

FPS w Three.js, w którym **mapa to prawdziwa lokacja**: dane budynków, dróg, wody, lasów i drzew pochodzą z
OpenStreetMap (Overpass API), a podłoże jest pokryte **prawdziwym zdjęciem satelitarnym** (Esri World Imagery).
Całość zanurzona w gęstej mgle, inspirowane zrzutem z gry typu "Real Cities Shooter" (Poznań).

## Uruchomienie

Wymagany serwer HTTP z uwagi na moduły ES (nie otwieraj pliku bezpośrednio):

```bash
cd fogshooter
npx serve .          # lub: python3 -m http.server 8000
```

Otwórz `http://localhost:8000` w przeglądarce (Chrome/Firefox/Edge).

## Jak działa konwersja mapy

1. **Wyszukanie lokacji** — Nominatim (np. "Poznań", "Kraków Rynek", "Berlin Alexanderplatz").
2. **Pobranie danych OSM** — Overpass API: `building`, `highway`, `water`, `railway`, `wood/forest`, drzewa.
3. **Konwersja do 3D** — budynki są wyciągane (extrude) według tagów `building:levels` / `height`
   (rysowane jako uproszczone footprinty z otoczką wypukłą), drogi jako wstęgi o szerokości zależnej
   od kategorii, woda/lasy jako płaszczyzny.
4. **Zdjęcie satelitarne** — kafelki Esri World Imagery (zoom 17) wklejane do canvasa i nakładane
   jako tekstura podłoża oraz ścian budynków (efekt "zdjęcia nałożonego na mapę").
5. **Mgła** — `FogExp2` + tło w kolorze mgły, ustawienia w `js/config.js` (`skyFog`, `fogColor`).

Dane są pobierane **w przeglądarce** (API OSM mają CORS), więc nie trzeba nic pobierać wcześniej.

## Sterowanie

| Klawisz | Akcja |
|---|---|
| WASD | ruch |
| Mysz | celowanie (klik = pointer lock) |
| LPM | strzał (headshoty ×2.2 dmg) |
| Shift | sprint |
| Spacja | skok |
| R | przeładowanie |

## Cel gry

Eliminuj przeciwników nawiedzających lokację w mgle. Przeciwnicy strzelają, gdy mają linię widzenia,
todo obrażeń zależy od dystansu. HP = 100.

## Struktura

```
index.html        — UI (menu, HUD, ekran końcowy)
css/style.css     — styl HUD
js/main.js        — pętla gry, strzelanie, logika misji
js/osm.js         — Nominatim + Overpass + klasyfikacja elementów
js/mapBuilder.js  — konwersja OSM → geometria 3D + tekstura satelitarna
js/imagery.js     — kafelki zdjęć satelitarnych z kolejką i cache
js/tiles.js       — konwersja lat/lon → kafelki slippy map
js/geo.js         — projekcja geograficzna
js/hull.js        — otoczka wypukła, geometria 2D
js/player.js      — gracz, ruch, kamera, pointer lock
js/enemy.js        — przeciwnik (AI, hp, linia wzroku)
js/weapon.js      — model karabinu w widoku pierwszej osoby
js/effects.js     — tracery, iskry, flash
js/collision.js   — kolizje koło-AABB, promień-AABB
js/lib/three.module.js — Three.js r160
```

## Dostosowanie

Wszystkie parametry (mgła, liczba przeciwników, obrażenia, HP, zoom zdjęcia) w `js/config.js`.
Możesz podmienić `satURL()` w `js/imagery.js` na inne źródło kafelków.

## Tryb offline — mapa przygotowana wcześniej

Pobieranie danych OSM i 25 kafelków satelitarnych w locie bywa wolne. Możesz przygotować mapę wcześniej:

```bash
node tools/prepare-map.mjs "Poznań, Poland"
node tools/prepare-map.mjs "Kraków, Rynek"
```

Skrypt zapisuje pakiet do `data/<slug>.json` (dane OSM + kafelki base64). Gra przy starcie
najpierw sprawdza folder `data/` — jeśli znajdzie pakiet dla wpisanej lokacji, wczytuje ją
**całkowicie offline** (zero zapytań do Overpass/Nominatim/Esri). Bez pakietu działa jak dawniej (online).

Nazwa pliku jest generowana z zapytania (np. „Poznań, Poland" → `poznan-poland.json`),
więc w grze wpisz dokładnie ten sam tekst.

### Wydajność

- ~18 przeciwników zamiast 22 (mniej raycastów na klatkę)
- jedna geometria scalona na typ (budynki/drogi/woda), nie oddzielne meshe
- limit 150 budynków, 160 drzew — na słabszym GPU zmniejsz w `js/config.js`

## Własny model 3D (.glb / .gltf) — np. CityGML LoD2 Poznania

Masz model miasta (np. `poznan_mesh_to_citygml_lod2_test1.glb`)? Podłączysz go na dwa sposoby:

1. **Przycisk**: „… LUB WCZYTAJ MODEL 3D (.GLB)" w menu → wybierz plik.
2. **Drag & drop**: przeciągnij plik `.glb` na okno przeglądarki.

Model jest automatycznie:
- skalowany, by największy wymiar mieścił się w ~220 m i centrowany na pozycję startową gracza,
- obrotowo wyrównany do osi Y (postać stoi pionowo),
- z kolizjami (siatka 8×8 AABB z bryły modelu — gracz nie przenika przez budynki),
- z przeciwnikami rozmieszczonymi w promieniu mapy.

Mgła, broń, HP i AI działają tak samo jak na mapach OSM.

### Konwersja CityGML → GLB

Jeśli masz pliki CityGML (`.xml`/`.gml`) zamiast GLB, przekonwertuj je np. narzędziem
[citygml-tools](https://github.com/citygml4j/citygml-tools) (`to-glTF`) lub FME,
potem wczytaj wynikowy `.glb` jak wyżej. GLB z teksturami działa najlepiej.

## Edytor mapy (klawisz E)

W grze naciśnij **E** — otworzy się panel edytora:

- **Mgła**: gęstość (suwak 0.0005–0.03) i kolor (próbnik) — na żywo
- **Model 3D (GLB)**: skala (0.1–4×), przesunięcie Y (±20 m), obrót Y — kolizje przebudowują się automatycznie
- **Tekstura podłoża**: wgraj własny obrazek (jpg/png) — np. znalezione zdjęcie satelitarne lepsze od domyślnego; przycisk „Przywróć satelitarną" wraca do oryginału
- **Rozgrywka**: prędkość gracza, skok, obrażenia, szybkostrzelność, prędkość/HP/liczba wrogów
- **Przenieś mnie na wolne miejsce** — bezpieczny respawn, gdy utkniesz w teksturze/budynku
- **Zapisz ustawienia** — persystencja w localStorage (przetrwa odświeżenie strony)

Spawn gracza po wczytaniu mapy jest zawsze na wolnym miejscu (silnik szuka pierścieniem od środka).

## Sterowanie (widok z góry — Diablo style)

Po przejściu na widok izometryczny:
- WASD/strzałki — ruch względem ekranu, Shift — sprint, Spacja — skok
- Mysz — celowanie (postać obraca się do kursora; czerwony ring na ziemi = punkt celowania)
- LPM (przytrzymaj) — seria strzałów, R — przeładowanie
- F — rzut piłką fizyczną, G — skrzynia (cannon-es)
- E — edytor mapy

Jeśli po aktualizacji widać stary widok (broń FPS), zrób Ctrl+Shift+R lub wyczyść cache.
