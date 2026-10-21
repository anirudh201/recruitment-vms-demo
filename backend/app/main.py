
from fastapi import FastAPI

from app.auth import router as auth_router
from app.users import router as users_router
from app.jobs import router as jobs_router
from app.vendors import router as vendors_router
app = FastAPI(
    title="Recruitment VMS API",
    version="0.1.0",
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(jobs_router)
app.include_router(vendors_router)
@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "application": "Recruitment VMS",
    }
