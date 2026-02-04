"""
FastAPI application entry point for the CTD Stability Document Generator.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.projects import router as projects_router
from app.api.routes.regulatory import router as regulatory_router

app = FastAPI(
    title="CTD Stability Document Generator",
    description="Generate CTD Module 3 stability sections (3.2.S.7, 3.2.P.8) from stability plans and reports.",
    version="0.1.0",
)

# CORS — configure for frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "https://ctd-document-hkad.vercel.app",
        "https://*.onrender.com",  # Render deployments
        "https://*.vercel.app",    # Vercel deployments
    ],
    allow_origin_regex=r"https://.*\.(onrender\.com|vercel\.app)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects_router)
app.include_router(regulatory_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
