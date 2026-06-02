PSQL = docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d hackathon
SCHEMAS = core pmo ta elc lnd

up:
	docker compose up -d --build
	@until docker compose exec -T db pg_isready -U postgres -d hackathon >/dev/null 2>&1; do sleep 1; done
	$(PSQL) -c "create extension if not exists pgtap;"

down:
	docker compose down -v

migrate:
	@for f in migrations/*.sql; do echo ">> $$f"; $(PSQL) -f /work/$$f; done

seed:
	@for f in seed/*.sql; do [ -f "$$f" ] || continue; echo ">> $$f"; $(PSQL) -f /work/$$f; done

reset:
	@for s in $(SCHEMAS); do $(PSQL) -c "drop schema if exists $$s cascade;"; done

rebuild: reset migrate seed

test:
	$(PSQL) -c "create extension if not exists pgtap;"
	docker compose exec -T db pg_prove -r --ext .sql -U postgres -d hackathon /work/tests

export:
	@bash ../scripts/export_csv.sh

.PHONY: up down migrate seed reset rebuild test export
