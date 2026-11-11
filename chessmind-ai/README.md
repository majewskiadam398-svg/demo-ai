# ChessMind AI — uruchamialny szkielet MVP

Aplikacja full-stack: Next.js + FastAPI + PostgreSQL. Zawiera rejestrację/logowanie nickiem i hasłem,
izolację danych użytkowników, zapisywanie partii, legalne ruchy na szachownicy, analizę bazową
oraz prosty, jawnie opisany model predykcji ruchów człowieka oparty na zliczaniu wzorców.

> To jest działający punkt startowy MVP, a nie gotowy publiczny produkt. Nie ma jeszcze
> walidacji bezpieczeństwa, audytu, monitoringu, pełnego silnika analizy ani wytrenowanego
> modelu o deklarowanej skuteczności. Nie pokazuje fikcyjnych procentów jakości AI.

## Uruchomienie

1. Skopiuj `.env.example` do `.env` i ustaw własny `JWT_SECRET`.
2. Uruchom bazę i API:
   ```bash
   docker compose up --build
   ```
3. W drugim terminalu uruchom frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
4. Otwórz http://localhost:3000. API: http://localhost:8000/docs.

Domyślna baza w compose: `chessmind/chessmind` na `localhost:5432`.
Przed wdrożeniem zmień wszystkie hasła i sekrety.

## Co działa
- rejestracja i logowanie unikalnym nickiem (hasła hashowane Argon2),
- JWT w pamięci aplikacji frontendowej (MVP; produkcyjnie użyj ciasteczek HttpOnly/Secure),
- dane partii powiązane z kontem,
- interaktywna szachownica z legalnością ruchów, cofaniem i resetem,
- zapis partii w PGN,
- analiza materiałowa i klasyfikacja prostych błędów,
- predykcja ludzkiego ruchu na podstawie wzorców zapisanych oddzielnie dla danego konta
  (wzorce nie są współdzielone między użytkownikami).

## Granice modelu
Moduł `backend/app/ai.py` nie jest siecią neuronową ani silnikiem klasy turniejowej.
Uczy się częstości wyborów z zagregowanych cech pozycji i wyniku partii. Skuteczność należy
mierzyć na odseparowanym zbiorze testowym, grupując partie po graczu/czasie, aby uniknąć
przecieku. Poziomy rozwoju są odblokowywane wyłącznie na podstawie wyników walidacji.


## Wdrożenie online
Instrukcja publikacji na bezpłatnym startowym zestawie Vercel + Render + Neon znajduje się w pliku `DEPLOY-ONLINE.md`.
