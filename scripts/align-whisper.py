#!/usr/bin/env python3
import argparse
import json
import re
from difflib import SequenceMatcher

from faster_whisper import WhisperModel


def normalize(value: str) -> str:
    return re.sub(r"[^\w]+", "", value, flags=re.UNICODE).casefold()


def load_model(model_name: str):
    for compute_type in ("int8_float16", "int8"):
        try:
            return WhisperModel(model_name, device="cuda", compute_type=compute_type), f"cuda:{compute_type}"
        except Exception as error:
            print(f"GPU {compute_type} unavailable: {error}")
    return WhisperModel(model_name, device="cpu", compute_type="int8"), "cpu:int8"


def align_source(source_text: str, recognized: list[dict], duration_ms: int) -> tuple[list[dict], float]:
    source = source_text.split()
    if not source:
        return [], 1.0
    if not recognized:
        step = duration_ms / len(source)
        return ([{"text": word, "startMs": round(i * step), "endMs": round((i + 1) * step)} for i, word in enumerate(source)], 0.0)

    result: list[dict | None] = [None] * len(source)
    matcher = SequenceMatcher(None, [normalize(word) for word in source], [normalize(word["text"]) for word in recognized], autojunk=False)
    matching_blocks = matcher.get_matching_blocks()
    matched_words = sum(block.size for block in matching_blocks)
    for source_start, recognized_start, length in matching_blocks:
        for offset in range(length):
            timing = recognized[recognized_start + offset]
            result[source_start + offset] = {
                "text": source[source_start + offset],
                "startMs": timing["startMs"],
                "endMs": timing["endMs"],
            }

    for index, word in enumerate(source):
        if result[index] is not None:
            continue
        recognized_index = min(len(recognized) - 1, round(index * (len(recognized) - 1) / max(1, len(source) - 1)))
        timing = recognized[recognized_index]
        result[index] = {"text": word, "startMs": timing["startMs"], "endMs": timing["endMs"]}

    cursor = 0
    for timing in result:
        timing["startMs"] = min(max(cursor, timing["startMs"]), max(0, duration_ms - 20))
        timing["endMs"] = min(duration_ms, max(timing["startMs"] + 20, timing["endMs"]))
        cursor = timing["startMs"]
    return result, matched_words / len(source)


def main() -> None:
    parser = argparse.ArgumentParser(description="Local word alignment using faster-whisper")
    parser.add_argument("--audio", required=True)
    parser.add_argument("--text", required=True)
    parser.add_argument("--duration-ms", required=True, type=int)
    parser.add_argument("--model", default="small")
    parser.add_argument("--language", default="ru")
    args = parser.parse_args()

    model, device = load_model(args.model)

    def transcribe(current_model):
        segments, _ = current_model.transcribe(args.audio, language=args.language, word_timestamps=True, beam_size=5)
        output = []
        for segment in segments:
            for word in segment.words or []:
                if word.word.strip():
                    output.append({
                        "text": word.word.strip(),
                        "startMs": round(word.start * 1000),
                        "endMs": round(word.end * 1000),
                    })
        return output

    try:
        recognized = transcribe(model)
    except Exception as error:
        if not device.startswith("cuda"):
            raise
        print(f"GPU inference unavailable, retrying on CPU: {error}")
        model = WhisperModel(args.model, device="cpu", compute_type="int8")
        device = "cpu:int8"
        recognized = transcribe(model)

    words, match_ratio = align_source(args.text, recognized, args.duration_ms)
    transcript = " ".join(word["text"] for word in recognized)
    print("ALIGN_RESULT=" + json.dumps({"words": words, "device": device, "recognizedWords": len(recognized), "matchRatio": match_ratio, "transcript": transcript}, ensure_ascii=False))


if __name__ == "__main__":
    main()
