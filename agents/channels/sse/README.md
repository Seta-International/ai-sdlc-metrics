# SSE Channel Adapter

TODO: implement SSE adapter for web chat real-time streaming.

NestJS `@Sse()` endpoint — streams agent responses as Server-Sent Events to the
embedded AgentPanel in any zone. Client opens a persistent HTTP connection;
server pushes `data:` frames until the reasoning loop completes.
