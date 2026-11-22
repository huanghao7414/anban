"""Bounded, isolated calls through the official DSH SDK and runtime."""
import base64
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import threading

from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[1]
DSH = ROOT / 'backend/dsh'
SLOTS = threading.BoundedSemaphore(2)


def runtime_installed():
    return bool(shutil.which('node') and (DSH / 'node_modules/.bin/dsh').is_file())


def complete(*, key, base, model, system, messages, image=None, json_output=False, timeout=90, probe=False, provider='deepseek'):
    if not runtime_installed():
        raise HTTPException(503, 'DSH 运行时未安装，请在项目目录执行 npm ci --prefix backend/dsh --ignore-scripts。')
    if not SLOTS.acquire(blocking=False):
        raise HTTPException(429, '正在处理其他请求，请稍后再试。')
    try:
        # Each request has its own home and session; SQLite owns conversation history.
        run_root = ROOT / '.run/dsh-requests'
        run_root.mkdir(parents=True, exist_ok=True, mode=0o700)
        with tempfile.TemporaryDirectory(prefix='request-', dir=run_root) as tmp:
            workspace = Path(tmp) / 'workspace'; workspace.mkdir(mode=0o700)
            payload = dict(key=key, base=base, model=model, system=system, messages=messages,
                           home=str(Path(tmp) / 'home'), workspace=str(workspace),
                           image=base64.b64encode(image).decode() if image else None,
                           json_output=json_output, probe=probe, provider=provider)
            # Do not pass unrelated application credentials or arbitrary Node/Python injection flags.
            allowed = {'PATH', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'SYSTEMROOT', 'LANG', 'LC_ALL',
                       'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS', 'HTTPS_PROXY', 'HTTP_PROXY',
                       'ALL_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'all_proxy', 'no_proxy'}
            env = {k: v for k, v in os.environ.items() if k in allowed}
            proc = subprocess.Popen([sys.executable, '-m', 'backend.dsh_worker'], cwd=ROOT, env=env,
                                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    text=True, encoding='utf-8', start_new_session=True)
            try:
                out, _ = proc.communicate(json.dumps(payload, ensure_ascii=False), timeout=timeout)
            except subprocess.TimeoutExpired:
                if os.name == 'posix':
                    os.killpg(proc.pid, signal.SIGKILL)
                else:
                    proc.kill()
                proc.communicate()
                raise HTTPException(504, '模型处理超时，请稍后重试。照片和已有记录仍保留。') from None
            try:
                result = json.loads(out)
            except (ValueError, TypeError):
                result = {}
            if proc.returncode != 0 or not isinstance(result, dict) or not result.get('ok'):
                raise HTTPException(502, 'DSH 模型调用未完成，请检查本机密钥、模型权限和网络后重试。')
            if probe:
                return result
            text = result.get('text')
            if not isinstance(text, str) or not text.strip() or len(text) > 20000:
                raise HTTPException(502, '模型返回不完整，请稍后重试。')
            return text.strip()
    except OSError:
        raise HTTPException(503, '本机 DSH 运行时无法启动，请检查 Node.js 和运行时安装。') from None
    finally:
        SLOTS.release()
