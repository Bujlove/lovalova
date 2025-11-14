import os
import uuid
from typing import Dict, List, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    project_id: Optional[str] = None
    messages: List[Message]
    temperature: float = 0.2
    max_tokens: int = Field(default=800, le=2000)


class ChatResponse(BaseModel):
    reply: str


class FilePayload(BaseModel):
    path: str
    content: str


class FileSummary(BaseModel):
    path: str
    content: str


class Project(BaseModel):
    id: str
    name: str
    files: Dict[str, str] = Field(default_factory=dict)


class ProjectRequest(BaseModel):
    name: str
    template: Optional[str] = None


class ProjectResponse(Project):
    pass


class ProjectStore:
    def __init__(self) -> None:
        self._projects: Dict[str, Project] = {}

    def create(self, name: str, template: Optional[str]) -> Project:
        project_id = str(uuid.uuid4())
        files = self._template_files(template)
        project = Project(id=project_id, name=name, files=files)
        self._projects[project_id] = project
        return project

    def get(self, project_id: str) -> Project:
        if project_id not in self._projects:
            raise KeyError(project_id)
        return self._projects[project_id]

    def update_file(self, project_id: str, path: str, content: str) -> None:
        project = self.get(project_id)
        project.files[path] = content

    def _template_files(self, template: Optional[str]) -> Dict[str, str]:
        if template == "react-spa":
            return {
                "src/App.jsx": "export default function App() {\n  return <div>Hello Alice LLM!</div>;\n}\n",
                "package.json": '{"name": "alice-app", "version": "0.1.0"}'
            }
        return {"README.md": "# Новый проект\n"}

    def list_files(self, project_id: str) -> Dict[str, str]:
        project = self.get(project_id)
        return project.files


class AliceLLMClient:
    def __init__(self) -> None:
        self.api_key = os.getenv("YANDEX_API_KEY")
        self.folder_id = os.getenv("YANDEX_FOLDER_ID")
        if not self.api_key or not self.folder_id:
            raise RuntimeError("YANDEX_API_KEY and YANDEX_FOLDER_ID must be set")
        self._base_url = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"

    async def complete(self, messages: List[Message], temperature: float, max_tokens: int) -> str:
        payload = {
            "modelUri": f"gpt://{self.folder_id}/yandexgpt-lite",
            "completionOptions": {
                "stream": False,
                "temperature": temperature,
                "maxTokens": max_tokens,
            },
            "messages": [message.model_dump() for message in messages],
        }
        headers = {"Authorization": f"Api-Key {self.api_key}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(self._base_url, json=payload, headers=headers)
        if response.status_code >= 400:
            raise HTTPException(status_code=502, detail=response.text)
        data = response.json()
        try:
            return data["result"]["alternatives"][0]["message"]["text"]
        except (KeyError, IndexError) as exc:
            raise HTTPException(status_code=500, detail="Malformed response from LLM") from exc


load_dotenv()

app = FastAPI(title="Alice Builder API")
_projects = ProjectStore()
_llm: Optional[AliceLLMClient] = None


@app.on_event("startup")
async def on_startup() -> None:
    global _llm
    try:
        _llm = AliceLLMClient()
    except RuntimeError as exc:
        # Delay failure until first call, so app can still run in dev without env vars
        _llm = None
        print(f"Warning: {exc}")


@app.post("/api/projects", response_model=ProjectResponse)
async def create_project(req: ProjectRequest) -> ProjectResponse:
    project = _projects.create(req.name, req.template)
    return ProjectResponse(**project.model_dump())


@app.get("/api/projects/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str) -> ProjectResponse:
    try:
        project = _projects.get(project_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectResponse(**project.model_dump())


@app.put("/api/projects/{project_id}/files", response_model=ProjectResponse)
async def upsert_file(project_id: str, payload: FilePayload) -> ProjectResponse:
    try:
        _projects.update_file(project_id, payload.path, payload.content)
        project = _projects.get(project_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectResponse(**project.model_dump())


@app.get("/api/projects/{project_id}/files", response_model=List[FileSummary])
async def list_files(project_id: str) -> List[FileSummary]:
    try:
        files = _projects.list_files(project_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Project not found")
    return [FileSummary(path=path, content=content) for path, content in files.items()]


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    if _llm is None:
        raise HTTPException(status_code=500, detail="LLM client misconfigured")
    reply = await _llm.complete(req.messages, req.temperature, req.max_tokens)
    return ChatResponse(reply=reply)


@app.get("/healthz")
async def health() -> Dict[str, str]:
    return {"status": "ok"}
