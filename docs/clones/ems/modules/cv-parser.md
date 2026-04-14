# Module: cv-parser

## Source -- service, parser utility, LLM integration

### CVService (`src/core/services/cv_service.py`)

- Stateless service, injected with `Dict[ModelEnum, ILLMProvider]` (one provider per model enum variant).
- Four extraction entry points, all returning a Pydantic `Employee` (aka `CVSchema`):
  - `extract_cv_from_url(cv_url, model)` -- downloads from Google Drive / Google Docs URL via `aiohttp`, detects content type, routes to text or image path.
  - `extract_cv_from_pdf(pdf_bytes, model)` -- `pdfplumber` text extraction, then LLM.
  - `extract_cv_from_docx(docx_bytes, model)` -- `python-docx` text extraction (headers, paragraphs, tables, footers), then LLM.
  - `extract_cv_from_image(image_bytes, mime_type, model)` -- base64-encodes image, sends multimodal message to LLM.
- Text path: raw text -> `fix_spaced_text` cleanup -> system+user message -> `ILLMProvider.extract_structured_data`.
- Image path: base64 payload with `{"type": "image", "base64": ..., "mime_type": ...}` -> same LLM call.

### CV Parser utility (`src/utils/cv_parser.py`)

| Function                                | Purpose                                                                                                                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fix_spaced_text(text)`                 | Regex cleanup: collapses spaced-out letters (`S o f t w a r e` -> `Software`), normalises whitespace/newlines.                                                                                                                 |
| `pdf_to_text(content: bytes)`           | Runs `pdfplumber` in executor thread, joins all page texts with newline.                                                                                                                                                       |
| `docx_to_text(content: bytes)`          | Extracts from `python-docx` Document: section headers, paragraphs, table rows (pipe-delimited), footers.                                                                                                                       |
| `image_to_base64(image_bytes)`          | Simple `base64.b64encode`.                                                                                                                                                                                                     |
| `download_and_extract_cv(session, url)` | Parses Google Drive (`/file/d/ID`) and Google Docs (`/document/d/ID`) URLs, constructs download URLs with optional `resourcekey`, downloads with 60s timeout, returns `(text, file_type)` or `(base64, mime_type)` for images. |
| `bytes_to_base64(data)`                 | Alias for base64 encoding.                                                                                                                                                                                                     |

### LLM provider abstraction (`src/core/interfaces/llm_provider.py`)

```python
class ILLMProvider(ABC):
    async def extract_structured_data(
        self, messages: List[Dict[str, Any]], schema: Type[BaseModel]
    ) -> BaseModel: ...
