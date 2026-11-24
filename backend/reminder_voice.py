"""Qwen speech synthesis and the shared reminder clip."""
import json
import os
import threading
import wave
from io import BytesIO
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

TEXT = "您好，安伴提醒您，用药提醒时间到了。请打开已核对的用药卡，按医嘱确认。"
DEFAULT_URL = "https://maas.qianwenaiapi.com/api/v1/services/audio/tts/SpeechSynthesizer"
MAX_AUDIO_BYTES = 3 * 1024 * 1024
_lock = threading.Lock()
_audio = None


def reminder_audio():
    global _audio
    with _lock:
        if _audio is not None:
            return _audio
        _audio = qwen_audio(TEXT)
        return _audio


def qwen_audio(text):
    key = os.getenv("ANBAN_REMINDER_TTS_API_KEY")
    if not key:
        raise ValueError("Reminder TTS is unconfigured")
    model = os.getenv("ANBAN_REMINDER_TTS_MODEL", "qwen-audio-3.1-tts-flash")
    audio_input = {"format": "wav", "sample_rate": 24000}
    audio_generation = model == "qwen-audio-3.1-tts-next"
    if audio_generation:
        audio_input.update(text_prompt=f"请用清晰、平静的声音逐字朗读以下文本，不添加其他内容：{text}", channels=1)
    else:
        audio_input.update(text=text, voice=os.getenv("ANBAN_REMINDER_TTS_VOICE", "longanhuan_v3.1"))
    request = Request(
        os.getenv("ANBAN_REMINDER_TTS_URL", DEFAULT_URL),
        data=json.dumps({
            "model": model,
            "input": audio_input,
        }, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    with urlopen(request, timeout=60 if audio_generation else 12) as response:
        result = json.load(response)
    url = result["output"]["audio"]["url"]
    parts = urlsplit(url)
    if parts.scheme == "http" and (parts.hostname or "").endswith(".aliyuncs.com"):
        url = parts._replace(scheme="https").geturl()
    if urlsplit(url).scheme != "https":
        raise ValueError("Expected an HTTPS audio URL")
    with urlopen(url, timeout=12) as response:
        audio = response.read(MAX_AUDIO_BYTES + 1)
    if not (12 < len(audio) <= MAX_AUDIO_BYTES and audio[:4] == b"RIFF" and audio[8:12] == b"WAVE"):
        raise ValueError("Unexpected audio format")
    # The provider may use placeholder lengths in its WAV header.
    with wave.open(BytesIO(audio), "rb") as source:
        frames = source.readframes(source.getnframes())
        params = source.getparams()
    frame_size = params.nchannels * params.sampwidth
    if not 0 < len(frames) < 60 * frame_size * params.framerate or len(frames) % frame_size:
        raise ValueError("Invalid speech duration")
    output = BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setparams(params)
        wav.writeframes(frames)
    return output.getvalue()
