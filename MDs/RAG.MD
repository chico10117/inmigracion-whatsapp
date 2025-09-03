# RAG para documentos oficiales (Posible feature futura)

Resumen (futuro): Añadir Retrieval-Augmented Generation (RAG) con pgvector en Supabase para consultar y citar documentos oficiales (BOE, Ministerio, Sede Extranjería) en respuestas del bot. Incluye: migración de BD, script de ingesta, módulo de recuperación, herramienta para el modelo e integración mínima en `askImmigrationQuestion`. Beneficios: respuestas con citas y menos alucinaciones; Costes: embeddings/almacenamiento, algo de latencia.

## Objetivo
- **Propósito**: Basar respuestas en textos oficiales recientes (leyes, reglamentos, sedes) con citas.
- **Ámbito**: España (Extranjería/BOE). Extensible por jurisdicción o tipo de documento.

## Arquitectura (alto nivel)
- Ingesta (archivos `.md/.txt` o PDFs → texto) → Chunks + Embeddings → `Supabase (pgvector)`
- En tiempo de consulta: Embed de la query → `match_law_chunks()` → contexto → herramienta LLM → respuesta con citas
- Convivencia con búsqueda web actual (Perplexity) para información “fresca”.

## Esquema y migraciones (pgvector)
SQL (orientativo):
```sql
create extension if not exists vector;

create table if not exists public.law_documents (
  id uuid primary key default gen_random_uuid(),
  source_url text not null unique,
  title text not null,
  jurisdiction text default 'ES',
  doc_type text,
  published_at date,
  retrieved_at timestamptz default now(),
  sha256 text not null
);

create table if not exists public.law_chunks (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references public.law_documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  token_count int default 0,
  embedding vector(1536) not null
);

create unique index if not exists law_chunks_doc_idx on public.law_chunks(doc_id, chunk_index);
create index if not exists law_chunks_embedding_idx on public.law_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create or replace function public.match_law_chunks(
  query_embedding vector(1536),
  match_count int default 6,
  min_similarity float default 0.75
)
returns table (
  chunk_id uuid,
  doc_id uuid,
  content text,
  similarity float,
  source_url text,
  title text,
  published_at date,
  chunk_index int
)
language sql stable as $$
  select
    c.id as chunk_id,
    c.doc_id,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity,
    d.source_url,
    d.title,
    d.published_at,
    c.chunk_index
  from public.law_chunks c
  join public.law_documents d on d.id = c.doc_id
  where 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding asc
  limit match_count
$$;

alter table public.law_documents enable row level security;
alter table public.law_chunks enable row level security;

create policy "service_all_law_documents" on public.law_documents for all using (true) with check (true);
create policy "service_all_law_chunks" on public.law_chunks for all using (true) with check (true);
```

## Componentes nuevos (archivos)
- `src/rag/retrieval.ts`: embed de la query + llamada a `match_law_chunks()` y formateo de contexto con citas.
- `src/rag/rag-handler.ts`: herramienta LLM `retrieve_law_context` (function call) que usa `retrieval.ts`.
- `scripts/ingest-laws.ts`: ingesta de `.md/.txt` → chunks + embeddings → tablas `law_*`.

## Ingesta (manual inicial)
- Preparar carpeta de fuentes (`./docs/laws/`) con `.md/.txt` (o extraer PDF a texto antes).
- Ejecutar:
```bash
OPENAI_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
npx tsx scripts/ingest-laws.ts ./docs/laws
```
- Re-ingestas detectan cambios por `sha256` y rehacen chunks/embeddings del documento.

## Recuperación (tiempo de consulta)
- Dado `query`, crear embedding (p.ej. `text-embedding-3-small`), invocar `match_law_chunks()`, construir un bloque de contexto con 4–8 fragmentos, incluir títulos, fechas y URLs.
- Devolver `sources` únicas (máx. 5) para mostrar al usuario.

## Integración con el LLM (edits mínimos)
- Añadir la herramienta `retrieve_law_context` al array `tools` junto a la búsqueda web existente.
- En el manejador de tool calls, ejecutar ambos (web y RAG) según lo solicite el modelo y luego realizar la llamada de seguimiento con los mensajes `tool` devueltos.
- Mantener el `IMMIGRATION_SYSTEM_PROMPT` indicando preferencia por fuentes oficiales y breves citas.

## Variables de entorno
- `OPENAI_API_KEY` (embeddings + chat)
- `OPENAI_EMBEDDING_MODEL` (default: `text-embedding-3-small`)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `SEARCH_ENABLED` (para control del buscador web)
- Opcional: `PERPLEXITY_API_KEY`, `PERPLEXITY_MODEL`

## Operación y rendimiento
- Tras crear el índice IVFFLAT, ejecutar `ANALYZE law_chunks;` para buenos planes.
- Latencia típica: +80–300 ms (embedding) + 5–50 ms (similaridad) + 100–300 ms (seguimiento del chat).
- Coste: embeddings de ingesta (one-off por doc), embeddings de query por mensaje; almacenamiento de vectores en Supabase.

## Formato para WhatsApp
- Incluir citas cortas y claras:
  - “Fuente: boe.es/… (2025-01-10)”
  - 1–3 enlaces máx. por respuesta.
- Mensajes concisos con emojis suaves donde aporten legibilidad 📱📚.

## Pruebas
- Preguntas objetivo:
  - “Requisitos de arraigo social 2025 en Madrid”
  - “Documentación para renovación de NIE por cuenta ajena (últimos cambios)”
- Validar: que aparezcan citas y que el texto provenga de los fragmentos cargados.

## Riesgos y mitigaciones
- Desfase temporal: automatizar re-ingesta periódica (cron) de fuentes prioritarias.
- PDFs complejos: fallback a OCR o lector estructurado; revisión manual para documentos críticos.
- Mezcla RAG + Web: permitir que el modelo use ambos; preferir RAG para definiciones legales y web para noticias/plazos.

## Roadmap (opcional)
- Crawler de sites oficiales (sitemaps/feeds) y scheduler.
- Ingesta PDF nativa + extracción de metadatos (título/fecha/órgano).
- Normalización y deduplicación de citas.
- Evaluación offline (Gold Q&A) para medir grounding y precisión.


