import { handleExecutePhase1 } from "./handler";

/**
 * Phase 1 Executor Worker Environment
 */
export interface ExecutorEnv {
  EXECUTOR_SHARED_SECRET: string;
  EXECUTOR_TIMEOUT_MS?: string;
  ENVIRONMENT?: string;
  MANIFEST_KV?: KVNamespace;
  ARTEFACTS_R2?: R2Bucket;
}

export default {
  async fetch(request: Request, env: ExecutorEnv): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/v1/execute" && request.method === "POST") {
      return handleExecutePhase1(request, env);
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<ExecutorEnv>;
