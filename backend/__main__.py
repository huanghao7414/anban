import argparse
import uvicorn

if __name__ == "__main__":
    cli = argparse.ArgumentParser(description="安伴本地后端和 3D 网页")
    cli.add_argument("--port", type=int, default=8794)
    args = cli.parse_args()
    uvicorn.run("backend.main:app", host="127.0.0.1", port=args.port, access_log=False)
