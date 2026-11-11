# ChessMind AI — wdrożenie online (bezpłatny start)

## Usługi
- Frontend: Vercel (plan Hobby; projekt osobisty).
- API: Render (Free; usypia usługę po 15 minutach bez ruchu).
- PostgreSQL: Neon (plan Free).

## 1. Umieść projekt na GitHub
1. Zaloguj się do GitHub i utwórz prywatne repozytorium `chessmind-ai`.
2. Wgraj całą zawartość tego folderu do repozytorium (nie sam plik ZIP).

## 2. Utwórz bazę danych w Neon
1. Utwórz projekt PostgreSQL w Neon.
2. Skopiuj connection string.
3. Dla SQLAlchemy/psycopg ustaw schemat URL na `postgresql+psycopg://` (jeśli Neon pokazuje `postgresql://`, zamień tylko początek). Zachowaj parametry połączenia, w tym `sslmode=require`.

## 3. Wdróż API na Render
1. W Render wybierz New → Blueprint i połącz repozytorium GitHub. Render odczyta `render.yaml`.
2. Przy tworzeniu usługi ustaw `DATABASE_URL` na connection string z Neon.
3. W `CORS_ORIGINS` wpisz dokładny adres frontendu z Vercel, np. `https://chessmind-ai-two.vercel.app` (bez końcowego ukośnika).
4. `JWT_SECRET` jest generowany przez Render. Nie udostępniaj go.
5. Po wdrożeniu sprawdź `https://ADRES-API.onrender.com/health` — powinno zwrócić `{"status":"ok"}`.

## 4. Wdróż frontend na Vercel
1. W Vercel wybierz Add New → Project i zaimportuj to samo repozytorium.
2. Ustaw Root Directory na `frontend`. Framework powinien wykryć Next.js.
3. Dodaj zmienną środowiskową `NEXT_PUBLIC_API_URL` z adresem API Render, np. `https://chessmind-ai-api.onrender.com` (bez końcowego ukośnika).
4. Wybierz Deploy.
5. Wróć do Render i upewnij się, że `CORS_ORIGINS` zawiera dokładny publiczny adres Vercel; jeśli go zmienisz, zaktualizuj zmienną i wykonaj redeploy API.

## Ważne ograniczenia wersji MVP
- Darmowa usługa Render usypia się po 15 minutach bez ruchu; pierwsze wejście po przerwie może czekać około minuty.
- Darmowy plan Render Postgres nie nadaje się tu jako trwała baza: wygasa po 30 dniach. Dlatego instrukcja używa Neon.
- Vercel Hobby jest przeznaczony do projektów osobistych, nie komercyjnego SaaS. Sprawdź warunki dostawców przed publicznym/komercyjnym użyciem.
- JWT jest obecnie trzymany w stanie aplikacji przeglądarkowej, więc odświeżenie strony wyloguje użytkownika. To ograniczenie MVP do poprawienia przed szerszym uruchomieniem.
- To prototyp: przed użyciem przez innych użytkowników potrzebny jest audyt bezpieczeństwa, limity prób logowania, reset hasła i testy obciążeniowe.
- Model przewidywania ruchów jest eksperymentalny i nie ma potwierdzonej skuteczności. Nie przedstawiać jego wyników jako realnej dokładności AI.