```

Single method interface. Messages use a custom dict format with `role` + `content` (content can be string or list of typed dicts for multimodal).

### LLM provider implementations (`src/core/providers/`)

**LangchainLLMProvider** (`langchain_provider.py`):

- Wraps any LangChain `BaseChatModel`.
- Translates dict messages to `SystemMessage` / `HumanMessage`.
- Uses `llm.with_structured_output(schema).ainvoke(messages)` for structured extraction.
- Used with `ChatGoogleGenerativeAI(model="gemini-2.5-flash")`.

**GeminiCliProvider** (`gemini_cli_provider.py`):

- HTTP client to a separate Gemini CLI microservice at `settings.gemini_cli_service_url/api/v1/generate`.
- Flattens messages into a single prompt string, injects a hardcoded lite JSON schema.
- Model: `gemini-3-flash-preview` (constructor default) / `gemini-2.0-flash` (bootstrap wiring).
- Ignores image input (logs a warning).
- 120s timeout via `httpx.AsyncClient`.

### LLM bootstrap (`src/bootstrap/llm_bootstrap.py`)

- `LLMBootstrap` singleton creates a `Dict[ModelEnum, ILLMProvider]`:
  - `GEMINI_2_5` -> `LangchainLLMProvider(ChatGoogleGenerativeAI("gemini-2.5-flash"))` with `settings.google_api_key_1`.
  - `GEMINI_2_0` -> `GeminiCliProvider("gemini-2.0-flash")` via separate CLI service.
  - Commented out: `OLLAMA` -> `ChatOllama("gemma3:270m")` on local network.
- Global instance `llm_bootstrap = LLMBootstrap()` created at import time.

### Structured output schema (`src/common/llm_schema/schema.py`)

Pydantic `Employee` model with nested models:

| Field              | Type                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `full_name`        | `str?`                                                                                                                      |
| `email`            | `EmailStr?`                                                                                                                 |
| `phone`            | `str?`                                                                                                                      |
| `gender`           | `Literal["Male","Female"]?`                                                                                                 |
| `date_of_birth`    | `str?`                                                                                                                      |
| `current_position` | `str?`                                                                                                                      |
| `current_address`  | `str?`                                                                                                                      |
| `educations`       | `List[EmployeeEducation]` -- school_name, graduation_year, degree, major                                                    |
| `certifications`   | `List[EmployeeCertification]` -- certificate_name, issued_by, issued_date, expiry_date                                      |
| `profile`          | `EmployeeProfile?` -- facebook_link, linkedin_link, how_heard_about_company, hobbies                                        |
| `languages`        | `List[EmployeeLanguage]` -- language_name, proficiency (Native/Fluent/Intermediate/Basic), description                      |
| `technical_skills` | `List[EmployeeTechnicalSkill]` -- category (Programming Language/Database/Framework/Tool/Hardware), skill_name, description |
| `projects`         | `List[EmployeeProject]` -- project_name, project_description, position, responsibilities, technologies_used                 |

### System prompt (`src/common/llm_schema/system_promt.py`)

Short prompt instructing the LLM to: (1) extract explicit info, (2) correct OCR errors, (3) be thorough with skills/projects/education.

## Business Logic -- file upload, text extraction, LLM-based parsing, field mapping

1. **File upload**: User uploads a file (PDF, DOCX, DOC, PNG, JPG, JPEG, BMP, TIFF) or provides a Google Drive/Docs URL.
2. **Routing**: `CVController.upload_file` dispatches by file extension to the correct service method.
3. **Text extraction**: PDF uses `pdfplumber`; DOCX uses `python-docx` (headers + paragraphs + tables + footers). Images skip extraction and go directly as base64.
4. **Text cleanup**: `fix_spaced_text` removes OCR artifacts (spaced-out letters, excess whitespace).
5. **LLM structured extraction**: Text or image is packaged into messages with the system prompt, sent to the selected LLM provider, and parsed into the `Employee` Pydantic schema via `with_structured_output`.
6. **Response**: The structured `Employee` object is returned directly as JSON -- no persistence to database.

Key characteristic: **this is a stateless extraction service**. No CV data is stored. The result is returned to the caller (presumably the hiring module consumes it to populate candidate profiles).

## API Endpoints -- CV-related routes

### Router: `POST /cvs/upload-file`

- Auth: `SUPER_ADMIN` or `HR` role (organization-level).
- Input: `UploadFile` (multipart), optional `model` query param (default `GEMINI_2_5`).
- Supported formats: PDF, DOCX, DOC, PNG, JPG, JPEG, BMP, TIFF.
- Response: Extracted `Employee` JSON object.

### Router: `POST /cvs/upload-url`

- Auth: `SUPER_ADMIN` or `HR` role.
- Input: `CVRequestURL` body (`{ cv_url: string }`), `model` query param.
- Supported URLs: Google Drive file links, Google Docs links.
- Response: Extracted `Employee` JSON object.

### ModelEnum (user-selectable)

- `GEMINI_2_5` -- LangChain + Google Gemini 2.5 Flash (default).
- `GEMINI_2_0` -- Gemini CLI microservice with Gemini 2.0 Flash.

## Target Overlap -- what exists in documents module

The `documents` module at `apps/api/src/modules/documents/` is a **document generation** module, not a parsing module. It handles:

- **Templates**: CRUD for document templates (PDF/Excel format, Handlebars content, versioning).
- **Tenant branding**: Company name, logo, colors, font for generated documents.
- **Generation jobs**: Async pg-boss jobs that merge template + input data + branding -> output file stored in S3.
- **Schema**: `documents.template`, `documents.tenant_branding`, `documents.generation_job`.

**No overlap with CV parsing**. The documents module generates documents (e.g., offer letters, contracts) from templates. CV parsing is the inverse -- extracting structured data from uploaded documents. These are complementary but distinct concerns.

CV parsing in the future project would more naturally belong to the **hiring** module (since CVs feed the recruitment pipeline) or as a standalone `cv-parser` utility/service under hiring.

## Dependencies -- media module (file upload), LLM provider (Google Gemini)

### Legacy dependencies

| Dependency           | Role                                       | Python package                             |
| -------------------- | ------------------------------------------ | ------------------------------------------ |
| `pdfplumber`         | PDF text extraction                        | `pdfplumber`                               |
| `python-docx`        | DOCX text extraction                       | `python-docx`                              |
| `aiohttp`            | HTTP downloads (Google Drive/Docs)         | `aiohttp`                                  |
| `httpx`              | HTTP client for Gemini CLI service         | `httpx`                                    |
| `LangChain`          | LLM abstraction + structured output        | `langchain-core`, `langchain-google-genai` |
| `Google Gemini API`  | LLM backend (gemini-2.5-flash)             | via `langchain-google-genai`               |
| `Gemini CLI service` | Separate microservice for gemini-2.0-flash | custom HTTP service                        |
| `Pydantic`           | Schema definition + validation             | `pydantic`                                 |
| `FastAPI`            | Router, file upload, dependency injection  | `fastapi`                                  |

### Implicit dependencies

- **No media module dependency**: File upload is handled directly via FastAPI `UploadFile` -- no separate media/storage service.
- **No database dependency**: CVService is stateless; no persistence layer.
- **Google API key**: `settings.google_api_key_1` for Gemini 2.5 via LangChain.
- **Gemini CLI service URL**: `settings.gemini_cli_service_url` for the separate Gemini 2.0 microservice.

## Migration Notes -- LangChain Python to Vercel AI SDK, Google Gemini to OpenAI

### Architecture changes

1. **LLM provider**: Replace LangChain Python (`ChatGoogleGenerativeAI`) with **Vercel AI SDK** (`@ai-sdk/openai`). Use `generateObject()` with Zod schemas for structured output (direct replacement for `with_structured_output`).

2. **LLM model**: Replace Google Gemini 2.5 Flash with **OpenAI** models per CLAUDE.md stack:
   - `gpt-5.4-nano` for fast CV classification/triage.
   - `gpt-5.4` for full structured extraction (reasoning model).

3. **Eliminate Gemini CLI microservice**: The separate Gemini CLI service (`GeminiCliProvider`) becomes unnecessary. Vercel AI SDK talks directly to OpenAI API.

4. **Schema**: Convert Pydantic `Employee` model to a **Zod schema** for use with `generateObject()`. Field mapping stays the same.

5. **Text extraction**: Replace Python libraries with Node.js equivalents:
   - `pdfplumber` -> `pdf-parse` or `pdfjs-dist` (npm).
   - `python-docx` -> `mammoth` or `docx-parser` (npm).
   - `aiohttp` for Google Drive download -> `fetch` or `undici`.

6. **Module placement**: CV parsing should live in the **hiring** module as a domain service or as a shared utility under `packages/`. The `documents` module is for generation, not parsing.

7. **File upload flow**: In the future stack, file uploads go through tRPC. The `UploadFile` FastAPI pattern maps to a tRPC mutation that accepts a presigned-URL or multipart payload. Files should be stored in S3 via `@future/storage`, with the CV text extraction triggered as a command handler.

8. **Observability**: Add Langfuse tracing around LLM calls (the legacy code has no observability).

### Key decisions needed

- **Where to place**: Hiring module (most natural) vs. standalone `cv-parser` package vs. extending `documents` module.
- **Persistence**: Legacy is stateless (parse-and-return). Future may want to store parsed CV data and link to candidate profiles.
- **Image support**: OpenAI vision models support base64 image input natively via Vercel AI SDK -- the multimodal path carries over directly.
- **Google Drive integration**: Decide whether to keep direct Google Drive URL parsing or require users to upload files through the standard upload flow.
- **Async processing**: Consider using pg-boss for large CV batches (the documents module already has this pattern).
