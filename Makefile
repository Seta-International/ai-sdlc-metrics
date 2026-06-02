PSQL    = docker compose -f db/docker-compose.yml exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d hackathon
SCHEMAS = core pmo ta elc lnd

up:
	docker compose -f db/docker-compose.yml up -d --build
	@until docker compose -f db/docker-compose.yml exec -T db pg_isready -U postgres -d hackathon >/dev/null 2>&1; do sleep 1; done
	$(PSQL) -c "create extension if not exists pgtap;"

down:
	docker compose -f db/docker-compose.yml down -v

migrate:
	@for f in db/migrations/*.sql; do echo ">> $$f"; $(PSQL) -f /work/$${f#db/}; done

seed:
	@for f in db/seed/*.sql; do [ -f "$$f" ] || continue; echo ">> $$f"; $(PSQL) -f /work/$${f#db/}; done

reset:
	@for s in $(SCHEMAS); do $(PSQL) -c "drop schema if exists $$s cascade;"; done

rebuild: reset migrate seed

test:
	$(PSQL) -c "create extension if not exists pgtap;"
	docker compose -f db/docker-compose.yml exec -T db pg_prove -r --ext .sql -U postgres -d hackathon /work/tests

export-csv:
	@bash scripts/export_csv.sh

export-excel:
	@python3 scripts/export_excel.py

export: export-csv export-excel

.PHONY: up down migrate seed reset rebuild test export export-csv export-excel
