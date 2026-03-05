.PHONY: setup setup-web metadata transcribe test-one clean process chunk embed topics summarize upload index rename dev build

# Python pipeline
setup:
	pip install -e ".[dev]"

setup-web:
	pip install -e ".[web]"
	cd web && npm install

metadata:
	python -m scripts.download --metadata-only

transcribe:
	python -m scripts.pipeline

process:
	python -m scripts.process --no-upload

process-upload:
	python -m scripts.process

chunk:
	python -m scripts.chunk

embed:
	python -m scripts.embed

topics:
	python -m scripts.topics

summarize:
	python -m scripts.summarize

upload:
	python -m scripts.upload

index:
	python -m scripts.build_index

rename:
	python -m scripts.rename_transcripts

test-one:
	@echo "Downloading + transcribing episode 333 as a smoke test..."
	python -m scripts.download --latest 1
	python -m scripts.transcribe --episode 333

# Website
dev:
	cd web && npm run dev

build:
	cd web && npm run build

clean:
	@echo "Removing downloaded MP3 files..."
	rm -f episodes/*.mp3
	@echo "Done. Transcripts preserved."
