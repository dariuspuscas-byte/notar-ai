import uvicorn
from notar_ai_core import config


def main() -> None:
    uvicorn.run("notar_ai_api.app:app", host="0.0.0.0", port=config.port, reload=False)


if __name__ == "__main__":
    main()
