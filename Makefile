.PHONY: dev build migrate seed logs shell-api down prod

dev:
	docker compose up

build:
	docker compose build

migrate:
	docker compose exec api pnpm --filter=@education-erp/db exec prisma migrate deploy

seed:
	docker compose exec api pnpm --filter=@education-erp/db exec prisma db seed

logs:
	docker compose logs -f

shell-api:
	docker compose exec api sh

down:
	docker compose down

prod:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
