import {
  db,
  isAppDatabaseError,
  json,
  requireAuth,
  router,
  secrets,
} from '@appdeploy/sdk';
import { projectActions } from './projects.mjs';
import { MODELS, researchActions } from './research.mjs';

type Context = {
  body: unknown;
  query: Record<string, string>;
  params: Record<string, string>;
  user?: { userId: string };
};

const projects = projectActions(db, isAppDatabaseError);
const send = (result: { data: unknown; status: number }) =>
  json(result.data, result.status);

async function names() {
  try {
    return await secrets.listSecretNames();
  } catch {
    return [];
  }
}

async function read(name: string, configured: string[]) {
  if (!configured.includes(name)) return '';
  try {
    return await secrets.readSecret(name);
  } catch {
    return '';
  }
}

function research(action: keyof typeof researchActions) {
  return async ({ body }: Context) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'Data permintaan tidak valid.' }, 400);
    }
    const source = (body as { source?: string }).source;
    if (action === 'search' && (source === 'crossref' || source === undefined)) {
      return send(await researchActions.search(body, { googleKey: '', googleCse: '', serpKey: '' }));
    }
    const configured = await names();
    const search = action === 'search';
    const [ollamaKey, googleKey, googleCse, serpKey] = await Promise.all([
      search ? '' : read('OLLAMA_API_KEY', configured),
      search ? read('GOOGLE_API_KEY', configured) : '',
      search ? read('GOOGLE_CSE_ID', configured) : '',
      search ? read('SERPAPI_KEY', configured) : '',
    ]);
    return send(
      await researchActions[action](body, {
        ollamaKey,
        googleKey,
        googleCse,
        serpKey,
      })
    );
  };
}

function project(action: keyof typeof projects) {
  return async ({ user, body, params, query }: Context) => {
    if (!user) return json({ error: 'Silakan masuk terlebih dahulu.' }, 401);
    return send(
      await projects[action]({ userId: user.userId, body, params, query })
    );
  };
}

export const handler = router({
  'GET /api/_healthcheck': [async () => json({ message: 'Success' })],
  'GET /api/projects': [requireAuth(), project('list')],
  'POST /api/projects': [requireAuth(), project('create')],
  'GET /api/projects/:id': [requireAuth(), project('read')],
  'PUT /api/projects/:id': [requireAuth(), project('save')],
  'GET /api/status': [
    requireAuth(),
    async () => {
      const configured = await names();
      return json({
        ai: configured.includes('OLLAMA_API_KEY'),
        provider: 'Ollama Cloud',
        models: MODELS,
        google:
          configured.includes('GOOGLE_API_KEY') &&
          configured.includes('GOOGLE_CSE_ID'),
        scholar: configured.includes('SERPAPI_KEY'),
      });
    },
  ],
  'POST /api/ai-check': [requireAuth(), research('ai-check')],
  'POST /api/suggest-titles': [requireAuth(), research('suggest-titles')],
  'POST /api/questions': [requireAuth(), research('questions')],
  'POST /api/generate': [requireAuth(), research('generate')],
  'POST /api/instrument': [requireAuth(), research('instrument')],
  'POST /api/search': [requireAuth(), research('search')],
});
