#!/usr/bin/env python3
import argparse
import json
import wave
from pathlib import Path

import torch
from TTS.api import TTS

MODEL_NAME = "tts_models/multilingual/multi-dataset/xtts_v2"


def main() -> None:
    parser = argparse.ArgumentParser(description="Local XTTS v2 generator for Chat Video Studio")
    parser.add_argument("--setup", action="store_true", help="Download the model and show its license prompt")
    parser.add_argument("--text")
    parser.add_argument("--reference")
    parser.add_argument("--output")
    parser.add_argument("--language", default="ru")
    args = parser.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    tts = TTS(MODEL_NAME).to(device)
    if args.setup:
        print(f"XTTS_SETUP_OK device={device}")
        return

    if not args.text or not args.reference or not args.output:
        parser.error("--text, --reference and --output are required")

    reference = Path(args.reference).expanduser().resolve()
    output = Path(args.output).resolve()
    if not reference.is_file():
        raise FileNotFoundError(f"Voice reference not found: {reference}")
    output.parent.mkdir(parents=True, exist_ok=True)
    tts.tts_to_file(text=args.text, speaker_wav=str(reference), language=args.language, file_path=str(output))

    with wave.open(str(output), "rb") as audio:
        duration_ms = round(audio.getnframes() / audio.getframerate() * 1000)
    print("XTTS_RESULT=" + json.dumps({"durationMs": duration_ms, "device": device}))


if __name__ == "__main__":
    main()
