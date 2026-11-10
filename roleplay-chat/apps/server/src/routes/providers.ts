import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../validation.js';
import {
  createProvider,
  deleteProvider,
  listProviders,
  providerModels,
  testExistingProvider,
  testProviderConnection,
  updateProvider,
} from '../services/providers.js';

const httpUrl = z.string().refine((value) => /^https?:\/\//i.test(value), '必须是 http(s) 地址');

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  baseUrl: httpUrl,
  apiKey: z.string().default(''),
  defaultModel: z.string().trim().min(1).max(200),
  contextWindow: z.number().int().positive().max(10_000_000).optional(),
  extraHeaders: z.record(z.string()).optional(),
});

const updateSchema = createSchema.partial().extend({
  defaultModel: z.string().trim().min(1).max(200).optional(),
});

const draftTestSchema = z.object({
  baseUrl: httpUrl,
  apiKey: z.string().default(''),
  model: z.string().trim().max(200).optional(),
  extraHeaders: z.record(z.string()).optional(),
});

export const providersRoutes: FastifyPluginAsync = async (app) => {
  app.get('/providers', async () => listProviders(app.ctx));

  app.post('/providers', async (request, reply) => {
    const input = parse(createSchema, request.body);
    reply.status(201).send(createProvider(app.ctx, { ...input, apiKey: input.apiKey ?? '' }));
  });

  app.patch('/providers/:id', async (request) => {
    const { id } = request.params as { id: string };
    const input = parse(updateSchema, request.body);
    return updateProvider(app.ctx, id, input);
  });

  app.delete('/providers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    deleteProvider(app.ctx, id);
    reply.status(204).send();
  });

  app.post('/providers/test', async (request) => {
    const input = parse(draftTestSchema, request.body);
    return testProviderConnection(app.ctx, { ...input, apiKey: input.apiKey ?? '' });
  });

  app.post('/providers/:id/test', async (request) => {
    const { id } = request.params as { id: string };
    return testExistingProvider(app.ctx, id);
  });

  app.get('/providers/:id/models', async (request) => {
    const { id } = request.params as { id: string };
    return providerModels(app.ctx, id);
  });
};
