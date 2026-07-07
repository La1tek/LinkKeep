.PHONY: dev test build check package-extension sync-version clean docker-config

dev:
	docker compose -f docker-compose.dev.yml up --build

test:
	cd backend && python -m pytest -q

build:
	cd frontend && npm run build

check: test build package-extension
	node --check extension/background.js
	node --check extension/popup.js
	node --check extension/sidepanel.js
	node --check extension/options.js
	unzip -t frontend/public/LinkKeep-extension.zip

package-extension:
	./scripts/package-extension.sh

sync-version:
	python3 scripts/sync-version.py

docker-config:
	docker compose config >/dev/null
	docker compose -f docker-compose.dev.yml config >/dev/null

clean:
	rm -rf frontend/dist frontend/node_modules backend/.pytest_cache backend/**/__pycache__ backend/.venv backend/.venv312
