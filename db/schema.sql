-- Gemischtes Hack — Database Schema
-- Supabase PostgreSQL + pgvector

CREATE EXTENSION IF NOT EXISTS vector;

-- Episodes table
CREATE TABLE episodes (
    id SERIAL PRIMARY KEY,
    glt_id TEXT UNIQUE NOT NULL,
    episode_number INTEGER,
    title TEXT NOT NULL,
    pub_date TIMESTAMPTZ NOT NULL,
    duration_seconds INTEGER NOT NULL,
    description TEXT,
    summary TEXT,
    topics_json JSONB,
    quotes_json JSONB
);

-- Transcript chunks with embeddings
CREATE TABLE chunks (
    id SERIAL PRIMARY KEY,
    episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    speakers TEXT[] NOT NULL,
    embedding vector(384) NOT NULL,
    text_search tsvector GENERATED ALWAYS AS (to_tsvector('german', text)) STORED,
    UNIQUE(episode_id, chunk_index)
);

-- Topic clusters from BERTopic
CREATE TABLE topics (
    id SERIAL PRIMARY KEY,
    label TEXT NOT NULL,
    keywords TEXT[] NOT NULL,
    chunk_count INTEGER DEFAULT 0
);

-- Episode-topic associations
CREATE TABLE episode_topics (
    episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
    topic_id INTEGER REFERENCES topics(id) ON DELETE CASCADE,
    relevance REAL DEFAULT 0,
    PRIMARY KEY (episode_id, topic_id)
);

-- Indexes
CREATE INDEX idx_chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_chunks_text_search ON chunks USING gin(text_search);
CREATE INDEX idx_episodes_pub_date ON episodes(pub_date DESC);
CREATE INDEX idx_episodes_glt_id ON episodes(glt_id);
CREATE INDEX idx_chunks_episode_id ON chunks(episode_id);

-- Row Level Security (read-only for anonymous users)
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE episode_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Episodes are publicly readable"
    ON episodes FOR SELECT TO anon USING (true);

CREATE POLICY "Chunks are publicly readable"
    ON chunks FOR SELECT TO anon USING (true);

CREATE POLICY "Topics are publicly readable"
    ON topics FOR SELECT TO anon USING (true);

CREATE POLICY "Episode topics are publicly readable"
    ON episode_topics FOR SELECT TO anon USING (true);

-- Semantic search function
CREATE OR REPLACE FUNCTION search_chunks(
    query_embedding vector(384),
    match_threshold REAL DEFAULT 0.3,
    match_count INTEGER DEFAULT 10
)
RETURNS TABLE (
    id INTEGER,
    episode_id INTEGER,
    chunk_index INTEGER,
    text TEXT,
    start_time REAL,
    end_time REAL,
    speakers TEXT[],
    similarity double precision
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.episode_id,
        c.chunk_index,
        c.text,
        c.start_time,
        c.end_time,
        c.speakers,
        1 - (c.embedding <=> query_embedding) AS similarity
    FROM chunks c
    WHERE 1 - (c.embedding <=> query_embedding) > match_threshold
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Hybrid search function (semantic + full-text)
CREATE OR REPLACE FUNCTION hybrid_search(
    query_embedding vector(384),
    query_text TEXT,
    match_count INTEGER DEFAULT 10,
    semantic_weight REAL DEFAULT 0.7
)
RETURNS TABLE (
    id INTEGER,
    episode_id INTEGER,
    chunk_index INTEGER,
    text TEXT,
    start_time REAL,
    end_time REAL,
    speakers TEXT[],
    score double precision
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH semantic AS (
        SELECT c.id, 1 - (c.embedding <=> query_embedding) AS sim
        FROM chunks c
        ORDER BY c.embedding <=> query_embedding
        LIMIT match_count * 3
    ),
    fulltext AS (
        SELECT c.id, ts_rank(c.text_search, plainto_tsquery('german', query_text)) AS rank
        FROM chunks c
        WHERE c.text_search @@ plainto_tsquery('german', query_text)
        LIMIT match_count * 3
    ),
    combined AS (
        SELECT
            COALESCE(s.id, f.id) AS chunk_id,
            COALESCE(s.sim, 0) * semantic_weight +
            COALESCE(f.rank, 0) * (1 - semantic_weight) AS combined_score
        FROM semantic s
        FULL OUTER JOIN fulltext f ON s.id = f.id
    )
    SELECT
        c.id,
        c.episode_id,
        c.chunk_index,
        c.text,
        c.start_time,
        c.end_time,
        c.speakers,
        cb.combined_score AS score
    FROM combined cb
    JOIN chunks c ON c.id = cb.chunk_id
    ORDER BY cb.combined_score DESC
    LIMIT match_count;
END;
$$;
