from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.analytics import router as analytics_router
from app.bodyguard import BodyGuardMiddleware
from app.db import init_db


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Focus API", lifespan=lifespan)
app.add_middleware(BodyGuardMiddleware)
app.include_router(analytics_router)


@app.exception_handler(RequestValidationError)
async def _on_validation_error(_request: Request, _exc: RequestValidationError) -> JSONResponse:
    # Never echo the raw input back: it can be non-JSON-serialisable (NaN/inf) or
    # pathologically nested, which would crash the default handler to a 500, and
    # echoing it leaks whatever a client sent. A minimal 422 is enough.
    return JSONResponse(status_code=422, content={"detail": "invalid payload"})


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
