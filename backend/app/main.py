import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import router as auth_router
from app.users import router as users_router
from app.jobs import router as jobs_router
from app.vendors import router as vendors_router
from app.clients import router as clients_router
from app.candidates import router as candidates_router
from app.recruiters import router as recruiters_router
from app.reports import router as reports_router
from app.feedback import router as feedback_router

# Websites allowed to call this API. On a hosted demo set CORS_ORIGINS to the site's
# address, e.g. https://vms-demo.onrender.com (comma-separate several).
CORS_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
]

app = FastAPI(
    title="Recruitment VMS API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(jobs_router)
app.include_router(vendors_router)
app.include_router(clients_router)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "application": "Recruitment VMS",
    }
app.include_router(candidates_router)
app.include_router(recruiters_router)
app.include_router(reports_router)
app.include_router(feedback_router)
